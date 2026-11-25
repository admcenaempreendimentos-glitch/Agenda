import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Voz e escuta do Carl pela Web Speech API (gratuita, sem chave).
 *
 * Privacidade — o que sai e o que não sai do computador:
 *  - FALA (síntese): só usamos vozes LOCAIS do aparelho (localService). As vozes
 *    remotas do navegador (no Chrome, as "Google …") enviam o texto da resposta
 *    ao fornecedor para sintetizar, por isso são ignoradas. Sem voz local em
 *    português, o botão de voz não aparece.
 *  - ESCUTA (microfone): o reconhecimento é do navegador e, em regra, NÃO é
 *    local — no Chrome o áudio é processado nos servidores do Google; no Edge,
 *    nos da Microsoft. O botão avisa isso. Ditado inteiramente local depende
 *    da voz própria prevista para a Fase 2 (Whisper no navegador).
 */

const PREF_VOZ = "carl:voz-ligada";

type Falante = {
  suportado: boolean;
  ligada: boolean;
  falando: boolean;
  alternar: () => void;
  falar: (texto: string) => void;
  calar: () => void;
};

/**
 * Escolhe a melhor voz masculina em português ENTRE AS LOCAIS do aparelho.
 * Voz remota fica de fora: a resposta do Carl não deve sair do computador.
 */
function melhorVoz(vozes: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const pt = vozes.filter((v) => v.localService && v.lang?.toLowerCase().startsWith("pt"));
  if (!pt.length) return undefined;
  const br = pt.filter((v) => v.lang?.toLowerCase().includes("br"));
  const candidatas = br.length ? br : pt;
  const masculina = candidatas.find((v) => /(daniel|ricardo|felipe|male|homem|antonio)/i.test(v.name));
  return masculina ?? candidatas[0];
}

/** Remove marcação de Markdown para a leitura não soar robótica. */
function limparParaFala(texto: string): string {
  return texto
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_#>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3000);
}

export function useFala(): Falante {
  const [suportado, setSuportado] = useState(false);
  const [ligada, setLigada] = useState(false);
  const [falando, setFalando] = useState(false);
  const vozRef = useRef<SpeechSynthesisVoice | undefined>(undefined);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      setLigada(localStorage.getItem(PREF_VOZ) === "1");
    } catch {
      /* armazenamento bloqueado — segue desligada */
    }
    // As vozes chegam de forma assíncrona; só há suporte quando existe voz local.
    const carregar = () => {
      vozRef.current = melhorVoz(window.speechSynthesis.getVoices());
      setSuportado(Boolean(vozRef.current));
    };
    carregar();
    window.speechSynthesis.addEventListener("voiceschanged", carregar);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", carregar);
      window.speechSynthesis.cancel();
    };
  }, []);

  const calar = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setFalando(false);
  }, []);

  const alternar = useCallback(() => {
    setLigada((v) => {
      const novo = !v;
      try {
        localStorage.setItem(PREF_VOZ, novo ? "1" : "0");
      } catch {
        /* ignora */
      }
      if (!novo && typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
      return novo;
    });
  }, []);

  const falar = useCallback(
    (texto: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      // Sem voz local não falamos: deixar o navegador escolher poderia cair em voz remota.
      const voz = vozRef.current;
      if (!voz) return;
      const limpo = limparParaFala(texto);
      if (!limpo) return;
      window.speechSynthesis.cancel();
      const fala = new SpeechSynthesisUtterance(limpo);
      fala.lang = "pt-BR";
      fala.rate = 0.98; // um senhor calmo, não apressado
      fala.pitch = 0.92;
      fala.voice = voz;
      fala.onstart = () => setFalando(true);
      fala.onend = () => setFalando(false);
      fala.onerror = () => setFalando(false);
      window.speechSynthesis.speak(fala);
    },
    [],
  );

  return { suportado, ligada, falando, alternar, falar, calar };
}

type Escuta = {
  suportado: boolean;
  ouvindo: boolean;
  parcial: string;
  comecar: () => void;
  parar: () => void;
};

type FalaReconhecida = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

/** Microfone: transcreve a fala do usuário e entrega o texto final. */
export function useEscuta(aoFinalizar: (texto: string) => void): Escuta {
  const [suportado, setSuportado] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [parcial, setParcial] = useState("");
  const recRef = useRef<FalaReconhecida | null>(null);
  const cb = useRef(aoFinalizar);
  cb.current = aoFinalizar;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const W = window as unknown as { SpeechRecognition?: new () => FalaReconhecida; webkitSpeechRecognition?: new () => FalaReconhecida };
    const Rec = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Rec) return;
    setSuportado(true);
    const rec = new Rec();
    rec.lang = "pt-BR";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let finalizado = "";
      let emCurso = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0]?.transcript ?? "";
        if (r.isFinal) finalizado += t;
        else emCurso += t;
      }
      setParcial(emCurso);
      if (finalizado.trim()) {
        setParcial("");
        cb.current(finalizado.trim());
      }
    };
    rec.onend = () => setOuvindo(false);
    rec.onerror = () => setOuvindo(false);
    recRef.current = rec;
    return () => {
      try {
        rec.stop();
      } catch {
        /* já parado */
      }
    };
  }, []);

  const comecar = useCallback(() => {
    if (!recRef.current) return;
    try {
      setParcial("");
      recRef.current.start();
      setOuvindo(true);
    } catch {
      setOuvindo(false);
    }
  }, []);

  const parar = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* já parado */
    }
    setOuvindo(false);
  }, []);

  return { suportado, ouvindo, parcial, comecar, parar };
}
