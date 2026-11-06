import "dotenv/config"
import { Job, Worker } from "bullmq";
import {Redis} from "ioredis";
import axios from "axios";

const connection = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
const RAG_URL = process.env.RAG_SERVICE_URL!;
const API_URL = process.env.API_URL!;
const TOKEN =  process.env.INTERNAL_API_TOKEN!;

const setStatus = (documentId: string, status: string, pages ?: number) =>
    axios.post(
        `${API_URL}/api/internal/documents/${documentId}/status`,
        {status,pages},
        {headers: {"x-internal-token": TOKEN}}
    );

const worker = new Worker("pdf-processing", async(job) => {
    const { documentId, title, category, subject, allowedRoles, downloadUrl} = job.data;
    console.log(`[worker] ingestion ${documentId} (attempt ${job.attemptsMade + 1})`);

    try{
        const { data } = await axios.post(
            `${RAG_URL}/ingest`,
            {documentId, title, category,subject, allowedRoles, downloadUrl},
            {timeout: 10 * 60 * 1000}
        );
        await setStatus(documentId, "ready", data.pages);
        console.log(`[worker] ready : ${documentId}`);

    }
    catch(err){
        if(job.attemptsMade + 1 >= (job.opts.attempts ?? 1)){
            await setStatus(documentId, "failed");
        }
        throw err;
    }
},
{connection, concurrency: 2}
);

worker.on("failed", (job, err) => console.error(`[worker] job ${job?.id} failed:`, err.message));
console.log("PDF Worker listening for jobs.");

