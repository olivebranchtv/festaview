-- Filmmaker submissions, part 2: everything a festival asks for. Run AFTER 017. Safe to run more than once.
-- Adds the full entry details (crew, cast, premiere status, statements, links), uploaded files (the film, poster, stills,
-- subtitles, script, press kit) stored privately, and lets an uploaded film stand in for a screener link.
-- Large film files need your Supabase project's global upload limit raised: Dashboard > Storage > Settings > "Upload file size limit".

alter table submissions add column if not exists details jsonb not null default '{}'::jsonb;
alter table submissions add column if not exists files jsonb not null default '[]'::jsonb;

-- Private bucket: a filmmaker reaches only their own folder; a festival reaches the folders of people who entered it.
insert into storage.buckets (id, name, public, file_size_limit) values ('submission-files', 'submission-files', false, 5368709120)
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;
drop policy if exists "submission files insert own" on storage.objects;
drop policy if exists "submission files read" on storage.objects;
drop policy if exists "submission files delete own" on storage.objects;
create policy "submission files insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'submission-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "submission files read" on storage.objects for select to authenticated
  using (bucket_id = 'submission-files' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or is_platform_admin()
    or exists (select 1 from submissions s where s.user_id::text = (storage.foldername(name))[1] and is_festival_admin(s.festival_id))));
create policy "submission files delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'submission-files' and (storage.foldername(name))[1] = auth.uid()::text);

-- An uploaded film may replace the screener link: the link field then holds the word "uploaded".
create or replace function create_submission(
  p_festival uuid, p_category uuid, p_title text, p_director text, p_runtime int, p_year int, p_synopsis text,
  p_screener text, p_screener_password text, p_poster text, p_country text, p_language text, p_genre text, p_code text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  q jsonb;
  cat submission_categories%rowtype;
  amt int;
  pay text;
  sid uuid;
  ttl text := left(trim(coalesce(p_title, '')), 200);
  dir text := left(trim(coalesce(p_director, '')), 200);
  scr text := left(trim(coalesce(p_screener, '')), 600);
begin
  if uid is null then raise exception 'Please sign in first.'; end if;
  if ttl = '' then raise exception 'Enter the title of your film.'; end if;
  if dir = '' then raise exception 'Enter the director''s name.'; end if;
  if p_runtime is null or p_runtime < 1 or p_runtime > 1000 then raise exception 'Enter the running time in minutes.'; end if;
  if p_year is not null and (p_year < 1890 or p_year > 2100) then raise exception 'Enter a valid year.'; end if;
  if scr !~* '^https?://' and scr <> 'uploaded' then raise exception 'Upload your film or enter a screener link that starts with http:// or https://'; end if;
  if length(trim(coalesce(p_synopsis, ''))) < 10 then raise exception 'Write a short synopsis.'; end if;
  q := submission_quote(p_festival, p_category, p_code);
  if not (q->>'ok')::boolean then
    raise exception '%', case q->>'reason' when 'not_open' then 'This festival is not accepting submissions yet.' when 'no_category' then 'Choose a category.' else 'This festival is not accepting submissions right now.' end;
  end if;
  select * into cat from submission_categories where id = p_category;
  if cat.max_runtime_min is not null and p_runtime > cat.max_runtime_min then
    raise exception 'This category accepts films up to % minutes.', cat.max_runtime_min;
  end if;
  if (select count(*) from submissions where user_id = uid and payment_status = 'unpaid' and status <> 'withdrawn') >= 10 then
    raise exception 'You have 10 entries waiting for payment. Pay for or withdraw some of them first.';
  end if;
  if exists (select 1 from submissions where festival_id = p_festival and user_id = uid and category_id = p_category and lower(title) = lower(ttl) and status <> 'withdrawn') then
    raise exception 'You already entered this title in this category.';
  end if;
  amt := (q->>'amount_cents')::int;
  pay := case when amt > 0 then 'unpaid' when (q->>'code_ok')::boolean then 'waived' else 'free' end;
  insert into submissions (festival_id, category_id, user_id, contact_email, title, director, runtime_min, year, synopsis, screener_url, screener_password, poster_url,
                           country, language, genre, payment_status, tier_id, tier_name, base_fee_cents, amount_due_cents, waiver_id, paid_at)
  values (p_festival, p_category, uid, nullif(auth.jwt() ->> 'email', ''), ttl, dir, p_runtime, p_year, trim(p_synopsis), scr, nullif(left(trim(coalesce(p_screener_password, '')), 100), ''),
          nullif(left(trim(coalesce(p_poster, '')), 600), ''), nullif(left(trim(coalesce(p_country, '')), 80), ''), nullif(left(trim(coalesce(p_language, '')), 80), ''),
          nullif(left(trim(coalesce(p_genre, '')), 80), ''), pay, nullif(q->>'tier_id', '')::uuid, q->>'tier_name', (q->>'base_cents')::int, amt,
          case when (q->>'code_ok')::boolean then nullif(q->>'waiver_id', '')::uuid else null end, case when pay <> 'unpaid' then now() else null end)
  returning id into sid;
  if pay = 'waived' then update submission_waivers set uses = uses + 1 where id = (q->>'waiver_id')::uuid; end if;
  return jsonb_build_object('id', sid, 'payment_status', pay, 'amount_cents', amt);
end $$;
revoke execute on function create_submission(uuid, uuid, text, text, int, int, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function create_submission(uuid, uuid, text, text, int, int, text, text, text, text, text, text, text, text) to authenticated;

create or replace function update_my_submission(
  p_id uuid, p_title text, p_director text, p_runtime int, p_year int, p_synopsis text,
  p_screener text, p_screener_password text, p_poster text, p_country text, p_language text, p_genre text)
returns void
language plpgsql security definer set search_path = public as $$
declare s submissions%rowtype;
begin
  select * into s from submissions where id = p_id and user_id = auth.uid();
  if not found then raise exception 'Entry not found.'; end if;
  if s.status <> 'submitted' then raise exception 'This entry can no longer be edited.'; end if;
  if length(trim(coalesce(p_title, ''))) < 1 or length(trim(coalesce(p_director, ''))) < 1 then raise exception 'Title and director are required.'; end if;
  if p_runtime is null or p_runtime < 1 or p_runtime > 1000 then raise exception 'Enter the running time in minutes.'; end if;
  if left(trim(coalesce(p_screener, '')), 600) !~* '^https?://' and left(trim(coalesce(p_screener, '')), 600) <> 'uploaded' then raise exception 'Enter a screener link that starts with http:// or https://'; end if;
  update submissions set title = left(trim(p_title), 200), director = left(trim(p_director), 200), runtime_min = p_runtime, year = p_year,
    synopsis = trim(coalesce(p_synopsis, '')), screener_url = left(trim(p_screener), 600), screener_password = nullif(left(trim(coalesce(p_screener_password, '')), 100), ''),
    poster_url = nullif(left(trim(coalesce(p_poster, '')), 600), ''), country = nullif(left(trim(coalesce(p_country, '')), 80), ''),
    language = nullif(left(trim(coalesce(p_language, '')), 80), ''), genre = nullif(left(trim(coalesce(p_genre, '')), 80), ''), updated_at = now()
  where id = p_id;
end $$;
revoke execute on function update_my_submission(uuid, text, text, int, int, text, text, text, text, text, text, text) from public, anon;
grant execute on function update_my_submission(uuid, text, text, int, int, text, text, text, text, text, text, text) to authenticated;


-- Save the full details and file list for your own entry. Only known fields are kept and everything is length limited.
create or replace function save_submission_details(p_id uuid, p_details jsonb, p_files jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  s submissions%rowtype;
  uid uuid := auth.uid();
  k text;
  out jsonb := '{}'::jsonb;
  v_files jsonb := '[]'::jsonb;
  f jsonb;
  txt text[] := array['logline','director_bio','director_statement','producer','writer','cinematographer','editor','composer','cast','production_company',
    'shooting_format','aspect_ratio','color','premiere_status','trailer_url','website','imdb_url','social','previous_festivals','awards','phone','rating_note'];
  boo text[] := array['student','first_time','subtitles','rights_confirmed'];
begin
  select * into s from submissions where id = p_id and user_id = uid;
  if not found then raise exception 'Entry not found.'; end if;
  if s.status <> 'submitted' then raise exception 'This entry can no longer be edited.'; end if;
  if p_details is null or jsonb_typeof(p_details) <> 'object' then raise exception 'Details are missing.'; end if;
  foreach k in array txt loop
    if p_details ? k and jsonb_typeof(p_details -> k) = 'string' and length(trim(p_details ->> k)) > 0 then
      out := out || jsonb_build_object(k, left(trim(p_details ->> k), case when k in ('director_bio','director_statement','cast','previous_festivals','awards','logline') then 4000 else 600 end));
    end if;
  end loop;
  foreach k in array boo loop
    if p_details ? k and (p_details ->> k) in ('true', 'false') then out := out || jsonb_build_object(k, (p_details ->> k)::boolean); end if;
  end loop;
  if coalesce((out ->> 'rights_confirmed')::boolean, false) is not true then raise exception 'Please confirm you hold the rights to submit this film.'; end if;
  if p_files is not null and jsonb_typeof(p_files) = 'array' then
    if jsonb_array_length(p_files) > 30 then raise exception 'Up to 30 files per entry.'; end if;
    for f in select * from jsonb_array_elements(p_files) loop
      if jsonb_typeof(f) = 'object' and (f ->> 'kind') in ('film','poster','still','subtitles','script','presskit','other')
         and left(coalesce(f ->> 'path', ''), length(uid::text) + 1) = uid::text || '/' and (f ->> 'path') not like '%..%' then
        v_files := v_files || jsonb_build_array(jsonb_build_object('kind', f ->> 'kind', 'path', left(f ->> 'path', 400), 'name', left(coalesce(f ->> 'name', ''), 200), 'size', coalesce((f ->> 'size')::bigint, 0)));
      end if;
    end loop;
  end if;
  update submissions set details = out, files = v_files, updated_at = now() where id = p_id;
end $$;
revoke execute on function save_submission_details(uuid, jsonb, jsonb) from public, anon;
grant execute on function save_submission_details(uuid, jsonb, jsonb) to authenticated;
