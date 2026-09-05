import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

/*
 * Acesso somente por convite (auditoria set/2026): o autocadastro público foi
 * removido. Contas são criadas pelo administrador no painel do Supabase
 * (Authentication → Users → Invite user). A mensagem de erro é genérica para
 * impedir enumeração de contas existentes.
 */
function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) throw error;
      navigate({ to: "/" });
    } catch {
      toast.error("E-mail ou senha inválidos.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="/mascote.png"
            alt="Carl, assistente do Juris Cena"
            className="mx-auto h-32 w-auto mb-4 drop-shadow-[0_10px_20px_rgba(0,0,0,0.25)]"
          />
          <h1 className="font-serif text-3xl text-foreground">Juris Cena</h1>
          <p className="text-sm text-muted-foreground mt-1">Painel Jurídico · Cena Empreendimentos</p>
        </div>
        <Card className="p-6">
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail corporativo</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="nome@cenaempreendimentos.com.br"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Aguarde…" : "Entrar"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Acesso restrito a colaboradores. Solicite seu convite ao setor Administrativo.
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
}
