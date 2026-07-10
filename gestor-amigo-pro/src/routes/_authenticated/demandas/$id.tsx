import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Send, Pencil, Trash2 } from "lucide-react";
import { demandStatusLabel, demandPriorityLabel, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { CardCustomizer } from "@/components/card-customizer";

export const Route = createFileRoute("/_authenticated/demandas/$id")({
  component: DemandDetail,
});

function DemandDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [editOpen, setEditOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["demand", id],
    queryFn: async () => {
      const [demand, updates] = await Promise.all([
        supabase.from("demands").select("*, law_firms(id, name), contracts(id, title)").eq("id", id).maybeSingle(),
        supabase.from("demand_updates").select("*").eq("demand_id", id).order("created_at", { ascending: false }),
      ]);
      return { demand: demand.data, updates: updates.data ?? [] };
    },
  });

  const { data: firms = [] } = useQuery({
    queryKey: ["law_firms", "select"],
    queryFn: async () => (await supabase.from("law_firms").select("id, name").order("name")).data ?? [],
  });
  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts", "select"],
    queryFn: async () => (await supabase.from("contracts").select("id, title").order("title")).data ?? [],
  });

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const patch = {
        status: status as "open" | "in_progress" | "waiting" | "completed" | "cancelled",
        ...(status === "completed" ? { completed_at: new Date().toISOString().slice(0, 10) } : {}),
      };
      const { error } = await supabase.from("demands").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["demand", id] }); toast.success("Status atualizado"); },
  });

  const addNote = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Sem sessão");
      const { error } = await supabase.from("demand_updates").insert({
        user_id: user.user.id,
        demand_id: id,
        content: note,
      });
      if (error) throw error;
    },
    onSuccess: () => { setNote(""); qc.invalidateQueries({ queryKey: ["demand", id] }); toast.success("Anotação adicionada"); },
  });

  const deleteDemand = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("demands").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["demands"] });
      toast.success("Demanda apagada");
      navigate({ to: "/demandas" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  if (!data?.demand) return <p className="text-muted-foreground">Carregando…</p>;
  const d = data.demand;

  return (
    <div className="max-w-4xl">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link to="/demandas"><ArrowLeft className="h-4 w-4 mr-1" /> Demandas</Link>
      </Button>
      <PageHeader
        title={d.title}
        description={d.description ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={d.priority === "urgent" || d.priority === "high" ? "destructive" : "secondary"}>
              {demandPriorityLabel[d.priority ?? "none"]}
            </Badge>
            <Select value={d.status} onValueChange={(v) => updateStatus.mutate(v)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Aberta</SelectItem>
                <SelectItem value="in_progress">Em andamento</SelectItem>
                <SelectItem value="waiting">Aguardando retorno</SelectItem>
                <SelectItem value="completed">Concluída</SelectItem>
                <SelectItem value="cancelled">Cancelada</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => { if (confirm(`Apagar a demanda "${d.title}"?`)) deleteDemand.mutate(); }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Apagar
            </Button>
            <CardCustomizer
              table="demands"
              id={d.id}
              invalidateKey={["demand", id]}
              variant="button"
              value={{
                accent_color: d.accent_color,
                icon_emoji: d.icon_emoji,
                custom_tag: d.custom_tag,
                cover_image_url: d.cover_image_url,
              }}
            />
          </div>
        }
      />

      {d.subject_group ? (
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs uppercase tracking-widest text-foreground">
          <span className="text-muted-foreground">Assunto:</span> {d.subject_group}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 text-sm">
        <InfoRow label="Escritório" value={(d.law_firms as { name: string } | null)?.name ?? "—"} />
        <InfoRow label="Área" value={d.practice_area ?? "—"} />
        <InfoRow label="Enviada" value={formatDate(d.sent_at)} />
        <InfoRow label="Prazo" value={formatDate(d.due_at)} />
      </div>

      <Card className="p-6 mb-6">
        <h2 className="font-serif text-lg mb-3">Adicionar atualização</h2>
        <Textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Enviei minuta revisada por e-mail…"
          className="mb-3"
        />
        <Button size="sm" disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate()}>
          <Send className="h-4 w-4 mr-1" /> Registrar
        </Button>
      </Card>

      <Card className="p-6">
        <h2 className="font-serif text-lg mb-4">Histórico</h2>
        {data.updates.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem atualizações ainda.</p>
        ) : (
          <ul className="space-y-4">
            {data.updates.map((u) => (
              <li key={u.id} className="border-l-2 border-accent pl-4">
                <p className="text-xs text-muted-foreground">{formatDate(u.created_at)} · {demandStatusLabel[d.status] ?? ""}</p>
                <p className="text-sm mt-1 whitespace-pre-wrap">{u.content}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <EditDemandDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        demand={d}
        firms={firms}
        contracts={contracts}
        onSaved={() => qc.invalidateQueries({ queryKey: ["demand", id] })}
      />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground mt-1">{value}</p>
    </div>
  );
}

type DemandRow = {
  id: string;
  title: string;
  description: string | null;
  subject_group: string | null;
  practice_area: string | null;
  law_firm_id: string | null;
  contract_id: string | null;
  priority: "low" | "medium" | "high" | "urgent" | null;
  status: "open" | "in_progress" | "waiting" | "completed" | "cancelled";
  sent_at: string | null;
  due_at: string | null;
};

function EditDemandDialog({
  open,
  onOpenChange,
  demand,
  firms,
  contracts,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  demand: DemandRow;
  firms: { id: string; name: string }[];
  contracts: { id: string; title: string }[];
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    title: demand.title,
    description: demand.description ?? "",
    subject_group: demand.subject_group ?? "",
    practice_area: demand.practice_area ?? "",
    law_firm_id: demand.law_firm_id ?? "__none__",
    contract_id: demand.contract_id ?? "__none__",
    priority: (demand.priority ?? "__none__") as "__none__" | "low" | "medium" | "high" | "urgent",
    status: demand.status,
    sent_at: demand.sent_at ?? "",
    due_at: demand.due_at ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("demands")
      .update({
        title: form.title,
        description: form.description || null,
        subject_group: form.subject_group.trim() || null,
        practice_area: form.practice_area || null,
        law_firm_id: form.law_firm_id === "__none__" ? null : form.law_firm_id,
        contract_id: form.contract_id === "__none__" ? null : form.contract_id,
        priority: form.priority === "__none__" ? null : form.priority,
        status: form.status,
        sent_at: form.sent_at || null,
        due_at: form.due_at || null,
      })
      .eq("id", demand.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Demanda atualizada");
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(38rem,95vw)] max-h-[90vh] p-0 gap-0 flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="text-base font-serif">Editar demanda</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 p-5 overflow-y-auto flex-1">
          <div><Label>Título</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div>
            <Label>Assunto / Grupo</Label>
            <Input
              value={form.subject_group}
              placeholder="Ex.: Terreno Alphaville"
              onChange={(e) => setForm({ ...form, subject_group: e.target.value })}
            />
            <p className="text-[10px] text-muted-foreground mt-1">Demandas com o mesmo assunto ficam agrupadas.</p>
          </div>
          <div><Label>Descrição</Label><Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Escritório</Label>
              <Select value={form.law_firm_id} onValueChange={(v) => setForm({ ...form, law_firm_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum</SelectItem>
                  {firms.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Contrato relacionado</Label>
              <Select value={form.contract_id} onValueChange={(v) => setForm({ ...form, contract_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum</SelectItem>
                  {contracts.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label>Área</Label><Input value={form.practice_area} onChange={(e) => setForm({ ...form, practice_area: e.target.value })} /></div>
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
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as typeof form.status })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Aberta</SelectItem>
                  <SelectItem value="in_progress">Em andamento</SelectItem>
                  <SelectItem value="waiting">Aguardando retorno</SelectItem>
                  <SelectItem value="completed">Concluída</SelectItem>
                  <SelectItem value="cancelled">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>Enviada em</Label><Input type="date" value={form.sent_at} onChange={(e) => setForm({ ...form, sent_at: e.target.value })} /></div>
            <div><Label>Prazo</Label><Input type="date" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} /></div>
          </div>
        </div>
        <DialogFooter className="flex-row justify-end gap-2 border-t border-border bg-background px-5 py-3 sm:justify-end">
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button size="sm" onClick={save} disabled={saving} className="min-w-20">{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}