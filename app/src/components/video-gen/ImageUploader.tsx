import * as fal from "@fal-ai/serverless-client";
import { Image as ImageIcon, Loader2, Sparkles, Upload, X } from 'lucide-react';
import React, { useRef, useState } from 'react';

interface ImageUploaderProps {
  image: string | null;
  onImageUpload: (url: string | null) => void;
}

export function ImageUploader({ image, onImageUpload }: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [isGeneratingEdit, setIsGeneratingEdit] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      // Use Fal's built-in storage to get a public URL for the image
      const url = await fal.storage.upload(file);
      onImageUpload(url);
    } catch (error) {
      console.error("Upload failed:", error);
      alert("Failed to upload image. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleEditImage = async () => {
    if (!image || !editPrompt) return;
    setIsGeneratingEdit(true);
    try {
      const result: any = await fal.subscribe('fal-ai/flux-2-flex', {
        input: {
          image_url: image,
          prompt: editPrompt,
          strength: 0.85, // High strength for editing based on prompt
          image_size: "portrait_4_3",
          num_inference_steps: 28,
          guidance_scale: 3.5,
        },
        logs: true,
      });

      if (result.images && result.images.length > 0) {
        onImageUpload(result.images[0].url);
        setIsEditing(false);
        setEditPrompt('');
      }
    } catch (error) {
      console.error("Edit failed:", error);
      alert("Failed to edit image.");
    } finally {
      setIsGeneratingEdit(false);
    }
  };

  const clearImage = () => {
    onImageUpload(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setIsEditing(false);
    setEditPrompt('');
  };

  return (
    <div className="mb-8">
      <div className="flex justify-between items-center mb-3">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
          <ImageIcon className="w-4 h-4" />
          Reference Image (Optional)
        </label>
        {image && (
          <button
            onClick={clearImage}
            className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Remove
          </button>
        )}
      </div>

      {!image ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 p-8 transition-all hover:border-emerald-500/50 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
        >
          {isUploading ? (
            <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mb-2" />
          ) : (
            <Upload className="mb-2 h-8 w-8 text-slate-500 transition-colors group-hover:text-emerald-500 dark:text-slate-400" />
          )}
          <p className="text-sm text-slate-600 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-300">
            {isUploading ? "Uploading..." : "Click to upload a character or reference image"}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">Supports JPG, PNG, WEBP</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="group relative h-48 w-full overflow-hidden rounded-xl border border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-950">
            <img
              src={image}
              alt="Reference"
              className="w-full h-full object-contain"
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium backdrop-blur-sm transition-colors"
              >
                Change Image
              </button>
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="px-4 py-2 bg-indigo-500/80 hover:bg-indigo-500 rounded-lg text-sm font-medium backdrop-blur-sm transition-colors"
              >
                Edit Image
              </button>
            </div>
          </div>

          {isEditing && (
            <div className="animate-in slide-in-from-top-2 fade-in rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/80">
              <label className="mb-2 block text-xs font-medium text-slate-600 dark:text-slate-300">Edit Instruction</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  placeholder="e.g. Make the suit black, add glasses..."
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                <button
                  onClick={handleEditImage}
                  disabled={isGeneratingEdit || !editPrompt}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                >
                  {isGeneratingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Generate Edit
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
