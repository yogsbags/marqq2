/**
 * PL Capital Brand Configuration
 * Prabhudas Lilladher Private Limited
 *
 * This file contains all brand assets, guidelines, and templates
 * for consistent image and video generation across all client segments.
 */

const brandConfig = {
  company: {
    name: 'Prabhudas Lilladher Private Limited',
    shortName: 'PL Capital',
    website: 'https://www.plindia.com',
    tagline: 'Power your financial growth with wisdom and precision'
  },

  // Brand Colors
  colors: {
    primary: {
      navy: '#0e0e6a',      // Deep navy blue - primary brand color
      blue: '#3c3cf8',      // Vibrant blue - accent
    },
    secondary: {
      green: '#66e766',     // Bright green - growth, prosperity
      teal: '#00d084',      // Teal - trust, stability
    },
    neutral: {
      white: '#ffffff',     // White - clarity, transparency
      black: '#000000',     // Black - text, sophistication
    },
    // Derived colors for different contexts
    gradients: {
      primary: 'linear-gradient(135deg, #0e0e6a 0%, #3c3cf8 100%)',
      success: 'linear-gradient(135deg, #00d084 0%, #66e766 100%)',
      premium: 'linear-gradient(135deg, #0e0e6a 0%, #00d084 50%, #66e766 100%)'
    }
  },

  // Typography
  typography: {
    primary: {
      family: 'Figtree',
      weights: {
        light: 300,
        regular: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
        extrabold: 800
      },
      fallback: 'Inter, system-ui, -apple-system, sans-serif'
    },
    sizes: {
      h1: '48px',
      h2: '36px',
      h3: '28px',
      h4: '24px',
      body: '16px',
      caption: '14px',
      small: '12px'
    }
  },

  // Brand Values
  values: [
    'Integrity',
    'Trust',
    'Transparency',
    'Innovation',
    'Expertise'
  ],

  // Brand Aesthetic Guidelines
  aesthetic: {
    style: 'trustworthy, modern corporate, high-contrast, sophisticated, established',
    keywords: [
      'trustworthy',
      'modern',
      'corporate',
      'high-contrast',
      'sophisticated',
      'established',
      'professional',
      'premium'
    ],
    mood: 'authoritative yet approachable, expert yet client-centric'
  },

  // Tone of Voice
  tone: {
    primary: 'Authoritative',
    attributes: [
      'Expert',
      'Professional',
      'Client-centric',
      'Legacy-driven',
      'Forward-thinking',
      'Trustworthy'
    ],
    messaging: {
      formal: 'For HNI/UHNI and official communications',
      balanced: 'For mass affluent and general client communications',
      approachable: 'For internal communications and onboarding'
    }
  },

  // Target Audience Segments
  targetAudiences: {
    internal: {
      label: 'Internal communication',
      value: 'internal',
      description: 'Employee communications, training, announcements',
      tone: 'Approachable, collaborative, informative',
      colorPalette: ['#3c3cf8', '#66e766', '#ffffff'],
      fontSize: 'medium',
      contentStyle: 'casual-professional'
    },
    massAffluent: {
      label: 'Mass affluent',
      value: 'mass_affluent',
      description: 'Emerging investors, young professionals',
      tone: 'Educational, empowering, modern',
      colorPalette: ['#00d084', '#3c3cf8', '#ffffff'],
      fontSize: 'medium',
      contentStyle: 'engaging-informative'
    },
    hni: {
      label: 'HNIs',
      value: 'hni',
      description: 'High Net Worth Individuals',
      tone: 'Professional, expert, value-focused',
      colorPalette: ['#0e0e6a', '#00d084', '#ffffff'],
      fontSize: 'medium-large',
      contentStyle: 'premium-professional'
    },
    uhni: {
      label: 'UHNIs',
      value: 'uhni',
      description: 'Ultra High Net Worth Individuals',
      tone: 'Exclusive, sophisticated, bespoke',
      colorPalette: ['#0e0e6a', '#000000', '#ffffff'],
      fontSize: 'large',
      contentStyle: 'luxury-exclusive'
    },
    allClients: {
      label: 'All clients',
      value: 'all_clients',
      description: 'General client communications',
      tone: 'Balanced, professional, accessible',
      colorPalette: ['#0e0e6a', '#3c3cf8', '#00d084', '#ffffff'],
      fontSize: 'medium',
      contentStyle: 'professional-accessible'
    }
  },

  // Brand Assets
  assets: {
    // Reference to scraped website images
    websiteImages: './plindia-images.json',

    // Logo specifications
    logos: {
      primary: {
        url: 'https://www.plindia.com/wp-content/uploads/2024/10/PL-Capital-Logo.svg',
        description: 'Primary PL Capital logo',
        usage: 'Main brand identity for all communications',
        minSize: '120px',
        clearSpace: '20px'
      },
      favicon: {
        url: 'https://www.plindia.com/wp-content/uploads/2024/10/cropped-favicon-32x32.png',
        description: 'Favicon/small icon',
        usage: 'Small format applications'
      }
    },

    // Icon library
    icons: {
      check: '✓',
      arrow: '→',
      growth: '📈',
      security: '🔒',
      expert: '👔',
      innovation: '💡'
    }
  },

  // Image Generation Templates
  imageTemplates: {
    // Social Media Post Template
    socialPost: {
      dimensions: { width: 1080, height: 1080 },
      background: {
        type: 'gradient',
        value: 'linear-gradient(135deg, #0e0e6a 0%, #3c3cf8 100%)'
      },
      logo: {
        position: 'top-left',
        size: 'medium',
        margin: 40
      },
      content: {
        padding: 60,
        alignment: 'center',
        maxWidth: 800
      },
      footer: {
        tagline: true,
        disclaimer: true,
        height: 80
      }
    },

    // Story/Reel Template (9:16)
    story: {
      dimensions: { width: 1080, height: 1920 },
      background: {
        type: 'gradient',
        value: 'linear-gradient(180deg, #0e0e6a 0%, #00d084 100%)'
      },
      logo: {
        position: 'top-center',
        size: 'small',
        margin: 60
      },
      content: {
        padding: 80,
        alignment: 'center',
        verticalAlign: 'middle'
      },
      footer: {
        position: 'bottom',
        height: 150,
        tagline: true
      }
    },

    // LinkedIn Banner Template
    linkedinBanner: {
      dimensions: { width: 1584, height: 396 },
      background: {
        type: 'solid',
        value: '#0e0e6a'
      },
      logo: {
        position: 'left',
        size: 'large',
        margin: 60
      },
      content: {
        alignment: 'left',
        padding: 60
      },
      accent: {
        type: 'gradient-overlay',
        value: 'linear-gradient(90deg, transparent 0%, #3c3cf8 100%)'
      }
    },

    // Presentation Slide Template
    presentation: {
      dimensions: { width: 1920, height: 1080 },
      background: {
        type: 'solid',
        value: '#ffffff'
      },
      header: {
        background: '#0e0e6a',
        height: 120,
        logo: true
      },
      content: {
        padding: 80,
        alignment: 'left',
        columns: 2
      },
      footer: {
        background: '#f5f5f5',
        height: 60,
        pageNumber: true,
        branding: true
      }
    },

    // Investment Insight Card
    insightCard: {
      dimensions: { width: 1200, height: 628 },
      background: {
        type: 'gradient',
        value: 'linear-gradient(135deg, #0e0e6a 0%, #00d084 100%)'
      },
      logo: {
        position: 'top-right',
        size: 'small',
        margin: 30
      },
      content: {
        padding: 60,
        alignment: 'left',
        highlight: {
          color: '#66e766',
          fontSize: 'large'
        }
      },
      watermark: {
        enabled: true,
        opacity: 0.1,
        position: 'center'
      }
    }
  },

  // Compliance & Disclaimers
  compliance: {
    standardDisclaimer: 'Investments in securities market are subject to market risks. Read all the related documents carefully before investing.',
    regulatoryText: 'SEBI Registered Research Analyst | Investment Adviser | Portfolio Manager',
    disclaimer: {
      short: 'Subject to market risks. Read documents carefully.',
      medium: 'Investments are subject to market risks. Please read all scheme related documents carefully before investing.',
      long: 'Investments in securities market are subject to market risks. Read all the related documents carefully before investing. Past performance is not indicative of future returns. Please consider your specific investment requirements before choosing a fund, or designing a portfolio that suits your needs.'
    },
    requiredForAudiences: {
      internal: false,
      mass_affluent: true,
      hni: true,
      uhni: true,
      all_clients: true
    }
  },

  // Avatar Configuration (HeyGen Indian Avatars)
  avatars: {
    enabled: true,
    provider: 'heygen',
    // Public Indian avatars available in HeyGen
    publicAvatars: [
      {
        id: 'Raj_public',
        name: 'Raj',
        gender: 'male',
        ethnicity: 'Indian',
        style: 'professional',
        description: 'Professional Indian male avatar in business attire',
        suitable: ['hni', 'uhni', 'all_clients']
      },
      {
        id: 'Priya_public',
        name: 'Priya',
        gender: 'female',
        ethnicity: 'Indian',
        style: 'professional',
        description: 'Professional Indian female avatar in business attire',
        suitable: ['mass_affluent', 'all_clients']
      },
      {
        id: 'Arjun_public',
        name: 'Arjun',
        gender: 'male',
        ethnicity: 'Indian',
        style: 'approachable',
        description: 'Approachable Indian male avatar',
        suitable: ['internal', 'mass_affluent']
      }
    ],
    // Custom avatar creation via Photo Avatar or Video Avatar API
    customAvatarOptions: {
      photoAvatar: {
        enabled: true,
        apiEndpoint: '/v2/avatars/photo',
        requirements: {
          imageFormat: 'jpg/png',
          minResolution: '512x512',
          maxFileSize: '10MB',
          background: 'plain, well-lit'
        }
      },
      videoAvatar: {
        enabled: true,
        apiEndpoint: '/v2/avatars/video',
        requirements: {
          videoFormat: 'mp4',
          duration: '5-10 minutes',
          resolution: '1080p minimum',
          fps: '25-30',
          background: 'green screen or plain'
        }
      }
    },
    // Avatar NOT to use (as per user requirement)
    excludeAvatars: ['Siddharth_Vora']
  },

  // Gemini 3 Pro Image Generation Prompts
  geminiPrompts: {
    // Audience-specific prompt modifiers
    audienceModifiers: {
      internal: 'friendly, collaborative, modern professional style',
      mass_affluent: 'engaging, educational, vibrant and modern',
      hni: 'sophisticated, premium, refined professional aesthetic',
      uhni: 'exclusive, luxurious, ultra-premium with subtle elegance',
      all_clients: 'professional, trustworthy, balanced corporate style'
    },

    // Brand consistency requirements for all prompts
    brandRequirements: `
      - Use navy blue (#0e0e6a) as primary color
      - Include teal (#00d084) or vibrant blue (#3c3cf8) as accents
      - Maintain high contrast for readability
      - Professional, modern corporate aesthetic
      - Include PL Capital logo placement
      - Use Figtree font for text elements
      - Ensure sophisticated and established look
    `,

    // Template-specific prompts
    templates: {
      marketUpdate: (audience) => `
        Create a professional financial market update image.
        Target audience: ${audience}
        Style: ${brandConfig.geminiPrompts.audienceModifiers[audience]}
        ${brandConfig.geminiPrompts.brandRequirements}
        Include: Charts/graphs, data visualization, market indicators
        Mood: Authoritative, expert, data-driven
      `,

      investmentTip: (audience) => `
        Create an educational investment tip graphic.
        Target audience: ${audience}
        Style: ${brandConfig.geminiPrompts.audienceModifiers[audience]}
        ${brandConfig.geminiPrompts.brandRequirements}
        Include: Key insight, visual metaphor for growth/prosperity
        Mood: Empowering, informative, trustworthy
      `,

      productPromo: (audience, product) => `
        Create a promotional image for ${product}.
        Target audience: ${audience}
        Style: ${brandConfig.geminiPrompts.audienceModifiers[audience]}
        ${brandConfig.geminiPrompts.brandRequirements}
        Include: Product benefits, compelling visuals
        Mood: Professional, value-focused, aspirational
      `
    }
  }
};

// Helper Functions
brandConfig.helpers = {
  /**
   * Get color palette for specific audience
   */
  getAudiencePalette: (audienceType) => {
    const audience = brandConfig.targetAudiences[audienceType];
    return audience ? audience.colorPalette : brandConfig.targetAudiences.allClients.colorPalette;
  },

  /**
   * Get template configuration for image generation
   */
  getTemplate: (templateName) => {
    return brandConfig.imageTemplates[templateName] || brandConfig.imageTemplates.socialPost;
  },

  /**
   * Check if disclaimer is required for audience
   */
  requiresDisclaimer: (audienceType) => {
    return brandConfig.compliance.requiredForAudiences[audienceType] || false;
  },

  /**
   * Get appropriate avatar for audience
   */
  getAvatarForAudience: (audienceType) => {
    return brandConfig.avatars.publicAvatars.filter(avatar =>
      avatar.suitable.includes(audienceType)
    );
  },

  /**
   * Generate Gemini prompt for specific use case
   */
  generateGeminiPrompt: (templateType, audience, additionalContext = '') => {
    const promptTemplate = brandConfig.geminiPrompts.templates[templateType];
    if (!promptTemplate) {
      return `${brandConfig.geminiPrompts.brandRequirements}\n${additionalContext}`;
    }
    return promptTemplate(audience) + '\n' + additionalContext;
  },

  /**
   * Get all brand colors as CSS variables
   */
  getCSSVariables: () => {
    return `
      --pl-navy: ${brandConfig.colors.primary.navy};
      --pl-blue: ${brandConfig.colors.primary.blue};
      --pl-green: ${brandConfig.colors.secondary.green};
      --pl-teal: ${brandConfig.colors.secondary.teal};
      --pl-white: ${brandConfig.colors.neutral.white};
      --pl-black: ${brandConfig.colors.neutral.black};
      --pl-gradient-primary: ${brandConfig.colors.gradients.primary};
      --pl-gradient-success: ${brandConfig.colors.gradients.success};
      --pl-gradient-premium: ${brandConfig.colors.gradients.premium};
      --pl-font-family: ${brandConfig.typography.primary.family}, ${brandConfig.typography.primary.fallback};
    `;
  }
};

module.exports = brandConfig;
