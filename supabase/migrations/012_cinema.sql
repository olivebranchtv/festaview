-- Festaview Virtual Theater, phase 1: numbered screens, scheduled showings that start at one time for everyone,
-- late entry, seat limits, booking rules and approvals, and chat. Run AFTER 011.

-- ---------------------------------------------------------------- settings and screens
create table if not exists cinema_settings (
  id int primary key default 1 check (id = 1),
  require_approval boolean not null default true,        -- bookings by festivals wait for the owner's approval
  min_notice_hours int not null default 24 check (min_notice_hours >= 0),
  max_upcoming int not null default 30 check (max_upcoming > 0)
);
insert into cinema_settings (id) values (1) on conflict (id) do nothing;

create table if not exists cinema_screens (
  id uuid primary key default gen_random_uuid(),
  number int not null unique check (number > 0),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into cinema_screens (number, name) select n, 'Screen ' || n from generate_series(1, 12) n on conflict (number) do nothing;

-- ---------------------------------------------------------------- showings
create table if not exists cinema_showings (
  id uuid primary key default gen_random_uuid(),
  screen_id uuid not null references cinema_screens(id) on delete restrict,
  festival_id uuid not null references festivals(id) on delete cascade,   -- who booked it
  kind text not null check (kind in ('film', 'program', 'live')),
  title text not null,
  description text,
  poster_url text,
  rating text,
  film_ids uuid[] not null default '{}',
  live_stream_url text,
  preroll_url text,
  sponsor_name text,
  starts_at timestamptz not null,                          -- showtime: the film starts here for everyone
  lobby_minutes int not null default 10 check (lobby_minutes between 0 and 30),
  runtime_min int not null check (runtime_min > 0),
  qa_minutes int not null default 0 check (qa_minutes between 0 and 180),
  seats int check (seats is null or seats > 0),
  access text not null default 'free' check (access in ('free', 'ticketed')),
  chat_enabled boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'scheduled', 'cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists cinema_showings_time_idx on cinema_showings(starts_at);
create index if not exists cinema_showings_festival_idx on cinema_showings(festival_id, starts_at);

-- A screen can only show one thing at a time: lobby + film + Q&A + a 5 minute buffer must not overlap.
create or replace function cinema_check_overlap() returns trigger
language plpgsql as $$
begin
  if new.status in ('pending', 'scheduled') then
    perform pg_advisory_xact_lock(hashtext(new.screen_id::text));
    if exists (
      select 1 from cinema_showings s
      where s.screen_id = new.screen_id and s.id <> new.id and s.status in ('pending', 'scheduled')
        and s.starts_at - make_interval(mins => s.lobby_minutes) < new.starts_at + make_interval(mins => new.runtime_min + new.qa_minutes + 5)
        and new.starts_at - make_interval(mins => new.lobby_minutes) < s.starts_at + make_interval(mins => s.runtime_min + s.qa_minutes + 5)
    ) then
      raise exception 'That time overlaps another showing on this screen. Pick a different time or screen.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists cinema_overlap on cinema_showings;
create trigger cinema_overlap before insert or update on cinema_showings for each row execute function cinema_check_overlap();

-- One row per viewer who took a seat (free showings: a seat is taken when a viewer reserves or walks in).
create table if not exists cinema_tickets (
  id uuid primary key default gen_random_uuid(),
  showing_id uuid not null references cinema_showings(id) on delete cascade,
  viewer_key text not null,
  created_at timestamptz not null default now(),
  unique (showing_id, viewer_key)
);

create table if not exists cinema_chat (
  id bigint generated always as identity primary key,
  showing_id uuid not null references cinema_showings(id) on delete cascade,
  festival_id uuid not null references festivals(id) on delete cascade,
  viewer_key text,
  name text not null,
  body text not null,
  kind text not null default 'chat' check (kind in ('chat', 'question')),
  answered boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists cinema_chat_idx on cinema_chat(showing_id, id);

-- ---------------------------------------------------------------- access rules
alter table cinema_settings enable row level security;
alter table cinema_screens enable row level security;
alter table cinema_showings enable row level security;
alter table cinema_tickets enable row level security;
alter table cinema_chat enable row level security;

create policy "owner reads and edits settings" on cinema_settings for all using (is_platform_admin()) with check (is_platform_admin());
create policy "public read active screens" on cinema_screens for select using (active or is_platform_admin());
create policy "owner manages screens" on cinema_screens for all using (is_platform_admin()) with check (is_platform_admin());
-- Showings are written only through the booking functions below, so the rules always apply.
create policy "festival admins read their showings" on cinema_showings for select using (is_festival_admin(festival_id) or is_platform_admin());
create policy "festival admins read tickets" on cinema_tickets for select
  using (exists (select 1 from cinema_showings s where s.id = showing_id and (is_festival_admin(s.festival_id) or is_platform_admin())));
create policy "public read visible chat" on cinema_chat for select
  using (not hidden and exists (select 1 from cinema_showings s where s.id = showing_id and s.status = 'scheduled' and s.chat_enabled));
create policy "festival admins moderate chat" on cinema_chat for all
  using (is_festival_admin(festival_id) or is_platform_admin()) with check (is_festival_admin(festival_id) or is_platform_admin());

grant select on cinema_screens to anon;
grant select, insert, update, delete on cinema_screens to authenticated;
grant select, update on cinema_settings to authenticated;
grant select on cinema_showings to authenticated;
grant select on cinema_tickets to authenticated;
grant select on cinema_chat to anon;
grant select, update, delete on cinema_chat to authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- ---------------------------------------------------------------- the public marquee
-- Only what the public may see (never stream links). Seats taken are counted for "seats left".
create or replace view cinema_board as
select s.id, s.screen_id, c.number as screen_number, c.name as screen_name,
       s.festival_id, f.slug as festival_slug, f.name as festival_name,
       s.kind, s.title, s.description, s.poster_url, s.rating, s.starts_at, s.lobby_minutes, s.runtime_min, s.qa_minutes,
       s.starts_at + make_interval(mins => s.runtime_min + s.qa_minutes) as ends_at,
       s.seats, (select count(*) from cinema_tickets t where t.showing_id = s.id)::int as taken,
       s.access, s.chat_enabled
from cinema_showings s
join cinema_screens c on c.id = s.screen_id
join festivals f on f.id = s.festival_id
where s.status = 'scheduled' and f.status = 'published' and c.active
  and s.starts_at + make_interval(mins => s.runtime_min + s.qa_minutes) > now() - interval '30 minutes'
  and s.starts_at < now() + interval '30 days';
grant select on cinema_board to anon, authenticated;

-- ---------------------------------------------------------------- booking (festivals, filmmakers; the owner can book anything)
create or replace function book_showing(
  p_festival uuid, p_screen uuid, p_kind text, p_title text, p_description text, p_poster text,
  p_film_ids uuid[], p_live_url text, p_preroll text, p_sponsor text, p_rating text,
  p_starts_at timestamptz, p_lobby int, p_qa int, p_seats int, p_live_runtime int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  st cinema_settings%rowtype;
  is_owner boolean := is_platform_admin();
  fest festivals%rowtype;
  runtime int;
  secs int := 0;
  n_films int;
  n_ok int;
  upcoming int;
  newstatus text;
  sid uuid;
  ttl text := left(trim(coalesce(p_title, '')), 160);
begin
  select * into fest from festivals where id = p_festival;
  if not found then raise exception 'Festival not found.'; end if;
  if not (is_festival_admin(p_festival) or is_owner) then raise exception 'You do not manage this festival.'; end if;
  if fest.status <> 'published' then raise exception 'Publish your festival before booking a showing.'; end if;
  select * into st from cinema_settings where id = 1;
  if not exists (select 1 from cinema_screens where id = p_screen and active) then raise exception 'Choose a screen.'; end if;
  if p_kind not in ('film', 'program', 'live') then raise exception 'Choose a type.'; end if;
  if ttl = '' then raise exception 'Give the showing a title.'; end if;
  if p_starts_at is null then raise exception 'Choose a start time.'; end if;
  if is_owner then
    if p_starts_at < now() then raise exception 'That start time is in the past.'; end if;
  elsif p_starts_at < now() + make_interval(hours => st.min_notice_hours) then
    raise exception 'Showings must be booked at least % hours ahead.', st.min_notice_hours;
  end if;
  if p_lobby is null or p_lobby < 0 or p_lobby > 30 then raise exception 'Lobby time must be between 0 and 30 minutes.'; end if;
  if p_qa is null or p_qa < 0 or p_qa > 180 then raise exception 'Q&A time must be between 0 and 180 minutes.'; end if;
  if p_seats is not null and (p_seats < 1 or p_seats > 1000000) then raise exception 'Seats must be 1 or more.'; end if;

  if p_kind = 'live' then
    if coalesce(trim(p_live_url), '') = '' then raise exception 'A live showing needs a stream link.'; end if;
    runtime := p_live_runtime;
    if runtime is null or runtime < 1 or runtime > 600 then raise exception 'Enter how long the live event runs (1 to 600 minutes).'; end if;
  else
    n_films := coalesce(array_length(p_film_ids, 1), 0);
    if n_films = 0 then raise exception 'Choose at least one film.'; end if;
    if p_kind = 'film' and n_films <> 1 then raise exception 'A single film showing has exactly one film.'; end if;
    if n_films <> (select count(distinct x) from unnest(p_film_ids) x) then raise exception 'Each film can only appear once.'; end if;
    select count(*), coalesce(sum(coalesce(f.duration_sec, f.runtime_min * 60)), 0)::int into n_ok, secs
      from films f
      where f.id = any (p_film_ids) and f.festival_id = p_festival and f.video_url is not null
        and coalesce(f.duration_sec, f.runtime_min * 60) > 0;
    if n_ok <> n_films then raise exception 'Every film needs a video link and a length, and must belong to this festival.'; end if;
    runtime := ceil(secs / 60.0)::int;
  end if;

  select count(*) into upcoming from cinema_showings
    where festival_id = p_festival and status in ('pending', 'scheduled') and starts_at > now();
  if not is_owner and upcoming >= st.max_upcoming then raise exception 'You have reached the limit of % upcoming showings.', st.max_upcoming; end if;

  newstatus := case when is_owner or not st.require_approval then 'scheduled' else 'pending' end;
  insert into cinema_showings (screen_id, festival_id, kind, title, description, poster_url, rating, film_ids, live_stream_url,
                               preroll_url, sponsor_name, starts_at, lobby_minutes, runtime_min, qa_minutes, seats, status)
  values (p_screen, p_festival, p_kind, ttl, nullif(trim(coalesce(p_description, '')), ''), nullif(trim(coalesce(p_poster, '')), ''),
          nullif(trim(coalesce(p_rating, '')), ''), coalesce(p_film_ids, '{}'), nullif(trim(coalesce(p_live_url, '')), ''),
          nullif(trim(coalesce(p_preroll, '')), ''), nullif(trim(coalesce(p_sponsor, '')), ''), p_starts_at, p_lobby, runtime, p_qa, p_seats, newstatus)
  returning id into sid;
  return jsonb_build_object('id', sid, 'status', newstatus);
end $$;
revoke execute on function book_showing(uuid, uuid, text, text, text, text, uuid[], text, text, text, text, timestamptz, int, int, int, int) from public, anon;
grant execute on function book_showing(uuid, uuid, text, text, text, text, uuid[], text, text, text, text, timestamptz, int, int, int, int) to authenticated;

create or replace function cancel_showing(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  select festival_id into fid from cinema_showings where id = p_id;
  if not found then raise exception 'Showing not found.'; end if;
  if not (is_festival_admin(fid) or is_platform_admin()) then raise exception 'You do not manage this showing.'; end if;
  update cinema_showings set status = 'cancelled' where id = p_id;
  return 'ok';
end $$;
revoke execute on function cancel_showing(uuid) from public, anon;
grant execute on function cancel_showing(uuid) to authenticated;

create or replace function approve_showing(p_id uuid, p_ok boolean) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Only the network owner can approve showings.'; end if;
  update cinema_showings set status = case when p_ok then 'scheduled' else 'cancelled' end where id = p_id and status = 'pending';
  return 'ok';
end $$;
revoke execute on function approve_showing(uuid, boolean) from public, anon;
grant execute on function approve_showing(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------- reserving a seat and walking in
-- Reserve a seat for later (free showings). Seats are counted per device.
create or replace function cinema_reserve(p_showing uuid, p_device text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s cinema_showings%rowtype;
  vkey text;
  cnt int;
begin
  select * into s from cinema_showings x
    where x.id = p_showing and x.status = 'scheduled'
      and exists (select 1 from festivals f where f.id = x.festival_id and f.status = 'published');
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if now() > s.starts_at + make_interval(mins => s.runtime_min + s.qa_minutes) then return jsonb_build_object('status', 'ended'); end if;
  if coalesce(p_device, '') = '' then return jsonb_build_object('status', 'error'); end if;
  vkey := 'device:' || left(p_device, 80);
  perform pg_advisory_xact_lock(hashtext(s.id::text));
  if not exists (select 1 from cinema_tickets t where t.showing_id = s.id and t.viewer_key = vkey) then
    if s.seats is not null then
      select count(*) into cnt from cinema_tickets t where t.showing_id = s.id;
      if cnt >= s.seats then return jsonb_build_object('status', 'full'); end if;
    end if;
    insert into cinema_tickets (showing_id, viewer_key) values (s.id, vkey);
  end if;
  return jsonb_build_object('status', 'ok');
end $$;
grant execute on function cinema_reserve(uuid, text) to anon, authenticated;

-- Enter the theater. Opens at the lobby time, takes a seat if the viewer has none, and returns everything the room needs,
-- including the server clock so every viewer stays in step. Late entry is allowed until the showing ends.
create or replace function cinema_join(p_showing uuid, p_device text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s cinema_showings%rowtype;
  vkey text;
  cnt int;
  lobby_open timestamptz;
  end_at timestamptz;
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  films_json jsonb;
begin
  select * into s from cinema_showings x
    where x.id = p_showing and x.status = 'scheduled'
      and exists (select 1 from festivals f where f.id = x.festival_id and f.status = 'published');
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  lobby_open := s.starts_at - make_interval(mins => s.lobby_minutes);
  end_at := s.starts_at + make_interval(mins => s.runtime_min + s.qa_minutes);
  if now() < lobby_open then
    return jsonb_build_object('status', 'too_early', 'opens_at', lobby_open, 'starts_at', s.starts_at, 'server_now', now_ms);
  end if;
  if now() > end_at then return jsonb_build_object('status', 'ended'); end if;
  if coalesce(p_device, '') = '' then return jsonb_build_object('status', 'error'); end if;
  vkey := 'device:' || left(p_device, 80);

  perform pg_advisory_xact_lock(hashtext(s.id::text));
  if not exists (select 1 from cinema_tickets t where t.showing_id = s.id and t.viewer_key = vkey) then
    if s.seats is not null then
      select count(*) into cnt from cinema_tickets t where t.showing_id = s.id;
      if cnt >= s.seats then return jsonb_build_object('status', 'full'); end if;
    end if;
    insert into cinema_tickets (showing_id, viewer_key) values (s.id, vkey);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', f.id, 'title', f.title, 'video_url', f.video_url, 'poster_url', f.poster_url,
           'duration_sec', coalesce(f.duration_sec, f.runtime_min * 60), 'festival_id', f.festival_id) order by a.ord), '[]'::jsonb)
    into films_json
    from unnest(s.film_ids) with ordinality as a(fid, ord)
    join films f on f.id = a.fid;

  return jsonb_build_object(
    'status', 'ok', 'server_now', now_ms, 'kind', s.kind, 'title', s.title, 'festival_id', s.festival_id,
    'starts_at', s.starts_at, 'lobby_open', lobby_open, 'ends_at', end_at, 'runtime_min', s.runtime_min, 'qa_minutes', s.qa_minutes,
    'films', films_json, 'live_stream_url', s.live_stream_url, 'preroll_url', s.preroll_url, 'sponsor_name', s.sponsor_name,
    'chat_enabled', s.chat_enabled);
end $$;
grant execute on function cinema_join(uuid, text) to anon, authenticated;

create or replace function cinema_post_chat(p_showing uuid, p_device text, p_name text, p_body text, p_kind text) returns text
language plpgsql security definer set search_path = public as $$
declare
  s cinema_showings%rowtype;
  vkey text := 'device:' || left(coalesce(p_device, ''), 80);
  nm text := left(trim(coalesce(p_name, '')), 30);
  bd text := left(trim(coalesce(p_body, '')), 300);
begin
  select * into s from cinema_showings x where x.id = p_showing and x.status = 'scheduled' and x.chat_enabled
    and exists (select 1 from festivals f where f.id = x.festival_id and f.status = 'published');
  if not found then return 'closed'; end if;
  if length(bd) < 1 then return 'empty'; end if;
  if nm = '' then nm := 'Guest'; end if;
  if not exists (select 1 from cinema_tickets t where t.showing_id = s.id and t.viewer_key = vkey) then return 'not_watching'; end if;
  if exists (select 1 from cinema_chat m where m.showing_id = s.id and m.viewer_key = vkey and m.created_at > now() - interval '2 seconds') then
    return 'slow_down';
  end if;
  insert into cinema_chat (showing_id, festival_id, viewer_key, name, body, kind)
  values (s.id, s.festival_id, vkey, nm, bd, case when p_kind = 'question' then 'question' else 'chat' end);
  return 'ok';
end $$;
grant execute on function cinema_post_chat(uuid, text, text, text, text) to anon, authenticated;
