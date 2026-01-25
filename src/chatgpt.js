const { getPage } = require('./browser_chatgpt');

const BASE_URL = 'https://chatgpt.com/';

// Selectors for ChatGPT 5.x (Based on actual DOM analysis)
const SELECTORS = {
    // Input: ProseMirror contenteditable div with id prompt-textarea
    INPUT_BOX: '#prompt-textarea',
    // Response container - ChatGPT messages from assistant
    RESPONSE_CONTAINER: 'div[data-message-author-role="assistant"]',
    // Streaming indicator - when ChatGPT is generating
    STREAMING_INDICATOR: '[data-testid="stop-button"], button[aria-label*="停止"], button[aria-label*="Stop"]',
};

async function ensurePage() {
    const page = await getPage();

    const url = page.url();
    if (!url.includes('chatgpt.com')) {
        console.log(`[ChatGPT] Current URL ${url} is not ChatGPT. Navigating...`);
        await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    }

    try {
        await page.waitForSelector(SELECTORS.INPUT_BOX, { timeout: 15000 });
        console.log('[ChatGPT] Input box found.');
    } catch (e) {
        console.log("[ChatGPT] Input box not found. Reloading...");
        await page.reload({ waitUntil: 'networkidle2' });
        await page.waitForSelector(SELECTORS.INPUT_BOX, { timeout: 30000 });
    }

    return page;
}

async function waitForIdle(page) {
    console.log('[ChatGPT Status] Waiting for generation to complete...');

    // Wait for streaming indicator to disappear (if present)
    try {
        const stopBtn = await page.$(SELECTORS.STREAMING_INDICATOR);
        if (stopBtn) {
            console.log('[ChatGPT Status] Generation in progress, waiting...');
            await page.waitForSelector(SELECTORS.STREAMING_INDICATOR, { hidden: true, timeout: 300000 });
        }
    } catch (e) {
        // No streaming indicator found, might be idle already
    }

    // Small delay to ensure UI is stable
    await new Promise(r => setTimeout(r, 1000));
    console.log('[ChatGPT Status] IDLE.');
}

async function inputMessage(page, message) {
    console.log('[ChatGPT Input] Typing message into ProseMirror...');

    // Use page.evaluate to properly interact with ProseMirror contenteditable
    await page.evaluate((selector, text) => {
        const el = document.querySelector(selector);
        if (el) {
            // Focus the editor
            el.focus();

            // Clear existing content
            el.innerHTML = '';

            // Create a paragraph element with the text (ProseMirror structure)
            const p = document.createElement('p');
            p.textContent = text;
            el.appendChild(p);

            // Dispatch input event to notify ProseMirror
            el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
        }
    }, SELECTORS.INPUT_BOX, message);

    await new Promise(r => setTimeout(r, 500));
}

async function sendChatGPTMessage(message) {
    const page = await ensurePage();

    // Wait for any previous generation to complete
    await waitForIdle(page);

    // Get initial response count
    const initialCount = await page.evaluate((selector) => {
        return document.querySelectorAll(selector).length;
    }, SELECTORS.RESPONSE_CONTAINER);

    console.log(`[ChatGPT] Initial response count: ${initialCount}`);

    // Input the message
    await inputMessage(page, message);

    // Send using Enter key
    console.log('[ChatGPT Input] Sending with Enter key...');
    await page.keyboard.press('Enter');

    // Wait for response to start (new response container appears OR streaming starts)
    console.log('[ChatGPT Status] Waiting for response...');
    try {
        await Promise.race([
            page.waitForFunction(
                (c, s) => document.querySelectorAll(s).length > c,
                { timeout: 30000 },
                initialCount,
                SELECTORS.RESPONSE_CONTAINER
            ),
            page.waitForSelector(SELECTORS.STREAMING_INDICATOR, { timeout: 10000 })
        ]);
    } catch (e) {
        console.log("[ChatGPT] Timeout waiting for response start, checking anyway...");
    }

    // Wait for generation to complete
    await waitForIdle(page);

    // Extra wait for content to stabilize
    await new Promise(r => setTimeout(r, 1000));

    // Extract the last response
    const response = await page.evaluate((selector) => {
        const els = document.querySelectorAll(selector);
        if (els.length > 0) {
            const last = els[els.length - 1];
            return last.innerText || last.textContent;
        }
        return '';
    }, SELECTORS.RESPONSE_CONTAINER);

    console.log(`[ChatGPT] Response extracted (${response.length} chars)`);
    return response;
}

module.exports = {
    sendChatGPTMessage
};

