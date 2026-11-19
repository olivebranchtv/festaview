-- Filmmaker "My films": add a film and all its files once, then enter it into any festival. Run AFTER 018. Safe to run more than once.
-- Files use the private submission-files bucket from 018.

create table if not exists filmmaker_films (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  data jsonb not null default '{}'::jsonb,
  files jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists filmmaker_films_user_idx on filmmaker_films(user_id);
alter table filmmaker_films enable row level security;
drop policy if exists "own films read" on filmmaker_films;
create policy "own films read" on filmmaker_films for select to authenticated using (user_id = auth.uid());

-- Save (create or update) one of your films. Only known fields are kept and everything is length limited.
create or replace function save_my_film(p_id uuid, p_data jsonb, p_files jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  k text;
  out jsonb := '{}'::jsonb;
  v_files jsonb := '[]'::jsonb;
  f jsonb;
  fid uuid := p_id;
  ttl text;
  txt text[] := array['title','director','runtime_min','year','synopsis','screener_url','screener_password','poster_url','country','language','genre',
    'logline','director_bio','director_statement','producer','writer','cinematographer','editor','composer','cast','production_company',
    'shooting_format','aspect_ratio','color','premiere_status','trailer_url','website','imdb_url','social','previous_festivals','awards','phone'];
  boo text[] := array['student','first_time','subtitles','rights_confirmed'];
begin
  if uid is null then raise exception 'Please sign in first.'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Details are missing.'; end if;
  ttl := left(trim(coalesce(p_data ->> 'title', '')), 200);
  if ttl = '' then raise exception 'Enter the title of your film.'; end if;
  foreach k in array txt loop
    if p_data ? k and jsonb_typeof(p_data -> k) in ('string', 'number') and length(trim(p_data ->> k)) > 0 then
      out := out || jsonb_build_object(k, left(trim(p_data ->> k), case when k in ('synopsis','director_bio','director_statement','cast','previous_festivals','awards','logline') then 4000 else 600 end));
    end if;
  end loop;
  foreach k in array boo loop
    if p_data ? k and (p_data ->> k) in ('true', 'false') then out := out || jsonb_build_object(k, (p_data ->> k)::boolean); end if;
  end loop;
  if p_files is not null and jsonb_typeof(p_files) = 'array' then
    if jsonb_array_length(p_files) > 30 then raise exception 'Up to 30 files per film.'; end if;
    for f in select * from jsonb_array_elements(p_files) loop
      if jsonb_typeof(f) = 'object' and (f ->> 'kind') in ('film','poster','still','subtitles','script','presskit','other')
         and left(coalesce(f ->> 'path', ''), length(uid::text) + 1) = uid::text || '/' and (f ->> 'path') not like '%..%' then
        v_files := v_files || jsonb_build_array(jsonb_build_object('kind', f ->> 'kind', 'path', left(f ->> 'path', 400), 'name', left(coalesce(f ->> 'name', ''), 200), 'size', coalesce((f ->> 'size')::bigint, 0)));
      end if;
    end loop;
  end if;
  if fid is null then
    if (select count(*) from filmmaker_films where user_id = uid) >= 100 then raise exception 'You can keep up to 100 films.'; end if;
    insert into filmmaker_films (user_id, title, data, files) values (uid, ttl, out, v_files) returning id into fid;
  else
    update filmmaker_films set title = ttl, data = out, files = v_files, updated_at = now() where id = fid and user_id = uid;
    if not found then raise exception 'Film not found.'; end if;
  end if;
  return fid;
end $$;
revoke execute on function save_my_film(uuid, jsonb, jsonb) from public, anon;
grant execute on function save_my_film(uuid, jsonb, jsonb) to authenticated;

create or replace function delete_my_film(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from filmmaker_films where id = p_id and user_id = auth.uid();
  if not found then raise exception 'Film not found.'; end if;
end $$;
revoke execute on function delete_my_film(uuid) from public, anon;
grant execute on function delete_my_film(uuid) to authenticated;
