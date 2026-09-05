import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Toaster } from "@/components/ui/sonner";
import { useIdleLogout } from "@/hooks/use-idle-logout";
import { toast } from "sonner";

/** MFA obrigatório para todos (defina VITE_EXIGIR_MFA=false para apenas exigir de quem já cadastrou). */
const EXIGIR_MFA = import.meta.env.VITE_EXIGIR_MFA !== "false";
/** Minutos sem interação até encerrar a sessão. */
const INATIVIDADE_MIN = Number(import.meta.env.VITE_INATIVIDADE_MIN ?? 30) || 30;

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    // Blindagem set/2026: exige segundo fator (AAL2) para entrar na área autenticada.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal) {
      if (aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
        throw redirect({ to: "/mfa", search: { modo: "verificar" } });
      }
      if (EXIGIR_MFA && aal.nextLevel === "aal1") {
        throw redirect({ to: "/mfa", search: { modo: "cadastrar" } });
      }
    }
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  useIdleLogout(INATIVIDADE_MIN, () => {
    qc.clear();
    toast.message("Sessão encerrada por inatividade.");
    navigate({ to: "/auth", replace: true });
  });

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-3 border-b border-border px-4 bg-background/80 backdrop-blur sticky top-0 z-20">
            <SidebarTrigger />
            <div className="flex-1" />
            <span className="text-xs uppercase tracking-widest text-muted-foreground hidden sm:inline">
              Departamento Jurídico
            </span>
          </header>
          <main className="flex-1 px-6 py-8 md:px-10 md:py-10 max-w-[1400px] w-full mx-auto">
            <Outlet />
          </main>
          <Toaster />
        </div>
      </div>
    </SidebarProvider>
  );
}
