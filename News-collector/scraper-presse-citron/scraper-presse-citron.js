const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const UserAgentPlugin = require('puppeteer-extra-plugin-anonymize-ua');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const { exec } = require('child_process');
const winston = require('winston');

// Apply plugins to puppeteer
puppeteer.use(StealthPlugin());
puppeteer.use(UserAgentPlugin({ makeWindows: true }));

// Initialize express app
const app = express();
const port = process.env.PORT || 3000;
const serverHost = `http://localhost:${port}`;  // Full server URL for the download link

// Initialize PostgreSQL pool
const pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: process.env.PGPORT,
});

// Initialize logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ],
});

// Function to check internet connectivity
async function checkInternetConnection() {
    try {
        await dns.lookup('google.com');
        logger.info('Internet connection is available.');
        return true;
    } catch (error) {
        logger.error('No internet connection:', error);
        return false;
    }
}

// Function to save data to PostgreSQL
async function saveArticlesToDatabase(articles) {
    const client = await pool.connect();
    try {
        const insertQuery = `
            INSERT INTO scraper_presse_citron (title, date, subtitle, url, pdf)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (url) DO NOTHING
            RETURNING id;
        `;
        const updateQuery = `
            UPDATE scraper_presse_citron
            SET download_link = $1
            WHERE id = $2;
        `;
        for (const articleData of articles) {
            const { title, date, subtitle, url, filePath } = articleData;

            const utf8Title = Buffer.from(title, 'utf8').toString();
            const utf8Subtitle = Buffer.from(subtitle, 'utf8').toString();
            const utf8Url = Buffer.from(url, 'utf8').toString();

            logger.info(`Reading PDF file for article: ${utf8Title}`);
            const pdfBinaryData = fs.readFileSync(path.join(__dirname, 'presse-citron-articles', filePath));

            logger.info(`Inserting article into the database: ${utf8Title}`);
            const result = await client.query(insertQuery, [utf8Title, date, utf8Subtitle, utf8Url, pdfBinaryData]);
            const id = result.rows[0]?.id;

            if (id) {
                const downloadLink = `${serverHost}/pdf/${id}`;  // Full path for download link
                await client.query(updateQuery, [downloadLink, id]);
                logger.info(`Article saved to the database with ID ${id} and download link ${downloadLink}: ${utf8Title}`);
            } else {
                logger.info(`Article already exists in the database: ${utf8Title}`);
            }
        }
    } catch (error) {
        logger.error('Failed to save articles to the database:', error);
    } finally {
        client.release();
    }
}

// Function to compress a PDF using Ghostscript
async function compressPDF(inputFilePath, outputFilePath) {
    logger.info(`Compressing PDF: ${inputFilePath}`);

    return new Promise((resolve, reject) => {
        const sanitizedInputFilePath = inputFilePath.replace(/(["'`\\])/g, '\\$1').replace(/[%''""]/g, '_');
        const sanitizedOutputFilePath = outputFilePath.replace(/(["'`\\])/g, '\\$1').replace(/[%''""]/g, '_');

        const command = `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/screen -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${sanitizedOutputFilePath}" "${sanitizedInputFilePath}"`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                logger.error(`Error compressing PDF: ${stderr || error.message}`);
                logger.error(`Ghostscript command failed: ${command}`);
                logger.error(`Ghostscript error output: ${stderr}`);
                return reject(new Error(`Ghostscript compression failed with error: ${stderr || error.message}`));
            }
            logger.info(`PDF compressed and saved to: ${sanitizedOutputFilePath}`);
            resolve(sanitizedOutputFilePath);
        });
    }).catch((error) => {
        logger.error(`PDF compression failed: ${error.message}`);
        return outputFilePath;  // Use the original file as fallback
    }).finally(() => {
        if (fs.existsSync(inputFilePath)) {
            fs.unlink(inputFilePath, (err) => {
                if (err) logger.error(`Error deleting original PDF: ${err.message}`);
                else logger.info(`Original PDF deleted: ${inputFilePath}`);
            });
        }
    });
}

// Function to retry an operation with exponential backoff
async function retryOperation(operation, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
            logger.info(`Retrying operation in ${delay.toFixed(0)}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Function to handle cookie consent dynamically
async function handleCookieConsent(page) {
    const possibleSelectors = [
        'span.sd-cmp-1jLDJ.sd-cmp-fuQAp.sd-cmp-3_LLS',  // Specific selector for "Accept all"
        'button.sd-cmp-1VJEb',
        'button#accept-cookies',
        '[aria-label="Accept Cookies"]',
    ];

    for (const selector of possibleSelectors) {
        try {
            if (await page.$(selector) !== null) {
                logger.info(`Accepting cookies with selector: ${selector}`);
                await page.click(selector);
                await page.waitForTimeout(2000);  // Wait for the pop-up to disappear
                return;
            }
        } catch (error) {
            logger.error(`Error handling cookie consent with selector ${selector}: ${error.message}`);
        }
    }

    // Fallback for complex consent modal
    try {
        await page.evaluate(() => {
            const consentButton = Array.from(document.querySelectorAll('button, span')).find(
                element => element.innerText.includes('Accept all')
            );
            if (consentButton) {
                consentButton.click();
            }
        });
        await page.waitForTimeout(2000);
    } catch (error) {
        logger.error(`Error clicking on 'Accept all' button: ${error.message}`);
    }

    logger.info('No cookie consent button found or handled.');
}

// Function to scrape articles from a given page URL
async function scrapePageArticles(page, url, articlesDirectory, articlesBatch) {
    await retryOperation(() => page.goto(url, { waitUntil: 'networkidle2' }));

    await handleCookieConsent(page);

    logger.info("Gathering article links...");
    const articleUrls = await page.$$eval('div.grid a[href]', links => links.map(link => link.href));

    for (const articleUrl of articleUrls) {
        await retryOperation(async () => {
            logger.info(`Processing article: ${articleUrl}`);
            const articlePage = await page.browser().newPage();

            try {
                await articlePage.goto(articleUrl, { waitUntil: 'networkidle2' });
                await scrollThroughArticle(articlePage);
                const articleData = await extractArticleData(articlePage);

                if (articleData.title !== 'Title not found') {
                    const fileName = generateFileName(articleData);
                    const filePath = path.join(articlesDirectory, fileName);

                    logger.info(`Saving article as PDF: ${fileName}`);
                    await articlePage.pdf({ path: filePath, format: 'A4' });

                    const compressedFilePath = filePath.replace('.pdf', '_compressed.pdf');
                    const finalFilePath = await compressPDF(filePath, compressedFilePath);

                    articlesBatch.push({
                        ...articleData,
                        url: articleUrl,
                        filePath: path.basename(finalFilePath)  // Store the path instead of binary data
                    });

                    logger.info(`Article added to batch.`);

                    if (articlesBatch.length >= 3) {
                        logger.info('Saving batch to database...');
                        await saveArticlesToDatabase(articlesBatch);
                        articlesBatch = [];
                    }
                } else {
                    logger.info(`Article title not found. Skipping.`);
                }
            } finally {
                await articlePage.close();
            }
        }, 3);
    }
}

// Function to scroll through an article
async function scrollThroughArticle(page) {
    logger.info("Scrolling through article...");
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 100;
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                if (totalHeight >= scrollHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
}

// Function to extract article data from the page
async function extractArticleData(page) {
    return await page.evaluate(() => {
        const title = document.querySelector('h1.entry-title')?.innerText || 'Title not found';
        const dateElement = document.querySelector('time.updated');
        let date = dateElement ? new Date(dateElement.getAttribute('datetime')).toISOString() : 'Date not found';
        const subtitle = document.querySelector('div.post-excerpt p')?.innerText || 'Subtitle not found';
        return { title, date, subtitle };
    });
}

// Function to generate a sanitized file name for the PDF
function generateFileName(articleData) {
    const sanitizedFileName = (fileName) => fileName.replace(/[<>:"/\\|?*]+/g, '-').replace(/[%''""]/g, '_');
    return `${sanitizedFileName(articleData.date)}_${sanitizedFileName(articleData.title)}.pdf`;
}

// Main scraping function
async function scrapeData() {
    const articlesDirectory = path.join(__dirname, 'presse-citron-articles');

    if (!fs.existsSync(articlesDirectory)) {
        fs.mkdirSync(articlesDirectory, { recursive: true });
        logger.info(`Creating directory for articles: ${articlesDirectory}`);
    }

    logger.info("Launching browser...");
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000); // 60 seconds timeout

    await page.setViewport({
        width: 1920 + Math.floor(Math.random() * 100),
        height: 3000 + Math.floor(Math.random() * 100),
        deviceScaleFactor: 1,
        hasTouch: false,
        isLandscape: false,
        isMobile: false,
    });

    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
    });

    const randomDelay = (min = 1000, max = 4000) => new Promise(resolve => {
        const delay = Math.floor(Math.random() * (max - min + 1)) + min;
        logger.info(`Waiting for random delay: ${delay} ms`);
        setTimeout(resolve, delay);
    });

    const numberOfPages = parseInt(process.env.NUMBER_OF_PAGES || 2);
    let articlesBatch = [];

    try {
        for (let i = 1; i <= numberOfPages; i++) {
            if (!await checkInternetConnection()) {
                logger.info("No internet connection. Pausing script...");
                while (!await checkInternetConnection()) {
                    await new Promise(resolve => setTimeout(resolve, 10000));
                }
                logger.info("Internet connection resumed.");
            }

            logger.info(`Navigating to page ${i}...`);
            const pageUrl = `https://www.presse-citron.net/category/actualites/page/${i}/`;
            await scrapePageArticles(page, pageUrl, articlesDirectory, articlesBatch);
            await randomDelay();
        }

        if (articlesBatch.length > 0) {
            logger.info('Saving remaining batch to database...');
            await saveArticlesToDatabase(articlesBatch);
        }

    } finally {
        logger.info("Closing browser...");
        await browser.close();
        logger.info("Script completed.");
    }
}

// Define the POST route to trigger the scraping
app.post('/trigger', async (req, res) => {
    try {
        logger.info('Received request to trigger scraping...');
        await scrapeData();
        res.send('Scraping completed successfully.');
    } catch (error) {
        logger.error('Scraping failed:', error);
        res.status(500).send('An error occurred during scraping.');
    }
});

// New endpoint to serve PDFs
app.get('/pdf/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        logger.info(`Fetching PDF with ID: ${req.params.id} from the database`);
        const result = await client.query('SELECT pdf FROM scraper_presse_citron WHERE id = $1', [req.params.id]);
        if (result.rows.length > 0) {
            const pdfBinaryData = result.rows[0].pdf;
            if (pdfBinaryData) {
                res.setHeader('Content-Disposition', `attachment; filename="article_${req.params.id}.pdf"`);
                res.contentType('application/pdf');
                res.send(pdfBinaryData);
                logger.info(`Served PDF with ID: ${req.params.id}`);
            } else {
                res.status(404).send('PDF not found in database');
                logger.warn(`PDF not found in database for ID: ${req.params.id}`);
            }
        } else {
            res.status(404).send('PDF not found in database');
            logger.warn(`PDF not found in database for ID: ${req.params.id}`);
        }
    } catch (error) {
        logger.error('Error serving PDF:', error);
        res.status(500).send('Internal server error');
    } finally {
        client.release();
    }
});

// Start the server
app.listen(port, () => {
    logger.info(`Scraper server listening on port ${port}`);
});

module.exports = app; // Optional: for testing purposes
