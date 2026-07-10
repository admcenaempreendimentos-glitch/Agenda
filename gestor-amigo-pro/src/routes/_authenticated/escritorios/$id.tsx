import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Pencil } from "lucide-react";
import { toast } from "sonner";
import { demandStatusLabel, demandPriorityLabel, formatDate, daysUntil } from "@/lib/format";
import { CardCustomizer } from "@/components/card-customizer";

export const Route = createFileRoute("/_authenticated/escritorios/$id")({
  component: FirmDetail,
});

function FirmDetail() {
  const { id } = Route.useParams();
  const [editOpen, setEditOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["law_firm", id],
    queryFn: async () => {
      const [firm, demands, contracts] = await Promise.all([
        supabase.from("law_firms").select("*").eq("id", id).maybeSingle(),
        supabase.from("demands").select("id, title, status, priority, due_at").eq("law_firm_id", id).order("created_at", { ascending: false }),
        supabase.from("contracts").select("id, title, status, counterparty").eq("law_firm_id", id).order("created_at", { ascending: false }),
      ]);
      return { firm: firm.data, demands: demands.data ?? [], contracts: contracts.data ?? [] };
    },
  });

  if (!data?.firm) return <p className="text-muted-foreground">Carregando…</p>;
  const { firm, demands, contracts } = data;
  const openDemands = demands.filter((d) => !["completed", "cancelled"].includes(d.status));
  const overdue = openDemands.filter((d) => {
    const dd = daysUntil(d.due_at);
    return dd !== null && dd < 0;
  }).length;

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link to="/escritorios"><ArrowLeft className="h-4 w-4 mr-1" /> Escritórios</Link>
      </Button>
      <PageHeader
        title={firm.name}
        description={firm.contact_name ? `Contato: ${firm.contact_name}${firm.contact_email ? " · " + firm.contact_email : ""}` : undefined}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={firm.status === "active" ? "default" : "secondary"}>{firm.status === "active" ? "Ativo" : "Inativo"}</Badge>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
          </Button>
            <CardCustomizer
              table="law_firms"
              id={firm.id}
              invalidateKey={["law_firm", id]}
              variant="button"
              value={{
                accent_color: firm.accent_color,
                icon_emoji: firm.icon_emoji,
                custom_tag: firm.custom_tag,
                cover_image_url: firm.cover_image_url,
              }}
            />
          </div>
        }
      />

      <EditFirmDialog open={editOpen} onOpenChange={setEditOpen} firm={firm} invalidateKey={["law_firm", id]} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card className="p-5"><p className="text-xs uppercase tracking-widest text-muted-foreground">Demandas em aberto</p><p className="font-serif text-2xl">{openDemands.length}</p></Card>
        <Card className={`p-5 ${overdue > 0 ? "border-destructive/40" : ""}`}><p className="text-xs uppercase tracking-widest text-muted-foreground">Atrasadas</p><p className="font-serif text-2xl">{overdue}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-widest text-muted-foreground">Contratos vinculados</p><p className="font-serif text-2xl">{contracts.length}</p></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="font-serif text-xl mb-4">Demandas</h2>
          {demands.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem demandas ainda.</p>
          ) : (
            <ul className="divide-y divide-border">
              {demands.map((d) => (
                <li key={d.id} className="py-3">
                  <Link to="/demandas/$id" params={{ id: d.id }} className="flex justify-between hover:opacity-80">
                    <div>
                      <p className="text-sm font-medium">{d.title}</p>
                      <p className="text-xs text-muted-foreground">{demandStatusLabel[d.status]} · prazo {formatDate(d.due_at)}</p>
                    </div>
                    <Badge variant="outline">{demandPriorityLabel[d.priority ?? "none"]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-6">
          <h2 className="font-serif text-xl mb-4">Contratos</h2>
          {contracts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem contratos vinculados.</p>
          ) : (
            <ul className="divide-y divide-border">
              {contracts.map((c) => (
                <li key={c.id} className="py-3">
                  <Link to="/contratos/$id" params={{ id: c.id }} className="flex justify-between hover:opacity-80">
                    <div>
                      <p className="text-sm font-medium">{c.title}</p>
                      <p className="text-xs text-muted-foreground">{c.counterparty}</p>
                    </div>
                    <Badge variant="outline">{c.status}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {firm.notes ? (
        <Card className="p-6 mt-6">
          <h2 className="font-serif text-xl mb-3">Observações</h2>
          <p className="text-sm text-foreground whitespace-pre-wrap">{firm.notes}</p>
        </Card>
      ) : null}
    </div>
  );
}

type FirmRow = {
  id: string;
  name: string;
  practice_areas: string[] | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  fee_model: string | null;
  status: string;
  notes: string | null;
};

function EditFirmDialog({
  open, onOpenChange, firm, invalidateKey,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  firm: FirmRow;
  invalidateKey: (string | number)[];
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(firm.name);
  const [areas, setAreas] = useState((firm.practice_areas ?? []).join(", "));
  const [contactName, setContactName] = useState(firm.contact_name ?? "");
  const [contactEmail, setContactEmail] = useState(firm.contact_email ?? "");
  const [contactPhone, setContactPhone] = useState(firm.contact_phone ?? "");
  const [feeModel, setFeeModel] = useState(firm.fee_model ?? "");
  const [status, setStatus] = useState<"active" | "inactive">(firm.status === "active" ? "active" : "inactive");
  const [notes, setNotes] = useState(firm.notes ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("law_firms").update({
        name,
        practice_areas: areas.split(",").map((s) => s.trim()).filter(Boolean),
        contact_name: contactName || null,
        contact_email: contactEmail || null,
        contact_phone: contactPhone || null,
        fee_model: feeModel || null,
        status,
        notes: notes || null,
      }).eq("id", firm.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invalidateKey });
      qc.invalidateQueries({ queryKey: ["law_firms"] });
      toast.success("Escritório atualizado");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar escritório</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3">
          <div><Label>Nome</Label><Input required value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Áreas de atuação (vírgula)</Label><Input value={areas} onChange={(e) => setAreas(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Contato</Label><Input value={contactName} onChange={(e) => setContactName(e.target.value)} /></div>
            <div><Label>E-mail</Label><Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Telefone</Label><Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} /></div>
            <div><Label>Honorários</Label><Input value={feeModel} onChange={(e) => setFeeModel(e.target.value)} /></div>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as "active" | "inactive")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="inactive">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Observações</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={save.isPending}>{save.isPending ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}