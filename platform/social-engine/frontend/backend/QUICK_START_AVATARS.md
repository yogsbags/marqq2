# Quick Start: HeyGen Avatar Video Generation

## 🎯 Ready-to-Use Avatars

We have **5 professional Indian avatars** ready for video generation:

| Avatar | Gender | Voice | Best For |
|--------|--------|-------|----------|
| **Raj** | Male | Jaidev - Professional | Financial content, professional advice |
| **Priya** | Female | Swara - Friendly | Training videos, tutorials |
| **Arjun** | Male | Madhur - Natural | Casual business content |
| **Meera** | Female | Nirmala | Executive communications |
| **Vikram** | Male | Bhavin - Newscaster | News-style financial updates |

---

## 🚀 Generate a Video (3 Steps)

### Step 1: Load Configuration

```javascript
const fs = require('fs');
const path = require('path');

// Load avatar mappings
const voiceMapping = JSON.parse(
  fs.readFileSync('./config/heygen-native-voice-mapping.json', 'utf8')
);

// HeyGen API Key
const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;

if (!HEYGEN_API_KEY) {
  throw new Error('Set HEYGEN_API_KEY in your environment before running this script.');
}
```

### Step 2: Generate Video

```javascript
async function generateAvatarVideo(avatarName, script) {
  // Find avatar mapping
  const avatar = Object.values(voiceMapping).find(
    a => a.avatarName === avatarName
  );

  // Create video
  const response = await fetch('https://api.heygen.com/v2/video/generate', {
    method: 'POST',
    headers: {
      'X-Api-Key': HEYGEN_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      test: false, // Set to true for testing (free)
      video_inputs: [{
        character: {
          type: 'talking_photo',
          talking_photo_id: avatar.groupId
        },
        voice: {
          type: 'text',
          input_text: script,
          voice_id: avatar.voiceId
        }
      }],
      dimension: {
        width: 1920,
        height: 1080
      },
      aspect_ratio: '16:9'
    })
  });

  const data = await response.json();
  return data.data.video_id;
}
```

### Step 3: Check Video Status

```javascript
async function getVideoStatus(videoId) {
  const response = await fetch(
    `https://api.heygen.com/v1/video_status.get?video_id=${videoId}`,
    {
      headers: { 'X-Api-Key': HEYGEN_API_KEY }
    }
  );

  const data = await response.json();
  return {
    status: data.data.status,
    progress: data.data.progress,
    videoUrl: data.data.video_url
  };
}
```

---

## 💡 Example Usage

```javascript
// Generate video with Raj avatar
const videoId = await generateAvatarVideo(
  'Raj',
  'Hello! Today I will explain the basics of mutual fund investing in India.'
);

console.log('Video ID:', videoId);

// Poll for completion
const checkStatus = async () => {
  const status = await getVideoStatus(videoId);

  if (status.status === 'completed') {
    console.log('Video ready:', status.videoUrl);
  } else {
    console.log('Status:', status.status, '|', status.progress + '%');
    setTimeout(checkStatus, 10000); // Check again in 10 seconds
  }
};

checkStatus();
```

---

## 🎬 Test Script (Try it now!)

Save this as `test-quick-video.js`:

```javascript
const fs = require('fs');

const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;
const voiceMapping = JSON.parse(
  fs.readFileSync('./config/heygen-native-voice-mapping.json', 'utf8')
);

if (!HEYGEN_API_KEY) {
  throw new Error('Set HEYGEN_API_KEY in your environment before running this script.');
}

async function quickTest() {
  const raj = Object.values(voiceMapping).find(a => a.avatarName === 'Raj');

  console.log('🎬 Generating test video with Raj...\n');

  const response = await fetch('https://api.heygen.com/v2/video/generate', {
    method: 'POST',
    headers: {
      'X-Api-Key': HEYGEN_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      test: true,
      video_inputs: [{
        character: {
          type: 'talking_photo',
          talking_photo_id: raj.groupId
        },
        voice: {
          type: 'text',
          input_text: 'नमस्ते! मैं राज हूं। आज मैं आपको म्यूचुअल फंड निवेश के बारे में बताऊंगा। Hello! I am Raj. Today I will explain mutual fund investing.',
          voice_id: raj.voiceId
        }
      }]
    })
  });

  const data = await response.json();
  console.log('✅ Video started:', data.data.video_id);
  console.log('🔗 Check status at:', `https://app.heygen.com/video/${data.data.video_id}`);
}

quickTest().catch(console.error);
```

Run with:
```bash
cd backend
node test-quick-video.js
```

---

## 📋 Available Avatars Reference

### Raj (Male - Financial Advisor)
- **Group ID:** `6f268f0fa28a41ce8b1fe4e83ac3867b`
- **Voice ID:** `ef5765a5c2ee49e58f7dd942e67fb6f2`
- **Voice:** Jaidev - Professional
- **Use For:** Financial advice, investment tips, professional content

### Priya (Female - Corporate Trainer)
- **Group ID:** `0ada07010c8e4049aca376e132b04a1d`
- **Voice ID:** `9799f1ba6acd4b2b993fe813a18f9a91`
- **Voice:** Swara - Friendly
- **Use For:** Training videos, educational content, how-to guides

### Arjun (Male - Business Professional)
- **Group ID:** `350da0c0495f43c69e1f97b10df2c441`
- **Voice ID:** `957336970bc64d479d551fea07e56784`
- **Voice:** Madhur - Natural
- **Use For:** Business casual content, lifestyle topics

### Meera (Female - Senior Executive)
- **Group ID:** `ef20bde4645c458ab72c9cadfc4fbdc7`
- **Voice ID:** `86e484394d8b44649d686a77a14d2ce6`
- **Voice:** Nirmala
- **Use For:** Executive communications, leadership content

### Vikram (Male - Financial Expert)
- **Group ID:** `39baeece5af54c38b25562ad4f4a375a`
- **Voice ID:** `ae3563ff1460469e89f661ffb3f1260b`
- **Voice:** Bhavin - Newscaster
- **Use For:** News-style updates, market analysis

---

## ⚙️ Configuration

All settings in: `backend/config/heygen-native-voice-mapping.json`

To change voices, find new voice IDs:
```bash
curl -s "https://api.heygen.com/v2/voices" \
  -H "X-Api-Key: YOUR_KEY" | \
  jq '.data.voices[] | select(.language == "Hindi")'
```

---

## 💰 Cost Notes

- **Test Mode:** Free credits (add `test: true` to payload)
- **Production Mode:** ~1 credit per minute of video
- **Check Credits:** Use HeyGen dashboard or API

---

## 🐛 Troubleshooting

**Video generation fails:**
- Check API key is valid
- Verify group_id exists
- Ensure voice_id is correct
- Try with `test: true` first

**Status stuck at "processing":**
- Normal for first 30-60 seconds
- Check after 2-3 minutes
- View in HeyGen dashboard: `https://app.heygen.com/video/{video_id}`

**Voice doesn't match avatar:**
- Check gender in `heygen-native-voice-mapping.json`
- Ensure using correct voice_id

---

## 📞 Support

- **Full Documentation:** `backend/docs/FINAL_AVATAR_VOICE_INTEGRATION.md`
- **Test Scripts:** `backend/scripts/test-heygen-native-voices.js`
- **HeyGen Docs:** https://docs.heygen.com/

---

**Ready to go!** 🚀

Use `generateAvatarVideo('Raj', 'Your script here')` to create videos instantly.
