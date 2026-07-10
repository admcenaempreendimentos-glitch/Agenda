import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Building2, ListChecks, FileText, Sparkles, LogOut, Settings, Moon, Sun } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/hooks/use-theme";

const items = [
  { title: "Painel", url: "/", icon: LayoutDashboard },
  { title: "Escritórios", url: "/escritorios", icon: Building2 },
  { title: "Demandas", url: "/demandas", icon: ListChecks },
  { title: "Contratos", url: "/contratos", icon: FileText },
  { title: "Assistente IA", url: "/assistente", icon: Sparkles },
  { title: "Integrações", url: "/configuracoes", icon: Settings },
];

export function AppSidebar() {
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (url: string) => (url === "/" ? currentPath === "/" : currentPath.startsWith(url));
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border/70">
      <SidebarHeader className="border-b border-sidebar-border/60 px-5 py-6">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-serif text-lg shadow-[0_6px_16px_-6px_oklch(0.18_0.05_268/0.45)]">
            J
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="font-serif text-lg text-sidebar-foreground">Jurídico</span>
            <span className="text-[10px] uppercase tracking-[0.22em] text-sidebar-foreground/60">Construtora</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-3 py-4">
        <SidebarGroup>
          <SidebarGroupLabel className="px-2 mb-2 text-[10px] uppercase tracking-[0.22em] text-sidebar-foreground/50">
            Módulos
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    className="h-auto p-0 hover:bg-transparent data-[active=true]:bg-transparent"
                  >
                    <Link
                      to={item.url}
                      className={`nav-pill w-full text-[13px] font-medium tracking-wide ${
                        isActive(item.url) ? "nav-pill-active" : ""
                      }`}
                    >
                      <item.icon className="h-[18px] w-[18px] shrink-0" />
                      <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border/60 p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={toggle}
              className="h-auto p-0 hover:bg-transparent"
              tooltip={dark ? "Modo claro" : "Modo escuro"}
            >
              <div className="nav-pill w-full text-[13px] font-medium">
                {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
                <span className="group-data-[collapsible=icon]:hidden">
                  {dark ? "Modo claro" : "Modo escuro"}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => supabase.auth.signOut()}
              className="h-auto p-0 hover:bg-transparent"
            >
              <div className="nav-pill w-full text-[13px] font-medium">
                <LogOut className="h-[18px] w-[18px]" />
                <span className="group-data-[collapsible=icon]:hidden">Sair</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}