const https = require('https');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const sitemapUrls = [
  'https://www.plindia.com/',
  'https://www.plindia.com/portfolio-management-services/',
  'https://www.plindia.com/nri-demat-account/',
  'https://www.plindia.com/wealth-management/',
  'https://www.plindia.com/sovereign-gold-bonds/',
  'https://www.plindia.com/fixed-deposits/',
  'https://www.plindia.com/progress-partner/',
  'https://www.plindia.com/open-demat-account/',
  'https://www.plindia.com/portfolio-management/',
  'https://www.plindia.com/alternative-investment-funds/',
  'https://www.plindia.com/non-discretionary-pms/',
  'https://www.plindia.com/margin-trading-facility/',
  'https://www.plindia.com/market-linked-debentures/',
  'https://www.plindia.com/aqua-equity-pms/',
  'https://www.plindia.com/madp-alpha-pms-strategy/',
  'https://www.plindia.com/about-us/',
  'https://www.plindia.com/careers/',
  'https://www.plindia.com/board-of-directors/',
  'https://www.plindia.com/logo-story/',
  'https://www.plindia.com/vision-mission-purpose/',
  'https://www.plindia.com/news-press/',
  'https://www.plindia.com/get-in-touch/',
  'https://www.plindia.com/research/',
  'https://www.plindia.com/india-us-trade-deal/',
  'https://www.plindia.com/investment-banking/',
  'https://www.plindia.com/institutional-equities/',
  'https://www.plindia.com/algo-trading/',
  'https://www.plindia.com/mutual-funds/',
  'https://www.plindia.com/unlisted-shares/',
  'https://www.plindia.com/commodity-trading/',
  'https://www.plindia.com/currency-trading/'
];

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function extractImageUrls(html, pageUrl) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const images = new Set();

  // Extract from <img> tags
  document.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src') || img.getAttribute('data-src');
    if (src) {
      const absoluteUrl = new URL(src, pageUrl).href;
      images.add(absoluteUrl);
    }
  });

  // Extract from CSS background-image
  document.querySelectorAll('*').forEach(el => {
    const style = el.getAttribute('style');
    if (style && style.includes('background-image')) {
      const matches = style.match(/url\(['"]?([^'")]+)['"]?\)/g);
      if (matches) {
        matches.forEach(match => {
          const url = match.match(/url\(['"]?([^'")]+)['"]?\)/)[1];
          const absoluteUrl = new URL(url, pageUrl).href;
          images.add(absoluteUrl);
        });
      }
    }
  });

  // Extract from picture sources
  document.querySelectorAll('picture source').forEach(source => {
    const srcset = source.getAttribute('srcset');
    if (srcset) {
      srcset.split(',').forEach(src => {
        const url = src.trim().split(' ')[0];
        if (url) {
          const absoluteUrl = new URL(url, pageUrl).href;
          images.add(absoluteUrl);
        }
      });
    }
  });

  return Array.from(images).filter(url => {
    const ext = url.split('.').pop().toLowerCase().split('?')[0];
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
  });
}

async function scrapeAllImages() {
  const allImages = [];
  let urlsProcessed = 0;

  console.log(`Starting to scrape ${sitemapUrls.length} pages...`);

  for (const url of sitemapUrls) {
    try {
      console.log(`Fetching: ${url}`);
      const html = await fetchPage(url);
      const images = extractImageUrls(html, url);

      images.forEach(imageUrl => {
        allImages.push({
          url: imageUrl,
          sourcePage: url,
          foundAt: new Date().toISOString()
        });
      });

      urlsProcessed++;
      console.log(`  Found ${images.length} images`);

      // Add delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`Error scraping ${url}:`, error.message);
    }
  }

  // Remove duplicates
  const uniqueImages = Array.from(
    new Map(allImages.map(img => [img.url, img])).values()
  );

  const result = {
    totalUrlsProcessed: urlsProcessed,
    totalImagesFound: uniqueImages.length,
    scrapedAt: new Date().toISOString(),
    images: uniqueImages
  };

  // Save to file
  const outputPath = path.join(__dirname, '../config/plindia-images.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

  console.log(`\n✅ Scraping complete!`);
  console.log(`   URLs processed: ${urlsProcessed}`);
  console.log(`   Unique images found: ${uniqueImages.length}`);
  console.log(`   Output saved to: ${outputPath}`);

  return result;
}

scrapeAllImages().catch(console.error);
