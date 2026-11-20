-- Festaview Roku ad waterfall. Adtelligent is asked first on every ad slot; Festaview's own spots play only when Adtelligent has none.
-- Also records every ad impression against the festival whose content was playing, so the 80 percent festival share can be calculated.
-- Safe to run more than once. Run AFTER 020. Spots are managed by the network owner (Network console > Roku ads).

-- ---------------------------------------------------------------- our own spots (the fill for slots Adtelligent does not fill)
create table if not exists roku_fallback_spots (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  video_url text not null check (video_url ~* '^https://'),
  click_url text check (click_url is null or click_url ~* '^https://'),
  duration_seconds integer not null check (duration_seconds between 1 and 300),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table roku_fallback_spots enable row level security;
drop policy if exists "owner manages roku spots" on roku_fallback_spots;
create policy "owner manages roku spots" on roku_fallback_spots for all using (is_platform_admin()) with check (is_platform_admin());
grant select, insert, update, delete on roku_fallback_spots to authenticated;

-- What the waterfall function plays: the active spots, readable without logging in
create or replace function roku_spots() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'video_url', video_url, 'click_url', click_url, 'duration_seconds', duration_seconds) order by created_at), '[]'::jsonb)
  from roku_fallback_spots where active
$$;
grant execute on function roku_spots() to anon, authenticated;

-- ---------------------------------------------------------------- slot counts: asked, filled by Adtelligent, filled by each of our spots
create table if not exists roku_ad_counts (
  day date not null default ((now() at time zone 'America/New_York')::date),
  source text not null check (source in ('adtelligent', 'fallback')),
  spot text not null default '',
  event text not null check (event in ('request', 'filled')),
  n bigint not null default 0,
  primary key (day, source, spot, event)
);
alter table roku_ad_counts enable row level security;
drop policy if exists "owner reads roku counts" on roku_ad_counts;
create policy "owner reads roku counts" on roku_ad_counts for select using (is_platform_admin());
grant select on roku_ad_counts to authenticated;

create or replace function roku_bump_ad(p_source text, p_spot text, p_event text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_source not in ('adtelligent', 'fallback') then return; end if;
  if p_event not in ('request', 'filled') then return; end if;
  if coalesce(p_spot, '') !~ '^[A-Za-z0-9_.-]{0,80}$' then return; end if;
  insert into roku_ad_counts (source, spot, event, n) values (p_source, coalesce(p_spot, ''), p_event, 1)
  on conflict (day, source, spot, event) do update set n = roku_ad_counts.n + 1;
end $$;
grant execute on function roku_bump_ad(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------- ad impressions per festival (for the festival revenue share)
-- Only Adtelligent ads are reported by the TV (our own spots carry no tracking), so only paid ads count toward the share.
create table if not exists roku_ad_events (
  id bigint generated always as identity primary key,
  festival_id uuid not null references festivals(id) on delete cascade,
  title_id uuid not null,
  title text,
  phase text not null default 'preroll',
  kind text not null check (kind in ('impression', 'complete')),
  device_hash text,
  created_at timestamptz not null default now()
);
create index if not exists roku_ad_events_festival_idx on roku_ad_events(festival_id, created_at);
alter table roku_ad_events enable row level security;
drop policy if exists "festival admins read roku ad events" on roku_ad_events;
create policy "festival admins read roku ad events" on roku_ad_events for select using (is_festival_admin(festival_id) or is_platform_admin());
grant select on roku_ad_events to authenticated;

-- The TV reports the title that was playing (a film, a live channel or a theater showing). The festival is looked up here.
create or replace function roku_log_ad(p_title uuid, p_title_name text, p_phase text, p_kind text, p_device text) returns void
language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  if p_title is null or p_kind not in ('impression', 'complete') then return; end if;
  select festival_id into fid from films where id = p_title;
  if fid is null then select festival_id into fid from cinema_showings where id = p_title; end if;
  if fid is null then select festival_id into fid from live_feeds where id = p_title; end if;
  if fid is null then return; end if;
  insert into roku_ad_events (festival_id, title_id, title, phase, kind, device_hash)
  values (fid, p_title, left(coalesce(p_title_name, ''), 200), case when p_phase in ('preroll', 'midroll', 'lobby') then p_phase else 'preroll' end, p_kind, left(coalesce(p_device, ''), 80));
end $$;
grant execute on function roku_log_ad(uuid, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------- starter spots (Festaview's existing internal ads)
insert into roku_fallback_spots (title, video_url, click_url, duration_seconds)
select 'Rodeo Hard', 'https://vz-faf13d4f-4d7.b-cdn.net/ab6e2a27-a54f-4841-aabe-1149175e5a04/playlist.m3u8', 'https://rodeohard.com', 30
where not exists (select 1 from roku_fallback_spots where title = 'Rodeo Hard');
insert into roku_fallback_spots (title, video_url, click_url, duration_seconds)
select 'Rowdy Rowels', 'https://vz-faf13d4f-4d7.b-cdn.net/325fc132-849a-4ad6-8c5e-07caf12f03a5/playlist.m3u8', 'https://rowdyrowels.com', 20
where not exists (select 1 from roku_fallback_spots where title = 'Rowdy Rowels');
insert into roku_fallback_spots (title, video_url, click_url, duration_seconds)
select 'ByteMeHQ', 'https://vz-faf13d4f-4d7.b-cdn.net/42c0c523-0488-49d8-9a1e-861ee2eeb9e3/playlist.m3u8', 'https://bytemehq.com', 10
where not exists (select 1 from roku_fallback_spots where title = 'ByteMeHQ');
insert into roku_fallback_spots (title, video_url, click_url, duration_seconds)
select 'Quanio TV', 'https://vz-faf13d4f-4d7.b-cdn.net/c26f8452-a46f-4653-9c9d-01cd91065563/playlist.m3u8', 'https://quanio.tv/crowdfunding', 16
where not exists (select 1 from roku_fallback_spots where title = 'Quanio TV');
