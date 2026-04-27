# Meritia — market readiness report

_Snapshot as of 2026-04-27. Update when a surface changes materially._

This report is the briefing you read before a prospect call. It is honest about what's ready, what is MVP, and what is missing. File:line citations point at the code so future you (or a colleague briefing themselves) can verify any claim.

---

## 1. Verdict

**Demo-ready for controlled walkthroughs today. One operational task (DNS) gates the cleanest URL for self-serve trials.** No critical bugs, no broken flows. Three production-quality role scenarios ship in code (Finance and Accounting Manager P4, Associate Policy Officer Legal P2, Cybersecurity Operations Officer P3). Live at `https://main.d1wxabrgr6nkub.amplifyapp.com` on AWS Amplify; `https://meritia.org` is attached but pending registrar DNS records.

| Surface | Controlled walkthrough | Self-serve trial |
|---|---|---|
| Marketing landing (`/`) | 🟢 Ready | 🟢 Ready |
| Login (`/login`) | 🟢 Ready | 🟢 Ready |
| Admin cohort flow (`/admin/recruitment/*`) | 🟢 Ready | 🟢 Ready |
| Candidate flow (`/assess/[slug]?token=…`) | 🟢 Ready | 🟢 Ready |
| Marker flow (`/admin/recruitment/[id]/mark`) | 🟢 Ready | 🟢 Ready |
| Scenario builder (`/admin/recruitment/scenarios/[id]`) | 🟡 MVP — hide unless asked | 🔴 Don't expose |
| OG / social cards | 🟢 Ready | 🟢 Ready |
| Custom domain `meritia.org` | 🔴 Pending DNS | 🔴 Pending DNS |
| Brand assets (favicon, OG, apple-icon) | 🟢 Ready | 🟢 Ready |

---

## 2. What's demo-ready

### 2.1 Three built-in scenarios

All three are code-defined, version-controlled, and load substantive HTML exhibits + JSON marking rubrics from `infra/recruit/`. Each scenario uses the same `RecruitScenarioConfig` shape (`src/lib/recruit/types.ts:85`), enforces a 120-minute shared time budget across two memo-AI tasks, and defines a deliberately-scoped AI persona (data lookup only — no professional judgement).

| Scenario | File | Role + level | What it tests |
|---|---|---|---|
| `fam-p4-2026` | `src/lib/recruit/fam-p4-2026.ts` | Finance and Accounting Manager (P4) | IPSAS compliance review + politically-charged cost-allocation analysis ahead of a management committee. |
| `aplo-p2-2026` | `src/lib/recruit/aplo-p2-2026.ts` | Associate Policy Officer Legal (P2) | Commercial contract review + AI-cloud procurement risk under thin headcount. |
| `cso-p3-2026` | `src/lib/recruit/cso-p3-2026.ts` | Cybersecurity Operations Officer (P3) | Critique of a misleading monthly SOC report + overnight alert-cluster triage with a deliberately miscalibrated AI copilot. |

The CSO scenario was ported from `sdi-assessment-platform` (Callater) on 2026-04-27. Registry and admin dropdown updated (`src/lib/recruit/fam-p4-2026.ts:404` and `src/app/(admin)/admin/recruitment/page.tsx:33`).

**Demo hook for prospect calls:** the AI persona in each scenario is deliberately constrained to data work, not advisory output. That is the design point — you are testing what the candidate _directs_ the AI to do, and where they push back when it gets things wrong (CSO Task 2 is the clearest example of this — the Triage Assistant is intentionally wrong about the real signal in the cluster; the rubric rewards candidates who notice and correct it).

### 2.2 Admin cohort flow (`/admin/recruitment/*`)

Nine pages, ~20 API endpoints, all wrapped in a `requireAdmin()` guard. Walkthrough order in a demo:

1. `GET /admin/recruitment` — list of cohorts + create form. Pick a built-in scenario, set open/close dates, set duration (default 90 min). Cohort title now auto-fills from the scenario name when you change the dropdown (`src/app/(admin)/admin/recruitment/page.tsx:81`).
2. `GET /admin/recruitment/[id]` — cohort overview + sub-route navigation.
3. `GET /admin/recruitment/[id]/candidates` — paste-add candidates by name + email, copy single-use URLs.
4. `GET /admin/recruitment/[id]/mark` — list of submissions with marker view drilling into each.
5. `GET /admin/recruitment/[id]/mark/[candidateId]` — anonymised marker view: memo + AI interaction trail side-by-side.
6. `GET /admin/recruitment/[id]/results` — ranked anonymised results; reveal button lifts anonymisation across the cohort.

All flows work end-to-end on the live deployment. No known blockers.

### 2.3 Candidate flow (`/assess/[slug]?token=…`)

The candidate-facing surface is the highest-stakes part of any prospect demo, because a self-serve prospect is most likely to click through it themselves. It is professional-grade:

- **Landing** (`src/app/assess/[scenarioSlug]/page.tsx:99`): role + organisation + duration + close date; explicit privacy disclosure (`details/summary` block at line 185); acknowledgement checkbox.
- **Assessment UI** (`src/components/recruit/AssessmentView.tsx`): per-task split view with exhibit + memo editor (TipTap) + AI chat sidebar; word count; autosave (debounced 1.5 s, force every 30 s); server-enforced timer (clock runs against `candidate.startedAt` in the DB, can't be paused by closing the tab); single-use token enforcement (first browser to call `/api/assess/start` locks the session).
- **Submit**: read-only "thank you" page with anonymised candidate ID + submission timestamp.

### 2.4 Live deployment

Per `docs/DEPLOYMENT_STATE.md`:

- AWS Amplify SSR (`d1wxabrgr6nkub`) on `eu-west-1`, branch `main`, auto-build on push.
- Cognito user pool `meritia-users` (`eu-west-1_ljeZoMw83`); single admin (`mattvalente85@gmail.com`).
- RDS PostgreSQL 16 `meritia-db` (free-tier `db.t3.micro`, 7-day backups, public access enabled for pilot).
- Secrets in Amplify env vars; Anthropic key fallback to AWS Secrets Manager via `SECRET_ARN`.
- Custom rules already configured for `meritia.net → meritia.org` 301 redirects.

### 2.5 Marketing landing + brand surface (new in this pass)

- `src/app/page.tsx` — hero, three "what it measures" cards, three scenario showcase cards (FAM/APLO/CSO), three "how it works" steps, pilot CTA, footer. Single component, no new deps.
- `src/app/icon.svg` (favicon), `src/app/apple-icon.tsx` (180×180 iOS), `src/app/opengraph-image.tsx` (1200×630), `src/app/twitter-image.tsx`. All Next.js 14 file conventions; no static binaries to maintain.
- `src/app/layout.tsx:18` — extended `metadata` with `metadataBase`, `openGraph`, and `twitter` blocks. `robots: { index: false, follow: false }` is preserved (correct for pilot).

---

## 3. What's MVP — show with care

### 3.1 Scenario builder (`/admin/recruitment/scenarios/[id]`)

`README.md:166` flags this as MVP: drag/drop, validation, and error states are partial. The builder works for simple memo-AI scenarios but is not designed to wow a prospect. **Recommendation: do not demo the builder; demo a pre-built scenario instead.** If a prospect specifically asks "can we make our own?", say "yes — we currently author scenarios with you for the first cohort, and a self-serve builder is on the roadmap." (This is true and accurate.)

### 3.2 Admin user management

There is no admin-users page. New admins are auto-provisioned on first Cognito sign-in into the `admin` group. For pilot scope (1–3 internal admins per customer) this is fine; if a prospect insists on multi-admin self-serve, flag it as a 1-week build.

---

## 4. What's missing

These are gaps to call out _before_ a prospect asks, not weaknesses to hide:

- **Automated test suite.** No Playwright/Jest/Vitest. Manual golden-path smoke is documented at `README.md:85`. Run the smoke before each prospect cohort. Adding e2e is a 1–2 week investment; defensible to defer until 5+ active customers.
- **Mobile UX.** Tailwind responsive utilities are in place but no formal mobile QA. Candidate flow may not be optimal on phones; demo on a laptop. Acceptable because real candidates do high-stakes assessments on a laptop, not a phone.
- **Logger / request-id middleware.** Currently `console.log` only. Adequate for pilot volumes; needs structured logs (or CloudWatch + correlation IDs) before scaling past ~5 concurrent cohorts.
- **DB in private subnet + proxy.** RDS is public with security-group restrictions (pilot stance). A security-conscious enterprise prospect will ask. Defensible answer: "we deploy single-tenant into your AWS for production; that environment uses a private subnet + IAM-auth proxy." Re-introducing the Lambda-proxy transport from Callater's `src/lib/prisma.ts` history is the documented recovery path (`README.md:138`).

---

## 5. Surfaces by audience

| Surface | Live walkthrough | Self-serve URL | Notes |
|---|---|---|---|
| Marketing landing | 🟢 | 🟢 | Pitch + scenarios + how-it-works on one page. |
| Login | 🟢 | 🟢 | Cognito hosted UI; clean. |
| Cohort create | 🟢 | 🟢 | Default title now follows scenario; CSO available in dropdown. |
| Add candidates | 🟢 | 🟡 | Functional but minimally styled. Won't impress a designer; no prospect cares. |
| Candidate landing | 🟢 | 🟢 | Strong privacy disclosure; legally explicit. |
| Candidate assessment UI | 🟢 | 🟢 | Highest-stakes screen; polished. |
| Marker view | 🟢 | 🟢 | Side-by-side memo + AI trail is the differentiator. |
| Results / ranking | 🟢 | 🟢 | Anonymised; reveal on click. |
| Scenario builder | 🟡 | 🔴 | Pre-built scenarios only for prospect demos. |
| Admin users | 🟡 | 🔴 | No UI; you provision. Don't draw attention to it. |

---

## 6. Pre-demo checklist

Run this before any prospect engagement (~15 min including DNS check).

1. **Verify the live URL** — `https://main.d1wxabrgr6nkub.amplifyapp.com/` loads landing page; `/login` reaches Cognito; signed-in admin lands on `/admin/recruitment`.
2. **Run the README golden-path test** (`README.md:85–127`) end-to-end on at least one scenario — preferably the one most relevant to the prospect's vertical:
   - **Finance / accounting prospects** → demo FAM-P4
   - **Public-sector / legal prospects** → demo APLO-P2
   - **Tech / cybersecurity prospects** → demo CSO-P3
3. **Confirm the AI works** — start a candidate session, ask the in-scenario AI a specific question (e.g. for CSO Task 1: "what was the Tier 3 escalation count this month and what was last month's?"), verify a Claude response arrives. If the response 504s, the Amplify SSR Lambda timeout has dropped below the 60s `maxDuration` set in `src/app/api/assess/chat/route.ts`.
4. **Confirm exhibits render** — the candidate landing should show the SOC report (CSO Task 1), draft accounts (FAM Task 1), or contracts (APLO Task 1) in a styled HTML block. If empty, the serverless bundle is missing `infra/recruit/` (see `next.config.mjs:23` for the `outputFileTracingIncludes` config).
5. **Preview the OG card** — drop the live URL into <https://www.opengraph.xyz/> or LinkedIn's Post Inspector before sharing the URL anywhere prospects might see a preview.
6. **(Once DNS is live)** Confirm `https://meritia.org/` returns 200 and `https://meritia.net/` returns 301 to `meritia.org`.

---

## 7. Pricing / positioning hooks for prospect calls

Surface-level traits that matter in commercial conversations. None are promises; each is something the codebase already does that you can defend with a citation.

- **Single-tenant deployment model.** Meritia runs as an Amplify SSR app + RDS + Cognito. Same shape can be deployed into a customer's AWS account for production. No multi-tenant database; no cross-customer data path.
- **Anonymised marking with explicit reveal.** Markers see "Candidate A, AD…" until an admin clicks Reveal on the cohort (`src/lib/recruit/scenario-loader.ts`, marker view at `/admin/recruitment/[id]/mark`). Names and emails are stored separately from submission content.
- **Activity logging without content capture.** Pastes are logged by character count; the pasted content is never stored. Visibility events log the gap, not what was viewed.
- **Single-use candidate tokens + server-enforced timer.** First browser to call `/api/assess/start` locks the session via cookie + session secret; the timer runs against `candidate.startedAt` in the DB so refresh / second device doesn't help.
- **AI cost shape under control.** Anthropic calls in `src/app/api/assess/chat/route.ts` use `cache_control: ephemeral` prompt caching, cutting ~90% of repeat-prompt cost within a 5-minute window. Material for a CFO/procurement question on AI run-rate.
- **Naive-by-design AI personas.** The in-scenario AI does data lookup and standards reference — not advisory output. This is the IP. Each scenario's system prompt enforces it explicitly (e.g. `src/lib/recruit/fam-p4-2026.ts:33–73` for the boundary specification). It is what makes Meritia an _AI-aware_ assessment instead of a writing test.

---

## 8. Open follow-ups by priority

### Next 2 weeks (before scaled prospect outreach)

1. **Add DNS records for `meritia.org` and `meritia.net`** at the registrar. Records are in `docs/DEPLOYMENT_STATE.md:64–77`. Until done, prospect URLs read `…amplifyapp.com`, which signals "early".
2. **After DNS is live**: update Amplify env var `NEXTAUTH_URL` to `https://meritia.org`, redeploy, smoke test (`docs/DEPLOYMENT_STATE.md:96–106`).
3. **Run the production CSO smoke test.** The risk flagged at `README.md:164` — `process.cwd() + readFileSync` for exhibit loading — is paper-checked but not yet proven for the new `idsc-cso-p3-2026/` directory. Run `B`/`C` from the README golden path against a CSO cohort on the live deployment.
4. **Privacy / contact pages.** Footer currently links to a `mailto:`. If a prospect lawyer asks for a privacy policy URL, you'll want a `/privacy` page (and an `/about` would help).

### Next quarter (before scaling past pilot phase)

1. **Playwright e2e tests** for the five golden-path scenarios. Highest-value tests are: candidate landing → start → submit, admin → mark → reveal, scenario registry resolution.
2. **Admin-users page** (`/admin/users`) — invite, deactivate, list. Cognito hosted UI handles the auth side; Meritia just needs the directory page.
3. **Migrate RDS to private subnet + DB proxy** (or deploy that shape into the first customer's AWS as the production reference architecture).
4. **Structured logging + request IDs.** Pino or similar; CloudWatch ingestion already wired by Amplify.
5. **Prune `crimson` and `teal` Tailwind palettes** (`tailwind.config.ts:31`) once confirmed unused. Cosmetic but reduces noise.
6. **Polish the scenario builder** to a state where a customer's L&D/HR person can self-serve scenarios for their own roles. This is when Meritia stops being "you build scenarios with us" and becomes a true platform.

---

## 9. Repo and infrastructure references

- Live URL: <https://main.d1wxabrgr6nkub.amplifyapp.com>
- Future canonical URL: <https://meritia.org> (DNS pending)
- GitHub: <https://github.com/McBellers-unlocked/meritia-assessment>
- AWS account: `891612540396`, region `eu-west-1`
- Source repo (Callater): `C:/dev/sdi-assessment-platform/` (ancestor; CSO scenario originated here)
- Migration log: `docs/MIGRATION_PLAN.md`
- Live infra detail: `docs/DEPLOYMENT_STATE.md`
- Runbook + golden-path test: `README.md:85`
