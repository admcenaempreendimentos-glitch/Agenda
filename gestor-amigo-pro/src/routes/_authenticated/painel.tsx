import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, ListChecks, FileText, Building2, CalendarClock } from "lucide-react";
import {
  contractStatusLabel,
  demandPriorityLabel,
  demandStatusLabel,
  formatDate,
  daysUntil,
} from "@/lib/format";

export const Route = createFileRoute("/_authenticated/painel")({
  component: DashboardPage,
});

function DashboardPage() {
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [demands, contracts, firms, expiring] = await Promise.all([
        supabase
          .from("demands")
          .select("id, title, priority, status, due_at, law_firm_id, law_firms(name)")
          .in("status", ["open", "in_progress", "waiting"])
          .order("due_at", { ascending: true, nullsFirst: false })
          .limit(20),
        supabase
          .from("contracts")
          .select("id, title, counterparty, status, ends_at")
          .in("status", ["draft", "in_review", "negotiating"])
          .order("updated_at", { ascending: false })
          .limit(20),
        supabase.from("law_firms").select("id, name, status").eq("status", "active"),
        supabase
          .from("contracts")
          .select("id, title, counterparty, status, ends_at")
          .eq("status", "signed")
          .not("ends_at", "is", null)
          .order("ends_at", { ascending: true })
          .limit(30),
      ]);
      return {
        demands: demands.data ?? [],
        contracts: contracts.data ?? [],
        firms: firms.data ?? [],
        expiring: expiring.data ?? [],
      };
    },
  });

  const openDemands = data?.demands ?? [];
  const activeContracts = data?.contracts ?? [];
  const firms = data?.firms ?? [];
  const dueSoon = openDemands.filter((d) => {
    const dd = daysUntil(d.due_at);
    return dd !== null && dd <= 7;
  });
  const inReview = activeContracts.filter((c) => c.status === "in_review");
  const expiringSoon = (data?.expiring ?? []).filter((c) => {
    const dd = daysUntil(c.ends_at);
    return dd !== null && dd <= 60;
  });

  return (
    <div>
      <PageHeader
        title="Painel"
        description="Visão geral do que precisa da sua atenção hoje."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/demandas/nova">
                <Plus className="h-4 w-4 mr-1" /> Demanda
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/contratos/novo">
                <Plus className="h-4 w-4 mr-1" /> Contrato
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        <MetricCard icon={ListChecks} label="Demandas em aberto" value={openDemands.length} />
        <MetricCard icon={ListChecks} label="Vencendo em 7 dias" value={dueSoon.length} accent />
        <MetricCard icon={FileText} label="Contratos para revisar" value={inReview.length} />
        <MetricCard icon={CalendarClock} label="Vigências em 60 dias" value={expiringSoon.length} accent={expiringSoon.length > 0} />
        <MetricCard icon={Building2} label="Escritórios ativos" value={firms.length} />
      </div>

      {expiringSoon.length > 0 && (
        <Card className="p-6 mb-6 border-accent/40">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-xl">Alertas de vigência</h2>
            <span className="text-xs text-muted-foreground">contratos assinados vencendo em até 60 dias</span>
          </div>
          <ul className="divide-y divide-border">
            {expiringSoon.map((c) => {
              const dd = daysUntil(c.ends_at)!;
              const tone = dd < 0 || dd <= 7 ? "destructive" : dd <= 30 ? "default" : "secondary";
              return (
                <li key={c.id} className="py-3">
                  <Link
                    to="/contratos/$id"
                    params={{ id: c.id }}
                    className="flex items-center justify-between gap-3 hover:opacity-80"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{c.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{c.counterparty ?? "sem contraparte"}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant={tone}>
                        {dd < 0 ? `vencido há ${Math.abs(dd)}d` : dd === 0 ? "vence hoje" : `vence em ${dd}d`}
                      </Badge>
                      <p className="text-xs mt-1 text-muted-foreground">{formatDate(c.ends_at)}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-xl">Demandas pendentes</h2>
            <Link to="/demandas" className="text-xs text-muted-foreground hover:text-foreground">
              ver todas
            </Link>
          </div>
          {openDemands.length === 0 ? (
            <EmptyRow message="Nenhuma demanda em aberto." />
          ) : (
            <ul className="divide-y divide-border">
              {openDemands.slice(0, 8).map((d) => {
                const dd = daysUntil(d.due_at);
                return (
                  <li key={d.id} className="py-3">
                    <Link
                      to="/demandas/$id"
                      params={{ id: d.id }}
                      className="flex items-start justify-between gap-3 hover:opacity-80"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{d.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {(d.law_firms as { name: string } | null)?.name ?? "sem escritório"} · {demandStatusLabel[d.status]}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <Badge variant={d.priority === "urgent" || d.priority === "high" ? "destructive" : "secondary"}>
                          {demandPriorityLabel[d.priority ?? "none"]}
                        </Badge>
                        <p className={`text-xs mt-1 ${dd !== null && dd < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          {dd === null
                            ? "sem prazo"
                            : dd < 0
                              ? `atrasada ${Math.abs(dd)}d`
                              : dd === 0
                                ? "hoje"
                                : `em ${dd}d`}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-xl">Contratos em andamento</h2>
            <Link to="/contratos" className="text-xs text-muted-foreground hover:text-foreground">
              ver todos
            </Link>
          </div>
          {activeContracts.length === 0 ? (
            <EmptyRow message="Nenhum contrato ativo." />
          ) : (
            <ul className="divide-y divide-border">
              {activeContracts.slice(0, 8).map((c) => (
                <li key={c.id} className="py-3">
                  <Link
                    to="/contratos/$id"
                    params={{ id: c.id }}
                    className="flex items-start justify-between gap-3 hover:opacity-80"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{c.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{c.counterparty ?? "sem contraparte"}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant="outline">{contractStatusLabel[c.status]}</Badge>
                      <p className="text-xs mt-1 text-muted-foreground">vig. {formatDate(c.ends_at)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <Card className={`p-5 ${accent ? "border-accent/40 bg-accent/5" : ""}`}>
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-sm flex items-center justify-center ${accent ? "bg-accent/20 text-accent-foreground" : "bg-primary/10 text-primary"}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
          <p className="font-serif text-2xl text-foreground">{value}</p>
        </div>
      </div>
    </Card>
  );
}

function EmptyRow({ message }: { message: string }) {
  return <p className="text-sm text-muted-foreground py-6 text-center">{message}</p>;
}