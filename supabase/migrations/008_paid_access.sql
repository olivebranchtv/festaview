-- Paid access: ticketed films whose video link is hidden until the viewer has a valid access code.
-- Run AFTER the website that reads "films_public" has deployed (it falls back to the old table until then).

alter table films add column if not exists access text not null default 'free' check (access in ('free', 'ticketed'));
alter table festivals add column if not exists payments_enabled boolean not null default false;
alter table festivals add column if not exists ticket_fee_pct numeric not null default 0 check (ticket_fee_pct between 0 and 100);

-- What festivals sell: a pass (all ticketed films) or a ticket (one film).
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  festival_id uuid not null references festivals(id) on delete cascade,
  film_id uuid references films(id) on delete cascade,
  name text not null,
  description text,
  price_cents int not null check (price_cents >= 0),
  currency text not null default 'usd',
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists products_festival_idx on products(festival_id);

-- Who may watch: one row per access code (bought or given away).
create table if not exists entitlements (
  id uuid primary key default gen_random_uuid(),
  festival_id uuid not null references festivals(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  film_id uuid references films(id) on delete cascade,   -- null = every ticketed film of the festival
  code text not null unique,
  email text,
  note text,
  status text not null default 'active' check (status in ('active', 'revoked')),
  source text not null default 'comp' check (source in ('comp', 'stripe')),
  amount_cents int not null default 0,
  fee_cents int not null default 0,
  stripe_session_id text unique,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists entitlements_festival_idx on entitlements(festival_id, created_at);

alter table products enable row level security;
alter table entitlements enable row level security;

create policy "public read active products" on products for select
  using (active and exists (select 1 from festivals f where f.id = festival_id and f.status = 'published'));
create policy "admin manage products" on products for all
  using (is_festival_admin(festival_id)) with check (is_festival_admin(festival_id));
create policy "admin read entitlements" on entitlements for select using (is_festival_admin(festival_id) or is_platform_admin());
create policy "admin update entitlements" on entitlements for update using (is_festival_admin(festival_id)) with check (is_festival_admin(festival_id));

grant select on products to anon;
grant select, insert, update, delete on products to authenticated;
grant select, update on entitlements to authenticated;

-- Public view of films. The video link is only included for free films, so a ticketed film's stream cannot be read
-- from the public API. It also applies the published and premiere-window rules.
create or replace view films_public as
select f.id, f.festival_id, f.title, f.synopsis, f.director, f.year, f.runtime_min, f.country, f.language, f.genre, f.rating,
       f.poster_url,
       case when f.access = 'free' then f.video_url else null end as video_url,
       f.trailer_url, f.captions_url, f.status, f.premiere_at, f.available_from, f.available_until,
       f.created_at, f.duration_sec, f.access
from films f
where f.status = 'published'
  and (f.available_from is null or f.available_from <= now())
  and (f.available_until is null or f.available_until >= now())
  and exists (select 1 from festivals fe where fe.id = f.festival_id and fe.status = 'published');
grant select on films_public to anon, authenticated;

-- Anonymous visitors now read films only through the view.
revoke select on films from anon;

-- Returns a film's video link if it is free, or if the code is a valid access code for it.
create or replace function unlock_stream(p_film uuid, p_code text) returns text
language plpgsql security definer stable set search_path = public as $$
declare
  fl films%rowtype;
  ok boolean;
begin
  select * into fl from films f
  where f.id = p_film and f.status = 'published'
    and (f.available_from is null or f.available_from <= now())
    and (f.available_until is null or f.available_until >= now())
    and exists (select 1 from festivals fe where fe.id = f.festival_id and fe.status = 'published');
  if not found then return null; end if;
  if fl.access = 'free' then return fl.video_url; end if;
  select exists (
    select 1 from entitlements e
    where e.code = upper(trim(coalesce(p_code, '')))
      and e.status = 'active'
      and e.festival_id = fl.festival_id
      and (e.film_id is null or e.film_id = fl.id)
      and (e.expires_at is null or e.expires_at > now())
  ) into ok;
  if ok then return fl.video_url; end if;
  return null;
end $$;
grant execute on function unlock_stream(uuid, text) to anon, authenticated;

-- Festival admins hand out free access codes (press passes, juror access, giveaways).
create or replace function create_comp_codes(p_festival uuid, p_count int, p_film uuid, p_note text, p_expires timestamptz)
returns setof text
language plpgsql security definer set search_path = public as $$
declare
  i int;
  c text;
  u text;
begin
  if not is_festival_admin(p_festival) then raise exception 'not allowed'; end if;
  if p_count < 1 or p_count > 200 then raise exception 'count must be between 1 and 200'; end if;
  for i in 1..p_count loop
    u := replace(gen_random_uuid()::text, '-', '');   -- built-in secure random, 48 bits used below
    c := 'FV-' || upper(substr(u, 1, 4)) || '-' || upper(substr(u, 5, 4)) || '-' || upper(substr(u, 9, 4));
    insert into entitlements (festival_id, film_id, code, note, source, expires_at) values (p_festival, p_film, c, p_note, 'comp', p_expires);
    return next c;
  end loop;
end $$;
revoke execute on function create_comp_codes(uuid, int, uuid, text, timestamptz) from public, anon;
grant execute on function create_comp_codes(uuid, int, uuid, text, timestamptz) to authenticated;
