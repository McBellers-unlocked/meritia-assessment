export type EvidenceBoardItem = {
  id: string;
  taskNumber: number;
  interactionId: string | null;
  evidenceCardId: string;
  claim: string;
  sourceId: string | null;
  sourceTitle: string | null;
  sourceExcerpt: string | null;
  sourceVerificationStatus: "VERIFIED" | "UNVERIFIED" | "INFERENCE";
  candidateDisposition: "SAVED" | "CHECKED" | "REJECTED" | "DISMISSED";
};

export default function CandidateEvidenceBoard({
  items,
  onDisposition,
  onRemove,
  onOpenSource,
  embedded = false,
}: {
  items: EvidenceBoardItem[];
  onDisposition: (id: string, disposition: EvidenceBoardItem["candidateDisposition"]) => void;
  onRemove: (id: string) => void;
  onOpenSource: (item: EvidenceBoardItem) => void;
  embedded?: boolean;
}) {
  return (
    <details className={embedded ? "bg-uq-elev1" : "border-t border-uq-faint bg-uq-glass-subtle"} open={embedded || items.length > 0}>
      <summary className={embedded ? "sr-only" : "cursor-pointer px-4 py-2 text-xs font-semibold text-uq"}>
        Evidence board <span className="font-mono font-normal text-uq-3">({items.length})</span>
      </summary>
      <div className={embedded ? "space-y-3 p-4" : "max-h-52 space-y-2 overflow-y-auto px-4 pb-3"}>
        {embedded && (
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-accent">Evidence board</div>
            <p className="mt-1 text-xs leading-relaxed text-uq-3">Save evidence from the AI, then check it against the exhibit before relying on it.</p>
          </div>
        )}
        {items.length === 0 && <p className="text-xs text-uq-3">Save evidence cards here, then check or reject them as you work.</p>}
        {items.map((item) => (
          <article key={item.id} className="rounded-lg border border-uq bg-uq-elev1 p-2.5 text-xs">
            <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-uq-3">
              {item.sourceVerificationStatus.replace(/_/g, " ")} · {item.candidateDisposition.toLowerCase().replace(/_/g, " ")}
            </div>
            <p className="mt-1 line-clamp-3 text-uq-2">{item.claim}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {item.sourceId && <button type="button" onClick={() => onOpenSource(item)} className="rounded border border-uq px-2 py-1 text-uq-2">Open source</button>}
              <button type="button" onClick={() => onDisposition(item.id, "CHECKED")} className="rounded border border-uq px-2 py-1 text-uq-2">Checked</button>
              <button type="button" onClick={() => onDisposition(item.id, "REJECTED")} className="rounded border border-uq px-2 py-1 text-uq-2">Reject</button>
              <button type="button" onClick={() => onDisposition(item.id, "DISMISSED")} className="rounded border border-uq px-2 py-1 text-uq-2">Dismiss</button>
              <button type="button" onClick={() => onRemove(item.id)} className="rounded px-2 py-1 text-uq-3 hover:text-uq">Remove</button>
            </div>
          </article>
        ))}
      </div>
    </details>
  );
}
