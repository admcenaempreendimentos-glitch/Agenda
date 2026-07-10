import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/assistente")({
  component: AssistantPage,
});

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
        title="Assistente"
        description="Converse com uma IA que tem contexto dos seus escritórios, demandas e contratos."
      />

      <Card ref={scrollRef} className="flex-1 overflow-y-auto p-6 mb-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
            <Sparkles className="h-8 w-8 text-accent mb-3" />
            <h3 className="font-serif text-lg mb-2">Como posso ajudar?</h3>
            <p className="text-sm text-muted-foreground">
              Pergunte sobre demandas pendentes, contratos em revisão, prazos de vigência ou peça um resumo do que precisa da sua atenção hoje.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map((m) => (
              <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <ReactMarkdown>{m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}</p>
                  )}
                </div>
              </div>
            ))}
            {status === "submitted" && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-4 py-3 text-sm text-muted-foreground">Pensando…</div>
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