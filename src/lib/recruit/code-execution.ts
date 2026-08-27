/**
 * Opt-in managed code execution for technical assessment tasks.
 *
 * The task flag lives in RecruitmentScenarioTask.config so the capability can
 * be added without a schema migration. Execution itself is performed by
 * Anthropic's server-side code-execution tool; application hosts never run
 * candidate/model-authored code.
 */

export const MANAGED_CODE_EXECUTION_TOOL = {
  // Current generally available runtime supported by Haiku 4.5. Candidate
  // runs execute in the long-running worker, outside Amplify's request limit.
  type: "code_execution_20250825",
  name: "code_execution",
} as const;

// Mirrored by lambda/task-generator/index.mjs because that package is
// deployed independently and cannot import application TypeScript.
export const MANAGED_CODE_EXECUTION_MODEL = "claude-haiku-4-5-20251001";
export const MANAGED_CODE_EXECUTION_MAX_TOKENS = 5000;

export const CODE_EXECUTION_SYSTEM_INSTRUCTIONS = `

MANAGED PYTHON EXECUTION
This task has an isolated Python sandbox. When the candidate asks you to run,
calculate, test, validate, simulate, or analyse something with code, use the
code-execution tool. Use only the fictional exercise data supplied in the
scenario and exhibit; the sandbox has no internet access.

For ordinary tabular analysis, make one concise, self-contained Python run.
Put the supplied data directly into the Python command with io.StringIO; do
not look for uploaded files or spend tool calls inspecting the filesystem.

In the final response after execution:
- state that the calculation was run, not merely drafted;
- reproduce the exact relevant Python in a fenced \`\`\`python block;
- reproduce material stdout/results in a fenced text block;
- distinguish observed output from interpretation, assumptions, and anything
  that still needs checking.

If execution fails or the tool is unavailable, say so plainly. Never invent
stdout or claim that generated code was executed when it was not.
`;

export function taskHasManagedCodeExecution(config: unknown): boolean {
  if (!config || typeof config !== "object" || Array.isArray(config)) return false;
  return (config as Record<string, unknown>).codeExecutionEnabled === true;
}

export function responseUsedManagedCodeExecution(content: readonly unknown[]): boolean {
  return content.some((block) => {
    if (!block || typeof block !== "object" || Array.isArray(block)) return false;
    const item = block as Record<string, unknown>;
    return (
      item.type === "code_execution_tool_result" ||
      item.type === "bash_code_execution_tool_result" ||
      (item.type === "server_tool_use" &&
        (item.name === "code_execution" || item.name === "bash_code_execution" || item.name === "text_editor_code_execution"))
    );
  });
}
