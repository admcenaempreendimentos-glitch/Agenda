import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileText } from "lucide-react";
import {
  contractStatusLabel,
  contractOriginLabel,
  formatDate,
  formatCurrency,
  getContractCategory,
  contractCategoryLabel,
  type ContractCategory,
} from "@/lib/format";
import { CardCustomizer } from "@/components/card-customizer";

export const Route = createFileRoute("/_authenticated/contratos/")({
  component: ContractsPage,
});

const CATEGORIES: (ContractCategory | "all")[] = ["all", "novos_negocios", "locacao", "servicos", "nda", "outros"];

function ContractsPage() {
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("all");

  const { data = [] } = useQuery({
    queryKey: ["contracts", status],
    queryFn: async () => {
      let q = supabase.from("contracts").select("*").order("updated_at", { ascending: false });
      if (status !== "all") q = q.eq("status", status as "draft");
      const { data } = await q;
      return data ?? [];
    },
  });

  const counts = CATEGORIES.reduce<Record<string, number>>((acc, c) => {
    acc[c] = c === "all" ? data.length : data.filter((d) => getContractCategory(d.contract_type) === c).length;
    return acc;
  }, {});

  const filtered = data
    .filter((c) => category === "all" || getContractCategory(c.contract_type) === category)
    .filter((c) => (c.title + " " + (c.counterparty ?? "")).toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Contratos"
        description="Contratos que você elabora, revisa ou acompanha."
        actions={
          <Button asChild size="sm">
            <Link to="/contratos/novo"><Plus className="h-4 w-4 mr-1" /> Novo contrato</Link>
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2 mb-6 -mt-2">
        {CATEGORIES.map((c) => {
          const label = c === "all" ? "Todos" : contractCategoryLabel[c as ContractCategory];
          const active = category === c;
          return (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`group relative px-4 py-2 rounded-full border text-xs uppercase tracking-widest transition-all ${
                active
                  ? "border-primary/50 bg-primary/10 text-foreground shadow-[0_0_20px_-4px_oklch(0.66_0.19_258/0.6)]"
                  : "border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              {label}
              <span className={`ml-2 text-[10px] tabular-nums ${active ? "text-primary" : "text-muted-foreground/70"}`}>
                {counts[c] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <Input placeholder="Buscar por título ou contraparte…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="draft">Minuta</SelectItem>
            <SelectItem value="in_review">Em revisão</SelectItem>
            <SelectItem value="negotiating">Em negociação</SelectItem>
            <SelectItem value="signed">Assinado</SelectItem>
            <SelectItem value="archived">Arquivado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center surface-elevated">
          <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum contrato encontrado.</p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => {
            const cat = getContractCategory(c.contract_type);
            const accent = c.accent_color ?? "hsl(220 30% 20%)";
            return (
              <div key={c.id} className="relative group">
                <Link
                  to="/contratos/$id"
                  params={{ id: c.id }}
                  className="surface-elevated hover-lift rounded-2xl overflow-hidden flex flex-col h-full"
                  style={{ borderTop: `3px solid ${accent}` }}
                >
                  {c.cover_image_url ? (
                    <div
                      className="h-32 bg-cover bg-center"
                      style={{ backgroundImage: `url(${c.cover_image_url})` }}
                    />
                  ) : (
                    <div
                      className="h-24 relative overflow-hidden"
                      style={{
                        background: `linear-gradient(135deg, ${accent}22, ${accent}0a)`,
                      }}
                    >
                      {c.icon_emoji ? (
                        <span className="absolute right-4 top-3 text-4xl opacity-80">{c.icon_emoji}</span>
                      ) : null}
                    </div>
                  )}
                  <div className="p-5 flex-1 flex flex-col">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span
                        className="text-[10px] uppercase tracking-widest font-semibold"
                        style={{ color: accent }}
                      >
                        {contractCategoryLabel[cat]}
                      </span>
                      {c.custom_tag ? (
                        <span
                          className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full"
                          style={{ background: `${accent}18`, color: accent, border: `1px solid ${accent}30` }}
                        >
                          {c.custom_tag}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-start gap-2">
                      {c.icon_emoji && c.cover_image_url ? (
                        <span className="text-2xl leading-none">{c.icon_emoji}</span>
                      ) : null}
                      <p className="font-serif text-lg text-foreground leading-snug group-hover:text-primary transition-colors">
                        {c.title}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{c.counterparty ?? "sem contraparte"}</p>
                    <div className="mt-auto pt-4 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex gap-1.5">
                        <Badge variant="outline" className="border-border/60 text-[10px]">{contractOriginLabel[c.origin]}</Badge>
                        <Badge className="bg-primary/10 text-primary border border-primary/25 text-[10px]">{contractStatusLabel[c.status]}</Badge>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium tabular-nums text-foreground">{formatCurrency(c.value_cents)}</p>
                        <p className="text-[10px] text-muted-foreground">vig. {formatDate(c.ends_at)}</p>
                      </div>
                    </div>
                  </div>
                </Link>
                <div className="absolute top-2 right-2">
                  <CardCustomizer
                    table="contracts"
                    id={c.id}
                    invalidateKey={["contracts"]}
                    value={{
                      accent_color: c.accent_color,
                      icon_emoji: c.icon_emoji,
                      custom_tag: c.custom_tag,
                      cover_image_url: c.cover_image_url,
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