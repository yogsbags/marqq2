import * as fal from "@fal-ai/serverless-client";
import { Download, Loader2, Play, Sparkles } from 'lucide-react';
import { useState } from 'react';

interface VideoDisplayProps {
  videoUrl: string | null;
  isLoading: boolean;
  progress?: number; // 0-100
  onVideoUpdate?: (url: string) => void;
}

export function VideoDisplay({ videoUrl, isLoading, progress, onVideoUpdate }: VideoDisplayProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [isGeneratingEdit, setIsGeneratingEdit] = useState(false);

  const handleEditVideo = async () => {
    if (!videoUrl || !editPrompt) return;
    setIsGeneratingEdit(true);
    try {
      // Note: Video editing uses fal directly, no API route needed
      const result: any = await fal.subscribe('fal-ai/kling-video/o1/video-to-video/edit', {
        input: {
          video_url: videoUrl,
          prompt: editPrompt,
        },
        logs: true,
      });

      if (result.video && result.video.url) {
        if (onVideoUpdate) {
          onVideoUpdate(result.video.url);
        }
        setIsEditing(false);
        setEditPrompt('');
      }
    } catch (error) {
      console.error("Video edit failed:", error);
      alert("Failed to edit video.");
    } finally {
      setIsGeneratingEdit(false);
    }
  };

  if (!videoUrl && !isLoading) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
        <Play className="w-12 h-12 mb-4 opacity-30" />
        <p className="text-slate-600 dark:text-slate-400">Your generated video will appear here</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center rounded-xl border border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
        <Loader2 className="w-10 h-10 animate-spin text-emerald-500 mb-4" />
        <p className="animate-pulse text-slate-700 dark:text-slate-200">Generating your masterpiece...</p>
        {progress !== undefined && (
          <div className="mt-4 h-2 w-64 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className="h-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl group">
        <video
          src={videoUrl!}
          controls
          className="w-full h-full object-contain"
          autoPlay
          loop
        />
        {onVideoUpdate && (
          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="px-4 py-2 bg-indigo-600/90 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium backdrop-blur-sm transition-colors shadow-lg"
            >
              Edit Video
            </button>
          </div>
        )}
      </div>

      {isEditing && (
        <div className="animate-in slide-in-from-top-2 fade-in rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/80">
          <label className="mb-2 block text-xs font-medium text-slate-600 dark:text-slate-300">Edit Instruction (Kling O1)</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              placeholder="e.g. Change the background to a futuristic city..."
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <button
              onClick={handleEditVideo}
              disabled={isGeneratingEdit || !editPrompt}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
            >
              {isGeneratingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Generate Edit
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <a
          href={videoUrl!}
          download="generated-video.mp4"
          className="flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
        >
          <Download className="w-4 h-4" />
          Download Video
        </a>
      </div>
    </div>
  );
}
