import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lock, Pencil, Plus, Scale } from "lucide-react";
import { formatCurrency, formatDate, parseBRLToCents, todayISO } from "@/lib/format";
import { toast } from "sonner";

/*
 * Processos — carteira com ficha.
 *
 * À esquerda, a lista de assuntos acompanhados pelo escritório externo; à
 * direita, a ficha do assunto selecionado com a decisão pendente e a linha do
 * tempo de andamentos (um por relatório mensal ou atualização avulsa).
 *
 * O acesso é decidido no banco (migração 20261125120000): diretoria e quem ela
 * designar; assunto sigiloso só para a diretoria. Esta tela não esconde nada
 * por conta própria — o que não aparece é porque o banco não devolveu.
 *
 * As datas são as INFORMADAS pelo escritório. O sistema não calcula prazo.
 */
export const Route = createFileRoute("/_authenticated/processos")({
  component: ProcessosPage,
});

type Processo = {
  id: string;
  codigo: string;
  titulo: string;
  objeto: string | null;
  natureza: "judicial" | "administrativo";
  numero: string | null;
  titular: string | null;
  law_firm_id: string | null;
  situacao: "ativo" | "suspenso" | "encerrado";
  valor_causa_cents: number | null;
  chance_recebimento: "alta" | "media" | "baixa" | "remota" | null;
  historico: string | null;
  decisao_pendente: string | null;
  decisao_desde: string | null;
  proxima_data: string | null;
  proxima_data_descricao: string | null;
  proxima_data_tipo: "compromisso_cena" | "prazo_outra_parte" | "previsao" | null;
  desfecho: string | null;
  encerrado_em: string | null;
  sigiloso: boolean;
};

type Andamento = {
  id: string;
  competencia: string;
  data_evento: string | null;
  texto: string;
  sem_novidade: boolean;
  origem: "relatorio" | "email" | "manual";
};

type Erro = { code?: string; message: string } | null;
type Resposta<T> = PromiseLike<{ data: T | null; error: Erro }>;
type Consulta<T> = Resposta<T> & {
  select: (c: string) => Consulta<T>;
  insert: (v: Record<string, unknown>) => Consulta<T>;
  update: (v: Record<string, unknown>) => Consulta<T>;
  eq: (c: string, v: string) => Consulta<T>;
  order: (c: string, o?: { ascending?: boolean; nullsFirst?: boolean }) => Consulta<T>;
  limit: (n: number) => Consulta<T>;
};
// As tabelas novas ainda não constam dos tipos gerados do Supabase.
function tabela<T>(nome: string): Consulta<T> {
  return (supabase as unknown as { from: (t: string) => Consulta<T> }).from(nome);
}

const SITUACAO: Record<Processo["situacao"], string> = { ativo: "Em andamento", suspenso: "Suspenso", encerrado: "Encerrado" };
const CHANCE: Record<NonNullable<Processo["chance_recebimento"]>, string> = { alta: "alta", media: "média", baixa: "baixa", remota: "remota" };
const TIPO_DATA: Record<NonNullable<Processo["proxima_data_tipo"]>, string> = {
  compromisso_cena: "compromisso da Cena",
  prazo_outra_parte: "prazo da outra parte",
  previsao: "previsão",
};
const ORIGEM: Record<Andamento["origem"], string> = { relatorio: "relatório mensal", email: "e-mail", manual: "lançamento manual" };

/** Remove caracteres de controle e invisíveis de texto colado do relatório ou de e-mail. */
function limpar(s: string): string {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u2028-\u202E\u2060-\u2064\uFEFF]/g, "").trim();
}

function mesAno(iso: string): string {
  const [a, m] = iso.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[Number(m) - 1] ?? m}/${a}`;
}

function tabelaAusente(e: Erro): boolean {
  return !!e && (e.code === "42P01" || e.code === "PGRST205");
}

function ProcessosPage() {
  const qc = useQueryClient();
  const [sel, setSel] = useState<string | null>(null);
  const [ficha, setFicha] = useState<{ aberta: boolean; editar: Processo | null }>({ aberta: false, editar: null });
  const [lancar, setLancar] = useState(false);

  const lista = useQuery({
    queryKey: ["processos"],
    queryFn: async () => {
      const { data, error } = await tabela<Processo[]>("processos").select("*").order("codigo", { ascending: true });
      if (tabelaAusente(error)) return { ausente: true, itens: [] as Processo[] };
      if (error) throw new Error(error.message);
      return { ausente: false, itens: data ?? [] };
    },
  });

  const itens = lista.data?.itens ?? [];
  const atual = useMemo(() => itens.find((p) => p.id === sel) ?? itens[0] ?? null, [itens, sel]);

  const andamentos = useQuery({
    queryKey: ["processos", "andamentos", atual?.id],
    enabled: !!atual,
    queryFn: async () => {
      const { data, error } = await tabela<Andamento[]>("processo_andamentos")
        .select("id, competencia, data_evento, texto, sem_novidade, origem")
        .eq("processo_id", atual!.id)
        .order("competencia", { ascending: false })
        .order("criado_em", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  if (lista.data?.ausente) {
    return (
      <div>
        <PageHeader title="Processos" description="Carteira de assuntos acompanhados pelo escritório." />
        <Card className="p-6 text-sm text-muted-foreground">
          O módulo ainda não foi ativado neste ambiente. É preciso aplicar no banco a migração
          <code className="mx-1">20261125120000_processos_carteira.sql</code> (depois da Fase 0).
        </Card>
      </div>
    );
  }

  const ativos = itens.filter((p) => p.situacao !== "encerrado").length;

  return (
    <div>
      <PageHeader
        title="Processos"
        description="Carteira de assuntos acompanhados pelo escritório. As datas são as informadas por ele; este quadro não substitui o controle de prazos do advogado."
        actions={
          <>
            <Button size="sm" variant="outline" disabled={!atual} onClick={() => setLancar(true)}>
              Lançar andamento
            </Button>
            <Button size="sm" onClick={() => setFicha({ aberta: true, editar: null })}>
              <Plus className="h-4 w-4" /> Novo assunto
            </Button>
          </>
        }
      />

      {lista.isError ? (
        <Card className="p-6 text-sm text-destructive">Não foi possível carregar os processos.</Card>
      ) : !lista.isLoading && itens.length === 0 ? (
        <Card className="p-10 text-center">
          <Scale className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-serif text-lg">Nenhum assunto visível</p>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
            Ou a carteira ainda está vazia, ou o seu usuário não foi incluído no acesso a este módulo. O acesso é concedido pela diretoria.
          </p>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <Card className="overflow-hidden self-start">
            <div className="px-4 py-3 border-b border-border text-xs uppercase tracking-widest text-muted-foreground">
              {ativos} {ativos === 1 ? "assunto ativo" : "assuntos ativos"} · {itens.length} no total
            </div>
            <ul>
              {itens.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSel(p.id)}
                    aria-current={atual?.id === p.id}
                    className={`w-full text-left px-4 py-3 border-b border-border last:border-b-0 border-l-4 transition hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      atual?.id === p.id ? "bg-muted/60 border-l-primary" : "border-l-transparent"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {p.codigo} · {p.titulo}
                      </span>
                      {p.sigiloso && <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Restrito à diretoria" />}
                      <span className="ml-auto flex gap-1.5">
                        {p.decisao_pendente && <Badge variant="destructive">Decisão da Cena</Badge>}
                        <Badge variant={p.situacao === "ativo" ? "secondary" : "outline"}>{SITUACAO[p.situacao]}</Badge>
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                      {p.objeto && <span>{p.objeto}</span>}
                      {p.proxima_data && (
                        <span>
                          {formatDate(p.proxima_data)}
                          {p.proxima_data_tipo ? ` · ${TIPO_DATA[p.proxima_data_tipo]}` : ""}
                        </span>
                      )}
                      {p.valor_causa_cents != null && <span className="tabular-nums">{formatCurrency(p.valor_causa_cents)}</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          {atual && (
            <div className="space-y-4 min-w-0">
              <Card className="p-5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-serif text-xl">
                      {atual.codigo} · {atual.titulo}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[
                        atual.objeto,
                        atual.natureza === "administrativo" ? "procedimento administrativo" : null,
                        atual.numero ? `nº ${atual.numero}` : null,
                        atual.titular ? `titular: ${atual.titular}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Sem dados complementares"}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setFicha({ aberta: true, editar: atual })}>
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <Campo rotulo="Valor histórico da causa" valor={atual.valor_causa_cents != null ? formatCurrency(atual.valor_causa_cents) : "—"} />
                  <Campo rotulo="Chance de recebimento" valor={atual.chance_recebimento ? CHANCE[atual.chance_recebimento] : "—"} />
                  <Campo
                    rotulo="Próxima data informada"
                    valor={
                      atual.proxima_data
                        ? `${formatDate(atual.proxima_data)}${atual.proxima_data_descricao ? ` — ${atual.proxima_data_descricao}` : ""}`
                        : "—"
                    }
                  />
                  <Campo rotulo="Situação" valor={SITUACAO[atual.situacao]} />
                </dl>

                {atual.situacao === "encerrado" && atual.desfecho && (
                  <Bloco titulo={`Desfecho${atual.encerrado_em ? ` · ${formatDate(atual.encerrado_em)}` : ""}`}>{atual.desfecho}</Bloco>
                )}
                <Bloco titulo={`Decisão pendente${atual.decisao_desde ? ` · desde ${formatDate(atual.decisao_desde)}` : ""}`}>
                  {atual.decisao_pendente || <span className="text-muted-foreground">Nenhuma decisão pendente.</span>}
                </Bloco>
                {atual.historico && <Bloco titulo="Histórico">{atual.historico}</Bloco>}
              </Card>

              <Card className="p-5">
                <h3 className="text-xs uppercase tracking-widest text-muted-foreground">Andamentos</h3>
                {andamentos.isLoading ? (
                  <p className="mt-3 text-sm text-muted-foreground">Carregando…</p>
                ) : (andamentos.data ?? []).length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">Nenhum andamento lançado ainda.</p>
                ) : (
                  <ol className="mt-4">
                    {(andamentos.data ?? []).map((a, i, todos) => (
                      <li key={a.id} className={`relative pl-5 pb-4 ml-1.5 border-l-2 ${i === todos.length - 1 ? "border-transparent pb-0" : "border-border"}`}>
                        <span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 border-primary bg-background" />
                        <div className="text-xs font-medium text-muted-foreground">
                          {mesAno(a.competencia)}
                          {a.data_evento ? ` · fato em ${formatDate(a.data_evento)}` : ""} · {ORIGEM[a.origem]}
                          {a.sem_novidade ? " · sem novidade" : ""}
                        </div>
                        <p className={`mt-0.5 text-sm whitespace-pre-wrap ${a.sem_novidade ? "text-muted-foreground" : ""}`}>{a.texto}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            </div>
          )}
        </div>
      )}

      <FichaDialog
        estado={ficha}
        fechar={() => setFicha({ aberta: false, editar: null })}
        aoSalvar={(id) => {
          setSel(id);
          void qc.invalidateQueries({ queryKey: ["processos"] });
        }}
      />
      {atual && (
        <AndamentoDialog
          aberto={lancar}
          processo={atual}
          fechar={() => setLancar(false)}
          aoSalvar={() => void qc.invalidateQueries({ queryKey: ["processos"] })}
        />
      )}
    </div>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{rotulo}</dt>
      <dd className="mt-0.5 break-words">{valor}</dd>
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-md border border-border p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{titulo}</div>
      <div className="mt-1 text-sm whitespace-pre-wrap">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ficha: criar e editar                                                */
/* ------------------------------------------------------------------ */

const VAZIO = {
  codigo: "",
  titulo: "",
  objeto: "",
  natureza: "judicial",
  numero: "",
  titular: "",
  situacao: "ativo",
  valor: "",
  chance: "nao_informada",
  historico: "",
  decisao_pendente: "",
  proxima_data: "",
  proxima_data_descricao: "",
  proxima_data_tipo: "previsao",
  desfecho: "",
  encerrado_em: "",
  sigiloso: false,
};

function FichaDialog({
  estado,
  fechar,
  aoSalvar,
}: {
  estado: { aberta: boolean; editar: Processo | null };
  fechar: () => void;
  aoSalvar: (id: string) => void;
}) {
  const [f, setF] = useState(VAZIO);
  const p = estado.editar;

  useEffect(() => {
    if (!estado.aberta) return;
    setF(
      p
        ? {
            codigo: p.codigo,
            titulo: p.titulo,
            objeto: p.objeto ?? "",
            natureza: p.natureza,
            numero: p.numero ?? "",
            titular: p.titular ?? "",
            situacao: p.situacao,
            valor: p.valor_causa_cents != null ? (p.valor_causa_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "",
            chance: p.chance_recebimento ?? "nao_informada",
            historico: p.historico ?? "",
            decisao_pendente: p.decisao_pendente ?? "",
            proxima_data: p.proxima_data ?? "",
            proxima_data_descricao: p.proxima_data_descricao ?? "",
            proxima_data_tipo: p.proxima_data_tipo ?? "previsao",
            desfecho: p.desfecho ?? "",
            encerrado_em: p.encerrado_em ?? "",
            sigiloso: p.sigiloso,
          }
        : VAZIO,
    );
  }, [estado.aberta, p]);

  const set = <K extends keyof typeof VAZIO>(k: K, v: (typeof VAZIO)[K]) => setF((a) => ({ ...a, [k]: v }));
  const encerrando = f.situacao === "encerrado";

  const salvar = useMutation({
    mutationFn: async () => {
      const decisao = limpar(f.decisao_pendente);
      const linha: Record<string, unknown> = {
        codigo: limpar(f.codigo),
        titulo: limpar(f.titulo),
        objeto: limpar(f.objeto) || null,
        natureza: f.natureza,
        numero: limpar(f.numero) || null,
        titular: limpar(f.titular) || null,
        situacao: f.situacao,
        valor_causa_cents: f.valor.trim() ? parseBRLToCents(f.valor) : null,
        chance_recebimento: f.chance === "nao_informada" ? null : f.chance,
        historico: limpar(f.historico) || null,
        decisao_pendente: decisao || null,
        // Marca desde quando a decisão está aberta; preserva a data se a pergunta não mudou.
        decisao_desde: decisao ? (p?.decisao_pendente === decisao && p.decisao_desde ? p.decisao_desde : todayISO()) : null,
        proxima_data: f.proxima_data || null,
        proxima_data_descricao: f.proxima_data ? limpar(f.proxima_data_descricao) || null : null,
        proxima_data_tipo: f.proxima_data ? f.proxima_data_tipo : null,
        desfecho: encerrando ? limpar(f.desfecho) || null : null,
        encerrado_em: encerrando ? f.encerrado_em || todayISO() : null,
        sigiloso: f.sigiloso,
      };
      const q = p ? tabela<{ id: string }[]>("processos").update(linha).eq("id", p.id) : tabela<{ id: string }[]>("processos").insert(linha);
      const { data, error } = await q.select("id");
      if (error) {
        if (error.code === "23505") throw new Error("Já existe um assunto com este código.");
        if (error.code === "42501") throw new Error("Seu usuário não tem permissão para gravar neste módulo.");
        throw new Error(error.message);
      }
      const id = data?.[0]?.id;
      if (!id) throw new Error("Nada foi gravado. Verifique sua permissão neste módulo.");
      return id;
    },
    onSuccess: (id) => {
      toast.success(p ? "Ficha atualizada." : "Assunto criado.");
      aoSalvar(id);
      fechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const invalido = !f.codigo.trim() || !f.titulo.trim() || (encerrando && !f.desfecho.trim());

  return (
    <Dialog open={estado.aberta} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">{p ? `Editar ${p.codigo}` : "Novo assunto"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalido) salvar.mutate();
          }}
        >
          <Linha rotulo="Código (fixo, combinado com o escritório)" id="pc-codigo">
            <Input id="pc-codigo" value={f.codigo} maxLength={20} placeholder="P-01" onChange={(e) => set("codigo", e.target.value)} />
          </Linha>
          <Linha rotulo="Nome do assunto ou parte contrária" id="pc-titulo">
            <Input id="pc-titulo" value={f.titulo} maxLength={160} onChange={(e) => set("titulo", e.target.value)} />
          </Linha>
          <Linha rotulo="Objeto" id="pc-objeto" larga>
            <Input id="pc-objeto" value={f.objeto} maxLength={300} placeholder="Ex.: cobrança de aluguéis" onChange={(e) => set("objeto", e.target.value)} />
          </Linha>
          <Linha rotulo="Natureza" id="pc-natureza">
            <Select value={f.natureza} onValueChange={(v) => set("natureza", v)}>
              <SelectTrigger id="pc-natureza"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="judicial">Judicial</SelectItem>
                <SelectItem value="administrativo">Administrativo</SelectItem>
              </SelectContent>
            </Select>
          </Linha>
          <Linha rotulo="Número ou protocolo" id="pc-numero">
            <Input id="pc-numero" value={f.numero} maxLength={60} onChange={(e) => set("numero", e.target.value)} />
          </Linha>
          <Linha rotulo="Empresa titular" id="pc-titular">
            <Input id="pc-titular" value={f.titular} maxLength={120} onChange={(e) => set("titular", e.target.value)} />
          </Linha>
          <Linha rotulo="Valor histórico da causa (R$)" id="pc-valor">
            <Input id="pc-valor" inputMode="decimal" value={f.valor} placeholder="0,00" onChange={(e) => set("valor", e.target.value)} />
          </Linha>
          <Linha rotulo="Chance de recebimento (informada pelo escritório)" id="pc-chance">
            <Select value={f.chance} onValueChange={(v) => set("chance", v)}>
              <SelectTrigger id="pc-chance"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nao_informada">Não informada</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="baixa">Baixa</SelectItem>
                <SelectItem value="remota">Remota</SelectItem>
              </SelectContent>
            </Select>
          </Linha>
          <Linha rotulo="Situação" id="pc-situacao">
            <Select value={f.situacao} onValueChange={(v) => set("situacao", v)}>
              <SelectTrigger id="pc-situacao"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Em andamento</SelectItem>
                <SelectItem value="suspenso">Suspenso</SelectItem>
                <SelectItem value="encerrado">Encerrado</SelectItem>
              </SelectContent>
            </Select>
          </Linha>

          {encerrando && (
            <>
              <Linha rotulo="Desfecho (obrigatório): resultado, valor, empresa beneficiária" id="pc-desfecho" larga>
                <Textarea id="pc-desfecho" rows={3} maxLength={2000} value={f.desfecho} onChange={(e) => set("desfecho", e.target.value)} />
              </Linha>
              <Linha rotulo="Encerrado em" id="pc-encerrado">
                <Input id="pc-encerrado" type="date" value={f.encerrado_em} onChange={(e) => set("encerrado_em", e.target.value)} />
              </Linha>
            </>
          )}

          <Linha rotulo="Próxima data informada pelo escritório" id="pc-data">
            <Input id="pc-data" type="date" value={f.proxima_data} onChange={(e) => set("proxima_data", e.target.value)} />
          </Linha>
          <Linha rotulo="Tipo da data" id="pc-tipo">
            <Select value={f.proxima_data_tipo} onValueChange={(v) => set("proxima_data_tipo", v)}>
              <SelectTrigger id="pc-tipo"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="compromisso_cena">Compromisso da Cena</SelectItem>
                <SelectItem value="prazo_outra_parte">Prazo da outra parte</SelectItem>
                <SelectItem value="previsao">Previsão do escritório</SelectItem>
              </SelectContent>
            </Select>
          </Linha>
          <Linha rotulo="O que acontece nessa data" id="pc-datadesc" larga>
            <Input id="pc-datadesc" value={f.proxima_data_descricao} maxLength={300} onChange={(e) => set("proxima_data_descricao", e.target.value)} />
          </Linha>
          <Linha rotulo="Decisão pendente da diretoria (deixe vazio se não houver)" id="pc-decisao" larga>
            <Textarea id="pc-decisao" rows={2} maxLength={1000} value={f.decisao_pendente} onChange={(e) => set("decisao_pendente", e.target.value)} />
          </Linha>
          <Linha rotulo="Histórico consolidado" id="pc-historico" larga>
            <Textarea id="pc-historico" rows={4} maxLength={6000} value={f.historico} onChange={(e) => set("historico", e.target.value)} />
          </Linha>

          <div className="sm:col-span-2 flex items-center gap-3 rounded-md border border-border p-3">
            <Switch id="pc-sigiloso" checked={f.sigiloso} onCheckedChange={(v) => set("sigiloso", v)} />
            <Label htmlFor="pc-sigiloso" className="text-sm font-normal">
              Assunto sigiloso — visível apenas para a diretoria (só a diretoria pode marcar).
            </Label>
          </div>

          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={fechar}>Cancelar</Button>
            <Button type="submit" disabled={invalido || salvar.isPending}>{salvar.isPending ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Linha({ rotulo, id, larga, children }: { rotulo: string; id: string; larga?: boolean; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${larga ? "sm:col-span-2" : ""}`}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">{rotulo}</Label>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Andamento                                                            */
/* ------------------------------------------------------------------ */

function AndamentoDialog({
  aberto,
  processo,
  fechar,
  aoSalvar,
}: {
  aberto: boolean;
  processo: Processo;
  fechar: () => void;
  aoSalvar: () => void;
}) {
  const [mes, setMes] = useState(todayISO().slice(0, 7));
  const [dataEvento, setDataEvento] = useState("");
  const [texto, setTexto] = useState("");
  const [semNovidade, setSemNovidade] = useState(false);
  const [origem, setOrigem] = useState("relatorio");

  useEffect(() => {
    if (aberto) {
      setMes(todayISO().slice(0, 7));
      setDataEvento("");
      setTexto("");
      setSemNovidade(false);
      setOrigem("relatorio");
    }
  }, [aberto, processo.id]);

  const salvar = useMutation({
    mutationFn: async () => {
      const { data, error } = await tabela<{ id: string }[]>("processo_andamentos")
        .insert({
          processo_id: processo.id,
          competencia: `${mes}-01`,
          data_evento: dataEvento || null,
          texto: limpar(texto).slice(0, 4000),
          sem_novidade: semNovidade,
          origem,
        })
        .select("id");
      if (error) throw new Error(error.code === "42501" ? "Seu usuário não tem permissão para gravar neste módulo." : error.message);
      if (!data?.length) throw new Error("Nada foi gravado. Verifique sua permissão neste módulo.");
    },
    onSuccess: () => {
      toast.success("Andamento lançado.");
      aoSalvar();
      fechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const invalido = !/^\d{4}-\d{2}$/.test(mes) || !limpar(texto);

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-serif">Lançar andamento — {processo.codigo} · {processo.titulo}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalido) salvar.mutate();
          }}
        >
          <Linha rotulo="Mês do relatório" id="an-mes">
            <Input id="an-mes" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
          </Linha>
          <Linha rotulo="Data do fato (se o escritório informou)" id="an-data">
            <Input id="an-data" type="date" value={dataEvento} onChange={(e) => setDataEvento(e.target.value)} />
          </Linha>
          <Linha rotulo="Origem" id="an-origem">
            <Select value={origem} onValueChange={setOrigem}>
              <SelectTrigger id="an-origem"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="relatorio">Relatório mensal</SelectItem>
                <SelectItem value="email">E-mail do escritório</SelectItem>
                <SelectItem value="manual">Lançamento manual</SelectItem>
              </SelectContent>
            </Select>
          </Linha>
          <div className="flex items-end gap-3 pb-2">
            <Switch id="an-sem" checked={semNovidade} onCheckedChange={setSemNovidade} />
            <Label htmlFor="an-sem" className="text-sm font-normal">Sem novidade no mês</Label>
          </div>
          <Linha rotulo="Texto do andamento, como veio do escritório" id="an-texto" larga>
            <Textarea id="an-texto" rows={6} maxLength={4000} value={texto} onChange={(e) => setTexto(e.target.value)} />
          </Linha>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={fechar}>Cancelar</Button>
            <Button type="submit" disabled={invalido || salvar.isPending}>{salvar.isPending ? "Salvando…" : "Lançar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
