import { createFileRoute, redirect } from "@tanstack/react-router";

// Root redirects into the authenticated dashboard (or /auth if signed out).
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/painel" });
  },
});
