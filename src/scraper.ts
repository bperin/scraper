// src/scraper.ts
import puppeteer from "puppeteer";

interface ScrapedData {
    title: string;
    properties: Property[];
}

interface Property {
    name: string;
    price: string;
    url: string;
}

export async function scrape(url: string): Promise<ScrapedData> {
    const browser = await puppeteer.launch({
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();

    try {
        await page.goto(url, { waitUntil: "networkidle2" });

        // Example: Extract the page title
        const title = await page.title();

        // Example: Extract property details
        const properties: Property[] = await page.$$eval(".property-card", (cards) =>
            cards.map((card) => ({
                name: (card.querySelector(".property-name") as HTMLElement)?.innerText || "N/A",
                price: (card.querySelector(".property-price") as HTMLElement)?.innerText || "N/A",
                url: (card.querySelector("a") as HTMLAnchorElement)?.href || "#",
            }))
        );

        return { title, properties };
    } catch (error) {
        console.error("Scraping error:", error);
        throw error;
    } finally {
        await browser.close();
    }
}
