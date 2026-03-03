import * as fal from "@fal-ai/serverless-client";
import { ImageIcon, Loader2, Sparkles, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';

interface ImageGeneratorProps {
  prompt: string;
  onImageGenerated: (url: string) => void;
}

export function ImageGenerator({ prompt: initialPrompt, onImageGenerated }: ImageGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [localPrompt, setLocalPrompt] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use local prompt if user typed one, otherwise use the one passed from parent (if any)
  const activePrompt = localPrompt || initialPrompt;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const url = await fal.storage.upload(file);
      setReferenceImage(url);
    } catch (error) {
      console.error("Upload failed:", error);
      alert("Failed to upload reference image.");
    }
  };

  const handleOptimize = async () => {
    if (!activePrompt) return;
    setIsOptimizing(true);
    try {
      const res = await fetch('/api/video-gen/generate-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPrompt: activePrompt,
          reelType: 'advisor'
        }),
      });
      const data = await res.json();
      if (data.optimizedPrompt) {
        setLocalPrompt(data.optimizedPrompt);
      }
    } catch (error) {
      console.error("Optimization failed:", error);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!activePrompt) return;
    setIsGenerating(true);
    try {
      const fullPrompt = `${gender} ${activePrompt}`;
      let result: any;

      console.log("Generating image with prompt:", fullPrompt);
      if (referenceImage) {
        // Use Wan 2.5 for Image-to-Image as requested
        result = await fal.run('fal-ai/wan-25-preview/image-to-image', {
          input: {
            prompt: fullPrompt,
            image_url: referenceImage,
          },
        });
      } else {
        // Use Flux 2 Flex for Text-to-Image
        result = await fal.run('fal-ai/flux-2-flex', {
          input: {
            prompt: fullPrompt,
            image_size: "portrait_4_3",
          },
        });
      }

      if (result.images && result.images.length > 0) {
        onImageGenerated(result.images[0].url);
      }
    } catch (error) {
      console.error("Image generation failed:", error);
      alert("Failed to generate image.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="mb-4 space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Image Prompt</label>
        <div className="relative">
          <input
            type="text"
            value={localPrompt}
            onChange={(e) => setLocalPrompt(e.target.value)}
            placeholder={initialPrompt || "Describe the advisor (e.g. Professional Indian financial advisor in a suit...)"}
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-10 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <button
            onClick={handleOptimize}
            disabled={isOptimizing || !activePrompt}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
            title="Optimize with Gemini"
          >
            {isOptimizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="flex justify-between items-end">
        <div className="flex-1 mr-4">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Optional Reference Image</label>
          {!referenceImage ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 p-3 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
            >
              <Upload className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <span className="text-xs text-slate-500 dark:text-slate-400">Upload Reference</span>
            </div>
          ) : (
            <div className="relative flex h-12 w-full items-center justify-between overflow-hidden rounded-lg border border-slate-300 bg-slate-100 px-2 dark:border-slate-700 dark:bg-slate-950">
              <img src={referenceImage} alt="Ref" className="h-full w-auto object-contain" />
              <button
                onClick={() => setReferenceImage(null)}
                className="text-red-600 hover:text-red-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Advisor Gender</label>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as 'male' | 'female')}
            className="min-w-[100px] rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
      </div>

      <button
        onClick={handleGenerateImage}
        disabled={isGenerating || !activePrompt}
        className="w-full py-3 rounded-xl bg-indigo-100 hover:bg-indigo-200 text-indigo-700 border border-indigo-300 transition-colors flex items-center justify-center gap-2 text-sm font-medium disabled:opacity-50"
      >
        {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
        {referenceImage ? 'Generate with Wan 2.5 (Img2Img)' : `Generate ${gender === 'male' ? 'Male' : 'Female'} Reference Image`}
      </button>

      <p className="text-center text-xs text-slate-600 dark:text-slate-400">
        {referenceImage
          ? "Uses Wan 2.5 Image-to-Image to transform your reference."
          : "Uses Flux 2 Flex model to generate a character."}
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
