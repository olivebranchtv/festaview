-- Festaview judging: a festival invites judges by email, opens a judging round, and judges score the entries assigned to them.
-- Safe to run more than once. Run AFTER 022. Every table has row level security and NO direct access for the website:
-- everything goes through SECURITY DEFINER functions. Judges never see other judges' scores or the filmmaker's payment data,
-- and filmmakers never see any of this (they cannot read these tables).

-- ---------------------------------------------------------------- tables
-- One judging round per festival. rubric is a list like [{"id":"story","name":"Story","weight":1}], each criterion scored 1 to 10.
create table if not exists judging_rounds (
  festival_id uuid primary key references festivals(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  rubric jsonb not null default '[{"id":"story","name":"Story","weight":1},{"id":"direction","name":"Direction","weight":1},{"id":"craft","name":"Craft","weight":1},{"id":"overall","name":"Overall","weight":1}]'::jsonb,
  instructions text,
  opened_at timestamptz,
  closed_at timestamptz,
  updated_at timestamptz not null default now()
);

-- A judge is invited by email. category_ids = every entry in those categories; entry_ids = extra single entries.
create table if not exists festival_judges (
  id uuid primary key default gen_random_uuid(),
  festival_id uuid not null references festivals(id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name text,
  category_ids uuid[] not null default '{}',
  entry_ids uuid[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists festival_judges_email_idx on festival_judges(festival_id, email);
create index if not exists festival_judges_email_only_idx on festival_judges(email);

-- One judgment per judge per entry. final = false is a saved draft the judge can still change.
create table if not exists judge_scores (
  id uuid primary key default gen_random_uuid(),
  festival_id uuid not null references festivals(id) on delete cascade,
  submission_id uuid not null references submissions(id) on delete cascade,
  judge_id uuid not null references festival_judges(id) on delete cascade,
  scores jsonb not null default '{}'::jsonb,
  comment text,
  recommendation text check (recommendation is null or recommendation in ('accept', 'maybe', 'decline')),
  final boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists judge_scores_unique_idx on judge_scores(submission_id, judge_id);
create index if not exists judge_scores_festival_idx on judge_scores(festival_id);

alter table judging_rounds enable row level security;
alter table festival_judges enable row level security;
alter table judge_scores enable row level security;
-- No policies on purpose, and no table grants: only the functions below can touch these tables.
revoke all on judging_rounds, festival_judges, judge_scores from anon, authenticated;

-- ---------------------------------------------------------------- helpers
create or replace function judge_email() returns text
language sql stable set search_path = public as $$ select lower(nullif(auth.jwt() ->> 'email', '')) $$;
revoke execute on function judge_email() from public, anon;
grant execute on function judge_email() to authenticated;

-- Is the signed-in person an active judge of this entry, with the round open? (SECURITY DEFINER so it can read the private tables.)
create or replace function judge_for_entry(p_submission uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select j.id from festival_judges j
    join submissions s on s.festival_id = j.festival_id
    join judging_rounds r on r.festival_id = j.festival_id
  where s.id = p_submission and j.active and j.email = lower(nullif(auth.jwt() ->> 'email', ''))
    and r.status = 'open' and s.status <> 'withdrawn' and s.payment_status in ('paid', 'free', 'waived')
    and (s.category_id = any (j.category_ids) or s.id = any (j.entry_ids))
  limit 1
$$;
revoke execute on function judge_for_entry(uuid) from public, anon;
grant execute on function judge_for_entry(uuid) to authenticated;

-- Judges may open the files of the entries they judge (the uploaded film, stills). Added to the existing read rule from 018.
create or replace function judge_can_read_file(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from submissions s
      join festival_judges j on j.festival_id = s.festival_id
      join judging_rounds r on r.festival_id = s.festival_id
    where s.user_id::text = (storage.foldername(p_name))[1]
      and s.files @> jsonb_build_array(jsonb_build_object('path', p_name))
      and j.active and j.email = lower(nullif(auth.jwt() ->> 'email', ''))
      and r.status in ('open', 'closed') and s.status <> 'withdrawn'
      and (s.category_id = any (j.category_ids) or s.id = any (j.entry_ids)))
$$;
revoke execute on function judge_can_read_file(text) from public, anon;
grant execute on function judge_can_read_file(text) to authenticated;

drop policy if exists "submission files read" on storage.objects;
create policy "submission files read" on storage.objects for select to authenticated
  using (bucket_id = 'submission-files' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or is_platform_admin()
    or exists (select 1 from submissions s where s.user_id::text = (storage.foldername(name))[1] and is_festival_admin(s.festival_id))
    or judge_can_read_file(name)));

-- ---------------------------------------------------------------- festival admin actions
create or replace function judging_save_round(p_festival uuid, p_status text, p_rubric jsonb, p_instructions text) returns void
language plpgsql security definer set search_path = public as $$
declare
  c jsonb;
  ids text[] := '{}';
  cid text;
  w numeric;
  old judging_rounds%rowtype;
begin
  if not (is_festival_admin(p_festival) or is_platform_admin()) then raise exception 'You do not manage this festival.'; end if;
  if p_status not in ('draft', 'open', 'closed') then raise exception 'Choose draft, open or closed.'; end if;
  if p_rubric is null or jsonb_typeof(p_rubric) <> 'array' or jsonb_array_length(p_rubric) < 1 then raise exception 'Add at least one scoring criterion.'; end if;
  if jsonb_array_length(p_rubric) > 10 then raise exception 'Use at most 10 criteria.'; end if;
  for c in select * from jsonb_array_elements(p_rubric) loop
    cid := c ->> 'id';
    if cid is null or cid !~ '^[a-z0-9_]{1,40}$' then raise exception 'Each criterion needs a short name.'; end if;
    if cid = any (ids) then raise exception 'Two criteria have the same name.'; end if;
    ids := ids || cid;
    if length(trim(coalesce(c ->> 'name', ''))) not between 1 and 40 then raise exception 'Each criterion needs a name of up to 40 characters.'; end if;
    w := coalesce(nullif(c ->> 'weight', '')::numeric, 1);
    if w < 0.1 or w > 10 then raise exception 'A weight must be between 0.1 and 10.'; end if;
  end loop;
  select * into old from judging_rounds where festival_id = p_festival;
  -- Changing criteria after judges have scored would make old scores meaningless, so it is only allowed before the first score.
  if found and old.rubric is distinct from p_rubric and exists (select 1 from judge_scores where festival_id = p_festival) then
    raise exception 'Scoring has already started, so the criteria can no longer be changed.';
  end if;
  insert into judging_rounds (festival_id, status, rubric, instructions, opened_at, closed_at)
  values (p_festival, p_status, p_rubric, nullif(left(trim(coalesce(p_instructions, '')), 4000), ''),
          case when p_status = 'open' then now() end, case when p_status = 'closed' then now() end)
  on conflict (festival_id) do update set
    status = excluded.status, rubric = excluded.rubric, instructions = excluded.instructions, updated_at = now(),
    opened_at = case when excluded.status = 'open' and judging_rounds.status <> 'open' then now() else judging_rounds.opened_at end,
    closed_at = case when excluded.status = 'closed' and judging_rounds.status <> 'closed' then now() when excluded.status <> 'closed' then null else judging_rounds.closed_at end;
end $$;
revoke execute on function judging_save_round(uuid, text, jsonb, text) from public, anon;
grant execute on function judging_save_round(uuid, text, jsonb, text) to authenticated;

create or replace function judging_save_judge(p_festival uuid, p_id uuid, p_email text, p_name text, p_category_ids uuid[], p_entry_ids uuid[], p_active boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  jid uuid := p_id;
  em text := lower(trim(coalesce(p_email, '')));
  cats uuid[] := coalesce(p_category_ids, '{}');
  ents uuid[] := coalesce(p_entry_ids, '{}');
begin
  if not (is_festival_admin(p_festival) or is_platform_admin()) then raise exception 'You do not manage this festival.'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address for the judge.'; end if;
  if array_length(cats, 1) > 50 or array_length(ents, 1) > 2000 then raise exception 'Too many categories or entries selected.'; end if;
  if exists (select 1 from unnest(cats) x where not exists (select 1 from submission_categories c where c.id = x and c.festival_id = p_festival)) then
    raise exception 'A selected category does not belong to this festival.';
  end if;
  if exists (select 1 from unnest(ents) x where not exists (select 1 from submissions s where s.id = x and s.festival_id = p_festival)) then
    raise exception 'A selected entry does not belong to this festival.';
  end if;
  if jid is null then
    if (select count(*) from festival_judges where festival_id = p_festival) >= 100 then raise exception 'You can invite up to 100 judges.'; end if;
    if exists (select 1 from festival_judges where festival_id = p_festival and email = em) then raise exception 'That judge is already invited. Edit them instead.'; end if;
    insert into festival_judges (festival_id, email, name, category_ids, entry_ids, active)
    values (p_festival, em, nullif(left(trim(coalesce(p_name, '')), 120), ''), cats, ents, coalesce(p_active, true)) returning id into jid;
  else
    if exists (select 1 from festival_judges where festival_id = p_festival and email = em and id <> jid) then raise exception 'Another judge already uses that email.'; end if;
    update festival_judges set email = em, name = nullif(left(trim(coalesce(p_name, '')), 120), ''), category_ids = cats, entry_ids = ents, active = coalesce(p_active, true)
      where id = jid and festival_id = p_festival;
    if not found then raise exception 'Judge not found.'; end if;
  end if;
  return jid;
end $$;
revoke execute on function judging_save_judge(uuid, uuid, text, text, uuid[], uuid[], boolean) from public, anon;
grant execute on function judging_save_judge(uuid, uuid, text, text, uuid[], uuid[], boolean) to authenticated;

-- Removing a judge also removes their scores.
create or replace function judging_remove_judge(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  select festival_id into fid from festival_judges where id = p_id;
  if fid is null then raise exception 'Judge not found.'; end if;
  if not (is_festival_admin(fid) or is_platform_admin()) then raise exception 'You do not manage this festival.'; end if;
  delete from festival_judges where id = p_id;
end $$;
revoke execute on function judging_remove_judge(uuid) from public, anon;
grant execute on function judging_remove_judge(uuid) to authenticated;

-- Everything the director sees: round, judges and every score. Directors only.
create or replace function judging_admin_data(p_festival uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_festival_admin(p_festival) or is_platform_admin()) then raise exception 'You do not manage this festival.'; end if;
  return jsonb_build_object(
    'round', (select to_jsonb(r) from judging_rounds r where r.festival_id = p_festival),
    'judges', coalesce((select jsonb_agg(to_jsonb(j) order by j.created_at) from festival_judges j where j.festival_id = p_festival), '[]'::jsonb),
    'scores', coalesce((select jsonb_agg(jsonb_build_object('submission_id', s.submission_id, 'judge_id', s.judge_id, 'scores', s.scores, 'comment', s.comment,
                'recommendation', s.recommendation, 'final', s.final, 'updated_at', s.updated_at)) from judge_scores s where s.festival_id = p_festival), '[]'::jsonb));
end $$;
revoke execute on function judging_admin_data(uuid) from public, anon;
grant execute on function judging_admin_data(uuid) to authenticated;

-- ---------------------------------------------------------------- judge actions
-- Festivals the signed-in person is invited to judge (round open or closed).
create or replace function judging_my_festivals() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('festival_id', f.id, 'name', f.name, 'slug', f.slug, 'status', r.status, 'judge_id', j.id,
      'assigned', (select count(*) from submissions s where s.festival_id = f.id and s.status <> 'withdrawn' and s.payment_status in ('paid', 'free', 'waived')
                     and (s.category_id = any (j.category_ids) or s.id = any (j.entry_ids))),
      'scored', (select count(*) from judge_scores x where x.judge_id = j.id and x.final)) order by f.name), '[]'::jsonb)
  from festival_judges j
    join festivals f on f.id = j.festival_id
    join judging_rounds r on r.festival_id = j.festival_id and r.status in ('open', 'closed')
  where j.active and j.email = lower(nullif(auth.jwt() ->> 'email', ''))
$$;
revoke execute on function judging_my_festivals() from public, anon;
grant execute on function judging_my_festivals() to authenticated;

-- The round and ONLY the entries assigned to this judge, with the film details and screener but no payment, contact or other judges' data.
create or replace function judging_my_entries(p_festival uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  j festival_judges%rowtype;
  r judging_rounds%rowtype;
begin
  select * into j from festival_judges where festival_id = p_festival and active and email = lower(nullif(auth.jwt() ->> 'email', ''));
  if not found then raise exception 'You are not invited to judge this festival.'; end if;
  select * into r from judging_rounds where festival_id = p_festival and status in ('open', 'closed');
  if not found then raise exception 'Judging has not opened yet.'; end if;
  return jsonb_build_object(
    'round', jsonb_build_object('status', r.status, 'rubric', r.rubric, 'instructions', r.instructions),
    'festival', (select jsonb_build_object('name', f.name, 'slug', f.slug) from festivals f where f.id = p_festival),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'director', s.director, 'runtime_min', s.runtime_min, 'year', s.year, 'country', s.country, 'language', s.language,
        'genre', s.genre, 'synopsis', s.synopsis, 'poster_url', s.poster_url, 'screener_url', s.screener_url, 'screener_password', s.screener_password,
        'category', (select c.name from submission_categories c where c.id = s.category_id),
        'details', coalesce(s.details, '{}'::jsonb) - 'phone',
        'files', coalesce(s.files, '[]'::jsonb),
        'mine', (select jsonb_build_object('scores', x.scores, 'comment', x.comment, 'recommendation', x.recommendation, 'final', x.final, 'updated_at', x.updated_at)
                   from judge_scores x where x.submission_id = s.id and x.judge_id = j.id)) order by s.title)
      from submissions s
      where s.festival_id = p_festival and s.status <> 'withdrawn' and s.payment_status in ('paid', 'free', 'waived')
        and (s.category_id = any (j.category_ids) or s.id = any (j.entry_ids))), '[]'::jsonb));
end $$;
revoke execute on function judging_my_entries(uuid) from public, anon;
grant execute on function judging_my_entries(uuid) to authenticated;

-- Saves a draft (p_final false) or submits the judgment (p_final true: every criterion scored and a recommendation chosen).
-- Allowed only while the round is open, so a judge can edit until the director closes it.
create or replace function judging_save_score(p_submission uuid, p_scores jsonb, p_comment text, p_recommendation text, p_final boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  jid uuid := judge_for_entry(p_submission);
  fid uuid;
  rub jsonb;
  c jsonb;
  k text;
  v numeric;
  clean jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  select festival_id into fid from submissions where id = p_submission;
  if jid is null then
    if exists (select 1 from judging_rounds where festival_id = fid and status = 'closed') then raise exception 'Judging is closed, so scores can no longer be changed.'; end if;
    raise exception 'You are not assigned to judge this entry.';
  end if;
  select rubric into rub from judging_rounds where festival_id = fid;
  if p_recommendation is not null and p_recommendation not in ('accept', 'maybe', 'decline') then raise exception 'Choose Accept, Maybe or Decline.'; end if;
  if p_scores is not null and jsonb_typeof(p_scores) <> 'object' then raise exception 'Scores are not valid.'; end if;
  for k in select jsonb_object_keys(coalesce(p_scores, '{}'::jsonb)) loop
    if not exists (select 1 from jsonb_array_elements(rub) e where e ->> 'id' = k) then raise exception 'Unknown criterion.'; end if;
    if jsonb_typeof(p_scores -> k) <> 'number' then raise exception 'Each score must be a number from 1 to 10.'; end if;
    v := (p_scores ->> k)::numeric;
    if v <> trunc(v) or v < 1 or v > 10 then raise exception 'Each score must be a whole number from 1 to 10.'; end if;
    clean := clean || jsonb_build_object(k, v::int);
  end loop;
  if coalesce(p_final, false) then
    for c in select * from jsonb_array_elements(rub) loop
      if not (clean ? (c ->> 'id')) then raise exception 'Score every criterion (%) before submitting, or save a draft.', c ->> 'name'; end if;
    end loop;
    if p_recommendation is null then raise exception 'Choose Accept, Maybe or Decline before submitting, or save a draft.'; end if;
  end if;
  insert into judge_scores (festival_id, submission_id, judge_id, scores, comment, recommendation, final)
  values (fid, p_submission, jid, clean, nullif(left(trim(coalesce(p_comment, '')), 6000), ''), p_recommendation, coalesce(p_final, false))
  on conflict (submission_id, judge_id) do update set scores = excluded.scores, comment = excluded.comment, recommendation = excluded.recommendation,
    final = excluded.final, updated_at = now();
end $$;
revoke execute on function judging_save_score(uuid, jsonb, text, text, boolean) from public, anon;
grant execute on function judging_save_score(uuid, jsonb, text, text, boolean) to authenticated;
