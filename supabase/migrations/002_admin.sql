-- Festival admin access: each festival has admins who can manage only their own festival.

create table if not exists festival_admins (
  user_id uuid not null references auth.users(id) on delete cascade,
  festival_id uuid not null references festivals(id) on delete cascade,
  role text not null default 'owner',
  primary key (user_id, festival_id)
);
alter table festival_admins enable row level security;
create policy "admins read own rows" on festival_admins for select using (user_id = auth.uid());

create or replace function is_festival_admin(fid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from festival_admins where user_id = auth.uid() and festival_id = fid)
$$;

-- Festivals: admins can see (including drafts) and edit their own festival
create policy "admin read own festival" on festivals for select using (is_festival_admin(id));
create policy "admin update own festival" on festivals for update using (is_festival_admin(id)) with check (is_festival_admin(id));

-- Films
create policy "admin read own films" on films for select using (is_festival_admin(festival_id));
create policy "admin insert own films" on films for insert with check (is_festival_admin(festival_id));
create policy "admin update own films" on films for update using (is_festival_admin(festival_id)) with check (is_festival_admin(festival_id));
create policy "admin delete own films" on films for delete using (is_festival_admin(festival_id));

-- Live feeds
create policy "admin insert own feeds" on live_feeds for insert with check (is_festival_admin(festival_id));
create policy "admin update own feeds" on live_feeds for update using (is_festival_admin(festival_id)) with check (is_festival_admin(festival_id));
create policy "admin delete own feeds" on live_feeds for delete using (is_festival_admin(festival_id));

-- Schedule items (through their live feed)
create policy "admin manage own schedule" on schedule_items for all
  using (exists (select 1 from live_feeds l where l.id = live_feed_id and is_festival_admin(l.festival_id)))
  with check (exists (select 1 from live_feeds l where l.id = live_feed_id and is_festival_admin(l.festival_id)));

-- Filmmaker shares
create policy "admin manage own shares" on filmmaker_shares for all
  using (exists (select 1 from films f where f.id = film_id and is_festival_admin(f.festival_id)))
  with check (exists (select 1 from films f where f.id = film_id and is_festival_admin(f.festival_id)));

-- Poster / banner uploads: public read, admins write only inside their own festival folder
insert into storage.buckets (id, name, public) values ('festival-media', 'festival-media', true)
  on conflict (id) do nothing;
create policy "public read festival media" on storage.objects for select using (bucket_id = 'festival-media');
create policy "admin upload festival media" on storage.objects for insert to authenticated
  with check (bucket_id = 'festival-media' and is_festival_admin(((storage.foldername(name))[1])::uuid));
create policy "admin delete festival media" on storage.objects for delete to authenticated
  using (bucket_id = 'festival-media' and is_festival_admin(((storage.foldername(name))[1])::uuid));

-- To give someone access (run as the project owner):
-- insert into festival_admins (user_id, festival_id) values ('<auth user uuid>', '<festival uuid>');
