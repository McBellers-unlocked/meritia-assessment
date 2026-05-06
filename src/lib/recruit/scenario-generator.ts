/**
 * AI-assisted scenario generator.
 *
 * Given a parsed job description, generate `memo_ai`-shaped task drafts
 * (brief + exhibit + deliverable) via Claude Opus 4.7 tool use. The brief
 * and the exhibit are produced *together* in a single tool call so they
 * stay internally consistent — generating them separately tends to produce
 * exhibits that don't match what the brief asks the candidate to analyse.
 *
 * Caching:
 *   The system prompt + tool definition + JD text form a stable prefix
 *   (`cache_control: ephemeral` on the JD message). The first call writes
 *   the cache; subsequent calls (additional tasks, regenerates) read it,
 *   so only the small per-task suffix is paid at full rate. The 4096-token
 *   minimum cacheable prefix on Opus 4.7 is comfortably exceeded by the
 *   detailed system prompt below + a typical JD.
 */
import Anthropic from "@anthropic-ai/sdk";

import { getAnthropicKey } from "@/lib/secrets";

export interface GeneratedTaskDraft {
  title: string;
  briefMarkdown: string;
  exhibitTitle: string;
  exhibitHtml: string;
  deliverableLabel: string;
  deliverablePlaceholder: string;
  totalMarks: number;
  themeSummary: string;
}

export interface GenerateTaskInput {
  jdText: string;
  positionTitle: string;
  organisation: string;
  taskIndex: number; // 1..n
  taskCount: number; // total tasks the admin is asking for
  priorThemes: string[]; // themeSummary values from already-accepted tasks
}

const MODEL = "claude-opus-4-7";
const MAX_TOKENS = 16000;

const SYSTEM_PROMPT = `You design technical assessments for senior professional hires. The platform asks each candidate to read an EXHIBIT (a realistic source artefact — a contract, a report, a SIEM alert log, a financial statement, a project brief, etc.) and produce a short written DELIVERABLE (an analysis, a memo, a recommendation) that demonstrates the judgement, technical depth, and communication required for the role.

Your job is to design ONE task at a time, given a job description. Each task you produce must be:

1. **Industry-matched.** Pull concrete domain detail from the JD — the tools, frameworks, regulations, or artefact types the role works with day to day. A cybersecurity officer task should involve real-looking SIEM alerts, IOCs, or incident write-ups; a finance manager task should involve real-looking ledgers, journals, or audit findings; a contracts lawyer task should involve real-looking clause language. Avoid generic "analyse this case study" framings.

2. **Decision-forcing.** The exhibit must contain enough specifics that a competent candidate can identify issues, weigh trade-offs, and justify a recommendation. The brief must ask for a concrete output — not an essay on the topic in general.

3. **Ungameable from the JD alone.** A candidate who hasn't done the work should be unable to bluff convincingly. The exhibit should contain particulars that need real domain knowledge to interpret correctly. Avoid asking the candidate to "summarise" or "list" — those reward shallow processing.

4. **Self-contained.** Everything the candidate needs to answer must be visible in the exhibit. Do not reference external systems, prior emails, or "the previous task". The candidate may use an in-app AI knowledge system to ask follow-up questions, but the exhibit should be the primary source.

5. **Time-appropriate.** Assume the candidate has roughly 30–45 minutes per task. The exhibit should be ~600–1500 words equivalent (tables, figures, and structured data count). The expected deliverable should be ~250–600 words of analytical writing.

6. **Distinct from prior tasks.** When a list of prior task themes is provided, your new task must explore a *different* aspect of the role — different artefact type, different decision, different competency — not a variation on the same scenario.

EXHIBIT HTML CONSTRAINTS

The exhibit is rendered inside a sandboxed iframe (sandbox="" with no allow-same-origin) so:
- All styling MUST be inline (\`style="..."\` attributes) — no <style> blocks, no external stylesheets, no class references that won't resolve.
- NO <script> tags. NO event handlers (onclick, onload, etc.). NO iframes within iframes. NO external URLs for fonts/images — assume the iframe has zero network access.
- Use semantic HTML: <h1>/<h2> for titles, <table> for tabular data with <thead>/<tbody>, <pre> for log excerpts or code, <blockquote> for quoted material, <ul>/<ol> for lists, <p> for prose.
- Include domain-specific structure: a SIEM log should look like a log; a P&L should look like a P&L (right-aligned numerics, period columns, totals). Make tables readable: borders, padding, header background, monospace for numerics.
- Plausible but invented: real-looking names, dates, numbers, system identifiers — but do NOT use real company names, real CVEs, real people, or real incidents. Invent everything. Use realistic naming conventions ("Aegis-IDS", "north-eu-prod-01", "GL-3201") and dates in the last 12 months.
- Length: approximately 800–2500 characters of meaningful content (tables and structured data count by the data they convey, not by character count).

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

const PROPOSE_TASK_TOOL: Anthropic.Tool = {
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

function buildUserMessage(
  input: GenerateTaskInput
): Anthropic.MessageParam {
  // Two text blocks. The first is the stable prefix (JD + role context) —
  // marked with cache_control so subsequent calls in the same flow read
  // the cache instead of re-billing the JD tokens. The second is the
  // per-task variant: which task to generate, and what to avoid.
  const stableBlock: Anthropic.TextBlockParam = {
    type: "text",
    text: `# Role being assessed

**Position:** ${input.positionTitle}
**Organisation:** ${input.organisation}

# Job description

${input.jdText}`,
    cache_control: { type: "ephemeral" },
  };

  const priorThemesText = input.priorThemes.length
    ? `\n\n**Themes already covered by sibling tasks (do NOT repeat or vary on these):**\n${input.priorThemes.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
    : "";

  const taskBlock: Anthropic.TextBlockParam = {
    type: "text",
    text: `Design **task ${input.taskIndex} of ${input.taskCount}** for the assessment described above.${priorThemesText}

Call the \`propose_task\` tool with your task draft.`,
  };

  return {
    role: "user",
    content: [stableBlock, taskBlock],
  };
}

let cachedClient: Anthropic | null = null;

async function getClient(): Promise<Anthropic> {
  if (cachedClient) return cachedClient;
  const apiKey = await getAnthropicKey();
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

/**
 * Generate one task draft. Tool-use forced via `tool_choice` so the model
 * always returns structured output. On any deviation (tool not called,
 * malformed input) we throw — the caller surfaces the error to the user
 * rather than silently producing a partial scenario.
 */
export async function generateOneTask(
  input: GenerateTaskInput
): Promise<{ task: GeneratedTaskDraft; usage: Anthropic.Usage }> {
  if (!input.jdText.trim()) {
    throw new Error("JD text is empty — cannot generate a task.");
  }
  if (input.taskIndex < 1 || input.taskIndex > input.taskCount) {
    throw new Error(
      `taskIndex ${input.taskIndex} out of range for taskCount ${input.taskCount}`
    );
  }

  const client = await getClient();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    tools: [PROPOSE_TASK_TOOL],
    // tool_choice "tool" would force the call but the API rejects that
    // alongside adaptive thinking. We were forced to drop tool_choice in
    // favour of "auto" — and now we also drop thinking, because adaptive
    // thinking + a long exhibit typically pushes the per-call time past
    // Amplify's SSR function timeout (Lambda@Edge caps at 30s; even the
    // newer SSR runtime has shorter limits than Opus 4.7 + thinking
    // wants). The system prompt is detailed enough that no-thinking
    // output is still strong, and we save 20–40s per task.
    tool_choice: { type: "auto" },
    thinking: { type: "disabled" },
    messages: [buildUserMessage(input)],
  });

  // The response should contain exactly one tool_use block for `propose_task`.
  // Parse via the SDK's typed `input` field — never raw-string the JSON.
  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === "tool_use" && b.name === PROPOSE_TASK_TOOL.name
  );
  if (!toolUse) {
    throw new Error(
      `Model did not call propose_task. stop_reason=${response.stop_reason}`
    );
  }

  const draft = toolUse.input as Partial<GeneratedTaskDraft>;
  // Defensive validation — strict schemas + tool_choice make this rare,
  // but a missing field would silently corrupt the saved scenario.
  const required: (keyof GeneratedTaskDraft)[] = [
    "title",
    "briefMarkdown",
    "exhibitTitle",
    "exhibitHtml",
    "deliverableLabel",
    "deliverablePlaceholder",
    "totalMarks",
    "themeSummary",
  ];
  for (const field of required) {
    if (draft[field] === undefined || draft[field] === null || draft[field] === "") {
      throw new Error(`Generated task missing field: ${field}`);
    }
  }

  return {
    task: draft as GeneratedTaskDraft,
    usage: response.usage,
  };
}

/**
 * Generate the full set of N tasks. Sequence-then-fan-out:
 *   - Task 1 runs alone so the JD prefix is cached before parallel calls fire
 *   - Tasks 2..N run in parallel, each with priorThemes built up from
 *     already-completed tasks
 *
 * Concurrent first-calls would each pay the cache-write premium; serializing
 * the first one cuts cost (and keeps the model from repeating themes).
 */
export async function generateAllTasks(
  base: Omit<GenerateTaskInput, "taskIndex" | "priorThemes">
): Promise<GeneratedTaskDraft[]> {
  if (base.taskCount < 1) return [];

  const tasks: GeneratedTaskDraft[] = [];

  const first = await generateOneTask({
    ...base,
    taskIndex: 1,
    priorThemes: [],
  });
  tasks.push(first.task);

  if (base.taskCount === 1) return tasks;

  // For task 2 onward, feed task 1's themeSummary as priorThemes. Subsequent
  // parallel tasks all see the same prior set — they may converge on similar
  // novel themes, but that's acceptable for the MVP. Tighter de-duping would
  // require strict serialization (slower).
  const remaining = await Promise.all(
    Array.from({ length: base.taskCount - 1 }, (_, i) =>
      generateOneTask({
        ...base,
        taskIndex: i + 2,
        priorThemes: tasks.map((t) => t.themeSummary),
      })
    )
  );

  for (const r of remaining) tasks.push(r.task);
  return tasks;
}
