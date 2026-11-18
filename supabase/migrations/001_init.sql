-- Festaview multi-tenant schema (flat tables; join in application code, not PostgREST FK joins)

create extension if not exists pgcrypto;

create table if not exists festivals (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  tagline text,
  description text,
  logo_url text,
  banner_url text,
  brand_color text default '#E6B34A',
  website text,
  country text,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  revenue_share_pct numeric not null default 80,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists films (
  id uuid primary key default gen_random_uuid(),
  festival_id uuid not null references festivals(id) on delete cascade,
  title text not null,
  synopsis text,
  director text,
  year int,
  runtime_min int,
  country text,
  language text,
  genre text,
  rating text,
  poster_url text,
  video_url text,
  trailer_url text,
  captions_url text,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  premiere_at timestamptz,
  available_from timestamptz,
  available_until timestamptz,
  geo_allow text[],
  geo_block text[],
  created_at timestamptz not null default now()
);
create index if not exists films_festival_idx on films(festival_id);

create table if not exists live_feeds (
  id uuid primary key default gen_random_uuid(),
  festival_id uuid not null references festivals(id) on delete cascade,
  name text not null,
  stream_url text,
  poster_url text,
  is_live boolean not null default false,
  is_replay_loop boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists live_feeds_festival_idx on live_feeds(festival_id);

create table if not exists schedule_items (
  id uuid primary key default gen_random_uuid(),
  live_feed_id uuid not null references live_feeds(id) on delete cascade,
  film_id uuid references films(id) on delete set null,
  title text,
  starts_at timestamptz not null,
  ends_at timestamptz not null
);
create index if not exists schedule_feed_idx on schedule_items(live_feed_id, starts_at);

-- Attribution events: drives the 80% festival share and per-film filmmaker payouts
create table if not exists view_events (
  id bigint generated always as identity primary key,
  festival_id uuid not null,
  film_id uuid,
  live_feed_id uuid,
  device_id text,
  seconds_watched int not null default 0,
  ad_impressions int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists view_events_festival_idx on view_events(festival_id, created_at);
create index if not exists view_events_film_idx on view_events(film_id, created_at);

create table if not exists filmmaker_shares (
  id uuid primary key default gen_random_uuid(),
  film_id uuid not null references films(id) on delete cascade,
  filmmaker_name text not null,
  filmmaker_email text,
  share_pct numeric not null default 0 check (share_pct >= 0 and share_pct <= 100)
);

-- Row level security: the public (anon) can read only published content
alter table festivals enable row level security;
alter table films enable row level security;
alter table live_feeds enable row level security;
alter table schedule_items enable row level security;
alter table view_events enable row level security;
alter table filmmaker_shares enable row level security;

create policy "public read published festivals" on festivals for select using (status = 'published');
create policy "public read published films" on films for select using (status = 'published');
create policy "public read live feeds" on live_feeds for select using (true);
create policy "public read schedule" on schedule_items for select using (true);
create policy "anon can log view events" on view_events for insert with check (true);
