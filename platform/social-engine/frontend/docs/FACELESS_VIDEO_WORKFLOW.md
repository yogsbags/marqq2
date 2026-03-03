# Complete Faceless Video Selection Workflow

This document describes the end-to-end workflow for faceless video generation from frontend selection to backend execution.

## Overview

Faceless videos are AI-generated videos that contain **NO PEOPLE, NO FACES, NO HUMANS** - only abstract visuals, data visualizations, motion graphics, and animated elements. The system supports two video generation models:

- **VEO 3.1** (Google Gemini): 8s-148s, high quality, scene-based generation
- **LongCat** (fal.ai): 149s-900s (15 minutes), long-form video generation

---

## Frontend Selection Flow

### 1. Content Type Selection (`app/page.tsx`)

**Location**: Lines 975-1026

User selects "Faceless Video" from the Output Format Type selector:

```typescript
// State management
const [contentType, setContentType] = useState<'image' | 'faceless-video' | 'avatar-video'>('image')

// When user clicks "Faceless Video" button
onClick={() => {
  setContentType('faceless-video')
  setUseAvatar(false)  // Explicitly disable avatar mode
}}
```

**Key State Variables**:

- `contentType`: Set to `'faceless-video'`
- `useAvatar`: Automatically set to `false`
- `facelessVideoMode`: `'text-to-video'` or `'image-to-video'`
- `imageSource`: `'generate'` or `'upload'` (for image-to-video mode)
- `useVeo`: Boolean for VEO 3.1 selection
- `useLongCat`: Boolean for LongCat selection
- `duration`: 8-900 seconds (slider)

### 2. Faceless Video Configuration Panel

**Location**: Lines 1029-1402

When `contentType === 'faceless-video'`, the UI displays:

#### A. Video Duration Slider

- **Range**: 8s (min) to 900s (15 min)
- **Auto-switching**:
  - If duration > 148s → Auto-enables LongCat, disables VEO
  - If duration ≤ 148s → Uses VEO with scene extensions

#### B. Model Selection

- **Standard Duration** (VEO): Up to 148s, high quality
- **Extended Duration** (LongCat): 149s to 15 min

#### C. Generation Mode

- **Text-to-Video**: Direct generation from text prompt
- **Image-to-Video**: Animate from a reference image
  - Image Source options:
    - **Generate Image**: AI generates the first frame
    - **Upload Image**: User uploads reference image

#### D. Advanced Frame Controls (VEO only)

- **Frame Interpolation**: Extend scenes with custom first/last frames
  - First Frame: Upload, Text-to-Image (Method 1), Text-to-Image (Method 2)
  - Last Frame: Upload, Text-to-Image (Method 1), Text-to-Image (Method 2)
  - Scene Extension Count: Auto-calculated based on duration

#### E. LongCat Configuration (Extended videos)

- **Mode**: Text-to-Video or Image-to-Video
- **Prompt**: Custom video description
- **Reference Image**: Upload for image-to-video mode

### 3. Workflow Execution

**Location**: Lines 354-457 (`executeWorkflow`) or 251-352 (`executeStage`)

When user clicks "Execute Full Campaign" or "Execute Stage":

```typescript
const response = await fetch('/api/workflow/execute', {
  method: 'POST',
  body: JSON.stringify({
    contentType: 'faceless-video',  // ← Key identifier
    duration: duration,
    useVeo: useVeo,
    useAvatar: false,  // ← Explicitly false for faceless
    facelessVideoMode: facelessVideoMode,
    imageSource: imageSource,
    frameInterpolation: { ... },
    longCatConfig: { ... },
    // ... other config
  })
})
```

---

## API Route Processing

### 1. Workflow Execute Route (`app/api/workflow/execute/route.ts`)

**Location**: Lines 66-288

- Receives request with `contentType: 'faceless-video'`
- Spawns backend Node.js process with CLI arguments:
  ```bash
  node main.js campaign <campaignType> \
    --topic <topic> \
    --duration <duration> \
    --use-veo  # if useVeo is true
    # Note: --use-avatar is NOT passed for faceless videos
  ```

### 2. Workflow Stage Route (`app/api/workflow/stage/route.ts`)

**Location**: Lines 68-559

**Key Logic** (Lines 91-94):

```typescript
// Sync useAvatar with contentType
const finalUseAvatar =
  contentType === "avatar-video"
    ? true
    : contentType === "faceless-video"
    ? false
    : useAvatar;

console.log(
  `[DEBUG] contentType="${contentType}", useAvatar=${useAvatar}, finalUseAvatar=${finalUseAvatar}`
);
```

**For Stage 4 (Video Production)**:

- Passes `--duration`, `--use-veo` flags
- **Does NOT pass** `--use-avatar` for faceless videos
- Handles reference images (if image-to-video mode):
  - Uploads to ImgBB or saves as temp files
  - Sets `REFERENCE_IMAGE_PATHS` environment variable
- Passes LongCat config as environment variables:
  - `LONGCAT_ENABLED=true/false`
  - `LONGCAT_MODE=text-to-video/image-to-video`
  - `LONGCAT_PROMPT=<prompt>`

---

## Backend Orchestration

### 1. Orchestrator Entry Point (`backend/core/orchestrator.js`)

**Location**: `stageVideo()` method (Lines 547-922)

#### A. Content Type Detection

```javascript
// Check if this is avatar mode (VEO-based avatar generation)
const isAvatarMode = options.useAvatar === true;

// For faceless videos, isAvatarMode = false
```

#### B. Prompt Generation

**Location**: `_buildVideoPrompt()` (Lines 928-947)

Generates faceless video prompts with **explicit constraints**:

```javascript
const basePrompts = {
  linkedin: `Faceless professional ${format} video about ${topic}.
    NO PEOPLE, NO FACES, NO HUMANS.
    Abstract data visualizations, animated charts and graphs,
    geometric shapes, motion graphics only.
    Corporate blue and teal color palette...`,

  instagram: `Faceless engaging ${format} video about ${topic}.
    NO PEOPLE, NO FACES, NO HUMANS.
    Vibrant abstract visuals, animated infographics...`,

  // ... platform-specific prompts
};
```

**Key Constraint**: Every prompt explicitly includes `"NO PEOPLE, NO FACES, NO HUMANS"`

#### C. Model Selection Logic

**Location**: Lines 559-879

```javascript
// Check for LongCat configuration
const useLongCat = process.env.LONGCAT_ENABLED === "true";
const longCatMode = process.env.LONGCAT_MODE || "text-to-video";

// Determine if we should use scene extension (for VEO videos > 8s)
const shouldUseSceneExtension =
  !useLongCat &&
  options.useVeo !== false &&
  requestedDuration > 8 &&
  requestedDuration <= 148;
```

**Decision Tree**:

1. **LongCat** (if `useLongCat = true` OR `duration > 148s`):

   - Routes to `LongCatGenerator`
   - Supports text-to-video and image-to-video
   - Max duration: 900s (15 minutes)

2. **VEO with Scene Extension** (if `duration > 8s` and `duration ≤ 148s`):

   - Generates base 8s video
   - Extends with 7s scenes (up to 20 extensions = 148s max)
   - Uses `VideoGenerator.generateLongVideo()`

3. **VEO Standard** (if `duration ≤ 8s`):
   - Single 8s video generation
   - Uses `VideoGenerator.textToVideo()`

#### D. Person Generation Setting

**Location**: Lines 802, 843

```javascript
const veoConfig = {
  aspectRatio: options.aspectRatio || "16:9",
  resolution: "720p",
  personGeneration: isAvatarMode ? "allow_all" : "disallow_all",
  // ↑ For faceless videos: 'disallow_all'
};
```

**Critical**: `personGeneration: 'disallow_all'` ensures VEO doesn't generate people

---

## Video Generation

### 1. Video Coordinator (`backend/video/video-coordinator.js`)

**Location**: `generateVideo()` method (Lines 49-114)

**Provider Selection** (Lines 119-134):

```javascript
_selectProvider(config) {
  const { duration, useLongCat, useVeo } = config;

  if (useLongCat) return 'longcat';
  if (useVeo) return 'veo';

  // Auto-select based on duration
  if (duration > 148) return 'longcat';
  return 'veo';  // Default
}
```

**VEO Generation** (Lines 165-221):

- Checks for reference images from `REFERENCE_IMAGE_PATHS` env var
- If reference images exist → Uses `imageToVideoWithReferences()`
- Otherwise → Uses `textToVideo()` or `imageToVideo()`

**LongCat Generation** (Lines 139-160):

- Text-to-video: `longCatGenerator.textToVideo()`
- Image-to-video: `longCatGenerator.imageToVideo()` (requires reference image)

### 2. Video Generator (`backend/video/video-generator.js`)

**VEO 3.1 API Calls**:

- **Text-to-Video**: `gemini.models.generateContent()` with video generation config
- **Image-to-Video**: Includes reference images in request
- **Scene Extension**: Chains multiple 7s extensions to base 8s video

**Key Parameters**:

```javascript
{
  personGeneration: 'disallow_all',  // ← Prevents people generation
  aspectRatio: '16:9' | '9:16' | '1:1',
  resolution: '720p'
}
```

---

## Data Flow Summary

```
┌─────────────────────────────────────────────────────────────┐
│ FRONTEND (React/Next.js)                                     │
├─────────────────────────────────────────────────────────────┤
│ 1. User selects "Faceless Video"                            │
│ 2. Configures: duration, mode, model (VEO/LongCat)         │
│ 3. Optionally uploads reference images                      │
│ 4. Clicks "Execute Campaign"                                │
└──────────────────────┬──────────────────────────────────────┘
                       │ POST /api/workflow/execute
                       │ { contentType: 'faceless-video', ... }
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ API ROUTE (Next.js Server)                                  │
├─────────────────────────────────────────────────────────────┤
│ 1. Validates contentType = 'faceless-video'                 │
│ 2. Sets finalUseAvatar = false                              │
│ 3. Processes uploaded images (ImgBB or temp files)         │
│ 4. Sets REFERENCE_IMAGE_PATHS env var                       │
│ 5. Spawns backend Node.js process                           │
└──────────────────────┬──────────────────────────────────────┘
                       │ CLI: node main.js stage video ...
                       │ ENV: REFERENCE_IMAGE_PATHS, LONGCAT_*
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ BACKEND ORCHESTRATOR (Node.js)                              │
├─────────────────────────────────────────────────────────────┤
│ 1. stageVideo() called                                      │
│ 2. Detects isAvatarMode = false                             │
│ 3. Builds faceless prompt with "NO PEOPLE" constraints      │
│ 4. Selects provider: VEO (≤148s) or LongCat (>148s)        │
│ 5. Sets personGeneration: 'disallow_all'                    │
└──────────────────────┬──────────────────────────────────────┘
                       │ Calls VideoCoordinator.generateVideo()
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ VIDEO COORDINATOR                                            │
├─────────────────────────────────────────────────────────────┤
│ 1. Routes to VEO or LongCat based on duration               │
│ 2. VEO: Uses VideoGenerator with personGeneration: false   │
│ 3. LongCat: Uses LongCatGenerator                          │
│ 4. Returns video URL/path                                    │
└──────────────────────┬──────────────────────────────────────┘
                       │ Video result
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ VIDEO GENERATOR (VEO 3.1 / LongCat)                         │
├─────────────────────────────────────────────────────────────┤
│ 1. VEO: Calls Gemini API with faceless prompt              │
│ 2. LongCat: Calls fal.ai API                                │
│ 3. Returns generated video                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Configuration Points

### Frontend → API

- `contentType: 'faceless-video'` - Identifies faceless video mode
- `useAvatar: false` - Explicitly disables avatar
- `useVeo: true/false` - Model selection
- `facelessVideoMode: 'text-to-video' | 'image-to-video'`
- `duration: 8-900` - Video length in seconds

### API → Backend

- `--use-veo` flag (if VEO selected)
- `--use-avatar` flag **NOT passed** (ensures faceless mode)
- `REFERENCE_IMAGE_PATHS` env var (for image-to-video)
- `LONGCAT_ENABLED`, `LONGCAT_MODE`, `LONGCAT_PROMPT` env vars

### Backend → Video Generator

- `personGeneration: 'disallow_all'` - Critical for faceless videos
- Prompt includes `"NO PEOPLE, NO FACES, NO HUMANS"` constraint
- Provider selection based on duration and config

---

## Testing Faceless Video Selection

### Manual Test Flow

1. **Frontend Selection**:

   ```
   - Open frontend UI
   - Select "Faceless Video" from Output Format Type
   - Set duration: 30s
   - Select "Standard Duration" (VEO)
   - Select "Text-to-Video" mode
   - Enter topic: "Investment growth strategies"
   - Click "Execute Full Campaign"
   ```

2. **Verify API Request**:

   ```json
   {
     "contentType": "faceless-video",
     "useAvatar": false,
     "useVeo": true,
     "duration": 30,
     "facelessVideoMode": "text-to-video"
   }
   ```

3. **Verify Backend Execution**:

   ```
   - Check orchestrator.js logs for "Faceless" prompt
   - Verify personGeneration: 'disallow_all'
   - Verify VEO generator called (not HeyGen)
   ```

4. **Verify Generated Video**:
   ```
   - Video should contain NO people, faces, or humans
   - Should show abstract visuals, data viz, motion graphics
   - Duration should match requested (30s)
   ```

---

## Troubleshooting

### Issue: Video contains people/faces

**Solution**:

- Verify `contentType === 'faceless-video'` in frontend
- Check `finalUseAvatar === false` in API route
- Verify `personGeneration: 'disallow_all'` in VEO config
- Ensure prompt includes "NO PEOPLE, NO FACES, NO HUMANS"

### Issue: Wrong model selected

**Solution**:

- Check duration: >148s should use LongCat
- Verify `useVeo` and `useLongCat` flags in frontend
- Check `LONGCAT_ENABLED` env var in backend

### Issue: Reference images not used

**Solution**:

- Verify images uploaded in frontend
- Check `REFERENCE_IMAGE_PATHS` env var set correctly
- Ensure `facelessVideoMode === 'image-to-video'`

---

## Related Files

- **Frontend**: `app/page.tsx` (Lines 61, 996-1402)
- **API Routes**:
  - `app/api/workflow/execute/route.ts`
  - `app/api/workflow/stage/route.ts` (Lines 91-94, 369-395)
- **Backend**:
  - `backend/core/orchestrator.js` (Lines 547-922, 928-947)
  - `backend/video/video-coordinator.js`
  - `backend/video/video-generator.js`

---

## Summary

The faceless video workflow ensures **no people, faces, or humans** are generated by:

1. **Frontend**: Explicitly setting `contentType: 'faceless-video'` and `useAvatar: false`
2. **API**: Syncing `finalUseAvatar = false` when `contentType === 'faceless-video'`
3. **Backend**:
   - Building prompts with "NO PEOPLE, NO FACES, NO HUMANS" constraints
   - Setting `personGeneration: 'disallow_all'` in VEO config
   - Routing to VEO or LongCat based on duration (not HeyGen avatar)

This multi-layer approach ensures faceless videos are generated correctly across all execution paths.
