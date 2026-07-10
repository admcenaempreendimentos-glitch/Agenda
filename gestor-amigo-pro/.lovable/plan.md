## Objetivo
1. Trocar o tema para **escuro, moderno, com profundidade e movimento**.
2. Reformular o módulo de **Contratos** com fluxo automatizado de troca de minutas e separação clara por categoria (Novos Negócios, Locação, Serviços, etc.).

---

## 1. Novo tema visual (escuro + profundidade + movimento)

**Paleta** (aplicada em `src/styles.css`, sem tocar em componentes):
- Fundo: `#0A0B10` (near-black azulado) com camadas `#101220` / `#161A2E` para cards.
- Superfícies elevadas com borda sutil `oklch(1 0 0 / 8%)` + `backdrop-blur`.
- Primária: azul-elétrico profundo `oklch(0.62 0.19 258)`.
- Accent: dourado quente `oklch(0.78 0.13 78)` (mantém identidade jurídica).
- Foreground: off-white levemente frio.
- Modo escuro fixo (`<html class="dark">` sempre).

**Profundidade e movimento**:
- Gradientes radiais suaves no `body` (aurora atrás do conteúdo) via `--gradient-ambient`.
- Sombras em camadas: `--shadow-soft`, `--shadow-glow-primary`.
- Bordas com gradient stroke em cards principais.
- Transições globais: `transition-colors`, `transition-transform` 200-300ms.
- Animações já disponíveis (`fade-in`, `scale-in`) aplicadas nas páginas via wrapper simples.
- Hover states com leve `translateY(-2px)` + glow em cards e botões primários.
- Sidebar com fundo translúcido e borda direita gradient.

---

## 2. Categorias de contrato

Definir **categoria** como agrupamento visual (separado do `contract_type` atual):
- Novos Negócios (permuta, compra e venda, incorporação)
- Locação
- Serviços
- NDA / Confidencialidade
- Outros

**Sem migração nova** — derivar categoria a partir do `contract_type` existente com um mapa em `src/lib/format.ts`. Lista de contratos passa a ter **abas por categoria** no topo, cada uma com sua contagem e cor. Formulário de novo contrato agrupa os tipos por categoria no `Select`.

---

## 3. Fluxo de troca de minutas (automatizado e auditável)

**Comportamento**:
- Cada versão anexada já registra: autor (usuário logado), data, arquivo.
- Adicionar campo automático **"Enviado por"** (Eu / Advogado da contraparte / Escritório) — inferido pelo próximo passo do fluxo, mas **editável**.
- Adicionar campo **"Direção"** (Enviada / Recebida) — alternada automaticamente a cada upload.
- Adicionar campo **"Rodada"** (nº incremental automático: v1, v2, v3…) — editável.
- Campo **"Resumo das alterações"** (texto) — opcional, editável a qualquer momento.
- Campo **"Status desta rodada"**: rascunho enviado / devolvida com ajustes / aceita / rejeitada — inferido, editável.

**Timeline visual** na página do contrato substitui a lista atual de versões:
- Linha vertical com marcos alternando lado esquerdo (recebidas) e direito (enviadas).
- Cada marco mostra: rodada, direção, quem enviou, data, arquivo (download), resumo, status — todos **editáveis inline** (clique no campo → vira input).
- Botão "Comparar com anterior" (abre visualização lado-a-lado dos metadados; diff de conteúdo fica para depois — só arquivos DOCX/PDF suportariam).
- Botão "Marcar como aceita" fecha a rodada e sugere mudar status do contrato para "Assinado".

**Migração leve** necessária na tabela `contract_versions`:
- `direction` (enviada/recebida)
- `sent_by` (texto livre com sugestões)
- `round_number` (int)
- `change_summary` (texto)
- `round_status` (texto)

Todos com default sensato para as versões já existentes.

---

## Detalhes técnicos

**Arquivos a alterar**:
- `src/styles.css` — nova paleta escura, gradientes, sombras, keyframes extras.
- `src/routes/__root.tsx` — forçar `class="dark"` no `<html>`.
- `src/lib/format.ts` — mapa `contractCategoryLabel` + função `getContractCategory(type)`.
- `src/routes/_authenticated/contratos/index.tsx` — abas por categoria + cards com hover glow.
- `src/routes/_authenticated/contratos/novo.tsx` — Select agrupado por categoria.
- `src/routes/_authenticated/contratos/$id.tsx` — timeline de minutas com edição inline.
- `src/components/app-sidebar.tsx` — visual translúcido/gradient.
- `src/components/page-header.tsx` — leve refresh tipográfico.

**Migração** (uma só, aditiva) em `contract_versions`.

**Sem** mudanças em: autenticação, storage, demandas, escritórios, assistente IA, integrações.

---

## Ordem de execução
1. Migração da tabela `contract_versions`.
2. Novo tema + `__root.tsx` + `styles.css`.
3. `format.ts` + categoria em lista/novo contrato.
4. Timeline de minutas com edição inline na página do contrato.
5. Passar rapidamente nas outras páginas garantindo que o tema escuro ficou coerente.
