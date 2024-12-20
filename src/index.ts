// src/index.ts
import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { scrape } from "./scraper";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || "";

app.get("/scrape", async (req: Request, res: Response) => {
    const url = req.query.url as string;
    const apiKey = req.headers["authorization"];

    // Basic API Key Authentication
    if (apiKey !== `Bearer ${SCRAPER_API_KEY}`) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    if (!url) {
        return res.status(400).json({ error: "URL parameter is required" });
    }

    try {
        const data = await scrape(url);
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: "Scraping failed", details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Web scraper API running on port ${PORT}`);
});
