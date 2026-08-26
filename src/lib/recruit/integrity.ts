/**
 * Legacy-named work-provenance aggregation over candidate activity events, shared by
 * the marking-list and results APIs (the per-candidate marking screen derives
 * the same numbers client-side in its ActivitySection). Advisory only — these
 * signals inform the marker's judgement and are never scored automatically.
 */
export interface IntegritySummary {
  pasteCount: number;
  pasteChars: number;
  /** Number of times the assessment tab was hidden (visibility_hidden events). */
  tabAways: number;
  /** Total time off-tab, summed from the hiddenMs recorded on visibility_visible. */
  offTabMs: number;
}

export function summarizeIntegrity(
  events: { eventType: string; metadata: unknown }[],
): IntegritySummary {
  const s: IntegritySummary = { pasteCount: 0, pasteChars: 0, tabAways: 0, offTabMs: 0 };
  for (const e of events) {
    const meta = (e.metadata ?? {}) as Record<string, unknown>;
    if (e.eventType === "paste") {
      s.pasteCount += 1;
      if (typeof meta.charCount === "number") s.pasteChars += meta.charCount;
    } else if (e.eventType === "visibility_hidden") {
      s.tabAways += 1;
    } else if (e.eventType === "visibility_visible") {
      if (typeof meta.hiddenMs === "number") s.offTabMs += meta.hiddenMs;
    }
  }
  return s;
}
