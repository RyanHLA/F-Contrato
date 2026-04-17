# Fluxo do Sistema — Plataforma para Fotógrafos

---

## Visão Geral

O sistema é organizado em torno de duas entidades principais: **Clientes** e **Trabalhos**. Um cliente é apenas um cadastro de contato. Um trabalho é onde tudo acontece — contrato, galeria, seleção e entrega. Um cliente pode ter N trabalhos independentes.

---

## Menu Principal

O menu lateral possui 4 itens fixos:

- **Dashboard** — visão geral do negócio (trabalhos em andamento, pagamentos pendentes, próximos ensaios).
- **Clientes** — cadastro e gestão de contatos.
- **Trabalhos** — lista de todos os trabalhos, com filtros e ações.
- **Configurações** — perfil do fotógrafo, templates de contrato e preferências gerais.

> Contratos **não** aparecem como item de menu. Eles vivem dentro de cada trabalho.

---

## 1. Clientes

### 1.1 Lista de clientes

A tela principal de Clientes exibe uma tabela com:

- Nome do cliente (com avatar de iniciais)
- E-mail
- Telefone / WhatsApp
- Data de cadastro
- Menu de ações (três pontinhos): editar dados, excluir, criar trabalho

**Ações disponíveis na toolbar:**
- Campo de busca (por nome, e-mail ou telefone)
- Botão **"+ Novo Cliente"**

### 1.2 Cadastro de cliente

Campos do formulário:

- Nome completo *(obrigatório)*
- E-mail *(obrigatório)*
- Telefone / WhatsApp *(obrigatório)*
- Senha (Gerada altomaticamente. Será a senha que o cliente usará para acessar a galeria para selecioanar as fotos. O fotografo podera alterala dentro do trabalho do cliente na patrte de Galeria.)
- Observações (obrigatório)

### 1.3 Perfil do cliente

Ao clicar em um cliente, abre seu perfil com:

- Dados de contato (nome, e-mail, telefone)
- Histórico de trabalhos vinculados a esse cliente
- Botão de atalho **"+ Novo trabalho"** — direciona diretamente para a criação de trabalho já com o cliente preenchido

> **Regra:** 1 cliente pode ter N trabalhos. Cada trabalho é independente com seu próprio contrato e galeria.

---

## 2. Trabalhos

### 2.1 Lista de trabalhos

A tela de Trabalhos exibe uma tabela com:

- Cliente vinculado (Avatar de Iniciais + nome)
- Tipo de ensaio
- Data do ensaio
- Status do trabalho (Em andamento / Aguardando / Concluído / Cancelado)
- Status do contrato (Rascunho / Enviado / Assinado)
- Menu de ações (três pontinhos)

**Filtros disponíveis:**
- Todos / Em andamento / Aguardando / Concluído
- Tipo de ensaio ▾
- Período ▾

**Ação principal:** Botão **"+ Novo Trabalho"**

### 2.2 Criação de novo trabalho

O trabalho pode ser criado de dois lugares:

1. **Tela de Trabalhos** — botão "+ Novo Trabalho" na toolbar
2. **Perfil do cliente** — botão de atalho "+ Novo trabalho"

> Quando criado pelo perfil do cliente, o campo "Cliente" vem preenchido automaticamente.

**Campos do formulário:**

| Campo | Obrigatoriedade |
|---|---|
| Cliente | Obrigatório |
| Titulo | Obrigatório |
| Tipo de ensaio | Obrigatório |
| Data do ensaio | Obrigatório |
| Horário | Obrigatório |
| Local | Opcional |
| Valor total | Opcional |
| Sinal (entrada) | Opcional |
| Anotações internas | Opcional |

**Tipos de ensaio disponíveis:** Casamento, Ensaio casal, Newborn, Gestante, Família, 15 anos, Corporativo, Produto, Outro.

> O tipo de ensaio define automaticamente o template de contrato sugerido na próxima etapa.

O saldo restante (Valor total − Sinal) é calculado automaticamente em tempo real.

---

## 3. Tela de Confirmação — Trabalho Criado

Após salvar o trabalho, o fotógrafo **não volta para a lista**. Em vez disso, é exibida uma **tela de confirmação dedicada** com:

- Ícone de check verde confirmando que o trabalho foi criado com sucesso
- Resumo do trabalho: nome do cliente, tipo e data
- Pergunta direta: **"Deseja gerar o contrato agora?"**
- Informação de contexto: "O sistema já vai preencher os dados automaticamente."

**O fotógrafo tem 2 opções:**

### Opção A — Gerar contrato agora
→ Direcionado para a **tela de geração de contrato** (ver seção 4).

### Opção B — Fazer depois
→ Direcionado diretamente para **dentro do trabalho criado** (ver seção 5).
→ O card de Contrato no drawer ficará com o botão "Gerar contrato" em destaque.

---

## 4. Contrato

### 4.1 Acesso ao contrato

O contrato é sempre acessado a partir do trabalho, de 3 formas:

1. **Na tela de confirmação** — ao escolher "Gerar contrato agora" logo após criar o trabalho
2. **Pelo drawer "Detalhes do trabalho"** — botão "Gerar contrato" quando nenhum contrato foi gerado ainda, ou ações "Visualizar / Reenviar / Baixar PDF" quando já existe contrato
3. **Pela tabela de trabalhos na coluna "Status do contrato"** — Havera um icone vetorial ao lado esquerdo do status do contrato. Que ao clicado, levará diretamente para a tela de contrato.

### 4.2 Tela de geração de contrato

A tela é dividida em duas colunas:

**Coluna esquerda — Template e dados:**

- Seleção de template:
  - Ensaio e casamento
  - Newborn e gestante
  - Corporativo / produto
  - Criar do zero (sem template)
  - Link "Gerenciar templates →" (leva para Configurações)
- Formulário de dados do contrato:
  - Cliente *(preenchido automaticamente, somente leitura)*
  - Data do ensaio *(preenchido automaticamente)*
  - Horário *(preenchido automaticamente)*
  - Local *(preenchido automaticamente)*
  - Valor total *(preenchido automaticamente)*
  - Sinal (entrada) *(preenchido automaticamente)*
  - Prazo de entrega

**Coluna direita — Pré-visualização ao vivo:**

- O contrato é montado em tempo real conforme os campos são preenchidos
- Campos obrigatórios não preenchidos aparecem destacados em laranja com aviso ⚠
- O botão "Finalizar e enviar" só é liberado quando todos os campos obrigatórios estão preenchidos

**Ações disponíveis:**
- **Salvar rascunho** — salva sem enviar (status: Rascunho)
- **Finalizar e enviar →** — envia o contrato para o cliente assinar
- **Baixar PDF** — gera e baixa o arquivo

### 4.3 Estados do contrato

O contrato passa por 4 estados representados por uma barra de progresso:

1. **Criado** — contrato gerado e salvo como rascunho
2. **Enviado** — link enviado ao cliente por e-mail ou WhatsApp
3. **Assinado** — cliente assinou digitalmente
4. **Arquivado** — contrato concluído e arquivado

> A assinatura eletrônica tem plena validade jurídica nos termos da Lei nº 14.063/2020.

### 4.4 Card de contrato — dois estados

**Sem contrato gerado:**
- Área vazia com ícone de documento
- Texto: "Nenhum contrato gerado — Gere agora para formalizar o trabalho"
- Botão principal: **"Gerar contrato"**
- Botão secundário: **"Importar contrato existente"** (para quem já tem um PDF assinado externamente)

**Com contrato gerado:**
- Badge de status (Rascunho / Enviado / Assinado)
- Barra de progresso com datas de cada etapa
- Informações: template usado, data de envio, data de assinatura
- Ações: **Visualizar** · **Baixar PDF** · **Reenviar**

---

## 5. Tela do Trabalho — Estrutura com Abas

Ao entrar em qualquer trabalho, essa é a tela principal. Ela substitui o conceito de "hub com cards" por uma estrutura de abas mais focada.

### Cabeçalho da tela

- Breadcrumb: `← Trabalhos`
- Título: nome do cliente + tipo + data
- Badges de status: pagamento e contrato
- Botão **"Detalhes do trabalho"** — abre o drawer lateral
- Botão **"Enviar para cliente"** — CTA principal (preto, destaque)
- Botão **"Editar"** — ghost button

### Abas disponíveis

---

### Aba 1 — Fotos

Tela principal da galeria. É a aba que abre por padrão ao entrar no trabalho.

**Toolbar de ações:**
- **Subir fotos** — upload de arquivos (lote)
- **Marca d'água** — aplicar ou remover marca d'água nas fotos
- **Ordenação** — reordenar manualmente ou por critério
- **Sugerir em lote** — fotógrafo pré-seleciona fotos para sugerir ao cliente
- **Selecionar todas** — marca todas as fotos de uma vez
- **Visualizar como cliente** — fotógrafo vê a galeria exatamente como o cliente verá (botão à direita, destaque)

**Grid de fotos:**
- Layout em grade responsiva
- Fotos aprovadas pelo cliente destacadas com borda verde e ícone de check
- Fotos não selecionadas exibidas de forma neutra
- Clique na foto: abre visualização expandida

---

### Aba 2 — Seleção de fotos

Configurações do processo de seleção pelo cliente.

**Campos e opções:**

- **Data limite para seleção** *(campo de data)*
  - Às 23h59 do dia escolhido o cliente perde a capacidade de selecionar ou alterar fotos
  - O fotógrafo pode prolongar o prazo a qualquer momento

- **Vender fotos adicionais** *(toggle — ativado/desativado)*
  - Quando ativo: cliente pode selecionar fotos além da quantidade contratada
  - Campos extras exibidos ao ativar:
    - Forma de cobrança: Por foto individual / Pacote de fotos
    - Valor por foto adicional (R$)

- **Notificar quando cliente concluir seleção** *(toggle)*
  - Fotógrafo recebe e-mail assim que o cliente marcar a seleção como concluída

---

### Aba 3 — Entrega em alta

Configurações para liberar o download das fotos em alta resolução.

**Aviso informativo:**
> "Para download serão disponibilizadas as fotos originais enviadas por você, sem nenhuma redução de tamanho, marca d'água ou carimbo de cópia não autorizada."

**Opções:**

- **Permitir download de fotos individuais** *(toggle)*
  - Cliente pode baixar cada foto separadamente

- **Permitir download de todas as fotos** *(toggle)*
  - O sistema gera automaticamente um arquivo ZIP com todas as fotos e disponibiliza para download

> Os dois toggles são independentes. O fotógrafo pode ativar um, ambos ou nenhum.

---

### Aba 4 — Configurações

Configurações específicas deste trabalho / galeria.

**Campos:**

- **Nome da galeria** — título exibido ao cliente ao acessar o link
- **Data das fotos** — data do evento (pode diferir da data de cadastro do trabalho)

- **Proteção contra cópia** *(toggle)*
  - Aplica carimbo "Cópia não Autorizada" em todas as fotos exibidas ao cliente
  - Evita capturas de tela e impressões não autorizadas

- **Permitir compartilhamento** *(toggle)*
  - Permite que o cliente compartilhe a galeria nas redes sociais
  - Campos extras ao ativar:
    - Título (para o card de compartilhamento)
    - Descrição

- **Texto de instrução**
  - Mensagem exibida ao cliente ao entrar na galeria (ex: "Selecione até 50 fotos até o dia 10 de abril")

---

## 6. Drawer — Detalhes do Trabalho

O drawer é um painel lateral que desliza da direita ao clicar em "Detalhes do trabalho". Ele não substitui nenhuma aba — é um complemento de consulta rápida.

**Conteúdo do drawer:**

### Seção: Cliente
- Avatar com iniciais
- Nome completo
- E-mail e telefone
- Tipo · Data do ensaio · Local

### Seção: Financeiro
- Valor total
- Status de pagamento (badge: 50% pendente / Pago / etc.)

### Seção: Contrato
- Badge de status (Rascunho / Enviado / Assinado / Arquivado)
- Barra de progresso com as 4 etapas
- Botões: **Visualizar** · **Reenviar**
- Se não há contrato: botão **"Gerar contrato"** em destaque

### Seção: Anotações internas
- Texto livre visível apenas para o fotógrafo
- Não é exibido ao cliente

---

## 7. Configurações Globais

Acessadas pelo menu lateral, as configurações globais contêm:

### Perfil do fotógrafo
- Nome / razão social
- Logo do estúdio
- Dados de contato
- Dados para o rodapé dos contratos (cidade, foro eleito)

### Templates de contrato
- Listagem dos templates existentes
- Ações: **Criar novo** · **Editar** · **Duplicar** · **Excluir**
- Templates padrão disponíveis:
  - Ensaio e casamento
  - Newborn e gestante
  - Corporativo / produto
- Cada template pode ser personalizado com cláusulas específicas do fotógrafo

### Preferências gerais
- Notificações por e-mail
- Integrações (ex: plataformas de assinatura eletrônica)

---

## 8. Resumo do Fluxo Principal

```
Fotógrafo cria cliente
        ↓
Cria trabalho
(via tela de Trabalhos ou via atalho no perfil do cliente)
        ↓
Tela de confirmação: "Trabalho criado!"
        ↓
       / \
      /   \
Gerar       Fazer
contrato    depois
agora         ↓
  ↓      Entra no trabalho
Tela de    diretamente
contrato
  ↓
Escolhe template
(ou cria do zero)
  ↓
Editor com preview ao vivo
(dados preenchidos automaticamente)
  ↓
Envia para o cliente assinar
  ↓
Cliente assina → status atualiza automaticamente
  ↓
Fotógrafo sobe fotos na aba Galeria
  ↓
Configura seleção (data limite, venda de fotos adicionais)
  ↓
Envia galeria para o cliente selecionar
  ↓
Cliente seleciona → fotógrafo é notificado
  ↓
Fotógrafo libera entrega em alta (individual ou ZIP)
  ↓
Cliente baixa as fotos
  ↓
Trabalho concluído
```

---

## 9. Regras de Negócio

| Regra | Descrição |
|---|---|
| 1 cliente → N trabalhos | Um cliente pode ter múltiplos trabalhos independentes |
| Contrato no trabalho | Contratos não têm seção própria no menu; vivem dentro do trabalho |
| Dados automáticos | Ao gerar o contrato, os campos são preenchidos com os dados do trabalho |
| Entrega condicionada | As fotos em alta só ficam disponíveis após o fotógrafo ativar os toggles de entrega |
| Prazo da galeria | Após 30 dias do envio, o link expira; reenvio sujeito a taxa administrativa |
| Guarda de arquivos | Após expiração da galeria, o fotógrafo não tem obrigação de manter backup |
| Assinatura eletrônica | Válida conforme Lei nº 14.063/2020 |
| Direitos autorais | Fotógrafo mantém titularidade das imagens independentemente do pagamento (Lei nº 9.610/98) |

---

*Documento gerado em abril de 2026 — versão 1.0*