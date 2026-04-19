# Meritia Growth Plan — "AI-Fluency Assessment" Direction

*Internal strategy note. Status: working draft for discussion, not a committed roadmap.*

## Why this direction is the sharpest bet

Every knowledge-work employer in 2026 has the same hiring problem: they can no longer tell from a CV or a take-home who is actually *effective with AI* vs. who is either AI-illiterate or over-reliant. Traditional assessments either ban AI (unrealistic) or ignore it (uninformative). Meritia already has every primitive needed to measure AI-augmented work in a controlled sandbox:

- A Claude-backed research sidekick wired into memo tasks (`src/app/api/assess/chat/route.ts`)
- An email inbox with scripted deliveries and captured replies (`src/app/api/assess/emails/reply/route.ts`)
- A Claude-backed persona chat that can plausibly play a colleague on a Teams-style thread (`RecruitmentScenarioChatScript` in `prisma/schema.prisma:257-274`)
- Full transcripts of every AI turn with token counts and cache metadata (`RecruitmentInteraction`, `prisma/schema.prisma:117-131`)
- Privacy-conscious telemetry for paste, tab-visibility, email delivery and chat-open events (`RecruitmentActivityEvent`, `prisma/schema.prisma:136-147`)
- A scenario builder that lets non-engineers author personas, emails, and exhibits (`src/app/(admin)/admin/recruitment/scenarios/[id]/page.tsx`)

The strategic repositioning is: **Meritia is the benchmark for AI-fluent hiring.** Same core product, sharper category.

## Target customer / ICP

**Primary ICP — "AI-transitioning enterprises":** mid-market and enterprise firms (500–10,000 staff) in finance, professional services, consulting, legal, and corporate functions, that are (a) already paying for Copilot / ChatGPT Enterprise / Claude for Work, and (b) struggling to hire mid-to-senior ICs who can actually leverage it.

- **Economic buyer**: CHRO / VP Talent / Head of Early Careers. In consulting and finance, often the L&D or capability leader who *also* owns AI upskilling — Meritia fits their budget because it doubles as a benchmark for internal programmes.
- **Champion**: in-house recruiter or talent-assessment lead. Pain point: current psychometric + case interviews don't reveal AI working style.
- **Pre-condition signal**: firm has an AI tooling subscription and a published AI-usage policy. Without one, assessing AI use is moot.

**Secondary ICPs worth optioning later:**
1. **Business schools & certifying bodies** — MBAs, ACCA, CFA-adjacent bodies piloting "AI-native professional" credentials.
2. **Executive search firms** — adding Meritia output to shortlist packs.
3. **Internal mobility / promotion panels** — same tool, different workflow, existing customers.

## Product features to build (mapped to current code)

The codebase is ~70% of what this repositioning needs. The missing 30%:

### 1. AI-use rubric alongside output rubric (high priority)

Today `RecruitmentResponse` has a single `score` field plus `issuesIdentified` JSON (`prisma/schema.prisma:97-115`). Extend rubric schema (`src/lib/recruit/rubric.ts:41-51`) so each task has both an **output rubric** and a parallel **AI-use rubric** covering e.g.: prompt quality, verification of AI claims, appropriate delegation, override of bad AI suggestions, citation discipline. Store as additional categories in the existing rubric JSON — no schema migration needed, just a convention.

### 2. AI-use analytics panel in the marker view

`src/app/api/admin/recruitment/[id]/mark/[candidateId]/route.ts:47-52` already loads `interactions` and `activityEvents`. Add a derived view:

- Query count, total tokens, avg prompt length
- Time-to-first-prompt per task (latency from task start)
- Ratio of AI-generated text pasted into memo vs. edited (combine `paste.charCount` telemetry with final memo diff)
- Prompt-refinement patterns (same thread, successive prompts shortening/lengthening)

None of this requires new data collection — it's aggregation over existing rows in `RecruitmentInteraction` and `RecruitmentActivityEvent`.

### 3. Verification / "grounding" checks in persona chat

Today the persona chat (`buildPersonaSystemPrompt` in `src/app/api/assess/chat/route.ts:22-33`) is freeform within a turn limit. Add optional **planted inaccuracies** — the persona says something subtly wrong and scoring rewards candidates who push back or verify. Requires one field on `RecruitmentScenarioChatScript` (`plantedClaims: Json`) and a rubric hook.

### 4. AI email drafting as a first-class task

Today email task is reply-only (`src/app/api/assess/emails/reply/route.ts`). Add an "AI-draft-assist" mode where the candidate can request a draft from Claude, edit it, and send — capturing both the original draft and their edits. Schema: reuse `RecruitmentInteraction` with a new `threadKey` convention; store final sent text in `RecruitmentEmailResponse.replyBody`. Diff between AI draft and sent text becomes a scored dimension.

### 5. Benchmark reports (the commercial wedge)

The marker UI exports CSV today. Add a **cohort benchmark PDF/HTML report** per cohort and per candidate that shows AI-use percentile bands across all Meritia candidates in the same role family. This is the artefact recruiters forward to hiring managers and the reason they upgrade tiers.

### 6. Scenario pack: "AI-fluency battery for role X"

Use the scenario builder as-is to ship opinionated, prebuilt packs (Finance Analyst, Strategy Consultant, Product Manager, Legal Associate). Each pack = persona scripts + email sequences + rubric preset. This is inventory, not engineering.

## Monetization & pricing

**Model: SaaS platform fee + per-assessment consumption + premium scenario packs.**

Suggested structure:

| Tier | Who | Annual platform fee | Per-assessment | Premium packs |
|---|---|---|---|---|
| **Starter** | <250-person firms, ad-hoc hiring | £6k / year | £45 / candidate | £2k / pack / year |
| **Growth** | 250–2,000 staff, regular cohorts | £24k / year | £30 / candidate | 2 packs included |
| **Enterprise** | 2,000+, graduate programmes | £80k+ / year | £15 / candidate | Unlimited + custom pack authoring by Meritia |

Reasoning:

- Platform fee anchors stickiness and covers Claude costs (prompt caching already gives ~90% savings on repeated system prompts, per `src/app/api/assess/chat/route.ts:156-167` — margin is real).
- Per-assessment pricing is defensible because each candidate incurs actual Claude token cost plus human marker time.
- Premium packs monetise the content moat — once Meritia has curated batteries for 20 roles, switching cost to a generic competitor is high.
- Realistic mid-market ACV: £25k–£60k. Enterprise ACV: £100k–£250k with custom packs.

**Expansion levers:** internal mobility / promotion use case (same product, different buyer), AI-upskilling diagnostic for existing staff (huge TAM adjacent to the L&D budget), APIs for ATS integration (Greenhouse, Workday, Ashby).

## Competitive landscape

**Direct competitors in AI-aware assessment:**

- **HackerRank / CodeSignal** — strong in engineering; their "AI coding" assessments now allow Copilot, but they score output, not AI-use quality. Weak in non-engineering roles.
- **Bryq, Maki, HiPeople** — psychometric + skill assessment platforms adding GenAI modules; broad but shallow, no workplace-simulation depth.
- **Suited (finance), Vervoe (general)** — simulation-based but AI-naive; candidates still work unaided.

**Indirect competitors:**

- In-house take-homes (high variance, high cheating risk — Meritia's fixed sandbox is the answer).
- Case interviews (don't scale; don't test AI use).
- AI-detection tools (Turnitin et al.) — opposite philosophy: they penalise AI use; Meritia rewards *good* AI use. Different product, different buyer.

**Meritia's defensible differentiation:**

1. **Native AI sandbox, not a bolt-on.** Claude is wired into the candidate UX; competitors retrofit generic "AI allowed" toggles.
2. **Judgment-heavy role focus.** The memo/email/chat triple maps to how finance, consulting, legal, and exec-track PM roles actually work — not how engineers work.
3. **Audit-trail + blind-marking story.** Anonymous candidate IDs (`Candidate A`, `Candidate AD`), full interaction transcripts, and activity logs together form a DEI- and compliance-credible artefact. Few competitors have both.
4. **Content moat via scenario packs.** Role-specific batteries authored by domain experts compound over time.

**Main risk:** a big incumbent (HackerRank, Workday, LinkedIn) bolts on a similar AI-use rubric. Mitigation: move fast on scenario-pack inventory and secure 3–5 anchor customers who co-author packs and become case studies before the incumbents ship.

## Files that would change for the build-out (for reference)

- `src/lib/recruit/rubric.ts` — add AI-use category convention
- `src/app/api/admin/recruitment/[id]/mark/[candidateId]/route.ts` — surface derived AI-use analytics to marker UI
- `src/app/(admin)/admin/recruitment/scenarios/[id]/page.tsx` — editor support for planted-claims in persona scripts and AI-draft-mode on emails
- `src/app/api/assess/chat/route.ts` — no changes needed for analytics; minimal change for draft-mode email thread keys
- `prisma/schema.prisma` — optionally add `plantedClaims Json?` on `RecruitmentScenarioChatScript`; all other additions fit existing `metadata` JSON fields
- New: `src/app/api/admin/recruitment/[id]/benchmark/route.ts` + a PDF/HTML report generator
