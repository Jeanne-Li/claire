/**
 * server.js
 *
 * 1) POST /capture { url: "..." }
 * 2) Loads page in Puppeteer
 * 3) Scrolls + optionally removes popups
 * 4) Uses Readability to extract clean article text
 * 5) Generates PDF in memory
 * 6) Returns { text, pdf (base64) }
 */

const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');

// Use stealth plugin to reduce detection
puppeteer.use(StealthPlugin());

// Initialize Express
const app = express();
app.use(express.json());

/**
 * Simple logger
 */
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

/**
 * Sleep helper
 */
async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Scroll through the entire page in increments,
 * ensuring lazy-loaded or infinite-scroll content appears.
 */
async function scrollThroughPage(page) {
  log('Scrolling through the page...');
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 300;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 300);
    });
  });
}

/**
 * Optional: Basic overlay removal
 * (If the site has known popups or CSS classes,
 *  you can remove them here before capturing.)
 */
async function removeOverlays(page) {
  log('Removing known overlays/popups (demo code)...');
  await page.evaluate(() => {
    // Example removing some common overlay classes
    const selectors = [
      '.overlay',
      '.modal',
      '.popup',
      '.paywall',
      '.cookie-banner',
      '.cookie-consent'
    ];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => el.remove());
    });
  });
}

/**
 * Main capture function:
 * - Launch browser
 * - Navigate
 * - Scroll
 * - Remove overlays
 * - Extract "clean" text with Readability
 * - Generate PDF
 */
async function captureWebsite(url) {
  log(`Launching Puppeteer to capture: ${url}`);

  // Launch with your desired settings
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  });

  try {
    const page = await browser.newPage();

    // Set a more standard user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/99.0.4844.84 Safari/537.36'
    );

    page.setDefaultNavigationTimeout(60000); // e.g. 60s

    log(`Navigating to: ${url}`);
    const response = await page.goto(url, { waitUntil: 'networkidle2' });
    if (!response || !response.ok()) {
      throw new Error(`Failed to load page: status = ${response ? response.status() : 'NoResponse'}`);
    }

    // Scroll the page to load lazy content
    await scrollThroughPage(page);
    // Wait a bit for final render
    await sleep(2000);

    // Optionally remove leftover overlays/popups
    await removeOverlays(page);
    await sleep(1000);

    // Get the raw HTML for Readability
    const html = await page.content();

    // Use Readability to extract article text
    log('Extracting article text via Readability...');
    const dom = new JSDOM(html, { url }); // pass url so relative links resolve
    const reader = new Readability(dom.window.document);
    const article = reader.parse(); // returns { title, byline, content, textContent, ... }
    const readabilityText = article ? article.textContent : '';

    // Generate PDF
    log('Generating PDF...');
    await page.emulateMediaType('screen');
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true
      // If you want the entire page length, you can do:
      // width: '1200px',
      // height: `${await page.evaluate(() => document.body.scrollHeight)}px`,
      // preferCSSPageSize: false
    });

    return {
      text: readabilityText,  // Clean text from Readability
      pdfBuffer
    };
  } finally {
    await browser.close();
    log('Browser closed.');
  }
}

/**
 * POST /capture
 * Expects JSON: { "url": "https://..." }
 */
app.post('/capture', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({
      success: false,
      error: 'Missing "url" in JSON body.'
    });
  }

  try {
    log(`Processing capture request for: ${url}`);
    const { text, pdfBuffer } = await captureWebsite(url);

    // Base64 encode the PDF
    const pdfBase64 = pdfBuffer.toString('base64');

    res.json({
      success: true,
      data: {
        text,
        pdf: pdfBase64
      }
    });
  } catch (err) {
    log(`Capture failed: ${err.message}`);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * Simple health check
 */
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

/**
 * Start the server
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  log(`Server running on port ${PORT}`);
});
