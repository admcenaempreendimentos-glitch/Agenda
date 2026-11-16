/**
 * Repactuações — controles rápidos de status.
 *
 * Três formas de mudar o status, da mais rápida para a mais completa:
 *   1. <BotaoProximoStatus>  — um clique, sem menu, para o passo mais provável.
 *   2. <StatusRepactuacao>   — o próprio selo vira botão: clique e escolha.
 *   3. useAtalhosStatus      — teclas 1 a 5 com o contrato aberto.
 *
 * O componente é autocontido de propósito (só React + Tailwind), para poder ser
 * colado em qualquer tela sem depender da biblioteca de UI do projeto.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  STATUS,
  definicaoDe,
  normalizarStatus,
  proximoStatus,
  type DefinicaoStatus,
  type StatusValor,
} from "./status-repactuacao";

/* ------------------------------------------------------------------ */
/* Selo clicável                                                        */
/* ------------------------------------------------------------------ */

type StatusProps = {
  /** Valor cru vindo do banco. */
  valor: unknown;
  /** Chamado com o novo status. Pode devolver uma Promise. */
  onChange: (novo: StatusValor) => void | Promise<void>;
  tamanho?: "sm" | "md";
  desabilitado?: boolean;
  /** Lado pelo qual o menu se alinha. */
  alinhar?: "inicio" | "fim";
  className?: string;
};

export function StatusRepactuacao({
  valor,
  onChange,
  tamanho = "sm",
  desabilitado = false,
  alinhar = "inicio",
  className = "",
}: StatusProps) {
  const [aberto, setAberto] = useState(false);
  const [foco, setFoco] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);
  const gatilho = useRef<HTMLButtonElement>(null);
  const idMenu = useId();

  const atual = definicaoDe(valor);
  const indiceAtual = atual ? STATUS.findIndex((s) => s.valor === atual.valor) : 0;

  // Fecha ao clicar fora ou ao rolar a página.
  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  function abrir() {
    if (desabilitado) return;
    setFoco(indiceAtual < 0 ? 0 : indiceAtual);
    setAberto(true);
  }

  function escolher(def: DefinicaoStatus) {
    setAberto(false);
    gatilho.current?.focus();
    if (def.valor !== atual?.valor) void onChange(def.valor);
  }

  function teclado(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      setAberto(false);
      gatilho.current?.focus();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const passo = e.key === "ArrowDown" ? 1 : -1;
      setFoco((f) => (f + passo + STATUS.length) % STATUS.length);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      escolher(STATUS[foco]);
      return;
    }
    const porAtalho = STATUS.find((s) => s.atalho === e.key);
    if (porAtalho) {
      e.preventDefault();
      escolher(porAtalho);
    }
  }

  const alturaSelo = tamanho === "md" ? "h-7 text-sm px-2.5" : "h-6 text-xs px-2";

  return (
    <div ref={caixa} className={`relative inline-block ${className}`}>
      <button
        ref={gatilho}
        type="button"
        onClick={() => (aberto ? setAberto(false) : abrir())}
        onKeyDown={(e) => {
          if (!aberto && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            abrir();
          }
        }}
        disabled={desabilitado}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={aberto ? idMenu : undefined}
        title={desabilitado ? undefined : "Clique para alterar o status"}
        className={[
          "inline-flex items-center gap-1.5 rounded-full font-medium transition",
          alturaSelo,
          atual?.selo ??
            "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200 dark:bg-zinc-400/10 dark:text-zinc-400 dark:ring-zinc-400/30",
          desabilitado
            ? "cursor-default opacity-70"
            : "cursor-pointer hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-sky-500",
        ].join(" ")}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${atual?.ponto ?? "bg-zinc-400"}`} />
        {atual?.rotulo ?? "Sem status"}
        {!desabilitado && (
          <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3 w-3 opacity-60">
            <path d="M6 8l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {aberto && (
        <div
          id={idMenu}
          role="listbox"
          tabIndex={-1}
          onKeyDown={teclado}
          ref={(el) => el?.focus()}
          className={[
            "absolute z-50 mt-1.5 w-64 overflow-hidden rounded-lg border border-zinc-200 bg-white p-1 shadow-lg outline-none",
            "dark:border-zinc-700 dark:bg-zinc-900",
            alinhar === "fim" ? "right-0" : "left-0",
          ].join(" ")}
        >
          {STATUS.map((s, i) => {
            const selecionado = s.valor === atual?.valor;
            return (
              <button
                key={s.valor}
                type="button"
                role="option"
                aria-selected={selecionado}
                onMouseEnter={() => setFoco(i)}
                onClick={() => escolher(s)}
                className={[
                  "flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left transition",
                  i === foco ? "bg-zinc-100 dark:bg-zinc-800" : "",
                ].join(" ")}
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.ponto}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{s.rotulo}</span>
                    {selecionado && (
                      <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 text-emerald-600">
                        <path d="M5 10.5l3.5 3.5L15 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className="block text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                    {s.descricao}
                  </span>
                </span>
                <kbd className="mt-0.5 rounded border border-zinc-200 px-1 font-mono text-[10px] text-zinc-400 dark:border-zinc-700">
                  {s.atalho}
                </kbd>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Botão de um clique só                                                */
/* ------------------------------------------------------------------ */

export function BotaoProximoStatus({
  valor,
  onChange,
  className = "",
}: {
  valor: unknown;
  onChange: (novo: StatusValor) => void | Promise<void>;
  className?: string;
}) {
  const prox = proximoStatus(valor);
  if (!prox) return null;
  return (
    <button
      type="button"
      onClick={() => void onChange(prox.valor)}
      className={[
        "inline-flex items-center gap-2 rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition",
        "hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1",
        "dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200",
        className,
      ].join(" ")}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${prox.ponto}`} />
      Marcar como {prox.rotulo}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Barra de sugestão automática                                         */
/* ------------------------------------------------------------------ */

export function SugestaoStatus({
  sugestao,
  onAceitar,
  onDispensar,
}: {
  sugestao: DefinicaoStatus | null;
  onAceitar: (novo: StatusValor) => void | Promise<void>;
  onDispensar: () => void;
}) {
  if (!sugestao) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm dark:border-sky-500/30 dark:bg-sky-500/10">
      <span className="text-sky-900 dark:text-sky-200">
        Os valores preenchidos indicam <strong className="font-semibold">{sugestao.rotulo}</strong>.
      </span>
      <span className="ml-auto flex gap-2">
        <button
          type="button"
          onClick={() => void onAceitar(sugestao.valor)}
          className="rounded bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-700"
        >
          Atualizar status
        </button>
        <button
          type="button"
          onClick={onDispensar}
          className="rounded px-2.5 py-1 text-xs text-sky-800 hover:bg-sky-100 dark:text-sky-300 dark:hover:bg-sky-500/20"
        >
          Agora não
        </button>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Atalhos de teclado                                                   */
/* ------------------------------------------------------------------ */

function digitando(alvo: EventTarget | null): boolean {
  const el = alvo as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/**
 * Teclas 1 a 5 mudam o status do contrato aberto. Ignora quem está digitando
 * em um campo e qualquer combinação com Ctrl/Alt/Meta.
 */
export function useAtalhosStatus({
  ativo,
  onChange,
}: {
  ativo: boolean;
  onChange: (novo: StatusValor) => void | Promise<void>;
}) {
  const ref = useRef(onChange);
  ref.current = onChange;

  const tecla = useCallback((e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || digitando(e.target)) return;
    const def = STATUS.find((s) => s.atalho === e.key);
    if (!def) return;
    e.preventDefault();
    void ref.current(def.valor);
  }, []);

  useEffect(() => {
    if (!ativo) return;
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [ativo, tecla]);
}

export { normalizarStatus, STATUS };
export type { StatusValor, DefinicaoStatus };
