import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { User } from "../models/User.js";
import { error } from "node:console";

export const loadRole = async (req: Request, res:Response, next: NextFunction) => {
    const { userId } = getAuth(req);
    const user = await User.findOne({clerkId:userId}).lean();
    res.locals.role = user?.role ?? "student";
    next();
};

export const requireRole = (...allowed: string[]) => 
    (req: Request, res: Response, next: NextFunction)=> allowed.includes(res.locals.role) ? next() : res.status(403).json({error: "Forbidden"}); 