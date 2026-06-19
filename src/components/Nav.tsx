"use client";

import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";

/**
 * Minimal admin nav. Hidden on:
 *   - the candidate assessment route (`/assess/*`) — candidates are
 *     token-authenticated and should not see platform chrome
 *   - the public landing + login pages when no session is present
 *
 * A sticky, translucent-white glass header. Design tokens (the uq-* utilities)
 * resolve from :root app-wide, so no theme wrapper is needed here. The
 * early-returns below are still load-bearing for visibility — keep them intact.
 */
export default function Nav() {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  if (pathname.startsWith("/assess")) return null;
  if (pathname === "/" && !session) return null;
  if (pathname === "/login") return null;

  const fromJdHref = "/admin/recruitment/scenarios/new/from-jd";
  const onFromJd = pathname === fromJdHref;
  const scenariosHref = "/admin/recruitment/scenarios";
  // "Scenarios" link is active when we're anywhere under /scenarios, but
  // not when we're specifically on the from-JD wizard (which has its
  // own highlighted entry).
  const onScenarios =
    pathname.startsWith(scenariosHref) && !onFromJd;

  return (
    <header className="sticky top-0 z-40 bg-uq-glass-strong text-uq backdrop-blur-xl border-b border-uq shadow-uq-e1">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            href={session ? "/admin/recruitment" : "/"}
            className="flex items-center flex-shrink-0"
          >
            <span className="bg-white rounded-md px-2 py-1 inline-flex items-center ring-1 ring-uq shadow-uq-glow-soft">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/logos/uniqassess-logo.png"
                alt="UNIQAssess"
                width={130}
                height={36}
                className="h-6 w-auto"
              />
            </span>
          </Link>

          {session && (
            <>
              <Link
                href={scenariosHref}
                aria-current={onScenarios ? "page" : undefined}
                className={`hidden sm:inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] ${
                  onScenarios
                    ? "bg-uq-accent-soft text-uq border border-uq-accent"
                    : "text-uq-2 hover:text-uq hover:bg-uq-elev2"
                }`}
                title="Scenario templates — including ones generated from a JD"
              >
                Scenarios
              </Link>
              <Link
                href={fromJdHref}
                aria-current={onFromJd ? "page" : undefined}
                className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] ${
                  onFromJd
                    ? "bg-uq-accent-soft text-uq border border-uq-accent"
                    : "text-uq-2 hover:text-uq hover:bg-uq-elev2"
                }`}
                title="Upload a job description and let Claude draft the scenario"
              >
                <span aria-hidden className="text-uq-accent">✨</span>
                Generate from JD
              </Link>
            </>
          )}
        </div>

        <div className="flex items-center gap-4">
          {status === "loading" ? (
            <div className="h-8 w-20 rounded-md bg-uq-elev2 border border-uq-faint animate-pulse" />
          ) : session ? (
            <>
              <span className="hidden sm:block text-sm text-uq-3 font-mono tracking-[0.01em] max-w-[200px] truncate">
                {session.user?.name || session.user?.email}
              </span>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="text-sm text-uq-3 hover:text-uq transition-colors rounded-md px-2 py-1 focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              onClick={() => signIn("cognito")}
              className="px-4 py-1.5 rounded-lg bg-uq-accent text-[color:var(--uq-text-on-accent)] text-sm font-medium tracking-[-0.005em] shadow-uq-glow-soft transition-all duration-150 hover:bg-uq-accent-hover hover:shadow-uq-glow active:translate-y-px focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
            >
              Sign in
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}
