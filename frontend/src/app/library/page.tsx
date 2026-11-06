"use client";
import { useAuth, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import BackButton from "@/components/BackButton";

type Doc = { _id: string; title: string; category: string; subject?: string; status: string };

export default function Library() {
  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === "admin";
  const { getToken, isLoaded } = useAuth();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoaded) return;
    (async () => {
      try {
        const api = apiClient(await getToken());
        const { data } = await api.get("/api/documents");
        console.log("documents response:", data);
        const list = Array.isArray(data) ? data : data.documents ?? data.docs ?? [];
        setDocs(list);
      } catch (err) {
        console.error("Failed to load documents:", err);
        setDocs([]);
      }
      setLoading(false);
    })();
  }, [isLoaded]);

  const remove = async (id: string) => {
    if (!confirm("Delete this document permanently?")) return;
    try {
      const api = apiClient(await getToken());
      await api.delete(`/api/documents/${id}`);
      setDocs((p) => p.filter((d) => d._id !== id));
    } catch {
      alert("Delete failed. Check that the RAG service (Colab) is running.");
    }
  };

  const groups: Record<string, Doc[]> = {};
  docs.forEach((d) => {
    const key = d.subject || "Unassigned";
    (groups[key] ||= []).push(d);
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6"><BackButton label="Home" /></div>
      <h1 className="mb-1 text-4xl font-black tracking-tight">Library</h1>
      <p className="mb-10 text-neutral-500">Pick a subject to chat across all its documents, or open a single document.</p>

      {loading && <p className="animate-pulse text-sm text-neutral-500">Loading…</p>}

      <div className="space-y-12">
        {Object.entries(groups).map(([subject, list]) => (
          <section key={subject}>
            <div className="mb-4 flex items-center justify-between border-b border-black pb-3">
              <h2 className="text-2xl font-bold">
                {subject} <span className="text-sm font-normal text-neutral-400">({list.length} docs)</span>
              </h2>
              {subject !== "Unassigned" && (
                <Link
                  href={`/library/subject/${encodeURIComponent(subject)}`}
                  className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800"
                >
                  Chat with all →
                </Link>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((d) => (
                <Link
                  key={d._id}
                  href={d.status === "ready" ? `/library/${d._id}` : "#"}
                  className={`rounded-2xl border border-black p-5 transition ${d.status === "ready"
                    ? "hover:-translate-y-1 hover:shadow-[6px_6px_0_0_#000]"
                    : "cursor-not-allowed opacity-50"
                    }`}
                >
                  <span className="rounded-full bg-black px-3 py-1 text-[11px] font-semibold uppercase text-white">
                    {d.category}
                  </span>
                  <h3 className="mt-3 font-semibold leading-snug">{d.title}</h3>
                  <p className="mt-2 text-xs text-neutral-500">
                    {d.status === "ready" ? "Open chat →" : `Status: ${d.status}`}
                  </p>
                  {isAdmin && (
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); remove(d._id); }}
                      className="mt-3 rounded-full border border-black px-3 py-1 text-xs font-semibold transition hover:bg-black hover:text-white"
                    >
                      Delete
                    </button>
                  )}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}