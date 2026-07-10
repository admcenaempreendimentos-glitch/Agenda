import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Mail } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/demandas/de-email")({
  component: FromEmail,
});

function FromEmail() {
  const navigate = useNavigate();
  const { data: firms = [] } = useQuery({
    queryKey: ["law_firms", "select"],
    queryFn: async () =>
      (await supabase.from("law_firms").select("id, name").order("name")).data ?? [],
  });

  const [form, setForm] = useState({
    from_name: "",
    from_email: "",
    subject: "",
    received_at: "",
    body: "",
    law_firm_id: "",
    practice_area: "",
    priority: "medium" as "low" | "medium" | "high" | "urgent",
    due_at: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Sem sessão");

      const header = [
        `De: ${form.from_name || form.from_email || "—"}${form.from_email && form.from_name ? ` <${form.from_email}>` : ""}`,
        form.received_at ? `Recebido em: ${form.received_at}` : null,
        form.subject ? `Assunto: ${form.subject}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const description = `${header}\n\n---\n\n${form.body}`.trim();

      const { data, error } = await supabase
        .from("demands")
        .insert({
          user_id: user.user.id,
          title: form.subject || "(sem assunto)",
          description,
          law_firm_id: form.law_firm_id || null,
          practice_area: form.practice_area || null,
          priority: form.priority,
          status: "open",
          due_at: form.due_at || null,
          source: "email",
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      toast.success("Demanda criada a partir do e-mail");
      navigate({ to: "/demandas/$id", params: { id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <div className="max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link to="/demandas">
          <ArrowLeft className="h-4 w-4 mr-1" /> Demandas
        </Link>
      </Button>
      <PageHeader
        title="Nova demanda a partir de e-mail"
        description="Cole os dados do e-mail que ainda está na sua caixa de entrada. Assim você registra o que precisa ser tratado e não perde de vista."
      />
      <Card className="p-6">
        <div className="mb-5 flex items-start gap-2 rounded-md border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
          <Mail className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            Enquanto a integração direta com o Outlook não é liberada pelo TI, use este formulário para registrar o e-mail manualmente. Depois de conectado, esta tela será substituída pela leitura direta da sua caixa de entrada.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Remetente</Label>
              <Input
                placeholder="Nome"
                value={form.from_name}
                onChange={(e) => setForm({ ...form, from_name: e.target.value })}
              />
            </div>
            <div>
              <Label>E-mail do remetente</Label>
              <Input
                type="email"
                placeholder="fulano@escritorio.com"
                value={form.from_email}
                onChange={(e) => setForm({ ...form, from_email: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-3">
            <div>
              <Label>Assunto</Label>
              <Input
                required
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            </div>
            <div>
              <Label>Recebido em</Label>
              <Input
                type="date"
                value={form.received_at}
                onChange={(e) => setForm({ ...form, received_at: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label>Conteúdo do e-mail</Label>
            <Textarea
              rows={8}
              placeholder="Cole aqui o corpo do e-mail…"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Escritório responsável</Label>
              <Select
                value={form.law_firm_id}
                onValueChange={(v) => setForm({ ...form, law_firm_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  {firms.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Área</Label>
              <Input
                placeholder="societário, trabalhista…"
                value={form.practice_area}
                onChange={(e) => setForm({ ...form, practice_area: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Prioridade</Label>
              <Select
                value={form.priority}
                onValueChange={(v) => setForm({ ...form, priority: v as typeof form.priority })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prazo</Label>
              <Input
                type="date"
                value={form.due_at}
                onChange={(e) => setForm({ ...form, due_at: e.target.value })}
              />
            </div>
          </div>

          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Salvando…" : "Registrar demanda"}
          </Button>
        </form>
      </Card>
    </div>
  );
}