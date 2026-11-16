/**
 * Gravação do status com resposta imediata na tela e desfazer.
 *
 * A tela não espera o banco: o selo muda na hora, a gravação acontece atrás e,
 * se falhar, o valor antigo volta sozinho com um aviso. Toda troca deixa um
 * "Desfazer" por alguns segundos.
 *
 * Ajuste as três linhas de import abaixo para os caminhos do projeto e, se o
 * nome da tabela não for `repactuacoes`, troque TABELA.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import { normalizarStatus, rotuloDe, type StatusValor } from "./status-repactuacao";

const TABELA = "repactuacoes";

type Variaveis = {
  id: string;
  status: StatusValor;
  /** Status antes da troca — usado para desfazer e para reverter em erro. */
  anterior: unknown;
  /** Quando true, não abre o aviso de desfazer (evita laço ao desfazer). */
  silencioso?: boolean;
};

type Contexto = { chaves: unknown[][] };

/**
 * @param chaveLista chave do react-query da lista que precisa refletir a troca,
 *                   por exemplo ["repactuacoes", ano].
 */
export function useAtualizarStatus(chaveLista: unknown[]) {
  const qc = useQueryClient();

  return useMutation<void, Error, Variaveis, Contexto>({
    mutationFn: async ({ id, status }) => {
      const { error } = await supabase
        .from(TABELA)
        .update({ status, status_atualizado_em: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },

    // Pinta a tela antes da ida ao banco.
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: chaveLista });
      const instantaneos = qc.getQueriesData({ queryKey: chaveLista });

      for (const [chave] of instantaneos) {
        qc.setQueryData(chave, (velho: unknown) => trocarStatus(velho, id, status));
      }

      return { chaves: instantaneos.map(([chave]) => chave as unknown[]) };
    },

    onError: (erro, variaveis, contexto) => {
      // Devolve o valor antigo em cada consulta tocada.
      const antigo = normalizarStatus(variaveis.anterior);
      if (antigo) {
        for (const chave of contexto?.chaves ?? []) {
          qc.setQueryData(chave, (velho: unknown) => trocarStatus(velho, variaveis.id, antigo));
        }
      }
      toast.error("Não foi possível salvar o status.", { description: erro.message });
    },

    onSuccess: (_dados, variaveis) => {
      if (variaveis.silencioso) return;
      const antigo = normalizarStatus(variaveis.anterior);
      toast.success(`Status alterado para ${rotuloDe(variaveis.status)}.`, {
        duration: 6000,
        action: antigo
          ? {
              label: "Desfazer",
              onClick: () => {
                void salvarDireto(variaveis.id, antigo).then((erro) => {
                  if (erro) {
                    toast.error("Não foi possível desfazer.", { description: erro });
                    return;
                  }
                  for (const chave of chavesDe(qc, chaveLista)) {
                    qc.setQueryData(chave, (velho: unknown) => trocarStatus(velho, variaveis.id, antigo));
                  }
                  toast.message(`Status devolvido para ${rotuloDe(antigo)}.`);
                });
              },
            }
          : undefined,
      });
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: chaveLista });
    },
  });
}

/* ------------------------------------------------------------------ */
/* Apoio                                                               */
/* ------------------------------------------------------------------ */

function chavesDe(qc: ReturnType<typeof useQueryClient>, chaveLista: unknown[]) {
  return qc.getQueriesData({ queryKey: chaveLista }).map(([chave]) => chave as unknown[]);
}

async function salvarDireto(id: string, status: StatusValor): Promise<string | null> {
  const { error } = await supabase
    .from(TABELA)
    .update({ status, status_atualizado_em: new Date().toISOString() })
    .eq("id", id);
  return error ? error.message : null;
}

/**
 * Troca o status do registro `id` dentro do cache, seja ele um array de
 * contratos, um objeto único ou um objeto com a lista em alguma propriedade.
 */
function trocarStatus(
  dados: unknown,
  id: string,
  status: StatusValor,
  profundidade = 0,
): unknown {
  // A lista da tela vem agrupada por empreendimento, então é preciso descer
  // pelos níveis. O limite evita laço caso o cache guarde uma referência cíclica.
  if (profundidade > 8) return dados;

  if (Array.isArray(dados)) {
    let mudou = false;
    const novo = dados.map((item) => {
      if (!item || typeof item !== "object") return item;
      const resultado = trocarStatus(item, id, status, profundidade + 1);
      if (resultado !== item) mudou = true;
      return resultado;
    });
    return mudou ? novo : dados;
  }

  if (dados && typeof dados === "object") {
    const obj = dados as Record<string, unknown>;
    if (obj.id === id) return { ...obj, status };

    let mudou = false;
    const copia: Record<string, unknown> = { ...obj };
    for (const [chave, valor] of Object.entries(obj)) {
      if (Array.isArray(valor) || (valor && typeof valor === "object")) {
        const resultado = trocarStatus(valor, id, status, profundidade + 1);
        if (resultado !== valor) {
          copia[chave] = resultado;
          mudou = true;
        }
      }
    }
    return mudou ? copia : dados;
  }

  return dados;
}

/* ------------------------------------------------------------------ */
/* Troca em lote                                                        */
/* ------------------------------------------------------------------ */

/** Altera o status de vários contratos de uma vez (seleção na lista). */
export function useAtualizarStatusEmLote(chaveLista: unknown[]) {
  const qc = useQueryClient();

  return useMutation<number, Error, { ids: string[]; status: StatusValor }>({
    mutationFn: async ({ ids, status }) => {
      if (!ids.length) return 0;
      const { error } = await supabase
        .from(TABELA)
        .update({ status, status_atualizado_em: new Date().toISOString() })
        .in("id", ids);
      if (error) throw new Error(error.message);
      return ids.length;
    },
    onSuccess: (quantos, { status }) => {
      toast.success(
        `${quantos} ${quantos === 1 ? "contrato marcado" : "contratos marcados"} como ${rotuloDe(status)}.`,
      );
    },
    onError: (erro) => {
      toast.error("Não foi possível alterar os status.", { description: erro.message });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: chaveLista });
    },
  });
}
