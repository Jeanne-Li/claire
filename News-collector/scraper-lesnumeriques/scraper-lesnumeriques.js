const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;

puppeteer.use(StealthPlugin());

// Configurations
const config = {
    baseUrl: 'https://www.lesnumeriques.com/actualites?page=',
    numberOfPages: 500,
    articlesDirectory: path.join(__dirname, 'lesnumeriques-articles'),
    indexPath: path.join(__dirname, 'lesnumeriques-articles', 'lesnumeriques-index.json'),
    navigationTimeout: 60000, // 60 seconds
    randomDelay: () => Math.floor(Math.random() * (4300 - 2800 + 1)) + 2800 // Random delay between 2.8s and 4.3s
};

// Check internet connectivity
async function checkInternetConnection() {
    try {
        await dns.lookup('google.com');
        return true;
    } catch (error) {
        console.error("Internet connection error:", error);
        return false;
    }
}

// Handle cookie consent
async function handleCookieConsent(page) {
    try {
        const cookieButtonSelector = '#didomi-notice-agree-button'; // Updated selector for 'J'accepte tout'
        if (await page.$(cookieButtonSelector) !== null) {
            await page.click(cookieButtonSelector);
        }
    } catch (error) {
        console.error("Error handling cookie consent:", error);
    }
}

// Scrape article data
async function scrapeArticleData(articlePage) {
    return await articlePage.evaluate(() => {
        const title = document.querySelector('h1.ed__a-t')?.innerText;
        const authorElement = document.querySelector('span.is--main strong a');
        const author = authorElement ? authorElement.innerText.trim() : null;
        const dateElement = document.querySelector('time.is--secondary');
        let date = dateElement ? new Date(dateElement.getAttribute('datetime')).toISOString() : null;
        const subtitle = document.querySelector('p.ed__a-h')?.innerText;
        return { title, date, author, subtitle };
    });
}

(async () => {
    if (!fs.existsSync(config.articlesDirectory)) {
        fs.mkdirSync(config.articlesDirectory, { recursive: true });
    }

    let indexData = [];
    if (fs.existsSync(config.indexPath)) {
        indexData = JSON.parse(fs.readFileSync(config.indexPath));
    }

    const processedUrls = new Set();

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--single-process', '--disable-gpu']
    });
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(config.navigationTimeout);

    for (let i = 1; i <= config.numberOfPages; i++) {
        if (!await checkInternetConnection()) {
            console.log("No internet connection. Retrying...");
            await new Promise(resolve => setTimeout(resolve, 10000));
            continue;
        }

        console.log(`Navigating to page ${i}...`);
        await page.goto(`${config.baseUrl}${i}`, { waitUntil: 'networkidle2' });
        await handleCookieConsent(page);
        await page.waitForTimeout(config.randomDelay());

        console.log("Gathering article links...");
        const articleUrls = await page.$$eval('li.col-xs-12 a[href]', links => links.map(link => link.href));

        for (const url of articleUrls) {
            if (processedUrls.has(url)) {
                console.log(`Skipping already processed article: ${url}`);
                continue;
            }

            let attempts = 3;
            while (attempts-- > 0) {
                try {
                    console.log(`Processing article: ${url}`);
                    const articlePage = await browser.newPage();
                    await articlePage.goto(url, { waitUntil: 'networkidle2' });

                    await handleCookieConsent(articlePage);

                    const articleData = await scrapeArticleData(articlePage);

                    if (articleData.title && articleData.date && articleData.author) {
                        const fileName = `${articleData.date}_${articleData.title}.pdf`.replace(/[/\\?%*:|"<>]/g, '-');
                        const filePath = path.join(config.articlesDirectory, fileName);

                        if (!indexData.some(item => item.url === url)) {
                            await articlePage.pdf({ path: filePath, format: 'A4' });
                            indexData.push({ ...articleData, url, filePath });
                            fs.writeFileSync(config.indexPath, JSON.stringify(indexData, null, 2));
                            console.log(`Article saved: ${fileName}`);
                            processedUrls.add(url);
                        } else {
                            console.log(`Article already exists, skipping: ${url}`);
                        }
                    } else {
                        console.log(`Missing necessary information, skipping article: ${url}`);
                    }

                    await articlePage.close();
                } catch (error) {
                    console.error(`Error processing ${url}: ${error}. Attempts remaining: ${attempts}`);
                    if (attempts <= 0) {
                        console.log(`Skipping ${url} after multiple failed attempts.`);
                    }
                }
            }
        }
    }

    await browser.close();
    console.log("Script completed.");
})();
