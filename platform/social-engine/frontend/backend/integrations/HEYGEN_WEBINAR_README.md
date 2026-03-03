# HeyGen Webinar Client

A dedicated client for creating AI-powered webinars using HeyGen's Template API and Video Generation API.

## Overview

HeyGen doesn't have a dedicated "webinar" API, but this client creates webinar-like content by:
1. Creating reusable video templates
2. Generating multiple video segments (introduction, main content, conclusion)
3. Combining segments into a complete webinar experience

## Installation

The client is already included in the project. Just import it:

```javascript
const { getHeyGenWebinarClient } = require('./integrations/heygen-webinar-client');
```

## Environment Variables

```bash
HEYGEN_API_KEY=your_api_key_here
HEYGEN_AVATAR_ID_SIDDHARTH=your_avatar_id  # Optional, defaults to configured value
HEYGEN_VOICE_ID_SIDDHARTH=your_voice_id    # Optional, defaults to configured value
```

## Usage

### Basic Webinar Creation

```javascript
const { getHeyGenWebinarClient } = require('./integrations/heygen-webinar-client');

const client = getHeyGenWebinarClient();

const webinar = await client.createWebinar({
  webinar_title: 'Factor Investing Explained',
  avatar_id: '9da4afb2c22441b5aab73369dda7f65d',
  voice_id: 'c8d184ef4d81484a97d70c94bb76fec3',
  introduction_text: 'Welcome to this webinar on factor investing...',
  main_content_text: 'Factor investing is a systematic approach...',
  conclusion_text: 'In conclusion, factor investing offers...',
  duration_minutes: 30
});

console.log(`Webinar ID: ${webinar.webinar_id}`);
console.log(`Total Segments: ${webinar.total_segments}`);
```

### Template-Based Webinar

```javascript
// Step 1: Create a template
const template = await client.createTemplate({
  template_name: 'Webinar Introduction Template',
  avatar_id: '9da4afb2c22441b5aab73369dda7f65d',
  voice_id: 'c8d184ef4d81484a97d70c94bb76fec3',
  default_text: 'Welcome to our webinar on {{topic}}.',
  variables: [
    { name: 'topic', type: 'text', default_value: 'Factor Investing' }
  ]
});

// Step 2: Generate videos from template
const video = await client.generateFromTemplate({
  template_id: template.template_id,
  variables: {
    topic: 'Quantitative Investment Strategies'
  },
  title: 'Introduction Video'
});
```

### Check Video Status

```javascript
// Check single video
const status = await client.getVideoStatus('video_id_here');
console.log(`Status: ${status.status}`);
console.log(`Video URL: ${status.video_url}`);

// Check all webinar segments
const webinar = await client.createWebinar({...});
const videoIds = webinar.segments.map(s => s.video_id);
const statuses = await client.getWebinarStatus(videoIds);
```

## API Methods

### `createWebinar(params)`

Creates a multi-segment webinar video.

**Parameters:**
- `webinar_title` (string, required) - Title of the webinar
- `avatar_id` (string, required) - HeyGen avatar ID
- `voice_id` (string, required) - HeyGen voice ID
- `introduction_text` (string, optional) - Introduction script
- `main_content_text` (string, optional) - Main content script (auto-split if >750 words)
- `conclusion_text` (string, optional) - Conclusion script
- `duration_minutes` (number, optional) - Estimated duration
- `background_id` (string, optional) - Background ID

**Returns:**
```javascript
{
  success: true,
  webinar_id: 'webinar_1234567890',
  title: 'Webinar Title',
  total_segments: 3,
  estimated_duration_minutes: 5,
  segments: [
    {
      segment: 'introduction',
      video_id: 'video_id_1',
      text: '...',
      estimated_duration_seconds: 30
    },
    // ...
  ]
}
```

### `createTemplate(params)`

Creates a reusable video template.

**Parameters:**
- `template_name` (string, required) - Template name
- `avatar_id` (string, required) - Avatar ID
- `voice_id` (string, required) - Voice ID
- `default_text` (string, optional) - Default text with variables like `{{var_name}}`
- `variables` (array, optional) - Template variables
- `background_id` (string, optional) - Background ID
- `dimension` (object, optional) - Video dimensions `{width, height}`

**Returns:**
```javascript
{
  success: true,
  template_id: 'template_id_here',
  template_name: 'Template Name'
}
```

### `generateFromTemplate(params)`

Generates a video from a template with variable substitution.

**Parameters:**
- `template_id` (string, required) - Template ID
- `variables` (object, required) - Variable values `{var_name: 'value'}`
- `title` (string, optional) - Video title

**Returns:**
```javascript
{
  success: true,
  video_id: 'video_id_here',
  template_id: 'template_id_here'
}
```

### `getVideoStatus(video_id)`

Checks the status of a video generation.

**Parameters:**
- `video_id` (string, required) - Video ID

**Returns:**
```javascript
{
  status: 'pending' | 'completed' | 'failed',
  video_url: 'https://...' | null,
  video_id: 'video_id_here'
}
```

### `getWebinarStatus(video_ids)`

Checks status of multiple videos (all webinar segments).

**Parameters:**
- `video_ids` (array, required) - Array of video IDs

**Returns:**
```javascript
[
  { status: 'completed', video_url: '...', video_id: '...' },
  { status: 'pending', video_url: null, video_id: '...' },
  // ...
]
```

## Testing

Run the test script:

```bash
cd projects/social-media/frontend/backend
node scripts/test-heygen-webinar.js
```

The test script will:
1. Create a test webinar with introduction, main content, and conclusion
2. Create a test template
3. Generate a video from the template
4. Display all video IDs for status checking

## Integration with Orchestrator

After testing, integrate into the orchestrator by:

1. Import the client:
```javascript
const { getHeyGenWebinarClient } = require('../integrations/heygen-webinar-client');
```

2. Add webinar creation method:
```javascript
async createWebinar(options) {
  const client = getHeyGenWebinarClient();
  return await client.createWebinar({
    webinar_title: options.title,
    avatar_id: options.avatarId,
    voice_id: options.voiceId,
    introduction_text: options.introduction,
    main_content_text: options.mainContent,
    conclusion_text: options.conclusion
  });
}
```

## Notes

- **Video Generation Time**: Each segment takes 5-10 minutes to generate
- **Content Splitting**: Main content >750 words is automatically split into multiple segments
- **Duration Estimation**: Based on ~150 words per minute speaking rate
- **Template Variables**: Use `{{variable_name}}` syntax in template text
- **Error Handling**: All methods throw errors with descriptive messages

## Example: Complete Webinar Workflow

```javascript
const { getHeyGenWebinarClient } = require('./integrations/heygen-webinar-client');

async function createCompleteWebinar() {
  const client = getHeyGenWebinarClient();

  // 1. Create webinar
  const webinar = await client.createWebinar({
    webinar_title: 'AQUA Strategy Deep Dive',
    avatar_id: process.env.HEYGEN_AVATAR_ID_SIDDHARTH,
    voice_id: process.env.HEYGEN_VOICE_ID_SIDDHARTH,
    introduction_text: 'Welcome to this deep dive into our AQUA strategy...',
    main_content_text: 'AQUA stands for Adaptive Quantitative Allocation...',
    conclusion_text: 'Thank you for joining. Visit plindia.com for more...'
  });

  // 2. Wait and check status
  console.log(`Created ${webinar.total_segments} segments`);

  // 3. Poll for completion
  const videoIds = webinar.segments.map(s => s.video_id);
  let allComplete = false;

  while (!allComplete) {
    await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
    const statuses = await client.getWebinarStatus(videoIds);
    allComplete = statuses.every(s => s.status === 'completed');

    if (allComplete) {
      console.log('All videos ready!');
      statuses.forEach(s => console.log(`  ${s.video_id}: ${s.video_url}`));
    } else {
      console.log('Still generating...');
    }
  }
}

createCompleteWebinar();
```

