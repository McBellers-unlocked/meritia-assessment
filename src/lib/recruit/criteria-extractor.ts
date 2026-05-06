/**
 * Extract the structured selection criteria from a job description.
 *
 * Returns two arrays of short criterion strings (essential and
 * desirable). The downstream task generator uses each ticked criterion
 * as a `focusCriterion` so each generated task tests one specific
 * competency the JD names.
 *
 * Model is Opus 4.7 — short call, judgement-heavy, paraphrase quality
 * matters. The Amplify SSR timeout doesn't apply to this kind of
 * lightweight extraction (typical 3–8s).
 */
import Anthropic from "@anthropic-ai/sdk";

import { getAnthropicKey } from "@/lib/secrets";

export interface ExtractCriteriaInput {
  jdText: string;
  positionTitle: string;
}

export interface ExtractedCriteria {
  essential: string[];
  desirable: string[];
}

const MODEL = "claude-opus-4-7";
const MAX_TOKENS = 1500;

const SYSTEM_PROMPT = `You extract the structured selection criteria from a job description. Return them by calling the \`report_criteria\` tool.

Two rules:

1. **Essential vs desirable.** Use the JD's own labelling where present:
   - "Essential criteria", "Required", "Mandatory", "Must have", "Minimum qualifications" → essential
   - "Desirable", "Preferred", "Nice to have", "Advantageous" → desirable

   If the JD has no explicit labels, classify by language: "must demonstrate", "required", and "minimum" are essential; "ideally", "preferred", and "advantageous" are desirable.

2. **Preserve specificity.** Quote the JD's wording where reasonable. Do NOT abbreviate "Demonstrated experience reviewing vendor contracts under UN procurement framework" down to "Contract review" — the downstream task generator needs the specifics. If a single bullet contains two distinct criteria joined by "and", split them into two items. Trim any leading bullet markers ("- ", "* ", "1. ") and trailing punctuation.

If the JD genuinely has no identifiable criteria sections, return empty arrays. **Do not fabricate criteria from job duties** — duties describe what the person does; criteria describe what the person must already have. Confusing the two will produce tasks that test the wrong thing.`;

const REPORT_CRITERIA_TOOL: Anthropic.Tool = {
  name: "report_criteria",
  description:
    "Report the essential and desirable selection criteria identified in the job description.",
  input_schema: {
    type: "object",
    properties: {
      essential: {
        type: "array",
        items: { type: "string" },
        description:
          "Essential / required / mandatory selection criteria. Each item is one criterion, in the JD's own wording where reasonable. 0–15 items.",
      },
      desirable: {
        type: "array",
        items: { type: "string" },
        description:
          "Desirable / preferred / advantageous criteria. 0–15 items.",
      },
    },
    required: ["essential", "desirable"],
  },
};

let cachedClient: Anthropic | null = null;

async function getClient(): Promise<Anthropic> {
  if (cachedClient) return cachedClient;
  const apiKey = await getAnthropicKey();
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

function buildUserMessage(input: ExtractCriteriaInput): Anthropic.MessageParam {
  return {
    role: "user",
    content: [
      {
        type: "text",
        text: `# Role being assessed

**Position:** ${input.positionTitle}

# Job description

${input.jdText}`,
        // Same JD prefix the generator caches — once written, future
        // calls in the same flow read the cache.
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: "Extract the essential and desirable selection criteria. Call the `report_criteria` tool with the result.",
      },
    ],
  };
}

const MAX_ITEMS_PER_LIST = 15;
const MAX_CRITERION_LENGTH = 500;
const MIN_CRITERION_LENGTH = 4;

function cleanCriteria(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    let text = item.trim();
    // Strip stray bullet markers and trailing punctuation that some
    // models leave in despite the prompt instruction.
    text = text.replace(/^[-*•]\s+/, "").replace(/^\d+[.)]\s+/, "");
    text = text.replace(/[.;]+$/, "").trim();
    if (text.length < MIN_CRITERION_LENGTH) continue;
    if (text.length > MAX_CRITERION_LENGTH) {
      text = text.slice(0, MAX_CRITERION_LENGTH).trim() + "…";
    }
    const dedupeKey = text.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    cleaned.push(text);
    if (cleaned.length >= MAX_ITEMS_PER_LIST) break;
  }
  return cleaned;
}

/**
 * Extract criteria from the JD. Streams the Anthropic call so the
 * caller (typically an SSE route handler) can ping `onProgress` to
 * keep its connection alive.
 */
export async function extractCriteria(
  input: ExtractCriteriaInput,
  onProgress?: () => void
): Promise<{ result: ExtractedCriteria; usage: Anthropic.Usage }> {
  if (!input.jdText.trim()) {
    throw new Error("JD text is empty — cannot extract criteria.");
  }
  if (!input.positionTitle.trim()) {
    throw new Error("Position title is required for criteria extraction.");
  }

  const client = await getClient();

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    tools: [REPORT_CRITERIA_TOOL],
    tool_choice: { type: "auto" },
    thinking: { type: "disabled" },
    messages: [buildUserMessage(input)],
  });

  for await (const _event of stream) {
    onProgress?.();
    void _event;
  }

  const response = await stream.finalMessage();

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === "tool_use" && b.name === REPORT_CRITERIA_TOOL.name
  );
  if (!toolUse) {
    throw new Error(
      `Model did not call report_criteria. stop_reason=${response.stop_reason}`
    );
  }

  const raw = toolUse.input as { essential?: unknown; desirable?: unknown };
  const essential = cleanCriteria(raw.essential);
  const desirable = cleanCriteria(raw.desirable);

  return {
    result: { essential, desirable },
    usage: response.usage,
  };
}
