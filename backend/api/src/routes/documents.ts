import { application, Router } from "express";
import multer from "multer";
import axios from "axios";
import { randomUUID } from "crypto";
import { getAuth, requireAuth } from "@clerk/express";
import { PutObjectCommand, GetObjectCommand,DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3Client } from "@aws-sdk/client-s3";
import { pdfQueue } from "../config/queue.js";
import { DocumentModel } from "../models/Documents.js";
import { Message } from "../models/Message.js";
import { loadRole, requireRole } from "../middleware/requireRole.js";
import { ROLES, CATAGORIES } from "../config/constants.js";
import { error } from "console";
import { s3Client } from "../config/s3.js";

const documentRoutes = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits:{fileSize: 50 * 1024 * 1024},
});

documentRoutes.post(
    "/upload",
    requireAuth(),
    loadRole,
    requireRole("admin"),
    upload.single("file"),
    async (req, res) => {
        const { userId } = getAuth(req);
        if(!req.file) return res.status(400).json({error: "PDF required"});;
        if(req.file.mimetype !== "application/pdf") return res.status(400).json({error: "Only PDF allowed."});

        const { title, category, subject } = req.body;
        if (!title || !CATAGORIES.includes(category)){
            return res.status(400).json({error: "Required valid title and category."});
        } 

        const requested: string[] = ([] as string[]).concat(req.body.allowedRoles ?? []);
        const allowedRoles = [...new Set([...requested.filter((r) => ROLES.includes(r)), "admin"])];

        const s3Key = `institute-docs/${category}/${randomUUID()}-${req.file.originalname}`;
        await s3Client.send(
            new PutObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET!,
                Key: s3Key,
                Body: req.file.buffer,
                ContentType: "application/pdf",
            })
        );

        const doc = await DocumentModel.create({
            title,
            filename: req.file.originalname,
            category,
            subject,
            s3Key,
            allowedRoles,
            uploadedBy: userId,
            status: "processing",
        });

        const downloadUrl = await getSignedUrl(
            s3Client,
            new GetObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET!,
                Key: s3Key,
            }),
            {expiresIn: 3600}
        );

        await pdfQueue.add("process-pdf", {
            documentId: doc._id.toString(),
            title,
            category,
            subject,
            allowedRoles,
            downloadUrl,
        });

        res.json({document: doc});

    }
);

documentRoutes.get("/", requireAuth(), loadRole, async (req, res) => {
    const filter: Record<string, unknown> = {
        allowedRoles: res.locals.role,
        status: {$ne: "failed"},
    };
    if(req.query.category) filter.category = req.query.category;

    const documents = await DocumentModel.find(filter).select("title category subject status pages createdAt").sort({createdAt: -1});
    res.json({documents});
});


documentRoutes.get("/:id", requireAuth(), loadRole, async(req, res)=>{
    const doc = await DocumentModel.findOne({
        _id: req.params.id,
        allowedRoles: res.locals.role,
    }).select("title category subject status pages");

    if(!doc) return res.status(404).json({error: "Not found"});

    res.json({document: doc});
});


documentRoutes.delete("/:id", requireAuth(), loadRole, requireRole("admin"), async(req,res)=>{
    const doc = await DocumentModel.findById(req.params.id);
    if(!doc) return res.status(404).json({error: "Not found"});

    const docId = doc._id.toString();
    await s3Client.send(new DeleteObjectCommand({
        Bucket:  process.env.AWS_S3_BUCKET!,
        Key: doc.s3Key!,
    }));
    await axios.post(`${process.env.RAG_SERVICE_URL}/delete-document`, { documentId: docId });
    await Message.deleteMany({documentId: docId});
    await doc.deleteOne();
    res.json({ok: true});
});

export default documentRoutes;