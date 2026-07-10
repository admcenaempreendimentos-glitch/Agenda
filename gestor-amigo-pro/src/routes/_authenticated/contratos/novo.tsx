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
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { contractTypesByCategory, contractCategoryLabel, type ContractCategory } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/contratos/novo")({
  component: NewContract,
});

function NewContract() {
  const navigate = useNavigate();
  const { data: firms = [] } = useQuery({
    queryKey: ["law_firms", "select"],
    queryFn: async () => (await supabase.from("law_firms").select("id, name").order("name")).data ?? [],
  });

  const [form, setForm] = useState({
    title: "",
    contract_type: "permuta",
    counterparty: "",
    object_summary: "",
    value_brl: "",
    signed_at: "",
    starts_at: "",
    ends_at: "",
    status: "draft" as "draft" | "in_review" | "negotiating" | "signed" | "archived",
    origin: "created_by_me" as "created_by_me" | "from_law_firm" | "from_counterparty",
    law_firm_id: "",
    notes: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Sem sessão");
      const value_cents = form.value_brl ? Math.round(Number(form.value_brl.replace(",", ".")) * 100) : null;
      const { data, error } = await supabase.from("contracts").insert({
        user_id: user.user.id,
        title: form.title,
        contract_type: form.contract_type,
        counterparty: form.counterparty || null,
        object_summary: form.object_summary || null,
        value_cents,
        signed_at: form.signed_at || null,
        starts_at: form.starts_at || null,
        ends_at: form.ends_at || null,
        status: form.status,
        origin: form.origin,
        law_firm_id: form.law_firm_id || null,
        notes: form.notes || null,
      }).select("id").single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => { toast.success("Contrato criado"); navigate({ to: "/contratos/$id", params: { id } }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <div className="max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link to="/contratos"><ArrowLeft className="h-4 w-4 mr-1" /> Contratos</Link>
      </Button>
      <PageHeader title="Novo contrato" description="Registre um contrato para acompanhar seu fluxo de revisão e vigência." />
      <Card className="p-6">
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-4">
          <div><Label>Título</Label><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={form.contract_type} onValueChange={(v) => setForm({ ...form, contract_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(contractTypesByCategory) as ContractCategory[]).map((cat) => (
                    <SelectGroup key={cat}>
                      <SelectLabel className="text-[10px] uppercase tracking-widest text-accent">{contractCategoryLabel[cat]}</SelectLabel>
                      {contractTypesByCategory[cat].map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Contraparte</Label><Input value={form.counterparty} onChange={(e) => setForm({ ...form, counterparty: e.target.value })} /></div>
          </div>
          <div><Label>Objeto / resumo</Label><Textarea rows={3} value={form.object_summary} onChange={(e) => setForm({ ...form, object_summary: e.target.value })} /></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div><Label>Valor (R$)</Label><Input inputMode="decimal" value={form.value_brl} onChange={(e) => setForm({ ...form, value_brl: e.target.value })} /></div>
            <div><Label>Assinatura</Label><Input type="date" value={form.signed_at} onChange={(e) => setForm({ ...form, signed_at: e.target.value })} /></div>
            <div><Label>Início</Label><Input type="date" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></div>
            <div><Label>Vigência</Label><Input type="date" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as typeof form.status })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Minuta</SelectItem>
                  <SelectItem value="in_review">Em revisão</SelectItem>
                  <SelectItem value="negotiating">Em negociação</SelectItem>
                  <SelectItem value="signed">Assinado</SelectItem>
                  <SelectItem value="archived">Arquivado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Origem</Label>
              <Select value={form.origin} onValueChange={(v) => setForm({ ...form, origin: v as typeof form.origin })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_by_me">Criado por mim</SelectItem>
                  <SelectItem value="from_law_firm">Do escritório</SelectItem>
                  <SelectItem value="from_counterparty">Da contraparte</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Escritório</Label>
              <Select value={form.law_firm_id} onValueChange={(v) => setForm({ ...form, law_firm_id: v })}>
                <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                <SelectContent>{firms.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Observações</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <Button type="submit" disabled={create.isPending}>{create.isPending ? "Salvando…" : "Criar contrato"}</Button>
        </form>
      </Card>
    </div>
  );
}