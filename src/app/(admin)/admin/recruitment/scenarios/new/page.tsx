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
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="text-xs">
        <Link href="/admin/recruitment/scenarios" className="text-[#4B92DB] hover:underline">← Scenarios</Link>
      </div>
      <h1 className="text-2xl font-semibold text-[#1B2A4A] mt-2">New scenario</h1>
      <p className="text-sm text-slate-600 mt-1 mb-6">
        Start with the scenario&apos;s header information. You&apos;ll add tasks, exhibits, emails and chat scripts on the next page.
      </p>

      <section className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
        <label className="block text-sm">
          <span className="text-slate-600">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Finance and Accounting Manager (P4) — Technical Assessment"
            className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">URL slug</span>
          <input
            value={slug}
            onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()); }}
            placeholder="fam-p4-2026"
            className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
          />
          <span className="text-xs text-slate-500 mt-1 block">
            Used in candidate URLs: <code className="bg-slate-100 px-1 rounded">/assess/{slug || "..."}</code> · lowercase letters, numbers and hyphens only.
          </span>
        </label>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-slate-600">Organisation</span>
            <input
              value={organisation}
              onChange={(e) => setOrganisation(e.target.value)}
              placeholder="International Digital Services Centre (IDSC), Geneva"
              className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Position title</span>
            <input
              value={positionTitle}
              onChange={(e) => setPositionTitle(e.target.value)}
              placeholder="Finance and Accounting Manager (P4)"
              className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Default total minutes</span>
            <input
              type="number"
              value={defaultTotalMinutes}
              onChange={(e) => setDefaultTotalMinutes(e.target.value)}
              min={5}
              max={480}
              className="mt-1 block w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
            <span className="text-xs text-slate-500 mt-1 block">
              Shared time budget across all tasks. Admin can override per cohort.
            </span>
          </label>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-md px-3 py-2">{error}</div>}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link href="/admin/recruitment/scenarios" className="text-sm text-slate-600 hover:text-slate-900">Cancel</Link>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="px-4 py-2 rounded-md bg-[#1B2A4A] text-white text-sm font-semibold hover:bg-[#142338] disabled:bg-slate-300"
          >
            {submitting ? "Creating…" : "Create scenario"}
          </button>
        </div>
      </section>
    </div>
  );
}
