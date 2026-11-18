-- Theatrical screenings: venues, showtimes, private screening packages, attendance logs.

create table if not exists venues (
  id uuid primary key default gen_random_uuid(),
  festival_id uuid not null references festivals(id) on delete cascade,
  name text not null,
  address text,
  city text,
  country text,
  capacity int,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists venues_festival_idx on venues(festival_id);

create table if not exists screenings (
  id uuid primary key default gen_random_uuid(),
  festival_id uuid not null references festivals(id) on delete cascade,
  venue_id uuid references venues(id) on delete set null,
  film_id uuid references films(id) on delete set null,
  title text,
  room text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  ticket_url text,
  created_at timestamptz not null default now()
);
create index if not exists screenings_festival_idx on screenings(festival_id, starts_at);

-- Private: master file / DCP links and technical notes for venues. Never public.
create table if not exists film_masters (
  film_id uuid primary key references films(id) on delete cascade,
  master_url text,
  dcp_url text,
  subtitles_url text,
  tech_notes text
);

create table if not exists screening_logs (
  id uuid primary key default gen_random_uuid(),
  screening_id uuid not null references screenings(id) on delete cascade,
  festival_id uuid not null references festivals(id) on delete cascade,
  attendance int,
  notes text,
  logged_at timestamptz not null default now()
);

alter table venues enable row level security;
alter table screenings enable row level security;
alter table film_masters enable row level security;
alter table screening_logs enable row level security;

create policy "public read venues" on venues for select
  using (exists (select 1 from festivals f where f.id = festival_id and f.status = 'published'));
create policy "admin manage venues" on venues for all
  using (is_festival_admin(festival_id)) with check (is_festival_admin(festival_id));

create policy "public read screenings" on screenings for select
  using (exists (select 1 from festivals f where f.id = festival_id and f.status = 'published'));
create policy "admin manage screenings" on screenings for all
  using (is_festival_admin(festival_id)) with check (is_festival_admin(festival_id));

create policy "admin manage masters" on film_masters for all
  using (exists (select 1 from films f where f.id = film_id and is_festival_admin(f.festival_id)))
  with check (exists (select 1 from films f where f.id = film_id and is_festival_admin(f.festival_id)));

create policy "admin manage screening logs" on screening_logs for all
  using (is_festival_admin(festival_id)) with check (is_festival_admin(festival_id));

grant select on venues, screenings to anon;
grant select, insert, update, delete on venues, screenings, film_masters, screening_logs to authenticated;
