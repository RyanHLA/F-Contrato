-- Modo de upload: 'selection' ou 'delivery'
alter table site_images add column if not exists upload_mode text not null default 'selection'
  check (upload_mode in ('selection', 'delivery'));

-- Variante 2048px (WebP)
alter table site_images add column if not exists variant_2048_url text default null;
alter table site_images add column if not exists variant_2048_key text default null;

-- Variante 1024px (WebP) — gerada apenas para modo 'delivery'
alter table site_images add column if not exists variant_1024_url text default null;
alter table site_images add column if not exists variant_1024_key text default null;

-- Status do processamento das variantes
alter table site_images add column if not exists variants_status text not null default 'pending'
  check (variants_status in ('pending', 'processing', 'done', 'error'));
