"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

export default function NewScenarioPage() {
  const { status } = useSession();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [organisation, setOrganisation] = useState("");
  const [positionTitle, setPositionTitle] = useState("");
  const [defaultTotalMinutes, setDefaultTotalMinutes] = useState("90");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  // Auto-populate slug from title until the admin touches it manually. This
  // keeps the common case one-handed while letting power users override.
  useEffect(() => {
    if (slugTouched) return;
    const auto = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 40);
    setSlug(auto);
  }, [title, slugTouched]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/recruitment/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          slug: slug.trim(),
          organisation: organisation.trim(),
          positionTitle: positionTitle.trim(),
          defaultTotalMinutes: Number(defaultTotalMinutes) || 90,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      router.push(`/admin/recruitment/scenarios/${body.scenario.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = title && slug && organisation && positionTitle && !submitting;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 animate-uq-rise">
      <div className="text-xs">
        <Link href="/admin/recruitment/scenarios" className="font-mono text-[11px] uppercase tracking-[0.14em] text-uq-accent hover:text-uq-accent-hover hover:underline underline-offset-2 transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] focus-visible:rounded-md">← Scenarios</Link>
      </div>
      <h1 className="text-2xl font-semibold tracking-[-0.01em] text-uq mt-2">New scenario</h1>
      <p className="text-sm text-uq-2 mt-1 mb-6">
        Start with the scenario&apos;s header information. You&apos;ll add tasks, exhibits, emails and chat scripts on the next page.
      </p>

      <section className="rounded-xl border border-uq bg-uq-elev1 shadow-uq-glass p-5 space-y-4">
        <label className="block text-sm">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Finance and Accounting Manager (P4) — Technical Assessment"
            className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1"
          />
        </label>
        <label className="block text-sm">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">URL slug</span>
          <input
            value={slug}
            onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()); }}
            placeholder="fam-p4-2026"
            className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm font-mono text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1"
          />
          <span className="text-xs text-uq-3 mt-1 block">
            Used in candidate URLs: <code className="font-mono bg-uq-elev2 border border-uq-faint text-uq px-1.5 rounded">/assess/{slug || "..."}</code> · lowercase letters, numbers and hyphens only.
          </span>
        </label>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">Organisation</span>
            <input
              value={organisation}
              onChange={(e) => setOrganisation(e.target.value)}
              placeholder="International Digital Services Centre (IDSC), Geneva"
              className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1"
            />
          </label>
          <label className="block text-sm">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">Position title</span>
            <input
              value={positionTitle}
              onChange={(e) => setPositionTitle(e.target.value)}
              placeholder="Finance and Accounting Manager (P4)"
              className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1"
            />
          </label>
          <label className="block text-sm">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-uq-3">Default total minutes</span>
            <input
              type="number"
              value={defaultTotalMinutes}
              onChange={(e) => setDefaultTotalMinutes(e.target.value)}
              min={5}
              max={480}
              className="mt-1 block w-full rounded-md border border-uq bg-uq-glass-subtle px-3 py-2 text-sm text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:shadow-[var(--uq-glow-soft)] focus:bg-uq-elev1"
            />
            <span className="text-xs text-uq-3 mt-1 block">
              Shared time budget across all tasks. Admin can override per cohort.
            </span>
          </label>
        </div>

        {error && <div className="rounded-md px-3 py-2 text-sm border border-[color:var(--uq-danger-line)] bg-[color:var(--uq-danger-soft)] text-[color:var(--uq-danger-text)]">{error}</div>}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link href="/admin/recruitment/scenarios" className="text-sm text-uq-2 hover:text-uq transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] focus-visible:rounded-md">Cancel</Link>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="px-4 py-2 rounded-lg bg-uq-accent text-[color:var(--uq-text-on-accent)] text-sm font-medium shadow-uq-glow-soft transition-all duration-150 hover:bg-uq-accent-hover hover:shadow-uq-glow active:translate-y-px disabled:bg-uq-elev2 disabled:text-uq-3 disabled:shadow-none disabled:cursor-not-allowed focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
          >
            {submitting ? "Creating…" : "Create scenario"}
          </button>
        </div>
      </section>
    </div>
  );
}
