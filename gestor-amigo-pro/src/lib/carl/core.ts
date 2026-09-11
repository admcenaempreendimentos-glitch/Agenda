import { tool } from "ai";
import { z } from "zod";
import type { ContextoDominio, Supa } from "./tipos";

/**
 * Ferramentas do cadastro central — a espinha do ecossistema.
 *
 * Pessoas, imóveis e SPEs são cadastrados uma vez e referenciados por todos os
 * domínios. É o que permite ao Carl responder cruzando áreas: a visão 360 de um
 * ativo vem daqui.
 *
 * Depende da migração 20260911120000 (Fase 0). Sem ela, as ferramentas se
 * declaram indisponíveis em vez de quebrar.
 */

const uuid = z.string().uuid();
const texto = z.string().max(300);

const from = (supabase: Supa, t: string) => (supabase as unknown as { from: (t: string) => any }).from(t);

const INDISPONIVEL = {
  ok: false as const,
  error: "O cadastro central ainda não foi criado neste ambiente. Avise o usuário de que a base comum (Fase 0) precisa ser aplicada.",
};

const NAO_ENCONTRADO = { ok: false as const, error: "Não encontrei esse registro." };

/** Distingue tabela inexistente (Fase 0 não aplicada) de falha de consulta. */
function tabelaAusente(error: { code?: string } | null | undefined): boolean {
  const c = error?.code ?? "";
  return c === "42P01" || c === "PGRST205" || c === "PGRST202";
}

export function ferramentasDeCore(ctx: ContextoDominio) {
  const { supabase, log, nivel } = ctx;
  const podeEscrever = nivel === "escrita" || nivel === "gestao";

  const leitura = {
    buscar_imovel: tool({
      description:
        "Procura um imóvel no cadastro central pelo nome, código, empreendimento ou endereço. Use sempre que o usuário mencionar uma sala, apartamento, loja, terreno ou edifício, para descobrir o identificador e então consultar a situação completa.",
      inputSchema: z.object({ termo: z.string().min(2).max(120) }),
      execute: async ({ termo }) => {
        try {
          const t = `%${termo}%`;
          const { data, error } = await from(supabase, "imoveis")
            .select("id, codigo, nome, empreendimento, tipo, situacao, endereco, cidade, matricula")
            .or(`nome.ilike.${t},codigo.ilike.${t},empreendimento.ilike.${t},endereco.ilike.${t}`)
            .limit(12);
          if (error) return INDISPONIVEL;
          return { ok: true as const, imoveis: data ?? [] };
        } catch {
          return INDISPONIVEL;
        }
      },
    }),

    situacao_do_imovel: tool({
      description:
        "Mostra a situação completa de um imóvel, cruzando todas as áreas: dados do ativo e da SPE, quantos contratos existem, quantos vencem em 90 dias, quantas demandas jurídicas estão abertas e quantos documentos há. Use quando o usuário perguntar 'como está', 'qual a situação' ou antes de opinar sobre vender, alugar ou negociar um imóvel.",
      inputSchema: z.object({ imovel_id: uuid }),
      execute: async ({ imovel_id }) => {
        try {
          const [visao, contratos, demandas] = await Promise.all([
            from(supabase, "visao_imovel").select("*").eq("id", imovel_id).maybeSingle(),
            from(supabase, "contracts")
              .select("id, title, status, counterparty, ends_at")
              .eq("imovel_id", imovel_id)
              .order("ends_at", { ascending: true, nullsFirst: false })
              .limit(10),
            from(supabase, "demands")
              .select("id, title, status, priority, due_at")
              .eq("imovel_id", imovel_id)
              .in("status", ["open", "in_progress", "waiting"])
              .limit(10),
          ]);
          if (visao.error) return tabelaAusente(visao.error) ? INDISPONIVEL : NAO_ENCONTRADO;
          if (!visao.data) return NAO_ENCONTRADO;
          return {
            ok: true as const,
            imovel: visao.data,
            contratos: contratos.data ?? [],
            demandas_abertas: demandas.data ?? [],
            observacao: "Áreas ainda não implantadas (Comercial, Locação, Patrimonial) não aparecem aqui; diga isso ao usuário se ele perguntar por elas.",
          };
        } catch {
          return INDISPONIVEL;
        }
      },
    }),

    buscar_pessoa: tool({
      description:
        "Procura uma pessoa ou empresa no cadastro central pelo nome ou documento. Use para inquilinos, compradores, permutantes, fornecedores e escritórios, antes de vincular a um contrato ou demanda.",
      inputSchema: z.object({ termo: z.string().min(2).max(120) }),
      execute: async ({ termo }) => {
        try {
          const t = `%${termo}%`;
          const { data, error } = await from(supabase, "pessoas")
            .select("id, tipo, nome, documento, email, telefone, papeis")
            .or(`nome.ilike.${t},documento.ilike.${t}`)
            .limit(12);
          if (error) return INDISPONIVEL;
          return { ok: true as const, pessoas: data ?? [] };
        } catch {
          return INDISPONIVEL;
        }
      },
    }),

    pendencias_da_equipe: tool({
      description:
        "Lista o que está atrasado ou vencendo em todas as áreas a que o usuário tem acesso: demandas atrasadas, prazos dos próximos sete dias, vigências dos próximos sessenta dias e rodadas de minuta paradas há mais de uma semana. Use no início do dia, quando pedirem um resumo, ou quando perguntarem o que precisa de atenção.",
      inputSchema: z.object({
        area: z.enum(["juridico", "comercial", "locacao", "patrimonial"]).nullable().optional(),
      }),
      execute: async ({ area }) => {
        try {
          let q = from(supabase, "carl_pendencias").select("area, tipo, registro_id, titulo, data_ref, dias").limit(60);
          if (area) q = q.eq("area", area);
          const { data, error } = await q;
          if (error) return INDISPONIVEL;
          const linhas = (data ?? []) as { tipo: string }[];
          return {
            ok: true as const,
            total: linhas.length,
            pendencias: linhas,
            resumo_por_tipo: linhas.reduce<Record<string, number>>((acc, l) => {
              acc[l.tipo] = (acc[l.tipo] ?? 0) + 1;
              return acc;
            }, {}),
          };
        } catch {
          return INDISPONIVEL;
        }
      },
    }),
  };

  if (!podeEscrever) return leitura;

  return {
    ...leitura,

    cadastrar_imovel: tool({
      description: "Cadastra um imóvel no cadastro central. Use quando o usuário mencionar um imóvel que ainda não existe. Confirme o nome e o empreendimento antes.",
      inputSchema: z.object({
        nome: texto,
        codigo: texto.nullable().optional(),
        empreendimento: texto.nullable().optional(),
        tipo: z.enum(["apartamento", "sala", "loja", "terreno", "casa", "galpao", "vaga", "outro"]).nullable().optional(),
        endereco: texto.nullable().optional(),
        cidade: texto.nullable().optional(),
        matricula: texto.nullable().optional(),
        spe_id: uuid.nullable().optional(),
      }),
      execute: async (input) => {
        try {
          const { data, error } = await from(supabase, "imoveis").insert(input).select("id, nome").single();
          const r = error
            ? { ok: false as const, error: "Não consegui cadastrar o imóvel. Verifique se já existe um com o mesmo código." }
            : { ok: true as const, id: data.id, nome: data.nome };
          await log("cadastrar_imovel", input, r);
          return r;
        } catch {
          return INDISPONIVEL;
        }
      },
    }),

    cadastrar_pessoa: tool({
      description: "Cadastra uma pessoa ou empresa no cadastro central. Informe os papéis (inquilino, comprador, permutante, fornecedor, escritorio).",
      inputSchema: z.object({
        nome: texto,
        tipo: z.enum(["fisica", "juridica"]).default("fisica"),
        documento: z.string().max(20).nullable().optional().describe("CPF ou CNPJ, só dígitos"),
        email: z.string().email().max(200).nullable().optional(),
        telefone: z.string().max(40).nullable().optional(),
        papeis: z.array(z.string().max(40)).max(8).optional(),
      }),
      execute: async (input) => {
        try {
          const { data, error } = await from(supabase, "pessoas").insert(input).select("id, nome").single();
          const r = error
            ? { ok: false as const, error: "Não consegui cadastrar. Talvez o documento já exista." }
            : { ok: true as const, id: data.id, nome: data.nome };
          await log("cadastrar_pessoa", { nome: input.nome, tipo: input.tipo }, r);
          return r;
        } catch {
          return INDISPONIVEL;
        }
      },
    }),

    vincular_ao_imovel: tool({
      description: "Liga um contrato ou uma demanda a um imóvel do cadastro central. É isso que permite ver o ativo por inteiro depois. Use sempre que identificar a qual imóvel um registro se refere.",
      inputSchema: z.object({
        tipo_registro: z.enum(["contrato", "demanda"]),
        registro_id: uuid,
        imovel_id: uuid,
      }),
      execute: async ({ tipo_registro, registro_id, imovel_id }) => {
        try {
          const tabela = tipo_registro === "contrato" ? "contracts" : "demands";
          const { error } = await from(supabase, tabela).update({ imovel_id }).eq("id", registro_id);
          const r = error ? { ok: false as const, error: "Não consegui vincular." } : { ok: true as const };
          await log("vincular_ao_imovel", { tipo_registro, registro_id, imovel_id }, r);
          return r;
        } catch {
          return INDISPONIVEL;
        }
      },
    }),
  };
}
