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
      <div className="uq-root min-h-screen flex items-center justify-center bg-uq-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-uq-accent-soft border-t-uq-accent" />
      </div>
    );
  }

  return (
    <div className="uq-root min-h-screen bg-uq-bg text-uq">
      <header className="bg-uq-glass backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/logos/uniqassess-logo.png"
              alt="UNIQAssess"
              width={180}
              height={48}
              className="h-9 w-auto"
            />
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=UNIQAssess%20demo%20request`}
              className="hidden sm:inline-flex text-sm font-medium text-uq-2 hover:text-uq px-3 py-2 rounded-lg transition focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
            >
              Request a demo
            </a>
            <button
              onClick={() => signIn("cognito", { callbackUrl: "/admin/recruitment" })}
              className="text-sm font-medium px-4 py-2 rounded-lg bg-uq-elev1 text-uq shadow-uq-e1 hover:shadow-uq-glass transition focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
            >
              Sign in
            </button>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 lg:px-8 py-20 lg:py-28">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-uq-accent">
              AI-era professional assessment
            </p>
            <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] text-uq">
              Hire for judgement, not for prompts.
            </h1>
            <p className="mt-6 text-lg sm:text-xl leading-relaxed text-uq-2 max-w-2xl">
              Scenario-based competency simulations for professional hiring.
              Candidates work the case with live AI tools — you assess what
              they direct the AI to do, and what they decide it got wrong.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <a
                href={`mailto:${CONTACT_EMAIL}?subject=UNIQAssess%20demo%20request`}
                className="inline-flex items-center px-6 py-3 rounded-xl bg-gradient-to-br from-uq-accent to-[#4338CA] text-[color:var(--uq-text-on-accent)] font-semibold shadow-uq-glow-soft hover:shadow-uq-glow transition focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
              >
                Request a demo
              </a>
              <button
                onClick={() => signIn("cognito", { callbackUrl: "/admin/recruitment" })}
                className="inline-flex items-center px-6 py-3 rounded-xl bg-uq-elev1 text-uq font-semibold shadow-uq-e1 hover:shadow-uq-glass transition focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
              >
                Sign in
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 lg:py-24">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-uq">
            What UNIQAssess measures
          </h2>
          <p className="mt-3 text-uq-2 max-w-2xl leading-relaxed">
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
                className="rounded-2xl bg-uq-elev1 p-6 shadow-uq-glass hover:shadow-uq-pop transition-shadow"
              >
                <h3 className="font-semibold text-lg text-uq">{card.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-uq-2">
                  {card.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 lg:py-24 bg-uq-bg2">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-uq">
            Built-in role scenarios
          </h2>
          <p className="mt-3 text-uq-2 max-w-2xl leading-relaxed">
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
                className="rounded-2xl bg-uq-elev1 p-6 shadow-uq-glass hover:shadow-uq-pop transition-shadow"
              >
                <span className="inline-block text-xs font-semibold text-uq-accent bg-uq-accent-soft px-2 py-0.5 rounded-md">
                  {s.level}
                </span>
                <h3 className="mt-3 font-semibold text-lg leading-snug text-uq">
                  {s.role}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-uq-2">
                  {s.teaser}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 lg:py-24">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-uq">
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
                <div className="text-sm font-semibold text-uq-accent tracking-widest">
                  {step.n}
                </div>
                <h3 className="mt-3 font-semibold text-lg text-uq">{step.t}</h3>
                <p className="mt-3 text-sm leading-relaxed text-uq-2">
                  {step.b}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 lg:py-24">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          <div className="rounded-2xl bg-uq-elev1 px-8 py-14 text-center shadow-uq-glass">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-uq">
              Run a live pilot with your next cohort
            </h2>
            <p className="mt-4 text-uq-2 max-w-xl mx-auto leading-relaxed">
              Two-week pilot, one role, up to 25 candidates. We provide the
              scenario, the platform, and the marking guide.
            </p>
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=UNIQAssess%20pilot%20enquiry`}
              className="mt-8 inline-flex items-center px-6 py-3 rounded-xl bg-gradient-to-br from-uq-accent to-[#4338CA] text-[color:var(--uq-text-on-accent)] font-semibold shadow-uq-glow-soft hover:shadow-uq-glow transition focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
            >
              Get in touch
            </a>
          </div>
        </div>
      </section>

      <footer className="py-10">
        <div className="max-w-6xl mx-auto px-6 lg:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-sm text-uq-3">
          <div>© {new Date().getFullYear()} UNIQAssess · Powered by UNICC</div>
          <div className="flex items-center gap-6">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="hover:text-uq transition"
            >
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
