import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Smartphone, LogOut, KeyRound, ScrollText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/seguranca")({
  component: SecurityPage,
});

type Factor = { id: string; friendly_name?: string | null; status: string; created_at: string };
type AiAction = { id: number; tool: string; created_at: string; result: { ok?: boolean; error?: string } | null };
type AuditRow = { id: number; at: string; table_name: string; action: string; row_id: string | null };

const tableLabel: Record<string, string> = {
  contracts: "Contrato",
  contract_versions: "Versão de contrato",
  contract_reviews: "Revisão de contrato",
  demands: "Demanda",
  demand_updates: "Anotação de demanda",
  demand_attachments: "Anexo de demanda",
  law_firms: "Escritório",
};
const actionLabel: Record<string, string> = { INSERT: "criado", UPDATE: "alterado", DELETE: "excluído" };

function SecurityPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  const { data: factors } = useQuery({
    queryKey: ["mfa-factors"],
    queryFn: async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      return ((data?.totp ?? []) as Factor[]).filter((f) => f.status === "verified");
    },
  });

  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
  });

  // As duas consultas abaixo dependem das migrações de set/2026; sem elas, mostram orientação.
  const { data: aiLog, error: aiErr } = useQuery({
    queryKey: ["ai-action-log"],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> })
        .from("ai_action_log")
        .select("id, tool, created_at, result")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as AiAction[];
    },
    retry: false,
  });

  const { data: audit, error: auditErr } = useQuery({
    queryKey: ["audit-log"],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> })
        .from("audit_log")
        .select("id, at, table_name, action, row_id")
        .order("at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as unknown as AuditRow[];
    },
    retry: false,
  });

  async function removerFator(id: string) {
    if ((factors?.length ?? 0) <= 1) {
      toast.error("Mantenha ao menos um autenticador ativo. Cadastre outro antes de remover este.");
      return;
    }
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) toast.error("Não foi possível remover o autenticador.");
    else {
      toast.success("Autenticador removido.");
      qc.invalidateQueries({ queryKey: ["mfa-factors"] });
    }
  }

  async function alterarSenha(e: React.FormEvent) {
    e.preventDefault();
    if (pwd.length < 12) return toast.error("A senha precisa ter ao menos 12 caracteres.");
    if (pwd !== pwd2) return toast.error("As senhas não coincidem.");
    setSavingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setSavingPwd(false);
    if (error) return toast.error("Não foi possível alterar a senha.");
    setPwd("");
    setPwd2("");
    toast.success("Senha alterada.");
  }

  async function encerrarTodas() {
    await supabase.auth.signOut({ scope: "global" });
    qc.clear();
    toast.success("Todas as sessões foram encerradas.");
    navigate({ to: "/auth", replace: true });
  }

  const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  return (
    <div className="max-w-4xl animate-fade-in space-y-6">
      <PageHeader title="Segurança da conta" description="Autenticação em duas etapas, senha, sessões e trilha de auditoria." />

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Smartphone className="h-4 w-4 text-accent" />
          <h2 className="font-serif text-lg">Autenticadores (MFA)</h2>
          <Badge variant="secondary" className="ml-auto">{user?.email}</Badge>
        </div>
        {factors?.length ? (
          <ul className="divide-y divide-border">
            {factors.map((f) => (
              <li key={f.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{f.friendly_name || "Autenticador"}</p>
                  <p className="text-xs text-muted-foreground">cadastrado em {fmt(f.created_at)}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => removerFator(f.id)}>Remover</Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum autenticador cadastrado.</p>
        )}
        <Button asChild variant="secondary" size="sm" className="mt-4">
          <Link to="/mfa" search={{ modo: "cadastrar" }}>Adicionar outro dispositivo</Link>
        </Button>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <KeyRound className="h-4 w-4 text-accent" />
            <h2 className="font-serif text-lg">Alterar senha</h2>
          </div>
          <form onSubmit={alterarSenha} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="pwd">Nova senha (mín. 12 caracteres)</Label>
              <Input id="pwd" type="password" minLength={12} value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pwd2">Repita a nova senha</Label>
              <Input id="pwd2" type="password" minLength={12} value={pwd2} onChange={(e) => setPwd2(e.target.value)} autoComplete="new-password" />
            </div>
            <Button type="submit" size="sm" disabled={savingPwd}>{savingPwd ? "Salvando…" : "Salvar senha"}</Button>
          </form>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <LogOut className="h-4 w-4 text-accent" />
            <h2 className="font-serif text-lg">Sessões</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Perdeu um aparelho ou suspeita de acesso indevido? Encerre a sessão em todos os dispositivos de uma vez. Você precisará entrar novamente.
          </p>
          <Button variant="destructive" size="sm" onClick={encerrarTodas}>Encerrar em todos os dispositivos</Button>
          <p className="text-xs text-muted-foreground mt-4">A sessão também é encerrada automaticamente após inatividade.</p>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="h-4 w-4 text-accent" />
          <h2 className="font-serif text-lg">Ações executadas pelo Carl (IA)</h2>
        </div>
        {aiErr ? (
          <p className="text-sm text-muted-foreground">Registro indisponível — aplique a migração <code className="text-xs">20260905120000_hardening_seguranca.sql</code> no Supabase.</p>
        ) : aiLog?.length ? (
          <ul className="divide-y divide-border text-sm">
            {aiLog.map((a) => (
              <li key={a.id} className="py-2 flex items-center justify-between gap-3">
                <span className="font-mono text-xs">{a.tool}</span>
                <span className={`text-xs ${a.result?.ok ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>
                  {a.result?.ok ? "ok" : a.result?.error ? "bloqueado" : "—"}
                </span>
                <span className="text-xs text-muted-foreground">{fmt(a.created_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma ação registrada ainda.</p>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <ScrollText className="h-4 w-4 text-accent" />
          <h2 className="font-serif text-lg">Trilha de auditoria dos seus registros</h2>
        </div>
        {auditErr ? (
          <p className="text-sm text-muted-foreground">Trilha indisponível — aplique a migração <code className="text-xs">20260905130000_blindagem_auditoria_ratelimit.sql</code> no Supabase.</p>
        ) : audit?.length ? (
          <ul className="divide-y divide-border text-sm">
            {audit.map((r) => (
              <li key={r.id} className="py-2 flex items-center justify-between gap-3">
                <span>{tableLabel[r.table_name] ?? r.table_name} <span className="text-muted-foreground">{actionLabel[r.action] ?? r.action}</span></span>
                <span className="text-xs text-muted-foreground">{fmt(r.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</p>
        )}
      </Card>
    </div>
  );
}
