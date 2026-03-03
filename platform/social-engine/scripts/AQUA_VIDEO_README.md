# AQUA PMS Video Campaign

## Overview

This script generates a comprehensive 90-second video about PL Capital's AQUA Quantitative PMS strategy, highlighting its exceptional performance and systematic approach.

## Key Messages

- **76% Returns**: AQUA delivered 76% returns in its debut year (vs 38% benchmark)
- **37.5% Alpha**: Outperformed benchmark by 37.5 percentage points
- **Systematic Approach**: Data-driven, bias-free quantitative investing
- **6S Framework**: Comprehensive systematic strategy framework
- **Client Success**: Real client story (₹5 Cr → ₹8.8 Cr in 12 months)

## Video Structure

The video consists of 11 segments (8s base + 10 extensions × 7s = ~85s total):

1. **Introduction** (0-8s): Professional presentation setup
2. **Performance Highlight** (8-16s): 76% returns visualization
3. **Systematic vs Emotional** (16-24s): Comparison visualization
4. **6S Framework** (24-32s): Framework introduction
5. **Market Regime Detection** (32-40s): Regime detection explanation
6. **Factor Rotation** (40-48s): Factor strategy visualization
7. **Dynamic Asset Allocation** (48-56s): Allocation strategy
8. **Client Success Story** (56-64s): ₹5Cr → ₹8.8Cr journey
9. **PL Capital Credibility** (64-72s): Legacy and trust building
10. **Call to Action** (72-80s): Portfolio review invitation
11. **Closing** (80-88s): Brand reinforcement

## Usage

### Generate Video

```bash
# Set API key
export GEMINI_API_KEY="your-gemini-api-key"

# Generate video
npm run aqua-video

# Or directly
node scripts/create-aqua-video.js
```

### Simulation Mode (Test Without API Calls)

```bash
npm run aqua-video:simulate

# Or
node scripts/create-aqua-video.js --simulate
```

## Output

Videos are saved to:
```
output/aqua-video/
├── Segment 1: Introduction (8s)
├── Segment 2: Performance (7s extension)
├── Segment 3: Comparison (7s extension)
├── ...
└── aqua-video-metadata.json (campaign metadata)
```

## Next Steps After Generation

1. **Review Clips**: Check all segments in `output/aqua-video/`
2. **Composite**: Use Shotstack to combine clips into final video
3. **Add Narration**: Optionally add HeyGen avatar narration
4. **Edit**: Add captions, transitions, music
5. **Publish**: Upload to LinkedIn, YouTube, Instagram

## Integration with Campaign System

You can also generate this video through the main campaign system:

```bash
# Using main campaign orchestrator
node main.js campaign linkedin-testimonial \
  --topic "AQUA PMS: 76% Returns Through Systematic Investing" \
  --use-veo \
  --duration 90 \
  --wait
```

## Customization

Edit `scripts/create-aqua-video.js` to customize:
- Video segments and prompts
- Duration and aspect ratio
- Output directory
- Segment descriptions

## Requirements

- `GEMINI_API_KEY`: Required for Veo 3.1 video generation
- Node.js >= 16.0.0
- Internet connection for API calls

## Performance

- **Generation Time**: ~15-20 minutes for full 90s video
- **API Costs**: ~11 API calls (1 base + 10 extensions)
- **File Size**: ~50-100MB per segment (720p)

## Troubleshooting

### API Key Issues
```bash
# Verify API key is set
echo $GEMINI_API_KEY

# Check API key validity at: https://aistudio.google.com/apikey
```

### Rate Limiting
- Script includes 5-second delays between segments
- If rate limited, wait 10-15 minutes and retry
- Consider using `--simulate` mode for testing

### Video Quality
- Default: 720p resolution
- For 1080p, modify `resolution: '1080p'` in script
- Higher resolution = longer generation time

## Example Output

```
🎬 AQUA PMS Video Campaign Generator
============================================================
📊 Topic: AQUA Quantitative PMS Strategy
🎯 Key Message: 76% Returns | Systematic Approach | 6S Framework
⏱️  Target Duration: ~90 seconds (11 segments × 8s)

📁 Output directory: output/aqua-video

📹 Segment 1/11: Introduction - AQUA PMS presentation
   ✅ Generated: /tmp/veo-text-1234567890.mp4
📹 Segment 2/11: Performance highlight - 76% returns vs 38% benchmark
   ✅ Extended: /tmp/veo-extended-1234567891.mp4
...
✅ Successful Segments: 11/11
⏱️  Total Duration: ~85s
```

## Related Documentation

- [Video Generation Guide](../README.md#video-production)
- [Veo 3.1 Documentation](../docs/VEO_IMPLEMENTATION_SUMMARY.md)
- [Campaign System](../README.md#campaign-types)


