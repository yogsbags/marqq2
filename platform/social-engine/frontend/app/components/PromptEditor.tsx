'use client'

import { useState, useEffect } from 'react'

interface PromptEditorProps {
  isOpen: boolean
  prompt: string
  stageNumber: number
  stageName: string
  onSave: (editedPrompt: string) => void
  onCancel: () => void
}

export default function PromptEditor({
  isOpen,
  prompt,
  stageNumber,
  stageName,
  onSave,
  onCancel
}: PromptEditorProps) {
  const [editedPrompt, setEditedPrompt] = useState(prompt)
  const [characterCount, setCharacterCount] = useState(0)

  useEffect(() => {
    setEditedPrompt(prompt)
    setCharacterCount(prompt.length)
  }, [prompt])

  const handleTextChange = (text: string) => {
    setEditedPrompt(text)
    setCharacterCount(text.length)
  }

  const handleSave = () => {
    onSave(editedPrompt)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-500 to-blue-500 text-white px-6 py-4">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <span>✏️</span> Edit Generation Prompt
          </h2>
          <p className="text-sm opacity-90 mt-1">
            {stageName} - Stage {stageNumber}
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              AI Generation Prompt:
            </label>
            <p className="text-xs text-gray-500 mb-3">
              This prompt will be used by Gemini 3 Pro to generate images/videos.
              You can edit it to fine-tune the output based on your requirements.
            </p>
            <textarea
              value={editedPrompt}
              onChange={(e) => handleTextChange(e.target.value)}
              className="w-full h-64 px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none font-mono text-sm resize-none"
              placeholder="Enter your custom prompt..."
            />
            <div className="flex justify-between items-center mt-2">
              <p className="text-xs text-gray-500">
                💡 Tip: Be specific about style, composition, colors, and mood
              </p>
              <p className="text-xs text-gray-600">
                {characterCount} characters
              </p>
            </div>
          </div>

          {/* Prompt Guidelines */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 mb-4">
            <h3 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
              <span>💡</span> Prompt Writing Tips
            </h3>
            <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
              <li>Start with the main subject and composition</li>
              <li>Specify style (e.g., "professional photography", "modern corporate")</li>
              <li>Include color palette and lighting requirements</li>
              <li>Add mood and atmosphere descriptors</li>
              <li>Mention technical details (resolution, format) if needed</li>
              <li>Reference brand guidelines when applicable</li>
            </ul>
          </div>

          {/* Preview of Key Parameters */}
          <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span>📋</span> Context from Previous Stages
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-white p-2 rounded border border-gray-200">
                <span className="font-semibold text-gray-600">Stage:</span>
                <span className="ml-2 text-gray-800">{stageName}</span>
              </div>
              <div className="bg-white p-2 rounded border border-gray-200">
                <span className="font-semibold text-gray-600">Processing:</span>
                <span className="ml-2 text-gray-800">Gemini 3 Pro Image Preview</span>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              The prompt will be enhanced with context from campaign configuration,
              target audience, and uploaded reference materials.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t-2 border-gray-200 px-6 py-4 bg-gray-50 flex justify-between items-center">
          <button
            onClick={onCancel}
            className="px-6 py-2 rounded-lg font-semibold text-gray-700 bg-white border-2 border-gray-300 hover:bg-gray-100 transition-all"
          >
            Cancel
          </button>
          <div className="flex gap-3">
            <button
              onClick={() => handleTextChange(prompt)}
              className="px-6 py-2 rounded-lg font-semibold text-purple-700 bg-purple-100 border-2 border-purple-300 hover:bg-purple-200 transition-all"
            >
              Reset to Original
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 shadow-md hover:shadow-lg transition-all"
            >
              💾 Save & Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
