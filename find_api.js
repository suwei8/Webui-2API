
const puppeteer = require('puppeteer-core');
const fs = require('fs');

(async () => {
    try {
        const browser = await puppeteer.launch({
            executablePath: '/snap/bin/chromium',
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });
        const page = await browser.newPage();

        // Log all XHR/Fetch requests
        page.on('request', request => {
            if (['xhr', 'fetch'].includes(request.resourceType())) {
                console.log('Request:', request.url());
            }
        });

        console.log('Navigating to Sporttery...');
        // Official Jingcai Odds Page
        await page.goto('https://www.sporttery.cn/jc/zqszsc/', { waitUntil: 'networkidle2', timeout: 30000 });

        // Also dump the page content to see if data is embedded in <script>
        const content = await page.content();
        fs.writeFileSync('sporttery_dump.html', content);
        console.log('Page content saved to sporttery_dump.html');

        await browser.close();
    } catch (e) {
        console.error('Error:', e);
    }
})();
