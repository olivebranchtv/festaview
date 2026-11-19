-- Self-serve onboarding: a signed-in festival director creates their own festival, and is made its owner, in one step.
-- The festival starts as a DRAFT (private). The director publishes it when ready (Festival page, Visibility).
-- Limit: three festivals per account, to discourage abuse.

create or replace function create_my_festival(
  p_name text, p_tagline text default null, p_location text default null, p_website text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  nm text := left(trim(coalesce(p_name, '')), 120);
  base text;
  s text;
  n int := 1;
  fid uuid;
  cnt int;
begin
  if uid is null then raise exception 'Please sign in first.'; end if;
  if length(nm) < 2 then raise exception 'Enter your festival name.'; end if;

  select count(*) into cnt from festival_admins where user_id = uid and role = 'owner';
  if cnt >= 3 then raise exception 'You can create up to 3 festivals from one account. Contact Festaview for more.'; end if;

  base := trim(both '-' from regexp_replace(lower(nm), '[^a-z0-9]+', '-', 'g'));
  if base = '' then base := 'festival'; end if;
  base := left(base, 60);
  s := base;
  while exists (select 1 from festivals where slug = s) loop
    n := n + 1;
    s := base || '-' || n;
  end loop;

  insert into festivals (slug, name, tagline, location, website, status)
  values (s, nm, nullif(trim(coalesce(p_tagline, '')), ''), nullif(trim(coalesce(p_location, '')), ''), nullif(trim(coalesce(p_website, '')), ''), 'draft')
  returning id into fid;

  insert into festival_admins (user_id, festival_id, role) values (uid, fid, 'owner');
  return jsonb_build_object('id', fid, 'slug', s);
end $$;
revoke execute on function create_my_festival(text, text, text, text) from public, anon;
grant execute on function create_my_festival(text, text, text, text) to authenticated;
