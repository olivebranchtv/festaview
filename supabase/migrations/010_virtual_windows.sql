-- Window rules matched to how Eventive defines them:
--   availability window: when a screening can be STARTED (unused tickets stop working when it ends)
--   unlock window:       how long a ticket holder has to START after getting the ticket (new: unlock_days)
--   watch window:        how long to FINISH once started; it overrides the availability end, so someone who pressed
--                        play in time can still finish. (If no watch window is set, the availability end applies to all.)
-- Run AFTER 009_virtual.sql.

alter table virtual_events add column if not exists unlock_days int check (unlock_days is null or unlock_days > 0);

create or replace function virtual_start(p_event uuid, p_code text, p_device text, p_country text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ev virtual_events%rowtype;
  ent entitlements%rowtype;
  sess virtual_sessions%rowtype;
  vkey text;
  cnt int;
  has_sess boolean;
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

  -- Who is this viewer?
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

  select * into sess from virtual_sessions s where s.event_id = ev.id and s.viewer_key = vkey;
  has_sess := found;

  -- Availability window. A viewer who already started may keep going inside their watch window.
  if (not has_sess) or ev.watch_hours is null then
    if ev.available_from is not null and now() < ev.available_from then
      return jsonb_build_object('status', 'not_open', 'opens_at', ev.available_from);
    end if;
    if ev.available_until is not null and now() > ev.available_until then
      return jsonb_build_object('status', 'closed');
    end if;
  end if;

  if not has_sess then
    if ev.kind = 'live' and ev.starts_at is not null and now() < ev.starts_at - interval '15 minutes' then
      return jsonb_build_object('status', 'not_started', 'starts_at', ev.starts_at);
    end if;
    -- Unlock window: ticket holders must start within unlock_days of getting their ticket.
    if ev.access = 'ticketed' and ev.unlock_days is not null and ent.created_at + make_interval(days => ev.unlock_days) < now() then
      return jsonb_build_object('status', 'unlock_expired');
    end if;
  end if;

  -- Region rules (always apply). Needs a trusted country, which only the server function can supply.
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

  -- Watch window.
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
