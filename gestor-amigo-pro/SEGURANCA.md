# Segurança do Juris Cena — modelo, operação e roteiro

> Documento interno da Cena Empreendimentos. Não contém segredos. Atualizado em set/2026 após auditoria adversarial multiagente (83 achados confirmados) e duas ondas de blindagem.

## 1. Modelo de defesa em profundidade (o que já está no código)

| Camada | Proteção | Onde |
|---|---|---|
| Identidade | Acesso só por convite (autocadastro removido); erro genérico de login; senha mínima 12 | `src/routes/auth.tsx` |
| Identidade | **MFA obrigatório (TOTP)** — primeiro acesso cadastra o autenticador; toda sessão exige AAL2 | `src/routes/mfa.tsx`, `_authenticated/route.tsx` |
| Sessão | Logout por inatividade (30 min, `VITE_INATIVIDADE_MIN`); logout limpa cache; "encerrar em todos os dispositivos" | `hooks/use-idle-logout.ts`, `seguranca.tsx` |
| Dados | RLS por usuário em todas as tabelas e buckets; role `anon` sem privilégios; políticas `TO authenticated` | migrações |
| Dados | Chaves estrangeiras cruzadas validam titularidade; CHECKs de valores/datas/enums; desligar colaborador não apaga registros (RESTRICT) | `20260905120000_hardening_seguranca.sql` |
| Dados | **Trilha de auditoria por trigger** (autor, antes/depois) — imune ao cliente | `20260905130000_blindagem_auditoria_ratelimit.sql` |
| Dados | Políticas restritivas exigindo AAL2 no banco (aplicar após todos cadastrarem MFA) | `20260905140000_exigir_mfa_rls.sql` |
| IA | Dados delimitados/truncados como "dado, nunca instrução"; só texto user/assistant chega ao modelo; exclusões exigem título exato confirmado, máx. 2 por mensagem; ids UUID, datas, enums; erros do banco não vazam; ações registradas e visíveis | `src/routes/api/chat.ts`, `assistente.tsx` |
| IA | Rate limit distribuído (função SQL) com fallback em memória; limites de corpo/mensagens/passos/tokens | `chat.ts` + migração |
| Web | CSP, HSTS, X-Frame-Options, nosniff, Referrer/Permissions-Policy, COOP/CORP, X-Robots-Tag; `robots.txt` | `src/start.ts`, `vercel.json`, `public/robots.txt` |
| Entrada | Uploads validados (tipo, tamanho, nome); MIME de imagem; capa só do armazenamento do sistema; e-mails colados sem caracteres invisíveis/controle | `contratos/$id.tsx`, `card-customizer.tsx`, `de-email.tsx` |
| Segredos | `.env` fora do Git; `.env.example`; `.gitignore` bloqueia planilhas/PDF/CSV | raiz e app |

## 2. Configurações que vivem nos painéis (checklist do administrador)

### Supabase → Authentication
- [ ] Providers → Email: **desmarcar "Allow new users to sign up"**; manter "Confirm email".
- [ ] Multi-Factor: TOTP **habilitado** (necessário para `/mfa`).
- [ ] Password: mínimo 12; **bloquear senhas vazadas (HaveIBeenPwned)**.
- [ ] Attack Protection: CAPTCHA (Turnstile) no login.
- [ ] Sessions: tempo máximo (ex.: 12 h) e inatividade (ex.: 30 min) — reforça o controle do app.
- [ ] URL Configuration: Site URL e Redirect URLs restritos ao domínio do sistema.
- [ ] Rate limits de e-mail/OTP nos valores padrão ou menores.
- [ ] Settings → API: **rotacionar chaves** (migrar para `sb_publishable_`/`sb_secret_`).

### Supabase → SQL Editor
- [ ] Aplicar `20260905120000_hardening_seguranca.sql`.
- [ ] Aplicar `20260905130000_blindagem_auditoria_ratelimit.sql`.
- [ ] Depois que todos cadastrarem MFA: aplicar `20260905140000_exigir_mfa_rls.sql`.

### Vercel
- [ ] Environment Variables: Production separado de Preview; `LOVABLE_API_KEY` e `SUPABASE_SERVICE_ROLE_KEY` **nunca** em Preview.
- [ ] Firewall: rate limit em `/api/chat` (ex.: 30 req / 5 min por IP) e bloqueio geográfico se fizer sentido.
- [ ] Deployment Protection ativa para previews.

### GitHub
- [ ] Repositório **privado**; transferir para a conta corporativa.
- [ ] 2FA obrigatório; proteção da branch de produção (revisão obrigatória); Secret scanning + Push protection; Dependabot; CODEOWNERS.
- [ ] Excluir a branch `claude/oi-w5lfdk` (dados de locatários) e purgar histórico (`git filter-repo`).

### Firebase (Agenda)
- [ ] Realtime Database → Rules: exigir autenticação; ou migrar a Agenda para o Supabase.

## 3. Operação e resposta a incidentes

- **Suspeita de conta comprometida:** Segurança → "Encerrar em todos os dispositivos"; no Supabase, Users → revogar sessões; trocar senha; revisar `audit_log` e `ai_action_log` do usuário.
- **Chave vazada:** rotacionar no Supabase/Lovable; atualizar Vercel; redeploy; revisar logs do período.
- **Ação indevida da IA:** consultar `ai_action_log` (o que foi pedido/feito) e `audit_log` (antes/depois) → restaurar via `old_data`.
- **Revisão mensal:** `npm audit`, atualizações de dependências, revisão de usuários ativos, verificação dos itens da seção 2.

## 4. Roteiro "nível militar" — o que ainda pode ser implantado

Ordem sugerida de valor × esforço:

1. **SSO corporativo (Microsoft Entra ID / SAML)** — login só com a conta da empresa, MFA e políticas de acesso condicional do M365; desligamento no RH bloqueia o acesso automaticamente.
2. **Modelo de organização e papéis** — administrador, gestor, leitura; registros pertencem à empresa, não ao colaborador; transferência de titularidade e revisão de acesso.
3. **Soft delete + retenção legal** — nada é apagado fisicamente; exclusões ficam suspensas por 30 dias e podem ser restauradas; retenção por tipo de documento.
4. **Documentos cifrados do lado do cliente** (chave por organização) para minutas sensíveis — nem o provedor de nuvem lê o conteúdo.
5. **Antivírus/anti-malware em uploads** (ex.: ClamAV via função de borda) antes de liberar download; abertura de PDFs em visualizador isolado.
6. **Marca-d'água e registro de download** de minutas (quem baixou, quando) — dissuasão de vazamento.
7. **WAF gerenciado + rate limit na borda** (Vercel Firewall/Cloudflare) com regras para bots, países e padrões de ataque; challenge automático em anomalias.
8. **Monitoramento e alertas** — logs centralizados (Supabase Log Drains → SIEM), alertas de: múltiplas falhas de login, acessos fora do horário, exclusões em massa, uso anômalo da IA.
9. **Backups testados** — PITR no Supabase, exportação semanal cifrada fora da nuvem principal, teste de restauração trimestral.
10. **Isolamento da IA** — modelo dedicado com contrato de não retenção (DPA), ou provedor em região BR; classificação de campos sensíveis que nunca vão ao modelo; revisão humana obrigatória para ações destrutivas (já parcialmente implementado).
11. **Pentest externo anual** e programa de correção com prazos por severidade.
12. **Dispositivos gerenciados** — acesso apenas de máquinas da empresa (Intune/Conditional Access) e VPN/ZTNA para o painel.
13. **Treinamento anti-phishing** — o elo mais fraco continua sendo o humano; simulações trimestrais.
14. **Chaves e segredos em cofre** (Vercel + 1Password/Azure Key Vault), rotação automática a cada 90 dias.
15. **CI/CD seguro** — build a partir de PR revisado, varredura SAST/dependências no pipeline, assinatura de commits.
