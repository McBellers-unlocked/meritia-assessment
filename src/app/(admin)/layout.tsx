import type { ReactNode } from "react";

/**
 * Admin group wrapper. Design tokens (the "Calm Light" system) live on :root,
 * so `.uq-root` here only paints the fixed ambient background wash once per
 * page and scopes the themed scrollbars/selection.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="uq-root min-h-screen">{children}</div>;
}
