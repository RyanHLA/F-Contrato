# Checklist de Produção

Tudo o que precisa ser configurado ou verificado antes de colocar o sistema em produção.
Organizado em ordem de execução recomendada.

---

## 1. Supabase — Secrets das Edge Functions

Os secrets são variáveis de ambiente injetadas nas Edge Functions em tempo de execução.
Nenhum desses valores é exposto ao frontend ou ao banco — ficam exclusivamente no runtime das funções.

**Onde configurar:** Supabase Dashboard → Edge Functions → Manage Secrets

---

### `ADMIN_ORIGIN`

**O que é:** A URL exata da sua aplicação de administração (o painel do fotógrafo).

**Para que serve:** A Edge Function `upload-url2` e a `create-checkout` usam esse valor para configurar o header `Access-Control-Allow-Origin` nas respostas HTTP (política de CORS). Sem isso, o navegador bloqueia as respostas das funções quando o frontend está num domínio diferente do Supabase.

**Valor atual (desenvolvimento):** `http://localhost:8081`

**Valor em produção:** A URL onde o painel será publicado, por exemplo:
```
https://admin.seudominio.com.br
```
ou
```
https://seudominio.com.br
```
Deve ser exatamente a origem sem barra no final.

---

### `R2_PUBLIC_URL`

**O que é:** A URL base pública do seu bucket no Cloudflare R2.

**Para que serve:** Após fazer o upload de uma foto para o R2, a Edge Function `upload-url2` monta a URL pública do arquivo concatenando esse valor com a key do objeto:
```
{R2_PUBLIC_URL}/{photographer_id}/gallery/timestamp-arquivo.webp
```
Essa URL é o que fica salvo no banco (`image_url`) e é carregada pelo navegador para exibir as fotos.

**Valor atual:** `https://pub-b7b7cd548cfb437baab792a010ccb6fb.r2.dev`

**Em produção:** Se você configurar um domínio personalizado no R2 (recomendado para velocidade e branding), atualize para:
```
https://fotos.seudominio.com.br
```
Se continuar usando o domínio público padrão do R2, o valor permanece o mesmo.

> **Como configurar domínio personalizado no R2:** Cloudflare Dashboard → R2 → seu bucket → Settings → Custom Domain.

---

### `R2_ENDPOINT`

**O que é:** O endpoint de API S3-compatível do seu bucket R2, usado pela Edge Function para gerar URLs pré-assinadas de upload e para deletar objetos.

**Para que serve:** O SDK AWS S3 (usado internamente) precisa saber para qual servidor enviar as operações. O R2 expõe uma API compatível com S3 nesse endpoint.

**Formato:**
```
https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

**Como encontrar:** Cloudflare Dashboard → R2 → seu bucket → Settings → S3 API → Endpoint.

**Muda em produção?** Geralmente não — o endpoint é fixo para sua conta Cloudflare. Mas verifique se o valor configurado no secret é o correto para o bucket de produção (se você tiver buckets separados para dev e prod).

---

### `R2_BUCKET_NAME`

**O que é:** O nome do bucket R2 onde as fotos são armazenadas.

**Para que serve:** A Edge Function usa esse nome para montar os comandos de upload (`PutObject`) e deleção (`DeleteObject`) enviados ao R2.

**Muda em produção?** Se você usa um bucket diferente para produção (boa prática: separar dev/prod), atualize aqui.

---

### `R2_ACCESS_KEY_ID` e `R2_SECRET_ACCESS_KEY`

**O que são:** Credenciais de acesso à API do R2, equivalentes às credenciais AWS S3.

**Para que servem:** Autenticam a Edge Function para fazer operações no R2 (gerar URL pré-assinada de upload e deletar objetos). Essas credenciais ficam exclusivamente no servidor (Edge Function) — nunca chegam ao navegador.

**Como gerar:** Cloudflare Dashboard → R2 → Manage R2 API Tokens → Create API Token.
- Tipo: `Object Read & Write`
- Escopo: restrito ao bucket de produção

**Muda em produção?** Se você criou tokens separados para dev e prod (recomendado), atualize com os tokens de produção.

---

### `ABACATEPAY_API_KEY`

**O que é:** Chave de API da sua conta no AbacatePay.

**Para que serve:** A Edge Function `create-checkout` usa essa chave para autenticar todas as chamadas à API do AbacatePay (criar cliente, criar assinatura, buscar planos). É enviada no header `Authorization: Bearer <chave>` em cada requisição.

**Atenção — Sandbox vs. Produção:** O AbacatePay tem ambientes separados. A chave de Sandbox começa com um prefixo diferente da chave de Produção. Certifique-se de usar a chave do ambiente **Produção** ao fazer o deploy.

**Como gerar:** AbacatePay Dashboard → API Keys → Nova Chave
- Escopo: `CUSTOMER:READ`, `CUSTOMER:CREATE`, `BILLING:READ`, `BILLING:CREATE`

---

### `ABACATEPAY_WEBHOOK_SECRET`

**O que é:** Uma senha/segredo que você define livremente e registra tanto no painel do AbacatePay quanto aqui como secret.

**Para que serve:** Segurança do webhook. Quando o AbacatePay envia um evento (ex: assinatura paga), ele assina o payload com esse segredo usando HMAC-SHA256 e envia a assinatura no header `x-webhook-secret`. A Edge Function `abacatepay-webhook` recalcula a assinatura localmente e só processa o evento se bater — impedindo que terceiros forjem eventos falsos (ex: simular um pagamento que não ocorreu).

**Como atualizar no AbacatePay:** Dashboard → Webhooks → editar seu webhook → campo "Secret do Webhook".

**Atenção:** O valor aqui e o valor cadastrado no AbacatePay devem ser idênticos. Se alterar um, altere o outro.

---

### `RESEND_API_KEY`

**O que é:** Chave de API do [Resend](https://resend.com), serviço de e-mail transacional.

**Para que serve:** A Edge Function `lifecycle-jobs` usa o Resend para enviar os e-mails automáticos do ciclo de retenção:
- **Dia 1 da suspensão:** avisa que a conta foi suspensa e os dados ficam 30 dias
- **Dia 15:** alerta que faltam 15 dias para a deleção permanente
- **Dia 27:** aviso crítico — faltam 3 dias
- **Dia 30:** confirmação de que os dados foram removidos

**Valor atual:** `temporario` (placeholder — e-mails não são enviados enquanto esse valor não for uma chave real)

**Como obter:** Resend.com → API Keys → Create API Key.

**Pré-requisito importante:** O Resend exige que você **verifique o domínio de envio** antes de enviar e-mails. Isso significa configurar registros DNS (SPF, DKIM) para o domínio que aparecerá como remetente.

---

### `APP_URL`

**O que é:** A URL base do painel de administração em produção.

**Para que serve:** A Edge Function `lifecycle-jobs` usa esse valor para montar os links nos e-mails de retenção, apontando para a página de reativação da assinatura:
```
{APP_URL}/billing?reason=suspended
```

**Valor atual:** `temporario` (placeholder)

**Valor em produção:**
```
https://admin.seudominio.com.br
```
ou a URL onde o painel estiver publicado.

---

### `LIFECYCLE_SECRET`

**O que é:** Um segredo que protege o endpoint da Edge Function `lifecycle-jobs` contra chamadas não autorizadas.

**Para que serve:** O `lifecycle-jobs` roda jobs críticos (suspender contas, deletar dados). Ele é chamado externamente pelo `pg_cron` (agendador do Supabase). O `LIFECYCLE_SECRET` é enviado no header `x-lifecycle-secret` nessas chamadas e verificado pela função — impedindo que qualquer um dispare os jobs manualmente.

**Muda em produção?** O valor pode ser o mesmo que em desenvolvimento, mas use um valor forte (UUID aleatório ou string longa). Certifique-se de que o `pg_cron` configurado usa o mesmo valor no header da chamada HTTP.

---

## 2. AbacatePay — Ambiente de Produção

### Trocar de Sandbox para Produção

Em desenvolvimento, o AbacatePay Sandbox expõe apenas o evento `billing.paid` em vez de `subscription.completed/renewed/cancelled`. Isso está tratado no código com uma normalização automática. Em produção, os eventos reais do AbacatePay serão enviados normalmente.

**Checklist:**
- [ ] Gerar nova API Key no ambiente **Produção** do AbacatePay
- [ ] Atualizar secret `ABACATEPAY_API_KEY` no Supabase com a chave de produção
- [ ] Criar novo webhook no AbacatePay apontando para a URL da sua Edge Function de produção:
  ```
  https://<project-ref>.supabase.co/functions/v1/abacatepay-webhook
  ```
- [ ] Configurar o evento `billing.paid` (e quaisquer outros disponíveis em produção)
- [ ] Definir um Secret forte para o webhook e atualizar `ABACATEPAY_WEBHOOK_SECRET`

### Cadastrar Produtos (Planos) em Produção

Os planos foram criados no AbacatePay Sandbox. Para produção:

1. Acesse o ambiente de **Produção** do AbacatePay
2. Recrie os produtos com os mesmos preços:
   - **Básico** — R$ 19,90/mês — 10 GB
   - **Pro** — R$ 59,90/mês — 50 GB
   - **Avançado** — R$ 89,90/mês — 100 GB
3. Copie os `product_id` gerados
4. Atualize a tabela `plans` no Supabase com os novos IDs:

```sql
-- Execute no SQL Editor do Supabase após recriar os produtos em produção
UPDATE public.plans SET abacatepay_product_id = 'prod_NOVO_ID_BASICO'   WHERE id = 'basico';
UPDATE public.plans SET abacatepay_product_id = 'prod_NOVO_ID_PRO'      WHERE id = 'pro';
UPDATE public.plans SET abacatepay_product_id = 'prod_NOVO_ID_AVANCADO' WHERE id = 'avancado';
```

---

## 3. Cloudflare R2 — Configurações de Produção

### CORS do bucket

Para que o navegador consiga fazer o `PUT` direto na URL pré-assinada, o bucket R2 precisa ter uma política CORS configurada.

**Onde configurar:** Cloudflare Dashboard → R2 → seu bucket → Settings → CORS Policy

```json
[
  {
    "AllowedOrigins": ["https://admin.seudominio.com.br"],
    "AllowedMethods": ["GET", "PUT", "DELETE"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

Substitua `https://admin.seudominio.com.br` pela URL real do seu painel.

### Domínio personalizado (opcional, recomendado)

Configurar um domínio personalizado para o bucket melhora a velocidade de carregamento (via Cloudflare CDN) e remove a dependência do domínio `.r2.dev`.

**Como configurar:** Cloudflare Dashboard → R2 → seu bucket → Settings → Custom Domain → Connect Domain
- Use um subdomínio como `fotos.seudominio.com.br`
- Após configurar, atualize `R2_PUBLIC_URL` no Supabase para esse domínio

---

## 4. Resend — Configuração de E-mail

### Verificar domínio de envio

O Resend não permite enviar e-mails de domínios não verificados.

1. Acesse Resend.com → Domains → Add Domain
2. Adicione o domínio (ex: `seudominio.com.br`)
3. Configure os registros DNS informados pelo Resend no seu provedor de DNS:
   - Registro SPF (TXT)
   - Registro DKIM (TXT)
   - Registro DMARC (TXT, opcional mas recomendado)

### Atualizar remetente no código

O remetente está hardcoded na Edge Function `lifecycle-jobs`:

```typescript
// supabase/functions/lifecycle-jobs/index.ts — linha 25
const FROM_EMAIL = "noreply@seudominio.com.br";
```

Atualize para um endereço do seu domínio verificado e faça redeploy da função.

---

## 5. Supabase — pg_cron (Jobs Agendados)

O `pg_cron` dispara os jobs de ciclo de vida automaticamente todo dia às 03:00 UTC via chamada HTTP para a Edge Function `lifecycle-jobs`.

### Verificar se o cron está ativo

Execute no SQL Editor do Supabase:

```sql
SELECT jobname, schedule, command, active
FROM cron.job
ORDER BY jobname;
```

Deve aparecer o job `lifecycle-daily`. Se não aparecer, recrie:

```sql
SELECT cron.schedule(
  'lifecycle-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url    := 'https://<project-ref>.supabase.co/functions/v1/lifecycle-jobs',
    headers := jsonb_build_object(
      'Content-Type',       'application/json',
      'x-lifecycle-secret', '<valor do LIFECYCLE_SECRET>'
    ),
    body   := '{"job": "all"}'::jsonb
  );
  $$
);
```

Substitua `<project-ref>` pelo ID do seu projeto Supabase e `<valor do LIFECYCLE_SECRET>` pelo secret configurado.

---

## 6. Frontend — Build e Deploy

### Variáveis de ambiente do Vite

O frontend usa variáveis de ambiente com prefixo `VITE_` definidas no arquivo `.env` (desenvolvimento) ou na plataforma de deploy (produção).

Verifique o arquivo `admin/src/integrations/supabase/client.ts` — ele usa `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Na plataforma de deploy (Vercel, Netlify, Cloudflare Pages etc.), configure essas variáveis:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<sua anon key pública>
```

> A `ANON_KEY` é pública — pode ser exposta no frontend. Ela não dá acesso privilegiado; o RLS do Supabase garante a segurança dos dados.

### Configurar roteamento SPA

O frontend usa React Router com histórico de navegação (`BrowserRouter`). Plataformas de hospedagem estática precisam ser configuradas para redirecionar todas as rotas para `index.html`.

**Netlify** — crie o arquivo `admin/public/_redirects`:
```
/*  /index.html  200
```

**Vercel** — crie `admin/vercel.json`:
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

**Cloudflare Pages** — crie `admin/public/_redirects`:
```
/*  /index.html  200
```

---

## 7. Checklist Final — Ordem de Execução

Execute nessa ordem para garantir que tudo funcione:

- [ ] **1.** Configurar domínio personalizado no R2 (opcional)
- [ ] **2.** Configurar CORS no bucket R2 com o domínio de produção
- [ ] **3.** Verificar domínio de e-mail no Resend
- [ ] **4.** Atualizar todos os Secrets no Supabase (seção 1 acima)
- [ ] **5.** Fazer redeploy de todas as Edge Functions após atualizar os secrets:
  - `upload-url2`
  - `create-checkout`
  - `abacatepay-webhook`
  - `lifecycle-jobs`
- [ ] **6.** Recriar produtos no AbacatePay Produção e atualizar tabela `plans`
- [ ] **7.** Criar webhook no AbacatePay Produção apontando para a Edge Function
- [ ] **8.** Fazer build e deploy do frontend com as variáveis de ambiente corretas
- [ ] **9.** Verificar cron job no Supabase (`pg_cron`)
- [ ] **10.** Testar fluxo completo:
  - Upload de foto → aparece na galeria
  - Criar álbum → copiar link → abrir em aba anônima → inserir PIN → selecionar fotos → enviar
  - Testar share token: copiar link com `?t=` → abrir sem PIN
  - Simular pagamento no AbacatePay Produção (modo teste) → verificar `account_status` no banco
