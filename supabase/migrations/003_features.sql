-- Festaview feature set: owner console, inquiries, audience voting, analytics, premiere windows.

alter table festivals add column if not exists voting_open boolean not null default false;

-- ---------- platform (network owner) admins ----------
create table if not exists platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table platform_admins enable row level security;

create or replace function is_platform_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
$$;
-- Policies on public tables (festivals) call this, so anon must be allowed to execute it (it returns false for anon).
grant execute on function is_platform_admin() to anon, authenticated;

create policy "platform admins read self" on platform_admins for select using (user_id = auth.uid());
grant select on platform_admins to authenticated;

create policy "platform all festivals" on festivals for all using (is_platform_admin()) with check (is_platform_admin());
create policy "platform manage festival admins" on festival_admins for all using (is_platform_admin()) with check (is_platform_admin());
grant insert, update, delete on festival_admins to authenticated;

create or replace function assign_festival_admin(p_email text, p_festival uuid) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not is_platform_admin() then raise exception 'not allowed'; end if;
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then return 'No account with that email yet. Ask them to create an account first.'; end if;
  insert into festival_admins (user_id, festival_id) values (uid, p_festival) on conflict do nothing;
  return 'ok';
end $$;
revoke execute on function assign_festival_admin(text, uuid) from public, anon;
grant execute on function assign_festival_admin(text, uuid) to authenticated;

-- ---------- founding festival inquiries ----------
create table if not exists inquiries (
  id uuid primary key default gen_random_uuid(),
  festival_name text not null,
  contact_name text,
  email text not null,
  message text,
  created_at timestamptz not null default now()
);
alter table inquiries enable row level security;
create policy "anyone can submit inquiry" on inquiries for insert
  with check (length(email) between 5 and 200 and length(festival_name) between 1 and 200 and (message is null or length(message) <= 4000));
create policy "platform read inquiries" on inquiries for select using (is_platform_admin());
grant insert on inquiries to anon, authenticated;
grant select on inquiries to authenticated;

-- ---------- audience voting (casual: one vote per device) ----------
create table if not exists film_votes (
  id bigint generated always as identity primary key,
  film_id uuid not null references films(id) on delete cascade,
  festival_id uuid not null references festivals(id) on delete cascade,
  device_id text not null,
  created_at timestamptz not null default now(),
  unique (film_id, device_id)
);
alter table film_votes enable row level security;
create policy "vote when open" on film_votes for insert
  with check (exists (select 1 from festivals f where f.id = festival_id and f.voting_open and f.status = 'published'));
create policy "admin read votes" on film_votes for select using (is_festival_admin(festival_id) or is_platform_admin());
grant insert on film_votes to anon, authenticated;
grant select on film_votes to authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- ---------- analytics ----------
drop policy if exists "anon can log view events" on view_events;
create policy "anon can log view events" on view_events for insert
  with check (seconds_watched between 0 and 21600 and ad_impressions between 0 and 1000);
create policy "admin read events" on view_events for select using (is_festival_admin(festival_id) or is_platform_admin());

create or replace function festival_film_stats(p_festival uuid, p_since timestamptz)
returns table (film_id uuid, views bigint, seconds bigint, impressions bigint)
language sql security definer stable set search_path = public as $$
  select e.film_id,
         count(*)::bigint,
         coalesce(sum(e.seconds_watched), 0)::bigint,
         coalesce(sum(e.ad_impressions), 0)::bigint
  from view_events e
  where e.festival_id = p_festival
    and e.created_at >= p_since
    and (is_festival_admin(p_festival) or is_platform_admin())
  group by e.film_id
$$;
revoke execute on function festival_film_stats(uuid, timestamptz) from public, anon;
grant execute on function festival_film_stats(uuid, timestamptz) to authenticated;

-- ---------- premiere / availability windows: films are hidden from the public outside their window ----------
drop policy if exists "public read published films" on films;
create policy "public read published films" on films for select
  using (status = 'published'
         and (available_from is null or available_from <= now())
         and (available_until is null or available_until >= now()));
