/**
 * System prompt + propose_task tool definition for the JD-to-scenario
 * generator. The task-generation half (SYSTEM_PROMPT, PROPOSE_TASK_TOOL,
 * buildUserMessageContent) mirrors src/lib/recruit/scenario-generator.ts
 * in the Next.js app — KEEP THOSE THREE IN SYNC.
 *
 * The rubric half (RUBRIC_SYSTEM_PROMPT, PROPOSE_RUBRIC_TOOL,
 * buildRubricUserMessageContent) is LAMBDA-ONLY: the second Anthropic
 * call that authors a task's marking rubric runs exclusively in this
 * worker, so there is no SSR counterpart to keep in sync. Do not mirror
 * those exports back into scenario-generator.ts.
 *
 * The Next.js module is no longer in the runtime path of generation
 * (the worker Lambda calls Anthropic now), but it's kept because
 * the SSR side still needs the GeneratedTaskDraft type for the wizard,
 * and the prompt itself is the spec for what the model produces.
 *
 * Why duplicated rather than imported: this Lambda is packaged
 * separately from the Next.js build, with its own node_modules; the
 * import path `@/lib/...` doesn't resolve, and pulling in the Next.js
 * source tree would balloon the zip. A short copy with a sync warning
 * at the top of each is the simplest fit.
 */

export const SYSTEM_PROMPT = `You design technical assessments for senior professional hires. The platform asks each candidate to read an EXHIBIT (a realistic source artefact — a contract, a report, a SIEM alert log, a financial statement, a project brief, etc.) and produce a short written DELIVERABLE (an analysis, a memo, a recommendation) that demonstrates the judgement, technical depth, and communication required for the role.

# How to ground the task in the JD

The user message will list ONE OR MORE selection criteria ("focus criteria") that this task must test. The hiring manager has chosen these — they are the binding constraint for this task. Do not pivot to a different criterion you find more interesting in the JD.

**If multiple focus criteria are listed**, design a single coherent task that exercises ALL of them in one realistic scenario — the way a real role challenge would. Do not stitch together separate sub-questions per criterion. For example, if the focus criteria are "incident response judgement under operational pressure" and "clear written communication for executive audiences", a single task can test both: put the candidate in front of a live alert chain and ask for a CISO-facing memo — the technical reasoning AND the communication are exercised by the same exhibit and deliverable. The address-bullets in the brief can map onto the criteria, but the scenario itself should be one situation, not three.

**If a single focus criterion is listed**, the task tests just that one — but still anchored on a specific real situation the role-holder would face, not a generic competency probe.

**Compound criteria.** Some criteria contain "or" clauses or list multiple sub-domains (e.g., "experience in A, B, or C"). Pick the SINGLE most central aspect to test — a 30-minute task cannot realistically probe 5+ subdomains in one scenario. The brief can mention the broader competency in the context paragraph, but the exhibit and decision must be focused.

Use the JD's domain detail (tools, frameworks, regulations, artefact types) to make the exhibit industry-matched. The competency under test is whatever the focus criteria name. If the focus criterion is "Demonstrated experience reviewing vendor contracts under UN procurement framework", your task should put a contract in front of the candidate with embedded compliance issues to find — not a SIEM alert, not a financial statement, even if the JD also lists those.

Do not design generic competency-tests that any senior professional could attempt — design a scenario that the person hired into THIS role, doing THESE specific competencies, would face on a typical Tuesday.

# Quality bar for each task

1. **Industry-matched.** Pull concrete domain detail from the JD — the tools, frameworks, regulations, or artefact types the role works with day to day. A cybersecurity officer task should involve real-looking SIEM alerts, IOCs, or incident write-ups; a finance manager task should involve real-looking ledgers, journals, or audit findings; a contracts lawyer task should involve real-looking clause language. Avoid generic "analyse this case study" framings.

2. **Decision-forcing.** The exhibit must contain enough specifics that a competent candidate can identify issues, weigh trade-offs, and justify a recommendation. The brief must ask for a concrete output — not an essay on the topic in general.

3. **Ungameable from the JD alone.** A candidate who hasn't done the work should be unable to bluff convincingly. The exhibit should contain particulars that need real domain knowledge to interpret correctly. Avoid asking the candidate to "summarise" or "list" — those reward shallow processing.

4. **Self-contained.** Everything the candidate needs to answer must be visible in the exhibit. Do not reference external systems, prior emails, or "the previous task". The candidate may use an in-app AI knowledge system to ask follow-up questions, but the exhibit should be the primary source.

5. **Time-appropriate.** Assume the candidate has roughly 30–45 minutes per task. Exhibits target 600–1200 words equivalent. Briefs are 150–300 words. Deliverables are 250–500 words.

6. **Distinct from prior tasks.** When a list of prior task themes is provided, your new task must NOT overlap with their artefact type, decision, or competency. The current focus criterion may be related to a prior task's criterion in the abstract, but the task you design — the artefact, the question put to the candidate, the type of judgement required — must feel different on the page.

EXHIBIT HTML CONSTRAINTS

The exhibit is rendered inside a sandboxed iframe (sandbox="" with no allow-same-origin) so:
- All styling MUST be inline (\`style="..."\` attributes) — no <style> blocks, no external stylesheets, no class references that won't resolve.
- NO <script> tags. NO event handlers (onclick, onload, etc.). NO iframes within iframes. NO external URLs for fonts/images — assume the iframe has zero network access.
- Use semantic HTML: <h1>/<h2> for titles, <table> for tabular data with <thead>/<tbody>, <pre> for log excerpts or code, <blockquote> for quoted material, <ul>/<ol> for lists, <p> for prose.
- Include domain-specific structure: a SIEM log should look like a log; a P&L should look like a P&L (right-aligned numerics, period columns, totals). Make tables readable: borders, padding, header background, monospace for numerics.
- Plausible but invented: real-looking names, dates, numbers, system identifiers — but do NOT use real company names, real CVEs, real people, or real incidents. Invent everything. Use realistic naming conventions ("Aegis-IDS", "north-eu-prod-01", "GL-3201") and dates in the last 12 months.

BRIEF FORMAT

The brief is rendered as Markdown. Structure it as:

> **Context** (1–2 paragraphs setting the scene — who is asking the candidate to do this, what the situation is)
>
> **What we need from you** (1 paragraph stating the deliverable explicitly)
>
> **Specifically, address:** (3–5 bulleted prompts the analysis should cover — these scaffold the candidate's response without giving away the answer)

Do not enumerate the items the candidate should "find" in the exhibit — the point is to see if they find them. Frame prompts as decisions or judgements (e.g. "Recommend whether to escalate to the CIRT, with reasoning" rather than "Identify the IOCs in the alert log").

DELIVERABLE LABEL + PLACEHOLDER

\`deliverableLabel\` is a short noun phrase shown above the candidate's editor (e.g. "Incident Response Memo", "Audit Finding Letter", "Recommendation to the Board"). \`deliverablePlaceholder\` is the empty-state text inside the editor — a one-line invitation to start writing in the right register (e.g. "Begin your incident response memo here. Address it to the CISO.").

OUTPUT

Always return your task by calling the \`propose_task\` tool. Do not include any prose response — the tool call IS the response. Use \`themeSummary\` to give a single-sentence statement of the task's competency focus and artefact type, for use when generating sibling tasks (e.g. "Triage of a multi-stage SIEM alert chain — incident response judgement under uncertainty.").`;

export const PROPOSE_TASK_TOOL = {
  name: "propose_task",
  description:
    "Submit one task draft for the scenario, including its brief, exhibit, and deliverable.",
  input_schema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description:
          "Short title for the task (e.g., 'Overnight Alert Triage', 'Q3 Variance Review'). 3–8 words.",
      },
      briefMarkdown: {
        type: "string",
        description:
          "The candidate-facing brief, in Markdown. Follows the Context / What we need from you / Specifically, address structure described in the system prompt.",
      },
      exhibitTitle: {
        type: "string",
        description:
          "Title of the exhibit document the candidate analyses (e.g., 'Aegis-IDS Alert Log — 02:00–05:00 UTC, 14 March 2026').",
      },
      exhibitHtml: {
        type: "string",
        description:
          "Self-contained HTML for the exhibit. Inline styles only — no <style> blocks, no <script>, no external resources. Renders inside a sandboxed iframe.",
      },
      deliverableLabel: {
        type: "string",
        description:
          "Short noun phrase for the deliverable (e.g., 'Incident Response Memo'). Shown above the candidate's editor.",
      },
      deliverablePlaceholder: {
        type: "string",
        description:
          "Empty-state placeholder text inside the candidate's editor (e.g., 'Begin your incident response memo here. Address it to the CISO.'). One short sentence.",
      },
      totalMarks: {
        type: "integer",
        description:
          "Suggested total marks for the task. Typical range 20–50. Use higher values for harder/longer tasks.",
      },
      themeSummary: {
        type: "string",
        description:
          "One-sentence statement of the competency focus + artefact type, used to ensure sibling tasks explore different aspects (e.g., 'Triage of a multi-stage SIEM alert chain — incident response judgement under uncertainty.').",
      },
    },
    required: [
      "title",
      "briefMarkdown",
      "exhibitTitle",
      "exhibitHtml",
      "deliverableLabel",
      "deliverablePlaceholder",
      "totalMarks",
      "themeSummary",
    ],
  },
};

export function buildUserMessageContent(input) {
  const priorThemesText = input.priorThemes && input.priorThemes.length
    ? `\n\n**Themes already covered by sibling tasks (do NOT repeat or vary on these):**\n${input.priorThemes.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
    : "";

  const focusCriteriaText =
    input.focusCriteria.length === 1
      ? `The hiring manager has selected this criterion as the one to test:\n\n> ${input.focusCriteria[0]}`
      : `The hiring manager has selected ${input.focusCriteria.length} criteria for this task. Design ONE coherent scenario that tests ALL of them together (not as separate sub-questions):\n\n${input.focusCriteria.map((c) => `> ${c}`).join("\n>\n")}`;

  return [
    {
      type: "text",
      text: `# Role being assessed\n\n**Position:** ${input.positionTitle}\n**Organisation:** ${input.organisation}\n\n# Job description\n\n${input.jdText}`,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: `Design **task ${input.taskIndex} of ${input.taskCount}** for the assessment described above.${priorThemesText}\n\n# Focus criteria for this task\n\n${focusCriteriaText}\n\nDesign a task that concretely tests ${input.focusCriteria.length === 1 ? "THIS criterion" : "ALL of these criteria together"}. Use the JD's domain detail (tools, frameworks, artefact types) to make the exhibit industry-matched.\n\nCall the \`propose_task\` tool with your task draft.`,
    },
  ];
}

/* ------------------------------------------------------------------ *
 * Rubric generation (LAMBDA-ONLY — see file header).
 *
 * A second Anthropic call, made right after a task is designed, that
 * authors that task's marking rubric while the model still has the
 * exhibit it just wrote in context. The output is the per-task
 * `categories` object stored on RecruitmentScenarioTask.rubric and read
 * by the marking screen.
 * ------------------------------------------------------------------ */

export const RUBRIC_SYSTEM_PROMPT = `You author defensible marking rubrics for senior professional hiring assessments. A task has already been designed — you will be given its brief, its exhibit, and the selection criteria it tests. Your job is to produce the rubric a hiring manager will use to mark candidate submissions against THAT specific exhibit.

The rubric divides the task's total marks across up to four categories. Return it by calling the \`propose_rubric\` tool.

# The categories

1. **technical** (always present) — the domain substance: the specific issues, errors, risks, or opportunities a strong candidate should identify IN THIS EXHIBIT, and the correct technical treatment of each. This is the heart of the rubric.
   - \`embedded_issues\` is the list of concrete things hidden in the exhibit that the task is really testing for. Each is a discrete, checkable item — not a vague competency. Typically 3–6 of them.
   - Each issue needs: a stable \`id\` (snake_case, unique within the task — e.g. \`unhedged_fx_exposure\`, \`missing_termination_clause\`); a marker-facing \`title\` (short noun phrase); \`max_marks\`; and an \`expected\` model answer that states what a strong candidate identifies AND the correct treatment/quantification (e.g. "Notes the 90-day payment term breaches the 30-day procurement standard; should flag for renegotiation or escalation"). The \`expected\` text is what the marker reads to decide whether the candidate got it — make it concrete and exhibit-specific, citing the actual figures, clauses, or identifiers in the exhibit.
   - The sum of the \`max_marks\` across embedded_issues should equal \`technical.max\`.

2. **investigation_quality** (always present) — how well the candidate interrogated the exhibit: did they dig past the surface, cross-check figures, notice what's missing, ask the right follow-ups. \`indicators\` is a list of observable behaviours that distinguish a thorough investigation from a shallow one.

3. **professional_skills** (always present) — communication and craft: structure, clarity, register appropriate to the deliverable's audience, prioritisation, actionable recommendations. \`indicators\` is a list of observable markers of a well-constructed deliverable.

4. **judgment** (OPTIONAL — include ONLY when the task forces a stakeholder-facing decision or a call under uncertainty, e.g. "recommend whether to escalate", "advise the board"). When present, \`rubric\` maps performance bands to descriptors — e.g. { "Strong": "Makes a clear, defensible recommendation and owns the trade-off", "Adequate": "Reaches a recommendation but hedges or under-weights the key risk", "Weak": "Avoids a decision or recommends against the evidence" }. Omit this category entirely for pure-analysis tasks that don't require a recommendation.

# Hard constraints

- The category \`max\` values MUST sum EXACTLY to the task's total marks (given in the user message). This is non-negotiable — the marking screen caps scores at these maxima.
- Author from the SAME exhibit and brief the candidate sees. Every embedded issue must be genuinely present in the exhibit — do not invent issues the exhibit doesn't contain, and do not reference external material.
- Be specific to this task. A rubric that could apply to any assessment in this domain is too generic — cite the exhibit's actual content.
- This rubric is marker-only; never written for the candidate to see.

Return the rubric by calling \`propose_rubric\`. The tool call IS the response — no prose.`;

export const PROPOSE_RUBRIC_TOOL = {
  name: "propose_rubric",
  description:
    "Submit the marking rubric for the task just designed. Category 'max' values MUST sum to the task total. Author concrete, defensible criteria from the same exhibit/brief the candidate sees.",
  input_schema: {
    type: "object",
    required: ["categories"],
    properties: {
      categories: {
        type: "object",
        required: ["technical", "investigation_quality", "professional_skills"],
        properties: {
          technical: {
            type: "object",
            required: ["max", "description", "embedded_issues"],
            properties: {
              max: { type: "integer" },
              description: { type: "string" },
              embedded_issues: {
                type: "array",
                items: {
                  type: "object",
                  required: ["id", "title", "max_marks", "expected"],
                  properties: {
                    id: {
                      type: "string",
                      description:
                        "Stable snake_case key, unique within the task; used as the analytics id.",
                    },
                    title: { type: "string" },
                    max_marks: { type: "integer" },
                    expected: {
                      type: "string",
                      description:
                        "Model answer: what a strong candidate identifies + correct treatment/quantification.",
                    },
                  },
                },
              },
            },
          },
          investigation_quality: {
            type: "object",
            required: ["max", "description", "indicators"],
            properties: {
              max: { type: "integer" },
              description: { type: "string" },
              indicators: { type: "array", items: { type: "string" } },
            },
          },
          professional_skills: {
            type: "object",
            required: ["max", "description", "indicators"],
            properties: {
              max: { type: "integer" },
              description: { type: "string" },
              indicators: { type: "array", items: { type: "string" } },
            },
          },
          judgment: {
            type: "object",
            required: ["max", "description", "rubric"],
            description:
              "Include only when the task tests stakeholder navigation / decision under uncertainty.",
            properties: {
              max: { type: "integer" },
              description: { type: "string" },
              rubric: {
                type: "object",
                additionalProperties: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
};

/**
 * User message for the rubric call. Reuses the SAME cached JD/role
 * prefix block as buildUserMessageContent (byte-identical, so the
 * ephemeral prompt cache primed by the task call stays warm), then a
 * suffix carrying the just-generated task draft and asking the model to
 * author its rubric.
 */
export function buildRubricUserMessageContent(input, draft) {
  const focusCriteriaText =
    input.focusCriteria.length === 1
      ? `The task tests this selection criterion:\n\n> ${input.focusCriteria[0]}`
      : `The task tests these ${input.focusCriteria.length} selection criteria together:\n\n${input.focusCriteria.map((c) => `> ${c}`).join("\n>\n")}`;

  return [
    {
      type: "text",
      text: `# Role being assessed\n\n**Position:** ${input.positionTitle}\n**Organisation:** ${input.organisation}\n\n# Job description\n\n${input.jdText}`,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: `A task has been designed for this role. Author its marking rubric.\n\n${focusCriteriaText}\n\n# The task\n\n**Title:** ${draft.title}\n\n**Total marks:** ${draft.totalMarks} — the rubric's category \`max\` values MUST sum to exactly this.\n\n## Brief shown to the candidate\n\n${draft.briefMarkdown}\n\n## Exhibit the candidate analyses — "${draft.exhibitTitle}"\n\n${draft.exhibitHtml}\n\n# Your job\n\nAuthor a marking rubric grounded in THIS exhibit: the \`embedded_issues\` must be the specific things a strong candidate should catch in the exhibit above, each with its model answer. The category \`max\` values must sum to exactly ${draft.totalMarks}. Call the \`propose_rubric\` tool.`,
    },
  ];
}
