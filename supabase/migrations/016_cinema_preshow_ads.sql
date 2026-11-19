-- Festaview Cinemas pre-show: our own ad server and trailer reel that plays in the theater before the film, like a real
-- cinema. When the doors open, everyone sees the same reel at the same moment (ads, then coming-attraction trailers),
-- then a "silence your phone" reminder, then the feature. Every ad play, completed view and click is counted for the
-- advertiser. Run AFTER 015. Safe to run more than once. RLS on every table; writes go through SECURITY DEFINER functions.

-- ---------------------------------------------------------------- tables
create table if not exists cinema_advertisers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  contact_name text,
  contact_email text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- kind 'ad' = a paid advertiser spot run by the network owner for every festival.
-- kind 'trailer' = a festival's own coming-attraction, used only on that festival's showings.
create table if not exists cinema_ads (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'ad' check (kind in ('ad', 'trailer')),
  advertiser_id uuid references cinema_advertisers(id) on delete cascade,
  festival_id uuid references festivals(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 160),
  video_url text not null,
  duration_sec int not null check (duration_sec between 3 and 600),
  click_url text,
  cpm_cents int not null default 0 check (cpm_cents between 0 and 100000),
  starts_on date,
  ends_on date,
  max_impressions int check (max_impressions is null or max_impressions > 0),
  priority int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((kind = 'ad' and advertiser_id is not null and festival_id is null) or (kind = 'trailer' and festival_id is not null and advertiser_id is null))
);
create index if not exists cinema_ads_festival_idx on cinema_ads(festival_id);
create index if not exists cinema_ads_advertiser_idx on cinema_ads(advertiser_id);

-- One row per viewer per ad per showing per event (start, complete, click), so counts are real, unique viewers.
create table if not exists cinema_ad_events (
  id bigint generated always as identity primary key,
  ad_id uuid not null references cinema_ads(id) on delete cascade,
  showing_id uuid not null references cinema_showings(id) on delete cascade,
  festival_id uuid not null references festivals(id) on delete cascade,
  viewer_key text not null,
  event text not null check (event in ('start', 'complete', 'click')),
  created_at timestamptz not null default now(),
  unique (ad_id, showing_id, viewer_key, event)
);
create index if not exists cinema_ad_events_ad_idx on cinema_ad_events(ad_id, event, created_at);
create index if not exists cinema_ad_events_festival_idx on cinema_ad_events(festival_id, created_at);

alter table cinema_settings add column if not exists ads_enabled boolean not null default true;
alter table cinema_showings add column if not exists trailer_ids uuid[] not null default '{}';
-- The reel is chosen once, when the doors first open, so every viewer sees the identical reel.
alter table cinema_showings add column if not exists preshow_plan jsonb;

-- ---------------------------------------------------------------- row level security (reads only; writes are functions)
alter table cinema_advertisers enable row level security;
alter table cinema_ads enable row level security;
alter table cinema_ad_events enable row level security;
revoke all on cinema_advertisers, cinema_ads, cinema_ad_events from anon;
revoke insert, update, delete on cinema_advertisers, cinema_ads, cinema_ad_events from authenticated;
grant select on cinema_advertisers, cinema_ads, cinema_ad_events to authenticated;

drop policy if exists "owner reads advertisers" on cinema_advertisers;
create policy "owner reads advertisers" on cinema_advertisers for select using (is_platform_admin());
drop policy if exists "owner and festival read ads" on cinema_ads;
create policy "owner and festival read ads" on cinema_ads for select using (is_platform_admin() or (festival_id is not null and is_festival_admin(festival_id)));
drop policy if exists "owner and festival read ad events" on cinema_ad_events;
create policy "owner and festival read ad events" on cinema_ad_events for select using (is_platform_admin() or is_festival_admin(festival_id));

-- ---------------------------------------------------------------- network owner: advertisers and ads
create or replace function save_cinema_advertiser(p_id uuid, p_name text, p_contact_name text, p_contact_email text, p_notes text, p_active boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare aid uuid := p_id;
begin
  if not is_platform_admin() then raise exception 'Only the network owner can manage advertisers.'; end if;
  if length(trim(coalesce(p_name, ''))) < 1 then raise exception 'Enter the advertiser name.'; end if;
  if aid is null then
    insert into cinema_advertisers (name, contact_name, contact_email, notes, active)
    values (left(trim(p_name), 120), nullif(trim(coalesce(p_contact_name, '')), ''), nullif(trim(coalesce(p_contact_email, '')), ''), nullif(trim(coalesce(p_notes, '')), ''), coalesce(p_active, true))
    returning id into aid;
  else
    update cinema_advertisers set name = left(trim(p_name), 120), contact_name = nullif(trim(coalesce(p_contact_name, '')), ''), contact_email = nullif(trim(coalesce(p_contact_email, '')), ''),
      notes = nullif(trim(coalesce(p_notes, '')), ''), active = coalesce(p_active, true) where id = aid;
    if not found then raise exception 'Advertiser not found.'; end if;
  end if;
  return aid;
end $$;
revoke execute on function save_cinema_advertiser(uuid, text, text, text, text, boolean) from public, anon;
grant execute on function save_cinema_advertiser(uuid, text, text, text, text, boolean) to authenticated;

create or replace function save_cinema_ad(
  p_id uuid, p_advertiser uuid, p_title text, p_url text, p_dur int, p_click text, p_cpm_cents int,
  p_starts_on date, p_ends_on date, p_max_impressions int, p_priority int, p_active boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare aid uuid := p_id;
begin
  if not is_platform_admin() then raise exception 'Only the network owner can manage ads.'; end if;
  if not exists (select 1 from cinema_advertisers where id = p_advertiser) then raise exception 'Choose an advertiser.'; end if;
  if length(trim(coalesce(p_title, ''))) < 1 then raise exception 'Give the ad a name.'; end if;
  if left(trim(coalesce(p_url, '')), 600) !~* '^https?://' then raise exception 'The video link must start with http:// or https://'; end if;
  if p_dur is null or p_dur < 3 or p_dur > 600 then raise exception 'Enter the ad length in seconds (3 to 600).'; end if;
  if coalesce(trim(p_click), '') <> '' and left(trim(p_click), 600) !~* '^https?://' then raise exception 'The click-through link must start with http:// or https://'; end if;
  if p_starts_on is not null and p_ends_on is not null and p_ends_on < p_starts_on then raise exception 'The end date must be after the start date.'; end if;
  if aid is null then
    insert into cinema_ads (kind, advertiser_id, title, video_url, duration_sec, click_url, cpm_cents, starts_on, ends_on, max_impressions, priority, active)
    values ('ad', p_advertiser, left(trim(p_title), 160), left(trim(p_url), 600), p_dur, nullif(left(trim(coalesce(p_click, '')), 600), ''), greatest(0, coalesce(p_cpm_cents, 0)),
            p_starts_on, p_ends_on, p_max_impressions, coalesce(p_priority, 0), coalesce(p_active, true))
    returning id into aid;
  else
    update cinema_ads set advertiser_id = p_advertiser, title = left(trim(p_title), 160), video_url = left(trim(p_url), 600), duration_sec = p_dur,
      click_url = nullif(left(trim(coalesce(p_click, '')), 600), ''), cpm_cents = greatest(0, coalesce(p_cpm_cents, 0)), starts_on = p_starts_on, ends_on = p_ends_on,
      max_impressions = p_max_impressions, priority = coalesce(p_priority, 0), active = coalesce(p_active, true)
      where id = aid and kind = 'ad';
    if not found then raise exception 'Ad not found.'; end if;
  end if;
  return aid;
end $$;
revoke execute on function save_cinema_ad(uuid, uuid, text, text, int, text, int, date, date, int, int, boolean) from public, anon;
grant execute on function save_cinema_ad(uuid, uuid, text, text, int, text, int, date, date, int, int, boolean) to authenticated;

-- An ad or trailer that already has views is switched off instead of deleted, so its numbers stay in the reports.
create or replace function delete_cinema_ad(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare a cinema_ads%rowtype;
begin
  select * into a from cinema_ads where id = p_id;
  if not found then raise exception 'Not found.'; end if;
  if not (is_platform_admin() or (a.festival_id is not null and is_festival_admin(a.festival_id))) then raise exception 'You cannot change this.'; end if;
  if exists (select 1 from cinema_ad_events where ad_id = p_id) then
    update cinema_ads set active = false where id = p_id;
    return 'hidden';
  end if;
  delete from cinema_ads where id = p_id;
  return 'deleted';
end $$;
revoke execute on function delete_cinema_ad(uuid) from public, anon;
grant execute on function delete_cinema_ad(uuid) to authenticated;

create or replace function set_cinema_ads_enabled(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Only the network owner can change this.'; end if;
  update cinema_settings set ads_enabled = coalesce(p_on, true) where id = 1;
end $$;
revoke execute on function set_cinema_ads_enabled(boolean) from public, anon;
grant execute on function set_cinema_ads_enabled(boolean) to authenticated;

-- ---------------------------------------------------------------- festivals: their own trailers
create or replace function save_cinema_trailer(p_festival uuid, p_id uuid, p_title text, p_url text, p_dur int, p_click text, p_active boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare aid uuid := p_id;
begin
  if not (is_festival_admin(p_festival) or is_platform_admin()) then raise exception 'You do not manage this festival.'; end if;
  if length(trim(coalesce(p_title, ''))) < 1 then raise exception 'Give the trailer a name.'; end if;
  if left(trim(coalesce(p_url, '')), 600) !~* '^https?://' then raise exception 'The video link must start with http:// or https://'; end if;
  if p_dur is null or p_dur < 3 or p_dur > 600 then raise exception 'Enter the trailer length in seconds (3 to 600).'; end if;
  if coalesce(trim(p_click), '') <> '' and left(trim(p_click), 600) !~* '^https?://' then raise exception 'The link must start with http:// or https://'; end if;
  if aid is null then
    if (select count(*) from cinema_ads where festival_id = p_festival and kind = 'trailer' and active) >= 30 then raise exception 'You can keep up to 30 active trailers.'; end if;
    insert into cinema_ads (kind, festival_id, title, video_url, duration_sec, click_url, active)
    values ('trailer', p_festival, left(trim(p_title), 160), left(trim(p_url), 600), p_dur, nullif(left(trim(coalesce(p_click, '')), 600), ''), coalesce(p_active, true))
    returning id into aid;
  else
    update cinema_ads set title = left(trim(p_title), 160), video_url = left(trim(p_url), 600), duration_sec = p_dur, click_url = nullif(left(trim(coalesce(p_click, '')), 600), ''), active = coalesce(p_active, true)
      where id = aid and kind = 'trailer' and festival_id = p_festival;
    if not found then raise exception 'Trailer not found.'; end if;
  end if;
  return aid;
end $$;
revoke execute on function save_cinema_trailer(uuid, uuid, text, text, int, text, boolean) from public, anon;
grant execute on function save_cinema_trailer(uuid, uuid, text, text, int, text, boolean) to authenticated;

-- Chooses which of the festival's trailers play before a showing, in order. Only possible before the doors first open.
create or replace function set_showing_trailers(p_showing uuid, p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare s cinema_showings%rowtype;
begin
  select * into s from cinema_showings where id = p_showing;
  if not found then raise exception 'Showing not found.'; end if;
  if not (is_festival_admin(s.festival_id) or is_platform_admin()) then raise exception 'You do not manage this showing.'; end if;
  if s.preshow_plan is not null then raise exception 'The doors have already opened, so the pre-show is locked in.'; end if;
  if coalesce(array_length(p_ids, 1), 0) > 6 then raise exception 'Choose up to 6 trailers.'; end if;
  if coalesce(array_length(p_ids, 1), 0) <> (select count(distinct x) from unnest(coalesce(p_ids, '{}')) x) then raise exception 'Each trailer can only be chosen once.'; end if;
  if (select count(*) from cinema_ads a where a.id = any (coalesce(p_ids, '{}')) and a.festival_id = s.festival_id and a.kind = 'trailer' and a.active) <> coalesce(array_length(p_ids, 1), 0) then
    raise exception 'Choose trailers from your own trailer list.';
  end if;
  update cinema_showings set trailer_ids = coalesce(p_ids, '{}') where id = p_showing;
end $$;
revoke execute on function set_showing_trailers(uuid, uuid[]) from public, anon;
grant execute on function set_showing_trailers(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------- building the reel (only called by the join function)
-- Leaves 30 seconds before showtime for the phone reminder and the feature card. The festival's own trailers are placed
-- first (they matter most); advertiser spots fill the rest. The reel plays ads first, then the trailers last, like a theater.
create or replace function cinema_build_preshow(p_showing uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s cinema_showings%rowtype;
  win int;
  used int := 0;
  r record;
  trailers jsonb := '[]'::jsonb;
  ads jsonb := '[]'::jsonb;
  on_flag boolean;
begin
  select * into s from cinema_showings where id = p_showing;
  win := greatest(0, s.lobby_minutes * 60 - 30);
  select coalesce(ads_enabled, true) into on_flag from cinema_settings where id = 1;
  for r in
    select a.*, t.ord from unnest(s.trailer_ids) with ordinality as t(tid, ord)
      join cinema_ads a on a.id = t.tid and a.kind = 'trailer' and a.active and a.festival_id = s.festival_id
      order by t.ord
  loop
    if used + r.duration_sec <= win then
      used := used + r.duration_sec;
      trailers := trailers || jsonb_build_array(jsonb_build_object('id', r.id, 'kind', 'trailer', 'title', r.title, 'url', r.video_url, 'dur', r.duration_sec, 'click_url', r.click_url));
    end if;
  end loop;
  if coalesce(on_flag, true) then
    for r in
      select a.*, v.name as advertiser_name from cinema_ads a
        join cinema_advertisers v on v.id = a.advertiser_id and v.active
        where a.kind = 'ad' and a.active
          and (a.starts_on is null or a.starts_on <= current_date) and (a.ends_on is null or a.ends_on >= current_date)
          and (a.max_impressions is null or (select count(*) from cinema_ad_events e where e.ad_id = a.id and e.event = 'start') < a.max_impressions)
        order by a.priority desc, md5(a.id::text || p_showing::text)
    loop
      if used + r.duration_sec <= win then
        used := used + r.duration_sec;
        ads := ads || jsonb_build_array(jsonb_build_object('id', r.id, 'kind', 'ad', 'title', r.title, 'url', r.video_url, 'dur', r.duration_sec, 'click_url', r.click_url, 'sponsor', r.advertiser_name));
      end if;
    end loop;
  end if;
  return ads || trailers;
end $$;
revoke execute on function cinema_build_preshow(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- walking in now also returns the reel
create or replace function cinema_join(p_showing uuid, p_device text, p_code text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s cinema_showings%rowtype;
  vkey text;
  cnt int;
  lobby_open timestamptz;
  end_at timestamptz;
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  films_json jsonb;
  plan jsonb;
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

  if s.price_cents > 0 then
    if coalesce(p_code, '') = '' or not exists (select 1 from cinema_tickets t where t.showing_id = s.id and t.code = upper(trim(p_code))) then
      return jsonb_build_object('status', 'ticket_required');
    end if;
  else
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
  end if;

  -- The reel is built once, the first time anyone walks in after the doors open, and then never changes.
  plan := s.preshow_plan;
  if plan is null then
    perform pg_advisory_xact_lock(hashtext('preshow' || s.id::text));
    select preshow_plan into plan from cinema_showings where id = s.id;
    if plan is null then
      plan := cinema_build_preshow(s.id);
      update cinema_showings set preshow_plan = plan where id = s.id;
    end if;
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
    'chat_enabled', s.chat_enabled, 'preshow', plan);
end $$;
grant execute on function cinema_join(uuid, text, text) to anon, authenticated;

-- ---------------------------------------------------------------- counting views (analytics)
-- A view counts only if the ad is in this showing's reel and the viewer holds a seat. Each viewer counts once per event.
create or replace function cinema_ad_event(p_ad uuid, p_showing uuid, p_device text, p_event text, p_code text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  s cinema_showings%rowtype;
  vkey text := case when coalesce(p_code, '') <> '' then 'code:' || upper(trim(p_code)) else 'device:' || left(coalesce(p_device, ''), 80) end;
begin
  if p_event not in ('start', 'complete', 'click') then return 'bad_event'; end if;
  select * into s from cinema_showings where id = p_showing and preshow_plan is not null;
  if not found then return 'no_showing'; end if;
  if not exists (select 1 from jsonb_array_elements(s.preshow_plan) x where x->>'id' = p_ad::text) then return 'not_in_reel'; end if;
  if not exists (select 1 from cinema_tickets t where t.showing_id = s.id and t.viewer_key = vkey) then return 'no_seat'; end if;
  insert into cinema_ad_events (ad_id, showing_id, festival_id, viewer_key, event)
  values (p_ad, s.id, s.festival_id, vkey, p_event) on conflict (ad_id, showing_id, viewer_key, event) do nothing;
  return 'ok';
end $$;
grant execute on function cinema_ad_event(uuid, uuid, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------- reports
-- Network owner: every ad with its numbers for a date range. Amount due = completed views x the ad's price per 1,000.
create or replace function cinema_ad_report(p_from date, p_to date)
returns table (ad_id uuid, advertiser_id uuid, advertiser_name text, title text, kind text, cpm_cents int, showings int, viewers int, starts int, completes int, clicks int)
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Only the network owner can see ad reports.'; end if;
  return query
    select a.id, a.advertiser_id, coalesce(v.name, 'Festival trailer'), a.title, a.kind, a.cpm_cents,
           count(distinct e.showing_id)::int,
           count(distinct e.viewer_key)::int,
           (count(*) filter (where e.event = 'start'))::int,
           (count(*) filter (where e.event = 'complete'))::int,
           (count(*) filter (where e.event = 'click'))::int
      from cinema_ads a
      left join cinema_advertisers v on v.id = a.advertiser_id
      left join cinema_ad_events e on e.ad_id = a.id and e.created_at >= p_from::timestamptz and e.created_at < (p_to + 1)::timestamptz
      group by a.id, v.name
      order by a.created_at desc;
end $$;
revoke execute on function cinema_ad_report(date, date) from public, anon;
grant execute on function cinema_ad_report(date, date) to authenticated;

create or replace function cinema_ad_daily(p_ad uuid, p_from date, p_to date)
returns table (day date, viewers int, starts int, completes int, clicks int)
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Only the network owner can see ad reports.'; end if;
  return query
    select (e.created_at at time zone 'UTC')::date, count(distinct e.viewer_key)::int,
           (count(*) filter (where e.event = 'start'))::int, (count(*) filter (where e.event = 'complete'))::int, (count(*) filter (where e.event = 'click'))::int
      from cinema_ad_events e
      where e.ad_id = p_ad and e.created_at >= p_from::timestamptz and e.created_at < (p_to + 1)::timestamptz
      group by 1 order by 1;
end $$;
revoke execute on function cinema_ad_daily(uuid, date, date) from public, anon;
grant execute on function cinema_ad_daily(uuid, date, date) to authenticated;

-- A festival sees how its own trailers and the network's ads performed in front of its showings.
create or replace function cinema_festival_ad_report(p_festival uuid, p_from date, p_to date)
returns table (title text, kind text, sponsor text, starts int, completes int, clicks int)
language plpgsql security definer set search_path = public as $$
begin
  if not (is_festival_admin(p_festival) or is_platform_admin()) then raise exception 'You do not manage this festival.'; end if;
  return query
    select a.title, a.kind, coalesce(v.name, 'Your trailer'),
           (count(*) filter (where e.event = 'start'))::int, (count(*) filter (where e.event = 'complete'))::int, (count(*) filter (where e.event = 'click'))::int
      from cinema_ad_events e
      join cinema_ads a on a.id = e.ad_id
      left join cinema_advertisers v on v.id = a.advertiser_id
      where e.festival_id = p_festival and e.created_at >= p_from::timestamptz and e.created_at < (p_to + 1)::timestamptz
      group by a.id, v.name order by 4 desc;
end $$;
revoke execute on function cinema_festival_ad_report(uuid, date, date) from public, anon;
grant execute on function cinema_festival_ad_report(uuid, date, date) to authenticated;
