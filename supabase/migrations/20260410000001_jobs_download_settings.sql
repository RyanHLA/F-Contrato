alter table jobs add column if not exists download_enabled boolean not null default false;
alter table jobs add column if not exists download_resolution text not null default '2048';
