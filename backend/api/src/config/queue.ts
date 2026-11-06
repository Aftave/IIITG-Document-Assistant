import { Queue } from "bullmq";
import { Redis } from "ioredis";


export const connection = new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
});


export const pdfQueue = new Queue("pdf-processing", {
    connection,
    defaultJobOptions:{
        attempts: 3,
        backoff: {type: "exponential", delay: 2000},
        removeOnComplete: 100,
    },
});