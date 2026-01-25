const { getPage } = require('./browser');

const GEMINI_URL = 'https://gemini.google.com/';

// Selectors (Updated based on user's HTML dump and standard Gemini structure)
const SELECTORS = {
    // Content editable div for input. 
    INPUT_BOX: 'div.ProseMirror[contenteditable="true"], div[contenteditable="true"], [role="textbox"]',
    // Send button usually has aria-label "Send" or "Sent" or class "send-button"
    SEND_BUTTON: 'button[aria-label*="Send"], button[aria-label*="发送"], button.send-button, mat-icon-button[aria-label*="发送"]',
    // Stop button indicates generation is in progress
    STOP_BUTTON: 'button[aria-label*="Stop"], button[aria-label*="停止响应"], button[aria-label*="停止回答"]',
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
    console.log('[Status] Checking if Gemini is idle (Wait for Send Button)...');

    // Robust Idle Check: 
    // The system is ONLY idle if the SEND button is VISIBLE and ENABLED.
    // If Stop button exists, it's busy.
    // If Send button is hidden or disabled, it's busy.

    try {
        // 1. Check for Stop Button (Fast Fail)
        const stopBtn = await page.$(SELECTORS.STOP_BUTTON);
        if (stopBtn) {
            console.log('[Status] Gemini is BUSY (Stop button found). waiting for it to disappear...');
            await page.waitForSelector(SELECTORS.STOP_BUTTON, { hidden: true, timeout: 300000 }); // Wait up to 5 mins for generation
        }

        // 2. Wait for Send Button to be Interactive
        // This is the source of truth.
        console.log('[Status] Waiting for Send button to be ready...');
        await page.waitForFunction((selector, inputSelector) => {
            const btn = document.querySelector(selector);
            // Check visibility
            if (!btn) return false;
            const style = window.getComputedStyle(btn);
            if (style.display === 'none' || style.visibility === 'hidden') return false;

            // Check disabled state
            if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') {
                // Only consider Idle if Input is Empty
                const inputVal = document.querySelector(inputSelector)?.innerText?.trim() || '';
                if (inputVal === '') return true; // Empty + Disabled = Idle
                return false; // Text + Disabled = Busy/Invalid
            }
            return true;
        }, { timeout: 300000 }, SELECTORS.SEND_BUTTON, SELECTORS.INPUT_BOX);

        console.log('[Status] Gemini is IDLE (Send button ready).');
    } catch (e) {
        console.warn('[Warning] Error waiting for idle:', e.message);
        // If we timeout waiting for idle, we propagate error to server.js to skip this prompt?
        // Or we just throw to restart the processQueue item?
        throw new Error("Gemini stuck in BUSY state (Idle verification failed)");
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
            }
            // Always dispatch events to wake up UI
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' })); // Dummy keyup to trigger validation
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

    // Robust Send Verification Loop
    // Wait up to 5 seconds for input to clear. If not, click button.
    let inputCleared = false;
    for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 1000));

        // Check if input is empty
        const inputValue = await page.evaluate((selector) => {
            const el = document.querySelector(selector);
            return el ? el.innerText.trim() : '';
        }, SELECTORS.INPUT_BOX);

        if (inputValue === '') {
            inputCleared = true;
            break;
        }

        console.log(`[Input] Text still in box (Attempt ${i + 1}). Retrying Send click...`);

        // Try clicking the button explicitly
        const sendBtn = await page.$(SELECTORS.SEND_BUTTON);
        if (sendBtn) {
            try {
                // Force click via evaluate to bypass Puppeteer visibility checks if needed
                await page.evaluate(b => b.click(), sendBtn);
            } catch (e) {
                console.warn("Click failed", e);
            }
        } else {
            // If button missing, maybe enter worked? 
            // But we checked input value and it was present.
            // Try Enter again
            await page.keyboard.press('Enter');
        }
    }

    if (!inputCleared) {
        console.warn('[Warning] Failed to clear input box after multiple attempts. Request might fail.');
    }

    // 5. Wait for Response Generation to Start and Finish
    console.log('[Status] Waiting for response...');

    // Wait for response count to increase OR Stop button to appear
    try {
        await Promise.race([
            page.waitForFunction((count, selector) => document.querySelectorAll(selector).length > count, {}, initialResponseCount, SELECTORS.RESPONSE_CONTAINER),
            page.waitForSelector(SELECTORS.STOP_BUTTON, { timeout: 30000 }) // Increased to 30s
        ]);
    } catch (e) {
        // If we timed out, maybe it was super fast or failed.
        console.warn('[Warning] Did not detect start of generation immediately (Timeout 30s). Proceeding to wait for idle...');
    }

    // Now wait for stop button to disappear
    await waitForIdle(page);

    // Final Check: Wait for Send Button to be present (Double confirmation of idle)
    try {
        await page.waitForSelector(SELECTORS.SEND_BUTTON, { timeout: 10000 });
    } catch (e) {
        console.warn('[Warning] Send button did not reappear. Page might be stuck.');
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
