import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Building2 } from "lucide-react";
import { toast } from "sonner";
import { CardCustomizer } from "@/components/card-customizer";

export const Route = createFileRoute("/_authenticated/escritorios/")({
  component: FirmsPage,
});

function FirmsPage() {
  const [open, setOpen] = useState(false);
  const { data: firms = [] } = useQuery({
    queryKey: ["law_firms"],
    queryFn: async () => {
      const { data } = await supabase.from("law_firms").select("*").order("name");
      return data ?? [];
    },
  });

  return (
    <div>
      <PageHeader
        title="Escritórios"
        description="Escritórios de advocacia terceirizados que prestam assessoria à construtora."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo escritório</Button>
            </DialogTrigger>
            <FirmDialog onDone={() => setOpen(false)} />
          </Dialog>
        }
      />

      {firms.length === 0 ? (
        <Card className="p-12 text-center">
          <Building2 className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum escritório cadastrado ainda.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {firms.map((firm) => {
            const accent = firm.accent_color ?? "#1e3a5f";
            return (
              <div key={firm.id} className="relative group">
                <Link to="/escritorios/$id" params={{ id: firm.id }}>
                  <Card
                    className="surface-elevated hover-lift overflow-hidden h-full p-0"
                    style={{ borderTop: `3px solid ${accent}` }}
                  >
                    {firm.cover_image_url ? (
                      <div className="h-28 bg-cover bg-center" style={{ backgroundImage: `url(${firm.cover_image_url})` }} />
                    ) : (
                      <div
                        className="h-20 relative"
                        style={{ background: `linear-gradient(135deg, ${accent}22, ${accent}08)` }}
                      >
                        {firm.icon_emoji ? (
                          <span className="absolute right-4 top-3 text-3xl opacity-80">{firm.icon_emoji}</span>
                        ) : null}
                      </div>
                    )}
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-2 gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {firm.icon_emoji && firm.cover_image_url ? (
                            <span className="text-xl leading-none">{firm.icon_emoji}</span>
                          ) : null}
                          <h3 className="font-serif text-lg text-foreground truncate">{firm.name}</h3>
                        </div>
                        <Badge variant={firm.status === "active" ? "default" : "secondary"} className="shrink-0">
                          {firm.status === "active" ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                      {firm.custom_tag ? (
                        <span
                          className="inline-block text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full mb-2"
                          style={{ background: `${accent}18`, color: accent, border: `1px solid ${accent}30` }}
                        >
                          {firm.custom_tag}
                        </span>
                      ) : null}
                      {firm.contact_name ? (
                        <p className="text-sm text-foreground">{firm.contact_name}</p>
                      ) : null}
                      {firm.contact_email ? (
                        <p className="text-xs text-muted-foreground">{firm.contact_email}</p>
                      ) : null}
                      {firm.practice_areas && firm.practice_areas.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-3">
                          {firm.practice_areas.map((a) => (
                            <Badge key={a} variant="outline" className="text-[10px]">{a}</Badge>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </Card>
                </Link>
                <div className="absolute top-2 right-2">
                  <CardCustomizer
                    table="law_firms"
                    id={firm.id}
                    invalidateKey={["law_firms"]}
                    value={{
                      accent_color: firm.accent_color,
                      icon_emoji: firm.icon_emoji,
                      custom_tag: firm.custom_tag,
                      cover_image_url: firm.cover_image_url,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FirmDialog({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [areas, setAreas] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [feeModel, setFeeModel] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Sem sessão");
      const { error } = await supabase.from("law_firms").insert({
        user_id: user.user.id,
        name,
        practice_areas: areas.split(",").map((s) => s.trim()).filter(Boolean),
        contact_name: contactName || null,
        contact_email: contactEmail || null,
        contact_phone: contactPhone || null,
        fee_model: feeModel || null,
        status,
        notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["law_firms"] });
      toast.success("Escritório cadastrado");
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Novo escritório</DialogTitle></DialogHeader>
      <form
        onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
        className="space-y-3"
      >
        <div><Label>Nome</Label><Input required value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><Label>Áreas de atuação (separe por vírgula)</Label><Input placeholder="societário, imobiliário" value={areas} onChange={(e) => setAreas(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Contato</Label><Input value={contactName} onChange={(e) => setContactName(e.target.value)} /></div>
          <div><Label>E-mail</Label><Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Telefone</Label><Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} /></div>
          <div><Label>Honorários</Label><Input placeholder="fixo, por demanda…" value={feeModel} onChange={(e) => setFeeModel(e.target.value)} /></div>
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
          <Button type="submit" disabled={create.isPending}>{create.isPending ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}