import axios from "axios";
import { Router } from "express";
import { requireAuth, getAuth } from "@clerk/express";
import { DocumentModel } from "../models/Documents.js";
import { Message } from "../models/Message.js";
import { loadRole } from "../middleware/requireRole.js";
import { error } from "node:console";

const chatRoutes = Router();
const toClient = (m: any) => ({
  role: m.role === "user" ? "user" : "assistant",
  content: m.content,
  sources: m.sources ?? [],
});

chatRoutes.post("/:docId/message", requireAuth(), loadRole, async (req, res) => {
    const { userId } = getAuth(req);

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const docId = req.params.docId;

    if (typeof docId !== "string") {
        return res.status(400).json({ error: "Invalid document Id" });
    }

    const { question } = req.body;
    if (!question?.trim()) return res.status(400).json({ error: "Question Requires." });

    const doc = await DocumentModel.findOne({ _id: docId, allowedRoles: res.locals.role });
    if (!doc || doc.status !== "ready") return res.status(404).json({ error: "Document Unavailable." });


    const history = await Message.find({ userId, documentId: docId }).sort({ createdAt: -1 }).limit(6).lean();

    
    await Message.create({ userId, documentId: docId, role: "user", content: question });
    const { data } = await axios.post(`${process.env.RAG_SERVICE_URL}/query`, {
        documentId: docId,
        role: res.locals.role,
        question,
        history: history.reverse().filter((m) => m.content !== "Not found in the document.").map((m) => ({ role: m.role, content: m.content })),
    });
    const reply = await Message.create({
        userId, documentId: docId, role: "assistant", content: data.answer, sources: data.sources,
    });
    res.json({ answer: reply.content, sources: reply.sources })
});


chatRoutes.get("/:docId/history", requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const docId = String(req.params.docId ?? "");  
  if (!docId) return res.status(400).json({ error: "Invalid document Id" });

  const messages = await Message.find({ userId, documentId: docId })
    .sort({ createdAt: 1 })
    .lean();

  res.json(
    messages.map((m: any) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
      sources: m.sources ?? [],
    }))
  );
});


chatRoutes.get("/subject/:subject/history", requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const subject = String(req.params.subject ?? "");   // FIX: force a plain string
  if (!subject) return res.status(400).json({ error: "Invalid subject" });

  const messages = await Message.find({ userId, subject })
    .sort({ createdAt: 1 })
    .lean();

  res.json(
    messages.map((m: any) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
      sources: m.sources ?? [],
    }))
  );
});
export default chatRoutes;