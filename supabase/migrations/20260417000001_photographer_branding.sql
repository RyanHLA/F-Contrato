alter table photographers
  add column if not exists logo_url    text default null,
  add column if not exists logo_key    text default null,
  add column if not exists brand_color text default '#2f5496';
