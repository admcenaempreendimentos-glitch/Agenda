import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, FolderKanban, CheckSquare, Lock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: Settings,
});

type Integration = {
  key: string;
  name: string;
  icon: typeof Mail;
  description: string;
  capabilities: string[];
  blockedReason: string;
};

const integrations: Integration[] = [
  {
    key: "outlook",
    name: "Microsoft Outlook",
    icon: Mail,
    description:
      "Ler sua caixa de entrada e transformar e-mails em demandas com um clique, sem precisar copiar e colar.",
    capabilities: [
      "Listar os últimos 50 e-mails da Caixa de Entrada",
      "Criar demanda a partir de um e-mail selecionado",
      "Manter o e-mail intacto no Outlook (sem marcar como lido)",
    ],
    blockedReason: "Aguardando aprovação do TI para o app Microsoft 365.",
  },
  {
    key: "sharepoint",
    name: "Microsoft SharePoint",
    icon: FolderKanban,
    description:
      "Anexar arquivos que já existem no SharePoint às demandas e salvar contratos novos direto na biblioteca correta.",
    capabilities: [
      "Selecionar site e biblioteca padrão",
      "Anexar documentos existentes às demandas",
      "Enviar novas versões de contrato para o SharePoint",
    ],
    blockedReason: "Aguardando aprovação do TI para o app Microsoft 365.",
  },
  {
    key: "clickup",
    name: "ClickUp",
    icon: CheckSquare,
    description:
      "Sincronizar demandas com uma lista do ClickUp. Alterações de status em qualquer lado refletem no outro.",
    capabilities: [
      "Escolher time, espaço e lista de destino",
      "Criar tarefa no ClickUp ao abrir uma demanda",
      "Sincronização bidirecional de status via webhook",
    ],
    blockedReason: "Requer Personal API Token do ClickUp (a gerar em Settings › Apps).",
  },
];

function Settings() {
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Integrações"
        description="Conexões externas para automatizar o fluxo entre a sua caixa de entrada, a biblioteca de documentos e o gerenciador de tarefas."
      />

      <div className="space-y-4">
        {integrations.map((i) => (
          <Card key={i.key} className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="h-10 w-10 rounded-sm bg-muted flex items-center justify-center shrink-0">
                  <i.icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-serif text-lg text-foreground">{i.name}</h3>
                    <Badge variant="outline" className="gap-1">
                      <Lock className="h-3 w-3" /> Aguardando liberação
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{i.description}</p>
                </div>
              </div>
              <Button size="sm" variant="outline" disabled>
                Conectar
              </Button>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">
                  O que será possível
                </p>
                <ul className="space-y-1.5 text-sm text-foreground/80">
                  {i.capabilities.map((c) => (
                    <li key={c} className="flex gap-2">
                      <span className="text-muted-foreground">·</span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">
                  Status
                </p>
                <p className="text-sm text-foreground/80">{i.blockedReason}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}