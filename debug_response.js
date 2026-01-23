const { initBrowser } = require('./src/browser');

const GEMINI_URL = 'https://gemini.google.com/app';
const SELECTORS = {
    INPUT_BOX: 'div[contenteditable="true"]',
    SEND_BUTTON: 'button[aria-label*="Send"]'
};

async function debug() {
    console.log('Initializing...');
    const { browser, page } = await initBrowser();

    // Naive goto, assuming previous login
    await page.goto(GEMINI_URL, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 5000));

    // Type and send
    console.log('Typing...');
    try {
        await page.waitForSelector(SELECTORS.INPUT_BOX, { timeout: 10000 });
        await page.click(SELECTORS.INPUT_BOX);
        await page.type(SELECTORS.INPUT_BOX, "Hello");
        await new Promise(r => setTimeout(r, 500));
        await page.keyboard.press('Enter');
    } catch (e) {
        console.error("Failed to send", e);
    }

    console.log('Waiting for response...');
    await new Promise(r => setTimeout(r, 10000)); // Wait 10s for response

    // Dump body content to file to inspect locally (too huge for console)
    // Or try to find candidates
    const responses = await page.evaluate(() => {
        // Try to find all large text blocks
        const candidates = [];
        document.querySelectorAll('*').forEach(el => {
            if (el.innerText && el.innerText.length > 10 && el.innerText.includes('Hello')) {
                // candidates.push(el.tagName + '.' + el.className);
            }
        });

        // Return potentially useful elements
        // Check for 'model-response'
        const models = document.querySelectorAll('model-response');

        return {
            modelResponseCount: models.length,
            classes: Array.from(models).map(m => m.className),
            texts: Array.from(models).map(m => m.innerText.substring(0, 50))
        };
    });

    console.log('Analysis:', responses);

    // Save page content for analysis
    const html = await page.content();
    require('fs').writeFileSync('debug_page.html', html);
    console.log('Saved debug_page.html');

    await browser.close();
}

debug().catch(console.error);
