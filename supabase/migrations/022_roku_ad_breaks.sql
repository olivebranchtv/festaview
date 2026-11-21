-- Roku ad breaks: how many ads play before a film, how many midroll breaks there are and how far apart, and how many ads play in the
-- Festaview Cinemas lobby. The Roku app reads this row each time it opens, so changing it takes effect without rebuilding the app.
-- Set by the network owner (Network console > Roku ads). Safe to run more than once. Run AFTER 021.

create table if not exists roku_ad_settings (
  id int primary key default 1 check (id = 1),
  preroll_count int not null default 4 check (preroll_count between 0 and 10),
  midroll_count int not null default 2 check (midroll_count between 0 and 10),
  midroll_interval_minutes int not null default 10 check (midroll_interval_minutes between 1 and 120),
  midroll_ads_per_break int not null default 1 check (midroll_ads_per_break between 1 and 6),
  lobby_count int not null default 2 check (lobby_count between 0 and 6),
  updated_at timestamptz not null default now()
);
insert into roku_ad_settings (id) values (1) on conflict (id) do nothing;

alter table roku_ad_settings enable row level security;
drop policy if exists "anyone reads roku ad settings" on roku_ad_settings;
create policy "anyone reads roku ad settings" on roku_ad_settings for select using (true);
drop policy if exists "owner edits roku ad settings" on roku_ad_settings;
create policy "owner edits roku ad settings" on roku_ad_settings for all using (is_platform_admin()) with check (is_platform_admin());
grant select on roku_ad_settings to anon, authenticated;
grant insert, update on roku_ad_settings to authenticated;
