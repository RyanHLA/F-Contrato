# Especificação da Landing Page

Documento técnico completo para desenvolvimento da landing page do produto.
Cobre briefing do produto, identidade visual, tecnologia, estrutura de seções,
integrações, fluxos de autenticação e tudo o que é necessário para conectar
corretamente ao sistema existente.

---

## Sumário

0. [Briefing do Produto](#0-briefing-do-produto)
1. [Tecnologia Recomendada](#1-tecnologia-recomendada)
2. [Estrutura de Repositório](#2-estrutura-de-repositório)
3. [Variáveis de Ambiente](#3-variáveis-de-ambiente)
4. [Dependências Necessárias](#4-dependências-necessárias)
5. [Seções da Página](#5-seções-da-página)
6. [Fluxos de Autenticação](#6-fluxos-de-autenticação)
7. [Integração com Supabase](#7-integração-com-supabase)
8. [Integração com AbacatePay (Checkout)](#8-integração-com-abacatepay-checkout)
9. [Redirecionamento para o Painel](#9-redirecionamento-para-o-painel)
10. [Roteamento e Páginas](#10-roteamento-e-páginas)
11. [Configuração de Deploy](#11-configuração-de-deploy)
12. [Checklist de Integração](#12-checklist-de-integração)

---

## 0. Briefing do Produto

### O que é o produto

É uma plataforma SaaS voltada exclusivamente para **fotógrafos profissionais**
— especialmente os que atuam em casamentos, ensaios e eventos — que precisam
entregar provas fotográficas aos seus clientes de forma organizada, segura e
profissional, sem depender de Google Drive, WeTransfer ou aplicativos genéricos.

O fotógrafo cria uma conta, faz upload das fotos diretamente no painel, organiza
em álbuns e compartilha um link com PIN para que o cliente acesse, visualize e
selecione as fotos favoritas. O fotógrafo então recebe a seleção pronta, sem
troca de mensagens no WhatsApp, sem planilhas, sem confusão.

---

### O problema que resolve

> "Hoje eu mando 800 fotos no Google Drive, o cliente não sabe navegar, fica
> mandando mensagem me pedindo para marcar qual quer, e eu perco horas
> organizando isso no WhatsApp."

Esse é o cenário atual da maioria dos fotógrafos. O sistema resolve:

| Dor atual | Como o sistema resolve |
|---|---|
| Cliente se perde em pastas do Drive | Galeria visual dedicada, organizada por álbum |
| Seleção por WhatsApp é caótica | Cliente clica nas fotos e envia a seleção de uma vez |
| Link do Drive pode vazar | Acesso protegido por PIN personalizado |
| Cada fotógrafo usa uma solução diferente | Plataforma única, padronizada e profissional |
| Fotos espalhadas em vários serviços | Tudo centralizado: upload, organização e entrega |

---

### Público-alvo

**Primário:** Fotógrafos freelancers e pequenos estúdios que fotografam casamentos,
ensaios de noivas, debutantes, gestantes, famílias e eventos sociais no Brasil.

**Perfil típico:**
- Trabalha sozinho ou com 1 assistente
- Entrega entre 300 e 1.500 fotos por trabalho
- Usa WhatsApp como principal canal de comunicação com clientes
- Não tem equipe de TI — precisa de algo simples de usar
- Fatura entre R$ 3.000 e R$ 15.000 por mês

---

### Proposta de valor central

**"Entregue provas fotográficas de forma profissional. Seu cliente seleciona,
você recebe. Simples assim."**

Mensagens de apoio:
- Nenhum cliente seu precisará criar conta ou instalar nada
- Você define quantas fotos o cliente pode selecionar
- Seus álbuns ficam seguros na nuvem, organizados por trabalho
- Tudo no seu próprio painel, com sua identidade

---

### Identidade Visual

O sistema tem uma estética **elegante, minimalista e premium** — compatível
com o mercado fotográfico de alta qualidade. Não é um produto de tecnologia
fria: é uma ferramenta criada para quem trabalha com emoção e arte.

**Paleta de cores sugerida para a landing:**

```
Fundo principal:    #FAFAF9  (branco-creme — transmite leveza e sofisticação)
Texto principal:    #1E293B  (slate-800 — legível, não agressivo)
Texto secundário:   #64748B  (slate-500)
Destaque/CTA:       #6366F1  (indigo-500 — mesmo do painel)
Acento quente:      #D97706  (amber-600 — toque fotográfico/analógico)
Fundo escuro:       #0F172A  (slate-900 — para seções de contraste)
```

**Tipografia sugerida:**

```
Títulos:   Playfair Display (serif) — elegância fotográfica
           ou Cormorant Garamond — mais refinado
Corpo:     Inter (sans-serif) — leitura confortável
           (ambas disponíveis no Google Fonts, gratuitas)
```

**Tom de voz:**
- Sofisticado, mas acessível — não técnico
- Fala diretamente com o fotógrafo, como colega de profissão
- Evita jargões de tecnologia ("SaaS", "multi-tenant", "API")
- Usa linguagem do universo fotográfico: "álbum", "prova", "entrega", "seleção"

---

### Funcionalidades que devem ser destacadas na landing

Em ordem de importância para o público-alvo:

1. **Galeria de seleção para o cliente** — o diferencial central do produto
2. **PIN de acesso** — segurança sem complicação
3. **Upload e organização de álbuns** — armazenamento profissional em nuvem
4. **Link compartilhável** — envia direto pelo WhatsApp
5. **Limite de seleção configurável** — o fotógrafo controla quantas fotos o cliente escolhe
6. **Dados isolados por fotógrafo** — seus álbuns são só seus
7. **Funciona em qualquer dispositivo** — cliente acessa pelo celular sem instalar nada

---

### O que a landing page NÃO deve fazer

- Não mencionar termos técnicos: Supabase, R2, RLS, Edge Functions, multi-tenant
- Não mencionar AbacatePay pelo nome na página principal (apenas "pagamento seguro")
- Não parecer um produto genérico de armazenamento de arquivos
- Não ter excesso de texto — fotógrafos respondem a imagens, não parágrafos
- Não ter formulário de contato longo — o CTA principal é "Começar grátis"

---

### Exemplos de referência de estilo

Produtos com estética similar ao que se quer atingir:
- **Pic-Time** (pic-time.com) — referência direta de concorrente internacional
- **Pixieset** (pixieset.com) — outra referência direta
- **Linear** (linear.app) — para inspiração de landing page minimalista
- **Notion** — para estrutura de seções e hierarquia de informação

> Nota: O objetivo não é copiar, mas entender o nível de refinamento visual esperado.

---

### Prompt completo para desenvolvimento com IA (Cursor, Lovable, v0, etc.)

Se for usar uma ferramenta de geração de código assistida por IA para
construir a landing, use o prompt abaixo como ponto de partida:

---

```
Desenvolva uma landing page profissional para um SaaS chamado Fotux,
voltado para fotógrafos profissionais brasileiros (casamentos, ensaios, eventos).

O produto é uma plataforma de entrega de provas fotográficas. O fotógrafo faz
upload das fotos no painel, organiza em álbuns, compartilha um link protegido
por PIN com o cliente. O cliente acessa pelo celular, visualiza as fotos em
uma galeria e seleciona as favoritas. O fotógrafo recebe a seleção pronta.

TECNOLOGIA:
- Next.js 14+ com App Router e TypeScript
- Tailwind CSS para estilização
- @supabase/supabase-js e @supabase/ssr para autenticação
- react-hook-form + zod para formulários
- lucide-react para ícones
- sonner para notificações toast
- Deploy na Vercel

IDENTIDADE VISUAL:
- Estética minimalista, elegante e premium — não tecnológica
- Paleta: fundo #FAFAF9, texto #1E293B, destaque #6366F1, acento #D97706
- Tipografia: Playfair Display nos títulos (Google Fonts), Inter no corpo
- Tom de voz: sofisticado mas acessível, fala como colega fotógrafo

SEÇÕES DA PÁGINA (nesta ordem):
1. Navbar: logo à esquerda, botões "Login" e "Começar grátis" à direita
2. Hero: headline impactante, subtítulo, dois CTAs, mockup/screenshot do produto
3. Como funciona: 4 passos visuais (criar conta → upload → compartilhar → receber seleção)
4. Funcionalidades: cards com os 6 principais recursos
5. Planos e preços: 4 cards (Trial grátis 14 dias / Básico R$19,90 / Pro R$59,90 / Avançado R$89,90)
6. Depoimentos: 3 cards de fotógrafos (podem ser fictícios/placeholder)
7. FAQ: accordion com 6 perguntas frequentes
8. CTA final: headline + dois botões (Começar grátis / WhatsApp)
9. Footer: links, copyright

PÁGINAS ADICIONAIS:
- /cadastro: formulário (nome, e-mail, senha, confirmar senha) + integração com supabase.auth.signUp()
- /login: formulário (e-mail, senha) + integração com supabase.auth.signInWithPassword()
- /recuperar-senha: formulário de e-mail + supabase.auth.resetPasswordForEmail()
- /nova-senha: formulário de nova senha + supabase.auth.updateUser()

VARIÁVEIS DE AMBIENTE NECESSÁRIAS:
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_ADMIN_URL=    (URL do painel: https://admin.dominio.com.br)
NEXT_PUBLIC_SITE_URL=     (URL desta landing: https://dominio.com.br)

FLUXO DE CADASTRO:
1. Usuário preenche o formulário em /cadastro
2. Chama supabase.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: NEXT_PUBLIC_ADMIN_URL } })
3. Um trigger no banco (handle_new_user) cria automaticamente o registro do fotógrafo com account_status = 'trial' e 14 dias de teste
4. Após confirmação de e-mail (ou imediatamente se desabilitado), redireciona para NEXT_PUBLIC_ADMIN_URL

FLUXO DE PLANOS COM CHECKOUT:
- Botões "Assinar X" salvam o plan_id em sessionStorage('pending_plan') e redirecionam para /cadastro?plano=X
- O checkout em si é iniciado pelo painel (não pela landing) pois requer JWT autenticado
- Botão "Começar grátis" vai direto para /cadastro sem parâmetro de plano

COMPORTAMENTO:
- Se o usuário já estiver logado ao acessar a landing, redirecionar para NEXT_PUBLIC_ADMIN_URL
- Formulários com validação em tempo real via zod
- Estados de loading nos botões durante chamadas assíncronas
- Mensagens de erro claras e em português
- Totalmente responsivo (mobile-first)

RESTRIÇÕES:
- Não mencionar nomes de tecnologias (Supabase, Cloudflare, AbacatePay) na página
- Não usar jargões técnicos nas seções públicas
- Manter estética fotográfica — não parece um app de tecnologia genérico
```

---

## 1. Tecnologia Recomendada

### Framework: **Next.js 14+ (App Router)**

**Por quê Next.js e não React + Vite (como o painel)?**

| Critério | React + Vite (painel) | Next.js (landing) |
|---|---|---|
| SEO | Ruim (SPA, JS-only) | Excelente (SSR/SSG) |
| Performance inicial | Depende do JS carregar | HTML pronto no servidor |
| Google indexação | Difícil | Nativo |
| Rotas dinâmicas | Manual | Built-in |
| Deploy | Netlify/Vercel (estático) | Vercel (nativo) |

A landing page precisa ser **indexada pelo Google** para gerar tráfego orgânico.
O painel (React + Vite) não precisa — só fotógrafos logados acessam.

### Stack completa

```
Next.js 14+          → Framework (App Router)
TypeScript           → Linguagem
Tailwind CSS         → Estilização (mesma base do painel)
@supabase/supabase-js → Autenticação e leitura do banco
lucide-react         → Ícones (mesma lib do painel)
react-hook-form      → Formulários
zod                  → Validação de formulários
sonner               → Notificações/toasts
```

### Plataforma de Deploy: **Vercel**

Next.js foi criado pela Vercel — deploy com zero configuração, CDN global,
preview automático por branch, e domínio customizado gratuito.

---

## 2. Estrutura de Repositório

O projeto da landing page deve ser um **repositório separado** do painel.

```
landing/
├── app/
│   ├── layout.tsx               → Layout raiz (fonte, metadata global)
│   ├── page.tsx                 → Landing page principal (/)
│   ├── cadastro/
│   │   └── page.tsx             → Página de cadastro (/cadastro)
│   ├── login/
│   │   └── page.tsx             → Página de login (/login)
│   ├── checkout/
│   │   └── success/
│   │       └── page.tsx         → Retorno do AbacatePay (/checkout/success)
│   └── globals.css
│
├── components/
│   ├── sections/
│   │   ├── Hero.tsx             → Seção principal
│   │   ├── Features.tsx         → Funcionalidades
│   │   ├── Pricing.tsx          → Planos e preços
│   │   ├── HowItWorks.tsx       → Como funciona
│   │   ├── Testimonials.tsx     → Depoimentos
│   │   ├── FAQ.tsx              → Perguntas frequentes
│   │   └── CTA.tsx              → Call to action final
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   └── ...
│   ├── Navbar.tsx               → Barra de navegação
│   └── Footer.tsx               → Rodapé
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts            → Cliente Supabase (browser)
│   │   └── server.ts            → Cliente Supabase (server components)
│   └── utils.ts
│
├── .env.local                   → Variáveis de ambiente (não commitar)
├── .env.example                 → Template das variáveis (commitar)
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 3. Variáveis de Ambiente

Crie o arquivo `.env.local` na raiz do projeto da landing:

```env
# ─── Supabase ────────────────────────────────────────────────────────────────
# Mesmos valores do painel — mesmo projeto Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<sua-anon-key-publica>

# ─── URLs ────────────────────────────────────────────────────────────────────
# URL do painel de administração (para onde redirecionar após login/cadastro)
NEXT_PUBLIC_ADMIN_URL=https://admin.seudominio.com.br

# URL desta própria landing (usada nos redirects do checkout)
NEXT_PUBLIC_SITE_URL=https://seudominio.com.br
```

> `NEXT_PUBLIC_` expõe a variável para o browser. A `ANON_KEY` do Supabase
> é segura para expor — ela não dá acesso privilegiado. O RLS protege os dados.

Crie também `.env.example` com os nomes mas sem os valores (para commitar):

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_ADMIN_URL=
NEXT_PUBLIC_SITE_URL=
```

---

## 4. Dependências Necessárias

```bash
npm install \
  @supabase/supabase-js \
  @supabase/ssr \
  react-hook-form \
  @hookform/resolvers \
  zod \
  lucide-react \
  sonner \
  clsx \
  tailwind-merge
```

> `@supabase/ssr` é o pacote específico para usar o Supabase com Next.js App Router,
> lidando corretamente com cookies e sessão tanto em Server Components quanto Client Components.

---

## 5. Seções da Página

A landing page principal (`/`) deve ter as seguintes seções em ordem:

---

### 5.1 Navbar

```
[ Logo ]                           [ Login ]  [ Começar grátis ]
```

- Fixa no topo (`sticky top-0`)
- Logo à esquerda
- Botão "Login" → redireciona para `/login`
- Botão "Começar grátis" → redireciona para `/cadastro`
- Em mobile: menu hambúrguer com os mesmos links

---

### 5.2 Hero

A seção mais importante — primeira coisa que o fotógrafo vê.

**Conteúdo:**
- Headline principal (ex: *"Entregue provas fotográficas de forma profissional"*)
- Subtítulo explicando o valor em 1-2 linhas
- Dois botões de CTA:
  - **"Começar grátis — 14 dias"** → `/cadastro`
  - **"Ver planos"** → ancora para `#planos`
- Imagem ou mockup do painel ao lado (screenshot do sistema)

---

### 5.3 Como Funciona

Três ou quatro passos visuais explicando o fluxo do fotógrafo:

```
1. Crie sua conta     2. Faça upload        3. Compartilhe       4. Receba seleções
   em segundos           do álbum               com PIN               do cliente
   [ícone pessoa]        [ícone upload]          [ícone link]          [ícone check]
```

---

### 5.4 Funcionalidades

Cards com as principais funcionalidades do sistema:

| Ícone | Título | Descrição |
|---|---|---|
| Upload | Armazenamento em nuvem | Fotos organizadas por álbum no Cloudflare R2 |
| Lock | Acesso por PIN | Cliente acessa o álbum com PIN personalizado |
| Check | Seleção de fotos | Cliente seleciona as fotos favoritas diretamente |
| Shield | Dados isolados | Cada fotógrafo vê apenas seus próprios dados |
| Smartphone | Responsivo | Funciona em qualquer dispositivo |
| Zap | Link compartilhável | Envie o link do álbum direto pelo WhatsApp |

---

### 5.5 Planos e Preços

**ID da âncora: `planos`**

Esta seção lê os planos e exibe os cards. Os valores podem ser:
- **Opção A (recomendada):** Hardcoded no frontend — mais simples, sem chamada ao banco
- **Opção B:** Lidos da tabela `plans` do Supabase via Server Component

**Planos atuais (hardcoded ou vindos do banco):**

| | Período Teste | Básico | Pro | Avançado |
|---|---|---|---|---|
| **Preço** | Grátis | R$ 19,90/mês | R$ 59,90/mês | R$ 89,90/mês |
| **Storage** | 10 GB | 10 GB | 50 GB | 100 GB |
| **Álbuns** | Ilimitados | Ilimitados | Ilimitados | Ilimitados |
| **Fotos/álbum** | Até 500 | Até 500 | Até 1.000 | Ilimitadas |
| **Duração** | 14 dias | Mensal | Mensal | Mensal |
| **CTA** | Começar grátis | Assinar Básico | Assinar Pro | Assinar Avançado |

**Comportamento dos botões:**

```
"Começar grátis"   → /cadastro  (sem plano — cria conta trial)
"Assinar Básico"   → /cadastro?plano=basico
"Assinar Pro"      → /cadastro?plano=pro
"Assinar Avançado" → /cadastro?plano=avancado
```

Se o fotógrafo já estiver logado ao clicar em "Assinar X":
→ Chama diretamente `create-checkout` e redireciona para AbacatePay

---

### 5.6 Depoimentos

Três cards com foto, nome, cidade e depoimento de fotógrafos clientes.
Podem ser estáticos (hardcoded) inicialmente.

---

### 5.7 FAQ

Accordion com as perguntas mais comuns. Sugestão de conteúdo:

```
Q: Preciso de cartão de crédito para o período de teste?
A: Não. O período de 14 dias é completamente gratuito, sem necessidade
   de cartão de crédito. Você só paga se decidir continuar.

Q: O que acontece com meus dados se eu cancelar?
A: Seus álbuns e fotos ficam armazenados por 30 dias após o cancelamento.
   Durante esse período você pode reativar a conta sem perder nada.
   Após os 30 dias, os dados são removidos permanentemente.

Q: Posso mudar de plano a qualquer momento?
A: Sim. Você pode fazer upgrade ou downgrade quando quiser pelo painel.

Q: Meu cliente precisa criar uma conta para ver as fotos?
A: Não. Seu cliente acessa o álbum apenas com o link e o PIN que você
   definir — sem cadastro, sem aplicativo.

Q: Onde as fotos ficam armazenadas?
A: No Cloudflare R2, uma infraestrutura de armazenamento global com
   alta disponibilidade e redundância.

Q: Há limite de álbuns?
A: Não. Todos os planos incluem álbuns ilimitados. O limite é apenas
   no armazenamento total (GB) e no número de fotos por álbum.
```

---

### 5.8 CTA Final

Seção de fechamento antes do rodapé:

```
"Pronto para modernizar sua entrega de provas?"

[ Começar 14 dias grátis ]   [ Falar no WhatsApp ]
```

---

### 5.9 Footer

```
[ Logo ]

Links:          Produto:        Suporte:
Início          Funcionalidades WhatsApp
Planos          Como funciona   E-mail
FAQ             Depoimentos

© 2025 NomeDoProduto. Todos os direitos reservados.
Termos de uso · Política de privacidade
```

---

## 6. Fluxos de Autenticação

### 6.1 Cadastro (Trial — sem plano)

Rota: `/cadastro`

```
Usuário preenche:
  - Nome completo
  - E-mail
  - Senha (mínimo 8 caracteres)
  - Confirmação de senha

→ Chama supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name: 'João Silva' },         ← salvo em raw_user_meta_data
      emailRedirectTo: NEXT_PUBLIC_ADMIN_URL ← confirmação de e-mail
    }
  })

→ Trigger handle_new_user dispara automaticamente no banco:
    - Cria registro em photographers
    - account_status = 'trial'
    - trial_ends_at = now() + 14 dias
    - slug gerado do e-mail

→ Se Supabase pedir confirmação de e-mail:
    Exibe mensagem "Verifique seu e-mail para confirmar o cadastro"

→ Se confirmação estiver desabilitada (desenvolvimento):
    Redireciona para NEXT_PUBLIC_ADMIN_URL
```

### 6.2 Cadastro com Plano (direto para checkout)

Rota: `/cadastro?plano=basico` (ou pro, avancado)

```
1. Mesmo formulário de cadastro

2. Após supabase.auth.signUp() com sucesso:
   → Salva o plano desejado em sessionStorage:
     sessionStorage.setItem('pending_plan', 'basico')

3. Confirma e-mail (se necessário) ou vai direto para o painel

4. No painel (Admin.tsx), ao carregar:
   → Verifica sessionStorage.getItem('pending_plan')
   → Se existir, chama automaticamente create-checkout com esse plan_id
   → Limpa o sessionStorage após iniciar checkout
```

> **Por que não chamar create-checkout direto da landing?**
> A Edge Function `create-checkout` requer um JWT de usuário autenticado
> no header `Authorization`. O usuário só tem esse JWT após confirmar o e-mail
> e fazer login. Por isso o checkout é iniciado já dentro do painel.

### 6.3 Login

Rota: `/login`

```
Usuário preenche:
  - E-mail
  - Senha

→ Chama supabase.auth.signInWithPassword({ email, password })

→ Sucesso:
    Redireciona para NEXT_PUBLIC_ADMIN_URL

→ Erro "Invalid login credentials":
    Exibe "E-mail ou senha incorretos"

→ Erro "Email not confirmed":
    Exibe "Confirme seu e-mail antes de acessar"
    + botão "Reenviar e-mail de confirmação"
```

### 6.4 Reenvio de Confirmação de E-mail

```
→ Chama supabase.auth.resend({
    type: 'signup',
    email: email,
    options: {
      emailRedirectTo: NEXT_PUBLIC_ADMIN_URL
    }
  })
```

### 6.5 Recuperação de Senha

Rota: `/recuperar-senha`

```
1. Usuário informa o e-mail

2. → supabase.auth.resetPasswordForEmail(email, {
       redirectTo: `${NEXT_PUBLIC_SITE_URL}/nova-senha`
     })

3. Supabase envia e-mail com link

4. Usuário clica no link → chega em /nova-senha com token na URL

5. → supabase.auth.updateUser({ password: novaSenha })

6. Redireciona para NEXT_PUBLIC_ADMIN_URL
```

---

## 7. Integração com Supabase

### 7.1 Configuração do cliente

**`lib/supabase/client.ts`** — usado em Client Components:

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**`lib/supabase/server.ts`** — usado em Server Components e Server Actions:

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}
```

### 7.2 Leitura dos planos (opcional — Opção B)

Se quiser buscar os planos do banco em vez de hardcodar:

```typescript
// app/page.tsx (Server Component)
import { createClient } from '@/lib/supabase/server'

export default async function LandingPage() {
  const supabase = await createClient()
  const { data: plans } = await supabase
    .from('plans')
    .select('id, name, price_brl, max_storage_gb, max_photos_per_album')
    .order('price_brl')

  return <Pricing plans={plans ?? []} />
}
```

### 7.3 Verificar se usuário já está logado

Se o fotógrafo acessar a landing já logado, redireciona direto para o painel:

```typescript
// app/page.tsx (Server Component)
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function LandingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    redirect(process.env.NEXT_PUBLIC_ADMIN_URL!)
  }

  // ... renderiza a landing normalmente
}
```

---

## 8. Integração com AbacatePay (Checkout)

O checkout **não é iniciado diretamente pela landing**. O fluxo correto é:

```
Landing → Cadastro → Painel → create-checkout Edge Function → AbacatePay
```

A razão técnica: a Edge Function `create-checkout` exige um JWT de usuário
autenticado no header `Authorization`. Esse JWT só existe após login completo.

### Como passar o plano desejado para o painel

Na landing, ao clicar em "Assinar Básico":

```typescript
// components/sections/Pricing.tsx (Client Component)
'use client'

import { useRouter } from 'next/navigation'

export function PlanButton({ planId }: { planId: string }) {
  const router = useRouter()

  const handleClick = () => {
    // Salva o plano desejado para ser lido pelo painel após login
    sessionStorage.setItem('pending_plan', planId)
    router.push(`/cadastro?plano=${planId}`)
  }

  return <button onClick={handleClick}>Assinar {planId}</button>
}
```

### Como o painel lê o plano pendente

No painel (`Admin.tsx`), após o fotógrafo logar e a conta ser carregada:

```typescript
// admin/src/pages/Admin.tsx — já parcialmente implementado
useEffect(() => {
  if (!isAdmin || statusLoading) return

  const pendingPlan = sessionStorage.getItem('pending_plan')
  if (pendingPlan && accountStatus !== 'active') {
    sessionStorage.removeItem('pending_plan')
    // Inicia checkout automaticamente
    setActiveTab('settings') // leva para a tela de planos
  }
}, [isAdmin, statusLoading, accountStatus])
```

### Página de retorno do checkout

Rota: `/checkout/success`

O AbacatePay redireciona para:
`https://admin.seudominio.com.br?checkout=success`

Esse redirect já está configurado na Edge Function `create-checkout`
(campo `success_url`). O painel já trata esse parâmetro e abre a
tela de Assinatura automaticamente.

---

## 9. Redirecionamento para o Painel

O painel (`admin.seudominio.com.br`) é um projeto React separado.
Para redirecionar a partir da landing:

```typescript
// Redirecionamento client-side
window.location.href = process.env.NEXT_PUBLIC_ADMIN_URL!

// Redirecionamento server-side (Server Component / Server Action)
import { redirect } from 'next/navigation'
redirect(process.env.NEXT_PUBLIC_ADMIN_URL!)
```

### Sessão compartilhada entre subdomínios

O Supabase salva a sessão em **localStorage** por padrão (como configurado
no painel). Para compartilhar a sessão entre `seudominio.com.br` e
`admin.seudominio.com.br`, o painel deve ser configurado para usar
**cookies** em vez de localStorage.

**Configuração no painel** (`admin/src/integrations/supabase/client.ts`):

```typescript
// Atualizar para usar cookies (compartilhados entre subdomínios)
export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: {
        // Usa cookie com domínio pai para compartilhar sessão
        // entre seudominio.com.br e admin.seudominio.com.br
        getItem: (key) => {
          const match = document.cookie.match(new RegExp(`(^| )${key}=([^;]+)`))
          return match ? decodeURIComponent(match[2]) : null
        },
        setItem: (key, value) => {
          document.cookie = `${key}=${encodeURIComponent(value)};domain=.seudominio.com.br;path=/;max-age=604800;SameSite=Lax`
        },
        removeItem: (key) => {
          document.cookie = `${key}=;domain=.seudominio.com.br;path=/;max-age=0`
        },
      },
      persistSession: true,
      autoRefreshToken: true,
    }
  }
)
```

> Se preferir simplicidade, o fotógrafo faz login na landing e é
> redirecionado para o painel já autenticado via URL com token
> (o Supabase suporta isso via `emailRedirectTo` e `detectSessionInUrl`).

---

## 10. Roteamento e Páginas

```
/                    → Landing page principal
/cadastro            → Formulário de cadastro
/cadastro?plano=X    → Cadastro com plano pré-selecionado
/login               → Formulário de login
/recuperar-senha     → Solicitar reset de senha
/nova-senha          → Definir nova senha (chegou pelo link do e-mail)
/checkout/success    → Página de confirmação pós-checkout (opcional)
/termos              → Termos de uso
/privacidade         → Política de privacidade
```

---

## 11. Configuração de Deploy

### Vercel

1. Crie o projeto no [vercel.com](https://vercel.com)
2. Conecte ao repositório Git da landing
3. Configure as variáveis de ambiente na UI do Vercel:
   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   NEXT_PUBLIC_ADMIN_URL
   NEXT_PUBLIC_SITE_URL
   ```
4. Configure o domínio customizado:
   - `seudominio.com.br` → raiz (landing)
   - `admin.seudominio.com.br` → painel (outro deploy)

### DNS

No seu provedor de DNS (Cloudflare, Registro.br, etc.):

```
Tipo  Nome    Valor
A     @       76.76.21.21   (IP da Vercel — verificar na UI)
CNAME www     cname.vercel-dns.com
CNAME admin   cname.vercel-dns.com  (aponta para o painel)
```

### `next.config.ts`

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        // Permite carregar imagens do R2 nos componentes <Image>
        protocol: 'https',
        hostname: 'pub-*.r2.dev',
      },
      {
        // Se configurar domínio personalizado no R2:
        protocol: 'https',
        hostname: 'fotos.seudominio.com.br',
      },
    ],
  },
}

export default nextConfig
```

---

## 12. Checklist de Integração

Execute esses testes antes de publicar:

### Fluxo de Cadastro Trial
- [ ] Preencher formulário e clicar em "Começar grátis"
- [ ] Confirmar e-mail (se habilitado no Supabase)
- [ ] Verificar se registro foi criado em `photographers` no banco:
  ```sql
  SELECT id, slug, name, email, account_status, trial_ends_at
  FROM photographers ORDER BY created_at DESC LIMIT 1;
  ```
- [ ] Verificar se `account_status = 'trial'` e `trial_ends_at` = 14 dias a partir de agora
- [ ] Acessar `admin.seudominio.com.br` e confirmar que o painel carrega

### Fluxo de Cadastro com Plano
- [ ] Clicar em "Assinar Pro" na seção de planos
- [ ] Confirmar que `sessionStorage.pending_plan = 'pro'` foi salvo
- [ ] Completar cadastro
- [ ] Confirmar que o painel inicia o checkout automaticamente

### Fluxo de Login
- [ ] Fazer login com conta existente
- [ ] Confirmar redirecionamento para o painel
- [ ] Confirmar que a sessão está ativa no painel

### Fluxo de Recuperação de Senha
- [ ] Solicitar reset com e-mail cadastrado
- [ ] Confirmar que e-mail chega (verificar spam)
- [ ] Definir nova senha
- [ ] Confirmar acesso com nova senha

### Responsividade
- [ ] Testar em mobile (320px)
- [ ] Testar em tablet (768px)
- [ ] Testar em desktop (1280px+)

### SEO
- [ ] Verificar `<title>` e `<meta description>` em cada página
- [ ] Confirmar que Google Search Console indexa corretamente
- [ ] Testar com [PageSpeed Insights](https://pagespeed.web.dev/)

---

## Referências Rápidas

| Item | Valor |
|---|---|
| Supabase URL | No Supabase Dashboard → Settings → API |
| Supabase Anon Key | No Supabase Dashboard → Settings → API |
| Edge Function create-checkout | `https://<ref>.supabase.co/functions/v1/create-checkout` |
| Tabela plans | `SELECT * FROM public.plans;` |
| Trigger de cadastro | `public.handle_new_user()` (migration 20260328000007) |
| Painel (admin) | `https://admin.seudominio.com.br` |
