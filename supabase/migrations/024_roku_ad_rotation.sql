-- Roku house ad rotation: when Festaview's own spots fill a slot, each viewer is given the spot they saw LEAST recently, so the spots take
-- turns and the same spot is not played twice in a row (as long as two or more spots are active). Viewers are told apart by a one-way hash
-- of their Roku ad id (never the id itself), which the website's ad function computes. Safe to run more than once. Run AFTER 023.

alter table roku_ad_serves add column if not exists device_hash text;
create index if not exists roku_ad_serves_device_idx on roku_ad_serves(device_hash, spot_id, created_at desc);

-- The log call now also records which viewer (hashed) the ad went to. The old five-argument version is replaced.
drop function if exists roku_log_serve(uuid, text, text, text, uuid);
create or replace function roku_log_serve(p_title uuid, p_title_name text, p_source text, p_label text, p_spot uuid, p_device text default null) returns void
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
  insert into roku_ad_serves (festival_id, title_id, title, source, ad_label, spot_id, rate_cents, device_hash)
  values (fid, p_title, left(coalesce(p_title_name, ''), 200), p_source, left(coalesce(p_label, ''), 160), p_spot, rate, left(p_device, 64));
end $$;
grant execute on function roku_log_serve(uuid, text, text, text, uuid, text) to anon, authenticated;

-- Picks the next house spot for one viewer: the active spot they were shown longest ago (never shown counts as longest ago).
-- With no viewer id the pick is random.
create or replace function roku_pick_spot(p_device text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', s.id, 'title', s.title, 'video_url', s.video_url, 'click_url', s.click_url, 'duration_seconds', s.duration_seconds)
  from roku_fallback_spots s
  where s.active
  order by (select max(x.created_at) from roku_ad_serves x where p_device is not null and x.device_hash = p_device and x.spot_id = s.id) asc nulls first,
           random()
  limit 1
$$;
grant execute on function roku_pick_spot(text) to anon, authenticated;
