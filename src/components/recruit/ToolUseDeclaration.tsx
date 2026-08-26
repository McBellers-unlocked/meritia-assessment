export const TOOL_OPTIONS = [
  ["integratedKnowledgeSystem", "Integrated UNIQAssess Knowledge System"],
  ["externalAiAssistant", "External AI assistant"],
  ["webSearch", "Web search"],
  ["personalNotes", "Personal notes"],
  ["officeSoftware", "Office software"],
  ["other", "Other tool"],
] as const;

export type ToolDeclarationValue = { tools: string[]; otherText: string };

export default function ToolUseDeclaration({ value, onChange }: { value: ToolDeclarationValue; onChange: (value: ToolDeclarationValue) => void }) {
  return (
    <fieldset className="mt-4 rounded-xl border border-uq-strong bg-uq-elev2 p-4">
      <legend className="px-1 text-sm font-semibold text-uq">Self-declared tool use</legend>
      <p className="text-xs leading-relaxed text-uq-3">Select the tools you used. This is a descriptive declaration, not verified telemetry.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {TOOL_OPTIONS.map(([id, label]) => (
          <label key={id} className="flex items-start gap-2 text-xs text-uq-2">
            <input type="checkbox" checked={value.tools.includes(id)} onChange={(event) => onChange({ ...value, tools: event.target.checked ? [...value.tools, id] : value.tools.filter((item) => item !== id) })} className="mt-0.5 accent-[color:var(--uq-accent)]" />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <label className="mt-3 block text-xs text-uq-2">Optional note<textarea value={value.otherText} onChange={(event) => onChange({ ...value, otherText: event.target.value.slice(0, 1_000) })} rows={2} className="mt-1 block w-full rounded-md border border-uq bg-uq-elev1 px-2.5 py-2 text-sm text-uq" /></label>
    </fieldset>
  );
}
