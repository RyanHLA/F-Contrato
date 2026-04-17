# Ciclo de Fluxo do Fotógrafo (End-to-End)

Este documento detalha a jornada completa do fotógrafo dentro da plataforma, desde a configuração inicial até o pós-entrega. Cada etapa descreve as ações exatas realizadas no sistema, os estados de cada item e as automações disparadas.

---

## 1. Configuração do Ecossistema (Onboarding)

Realizada uma única vez antes do primeiro atendimento. O fotógrafo acessa **Configurações** no menu lateral.

### 1.1 Identidade Visual (Branding)
**Caminho:** Configurações → Minha Marca

| Campo | Ação do Fotógrafo |
| :--- | :--- |
| Logo | Upload de imagem (PNG/SVG, máx. 2MB) |
| Paleta de Cores | Seleção de cor primária e secundária via color picker |
| Subdomínio | Define o endereço personalizado (ex: `lorena.fotux.com.br`) |
| Foto de Perfil | Upload opcional para humanizar a marca |

**Resultado:** Todas as páginas públicas (galeria, contrato, checkout) exibem a identidade do fotógrafo.

---

### 1.2 Integração de Pagamentos
**Caminho:** Configurações → Financeiro → Gateways

1. Fotógrafo clica em **Conectar Mercado Pago** (ou outro gateway disponível)
2. É redirecionado para autenticação OAuth do gateway
3. Após autorização, retorna à plataforma com a conta vinculada
4. Define a **taxa de parcelamento** (quem absorve: fotógrafo ou cliente)
5. Define o **prazo de vencimento padrão** para boletos (ex: 3 dias)

**Estado do gateway:** `Desconectado` → `Conectando...` → `Ativo ✓`

---

### 1.3 Templates de Contratos
**Caminho:** Configurações → Contratos → Novo Template

1. Fotógrafo nomeia o template (ex: "Contrato Casamento 2025")
2. Edita o corpo do contrato via editor rich text
3. Insere **variáveis dinâmicas** clicando nos botões de atalho:
   - `{{nome_cliente}}`, `{{data_evento}}`, `{{valor_total}}`, `{{local_evento}}`
4. Salva o template
5. Repete para cada tipo de ensaio (Casamento, Gestante, Corporativo, Família)

---

### 1.4 Réguas de Comunicação Automática
**Caminho:** Configurações → Mensagens → Automações

Para cada automação, o fotógrafo configura:
- **Canal:** E-mail ou WhatsApp
- **Gatilho:** Evento que dispara a mensagem
- **Timing:** Imediato, X horas após, ou X dias antes/depois
- **Corpo da mensagem:** Texto com variáveis dinâmicas

**Automações disponíveis para configurar:**

| Gatilho | Exemplo de Timing | Exemplo de Mensagem |
| :--- | :--- | :--- |
| Contrato enviado | Imediato | "Seu contrato está disponível para assinatura!" |
| Contrato assinado | Imediato | "Contrato assinado! Aqui está o link para o pagamento do sinal." |
| 7 dias antes do evento | 7 dias antes | "Falta 1 semana! Confirme os detalhes do seu ensaio." |
| Galeria disponível | Imediato | "Sua galeria de seleção está pronta!" |
| Seleção finalizada (com excedente) | Imediato | "Você selecionou X fotos extras. Aqui está o link de pagamento." |
| Álbum disponível para prova | Imediato | "Seu álbum está pronto para visualização e aprovação!" |
| Entrega disponível | Imediato | "Suas fotos em alta resolução estão prontas para download!" |
| 3 dias sem ação do cliente | 3 dias após inatividade | "Lembrete: sua [galeria/aprovação] está aguardando você." |

---

## 2. Abertura do Projeto (O "Job")

O fotógrafo acessa **Jobs** → **Novo Job** no menu lateral.

### 2.1 Criação do Evento
**Campos obrigatórios:**

| Campo | Descrição |
| :--- | :--- |
| Nome do Job | Identificador interno (ex: "Casamento Ana & Pedro") |
| Tipo de Ensaio | Seleção que filtra o template de contrato correspondente |
| Data do Evento | Date picker |
| Local | Campo de texto ou integração com Google Maps |
| Nome do Cliente | Vincula ou cria novo contato na base |
| E-mail / WhatsApp do Cliente | Para envio dos links |

**Estado do Job após criação:** `Rascunho`

---

### 2.2 Emissão de Contrato e Orçamento
**Caminho:** Job → Aba "Contrato"

1. Fotógrafo seleciona o **template de contrato** na lista suspensa
2. As variáveis dinâmicas são preenchidas automaticamente com os dados do Job
3. Fotógrafo revisa o contrato no preview e edita pontualmente se necessário
4. Define o **valor total** do serviço
5. Clica em **Gerar e Enviar Contrato**

**O sistema automaticamente:**
- Gera o link único do contrato
- Envia para o cliente via E-mail e/ou WhatsApp (conforme automação configurada)
- Registra timestamp de envio

**Estado do Job:** `Rascunho` → `Aguardando Assinatura`

---

### 2.3 Plano de Pagamento
**Caminho:** Job → Aba "Financeiro" → Definir Plano

1. Fotógrafo define o **valor e percentual do sinal** (ex: 30% = R$ 500)
2. Adiciona parcelas clicando em **+ Adicionar Parcela**:
   - Valor ou percentual
   - Data de vencimento
3. O sistema exibe o **resumo financeiro** em tempo real (valor pago / total)
4. Salva o plano

**Após assinatura do cliente:** O sistema dispara automaticamente o link de pagamento do sinal.

---

### 2.4 Ação do Cliente (Automática)
O fotógrafo acompanha o status em tempo real no dashboard do Job:

| Status | Descrição |
| :--- | :--- |
| `Aguardando Assinatura` | Link enviado, cliente ainda não abriu |
| `Contrato Visualizado` | Cliente abriu o link |
| `Contrato Assinado` | Assinatura digital registrada com IP e timestamp |
| `Sinal Pendente` | Link de pagamento enviado, aguardando pagamento |
| `Sinal Pago ✓` | Confirmação do gateway recebida |

**Estado do Job após sinal pago:** `Em Andamento`

> **Ação manual (se necessário):** Se o cliente não agir em 3 dias, a automação de lembrete entra em ação automaticamente. O fotógrafo também pode clicar em **Reenviar Link** manualmente.

---

## 3. Galeria de Seleção de Fotos (Pós-Evento)

Acessada após o evento. **Caminho:** Job → Aba "Galeria de Seleção" → Configurar Galeria.

### 3.1 Configuração da Galeria
Antes do upload, o fotógrafo define as regras:

| Configuração | Descrição |
| :--- | :--- |
| Quantidade inclusa | Número de fotos cobertas pelo contrato (ex: 50) |
| Valor por foto excedente | Preço por foto além do limite (ex: R$ 15,00/foto) |
| Prazo para seleção | Data limite para o cliente finalizar (opcional) |
| Marca d'água | Posição (Centro / Canto inferior) e opacidade |

---

### 3.2 Upload de Previews (Baixa Resolução)
**Caminho:** Galeria → Fazer Upload

1. Fotógrafo seleciona os arquivos (drag & drop ou seleção múltipla — suporte a lotes de 500+ fotos)
2. Os arquivos originais são enviados diretamente para o **storage de objetos** (ex: S3/R2) sem passar pelo servidor principal
3. Uma **função de Edge** (ex: Cloudflare Workers / AWS Lambda@Edge) é disparada automaticamente por arquivo ao chegar no storage, executando em paralelo e sem travar o upload seguinte:
   - Redimensionamento para resolução de preview (~1200px no lado maior)
   - Aplicação da marca d'água conforme configuração
   - Geração de thumbnail para listagem (~400px)
4. Sistema exibe **barra de progresso dupla:** upload (azul) e processamento (verde), com contador `X de Y processadas`
5. Fotos ficam disponíveis na galeria progressivamente, à medida que são processadas — o fotógrafo não precisa esperar o lote completo
6. Fotógrafo revisa a galeria antes de publicar
7. Clica em **Publicar Galeria**

> **Por que Edge Computing?** O processamento acontece na infraestrutura distribuída do provedor de cloud, não no servidor da plataforma. Um lote de 500 fotos é processado em paralelo em dezenas de nós simultâneos, sem impactar a performance de outros fotógrafos usando o sistema ao mesmo tempo.

**O sistema automaticamente:**
- Envia o link da galeria ao cliente
- Registra a data de abertura da galeria

**Estado do Job:** `Galeria Disponível`

---

### 3.3 Curadoria do Cliente — Mobile First (Acompanhamento)

> **Premissa de design:** O fotógrafo opera no PC, mas o cliente seleciona as fotos no celular, deitado no sofá. A interface do cliente é projetada como **Mobile First**, priorizando gestos naturais e consumo de tela inteira.

**Experiência do cliente no celular:**

| Gesto | Ação |
| :--- | :--- |
| Swipe para a direita | Seleciona a foto (coração aparece, foto entra na seleção) |
| Swipe para a esquerda | Descarta a foto (passa para a próxima sem selecionar) |
| Toque duplo | Seleciona a foto (alternativa ao swipe) |
| Toque longo | Abre a foto em tela cheia para análise de detalhe |
| Botão "Ver Selecionadas" | Exibe galeria das fotos já escolhidas para revisão |
| Botão "Finalizar" | Aparece fixo no rodapé após atingir o mínimo configurado |

**Indicadores visuais no mobile:**
- Contador fixo no topo: `Selecionadas: Y / Incluídas: X`
- Barra de progresso colorida: verde (dentro do limite) → amarela (próximo) → vermelha (excedente)
- Aviso de excedente antes de finalizar: *"Você selecionou 8 fotos extras — custo adicional: R$ 120,00. Deseja continuar?"*

**Painel do fotógrafo (PC) — Acompanhamento em tempo real:**
- **Total de fotos:** X disponíveis
- **Favoritadas pelo cliente:** Y fotos (atualização em tempo real via WebSocket)
- **Status:** `Selecionando` / `Seleção Finalizada`

---

### 3.4 Finalização da Seleção e Upsell
Quando o cliente clica em "Finalizar Seleção":

**Cenário A — Dentro do limite:**
- Sistema notifica o fotógrafo
- Estado: `Seleção Recebida ✓`
- Fotógrafo acessa a lista das fotos selecionadas em **Galeria → Ver Seleção**

**Cenário B — Com fotos excedentes:**
- Sistema calcula automaticamente: `(fotos selecionadas - limite) × valor/foto`
- Gera link de pagamento do excedente
- Envia ao cliente automaticamente
- **Bloqueia a entrega da seleção ao fotógrafo** até confirmação do pagamento
- Estado: `Aguardando Pagamento de Excedente`
- Após pagamento: sistema libera a seleção e notifica o fotógrafo

---

## 4. Prova de Álbum (Validação de Design)

Etapa opcional, ativada pelo fotógrafo quando aplicável. **Caminho:** Job → Aba "Prova de Álbum".

### 4.1 Upload das Lâminas
1. Fotógrafo clica em **Adicionar Lâminas**
2. Faz upload das páginas duplas (JPG/PNG, em ordem)
3. Sistema gera a pré-visualização do flipbook
4. Fotógrafo revisa a sequência (pode reordenar via drag & drop)
5. Clica em **Enviar para Aprovação**

**O sistema automaticamente:**
- Notifica o cliente com o link da prova
- Registra data de envio

**Estado do Job:** `Aguardando Aprovação do Álbum`

---

### 4.2 Visualização e Revisão pelo Cliente
O fotógrafo acompanha o painel de revisão:

- **Flipbook:** Visualização interativa das lâminas (sem ação do fotógrafo)
- **Comentários Recebidos:** Lista de anotações do cliente por lâmina

Cada comentário exibe:
- Número da lâmina
- Área marcada (highlight visual)
- Texto do comentário
- Timestamp

---

### 4.3 Ciclo de Revisão com Controle de Rodadas

**Configuração prévia no template de contrato (Etapa 1.3):**
O fotógrafo define, ao criar o template, as variáveis de revisão:
- `{{revisoes_incluidas}}` — número de rodadas gratuitas (ex: `3`)
- `{{valor_revisao_extra}}` — taxa cobrada a partir da rodada seguinte (ex: `R$ 150,00`)

Essas variáveis são preenchidas automaticamente no contrato do Job e ficam registradas como **regra vinculante** na plataforma.

**Fluxo de cada rodada:**
1. Fotógrafo lê os comentários no painel e realiza os ajustes no software de design externo
2. Faz novo upload das lâminas corrigidas
3. Sistema **registra e incrementa o contador de rodadas** automaticamente
4. Notifica o cliente com a nova versão disponível
5. Ciclo se repete

**Controle automático de rodadas:**

| Situação | Comportamento do Sistema |
| :--- | :--- |
| Dentro do limite contratado | Upload da nova versão permitido normalmente |
| Atingiu o limite (ex: 3ª rodada aprovada) | Exibe aviso ao fotógrafo: *"Limite de revisões gratuitas atingido"* |
| Cliente solicita nova rodada após o limite | Sistema bloqueia o envio ao cliente e gera **link de pagamento da taxa extra** automaticamente |
| Taxa extra paga | Nova rodada é desbloqueada, contador continua incrementando |

**Painel de controle de rodadas (visível para o fotógrafo):**
```
Rodada 1: Enviada em 10/03 → Comentários recebidos em 11/03
Rodada 2: Enviada em 13/03 → Comentários recebidos em 14/03
Rodada 3: Enviada em 16/03 → Aguardando aprovação...   [Inclusa no contrato]
────────────────────────────────────────────────────────
Rodada 4: Bloqueada — taxa extra de R$ 150,00 pendente  [Paga em 17/03 ✓]
```

> **Por que isso protege o fotógrafo:** O processo de revisão infinita é um dos maiores gargalos operacionais da fotografia de casamento. Com o limite vinculado ao contrato já assinado, a cobrança é legítima, automática e sem constrangimento — o sistema cobra, não o fotógrafo.

---

### 4.4 Aprovação Final
Quando o cliente clica em **Aprovar Layout**:
- Sistema registra: nome, IP, timestamp e versão aprovada
- Estado: `Álbum Aprovado ✓`
- Notifica o fotógrafo para prosseguir com a entrega final
- Gera **Documento de Conformidade** disponível para download

---

## 5. Entrega Final e Encerramento (Delivery)

**Caminho:** Job → Aba "Entrega Final".

### 5.1 Verificação Financeira (Pré-Upload)
Antes de fazer o upload, o sistema exibe o **Status Financeiro do Job**:

| Item | Status |
| :--- | :--- |
| Sinal | `Pago ✓` |
| Parcela 1 | `Pago ✓` |
| Parcela 2 | `Pago ✓` |
| Excedente de fotos | `Pago ✓` |
| **Total quitado** | `R$ X.XXX,XX ✓` |

Se houver parcelas em aberto, o sistema exibe um **alerta** e bloqueia a liberação do download ao cliente (o fotógrafo ainda pode fazer o upload dos arquivos).

---

### 5.2 Upload em Alta Resolução
1. Fotógrafo seleciona os arquivos finais editados (JPG/RAW/ZIP)
2. Sistema exibe barra de progresso
3. Após upload completo, fotógrafo revisa a lista de arquivos
4. Clica em **Finalizar Entrega**

---

### 5.3 Liberação do Download
**Se financeiro quitado:** O link de download é habilitado imediatamente.
**Se financeiro pendente:** O link é preparado mas bloqueado — liberado automaticamente assim que o pagamento for detectado.

**O sistema automaticamente:**
- Envia o link de download ao cliente
- Registra data e hora de liberação

**Estado do Job:** `Entregue ✓`

---

### 5.4 Arquivamento
1. Job é movido automaticamente para a aba **Concluídos**
2. Fotógrafo pode acessar a qualquer momento:
   - Contrato assinado (PDF)
   - Seleção de fotos (lista)
   - Documento de aprovação do álbum
   - Histórico de pagamentos e notas fiscais
   - Arquivos entregues (link de download permanece ativo pelo período configurado)

---

## 6. Pós-Entrega (Relacionamento e Retenção)

**Caminho:** Job Concluído → Aba "Pós-Entrega" *(opcional)*

### 6.1 Pesquisa de Satisfação (NPS)
- Fotógrafo habilita o envio automático de NPS após X dias da entrega
- Cliente recebe link para avaliação (nota de 0 a 10 + comentário)
- Resultado aparece no painel do fotógrafo como indicador de qualidade

### 6.2 Solicitação de Depoimento
- Fotógrafo pode enviar (manual ou automático) um link para o cliente deixar um depoimento
- Depoimento aprovado pelo fotógrafo é exibido na sua página pública

### 6.3 Indicação e Recontratação
- Sistema identifica clientes com NPS alto (≥ 9) como **Promotores**
- Fotógrafo pode enviar campanha de indicação ou cupom de desconto para próximo ensaio
- Histórico do cliente fica salvo para consulta em novos Jobs futuros

---

## Resumo de Estados do Job

```
Rascunho
  → Aguardando Assinatura
    → Contrato Visualizado
      → Contrato Assinado
        → Sinal Pendente
          → Em Andamento
            → Galeria Disponível
              → Selecionando
                → [Aguardando Pagamento de Excedente]
                  → Seleção Recebida
                    → [Aguardando Aprovação do Álbum]
                      → Álbum Aprovado
                        → Aguardando Entrega
                          → Entregue ✓
                            → Concluído (Arquivado)
```

---

## Resumo de Automações (Valor Percebido)

| Evento Gatilho | Ação Automática do Sistema |
| :--- | :--- |
| **Contrato gerado** | Envio do link de assinatura ao cliente |
| **Contrato assinado** | Envio imediato do link de pagamento do sinal |
| **Sinal pago** | Atualização do status para "Em Andamento" e confirmação ao fotógrafo |
| **Galeria publicada** | Envio do link da galeria ao cliente |
| **Seleção finalizada (sem excedente)** | Notificação ao fotógrafo com a lista das fotos selecionadas |
| **Seleção finalizada (com excedente)** | Cálculo, bloqueio da seleção e envio do link de pagamento ao cliente |
| **Excedente pago** | Liberação da seleção ao fotógrafo |
| **Álbum enviado para prova** | Notificação ao cliente com link do flipbook |
| **Nova versão do álbum enviada** | Notificação ao cliente para revisar novamente; contador de rodadas incrementado |
| **Limite de revisões atingido + nova rodada solicitada** | Bloqueio automático do envio e geração de link de pagamento da taxa extra |
| **Taxa de revisão extra paga** | Nova rodada desbloqueada automaticamente |
| **Álbum aprovado** | Notificação ao fotógrafo e geração do documento de conformidade |
| **Entrega finalizada + financeiro quitado** | Envio imediato do link de download ao cliente |
| **Parcela quitada (desbloqueando entrega)** | Liberação automática do download e notificação ao cliente |
| **3 dias sem ação do cliente** | Lembrete automático via E-mail e/ou WhatsApp |
| **Job concluído + X dias** | Envio da pesquisa NPS ao cliente |
