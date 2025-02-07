// src/index.ts
import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { scrape } from "./scraper";
import rateLimit from "express-rate-limit";
import compression from "compression";
import chrome, { ServiceBuilder } from "selenium-webdriver/chrome";
import { Builder } from "selenium-webdriver";
import { Semaphore } from "async-mutex";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5002; // Default to 5002 if not set
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || "WKkXEvIK2qyFMT0yAA9kqoStleFBEWvK";

// Add logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

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
// app.use(limiter);

// Create a semaphore to limit concurrent scraping to 3 at a time
// const scrapeSemaphore = new Semaphore(3);

// Scraping Endpoint
app.get("/scrape", async (req: Request, res: Response) => {
    const url = req.query.url as string;
    const apiKey = req.headers["authorization"];

    console.log(`[${new Date().toISOString()}] Received scrape request for URL: ${url}`);

    // Basic API Key Authentication
    if (apiKey !== `Bearer ${SCRAPER_API_KEY}`) {
        console.log(`[${new Date().toISOString()}] Authentication failed`);
        console.log(`Received: ${apiKey}`); // Add this to debug
        console.log(`Expected: Bearer ${SCRAPER_API_KEY}`); // Add this to debug
        return res.status(401).send("Unauthorized");
    }

    if (!url) {
        console.log(`[${new Date().toISOString()}] No URL provided`);
        return res.status(400).send("URL parameter is required");
    }

    try {
        console.log(`[${new Date().toISOString()}] Starting scrape for URL: ${url}`);
        const data = await scrape(url);
        console.log(`[${new Date().toISOString()}] Scrape completed successfully`);
        res.json(data);
    } catch (error: any) {
        console.error(`[${new Date().toISOString()}] Scrape error:`, error);
        if (error.message.includes("TimeoutError") || error.message.includes("too many requests")) {
            res.status(503).json({
                error: "Service temporarily unavailable",
                details: "Server is busy, please try again later",
            });
        } else {
            res.status(500).json({ error: "Scraping failed", details: error.message });
        }
    }
});

app.get("/health", async (req: Request, res: Response) => {
    try {
        const options = new chrome.Options();
        const service = new ServiceBuilder(process.env.CHROMEDRIVER_PATH || "");

        const driver = await new Builder().forBrowser("chrome").setChromeOptions(options).setChromeService(service).build();

        const version = await driver.getCapabilities().then((caps) => caps.getBrowserVersion());
        await driver.quit();

        res.status(200).json({
            status: "healthy",
            message: "Server is running",
            components: {
                server: "up",
                chrome: "up",
                chromeVersion: version,
            },
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        res.status(200).json({
            // Still return 200 for ALB health check
            status: "degraded",
            message: "Server is running but Chrome is not available",
            components: {
                server: "up",
                chrome: "down",
            },
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
        });
    }
});

app.listen(PORT, () => {
    console.log(`[${new Date().toISOString()}] Web scraper API starting...`);
    console.log(`[${new Date().toISOString()}] Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`[${new Date().toISOString()}] Port: ${PORT}`);
    console.log(`[${new Date().toISOString()}] Server is running at http://localhost:${PORT}`);
});
