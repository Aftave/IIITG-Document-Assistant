import axios from "axios";

export const API_URL = process.env.NEXT_PUBLIC_API_URL!;

 export const apiClient = (token: string | null) => axios.create({
    baseURL: API_URL,
    headers: { Authorization: `Bearer ${token}` },
 });
