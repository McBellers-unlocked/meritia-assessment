# Meritia

AI-era professional-judgement assessment platform. Competency simulations for
professional hiring: per-scenario cohorts, per-candidate tokens, memo + AI
investigation tasks, scripted email-inbox tasks, persona chat pops, blind
marking with reveal.

Carved out of the Callater (`sdi-assessment-platform`) repo. See
[`docs/MIGRATION_PLAN.md`](docs/MIGRATION_PLAN.md) for the carve-out log — what
was copied, what was renamed, what was excluded, and what is still open.

---

## Stack

- Next.js 14 (App Router, RSC where possible; `"use client"` for the candidate UI and admin screens)
- TypeScript
- Postgres via Prisma 6
- next-auth 4 (Cognito provider for admin sign-in; candidates are token-based and do **not** use next-auth)
- Anthropic SDK (Claude) for the live AI investigation + persona chat
- Tailwind CSS
- TipTap (memo WYSIWYG), `react-markdown` + `remark-gfm` (AI reply + brief rendering)

---

## First-run setup

### 1. Install

```bash
cd C:/dev/meritia
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
# …then fill in the values
```

Required at minimum for a fresh local install:

| Variable | What it is |
|----------|-----------|
| `DATABASE_URL` | Postgres connection string (e.g. `postgres://…@localhost:5432/meritia`). Create the DB first. |
| `NEXTAUTH_URL` | Canonical URL of the admin surface, e.g. `http://localhost:3000`. Used to build candidate invitation URLs. |
| `NEXTAUTH_SECRET` | 32-byte random string. `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `ANTHROPIC_API_KEY` | Direct key, or set `SECRET_ARN` + `APP_REGION` to fetch from AWS Secrets Manager (production path). |

For admin sign-in you also need:

| Variable | What it is |
|----------|-----------|
| `COGNITO_CLIENT_ID` | Cognito app client ID (PKCE, public client — **no** client secret). |
| `COGNITO_ISSUER` | `https://cognito-idp.<region>.amazonaws.com/<pool-id>` |

### 3. Create the database schema

```bash
npm run db:push   # applies schema.prisma to DATABASE_URL
```

Optionally bootstrap an admin row before first sign-in:

```bash
SEED_ADMIN_EMAIL=you@example.com npm run db:seed
```

(Not required — the first Cognito sign-in auto-creates the admin user.)

### 4. Run

```bash
npm run dev
```

- Marketing landing: `http://localhost:3000/`
- Admin sign-in: `http://localhost:3000/login`
- Admin recruitment list (after sign-in): `http://localhost:3000/admin/recruitment`
- Candidate URL pattern: `http://localhost:3000/assess/<scenario-slug>?token=<token>`

---

## Golden-path manual test (before every release)

Run these end-to-end after any non-trivial change. All assume a fresh local
DB and a working Cognito pool.

### A. Admin can create a cohort against the built-in scenario

1. Sign in → `/admin/recruitment`.
2. Create new assessment, pick the built-in `Finance and Accounting Manager (P4) — IDSC` scenario, set open/close dates and 90 minutes.
3. Open the new assessment → Manage candidates.
4. Paste a test candidate (`Alice Test, alice@example.com`) → Add.
5. Copy the candidate URL.

### B. Candidate can complete the assessment

1. Open the copied URL in an incognito window.
2. Check the landing: organisation, position, duration, close date all rendered.
3. Tick acknowledge → Begin. The timer starts.
4. Ask the IDSC Knowledge System a specific question (e.g. "What's in the intangibles balance?"). Verify a Claude response arrives.
5. Type ≥ 50 words in the Task 1 memo. Switch tabs. Come back. Confirm autosave indicator.
6. Switch to Task 2. Ask another question. Type.
7. Submit. Confirm the read-only "Thank you" page.

### C. Admin can mark the submission

1. Back in admin → open the assessment → "Mark submissions" (shows 1 after submission).
2. Open the candidate's row. The marker view should show the memo + AI investigation trail side-by-side.
3. Enter a per-task score + comment. Save.
4. Go to "Results & ranking". Candidate appears with the total score.

### D. Scripted scenarios: custom builder (smoke)

1. `/admin/recruitment/scenarios` → New scenario.
2. Add a memo_ai task. Paste a short system prompt. Attach an exhibit with some HTML. Add an email_inbox task with one scripted email at offset 60s. Add a chat task with a persona.
3. Publish.
4. Create a cohort against the new custom scenario. Invite a candidate. Start it. Verify email arrives at ~60s and the persona chat popup opens at its offset.

### E. Single-use enforcement

1. Open the candidate URL in browser A. Click Begin.
2. Open the same URL in browser B (no cookie). Click Begin.
3. B must be rejected with a "started in another session" error.

---

## Deployment

The code is deployment-agnostic. Validated paths:

- **Vercel / Fly / Railway**: straightforward — set the env vars, run `npm run build`, serve.
- **AWS Amplify SSR**: the Callater origin deployed here. Meritia will work but verify two things:
  1. The serverless bundle includes `infra/recruit/**` at runtime. `next.config.mjs` has `outputFileTracingIncludes` for the `/api/**` and `/assess/**` routes that call `readFileSync`.
  2. Amplify's SSR Lambda timeout is ≥ 60 s. `api/assess/chat/route.ts` sets `export const maxDuration = 60`. If your target platform caps below that, either raise the cap or shorten the Claude call (reduce `RECRUIT_MAX_TOKENS`).
- **RDS in a private VPC**: the Prisma client talks to the DB directly. If the SSR runtime can't reach RDS (e.g. Amplify SSR on a public network with RDS in a private subnet), you will need a DB proxy. The Callater repo shipped a Lambda-proxy transport in `src/lib/prisma.ts`; it was dropped during the carve-out but can be restored if needed — see the git history of `sdi-assessment-platform/src/lib/prisma.ts`.

---

## Open TODOs (stabilisation)

From `docs/MIGRATION_PLAN.md` — the things that must or should be done before
real use:

### Must do before any real candidate sees this

- [ ] **Cognito user pool**: create a dedicated Meritia pool. Do NOT reuse the Callater pool. Only invite accounts that should have admin rights.
- [ ] **Brand assets**: drop in a real `public/favicon.ico`, `apple-touch-icon.png`, `og-image.png`. Placeholder text "M" logo in `/login` works but is temporary.
- [ ] **NEXTAUTH_SECRET**: generate a new one. Never reuse Callater's.
- [ ] **Smoke-test `infra/recruit/*` in prod bundle**: after first deploy, hit the candidate URL and confirm the exhibit renders. If empty, `outputFileTracingIncludes` needs adjusting.

### Nice to have

- [ ] Prune unused `crimson` / `teal` palettes from `tailwind.config.ts`.
- [ ] Consider swapping Cognito for a simpler provider (email magic link via Resend, or credentials provider with bcrypt) if the operator doesn't already have a Cognito pool. `src/lib/auth.ts` is the only change needed.
- [ ] Add a minimal admin-users admin page (create / deactivate). Currently admins are created implicitly by first Cognito sign-in.
- [ ] Decide on candidate-URL host. If `assess.meritia.com` ≠ `meritia.com`, update `NEXTAUTH_URL` and confirm CSV candidate-URL generation uses the right origin.
- [ ] Re-introduce a lightweight logger / request-id middleware. The Callater origin used `console.log`; adequate for now.

### Known brittle bits (flagged)

- `src/lib/recruit/{fam-p4-2026,aplo-p2-2026,rubric}.ts` use `process.cwd()` + `readFileSync` to load scenario exhibits and rubric JSONs. This works with the default Next build. If you see 404-style empty exhibits in production, the serverless bundle is missing `infra/recruit/`.
- Anthropic calls in `src/app/api/assess/chat/route.ts` use prompt caching (`cache_control: ephemeral`). This cuts cost ~90% for repeat prompts within 5 minutes. Do not remove the cache marker without measuring cost impact.
- The scenario builder admin UI at `/admin/recruitment/scenarios/[id]` is MVP — drag/drop, validation, and error states are partial. Workable but rough.

---

## File map (at carve-out)

```
meritia/
├─ docs/MIGRATION_PLAN.md       ← carve-out record, dependencies, risks
├─ prisma/
│  ├─ schema.prisma             ← recruitment models + User
│  └─ seed.ts
├─ infra/recruit/
│  ├─ idsc-fam-p4-2026/         ← FAM exhibits + rubric JSON
│  └─ idsc-aplo-p2-2026/        ← APLO exhibits + rubric JSON
├─ public/                      ← placeholder; drop brand assets here
└─ src/
   ├─ app/
   │  ├─ layout.tsx, page.tsx, globals.css, fonts/
   │  ├─ (auth)/login/page.tsx
   │  ├─ (admin)/admin/recruitment/         ← 9 admin pages
   │  ├─ assess/[scenarioSlug]/page.tsx     ← candidate entry (token URL)
   │  └─ api/
   │     ├─ auth/[...nextauth]/route.ts
   │     ├─ admin/recruitment/              ← ~20 admin endpoints
   │     └─ assess/                         ← 8 candidate endpoints
   ├─ components/
   │  ├─ Nav.tsx, Providers.tsx
   │  ├─ recruit/{AssessmentView,LiveEventsOverlay}.tsx
   │  └─ admin/recruit/                     ← scenario builder editors
   └─ lib/
      ├─ prisma.ts, secrets.ts, auth.ts, admin-auth.ts, constants.ts
      └─ recruit/{types, tokens, candidate-auth, scenario-loader,
                  rubric, fam-p4-2026, aplo-p2-2026}.ts
```

---

## Design principles (from the source platform)

These were the right calls in Callater and Meritia preserves them:

- **AI personas are naive, not helpful.** The in-scenario AI (IDSC Knowledge
  System, etc.) supplies zero professional judgement — only data retrieval,
  standards references, and maths. That's what candidates are being assessed on.
  See the scenario system prompts in `src/lib/recruit/*2026.ts` for the pattern.
- **Server-enforced timer**. The clock runs against `candidate.startedAt` in
  the DB. Closing the browser, refreshing, or using a second device does not
  stop it. Auto-submit on expiry.
- **Single-use tokens** via cookie + session secret. First browser to call
  `/api/assess/start` locks the session. The candidate can refresh / come back;
  other browsers are rejected.
- **Anonymised marking**. Markers see `Candidate A`, `Candidate AD`, etc. — not
  names or emails — until an admin explicitly clicks Reveal on the cohort.
- **Activity logging without content capture**. Pastes are logged by character
  count only; the pasted text is never stored. Same for visibility events —
  we record the gap, not what was viewed.
