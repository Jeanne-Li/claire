import asyncio
import base64
import time
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from pyppeteer import launch
from newspaper import Article

app = FastAPI()

def log(msg: str):
    """Simple logger with timestamps."""
    print(f"[{time.strftime('%Y-%m-%dT%H:%M:%S')}] {msg}")


async def scroll_through_page(page):
    """
    Scroll through the entire page in increments
    to load lazy/infinite content.
    """
    log("Scrolling through the page...")
    await page.evaluate(
        """
        () => {
            return new Promise((resolve) => {
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
        }
        """
    )


async def remove_overlays(page):
    """
    Demo code to remove known overlay classes like
    cookie banners, paywalls, modals, etc.
    Adjust selectors as needed for your target sites.
    """
    log("Removing known overlays/popups...")
    await page.evaluate(
        """
        () => {
            const selectors = [
                '.overlay',
                '.modal',
                '.popup',
                '.paywall',
                '.cookie-banner',
                '.cookie-consent'
            ];
            for (const sel of selectors) {
                document.querySelectorAll(sel).forEach(el => el.remove());
            }
        }
        """
    )


async def capture_website(url: str):
    """
    1) Launch pyppeteer
    2) Navigate to URL
    3) Scroll page
    4) Remove overlays
    5) Extract text with newspaper3k
    6) Generate PDF
    7) Return (extracted_text, pdf_bytes)
    """
    log(f"Launching pyppeteer to capture: {url}")
    browser = await launch(
        headless=True,
        args=[
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage"
        ]
    )

    try:
        page = await browser.newPage()
        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/99.0.4844.84 Safari/537.36"
        )
        await page.setDefaultNavigationTimeout(60000)  # 60s

        log(f"Navigating to: {url}")
        resp = await page.goto(url, {"waitUntil": "networkidle2"})
        if not resp or resp.status != 200:
            status = resp.status if resp else "NoResponse"
            raise ValueError(f"Failed to load page, status = {status}")

        # Scroll to load lazy content
        await scroll_through_page(page)
        await asyncio.sleep(2)

        # Remove overlays
        await remove_overlays(page)
        await asyncio.sleep(1)

        # Get raw HTML
        html = await page.content()

        # Extract article text with newspaper3k
        log("Extracting article text via newspaper3k...")
        article = Article(url="", language='en')
        article.set_html(html)
        # By setting download_state=2 we skip the normal .download() step
        article.download_state = 2
        article.parse()
        extracted_text = article.text

        # Generate PDF
        log("Generating PDF...")
        await page.emulateMediaType("screen")
        pdf_bytes = await page.pdf({
            "format": "A4",
            "printBackground": True
        })

        return extracted_text, pdf_bytes

    finally:
        await browser.close()
        log("Browser closed.")


class CaptureRequest(BaseModel):
    url: str


@app.post("/capture")
async def handle_capture(payload: CaptureRequest):
    """
    POST /capture
    {
      "url": "https://example.com"
    }
    Returns JSON: { "success": True, "data": { "text": "...", "pdf": "base64..." } }
    """
    url = payload.url
    log(f"Processing capture request for: {url}")

    try:
        text, pdf_bytes = await capture_website(url)
        pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')
        return {
            "success": True,
            "data": {
                "text": text,
                "pdf": pdf_base64
            }
        }
    except Exception as e:
        log(f"Capture failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    """Simple health check endpoint."""
    return {"status": "OK"}
