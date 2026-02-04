"use client";

import { AudioUploader } from '../video-gen/AudioUploader';
import { ImageGenerator } from '../video-gen/ImageGenerator';
import { ImageUploader } from '../video-gen/ImageUploader';
import { ModelSelector, ModelType } from '../video-gen/ModelSelector';
import { ReelType, ReelTypeSelector } from '../video-gen/ReelTypeSelector';
import { ScriptGenerator } from '../video-gen/ScriptGenerator';
import { VideoDisplay } from '../video-gen/VideoDisplay';
import { VideoPromptInput } from '../video-gen/VideoPromptInput';
import * as fal from "@fal-ai/serverless-client";
import { AlertCircle, Settings2 } from 'lucide-react';
import { useMemo, useState } from 'react';

fal.config({
  proxyUrl: "/api/video-gen/fal/proxy",
});

// Map our internal model IDs to actual Fal.ai endpoint IDs
const FAL_ENDPOINTS: Record<ModelType, string> = {
  'wan-2.5': 'fal-ai/wan-25-preview/text-to-video',
  'kling-2.6': 'fal-ai/kling-video/v2.6/pro/text-to-video',
  'omnihuman-1.5': 'fal-ai/bytedance/omnihuman/v1.5',
  'ovi': 'fal-ai/ovi/image-to-video',
  'runway-gen-4': 'fal-ai/runway-gen3/turbo/text-to-video',
};

// Image-to-Video Endpoints
const I2V_ENDPOINTS: Record<ModelType, string> = {
  'wan-2.5': 'fal-ai/wan-25-preview/image-to-video',
  'kling-2.6': 'fal-ai/kling-video/v2.6/pro/image-to-video',
  'omnihuman-1.5': 'fal-ai/bytedance/omnihuman/v1.5',
  'ovi': 'fal-ai/ovi/image-to-video',
  'runway-gen-4': 'fal-ai/runway-gen3/turbo/image-to-video',
};

export function VideoGenFlow() {
  const [reelType, setReelType] = useState<ReelType>('educational');
  const [model, setModel] = useState<ModelType>('wan-2.5');
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBase64, setAudioBase64] = useState<string>('');
  const [audioTimestamps, setAudioTimestamps] = useState<any[]>([]);
  const [clonedVoiceId, setClonedVoiceId] = useState<string | undefined>(undefined);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // New settings for Wan 2.5 / Advisor
  const [resolution, setResolution] = useState<'720p' | '480p' | '1080p'>('720p');
  const [duration, setDuration] = useState<'5' | '10' | '30'>('10');

  // Price Calculation
  const estimatedPrice = useMemo(() => {
    if (model === 'omnihuman-1.5') {
      return "0.50 - 1.50"; // Variable based on audio
    }
    if (model === 'wan-2.5') {
      // Wan 2.5: Resolution-based pricing
      // 480p: $0.05/s, 720p: $0.10/s, 1080p: $0.15/s
      const costPerSec = resolution === '480p' ? 0.05 : resolution === '720p' ? 0.10 : 0.15;
      const secs = parseInt(duration);
      return (secs * costPerSec).toFixed(2);
    }
    return "Credit"; // Other models
  }, [model, duration, resolution]);

  const handleOptimization = (optimized: string, recommendedModel: ModelType) => {
    setPrompt(optimized);
    setModel(recommendedModel);
  };

  const handleReelTypeSelect = (type: ReelType) => {
    setReelType(type);
    if (type === 'advisor') {
      setModel('wan-2.5'); // Updated to Wan 2.5 as default for Advisor
    }
  };

  const handleTimestampsGenerated = (timestamps: any[], base64: string) => {
    setAudioTimestamps(timestamps);
    setAudioBase64(base64);
  };

  const handleGenerate = async () => {
    if (model !== 'omnihuman-1.5' && !prompt) return;
    if (model === 'omnihuman-1.5' && (!imageUrl || !audioUrl)) return;

    setIsGenerating(true);
    setVideoUrl(null);
    setError(null);
    setProgress(0);

    try {
      // Check if we need multi-stage generation for 30s
      if (duration === '30' && model !== 'omnihuman-1.5') {
        // Split audio if available
        const audioSegments: string[] = [];
        if (audioUrl && audioBase64 && audioTimestamps.length > 0) {
          setProgress(5);
          const splitRes = await fetch('/api/video-gen/split-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioBase64: audioBase64,
              timestamps: audioTimestamps,
              targetDuration: 10
            }),
          });
          const splitData = await splitRes.json();
          if (splitData.success && splitData.segments) {
            // Upload each audio segment to Fal
            for (const segmentBase64 of splitData.segments) {
              const byteCharacters = atob(segmentBase64);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              const blob = new Blob([byteArray], { type: 'audio/wav' });
              const file = new File([blob], `segment_${audioSegments.length}.wav`, { type: 'audio/wav' });
              const url = await fal.storage.upload(file);
              audioSegments.push(url);
            }
          }
        }

        // Generate 3x10s segments with proper frame chaining
        const segments: string[] = [];

        // Segment 1: Normal generation
        setProgress(15);
        const segment1 = await generateSegment(10, null, audioSegments[0]);
        segments.push(segment1);
        setProgress(40);

        // Extract last frame from segment 1
        const frame1 = await extractLastFrame(segment1);

        // Segment 2: Use extracted frame from segment 1
        const segment2 = await generateSegment(10, frame1, audioSegments[1]);
        segments.push(segment2);
        setProgress(65);

        // Extract last frame from segment 2
        const frame2 = await extractLastFrame(segment2);

        // Segment 3: Use extracted frame from segment 2
        const segment3 = await generateSegment(10, frame2, audioSegments[2]);
        segments.push(segment3);
        setProgress(90);

        // Stitch all segments together
        const stitchedVideo = await stitchVideos(segments);
        setVideoUrl(stitchedVideo);
        setProgress(100);
        return;
      }

      // Choose endpoint based on whether an image is provided
      const endpointId = imageUrl
        ? I2V_ENDPOINTS[model] || FAL_ENDPOINTS[model]
        : FAL_ENDPOINTS[model];

      if (!endpointId) throw new Error(`Model ${model} not configured yet`);

      let input: any = {};

      if (model === 'ovi') {
        // OVI specific payload - requires image and uses special prompt format
        if (!imageUrl) {
          throw new Error("OVI requires an image. Please upload or generate an image first.");
        }
        if (!prompt) {
          throw new Error("OVI requires a prompt. Please enter your script/prompt.");
        }
        input = {
          prompt: prompt, // Should be OVI-formatted with <S>, <E>, <AUDCAP> tags
          image_url: imageUrl,
        };
      } else if (model === 'omnihuman-1.5') {
        // OmniHuman specific payload
        if (!imageUrl || !audioUrl) {
          throw new Error("OmniHuman requires both an Image and Audio file.");
        }
        input = {
          image_url: imageUrl,
          audio_url: audioUrl,
        };
      } else {
        // Standard Text/Image to Video (Wan 2.5, etc)
        input = {
          prompt: prompt,
          aspect_ratio: resolution === '720p' ? "9:16" : "16:9",
          duration_seconds: parseInt(duration),
        };

        if (imageUrl) {
          input.image_url = imageUrl;
        }

        // Add duration if supported by model (Wan 2.5 supports it)
        if (model === 'wan-2.5') {
          if (audioUrl) {
            input.audio_url = audioUrl;
          }
        }
      }

      // DEBUG: Log the exact payload being sent to Fal API
      console.log('=== FAL API REQUEST DEBUG ===');
      console.log('Endpoint:', endpointId);
      console.log('Model:', model);
      console.log('Input payload:', JSON.stringify(input, null, 2));
      console.log('Image URL provided:', !!imageUrl);
      console.log('Audio URL provided:', !!audioUrl);
      console.log('Prompt length:', prompt?.length || 0);
      console.log('===========================');

      const result: any = await fal.subscribe(endpointId, {
        input,
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === 'IN_PROGRESS') {
            // Simulate progress or use logs if available
            setProgress((prev) => Math.min(prev + 5, 90));
          }
        },
      });

      if (result.video && result.video.url) {
        setVideoUrl(result.video.url);
        setProgress(100);
      } else {
        throw new Error("No video URL in response");
      }

    } catch (err: any) {
      console.error("=== GENERATION ERROR DEBUG ===");
      console.error("Error object:", err);
      console.error("Error message:", err.message);
      console.error("Error response:", err.response);
      console.error("Error data:", err.data);
      console.error("Error status:", err.status);
      console.error("Full error JSON:", JSON.stringify(err, null, 2));
      console.error("=============================");
      setError(err.message || "Failed to generate video");
    } finally {
      setIsGenerating(false);
    }
  };

  // Helper function to generate a single segment
  const generateSegment = async (segmentDuration: number, referenceImage: string | null, audioSegmentUrl?: string) => {
    const endpointId = referenceImage || imageUrl
      ? I2V_ENDPOINTS[model] || FAL_ENDPOINTS[model]
      : FAL_ENDPOINTS[model];

    const input: any = {
      prompt: prompt,
      aspect_ratio: resolution === '720p' ? "9:16" : resolution === '480p' ? "9:16" : "16:9",
      duration_seconds: segmentDuration,
    };

    if (referenceImage) {
      input.image_url = referenceImage;
    } else if (imageUrl) {
      input.image_url = imageUrl;
    }

    if (model === 'wan-2.5' && audioSegmentUrl) {
      input.audio_url = audioSegmentUrl;
    }

    const result: any = await fal.subscribe(endpointId, { input, logs: true });

    if (result.video && result.video.url) {
      return result.video.url;
    }
    throw new Error("No video URL in segment generation");
  };

  // Helper function to extract last frame from video
  const extractLastFrame = async (videoUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.src = videoUrl;

      video.addEventListener('loadedmetadata', () => {
        // Seek to the last frame (duration - 0.1s to ensure we get a valid frame)
        video.currentTime = Math.max(0, video.duration - 0.1);
      });

      video.addEventListener('seeked', () => {
        try {
          // Create canvas and draw the video frame
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          // Convert canvas to data URL
          const frameDataUrl = canvas.toDataURL('image/jpeg', 0.95);
          resolve(frameDataUrl);
        } catch (err) {
          reject(err);
        }
      });

      video.addEventListener('error', (err) => {
        reject(new Error('Failed to load video for frame extraction'));
      });
    });
  };

  // Helper function to stitch multiple videos together
  const stitchVideos = async (videoUrls: string[]) => {
    const response = await fetch('/api/video-gen/stitch-videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_urls: videoUrls,
      }),
    });

    const data = await response.json();
    if (!data.success || !data.video_base64) {
      throw new Error(data.error || 'Failed to stitch videos');
    }

    // Convert base64 to data URL for video player
    return `data:video/mp4;base64,${data.video_base64}`;
  };


  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Left Column: Controls */}
          <div className="space-y-8">
            {/* Stage 1: Select Model */}
            <section className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-800">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 text-purple-600 text-xs font-semibold">1</span>
                Select Model
              </h2>
              <ModelSelector selectedModel={model} onSelect={setModel} />
            </section>

            {/* Stage 2: Select Strategy */}
            <section className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-800">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 text-purple-600 text-xs font-semibold">2</span>
                Select Strategy
              </h2>
              <ReelTypeSelector selectedType={reelType} onSelect={handleReelTypeSelect} />
            </section>

            {/* Resolution & Duration settings for Wan 2.5 / others */}
            {model !== 'omnihuman-1.5' && (
              <section className="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Settings2 className="w-4 h-4" />
                  Video Settings
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1 font-medium">Resolution</label>
                    <select
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value as any)}
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
                    >
                      <option value="720p">720p (HD)</option>
                      <option value="1080p">1080p (FHD)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1 font-medium">Duration</label>
                    <select
                      value={duration}
                      onChange={(e) => setDuration(e.target.value as any)}
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
                    >
                      <option value="5">5 Seconds</option>
                      <option value="10">10 Seconds</option>
                    </select>
                  </div>
                </div>
              </section>
            )}

            <section className="bg-white rounded-lg shadow-lg p-6">
              {model !== 'omnihuman-1.5' && (
                <>
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-800">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 text-purple-600 text-xs font-semibold">3</span>
                    Refine Prompt
                  </h2>
                  <VideoPromptInput
                    prompt={prompt}
                    setPrompt={setPrompt}
                    reelType={reelType}
                    model={model}
                    onOptimize={handleOptimization}
                  />
                </>
              )}

              {model === 'omnihuman-1.5' && (
                <ImageGenerator prompt={prompt} onImageGenerated={setImageUrl} />
              )}

              <ImageUploader image={imageUrl} onImageUpload={setImageUrl} />

              {/* Audio Section - Hidden for OVI (has native audio) */}
              {(model === 'omnihuman-1.5' || model === 'wan-2.5') && (
                <>
                  <ScriptGenerator
                    onAudioGenerated={setAudioUrl}
                    onTimestampsGenerated={handleTimestampsGenerated}
                    clonedVoiceId={clonedVoiceId}
                  />
                  <AudioUploader
                    audioUrl={audioUrl}
                    onAudioUpload={setAudioUrl}
                    onVoiceCloned={setClonedVoiceId}
                  />
                </>
              )}
            </section>

            <div className="space-y-3 bg-white rounded-lg shadow-lg p-6">
              <div className="flex items-center justify-between text-sm px-1">
                <span className="text-gray-600 font-medium">Estimated Cost:</span>
                <span className="font-mono font-medium text-emerald-600 flex items-center gap-1">
                  {model !== 'kling-2.6' && '$'}{estimatedPrice}
                </span>
              </div>
              <button
                onClick={handleGenerate}
                disabled={isGenerating || (model === 'omnihuman-1.5' ? (!imageUrl || !audioUrl) : !prompt)}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? 'Generating Video...' : 'Generate Video'}
              </button>
            </div>
          </div>

          {/* Right Column: Preview */}
          <div className="lg:sticky lg:top-8 h-fit">
            <div className="bg-white rounded-lg shadow-lg p-6 mb-4">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-800">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 text-purple-600 text-xs font-semibold">4</span>
                Preview
              </h2>
              <VideoDisplay
                videoUrl={videoUrl}
                isLoading={isGenerating}
                progress={progress}
                onVideoUpdate={setVideoUrl}
              />
            </div>

            {error && (
              <div className="mt-4 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="text-sm">{error}</div>
              </div>
            )}

            {/* Debug Info */}
            <div className="mt-8 p-4 rounded-lg bg-gray-50 border border-gray-200 text-xs font-mono text-gray-600">
              <div className="mb-2 font-semibold text-gray-700">Current Configuration:</div>
              <div className="text-gray-600">Strategy: {reelType}</div>
              <div className="text-gray-600">Model: {model}</div>
              <div className="truncate text-gray-600">Prompt: {prompt || '(empty)'}</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
