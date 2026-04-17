"use client";

import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Minimal landing. Authenticated admins are routed to the recruitment list;
// anonymous visitors see a one-line explanation + sign-in button. Candidates
// never hit this page — they arrive via /assess/[slug]?token=... links.
export default function HomePage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/admin/recruitment");
    }
  }, [status, router]);

  if (status === "loading" || status === "authenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-700" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="max-w-xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">
          Meritia
        </h1>
        <p className="mt-2 text-sm font-medium uppercase tracking-widest text-slate-500">
          AI-Era Professional Assessment
        </p>
        <p className="mt-6 text-base leading-7 text-slate-600">
          Competency simulations for professional hiring. Candidates reach their
          assessment via a one-time link emailed to them. Recruiters and markers
          sign in below.
        </p>
        <button
          onClick={() => signIn("cognito", { callbackUrl: "/admin/recruitment" })}
          className="mt-8 px-6 py-3 rounded-md bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition"
        >
          Sign in
        </button>
      </div>
    </div>
  );
}
