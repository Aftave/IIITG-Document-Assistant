import mongoose from "mongoose";
import { Schema } from "mongoose";
import { ROLES } from "../config/constants.js";


const UserSchema = new Schema({
    clerkId: {type: String, required: true, unique: true},
    email: String,
    firstname: String,
    lastname: String,
    role: {type: String, enum: ROLES, default: "student"},
    createdAt: {type: Date, default: Date.now},
});

export const User = mongoose.model("User", UserSchema);