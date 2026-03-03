/**
 * ElevenLabs Voice Configuration for PL Capital
 *
 * Indian voices mapped to HeyGen avatars
 * API Key: Set ELEVENLABS_API_KEY in environment
 */

const elevenlabsVoiceConfig = {
  // API Configuration
  api: {
    baseUrl: 'https://api.elevenlabs.io',
    version: 'v1',
    endpoints: {
      voices: '/v1/voices',
      sharedVoices: '/v1/shared-voices',
      textToSpeech: '/v1/text-to-speech/{voice_id}',
      textToSpeechStream: '/v1/text-to-speech/{voice_id}/stream'
    }
  },

  // Indian Voice-to-Avatar mapping
  avatarVoiceMapping: {
    // Raj - Professional Indian male for formal communications
    'Raj_public_v2': {
      avatarName: 'Raj',
      gender: 'male',
      voiceId: 'LolxzR74HCt7Un4IvoxI',
      voiceName: 'Maneesh',
      voiceDescription: 'Professional South Indian Narrator',
      accent: 'indian',
      age: 'middle_aged',
      useCase: 'narrative_story',
      settings: {
        stability: 0.6,
        similarity_boost: 0.8,
        style: 0.4
      }
    },

    // Priya - Professional Indian female for educational content
    'Priya_public_v2': {
      avatarName: 'Priya',
      gender: 'female',
      voiceId: 'vZcFdbaKO9EUmpfW004U',
      voiceName: 'Saheli',
      voiceDescription: 'Indian Trainer Voice for Explainers & eLearning',
      accent: 'indian',
      age: 'middle_aged',
      useCase: 'informative_educational',
      settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.3
      }
    },

    // Arjun - Approachable male for internal communications
    'Arjun_public_v2': {
      avatarName: 'Arjun',
      gender: 'male',
      voiceId: 'oH8YmZXJYEZq5ScgoGn9',
      voiceName: 'Aakash Aryan',
      voiceDescription: 'Friendly Indian Customer Support Agent',
      accent: 'indian',
      age: 'middle_aged',
      useCase: 'conversational',
      settings: {
        stability: 0.45,
        similarity_boost: 0.7,
        style: 0.5
      }
    },

    // Meera - Executive female for leadership communications
    'Meera_public_v2': {
      avatarName: 'Meera',
      gender: 'female',
      voiceId: 'm28sDRnudtExG3WLAufB',
      voiceName: 'Alekhya',
      voiceDescription: 'Indian Middle-Aged Woman',
      accent: 'indian',
      age: 'middle_aged',
      useCase: 'narrative_story',
      settings: {
        stability: 0.65,
        similarity_boost: 0.85,
        style: 0.35
      }
    },

    // Vikram - Expert male for market analysis
    'Vikram_public_v2': {
      avatarName: 'Vikram',
      gender: 'male',
      voiceId: 'CZdRaSQ51p0onta4eec8',
      voiceName: 'Akshay',
      voiceDescription: 'Indian Accent Narrator',
      accent: 'indian',
      age: 'middle_aged',
      useCase: 'narrative_story',
      settings: {
        stability: 0.55,
        similarity_boost: 0.8,
        style: 0.4
      }
    }
  },

  // Alternative Indian voices for variety
  alternativeVoices: {
    male: [
      { voiceId: 'CGFMGBGJa4Cx8hOqeZEj', name: 'Vedant', description: 'Indian Voice - Young narrative' },
      { voiceId: 'FdoWfkPLwxbpfoYsN61P', name: 'Varun', description: 'Calm Indian Conversation' },
      { voiceId: 'zrXpgZCPDu2t9STPqxVL', name: 'Bala', description: 'Soft Spoken South Indian' },
      { voiceId: 'UzYWd2rD2PPFPjXRG3Ul', name: 'Mohit', description: 'Conversational Indian English' },
      { voiceId: '3Dfn3iRttMKWMoZ2tEFU', name: 'Viraj', description: 'Powerful Indian Announcer' },
      { voiceId: 'lyPbHf3pO5t4kYZYenaY', name: 'Shaurya', description: 'Expressive Conversational Indian' }
    ],
    female: [
      { voiceId: 'm8ysB8KEJV5BeYQnOtWN', name: 'Noor', description: 'Indian Girl Voice for Reels' },
      { voiceId: '0s2MqkqwzPYZVFGZpMXE', name: 'Sravani', description: 'Talkative Indian Woman' },
      { voiceId: '6JsmTroalVewG1gA6Jmw', name: 'Sia', description: 'Natural Indian Girl Voice' },
      { voiceId: 'kL06KYMvPY56NluIQ72m', name: 'Varsha', description: 'Indian Storyteller' },
      { voiceId: 'tLGhEubY0Pyc5mxjkJSJ', name: 'Rishika', description: 'Narrative Indian voice' }
    ]
  },

  // Model for Indian English
  recommendedModel: 'eleven_multilingual_v2',

  // Helper functions
  helpers: {
    /**
     * Get ElevenLabs voice ID for a HeyGen avatar
     */
    getVoiceForAvatar: (avatarId) => {
      const mapping = elevenlabsVoiceConfig.avatarVoiceMapping[avatarId];
      if (!mapping) {
        console.warn(`No voice mapping found for avatar: ${avatarId}, using default`);
        return elevenlabsVoiceConfig.avatarVoiceMapping['Raj_public_v2'];
      }
      return mapping;
    },

    /**
     * Get voice settings for API call
     */
    getVoiceSettings: (avatarId) => {
      const mapping = elevenlabsVoiceConfig.avatarVoiceMapping[avatarId];
      return mapping?.settings || {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.4
      };
    },

    /**
     * Get all avatar-voice mappings as array
     */
    getAllMappings: () => {
      return Object.entries(elevenlabsVoiceConfig.avatarVoiceMapping).map(([avatarId, config]) => ({
        avatarId,
        ...config
      }));
    },

    /**
     * Get voices by gender
     */
    getVoicesByGender: (gender) => {
      const primary = Object.values(elevenlabsVoiceConfig.avatarVoiceMapping)
        .filter(v => v.gender === gender);
      const alternatives = elevenlabsVoiceConfig.alternativeVoices[gender] || [];
      return { primary, alternatives };
    }
  }
};

module.exports = elevenlabsVoiceConfig;
