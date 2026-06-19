import type { ReactNode } from "react";

/**
 * Scopes the Observatory Dark theme to the whole admin group. The `.uq-dark`
 * class brings the design tokens into scope; `.uq-root` paints the fixed
 * ambient glow-grid backdrop once per page. The public landing/login (which
 * live outside this group) stay on the light root theme.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="uq-dark uq-root min-h-screen">{children}</div>;
}
