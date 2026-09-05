import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

/*
 * Autenticação em dois fatores (TOTP) — blindagem set/2026.
 *  - modo=cadastrar: gera um novo autenticador (QR Code + chave) e o confirma.
 *  - modo=verificar: pede o código de 6 dígitos do autenticador já cadastrado.
 * A área autenticada exige nível AAL2 (ver _authenticated/route.tsx). Requer
 * TOTP habilitado em Supabase → Authentication → Multi-Factor.
 */
export const Route = createFileRoute("/mfa")({
  validateSearch: (s: Record<string, unknown>) => ({
    modo: s.modo === "verificar" ? ("verificar" as const) : ("cadastrar" as const),
  }),
  component: MfaPage,
});

type Factor = { id: string; friendly_name?: string | null; status: string };

function MfaPage() {
  const navigate = useNavigate();
  const { modo } = Route.useSearch();
  const [loading, setLoading] = useState(true);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) {
        navigate({ to: "/auth", replace: true });
        return;
      }
      const { data: lf } = await supabase.auth.mfa.listFactors();
      const verified = (lf?.totp ?? []).filter((f) => f.status === "verified");
      if (cancelled) return;
      setFactors(verified);

      if (modo === "verificar" && verified.length) {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal?.currentLevel === "aal2") {
          navigate({ to: "/", replace: true });
          return;
        }
        setLoading(false);
        return;
      }

      // Cadastro: remove tentativas não confirmadas e inicia um novo fator.
      for (const f of (lf?.all ?? []).filter((f) => f.status !== "verified")) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const agora = new Date();
      const nome = `Juris Cena ${agora.toLocaleDateString("pt-BR")} ${agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: nome });
      if (cancelled) return;
      if (error || !data) {
        toast.error("Não foi possível iniciar o cadastro do autenticador. Verifique se o MFA está habilitado no projeto.");
        setLoading(false);
        return;
      }
      setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [modo, navigate]);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const factorId = enroll?.id ?? factors[0]?.id;
    const digits = code.replace(/\D/g, "");
    if (!factorId || digits.length !== 6) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: digits });
    setBusy(false);
    if (error) {
      toast.error("Código inválido ou expirado. Tente novamente.");
      setCode("");
      return;
    }
    toast.success(enroll ? "Autenticador cadastrado com sucesso." : "Identidade confirmada.");
    navigate({ to: "/", replace: true });
  }

  async function sair() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/mascote.png" alt="Carl" className="mx-auto h-24 w-auto mb-3 drop-shadow-[0_10px_20px_rgba(0,0,0,0.25)]" />
          <h1 className="font-serif text-2xl text-foreground">
            {enroll ? "Configure a verificação em duas etapas" : "Verificação em duas etapas"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {enroll
              ? "O acesso ao Juris Cena exige um autenticador. Leva um minuto."
              : "Abra o aplicativo autenticador e informe o código de 6 dígitos."}
          </p>
        </div>
        <Card className="p-6">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center">Preparando…</p>
          ) : (
            <form onSubmit={verify} className="space-y-4">
              {enroll && (
                <div className="space-y-3">
                  <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1">
                    <li>Instale um autenticador (Microsoft Authenticator, Google Authenticator ou 1Password).</li>
                    <li>Escaneie o QR Code abaixo ou digite a chave manualmente.</li>
                    <li>Informe o código de 6 dígitos gerado.</li>
                  </ol>
                  <div className="flex justify-center rounded-md border border-border bg-white p-3">
                    <img src={enroll.qr} alt="QR Code do autenticador" className="h-44 w-44" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Chave manual</Label>
                    <code className="block mt-1 rounded bg-muted px-3 py-2 text-xs font-mono break-all select-all">{enroll.secret}</code>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="code">Código de 6 dígitos</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="text-center text-2xl tracking-[0.5em] font-mono"
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
                {busy ? "Verificando…" : enroll ? "Ativar autenticador" : "Confirmar"}
              </Button>
              <button type="button" onClick={sair} className="w-full text-xs text-muted-foreground hover:text-foreground">
                Sair da conta
              </button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
