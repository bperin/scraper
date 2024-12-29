// src/index.ts
import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { scrape } from "./scraper";
import rateLimit from "express-rate-limit";
import compression from "compression";
import chrome, { ServiceBuilder } from "selenium-webdriver/chrome";
import { Builder } from "selenium-webdriver";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3100;
const SCRAPER_API_KEY = "WKkXEvIK2qyFMT0yAA9kqoStleFBEWvK";

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
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: "Scraping failed", details: error.message });
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
    console.log(`Web scraper API running on port ${PORT}`);
});
