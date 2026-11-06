import mongoose, { Schema} from "mongoose";
import { CATAGORIES, ROLES } from "../config/constants.js";

const DocumentSchema = new Schema({
    title: {type: String, required: true},
    filename: String,
    category: {type: String, enum: CATAGORIES, required: true, index: true},
    s3Key: String,
    subject: { type: String, default: "", index: true },
    allowedRoles: {type: [String], enum: ROLES, default: ROLES, index:true},
    status: {type: String, enum: ["processing", "ready", "failed"], default: "processing"},
    pages: Number,
    uploadedBy: String,
    createdAt: {type: Date, default: Date.now},

});


export const DocumentModel = mongoose.model("Document", DocumentSchema)