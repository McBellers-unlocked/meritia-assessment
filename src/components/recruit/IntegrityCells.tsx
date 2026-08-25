"use client";

/**
 * Compact table-cell renderings of a candidate's integrity signals, shared by
 * the marking list and the results ranking. Tones are advisory heat, not
 * verdicts: pastes escalate on characters pasted, off-tab on total hidden
 * time. Zero renders as a muted dash so clean candidates stay visually quiet.
 */

export interface IntegritySignals {
  pasteCount: number;
  pasteChars: number;
  tabAways: number;
  offTabMs: number;
}

export function formatOffTab(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return rs ? `${m}m${String(rs).padStart(2, "0")}s` : `${m}m`;
}

function None() {
  return <span className="text-uq-3">—</span>;
}

export function PasteSignal({ i }: { i: IntegritySignals | undefined }) {
  if (!i || i.pasteCount === 0) return <None />;
  const tone =
    i.pasteChars >= 1000
      ? "text-[color:var(--uq-danger-text)]"
      : "text-[color:var(--uq-warn-text)]";
  return (
    <span className={`font-medium ${tone}`}>
      {i.pasteCount}
      <span className="font-normal opacity-80"> · {i.pasteChars.toLocaleString()}ch</span>
    </span>
  );
}

export function OffTabSignal({ i }: { i: IntegritySignals | undefined }) {
  if (!i || i.tabAways === 0) return <None />;
  const tone =
    i.offTabMs >= 5 * 60_000
      ? "text-[color:var(--uq-danger-text)]"
      : i.offTabMs >= 60_000
        ? "text-[color:var(--uq-warn-text)]"
        : "text-uq-2";
  return (
    <span className={`font-medium ${tone}`}>
      {i.tabAways}
      <span className="font-normal opacity-80"> · {formatOffTab(i.offTabMs)}</span>
    </span>
  );
}
