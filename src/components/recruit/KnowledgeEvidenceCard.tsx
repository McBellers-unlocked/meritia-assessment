import type { KnowledgeEvidenceCard as EvidenceCard } from "@/lib/recruit/knowledge-response-schema";

const verificationLabel = (card: EvidenceCard) => {
  if (card.verificationStatus === "verified") return "From the supplied material";
  if (card.verificationStatus === "inference" || card.basis === "inference") return "AI interpretation";
  return "Check against the source";
};

export default function KnowledgeEvidenceCard({
  card,
  saved,
  onSave,
  onOpenSource,
}: {
  card: EvidenceCard;
  saved: boolean;
  onSave: () => void;
  onOpenSource: () => void;
}) {
  return (
    <article className="rounded-xl border border-uq bg-uq-glass-subtle p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-uq-strong bg-uq-elev2 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-uq-2">
          {verificationLabel(card)}
        </span>
        {card.relationship === "contradicts" && (
          <span className="rounded-full border border-uq-strong px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-uq-2">Contradictory evidence</span>
        )}
        <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-uq-3">{card.confidence} confidence</span>
      </div>
      <p className="mt-2 font-medium leading-relaxed text-uq">{card.claim}</p>
      {card.sourceExcerpt && <blockquote className="mt-2 border-l-2 border-uq-strong pl-2 text-uq-2">“{card.sourceExcerpt}”</blockquote>}
      <p className="mt-2 leading-relaxed text-uq-3">{card.explanation}</p>
      {card.verificationStatus === "unverified" && card.verificationNote && <p className="mt-1 text-[11px] text-uq-3">{card.verificationNote}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {card.sourceId && card.sourceOpenable !== false && (
          <button type="button" onClick={onOpenSource} className="rounded-md border border-uq-strong bg-uq-elev1 px-2.5 py-1 text-uq-2 hover:text-uq">
            Open source{card.sourceTitle ? ` · ${card.sourceTitle}` : ""}
          </button>
        )}
        <button type="button" onClick={onSave} disabled={saved} className="rounded-md border border-uq-strong bg-uq-elev1 px-2.5 py-1 text-uq-2 hover:text-uq disabled:opacity-60">
          {saved ? "Saved to evidence board" : "Save evidence"}
        </button>
      </div>
    </article>
  );
}
