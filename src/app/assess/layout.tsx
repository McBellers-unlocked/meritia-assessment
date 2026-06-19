import type { ReactNode } from "react";

/**
 * Scopes the Observatory Dark theme to the candidate assessment experience
 * (landing/consent, in-progress, submitted, and error states). `.uq-dark`
 * brings the tokens into scope; `.uq-root` paints the fixed ambient glow-grid
 * backdrop once. The candidate is token-authenticated here, so this never
 * touches the public marketing pages.
 */
export default function AssessLayout({ children }: { children: ReactNode }) {
  return <div className="uq-dark uq-root min-h-screen">{children}</div>;
}
