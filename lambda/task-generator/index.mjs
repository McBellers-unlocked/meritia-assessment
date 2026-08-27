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
 * Opus 4.8 + adaptive thinking can run 30–60s. Running the call here
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
import { randomUUID } from "node:crypto";

import {
  SYSTEM_PROMPT,
  PROPOSE_TASK_TOOL,
  buildUserMessageContent,
  RUBRIC_SYSTEM_PROMPT,
  PROPOSE_RUBRIC_TOOL,
  buildRubricUserMessageContent,
} from "./prompt.mjs";
import { BUILDER_MODEL as MODEL } from "./model-config.mjs";
import {
  VALIDATION_PROMPT_VERSION,
  VALIDATION_SYSTEM_PROMPT,
  VALIDATION_REPORT_TOOL,
  buildValidationUserMessage,
} from "./validation-prompt.mjs";
import {
  CANDIDATE_KNOWLEDGE_CONTENT_VERSION,
  CANDIDATE_KNOWLEDGE_MAX_TOKENS,
  CANDIDATE_KNOWLEDGE_MODEL,
  CANDIDATE_KNOWLEDGE_POLICY_VERSION,
  CANDIDATE_KNOWLEDGE_SCHEMA_VERSION,
  CANDIDATE_KNOWLEDGE_TOOL,
  buildCandidateKnowledgeSystemPrompt,
  candidateKnowledgeQualityIssue,
  candidateKnowledgeResponseToText,
  evidenceAuthorshipBoundaryResponse,
  isEvidenceAuthorshipRequest,
  parseCandidateKnowledgeResponse,
  validateCandidateKnowledgeSources,
} from "./candidate-knowledge.mjs";

// Includes adaptive-thinking tokens + the tool call (which carries the
// rendered exhibit HTML, brief, etc.). Adaptive thinking on a complex
// JD can easily burn 10K, leaving too little room for a richly
// formatted exhibit at the previous 16K cap. 32K gives headroom and
// is still far below the model's actual ceiling.
const MAX_TOKENS = 32_000;
// The rubric call carries no exhibit HTML in its output (just the
// categories object: a handful of embedded issues + indicators + bands),
// so it needs far less room than task generation. 16K leaves generous
// headroom for adaptive thinking on top of the structured output.
const RUBRIC_MAX_TOKENS = 16_000;
const CANDIDATE_CODE_MODEL = "claude-haiku-4-5-20251001";
const CANDIDATE_CODE_MAX_TOKENS = 5_000;
const CANDIDATE_CODE_TOOL = {
  type: "code_execution_20250825",
  name: "code_execution",
};

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
    let validationRunId;
    let jobType;
    let messageBody;
    try {
      messageBody = JSON.parse(record.body ?? "{}");
      jobId = String(messageBody.jobId ?? "").trim();
      validationRunId = String(messageBody.validationRunId ?? "").trim();
      jobType = String(messageBody.jobType ?? "task-generation-v1");
    } catch {
      console.error("Could not parse SQS message body:", record.body);
      // Don't throw — let the message be deleted; a malformed message
      // would otherwise loop forever (until DLQ).
      continue;
    }
    if (jobType === "scenario-validation-v1" && validationRunId) {
      try {
        await processValidationRun(validationRunId);
      } catch (e) {
        console.error(`[validation-lab] run ${validationRunId} failed:`, e);
      }
      continue;
    }
    if (jobType === "candidate-code-execution-v1" && messageBody?.candidateInteractionId) {
      try {
        await processCandidateCodeExecution(messageBody);
      } catch (e) {
        console.error(
          `[candidate-code] request ${messageBody.candidateInteractionId} failed:`,
          e
        );
      }
      continue;
    }
    if (jobType === "candidate-knowledge-response-v2" && messageBody?.candidateInteractionId) {
      try {
        await processCandidateKnowledgeResponse(messageBody);
      } catch (e) {
        console.error(
          `[candidate-knowledge] request ${messageBody.candidateInteractionId} failed:`,
          e
        );
      }
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

function responseUsedManagedCodeExecution(content) {
  return content.some((item) =>
    item && typeof item === "object" && (
      item.type === "code_execution_tool_result" ||
      item.type === "bash_code_execution_tool_result" ||
      (item.type === "server_tool_use" && (
        item.name === "code_execution" ||
        item.name === "bash_code_execution" ||
        item.name === "text_editor_code_execution"
      ))
    )
  );
}

async function markCandidateCodeFailed(pool, interactionId) {
  await pool.query(
    `UPDATE recruitment_interactions
     SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
     WHERE id = $1::uuid`,
    [
      interactionId,
      JSON.stringify({
        responseStatus: "failed",
        responseKind: "code_execution",
        responseError: "The managed Python run failed. Please try the request again.",
        codeExecutionStatus: "failed",
        codeExecutionError: "The managed Python run failed. Please try the request again.",
      }),
    ]
  );
}

async function markCandidateKnowledgeFailed(pool, interactionId) {
  await pool.query(
    `UPDATE recruitment_interactions
     SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
     WHERE id = $1::uuid`,
    [
      interactionId,
      JSON.stringify({
        responseStatus: "failed",
        responseKind: "knowledge",
        responseError: "The knowledge response could not be completed. Please try the request again.",
      }),
    ]
  );
}

function isTransientAnthropicError(error) {
  const status = error?.status;
  const errorType = error?.error?.error?.type;
  return (
    status === 429 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    status === 529 ||
    errorType === "overloaded_error" ||
    errorType === "rate_limit_error"
  );
}

async function createCandidateKnowledgeMessage(request) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await getAnthropic().messages.create(request);
    } catch (error) {
      lastError = error;
      if (!isTransientAnthropicError(error) || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 750 * (2 ** attempt)));
    }
  }
  throw lastError ?? new Error("Candidate knowledge request failed");
}

async function processCandidateKnowledgeResponse(job) {
  const pool = getPool();
  const interactionId = String(job.candidateInteractionId ?? "").trim();
  const expectedCandidateId = String(job.candidateId ?? "").trim();
  const threadKey = String(job.threadKey ?? "").trim();
  const assessmentMode = String(job.assessmentMode ?? "").trim();
  const policyPrompt = String(job.policyPrompt ?? "");
  const sources = Array.isArray(job.sources)
    ? job.sources.slice(0, 8).map((source) => ({
        id: String(source?.id ?? "").trim().slice(0, 200),
        title: String(source?.title ?? "").trim().slice(0, 500),
        text: String(source?.text ?? ""),
        openable: source?.openable !== false,
      })).filter((source) => source.id && source.title && source.text.trim())
    : [];
  const messages = Array.isArray(job.messages)
    ? job.messages.slice(-8).map((item) => ({
        role: item?.role === "assistant" ? "assistant" : "user",
        content: String(item?.content ?? ""),
      })).filter((item) => item.content.trim())
    : [];
  const sourceCharacters = sources.reduce((total, source) => total + source.text.length, 0);

  if (
    !interactionId ||
    !expectedCandidateId ||
    !threadKey ||
    !["EVIDENCE", "COPILOT", "OPEN_AGENT"].includes(assessmentMode) ||
    !policyPrompt ||
    policyPrompt.length > 30_000 ||
    sources.length === 0 ||
    sourceCharacters > 180_000 ||
    messages.length === 0
  ) {
    throw new Error("Invalid candidate knowledge-response payload");
  }

  const claimed = await pool.query(
    `UPDATE recruitment_interactions
     SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
     WHERE id = $1::uuid
       AND actor = 'candidate'
       AND COALESCE(metadata->>'responseStatus', 'queued') = 'queued'
     RETURNING candidate_id, task_number`,
    [
      interactionId,
      JSON.stringify({ responseStatus: "running", responseKind: "knowledge" }),
    ]
  );
  if (claimed.rowCount === 0) {
    console.warn(`[candidate-knowledge] request ${interactionId} was already claimed; skipping`);
    return;
  }

  const candidateId = claimed.rows[0].candidate_id;
  const taskNumber = claimed.rows[0].task_number;
  if (candidateId !== expectedCandidateId || taskNumber !== Number(job.taskNumber)) {
    await markCandidateKnowledgeFailed(pool, interactionId);
    throw new Error("Candidate knowledge-response identity mismatch");
  }

  const started = Date.now();
  const candidateMessage = [...messages].reverse().find((item) => item.role === "user")?.content ?? "";
  try {
    let completed = isEvidenceAuthorshipRequest(candidateMessage, assessmentMode)
      ? { response: null, structuredPayload: evidenceAuthorshipBoundaryResponse() }
      : null;
    let retryReason = "";
    for (let qualityAttempt = 0; !completed && qualityAttempt < 2; qualityAttempt += 1) {
      const response = await createCandidateKnowledgeMessage({
        model: CANDIDATE_KNOWLEDGE_MODEL,
        max_tokens: CANDIDATE_KNOWLEDGE_MAX_TOKENS,
        system: [{
          type: "text",
          text: buildCandidateKnowledgeSystemPrompt(policyPrompt, sources, retryReason),
          cache_control: { type: "ephemeral" },
        }],
        messages,
        tools: [CANDIDATE_KNOWLEDGE_TOOL],
        tool_choice: { type: "tool", name: CANDIDATE_KNOWLEDGE_TOOL.name },
      });
      if (response.stop_reason === "max_tokens") {
        retryReason = "The response reached the output limit before it was complete.";
        if (qualityAttempt === 0) continue;
        throw new Error(`Incomplete knowledge response (stop_reason=${response.stop_reason})`);
      }
      const toolBlock = response.content.find(
        (block) => block.type === "tool_use" && block.name === CANDIDATE_KNOWLEDGE_TOOL.name
      );
      const parsed = parseCandidateKnowledgeResponse(toolBlock?.input, assessmentMode);
      if (!parsed.ok) {
        retryReason = parsed.error;
        if (qualityAttempt === 0) continue;
        throw new Error(`Invalid knowledge response: ${parsed.error}`);
      }
      const structuredPayload = validateCandidateKnowledgeSources(parsed.value, sources);
      const qualityIssue = candidateKnowledgeQualityIssue(
        structuredPayload,
        candidateMessage,
        assessmentMode
      );
      if (qualityIssue) {
        retryReason = qualityIssue;
        if (qualityAttempt === 0) continue;
        throw new Error(`Unsafe or incomplete knowledge response: ${qualityIssue}`);
      }
      completed = { response, structuredPayload };
      break;
    }
    if (!completed) throw new Error("Candidate knowledge response did not complete");

    const { response, structuredPayload } = completed;
    const text = candidateKnowledgeResponseToText(structuredPayload);
    const sourceValidation = structuredPayload.evidenceCards.map((card) => ({
      evidenceCardId: card.id,
      sourceId: card.sourceId,
      status: card.verificationStatus,
      note: card.verificationNote,
    }));
    const responseModel = response ? CANDIDATE_KNOWLEDGE_MODEL : "policy-boundary-v1";
    const inputTokens = response?.usage?.input_tokens ?? 0;
    const outputTokens = response?.usage?.output_tokens ?? 0;
    const metadata = {
      model: responseModel,
      threadKey,
      requestInteractionId: interactionId,
      inputTokens,
      outputTokens,
      cacheCreationInputTokens: response?.usage?.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: response?.usage?.cache_read_input_tokens ?? 0,
      stopReason: response?.stop_reason ?? "policy_boundary",
      responseStatus: "completed",
      responseKind: "knowledge",
      elapsedMs: Date.now() - started,
    };

    await pool.query("BEGIN");
    try {
      await pool.query(
        `INSERT INTO recruitment_interactions
          (id, candidate_id, task_number, actor, content, token_count, metadata,
           structured_payload, schema_version, model, prompt_policy_version,
           assessment_mode, source_validation, content_version)
         VALUES ($1::uuid, $2, $3, 'ai', $4, $5, $6::jsonb,
                 $7::jsonb, $8, $9, $10, $11, $12::jsonb, $13)`,
        [
          randomUUID(),
          candidateId,
          taskNumber,
          text,
          outputTokens,
          JSON.stringify(metadata),
          JSON.stringify(structuredPayload),
          CANDIDATE_KNOWLEDGE_SCHEMA_VERSION,
          responseModel,
          CANDIDATE_KNOWLEDGE_POLICY_VERSION,
          assessmentMode,
          JSON.stringify(sourceValidation),
          CANDIDATE_KNOWLEDGE_CONTENT_VERSION,
        ]
      );
      await pool.query(
        `UPDATE recruitment_interactions
         SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
         WHERE id = $1::uuid`,
        [
          interactionId,
          JSON.stringify({ responseStatus: "completed", responseKind: "knowledge" }),
        ]
      );
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
    console.log(
      `[candidate-knowledge] request ${interactionId} completed in ${Date.now() - started}ms`
    );
  } catch (error) {
    await markCandidateKnowledgeFailed(pool, interactionId);
    throw error;
  }
}

async function processCandidateCodeExecution(job) {
  const pool = getPool();
  const interactionId = String(job.candidateInteractionId ?? "").trim();
  const expectedCandidateId = String(job.candidateId ?? "").trim();
  const threadKey = String(job.threadKey ?? "").trim();
  const assessmentMode = String(job.assessmentMode ?? "").trim();
  const systemPrompt = String(job.systemPrompt ?? "");
  const messages = Array.isArray(job.messages)
    ? job.messages.slice(-8).map((item) => ({
        role: item?.role === "assistant" ? "assistant" : "user",
        content: String(item?.content ?? ""),
      })).filter((item) => item.content.trim())
    : [];

  if (
    !interactionId ||
    !expectedCandidateId ||
    !threadKey ||
    !["EVIDENCE", "COPILOT", "OPEN_AGENT"].includes(assessmentMode) ||
    !systemPrompt ||
    systemPrompt.length > 150_000 ||
    messages.length === 0
  ) {
    throw new Error("Invalid candidate code-execution payload");
  }

  const claimed = await pool.query(
    `UPDATE recruitment_interactions
     SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
     WHERE id = $1::uuid
       AND actor = 'candidate'
       AND COALESCE(metadata->>'codeExecutionStatus', 'queued') = 'queued'
     RETURNING candidate_id, task_number`,
    [
      interactionId,
      JSON.stringify({
        codeExecutionStatus: "running",
        responseStatus: "running",
        responseKind: "code_execution",
      }),
    ]
  );
  if (claimed.rowCount === 0) {
    console.warn(`[candidate-code] request ${interactionId} was already claimed; skipping`);
    return;
  }

  const candidateId = claimed.rows[0].candidate_id;
  const taskNumber = claimed.rows[0].task_number;
  if (candidateId !== expectedCandidateId || taskNumber !== Number(job.taskNumber)) {
    await markCandidateCodeFailed(pool, interactionId);
    throw new Error("Candidate code-execution identity mismatch");
  }

  const started = Date.now();
  try {
    const response = await getAnthropic().messages.create({
      model: CANDIDATE_CODE_MODEL,
      max_tokens: CANDIDATE_CODE_MAX_TOKENS,
      system: [{
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      }],
      messages,
      tools: [CANDIDATE_CODE_TOOL],
      tool_choice: { type: "any" },
    });
    const codeExecutionUsed = responseUsedManagedCodeExecution(response.content);
    const text = response.content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n")
      .trim();
    if (!codeExecutionUsed || !text || response.stop_reason === "max_tokens") {
      throw new Error(`Incomplete managed execution (stop_reason=${response.stop_reason})`);
    }

    const metadata = {
      model: CANDIDATE_CODE_MODEL,
      threadKey,
      requestInteractionId: interactionId,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
      stopReason: response.stop_reason,
      codeExecutionEnabled: true,
      codeExecutionUsed: true,
      codeExecutionStatus: "completed",
      responseStatus: "completed",
      responseKind: "code_execution",
      elapsedMs: Date.now() - started,
    };

    await pool.query("BEGIN");
    try {
      await pool.query(
        `INSERT INTO recruitment_interactions
          (id, candidate_id, task_number, actor, content, token_count, metadata,
           model, prompt_policy_version, assessment_mode, content_version)
         VALUES ($1::uuid, $2, $3, 'ai', $4, $5, $6::jsonb, $7, $8, $9, $10)`,
        [
          randomUUID(),
          candidateId,
          taskNumber,
          text,
          response.usage.output_tokens,
          JSON.stringify(metadata),
          CANDIDATE_CODE_MODEL,
          "candidate-code-execution-v1",
          assessmentMode,
          "candidate-code-execution-v1",
        ]
      );
      await pool.query(
        `UPDATE recruitment_interactions
         SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
         WHERE id = $1::uuid`,
        [
          interactionId,
          JSON.stringify({
            codeExecutionStatus: "completed",
            responseStatus: "completed",
            responseKind: "code_execution",
          }),
        ]
      );
      await pool.query("COMMIT");
    } catch (e) {
      await pool.query("ROLLBACK");
      throw e;
    }
    console.log(
      `[candidate-code] request ${interactionId} completed in ${Date.now() - started}ms`
    );
  } catch (e) {
    await markCandidateCodeFailed(pool, interactionId);
    throw e;
  }
}

async function processValidationRun(runId) {
  const pool = getPool();
  const startedAt = new Date();
  const claimed = await pool.query(
    `UPDATE recruitment_scenario_validation_runs
     SET status = 'RUNNING', progress_stage = 'Preparing scenario snapshot', started_at = $2
     WHERE id = $1 AND status = 'QUEUED'
     RETURNING scenario_id, scenario_hash, scenario_snapshot`,
    [runId, startedAt]
  );
  if (claimed.rowCount === 0) {
    console.warn(`[validation-lab] run ${runId} not queued; idempotent skip`);
    return;
  }
  try {
    const scenarioId = claimed.rows[0].scenario_id;
    let snapshot = claimed.rows[0].scenario_snapshot;
    // New runs always carry the immutable canonical input. The fallback keeps
    // an already-queued pre-migration run recoverable without pretending it
    // represents a new hash.
    if (!snapshot || typeof snapshot !== "object") {
      const [scenarioRes, tasksRes, exhibitsRes, criteriaRes, mappingsRes] = await Promise.all([
        pool.query(`SELECT id, slug, title, organisation, position_title, default_total_minutes, assessment_mode, mode_policy_version, defence_enabled, defence_question_count, defence_minutes FROM recruitment_scenarios WHERE id = $1`, [scenarioId]),
        pool.query(`SELECT id, number, kind, title, brief_markdown, total_marks, system_prompt, exhibit_id, deliverable_label, deliverable_placeholder, config, rubric FROM recruitment_scenario_tasks WHERE scenario_id = $1 ORDER BY number`, [scenarioId]),
        pool.query(`SELECT id, source_id, title, html FROM recruitment_scenario_exhibits WHERE scenario_id = $1 ORDER BY id`, [scenarioId]),
        pool.query(`SELECT id, code, name, description, source_requirement, observable_behaviours, "order" FROM recruitment_scenario_criteria WHERE scenario_id = $1 ORDER BY "order"`, [scenarioId]),
        pool.query(`SELECT m.criterion_id, m.task_id, m.expected_candidate_evidence, m.rubric_element_ids, m.marks FROM recruitment_scenario_criterion_tasks m JOIN recruitment_scenario_criteria c ON c.id = m.criterion_id WHERE c.scenario_id = $1 ORDER BY m.criterion_id, m.task_id`, [scenarioId]),
      ]);
      if (!scenarioRes.rows[0]) throw new Error("Scenario no longer exists");
      snapshot = {
        ...scenarioRes.rows[0],
        tasks: tasksRes.rows,
        exhibits: exhibitsRes.rows,
        criteria: criteriaRes.rows.map((criterion) => ({ ...criterion, taskMappings: mappingsRes.rows.filter((mapping) => mapping.criterion_id === criterion.id) })),
      };
    }

    await pool.query(`UPDATE recruitment_scenario_validation_runs SET progress_stage = 'Reviewing criterion coverage' WHERE id = $1`, [runId]);
    const stream = getAnthropic().messages.stream({
      model: MODEL,
      max_tokens: 24_000,
      system: VALIDATION_SYSTEM_PROMPT,
      tools: [VALIDATION_REPORT_TOOL],
      tool_choice: { type: "tool", name: VALIDATION_REPORT_TOOL.name },
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      messages: [{ role: "user", content: buildValidationUserMessage(snapshot) }],
    });
    await pool.query(`UPDATE recruitment_scenario_validation_runs SET progress_stage = 'Simulating candidate responses' WHERE id = $1`, [runId]);
    const response = await stream.finalMessage();
    const tool = response.content.find((block) => block.type === "tool_use" && block.name === VALIDATION_REPORT_TOOL.name);
    if (!tool || !tool.input) throw new Error("Model did not return a validation report tool call");
    const report = tool.input;
    const current = await pool.query(`SELECT findings FROM recruitment_scenario_validation_runs WHERE id = $1`, [runId]);
    const deterministicFindings = Array.isArray(current.rows[0]?.findings) ? current.rows[0].findings : [];
    const aiFindings = Array.isArray(report.findings) ? report.findings.map((item, index) => ({ ...item, id: item.id || `ai-${index + 1}`, disposition: "open" })) : [];
    const allFindings = [...deterministicFindings, ...aiFindings];
    const openBlockers = allFindings.filter((item) => item.severity === "blocker" && item.disposition === "open").length;
    await pool.query(
      `UPDATE recruitment_scenario_validation_runs
         SET status = 'COMPLETED', progress_stage = 'Producing recommendations', overall_readiness = $2,
             findings = $3, synthetic_profiles = $4, policy_tests = $5, summary = $6,
             prompt_version = $7, completed_at = $8
       WHERE id = $1`,
      [runId, openBlockers ? "Human review required" : "Automated preflight complete", JSON.stringify(allFindings), JSON.stringify(report.syntheticProfiles ?? []), JSON.stringify(report.policyTests ?? []), String(report.summary ?? ""), VALIDATION_PROMPT_VERSION, new Date()]
    );
    console.log(`[validation-lab] run ${runId} completed; blockers=${openBlockers}`);
  } catch (error) {
    await pool.query(
      `UPDATE recruitment_scenario_validation_runs SET status = 'FAILED', progress_stage = 'Preflight failed', overall_readiness = 'Preflight required', error = $2, completed_at = $3 WHERE id = $1`,
      [runId, error?.message || String(error), new Date()]
    );
    throw error;
  }
}

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

  // Second call: author the marking rubric for the task we just designed,
  // while the model still has the exhibit fresh (warm prompt cache). This
  // FAILS SOFT — a rubric failure must not fail the job, because the task
  // itself is already valid and savable. On failure we store rubric: null
  // and the marking screen degrades to an empty rubric panel.
  let rubric = null;
  let rubricUsage = null;
  try {
    const result = await generateRubric(input, draft);
    rubric = result.categories;
    rubricUsage = result.usage;
  } catch (e) {
    console.error(
      `[task-generator] rubric generation failed for ${jobId} (task still saved):`,
      e
    );
  }

  await pool.query(
    `UPDATE recruitment_scenario_generation_jobs
       SET status = 'completed',
           result_json = $2,
           completed_at = $3
     WHERE id = $1`,
    [
      jobId,
      { task: draft, rubric, usage: mergeUsage(usage, rubricUsage) },
      new Date(),
    ]
  );

  const elapsed = Date.now() - startedAt.getTime();
  console.log(
    `[task-generator] job ${jobId} completed in ${elapsed}ms (rubric: ${rubric ? "ok" : "null"})`
  );
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

/**
 * Second Anthropic call: author the marking rubric for the task `draft`
 * we just generated. Mirrors callAnthropic — same model, streaming (to
 * dodge the SDK's non-streaming time-estimate guard with adaptive
 * thinking on), adaptive thinking, high effort — but swaps in the rubric
 * system prompt + tool and a smaller token budget. Returns the per-task
 * `categories` object (the stored rubric shape) plus usage.
 *
 * Throws on a missing/empty rubric; the caller treats any throw as
 * fail-soft (stores rubric: null) so a bad rubric never blocks the task.
 */
async function generateRubric(input, draft) {
  const client = getAnthropic();

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: RUBRIC_MAX_TOKENS,
    system: RUBRIC_SYSTEM_PROMPT,
    tools: [PROPOSE_RUBRIC_TOOL],
    tool_choice: { type: "auto" },
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    messages: [
      {
        role: "user",
        content: buildRubricUserMessageContent(input, draft),
      },
    ],
  });
  const response = await stream.finalMessage();

  const toolUse = response.content.find(
    (b) => b.type === "tool_use" && b.name === PROPOSE_RUBRIC_TOOL.name
  );
  if (!toolUse) {
    throw new Error(
      `Model did not call propose_rubric. stop_reason=${response.stop_reason}`
    );
  }

  const categories = toolUse.input?.categories;
  if (!categories || typeof categories !== "object") {
    throw new Error(
      `propose_rubric returned no categories object (stop_reason=${response.stop_reason})`
    );
  }
  // Minimum viable rubric: the technical category with at least one
  // embedded issue. Without that there's nothing for a marker to follow,
  // so reject (soft — caller stores rubric: null and the panel degrades).
  const technical = categories.technical;
  if (
    !technical ||
    !Array.isArray(technical.embedded_issues) ||
    technical.embedded_issues.length === 0
  ) {
    throw new Error(
      `propose_rubric output missing technical.embedded_issues (stop_reason=${response.stop_reason})`
    );
  }

  return {
    categories,
    usage: {
      input_tokens: response.usage?.input_tokens ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0,
      cache_creation_input_tokens:
        response.usage?.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: response.usage?.cache_read_input_tokens ?? 0,
    },
  };
}

/** Sum two usage objects field-by-field; either may be null. */
function mergeUsage(a, b) {
  const ua = a || {};
  const ub = b || {};
  return {
    input_tokens: (ua.input_tokens ?? 0) + (ub.input_tokens ?? 0),
    output_tokens: (ua.output_tokens ?? 0) + (ub.output_tokens ?? 0),
    cache_creation_input_tokens:
      (ua.cache_creation_input_tokens ?? 0) +
      (ub.cache_creation_input_tokens ?? 0),
    cache_read_input_tokens:
      (ua.cache_read_input_tokens ?? 0) + (ub.cache_read_input_tokens ?? 0),
  };
}
