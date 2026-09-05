import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Encerra a sessão após um período sem interação (teclado, mouse, toque, rolagem).
 * Blindagem set/2026: um computador deixado aberto no escritório não fica com
 * contratos e documentos jurídicos acessíveis indefinidamente.
 */
export function useIdleLogout(minutes: number, onLogout: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cb = useRef(onLogout);
  cb.current = onLogout;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ms = Math.max(1, minutes) * 60_000;
    const fire = async () => {
      try {
        await supabase.auth.signOut();
      } finally {
        cb.current();
      }
    };
    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(fire, ms);
    };
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    document.addEventListener("visibilitychange", reset);
    reset();
    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      document.removeEventListener("visibilitychange", reset);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [minutes]);
}
