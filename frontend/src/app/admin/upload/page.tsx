"use client";
import { useAuth, useUser } from "@clerk/nextjs";
import { useRef, useState } from "react";
import { apiClient } from "@/lib/api";
import { CATEGORIES } from "@/lib/constants";
import BackButton from "@/components/BackButton";

const ROLE_OPTIONS = ["student", "faculty", "staff"];

export default function AdminUpload() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [roles, setRoles] = useState<string[]>(ROLE_OPTIONS);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (isLoaded && user?.publicMetadata?.role !== "admin") {
    return <p className="p-10 text-center text-neutral-500">Admin only.</p>;
  }

  const toggleRole = (r: string) =>
    setRoles((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]));

  const submit = async () => {
    if (!file || !title || !subject) return;
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", title);
      fd.append("subject", subject.trim());
      fd.append("category", category);
      [...roles, "admin"].forEach((r) => fd.append("allowedRoles", r));

      const api = apiClient(await getToken());
      await api.post("/api/documents/upload", fd);
      setMsg({ ok: true, text: "Uploaded. Processing started." });
      setFile(null);
      setTitle("");
    } catch {
      setMsg({ ok: false, text: "Upload failed. Check the API terminal." });
    }
    setBusy(false);
  };

  const field = "w-full rounded-xl border border-black bg-white text-black px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-black";

  return (
    <div className="mx-auto max-w-xl px-6 py-8">
      <div className="mb-6"><BackButton label="Back" /></div>
      <h1 className="mb-1 text-3xl font-black tracking-tight">Upload Document</h1>
      <p className="mb-8 text-sm text-neutral-500">Documents with the same subject can be queried together.</p>

      <div className="space-y-5 ">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title" className={field} />
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject (e.g. Software Design)" className={field} />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={field}>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>

        <div>
          <p className="mb-2 text-sm font-semibold">Visible to</p>
          <div className="flex gap-2">
            {ROLE_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => toggleRole(r)}
                className={`rounded-full border border-black px-4 py-1.5 text-sm capitalize transition ${
                  roles.includes(r) ? "bg-black text-white" : "bg-white text-black hover:bg-neutral-100"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files?.[0];
            if (f?.type === "application/pdf") setFile(f);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-black px-6 py-10 text-center transition ${
            drag ? "bg-black text-white" : "bg-neutral-50 hover:bg-neutral-100"
          }`}
        >
          <div className="mb-2 text-3xl text-black">⬆</div>
          <p className="text-sm font-semibold text-black">{file ? file.name : "Click or drag a PDF here"}</p>
          <p className="text-xs opacity-60 text-black">PDF only</p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            hidden
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <button
          onClick={submit}
          disabled={!file || !title || !subject || busy}
          className="w-full rounded-full bg-black py-4 text-sm font-bold uppercase tracking-wider text-white transition hover:bg-neutral-800 disabled:bg-neutral-300"
        >
          {busy ? "Uploading…" : "Upload Document"}
        </button>

        {msg && (
          <p className={`text-center text-sm ${msg.ok ? "text-black" : "text-red-600"}`}>{msg.text}</p>
        )}
      </div>
    </div>
  );
}