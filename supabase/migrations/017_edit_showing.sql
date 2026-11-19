-- Festaview Cinemas: festivals can edit a showing they booked. Run AFTER 016. Safe to run more than once.
-- Details (title, description, poster, rating, sponsor, sponsor message) can change any time before the showing ends.
-- Time, doors-open minutes, Q&A length, screen, seats and price are locked once the doors have opened, seats cannot drop
-- below the seats already taken, and the price cannot change after a ticket was bought. A time change on a festival
-- booking goes back to Festaview for approval when approvals are required. The screen-overlap rule still applies.

create or replace function update_showing(
  p_id uuid, p_title text, p_description text, p_poster text, p_rating text, p_starts_at timestamptz, p_lobby int, p_qa int,
  p_seats int, p_price_cents int, p_preroll text, p_sponsor text, p_screen uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s cinema_showings%rowtype;
  st cinema_settings%rowtype;
  fest festivals%rowtype;
  is_owner boolean := is_platform_admin();
  ttl text := left(trim(coalesce(p_title, '')), 160);
  price int := coalesce(p_price_cents, 0);
  doors_open boolean;
  timing_changed boolean;
  taken int;
  newstatus text;
begin
  select * into s from cinema_showings where id = p_id;
  if not found then raise exception 'Showing not found.'; end if;
  if not (is_festival_admin(s.festival_id) or is_owner) then raise exception 'You do not manage this showing.'; end if;
  if s.status = 'cancelled' then raise exception 'A cancelled showing cannot be edited.'; end if;
  if now() > s.starts_at + make_interval(mins => s.runtime_min + s.qa_minutes) then raise exception 'This showing has ended.'; end if;
  select * into st from cinema_settings where id = 1;
  select * into fest from festivals where id = s.festival_id;
  if ttl = '' then raise exception 'Give the showing a title.'; end if;
  if p_lobby is null or p_lobby < 0 or p_lobby > 30 then raise exception 'Lobby time must be between 0 and 30 minutes.'; end if;
  if p_qa is null or p_qa < 0 or p_qa > 180 then raise exception 'Q&A time must be between 0 and 180 minutes.'; end if;
  if p_seats is not null and (p_seats < 1 or p_seats > 1000000) then raise exception 'Seats must be 1 or more.'; end if;
  if price <> 0 and (price < 50 or price > 100000) then raise exception 'A ticket price must be between $0.50 and $1,000, or free.'; end if;
  if p_starts_at is null then raise exception 'Choose a start time.'; end if;
  if not exists (select 1 from cinema_screens where id = p_screen and active) then raise exception 'Choose a screen.'; end if;

  doors_open := now() >= s.starts_at - make_interval(mins => s.lobby_minutes);
  timing_changed := p_starts_at is distinct from s.starts_at or p_lobby is distinct from s.lobby_minutes or p_qa is distinct from s.qa_minutes or p_screen is distinct from s.screen_id;
  if doors_open and (timing_changed or price <> s.price_cents) then
    raise exception 'The doors have opened, so the time, screen, Q&A length and price are locked. You can still edit the title, description, poster and sponsor.';
  end if;
  if timing_changed and p_starts_at is distinct from s.starts_at then
    if is_owner then
      if p_starts_at < now() then raise exception 'That start time is in the past.'; end if;
    elsif p_starts_at < now() + make_interval(hours => st.min_notice_hours) then
      raise exception 'Showings must be scheduled at least % hours ahead.', st.min_notice_hours;
    end if;
  end if;
  select count(*) into taken from cinema_tickets where showing_id = s.id;
  if p_seats is not null and p_seats < taken then raise exception '% seats are already taken, so seats cannot go below that.', taken; end if;
  if price <> s.price_cents then
    if exists (select 1 from cinema_tickets where showing_id = s.id and code is not null) then raise exception 'Tickets were already bought at the old price, so the price cannot change.'; end if;
    if price > 0 and not coalesce(fest.payments_enabled, false) then raise exception 'Card payments are not turned on for your festival yet, so tickets must be free.'; end if;
  end if;

  newstatus := s.status;
  if p_starts_at is distinct from s.starts_at and not is_owner and st.require_approval then newstatus := 'pending'; end if;

  update cinema_showings set
    title = ttl, description = nullif(trim(coalesce(p_description, '')), ''), poster_url = nullif(trim(coalesce(p_poster, '')), ''),
    rating = nullif(trim(coalesce(p_rating, '')), ''), starts_at = p_starts_at, lobby_minutes = p_lobby, qa_minutes = p_qa, seats = p_seats,
    price_cents = price, access = case when price > 0 then 'ticketed' else 'free' end,
    preroll_url = nullif(trim(coalesce(p_preroll, '')), ''), sponsor_name = nullif(trim(coalesce(p_sponsor, '')), ''),
    screen_id = p_screen, status = newstatus
  where id = p_id;
  return jsonb_build_object('id', p_id, 'status', newstatus);
end $$;
revoke execute on function update_showing(uuid, text, text, text, text, timestamptz, int, int, int, int, text, text, uuid) from public, anon;
grant execute on function update_showing(uuid, text, text, text, text, timestamptz, int, int, int, int, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------- business ads, not just trailers
-- A festival can also run business ads in its own pre-show: a local sponsor or business the festival sells a spot to.
-- Festival-sold spots belong to the festival (kind 'sponsor'); network advertiser spots stay kind 'ad'; trailers stay 'trailer'.
alter table cinema_ads add column if not exists sponsor_name text;
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'cinema_ads'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%' loop
    execute format('alter table cinema_ads drop constraint %I', c.conname);
  end loop;
end $$;
alter table cinema_ads add constraint cinema_ads_kind_check check (kind in ('ad', 'trailer', 'sponsor'));
alter table cinema_ads add constraint cinema_ads_owner_check check (
  (kind = 'ad' and advertiser_id is not null and festival_id is null)
  or (kind in ('trailer', 'sponsor') and festival_id is not null and advertiser_id is null));

-- Save a trailer or a business ad for a festival.
create or replace function save_cinema_spot(p_festival uuid, p_id uuid, p_kind text, p_title text, p_url text, p_dur int, p_click text, p_sponsor text, p_active boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare aid uuid := p_id;
begin
  if not (is_festival_admin(p_festival) or is_platform_admin()) then raise exception 'You do not manage this festival.'; end if;
  if p_kind not in ('trailer', 'sponsor') then raise exception 'Choose trailer or business ad.'; end if;
  if length(trim(coalesce(p_title, ''))) < 1 then raise exception 'Give it a name.'; end if;
  if p_kind = 'sponsor' and length(trim(coalesce(p_sponsor, ''))) < 1 then raise exception 'Enter the business name.'; end if;
  if left(trim(coalesce(p_url, '')), 600) !~* '^https?://' then raise exception 'The video link must start with http:// or https://'; end if;
  if p_dur is null or p_dur < 3 or p_dur > 600 then raise exception 'Enter the length in seconds (3 to 600).'; end if;
  if coalesce(trim(p_click), '') <> '' and left(trim(p_click), 600) !~* '^https?://' then raise exception 'The link must start with http:// or https://'; end if;
  if aid is null then
    if (select count(*) from cinema_ads where festival_id = p_festival and kind in ('trailer', 'sponsor') and active) >= 40 then raise exception 'You can keep up to 40 active trailers and ads.'; end if;
    insert into cinema_ads (kind, festival_id, title, video_url, duration_sec, click_url, sponsor_name, active)
    values (p_kind, p_festival, left(trim(p_title), 160), left(trim(p_url), 600), p_dur, nullif(left(trim(coalesce(p_click, '')), 600), ''),
            case when p_kind = 'sponsor' then left(trim(p_sponsor), 120) else null end, coalesce(p_active, true))
    returning id into aid;
  else
    update cinema_ads set kind = p_kind, title = left(trim(p_title), 160), video_url = left(trim(p_url), 600), duration_sec = p_dur,
      click_url = nullif(left(trim(coalesce(p_click, '')), 600), ''), sponsor_name = case when p_kind = 'sponsor' then left(trim(p_sponsor), 120) else null end, active = coalesce(p_active, true)
      where id = aid and kind in ('trailer', 'sponsor') and festival_id = p_festival;
    if not found then raise exception 'Not found.'; end if;
  end if;
  return aid;
end $$;
revoke execute on function save_cinema_spot(uuid, uuid, text, text, text, int, text, text, boolean) from public, anon;
grant execute on function save_cinema_spot(uuid, uuid, text, text, text, int, text, text, boolean) to authenticated;

-- A showing can pick up to 6 of the festival's own trailers and business ads, in order.
create or replace function set_showing_trailers(p_showing uuid, p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare s cinema_showings%rowtype;
begin
  select * into s from cinema_showings where id = p_showing;
  if not found then raise exception 'Showing not found.'; end if;
  if not (is_festival_admin(s.festival_id) or is_platform_admin()) then raise exception 'You do not manage this showing.'; end if;
  if s.preshow_plan is not null then raise exception 'The doors have already opened, so the pre-show is locked in.'; end if;
  if coalesce(array_length(p_ids, 1), 0) > 6 then raise exception 'Choose up to 6 trailers or ads.'; end if;
  if coalesce(array_length(p_ids, 1), 0) <> (select count(distinct x) from unnest(coalesce(p_ids, '{}')) x) then raise exception 'Each one can only be chosen once.'; end if;
  if (select count(*) from cinema_ads a where a.id = any (coalesce(p_ids, '{}')) and a.festival_id = s.festival_id and a.kind in ('trailer', 'sponsor') and a.active) <> coalesce(array_length(p_ids, 1), 0) then
    raise exception 'Choose from your own trailers and ads.';
  end if;
  update cinema_showings set trailer_ids = coalesce(p_ids, '{}') where id = p_showing;
end $$;

-- The reel: festival-chosen items are placed first (they matter most), network advertiser spots fill the rest.
-- Plays in this order: network ads, the festival's business ads, then trailers last (coming attractions).
create or replace function cinema_build_preshow(p_showing uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s cinema_showings%rowtype;
  win int;
  used int := 0;
  r record;
  trailers jsonb := '[]'::jsonb;
  biz jsonb := '[]'::jsonb;
  ads jsonb := '[]'::jsonb;
  on_flag boolean;
  item jsonb;
begin
  select * into s from cinema_showings where id = p_showing;
  win := greatest(0, s.lobby_minutes * 60 - 30);
  select coalesce(ads_enabled, true) into on_flag from cinema_settings where id = 1;
  for r in
    select a.*, t.ord from unnest(s.trailer_ids) with ordinality as t(tid, ord)
      join cinema_ads a on a.id = t.tid and a.kind in ('trailer', 'sponsor') and a.active and a.festival_id = s.festival_id
      order by t.ord
  loop
    if used + r.duration_sec <= win then
      used := used + r.duration_sec;
      item := jsonb_build_object('id', r.id, 'kind', r.kind, 'title', r.title, 'url', r.video_url, 'dur', r.duration_sec, 'click_url', r.click_url, 'sponsor', r.sponsor_name);
      if r.kind = 'trailer' then trailers := trailers || jsonb_build_array(item); else biz := biz || jsonb_build_array(item); end if;
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
  return ads || biz || trailers;
end $$;
revoke execute on function cinema_build_preshow(uuid) from public, anon, authenticated;

-- The festival's own report names its business ads and trailers.
create or replace function cinema_festival_ad_report(p_festival uuid, p_from date, p_to date)
returns table (title text, kind text, sponsor text, starts int, completes int, clicks int)
language plpgsql security definer set search_path = public as $$
begin
  if not (is_festival_admin(p_festival) or is_platform_admin()) then raise exception 'You do not manage this festival.'; end if;
  return query
    select a.title, a.kind, coalesce(v.name, a.sponsor_name, 'Your trailer'),
           (count(*) filter (where e.event = 'start'))::int, (count(*) filter (where e.event = 'complete'))::int, (count(*) filter (where e.event = 'click'))::int
      from cinema_ad_events e
      join cinema_ads a on a.id = e.ad_id
      left join cinema_advertisers v on v.id = a.advertiser_id
      where e.festival_id = p_festival and e.created_at >= p_from::timestamptz and e.created_at < (p_to + 1)::timestamptz
      group by a.id, v.name order by 4 desc;
end $$;
revoke execute on function cinema_festival_ad_report(uuid, date, date) from public, anon;
grant execute on function cinema_festival_ad_report(uuid, date, date) to authenticated;
