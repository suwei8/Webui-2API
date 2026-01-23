const { getPage } = require('./browser');

const GEMINI_URL = 'https://gemini.google.com/';

// Selectors (Updated based on user's HTML dump and standard Gemini structure)
const SELECTORS = {
    // Content editable div for input. 
    INPUT_BOX: 'div.ProseMirror[contenteditable="true"], div[contenteditable="true"], [role="textbox"]',
    // Send button usually has aria-label "Send" or "Sent"
    SEND_BUTTON: 'button[aria-label*="Send"], button[aria-label*="发送"], button[data-test-id="send-button"]',
    // Stop button indicates generation is in progress
    STOP_BUTTON: 'button[aria-label*="Stop"], button[aria-label*="停止响应"]',
    // Response containers
    RESPONSE_CONTAINER: 'model-response',
};

async function ensurePage() {
    const page = await getPage();

    // Check if we are on the right domain
    const url = page.url();
    if (!url.includes('gemini.google.com')) {
        console.log(`Current URL ${url} is not Gemini. Navigating...`);
        await page.goto(GEMINI_URL, { waitUntil: 'networkidle2' });
    }

    // Do NOT reload or navigate if we are already there. 
    // Just ensure the input box is present.
    try {
        await page.waitForSelector(SELECTORS.INPUT_BOX, { timeout: 10000 });
    } catch (e) {
        console.log("Input box not found (maybe session expired? or wrong page?). Reloading once...");
        await page.reload({ waitUntil: 'networkidle2' });
        await page.waitForSelector(SELECTORS.INPUT_BOX, { timeout: 30000 });
    }

    return page;
}

async function waitForIdle(page) {
    console.log('[Status] Checking if Gemini is idle...');

    // Logic: If STOP_BUTTON exists, it means generation is in progress.
    // We must WAIT until it disappears.

    try {
        // fast check first
        const stopBtn = await page.$(SELECTORS.STOP_BUTTON);
        if (stopBtn) {
            console.log('[Status] Gemini is BUSY (Stop button found). Waiting for idle...');
            await page.waitForSelector(SELECTORS.STOP_BUTTON, { hidden: true, timeout: 120000 });
            console.log('[Status] Gemini is now IDLE.');
        } else {
            console.log('[Status] Gemini is IDLE (No Stop button).');
        }
    } catch (e) {
        // If timeout or error, we might be stuck or it's actually idle but selector changed.
        console.warn('[Warning] Error waiting for idle:', e.message);
    }
}

async function pasteMessage(page, message) {
    console.log('[Input] Pasting message...');

    // Focus the input box
    await page.click(SELECTORS.INPUT_BOX);

    // Use evaluate to simulate a paste operation 
    // This is much faster and cleaner than typing
    await page.evaluate((selector, text) => {
        const el = document.querySelector(selector);
        if (el) {
            el.focus();
            // Try execCommand for 'insertText' which simulates pasting text content
            // and triggers all necessary React/Angular events automatically.
            document.execCommand('insertText', false, text);

            // Fallback: if execCommand didn't pop text in (unlikely on modern Chrome), force it
            if (el.innerText.trim() === '') {
                el.innerText = text;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    }, SELECTORS.INPUT_BOX, message);

    await new Promise(r => setTimeout(r, 500)); // Short wait for UI to update height/state
}

async function sendMessage(message) {
    const page = await ensurePage();

    // 1. Strict Queue/Idle Check
    await waitForIdle(page);

    // 2. Count existing responses to detect NEW one later
    const initialResponseCount = await page.evaluate((selector) => {
        return document.querySelectorAll(selector).length;
    }, SELECTORS.RESPONSE_CONTAINER);

    // 3. Paste Input (No Typing)
    await pasteMessage(page, message);

    // 4. Send (Enter Key)
    console.log('[Input] Sending...');
    await page.keyboard.press('Enter');

    // Double check: if Send button is still there after 1 sec, click it
    await new Promise(r => setTimeout(r, 1000));
    const sendBtn = await page.$(SELECTORS.SEND_BUTTON);
    if (sendBtn) {
        // Only click if it's not disabled
        // Note: Using evaluate to check property to avoid potential errors
        const isDisabled = await page.evaluate(el => el.disabled, sendBtn);
        if (!isDisabled) {
            console.log('[Input] clicking Send button fallback...');
            await sendBtn.click();
        }
    }

    // 5. Wait for Response Generation to Start and Finish
    console.log('[Status] Waiting for response...');

    // Wait for response count to increase OR Stop button to appear
    try {
        await Promise.race([
            page.waitForFunction((count, selector) => document.querySelectorAll(selector).length > count, {}, initialResponseCount, SELECTORS.RESPONSE_CONTAINER),
            page.waitForSelector(SELECTORS.STOP_BUTTON, { timeout: 10000 })
        ]);
    } catch (e) {
        // If we timed out, maybe it was super fast or failed.
        console.warn('[Warning] Did not detect start of generation immediately.');
    }

    // Now wait for idle again (which means generation finished)
    await waitForIdle(page);

    // Extra stability wait
    await new Promise(r => setTimeout(r, 1000));

    // 6. Extract
    const response = await extractLastResponse(page);
    return response;
}

async function extractLastResponse(page) {
    return await page.evaluate((selector) => {
        const responses = document.querySelectorAll(selector);
        if (responses.length > 0) {
            const lastResponse = responses[responses.length - 1];
            // Get text, preserve basic formatting if possible, but innerText is usually fine
            return lastResponse.innerText;
        }
        return '';
    }, SELECTORS.RESPONSE_CONTAINER);
}

module.exports = {
    sendMessage
};
