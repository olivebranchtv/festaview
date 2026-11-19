-- Festaview-wide analytics for the network owner. All functions check is_platform_admin() themselves.

-- Where viewing happened (web player, automatic channel, later roku). Existing rows default to 'web'.
alter table view_events add column if not exists source text not null default 'web';

drop policy if exists "anon can log view events" on view_events;
create policy "anon can log view events" on view_events for insert
  with check (seconds_watched between 0 and 21600 and ad_impressions between 0 and 1000 and length(source) <= 20);

-- The owner can see every film (including drafts) for health checks and totals.
create policy "platform read films" on films for select using (is_platform_admin());

create or replace function network_totals(p_since timestamptz)
returns table (views bigint, seconds bigint, impressions bigint, viewers bigint)
language sql security definer stable set search_path = public as $$
  select count(*)::bigint,
         coalesce(sum(e.seconds_watched), 0)::bigint,
         coalesce(sum(e.ad_impressions), 0)::bigint,
         count(distinct e.device_id)::bigint
  from view_events e
  where e.created_at >= p_since and is_platform_admin()
$$;

create or replace function network_overview(p_since timestamptz)
returns table (festival_id uuid, views bigint, seconds bigint, impressions bigint, viewers bigint)
language sql security definer stable set search_path = public as $$
  select e.festival_id,
         count(*)::bigint,
         coalesce(sum(e.seconds_watched), 0)::bigint,
         coalesce(sum(e.ad_impressions), 0)::bigint,
         count(distinct e.device_id)::bigint
  from view_events e
  where e.created_at >= p_since and is_platform_admin()
  group by e.festival_id
$$;

create or replace function network_films(p_since timestamptz)
returns table (film_id uuid, festival_id uuid, views bigint, seconds bigint, impressions bigint)
language sql security definer stable set search_path = public as $$
  select e.film_id, e.festival_id,
         count(*)::bigint,
         coalesce(sum(e.seconds_watched), 0)::bigint,
         coalesce(sum(e.ad_impressions), 0)::bigint
  from view_events e
  where e.created_at >= p_since and e.film_id is not null and is_platform_admin()
  group by e.film_id, e.festival_id
  order by coalesce(sum(e.seconds_watched), 0) desc
  limit 50
$$;

create or replace function network_daily(p_since timestamptz)
returns table (day date, views bigint, seconds bigint, viewers bigint)
language sql security definer stable set search_path = public as $$
  select (e.created_at at time zone 'utc')::date,
         count(*)::bigint,
         coalesce(sum(e.seconds_watched), 0)::bigint,
         count(distinct e.device_id)::bigint
  from view_events e
  where e.created_at >= p_since and is_platform_admin()
  group by 1
  order by 1
$$;

create or replace function network_sources(p_since timestamptz)
returns table (source text, views bigint, seconds bigint)
language sql security definer stable set search_path = public as $$
  select e.source, count(*)::bigint, coalesce(sum(e.seconds_watched), 0)::bigint
  from view_events e
  where e.created_at >= p_since and is_platform_admin()
  group by e.source
$$;

revoke execute on function network_totals(timestamptz) from public, anon;
revoke execute on function network_overview(timestamptz) from public, anon;
revoke execute on function network_films(timestamptz) from public, anon;
revoke execute on function network_daily(timestamptz) from public, anon;
revoke execute on function network_sources(timestamptz) from public, anon;
grant execute on function network_totals(timestamptz) to authenticated;
grant execute on function network_overview(timestamptz) to authenticated;
grant execute on function network_films(timestamptz) to authenticated;
grant execute on function network_daily(timestamptz) to authenticated;
grant execute on function network_sources(timestamptz) to authenticated;
