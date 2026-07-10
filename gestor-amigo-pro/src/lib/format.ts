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

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatCurrency(cents: number | null | undefined) {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function daysUntil(date: string | null | undefined) {
  if (!date) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const t = new Date(date);
  t.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - now.getTime()) / 86400000);
}