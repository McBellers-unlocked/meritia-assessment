# UNIQAssess — Platform Brief (internal reference)

**Date:** 25 August 2026 · reflects `main` @ `04e30ac` · repo `C:\dev\meritia`
**Live:** https://www.uniqassess.org (AWS Amplify, eu-west-1) · formerly **Meritia** (rebranded 2026-04-29; DB/AWS resource names still say `meritia-*`) · branding line "Powered by UNICC"

---

## 1. What UNIQAssess is

UNIQAssess runs **timed, scenario-based written assessments for hiring, built for the AI era**. Each cohort declares Evidence, Copilot or Open Agent Mode. A branded AI-powered Knowledge System follows that server-owned policy: Evidence Mode keeps final authorship with the candidate; Copilot and Open Agent modes permit visibly labelled working material while retaining separate evidence and uncertainty. The platform records contextual *work provenance*—dialogue, evidence actions, paste totals, focus changes and lexical overlap—alongside *what the candidate produced*.

Assessors mark **blind** (anonymous IDs only, names withheld until an explicit, irreversible reveal), against rubrics with embedded issues the scenario planted. Scoring is entirely human; work provenance and defence evidence are contextual, never automatically scored or treated as proof of misconduct.

Three-sided product:

- **Candidates** — a single-use token link, no account. A timed session with an email-styled brief, exhibit documents, a rich-text memo workspace, the AI sandbox, and (scenario-dependent) live interruptions: a persona IM from a "colleague" and/or a scripted email in-tray.
- **Assessors/admins** — Cognito-backed console: scenario builder (incl. JD-to-scenario generation with auto-derived rubrics), cohort/invite management, blind marking screen, results analytics, CSV exports.
- **Prospects** — self-serve DEMO sessions (tokenised trial accounts scoped to scenarios they create), plus a seedable demo cohort for live walkthroughs.

---

## 2. Tech stack

| Layer | Choice | Version (package.json) |
|---|---|---|
| Framework | Next.js (App Router), single monolith | `next` **14.2.35**, React ^18, TypeScript ^5 |
| ORM / DB | Prisma → **PostgreSQL** (Amazon RDS) | `prisma` / `@prisma/client` ^6.19.3 |
| Auth (admin) | NextAuth v4 + **AWS Cognito** (PKCE public client, JWT sessions) | `next-auth` ^4.24.13 |
| AI | **Anthropic Claude API** | `@anthropic-ai/sdk` ^0.82.0 |
| Editor | TipTap (StarterKit + Placeholder) for the candidate memo | `@tiptap/*` ^3.22.3 |
| Markdown | `react-markdown` ^10.1.0 + `remark-gfm` (AI replies, briefs) | |
| Sanitisation | DOMPurify ^3.4.0 (candidate memo HTML on the marking screen) | |
| Doc parsing | `mammoth` (.docx) + `unpdf` (PDF) for JD upload, dynamically imported | |
| AWS SDKs | Secrets Manager, SQS | `@aws-sdk/*` ^3.10xx |
| Styling | Tailwind ^3.4.1 + the **`uq-*` "Calm Light" design system** | |
| Script runner | `tsx` ^4.21.0 (all `scripts/*.ts`, prisma seed) | |

- **Build:** `prisma generate && next build`. Critical framework logic uses Node's built-in test runner through `npm test`, with fixed fixtures and no live model calls; release verification also runs `tsc`, `next lint`, the production build and the README golden paths.
- **Design system:** every `uq.*` Tailwind colour maps to a CSS variable on `:root` in `src/app/globals.css` (light theme, indigo `#4F46E5` accent, elevation-not-borders shadows `shadow-uq-e1/e2/e3`, glass/glow utilities, Geist fonts via `next/font/local`). A dark "Observatory" theme was built and replaced by Calm Light in June 2026.
- **`next.config.mjs`:** explicit `env` passthrough (Cognito, NextAuth, `DATABASE_URL`, `ANTHROPIC_API_KEY`, `RECRUIT_CLAUDE_MODEL`, `RECRUIT_MAX_TOKENS`, `APP_REGION`, `SECRET_ARN`) and `outputFileTracingIncludes` bundling `infra/recruit/**` into the SSR lambdas — exhibits/rubrics are loaded with `readFileSync` at runtime and render empty if this breaks.

---

## 3. Architecture overview

One Next.js app, three route territories:

- **`/assess/[scenarioSlug]`** — candidate side, token-gated (`?token=FAM-XXXX`), no NextAuth. State machine driven by `GET /api/assess/state/[token]`: invited → started → submitted/expired.
- **`(admin)/admin/...`** — assessor console behind NextAuth/Cognito.
- **`/api/...`** — route handlers for both sides plus `/api/demo/activate` for prospect sessions.

**AI call topology** (shaped by Amplify's SSR timeout, ~30 s default; `/api/assess/chat` sets `maxDuration = 60`):

1. **Candidate runtime** — one endpoint, `src/app/api/assess/chat/route.ts`, serves both the Knowledge System (memo_ai tasks) and persona IM (chat tasks). Prompt-cached (`cache_control: ephemeral` on the system block, ~90% input-cost reduction on repeat turns), retried on transient 5xx/529, turn-capped server-side before the API call.
2. **Assessment Builder, interactive steps** — JD parsing and criteria extraction run in SSR routes with **SSE streaming** (`ReadableStream` + keepalives) to stay under the cap (`from-jd/parse`, `from-jd/extract-criteria`; client consumer `src/lib/recruit/sse-client.ts`).
3. **Assessment Builder, heavy generation** — task + rubric generation was moved **off SSR entirely**: the route inserts a `RecruitmentScenarioGenerationJob` row and posts to **SQS**; a separately-packaged **worker Lambda** (`lambda/task-generator/`, vendored SDK) streams two Opus calls (task ~32k max tokens; rubric 16k, fails soft to `rubric: null`); the wizard polls the job row.

Scenario content resolves through `src/lib/recruit/scenario-loader.ts`: an assessment points at either a **code scenario** (registry in `src/lib/recruit/fam-p4-2026.ts`) or a **DB scenario** (`customScenarioId` wins). The loader also derives the AI's in-world brand from the organisation string's parenthesised acronym — e.g. "Halcyon Group (Halcyon)" → "Halcyon Knowledge System" (default fallback: IDSC).

---

## 4. Data model (`prisma/schema.prisma`, PostgreSQL)

| Model | Purpose |
|---|---|
| `User` (+ `Role` enum ADMIN \| DEMO) | Admin/demo accounts only (Cognito-backed). Candidates never live here. |
| `RecruitmentDemoSession` | Tokenised self-serve prospect trial; 1:1 with a DEMO user; expiry/revocation. |
| `RecruitmentScenario` | Admin-authored scenario: unique slug (= `/assess/<slug>`), org, position, status draft/published/archived, saved JD source text. |
| `RecruitmentScenarioTask` | Task of kind **memo_ai \| email_inbox \| chat**; brief markdown, marks; memo_ai carries the AI systemPrompt + exhibit + deliverable labels; **per-task rubric JSON** (auto-generated for from-JD scenarios). |
| `RecruitmentScenarioExhibit` | HTML exhibit document shown to the candidate. |
| `RecruitmentScenarioEmail` | Scripted in-tray email: trigger offset, sender, body, expected action, marker notes. |
| `RecruitmentScenarioChatScript` | Persona IM: trigger offset, persona name/role, opener, systemPrompt, maxTurns (8), expected outcomes. |
| `RecruitmentAssessment` | A cohort: scenario pointer (code slug or custom DB id), total minutes, open/close dates, **`revealedAt`** (blind-marking reveal stamp). |
| `RecruitmentCandidate` | Invitee: name/email (hidden during marking), unique token, per-cohort `anonymousId` ("Candidate A"…), status, server-anchored `startedAt`/`deadline`, single-use session lock (sessionToken/UA/IP-hash), totalScore. |
| `RecruitmentResponse` | One memo per (candidate, task): content, wordCount, soft `sentAt`, marker fields (score, comments, `issuesIdentified[]`, markedAt/by). |
| `RecruitmentInteraction` | Full AI dialogue trail; global `sequenceNum`, actor candidate/ai, `threadKey` metadata separating memo-AI vs persona threads. |
| `RecruitmentActivityEvent` | Integrity trail: paste \| visibility_hidden \| visibility_visible \| email_delivered \| chat_opened, with `{charCount}` / `{hiddenMs}` metadata. **Paste content is never captured, only length.** |
| `RecruitmentEmailResponse` | Candidate's action on a scripted email (replied/ignored/flagged) + latency timestamps. |
| `RecruitmentScenarioGenerationJob` | Background job row for JD→scenario generation (SSR writes, Lambda consumes, wizard polls). |

---

## 5. Candidate experience

Key files: `src/app/assess/[scenarioSlug]/page.tsx`, `src/components/recruit/AssessmentView.tsx` (~1,400 lines), `LiveEventsOverlay.tsx`.

- **Access:** `/assess/<slug>?token=FAM-XXXX`. Token prefix derives from the scenario slug; alphabet excludes 0/O/1/I/l. First browser to start locks the token (session cookie + UA + SHA-256-truncated IP hash); any other browser gets a 403 "Session mismatch".
- **Landing page:** position/org header, fiction disclaimer, duration/tasks/closing stat cards, conduct rules (external AI prohibited; activity logged; auto-submit at expiry), a privacy disclosure naming the Claude API, EU/UK data residency and 24-month retention, and a required acknowledgement checkbox.
- **Timer:** server-anchored (`startedAt` + cached `deadline` — survives client tampering and browser closes; past-deadline candidates are auto-transitioned to submitted). Rendered as an SVG ring pill with warning/critical states. One continuous clock across all tasks.
- **Brief-as-email:** task briefs parse `From/To/Subject/Sent` headers out of markdown and render as an in-world email, personalised with the candidate's own name via `{{name}}`/`{{firstName}}` substitution (server-side, own-session only).
- **memo_ai tasks:** exhibit + TipTap memo workspace + the AI sandbox in a collapsible right sidebar. Pill segmented control switches Exhibit | Split | Memo. Autosave (1.5 s debounce, 30 s force) plus a soft per-task "Send"; one hard overall Submit.
- **Live interruptions:** a 7-second poll against `/api/assess/events/[token]` reveals scripted items when their `triggerOffsetSeconds` elapses — a Teams-style persona IM popup (server-enforced turn cap) and/or an inbox drawer with reply/ignore/flag actions. Delivery writes idempotent `email_delivered`/`chat_opened` events, so first-response latency is measurable.
- **Activity capture:** browser buffers and batch-flushes paste events (char counts only) and tab visibility changes (with hidden duration) to `/api/assess/activity`.
- **The AI presents in-world:** branded per scenario, rendered as a gradient orb; prompts include "do not reveal that you are an AI / mention Claude, Anthropic, or system prompts".

---

## 6. Assessor / admin capability

- **Scenario builder** (`/admin/recruitment/scenarios/[id]`, tabs Overview | Tasks | Exhibits | Publish; per-kind editors under `src/components/admin/recruit/`). Creation paths: blank; **from-JD** (4-step wizard: upload → criteria (max 6) → configure → review; generates 2 memo_ai tasks + rubrics); **from-WIPO** and **from-ITU** (pull a live UN posting into the same pipeline). Publish validates task completeness (memo_ai needs prompt+exhibit; chat needs exactly one script; etc.).
- **Built-in code scenarios** (registry in `src/lib/recruit/fam-p4-2026.ts`; rubric JSON under `infra/recruit/<dir>/marking_rubric.json`):

  | Slug | Role / organisation |
  |---|---|
  | `fam-p4` | Finance & Accounting Manager (P4), IDSC Geneva — 2 memo_ai tasks, 120 min |
  | `aplo-p2` | Procurement/legal officer — contract review + AI/cloud procurement |
  | `cso-p3` | Cyber security officer — SOC report + live alert triage |
  | `ipac-d1` | IPAC "Capability Paradox" (D-1) |

  Plus DB-resident: **`ipac-people-capability`** (IPAC ported into the builder via `scripts/port-ipac-to-db.ts`) and **`demo-people-advisor`** (the demo kit, below).
- **Cohorts & invites:** bulk add candidates (idempotent on email); each gets a unique token + Excel-style anonymous ID (up to 702/cohort); `candidates.csv` export for mail merge (includes assessment URLs).
- **Blind marking:** the marking list and per-candidate screen return anonymous IDs only. Per candidate/task the marker sees the memo, written defence, neutral work-provenance summary/timeline, structured Knowledge System interaction and human marking rubric. Provenance is not auto-scored.
- **Results dashboard:** ranking (top-5 highlighted post-reveal), score histogram, embedded-issue identification rates, descriptive completion/time/defence/technical diagnostics and `results.csv` export. No dialogue-volume correlation is presented as a candidate-quality claim.
- **Reveal:** explicit, confirmed, irreversible `revealedAt` stamp; until then every API/CSV path returns null/empty identity.
- **Demo kit:** `scripts/seed-demo-cohort.ts` (+ `scripts/demo-cohort/{scenario,candidates,verify}.ts`) creates fictional Halcyon Evidence, Copilot and Open Agent variants with current demonstration preflight/blueprint/review data. The Evidence cohort has 7 submitted candidates spanning rich-to-minimal Knowledge System dialogue, minimal-to-high paste activity and no-to-substantial time away, plus evidence actions and completed defences, and 3 spare live-walkthrough tokens. These are contextual demonstration records, not misconduct labels or psychometric evidence.

---

## 7. Work-provenance model

Signals captured and where they surface:

| Signal | Source | Surfaced |
|---|---|---|
| Pastes (count + chars; content never stored) | browser paste events | Marking list + results ranking columns, marking-screen tiles, event log, `results.csv` |
| Tab-aways + total off-tab time | visibilitychange events | same |
| **Literal text reuse** — memo sentences lexically matching AI output the candidate saw | `src/lib/recruit/textReuse.ts`: max of Dice (word sets) and Jaccard (4-char shingles), threshold 0.8, ≥5-word sentences | contextual summary + sentence comparison; not an authorship/originality detector |
| Dialogue richness (message/question counts, per-actor) | interaction trail | list/results "Messages/Msgs" columns, trail header |
| IM engagement (opened? responded? latency) | chat_opened events + trail | chat transcript section |
| Single-use session lock violations | session token/UA/IP-hash mismatch | 403 at the door |

Design stance: provenance is **neutral context, never auto-scored**. Paste and focus totals do not receive suspicion colours or threshold classifications. Blind marking keeps identity out of the judgement loop; the full AI transcript and evidence actions are retained as assessment evidence and candidates are told so. Internal legacy filenames such as `integrity.ts` and `IntegrityCells.tsx` remain temporarily for import compatibility, but their user-facing terminology and presentation are neutral.

---

## 8. AI integration map

Pinned centrally in **`src/lib/recruit/model-config.ts`** (duplicated by design in `lambda/task-generator/model-config.mjs` — keep in sync):

- `BUILDER_MODEL = "claude-opus-4-8"` — all Assessment Builder calls (off the candidate path, quality-first)
- `RUNTIME_MODEL = env RECRUIT_CLAUDE_MODEL || "claude-sonnet-4-6"` — candidate-facing calls; `RUNTIME_MAX_TOKENS` default 1500
- API key: `ANTHROPIC_API_KEY` env, falling back to Secrets Manager (`SECRET_ARN` + `APP_REGION`) via `src/lib/secrets.ts`

| Call site | Model | Notes |
|---|---|---|
| `api/assess/chat` — Knowledge System (memo_ai) | runtime | per-task scenario systemPrompt; prompt-cached; no turn cap |
| `api/assess/chat` — persona IM (chat) | runtime | admin persona prompt wrapped with scenario context + "don't reveal you're an AI" tail; maxTurns enforced pre-call |
| `from-jd/parse` — job-title extraction | builder | after mammoth/unpdf text extraction |
| `from-jd/extract-criteria` | builder | tool-forced criteria report, **SSE-streamed** |
| Lambda `task-generator` — task generation | builder | brief+exhibit+deliverable in one ~32k-token tool call |
| Lambda `task-generator` — rubric generation | builder | 16k tokens; **fails soft** to `rubric: null` |

- **No AI in marking** — text-reuse is deterministic lexical analysis; scoring is human.
- **Prompt catalogue:** `docs/API_PROMPT_CATALOGUE.md` (+ HTML/PDF renders) documents all 13 prompts/tools verbatim with file:line, model, and token budgets (snapshot at commit `f8107f2`; regenerate with `scripts/build_api_prompt_catalogue.py`).

---

## 9. Auth & access model

- **Admins:** NextAuth v4 with a single **Cognito** provider (PKCE, public client, JWT sessions). Every successful Cognito sign-in is upserted as `ADMIN` — access control is *the user pool itself* (invite-only by operational policy). Pool: `meritia-users` / `eu-west-1_ljeZoMw83`.
- **Route guards** (`src/lib/admin-auth.ts`): `requireAdmin()` (full admin only) vs `requireScenarioBuilder()` (ADMIN or DEMO), always paired with per-resource ownership checks (`assertScenarioAccess` / `assertAssessmentAccess` — DEMO users must own the row) and Prisma scope helpers for list queries.
- **DEMO role:** prospect trials via `RecruitmentDemoSession` tokens (`/api/demo/activate`); scoped to self-created scenarios; no access to candidates/results.
- **Candidates:** no accounts — token + `recruit_session` cookie, single-use lock, server-side status/deadline re-verification on every API call. Raw IPs never stored (hashed, truncated).
- **Blind-marking hygiene:** pre-reveal, marking/results APIs and CSVs structurally omit or null identity fields. The one deliberate exception: a candidate's own name is substituted into their own brief in their own session.

---

## 10. Infrastructure & operations

- **Hosting:** AWS Amplify Hosting (SSR), app **`d1wxabrgr6nkub`**, region **eu-west-1**, auto-builds on push to `main` (no `amplify.yml` — auto-generated build spec, intentional). Domain `www.uniqassess.org` via Route 53 (apex → www 301); Amplify default domain `main.d1wxabrgr6nkub.amplifyapp.com`.
- **Database:** PostgreSQL on RDS — `meritia-db.c9meyguoao54.eu-west-1.rds.amazonaws.com:5432`, Prisma connects directly.
- **Async generation:** SQS queue `meritia-task-generation-queue` (account `891612540396`) + the `task-generator` Lambda.
- **Env source of truth:** the **Amplify app environment** (not Secrets Manager) holds the live `DATABASE_URL` etc. Local `.env.local` goes stale after credential rotations, and the Prisma CLI ignores `.env.local` — scripts load it explicitly via `dotenv`. Recovery one-liner lives in `scripts/seed-demo-cohort.ts`'s error message.
- **Build gate worth knowing:** `tsconfig.json` includes `**/*.ts`, so **`scripts/` is typechecked by `next build`** — a type error in a utility script breaks the production deploy (bitten twice: PR #39, and the demo-seed scripts fixed pre-merge in PR #40). `tsx` does not typecheck; run `npx tsc --noEmit` before pushing scripts.
- **SSR constraints:** Amplify per-request cap shapes all AI patterns — `maxDuration = 60` on the chat route, SSE for interactive builder steps, SQS+Lambda for heavy generation; Anthropic calls in API routes default to no extended thinking.
- **Open ops items** (internal): prod RDS security group still allows `0.0.0.0/0:5432` — password rotated 2026-06-16 as an interim measure; VPC/SG remediation pending. README TODOs: dedicated Cognito pool, fresh `NEXTAUTH_SECRET`, real brand assets. `docs/DEPLOYMENT_STATE.md` carries 🟡 markers whose live state isn't verifiable from the repo.
- **Known-brittle bits** (per README): `readFileSync`/cwd exhibit loading (guarded by `outputFileTracingIncludes`), the prompt-cache marker (don't remove without measuring), MVP scenario-builder UI polish.

---

## 11. Repo map & references

```
src/app/assess/…                  candidate side (token-gated)
src/app/(admin)/admin/…           assessor console
src/app/api/assess|admin|demo/…   route handlers
src/components/recruit/…          AssessmentView, LiveEventsOverlay, IntegrityCells
src/components/admin/recruit/…    builder tab + task editors
src/lib/recruit/…                 scenario-loader, model-config, rubric, textReuse,
                                  integrity, tokens, criteria-extractor, sse-client,
                                  sqs-client, wipo-jobs, itu-jobs, fam-p4-2026 (registry)
src/lib/{auth,admin-auth,secrets,prisma,constants}.ts
prisma/schema.prisma              data model
lambda/task-generator/            SQS worker (vendored SDK, own model-config copy)
infra/recruit/<scenario>/         exhibit HTML + marking_rubric.json per scenario
scripts/                          seed-demo-cohort, demo-cohort/, port-ipac-to-db,
                                  mint-demo-session, catalogue builders, checks
IPAC/                             IPAC scenario source material
docs/                             AWS_SETUP, DEPLOYMENT_STATE, MIGRATION_PLAN,
                                  MARKET_READINESS, API_PROMPT_CATALOGUE, this brief
```

- **README.md** covers first-run setup, the golden-path manual test (admin creates → candidate completes → admin marks → builder smoke → single-use enforcement), deployment, TODOs. There is no CLAUDE.md.
- **Provenance:** carved out of the Callater / `sdi-assessment-platform` repo (sister repo at `C:/dev/sdi-assessment-platform`).

---

## 12. AI-era framework v1 implementation

### Declared modes and cohort snapshots

`RecruitmentScenario` owns the editable mode and defence settings;
`RecruitmentAssessment` stores the immutable snapshot used by candidate and
marker APIs. Historical rows default to Evidence Mode with defence disabled.
Mode badges and exact candidate disclosures appear in builder, cohort,
candidate, marking and results surfaces, and mode is included in results CSV.
Open Agent candidates submit a descriptive, self-declared tool-use record; the
platform does not claim it can identify every external tool.

### Evidence-native Knowledge System

Memo-task model calls are forced through the `return_evidence_response` tool.
The persisted response records schema, model, prompt-policy and content
versions. It separates analysis, evidence cards, uncertainty, questions and an
optional labelled working draft; Evidence Mode strips the draft server-side.
Stable exhibit source IDs and excerpts are checked against the actual supplied
text. `verified` means source ID and excerpt matched, not that a claim or
interpretation is correct. Unmatched references are retained and visibly
labelled `unverified`; professional inference cannot masquerade as a citation.
Candidate evidence records are session-owned and linked back to the originating
AI interaction.

### Validation Lab and assessment science

Database scenarios persist stable criteria plus criterion → task → expected
candidate evidence → rubric-element mappings. Starting a preflight computes a
canonical SHA-256 content hash, saves deterministic completeness/traceability
checks (including scored rubric-to-criterion links and embedded-issue evidence
rationale), and retains the exact immutable snapshot analysed by the worker.
It then enqueues `{ jobType: "scenario-validation-v1", validationRunId }` on
the existing SQS queue. The worker claims only a queued run, performs one
high-effort streamed call for qualitative findings, synthetic design profiles
and mode-policy tests, then persists versioned results. A different current
hash makes the run and its approvals stale.

Publication requires a current completed preflight, no open blocker findings,
and subject-matter, assessment-design and accessibility review records. Any
override is attributed and reasoned; DEMO overrides are labelled as
demonstration use and never represented as formal approval. Synthetic
Developing/Competent/Strong responses are test artefacts, not applicants and
not psychometric evidence. Cohort analytics are explicitly descriptive and
make no causal or automated selection claim.

### Work provenance and reasoning defence

The marker sees a neutral chronological record: assessment/task events,
Knowledge System dialogue, evidence-board actions, paste counts and character
totals, focus changes/time away, memo lock, defence and final submission. Paste
content remains uncaptured. The retained overlap routine measures literal
lexical text reuse only; it is not an AI detector or originality measure.

Where enabled, submission locks the main work and creates exactly two persisted
defence questions once. Generation has a 12-second limit and deterministic
fallback questions, so a model failure cannot strand a timed candidate. The
defence clock starts after questions exist, answers autosave, expiry submits,
and the marker reviews the response without automated scoring.

Markers may record human criterion-level component scores where a database
scenario has stable blueprint mappings. The cohort results aggregate those
entries as descriptive pilot distributions only; missing entries remain visibly
missing and are never filled or inferred by AI.

> Work-provenance information is contextual evidence. It must not be treated
> as proof of misconduct or used as an undisclosed scoring criterion.

### Migration, operations and demonstration

- Apply `prisma/migrations/20260825120000_ai_era_assessment_framework_v1` with `npx prisma migrate deploy` before deploying the app or worker.
- No new environment variable is required. The validation job reuses `SQS_TASK_QUEUE_URL`/the established queue, `DATABASE_URL`, `ANTHROPIC_API_KEY` and central model configuration.
- Deploy `lambda/task-generator` with its new validation prompt and handler before admins run Validation Lab.
- `npx tsx scripts/seed-demo-cohort.ts` idempotently creates all three fictional Halcyon mode variants, current demonstration preflight/review data and the marked Evidence cohort with varied provenance, evidence actions and completed defences. The script verifies the new relationships; `--teardown` removes only those demo rows.
