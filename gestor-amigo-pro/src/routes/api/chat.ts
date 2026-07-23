import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, stepCountIs, tool, type UIMessage } from "ai";
import { createLovableAiGateway } from "@/lib/ai-gateway.server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

type Body = { messages?: UIMessage[] };

function makeClient(token: string) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

async function loadContext(supabase: ReturnType<typeof makeClient>) {
  const [firms, demands, contracts] = await Promise.all([
    supabase.from("law_firms").select("id, name, practice_areas, status, contact_name, contact_email"),
    supabase.from("demands").select("id, title, status, priority, sent_at, due_at, completed_at, practice_area, subject_group, description, law_firm_id, contract_id"),
    supabase.from("contracts").select("id, title, contract_type, counterparty, status, origin, signed_at, ends_at, value_cents, notes, law_firm_id"),
  ]);
  return {
    firms: firms.data ?? [],
    demands: demands.data ?? [],
    contracts: contracts.data ?? [],
  };
}

const demandStatus = z.enum(["open", "in_progress", "waiting", "completed", "cancelled"]);
const demandPriority = z.enum(["low", "medium", "high", "urgent"]);
const contractStatus = z.enum(["draft", "in_review", "negotiating", "signed", "archived"]);
const contractOrigin = z.enum(["created_by_me", "from_law_firm", "from_counterparty"]);
const firmStatus = z.enum(["active", "inactive", "on_hold"]);

function makeTools(supabase: ReturnType<typeof makeClient>, userId: string) {
  return {
    create_demand: tool({
      description: "Cria uma nova demanda para um escritório. Use quando o usuário pedir para criar/registrar/adicionar uma demanda ou tarefa jurídica.",
      inputSchema: z.object({
        title: z.string(),
        description: z.string().nullable().optional(),
        subject_group: z.string().nullable().optional(),
        law_firm_id: z.string().nullable().optional(),
        contract_id: z.string().nullable().optional(),
        practice_area: z.string().nullable().optional(),
        priority: demandPriority.nullable().optional(),
        status: demandStatus.optional(),
        due_at: z.string().nullable().optional().describe("YYYY-MM-DD"),
      }),
      execute: async (input) => {
        const { data, error } = await supabase.from("demands").insert({ ...input, user_id: userId }).select("id, title").single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, id: data.id, title: data.title };
      },
    }),
    update_demand: tool({
      description: "Atualiza campos de uma demanda existente pelo id. Passe apenas os campos a alterar.",
      inputSchema: z.object({
        id: z.string(),
        title: z.string().optional(),
        description: z.string().nullable().optional(),
        subject_group: z.string().nullable().optional(),
        law_firm_id: z.string().nullable().optional(),
        contract_id: z.string().nullable().optional(),
        practice_area: z.string().nullable().optional(),
        priority: demandPriority.nullable().optional(),
        status: demandStatus.optional(),
        due_at: z.string().nullable().optional(),
        completed_at: z.string().nullable().optional(),
      }),
      execute: async ({ id, ...patch }) => {
        const { error } = await supabase.from("demands").update(patch).eq("id", id);
        return error ? { ok: false, error: error.message } : { ok: true };
      },
    }),
    delete_demand: tool({
      description: "Apaga uma demanda pelo id. Confirme com o usuário antes se houver ambiguidade.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const { error } = await supabase.from("demands").delete().eq("id", id);
        return error ? { ok: false, error: error.message } : { ok: true };
      },
    }),
    add_demand_update: tool({
      description: "Registra uma anotação/atualização no histórico de uma demanda.",
      inputSchema: z.object({ demand_id: z.string(), content: z.string() }),
      execute: async ({ demand_id, content }) => {
        const { error } = await supabase.from("demand_updates").insert({ demand_id, content, user_id: userId });
        return error ? { ok: false, error: error.message } : { ok: true };
      },
    }),

    create_law_firm: tool({
      description: "Cadastra um novo escritório de advocacia.",
      inputSchema: z.object({
        name: z.string(),
        contact_name: z.string().nullable().optional(),
        contact_email: z.string().nullable().optional(),
        contact_phone: z.string().nullable().optional(),
        fee_model: z.string().nullable().optional(),
        practice_areas: z.array(z.string()).optional(),
        status: firmStatus.optional(),
        notes: z.string().nullable().optional(),
      }),
      execute: async (input) => {
        const { data, error } = await supabase.from("law_firms").insert({ ...input, user_id: userId }).select("id, name").single();
        return error ? { ok: false, error: error.message } : { ok: true, id: data.id, name: data.name };
      },
    }),
    update_law_firm: tool({
      description: "Atualiza um escritório existente pelo id.",
      inputSchema: z.object({
        id: z.string(),
        name: z.string().optional(),
        contact_name: z.string().nullable().optional(),
        contact_email: z.string().nullable().optional(),
        contact_phone: z.string().nullable().optional(),
        fee_model: z.string().nullable().optional(),
        practice_areas: z.array(z.string()).optional(),
        status: firmStatus.optional(),
        notes: z.string().nullable().optional(),
      }),
      execute: async ({ id, ...patch }) => {
        const { error } = await supabase.from("law_firms").update(patch).eq("id", id);
        return error ? { ok: false, error: error.message } : { ok: true };
      },
    }),
    delete_law_firm: tool({
      description: "Apaga um escritório pelo id.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const { error } = await supabase.from("law_firms").delete().eq("id", id);
        return error ? { ok: false, error: error.message } : { ok: true };
      },
    }),

    create_contract: tool({
      description: "Cria um novo contrato.",
      inputSchema: z.object({
        title: z.string(),
        contract_type: z.string().describe("permuta | compra_venda | incorporacao | parceria | locacao | sublocacao | cessao_uso | prestacao_servico | empreitada | fornecimento | nda | confidencialidade | outros"),
        counterparty: z.string().nullable().optional(),
        law_firm_id: z.string().nullable().optional(),
        status: contractStatus.optional(),
        origin: contractOrigin.optional(),
        object_summary: z.string().nullable().optional(),
        value_cents: z.number().int().nullable().optional(),
        starts_at: z.string().nullable().optional(),
        ends_at: z.string().nullable().optional(),
        signed_at: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }),
      execute: async (input) => {
        const { data, error } = await supabase.from("contracts").insert({ ...input, user_id: userId }).select("id, title").single();
        return error ? { ok: false, error: error.message } : { ok: true, id: data.id, title: data.title };
      },
    }),
    update_contract: tool({
      description: "Atualiza um contrato existente pelo id.",
      inputSchema: z.object({
        id: z.string(),
        title: z.string().optional(),
        contract_type: z.string().optional(),
        counterparty: z.string().nullable().optional(),
        law_firm_id: z.string().nullable().optional(),
        status: contractStatus.optional(),
        origin: contractOrigin.optional(),
        object_summary: z.string().nullable().optional(),
        value_cents: z.number().int().nullable().optional(),
        starts_at: z.string().nullable().optional(),
        ends_at: z.string().nullable().optional(),
        signed_at: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }),
      execute: async ({ id, ...patch }) => {
        const { error } = await supabase.from("contracts").update(patch).eq("id", id);
        return error ? { ok: false, error: error.message } : { ok: true };
      },
    }),
    delete_contract: tool({
      description: "Apaga um contrato pelo id.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const { error } = await supabase.from("contracts").delete().eq("id", id);
        return error ? { ok: false, error: error.message } : { ok: true };
      },
    }),
  };
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json()) as Body;
        if (!Array.isArray(body.messages)) return new Response("Bad request", { status: 400 });

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const supabase = makeClient(token);
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userData.user) return new Response("Unauthorized", { status: 401 });
        const userId = userData.user.id;

        const ctx = await loadContext(supabase);
        const system = `Você é Carl, o mascote e assistente jurídico interno da Cena Empreendimentos — um senhor sábio e elegante, inspirado no legado de Carl Hoepcke, que carrega uma bússola e orienta a equipe com precisão. Apresente-se como Carl quando fizer sentido. Responde em português do Brasil, tom profissional, cordial e direto.

Você tem acesso ao snapshot atual dos registros do usuário abaixo, E às ferramentas para CRIAR, ATUALIZAR e APAGAR escritórios, demandas e contratos, além de registrar anotações nas demandas.

Regras:
- Quando o usuário pedir uma alteração (criar, editar, atualizar status, mudar prazo, apagar, marcar como concluída, adicionar anotação etc.), USE as ferramentas — não invente que "fez" sem chamar a ferramenta.
- Para vincular a um escritório ou contrato, use o id que aparece no snapshot. Se o usuário mencionar por nome/título, procure o id no snapshot; se houver ambiguidade ou não encontrar, pergunte antes.
- Para ações destrutivas (apagar), confirme com o usuário antes se não estiver claro qual item.
- Após executar ferramentas, responda em português confirmando o que foi feito de forma curta.
- Para responder perguntas de consulta, use o snapshot abaixo; se algo não estiver ali, diga que não consta.

ESCRITÓRIOS (${ctx.firms.length}):
${JSON.stringify(ctx.firms)}

DEMANDAS (${ctx.demands.length}):
${JSON.stringify(ctx.demands)}

CONTRATOS (${ctx.contracts.length}):
${JSON.stringify(ctx.contracts)}

Data de hoje: ${new Date().toISOString().slice(0, 10)}.`;

        const gateway = createLovableAiGateway(key);
        const result = streamText({
          model: gateway("google/gemini-2.5-flash"),
          system,
          messages: await convertToModelMessages(body.messages),
          tools: makeTools(supabase, userId),
          stopWhen: stepCountIs(50),
        });
        return result.toUIMessageStreamResponse({ originalMessages: body.messages });
      },
    },
  },
});