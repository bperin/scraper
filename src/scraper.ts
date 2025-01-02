// src/scraper.ts
import { Builder, By, until } from "selenium-webdriver";
import chrome, { ServiceBuilder } from "selenium-webdriver/chrome";

interface ScrapedData {
    main_text: string;
    reviews?: string[];
    amenities?: string[];
    photos?: string[];
}

// Create a function to get configured WebDriver
async function getDriver() {
    const options = new chrome.Options();
    // Always add headless and other required flags
    options.addArguments(
        "--headless=new", // Use new headless mode
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage"
    );
    // Add any additional flags from env
    options.addArguments(...(process.env.CHROME_FLAGS || "").split(" ").filter(Boolean));

    const service = new ServiceBuilder(process.env.CHROMEDRIVER_PATH || "");

    return new Builder().forBrowser("chrome").setChromeOptions(options).setChromeService(service).build();
}

export async function getMainText(url: string): Promise<string> {
    const driver = await getDriver();

    try {
        await driver.get(url);

        // Wait for main content to load - look for description section which indicates content is ready
        await driver.wait(until.elementLocated(By.css('div[data-section-id="DESCRIPTION_DEFAULT"], div[itemprop="description"]')), 10000);

        // Give a little extra time for dynamic content
        await driver.sleep(2000);

        const textContent: string = await driver.executeScript(() => {
            // Remove navigation, header, footer and other non-content elements
            const elementsToRemove = document.querySelectorAll(`
                script, style, noscript,
                nav, header, footer,
                [role="navigation"],
                [aria-label="Search"],
                [data-testid="modal-container"]
            `);
            elementsToRemove.forEach((el) => el.remove());

            let text = document.body.innerText;
            return text.trim().replace(/\s+/g, " ");
        });

        return textContent;
    } catch (error) {
        console.error("Main text scraping error:", error);
        throw error;
    }
}

export async function getReviews(url: string): Promise<string[]> {
    const driver = await getDriver();

    try {
        // Go to the reviews page without modal
        await driver.get(`${url}/reviews`);

        // Wait for reviews container with multiple possible selectors
        await driver.wait(
            until.elementLocated(
                By.css(`
            div[data-section-id="reviews-default"],
            div[data-section-id="REVIEWS_DEFAULT"],
            section[aria-label*="Reviews"],
            div[role="dialog"] div[data-review-id]
        `)
            ),
            10000
        );

        await driver.sleep(2000);

        // Scroll logic remains the same
        let previousHeight = 0;
        let currentHeight = 0;
        let attempts = 0;
        const maxAttempts = 50;

        do {
            previousHeight = await driver.executeScript("return document.documentElement.scrollHeight");
            await driver.executeScript("window.scrollTo(0, document.documentElement.scrollHeight)");
            await driver.sleep(1000);
            currentHeight = await driver.executeScript("return document.documentElement.scrollHeight");
            attempts++;
        } while (currentHeight > previousHeight && attempts < maxAttempts);

        // Try multiple selectors for review elements
        const reviewElements = await driver.findElements(
            By.css(`
            div[data-review-id] div[style*="line-height"],
            div[data-review-id] span[dir="ltr"],
            div[itemprop="review"] div[itemprop="text"],
            div[role="dialog"] div[data-review-id] span
        `)
        );

        const reviews = await Promise.all(
            reviewElements.map(async (el) => {
                try {
                    const text = await el.getText();
                    return text.trim();
                } catch (e) {
                    return "";
                }
            })
        );

        return [...new Set(reviews.filter((review) => review.length > 0))];
    } catch (error) {
        console.error("Reviews scraping error:", error);
        throw error;
    } finally {
        await driver.quit();
    }
}

export async function getAmenities(url: string): Promise<string[]> {
    const driver = await getDriver();

    try {
        await driver.get(`${url}/amenities`);
        await driver.sleep(5000);

        // Find all lists
        const lists = await driver.findElements(By.css('ul[role="list"]'));
        const amenities: string[] = [];

        // For each list, find all list items
        for (const list of lists) {
            const items = await list.findElements(By.css("li"));
            for (const item of items) {
                const text = await item.getText();
                if (text && !text.includes("Unavailable:") && !text.includes("Show all")) {
                    amenities.push(text.trim());
                }
            }
        }

        return [...new Set(amenities)]; // Remove duplicates
    } finally {
        await driver.quit();
    }
}

export async function getPhotos(url: string): Promise<string[]> {
    const driver = await getDriver();

    try {
        const modalUrl = `${url}?modal=PHOTO_TOUR_SCROLLABLE`;
        await driver.get(modalUrl);
        await driver.sleep(2000);

        // Wait for photos to load in modal
        await driver.wait(until.elementLocated(By.css("picture source[srcset]")), 10000);
        await driver.sleep(1000);

        // Scroll to load all photos
        let previousHeight = 0;
        let currentHeight = (await driver.executeScript("return document.body.scrollHeight")) as number;
        let attempts = 0;
        const maxAttempts = 20;

        while (previousHeight !== currentHeight && attempts < maxAttempts) {
            previousHeight = currentHeight;
            await driver.executeScript("window.scrollTo(0, document.body.scrollHeight)");
            await driver.sleep(2000);
            currentHeight = (await driver.executeScript("return document.body.scrollHeight")) as number;
            attempts++;
        }

        // Get all source elements and extract original image URLs
        const sourceElements = await driver.findElements(By.css("picture source[srcset]"));
        const photoUrls = await Promise.all(
            sourceElements.map(async (source) => {
                const srcset = await source.getAttribute("srcset");
                // Match the full URL pattern including /prohost-api/Hosting-{id}/original/
                const match = srcset.match(/https:\/\/.*?\/prohost-api\/Hosting-.*?\/original\/.*?\.jpeg/);
                return match ? match[0] : null;
            })
        );

        return photoUrls.filter((url): url is string => !!url);
    } catch (error) {
        console.error("Photo scraping error:", error);
        throw error;
    }
}

export async function scrape(url: string): Promise<ScrapedData> {
    if (!url.includes("airbnb.com/rooms/")) {
        return { main_text: await getMainText(url) };
    }

    const [mainText, reviews, amenities, photos] = await Promise.all([getMainText(url), getReviews(url), getAmenities(url), getPhotos(url)]);

    return { main_text: mainText, reviews, amenities, photos };
}
