# Repactuações — ajuste rápido de status

Pacote pronto para aplicar no sistema de **Locações**, módulo **Repactuações**.
Resolve o ponto levantado: hoje o status só muda abrindo o contrato, e o único
botão visível no detalhe é "Adiar para outra data".

## O que muda na prática

| Hoje | Depois |
| --- | --- |
| Status só muda dentro do contrato | O selo é clicável **na lista e no detalhe** |
| Sem ação de avanço | Botão único **"Marcar como Em negociação"** (o passo provável) |
| Sem teclado | Teclas **1 a 5** com o contrato aberto |
| Um contrato por vez | Seleção múltipla na lista → troca em lote |
| Status sempre manual | Preencheu Proposta → sugere *Em negociação*; preencheu Valor fechado → sugere *Concluída* |
| Erro só aparece depois | Troca aparece na hora, com **Desfazer** por 6 segundos |

O caminho mais comum passa de *abrir o contrato → procurar o campo → salvar*
para **um clique no selo, direto na lista**.

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `status-repactuacao.ts` | Regras puras: lista de status, normalização do valor do banco, próximo passo, sugestão automática. Sem React e sem Supabase — serve também no servidor e no relatório. |
| `StatusRepactuacao.tsx` | `StatusRepactuacao` (selo clicável), `BotaoProximoStatus` (um clique), `SugestaoStatus` (barra de sugestão) e `useAtalhosStatus` (teclas 1–5). Só React + Tailwind, sem depender da biblioteca de UI. |
| `use-status-repactuacao.ts` | `useAtualizarStatus` e `useAtualizarStatusEmLote`: gravação otimista, reversão em erro, desfazer. |

## Como aplicar

### 1. Copiar

Copie os três arquivos para a pasta de Repactuações do sistema de Locações,
por exemplo `src/components/repactuacoes/`.

### 2. Ajustar os três imports de `use-status-repactuacao.ts`

```ts
import { supabase } from "@/integrations/supabase/client"; // caminho do cliente Supabase do projeto
import { toast } from "sonner";                            // ou o toast que o projeto já usa
const TABELA = "repactuacoes";                             // nome real da tabela
```

A coluna `status_atualizado_em` é opcional. Se ela não existir na tabela, ou
remova-a dos dois `update`, ou crie-a:

```sql
alter table public.repactuacoes
  add column if not exists status_atualizado_em timestamptz;
```

### 3. Na lista "Contratos de 2026"

Troque o selo estático pelo componente. É aqui que está o maior ganho: dá para
despachar vários contratos sem abrir nenhum.

```tsx
import { StatusRepactuacao } from "@/components/repactuacoes/StatusRepactuacao";
import { useAtualizarStatus } from "@/components/repactuacoes/use-status-repactuacao";

const atualizar = useAtualizarStatus(["repactuacoes", ano]);

// dentro da linha do contrato:
<StatusRepactuacao
  valor={contrato.status}
  onChange={(novo) =>
    atualizar.mutate({ id: contrato.id, status: novo, anterior: contrato.status })
  }
/>
```

Cuidado com um detalhe: se a linha inteira é clicável para abrir o contrato,
envolva o selo em `<span onClick={(e) => e.stopPropagation()}>`, senão o clique
no selo também abre o detalhe.

### 4. No cabeçalho do detalhe (Sala S214)

Substitua o selo "Em preparação" pelo mesmo componente e coloque o botão de um
clique ao lado de "Adiar para outra data" — o adiamento continua existindo, só
deixa de ser a única ação visível.

```tsx
<div className="flex flex-wrap items-center gap-2">
  <StatusRepactuacao
    valor={contrato.status}
    tamanho="md"
    onChange={(novo) => salvar(novo)}
  />
  <BotaoProximoStatus valor={contrato.status} onChange={(novo) => salvar(novo)} />
  <button onClick={abrirAdiamento}>Adiar para outra data</button>
</div>
```

### 5. Teclado e sugestão automática

```tsx
useAtalhosStatus({ ativo: Boolean(contrato), onChange: (novo) => salvar(novo) });

const [dispensada, setDispensada] = useState(false);
const sugestao = dispensada
  ? null
  : sugestaoPendente(contrato.status, {
      valorFechado: contrato.valor_fechado,
      proposta: contrato.valor_proposta,
      contraproposta: contrato.valor_contraproposta,
      dataPrevista: contrato.data_prevista,
    });

<SugestaoStatus
  sugestao={sugestao}
  onAceitar={(novo) => salvar(novo)}
  onDispensar={() => setDispensada(true)}
/>
```

A sugestão apenas **propõe**. Nunca sobrescreve o que a pessoa escolheu à mão,
e só aparece quando representa um avanço no fluxo — assim não fica piscando.

Zere `dispensada` quando trocar de contrato (`useEffect` com `[contrato.id]`),
senão a dispensa de um contrato silencia o seguinte.

## Observação sobre os valores gravados

`normalizarStatus()` aceita o que já está no banco em qualquer forma —
`"Concluída"`, `"concluida"`, `"CONCLUIDO"`, `"Em negociação"` — e converte para
o mesmo valor interno. Então **não é preciso migrar dados** para aplicar isto.

Se quiser padronizar depois, a migração é:

```sql
update public.repactuacoes set status = 'concluida'        where lower(unaccent(status)) in ('concluida','concluido','finalizada','fechada');
update public.repactuacoes set status = 'em_negociacao'    where lower(unaccent(status)) in ('em negociacao','negociacao','negociando');
update public.repactuacoes set status = 'em_preparacao'    where lower(unaccent(status)) in ('em preparacao','preparacao','em analise');
update public.repactuacoes set status = 'aguardando_prazo' where lower(unaccent(status)) in ('aguardando prazo','aguardando','pendente');
update public.repactuacoes set status = 'adiada'           where lower(unaccent(status)) in ('adiada','adiado','postergada');

alter table public.repactuacoes
  add constraint repactuacoes_status_valido
  check (status in ('aguardando_prazo','em_preparacao','em_negociacao','concluida','adiada'));
```

Rode o `update` **antes** do `check`, senão a restrição falha nas linhas antigas.

## Opcional — histórico de quem mudou o quê

Útil para o relatório e para a auditoria, já que repactuação mexe em valor de
aluguel:

```sql
create table if not exists public.repactuacao_status_historico (
  id            uuid primary key default gen_random_uuid(),
  repactuacao_id uuid not null references public.repactuacoes(id) on delete cascade,
  de            text,
  para          text not null,
  user_id       uuid not null default auth.uid(),
  criado_em     timestamptz not null default now()
);

alter table public.repactuacao_status_historico enable row level security;

create or replace function public.registra_status_repactuacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.repactuacao_status_historico (repactuacao_id, de, para)
    values (new.id, old.status, new.status);
  end if;
  return new;
end $$;

drop trigger if exists trg_status_repactuacao on public.repactuacoes;
create trigger trg_status_repactuacao
  after update of status on public.repactuacoes
  for each row execute function public.registra_status_repactuacao();
```

Falta a política de leitura (`create policy ... for select`) conforme as regras
de acesso já usadas nas demais tabelas do sistema de Locações.

---

## Para quem for aplicar pelo ChatGPT

Texto pronto para colar junto com os três arquivos:

> No sistema de Locações, módulo Repactuações, aplique o pacote em anexo
> (`status-repactuacao.ts`, `StatusRepactuacao.tsx`, `use-status-repactuacao.ts`)
> seguindo o `INSTRUCOES.md`. O objetivo é tornar a troca de status mais rápida:
> selo clicável na lista de contratos e no cabeçalho do detalhe, botão de um
> clique para o próximo status, teclas 1 a 5, troca em lote e sugestão automática
> a partir dos campos Proposta e Valor fechado. Mantenha o botão "Adiar para
> outra data" como está. Ajuste os imports do cliente Supabase e do toast para os
> caminhos reais do projeto, confirme o nome da tabela e me diga quais arquivos
> foram alterados.
