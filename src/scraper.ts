// src/scraper.ts
import { Builder, By, until, WebDriver } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome";

interface ScrapedData {
    main_text: string;
    reviews?: string[];
    amenities?: string[];
}

export async function getMainText(url: string): Promise<string> {
    const options = new chrome.Options();
    options.addArguments("--headless");
    options.addArguments("--no-sandbox");
    options.addArguments("--disable-dev-shm-usage");
    options.addArguments("--enable-javascript");

    const driver: WebDriver = await new Builder().forBrowser("chrome").setChromeOptions(options).build();

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
    } finally {
        await driver.quit();
    }
}

export async function getReviews(url: string): Promise<string[]> {
    const options = new chrome.Options();
    options.addArguments("--headless");
    options.addArguments("--no-sandbox");
    options.addArguments("--disable-dev-shm-usage");
    options.addArguments("--enable-javascript");

    const driver: WebDriver = await new Builder().forBrowser("chrome").setChromeOptions(options).build();

    try {
        await driver.get(`${url}/reviews`);
        await driver.wait(until.elementLocated(By.css('div[role="dialog"][aria-modal="true"]')), 10000);
        await driver.sleep(2000);

        // Scroll to load all reviews
        let previousHeight = 0;
        let currentHeight = (await driver.executeScript("return document.body.scrollHeight")) as number;
        let attempts = 0;
        const maxAttempts = 20; // Increase max scroll attempts

        while (previousHeight !== currentHeight && attempts < maxAttempts) {
            previousHeight = currentHeight;
            await driver.executeScript("window.scrollTo(0, document.body.scrollHeight)");
            await driver.sleep(2000); // Increased wait time
            currentHeight = (await driver.executeScript("return document.body.scrollHeight")) as number;
            attempts++;
        }

        const reviewElements = await driver.findElements(By.css('div[data-review-id] div[style="line-height: 1.25rem;"]'));
        return await Promise.all(reviewElements.map((el) => el.getText()));
    } catch (error) {
        console.error("Reviews scraping error:", error);
        throw error;
    } finally {
        await driver.quit();
    }
}

export async function getAmenities(url: string): Promise<string[]> {
    const options = new chrome.Options();
    options.addArguments("--headless");
    options.addArguments("--no-sandbox");
    options.addArguments("--disable-dev-shm-usage");
    options.addArguments("--enable-javascript");

    const driver: WebDriver = await new Builder().forBrowser("chrome").setChromeOptions(options).build();

    try {
        await driver.get(`${url}/amenities`);
        await driver.wait(until.elementLocated(By.css('div[role="dialog"][aria-modal="true"]')), 10000);
        await driver.sleep(1000);

        const amenityElements = await driver.findElements(By.css('div[data-section-id="AMENITIES_DEFAULT"] div[role="listitem"]'));
        return await Promise.all(amenityElements.map((el) => el.getText()));
    } catch (error) {
        console.error("Amenities scraping error:", error);
        throw error;
    } finally {
        await driver.quit();
    }
}

export async function scrape(url: string): Promise<ScrapedData> {
    const mainText = await getMainText(url);
    let reviews: string[] = [];
    let amenities: string[] = [];

    if (url.includes("airbnb.com/rooms/")) {
        reviews = await getReviews(url);
        amenities = await getAmenities(url);
    }

    return { main_text: mainText, reviews, amenities };
}
