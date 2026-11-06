"use client";
import { useAuth } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api";

type Msg = { role: "user" | "assistant"; content: string; sources?: number[] };

export default function ChatWindow({
  endpoint, title, subtitle,
}: { endpoint: string; title: string; subtitle: string }) {
  const { getToken, isLoaded } = useAuth();
  const [q, setQ] = useState("");
  const [chat, setChat] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLoaded) return;
    (async () => {
      try {
        const api = apiClient(await getToken());
        const { data } = await api.get(endpoint.replace(/\/message$/, "/history"));
        setChat(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to load history:", err);
      }
    })();
  }, [isLoaded, endpoint]);

  const send = async () => {
    if (!q.trim() || loading) return;
    const question = q.trim();
    setQ("");
    setChat((p) => [...p, { role: "user", content: question }]);
    setLoading(true);
    try {
      const api = apiClient(await getToken());
      const { data } = await api.post(endpoint, { question });
      setChat((p) => [...p, { role: "assistant", content: data.answer, sources: data.sources }]);
    } catch {
      setChat((p) => [...p, { role: "assistant", content: "Something went wrong. Please try again." }]);
    }
    setLoading(false);
  };

  return (
    <div className="flex h-[78vh] flex-col overflow-hidden rounded-3xl border border-black bg-white shadow-[8px_8px_0_0_#000]">
      <div className="bg-black px-6 py-5 text-white">
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        <p className="text-xs text-neutral-400">{subtitle}</p>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto bg-neutral-50 p-6">
        {chat.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-neutral-400">
            Ask anything.
          </div>
        )}
        {chat.map((m, i) => (
          <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role === "user"
                  ? "rounded-br-sm bg-black text-white"
                  : "rounded-bl-sm border border-black/20 bg-white text-black"
                }`}
            >
              {m.content}
            </div>
            {m.sources && m.sources.length > 0 && (
              <span className="mt-1 font-mono text-[11px] text-neutral-500">
                Pages: {m.sources.join(", ")}
              </span>
            )}
          </div>
        ))}
        {loading && <div className="animate-pulse font-mono text-xs text-neutral-500">Searching documents…</div>}
        <div ref={endRef} />
      </div>

      <div className="flex gap-3 border-t border-black bg-white p-4 text-black">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask a question…"
          className="flex-1 rounded-full border border-black bg-neutral-50 px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-black"
        />
        <button
          onClick={send}
          disabled={loading || !q.trim()}
          className="rounded-full bg-black px-7 py-3 text-sm font-bold text-white transition hover:bg-neutral-800 disabled:bg-neutral-300"
        >
          Send
        </button>
      </div>
    </div>
  );
}