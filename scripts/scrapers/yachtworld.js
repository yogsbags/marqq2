import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs/promises';
import path from 'path';

// Add the stealth plugin to Playwright
chromium.use(stealthPlugin());

const OUTPUT_FILE = path.join(process.cwd(), 'yachtworld-results.json');

async function scrapeYachtworld(searchUrl) {
  if (!searchUrl) {
    console.error('Please provide a yachtworld search URL as an argument.');
    console.error('Example: node scripts/scrapers/yachtworld.js "https://www.yachtworld.com/boats-for-sale/make-sea-ray/"');
    process.exit(1);
  }

  console.log(`Starting Yachtworld Scraper for: ${searchUrl}`);

  // Launch headless browser
  const browser = await chromium.launch({
    headless: false, // Set to false to see what is happening, easier to debug bot protection
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    
    // Attempt to mask automation
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
    });

    let allListings = [];
    const maxPages = Infinity;

    for (let currentPage = 1; currentPage <= maxPages; currentPage++) {
      const separator = searchUrl.includes('?') ? '&' : '?';
      const pageUrl = currentPage === 1 ? searchUrl : `${searchUrl}${separator}page=${currentPage}`;
      
      console.log(`\nNavigating to page ${currentPage}: ${pageUrl}`);
      try {
        await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      } catch (e) {
        console.log(`Navigation error on page ${currentPage}, stopping.`);
        break;
      }
      
      await page.waitForTimeout(3000); 

      const title = await page.title();
      if (title.toLowerCase().includes('just a moment') || title.toLowerCase().includes('access denied')) {
          console.error('Blocked by bot protection. Stopping.');
          break;
      }

      console.log(`Extracting listing data from page ${currentPage}...`);
      
      // Scroll down to trigger lazy loading of images
      await page.evaluate(async () => {
          await new Promise((resolve) => {
              let totalHeight = 0;
              const distance = 100;
              const timer = setInterval(() => {
                  const scrollHeight = document.body.scrollHeight;
                  window.scrollBy(0, distance);
                  totalHeight += distance;

                  if(totalHeight >= scrollHeight - window.innerHeight){
                      clearInterval(timer);
                      resolve();
                  }
              }, 50);
          });
      });
      
      // Evaluate and extract
      const listingsData = await page.evaluate(() => {
        const listings = Array.from(document.querySelectorAll('a[class*="listingStandard"], a[class*="grid-listing-link"], a[data-reporting-id]'));
        
        return listings.map(node => {
          const url = node.href || '';
          
          const titleEl = node.querySelector('[class*="listingTitle"], h2');
          const title = titleEl ? titleEl.innerText.trim() : 'Unknown Title';
          
          const priceEl = node.querySelector('[class*="listingPrice"], .price');
          const rawPrice = priceEl ? priceEl.innerText.trim() : 'Price on Request';
          const priceMatch = rawPrice.match(/(US\$\s*[\d,]+|€\s*[\d,]+|£\s*[\d,]+|\$\s*[\d,]+)/);
          const price = priceMatch ? priceMatch[0] : rawPrice.replace(/\n/g, ' ').substring(0, 50);
          
          const captions = Array.from(node.querySelectorAll('[class*="listingCaption"], [class*="listingBody"], .custom-option'));
          const captionText = captions.map(c => c.innerText.trim()).join(' | ');

          const locationMatch = captionText.match(/([^|]+)$/);
          const location = locationMatch ? locationMatch[0].trim() : '';
          
          const yearMatch = title.match(/^(20\d{2}|19\d{2})/);
          const year = yearMatch ? yearMatch[0] : '';

          const imgEl = node.querySelector('img');
          const sourceEl = node.querySelector('source');
          let image = '';
          if (sourceEl && sourceEl.srcset) {
              image = sourceEl.srcset.split(' ')[0];
          } else if (imgEl) {
              image = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '';
          }

          return { title, price, year, location, url, image };
        });
      });

      if (listingsData.length === 0) {
        console.log(`No listings found on page ${currentPage}. Stopping pagination.`);
        break;
      }

      // Filter duplicates just in case
      const existingUrls = new Set(allListings.map(l => l.url));
      const newlyFound = listingsData.filter(l => !existingUrls.has(l.url));

      if (newlyFound.length === 0) {
        console.log('Only duplicates found. Stopping pagination to avoid infinite loops.');
        break;
      }

      allListings = allListings.concat(newlyFound);
      console.log(`Found ${newlyFound.length} new listings on page ${currentPage}. Total so far: ${allListings.length}`);
      
      // Write to JSON constantly so dashboard streams live
      await fs.writeFile(OUTPUT_FILE, JSON.stringify(allListings, null, 2));

      await page.waitForTimeout(2000);
    }

    console.log(`Scraping finished! Total unique listings gathered: ${allListings.length}`);

  } catch (error) {
    console.error('Error during scraping:', error);
  } finally {
    await browser.close();
  }
}

const urlArg = process.argv[2];
scrapeYachtworld(urlArg);
