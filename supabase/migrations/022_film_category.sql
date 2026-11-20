-- Film category: the film's type within a festival's Official Selection (Feature Film, Short Film, and so on).
-- Shown on the film page, the festival page, film cards and in search data. Safe to run more than once. Run AFTER 021.

alter table films add column if not exists category text;

-- The public films view now includes the category (new columns go at the end).
create or replace view films_public as
select f.id, f.festival_id, f.title, f.synopsis, f.director, f.year, f.runtime_min, f.country, f.language, f.genre, f.rating,
       f.poster_url,
       case when f.access = 'free' then f.video_url else null end as video_url,
       f.trailer_url, f.captions_url, f.status, f.premiere_at, f.available_from, f.available_until,
       f.created_at, f.duration_sec, f.access, f.category
from films f
where f.status = 'published'
  and (f.available_from is null or f.available_from <= now())
  and (f.available_until is null or f.available_until >= now())
  and exists (select 1 from festivals fe where fe.id = f.festival_id and fe.status = 'published');
grant select on films_public to anon, authenticated;

-- The Sparrows Nesting is a feature film in the Official Selection.
update films set category = 'Feature Film' where title = 'The Sparrows Nesting' and category is null;

-- Accepting a submission into the festival's films now carries its category over.
create or replace function add_submission_to_films(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s submissions%rowtype;
  fid uuid;
  cname text;
begin
  select * into s from submissions where id = p_id;
  if not found then raise exception 'Entry not found.'; end if;
  if not (is_festival_admin(s.festival_id) or is_platform_admin()) then raise exception 'You do not manage this festival.'; end if;
  if s.status <> 'accepted' then raise exception 'Only accepted entries can be added to your films.'; end if;
  if s.film_id is not null and exists (select 1 from films where id = s.film_id) then return s.film_id; end if;
  select name into cname from submission_categories where id = s.category_id;
  insert into films (festival_id, title, synopsis, director, year, runtime_min, country, language, genre, poster_url, status, category)
  values (s.festival_id, s.title, s.synopsis, s.director, s.year, s.runtime_min, s.country, s.language, s.genre, s.poster_url, 'draft', cname)
  returning id into fid;
  update submissions set film_id = fid, updated_at = now() where id = p_id;
  return fid;
end $$;
revoke execute on function add_submission_to_films(uuid) from public, anon;
grant execute on function add_submission_to_films(uuid) to authenticated;
