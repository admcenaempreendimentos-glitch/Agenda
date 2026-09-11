import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Send, Mic, MicOff, Volume2, VolumeX, Square } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useFala, useEscuta } from "@/hooks/use-voz";

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
  lembrar: "Anotado para lembrar",
  esquecer: "Memória apagada",
  listar_memorias: "Consultando o que lembra",
  pesquisar_na_web: "Pesquisou na internet",
  buscar_imovel: "Procurou o imóvel",
  situacao_do_imovel: "Situação completa do imóvel",
  buscar_pessoa: "Procurou a pessoa",
  pendencias_da_equipe: "Levantou as pendências",
  cadastrar_imovel: "Imóvel cadastrado",
  cadastrar_pessoa: "Pessoa cadastrada",
  vincular_ao_imovel: "Vinculado ao imóvel",
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

type EstadoCarl = "ocioso" | "pensando" | "falando";

/**
 * O mascote reage ao que o Carl está fazendo: parado quando ocioso, em
 * movimento enquanto pensa ou fala. É o que tira a sensação de chatbot parado.
 */
function MascoteAnimado({ estado = "ocioso" }: { estado?: EstadoCarl }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const ativo = estado !== "ocioso";

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (ativo) {
      v.playbackRate = estado === "pensando" ? 0.75 : 1;
      void v.play().catch(() => undefined);
    } else {
      v.pause();
      v.currentTime = 0;
    }
  }, [ativo, estado]);

  return (
    <video
      ref={videoRef}
      src="/mascote.webm"
      poster="/mascote.png"
      loop
      muted
      playsInline
      aria-label={estado === "pensando" ? "Carl pensando" : estado === "falando" ? "Carl falando" : "Carl"}
      className={`h-56 w-auto mb-4 transition-all duration-500 ${
        ativo
          ? "drop-shadow-[0_14px_30px_rgba(191,140,60,0.45)] scale-[1.02]"
          : "drop-shadow-[0_12px_24px_rgba(0,0,0,0.35)]"
      }`}
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

const SUGESTOES = [
  "O que precisa da minha atenção hoje?",
  "Quais contratos vencem nos próximos 60 dias?",
  "Tem alguma rodada de minuta parada?",
  "Como está o IGPM deste mês?",
];

function AssistantPage() {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const qc = useQueryClient();

  const fala = useFala();
  const falaRef = useRef(fala);
  falaRef.current = fala;

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      headers: async (): Promise<Record<string, string>> => {
        const { data } = await supabase.auth.getSession();
        return data.session
          ? { Authorization: `Bearer ${data.session.access_token}` }
          : {};
      },
      // Diz ao Carl de qual sistema e de qual tela ele está sendo chamado.
      body: { area: "juridico", tela: "assistente" },
    }),
    onError: (e) => toast.error(e.message),
    onFinish: ({ message }) => {
      qc.invalidateQueries();
      if (falaRef.current.ligada) {
        const texto = message.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ").trim();
        if (texto) falaRef.current.falar(texto);
      }
    },
  });

  const escuta = useEscuta((texto) => {
    setInput((atual) => (atual ? `${atual} ${texto}` : texto));
    inputRef.current?.focus();
  });

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);
  useEffect(() => { inputRef.current?.focus(); }, [status]);

  const busy = status === "submitted" || status === "streaming";
  const estadoCarl: EstadoCarl = fala.falando ? "falando" : busy ? "pensando" : "ocioso";

  async function submit() {
    const text = input.trim();
    if (!text || busy) return;
    fala.calar();
    if (escuta.ouvindo) escuta.parar();
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
            <MascoteAnimado estado={estadoCarl} />
            <h3 className="font-serif text-lg mb-2">Olá! Eu sou o Carl. Como posso ajudar?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Pergunte sobre demandas, contratos e prazos, peça um resumo do dia, ou toque no microfone e fale.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGESTOES.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => { setInput(sug); inputRef.current?.focus(); }}
                  className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-accent transition-colors"
                >
                  {sug}
                </button>
              ))}
            </div>
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

      <div className="flex gap-2 items-end">
        {escuta.suportado && (
          <Button
            type="button"
            variant={escuta.ouvindo ? "default" : "outline"}
            size="icon"
            className="self-end"
            aria-label={escuta.ouvindo ? "Parar de ouvir" : "Falar com o Carl"}
            title={escuta.ouvindo ? "Parar de ouvir" : "Falar com o Carl"}
            onClick={() => (escuta.ouvindo ? escuta.parar() : escuta.comecar())}
          >
            {escuta.ouvindo ? <MicOff className="h-4 w-4 animate-pulse" /> : <Mic className="h-4 w-4" />}
          </Button>
        )}
        <div className="flex-1">
          {escuta.ouvindo && (
            <p className="text-xs text-muted-foreground mb-1 animate-pulse">
              Ouvindo… {escuta.parcial}
            </p>
          )}
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder="Pergunte, ou toque no microfone e fale."
            rows={2}
            className="resize-none"
          />
        </div>
        {fala.suportado && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="self-end"
            aria-label={fala.falando ? "Parar a fala" : fala.ligada ? "Desligar a voz do Carl" : "Ligar a voz do Carl"}
            title={fala.falando ? "Parar a fala" : fala.ligada ? "Desligar a voz" : "Ligar a voz"}
            onClick={() => (fala.falando ? fala.calar() : fala.alternar())}
          >
            {fala.falando ? <Square className="h-4 w-4" /> : fala.ligada ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
        )}
        <Button onClick={submit} disabled={busy || !input.trim()} className="self-end" aria-label="Enviar">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}