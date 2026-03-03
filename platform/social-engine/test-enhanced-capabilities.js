/**
 * Enhanced Image Generator Capabilities Demo
 *
 * Showcases new features from official Gemini documentation:
 * - Response modalities (image-only output)
 * - Complete aspect ratio specifications
 * - Smart provider recommendations
 * - Multi-provider comparison
 *
 * @see https://ai.google.dev/gemini-api/docs/image-generation
 */

const ImageGenerator = require('./image/image-generator.js');
const fs = require('fs').promises;
const path = require('path');

async function demonstrateCapabilities() {
  console.log('🎨 Enhanced Image Generator Capabilities Demo\n');
  console.log('Based on: https://ai.google.dev/gemini-api/docs/image-generation');
  console.log('='.repeat(70));

  // Initialize generator
  const generator = new ImageGenerator({
    geminiApiKey: process.env.GEMINI_API_KEY,
    falApiKey: process.env.FAL_KEY
  });

  // ============================================================
  // DEMO 1: Aspect Ratio Specifications
  // ============================================================
  console.log('\n📐 DEMO 1: Aspect Ratio Specifications\n');
  console.log('All supported aspect ratios with resolution and token info:\n');

  const aspectRatios = generator.supportedAspectRatios;
  console.log('| Aspect Ratio | Resolution | Tokens | Description |');
  console.log('|--------------|------------|--------|-------------|');

  for (const ratio of aspectRatios) {
    const info = generator.getAspectRatioInfo(ratio);
    console.log(`| ${ratio.padEnd(12)} | ${info.resolution.padEnd(10)} | ${info.tokens} | ${info.description} |`);
  }

  // ============================================================
  // DEMO 2: Smart Provider Recommendations
  // ============================================================
  console.log('\n\n🤖 DEMO 2: Smart Provider Recommendations\n');

  const useCases = [
    {
      name: 'Text-Heavy Graphics',
      params: { useCase: 'text-heavy', hasText: true }
    },
    {
      name: 'Photorealistic Images',
      params: { useCase: 'photorealism', priority: 'speed' }
    },
    {
      name: 'Multi-Image Composition',
      params: { hasMultipleImages: true, needsIteration: false }
    },
    {
      name: 'Iterative Design Work',
      params: { needsIteration: true, useCase: 'editing' }
    },
    {
      name: 'High-Quality Branding',
      params: { useCase: 'branding', priority: 'quality' }
    }
  ];

  for (const useCase of useCases) {
    const rec = generator.recommendProvider(useCase.params);
    console.log(`\n${useCase.name}:`);
    console.log(`  ✓ Provider: ${rec.provider} (${rec.model})`);
    console.log(`  ✓ Reasoning: ${rec.reasoning}`);
    console.log(`  ✓ Key Features:`);
    rec.features.forEach(f => console.log(`    - ${f}`));
    if (rec.note) {
      console.log(`  ⚠️  Note: ${rec.note}`);
    }
  }

  // ============================================================
  // DEMO 3: Response Modalities (Image-Only Output)
  // ============================================================
  console.log('\n\n🎯 DEMO 3: Response Modalities (Image-Only Output)\n');

  if (!process.env.GEMINI_API_KEY) {
    console.log('⚠️  Skipped: GEMINI_API_KEY not set');
  } else {
    try {
      console.log('Generating with imageOnly flag (forces image-only response)...\n');

      const prompt = "Professional logo: 'MADP Investment' with modern typography and financial growth visualization";

      const startTime = Date.now();
      const result = await generator.textToImage(prompt, {
        aspectRatio: "1:1",
        imageOnly: true  // Force image-only output
      });
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(`✅ Generated in ${duration}s`);
      console.log(`   Provider: ${result.provider}`);
      console.log(`   Image: ${result.images[0].path}`);
      console.log(`   Size: ${(result.images[0].size / 1024).toFixed(1)} KB`);

      // Copy to demo output
      const outputDir = path.join(__dirname, 'output', 'enhanced-capabilities');
      await fs.mkdir(outputDir, { recursive: true });
      const outputPath = path.join(outputDir, 'image-only-demo.png');
      await fs.copyFile(result.images[0].path, outputPath);
      console.log(`   📥 Saved to: ${outputPath}`);

    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
    }
  }

  // ============================================================
  // DEMO 4: Multi-Provider Comparison
  // ============================================================
  console.log('\n\n⚖️  DEMO 4: Multi-Provider Comparison\n');

  if (!process.env.GEMINI_API_KEY || !process.env.FAL_KEY) {
    console.log('⚠️  Skipped: Both GEMINI_API_KEY and FAL_KEY required');
  } else {
    try {
      const testPrompt = "Modern financial dashboard showing investment growth with clean design";
      const config = { aspectRatio: "16:9" };

      console.log('Generating same prompt with multiple providers...\n');
      console.log(`Prompt: ${testPrompt.substring(0, 60)}...`);
      console.log(`Config: ${JSON.stringify(config)}\n`);

      // Test Gemini
      console.log('Testing Gemini Native (gemini-2.5-flash-image)...');
      const geminiStart = Date.now();
      const geminiResult = await generator.textToImage(testPrompt, {
        ...config,
        provider: 'gemini'
      });
      const geminiTime = ((Date.now() - geminiStart) / 1000).toFixed(1);

      console.log(`  ✅ Gemini: ${geminiTime}s, ${(geminiResult.images[0].size / 1024).toFixed(1)} KB`);

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Test Fal AI
      console.log('\nTesting Fal AI (flux-kontext-lora)...');
      const falStart = Date.now();
      const falResult = await generator.textToImage(testPrompt, {
        ...config,
        provider: 'fal'
      });
      const falTime = ((Date.now() - falStart) / 1000).toFixed(1);

      console.log(`  ✅ Fal AI: ${falTime}s, ${(falResult.images[0].size / 1024).toFixed(1)} KB`);

      // Comparison
      console.log('\n📊 Comparison Results:');
      console.log(`  Speed Winner: ${geminiTime < falTime ? 'Gemini' : 'Fal AI'} (${Math.min(geminiTime, falTime)}s)`);
      console.log(`  File Size: Gemini ${(geminiResult.images[0].size / 1024).toFixed(1)} KB vs Fal AI ${(falResult.images[0].size / 1024).toFixed(1)} KB`);

      // Save comparison images
      const outputDir = path.join(__dirname, 'output', 'provider-comparison');
      await fs.mkdir(outputDir, { recursive: true });

      await fs.copyFile(geminiResult.images[0].path, path.join(outputDir, 'gemini-dashboard.png'));
      await fs.copyFile(falResult.images[0].path, path.join(outputDir, 'fal-ai-dashboard.png'));

      console.log(`\n📂 Comparison images saved to: ${outputDir}`);
      console.log('  - gemini-dashboard.png');
      console.log('  - fal-ai-dashboard.png');

    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
    }
  }

  // ============================================================
  // DEMO 5: Advanced Configuration Options
  // ============================================================
  console.log('\n\n⚙️  DEMO 5: Advanced Configuration Options\n');

  console.log('Example configurations for different use cases:\n');

  const configExamples = [
    {
      name: 'High-Fidelity Logo',
      config: {
        aspectRatio: "1:1",
        imageOnly: true,
        provider: 'gemini'
      }
    },
    {
      name: 'Fast Photorealistic Image',
      config: {
        aspectRatio: "16:9",
        provider: 'fal'
      }
    },
    {
      name: 'Instagram Story',
      config: {
        aspectRatio: "9:16",
        imageOnly: true
      }
    },
    {
      name: 'YouTube Thumbnail',
      config: {
        aspectRatio: "16:9",
        responseModalities: ["Image"]
      }
    },
    {
      name: 'Ultra-Wide Banner',
      config: {
        aspectRatio: "21:9",
        imageOnly: true
      }
    }
  ];

  configExamples.forEach(example => {
    console.log(`${example.name}:`);
    console.log(`  ${JSON.stringify(example.config, null, 2).replace(/\n/g, '\n  ')}`);
    console.log();
  });

  // ============================================================
  // Summary
  // ============================================================
  console.log('\n' + '='.repeat(70));
  console.log('✨ Demo Complete!\n');
  console.log('Enhanced Features Demonstrated:');
  console.log('  ✓ Complete aspect ratio specifications with token costs');
  console.log('  ✓ Smart provider recommendations based on use case');
  console.log('  ✓ Response modalities (image-only output)');
  console.log('  ✓ Multi-provider comparison capabilities');
  console.log('  ✓ Advanced configuration options\n');
  console.log('📚 See IMAGEN_CAPABILITIES_GUIDE.md for complete documentation');
  console.log('🔗 Official Docs: https://ai.google.dev/gemini-api/docs/image-generation');
  console.log('='.repeat(70) + '\n');
}

// Run demo
demonstrateCapabilities().catch(error => {
  console.error('\n💥 Demo failed:', error);
  process.exit(1);
});

