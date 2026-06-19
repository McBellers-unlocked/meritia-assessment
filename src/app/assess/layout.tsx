import type { ReactNode } from "react";

/**
 * Candidate assessment wrapper (landing/consent, in-progress, submitted, error).
 * Design tokens (the "Calm Light" system) live on :root; `.uq-root` here only
 * paints the fixed ambient background wash once and scopes the themed
 * scrollbars/selection.
 */
export default function AssessLayout({ children }: { children: ReactNode }) {
  return <div className="uq-root min-h-screen">{children}</div>;
}
