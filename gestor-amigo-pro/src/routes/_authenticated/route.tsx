import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
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