-- Credenciais OAuth do Mercado Pago por fotógrafo
alter table photographers
  add column if not exists mp_access_token  text default null,
  add column if not exists mp_refresh_token text default null,
  add column if not exists mp_user_id       text default null,
  add column if not exists mp_connected_at  timestamptz default null;

-- Configuração de fotos extras por job
alter table jobs
  add column if not exists extra_photo_enabled boolean not null default false,
  add column if not exists extra_photo_price   numeric(10,2) default null;

-- Compras de fotos extras
create table if not exists extra_photo_purchases (
  id                uuid primary key default gen_random_uuid(),
  job_id            uuid not null references jobs(id) on delete cascade,
  photographer_id   uuid not null references photographers(id) on delete cascade,
  client_token      text not null,           -- gallery_share_token ou session identifier
  quantity          int not null,
  unit_price        numeric(10,2) not null,
  amount_paid       numeric(10,2) not null,  -- total cobrado do cliente
  platform_fee      numeric(10,2) not null,  -- 2% para a Fotux
  mp_payment_id     text default null,
  mp_preference_id  text default null,
  status            text not null default 'pending'
                      check (status in ('pending','approved','rejected','cancelled')),
  notified_at       timestamptz default null, -- quando notificou o fotógrafo
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- RLS: fotógrafo só vê suas próprias compras
alter table extra_photo_purchases enable row level security;

create policy "photographer_own_purchases" on extra_photo_purchases
  for all using (
    photographer_id = (
      select id from photographers where user_id = auth.uid()
    )
  );

-- Índices
create index if not exists extra_photo_purchases_job_id_idx on extra_photo_purchases(job_id);
create index if not exists extra_photo_purchases_mp_payment_id_idx on extra_photo_purchases(mp_payment_id);
create index if not exists extra_photo_purchases_status_idx on extra_photo_purchases(status);
