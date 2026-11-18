-- Automatic festival channels (scheduled playback of a festival's films) and exact film lengths.
alter table festivals add column if not exists auto_channel boolean not null default false;
alter table festivals add column if not exists channel_order text not null default 'listed'
  check (channel_order in ('listed', 'newest', 'shuffle'));
alter table films add column if not exists duration_sec int;
