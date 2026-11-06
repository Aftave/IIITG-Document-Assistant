"use client";
import { useParams } from "next/navigation";
import BackButton from "@/components/BackButton";
import ChatWindow from "@/components/ChatWindow";

export default function SubjectChat() {
  const params = useParams();
  const name = decodeURIComponent(String(params?.subject ?? ""));

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-5"><BackButton label="Back to Library" /></div>
      <ChatWindow
        endpoint={`/api/chat/subject/${encodeURIComponent(name)}/message`}
        title={name}
        subtitle="Searching across all documents in this subject"
      />
    </div>
  );
}