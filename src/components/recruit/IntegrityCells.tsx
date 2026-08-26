"use client";

/**
 * Compact, deliberately neutral work-provenance cells. These are factual
 * workspace records, not risk indicators or evidence of misconduct.
 */

export interface WorkProvenanceSignals {
  pasteCount: number;
  pasteChars: number;
  tabAways: number;
  offTabMs: number;
}
/** @deprecated Use WorkProvenanceSignals; retained for API compatibility. */
export type IntegritySignals = WorkProvenanceSignals;

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
  return (
    <span className="font-medium text-uq-2">
      {i.pasteCount}
      <span className="font-normal opacity-80"> · {i.pasteChars.toLocaleString()}ch</span>
    </span>
  );
}

export function OffTabSignal({ i }: { i: IntegritySignals | undefined }) {
  if (!i || i.tabAways === 0) return <None />;
  return (
    <span className="font-medium text-uq-2">
      {i.tabAways}
      <span className="font-normal opacity-80"> · {formatOffTab(i.offTabMs)}</span>
    </span>
  );
}
