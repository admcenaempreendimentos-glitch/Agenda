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
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/demandas/nova")({
  component: NewDemand,
});

function NewDemand() {
  const navigate = useNavigate();
  const { data: firms = [] } = useQuery({
    queryKey: ["law_firms", "select"],
    queryFn: async () => (await supabase.from("law_firms").select("id, name").order("name")).data ?? [],
  });
  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts", "select"],
    queryFn: async () => (await supabase.from("contracts").select("id, title").order("title")).data ?? [],
  });

  const [form, setForm] = useState({
    title: "",
    description: "",
    law_firm_id: "",
    contract_id: "",
    practice_area: "",
    subject_group: "",
    priority: "medium" as "__none__" | "low" | "medium" | "high" | "urgent",
    status: "open" as "open" | "in_progress" | "waiting" | "completed" | "cancelled",
    due_at: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Sem sessão");
      const { data, error } = await supabase.from("demands").insert({
        user_id: user.user.id,
        title: form.title,
        description: form.description || null,
        law_firm_id: form.law_firm_id || null,
        contract_id: form.contract_id || null,
        practice_area: form.practice_area || null,
        subject_group: form.subject_group.trim() || null,
        priority: form.priority === "__none__" ? null : form.priority,
        status: form.status,
        due_at: form.due_at || null,
      }).select("id").single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      toast.success("Demanda criada");
      navigate({ to: "/demandas/$id", params: { id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <div className="max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link to="/demandas"><ArrowLeft className="h-4 w-4 mr-1" /> Demandas</Link>
      </Button>
      <PageHeader title="Nova demanda" description="Descreva o que precisa ser feito pelo escritório." />
      <Card className="p-6">
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-4">
          <div><Label>Título</Label><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div>
            <Label>Assunto / Grupo</Label>
            <Input
              placeholder="Ex.: Terreno Alphaville · Contrato XPTO · Due diligence Fazenda"
              value={form.subject_group}
              onChange={(e) => setForm({ ...form, subject_group: e.target.value })}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Demandas com o mesmo assunto ficam agrupadas na lista.
            </p>
          </div>
          <div><Label>Descrição</Label><Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Escritório</Label>
              <Select value={form.law_firm_id} onValueChange={(v) => setForm({ ...form, law_firm_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>{firms.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Contrato relacionado</Label>
              <Select value={form.contract_id} onValueChange={(v) => setForm({ ...form, contract_id: v })}>
                <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                <SelectContent>{contracts.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label>Área</Label><Input placeholder="societário…" value={form.practice_area} onChange={(e) => setForm({ ...form, practice_area: e.target.value })} /></div>
            <div>
              <Label>Prioridade</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as typeof form.priority })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem prioridade</SelectItem>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Prazo</Label><Input type="date" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} /></div>
          </div>
          <Button type="submit" disabled={create.isPending}>{create.isPending ? "Salvando…" : "Criar demanda"}</Button>
        </form>
      </Card>
    </div>
  );
}