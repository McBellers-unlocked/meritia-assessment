# Meritia Carve-Out Plan

Source: `C:/dev/sdi-assessment-platform` (Callater, `sdi-assessment-platform` repo)
Target: `C:/dev/meritia` (this repo)
Author: carve-out executed 2026-04-17.

---

## Product intent

Meritia is a standalone **AI-era professional-judgement assessment platform**
extracted from the `recruitment` module of the Callater repo. It is not a
generic ATS. Its core is:

- per-scenario cohorts with per-candidate tokens and anonymous IDs
- memo + AI investigation tasks (Claude-backed)
- scripted email-inbox tasks with expected actions (reply / ignore / flag)
- persona chat-popup tasks (AI in-role)
- blind marking with reveal; per-issue rubrics
- candidate activity logging (paste + visibility events)
- single-use session enforcement (cookie + IP hash)
- admin-authored scenarios (DB) alongside legacy code scenarios

---

## Phase 1 — Recruitment Module Inventory

### Bucket A: Recruitment-only (copied verbatim)

| Area | Files |
|------|-------|
| Candidate UI | `src/app/assess/[scenarioSlug]/page.tsx`, `src/components/recruit/AssessmentView.tsx`, `src/components/recruit/LiveEventsOverlay.tsx` |
| Candidate APIs | `src/app/api/assess/{start,chat,memo,submit,activity}/route.ts`, `src/app/api/assess/state/[token]/route.ts`, `src/app/api/assess/events/[token]/route.ts`, `src/app/api/assess/emails/reply/route.ts` |
| Admin pages (9) | `src/app/(admin)/admin/recruitment/**/*.tsx` |
| Admin APIs (~20) | `src/app/api/admin/recruitment/**/*.ts` |
| Lib | `src/lib/recruit/{types,scenario-loader,candidate-auth,tokens,rubric,fam-p4-2026,aplo-p2-2026}.ts` |
| Scenario assets | `infra/recruit/idsc-fam-p4-2026/*`, `infra/recruit/idsc-aplo-p2-2026/*` (rubric JSON + exhibit HTML) |
| Prisma models (11) | `RecruitmentAssessment`, `RecruitmentCandidate`, `RecruitmentResponse`, `RecruitmentInteraction`, `RecruitmentActivityEvent`, `RecruitmentScenario`, `RecruitmentScenarioTask`, `RecruitmentScenarioExhibit`, `RecruitmentScenarioEmail`, `RecruitmentScenarioChatScript`, `RecruitmentEmailResponse` |

### Bucket B: Shared but needed (adapted)

| File | Change applied |
|------|----------------|
| `src/lib/prisma.ts` | Dropped Lambda-proxy transport (`DB_PROXY_FUNCTION_NAME`) — direct connection only. Meritia re-adds proxy later if Amplify needs it. Removes `@aws-sdk/client-lambda` dep. |
| `src/lib/secrets.ts` | `getAnthropicKey()` now prefers `ANTHROPIC_API_KEY` env var; falls back to Secrets Manager only if `SECRET_ARN` set. `getResendKey` dropped (outreach not in scope). |
| `src/lib/auth.ts` | Kept next-auth + Cognito, but stripped the STUDENT/EXAMINER/TEAM_LEADER/PRINCIPAL_EXAMINER role ladder. Only `ADMIN` is mapped. First sign-in creates a `User` row with role `ADMIN` so the first Cognito user of a fresh pool becomes admin automatically (acceptable during bootstrap; tighten later). Config logs simplified. |
| `src/lib/admin-auth.ts` | Still gates on session + role === ADMIN. |
| `src/lib/constants.ts` | Trimmed to just `ADMIN_ROLES = ["ADMIN"] as const`. IQ / PS / marker-status constants dropped (not used by recruitment). |
| `src/app/layout.tsx` | Rebranded title/metadata → Meritia. Logo references swapped. |
| `src/app/globals.css` | Kept — shared editor/markdown prose classes are used by the candidate UI and the admin mark view. |
| `src/app/fonts/*` | Geist Sans / Mono .woff files copied verbatim (generic fonts). |
| `src/components/Providers.tsx` | Dropped `RoleProvider` — Meritia is admin-only on the authenticated surface. |
| `src/components/Nav.tsx` | Rewritten: minimal brand + sign-out. No role switcher, no cross-section links. |
| `next.config.mjs` | Stripped `RESEND_*` and `OUTREACH_FROM` env vars. Added `ANTHROPIC_API_KEY`. |
| `tailwind.config.ts` | Kept navy palette (already generic). Crimson/teal kept but unused by recruitment — left in for now, prune in follow-up. |
| `prisma/schema.prisma` | Trimmed from 747 lines → ~320 lines. Only recruitment + `User` (for admin sign-in). |
| `package.json` | Dropped: `@aws-sdk/client-ec2`, `@aws-sdk/client-ecs`, `@aws-sdk/client-lambda`, `@aws-sdk/client-s3`, `@floating-ui/dom`, `@types/dompurify`, `dompurify`. Kept: Anthropic SDK, Prisma, Next, TipTap, react-markdown, remark-gfm, next-auth, AWS SDK for Secrets Manager only. Name: `meritia`. |

### Bucket C: Callater-specific — excluded

Everything in the following source paths was **not** copied:

- ACCA SDI / APM exam flow: `src/app/(student)/*`, `src/app/(examiner)/*`, all `api/marking/*`, `api/exhibits/*`, `api/exhibit-responses/*`, `api/interactions/*`
- Callater admin surfaces outside recruitment: `(admin)/admin/{dashboard,scenarios,demo-analytics,outreach,qa,users}`, corresponding APIs
- SDS Python sandbox: `src/app/(student)/sandbox/*`, `api/demo/sandbox/*`, `src/components/sandbox/*`, `src/lib/{sandbox-*,ecs}.ts`, `sandbox-docker/*`
- Marketing & outreach: `src/app/demo/*`, `src/app/page.tsx` (Callater homepage), `api/admin/outreach/*`, `src/lib/email*`, `OutreachLead/OutreachSend/DemoVisit` models
- ACCA-specific lib: `src/lib/{calculation-types,marking-utils,preview-data,system-prompt,tool-definitions,student-allocation,demo-*}.ts`
- Infra: `infra/lambda-db-proxy/*`, `infra/build-and-push.sh`, `infra/create-cluster.sh`, `sandbox-docker/*`
- Root docs/PDFs/.docx (AAT spec, SDS mock, HUXTER/TROMLEE, SCS Pre-seen, etc.)

### Bucket D: New for standalone

- `README.md` + this `docs/MIGRATION_PLAN.md`
- `.env.example`
- `prisma/seed.ts` — bootstrap admin user (optional; Cognito user first-sign-in auto-promotes)
- `src/app/page.tsx` — minimal landing redirecting admins to `/admin/recruitment` and others to `/login`
- `public/brand/*` — placeholder mark (text logo). The Callater `callater-logo-text.png` was **not** copied.

---

## Phase 2 — Carve-Out Design

### Chosen approach: **direct copy-and-prune, single standalone Next.js app**

The recruitment module is extraordinarily clean:

- All DB tables are `recruitment_*` prefixed with a clear section comment in the
  source schema; no FK edges cross into ACCA models.
- The `User` join is optional (`createdById`, `markedById` are plain strings).
- Candidate auth is token + cookie — completely independent of next-auth.
- Admin UI uses `useSession` from next-auth + fetch to `/api/admin/recruitment/*`;
  no dependence on Callater's admin layout, Nav, or role-switching code beyond
  a single "redirect to /login if unauthenticated" guard.

A modularised monorepo would add ceremony for no current payoff. Meritia has
exactly one consumer of its code (itself). Revisit packaging if a second
product is on the horizon.

### Folder structure (mirrors Callater's recruitment slice)

```
meritia/
├─ docs/MIGRATION_PLAN.md         ← this file
├─ prisma/
│  ├─ schema.prisma               ← recruitment + minimal User
│  └─ seed.ts                     ← optional admin bootstrap
├─ infra/recruit/                 ← scenario HTML exhibits + rubric JSONs
│  ├─ idsc-fam-p4-2026/
│  └─ idsc-aplo-p2-2026/
├─ public/                        ← favicon, placeholder logo
└─ src/
   ├─ app/
   │  ├─ layout.tsx, page.tsx, globals.css, fonts/
   │  ├─ (auth)/login/page.tsx
   │  ├─ (admin)/admin/recruitment/**     ← admin scenario + cohort builder
   │  ├─ assess/[scenarioSlug]/page.tsx   ← candidate entry (token in ?token=)
   │  └─ api/
   │     ├─ auth/[...nextauth]/route.ts
   │     ├─ admin/recruitment/**          ← ~20 admin endpoints
   │     └─ assess/**                     ← 8 candidate endpoints
   ├─ components/
   │  ├─ Nav.tsx, Providers.tsx
   │  └─ recruit/{AssessmentView,LiveEventsOverlay}.tsx
   └─ lib/
      ├─ prisma.ts, secrets.ts, auth.ts, admin-auth.ts, constants.ts
      └─ recruit/{types,scenario-loader,candidate-auth,tokens,rubric,fam-p4-2026,aplo-p2-2026}.ts
```

### Renames (minimal — preserving grep-paths)

- Package name: `sdi-assessment-platform` → `meritia`
- Next metadata title / OG / manifest: `Callater` → `Meritia`
- Candidate landing header: `Callater` → `Meritia`
- Candidate view header bar: `Callater` → `Meritia`
- Footer: `Powered by Callater` → `Powered by Meritia`
- Nav brand: text logo `Meritia`
- Login page `Sign in to Callater` → `Sign in to Meritia`

Legacy scenario content (IDSC Knowledge System, IDSC Legal Knowledge System,
Finance and Accounting Manager (P4), Associate Policy Officer (Legal) (P2))
is intentionally **preserved verbatim**. Those strings live inside the
scripted scenario; they are the employer-side fiction candidates see, not
the Meritia platform brand.

### Decoupling (what had to be unpicked)

| Coupling | Resolution |
|----------|------------|
| Prisma Lambda-proxy for Amplify SSR | Dropped. Meritia uses direct DB connection. Re-add if deploying to Amplify SSR and RDS is VPC-only. |
| AWS Secrets Manager-only Anthropic key | Env-var fallback (`ANTHROPIC_API_KEY`). Both paths supported; env var wins. |
| Cognito role mapping (STUDENT/EXAMINER/etc.) | Simplified: every first-sign-in is `ADMIN`. Suitable for a fresh Cognito user pool seeded by the operator. |
| `RoleProvider`, multi-role nav | Removed. Admin is the only authenticated surface; candidates arrive via token URL and never see Nav (Nav returns null on `/assess`). |
| Demo landing page at `/` | Replaced with a minimal page that sends anonymous visitors to `/login`. |

### Debt deliberately left alone

- `tailwind.config.ts` still defines `crimson` and `teal` palettes, unused. Cost to prune: ~20 lines, zero impact. Skipping.
- `package.json` keeps `@aws-sdk/client-secrets-manager` even when `ANTHROPIC_API_KEY` env var is set. Trade: one extra dep vs. a build-time flag; dep wins.
- `infra/recruit/idsc-fam-p4-2026/generate_task2_exhibit.py` kept as source-of-record for the exhibit HTML — not run at build time.
- `src/app/globals.css` still carries the full prose suite (`.memo-rendered`, `.markdown-rendered`). Some rules are only used in the mark view; keeping them avoids a whack-a-mole audit.

### Must be cleaned before launch

1. **Cognito user pool**: Meritia must NOT reuse the Callater pool. Create a fresh pool and an `admin` group; set `COGNITO_CLIENT_ID` / `COGNITO_ISSUER`. (Or swap the provider — see Runbook.)
2. **Branding assets**: `/favicon.ico`, `/og-image.png`, `/apple-touch-icon.png`, any `/icon-*.png` referenced by layout.tsx. Copied shells only.
3. **NEXTAUTH_SECRET**: new random 32-byte value.
4. **DATABASE_URL**: fresh Postgres; run `prisma db push` on first deploy.
5. **ANTHROPIC_API_KEY** (or `SECRET_ARN` + value): required before any chat hits the API.

---

## Phase 3 — Dependency & Risk List

### Dependency map

**Runtime deps kept:**
- `next@14.2`, `react@18`, `react-dom@18`
- `@prisma/client@6`, `prisma@6`
- `@anthropic-ai/sdk@0.82`
- `@aws-sdk/client-secrets-manager@3` (optional path for API key)
- `next-auth@4`
- `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`, `@tiptap/pm` (memo WYSIWYG)
- `react-markdown@10`, `remark-gfm@4` (AI reply + brief rendering)

**Dev deps kept**: `typescript@5`, `tailwindcss@3.4`, `postcss`, `eslint@8`, `eslint-config-next`, `tsx`, `@types/node`, `@types/react`, `@types/react-dom`.

**Dropped**: `@aws-sdk/client-{ec2,ecs,lambda,s3}`, `@floating-ui/dom`, `dompurify`, `@types/dompurify`, `dotenv` (Next loads `.env.local` natively).

### Security-sensitive surface (flagged)

| Location | Concern |
|----------|---------|
| `src/app/api/assess/chat/route.ts` | Outbound Anthropic call, uses scenario system prompt directly. Persona chat wraps with defensive tail. Char-limit 4000 enforced both client + server. |
| `src/lib/recruit/candidate-auth.ts` + cookie | `recruit_session` cookie is httpOnly + sameSite=lax + secure. Single-use enforcement: first browser that calls `/api/assess/start` locks `sessionToken`. |
| `src/app/api/assess/activity/route.ts` | Does **not** capture pasted content — only `{ charCount }`. Do not loosen. |
| `src/lib/secrets.ts` | API key cached in-process. Safe under Next serverless lifetime. Do not log. |
| Admin API routes | All wrapped in `requireAdmin()`; 401 if not logged in, 403 if role ≠ ADMIN. Verify no route handler skips this. |

### Hidden / subtle dependencies on Callater

| Item | Notes |
|------|-------|
| `src/lib/recruit/rubric.ts` uses `process.cwd()` + `infra/recruit/<scenarioId>/marking_rubric.json` | Works because Next's serverless bundles include the `infra/` directory when referenced at module load. Worth a smoke test on first deploy. |
| `src/lib/recruit/fam-p4-2026.ts` + `aplo-p2-2026.ts` both `readFileSync` the exhibit HTML at import time | Same mechanism. If Amplify prunes `infra/`, add `outputFileTracingIncludes` in `next.config.mjs`. Flagged in runbook. |
| `src/app/api/assess/chat/route.ts` sets `maxDuration = 60` | Amplify SSR Lambda free tier caps at 10 s. Bump the Amplify function timeout or migrate chat to a dedicated endpoint with higher timeout. |
| Prisma `@@map`s use snake_case; reading the Callater prod DB with Meritia's schema **would work** (fresh DB is explicit decision — confirmed with user). |

---

## Phase 4 — Runbook & TODO

See `README.md` for configuration and first-run steps.

### Open TODOs (prioritised)

- [ ] Replace placeholder brand assets in `public/` (favicon, apple-touch-icon, og-image)
- [ ] Create fresh Cognito user pool (or swap to a credentials/email-magic-link provider — minimal refactor)
- [ ] Smoke test: `infra/recruit/*` files are present in production bundle (add `outputFileTracingIncludes` to `next.config.mjs` if not)
- [ ] Prune unused `crimson` / `teal` Tailwind palette entries (follow-up)
- [ ] Decide on candidate URL host (e.g. `assess.meritia.com` vs `meritia.com/assess/...`) and set `NEXTAUTH_URL` accordingly — candidate URLs currently use whatever host the request arrives on
- [ ] Set up minimum-viable deployment target (Amplify / Vercel / Fly). Current code is deployment-agnostic but the Callater repo carried Amplify assumptions.
- [ ] Manual test the golden flows listed in the Runbook.
