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
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-700" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-slate-50">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-slate-200 bg-white px-8 py-12 shadow-sm">
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/logos/uniqassess-logo.png"
              alt="UNIQAssess"
              width={220}
              height={60}
              className="mx-auto mb-6 h-12 w-auto"
            />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Sign in to UNIQAssess
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Recruiter &amp; marker access
            </p>
          </div>

          <div className="my-8 border-t border-slate-100" />

          <button
            onClick={handleSignIn}
            disabled={isSigningIn}
            className="flex w-full items-center justify-center gap-3 rounded-lg bg-slate-900 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
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

          <p className="mt-6 text-center text-xs text-slate-400">
            Candidates: use the one-time link in your invitation email — you do
            not need to sign in here.
          </p>
        </div>
      </div>
    </div>
  );
}
