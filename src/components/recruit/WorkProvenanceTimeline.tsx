import { provenanceEventLabel, WORK_PROVENANCE_POLICY_NOTE } from "@/lib/recruit/provenance";

type TimelineEvent = { id: string; occurredAt: string; eventType: string; taskNumber: number | null; metadata: Record<string, unknown> | null };
type TimelineInteraction = { id: string; timestamp: string; actor: string; taskNumber: number; content: string };
type TimelineEvidence = { id: string; createdAt: string; updatedAt: string; taskNumber: number; claim: string; candidateDisposition: string; sourceTitle: string | null };

export default function WorkProvenanceTimeline({
  events,
  interactions,
  evidence,
  taskNumber,
}: {
  events: TimelineEvent[];
  interactions: TimelineInteraction[];
  evidence: TimelineEvidence[];
  taskNumber?: number;
}) {
  const items = [
    ...events
      .filter((event) => taskNumber === undefined || event.taskNumber === null || event.taskNumber === taskNumber)
      .map((event) => ({ id: `event-${event.id}`, at: event.occurredAt, label: provenanceEventLabel(event.eventType), detail: eventDetail(event), taskNumber: event.taskNumber })),
    ...interactions
      .filter((item) => taskNumber === undefined || item.taskNumber === taskNumber)
      .map((item) => ({ id: `interaction-${item.id}`, at: item.timestamp, label: item.actor === "candidate" ? "Knowledge System question" : "AI-powered Knowledge System response", detail: item.content.slice(0, 220), taskNumber: item.taskNumber })),
    ...evidence
      .filter((item) => taskNumber === undefined || item.taskNumber === taskNumber)
      .map((item) => ({ id: `evidence-${item.id}`, at: item.updatedAt || item.createdAt, label: `Evidence ${item.candidateDisposition.toLowerCase().replace(/_/g, " ")}`, detail: `${item.sourceTitle ? `${item.sourceTitle}: ` : ""}${item.claim}`.slice(0, 220), taskNumber: item.taskNumber })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return (
    <section className="rounded-xl border border-uq bg-uq-elev1 p-4 shadow-uq-glass">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-accent">Work and evidence timeline{taskNumber ? ` · Task ${taskNumber}` : ""}</div>
      <p className="mt-1 text-xs leading-relaxed text-uq-3">{WORK_PROVENANCE_POLICY_NOTE} Focus changes and paste activity may have legitimate explanations; pasted content is not recorded.</p>
      {items.length === 0 ? <p className="mt-3 text-sm italic text-uq-3">No provenance records for this task.</p> : (
        <ol className="mt-4 space-y-3 border-l border-uq-strong pl-4">
          {items.map((item) => (
            <li key={item.id} className="relative text-xs">
              <span className="absolute -left-[19px] top-1.5 h-2 w-2 rounded-full border border-uq-strong bg-uq-elev1" aria-hidden />
              <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-medium text-uq">{item.label}</span><time className="font-mono text-[10px] text-uq-3">{new Date(item.at).toLocaleTimeString()}</time></div>
              {item.detail && <p className="mt-0.5 whitespace-pre-wrap leading-relaxed text-uq-2">{item.detail}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function eventDetail(event: TimelineEvent): string {
  const meta = event.metadata ?? {};
  if (event.eventType === "paste") return `${typeof meta.charCount === "number" ? meta.charCount.toLocaleString() : "Unknown"} characters pasted; content not recorded.`;
  if (event.eventType === "visibility_visible" && typeof meta.hiddenMs === "number") return `Focus returned after ${formatDuration(meta.hiddenMs)}.`;
  if (event.eventType === "tool_declaration") return "Candidate submitted a self-declared record of tools used.";
  return "";
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
