// src/scraper.ts
import { Builder, By, until, WebDriver } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome";

interface ScrapedData {
    main_text: string;
    reviews?: string[];
}

async function getMainContent(driver: WebDriver, url: string): Promise<string> {
    await driver.get(url);
    await driver.wait(until.elementLocated(By.css("main")), 10000);

    // Get key content sections
    const sections = await driver.findElements(
        By.css(`
        div[data-section-id="DESCRIPTION_DEFAULT"],
        div[data-section-id="AMENITIES_DEFAULT"],
        div[data-section-id="LOCATION_DEFAULT"]
    `)
    );

    // Combine text from all sections
    const texts = await Promise.all(sections.map((section) => section.getText()));
    return texts.join(" ").trim().replace(/\s+/g, " ");
}

async function getReviews(driver: WebDriver, url: string): Promise<string[]> {
    await driver.get(`${url}/reviews`);
    await driver.wait(until.elementLocated(By.css('div[role="dialog"][aria-modal="true"]')), 10000);
    await driver.sleep(2000); // Wait for reviews to load

    const reviewElements = await driver.findElements(By.css('div[data-review-id] div[style="line-height: 1.25rem;"]'));
    return await Promise.all(reviewElements.map((el) => el.getText()));
}

export async function scrape(url: string): Promise<ScrapedData> {
    const options = new chrome.Options();
    options.addArguments("--headless");
    options.addArguments("--no-sandbox");
    options.addArguments("--disable-dev-shm-usage");
    options.addArguments("--enable-javascript");

    const driver: WebDriver = await new Builder().forBrowser("chrome").setChromeOptions(options).build();

    try {
        const mainText = await getMainContent(driver, url);
        let reviews: string[] = [];

        if (url.includes("airbnb.com/rooms/")) {
            reviews = await getReviews(driver, url);
        }

        return { main_text: mainText, reviews };
    } catch (error) {
        console.error("Scraping error:", error);
        throw error;
    } finally {
        await driver.quit();
    }
}
