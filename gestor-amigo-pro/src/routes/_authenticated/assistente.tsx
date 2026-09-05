import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/assistente")({
  component: AssistantPage,
});

const toolLabel: Record<string, string> = {
  create_demand: "Demanda criada",
  update_demand: "Demanda atualizada",
  delete_demand: "Exclusão de demanda",
  add_demand_update: "Anotação registrada",
  create_law_firm: "Escritório cadastrado",
  update_law_firm: "Escritório atualizado",
  delete_law_firm: "Exclusão de escritório",
  create_contract: "Contrato criado",
  update_contract: "Contrato atualizado",
  delete_contract: "Exclusão de contrato",
};

/*
 * Renderização segura da saída do modelo: imagens são suprimidas (canal de
 * exfiltração via URL) e links só são clicáveis se forem http(s), sempre em
 * nova aba com rel="noopener noreferrer".
 */
const safeMarkdown: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  img: () => null,
  a: ({ href, children }) => {
    const ok = typeof href === "string" && /^https?:\/\//i.test(href);
    return ok ? (
      <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
    ) : (
      <span>{children}</span>
    );
  },
};

function MascoteAvatar({ size = 36 }: { size?: number }) {
  return (
    <img
      src="/mascote.png"
      alt="Carl, o assistente"
      width={size}
      height={size}
      className="rounded-full object-cover object-top bg-muted ring-1 ring-border shrink-0"
      style={{ width: size, height: size }}
    />
  );
}

function MascoteAnimado() {
  return (
    <video
      src="/mascote.webm"
      poster="/mascote.png"
      autoPlay
      loop
      muted
      playsInline
      className="h-56 w-auto mb-4 drop-shadow-[0_12px_24px_rgba(0,0,0,0.35)]"
      onError={(e) => {
        // navegadores sem suporte a WebM com alpha caem para a imagem estática
        const el = e.currentTarget;
        const img = document.createElement("img");
        img.src = "/mascote.png";
        img.className = el.className;
        el.replaceWith(img);
      }}
    />
  );
}

function AssistantPage() {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const qc = useQueryClient();

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      headers: async (): Promise<Record<string, string>> => {
        const { data } = await supabase.auth.getSession();
        return data.session
          ? { Authorization: `Bearer ${data.session.access_token}` }
          : {};
      },
    }),
    onError: (e) => toast.error(e.message),
    onFinish: () => qc.invalidateQueries(),
  });

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);
  useEffect(() => { inputRef.current?.focus(); }, [status]);

  const busy = status === "submitted" || status === "streaming";

  async function submit() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    await sendMessage({ text });
  }

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      <PageHeader
        title="Carl — Assistente"
        description="Converse com o Carl, a IA que tem contexto dos seus escritórios, demandas e contratos."
      />

      <Card ref={scrollRef} className="flex-1 overflow-y-auto p-6 mb-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
            <MascoteAnimado />
            <h3 className="font-serif text-lg mb-2">Olá! Eu sou o Carl. Como posso ajudar?</h3>
            <p className="text-sm text-muted-foreground">
              Pergunte sobre demandas pendentes, contratos em revisão, prazos de vigência ou peça um resumo do que precisa da sua atenção hoje.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map((m) => (
              <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start items-end gap-2"}>
                {m.role === "assistant" && <MascoteAvatar />}
                <div className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {m.role === "assistant" ? (
                    <div className="space-y-2">
                      {/* Ações executadas pela IA ficam visíveis ao usuário (auditoria set/2026) */}
                      {m.parts.filter((p) => p.type.startsWith("tool-")).map((p, i) => {
                        const tp = p as unknown as { type: string; state?: string; output?: { ok?: boolean; error?: string; needs_confirmation?: boolean } };
                        const name = tp.type.slice(5);
                        const ok = tp.output?.ok;
                        const tone = ok === true ? "text-emerald-700 dark:text-emerald-400" : ok === false ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground";
                        return (
                          <div key={`${m.id}-t${i}`} className={`text-[11px] uppercase tracking-wider font-mono ${tone}`}>
                            ⚙ {toolLabel[name] ?? name}
                            {ok === false && tp.output?.error ? <span className="normal-case tracking-normal font-sans"> — {tp.output.error}</span> : null}
                          </div>
                        );
                      })}
                      <div className="prose prose-sm max-w-none dark:prose-invert">
                        <ReactMarkdown components={safeMarkdown}>{m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}</ReactMarkdown>
                      </div>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}</p>
                  )}
                </div>
              </div>
            ))}
            {status === "submitted" && (
              <div className="flex justify-start items-end gap-2">
                <MascoteAvatar />
                <div className="bg-muted rounded-lg px-4 py-3 text-sm text-muted-foreground">Carl está pensando…</div>
              </div>
            )}
          </div>
        )}
      </Card>

      <div className="flex gap-2">
        <Textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder="Ex.: quais demandas estão pendentes há mais de 7 dias?"
          rows={2}
          className="resize-none"
        />
        <Button onClick={submit} disabled={busy || !input.trim()} className="self-end">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}