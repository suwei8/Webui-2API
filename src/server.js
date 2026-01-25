const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { sendMessage: sendGeminiMessage } = require('./gemini');
const { sendChatGPTMessage } = require('./chatgpt');

const app = express();
const PORT = 3040;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' })); // Increase limit for large prompts

// Request queue to ensure only one request is processed at a time
let isProcessing = false;
const requestQueue = [];

async function processQueue() {
    if (isProcessing || requestQueue.length === 0) {
        return;
    }

    isProcessing = true;
    const { req, res, prompt, model } = requestQueue.shift();

    console.log(`Processing request [${model}] (${requestQueue.length} remaining): ${prompt.substring(0, 50)}...`);

    // Timeout Promise
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Request timed out after 300 seconds")), 300000)
    );

    try {
        // Route to correct provider
        let responsePromise;
        if (model && (model.includes('gpt') || model.includes('chatgpt'))) {
            responsePromise = sendChatGPTMessage(prompt);
        } else {
            responsePromise = sendGeminiMessage(prompt);
        }

        // Race between actual processing and timeout
        const responseText = await Promise.race([
            responsePromise,
            timeoutPromise
        ]);

        const completion = {
            id: 'chatcmpl-' + Date.now(),
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: model || 'gemini-web',
            choices: [
                {
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: responseText
                    },
                    finish_reason: 'stop'
                }
            ],
            usage: {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0
            }
        };

        res.json(completion);
    } catch (error) {
        console.error('Error processing request:', error);
        res.status(500).json({ error: error.message });

        // If timeout or crash, maybe restart browser? 
        // For now, we just ensure queue continues.
    } finally {
        isProcessing = false;
        // Process next request after a small delay to let browser settle
        setTimeout(() => processQueue(), 2000);
    }
}

app.get('/', (req, res) => {
    res.send('Webui-2API Server is running. Use POST /v1/chat/completions to interact (model: "gemini" or "chatgpt").');
});

app.get('/v1/chat/completions', (req, res) => {
    res.status(405).json({ error: 'Method Not Allowed. Please use POST.' });
});

app.post('/v1/chat/completions', async (req, res) => {
    try {
        const { messages, model } = req.body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: 'Invalid messages array' });
        }

        // Construct the prompt
        const lastMessage = messages[messages.length - 1];
        const prompt = lastMessage.content;

        console.log(`Queuing request [${model || 'gemini'}]: ${prompt.substring(0, 50)}... (queue size: ${requestQueue.length})`);

        // Add to queue
        requestQueue.push({ req, res, prompt, model });

        // Try to process
        processQueue();

    } catch (error) {
        console.error('Error queuing request:', error);
        res.status(500).json({ error: error.message });
    }
});

// Status endpoint to check queue
app.get('/status', (req, res) => {
    res.json({
        isProcessing,
        queueLength: requestQueue.length
    });
});

app.listen(PORT, '127.0.0.1', () => {
    console.log(`Webui-2API Server running on http://127.0.0.1:${PORT}`);
    console.log('Request queue enabled - only one request processed at a time.');
});
