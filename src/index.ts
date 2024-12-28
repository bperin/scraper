// src/index.ts
import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { scrape } from "./scraper";
import rateLimit from "express-rate-limit";
import compression from "compression";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5002;
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || "";

// Apply compression middleware
app.use(compression());

// Define rate limiting rules
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: "Too many requests from this IP, please try again later.",
});

// Apply rate limiting to all requests
app.use(limiter);

// Scraping Endpoint
app.get("/scrape", async (req: Request, res: Response) => {
    const url = req.query.url as string;
    const apiKey = req.headers["authorization"];

    // Basic API Key Authentication
    if (apiKey !== `Bearer ${SCRAPER_API_KEY}`) {
        return res.status(401).send("Unauthorized");
    }

    if (!url) {
        return res.status(400).send("URL parameter is required");
    }

    try {
        const data = await scrape(url);
        res.json({ text: data });
    } catch (error: any) {
        res.status(500).json({ error: "Scraping failed", details: error.message });
    }
});
app.get("/health", async (req: Request, res: Response) => {
    // Simplified health check endpoint to return a 200 and "ok" message
    res.status(200).send("ok");
});

app.listen(PORT, () => {
    console.log(`Web scraper API running on port ${PORT}`);
});
