-- Festival landing page details.
alter table festivals add column if not exists location text;
alter table festivals add column if not exists starts_on date;
alter table festivals add column if not exists ends_on date;
alter table festivals add column if not exists passes_url text;
