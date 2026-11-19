-- Fix for 019: let signed-in filmmakers read their own films (row level security still limits them to their own rows).
-- Safe to run more than once.
grant select on filmmaker_films to authenticated;
