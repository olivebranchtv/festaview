-- Virtual cinema: scheduled online screenings, programs and live events with windows, capacity, region rules,
-- chat and Q&A. Run AFTER 008_paid_access.sql.

create table if not exists virtual_events (
  id uuid primary key default gen_random_uuid(),
  festival_id uuid not null references festivals(id) on delete cascade,
  kind text not null default 'screening' check (kind in ('screening', 'program', 'live')),
  title text not null,
  description text,
  poster_url text,
  film_ids uuid[] not null default '{}',          -- one film (screening) or several in order (program)
  live_stream_url text,                           -- HLS link for live events
  preroll_url text,                               -- plays before the film (sponsor message, trailer)
  sponsor_name text,
  access text not null default 'free' check (access in ('free', 'ticketed')),
  starts_at timestamptz,                          -- scheduled start (live events and premieres)
  available_from timestamptz,                     -- availability window
  available_until timestamptz,
  watch_hours int check (watch_hours is null or watch_hours > 0),   -- time to finish after pressing play
  capacity int check (capacity is null or capacity > 0),            -- most viewers who can start
  geo_mode text not null default 'none' check (geo_mode in ('none', 'allow', 'block')),
  geo_countries text[] not null default '{}',     -- two-letter country codes
  chat_enabled boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now()
);
create index if not exists virtual_events_festival_idx on virtual_events(festival_id, starts_at);

alter table entitlements add column if not exists event_id uuid references virtual_events(id) on delete cascade;
alter table entitlements add column if not exists overrides_geo boolean not null default false;   -- press / industry codes
alter table products add column if not exists event_id uuid references virtual_events(id) on delete cascade;

-- One row per viewer who pressed play (this is what the watch window and capacity are measured against).
create table if not exists virtual_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references virtual_events(id) on delete cascade,
  viewer_key text not null,
  first_play_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (event_id, viewer_key)
);

create table if not exists virtual_reservations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references virtual_events(id) on delete cascade,
  email text not null check (length(email) between 5 and 200),
  created_at timestamptz not null default now()
);

create table if not exists chat_messages (
  id bigint generated always as identity primary key,
  event_id uuid not null references virtual_events(id) on delete cascade,
  festival_id uuid not null references festivals(id) on delete cascade,
  viewer_key text,
  name text not null,
  body text not null,
  kind text not null default 'chat' check (kind in ('chat', 'question')),
  answered boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists chat_event_idx on chat_messages(event_id, id);

alter table virtual_events enable row level security;
alter table virtual_sessions enable row level security;
alter table virtual_reservations enable row level security;
alter table chat_messages enable row level security;

create policy "public read published events" on virtual_events for select
  using (status = 'published' and exists (select 1 from festivals f where f.id = festival_id and f.status = 'published'));
create policy "admin manage events" on virtual_events for all
  using (is_festival_admin(festival_id)) with check (is_festival_admin(festival_id));

create policy "admin read sessions" on virtual_sessions for select
  using (exists (select 1 from virtual_events e where e.id = event_id and (is_festival_admin(e.festival_id) or is_platform_admin())));

create policy "anyone can reserve a published event" on virtual_reservations for insert
  with check (exists (select 1 from virtual_events e where e.id = event_id and e.status = 'published'));
create policy "admin read reservations" on virtual_reservations for select
  using (exists (select 1 from virtual_events e where e.id = event_id and is_festival_admin(e.festival_id)));

create policy "public read visible chat" on chat_messages for select
  using (not hidden and exists (select 1 from virtual_events e where e.id = event_id and e.status = 'published' and e.chat_enabled));
create policy "admin manage chat" on chat_messages for all
  using (is_festival_admin(festival_id)) with check (is_festival_admin(festival_id));

grant select on virtual_events to anon;
grant select, insert, update, delete on virtual_events to authenticated;
grant select on virtual_sessions to authenticated;
grant insert on virtual_reservations to anon, authenticated;
grant select on virtual_reservations to authenticated;
grant select on chat_messages to anon;
grant select, insert, update, delete on chat_messages to authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- A pass or code that is meant for an event must not unlock ordinary ticketed films (and the reverse).
create or replace function unlock_stream(p_film uuid, p_code text) returns text
language plpgsql security definer stable set search_path = public as $$
declare
  fl films%rowtype;
  ok boolean;
begin
  select * into fl from films f
  where f.id = p_film and f.status = 'published'
    and (f.available_from is null or f.available_from <= now())
    and (f.available_until is null or f.available_until >= now())
    and exists (select 1 from festivals fe where fe.id = f.festival_id and fe.status = 'published');
  if not found then return null; end if;
  if fl.access = 'free' then return fl.video_url; end if;
  select exists (
    select 1 from entitlements e
    where e.code = upper(trim(coalesce(p_code, '')))
      and e.status = 'active'
      and e.event_id is null
      and e.festival_id = fl.festival_id
      and (e.film_id is null or e.film_id = fl.id)
      and (e.expires_at is null or e.expires_at > now())
  ) into ok;
  if ok then return fl.video_url; end if;
  return null;
end $$;
grant execute on function unlock_stream(uuid, text) to anon, authenticated;

-- Press and industry codes can skip region rules (like Eventive's overrides). Replaces the earlier version.
drop function if exists create_comp_codes(uuid, int, uuid, text, timestamptz);
create or replace function create_comp_codes(
  p_festival uuid, p_count int, p_film uuid, p_note text, p_expires timestamptz,
  p_event uuid default null, p_overrides_geo boolean default false)
returns setof text
language plpgsql security definer set search_path = public as $$
declare
  i int;
  c text;
  u text;
begin
  if not is_festival_admin(p_festival) then raise exception 'not allowed'; end if;
  if p_count < 1 or p_count > 200 then raise exception 'count must be between 1 and 200'; end if;
  for i in 1..p_count loop
    u := replace(gen_random_uuid()::text, '-', '');
    c := 'FV-' || upper(substr(u, 1, 4)) || '-' || upper(substr(u, 5, 4)) || '-' || upper(substr(u, 9, 4));
    insert into entitlements (festival_id, film_id, event_id, overrides_geo, code, note, source, expires_at)
    values (p_festival, p_film, p_event, coalesce(p_overrides_geo, false), c, p_note, 'comp', p_expires);
    return next c;
  end loop;
end $$;
revoke execute on function create_comp_codes(uuid, int, uuid, text, timestamptz, uuid, boolean) from public, anon;
grant execute on function create_comp_codes(uuid, int, uuid, text, timestamptz, uuid, boolean) to authenticated;

-- Starts (or resumes) a viewer's screening. Applies the availability window, region rules, capacity, access code
-- and watch window, and records the first play. Region rules need a trusted country, which only the website's
-- server function (service role) can supply, so events with region rules cannot be started directly from a browser.
create or replace function virtual_start(p_event uuid, p_code text, p_device text, p_country text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ev virtual_events%rowtype;
  ent entitlements%rowtype;
  sess virtual_sessions%rowtype;
  vkey text;
  cnt int;
  ctry text := upper(nullif(trim(coalesce(p_country, '')), ''));
  is_server boolean := (auth.role() = 'service_role');
  overrides boolean := false;
  geo_ok boolean := true;
  watch_until timestamptz;
  films_json jsonb;
begin
  select * into ev from virtual_events v
  where v.id = p_event and v.status = 'published'
    and exists (select 1 from festivals f where f.id = v.festival_id and f.status = 'published');
  if not found then return jsonb_build_object('status', 'not_found'); end if;

  if ev.available_from is not null and now() < ev.available_from then
    return jsonb_build_object('status', 'not_open', 'opens_at', ev.available_from);
  end if;
  if ev.available_until is not null and now() > ev.available_until then
    return jsonb_build_object('status', 'closed');
  end if;
  if ev.kind = 'live' and ev.starts_at is not null and now() < ev.starts_at - interval '15 minutes' then
    return jsonb_build_object('status', 'not_started', 'starts_at', ev.starts_at);
  end if;

  if ev.access = 'ticketed' then
    select * into ent from entitlements e
    where e.code = upper(trim(coalesce(p_code, ''))) and e.status = 'active' and e.festival_id = ev.festival_id
      and (e.expires_at is null or e.expires_at > now())
      and (e.event_id = ev.id or (e.event_id is null and e.film_id is null));
    if not found then return jsonb_build_object('status', 'code_required'); end if;
    vkey := 'code:' || ent.code;
    overrides := ent.overrides_geo;
  else
    if coalesce(p_device, '') = '' then return jsonb_build_object('status', 'error'); end if;
    vkey := 'device:' || left(p_device, 80);
  end if;

  if ev.geo_mode <> 'none' and not overrides then
    if not is_server then return jsonb_build_object('status', 'geo_check_required'); end if;
    if ctry is null then
      geo_ok := false;
    elsif ev.geo_mode = 'allow' then
      geo_ok := ctry = any (select upper(x) from unnest(ev.geo_countries) x);
    else
      geo_ok := not (ctry = any (select upper(x) from unnest(ev.geo_countries) x));
    end if;
    if not geo_ok then return jsonb_build_object('status', 'blocked'); end if;
  end if;

  perform pg_advisory_xact_lock(hashtext(ev.id::text));
  select * into sess from virtual_sessions s where s.event_id = ev.id and s.viewer_key = vkey;
  if not found then
    if ev.capacity is not null then
      select count(*) into cnt from virtual_sessions s where s.event_id = ev.id;
      if cnt >= ev.capacity then return jsonb_build_object('status', 'full'); end if;
    end if;
    insert into virtual_sessions (event_id, viewer_key) values (ev.id, vkey) returning * into sess;
  else
    update virtual_sessions set last_seen_at = now() where id = sess.id;
  end if;

  if ev.watch_hours is not null then
    watch_until := sess.first_play_at + make_interval(hours => ev.watch_hours);
    if now() > watch_until then
      return jsonb_build_object('status', 'expired', 'first_play_at', sess.first_play_at);
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', f.id, 'title', f.title, 'video_url', f.video_url, 'poster_url', f.poster_url,
           'duration_sec', f.duration_sec, 'captions_url', f.captions_url, 'festival_id', f.festival_id) order by a.ord), '[]'::jsonb)
    into films_json
    from unnest(ev.film_ids) with ordinality as a(fid, ord)
    join films f on f.id = a.fid;

  return jsonb_build_object(
    'status', 'ok', 'kind', ev.kind, 'title', ev.title, 'films', films_json,
    'live_stream_url', ev.live_stream_url, 'preroll_url', ev.preroll_url, 'sponsor_name', ev.sponsor_name,
    'first_play_at', sess.first_play_at, 'watch_until', watch_until);
end $$;
grant execute on function virtual_start(uuid, text, text, text) to anon, authenticated, service_role;

-- Chat and Q&A: only viewers who have started the screening can post, one message per two seconds.
create or replace function post_chat(p_event uuid, p_code text, p_device text, p_name text, p_body text, p_kind text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  ev virtual_events%rowtype;
  vkey text;
  nm text := left(trim(coalesce(p_name, '')), 30);
  bd text := left(trim(coalesce(p_body, '')), 300);
begin
  select * into ev from virtual_events v
  where v.id = p_event and v.status = 'published' and v.chat_enabled
    and exists (select 1 from festivals f where f.id = v.festival_id and f.status = 'published');
  if not found then return 'closed'; end if;
  if length(bd) < 1 then return 'empty'; end if;
  if nm = '' then nm := 'Guest'; end if;
  if ev.access = 'ticketed' then vkey := 'code:' || upper(trim(coalesce(p_code, '')));
  else vkey := 'device:' || left(coalesce(p_device, ''), 80); end if;
  if not exists (select 1 from virtual_sessions s where s.event_id = ev.id and s.viewer_key = vkey) then return 'not_watching'; end if;
  if exists (select 1 from chat_messages m where m.event_id = ev.id and m.viewer_key = vkey and m.created_at > now() - interval '2 seconds') then
    return 'slow_down';
  end if;
  insert into chat_messages (event_id, festival_id, viewer_key, name, body, kind)
  values (ev.id, ev.festival_id, vkey, nm, bd, case when p_kind = 'question' then 'question' else 'chat' end);
  return 'ok';
end $$;
grant execute on function post_chat(uuid, text, text, text, text, text) to anon, authenticated;
