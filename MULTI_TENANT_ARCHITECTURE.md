# Plano de Arquitetura Multi-Tenant

## Contexto da Arquitetura Atual

O sistema hoje é **single-tenant**: um único fotógrafo (admin), um único bucket R2, sem separação de dados por tenant. A transição para multi-tenant exige mudanças em banco, storage, autenticação e roteamento.

---

## Sumário

1. [Estratégia de Multi-Tenancy no Supabase (RLS)](#1-estratégia-de-multi-tenancy-no-supabase-rls)
2. [Gestão de Planos e Assinaturas (AbacatePay)](#2-gestão-de-planos-e-assinaturas-abacatepay)
3. [Fluxo de Upload e Storage (R2)](#3-fluxo-de-upload-e-storage-r2)
4. [Políticas de Segurança Completas](#4-políticas-de-segurança-completas)
5. [Experiência do Cliente Final](#5-experiência-do-cliente-final)
6. [Ordem de Implementação Recomendada](#ordem-de-implementação-recomendada)
7. [Decisões Arquiteturais Chave](#decisões-arquiteturais-chave)

---

## 1. Estratégia de Multi-Tenancy no Supabase (RLS)

### Modelo: Row-Level Tenancy com `photographer_id`

A abordagem mais simples e segura no Supabase é **não criar schemas separados** por tenant, mas adicionar uma coluna `photographer_id` em todas as tabelas e deixar o RLS fazer o isolamento automaticamente.

```
Esquema atual:          Esquema multi-tenant:
albums                  albums
  id                      id
  title         →         title
  ...                     photographer_id  ← FK → photographers.id
                          ...
```

### Nova tabela: `photographers`

```sql
CREATE TABLE public.photographers (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug                        TEXT UNIQUE NOT NULL,  -- ex: "joao-silva" → rota pública
  name                        TEXT NOT NULL,
  email                       TEXT NOT NULL,

  -- Ciclo de vida da conta (ver seção "Ciclo de Vida e Retenção de Dados")
  account_status              TEXT NOT NULL DEFAULT 'trial'
                                CHECK (account_status IN ('trial', 'active', 'suspended')),
  trial_ends_at               TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days'),
  trial_used                  BOOLEAN NOT NULL DEFAULT false,  -- true após expirar; impede novo trial

  -- Suspensão: preenchido quando account_status passa a 'suspended'
  suspended_at                TIMESTAMPTZ,          -- instante em que foi suspenso
  data_deletion_scheduled_at  TIMESTAMPTZ,          -- suspended_at + 30 dias

  -- AbacatePay
  abacatepay_customer_id      TEXT UNIQUE,
  abacatepay_subscription_id  TEXT,

  storage_used_bytes          BIGINT NOT NULL DEFAULT 0,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE UNIQUE INDEX idx_photographers_user_id       ON photographers(user_id);
CREATE UNIQUE INDEX idx_photographers_abacatepay_id ON photographers(abacatepay_customer_id);
-- Usado pelo job de limpeza para encontrar contas prontas para deleção
CREATE INDEX idx_photographers_deletion_scheduled   ON photographers(data_deletion_scheduled_at)
  WHERE data_deletion_scheduled_at IS NOT NULL;
```

> **`account_status` — estados possíveis:**
>
> | Status | Quem pode acessar o painel | Upload permitido | Condição |
> |---|---|---|---|
> | `trial` | Sim | Sim (até 10 GB) | Primeiros 14 dias após cadastro |
> | `active` | Sim | Sim (limite do plano) | Assinatura paga e vigente |
> | `suspended` | Não (tela de bloqueio) | Não | Trial expirado **ou** pagamento não renovado/cancelado |
>
> O campo `plan` foi removido — planos são resolvidos diretamente pelo `abacatepay_subscription_id` ativo (via tabela `plans` ligada ao `abacatepay_product_id`). Não existe mais estado "free" permanente.

### Alterações nas tabelas existentes

```sql
-- Adicionar photographer_id em todas as tabelas de conteúdo
ALTER TABLE albums      ADD COLUMN photographer_id UUID REFERENCES photographers(id) ON DELETE CASCADE;
ALTER TABLE site_images ADD COLUMN photographer_id UUID REFERENCES photographers(id) ON DELETE CASCADE;
ALTER TABLE audit_log   ADD COLUMN photographer_id UUID REFERENCES photographers(id) ON DELETE SET NULL;

-- Índices para performance (RLS filtra por essa coluna em toda query)
CREATE INDEX idx_albums_photographer_id      ON albums(photographer_id);
CREATE INDEX idx_site_images_photographer_id ON site_images(photographer_id);
```

### Função auxiliar para o RLS

```sql
-- Retorna o photographer_id do usuário logado. Resultado é cacheado por transação.
-- Criada em public (não em auth) pois o Supabase Cloud restringe o schema auth.
CREATE OR REPLACE FUNCTION public.current_photographer_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.photographers WHERE user_id = auth.uid() LIMIT 1;
$$;
```

> **Por que `SECURITY DEFINER` aqui?** A função lê `photographers` como super-user, evitando recursão de RLS e garantindo performance com o índice.

### Políticas RLS

#### Tabela `photographers`

```sql
ALTER TABLE photographers ENABLE ROW LEVEL SECURITY;

-- Fotógrafo vê apenas seu próprio perfil
CREATE POLICY "photographer_select_own"
  ON photographers FOR SELECT
  USING (user_id = auth.uid());

-- Fotógrafo atualiza apenas seu próprio perfil
-- (account_status é gerenciado exclusivamente via webhook AbacatePay e jobs internos)
CREATE POLICY "photographer_update_own"
  ON photographers FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    -- Campos de ciclo de vida são imutáveis pelo próprio fotógrafo
    AND account_status           = (SELECT account_status           FROM photographers WHERE user_id = auth.uid())
    AND trial_used               = (SELECT trial_used               FROM photographers WHERE user_id = auth.uid())
    AND suspended_at             IS NOT DISTINCT FROM (SELECT suspended_at             FROM photographers WHERE user_id = auth.uid())
    AND data_deletion_scheduled_at IS NOT DISTINCT FROM (SELECT data_deletion_scheduled_at FROM photographers WHERE user_id = auth.uid())
  );
```

#### Tabela `albums`

```sql
ALTER TABLE albums ENABLE ROW LEVEL SECURITY;

-- Fotógrafo vê apenas seus álbuns
CREATE POLICY "albums_photographer_select"
  ON albums FOR SELECT
  USING (photographer_id = public.current_photographer_id());

CREATE POLICY "albums_photographer_insert"
  ON albums FOR INSERT
  WITH CHECK (photographer_id = public.current_photographer_id());

CREATE POLICY "albums_photographer_update"
  ON albums FOR UPDATE
  USING (photographer_id = public.current_photographer_id());

CREATE POLICY "albums_photographer_delete"
  ON albums FOR DELETE
  USING (photographer_id = public.current_photographer_id());

-- Cliente final vê álbum específico (sem autenticação Supabase)
CREATE POLICY "albums_client_public_view"
  ON albums FOR SELECT
  USING (client_enabled = true);
```

#### Tabela `site_images`

```sql
ALTER TABLE site_images ENABLE ROW LEVEL SECURITY;

-- Fotógrafo gerencia apenas suas imagens
CREATE POLICY "images_photographer_all"
  ON site_images FOR ALL
  USING (photographer_id = public.current_photographer_id())
  WITH CHECK (photographer_id = public.current_photographer_id());

-- Imagens de álbuns com client_enabled são visíveis ao cliente final
CREATE POLICY "images_client_view"
  ON site_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM albums
      WHERE albums.id = site_images.album_id
        AND albums.client_enabled = true
    )
  );
```

---

## 2. Gestão de Planos e Assinaturas (AbacatePay)

> **Gateway:** [AbacatePay](https://abacatepay.com) — suporte a PIX (pagamento único) e cartão (assinaturas recorrentes).
> Base URL da API: `https://api.abacatepay.com/v2` | Auth: `Authorization: Bearer <API_KEY>`

### Definição de planos e quotas

Não existe mais plano gratuito permanente. Os planos são apenas os produtos pagos cadastrados no AbacatePay, mais o estado especial `trial`.

```sql
CREATE TABLE public.plans (
  id                        TEXT PRIMARY KEY,  -- 'trial', 'basico', 'pro', 'avancado'
  name                      TEXT NOT NULL,
  price_brl                 NUMERIC(8,2) NOT NULL DEFAULT 0,  -- preço em reais (0 = grátis)
  max_albums                INTEGER NOT NULL,  -- -1 = ilimitado
  max_storage_gb            INTEGER NOT NULL,
  max_photos_per_album      INTEGER NOT NULL,  -- -1 = ilimitado
  abacatepay_product_id     TEXT              -- NULL apenas para 'trial'
);

INSERT INTO plans (id, name, price_brl, max_albums, max_storage_gb, max_photos_per_album, abacatepay_product_id) VALUES
  ('trial',    'Período Teste', 0.00,  -1,  10,  500,  NULL),
  ('basico',   'Básico',        19.90, -1,  10,  500,  'prod_xxx'),
  ('pro',      'Pro',           59.90, -1,  50,  1000, 'prod_yyy'),
  ('avancado', 'Avançado',      89.90, -1,  100, -1,   'prod_zzz');
```

> **Resolução do plano ativo:** em vez de uma coluna `plan` em `photographers`, o plano vigente é derivado do `abacatepay_subscription_id` consultando a tabela `plans` via `abacatepay_product_id`. Durante o trial, `account_status = 'trial'` e o plano de quotas utilizado é o registro `'trial'` da tabela acima.

> Os produtos `prod_xxx` / `prod_yyy` são criados no AbacatePay com `cycle: MONTHLY` (ou `ANNUALLY`). Somente **cartão** suporta ciclos recorrentes; PIX pode ser usado para pagamentos únicos via `/transparents/create`.

### Fluxo de assinatura

```
1. Fotógrafo clica "Fazer Upgrade"
   └─ Frontend chama Edge Function /create-checkout

2. Edge Function: create-checkout
   ├─ Verifica auth.uid() → busca photographers.abacatepay_customer_id
   ├─ Se não existe:
   │   POST https://api.abacatepay.com/v2/customers/create
   │   { email, name, tax_id (CPF/CNPJ) }
   │   └─ Salva customer.id em photographers.abacatepay_customer_id
   │
   ├─ POST https://api.abacatepay.com/v2/subscriptions/create
   │   {
   │     items: [{ productId: plan.abacatepay_product_id, quantity: 1 }],
   │     customerId: abacatepay_customer_id,
   │     returnUrl: "<url de cancelamento>",
   │     completionUrl: "<url de sucesso>",
   │     externalId: photographer_id          ← para correlacionar no webhook
   │   }
   └─ Retorna { url } → frontend redireciona para checkout do AbacatePay

3. AbacatePay processa pagamento → dispara webhook para Edge Function

4. Edge Function: abacatepay-webhook
   ├─ Valida assinatura HMAC do payload
   │
   ├─ Evento: subscription.completed  (primeira ativação ou reativação)
   │   └─ UPDATE photographers SET
   │        account_status              = 'active',
   │        abacatepay_subscription_id  = data.id,
   │        trial_used                  = true,   -- garante que trial não pode ser reutilizado
   │        suspended_at                = NULL,
   │        data_deletion_scheduled_at  = NULL
   │      WHERE id = data.externalId
   │
   ├─ Evento: subscription.renewed  (cobrança recorrente confirmada)
   │   └─ UPDATE photographers SET account_status = 'active'
   │      WHERE abacatepay_subscription_id = data.id
   │      -- Mantém conta ativa; não altera datas de suspensão (já eram NULL)
   │
   └─ Evento: subscription.cancelled  (cancelamento ou falha de renovação)
       └─ UPDATE photographers SET
            account_status              = 'suspended',
            suspended_at                = now(),
            data_deletion_scheduled_at  = now() + INTERVAL '30 days'
          WHERE abacatepay_subscription_id = data.id
          -- NÃO apaga dados imediatamente — retenção de 30 dias (ver seção abaixo)
```

### Ciclo de Vida da Conta e Retenção de Dados

```
[Cadastro]
    │
    ▼
[trial] ──── 14 dias ────► [trial expirado]
    │                            │
    │ assina                     │ não assinou
    ▼                            ▼
[active] ◄──────────────── [suspended] ──── 30 dias ────► [DELEÇÃO PERMANENTE]
    │                            ▲
    │ cancela /                  │
    │ falha na renovação         │
    └────────────────────────────┘
```

#### Expiração do Trial (job `expire-trials`)

Rodar **diariamente** via `pg_cron` ou Supabase Scheduled Functions:

```sql
-- Suspende contas em trial que ultrapassaram trial_ends_at
UPDATE photographers
SET
  account_status             = 'suspended',
  trial_used                 = true,
  suspended_at               = now(),
  data_deletion_scheduled_at = now() + INTERVAL '30 days'
WHERE
  account_status = 'trial'
  AND trial_ends_at < now();
```

> `trial_used = true` garante que, mesmo que o fotógrafo se recadastre com o mesmo `user_id`, o trial não é concedido novamente. A verificação é feita no INSERT de `photographers`:
> ```sql
> -- Trigger no INSERT: bloqueia trial duplo para o mesmo e-mail
> -- (checar auth.users.email contra histórico, se necessário via tabela de controle)
> ```

#### E-mails da Janela de 30 Dias (job `send-retention-emails`)

Após `suspended_at`, quatro e-mails transacionais são disparados. O job roda **diariamente** e seleciona contas pelo número de dias decorridos desde `suspended_at`:

| Dia pós-suspensão | Gatilho SQL | Assunto |
|---|---|---|
| 1 | `suspended_at::date = now()::date - 0` | Notificação de Bloqueio |
| 15 | `suspended_at::date = now()::date - 14` | Primeiro Aviso de Alerta |
| 27 | `suspended_at::date = now()::date - 26` | Ultimato (Crítico) |
| 30 | `data_deletion_scheduled_at::date = now()::date` | Confirmação de Limpeza |

```sql
-- Exemplo: selecionar contas para e-mail do Dia 15
SELECT id, email, name
FROM photographers
WHERE account_status = 'suspended'
  AND (now() - suspended_at) >= INTERVAL '14 days'
  AND (now() - suspended_at) <  INTERVAL '15 days';
```

> Os e-mails são enviados via Supabase Edge Function que chama o provedor de e-mail transacional (ex.: Resend, SendGrid). Cada job deve registrar o envio em uma tabela `email_log` para garantir idempotência — reexecuções não enviam duplicatas.

#### Deleção Permanente (job `delete-expired-accounts`)

Rodar **diariamente**. Para cada conta com `data_deletion_scheduled_at <= now()`:

```typescript
// Edge Function: delete-expired-accounts
const { data: expired } = await supabase
  .from('photographers')
  .select('id, abacatepay_customer_id')
  .lte('data_deletion_scheduled_at', new Date().toISOString())
  .eq('account_status', 'suspended');

for (const photographer of expired) {
  // 1. Listar e deletar todos os objetos do R2 com prefixo do tenant
  await deleteR2Prefix(`${photographer.id}/`);

  // 2. Deletar dados do banco em cascata
  //    ON DELETE CASCADE em albums, site_images, audit_log já cobre os filhos
  await supabase.from('photographers').delete().eq('id', photographer.id);

  // 3. (Opcional) arquivar registro mínimo para fins legais/fiscais
  //    antes de deletar, inserir em tabela `deleted_accounts` com email + data
}
```

> **Cascade:** a deleção de `photographers` remove automaticamente `albums`, `site_images` e `audit_log` pelo `ON DELETE CASCADE` já definido nas FKs. Os objetos no R2 precisam de limpeza manual pois não há FK entre Postgres e R2.

#### Verificação de `account_status` no middleware

Todo request autenticado ao painel do fotógrafo deve verificar o status **antes** de processar qualquer operação:

```typescript
// Middleware: check-account-status
const { data: photographer } = await supabase
  .from('photographers')
  .select('account_status, trial_ends_at')
  .eq('user_id', userId)
  .single();

if (photographer.account_status === 'trial' && photographer.trial_ends_at < new Date()) {
  // Trial expirou mas o job ainda não rodou — bloquear proativamente
  return redirect('/billing?reason=trial_expired');
}

if (photographer.account_status === 'suspended') {
  return redirect('/billing?reason=suspended');
}
```

#### Pagamento avulso via PIX (opcional — plano pré-pago)

Para um fluxo de upgrade pontual sem cartão, use o checkout transparente:

```
POST https://api.abacatepay.com/v2/transparents/create
{ amount: <valor em centavos>, externalId: photographer_id, customerId: ... }

└─ Retorna { qrCode, qrCodeImage }
   Frontend exibe QR Code → cliente paga no app do banco
   Webhook: transparent.completed → ativa plano temporariamente
```

### Verificação de quotas antes do upload

```typescript
// Edge Function: upload-url2 (trecho de verificação de quota)
async function checkQuota(photographerId: string, fileSizeBytes: number) {
  const { data: photographer } = await supabase
    .from('photographers')
    .select('account_status, abacatepay_subscription_id, storage_used_bytes')
    .eq('id', photographerId)
    .single();

  // Conta suspensa: bloquear imediatamente
  if (photographer.account_status === 'suspended') {
    throw new Error('ACCOUNT_SUSPENDED: Reactivate your subscription to upload');
  }

  // Resolver plano: trial → plano 'trial'; active → buscar via subscription
  let planId: string;
  if (photographer.account_status === 'trial') {
    planId = 'trial';
  } else {
    // Buscar product_id da assinatura ativa no AbacatePay e cruzar com plans
    const { data: sub } = await abacatePayClient.subscriptions.get(
      photographer.abacatepay_subscription_id
    );
    const { data: matchedPlan } = await supabase
      .from('plans')
      .select('id')
      .eq('abacatepay_product_id', sub.items[0].productId)
      .single();
    planId = matchedPlan.id;
  }

  const { data: plan } = await supabase
    .from('plans')
    .select('max_storage_gb, max_albums')
    .eq('id', planId)
    .single();

  const maxBytes = plan.max_storage_gb * 1024 * 1024 * 1024;
  if (maxBytes !== -1 && photographer.storage_used_bytes + fileSizeBytes > maxBytes) {
    throw new Error('QUOTA_EXCEEDED: Storage limit reached');
  }
}

// Após upload bem-sucedido: incrementar contador atomicamente
// IMPORTANTE: se esta chamada falhar após o R2 já ter recebido o arquivo,
// o contador ficará desatualizado. Ver seção "Consistência do contador" abaixo.
await supabase.rpc('increment_storage_used', {
  p_photographer_id: photographerId,
  p_bytes: fileSizeBytes
});
```

### Função atômica de controle de storage

```sql
-- Evita race condition em uploads paralelos
CREATE OR REPLACE FUNCTION increment_storage_used(
  p_photographer_id UUID,
  p_bytes           BIGINT
) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE photographers
  SET storage_used_bytes = storage_used_bytes + p_bytes
  WHERE id = p_photographer_id;
$$;

-- Decremento chamado ao deletar arquivo (photo, hero, about, etc.)
CREATE OR REPLACE FUNCTION decrement_storage_used(
  p_photographer_id UUID,
  p_bytes           BIGINT
) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE photographers
  SET storage_used_bytes = GREATEST(0, storage_used_bytes - p_bytes)
  WHERE id = p_photographer_id;
$$;
-- GREATEST(0, ...) evita saldo negativo caso o contador já esteja dessincronizado.
```

### Consistência do contador de storage

O contador `storage_used_bytes` é **melhor-esforço**: a operação no R2 e o UPDATE no Postgres são dois sistemas independentes — não existe transação distribuída entre eles. Os dois cenários de divergência e como mitigá-los:

| Cenário | Efeito | Mitigação |
|---|---|---|
| Upload no R2 ok → `increment_storage_used` falha | Contador subestimado (fotógrafo "ganha" espaço fantasma) | Job de reconciliação periódico recalcula o total real |
| `decrement_storage_used` falha após delete no R2 | Contador superestimado (fotógrafo perde espaço "fantasma") | Mesmo job de reconciliação corrige |
| Ambos falham | Nenhum efeito líquido | — |

**Job de reconciliação (recomendado — rodar 1×/dia via cron ou Supabase pg_cron):**

```sql
-- Recalcula storage_used_bytes somando o tamanho real dos arquivos registrados no banco.
-- Requer que site_images.file_size_bytes seja preenchido no INSERT.
UPDATE photographers p
SET storage_used_bytes = COALESCE((
  SELECT SUM(si.file_size_bytes)
  FROM site_images si
  WHERE si.photographer_id = p.id
), 0);
```

> **Pré-requisito:** a tabela `site_images` precisa ter a coluna `file_size_bytes BIGINT NOT NULL DEFAULT 0`. O valor deve ser persistido no INSERT do registro (disponível na resposta do pré-signed URL ou enviado pelo frontend junto com o `key`).

**Fluxo de delete com decremento:**

```typescript
// Edge Function: delete-image
async function handleDelete(photographerId: string, key: string, fileSizeBytes: number) {
  // 1. Valida ownership do prefixo (já documentado na seção R2)
  if (!key.startsWith(`${photographerId}/`)) {
    throw new Error('FORBIDDEN');
  }

  // 2. Delete no R2 primeiro — se falhar, nada é alterado no banco
  await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));

  // 3. Remove registro do banco + decrementa contador atomicamente
  //    Usar uma única transação garante que os dois ou nenhum ocorra
  await supabase.rpc('delete_image_and_decrement', {
    p_photographer_id: photographerId,
    p_key: key,
    p_bytes: fileSizeBytes
  });
}
```

```sql
-- Agrupa DELETE em site_images + decremento em uma única transação
CREATE OR REPLACE FUNCTION delete_image_and_decrement(
  p_photographer_id UUID,
  p_key             TEXT,
  p_bytes           BIGINT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM site_images
  WHERE key = p_key AND photographer_id = p_photographer_id;

  UPDATE photographers
  SET storage_used_bytes = GREATEST(0, storage_used_bytes - p_bytes)
  WHERE id = p_photographer_id;
END;
$$;
```

> **Por que delete no R2 antes do banco?** Se o banco falhar após o R2 já ter deletado, o job de reconciliação corrige o contador na próxima execução. Se fosse o inverso (banco primeiro, R2 falha), o arquivo continuaria ocupando espaço real sem registro — muito mais difícil de detectar.

---

## 3. Fluxo de Upload e Storage (R2)

### Estrutura de prefixos no bucket

Em vez de buckets separados por tenant (caro e complexo), use **prefixos por tenant** em um único bucket:

```
site-images/                              ← bucket único no R2
  {photographer_id}/                      ← isolamento por tenant
    albums/
      {album_id}/
        {timestamp}-{filename}.jpg
    hero/
      {timestamp}-{filename}.jpg
    about/
      {timestamp}-{filename}.jpg
```

**Exemplo real:**
```
site-images/
  3f2a1b.../albums/abc123.../1711234567-casamento.jpg
  9e8d7c.../albums/def456.../1711234568-gestante.jpg
```

### Edge Function `upload-url2` atualizada

```typescript
// 1. Verifica JWT e obtém photographer_id
const photographer = await getPhotographerFromToken(req.headers.get('Authorization'));

// 2. Verifica quota ANTES de gerar a URL (falha rápido)
await checkQuota(photographer.id, fileSize);

// 3. Gera chave com prefixo do tenant
//    Fotógrafo nunca pode sobrescrever arquivos de outro
const key = `${photographer.id}/${folder}/${Date.now()}-${sanitizeFilename(filename)}`;

// 4. Gera pre-signed URL com expiração curta (5 minutos)
const url = await getSignedUrl(r2Client, new PutObjectCommand({
  Bucket: R2_BUCKET_NAME,
  Key: key,
  ContentType: contentType,
  ContentLength: fileSize,
}), { expiresIn: 300 });

// 5. Retorna URL + key para o frontend registrar no banco
return { uploadUrl: url, publicUrl: `${R2_PUBLIC_URL}/${key}`, key };
```

### Validação de prefixo no delete

```typescript
// DELETE: nunca confiar no key enviado pelo frontend — sempre revalidar ownership
async function handleDelete(photographerId: string, key: string) {
  if (!key.startsWith(`${photographerId}/`)) {
    throw new Error('FORBIDDEN: Cannot delete another photographer\'s files');
  }
  await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
}
```

---

## 4. Políticas de Segurança Completas

### Tabela `client_selections`

```sql
-- Cliente acessa seleções via token de sessão (sem photographer_id direto)
-- A segurança é garantida pelo album_id + session token

CREATE POLICY "client_select_own_album_selections"
  ON client_selections FOR SELECT
  USING (
    -- Fotógrafo vê seleções dos seus próprios álbuns
    EXISTS (
      SELECT 1 FROM albums
      WHERE albums.id = client_selections.album_id
        AND albums.photographer_id = public.current_photographer_id()
    )
    OR
    -- Cliente com token de sessão válido
    is_valid_client_session(
      NULLIF(current_setting('app.client_token', true), '')::UUID,
      album_id
    )
  );
```

### Tabela `client_sessions`

```sql
-- Fotógrafo vê apenas sessões dos seus próprios álbuns
CREATE POLICY "photographer_view_own_sessions"
  ON client_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM albums
      WHERE albums.id = client_sessions.album_id
        AND albums.photographer_id = public.current_photographer_id()
    )
  );
```

### Checklist de isolamento por RLS

| Tabela | Fotógrafo A vê dados do B? | Cliente vê outro álbum? | Sem auth vê? |
|---|---|---|---|
| `photographers` | Não — filtra por `user_id` | N/A | Não (conta suspensa: acesso bloqueado no middleware) |
| `albums` | Não — filtra por `photographer_id` | Não — filtra por `album_id` | Apenas `client_enabled = true` |
| `site_images` | Não — filtra por `photographer_id` | Não — join com `albums` | Apenas via álbum público |
| `client_selections` | Não — join com `albums` | Não — session token + `album_id` | Não |
| `audit_log` | Não — filtra por `photographer_id` | N/A | Não |

---

## 5. Experiência do Cliente Final

### Estrutura de rotas

```
Rotas do fotógrafo (autenticado):
  /[slug]/admin                → Dashboard
  /[slug]/admin/albums         → Gestão de álbuns

Rotas do cliente (públicas):
  /p/[slug]/[albumId]          → Acesso ao álbum (exige PIN ou share token)
  /p/[slug]/[albumId]/view     → Galeria após autenticação por PIN
```

### Fluxo de acesso seguro do cliente (PIN)

```
Cliente recebe link: https://app.com/p/joao-silva/abc-123

1. Frontend carrega metadados do álbum
   └─ SELECT com client_enabled = true → não exige auth Supabase

2. Exibe tela de PIN

3. Cliente digita PIN:
   supabase.rpc('verify_album_pin', { album_uuid: 'abc-123', pin_attempt: '1234' })
   └─ Retorna session token (UUID) ou null

4. Token salvo em sessionStorage
   └─ Chave: `client_token_{albumId}`
   └─ sessionStorage: fecha a aba = perde acesso (mais seguro que localStorage)

5. supabase.rpc('set_client_token', { p_token: token })
   └─ Configura variável de sessão Postgres para o RLS

6. RLS permite SELECT/INSERT em client_selections para esse album_id

7. Cliente seleciona fotos e submete
   └─ supabase.rpc('submit_client_selections', { p_album_id, p_token })
      └─ Define client_submitted_at = now() (torna seleção imutável)
```

### Opção alternativa: link com share token (sem PIN)

Para álbuns onde o fotógrafo prefere link direto sem senha:

```sql
ALTER TABLE albums ADD COLUMN share_token UUID DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX idx_albums_share_token ON albums(share_token);
```

```
Link compartilhado:
  /p/joao-silva/abc-123?t=550e8400-e29b-41d4-a716-446655440000

Fluxo:
  1. Frontend extrai parâmetro ?t= da URL
  2. Edge Function valida share_token → emite session token
  3. Fluxo continua idêntico ao de PIN a partir do passo 4
```

---

## Ordem de Implementação Recomendada

```
Fase 1 — Base Multi-tenant (1-2 semanas)
  ├─ Migration: criar tabela photographers
  ├─ Migration: adicionar photographer_id em albums, site_images, audit_log
  ├─ Migration: função public.current_photographer_id() + novas políticas RLS
  ├─ Seed: migrar dados existentes para o primeiro fotógrafo
  └─ Testar isolamento com dois usuários de teste

Fase 2 — Storage por Tenant (3-4 dias)
  ├─ Atualizar Edge Function upload-url2 com prefixo por photographer_id
  ├─ Validação de prefixo no delete
  └─ Migrar arquivos existentes (script de rename no R2)

Fase 3 — Planos, AbacatePay e Ciclo de Vida (2-3 semanas)
  ├─ Criar tabela plans (trial, pro, enterprise) com abacatepay_product_id
  ├─ Adicionar colunas account_status, trial_ends_at, trial_used,
  │   suspended_at, data_deletion_scheduled_at em photographers
  ├─ Criar produtos recorrentes no painel do AbacatePay (cycle: MONTHLY)
  ├─ Edge Functions: create-checkout, abacatepay-webhook
  ├─ Middleware de bloqueio por account_status
  ├─ Verificação de quota no upload (sem campo plan)
  ├─ Funções increment_storage_used / decrement_storage_used
  ├─ Jobs periódicos: expire-trials, send-retention-emails, delete-expired-accounts
  ├─ Tabela email_log para idempotência dos e-mails
  └─ UI de upgrade + tela de bloqueio (billing page)

Fase 4 — Rotas Públicas por Fotógrafo (1 semana)
  ├─ Adicionar slug na tabela photographers
  ├─ Atualizar rotas: /p/[slug]/[albumId]
  ├─ Share token como alternativa ao PIN
  └─ UI de acesso do cliente
```

---

## Decisões Arquiteturais Chave

| Decisão | Escolha adotada | Alternativa descartada | Motivo |
|---|---|---|---|
| Isolamento de DB | RLS com `photographer_id` | Schema por tenant | Schema por tenant é complexo demais no Supabase gerenciado |
| Storage | Prefixo por tenant no R2 | Bucket por tenant | Pré-signed URLs com prefixo são mais simples; custo não escala por bucket |
| Planos | Trial 14 dias + assinatura paga; sem plano free permanente | Plano free após trial | Evita "limbo de over-quota" e simplifica estados: apenas `trial`, `active`, `suspended` |
| Downgrade / cancelamento | Suspensão imediata + retenção 30 dias + deleção automática | Downgrade para free com over-quota | Sem estado ambíguo; dados ficam seguros por 30 dias para recuperação via reativação |
| E-mails de retenção | Job diário com 4 disparos escalonados (dia 1, 15, 27, 30) | E-mail único de cancelamento | Maximiza chance de reativação e cumpre boa prática de avisar antes de apagar dados |
| Planos pagos | Tabela `plans` + AbacatePay webhooks | Limites hard-coded no código | Permite alterar quotas sem novo deploy; AbacatePay suporta PIX + cartão recorrente |
| Auth cliente | Session token + PIN (já implementado) | OAuth / conta completa | Cliente final não tem conta — PIN é a UX ideal para proofing |
| Quotas | Contador atômico no Postgres | Contar objetos via API do R2 | Contar no R2 é lento e custa uma API call por verificação |
