import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

/**
 * Cabeçalhos de segurança HTTP (auditoria set/2026).
 * Aplicados a toda resposta gerada pelo servidor (SSR, API, assets servidos pelo app).
 * O vercel.json replica os cabeçalhos estáticos para arquivos servidos pela CDN.
 */
function supabaseOrigin(): string {
  try {
    return new URL(process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").origin;
  } catch {
    return "https://*.supabase.co";
  }
}

function buildCsp(): string {
  const sb = supabaseOrigin();
  const sbWs = sb.replace(/^https:/, "wss:");
  return [
    "default-src 'self'",
    // TanStack Start injeta scripts inline de hidratação; nonce pode ser adotado numa etapa seguinte.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    `img-src 'self' data: blob: ${sb}`,
    "media-src 'self' blob:",
    `connect-src 'self' ${sb} ${sbWs}`,
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": buildCsp(),
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "X-Permitted-Cross-Domain-Policies": "none",
};

const securityHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const response = await next();
  if (!(response instanceof Response)) return response;
  try {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) response.headers.set(k, v);
    return response;
  } catch {
    // cabeçalhos imutáveis (ex.: resposta de fetch) — clona antes de definir
    const cloned = new Response(response.body, response);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) cloned.headers.set(k, v);
    return cloned;
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, securityHeadersMiddleware],
}));
