"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  active: boolean;
  createdAt: string;
}

export default function AdminUsersList() {
  const { status } = useSession();
  const router = useRouter();
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const reload = async () => {
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRows(data.users);
      setCurrentUserId(data.currentUserId ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => { void reload(); }, []);

  const toggleActive = async (user: UserRow) => {
    setBusyId(user.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !user.active }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const activeAdminCount = rows?.filter((r) => r.role === "ADMIN" && r.active).length ?? 0;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#1B2A4A]">Admin users</h1>
          <p className="text-sm text-slate-600 mt-1">
            Admins are auto-created on first Cognito sign-in. Deactivate to revoke access on the next session refresh.
          </p>
        </div>
      </div>

      {error && <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}

      <section className="bg-white rounded-lg border border-slate-200">
        {rows === null && <div className="p-5 text-sm text-slate-500">Loading…</div>}
        {rows && rows.length === 0 && <div className="p-5 text-sm text-slate-500">No admins yet.</div>}
        {rows && rows.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Email</th>
                <th className="px-4 py-2 text-left">Role</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Created</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const isSelf = u.id === currentUserId;
                const isLastActiveAdmin = u.role === "ADMIN" && u.active && activeAdminCount <= 1;
                const disableDeactivate = isSelf || isLastActiveAdmin;
                return (
                  <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-[#1B2A4A]">
                      {u.name || <span className="text-slate-400">—</span>}
                      {isSelf && <span className="ml-2 text-xs text-slate-500">(you)</span>}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{u.email}</td>
                    <td className="px-4 py-2 text-slate-600">{u.role}</td>
                    <td className="px-4 py-2">
                      {u.active ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-200">Active</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">Deactivated</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-600">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {u.active ? (
                        <button
                          onClick={() => toggleActive(u)}
                          disabled={busyId === u.id || disableDeactivate}
                          title={
                            isSelf
                              ? "You cannot deactivate yourself"
                              : isLastActiveAdmin
                                ? "Cannot deactivate the last active admin"
                                : undefined
                          }
                          className="text-sm text-red-700 hover:text-red-900 disabled:text-slate-300 disabled:cursor-not-allowed"
                        >
                          {busyId === u.id ? "…" : "Deactivate"}
                        </button>
                      ) : (
                        <button
                          onClick={() => toggleActive(u)}
                          disabled={busyId === u.id}
                          className="text-sm text-[#4B92DB] hover:underline disabled:text-slate-300"
                        >
                          {busyId === u.id ? "…" : "Reactivate"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
