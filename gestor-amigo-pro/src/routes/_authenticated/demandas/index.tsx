import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ListChecks, Mail, Pencil, ChevronRight, FolderOpen, Trash2 } from "lucide-react";
import { demandStatusLabel, demandPriorityLabel, formatDate, daysUntil } from "@/lib/format";
import { CardCustomizer } from "@/components/card-customizer";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/demandas/")({
  component: DemandsPage,
});

function DemandsPage() {
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [groupMode, setGroupMode] = useState<"subject" | "none">("subject");
  const qc = useQueryClient();

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Apagar a demanda "${title}"? Esta ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from("demands").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Demanda apagada");
    qc.invalidateQueries({ queryKey: ["demands"] });
  }

  const { data = [] } = useQuery({
    queryKey: ["demands", status],
    queryFn: async () => {
      let q = supabase
        .from("demands")
        .select("id, title, priority, status, sent_at, due_at, practice_area, subject_group, accent_color, icon_emoji, custom_tag, cover_image_url, law_firms(name)")
        .order("due_at", { ascending: true, nullsFirst: false });
      if (status !== "all") q = q.eq("status", status as "open");
      const { data } = await q;
      return data ?? [];
    },
  });

  const filtered = data.filter((d) => d.title.toLowerCase().includes(search.toLowerCase()));

  const groups = useMemo(() => {
    if (groupMode !== "subject") return [{ key: "__all__", label: null as string | null, items: filtered }] as { key: string; label: string | null; items: typeof filtered }[];
    const map = new Map<string, typeof filtered>();
    for (const d of filtered) {
      const key = d.subject_group?.trim() || "__ungrouped__";
      const bucket = map.get(key) ?? [];
      bucket.push(d);
      map.set(key, bucket);
    }
    const grouped: { key: string; label: string | null; items: typeof filtered }[] = Array.from(map.entries())
      .filter(([k]) => k !== "__ungrouped__")
      .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
      .map(([k, items]) => ({ key: k, label: k as string | null, items }));
    const un = map.get("__ungrouped__");
    if (un && un.length) grouped.push({ key: "__ungrouped__", label: null, items: un });
    return grouped;
  }, [filtered, groupMode]);

  return (
    <div>
      <PageHeader
        title="Demandas"
        description="Todas as demandas enviadas aos escritórios de assessoria."
        actions={
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/demandas/de-email"><Mail className="h-4 w-4 mr-1" /> A partir de e-mail</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/demandas/nova"><Plus className="h-4 w-4 mr-1" /> Nova demanda</Link>
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-3 mb-6">
        <Input placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="open">Aberta</SelectItem>
            <SelectItem value="in_progress">Em andamento</SelectItem>
            <SelectItem value="waiting">Aguardando retorno</SelectItem>
            <SelectItem value="completed">Concluída</SelectItem>
            <SelectItem value="cancelled">Cancelada</SelectItem>
          </SelectContent>
        </Select>
        <Select value={groupMode} onValueChange={(v) => setGroupMode(v as "subject" | "none")}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="subject">Agrupar por assunto</SelectItem>
            <SelectItem value="none">Sem agrupamento</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <ListChecks className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Nenhuma demanda encontrada.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.key}>
              {g.label ? (
                <div className="flex items-center gap-2 mb-2 px-1">
                  <FolderOpen className="h-3.5 w-3.5 text-accent" />
                  <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
                    {g.label}
                  </h2>
                  <span className="text-[10px] text-muted-foreground/70">
                    · {g.items.length} {g.items.length === 1 ? "demanda" : "demandas"}
                  </span>
                  <div className="flex-1 h-px bg-border/60 ml-2" />
                </div>
              ) : groupMode === "subject" ? (
                <div className="flex items-center gap-2 mb-2 px-1">
                  <h2 className="text-xs uppercase tracking-widest text-muted-foreground/70 italic">
                    Sem assunto definido
                  </h2>
                  <div className="flex-1 h-px bg-border/60 ml-2" />
                </div>
              ) : null}
              <Card className="divide-y divide-border overflow-hidden">
                {g.items.map((d) => {
                  const dd = daysUntil(d.due_at);
                  const accent = d.accent_color ?? undefined;
                  const firmName = (d.law_firms as { name: string } | null)?.name ?? null;
                  const metaParts = [
                    firmName,
                    d.practice_area || null,
                    d.sent_at ? `enviada ${formatDate(d.sent_at)}` : null,
                  ].filter(Boolean) as string[];
                  const deadlineLabel =
                    dd === null
                      ? null
                      : dd < 0
                        ? `${Math.abs(dd)}d em atraso`
                        : dd === 0
                          ? "hoje"
                          : `em ${dd}d`;
                  const deadlineOverdue =
                    dd !== null && dd < 0 && !["completed", "cancelled"].includes(d.status);
                  return (
                    <div
                      key={d.id}
                      className="group relative hover:bg-muted/40 transition-colors"
                      style={accent ? { borderLeft: `3px solid ${accent}` } : undefined}
                    >
                      <Link
                        to="/demandas/$id"
                        params={{ id: d.id }}
                        className="block p-4"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          {d.icon_emoji ? (
                            <span className="text-2xl leading-none pt-0.5 shrink-0">{d.icon_emoji}</span>
                          ) : null}
                          <div className="min-w-0 flex-1">
                            <h3 className="font-serif text-lg text-foreground leading-snug break-words">
                              {d.title}
                            </h3>
                            {metaParts.length > 0 ? (
                              <p className="text-xs text-muted-foreground mt-1">
                                {metaParts.join(" · ")}
                              </p>
                            ) : null}
                            <div className="flex items-center gap-1.5 flex-wrap mt-2">
                              {d.custom_tag ? (
                                <span
                                  className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full"
                                  style={accent ? { background: `${accent}18`, color: accent, border: `1px solid ${accent}30` } : undefined}
                                >
                                  {d.custom_tag}
                                </span>
                              ) : null}
                              {d.priority ? (
                                <Badge variant={d.priority === "urgent" || d.priority === "high" ? "destructive" : "secondary"} className="text-[10px]">
                                  {demandPriorityLabel[d.priority]}
                                </Badge>
                              ) : null}
                              <Badge variant="outline" className="text-[10px]">{demandStatusLabel[d.status]}</Badge>
                              {deadlineLabel ? (
                                <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border ${deadlineOverdue ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border/60 bg-muted/50 text-muted-foreground"}`}>
                                  {deadlineLabel}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0 mt-1" />
                        </div>
                      </Link>
                      <div className="flex items-center justify-end gap-1.5 px-4 pb-3 -mt-1">
                        <Button
                          asChild
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link to="/demandas/$id" params={{ id: d.id }}>
                            <Pencil className="h-3 w-3 mr-1" /> Editar
                          </Link>
                        </Button>
                        <CardCustomizer
                          table="demands"
                          id={d.id}
                          invalidateKey={["demands"]}
                          value={{
                            accent_color: d.accent_color,
                            icon_emoji: d.icon_emoji,
                            custom_tag: d.custom_tag,
                            cover_image_url: d.cover_image_url,
                          }}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(d.id, d.title); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}