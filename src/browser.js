const puppeteer = require('puppeteer-core');
const path = require('path');

let browser = null;
let page = null;

const CHROMIUM_PATH = '/snap/bin/chromium';
const USER_DATA_DIR = path.join(process.env.HOME, 'snap/chromium/common/chromium');
const GEMINI_URL = 'https://gemini.google.com/app';

async function resetConnection() {
    console.log('Resetting browser connection...');
    if (browser) {
        try {
            await browser.disconnect();
        } catch (e) {
            // Ignore disconnect errors
        }
    }
    browser = null;
    page = null;
}

async function initBrowser() {
    // Always reset if browser exists but might be stale
    if (browser) {
        try {
            // Quick health check
            const pages = await browser.pages();
            if (pages.length === 0) {
                await resetConnection();
            }
        } catch (e) {
            await resetConnection();
        }
    }

    if (browser && page) {
        return { browser, page };
    }

    console.log('Attempting to connect to existing browser on port 9222...');
    try {
        browser = await puppeteer.connect({
            browserURL: 'http://127.0.0.1:9222',
            defaultViewport: null
        });
        console.log('Connected to existing browser.');
    } catch (e) {
        console.log('Could not connect to existing browser (' + e.message + ').');
        console.log('NOTE: Auto-launch is DISABLED. Please start Chrome manually with:');
        console.log('chromium --remote-debugging-port=9222 --user-data-dir=~/snap/chromium/common/chromium');
        throw new Error('Browser not found on port 9222. Please start it manually.');
    }

    // Find or create a valid Gemini page
    page = await findOrCreateGeminiPage();

    return { browser, page };
}

async function findOrCreateGeminiPage() {
    const pages = await browser.pages();

    // Try to find a valid Gemini page
    for (const p of pages) {
        try {
            const url = p.url();
            if (url.includes('gemini.google.com')) {
                // Validate page is usable by checking if we can access its frame
                const frame = await p.mainFrame();
                if (frame) {
                    console.log(`Found existing Gemini page: ${url}`);
                    return p;
                }
            }
        } catch (e) {
            console.log('Skipping invalid page:', e.message);
            continue;
        }
    }

    // No valid Gemini page found, create new one
    console.log('No valid Gemini page found, creating new tab and navigating...');
    const newPage = await browser.newPage();
    await newPage.goto(GEMINI_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    console.log('New Gemini page ready.');
    return newPage;
}

async function getPage() {
    // Validate current page
    if (page) {
        try {
            // Check if page is closed
            if (page.isClosed()) {
                throw new Error('Page is closed');
            }

            // Try to access the title or url to ensure it's responsive
            await Promise.race([
                page.url(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Page unresponsive')), 2000))
            ]);

        } catch (e) {
            console.log('Page detached, closed, or unresponsive:', e.message);
            await resetConnection();
        }
    }

    if (!page) {
        await initBrowser();
    }
    return page;
}

module.exports = {
    initBrowser,
    getPage,
    resetConnection
};
