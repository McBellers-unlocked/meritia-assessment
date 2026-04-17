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

  if (error && !data) return <div className="max-w-4xl mx-auto p-8"><div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-md px-3 py-2">{error}</div></div>;
  if (!data) return <div className="max-w-4xl mx-auto p-8 text-sm text-slate-500">Loading…</div>;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="text-xs">
        <Link href={`/admin/recruitment/${params.id}`} className="text-[#4B92DB] hover:underline">← Dashboard</Link>
      </div>
      <h1 className="text-2xl font-semibold text-[#1B2A4A] mt-2">Candidates · {data.assessment.title}</h1>

      {/* Add */}
      <section className="mt-6 bg-white rounded-lg border border-slate-200 p-5">
        <h2 className="text-base font-semibold text-[#1B2A4A]">Add candidates</h2>
        <p className="text-sm text-slate-600 mt-1">
          Paste from a spreadsheet. Each line should contain a name and an email.
          Accepted formats: <code className="text-xs bg-slate-100 px-1 rounded">Name, email</code>,
          <code className="text-xs bg-slate-100 px-1 rounded ml-1">Name &lt;email&gt;</code>,
          or tab-separated.
        </p>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="Aisha Ahmed, aisha.ahmed@example.org&#10;James O'Brien <james.obrien@example.org>&#10;Marie Dupont&#9;marie.dupont@example.org"
          className="mt-3 w-full h-40 border border-slate-300 rounded-md p-3 text-sm font-mono"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={add}
            disabled={adding || !paste.trim()}
            className="px-4 py-2 rounded-md bg-[#1B2A4A] text-white text-sm font-semibold hover:bg-[#142338] disabled:bg-slate-300"
          >
            {adding ? "Adding…" : "Add candidates"}
          </button>
          {addResult && (
            <span className="text-sm text-slate-600">
              {addResult.created} added{addResult.skipped > 0 ? `, ${addResult.skipped} skipped (already invited)` : ""}.
            </span>
          )}
        </div>
        {error && <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
      </section>

      {/* Export */}
      <section className="mt-6 bg-white rounded-lg border border-slate-200 p-5">
        <h2 className="text-base font-semibold text-[#1B2A4A]">Export</h2>
        <p className="text-sm text-slate-600 mt-1 mb-3">CSV with name, email, token, and unique URL — ready for mail merge.</p>
        <a
          href={`/api/admin/recruitment/${params.id}/candidates.csv`}
          className="inline-block px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50"
        >
          Download CSV
        </a>
      </section>

      {/* List */}
      <section className="mt-6 bg-white rounded-lg border border-slate-200">
        <div className="px-5 py-3 border-b border-slate-200 text-sm font-semibold text-[#1B2A4A]">
          {data.candidates.length} candidate{data.candidates.length === 1 ? "" : "s"}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-3 py-2 text-left">Anon ID</th>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Email</th>
              <th className="px-3 py-2 text-left">Token</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">URL</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {data.candidates.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono text-xs">{c.anonymousId}</td>
                <td className="px-3 py-2">{c.name}</td>
                <td className="px-3 py-2 text-slate-600 text-xs">{c.email}</td>
                <td className="px-3 py-2 font-mono text-xs">{c.token}</td>
                <td className="px-3 py-2">
                  <span className={[
                    "inline-block px-2 py-0.5 text-xs rounded",
                    c.status === "submitted" ? "bg-green-100 text-green-800" :
                    c.status === "started" ? "bg-blue-100 text-blue-800" :
                    c.status === "expired" ? "bg-slate-200 text-slate-700" :
                    "bg-amber-100 text-amber-800",
                  ].join(" ")}>{c.status}</span>
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => void copy(c.assessmentUrl, c.id)}
                    className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
                    title={c.assessmentUrl}
                  >
                    {copiedId === c.id ? "Copied!" : "Copy URL"}
                  </button>
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => void remove(c)}
                    className="text-xs px-2 py-1 rounded border border-red-200 text-red-700 hover:bg-red-50"
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
          <div className="p-5 text-sm text-slate-500">No candidates yet. Add some above.</div>
        )}
      </section>
    </div>
  );
}
