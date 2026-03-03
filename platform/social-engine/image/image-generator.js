/**
 * Image Generator
 *
 * Multi-provider image generation with support for:
 * 1. Text-to-Image Generation
 * 2. Image Editing with Text Prompts
 * 3. Multi-Image Composition
 * 4. Iterative Image Refinement
 * 5. Style Transfer
 * 6. Social Media Graphics
 *
 * Supports multiple AI image generation providers:
 * - Gemini 3 Pro Image Preview (Primary) - 4K native generation, text rendering, Google Search grounding
 * - Gemini 2.5 Flash Image (Fallback) - Fast generation for simpler tasks
 * - Fal AI - Fast generation with multiple models
 *
 * Features:
 * - Native 4K image generation (Gemini 3 Pro)
 * - High-fidelity text rendering
 * - Google Search grounding for fact-accurate visuals
 * - Conversational multi-turn editing
 * - Semantic masking/inpainting
 * - Multiple aspect ratios (1:1, 16:9, 9:16, etc.)
 * - Platform-optimized outputs
 * - Multi-language support
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

class ImageGenerator {
  constructor(options = {}) {
    // API Keys
    this.geminiApiKey = options.apiKey || options.geminiApiKey || process.env.GEMINI_API_KEY;
    this.falApiKey = options.falApiKey || process.env.FAL_KEY;

    // Provider selection
    this.provider = options.provider || 'gemini'; // 'gemini' or 'fal'
    this.simulate = options.simulate || false;

    // Gemini Models (Primary: Gemini 3 Pro Image Preview for 4K native generation)
    this.geminiModels = {
      primary: "gemini-3-flash-preview",     // 4K native, grounded generation, text rendering
      fallback: "gemini-2.5-flash-image"         // Fast fallback for simpler tasks
    };
    this.defaultModel = options.model || this.geminiModels.primary;

    // Fal AI models
    this.falModel = options.falModel || "fal-ai/flux-kontext-lora/text-to-image";
    this.falModels = {
      textToImage: "fal-ai/flux-kontext-lora/text-to-image",
      imageToImage: "fal-ai/flux-pro/kontext",          // Context-aware editing
      inpaint: "fal-ai/flux-kontext-lora/inpaint"       // Mask-based inpainting
    };

    // Gemini client (lazy loaded)
    this.client = null;

    // Image size options for Gemini 3 Pro Image Preview
    this.imageSizeOptions = {
      "4K": "4K",      // 3840x2160 equivalent quality
      "2K": "2K",      // 2560x1440 equivalent quality
      "HD": "HD"       // 1920x1080 equivalent quality
    };

    // Default configuration
    this.defaultConfig = {
      aspectRatio: "1:1",    // Default square images
      numberOfImages: 1,     // Generate 1 image by default
      imageSize: "4K",       // Default to 4K for high-quality output
      useGrounding: true     // Enable Google Search grounding by default
    };

    // Supported aspect ratios with official Gemini specifications
    // Source: https://ai.google.dev/gemini-api/docs/image-generation
    this.aspectRatioSpecs = {
      "1:1":  { resolution: "1024x1024", tokens: 1290, description: "Square" },
      "2:3":  { resolution: "832x1248",  tokens: 1290, description: "Portrait" },
      "3:2":  { resolution: "1248x832",  tokens: 1290, description: "Landscape" },
      "3:4":  { resolution: "864x1184",  tokens: 1290, description: "Portrait" },
      "4:3":  { resolution: "1184x864",  tokens: 1290, description: "Landscape" },
      "4:5":  { resolution: "896x1152",  tokens: 1290, description: "Portrait" },
      "5:4":  { resolution: "1152x896",  tokens: 1290, description: "Landscape" },
      "9:16": { resolution: "768x1344",  tokens: 1290, description: "Vertical (mobile)" },
      "16:9": { resolution: "1344x768",  tokens: 1290, description: "Horizontal (widescreen)" },
      "21:9": { resolution: "1536x672",  tokens: 1290, description: "Ultra-wide" }
    };

    this.supportedAspectRatios = Object.keys(this.aspectRatioSpecs);

    // Fal AI image size mapping
    this.falImageSizes = {
      "1:1": "square_hd",
      "16:9": "landscape_16_9",
      "9:16": "portrait_16_9",
      "4:3": "landscape_4_3",
      "3:4": "portrait_4_3"
    };
  }

  /**
   * Get aspect ratio specifications
   * @param {string} aspectRatio - Aspect ratio (e.g., "16:9")
   * @returns {Object} Specifications including resolution and token cost
   */
  getAspectRatioInfo(aspectRatio) {
    return this.aspectRatioSpecs[aspectRatio] || null;
  }

  /**
   * Recommend provider based on use case
   * Source: https://ai.google.dev/gemini-api/docs/image-generation
   *
   * @param {Object} requirements - Use case requirements
   * @returns {Object} Recommended provider and reasoning
   *
   * @example
   * const rec = generator.recommendProvider({
   *   useCase: 'photorealism',
   *   priority: 'quality',
   *   hasMultipleImages: false
   * });
   */
  recommendProvider(requirements = {}) {
    const {
      useCase = 'general',           // 'photorealism', 'text-heavy', 'editing', 'style-transfer', 'branding'
      priority = 'quality',          // 'quality', 'speed', 'cost'
      hasMultipleImages = false,     // Multi-image composition
      needsIteration = false,        // Iterative refinement
      hasText = false,               // Text rendering in image
      need4K = false,                // High-resolution 4K output
      needGrounding = false          // Fact-accurate visuals with Google Search
    } = requirements;

    // Gemini 3 Pro Image Preview - Best for 4K, grounded, high-quality generation
    if (need4K || needGrounding || priority === 'quality' || useCase === 'branding') {
      return {
        provider: 'gemini',
        model: 'gemini-3-flash-preview',
        reasoning: 'Gemini 3 Pro Image Preview offers native 4K generation, Google Search grounding, and best-in-class text rendering',
        features: [
          'Native 4K image generation',
          'Google Search grounding for accuracy',
          'High-fidelity text rendering',
          'Conversational multi-turn editing',
          'Best quality output'
        ]
      };
    }

    // Gemini 2.5 Flash - Fast for multi-image and iterative tasks
    if (hasMultipleImages || needsIteration || hasText) {
      return {
        provider: 'gemini',
        model: 'gemini-2.5-flash-image',
        reasoning: 'Gemini 2.5 Flash excels at multi-image composition and iterative refinement with fast generation',
        features: [
          'Conversational multi-turn editing',
          'Multi-image composition',
          'High-fidelity text rendering',
          'Simple mask-free editing',
          'Fast generation speed'
        ]
      };
    }

    // Fal AI (Flux Kontext LoRA) - Fast, photorealistic, cost-effective
    if (useCase === 'photorealism' && priority === 'speed') {
      return {
        provider: 'fal',
        model: 'fal-ai/flux-kontext-lora/text-to-image',
        reasoning: 'Fal AI provides fast, photorealistic image generation',
        features: [
          'Fast generation (8-10s)',
          'Photorealistic output',
          'Good for single images',
          'Cost-effective'
        ]
      };
    }

    // Default to Gemini 3 Pro for best quality
    return {
      provider: 'gemini',
      model: 'gemini-3-flash-preview',
      reasoning: 'Gemini 3 Pro Image Preview provides the best balance of quality (4K), accuracy (grounding), and text rendering',
      features: [
        'Native 4K image generation',
        'Google Search grounding',
        'High-fidelity text rendering',
        'Conversational editing',
        'Multi-modal understanding'
      ]
    };
  }

  /**
   * Initialize Gemini AI client
   */
  async initClient() {
    if (!this.client && this.geminiApiKey) {
      const { GoogleGenAI } = await import('@google/genai');
      this.client = new GoogleGenAI({ apiKey: this.geminiApiKey });
    }
    return this.client;
  }

  /**
   * 1. TEXT-TO-IMAGE GENERATION
   *
   * Generate images from text prompts
   *
   * @param {string} prompt - Image description
   * @param {Object} config - Image configuration
   * @returns {Object} Image result with file paths
   *
   * @example
   * const result = await producer.textToImage(
   *   "A nano banana dish in a fancy restaurant with Gemini theme",
   *   { aspectRatio: "16:9", numberOfImages: 2, provider: "fal" }
   * );
   */
  async textToImage(prompt, config = {}) {
    if (this.simulate) {
      return this._simulateResult("text-to-image", config);
    }

    const finalConfig = { ...this.defaultConfig, ...config };
    const provider = config.provider || this.provider;

    console.log(`🎨 Text-to-Image Generation (${provider.toUpperCase()})`);
    console.log(`   Prompt: ${prompt.substring(0, 60)}...`);
    console.log(`   Aspect Ratio: ${finalConfig.aspectRatio}`);

    // Route to appropriate provider
    if (provider === 'fal') {
      return await this._falTextToImage(prompt, finalConfig);
    } else {
      return await this._geminiTextToImage(prompt, finalConfig);
    }
  }

  /**
   * GEMINI: Text-to-Image Generation
   * Supports both Gemini 3 Pro Image Preview (4K, grounding) and Gemini 2.5 Flash
   * @private
   */
  async _geminiTextToImage(prompt, config) {
    const ai = await this.initClient();

    // Determine which model to use
    const model = config.model || this.defaultModel;
    const isGemini3Pro = model.includes('gemini-3-pro');

    console.log(`   Provider: ${isGemini3Pro ? 'Gemini 3 Pro Image Preview' : 'Gemini 2.5 Flash Image'}`);
    console.log(`   Model: ${model}`);
    console.log(`   Number of Images: ${config.numberOfImages || 1}`);

    // Build generation config based on model capabilities
    const generationConfig = {
      imageConfig: {
        aspectRatio: config.aspectRatio
      }
    };

    // Gemini 3 Pro Image Preview specific features
    if (isGemini3Pro) {
      // Add 4K image size support
      const imageSize = config.imageSize || this.defaultConfig.imageSize || "4K";
      generationConfig.imageConfig.imageSize = imageSize;
      console.log(`   Image Size: ${imageSize}`);

      // Add Google Search grounding for fact-accurate visuals
      const useGrounding = config.useGrounding !== false;
      if (useGrounding) {
        console.log(`   Grounding: Google Search enabled`);
      }
    }

    // Force image-only output if specified
    // Source: https://ai.google.dev/gemini-api/docs/image-generation
    if (config.imageOnly || config.responseModalities) {
      generationConfig.responseModalities = config.responseModalities || ["Image"];
      console.log(`   Response Mode: Image-only`);
    }

    // Build request with optional tools for grounding
    const requestOptions = {
      model: model,
      contents: prompt,
      config: generationConfig
    };

    // Add Google Search tool for Gemini 3 Pro with grounding
    if (isGemini3Pro && config.useGrounding !== false) {
      requestOptions.config.tools = [{ googleSearch: {} }];
    }

    try {
      const response = await ai.models.generateContent(requestOptions);
      const images = await this._extractAndSaveImages(response, "gemini-text-to-image");

      console.log(`   ✅ Generated ${images.length} image(s) with ${model}`);

      return {
        type: "text-to-image",
        provider: "gemini",
        model: model,
        prompt: prompt,
        images: images,
        config: config,
        features: isGemini3Pro ? ['4K', 'grounding'] : ['fast']
      };
    } catch (error) {
      // Fallback to Gemini 2.5 Flash if Gemini 3 Pro fails
      if (isGemini3Pro && this.geminiModels.fallback) {
        console.log(`   ⚠️  Gemini 3 Pro failed, falling back to ${this.geminiModels.fallback}`);
        console.log(`   Error: ${error.message}`);

        // Retry with fallback model
        const fallbackConfig = { ...config, model: this.geminiModels.fallback };
        delete fallbackConfig.imageSize; // Remove 4K config for fallback
        delete fallbackConfig.useGrounding;

        return await this._geminiTextToImage(prompt, fallbackConfig);
      }
      throw error;
    }
  }

  /**
   * FAL AI: Text-to-Image Generation
   * @private
   */
  async _falTextToImage(prompt, config) {
    if (!this.falApiKey) {
      throw new Error('FAL_KEY not configured. Set it in constructor or environment.');
    }

    const fetch = (await import('node-fetch')).default;

    console.log(`   Provider: Fal AI`);
    console.log(`   Model: ${this.falModel}`);

    // Map aspect ratio to Fal image size
    const imageSize = this.falImageSizes[config.aspectRatio] || "square_hd";

    const requestBody = {
      prompt: prompt,
      image_size: imageSize,
      num_inference_steps: 28,
      num_images: config.numberOfImages || 1,
      enable_safety_checker: true
    };

    console.log(`   Image Size: ${imageSize}`);

    const response = await fetch(`https://queue.fal.run/${this.falModel}`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${this.falApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Fal AI API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();

    // Handle response - might be synchronous or async
    let finalResult = result;

    // Check if images are already in response (synchronous)
    if (result.images && result.images.length > 0) {
      finalResult = result;
    }
    // Check if we have a status URL for polling (async)
    else if (result.status_url) {
      console.log(`   ⏳ Queued, polling for results...`);
      finalResult = await this._pollFalResultByUrl(result.status_url);
    }
    // Check if we have request_id (older format)
    else if (result.request_id) {
      console.log(`   ⏳ Queued, polling for results...`);
      finalResult = await this._pollFalResultById(result.request_id);
    }
    // Direct response with data
    else if (result.data && result.data.images) {
      finalResult = result.data;
    }

    // Download and save images
    const images = await this._downloadFalImages(finalResult, "fal-text-to-image");

    console.log(`   ✅ Generated ${images.length} image(s)`);

    return {
      type: "text-to-image",
      provider: "fal",
      model: this.falModel,
      prompt: prompt,
      images: images,
      config: config
    };
  }

  /**
   * Poll Fal AI by status URL
   * @private
   */
  async _pollFalResultByUrl(statusUrl) {
    const fetch = (await import('node-fetch')).default;
    const maxAttempts = 60;
    const pollInterval = 2000; // 2 seconds

    for (let i = 0; i < maxAttempts; i++) {
      const response = await fetch(statusUrl, {
        headers: {
          'Authorization': `Key ${this.falApiKey}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to poll status: ${response.status}`);
      }

      const result = await response.json();

      if (result.status === 'COMPLETED' || result.completed_at) {
        // ALWAYS fetch from response_url when available (required for actual image data)
        if (result.response_url) {
          console.log(`   📥 Fetching result from response_url...`);
          const resultResponse = await fetch(result.response_url, {
            headers: {
              'Authorization': `Key ${this.falApiKey}`
            }
          });

          if (!resultResponse.ok) {
            const errorText = await resultResponse.text();
            throw new Error(`Failed to fetch result: ${resultResponse.status} - ${errorText}`);
          }

          const finalResult = await resultResponse.json();
          // Return the data field if it exists, otherwise the full result
          return finalResult.data || finalResult;
        }

        // Fallback if no response_url (shouldn't happen normally)
        return result.data || result;
      } else if (result.status === 'FAILED') {
        throw new Error(`Generation failed: ${result.error || 'Unknown error'}`);
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Generation timed out');
  }

  /**
   * Poll Fal AI by request ID (legacy)
   * @private
   */
  async _pollFalResultById(requestId) {
    const fetch = (await import('node-fetch')).default;
    const maxAttempts = 60;
    const pollInterval = 2000; // 2 seconds

    for (let i = 0; i < maxAttempts; i++) {
      const response = await fetch(`https://queue.fal.run/requests/status/${requestId}`, {
        headers: {
          'Authorization': `Key ${this.falApiKey}`
        }
      });

      if (!response.ok) {
        // Try alternate endpoint
        const altResponse = await fetch(`https://fal.run/fal-ai/flux-kontext-lora/text-to-image/requests/${requestId}`, {
          headers: {
            'Authorization': `Key ${this.falApiKey}`
          }
        });

        if (!altResponse.ok) {
          throw new Error(`Failed to poll status: ${response.status} / ${altResponse.status}`);
        }

        const altResult = await altResponse.json();
        if (altResult.status === 'COMPLETED' || altResult.images) {
          return altResult;
        }
      } else {
        const result = await response.json();

        if (result.status === 'COMPLETED' || result.images) {
          return result;
        } else if (result.status === 'FAILED') {
          throw new Error(`Generation failed: ${result.error || 'Unknown error'}`);
        }
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Generation timed out');
  }

  /**
   * Download Fal AI generated images
   * @private
   */
  async _downloadFalImages(result, prefix = "fal-image") {
    const fetch = (await import('node-fetch')).default;
    const images = [];

    // Handle different response structures
    let imageUrls = [];

    if (result.images && Array.isArray(result.images)) {
      imageUrls = result.images;
    } else if (result.data && result.data.images) {
      imageUrls = result.data.images;
    } else if (result.output && result.output.images) {
      imageUrls = result.output.images;
    } else if (result.image) {
      // Single image
      imageUrls = [result.image];
    } else if (result.url) {
      // Direct URL
      imageUrls = [result.url];
    }

    if (imageUrls.length === 0) {
      console.log(`   ⚠️  No images found in Fal AI response`);
      console.log(`   Response keys:`, Object.keys(result));
    }

    for (let i = 0; i < imageUrls.length; i++) {
      const imageUrl = typeof imageUrls[i] === 'string' ? imageUrls[i] : (imageUrls[i].url || imageUrls[i].image);

      if (!imageUrl) {
        console.log(`   ⚠️  Skipping invalid image URL at index ${i}`);
        continue;
      }

      const response = await fetch(imageUrl);
      if (!response.ok) {
        console.log(`   ⚠️  Failed to download image: ${response.status}`);
        continue;
      }

      const buffer = await response.buffer();

      const filename = `${prefix}-${Date.now()}-${i}.png`;
      const filepath = `/tmp/${filename}`;

      await fs.writeFile(filepath, buffer);

      images.push({
        path: filepath,
        filename: filename,
        size: buffer.length,
        mimeType: "image/png",
        url: imageUrl
      });
    }

    return images;
  }

  /**
   * 2. IMAGE EDITING WITH TEXT PROMPTS
   *
   * Edit existing images using text instructions
   * Supports both Gemini and Fal AI (FLUX Kontext Pro)
   *
   * @param {string} prompt - Editing instructions
   * @param {string|Buffer} inputImage - Path to image or image buffer
   * @param {Object} config - Image configuration
   * @returns {Object} Edited image result
   *
   * @example
   * // Gemini editing (default)
   * const result = await producer.editImage(
   *   "Add a wizard hat to the cat's head",
   *   "./cat.png",
   *   { aspectRatio: "1:1" }
   * );
   *
   * // Fal AI Kontext editing (context-aware)
   * const result = await producer.editImage(
   *   "Put a donut next to the flour",
   *   "./kitchen.png",
   *   { provider: 'fal', aspectRatio: "16:9" }
   * );
   */
  async editImage(prompt, inputImage, config = {}) {
    if (this.simulate) {
      return this._simulateResult("image-editing", config);
    }

    const finalConfig = { ...this.defaultConfig, ...config };
    const provider = config.provider || this.provider;

    console.log(`🎨 Image Editing (${provider.toUpperCase()})`);
    console.log(`   Instruction: ${prompt.substring(0, 60)}...`);

    // Route to appropriate provider
    if (provider === 'fal') {
      return await this._falEditImage(prompt, inputImage, finalConfig);
    } else {
      return await this._geminiEditImage(prompt, inputImage, finalConfig);
    }
  }

  /**
   * GEMINI: Image Editing
   * Supports both Gemini 3 Pro Image Preview (4K, grounding) and Gemini 2.5 Flash
   * @private
   */
  async _geminiEditImage(prompt, inputImage, config) {
    const ai = await this.initClient();

    // Determine which model to use
    const model = config.model || this.defaultModel;
    const isGemini3Pro = model.includes('gemini-3-pro');

    console.log(`   Provider: ${isGemini3Pro ? 'Gemini 3 Pro Image Preview' : 'Gemini 2.5 Flash Image'}`);
    console.log(`   Model: ${model}`);
    console.log(`   Mode: Mask-free editing`);

    // Load input image
    const imageData = await this._loadImage(inputImage);

    const contents = [
      { text: prompt },
      {
        inlineData: {
          mimeType: imageData.mimeType,
          data: imageData.base64Data
        }
      }
    ];

    // Build generation config with optional responseModalities
    const generationConfig = {
      imageConfig: {
        aspectRatio: config.aspectRatio
      }
    };

    // Gemini 3 Pro Image Preview specific features
    if (isGemini3Pro) {
      const imageSize = config.imageSize || this.defaultConfig.imageSize || "4K";
      generationConfig.imageConfig.imageSize = imageSize;
      console.log(`   Image Size: ${imageSize}`);
    }

    // Force image-only output if specified
    if (config.imageOnly || config.responseModalities) {
      generationConfig.responseModalities = config.responseModalities || ["Image"];
    }

    // Build request options
    const requestOptions = {
      model: model,
      contents: contents,
      config: generationConfig
    };

    // Add Google Search tool for Gemini 3 Pro with grounding
    if (isGemini3Pro && config.useGrounding !== false) {
      requestOptions.config.tools = [{ googleSearch: {} }];
      console.log(`   Grounding: Google Search enabled`);
    }

    try {
      const response = await ai.models.generateContent(requestOptions);
      const images = await this._extractAndSaveImages(response, "gemini-edited");

      console.log(`   ✅ Image edited successfully with ${model}`);

      return {
        type: "image-editing",
        provider: "gemini",
        model: model,
        prompt: prompt,
        inputImage: typeof inputImage === 'string' ? inputImage : 'buffer',
        images: images,
        config: config,
        features: isGemini3Pro ? ['4K', 'grounding'] : ['fast']
      };
    } catch (error) {
      // Fallback to Gemini 2.5 Flash if Gemini 3 Pro fails
      if (isGemini3Pro && this.geminiModels.fallback) {
        console.log(`   ⚠️  Gemini 3 Pro failed, falling back to ${this.geminiModels.fallback}`);
        console.log(`   Error: ${error.message}`);

        const fallbackConfig = { ...config, model: this.geminiModels.fallback };
        delete fallbackConfig.imageSize;
        delete fallbackConfig.useGrounding;

        return await this._geminiEditImage(prompt, inputImage, fallbackConfig);
      }
      throw error;
    }
  }

  /**
   * FAL AI: Image Editing with FLUX Kontext Pro
   * Context-aware image editing without detailed descriptions
   * Source: https://fal.ai/models/fal-ai/flux-pro/kontext/api
   * @private
   */
  async _falEditImage(prompt, inputImage, config) {
    if (!this.falApiKey) {
      throw new Error('FAL_KEY not configured. Set it in constructor or environment.');
    }

    const fetch = (await import('node-fetch')).default;

    console.log(`   Provider: Fal AI`);
    console.log(`   Model: ${this.falModels.imageToImage}`);
    console.log(`   Mode: Context-aware editing`);

    // Upload image to Fal AI if it's a local file
    let imageUrl;
    if (typeof inputImage === 'string' && inputImage.startsWith('http')) {
      imageUrl = inputImage;
    } else {
      // Need to upload the image first
      const imageData = await this._loadImage(inputImage);
      // For now, we'll need the image as a URL. TODO: Add Fal upload support
      throw new Error('Fal AI editing requires image URL. Please upload image first or provide URL.');
    }

    // Map aspect ratio to Fal format
    const aspectRatio = this._mapAspectRatioForFal(config.aspectRatio);

    const requestBody = {
      prompt: prompt,
      image_url: imageUrl,
      guidance_scale: config.guidanceScale || 3.5,
      num_images: config.numberOfImages || 1,
      output_format: config.outputFormat || "jpeg",
      safety_tolerance: config.safetyTolerance || "2",
      enhance_prompt: config.enhancePrompt || false
    };

    if (aspectRatio) {
      requestBody.aspect_ratio = aspectRatio;
    }

    console.log(`   Aspect Ratio: ${requestBody.aspect_ratio || 'auto'}`);

    const response = await fetch(`https://queue.fal.run/${this.falModels.imageToImage}`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${this.falApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Fal AI API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();

    // Handle response - might be synchronous or async
    let finalResult = result;

    if (result.images && result.images.length > 0) {
      finalResult = result;
    } else if (result.status_url) {
      console.log(`   ⏳ Queued, polling for results...`);
      finalResult = await this._pollFalResultByUrl(result.status_url);
    } else if (result.request_id) {
      console.log(`   ⏳ Queued, polling for results...`);
      finalResult = await this._pollFalResultById(result.request_id);
    } else if (result.data && result.data.images) {
      finalResult = result.data;
    }

    // Download and save images
    const images = await this._downloadFalImages(finalResult, "fal-edited");

    console.log(`   ✅ Image edited successfully`);

    return {
      type: "image-editing",
      provider: "fal",
      model: this.falModels.imageToImage,
      prompt: prompt,
      inputImage: imageUrl,
      images: images,
      config: config
    };
  }

  /**
   * Map aspect ratio to Fal AI format
   * @private
   */
  _mapAspectRatioForFal(aspectRatio) {
    // Fal AI uses format like "21:9", "16:9", "4:3", etc.
    const falSupportedRatios = ["21:9", "16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16", "9:21"];
    if (falSupportedRatios.includes(aspectRatio)) {
      return aspectRatio;
    }
    return null; // Let Fal AI use default
  }

  /**
   * 2B. INPAINTING (MASK-BASED EDITING)
   *
   * Fill or modify masked areas of an image using Fal AI Flux Kontext Inpaint
   * Source: https://fal.ai/models/fal-ai/flux-kontext-lora/inpaint
   *
   * @param {string} prompt - What to generate in the masked area
   * @param {string} imageUrl - URL of the image to inpaint (must be hosted)
   * @param {string} maskUrl - URL of the mask image (white = inpaint, black = keep)
   * @param {Object} config - Inpainting configuration
   * @returns {Object} Inpainted image result
   *
   * @example
   * const result = await generator.inpaint(
   *   "A red sports car",
   *   "https://example.com/image.png",
   *   "https://example.com/mask.png",
   *   {
   *     imageSize: "landscape_16_9",
   *     guidanceScale: 3.5
   *   }
   * );
   */
  async inpaint(prompt, imageUrl, maskUrl, config = {}) {
    if (this.simulate) {
      return this._simulateResult("inpainting", config);
    }

    if (!this.falApiKey) {
      throw new Error('FAL_KEY required for inpainting. This feature uses Fal AI Flux Kontext Inpaint.');
    }

    const fetch = (await import('node-fetch')).default;

    console.log(`🎨 Image Inpainting (FAL AI)`);
    console.log(`   Model: ${this.falModels.inpaint}`);
    console.log(`   Prompt: ${prompt.substring(0, 60)}...`);
    console.log(`   Mode: Mask-based filling`);

    // Fal AI inpaint requires specific image size format
    const imageSize = config.imageSize || this._mapAspectRatioToFalImageSize(config.aspectRatio) || "landscape_4_3";

    const requestBody = {
      prompt: prompt,
      image_url: imageUrl,
      mask_url: maskUrl,
      image_size: imageSize,
      num_inference_steps: config.numInferenceSteps || 28,
      guidance_scale: config.guidanceScale || 3.5,
      num_images: config.numberOfImages || 1,
      output_format: config.outputFormat || "jpeg",
      safety_tolerance: config.safetyTolerance || "2",
      enable_safety_checker: config.enableSafetyChecker !== false
    };

    if (config.seed) {
      requestBody.seed = config.seed;
    }

    console.log(`   Image Size: ${imageSize}`);
    console.log(`   Inference Steps: ${requestBody.num_inference_steps}`);

    const response = await fetch(`https://queue.fal.run/${this.falModels.inpaint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${this.falApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Fal AI Inpaint API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();

    // Handle response
    let finalResult = result;

    if (result.images && result.images.length > 0) {
      finalResult = result;
    } else if (result.status_url) {
      console.log(`   ⏳ Queued, polling for results...`);
      finalResult = await this._pollFalResultByUrl(result.status_url);
    } else if (result.request_id) {
      console.log(`   ⏳ Queued, polling for results...`);
      finalResult = await this._pollFalResultById(result.request_id);
    } else if (result.data && result.data.images) {
      finalResult = result.data;
    }

    // Download and save images
    const images = await this._downloadFalImages(finalResult, "fal-inpainted");

    console.log(`   ✅ Inpainting complete`);

    return {
      type: "inpainting",
      provider: "fal",
      model: this.falModels.inpaint,
      prompt: prompt,
      inputImage: imageUrl,
      maskImage: maskUrl,
      images: images,
      config: { ...config, imageSize }
    };
  }

  /**
   * Map aspect ratio to Fal AI image size format
   * @private
   */
  _mapAspectRatioToFalImageSize(aspectRatio) {
    const mapping = {
      "1:1": "square_hd",
      "16:9": "landscape_16_9",
      "9:16": "portrait_16_9",
      "4:3": "landscape_4_3",
      "3:4": "portrait_4_3"
    };
    return mapping[aspectRatio] || null;
  }

  /**
   * 3. MULTI-IMAGE COMPOSITION
   *
   * Combine multiple images with text instructions
   * Up to 3 input images supported
   *
   * @param {string} prompt - Composition instructions
   * @param {Array<string|Buffer>} inputImages - Array of image paths or buffers (max 3)
   * @param {Object} config - Image configuration
   * @returns {Object} Composed image result
   *
   * @example
   * const result = await producer.composeImages(
   *   "Combine these images into a collage showing product evolution",
   *   ["./v1.png", "./v2.png", "./v3.png"],
   *   { aspectRatio: "16:9" }
   * );
   */
  async composeImages(prompt, inputImages, config = {}) {
    if (this.simulate) {
      return this._simulateResult("multi-image-composition", config);
    }

    if (!inputImages || inputImages.length === 0) {
      throw new Error("At least one input image required");
    }

    if (inputImages.length > 3) {
      throw new Error("Maximum 3 input images allowed");
    }

    const ai = await this.initClient();
    const finalConfig = { ...this.defaultConfig, ...config };

    console.log(`🎨 Multi-Image Composition`);
    console.log(`   Prompt: ${prompt.substring(0, 60)}...`);
    console.log(`   Input Images: ${inputImages.length}`);

    // Build contents array with text first, then images
    const contents = [{ text: prompt }];

    for (const image of inputImages) {
      const imageData = await this._loadImage(image);
      contents.push({
        inlineData: {
          mimeType: imageData.mimeType,
          data: imageData.base64Data
        }
      });
    }

    // Build generation config with optional responseModalities
    const generationConfig = {
      imageConfig: {
        aspectRatio: finalConfig.aspectRatio
      }
    };

    // Force image-only output if specified
    if (finalConfig.imageOnly || finalConfig.responseModalities) {
      generationConfig.responseModalities = finalConfig.responseModalities || ["Image"];
    }

    const response = await ai.models.generateContent({
      model: this.defaultModel,
      contents: contents,
      config: generationConfig
    });

    const images = await this._extractAndSaveImages(response, "composed");

    console.log(`   ✅ Images composed successfully`);

    return {
      type: "multi-image-composition",
      prompt: prompt,
      inputImageCount: inputImages.length,
      images: images,
      config: finalConfig
    };
  }

  /**
   * 4. ITERATIVE IMAGE REFINEMENT
   *
   * Refine an image through multiple iterations
   *
   * @param {string} initialPrompt - Initial image generation prompt
   * @param {Array<string>} refinementPrompts - Array of refinement instructions
   * @param {Object} config - Image configuration
   * @returns {Object} Refinement history with all iterations
   *
   * @example
   * const result = await producer.refineImage(
   *   "Create a modern logo for PL Capital",
   *   [
   *     "Make the colors more vibrant",
   *     "Add a subtle gradient effect",
   *     "Increase the size of the text"
   *   ]
   * );
   */
  async refineImage(initialPrompt, refinementPrompts, config = {}) {
    console.log(`\n🎨 Iterative Image Refinement`);
    console.log(`   Initial: ${initialPrompt.substring(0, 60)}...`);
    console.log(`   Refinements: ${refinementPrompts.length}`);

    const iterations = [];

    // Generate initial image
    console.log(`\n📐 Iteration 1 (Initial)`);
    const initial = await this.textToImage(initialPrompt, config);
    iterations.push({
      iteration: 1,
      type: "initial",
      prompt: initialPrompt,
      images: initial.images
    });

    let currentImage = initial.images[0].path;

    // Apply refinements
    for (let i = 0; i < refinementPrompts.length; i++) {
      console.log(`\n📐 Iteration ${i + 2} (Refinement ${i + 1})`);

      const refined = await this.editImage(
        refinementPrompts[i],
        currentImage,
        config
      );

      iterations.push({
        iteration: i + 2,
        type: "refinement",
        prompt: refinementPrompts[i],
        images: refined.images
      });

      currentImage = refined.images[0].path;
    }

    console.log(`\n✅ Refinement Complete`);
    console.log(`   Total Iterations: ${iterations.length}`);
    console.log(`   Final Image: ${currentImage}`);

    return {
      type: "iterative-refinement",
      initialPrompt: initialPrompt,
      refinements: refinementPrompts,
      iterations: iterations,
      finalImage: currentImage,
      config: config
    };
  }

  /**
   * 5. STYLE TRANSFER
   *
   * Apply style from reference image to content
   *
   * @param {string} contentImage - Content image path or buffer
   * @param {string} styleDescription - Description of desired style
   * @param {Object} config - Image configuration
   * @returns {Object} Stylized image result
   *
   * @example
   * const result = await producer.applyStyle(
   *   "./photo.png",
   *   "Apply Van Gogh's Starry Night painting style",
   *   { aspectRatio: "4:3" }
   * );
   */
  async applyStyle(contentImage, styleDescription, config = {}) {
    if (this.simulate) {
      return this._simulateResult("style-transfer", config);
    }

    console.log(`🎨 Style Transfer`);
    console.log(`   Style: ${styleDescription.substring(0, 60)}...`);

    // Use image editing with style instruction
    const result = await this.editImage(
      styleDescription,
      contentImage,
      config
    );

    return {
      ...result,
      type: "style-transfer",
      styleDescription: styleDescription
    };
  }

  /**
   * 6. GENERATE SOCIAL MEDIA GRAPHICS
   *
   * Generate images optimized for social media platforms
   * Uses Gemini 3 Pro Image Preview for 4K quality by default
   *
   * @param {string} prompt - Image description
   * @param {string} platform - Platform name (linkedin, instagram, twitter, facebook)
   * @param {Object} config - Additional configuration
   * @returns {Object} Social media optimized image
   *
   * @example
   * const result = await producer.generateSocialGraphic(
   *   "Financial portfolio growth chart with MADP branding",
   *   "linkedin"
   * );
   */
  async generateSocialGraphic(prompt, platform, config = {}) {
    const platformConfigs = {
      linkedin: { aspectRatio: "1:1", size: "Post (1200x1200)", imageSize: "4K" },
      instagram: { aspectRatio: "1:1", size: "Feed (1080x1080)", imageSize: "4K" },
      "instagram-story": { aspectRatio: "9:16", size: "Story (1080x1920)", imageSize: "4K" },
      twitter: { aspectRatio: "16:9", size: "Post (1200x675)", imageSize: "4K" },
      facebook: { aspectRatio: "1:1", size: "Post (1200x1200)", imageSize: "4K" },
      youtube: { aspectRatio: "16:9", size: "Thumbnail (1280x720)", imageSize: "4K" }
    };

    const platformConfig = platformConfigs[platform] || platformConfigs.linkedin;

    console.log(`🎨 Social Media Graphic: ${platform.toUpperCase()}`);
    console.log(`   Optimized: ${platformConfig.size}`);

    const finalConfig = {
      ...platformConfig,
      useGrounding: true, // Enable grounding for accurate visuals
      ...config
    };

    const result = await this.textToImage(prompt, finalConfig);

    return {
      ...result,
      platform: platform,
      optimizedFor: platformConfig.size
    };
  }

  /**
   * 7. GENERATE 4K IMAGE WITH GEMINI 3 PRO
   *
   * Generate high-resolution 4K images using Gemini 3 Pro Image Preview
   * with Google Search grounding for fact-accurate visuals
   *
   * @param {string} prompt - Image description
   * @param {Object} config - Image configuration
   * @returns {Object} 4K image result
   *
   * @example
   * const result = await generator.generate4KImage(
   *   "Current weather visualization of Tokyo with real-time data",
   *   { aspectRatio: "16:9", useGrounding: true }
   * );
   */
  async generate4KImage(prompt, config = {}) {
    console.log(`🎨 4K Image Generation (Gemini 3 Pro Image Preview)`);
    console.log(`   Prompt: ${prompt.substring(0, 60)}...`);

    const finalConfig = {
      ...this.defaultConfig,
      model: this.geminiModels.primary,
      imageSize: "4K",
      useGrounding: true, // Enable Google Search grounding by default
      ...config
    };

    return await this.textToImage(prompt, finalConfig);
  }

  /**
   * 8. GENERATE GROUNDED IMAGE
   *
   * Generate images with Google Search grounding for fact-accurate visuals
   * Useful for visualizing real-world data, current events, or verified information
   *
   * @param {string} prompt - Image description (should reference real-world data)
   * @param {Object} config - Image configuration
   * @returns {Object} Grounded image result
   *
   * @example
   * const result = await generator.generateGroundedImage(
   *   "Generate a visualization of the current weather in Mumbai",
   *   { aspectRatio: "16:9" }
   * );
   */
  async generateGroundedImage(prompt, config = {}) {
    console.log(`🎨 Grounded Image Generation (Google Search)`);
    console.log(`   Prompt: ${prompt.substring(0, 60)}...`);

    const finalConfig = {
      ...this.defaultConfig,
      model: this.geminiModels.primary,
      imageSize: "4K",
      useGrounding: true,
      ...config
    };

    return await this.textToImage(prompt, finalConfig);
  }

  /**
   * 9. GENERATE BRAND-AWARE IMAGE
   *
   * Generate images with PL Capital brand guidelines
   * Automatically applies brand colors, fonts, and audience-specific styling
   *
   * @param {string} prompt - Image description
   * @param {string} targetAudience - Target audience (internal, mass_affluent, hni, uhni, all_clients)
   * @param {string} templateType - Template type (marketUpdate, investmentTip, productPromo)
   * @param {Object} config - Additional configuration
   * @returns {Object} Brand-aware image result
   *
   * @example
   * const result = await generator.generateBrandImage(
   *   "Market update showing Q4 portfolio performance",
   *   "hni",
   *   "marketUpdate",
   *   { platform: "linkedin" }
   * );
   */
  async generateBrandImage(prompt, targetAudience = 'all_clients', templateType = 'marketUpdate', config = {}) {
    // Load brand config
    const brandConfig = require('../config/brand-config.js');

    console.log(`🎨 Brand-Aware Image Generation (PL Capital)`);
    console.log(`   Target Audience: ${targetAudience}`);
    console.log(`   Template: ${templateType}`);

    // Get audience-specific configuration
    const audienceConfig = brandConfig.targetAudiences[targetAudience] || brandConfig.targetAudiences.all_clients;

    // Generate enhanced prompt with brand requirements
    const brandPrompt = brandConfig.helpers.generateGeminiPrompt(
      templateType,
      targetAudience,
      prompt
    );

    console.log(`   Brand Style: ${audienceConfig.contentStyle}`);
    console.log(`   Tone: ${audienceConfig.tone}`);

    // Configure platform-specific settings
    let finalConfig = {
      ...this.defaultConfig,
      model: this.geminiModels.primary,
      imageSize: "4K",
      useGrounding: true,
      ...config
    };

    // Apply platform settings if specified
    if (config.platform) {
      const platformConfigs = {
        linkedin: { aspectRatio: "1:1" },
        "instagram-story": { aspectRatio: "9:16" },
        twitter: { aspectRatio: "16:9" },
        presentation: { aspectRatio: "16:9" }
      };
      finalConfig = { ...finalConfig, ...(platformConfigs[config.platform] || {}) };
    }

    // Generate image with brand-enhanced prompt
    const result = await this.textToImage(brandPrompt, finalConfig);

    // Add brand metadata
    result.brand = {
      company: brandConfig.company.name,
      audience: targetAudience,
      template: templateType,
      colorPalette: audienceConfig.colorPalette,
      disclaimer: brandConfig.helpers.requiresDisclaimer(targetAudience)
        ? brandConfig.compliance.disclaimer.medium
        : null
    };

    console.log(`   ✅ Brand image generated for ${audienceConfig.label}`);
    if (result.brand.disclaimer) {
      console.log(`   ⚠️  Compliance: Disclaimer required`);
    }

    return result;
  }

  /**
   * 10. GENERATE SOCIAL POST WITH BRAND
   *
   * Generate social media post with PL Capital branding
   * Includes logo placement, brand colors, and compliance disclaimers
   *
   * @param {string} content - Post content/message
   * @param {string} targetAudience - Target audience
   * @param {string} platform - Social platform (linkedin, instagram, twitter)
   * @param {Object} config - Additional configuration
   * @returns {Object} Branded social post image
   *
   * @example
   * const result = await generator.generateBrandedSocialPost(
   *   "Achieve your financial goals with our expert portfolio management",
   *   "mass_affluent",
   *   "instagram"
   * );
   */
  async generateBrandedSocialPost(content, targetAudience = 'all_clients', platform = 'linkedin', config = {}) {
    const brandConfig = require('../config/brand-config.js');

    console.log(`🎨 Branded Social Post`);
    console.log(`   Platform: ${platform}`);
    console.log(`   Audience: ${targetAudience}`);

    const audienceConfig = brandConfig.targetAudiences[targetAudience];
    const template = platform === 'instagram-story' ? 'story' : 'socialPost';
    const templateConfig = brandConfig.imageTemplates[template];

    // Build enhanced prompt with template specifications
    const brandPrompt = `
      Create a professional financial services social media post with the following specifications:

      Content: "${content}"

      Design Requirements:
      - Use PL Capital brand colors: ${audienceConfig.colorPalette.join(', ')}
      - Primary navy blue (#0e0e6a) background with modern corporate aesthetic
      - Include space for PL Capital logo in ${templateConfig.logo.position} corner
      - Font: Figtree (modern, professional sans-serif)
      - Style: ${audienceConfig.contentStyle}
      - Tone: ${audienceConfig.tone}
      - High contrast, sophisticated, trustworthy design
      - Include tagline: "${brandConfig.company.tagline}"
      - Aspect ratio: ${templateConfig.dimensions.width}x${templateConfig.dimensions.height}

      Additional Elements:
      - Modern financial graphics (charts, growth arrows, professional icons)
      - Clean, uncluttered layout with strong visual hierarchy
      - Ensure text is highly readable with proper contrast
      ${brandConfig.helpers.requiresDisclaimer(targetAudience) ? '- Include space at bottom for compliance disclaimer' : ''}
    `;

    const finalConfig = {
      aspectRatio: this._getDimensionsAsRatio(templateConfig.dimensions),
      imageSize: "4K",
      useGrounding: false,
      ...config
    };

    const result = await this.textToImage(brandPrompt, finalConfig);

    // Add brand metadata
    result.brand = {
      company: brandConfig.company.name,
      audience: targetAudience,
      platform: platform,
      template: template,
      disclaimer: brandConfig.helpers.requiresDisclaimer(targetAudience)
        ? brandConfig.compliance.disclaimer.short
        : null,
      tagline: brandConfig.company.tagline
    };

    return result;
  }

  /**
   * 11. GENERATE INVESTMENT INSIGHT CARD
   *
   * Generate branded investment insight cards for client communications
   * Optimized for sharing market insights, tips, and updates
   *
   * @param {string} insight - Investment insight or tip
   * @param {string} targetAudience - Target audience
   * @param {Object} config - Additional configuration
   * @returns {Object} Investment insight card image
   *
   * @example
   * const result = await generator.generateInsightCard(
   *   "Diversification across sectors can help reduce portfolio volatility by 30-40%",
   *   "hni"
   * );
   */
  async generateInsightCard(insight, targetAudience = 'all_clients', config = {}) {
    const brandConfig = require('../config/brand-config.js');
    const template = brandConfig.imageTemplates.insightCard;
    const audienceConfig = brandConfig.targetAudiences[targetAudience];

    console.log(`🎨 Investment Insight Card`);
    console.log(`   Audience: ${targetAudience}`);

    const brandPrompt = `
      Create a professional investment insight card for a financial services firm:

      Main Insight: "${insight}"

      Design Requirements:
      - Background: Premium gradient from navy (#0e0e6a) to teal (#00d084)
      - Brand: Prabhudas Lilladher (PL Capital)
      - Logo placement: Top-right corner, subtle
      - Font: Figtree (clean, modern, professional)
      - Style: ${audienceConfig.contentStyle}
      - Size: ${template.dimensions.width}x${template.dimensions.height}

      Layout:
      - Large, prominent insight text in white with excellent readability
      - Key numbers or statistics highlighted in bright green (#66e766)
      - Small watermark in center (PL Capital logo, very subtle, 10% opacity)
      - Modern financial iconography (subtle, not overwhelming)
      - High-contrast design for maximum impact
      - Professional, trustworthy, sophisticated aesthetic

      The design should inspire confidence and communicate expertise.
    `;

    const finalConfig = {
      aspectRatio: "1200:628",
      imageSize: "4K",
      useGrounding: false,
      ...config
    };

    const result = await this.textToImage(brandPrompt, finalConfig);

    result.brand = {
      company: brandConfig.company.name,
      audience: targetAudience,
      template: 'insightCard',
      disclaimer: brandConfig.helpers.requiresDisclaimer(targetAudience)
        ? brandConfig.compliance.disclaimer.medium
        : null
    };

    return result;
  }

  /**
   * HELPER: Convert template dimensions to aspect ratio
   * @private
   */
  _getDimensionsAsRatio(dimensions) {
    const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
    const divisor = gcd(dimensions.width, dimensions.height);
    const ratioW = dimensions.width / divisor;
    const ratioH = dimensions.height / divisor;

    // Map to supported aspect ratios
    const ratio = `${ratioW}:${ratioH}`;
    const supportedMappings = {
      '1:1': '1:1',
      '16:9': '16:9',
      '9:16': '9:16',
      '4:3': '4:3',
      '3:4': '3:4',
      '3:2': '3:2',
      '2:3': '2:3'
    };

    return supportedMappings[ratio] || '1:1';
  }

  /**
   * HELPER: Load image from file path or buffer
   * @private
   */
  async _loadImage(input) {
    let imageBuffer;
    let imagePath;

    if (typeof input === 'string') {
      // Load from file path
      imagePath = input;
      imageBuffer = await fs.readFile(input);
    } else if (Buffer.isBuffer(input)) {
      // Use buffer directly
      imageBuffer = input;
    } else {
      throw new Error("Input must be file path or Buffer");
    }

    // Detect MIME type from file extension or buffer
    let mimeType = "image/png";
    if (imagePath) {
      const ext = path.extname(imagePath).toLowerCase();
      const mimeTypes = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
      };
      mimeType = mimeTypes[ext] || 'image/png';
    }

    return {
      base64Data: imageBuffer.toString('base64'),
      mimeType: mimeType,
      buffer: imageBuffer
    };
  }

  /**
   * HELPER: Extract images from response and save to files
   * @private
   */
  async _extractAndSaveImages(response, prefix = "image") {
    const images = [];
    let imageIndex = 0;

    // Handle different response structures
    let parts = [];

    if (response.parts) {
      parts = response.parts;
    } else if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      if (candidate.content && candidate.content.parts) {
        parts = candidate.content.parts;
      }
    } else if (response.content && response.content.parts) {
      parts = response.content.parts;
    }

    // Iterate through parts to find images
    for (const part of parts) {
      if (part.inlineData) {
        const imageData = part.inlineData.data;
        const buffer = Buffer.from(imageData, "base64");

        const filename = `${prefix}-${Date.now()}-${imageIndex}.png`;
        const filepath = `/tmp/${filename}`;

        await fs.writeFile(filepath, buffer);

        images.push({
          path: filepath,
          filename: filename,
          size: buffer.length,
          mimeType: part.inlineData.mimeType || "image/png"
        });

        imageIndex++;
      }
    }

    if (images.length === 0) {
      console.error('Response structure:', JSON.stringify(response, null, 2));
      throw new Error('No images found in response. Check console for response structure.');
    }

    return images;
  }

  /**
   * HELPER: Simulate result for testing
   * @private
   */
  _simulateResult(type, config) {
    const timestamp = Date.now();
    return {
      type: type,
      images: [{
        path: `/tmp/simulated-${type}-${timestamp}.png`,
        filename: `simulated-${type}-${timestamp}.png`,
        size: 102400,
        mimeType: "image/png",
        simulated: true
      }],
      config: config,
      simulated: true
    };
  }

  /**
   * HELPER: Save base64 image data to file
   */
  async saveImage(base64Data, outputPath) {
    const buffer = Buffer.from(base64Data, "base64");
    await fs.writeFile(outputPath, buffer);
    console.log(`   ✅ Image saved to ${outputPath}`);
    return outputPath;
  }

  /**
   * HELPER: Load image as base64
   */
  async loadImageAsBase64(imagePath) {
    const imageBuffer = await fs.readFile(imagePath);
    return imageBuffer.toString('base64');
  }
}

module.exports = ImageGenerator;
