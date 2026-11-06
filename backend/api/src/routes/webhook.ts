import { Router } from "express";
import express from "express";
import { Webhook } from "svix";
import { User } from "../models/User.js";
import { ROLES } from "../config/constants.js";

const webhookRoutes = Router();

webhookRoutes.post("/clerk", express.raw({ type: "application/json" }), async (req, res) => {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error("CLERK_WEBHOOK_SECRET is missing in .env");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const wh = new Webhook(secret);

  try {
    wh.verify(req.body, {
      "svix-id": req.headers["svix-id"] as string,
      "svix-timestamp": req.headers["svix-timestamp"] as string,
      "svix-signature": req.headers["svix-signature"] as string,
    });
  } catch (err) {
    console.error("Webhook verification failed:", err);
    return res.status(400).json({ error: "Invalid webhook signature" });
  }

  let evt: any;
  try {
    evt = JSON.parse(req.body.toString("utf8"));
  } catch (err) {
    console.error("Failed to parse body JSON:", err);
    return res.status(400).json({ error: "Malformed JSON" });
  }

  if (!evt || !evt.data) {
    console.error("Parsed event missing data:", evt);
    return res.status(400).json({ error: "Malformed event" });
  }

  const { id, email_addresses, first_name, last_name, public_metadata } = evt.data;

  if (evt.type === "user.deleted") {
    await User.deleteOne({ clerkId: id });
    return res.json({ ok: true });
  }

  if (evt.type === "user.created" || evt.type === "user.updated") {
    const requested = public_metadata?.role;
    const role = ROLES.includes(requested) ? requested : "student";
    await User.findOneAndUpdate(
      { clerkId: id },
      {
        clerkId: id,
        email: email_addresses?.[0]?.email_address,
        firstname: first_name,
        lastname: last_name,
        role,
      },
      { upsert: true, new: true }
    );
  }

  res.json({ ok: true });
});

export default webhookRoutes;