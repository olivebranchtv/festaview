-- Festaview filmmaker submissions (like FilmFreeway). A filmmaker makes one Festaview account, browses festivals that are
-- accepting entries, submits a title to a category, pays the entry fee by card (Stripe Checkout), and tracks the result.
-- Each festival sets its own categories, fee tiers (early / regular / late deadlines), open and close dates and waiver codes.
-- Safe to run more than once. Run AFTER 013. Every table has row level security; all writes go through SECURITY DEFINER functions.

-- ---------------------------------------------------------------- festival settings
alter table festivals add column if not exists submissions_open boolean not null default false;
alter table festivals add column if not exists submissions_opens_at timestamptz;
alter table festivals add column if not exists submissions_closes_at timestamptz;
alter table festivals add column if not exists submission_notes text;

-- ---------------------------------------------------------------- tables
create table if not exists submission_categories (
  id uuid primary key default gen_random_uuid(),
  festival_id uuid not null references festivals(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  description text,
  max_runtime_min int check (max_runtime_min is null or max_runtime_min > 0),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists submission_categories_festival_idx on submission_categories(festival_id);

-- One row per price step of a category. The step that applies is the one with the earliest deadline that has not passed.
-- A step with no deadline is the last step (it applies until the festival closes submissions).
create table if not exists submission_tiers (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references submission_categories(id) on delete cascade,
  festival_id uuid not null references festivals(id) on delete cascade,
  name text not null default 'Regular' check (length(trim(name)) between 1 and 40),
  deadline timestamptz,
  fee_cents int not null default 0 check (fee_cents = 0 or fee_cents between 50 and 100000),
  sort_order int not null default 0
);
create index if not exists submission_tiers_category_idx on submission_tiers(category_id);

create table if not exists filmmaker_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  country text,
  bio text,
  website text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A waiver code gives a percentage off the entry fee (100 = free entry).
create table if not exists submission_waivers (
  id uuid primary key default gen_random_uuid(),
  festival_id uuid not null references festivals(id) on delete cascade,
  code text not null check (length(trim(code)) between 3 and 40),
  percent_off int not null check (percent_off between 1 and 100),
  max_uses int check (max_uses is null or max_uses > 0),
  uses int not null default 0,
  expires_at timestamptz,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);
create unique index if not exists submission_waivers_code_idx on submission_waivers(festival_id, upper(code));

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  festival_id uuid not null references festivals(id) on delete cascade,
  category_id uuid not null references submission_categories(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_email text,
  title text not null check (length(trim(title)) between 1 and 200),
  director text not null,
  runtime_min int not null check (runtime_min > 0),
  year int,
  synopsis text,
  screener_url text not null,
  screener_password text,
  poster_url text,
  country text,
  language text,
  genre text,
  status text not null default 'submitted' check (status in ('submitted', 'under_review', 'accepted', 'declined', 'withdrawn')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'free', 'waived', 'refunded')),
  tier_id uuid references submission_tiers(id) on delete set null,
  tier_name text,
  base_fee_cents int not null default 0,
  amount_due_cents int not null default 0,
  waiver_id uuid references submission_waivers(id) on delete set null,
  amount_paid_cents int not null default 0,
  fee_cents int not null default 0,
  stripe_session_id text unique,
  paid_at timestamptz,
  admin_note text,
  film_id uuid references films(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists submissions_festival_idx on submissions(festival_id, status);
create index if not exists submissions_user_idx on submissions(user_id);
create unique index if not exists submissions_no_dupes_idx on submissions(festival_id, user_id, category_id, lower(title)) where status <> 'withdrawn';

-- ---------------------------------------------------------------- row level security (reads only; writes are functions)
alter table submission_categories enable row level security;
alter table submission_tiers enable row level security;
alter table filmmaker_profiles enable row level security;
alter table submission_waivers enable row level security;
alter table submissions enable row level security;

revoke insert, update, delete on submission_categories, submission_tiers, filmmaker_profiles, submission_waivers, submissions from anon, authenticated;
revoke all on submission_waivers, submissions, filmmaker_profiles from anon;
grant select on submission_categories, submission_tiers to anon, authenticated;
grant select on submission_waivers, submissions, filmmaker_profiles to authenticated;

drop policy if exists "public read categories" on submission_categories;
create policy "public read categories" on submission_categories for select
  using (active and exists (select 1 from festivals f where f.id = festival_id and f.status = 'published'));
drop policy if exists "admin read categories" on submission_categories;
create policy "admin read categories" on submission_categories for select using (is_festival_admin(festival_id) or is_platform_admin());

drop policy if exists "public read tiers" on submission_tiers;
create policy "public read tiers" on submission_tiers for select
  using (exists (select 1 from festivals f where f.id = festival_id and f.status = 'published')
         and exists (select 1 from submission_categories c where c.id = category_id and c.active));
drop policy if exists "admin read tiers" on submission_tiers;
create policy "admin read tiers" on submission_tiers for select using (is_festival_admin(festival_id) or is_platform_admin());

drop policy if exists "own profile" on filmmaker_profiles;
create policy "own profile" on filmmaker_profiles for select using (user_id = auth.uid());

drop policy if exists "admin read waivers" on submission_waivers;
create policy "admin read waivers" on submission_waivers for select using (is_festival_admin(festival_id) or is_platform_admin());

drop policy if exists "own submissions" on submissions;
create policy "own submissions" on submissions for select using (user_id = auth.uid());
-- Festivals only see entries that are paid for (or free or waived), never half-finished ones.
drop policy if exists "admin read submissions" on submissions;
create policy "admin read submissions" on submissions for select
  using ((is_festival_admin(festival_id) or is_platform_admin()) and payment_status in ('paid', 'free', 'waived', 'refunded'));

-- ---------------------------------------------------------------- price for a category right now
-- Public so the form can show the fee. Returns the fee that applies today and, if a code is given, the discounted fee.
create or replace function submission_quote(p_festival uuid, p_category uuid, p_code text default null) returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare
  fest festivals%rowtype;
  cat submission_categories%rowtype;
  t submission_tiers%rowtype;
  w submission_waivers%rowtype;
  base int;
  amt int;
  code_ok boolean := false;
  wid uuid := null;
begin
  select * into fest from festivals where id = p_festival and status = 'published';
  if not found or not fest.submissions_open then return jsonb_build_object('ok', false, 'reason', 'closed'); end if;
  if fest.submissions_opens_at is not null and now() < fest.submissions_opens_at then return jsonb_build_object('ok', false, 'reason', 'not_open'); end if;
  if fest.submissions_closes_at is not null and now() > fest.submissions_closes_at then return jsonb_build_object('ok', false, 'reason', 'closed'); end if;
  select * into cat from submission_categories where id = p_category and festival_id = p_festival and active;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_category'); end if;
  select * into t from submission_tiers where category_id = cat.id and (deadline is null or deadline >= now())
    order by deadline asc nulls last, sort_order, fee_cents limit 1;
  if not found then return jsonb_build_object('ok', false, 'reason', 'closed'); end if;
  base := t.fee_cents;
  amt := base;
  if coalesce(trim(p_code), '') <> '' then
    select * into w from submission_waivers
      where festival_id = p_festival and upper(code) = upper(trim(p_code)) and active
        and (expires_at is null or expires_at > now()) and (max_uses is null or uses < max_uses);
    if found then
      code_ok := true; wid := w.id;
      amt := round(base * (100 - w.percent_off) / 100.0)::int;
      if amt > 0 and amt < 50 then amt := 50; end if;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'base_cents', base, 'amount_cents', amt, 'tier_id', t.id, 'tier_name', t.name, 'deadline', t.deadline,
                            'code_ok', code_ok, 'waiver_id', wid);
end $$;
grant execute on function submission_quote(uuid, uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------- filmmaker actions
create or replace function save_filmmaker_profile(p_name text, p_country text default null, p_bio text default null, p_website text default null) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Please sign in first.'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Enter your name.'; end if;
  insert into filmmaker_profiles (user_id, name, country, bio, website)
  values (uid, left(trim(p_name), 120), nullif(left(trim(coalesce(p_country, '')), 80), ''), nullif(left(trim(coalesce(p_bio, '')), 2000), ''), nullif(left(trim(coalesce(p_website, '')), 300), ''))
  on conflict (user_id) do update set name = excluded.name, country = excluded.country, bio = excluded.bio, website = excluded.website, updated_at = now();
end $$;
revoke execute on function save_filmmaker_profile(text, text, text, text) from public, anon;
grant execute on function save_filmmaker_profile(text, text, text, text) to authenticated;

-- Creates an entry. If nothing is owed it is complete right away; otherwise it waits for the card payment.
create or replace function create_submission(
  p_festival uuid, p_category uuid, p_title text, p_director text, p_runtime int, p_year int, p_synopsis text,
  p_screener text, p_screener_password text, p_poster text, p_country text, p_language text, p_genre text, p_code text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  q jsonb;
  cat submission_categories%rowtype;
  amt int;
  pay text;
  sid uuid;
  ttl text := left(trim(coalesce(p_title, '')), 200);
  dir text := left(trim(coalesce(p_director, '')), 200);
  scr text := left(trim(coalesce(p_screener, '')), 600);
begin
  if uid is null then raise exception 'Please sign in first.'; end if;
  if ttl = '' then raise exception 'Enter the title of your film.'; end if;
  if dir = '' then raise exception 'Enter the director''s name.'; end if;
  if p_runtime is null or p_runtime < 1 or p_runtime > 1000 then raise exception 'Enter the running time in minutes.'; end if;
  if p_year is not null and (p_year < 1890 or p_year > 2100) then raise exception 'Enter a valid year.'; end if;
  if scr !~* '^https?://' then raise exception 'Enter a screener link that starts with http:// or https://'; end if;
  if length(trim(coalesce(p_synopsis, ''))) < 10 then raise exception 'Write a short synopsis.'; end if;
  q := submission_quote(p_festival, p_category, p_code);
  if not (q->>'ok')::boolean then
    raise exception '%', case q->>'reason' when 'not_open' then 'This festival is not accepting submissions yet.' when 'no_category' then 'Choose a category.' else 'This festival is not accepting submissions right now.' end;
  end if;
  select * into cat from submission_categories where id = p_category;
  if cat.max_runtime_min is not null and p_runtime > cat.max_runtime_min then
    raise exception 'This category accepts films up to % minutes.', cat.max_runtime_min;
  end if;
  if (select count(*) from submissions where user_id = uid and payment_status = 'unpaid' and status <> 'withdrawn') >= 10 then
    raise exception 'You have 10 entries waiting for payment. Pay for or withdraw some of them first.';
  end if;
  if exists (select 1 from submissions where festival_id = p_festival and user_id = uid and category_id = p_category and lower(title) = lower(ttl) and status <> 'withdrawn') then
    raise exception 'You already entered this title in this category.';
  end if;
  amt := (q->>'amount_cents')::int;
  pay := case when amt > 0 then 'unpaid' when (q->>'code_ok')::boolean then 'waived' else 'free' end;
  insert into submissions (festival_id, category_id, user_id, contact_email, title, director, runtime_min, year, synopsis, screener_url, screener_password, poster_url,
                           country, language, genre, payment_status, tier_id, tier_name, base_fee_cents, amount_due_cents, waiver_id, paid_at)
  values (p_festival, p_category, uid, nullif(auth.jwt() ->> 'email', ''), ttl, dir, p_runtime, p_year, trim(p_synopsis), scr, nullif(left(trim(coalesce(p_screener_password, '')), 100), ''),
          nullif(left(trim(coalesce(p_poster, '')), 600), ''), nullif(left(trim(coalesce(p_country, '')), 80), ''), nullif(left(trim(coalesce(p_language, '')), 80), ''),
          nullif(left(trim(coalesce(p_genre, '')), 80), ''), pay, nullif(q->>'tier_id', '')::uuid, q->>'tier_name', (q->>'base_cents')::int, amt,
          case when (q->>'code_ok')::boolean then nullif(q->>'waiver_id', '')::uuid else null end, case when pay <> 'unpaid' then now() else null end)
  returning id into sid;
  if pay = 'waived' then update submission_waivers set uses = uses + 1 where id = (q->>'waiver_id')::uuid; end if;
  return jsonb_build_object('id', sid, 'payment_status', pay, 'amount_cents', amt);
end $$;
revoke execute on function create_submission(uuid, uuid, text, text, int, int, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function create_submission(uuid, uuid, text, text, int, int, text, text, text, text, text, text, text, text) to authenticated;

-- The filmmaker can fix details until the festival starts reviewing. The category and fee cannot change here.
create or replace function update_my_submission(
  p_id uuid, p_title text, p_director text, p_runtime int, p_year int, p_synopsis text,
  p_screener text, p_screener_password text, p_poster text, p_country text, p_language text, p_genre text)
returns void
language plpgsql security definer set search_path = public as $$
declare s submissions%rowtype;
begin
  select * into s from submissions where id = p_id and user_id = auth.uid();
  if not found then raise exception 'Entry not found.'; end if;
  if s.status <> 'submitted' then raise exception 'This entry can no longer be edited.'; end if;
  if length(trim(coalesce(p_title, ''))) < 1 or length(trim(coalesce(p_director, ''))) < 1 then raise exception 'Title and director are required.'; end if;
  if p_runtime is null or p_runtime < 1 or p_runtime > 1000 then raise exception 'Enter the running time in minutes.'; end if;
  if left(trim(coalesce(p_screener, '')), 600) !~* '^https?://' then raise exception 'Enter a screener link that starts with http:// or https://'; end if;
  update submissions set title = left(trim(p_title), 200), director = left(trim(p_director), 200), runtime_min = p_runtime, year = p_year,
    synopsis = trim(coalesce(p_synopsis, '')), screener_url = left(trim(p_screener), 600), screener_password = nullif(left(trim(coalesce(p_screener_password, '')), 100), ''),
    poster_url = nullif(left(trim(coalesce(p_poster, '')), 600), ''), country = nullif(left(trim(coalesce(p_country, '')), 80), ''),
    language = nullif(left(trim(coalesce(p_language, '')), 80), ''), genre = nullif(left(trim(coalesce(p_genre, '')), 80), ''), updated_at = now()
  where id = p_id;
end $$;
revoke execute on function update_my_submission(uuid, text, text, int, int, text, text, text, text, text, text, text) from public, anon;
grant execute on function update_my_submission(uuid, text, text, int, int, text, text, text, text, text, text, text) to authenticated;

-- Withdrawing does not refund by itself; the festival decides about refunds.
create or replace function withdraw_my_submission(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update submissions set status = 'withdrawn', updated_at = now()
    where id = p_id and user_id = auth.uid() and status in ('submitted', 'under_review');
  if not found then raise exception 'This entry cannot be withdrawn.'; end if;
end $$;
revoke execute on function withdraw_my_submission(uuid) from public, anon;
grant execute on function withdraw_my_submission(uuid) to authenticated;

-- ---------------------------------------------------------------- payment (only the payment functions on the server may call these)
-- Re-prices an unpaid entry using today's fee tier and an optional waiver code. If nothing is owed it completes the entry.
create or replace function submission_requote(p_id uuid, p_code text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s submissions%rowtype;
  q jsonb;
  amt int;
  cname text;
  fname text;
begin
  select * into s from submissions where id = p_id for update;
  if not found or s.status = 'withdrawn' then return jsonb_build_object('status', 'unavailable'); end if;
  if s.payment_status <> 'unpaid' then return jsonb_build_object('status', 'paid'); end if;
  q := submission_quote(s.festival_id, s.category_id, p_code);
  if not (q->>'ok')::boolean then return jsonb_build_object('status', 'closed'); end if;
  amt := (q->>'amount_cents')::int;
  select name into cname from submission_categories where id = s.category_id;
  select name into fname from festivals where id = s.festival_id;
  if amt = 0 then
    update submissions set payment_status = case when (q->>'code_ok')::boolean then 'waived' else 'free' end, amount_due_cents = 0, base_fee_cents = (q->>'base_cents')::int,
      tier_id = nullif(q->>'tier_id', '')::uuid, tier_name = q->>'tier_name', waiver_id = case when (q->>'code_ok')::boolean then nullif(q->>'waiver_id', '')::uuid else null end,
      paid_at = now(), updated_at = now() where id = s.id;
    if (q->>'code_ok')::boolean then update submission_waivers set uses = uses + 1 where id = (q->>'waiver_id')::uuid; end if;
    return jsonb_build_object('status', 'completed');
  end if;
  update submissions set amount_due_cents = amt, base_fee_cents = (q->>'base_cents')::int, tier_id = nullif(q->>'tier_id', '')::uuid, tier_name = q->>'tier_name',
    waiver_id = case when (q->>'code_ok')::boolean then nullif(q->>'waiver_id', '')::uuid else null end, updated_at = now() where id = s.id;
  return jsonb_build_object('status', 'ok', 'amount_cents', amt, 'festival_id', s.festival_id, 'title', s.title, 'category', cname, 'festival_name', fname, 'tier', q->>'tier_name');
end $$;
revoke execute on function submission_requote(uuid, text) from public, anon, authenticated;
grant execute on function submission_requote(uuid, text) to service_role;

-- Records the card payment. Safe to call twice for the same payment. Returns unavailable / already_paid so the server can refund.
create or replace function submission_mark_paid(p_id uuid, p_session text, p_email text, p_amount int, p_fee int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s submissions%rowtype;
begin
  if exists (select 1 from submissions where stripe_session_id = p_session) then return jsonb_build_object('status', 'ok'); end if;
  select * into s from submissions where id = p_id for update;
  if not found or s.status = 'withdrawn' then return jsonb_build_object('status', 'unavailable'); end if;
  if s.payment_status <> 'unpaid' then return jsonb_build_object('status', 'already_paid'); end if;
  update submissions set payment_status = 'paid', amount_paid_cents = coalesce(p_amount, 0), fee_cents = coalesce(p_fee, 0), stripe_session_id = p_session,
    contact_email = coalesce(contact_email, nullif(p_email, '')), paid_at = now(), updated_at = now() where id = s.id;
  if s.waiver_id is not null then update submission_waivers set uses = uses + 1 where id = s.waiver_id; end if;
  return jsonb_build_object('status', 'ok');
end $$;
revoke execute on function submission_mark_paid(uuid, text, text, int, int) from public, anon, authenticated;
grant execute on function submission_mark_paid(uuid, text, text, int, int) to service_role;

-- ---------------------------------------------------------------- festival admin actions
create or replace function save_submission_settings(p_festival uuid, p_open boolean, p_opens_at timestamptz, p_closes_at timestamptz, p_notes text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_festival_admin(p_festival) or is_platform_admin()) then raise exception 'You do not manage this festival.'; end if;
  if p_opens_at is not null and p_closes_at is not null and p_closes_at <= p_opens_at then raise exception 'The closing date must be after the opening date.'; end if;
  if coalesce(p_open, false) and not exists (select 1 from submission_categories where festival_id = p_festival and active) then
    raise exception 'Add at least one category with a fee before opening submissions.';
  end if;
  update festivals set submissions_open = coalesce(p_open, false), submissions_opens_at = p_opens_at, submissions_closes_at = p_closes_at,
    submission_notes = nullif(trim(coalesce(p_notes, '')), '') where id = p_festival;
end $$;
revoke execute on function save_submission_settings(uuid, boolean, timestamptz, timestamptz, text) from public, anon;
grant execute on function save_submission_settings(uuid, boolean, timestamptz, timestamptz, text) to authenticated;

-- Creates or updates a category and replaces its fee tiers. p_tiers is a list like [{"name":"Early","deadline":"2027-01-15T00:00:00Z","fee_cents":3500}].
create or replace function save_submission_category(p_festival uuid, p_id uuid, p_name text, p_description text, p_max_runtime int, p_active boolean, p_tiers jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cid uuid := p_id;
  t jsonb;
  i int := 0;
  fee int;
begin
  if not (is_festival_admin(p_festival) or is_platform_admin()) then raise exception 'You do not manage this festival.'; end if;
  if length(trim(coalesce(p_name, ''))) < 1 then raise exception 'Give the category a name.'; end if;
  if p_tiers is null or jsonb_typeof(p_tiers) <> 'array' or jsonb_array_length(p_tiers) = 0 then raise exception 'Add at least one fee (use 0 for free entry).'; end if;
  if jsonb_array_length(p_tiers) > 6 then raise exception 'Use at most 6 fee steps per category.'; end if;
  for t in select * from jsonb_array_elements(p_tiers) loop
    fee := coalesce((t->>'fee_cents')::int, 0);
    if fee <> 0 and (fee < 50 or fee > 100000) then raise exception 'Each fee must be free or between $0.50 and $1,000.'; end if;
  end loop;
  if cid is null then
    insert into submission_categories (festival_id, name, description, max_runtime_min, active, sort_order)
    values (p_festival, left(trim(p_name), 80), nullif(trim(coalesce(p_description, '')), ''), p_max_runtime, coalesce(p_active, true),
            (select coalesce(max(sort_order), 0) + 1 from submission_categories where festival_id = p_festival))
    returning id into cid;
  else
    update submission_categories set name = left(trim(p_name), 80), description = nullif(trim(coalesce(p_description, '')), ''), max_runtime_min = p_max_runtime, active = coalesce(p_active, true)
      where id = cid and festival_id = p_festival;
    if not found then raise exception 'Category not found.'; end if;
  end if;
  delete from submission_tiers where category_id = cid;
  for t in select * from jsonb_array_elements(p_tiers) loop
    i := i + 1;
    insert into submission_tiers (category_id, festival_id, name, deadline, fee_cents, sort_order)
    values (cid, p_festival, left(coalesce(nullif(trim(t->>'name'), ''), 'Regular'), 40), nullif(t->>'deadline', '')::timestamptz, coalesce((t->>'fee_cents')::int, 0), i);
  end loop;
  return cid;
end $$;
revoke execute on function save_submission_category(uuid, uuid, text, text, int, boolean, jsonb) from public, anon;
grant execute on function save_submission_category(uuid, uuid, text, text, int, boolean, jsonb) to authenticated;

-- A category that already has entries is hidden instead of deleted, so those entries keep their history.
create or replace function delete_submission_category(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  select festival_id into fid from submission_categories where id = p_id;
  if fid is null then raise exception 'Category not found.'; end if;
  if not (is_festival_admin(fid) or is_platform_admin()) then raise exception 'You do not manage this festival.'; end if;
  if exists (select 1 from submissions where category_id = p_id) then
    update submission_categories set active = false where id = p_id;
    return 'hidden';
  end if;
  delete from submission_categories where id = p_id;
  return 'deleted';
end $$;
revoke execute on function delete_submission_category(uuid) from public, anon;
grant execute on function delete_submission_category(uuid) to authenticated;

create or replace function save_submission_waiver(p_festival uuid, p_id uuid, p_code text, p_percent int, p_max_uses int, p_expires timestamptz, p_active boolean, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare wid uuid := p_id;
begin
  if not (is_festival_admin(p_festival) or is_platform_admin()) then raise exception 'You do not manage this festival.'; end if;
  if length(trim(coalesce(p_code, ''))) < 3 then raise exception 'A code needs at least 3 characters.'; end if;
  if p_percent is null or p_percent < 1 or p_percent > 100 then raise exception 'Percent off must be between 1 and 100.'; end if;
  if wid is null then
    if exists (select 1 from submission_waivers where festival_id = p_festival and upper(code) = upper(trim(p_code))) then raise exception 'That code already exists.'; end if;
    insert into submission_waivers (festival_id, code, percent_off, max_uses, expires_at, active, note)
    values (p_festival, upper(trim(p_code)), p_percent, p_max_uses, p_expires, coalesce(p_active, true), nullif(trim(coalesce(p_note, '')), ''))
    returning id into wid;
  else
    update submission_waivers set percent_off = p_percent, max_uses = p_max_uses, expires_at = p_expires, active = coalesce(p_active, true), note = nullif(trim(coalesce(p_note, '')), '')
      where id = wid and festival_id = p_festival;
    if not found then raise exception 'Code not found.'; end if;
  end if;
  return wid;
end $$;
revoke execute on function save_submission_waiver(uuid, uuid, text, int, int, timestamptz, boolean, text) from public, anon;
grant execute on function save_submission_waiver(uuid, uuid, text, int, int, timestamptz, boolean, text) to authenticated;

create or replace function delete_submission_waiver(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  select festival_id into fid from submission_waivers where id = p_id;
  if fid is null then raise exception 'Code not found.'; end if;
  if not (is_festival_admin(fid) or is_platform_admin()) then raise exception 'You do not manage this festival.'; end if;
  delete from submission_waivers where id = p_id;
end $$;
revoke execute on function delete_submission_waiver(uuid) from public, anon;
grant execute on function delete_submission_waiver(uuid) to authenticated;

-- Moves an entry through review. Withdrawn entries and unpaid entries cannot be changed.
create or replace function set_submission_status(p_id uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare s submissions%rowtype;
begin
  select * into s from submissions where id = p_id;
  if not found then raise exception 'Entry not found.'; end if;
  if not (is_festival_admin(s.festival_id) or is_platform_admin()) then raise exception 'You do not manage this festival.'; end if;
  if p_status not in ('submitted', 'under_review', 'accepted', 'declined') then raise exception 'Choose a valid status.'; end if;
  if s.status = 'withdrawn' then raise exception 'The filmmaker withdrew this entry.'; end if;
  if s.payment_status not in ('paid', 'free', 'waived') then raise exception 'This entry has not been paid for.'; end if;
  update submissions set status = p_status, admin_note = nullif(trim(coalesce(p_note, '')), ''), updated_at = now() where id = p_id;
end $$;
revoke execute on function set_submission_status(uuid, text, text) from public, anon;
grant execute on function set_submission_status(uuid, text, text) to authenticated;

-- Copies an accepted entry into the festival's Films as a draft (no video yet; the screener link is never made public).
create or replace function add_submission_to_films(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s submissions%rowtype;
  fid uuid;
begin
  select * into s from submissions where id = p_id;
  if not found then raise exception 'Entry not found.'; end if;
  if not (is_festival_admin(s.festival_id) or is_platform_admin()) then raise exception 'You do not manage this festival.'; end if;
  if s.status <> 'accepted' then raise exception 'Only accepted entries can be added to your films.'; end if;
  if s.film_id is not null and exists (select 1 from films where id = s.film_id) then return s.film_id; end if;
  insert into films (festival_id, title, synopsis, director, year, runtime_min, country, language, genre, poster_url, status)
  values (s.festival_id, s.title, s.synopsis, s.director, s.year, s.runtime_min, s.country, s.language, s.genre, s.poster_url, 'draft')
  returning id into fid;
  update submissions set film_id = fid, updated_at = now() where id = p_id;
  return fid;
end $$;
revoke execute on function add_submission_to_films(uuid) from public, anon;
grant execute on function add_submission_to_films(uuid) to authenticated;
