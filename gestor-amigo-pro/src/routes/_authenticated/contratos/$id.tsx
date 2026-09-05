import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Upload, Download, MessageSquare, ArrowRight, ArrowLeftIcon, Check, Pencil } from "lucide-react";
import {
  contractStatusLabel,
  contractOriginLabel,
  formatDate,
  formatCurrency,
  getContractCategory,
  contractCategoryLabel,
  versionDirectionLabel,
  roundStatusLabel,
  roundStatusTone,
  contractTypesByCategory,
  type ContractCategory,
} from "@/lib/format";
import { toast } from "sonner";
import { CardCustomizer } from "@/components/card-customizer";

export const Route = createFileRoute("/_authenticated/contratos/$id")({
  component: ContractDetail,
});

function ContractDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [review, setReview] = useState("");
  const [editOpen, setEditOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["contract", id],
    queryFn: async () => {
      const [contract, versions, reviews] = await Promise.all([
        supabase.from("contracts").select("*, law_firms(name)").eq("id", id).maybeSingle(),
        supabase.from("contract_versions").select("*").eq("contract_id", id).order("created_at", { ascending: true }),
        supabase.from("contract_reviews").select("*").eq("contract_id", id).order("created_at", { ascending: false }),
      ]);
      return { contract: contract.data, versions: versions.data ?? [], reviews: reviews.data ?? [] };
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.from("contracts").update({ status: status as "draft" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contract", id] }),
  });

  const uploadVersion = useMutation({
    mutationFn: async (file: File) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Sem sessão");
      const versions = data?.versions ?? [];
      const last = versions[versions.length - 1];
      // Alterna a direção automaticamente
      const nextDirection = last?.direction === "sent" ? "received" : "sent";
      const nextRound = (last?.round_number ?? 0) + 1;
      const nextSentBy = nextDirection === "sent" ? "Eu" : (data?.contract?.counterparty || "Contraparte");
      const nextStatus = nextDirection === "sent" ? "sent" : "returned";
      // Validação de upload (auditoria set/2026): tipo, tamanho e nome do arquivo.
      const ext = (file.name.split(".").pop() ?? "").toLowerCase();
      const allowed: Record<string, string> = {
        pdf: "application/pdf",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
      if (!allowed[ext]) throw new Error("Tipo de arquivo não permitido. Envie PDF, DOC ou DOCX.");
      if (file.size > 25 * 1024 * 1024) throw new Error("Arquivo muito grande (máx. 25 MB).");
      if (file.size === 0) throw new Error("Arquivo vazio.");
      const safeBase = file.name
        .replace(/\.[^.]+$/, "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]+/g, "_")
        .slice(0, 80) || "minuta";
      const path = `${user.user.id}/${id}/${Date.now()}-${safeBase}.${ext}`;
      const up = await supabase.storage.from("legal-documents").upload(path, file, {
        contentType: allowed[ext],
        upsert: false,
      });
      if (up.error) throw up.error;
      const { error } = await supabase.from("contract_versions").insert({
        user_id: user.user.id,
        contract_id: id,
        version_label: `v${nextRound}`,
        storage_path: path,
        file_name: file.name.slice(0, 200),
        direction: nextDirection,
        sent_by: nextSentBy,
        round_number: nextRound,
        round_status: nextStatus,
      });
      if (error) throw error;
      // Atualiza status do contrato se ainda for minuta
      if (data?.contract?.status === "draft" && versions.length === 0) {
        await supabase.from("contracts").update({ status: "in_review" }).eq("id", id);
      }
    },
    onSuccess: () => {
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["contract", id] });
      toast.success("Rodada registrada");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro no upload"),
  });

  const updateVersion = useMutation({
    mutationFn: async ({ versionId, patch }: { versionId: string; patch: Partial<VersionRow> }) => {
      const { error } = await supabase.from("contract_versions").update(patch as never).eq("id", versionId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contract", id] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  async function downloadVersion(path: string, name: string) {
    const { data, error } = await supabase.storage.from("legal-documents").createSignedUrl(path, 60);
    if (error || !data) { toast.error("Não foi possível baixar"); return; }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = name;
    a.click();
  }

  const addReview = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Sem sessão");
      const { error } = await supabase.from("contract_reviews").insert({
        user_id: user.user.id,
        contract_id: id,
        content: review,
      });
      if (error) throw error;
    },
    onSuccess: () => { setReview(""); qc.invalidateQueries({ queryKey: ["contract", id] }); toast.success("Revisão registrada"); },
  });

  if (!data?.contract) return <p className="text-muted-foreground">Carregando…</p>;
  const c = data.contract;
  const category = getContractCategory(c.contract_type);
  const versions = data.versions;
  const lastVersion = versions[versions.length - 1];
  const nextDirection = lastVersion?.direction === "sent" ? "received" : "sent";

  return (
    <div className="max-w-5xl animate-fade-in">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link to="/contratos"><ArrowLeft className="h-4 w-4 mr-1" /> Contratos</Link>
      </Button>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] uppercase tracking-widest text-accent">{contractCategoryLabel[category]}</span>
        <span className="h-1 w-1 rounded-full bg-border" />
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{c.contract_type}</span>
      </div>
      <PageHeader
        title={c.title}
        description={c.object_summary ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline">{contractOriginLabel[c.origin]}</Badge>
            <Select value={c.status} onValueChange={(v) => updateStatus.mutate(v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Minuta</SelectItem>
                <SelectItem value="in_review">Em revisão</SelectItem>
                <SelectItem value="negotiating">Em negociação</SelectItem>
                <SelectItem value="signed">Assinado</SelectItem>
                <SelectItem value="archived">Arquivado</SelectItem>
              </SelectContent>
            </Select>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
          </Button>
            <CardCustomizer
              table="contracts"
              id={c.id}
              invalidateKey={["contract", id]}
              variant="button"
              value={{
                accent_color: c.accent_color,
                icon_emoji: c.icon_emoji,
                custom_tag: c.custom_tag,
                cover_image_url: c.cover_image_url,
              }}
            />
          </div>
        }
      />

      <EditContractDialog open={editOpen} onOpenChange={setEditOpen} contract={c} invalidateKey={["contract", id]} />

      <div className="surface-elevated rounded-xl p-5 grid grid-cols-2 md:grid-cols-5 gap-4 mb-8 text-sm">
        <Info label="Tipo" value={c.contract_type} />
        <Info label="Contraparte" value={c.counterparty ?? "—"} />
        <Info label="Valor" value={formatCurrency(c.value_cents)} />
        <Info label="Assinatura" value={formatDate(c.signed_at)} />
        <Info label="Vigência até" value={formatDate(c.ends_at)} />
      </div>

      <Card className="surface-elevated p-6 mb-6 border-0">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-serif text-xl">Troca de minutas</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Cada arquivo anexado vira uma rodada. A próxima rodada será registrada como{" "}
              <span className="text-foreground font-medium">{versionDirectionLabel[nextDirection]}</span>.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 hover:bg-primary/20 px-4 py-2 text-sm text-foreground cursor-pointer transition-all hover:shadow-[0_0_24px_-4px_oklch(0.66_0.19_258/0.6)]">
            <Upload className="h-4 w-4" />
            {uploadVersion.isPending ? "Enviando…" : `Anexar rodada ${(lastVersion?.round_number ?? 0) + 1}`}
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadVersion.mutate(f); }} />
          </label>
        </div>

        {versions.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-border rounded-lg">
            <p className="text-sm text-muted-foreground">Nenhuma rodada ainda. Anexe a minuta inicial para começar.</p>
          </div>
        ) : (
          <div className="relative pl-6">
            <div className="absolute left-2 top-2 bottom-2 w-px bg-linear-to-b from-primary/60 via-border to-accent/40" />
            <ul className="space-y-4">
              {versions.map((v) => (
                <RoundItem
                  key={v.id}
                  v={v}
                  onDownload={() => downloadVersion(v.storage_path, v.file_name)}
                  onPatch={(patch) => updateVersion.mutate({ versionId: v.id, patch })}
                />
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card className="surface-elevated p-6 border-0">
        <h2 className="font-serif text-lg mb-3">Anotações de revisão</h2>
        <Textarea rows={3} value={review} onChange={(e) => setReview(e.target.value)} placeholder="Cláusula 5 precisa ser ajustada…" className="mb-3" />
        <Button size="sm" disabled={!review.trim() || addReview.isPending} onClick={() => addReview.mutate()}>
          <MessageSquare className="h-4 w-4 mr-1" /> Adicionar anotação
        </Button>
        {data.reviews.length > 0 && (
          <ul className="mt-6 space-y-3">
            {data.reviews.map((r) => (
              <li key={r.id} className="border-l-2 border-accent pl-4">
                <p className="text-xs text-muted-foreground">{formatDate(r.created_at)}</p>
                <p className="text-sm mt-1 whitespace-pre-wrap">{r.content}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-xs text-muted-foreground mt-4">Status atual: {contractStatusLabel[c.status]}</p>
    </div>
  );
}

function EditContractDialog({
  open, onOpenChange, contract, invalidateKey,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contract: {
    id: string;
    title: string;
    contract_type: string;
    counterparty: string | null;
    object_summary: string | null;
    value_cents: number | null;
    signed_at: string | null;
    starts_at: string | null;
    ends_at: string | null;
    origin: "created_by_me" | "from_law_firm" | "from_counterparty";
    law_firm_id: string | null;
    notes: string | null;
  };
  invalidateKey: (string | number)[];
}) {
  const qc = useQueryClient();
  const { data: firms = [] } = useQuery({
    queryKey: ["law_firms", "select"],
    queryFn: async () => (await supabase.from("law_firms").select("id, name").order("name")).data ?? [],
  });

  const [form, setForm] = useState({
    title: contract.title,
    contract_type: contract.contract_type,
    counterparty: contract.counterparty ?? "",
    object_summary: contract.object_summary ?? "",
    value_brl: contract.value_cents != null ? (contract.value_cents / 100).toString().replace(".", ",") : "",
    signed_at: contract.signed_at ?? "",
    starts_at: contract.starts_at ?? "",
    ends_at: contract.ends_at ?? "",
    origin: contract.origin,
    law_firm_id: contract.law_firm_id ?? "",
    notes: contract.notes ?? "",
  });

  const save = useMutation({
    mutationFn: async () => {
      const value_cents = form.value_brl ? Math.round(Number(form.value_brl.replace(",", ".")) * 100) : null;
      const { error } = await supabase.from("contracts").update({
        title: form.title,
        contract_type: form.contract_type,
        counterparty: form.counterparty || null,
        object_summary: form.object_summary || null,
        value_cents,
        signed_at: form.signed_at || null,
        starts_at: form.starts_at || null,
        ends_at: form.ends_at || null,
        origin: form.origin,
        law_firm_id: form.law_firm_id || null,
        notes: form.notes || null,
      }).eq("id", contract.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invalidateKey });
      qc.invalidateQueries({ queryKey: ["contracts"] });
      toast.success("Contrato atualizado");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar contrato</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><Label>Valor (R$)</Label><Input inputMode="decimal" value={form.value_brl} onChange={(e) => setForm({ ...form, value_brl: e.target.value })} /></div>
            <div><Label>Assinatura</Label><Input type="date" value={form.signed_at} onChange={(e) => setForm({ ...form, signed_at: e.target.value })} /></div>
            <div><Label>Início</Label><Input type="date" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></div>
            <div><Label>Vigência</Label><Input type="date" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
              <Select
                value={form.law_firm_id || "__none__"}
                onValueChange={(v) => setForm({ ...form, law_firm_id: v === "__none__" ? "" : v })}
              >
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum</SelectItem>
                  {firms.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Observações</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={save.isPending}>{save.isPending ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type VersionRow = {
  id: string;
  file_name: string;
  storage_path: string;
  created_at: string;
  version_label: string;
  direction: string;
  sent_by: string | null;
  round_number: number | null;
  change_summary: string | null;
  round_status: string;
};

function RoundItem({
  v,
  onDownload,
  onPatch,
}: {
  v: VersionRow;
  onDownload: () => void;
  onPatch: (patch: Partial<VersionRow>) => void;
}) {
  const [editing, setEditing] = useState<null | "sent_by" | "summary" | "status" | "direction">(null);
  const isSent = v.direction === "sent";

  return (
    <li className="relative">
      <span
        className={`absolute -left-[22px] top-3 h-4 w-4 rounded-full border-2 ${
          isSent ? "bg-primary border-primary/40" : "bg-accent border-accent/40"
        }`}
        style={{ boxShadow: "0 0 0 4px var(--color-background)" }}
      />
      <div className="surface-elevated rounded-lg p-4 hover-lift">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-xs font-mono tabular-nums text-muted-foreground">v{v.round_number ?? "—"}</span>
          <button
            onClick={() => onPatch({ direction: isSent ? "received" : "sent" })}
            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors ${
              isSent
                ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                : "border-accent/40 bg-accent/10 text-accent hover:bg-accent/20"
            }`}
            title="Alternar direção"
          >
            {isSent ? <ArrowRight className="h-3 w-3" /> : <ArrowLeftIcon className="h-3 w-3" />}
            {versionDirectionLabel[v.direction]}
          </button>
          <InlineText
            active={editing === "sent_by"}
            value={v.sent_by ?? ""}
            placeholder="Enviado por…"
            onEdit={() => setEditing("sent_by")}
            onSave={(val) => { onPatch({ sent_by: val || null }); setEditing(null); }}
            onCancel={() => setEditing(null)}
            display={(val) => <span className="text-xs text-muted-foreground">por <span className="text-foreground">{val || "—"}</span></span>}
          />
          <span className="text-xs text-muted-foreground ml-auto">{formatDate(v.created_at)}</span>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <p className="text-sm font-medium truncate">{v.file_name}</p>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onDownload}>
            <Download className="h-3.5 w-3.5 mr-1" /> Baixar
          </Button>
        </div>

        {editing === "summary" ? (
          <SummaryEditor initial={v.change_summary ?? ""} onSave={(val) => { onPatch({ change_summary: val || null }); setEditing(null); }} onCancel={() => setEditing(null)} />
        ) : (
          <button
            onClick={() => setEditing("summary")}
            className="w-full text-left text-sm text-muted-foreground hover:text-foreground border border-dashed border-border/60 rounded-md p-2 mb-3 transition-colors group"
          >
            {v.change_summary ? (
              <span className="whitespace-pre-wrap text-foreground/90">{v.change_summary}</span>
            ) : (
              <span className="inline-flex items-center gap-1"><Pencil className="h-3 w-3" /> Adicionar resumo das alterações desta rodada</span>
            )}
          </button>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Select value={v.round_status} onValueChange={(val) => onPatch({ round_status: val })}>
            <SelectTrigger className={`h-7 w-auto px-3 text-xs border ${roundStatusTone[v.round_status] ?? ""}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(roundStatusLabel).map(([k, l]) => (
                <SelectItem key={k} value={k}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {v.round_status !== "accepted" && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onPatch({ round_status: "accepted" })}>
              <Check className="h-3.5 w-3.5 mr-1" /> Marcar como aceita
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function InlineText({
  active, value, placeholder, onEdit, onSave, onCancel, display,
}: {
  active: boolean; value: string; placeholder?: string;
  onEdit: () => void; onSave: (v: string) => void; onCancel: () => void;
  display: (v: string) => React.ReactNode;
}) {
  const [val, setVal] = useState(value);
  if (!active) return <button onClick={() => { setVal(value); onEdit(); }} className="hover:text-foreground transition-colors">{display(value)}</button>;
  return (
    <span className="inline-flex items-center gap-1">
      <Input
        autoFocus
        value={val}
        placeholder={placeholder}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onSave(val); if (e.key === "Escape") onCancel(); }}
        onBlur={() => onSave(val)}
        className="h-6 text-xs px-2 w-40"
      />
    </span>
  );
}

function SummaryEditor({ initial, onSave, onCancel }: { initial: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [val, setVal] = useState(initial);
  return (
    <div className="mb-3">
      <Textarea autoFocus rows={3} value={val} onChange={(e) => setVal(e.target.value)} placeholder="O que mudou nesta rodada?" className="text-sm" />
      <div className="flex gap-2 mt-2">
        <Button size="sm" onClick={() => onSave(val)}>Salvar</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground mt-1 break-words">{value}</p>
    </div>
  );
}