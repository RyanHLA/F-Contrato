-- Tabela de categorias/sets de fotos por trabalho
create table if not exists job_photo_sets (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  photographer_id uuid not null references photographers(id) on delete cascade,
  name text not null,
  description text,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- RLS
alter table job_photo_sets enable row level security;

-- Fotógrafo pode ver/criar/editar/excluir seus próprios sets
create policy "photographer_own_sets" on job_photo_sets
  for all
  using (photographer_id = (select id from photographers where user_id = auth.uid()))
  with check (photographer_id = (select id from photographers where user_id = auth.uid()));

-- Acesso público para galeria do cliente (mesmo critério do jobs)
create policy "public_gallery_sets" on job_photo_sets
  for select
  using (
    exists (
      select 1 from jobs where jobs.id = job_photo_sets.job_id and jobs.gallery_enabled = true
    )
  );

-- Coluna photo_set_id na tabela site_images
alter table site_images add column if not exists photo_set_id uuid references job_photo_sets(id) on delete set null;
