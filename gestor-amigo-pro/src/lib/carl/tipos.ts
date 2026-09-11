/**
 * Contrato do pacote de domínio (plano B).
 *
 * Cada sistema da Cena — Jurídico, Comercial, Locação, Patrimonial — entrega um
 * pacote com suas ferramentas, seu vocabulário e suas regras. O Carl é um só:
 * carrega os pacotes das áreas em que a pessoa tem acesso e passa a falar
 * aquele idioma, sem que nada precise ser reescrito no assistente.
 */

export type Area = "juridico" | "comercial" | "locacao" | "patrimonial" | "administrativo";

export const AREAS: Area[] = ["juridico", "comercial", "locacao", "patrimonial", "administrativo"];

export const areaLabel: Record<Area, string> = {
  juridico: "Jurídico",
  comercial: "Comercial",
  locacao: "Locação",
  patrimonial: "Patrimonial",
  administrativo: "Administrativo",
};

export type Nivel = "sem_acesso" | "leitura" | "escrita" | "gestao";

/**
 * Superfície mínima do cliente Supabase usada pelos pacotes de domínio.
 * Estrutural de propósito: aceita o cliente tipado do app e o cliente solto
 * criado na rota, sem depender dos genéricos do SDK, e permite consultar
 * tabelas que ainda não existem nos tipos gerados (Fase 0 e Fase 1).
 */
export type Supa = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

/** Registro de auditoria de cada ação da IA (implementado no chat.ts). */
export type Logger = (tool: string, input: unknown, result: unknown) => Promise<void>;

/** Resultado padronizado das ferramentas — nunca vaza mensagem bruta do banco. */
export type Resultado =
  | { ok: true; [k: string]: unknown }
  | { ok: false; error: string; needs_confirmation?: true };

export type ContextoDominio = {
  supabase: Supa;
  userId: string;
  /** Nível da pessoa nesta área; o pacote decide o que expor. */
  nivel: Nivel;
  /** Texto da última mensagem do usuário — única fonte de confirmação humana. */
  textoDoUsuario: string;
  log: Logger;
  /** Gate compartilhado de exclusões: limita quantas ações destrutivas por requisição. */
  guardedDelete: (
    table: string,
    titleColumn: string,
    id: string,
    confirmTitle: string,
    toolName: string,
  ) => Promise<Resultado>;
};

export type PacoteDominio = {
  area: Area;
  /** Como o Carl descreve esta área ao usuário. */
  descricao: string;
  /** Vocabulário e regras próprias, injetados no prompt quando a área está ativa. */
  instrucoes: string;
  /** Ferramentas disponíveis, já filtradas pelo nível de acesso. */
  ferramentas: (ctx: ContextoDominio) => Record<string, unknown>;
  /** Dados que entram no retrato enviado ao modelo. */
  snapshot: (supabase: Supa) => Promise<Record<string, unknown[]>>;
};
