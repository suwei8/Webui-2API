const puppeteer = require('puppeteer-core');
const path = require('path');

// Dedicated ChatGPT browser instance on port 9223
let browser = null;
let page = null;

const CHATGPT_URL = 'https://chatgpt.com/';
const CHATGPT_DEBUG_PORT = 9223;

async function resetConnection() {
    console.log('[ChatGPT Browser] Resetting connection...');
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

    console.log(`[ChatGPT Browser] Connecting to port ${CHATGPT_DEBUG_PORT}...`);
    try {
        browser = await puppeteer.connect({
            browserURL: `http://127.0.0.1:${CHATGPT_DEBUG_PORT}`,
            defaultViewport: null
        });
        console.log('[ChatGPT Browser] Connected successfully.');
    } catch (e) {
        console.log('[ChatGPT Browser] Connection failed:', e.message);
        console.log('Please start a separate Chrome for ChatGPT with:');
        console.log(`chromium --remote-debugging-port=${CHATGPT_DEBUG_PORT} --user-data-dir=~/chromium-chatgpt`);
        throw new Error(`ChatGPT Browser not found on port ${CHATGPT_DEBUG_PORT}. Please start it manually.`);
    }

    // Find or create ChatGPT page
    page = await findOrCreateChatGPTPage();
    return { browser, page };
}

async function findOrCreateChatGPTPage() {
    const pages = await browser.pages();

    // Try to find existing ChatGPT page
    for (const p of pages) {
        try {
            const url = p.url();
            if (url.includes('chatgpt.com')) {
                const frame = await p.mainFrame();
                if (frame) {
                    console.log(`[ChatGPT Browser] Found existing ChatGPT page: ${url}`);
                    return p;
                }
            }
        } catch (e) {
            console.log('[ChatGPT Browser] Skipping invalid page:', e.message);
            continue;
        }
    }

    // No valid ChatGPT page found, create new one
    console.log('[ChatGPT Browser] No ChatGPT page found, creating new tab...');
    const newPage = await browser.newPage();
    await newPage.goto(CHATGPT_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    console.log('[ChatGPT Browser] New ChatGPT page ready.');
    return newPage;
}

async function getPage() {
    // Validate current page
    if (page) {
        try {
            if (page.isClosed()) {
                throw new Error('Page is closed');
            }
            await Promise.race([
                page.url(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Page unresponsive')), 2000))
            ]);
        } catch (e) {
            console.log('[ChatGPT Browser] Page issue:', e.message);
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
