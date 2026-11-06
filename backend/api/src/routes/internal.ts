import { Router } from "express";
import { DocumentModel } from "../models/Documents.js";
import { error } from "node:console";

const internalRoutes = Router();

internalRoutes.post("/documents/:id/status", async(req, res) => {
    if(req.headers["x-internal-token"] !== process.env.INTERNAL_API_TOKEN)
        return res.status(401).json({error: "Unauthorized"});

    const { status, pages } = req.body;
    await DocumentModel.findByIdAndUpdate(req.params.id, {
        status, ...(pages ? { pages } : {}),
    });
    res.json({ok: true});
});

export default internalRoutes;