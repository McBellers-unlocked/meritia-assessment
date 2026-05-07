/**
 * Worker Lambda: AI-assisted scenario task generator.
 *
 * Triggered by SQS messages of the form { jobId }. Reads the job's
 * input from Postgres (RecruitmentScenarioGenerationJob), calls
 * Anthropic with the system prompt + tool definition mirrored from the
 * Next.js app, and writes the result back to the same row.
 *
 * Why this is a separate Lambda and not part of the Next.js SSR app:
 * Amplify Hosting's SSR runtime caps Lambda execution at ~30s and is
 * not customer-configurable. Multi-criteria task generation with
 * Opus 4.7 + adaptive thinking can run 30–60s. Running the call here
 * (timeout 5 min) escapes that ceiling without compromising on quality.
 *
 * Environment variables required:
 *   - ANTHROPIC_API_KEY    (the Anthropic key)
 *   - DATABASE_URL          (Postgres connection string, must include sslmode=require for RDS)
 *
 * IAM permissions required:
 *   - sqs:ReceiveMessage / DeleteMessage on the queue (granted via the event-source-mapping role)
 *   - basic Lambda execution (CloudWatch Logs)
 *   - network access to RDS (publicly-reachable RDS, so no VPC needed)
 */
import Anthropic from "@anthropic-ai/sdk";
import pg from "pg";

import {
  SYSTEM_PROMPT,
  PROPOSE_TASK_TOOL,
  buildUserMessageContent,
} from "./prompt.mjs";

const MODEL = "claude-opus-4-7";
// Includes adaptive-thinking tokens + the tool call (which carries the
// rendered exhibit HTML, brief, etc.). Adaptive thinking on a complex
// JD can easily burn 10K, leaving too little room for a richly
// formatted exhibit at the previous 16K cap. 32K gives headroom and
// is still far below the model's actual ceiling.
const MAX_TOKENS = 32_000;

let pgPool = null;
function getPool() {
  if (pgPool) return pgPool;
  // Strip sslmode from the URL — pg v8's URL parser converts
  // sslmode=require into a verify-full SSL config that overrides
  // anything we pass in `ssl:`, and AWS RDS's CA chain isn't in
  // Node's default trust store (Prisma handles this on the SSR
  // side; pg does not). With sslmode removed from the URL, our
  // explicit ssl: { rejectUnauthorized: false } wins. Connection
  // is still encrypted (RDS requires it server-side), we just
  // skip CA chain validation.
  const rawUrl = process.env.DATABASE_URL || "";
  const cleanUrl = rawUrl
    .replace(/[?&]sslmode=[^&]*/gi, "")
    .replace(/\?$/, "");
  pgPool = new pg.Pool({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false },
    max: 1,
    idleTimeoutMillis: 1_000,
  });
  return pgPool;
}

let anthropicClient = null;
function getAnthropic() {
  if (anthropicClient) return anthropicClient;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY env var is not set");
  }
  anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropicClient;
}

/**
 * Lambda SQS event handler. Each Record carries one job message;
 * batch size is set to 1 in the event-source-mapping so failures
 * don't poison a batch.
 */
export const handler = async (event) => {
  const records = Array.isArray(event?.Records) ? event.Records : [];
  for (const record of records) {
    let jobId;
    try {
      const body = JSON.parse(record.body ?? "{}");
      jobId = String(body.jobId ?? "").trim();
    } catch {
      console.error("Could not parse SQS message body:", record.body);
      // Don't throw — let the message be deleted; a malformed message
      // would otherwise loop forever (until DLQ).
      continue;
    }
    if (!jobId) {
      console.error("SQS message missing jobId:", record.body);
      continue;
    }

    try {
      await processJob(jobId);
    } catch (e) {
      // processJob already records the failure in the DB. Re-throwing
      // here would cause SQS to retry; we don't want that under
      // max-receive-count=1 (set on the queue), so just log.
      console.error(`[task-generator] job ${jobId} failed:`, e);
    }
  }
};

async function processJob(jobId) {
  const pool = getPool();
  const startedAt = new Date();

  // Mark running and read the input.
  const startRes = await pool.query(
    `UPDATE recruitment_scenario_generation_jobs
       SET status = 'running', started_at = $2
     WHERE id = $1 AND status IN ('queued', 'running')
     RETURNING input_json, status`,
    [jobId, startedAt]
  );
  if (startRes.rowCount === 0) {
    console.warn(
      `[task-generator] job ${jobId} not found or already completed; skipping`
    );
    return;
  }
  const input = startRes.rows[0].input_json;

  validateInput(input);

  console.log(
    `[task-generator] job ${jobId} starting; criteria=${input.focusCriteria.length}, taskIndex=${input.taskIndex}/${input.taskCount}`
  );

  let draft;
  let usage;
  try {
    const result = await callAnthropic(input);
    draft = result.draft;
    usage = result.usage;
  } catch (e) {
    const message = e?.message || String(e);
    console.error(`[task-generator] anthropic call failed for ${jobId}:`, e);
    await pool.query(
      `UPDATE recruitment_scenario_generation_jobs
         SET status = 'failed', error_message = $2, completed_at = $3
       WHERE id = $1`,
      [jobId, `Anthropic call failed: ${message}`, new Date()]
    );
    return;
  }

  await pool.query(
    `UPDATE recruitment_scenario_generation_jobs
       SET status = 'completed',
           result_json = $2,
           completed_at = $3
     WHERE id = $1`,
    [jobId, { task: draft, usage }, new Date()]
  );

  const elapsed = Date.now() - startedAt.getTime();
  console.log(`[task-generator] job ${jobId} completed in ${elapsed}ms`);
}

function validateInput(input) {
  if (!input || typeof input !== "object") {
    throw new Error("input is not an object");
  }
  if (!input.jdText || !input.jdText.trim()) {
    throw new Error("jdText required");
  }
  if (!input.positionTitle || !input.positionTitle.trim()) {
    throw new Error("positionTitle required");
  }
  if (!input.organisation || !input.organisation.trim()) {
    throw new Error("organisation required");
  }
  if (!Array.isArray(input.focusCriteria) || input.focusCriteria.length === 0) {
    throw new Error("focusCriteria must be a non-empty array");
  }
  if (
    !Number.isInteger(input.taskIndex) ||
    !Number.isInteger(input.taskCount) ||
    input.taskIndex < 1 ||
    input.taskCount < 1 ||
    input.taskIndex > input.taskCount
  ) {
    throw new Error("taskIndex/taskCount invalid");
  }
}

async function callAnthropic(input) {
  const client = getAnthropic();

  // Use the streaming helper rather than non-streaming `create`. With
  // 32K max_tokens + adaptive thinking + effort:high, the SDK's
  // pre-flight time estimate trips its "use streaming for ops that
  // may take >10 min" guard and refuses a non-streaming request. The
  // Lambda has a 5-min ceiling regardless, so streaming just lets us
  // pass that check; we still wait for the final assembled message
  // before validating.
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    tools: [PROPOSE_TASK_TOOL],
    tool_choice: { type: "auto" },
    // No SSR cap on this Lambda (5-min timeout) so we can use adaptive
    // thinking — meaningfully sharper output for complex scenarios.
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    messages: [
      {
        role: "user",
        content: buildUserMessageContent(input),
      },
    ],
  });
  const response = await stream.finalMessage();

  const toolUse = response.content.find(
    (b) => b.type === "tool_use" && b.name === PROPOSE_TASK_TOOL.name
  );
  if (!toolUse) {
    throw new Error(
      `Model did not call propose_task. stop_reason=${response.stop_reason}`
    );
  }

  const draft = toolUse.input;
  const required = [
    "title",
    "briefMarkdown",
    "exhibitTitle",
    "exhibitHtml",
    "deliverableLabel",
    "deliverablePlaceholder",
    "totalMarks",
    "themeSummary",
  ];
  const missing = required.filter((field) => {
    const value = draft?.[field];
    return value === undefined || value === null || value === "";
  });
  if (missing.length > 0) {
    // Surface stop_reason so a max-tokens truncation is obvious from the
    // wizard error rather than buried in CloudWatch.
    const stop = response.stop_reason ?? "unknown";
    if (stop === "max_tokens") {
      throw new Error(
        `Model output was truncated (max_tokens hit) before finishing the task draft. ` +
          `Missing field${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. ` +
          `Try regenerating, or split this task's criteria into a separate run.`
      );
    }
    throw new Error(
      `Generated task missing required field${missing.length > 1 ? "s" : ""}: ${missing.join(", ")} (stop_reason=${stop})`
    );
  }

  return {
    draft,
    usage: {
      input_tokens: response.usage?.input_tokens ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0,
      cache_creation_input_tokens:
        response.usage?.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: response.usage?.cache_read_input_tokens ?? 0,
    },
  };
}
