/**
 * Opt-in managed code execution for technical assessment tasks.
 *
 * The task flag lives in RecruitmentScenarioTask.config so the capability can
 * be added without a schema migration. Execution itself is performed by
 * Anthropic's server-side code-execution tool; application hosts never run
 * candidate/model-authored code.
 */

export const MANAGED_CODE_EXECUTION_TOOL = {
  // The Python-only runtime is intentionally used for the candidate path:
  // it completes the demo analysis comfortably inside the app's 60-second
  // request ceiling, whereas the newer bash/file-operation loop can exceed it.
  type: "code_execution_20250522",
  name: "code_execution",
} as const;

export const CODE_EXECUTION_SYSTEM_INSTRUCTIONS = `

MANAGED PYTHON EXECUTION
This task has an isolated Python sandbox. When the candidate asks you to run,
calculate, test, validate, simulate, or analyse something with code, use the
code-execution tool. Use only the fictional exercise data supplied in the
scenario and exhibit; the sandbox has no internet access.

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
