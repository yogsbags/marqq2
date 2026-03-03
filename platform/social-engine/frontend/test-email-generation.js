#!/usr/bin/env node

/**
 * Test script for the email newsletter generation API
 * Tests the modified template without web stories section
 */

const fs = require('fs');
const path = require('path');

async function testEmailGeneration() {
  console.log('Testing Email Newsletter Generation API...\n');

  const testData = {
    topic: "Navigating Market Volatility with Smart Portfolio Strategies",
    purpose: "education",
    targetAudience: "High-net-worth investors with 1Cr+ portfolios",
    creativePrompt: "Focus on practical risk management techniques and adaptive investment strategies that help investors stay resilient during market downturns. Emphasize data-driven approaches and quantitative methods.",
    brandSettings: {
      useBrandGuidelines: true
    },
    language: "en"
  };

  console.log('Request payload:');
  console.log(JSON.stringify(testData, null, 2));
  console.log('\n---\n');

  try {
    console.log('Calling API endpoint...');
    const response = await fetch('http://localhost:3004/api/email/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData)
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('API Error:', error);
      process.exit(1);
    }

    const result = await response.json();

    console.log('✅ Email generated successfully!\n');
    console.log('Subject:', result.subject);
    console.log('Subject Length:', result.subject.length, 'chars');
    console.log('\nPreheader:', result.preheader);
    console.log('Preheader Length:', result.preheader.length, 'chars');
    console.log('\nSubject Variations:');
    result.subjectVariations.forEach((variation, i) => {
      console.log(`  ${i + 1}. ${variation}`);
    });
    console.log('\nModel:', result.model);
    console.log('Token Usage:', result.usage);

    // Save HTML to file
    const outputDir = path.join(__dirname, 'test-output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const htmlFile = path.join(outputDir, `newsletter-${timestamp}.html`);
    const txtFile = path.join(outputDir, `newsletter-${timestamp}.txt`);

    fs.writeFileSync(htmlFile, result.html);
    fs.writeFileSync(txtFile, result.plainText);

    console.log('\n✅ Files saved:');
    console.log('  HTML:', htmlFile);
    console.log('  Plain Text:', txtFile);

    // Verify no web stories section
    if (result.html.toLowerCase().includes('web stories') ||
        result.html.toLowerCase().includes('webstories')) {
      console.log('\n⚠️  WARNING: HTML still contains "web stories" references!');
    } else {
      console.log('\n✅ Confirmed: No web stories section in generated HTML');
    }

    // Verify no logo in header
    if (result.html.toLowerCase().includes('asset%201.png') ||
        result.html.toLowerCase().includes('asset 1.png')) {
      console.log('⚠️  WARNING: HTML still contains header logo reference!');
    } else {
      console.log('✅ Confirmed: No logo reference in header');
    }

    console.log('\n✨ Test completed successfully!');
    console.log('\nYou can view the generated email by opening:');
    console.log(`  file://${htmlFile}`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testEmailGeneration();
