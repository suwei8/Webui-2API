const { initBrowser, getPage } = require('./src/browser');

const GEMINI_URL = 'https://gemini.google.com/app';

async function debug() {
    console.log('Initializing browser...');
    const { browser, page } = await initBrowser();

    console.log('Navigating to Gemini...');
    await page.goto(GEMINI_URL, { waitUntil: 'domcontentloaded' });

    await new Promise(r => setTimeout(r, 5000)); // Wait for load

    const title = await page.title();
    console.log('Page Title:', title);

    if (title.includes('Sign in') || title.includes('Google Accounts')) {
        console.error('ERROR: Not logged in!');
        await browser.close();
        process.exit(1);
    }

    // Check for input box
    const selector = 'div[contenteditable="true"]';
    const input = await page.$(selector);
    if (input) {
        console.log('Input box found.');
    } else {
        console.log('Input box NOT found. Dumping body classes...');
        const classes = await page.evaluate(() => document.body.className);
        console.log('Body classes:', classes);

        // Take a screenshot path (simulated relative path since we can't see it but can list it)
        await page.screenshot({ path: 'debug_screenshot.png' });
        console.log('Saved debug_screenshot.png');
    }

    // Check for "Welcome" or something that indicates readiness
    const content = await page.content();
    if (content.includes('Gemini')) {
        console.log('Page contains "Gemini" text.');
    }

    await browser.close();
}

debug().catch(console.error);
