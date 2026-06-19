"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/admin/recruitment");
    }
  }, [status, router]);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    try {
      await signIn("cognito", { callbackUrl: "/admin/recruitment" });
    } catch {
      setIsSigningIn(false);
    }
  };

  if (status === "loading" || status === "authenticated") {
    return (
      <div className="uq-root min-h-screen flex items-center justify-center bg-uq-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-uq-accent-soft border-t-uq-accent" />
      </div>
    );
  }

  return (
    <div className="uq-root min-h-screen flex items-center justify-center px-4 py-12 bg-uq-bg">
      <div className="w-full max-w-md">
        <div className="rounded-2xl bg-uq-elev1 px-8 py-12 shadow-uq-glass">
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/logos/uniqassess-logo.png"
              alt="UNIQAssess"
              width={220}
              height={60}
              className="mx-auto mb-6 h-12 w-auto"
            />
            <h1 className="text-2xl font-bold tracking-tight text-uq">
              Sign in to UNIQAssess
            </h1>
            <p className="mt-2 text-sm text-uq-2">
              Recruiter &amp; marker access
            </p>
          </div>

          <div className="my-8 h-px bg-uq-bg2" />

          <button
            onClick={handleSignIn}
            disabled={isSigningIn}
            className="flex w-full items-center justify-center gap-3 rounded-lg bg-uq-accent px-4 py-3 text-base font-semibold text-[color:var(--uq-text-on-accent)] shadow-uq-glow-soft transition hover:bg-uq-accent-hover hover:shadow-uq-glow focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSigningIn ? (
              <>
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Redirecting…
              </>
            ) : (
              "Continue with single sign-on"
            )}
          </button>

          <p className="mt-6 text-center text-xs text-uq-3">
            Candidates: use the one-time link in your invitation email — you do
            not need to sign in here.
          </p>
        </div>
      </div>
    </div>
  );
}
