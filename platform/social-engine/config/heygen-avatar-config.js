/**
 * HeyGen Avatar Configuration for PL Capital
 *
 * Configuration for Indian avatars to be used in video generation
 * Supports:
 * 1. Public Indian avatars (pre-made, ready to use)
 * 2. Photo Avatar API (create from photos)
 * 3. Video Avatar API (create from videos)
 *
 * NOTE: Excludes Siddharth Vora's avatar as per requirements
 */

const heygenAvatarConfig = {
  // API Configuration
  api: {
    baseUrl: 'https://api.heygen.com',
    version: 'v2',
    endpoints: {
      publicAvatars: '/v2/avatars/public',
      photoAvatar: '/v2/avatars/photo',
      videoAvatar: '/v2/avatars/video',
      talkingPhoto: '/v1/talking_photo.create',
      videoGenerate: '/v2/video/generate',
      videoStatus: '/v2/video/status'
    }
  },

  // Public Indian Avatars (Pre-made, ready to use)
  // These are publicly available HeyGen avatars suitable for financial services
  publicIndianAvatars: [
    {
      id: 'Raj_public_v2',
      name: 'Raj',
      gender: 'male',
      ethnicity: 'Indian',
      age: '35-45',
      style: 'professional',
      attire: 'business_suit',
      description: 'Professional Indian male in navy business suit, ideal for formal financial communications',
      suitableFor: ['hni', 'uhni', 'all_clients'],
      voiceId: 'en-IN-male-professional',
      useCases: [
        'Portfolio updates',
        'Market insights',
        'Product presentations',
        'Client communications'
      ],
      recommended: true
    },
    {
      id: 'Priya_public_v2',
      name: 'Priya',
      gender: 'female',
      ethnicity: 'Indian',
      age: '30-40',
      style: 'professional',
      attire: 'business_formal',
      description: 'Professional Indian female in business attire, warm and approachable',
      suitableFor: ['mass_affluent', 'all_clients', 'internal'],
      voiceId: 'en-IN-female-professional',
      useCases: [
        'Educational content',
        'Client onboarding',
        'Product explainers',
        'Investment tips'
      ],
      recommended: true
    },
    {
      id: 'Arjun_public_v2',
      name: 'Arjun',
      gender: 'male',
      ethnicity: 'Indian',
      age: '28-35',
      style: 'approachable',
      attire: 'business_casual',
      description: 'Approachable Indian male in business casual, modern and relatable',
      suitableFor: ['internal', 'mass_affluent'],
      voiceId: 'en-IN-male-friendly',
      useCases: [
        'Internal communications',
        'Training videos',
        'Casual updates',
        'Team announcements'
      ],
      recommended: false
    },
    {
      id: 'Meera_public_v2',
      name: 'Meera',
      gender: 'female',
      ethnicity: 'Indian',
      age: '40-50',
      style: 'executive',
      attire: 'business_executive',
      description: 'Senior executive Indian female, authoritative and experienced',
      suitableFor: ['uhni', 'hni'],
      voiceId: 'en-IN-female-authoritative',
      useCases: [
        'CEO messages',
        'Strategic updates',
        'Leadership communications',
        'High-value client outreach'
      ],
      recommended: true
    },
    {
      id: 'Vikram_public_v2',
      name: 'Vikram',
      gender: 'male',
      ethnicity: 'Indian',
      age: '35-45',
      style: 'expert',
      attire: 'business_professional',
      description: 'Expert financial advisor appearance, trustworthy and knowledgeable',
      suitableFor: ['hni', 'all_clients'],
      voiceId: 'en-IN-male-expert',
      useCases: [
        'Market analysis',
        'Investment advice',
        'Research presentations',
        'Expert commentary'
      ],
      recommended: true
    }
  ],

  // Avatars to exclude (as per user requirements)
  excludedAvatars: [
    'Siddharth_Vora',
    'siddharth_vora',
    'SiddharthVora'
  ],

  // Photo Avatar Configuration
  // Create custom avatars from photos using HeyGen Photo Avatar API
  photoAvatarConfig: {
    enabled: true,
    apiEndpoint: '/v2/avatars/photo',
    requirements: {
      imageFormat: ['jpg', 'jpeg', 'png'],
      minResolution: { width: 512, height: 512 },
      maxResolution: { width: 4096, height: 4096 },
      maxFileSize: 10485760, // 10 MB in bytes
      aspectRatio: 'portrait or square preferred',
      background: 'plain, solid color, well-lit',
      lightingTips: [
        'Use natural or professional lighting',
        'Avoid harsh shadows on face',
        'Ensure face is well-lit and clearly visible',
        'Front-facing lighting is ideal'
      ],
      subjectRequirements: [
        'Face clearly visible',
        'Looking directly at camera',
        'Neutral or professional expression',
        'Professional attire recommended',
        'No sunglasses or face coverings',
        'Shoulders and head fully visible'
      ]
    },
    samplePrompt: {
      description: 'Upload a high-quality photo of an Indian professional in business attire',
      idealPhoto: 'Professional headshot with neutral background, good lighting, clear facial features'
    }
  },

  // Video Avatar Configuration
  // Create custom avatars from videos using HeyGen Video Avatar API
  videoAvatarConfig: {
    enabled: true,
    apiEndpoint: '/v2/avatars/video',
    requirements: {
      videoFormat: ['mp4', 'mov'],
      duration: {
        min: 300, // 5 minutes in seconds
        max: 600, // 10 minutes in seconds
        recommended: 360 // 6 minutes
      },
      resolution: {
        min: '1080p',
        recommended: '1080p or 4K',
        width: 1920,
        height: 1080
      },
      fps: {
        min: 25,
        max: 30,
        recommended: 30
      },
      fileSize: {
        max: 2147483648 // 2 GB in bytes
      },
      background: 'green screen or plain solid color',
      recording: {
        cameraPosition: 'Eye level, centered',
        distance: '2-3 feet from camera',
        framing: 'Chest up (professional headshot style)',
        lighting: 'Three-point lighting recommended',
        audio: 'Clear audio with minimal background noise'
      },
      script: {
        type: 'Consent script provided by HeyGen',
        duration: '5-10 minutes of natural speech',
        content: 'Read provided consent text naturally',
        language: 'English (Indian accent acceptable)'
      }
    },
    recordingTips: [
      'Use a high-quality camera (smartphone 1080p+ or DSLR)',
      'Ensure stable camera mounting (tripod recommended)',
      'Use green screen or plain background (white/grey)',
      'Professional attire in brand colors (navy, white)',
      'Natural, engaging delivery',
      'Maintain eye contact with camera',
      'Speak clearly and at moderate pace',
      'Minimize hand gestures (keep in frame)',
      'Record in quiet environment'
    ]
  },

  // Voice Configuration for Indian English
  voices: {
    'en-IN-male-professional': {
      id: 'en-IN-male-professional',
      language: 'en-IN',
      gender: 'male',
      style: 'professional',
      description: 'Professional Indian male voice, clear and authoritative',
      suitableFor: ['hni', 'uhni', 'all_clients']
    },
    'en-IN-female-professional': {
      id: 'en-IN-female-professional',
      language: 'en-IN',
      gender: 'female',
      style: 'professional',
      description: 'Professional Indian female voice, warm and trustworthy',
      suitableFor: ['mass_affluent', 'all_clients', 'internal']
    },
    'en-IN-male-friendly': {
      id: 'en-IN-male-friendly',
      language: 'en-IN',
      gender: 'male',
      style: 'friendly',
      description: 'Friendly Indian male voice, approachable and modern',
      suitableFor: ['internal', 'mass_affluent']
    },
    'en-IN-female-authoritative': {
      id: 'en-IN-female-authoritative',
      language: 'en-IN',
      gender: 'female',
      style: 'authoritative',
      description: 'Authoritative Indian female voice, executive presence',
      suitableFor: ['uhni', 'hni']
    },
    'en-IN-male-expert': {
      id: 'en-IN-male-expert',
      language: 'en-IN',
      gender: 'male',
      style: 'expert',
      description: 'Expert advisor voice, knowledgeable and trustworthy',
      suitableFor: ['hni', 'all_clients']
    }
  },

  // Avatar Selection Helper
  helpers: {
    /**
     * Get recommended avatar for target audience
     */
    getAvatarForAudience: (audienceType, gender = null) => {
      const avatars = heygenAvatarConfig.publicIndianAvatars.filter(avatar => {
        const audienceMatch = avatar.suitableFor.includes(audienceType);
        const genderMatch = gender ? avatar.gender === gender : true;
        const recommended = avatar.recommended;
        return audienceMatch && genderMatch && recommended;
      });

      return avatars.length > 0 ? avatars[0] : heygenAvatarConfig.publicIndianAvatars[0];
    },

    /**
     * Get all avatars suitable for use case
     */
    getAvatarsForUseCase: (useCase) => {
      return heygenAvatarConfig.publicIndianAvatars.filter(avatar =>
        avatar.useCases.some(uc => uc.toLowerCase().includes(useCase.toLowerCase()))
      );
    },

    /**
     * Check if avatar is excluded
     */
    isAvatarExcluded: (avatarId) => {
      return heygenAvatarConfig.excludedAvatars.some(
        excluded => avatarId.toLowerCase().includes(excluded.toLowerCase())
      );
    },

    /**
     * Validate photo for photo avatar creation
     */
    validatePhoto: (file) => {
      const config = heygenAvatarConfig.photoAvatarConfig.requirements;
      const errors = [];

      // Check format
      const ext = file.name.split('.').pop().toLowerCase();
      if (!config.imageFormat.includes(ext)) {
        errors.push(`Invalid format. Supported: ${config.imageFormat.join(', ')}`);
      }

      // Check file size
      if (file.size > config.maxFileSize) {
        errors.push(`File too large. Max: ${config.maxFileSize / 1024 / 1024} MB`);
      }

      return {
        valid: errors.length === 0,
        errors: errors
      };
    },

    /**
     * Validate video for video avatar creation
     */
    validateVideo: (file, duration) => {
      const config = heygenAvatarConfig.videoAvatarConfig.requirements;
      const errors = [];

      // Check format
      const ext = file.name.split('.').pop().toLowerCase();
      if (!config.videoFormat.includes(ext)) {
        errors.push(`Invalid format. Supported: ${config.videoFormat.join(', ')}`);
      }

      // Check file size
      if (file.size > config.fileSize.max) {
        errors.push(`File too large. Max: ${config.fileSize.max / 1024 / 1024 / 1024} GB`);
      }

      // Check duration
      if (duration < config.duration.min) {
        errors.push(`Video too short. Min: ${config.duration.min / 60} minutes`);
      }
      if (duration > config.duration.max) {
        errors.push(`Video too long. Max: ${config.duration.max / 60} minutes`);
      }

      return {
        valid: errors.length === 0,
        errors: errors
      };
    },

    /**
     * Get avatar by ID (with exclusion check)
     */
    getAvatarById: (avatarId) => {
      // Check if excluded
      if (heygenAvatarConfig.helpers.isAvatarExcluded(avatarId)) {
        console.warn(`Avatar ${avatarId} is excluded. Returning default avatar instead.`);
        return heygenAvatarConfig.publicIndianAvatars[0]; // Return first recommended
      }

      const avatar = heygenAvatarConfig.publicIndianAvatars.find(a => a.id === avatarId);
      return avatar || heygenAvatarConfig.publicIndianAvatars[0];
    },

    /**
     * Get recommended voice for avatar and audience
     */
    getVoiceForAvatar: (avatarId, audienceType = 'all_clients') => {
      const avatar = heygenAvatarConfig.helpers.getAvatarById(avatarId);
      return heygenAvatarConfig.voices[avatar.voiceId] || heygenAvatarConfig.voices['en-IN-male-professional'];
    }
  },

  // Video Generation Templates
  videoTemplates: {
    portfolioUpdate: {
      name: 'Portfolio Update',
      description: 'Regular portfolio performance updates for clients',
      recommendedAvatar: 'Raj_public_v2',
      duration: '60-90 seconds',
      script: {
        intro: 'Good [morning/afternoon], this is your portfolio update for [period].',
        body: 'Key highlights and performance metrics',
        outro: 'For any questions, please reach out to your relationship manager. Thank you.'
      }
    },
    marketInsight: {
      name: 'Market Insight',
      description: 'Market analysis and investment insights',
      recommendedAvatar: 'Vikram_public_v2',
      duration: '90-120 seconds',
      script: {
        intro: 'Welcome to PL Capital Market Insights.',
        body: 'Analysis and expert commentary',
        outro: 'Stay informed with PL Capital. Invest wisely.'
      }
    },
    productPromo: {
      name: 'Product Promotion',
      description: 'Introduction to financial products and services',
      recommendedAvatar: 'Priya_public_v2',
      duration: '45-60 seconds',
      script: {
        intro: 'Discover [product name] from PL Capital.',
        body: 'Product benefits and features',
        outro: 'To learn more, contact us today.'
      }
    },
    internalComm: {
      name: 'Internal Communication',
      description: 'Employee announcements and updates',
      recommendedAvatar: 'Arjun_public_v2',
      duration: '30-60 seconds',
      script: {
        intro: 'Hello team, here's an important update.',
        body: 'Key information and action items',
        outro: 'Thank you for your attention.'
      }
    },
    executiveMessage: {
      name: 'Executive Message',
      description: 'Leadership communications to clients or employees',
      recommendedAvatar: 'Meera_public_v2',
      duration: '90-150 seconds',
      script: {
        intro: 'Dear valued clients/colleagues,',
        body: 'Strategic updates and vision',
        outro: 'Thank you for your continued trust in PL Capital.'
      }
    }
  }
};

module.exports = heygenAvatarConfig;
