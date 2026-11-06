import mongoose, { Schema } from "mongoose";

const MessageSchema = new Schema({
    userId: {type: String, required:true, index: true},
    documentId: {type: String, required:true, index: true},
    role: {type: String, enum: ["user", "assistant"]},
    content: String,
    subject: { type: String, required: false},
    sources: {type: [Number], default: []},
    createdAt: {type: Date, default: Date.now},

});


export const Message = mongoose.model("Message", MessageSchema);