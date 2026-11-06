"use client";
import { useParams } from "next/navigation";
import BackButton from "@/components/BackButton";
import ChatWindow from "@/components/ChatWindow";

export default function DocChat() {
  const params = useParams();
  const id = String(params?.id ?? "");

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-5"><BackButton label="Back to Library" /></div>
      <ChatWindow
        endpoint={`/api/chat/${id}/message`}
        title="Document Chat"
        subtitle="Answers come only from this document"
      />
    </div>
  );
}