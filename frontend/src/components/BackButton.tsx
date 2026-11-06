"use client";
import { useRouter } from "next/navigation";

export default function BackButton({ label = "Back" }: { label?: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      className="group inline-flex items-center gap-2 rounded-full border border-black bg-black text-white px-4 py-2 text-sm font-medium transition hover:bg-white hover:text-black"
    >
      <span className="transition-transform group-hover:-translate-x-1">←</span>
      {label}
    </button>
  );
}