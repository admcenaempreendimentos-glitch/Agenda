export const contractStatusLabel: Record<string, string> = {
  draft: "Minuta",
  in_review: "Em revisão",
  negotiating: "Em negociação",
  signed: "Assinado",
  archived: "Arquivado",
};

export const contractOriginLabel: Record<string, string> = {
  created_by_me: "Criado por mim",
  from_law_firm: "Do escritório",
  from_counterparty: "Da contraparte",
};

export type ContractCategory =
  | "novos_negocios"
  | "locacao"
  | "servicos"
  | "nda"
  | "outros";

export const contractCategoryLabel: Record<ContractCategory, string> = {
  novos_negocios: "Novos negócios",
  locacao: "Locação",
  servicos: "Serviços",
  nda: "NDA / Sigilo",
  outros: "Outros",
};

export const contractTypesByCategory: Record<ContractCategory, { value: string; label: string }[]> = {
  novos_negocios: [
    { value: "permuta", label: "Permuta" },
    { value: "compra_venda", label: "Compra e venda" },
    { value: "incorporacao", label: "Incorporação" },
    { value: "parceria", label: "Parceria" },
  ],
  locacao: [
    { value: "locacao", label: "Locação" },
    { value: "sublocacao", label: "Sublocação" },
    { value: "cessao_uso", label: "Cessão de uso" },
  ],
  servicos: [
    { value: "prestacao_servico", label: "Prestação de serviço" },
    { value: "empreitada", label: "Empreitada" },
    { value: "fornecimento", label: "Fornecimento" },
  ],
  nda: [
    { value: "nda", label: "NDA" },
    { value: "confidencialidade", label: "Confidencialidade" },
  ],
  outros: [
    { value: "outros", label: "Outros" },
  ],
};

export function getContractCategory(type: string | null | undefined): ContractCategory {
  if (!type) return "outros";
  for (const [cat, list] of Object.entries(contractTypesByCategory)) {
    if (list.some((t) => t.value === type)) return cat as ContractCategory;
  }
  return "outros";
}

export const versionDirectionLabel: Record<string, string> = {
  sent: "Enviada",
  received: "Recebida",
};

export const roundStatusLabel: Record<string, string> = {
  sent: "Rascunho enviado",
  returned: "Devolvida com ajustes",
  accepted: "Aceita",
  rejected: "Rejeitada",
};

export const roundStatusTone: Record<string, string> = {
  sent: "bg-primary/15 text-primary border-primary/30",
  returned: "bg-accent/15 text-accent border-accent/30",
  accepted: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
};

export const demandStatusLabel: Record<string, string> = {
  open: "Aberta",
  in_progress: "Em andamento",
  waiting: "Aguardando retorno",
  completed: "Concluída",
  cancelled: "Cancelada",
};

export const demandPriorityLabel: Record<string, string> = {
  none: "Sem prioridade",
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

export function priorityLabel(p: string | null | undefined) {
  return demandPriorityLabel[p ?? "none"] ?? "—";
}

/**
 * Colunas DATE do Postgres chegam como "YYYY-MM-DD". `new Date("YYYY-MM-DD")`
 * interpreta como UTC e, no Brasil (UTC-3), exibe o dia ANTERIOR. Aqui a data
 * é montada no fuso local do navegador para evitar o deslocamento de -1 dia
 * em prazos, vigências e assinaturas.
 */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m && value.length === 10) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Data de hoje no fuso local do navegador, no formato YYYY-MM-DD (para colunas DATE). */
export function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function formatDate(value: string | null | undefined) {
  const d = parseDateOnly(value);
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Converte valor digitado em reais para centavos, aceitando os formatos
 * "1.234.567,89", "1234567,89", "1234567.89", "R$ 1.234", "1234".
 * Retorna null para entrada vazia ou inválida (antes, "1.500,00" virava R$ 1,50).
 */
export function parseBRLToCents(input: string | null | undefined): number | null {
  const s = (input ?? "").replace(/[R$\s]/g, "").trim();
  if (!s) return null;
  let norm: string;
  if (/,\d{1,2}$/.test(s)) norm = s.replace(/\./g, "").replace(",", ".");
  else if (/\.\d{1,2}$/.test(s) && !s.includes(",")) norm = s;
  else norm = s.replace(/[.,]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(norm)) return null;
  const n = Number(norm);
  if (!Number.isFinite(n) || n < 0 || n > 1e10) return null;
  return Math.round(n * 100);
}

export function formatCurrency(cents: number | null | undefined) {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function daysUntil(date: string | null | undefined) {
  const t = parseDateOnly(date);
  if (!t) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  t.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - now.getTime()) / 86400000);
}