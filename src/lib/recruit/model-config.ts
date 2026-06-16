/**
 * Central model configuration for every Claude (Anthropic) API call the
 * platform makes. Import from here instead of hardcoding a model id at a
 * call site, so the builder/runtime tiers can be changed in one place.
 *
 * Two tiers:
 *   - BUILDER_MODEL — the Assessment Builder (JD → scenario: title,
 *     criteria, task, rubric). Quality-first; runs off the candidate path,
 *     so it is pinned to the most capable model.
 *   - RUNTIME_MODEL — the candidate-facing in-scenario knowledge systems
 *     and the persona chatbot. Latency- and cost-sensitive; overridable per
 *     deployment via the RECRUIT_CLAUDE_MODEL env var.
 *
 * The worker Lambda (lambda/task-generator/) is packaged separately and
 * cannot import from src/; it carries its own copy of BUILDER_MODEL in
 * lambda/task-generator/model-config.mjs — keep the two in sync.
 */

/** Assessment Builder calls (title, criteria, task, rubric). */
export const BUILDER_MODEL = "claude-opus-4-8";

/** Candidate-runtime calls (knowledge systems + persona chatbot). */
export const RUNTIME_MODEL =
  process.env.RECRUIT_CLAUDE_MODEL || "claude-sonnet-4-6";

/** Max output tokens for candidate-runtime calls. */
export const RUNTIME_MAX_TOKENS = Number(
  process.env.RECRUIT_MAX_TOKENS || "1500"
);
