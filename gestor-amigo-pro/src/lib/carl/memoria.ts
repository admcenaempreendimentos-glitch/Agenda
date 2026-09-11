import { tool } from "ai";
import { z } from "zod";
import type { ContextoDominio, Supa } from "./tipos";

/**
 * Memória do Carl — o que ele lembra de você entre conversas.
 *
 * Vale em todos os sistemas: a memória pertence à pessoa, não ao módulo.
 * Duas naturezas:
 *   pessoal — só você vê ("prefiro resumos curtos");
 *   equipe  — toda a organização lê ("o escritório Fulano cuida do trabalhista").
 *
 * Depende da migração 20260911130000.
 */

const MAX_MEMORIAS_NO_PROMPT = 40;
const chave = z.string().min(2).max(80);
const valor = z.string().min(2).max(600);

type Memoria = { chave: string; valor: string; area: string | null; escopo: string };

/** Lê as memórias relevantes para injetar no prompt do sistema. */
export async function carregarMemorias(supabase: Supa, area?: string | null): Promise<Memoria[]> {
  try {
    const q = (supabase as unknown as { from: (t: string) => any })
      .from("carl_memorias")
      .select("chave, valor, area, escopo")
      .order("atualizado_em", { ascending: false })
      .limit(MAX_MEMORIAS_NO_PROMPT);
    const { data, error } = await q;
    if (error) return [];
    const todas = (data ?? []) as Memoria[];
    // Memórias sem área valem sempre; com área, só quando a pessoa está nela.
    return todas.filter((m) => !m.area || m.area === "" || !area || m.area === area);
  } catch {
    return []; // tabela ainda não criada — o Carl segue funcionando sem memória
  }
}

/** Formata as memórias para o prompt, marcadas como dado e não como instrução. */
export function memoriasParaPrompt(memorias: Memoria[]): string {
  if (!memorias.length) return "";
  const linhas = memorias.map((m) => {
    const escopo = m.escopo === "equipe" ? "equipe" : "você";
    const area = m.area && m.area !== "" ? ` · ${m.area}` : "";
    return `- (${escopo}${area}) ${m.chave}: ${m.valor}`;
  });
  return linhas.join("\n");
}

export function ferramentasDeMemoria(ctx: ContextoDominio) {
  const { supabase, userId, log } = ctx;
  const tabela = () => (supabase as unknown as { from: (t: string) => any }).from("carl_memorias");

  return {
    lembrar: tool({
      description:
        "Guarda uma preferência, decisão ou fato para lembrar em conversas futuras. Use quando o usuário disser 'lembre que', 'da próxima vez', 'sempre faça assim', ou quando ele declarar uma regra de trabalho. Não guarde dado pessoal de terceiros nem conteúdo sigiloso de contrato.",
      inputSchema: z.object({
        chave: chave.describe("assunto curto e estável, ex.: 'escritorio_trabalhista'"),
        valor: valor.describe("o que deve ser lembrado, em uma frase"),
        escopo: z.enum(["pessoal", "equipe"]).default("pessoal")
          .describe("'equipe' só quando a informação valer para todos, ex.: qual escritório cuida de qual área"),
        area: z.enum(["juridico", "comercial", "locacao", "patrimonial", "administrativo"]).nullable().optional()
          .describe("deixe vazio se valer para qualquer área"),
      }),
      execute: async ({ chave: k, valor: v, escopo, area }) => {
        try {
          // A constraint é em colunas puras (user_id, escopo, area, chave) com
          // area NOT NULL DEFAULT ''. A chave vai normalizada para casar sempre.
          const { error } = await tabela().upsert(
            { user_id: userId, chave: k.trim().toLowerCase(), valor: v, escopo, area: area ?? "", origem: "explicita" },
            { onConflict: "user_id,escopo,area,chave" },
          );
          const r = error ? { ok: false as const, error: "Não consegui guardar essa informação." } : { ok: true as const, lembrado: k };
          await log("lembrar", { chave: k, escopo, area }, r);
          return r;
        } catch {
          return { ok: false as const, error: "A memória ainda não está disponível neste ambiente." };
        }
      },
    }),

    esquecer: tool({
      description: "Apaga uma memória guardada, pela chave. Use quando o usuário pedir para esquecer ou corrigir algo que você lembrava.",
      inputSchema: z.object({ chave }),
      execute: async ({ chave: k }) => {
        try {
          // eq, não ilike: com ilike, uma chave contendo % apagaria tudo.
          const { error } = await tabela().delete().eq("user_id", userId).eq("chave", k.trim().toLowerCase());
          const r = error ? { ok: false as const, error: "Não consegui apagar essa memória." } : { ok: true as const, esquecido: k };
          await log("esquecer", { chave: k }, r);
          return r;
        } catch {
          return { ok: false as const, error: "A memória ainda não está disponível neste ambiente." };
        }
      },
    }),

    listar_memorias: tool({
      description: "Lista tudo o que você lembra sobre o usuário e a equipe. Use quando ele perguntar 'o que você sabe sobre mim' ou 'o que você lembra'.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const { data, error } = await tabela().select("chave, valor, escopo, area").order("atualizado_em", { ascending: false }).limit(100);
          if (error) return { ok: false as const, error: "Não consegui ler a memória." };
          return { ok: true as const, memorias: data ?? [] };
        } catch {
          return { ok: false as const, error: "A memória ainda não está disponível neste ambiente." };
        }
      },
    }),
  };
}
