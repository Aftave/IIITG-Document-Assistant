import "dotenv/config";
import express from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { connectDB } from "./config/db.js";
import webhookRoutes from "./routes/webhook.js";
import documentRoutes from "./routes/documents.js";
import chatRoutes from "./routes/chat.js";
import internalRoutes from "./routes/internal.js";

const app = express();
await connectDB();

app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use("/api/webhooks", webhookRoutes);
app.use(express.json());
app.use(clerkMiddleware());

app.use("/api/documents", documentRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/internal", internalRoutes);
app.get("/health", (_, res) => res.json({ ok: true }));
console.log("RAG URL =", JSON.stringify(process.env.RAG_SERVICE_URL));
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`API on :${PORT}`));