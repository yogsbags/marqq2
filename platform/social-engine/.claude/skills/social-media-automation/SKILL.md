---
name: social-media-automation
description: AI-powered social media campaign workflow automation for multi-platform content generation, video production (Veo 3.1 + HeyGen + Shotstack), and publishing across LinkedIn, Instagram, Facebook, YouTube, and X (Twitter)
---

# Social Media Automation Skill

This skill enables Claude to orchestrate complete social media campaigns for PL Capital's MADP product and general brand awareness.

## Workflow Stages

### Stage 1: Campaign Planning
- Select campaign type (client transformation, myth-busting, data visualization, testimonial, etc.)
- Choose target platform(s): LinkedIn, Instagram, Facebook, YouTube, X
- Define content pillar: Education (40%), Social Proof (30%), Personal Brand (20%), or Engagement (10%)
- Set success metrics (impressions, engagement rate, lead generation targets)

### Stage 2: Content Generation
- Generate AI-powered copy using Claude/ChatGPT
- Create platform-specific hooks and CTAs
- Optimize for platform algorithms (character limits, hashtags, emoji usage)
- **Output**: Copy templates ready for visual production

### Stage 3: Visual Asset Production

**For Images** (Replicate Flux):
- Generate AI images based on campaign prompts
- Styles: Lifestyle, financial, abstract, emotional, storytelling
- Aspect ratios: 1:1 (Instagram), 16:9 (YouTube), 9:16 (Stories)

**For Short Videos** (< 60s):
- Use HeyGen for AI avatar testimonials
- Shotstack for b-roll compilation and editing
- Add captions, text overlays, music

**For Long Videos** (60s - 12 min):
- **Veo 3.1 Scene Extension** workflow (see below)

### Stage 4: Video Production (Veo 3.1 Scene Extension)

**For 90-second AI Avatar Testimonial** (LinkedIn Campaign Type 3):

1. **Generate Core Avatar Video** (HeyGen API):
   - 90-second AI avatar speaking testimonial script
   - Indian professional avatar (35-40 years old)
   - Business casual setting

2. **Generate B-roll Clips** (Veo 3.1 API):
   - Break into 8-second segments (90s ÷ 8s ≈ 12 clips)
   - **Initial Clip** (0-8s):
     ```
     Prompt: "AI Avatar (Indian male, professional setting) speaking confidently"
     API: client.models.generate_videos(model='veo-3.1', prompt=prompt_1, config=config)
     Output: video_object_1
     ```

   - **Extension Clips** (8s-96s):
     ```python
     for i in range(2, 13):
         prompt = f"Continue scene: {describe_next_8_seconds(i)}"
         video_object_i = client.models.generate_videos(
             model='veo-3.1',
             prompt=prompt,
             video=video_object_{i-1}.video  # Use previous video as input
         )
     ```

   - Example prompts for extensions:
     - Clip 2 (8-16s): "Portfolio dashboard with rising graph"
     - Clip 3 (16-24s): "Animated valuation vs momentum chart"
     - Clip 12 (88-96s): "Speaker with 'Book consultation' text overlay"

3. **Stitch Final Video** (Shotstack/Creatomate API):
   - Combine HeyGen avatar video (base layer)
   - Splice Veo B-roll at correct timestamps
   - Add text overlays ("₹50L minimum", "Book consultation: [URL]") at 85s
   - Add captions/subtitles

   **Result**: 90-second professional testimonial video ready for LinkedIn

### Stage 5: Multi-Platform Publishing

**LinkedIn**:
- Text post with carousel/video
- Professional tone, thought leadership
- Frequency: 5x/week

**Instagram**:
- Reels (60-90s), carousels, stories
- Aspirational visuals, lifestyle + finance
- Frequency: Daily (7x/week)

**YouTube**:
- Long-form (8-12 min explainers) OR Shorts (60s)
- Educational content with AI avatar presenter
- Frequency: 3x/week

**Facebook**:
- Community posts, event promotions
- Family-oriented financial content
- Frequency: 3x/week

**X (Twitter)**:
- Thread-style education, quick tips
- Engagement polls, myth-busting
- Frequency: 2x/day (14x/week)

### Stage 6: Performance Tracking
- Track platform-specific KPIs (impressions, engagement, CTR)
- Lead generation metrics (calendar bookings, form submissions)
- A/B testing (visual styles, copy hooks, CTAs)
- Weekly optimization based on data

## Veo 3.1 Scene Extension - Technical Details

### API Integration (Python Example)

```python
import replicate

# Initialize client
client = replicate.Client(api_token=os.environ['REPLICATE_API_TOKEN'])

MODEL_NAME = "google/veo-3.1"

def generate_long_video(script_segments, config):
    """
    Generate 90-second video using scene extension

    Args:
        script_segments: List of 8-second script descriptions
        config: Video config (aspect_ratio, fps, etc.)

    Returns:
        Final video URI (90+ seconds)
    """
    video_object = None

    for i, segment in enumerate(script_segments):
        if i == 0:
            # Initial clip (no video input)
            video_object = client.models.generate_videos(
                model=MODEL_NAME,
                prompt=segment['prompt'],
                config=config
            )
        else:
            # Extension clip (use previous video as input)
            video_object = client.models.generate_videos(
                model=MODEL_NAME,
                prompt=segment['prompt'],
                video=video_object.video  # Scene extension
            )

        print(f"Generated clip {i+1}/{len(script_segments)}: {segment['time_range']}")

    # Final video contains all 12 clips stitched together
    return video_object.video.uri

# Example usage for 90-second testimonial
config = {
    "aspect_ratio": "16:9",
    "duration": 8,  # Each clip is 8 seconds
    "fps": 30
}

segments = [
    {
        "time_range": "0-8s",
        "prompt": "Indian male professional age 55, speaking confidently in modern office"
    },
    {
        "time_range": "8-16s",
        "prompt": "Continue scene, add screen showing MADP portfolio dashboard with rising graph"
    },
    {
        "time_range": "16-24s",
        "prompt": "Transition to animated valuation vs momentum chart, clean corporate aesthetic"
    },
    # ... 9 more segments
    {
        "time_range": "88-96s",
        "prompt": "Final continuation, add text overlay 'Book consultation: [URL]' in lower third"
    }
]

final_video_uri = generate_long_video(segments, config)
print(f"✅ 90-second video ready: {final_video_uri}")
```

### Post-Processing Workflow

After Veo 3.1 generates the 90s video:

1. **Download Video**: `wget {final_video_uri} -O raw_testimonial.mp4`
2. **Add HeyGen Avatar** (if not using Veo for avatar):
   - Generate avatar separately via HeyGen API
   - Use Shotstack to composite avatar over Veo B-roll
3. **Add Text Overlays**:
   - CTAs: "Book consultation", "₹50L minimum"
   - Timestamps: 85s for final CTA
   - Tool: Shotstack/Creatomate or FFmpeg
4. **Add Captions**:
   - Auto-generate via Whisper API or Deepgram
   - Burn in or upload as SRT to YouTube
5. **Export for Platforms**:
   - LinkedIn: 16:9, max 10 min
   - Instagram: 9:16 (Stories), 1:1 (Feed), 16:9 (IGTV)
   - YouTube: 16:9, unlimited length

## Key Integrations

### HeyGen API
- **Purpose**: AI avatar video generation
- **Endpoint**: `POST https://api.heygen.com/v1/video.generate`
- **Auth**: Bearer token (`HEYGEN_API_KEY`)
- **Input**: Script text, avatar ID, voice ID
- **Output**: Video URL (1-5 min processing time)

### Veo 3.1 API (Replicate)
- **Purpose**: Long-form video generation with scene extension
- **Endpoint**: `client.models.generate_videos()`
- **Auth**: API token (`REPLICATE_API_TOKEN`)
- **Input**: Text prompt + optional previous video for extension
- **Output**: Video object with URI

### Shotstack API
- **Purpose**: Video editing, compositing, rendering
- **Endpoint**: `POST https://api.shotstack.io/v1/render`
- **Auth**: API key (`SHOTSTACK_API_KEY`)
- **Input**: Edit timeline JSON (clips, overlays, transitions)
- **Output**: Rendered video URL

### Replicate Flux (Image Generation)
- **Purpose**: AI-generated images for social media
- **Model**: `black-forest-labs/flux-schnell`
- **Input**: Text prompt, aspect ratio, style
- **Output**: High-quality image URL

## Environment Variables

```bash
# AI Content Generation
export GROQ_API_KEY="your-groq-key"
export OPENAI_API_KEY="your-openai-key"

# Video Production
export HEYGEN_API_KEY="your-heygen-key"
export REPLICATE_API_TOKEN="your-replicate-token"
export SHOTSTACK_API_KEY="your-shotstack-key"

# Image Generation
export IMGBB_API_KEY="your-imgbb-key"  # For hosting

# Publishing (optional - use Zapier MCP if available)
export LINKEDIN_ACCESS_TOKEN="your-token"
export YOUTUBE_API_KEY="your-key"
```

## Example Commands

### Generate LinkedIn Carousel Campaign
```bash
node main.js campaign linkedin-carousel \
  --type myth-busting \
  --topic "7 Money Myths Keeping You Poor" \
  --auto-publish
```

### Generate 90s Instagram Testimonial Video
```bash
node main.js campaign instagram-testimonial \
  --topic "Client Success Story: ₹50L to ₹2Cr" \
  --use-veo \
  --duration 90 \
  --wait-for-completion
```

### Generate YouTube Deep-Dive (12 minutes)
```bash
node main.js campaign youtube-explainer \
  --topic "How to Build ₹1Cr by 40" \
  --use-avatar \
  --duration 720 \
  --chapters
```

## Best Practices

1. **Content Pillar Balance**: 40% Education, 30% Social Proof, 20% Personal Brand, 10% Engagement
2. **Platform-Native**: Optimize each piece for specific platform algorithm
3. **Consistency**: Post at optimal times (LinkedIn: 7-9 AM, Instagram: 5-7 PM IST)
4. **A/B Testing**: Test 2-3 variants of each campaign type weekly
5. **Lead Funnel**: Every post drives to lead magnet/calendar booking
6. **Veo Scene Extension**: Use for 60s+ videos to maintain temporal consistency
7. **HeyGen + Veo Combo**: HeyGen for avatar, Veo for B-roll, Shotstack for final edit

## Success Metrics (Year 1)

- **LinkedIn**: 5,000 followers → 500 qualified leads
- **Instagram**: 10,000 followers → 300 qualified leads
- **YouTube**: 50K views/month → 200 qualified leads
- **Combined**: 1,000 leads → 100-150 accounts → ₹50 Cr AUM
- **ROI**: ₹1.22 Cr net profit on ₹8.91 L content production cost = **1,369% ROI**
