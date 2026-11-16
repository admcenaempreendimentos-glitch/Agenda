/**
 * Repactuações — regras de status.
 *
 * Módulo puro: sem React, sem Supabase. Serve para a tela, para o relatório e
 * para validação no servidor. Os rótulos são exatamente os que já aparecem no
 * sistema hoje, então nada muda para quem usa.
 */

export type StatusValor =
  | "aguardando_prazo"
  | "em_preparacao"
  | "em_negociacao"
  | "concluida"
  | "adiada";

export type DefinicaoStatus = {
  valor: StatusValor;
  rotulo: string;
  /** Tecla de atalho quando o contrato está aberto no painel de detalhe. */
  atalho: string;
  /** Classes do selo (Tailwind). */
  selo: string;
  /** Classes do ponto colorido (Tailwind). */
  ponto: string;
  descricao: string;
};

/** Ordem natural da jornada da repactuação. "Adiada" fica fora do fluxo. */
export const STATUS: DefinicaoStatus[] = [
  {
    valor: "aguardando_prazo",
    rotulo: "Aguardando prazo",
    atalho: "1",
    selo: "bg-amber-50 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30",
    ponto: "bg-amber-500",
    descricao: "A data da repactuação ainda está distante.",
  },
  {
    valor: "em_preparacao",
    rotulo: "Em preparação",
    atalho: "2",
    selo: "bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-400/10 dark:text-slate-300 dark:ring-slate-400/30",
    ponto: "bg-slate-500",
    descricao: "Levantando valor-alvo e montando a proposta.",
  },
  {
    valor: "em_negociacao",
    rotulo: "Em negociação",
    atalho: "3",
    selo: "bg-sky-50 text-sky-800 ring-1 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30",
    ponto: "bg-sky-500",
    descricao: "Proposta enviada; conversa em andamento com o locatário.",
  },
  {
    valor: "concluida",
    rotulo: "Concluída",
    atalho: "4",
    selo: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30",
    ponto: "bg-emerald-500",
    descricao: "Valor fechado e formalizado.",
  },
  {
    valor: "adiada",
    rotulo: "Adiada",
    atalho: "5",
    selo: "bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-400/10 dark:text-zinc-400 dark:ring-zinc-400/30",
    ponto: "bg-zinc-400",
    descricao: "Remarcada para outra data.",
  },
];

const PorValor = new Map<string, DefinicaoStatus>(STATUS.map((s) => [s.valor, s]));

/**
 * Como o banco pode ter gravado o status ao longo do tempo (com acento, com
 * espaço, em maiúsculas, em português corrido). Tudo cai no mesmo valor.
 */
const SINONIMOS: Record<string, StatusValor> = {
  aguardando: "aguardando_prazo",
  aguardando_data: "aguardando_prazo",
  no_prazo: "aguardando_prazo",
  pendente: "aguardando_prazo",
  preparacao: "em_preparacao",
  preparando: "em_preparacao",
  em_analise: "em_preparacao",
  analise: "em_preparacao",
  negociacao: "em_negociacao",
  negociando: "em_negociacao",
  proposta_enviada: "em_negociacao",
  concluido: "concluida",
  finalizada: "concluida",
  finalizado: "concluida",
  fechada: "concluida",
  fechado: "concluida",
  assinada: "concluida",
  adiado: "adiada",
  postergada: "adiada",
  remarcada: "adiada",
};

/** Aceita o valor cru do banco e devolve um status conhecido, ou null. */
export function normalizarStatus(bruto: unknown): StatusValor | null {
  if (typeof bruto !== "string") return null;
  const chave = bruto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!chave) return null;
  if (PorValor.has(chave)) return chave as StatusValor;
  return SINONIMOS[chave] ?? null;
}

export function definicaoDe(bruto: unknown): DefinicaoStatus | null {
  const v = normalizarStatus(bruto);
  return v ? (PorValor.get(v) ?? null) : null;
}

export function rotuloDe(bruto: unknown): string {
  return definicaoDe(bruto)?.rotulo ?? "Sem status";
}

/** Próximo passo natural — alimenta o botão de um clique só. */
const FLUXO: Record<StatusValor, StatusValor | null> = {
  aguardando_prazo: "em_preparacao",
  em_preparacao: "em_negociacao",
  em_negociacao: "concluida",
  concluida: null,
  adiada: "em_preparacao",
};

export function proximoStatus(bruto: unknown): DefinicaoStatus | null {
  const v = normalizarStatus(bruto);
  if (!v) return PorValor.get("em_preparacao") ?? null;
  const prox = FLUXO[v];
  return prox ? (PorValor.get(prox) ?? null) : null;
}

/* ------------------------------------------------------------------ */
/* Sugestão automática a partir da tabela de proposta                   */
/* ------------------------------------------------------------------ */

export type DadosProposta = {
  valorFechado?: number | string | null;
  proposta?: number | string | null;
  contraproposta?: number | string | null;
  dataPrevista?: string | Date | null;
};

function preenchido(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "number") return Number.isFinite(v) && v > 0;
  if (typeof v === "string") {
    const limpo = v.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
    const n = Number(limpo);
    return Number.isFinite(n) && n > 0;
  }
  return false;
}

/** Aceita Date, "AAAA-MM-DD" e "DD/MM/AAAA". */
export function parseData(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const texto = v.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const d = new Date(texto);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function diasAte(v: string | Date | null | undefined, hoje = new Date()): number | null {
  const d = parseData(v);
  if (!d) return null;
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((a - b) / 86_400_000);
}

/**
 * O status que os dados da proposta indicam. Serve para SUGERIR — nunca para
 * sobrescrever o que a pessoa escolheu à mão.
 */
export function statusSugerido(d: DadosProposta, hoje = new Date()): StatusValor {
  if (preenchido(d.valorFechado)) return "concluida";
  if (preenchido(d.proposta) || preenchido(d.contraproposta)) return "em_negociacao";
  const dias = diasAte(d.dataPrevista, hoje);
  if (dias !== null && dias > 60) return "aguardando_prazo";
  return "em_preparacao";
}

/**
 * Devolve a sugestão só quando ela difere do status atual e representa um
 * avanço — assim a barrinha de sugestão não fica piscando à toa.
 */
export function sugestaoPendente(
  statusAtual: unknown,
  dados: DadosProposta,
  hoje = new Date(),
): DefinicaoStatus | null {
  const atual = normalizarStatus(statusAtual);
  if (atual === "adiada") return null;
  const sugerido = statusSugerido(dados, hoje);
  if (sugerido === atual) return null;
  const ordem: StatusValor[] = ["aguardando_prazo", "em_preparacao", "em_negociacao", "concluida"];
  const i = atual ? ordem.indexOf(atual) : -1;
  const j = ordem.indexOf(sugerido);
  if (j <= i) return null;
  return PorValor.get(sugerido) ?? null;
}
