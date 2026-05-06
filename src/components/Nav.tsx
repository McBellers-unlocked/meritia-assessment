"use client";

import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";

/**
 * Minimal admin nav. Hidden on:
 *   - the candidate assessment route (`/assess/*`) — candidates are
 *     token-authenticated and should not see platform chrome
 *   - the public landing + login pages when no session is present
 */
export default function Nav() {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  if (pathname.startsWith("/assess")) return null;
  if (pathname === "/" && !session) return null;
  if (pathname === "/login") return null;

  const fromJdHref = "/admin/recruitment/scenarios/new/from-jd";
  const onFromJd = pathname === fromJdHref;

  return (
    <header className="bg-[#111] text-white">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            href={session ? "/admin/recruitment" : "/"}
            className="flex items-center flex-shrink-0"
          >
            <span className="bg-white rounded-md px-2.5 py-1 inline-flex items-center">
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
            <Link
              href={fromJdHref}
              aria-current={onFromJd ? "page" : undefined}
              className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition ${
                onFromJd
                  ? "bg-white/15 text-white"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              }`}
              title="Upload a job description and let Claude draft the scenario"
            >
              <span aria-hidden>✨</span>
              Generate from JD
            </Link>
          )}
        </div>

        <div className="flex items-center gap-4">
          {status === "loading" ? (
            <div className="h-8 w-20 bg-white/10 rounded animate-pulse" />
          ) : session ? (
            <>
              <span className="hidden sm:block text-sm text-white/50 max-w-[200px] truncate">
                {session.user?.name || session.user?.email}
              </span>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="text-sm text-white/40 hover:text-white transition"
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              onClick={() => signIn("cognito")}
              className="bg-white text-[#111] hover:bg-white/90 px-4 py-1.5 rounded text-sm font-medium transition"
            >
              Sign in
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}
