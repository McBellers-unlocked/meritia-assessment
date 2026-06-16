/**
 * Central model configuration for the worker Lambda's Anthropic calls
 * (task generation + marking-rubric generation).
 *
 * This Lambda is packaged separately from the Next.js app and cannot import
 * from src/, so BUILDER_MODEL is duplicated here. It MUST stay in sync with
 * BUILDER_MODEL in src/lib/recruit/model-config.ts.
 */

/** Assessment Builder calls run by this worker (task + rubric). */
export const BUILDER_MODEL = "claude-opus-4-8";
