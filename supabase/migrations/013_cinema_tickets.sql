-- Festaview Virtual Theater, phase 2: paid tickets. A ticket is bought by card (Stripe Checkout), becomes a ticket code,
-- and that code lets the buyer into the room. Free showings are unchanged. Run AFTER 012.

alter table cinema_showings add column if not exists price_cents int not null default 0;
alter table cinema_showings drop constraint if exists cinema_showings_price_check;
alter table cinema_showings add constraint cinema_showings_price_check check (price_cents = 0 or price_cents >= 50);

alter table cinema_tickets add column if not exists code text unique;
alter table cinema_tickets add column if not exists email text;
alter table cinema_tickets add column if not exists amount_cents int not null default 0;
alter table cinema_tickets add column if not exists fee_cents int not null default 0;
alter table cinema_tickets add column if not exists stripe_session_id text unique;

-- Public marquee now shows the ticket price (new columns are added at the end).
create or replace view cinema_board as
select s.id, s.screen_id, c.number as screen_number, c.name as screen_name,
       s.festival_id, f.slug as festival_slug, f.name as festival_name,
       s.kind, s.title, s.description, s.poster_url, s.rating, s.starts_at, s.lobby_minutes, s.runtime_min, s.qa_minutes,
       s.starts_at + make_interval(mins => s.runtime_min + s.qa_minutes) as ends_at,
       s.seats, (select count(*) from cinema_tickets t where t.showing_id = s.id)::int as taken,
       s.access, s.chat_enabled, s.price_cents
from cinema_showings s
join cinema_screens c on c.id = s.screen_id
join festivals f on f.id = s.festival_id
where s.status = 'scheduled' and f.status = 'published' and c.active
  and s.starts_at + make_interval(mins => s.runtime_min + s.qa_minutes) > now() - interval '30 minutes'
  and s.starts_at < now() + interval '30 days';
grant select on cinema_board to anon, authenticated;

-- ---------------------------------------------------------------- booking with a price
drop function if exists book_showing(uuid, uuid, text, text, text, text, uuid[], text, text, text, text, timestamptz, int, int, int, int);
drop function if exists book_showing(uuid, uuid, text, text, text, text, uuid[], text, text, text, text, timestamptz, int, int, int, int, int);
create or replace function book_showing(
  p_festival uuid, p_screen uuid, p_kind text, p_title text, p_description text, p_poster text,
  p_film_ids uuid[], p_live_url text, p_preroll text, p_sponsor text, p_rating text,
  p_starts_at timestamptz, p_lobby int, p_qa int, p_seats int, p_live_runtime int, p_price_cents int default 0)
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
  price int := coalesce(p_price_cents, 0);
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
  if price <> 0 and (price < 50 or price > 100000) then raise exception 'A ticket price must be between $0.50 and $1,000, or free.'; end if;
  if price > 0 and not coalesce(fest.payments_enabled, false) then raise exception 'Card payments are not turned on for your festival yet, so tickets must be free.'; end if;
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
                               preroll_url, sponsor_name, starts_at, lobby_minutes, runtime_min, qa_minutes, seats, status, price_cents, access)
  values (p_screen, p_festival, p_kind, ttl, nullif(trim(coalesce(p_description, '')), ''), nullif(trim(coalesce(p_poster, '')), ''),
          nullif(trim(coalesce(p_rating, '')), ''), coalesce(p_film_ids, '{}'), nullif(trim(coalesce(p_live_url, '')), ''),
          nullif(trim(coalesce(p_preroll, '')), ''), nullif(trim(coalesce(p_sponsor, '')), ''), p_starts_at, p_lobby, runtime, p_qa, p_seats, newstatus,
          price, case when price > 0 then 'ticketed' else 'free' end)
  returning id into sid;
  return jsonb_build_object('id', sid, 'status', newstatus);
end $$;
revoke execute on function book_showing(uuid, uuid, text, text, text, text, uuid[], text, text, text, text, timestamptz, int, int, int, int, int) from public, anon;
grant execute on function book_showing(uuid, uuid, text, text, text, text, uuid[], text, text, text, text, timestamptz, int, int, int, int, int) to authenticated;

-- ---------------------------------------------------------------- selling a ticket (only the payment webhook may call this)
-- Safe to call twice for the same payment. Returns sold_out when the last seat went to someone else, so the buyer can be refunded.
create or replace function cinema_sell_ticket(p_showing uuid, p_session text, p_email text, p_amount int, p_fee int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s cinema_showings%rowtype;
  existing text;
  cnt int;
  c text;
begin
  select code into existing from cinema_tickets where stripe_session_id = p_session;
  if existing is not null then return jsonb_build_object('status', 'ok', 'code', existing); end if;
  select * into s from cinema_showings where id = p_showing and status = 'scheduled';
  if not found then return jsonb_build_object('status', 'unavailable'); end if;
  perform pg_advisory_xact_lock(hashtext(s.id::text));
  if s.seats is not null then
    select count(*) into cnt from cinema_tickets t where t.showing_id = s.id;
    if cnt >= s.seats then return jsonb_build_object('status', 'sold_out'); end if;
  end if;
  c := 'FV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)) || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)) || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
  insert into cinema_tickets (showing_id, viewer_key, code, email, amount_cents, fee_cents, stripe_session_id)
  values (s.id, 'code:' || c, c, nullif(p_email, ''), coalesce(p_amount, 0), coalesce(p_fee, 0), p_session);
  return jsonb_build_object('status', 'ok', 'code', c);
end $$;
revoke execute on function cinema_sell_ticket(uuid, text, text, int, int) from public, anon, authenticated;
grant execute on function cinema_sell_ticket(uuid, text, text, int, int) to service_role;

-- ---------------------------------------------------------------- reserving, entering and chatting now understand tickets
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
  if s.price_cents > 0 then return jsonb_build_object('status', 'ticket_required'); end if;
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

drop function if exists cinema_join(uuid, text);
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
    -- A paid showing needs a ticket code that belongs to this showing.
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
grant execute on function cinema_join(uuid, text, text) to anon, authenticated;

drop function if exists cinema_post_chat(uuid, text, text, text, text);
create or replace function cinema_post_chat(p_showing uuid, p_device text, p_name text, p_body text, p_kind text, p_code text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  s cinema_showings%rowtype;
  vkey text := case when coalesce(p_code, '') <> '' then 'code:' || upper(trim(p_code)) else 'device:' || left(coalesce(p_device, ''), 80) end;
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
grant execute on function cinema_post_chat(uuid, text, text, text, text, text) to anon, authenticated;
