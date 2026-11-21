-- Roku ad log and rates: every ad the waterfall hands to a Roku is recorded with the title it ran on, whether it came from Adtelligent or from
-- Festaview's own spots, which ad it was, and the rate it paid at that moment. Rates are in cents per ad and are set by the network owner
-- (for now one cent each). The festival's share of the revenue is a percentage here too (80 by default).
-- Safe to run more than once. Run AFTER 022.

-- ---------------------------------------------------------------- rates (owner only; never readable by the public)
create table if not exists roku_ad_rates (
  id int primary key default 1 check (id = 1),
  adtelligent_rate_cents numeric not null default 1 check (adtelligent_rate_cents >= 0),
  house_rate_cents numeric not null default 1 check (house_rate_cents >= 0),
  festival_share_pct numeric not null default 80 check (festival_share_pct between 0 and 100),
  updated_at timestamptz not null default now()
);
insert into roku_ad_rates (id) values (1) on conflict (id) do nothing;
alter table roku_ad_rates enable row level security;
drop policy if exists "owner manages roku ad rates" on roku_ad_rates;
create policy "owner manages roku ad rates" on roku_ad_rates for all using (is_platform_admin()) with check (is_platform_admin());
grant select, insert, update on roku_ad_rates to authenticated;

-- A spot can have its own rate; empty means "use the house rate above".
alter table roku_fallback_spots add column if not exists rate_cents numeric;
alter table roku_fallback_spots drop constraint if exists roku_fallback_spots_rate_check;
alter table roku_fallback_spots add constraint roku_fallback_spots_rate_check check (rate_cents is null or rate_cents >= 0);

-- ---------------------------------------------------------------- the log: one row per ad handed to a Roku
create table if not exists roku_ad_serves (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  festival_id uuid references festivals(id) on delete set null,
  title_id uuid,
  title text,
  source text not null check (source in ('adtelligent', 'house')),
  ad_label text not null default '',
  spot_id uuid,
  rate_cents numeric not null default 0
);
create index if not exists roku_ad_serves_time_idx on roku_ad_serves(created_at);
create index if not exists roku_ad_serves_festival_idx on roku_ad_serves(festival_id, created_at);
create index if not exists roku_ad_serves_title_idx on roku_ad_serves(title_id, created_at);
alter table roku_ad_serves enable row level security;
drop policy if exists "festival admins read their ad log" on roku_ad_serves;
create policy "festival admins read their ad log" on roku_ad_serves for select
  using (is_platform_admin() or (festival_id is not null and is_festival_admin(festival_id)));
grant select on roku_ad_serves to authenticated;

-- Called by the website's ad function each time it hands an ad to a Roku. The festival and the rate are worked out here.
create or replace function roku_log_serve(p_title uuid, p_title_name text, p_source text, p_label text, p_spot uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  fid uuid;
  r roku_ad_rates%rowtype;
  spot_rate numeric;
  rate numeric;
begin
  if p_source not in ('adtelligent', 'house') then return; end if;
  select * into r from roku_ad_rates where id = 1;
  if p_source = 'adtelligent' then
    rate := coalesce(r.adtelligent_rate_cents, 0);
  else
    select s.rate_cents into spot_rate from roku_fallback_spots s where s.id = p_spot;
    rate := coalesce(spot_rate, r.house_rate_cents, 0);
  end if;
  if p_title is not null then
    select festival_id into fid from films where id = p_title;
    if fid is null then select festival_id into fid from cinema_showings where id = p_title; end if;
    if fid is null then select festival_id into fid from live_feeds where id = p_title; end if;
  end if;
  insert into roku_ad_serves (festival_id, title_id, title, source, ad_label, spot_id, rate_cents)
  values (fid, p_title, left(coalesce(p_title_name, ''), 200), p_source, left(coalesce(p_label, ''), 160), p_spot, rate);
end $$;
grant execute on function roku_log_serve(uuid, text, text, text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------- the report: which ads played on which title, and what they earned
-- The network owner sees every festival (leave p_festival empty). A festival admin sees only their own festival.
create or replace function roku_ad_report(p_days int default 7, p_festival uuid default null)
returns table (festival_id uuid, festival_name text, title_id uuid, title text, source text, ad_label text, plays bigint, gross_cents numeric, festival_cents numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  share numeric;
  since timestamptz := now() - make_interval(days => greatest(coalesce(p_days, 7), 1));
begin
  if p_festival is null then
    if not is_platform_admin() then raise exception 'Only the network owner can see every festival.'; end if;
  elsif not (is_festival_admin(p_festival) or is_platform_admin()) then
    raise exception 'You do not manage this festival.';
  end if;
  select festival_share_pct into share from roku_ad_rates where id = 1;
  return query
  select s.festival_id, f.name, s.title_id, max(s.title), s.source, s.ad_label, count(*)::bigint,
         sum(s.rate_cents), round(sum(s.rate_cents) * coalesce(share, 80) / 100.0, 4)
  from roku_ad_serves s
  left join festivals f on f.id = s.festival_id
  where s.created_at >= since and (p_festival is null or s.festival_id = p_festival)
  group by s.festival_id, f.name, s.title_id, s.source, s.ad_label
  order by sum(s.rate_cents) desc, count(*) desc;
end $$;
revoke execute on function roku_ad_report(int, uuid) from public, anon;
grant execute on function roku_ad_report(int, uuid) to authenticated;
