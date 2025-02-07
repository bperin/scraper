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
    // Add required flags for headless mode
    options.addArguments(
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--window-size=1920,1080", // Set a good window size
        "--disable-blink-features=AutomationControlled", // Try to avoid detection
        "--start-maximized"
    );
    // Add any additional flags from env
    options.addArguments(...(process.env.CHROME_FLAGS || "").split(" ").filter(Boolean));

    const service = new ServiceBuilder(process.env.CHROMEDRIVER_PATH || "");
    return new Builder().forBrowser("chrome").setChromeOptions(options).setChromeService(service).build();
}

export async function getMainText(url: string): Promise<string> {
    const driver = await getDriver();
    let allText = [];

    try {
        // First get main page content
        await driver.get(url);
        await driver.sleep(2000);

        const mainText = await driver.executeScript(() => {
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

        allText.push(mainText);

        // Then get modal content
        await driver.get(`${url}?modal=DESCRIPTION`);
        await driver.sleep(2000);

        try {
            // Wait for "About this space" modal
            await driver.wait(until.elementLocated(By.css('div[role="dialog"][aria-label="About this space"]')), 10000);

            const modalText = await driver.executeScript(() => {
                const modalElement = document.querySelector('div[role="dialog"][aria-label="About this space"]');
                if (!modalElement) return "";

                // Remove any non-content elements from modal
                const elementsToRemove = modalElement.querySelectorAll('button, [role="button"]');
                elementsToRemove.forEach((el) => el.remove());

                return (modalElement as HTMLElement).innerText.trim().replace(/\s+/g, " ");
            });

            if (modalText) {
                allText.push(modalText);
            }
        } catch (modalError) {
            console.log("About this space modal not found, continuing with main content only");
        }

        return allText.join("\n\n");
    } catch (error) {
        console.error("Main text scraping error:", error);
        throw error;
    } finally {
        await driver.quit();
    }
}

export async function getReviews(url: string): Promise<string[]> {
    const driver = await getDriver();

    try {
        // Go to the reviews page
        await driver.get(`${url}/reviews`);
        await driver.sleep(2000); // Wait for page load

        try {
            // Wait for reviews container with increased timeout
            await driver.wait(
                until.elementLocated(
                    By.css(`
                    div[data-section-id="reviews-default"],
                    div[data-section-id="REVIEWS_DEFAULT"],
                    section[aria-label*="Reviews"],
                    div[role="dialog"] div[data-review-id]
                `)
                ),
                20000 // Increase timeout to 20 seconds
            );

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
            console.log("Reviews section not found, continuing with empty reviews");
            return []; // Return empty array if reviews section not found
        }
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
        // First go to main page to find the "Show all photos" button
        await driver.get(url);
        await driver.sleep(2000);

        try {
            // Try to click "Show all photos" button if it exists
            const showPhotosButton = await driver.findElement(By.css('[data-testid="photos-button"], [aria-label*="Show all photos"], button[data-plugin-in-point-id="PHOTO_TOUR_SCROLLABLE"]'));
            await showPhotosButton.click();
            await driver.sleep(2000);
        } catch (error) {
            console.log("Show photos button not found, trying direct photo modal");
            // If button not found, try direct modal URL
            await driver.get(`${url}?modal=PHOTO_TOUR_SCROLLABLE`);
            await driver.sleep(2000);
        }

        // Wait for photos to load
        await driver.wait(until.elementLocated(By.css("picture source[srcset], img[data-original]")), 20000);
        await driver.sleep(2000);

        // Scroll to load all photos
        let previousHeight = 0;
        let currentHeight = await driver.executeScript("return document.body.scrollHeight");
        let attempts = 0;
        const maxAttempts = 20;
        while (previousHeight !== currentHeight && attempts < maxAttempts) {
            previousHeight = currentHeight as number; // Cast to number to fix type issue
            await driver.executeScript("window.scrollTo(0, document.body.scrollHeight)");
            await driver.sleep(2000);
            currentHeight = (await driver.executeScript("return document.body.scrollHeight")) as number; // Cast to number to fix type issue
            attempts++;
        }

        // Get all source elements and extract original image URLs
        const photoUrls = new Set<string>();

        // Try multiple selectors for images
        const sourceElements = await driver.findElements(By.css('picture source[srcset], img[data-original], img[data-testid*="photo"], div[data-testid*="photo"] img'));

        for (const source of sourceElements) {
            try {
                const srcset = await source.getAttribute("srcset");
                const src = await source.getAttribute("src");
                const dataOriginal = await source.getAttribute("data-original");

                // Try to find the highest quality image URL
                if (srcset) {
                    const match = srcset.match(/https:\/\/.*?\/prohost-api\/Hosting-.*?\/original\/.*?\.jpeg/);
                    if (match) photoUrls.add(match[0]);
                }
                if (src && src.includes("/original/")) {
                    photoUrls.add(src);
                }
                if (dataOriginal) {
                    photoUrls.add(dataOriginal);
                }
            } catch (e) {
                continue;
            }
        }

        return Array.from(photoUrls);
    } catch (error) {
        console.error("Photo scraping error:", error);
        return []; // Return empty array instead of throwing
    } finally {
        await driver.quit();
    }
}

export async function scrape(url: string): Promise<ScrapedData> {
    if (!url.includes("airbnb.com/rooms/")) {
        return { main_text: await getMainText(url) };
    }

    const [mainText, reviews, amenities, photos] = await Promise.all([getMainText(url), getReviews(url), getAmenities(url), getPhotos(url)]);

    console.log(`[DEBUG] Found ${photos?.length || 0} photos`);
    console.log(`[DEBUG] First few photos: ${photos?.slice(0, 3)}`);

    return { main_text: mainText, reviews, amenities, photos };
}
