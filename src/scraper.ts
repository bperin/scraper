// src/scraper.ts
import { Builder, By, until, WebDriver } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome";

export async function scrape(url: string): Promise<string> {
    // Configure Chrome options for headless mode
    const options = new chrome.Options();
    options.addArguments("--headless"); // Run in headless mode
    options.addArguments("--no-sandbox"); // Bypass OS security model
    options.addArguments("--disable-dev-shm-usage"); // Overcome limited resource problems
    options.addArguments("--enable-javascript"); // Enable JavaScript execution

    // Initialize WebDriver
    const driver: WebDriver = await new Builder().forBrowser("chrome").setChromeOptions(options).build();

    try {
        // Navigate to the URL
        await driver.get(url);

        // Wait until the page is fully loaded
        await driver.wait(until.elementLocated(By.tagName("body")), 10000);

        // Extract all visible text from the body
        const textContent: string = await driver.executeScript(() => {
            // Remove script and style elements
            const elementsToRemove = document.querySelectorAll("script, style, noscript");
            elementsToRemove.forEach((el) => el.remove());

            // Get the innerText of the body
            let text = document.body.innerText;

            // Basic text cleaning: trim and replace multiple spaces with single space
            text = text.trim().replace(/\s+/g, " ");

            return text;
        });

        return textContent;
    } catch (error) {
        console.error("Scraping error:", error);
        throw error;
    } finally {
        // Quit the driver
        await driver.quit();
    }
}
