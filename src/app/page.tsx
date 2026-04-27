"use client";

import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const CONTACT_EMAIL = "mattvalente85@gmail.com";

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
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/logos/meritia-logo-mark.svg"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8"
            />
            <span className="text-lg font-semibold tracking-tight">Meritia</span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=Meritia%20demo%20request`}
              className="hidden sm:inline-flex text-sm font-medium text-slate-700 hover:text-slate-900 px-3 py-2"
            >
              Request a demo
            </a>
            <button
              onClick={() => signIn("cognito", { callbackUrl: "/admin/recruitment" })}
              className="text-sm font-medium px-4 py-2 rounded-md border border-slate-300 hover:border-slate-400 transition"
            >
              Sign in
            </button>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-gradient-to-br from-navy-800 via-navy-700 to-navy-500 text-white">
        <div className="max-w-6xl mx-auto px-6 lg:px-8 py-20 lg:py-28">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/80">
              AI-era professional assessment
            </p>
            <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
              Hire for judgement, not for prompts.
            </h1>
            <p className="mt-6 text-lg sm:text-xl leading-relaxed text-white/80 max-w-2xl">
              Scenario-based competency simulations for professional hiring.
              Candidates work the case with live AI tools — you assess what
              they direct the AI to do, and what they decide it got wrong.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <a
                href={`mailto:${CONTACT_EMAIL}?subject=Meritia%20demo%20request`}
                className="inline-flex items-center px-6 py-3 rounded-md bg-white text-navy-700 font-semibold hover:bg-white/90 transition"
              >
                Request a demo
              </a>
              <button
                onClick={() => signIn("cognito", { callbackUrl: "/admin/recruitment" })}
                className="inline-flex items-center px-6 py-3 rounded-md bg-white/10 text-white font-semibold border border-white/20 hover:bg-white/15 transition"
              >
                Sign in
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 lg:py-24">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            What Meritia measures
          </h2>
          <p className="mt-3 text-slate-600 max-w-2xl">
            Three things traditional case interviews don&apos;t catch when
            candidates have AI in their pocket.
          </p>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                title: "Scenario judgement",
                body: "Candidates work a realistic role scenario — annual accounts, contract review, SOC alert cluster — and decide what matters and what doesn't. The AI gives data, not opinions.",
              },
              {
                title: "AI direction quality",
                body: "We capture the questions they ask, where they push back on the AI, and where they take it on faith. The interaction trail is part of the marking artefact.",
              },
              {
                title: "Professional output",
                body: "Final deliverables are memos and notes written for a named senior — the same shape as the work the role actually produces. Marked blind, revealed on click.",
              },
            ].map((card) => (
              <div
                key={card.title}
                className="rounded-xl border border-slate-200 p-6 hover:border-slate-300 transition"
              >
                <h3 className="font-semibold text-lg">{card.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  {card.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 lg:py-24 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Built-in role scenarios
          </h2>
          <p className="mt-3 text-slate-600 max-w-2xl">
            Production-quality simulations developed for international-organisation
            hiring. Available out of the box; bespoke scenarios on request.
          </p>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                role: "Finance & Accounting Manager",
                level: "P4",
                teaser:
                  "IPSAS compliance review and a politically charged cost-allocation analysis ahead of the management committee.",
              },
              {
                role: "Associate Policy Officer (Legal)",
                level: "P2",
                teaser:
                  "Commercial contract review and AI-cloud procurement risk assessment under tight legal-team headcount.",
              },
              {
                role: "Cybersecurity Operations Officer",
                level: "P3",
                teaser:
                  "Critique a misleading monthly SOC report and triage a six-alert overnight cluster against a miscalibrated AI copilot.",
              },
            ].map((s) => (
              <div
                key={s.role}
                className="rounded-xl bg-white border border-slate-200 p-6"
              >
                <span className="inline-block text-xs font-semibold text-navy-600 bg-navy-50 px-2 py-0.5 rounded">
                  {s.level}
                </span>
                <h3 className="mt-3 font-semibold text-lg leading-snug">
                  {s.role}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  {s.teaser}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 lg:py-24">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            How it works
          </h2>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                n: "01",
                t: "Pick a scenario, invite a cohort",
                b: "Recruiter chooses a built-in or bespoke scenario, sets open and close dates, and pastes a candidate list. Each candidate gets a one-time invitation URL.",
              },
              {
                n: "02",
                t: "Candidates work the case with AI",
                b: "Candidates complete a 90–120 minute simulation: scenario brief, exhibits, a live AI assistant scoped to data lookup, and a memo deliverable. Server-enforced timer, single-use token.",
              },
              {
                n: "03",
                t: "Mark blind, reveal on click",
                b: "Markers see anonymised submissions side-by-side with the AI interaction trail. Score per task. Names and emails stay hidden until you choose to reveal the cohort.",
              },
            ].map((step) => (
              <div key={step.n}>
                <div className="text-sm font-semibold text-navy-500 tracking-widest">
                  {step.n}
                </div>
                <h3 className="mt-3 font-semibold text-lg">{step.t}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  {step.b}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-navy-800 text-white">
        <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Run a live pilot with your next cohort
          </h2>
          <p className="mt-4 text-white/75 max-w-xl mx-auto">
            Two-week pilot, one role, up to 25 candidates. We provide the
            scenario, the platform, and the marking guide.
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=Meritia%20pilot%20enquiry`}
            className="mt-8 inline-flex items-center px-6 py-3 rounded-md bg-white text-navy-700 font-semibold hover:bg-white/90 transition"
          >
            Get in touch
          </a>
        </div>
      </section>

      <footer className="border-t border-slate-100 py-10">
        <div className="max-w-6xl mx-auto px-6 lg:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-sm text-slate-500">
          <div>© {new Date().getFullYear()} Meritia</div>
          <div className="flex items-center gap-6">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="hover:text-slate-700"
            >
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
