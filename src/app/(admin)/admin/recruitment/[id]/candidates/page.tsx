"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

interface CandidateRow {
  id: string;
  anonymousId: string;
  name: string;
  email: string;
  token: string;
  status: string;
  startedAt: string | null;
  submittedAt: string | null;
  assessmentUrl: string;
}

export default function CandidatesPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { status: authStatus } = useSession();
  const [data, setData] = useState<{ assessment: { title: string }; candidates: CandidateRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [adding, setAdding] = useState(false);
  const [addResult, setAddResult] = useState<{ created: number; skipped: number } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (authStatus === "unauthenticated") router.push("/login");
  }, [authStatus, router]);

  const reload = async () => {
    try {
      const res = await fetch(`/api/admin/recruitment/${params.id}/candidates`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => { void reload(); }, [params.id]);

  const parseEntries = (text: string) => {
    const out: { name: string; email: string }[] = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      // Accept tab-separated, comma-separated, or "Name <email>" formats
      let name = "";
      let email = "";
      const angled = line.match(/^(.+?)\s*<\s*([^>]+)\s*>\s*$/);
      if (angled) {
        name = angled[1].trim();
        email = angled[2].trim();
      } else {
        const cells = line.split(/[,\t]/).map((s) => s.trim()).filter(Boolean);
        if (cells.length >= 2) {
          // Detect which cell has the @
          if (cells[0].includes("@")) { email = cells[0]; name = cells.slice(1).join(" "); }
          else { name = cells[0]; email = cells.slice(1).find((s) => s.includes("@")) || ""; }
        }
      }
      if (name && email) out.push({ name, email });
    }
    return out;
  };

  const add = async () => {
    setAdding(true);
    setAddResult(null);
    setError(null);
    try {
      const entries = parseEntries(paste);
      if (entries.length === 0) {
        setError("No valid lines parsed. Format: 'Name, email' or 'Name <email>' or 'Name\\temail' (one per line).");
        setAdding(false);
        return;
      }
      const res = await fetch(`/api/admin/recruitment/${params.id}/candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setAddResult({ created: body.created.length, skipped: body.skipped.length });
      setPaste("");
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // ignore
    }
  };

  const remove = async (c: CandidateRow) => {
    const warning = c.status === "invited"
      ? `Remove ${c.anonymousId} (${c.name})? They will no longer be able to use their access link.`
      : c.status === "submitted"
      ? `Remove ${c.anonymousId} (${c.name})? They have ALREADY SUBMITTED. Their memo and AI investigation trail will be permanently deleted. This cannot be undone.`
      : `Remove ${c.anonymousId} (${c.name})? They have started the assessment. Their work-in-progress will be permanently deleted. This cannot be undone.`;
    if (!window.confirm(warning)) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/recruitment/${params.id}/candidates/${c.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (error && !data) return <div className="max-w-4xl mx-auto p-8"><div className="rounded-md px-3 py-2 text-sm border border-[color:var(--uq-danger-line)] bg-[color:var(--uq-danger-soft)] text-[color:var(--uq-danger-text)]">{error}</div></div>;
  if (!data) return <div className="max-w-4xl mx-auto p-8 text-sm text-uq-3"><span className="font-mono text-[11px] uppercase tracking-[0.18em] text-uq-3 animate-pulse">Loading…</span></div>;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 animate-uq-rise">
      <div className="text-xs">
        <Link href={`/admin/recruitment/${params.id}`} className="font-mono text-[11px] uppercase tracking-[0.14em] text-uq-accent hover:text-uq-accent-hover hover:underline underline-offset-2 transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)] focus-visible:rounded-md">← Dashboard</Link>
      </div>
      <h1 className="text-2xl font-semibold tracking-[-0.01em] text-uq mt-2">Candidates · {data.assessment.title}</h1>

      {/* Add */}
      <section className="mt-6 rounded-xl border border-uq bg-uq-elev1 shadow-uq-glass p-5">
        <h2 className="text-base font-semibold tracking-[-0.005em] text-uq">Add candidates</h2>
        <p className="text-sm leading-relaxed text-uq-2 mt-1">
          Paste from a spreadsheet. Each line should contain a name and an email.
          Accepted formats: <code className="font-mono text-xs bg-uq-elev2 border border-uq-faint text-uq px-1.5 rounded">Name, email</code>,
          <code className="font-mono text-xs bg-uq-elev2 border border-uq-faint text-uq px-1.5 rounded ml-1">Name &lt;email&gt;</code>,
          or tab-separated.
        </p>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="Aisha Ahmed, aisha.ahmed@example.org&#10;James O'Brien <james.obrien@example.org>&#10;Marie Dupont&#9;marie.dupont@example.org"
          className="mt-3 w-full h-40 rounded-md border border-uq bg-uq-glass-subtle p-3 text-sm font-mono text-uq placeholder:text-uq-3 transition-shadow duration-150 focus:outline-none focus:border-uq-accent focus:bg-uq-elev1 focus:shadow-[var(--uq-glow-soft)] focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={add}
            disabled={adding || !paste.trim()}
            className="px-4 py-2 rounded-lg bg-uq-accent text-[color:var(--uq-text-on-accent)] text-sm font-medium tracking-[-0.005em] shadow-uq-glow-soft transition-all duration-150 hover:bg-uq-accent-hover hover:shadow-uq-glow active:translate-y-px disabled:bg-uq-elev2 disabled:text-uq-3 disabled:shadow-none disabled:cursor-not-allowed focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
          >
            {adding ? "Adding…" : "Add candidates"}
          </button>
          {addResult && (
            <span className="text-sm text-uq-2">
              {addResult.created} added{addResult.skipped > 0 ? `, ${addResult.skipped} skipped (already invited)` : ""}.
            </span>
          )}
        </div>
        {error && <div className="mt-3 text-sm rounded-md px-3 py-2 border border-[color:var(--uq-danger-line)] bg-[color:var(--uq-danger-soft)] text-[color:var(--uq-danger-text)]">{error}</div>}
      </section>

      {/* Export */}
      <section className="mt-6 rounded-xl border border-uq bg-uq-elev1 shadow-uq-glass p-5">
        <h2 className="text-base font-semibold tracking-[-0.005em] text-uq">Export</h2>
        <p className="text-sm leading-relaxed text-uq-2 mt-1 mb-3">CSV with name, email, token, and unique URL — ready for mail merge.</p>
        <a
          href={`/api/admin/recruitment/${params.id}/candidates.csv`}
          className="inline-block px-4 py-2 rounded-lg border border-uq bg-uq-glass-subtle text-uq-2 text-sm font-medium transition-colors hover:border-uq-strong hover:bg-uq-elev2 hover:text-uq focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
        >
          Download CSV
        </a>
      </section>

      {/* List */}
      <section className="mt-6 rounded-xl border border-uq bg-uq-elev1 shadow-uq-glass overflow-hidden">
        <div className="px-5 py-3 border-b border-uq-faint bg-uq-elev2 text-sm font-semibold text-uq">
          {data.candidates.length} candidate{data.candidates.length === 1 ? "" : "s"}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-uq-elev2 text-uq-3">
            <tr className="border-b border-uq-faint">
              <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">Anon ID</th>
              <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">Name</th>
              <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">Email</th>
              <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">Token</th>
              <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">Status</th>
              <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em]">URL</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {data.candidates.map((c) => (
              <tr key={c.id} className="border-t border-uq-faint transition-colors hover:bg-uq-elev2">
                <td className="px-3 py-2 font-mono tabular-nums text-xs text-uq-2">{c.anonymousId}</td>
                <td className="px-3 py-2 text-uq">{c.name}</td>
                <td className="px-3 py-2 text-uq-2 text-xs">{c.email}</td>
                <td className="px-3 py-2 font-mono tabular-nums text-xs text-uq-2">{c.token}</td>
                <td className="px-3 py-2">
                  <span className={[
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border",
                    c.status === "submitted" ? "bg-[var(--uq-success-soft)] border-[var(--uq-success-line)] text-[var(--uq-success-text)]" :
                    c.status === "started" ? "bg-uq-accent-soft border-uq-accent text-uq" :
                    c.status === "expired" ? "border-uq bg-uq-elev2 text-uq-2" :
                    "bg-[var(--uq-warn-soft)] border-[var(--uq-warn-line)] text-[var(--uq-warn-text)]",
                  ].join(" ")}>{c.status}</span>
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => void copy(c.assessmentUrl, c.id)}
                    className={[
                      "text-xs font-medium px-2.5 py-1 rounded-md border transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]",
                      copiedId === c.id
                        ? "border-uq-accent text-uq-accent"
                        : "border-uq text-uq-2 hover:border-uq-strong hover:bg-uq-elev2 hover:text-uq",
                    ].join(" ")}
                    title={c.assessmentUrl}
                  >
                    {copiedId === c.id ? "Copied!" : "Copy URL"}
                  </button>
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => void remove(c)}
                    className="text-xs font-medium px-2.5 py-1 rounded-md border border-[color:var(--uq-danger-line)] bg-[color:var(--uq-danger-soft)] text-[color:var(--uq-danger-text)] transition-colors hover:border-[color:var(--uq-danger)] focus-visible:outline-none focus-visible:[box-shadow:var(--uq-focus-ring)]"
                    title="Remove candidate"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.candidates.length === 0 && (
          <div className="p-5 text-sm text-uq-3">No candidates yet. Add some above.</div>
        )}
      </section>
    </div>
  );
}
