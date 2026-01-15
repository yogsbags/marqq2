'use client'

import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type StageDataModalProps = {
  isOpen: boolean
  stageId: number
  stageName: string
  data: any
  onClose: () => void
  onSave: (stageId: number, editedData: any) => Promise<void>
}

export default function StageDataModal({
  isOpen,
  stageId,
  stageName,
  data,
  onClose,
  onSave
}: StageDataModalProps) {
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Email newsletter preview state (moved to top level to avoid hook errors)
  const [showPreview, setShowPreview] = useState(true)
  const [copied, setCopied] = useState(false)

  // Video preview state
  const [previewingVideoUrl, setPreviewingVideoUrl] = useState<string | null>(null)

  // Edit mode state for prompt fields
  const [isEditingOutput, setIsEditingOutput] = useState(false)
  const [isEditingCreativePrompt, setIsEditingCreativePrompt] = useState(false)
  const [isEditingStage2Output, setIsEditingStage2Output] = useState(false)

  useEffect(() => {
    if (isOpen && data) {
      // Initialize form data from the data object
      const flattenedData = flattenObject(data)
      setFormData(flattenedData)
      setSaveError(null)
      setSaveSuccess(false)
      setPreviewingVideoUrl(null) // Reset video preview when modal opens
      setIsEditingOutput(false) // Reset edit mode when modal opens
      setIsEditingCreativePrompt(false) // Reset edit mode when modal opens
      setIsEditingStage2Output(false) // Reset edit mode when modal opens
    }
  }, [isOpen, data])

  // Flatten nested objects for easier editing
  const flattenObject = (obj: any, prefix = ''): Record<string, any> => {
    const flattened: Record<string, any> = {}

    for (const key in obj) {
      const value = obj[key]
      const newKey = prefix ? `${prefix}.${key}` : key

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(flattened, flattenObject(value, newKey))
      } else if (Array.isArray(value)) {
        // Handle arrays - flatten array items that are objects
        if (value.length > 0 && typeof value[0] === 'object') {
          value.forEach((item, index) => {
            if (item && typeof item === 'object') {
              Object.assign(flattened, flattenObject(item, `${newKey}.${index}`))
            } else {
              flattened[`${newKey}.${index}`] = item
            }
          })
        } else {
          flattened[newKey] = JSON.stringify(value)
        }
      } else {
        flattened[newKey] = value
      }
    }

    return flattened
  }

  // Reconstruct nested object from flattened data
  const unflattenObject = (flattened: Record<string, any>): any => {
    const result: any = {}

    for (const key in flattened) {
      const keys = key.split('.')
      let current = result

      for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in current)) {
          current[keys[i]] = {}
        }
        current = current[keys[i]]
      }

      const lastKey = keys[keys.length - 1]
      let value = flattened[key]

      // Try to parse JSON arrays
      if (typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'))) {
        try {
          value = JSON.parse(value)
        } catch (e) {
          // Keep as string if parse fails
        }
      }

      current[lastKey] = value
    }

    return result
  }

  const handleFieldChange = (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }))
    setSaveSuccess(false)
  }

  const handleSave = async () => {
    try {
      setIsSaving(true)
      setSaveError(null)
      setSaveSuccess(false)

      const unflattenedData = unflattenObject(formData)
      await onSave(stageId, unflattenedData)

      setSaveSuccess(true)
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save data')
    } finally {
      setIsSaving(false)
    }
  }

  const getFieldLabel = (key: string): string => {
    // Convert key to readable label
    return key
      .split('.')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' > ')
  }

  const renderField = (key: string, value: any) => {
    const isLongText = typeof value === 'string' && value.length > 100

    const extractFirstUrl = (text: string, kind: 'image' | 'video'): string => {
      const trimmed = (text || '').trim()
      if (!trimmed) return ''
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed

      if (kind === 'image') {
        const match = trimmed.match(/(https?:\/\/[^\s]+(?:imgbb\.com|i\.ibb\.co)[^\s]*)/i)
        return match?.[1] || ''
      }

      const match = trimmed.match(/(https?:\/\/(?:res\.)?cloudinary\.com\/[^\s]+?\.(mp4|mov|webm)(?:\?[^\s]*)?)/i)
      return match?.[1] || ''
    }

    // Check if this is an image URL (from imgbb)
    // Handles: imgbb.com URLs, or fields like "images.0.hostedUrl", "hostedUrl" in image context
    const isImageUrl = typeof value === 'string' && value.trim() !== '' && (
      value.includes('imgbb.com') ||
      value.includes('i.ibb.co') ||
      (key.toLowerCase().includes('hostedurl') && (
        key.toLowerCase().includes('image') ||
        key.toLowerCase().includes('images')
      ))
    )

    // Check if this is a video URL (from cloudinary)
    // Handles: cloudinary.com URLs, or fields like "hostedUrl" in video context
    const isVideoUrl = typeof value === 'string' && value.trim() !== '' && (
      value.includes('cloudinary.com') ||
      value.includes('res.cloudinary.com') ||
      (key.toLowerCase().includes('hostedurl') && (
        key.toLowerCase().includes('video') ||
        value.includes('.mp4') ||
        value.includes('.mov') ||
        value.includes('.webm')
      ))
    )

    const safeImageUrl = isImageUrl && typeof value === 'string' ? extractFirstUrl(value, 'image') : ''
    const safeVideoUrl = isVideoUrl && typeof value === 'string' ? extractFirstUrl(value, 'video') : ''

    return (
      <div key={key} className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {getFieldLabel(key)}
        </label>
        {isImageUrl ? (
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={value || ''}
              onChange={(e) => handleFieldChange(key, e.target.value)}
              className="flex-1 px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm bg-white text-gray-900"
            />
            <a
              href={safeImageUrl || value}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold whitespace-nowrap flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              View Image
            </a>
          </div>
        ) : isVideoUrl ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={value || ''}
                onChange={(e) => handleFieldChange(key, e.target.value)}
                className="flex-1 px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm bg-white text-gray-900"
              />
              <button
                onClick={() => setPreviewingVideoUrl(safeVideoUrl || value)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-semibold whitespace-nowrap flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Preview Video
              </button>
              <a
                href={safeVideoUrl || value}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-semibold whitespace-nowrap flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                View Video
              </a>
            </div>
            {previewingVideoUrl === (safeVideoUrl || value) && (
              <div className="border-2 border-indigo-300 rounded-lg bg-gray-900 overflow-hidden">
                <div className="bg-indigo-100 px-3 py-2 flex items-center justify-between border-b-2 border-indigo-300">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-indigo-800">Video Preview</span>
                  </div>
                  <button
                    onClick={() => setPreviewingVideoUrl(null)}
                    className="text-indigo-600 hover:text-indigo-800 transition-colors"
                    title="Close preview"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="p-4 bg-black">
                  <video
                    src={safeVideoUrl || value}
                    controls
                    className="w-full max-h-[500px] rounded-lg"
                    style={{ aspectRatio: '16/9' }}
                  >
                    Your browser does not support the video tag.
                  </video>
                </div>
              </div>
            )}
          </div>
        ) : isLongText ? (
          <textarea
            value={value || ''}
            onChange={(e) => handleFieldChange(key, e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm resize-vertical bg-white text-gray-900"
          />
        ) : (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => handleFieldChange(key, e.target.value)}
            className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm bg-white text-gray-900"
          />
        )}
      </div>
    )
  }

  const renderCreativePrompt = () => {
    const promptValue = formData['creativePrompt'] || ''

    return (
      <div className="mb-6 p-4 bg-gradient-to-br from-purple-50 to-blue-50 border-2 border-purple-300 rounded-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎨</span>
            <div>
              <label className="block text-base font-bold text-purple-900">
                Creative Prompt
              </label>
              <p className="text-xs text-purple-700 mt-0.5">
                This prompt will be used to generate content in the next stages. Edit to refine the creative direction.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsEditingCreativePrompt(!isEditingCreativePrompt)}
            className="px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors bg-purple-600 text-white hover:bg-purple-700"
          >
            {isEditingCreativePrompt ? '👁️ View' : '✏️ Edit'}
          </button>
        </div>
        {isEditingCreativePrompt ? (
          <textarea
            value={promptValue}
            onChange={(e) => handleFieldChange('creativePrompt', e.target.value)}
            rows={12}
            placeholder="Creative prompt will be generated here..."
            className="w-full px-4 py-3 border-2 border-purple-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 focus:outline-none text-sm font-mono bg-white text-gray-900 shadow-inner resize-vertical"
          />
        ) : (
          <div className="w-full px-4 py-3 border-2 border-purple-300 rounded-lg bg-white shadow-inner overflow-y-auto prose prose-sm max-w-none" style={{ minHeight: '200px', maxHeight: '500px' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} className="text-gray-900">
              {promptValue}
            </ReactMarkdown>
          </div>
        )}
        <div className="mt-2 flex items-center gap-2 text-xs text-purple-600">
          <span>💡</span>
          <span>Tip: Be specific about visual style, tone, messaging, and platform requirements</span>
        </div>
      </div>
    )
  }

  // Special output section for Stage 2: Content Generation
  // Renders the generated content (hooks, captions, hashtags) as rich text
  const renderStage2Output = () => {
    if (stageId !== 2) return null

    const outputValue = formData['output'] || ''
    if (!outputValue) return null

    // Don't show for email newsletters (they have their own renderer)
    if (formData['contentType'] === 'email-newsletter') return null

    return (
      <div className="mb-6 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📝</span>
            <div>
              <label className="block text-base font-bold text-blue-900">
                Generated Content
              </label>
              <p className="text-xs text-blue-700 mt-0.5">
                AI-generated hooks, captions, hashtags, and CTAs for your campaign.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsEditingStage2Output(!isEditingStage2Output)}
            className="px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors bg-blue-600 text-white hover:bg-blue-700"
          >
            {isEditingStage2Output ? '👁️ View' : '✏️ Edit'}
          </button>
        </div>
        {isEditingStage2Output ? (
          <textarea
            value={outputValue}
            onChange={e => handleFieldChange('output', e.target.value)}
            rows={Math.max(20, Math.ceil((outputValue.length || 0) / 80))}
            className="w-full px-4 py-3 border-2 border-blue-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none text-sm font-mono bg-white text-gray-900 shadow-inner resize-vertical overflow-y-auto"
            style={{ minHeight: '400px', maxHeight: '800px' }}
          />
        ) : (
          <div className="w-full px-4 py-3 border-2 border-blue-300 rounded-lg bg-white shadow-inner overflow-y-auto prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-800 prose-strong:text-gray-900 prose-ul:text-gray-800 prose-ol:text-gray-800 prose-li:text-gray-800 prose-code:text-blue-700 prose-pre:bg-gray-50 prose-a:text-blue-600" style={{ minHeight: '400px', maxHeight: '800px' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} className="text-gray-900">
              {outputValue}
            </ReactMarkdown>
          </div>
        )}
      </div>
    )
  }

  // Special prompt section for Stage 1 when using social media workflow.
  // Many backends store the generated prompt in the "output" field, which is
  // then used as input to the next stage. We surface that first.
  const renderStage1OutputPrompt = () => {
    if (stageId !== 1) return null

    const outputValue = formData['output'] || ''
    if (!outputValue) return null

    return (
      <div className="mb-6 p-4 bg-gradient-to-br from-indigo-50 to-blue-50 border-2 border-indigo-300 rounded-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🧠</span>
            <div>
              <label className="block text-base font-bold text-indigo-900">
                Stage 1 Prompt (Input to Next Stage)
              </label>
              <p className="text-xs text-indigo-700 mt-0.5">
                This is the generated prompt/output that will be passed into the next stage.
                Edit it here to refine what the next stage uses.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsEditingOutput(!isEditingOutput)}
            className="px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors bg-indigo-600 text-white hover:bg-indigo-700"
          >
            {isEditingOutput ? '👁️ View' : '✏️ Edit'}
          </button>
        </div>
        {isEditingOutput ? (
          <textarea
            value={outputValue}
            onChange={e => handleFieldChange('output', e.target.value)}
            rows={Math.max(15, Math.ceil((outputValue.length || 0) / 80))}
            className="w-full px-4 py-3 border-2 border-indigo-300 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none text-sm font-mono bg-white text-gray-900 shadow-inner resize-vertical overflow-y-auto"
            style={{ minHeight: '300px', maxHeight: '600px' }}
          />
        ) : (
          <div className="w-full px-4 py-3 border-2 border-indigo-300 rounded-lg bg-white shadow-inner overflow-y-auto prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-800 prose-strong:text-gray-900 prose-ul:text-gray-800 prose-ol:text-gray-800 prose-li:text-gray-800 prose-code:text-indigo-700 prose-pre:bg-gray-50" style={{ minHeight: '300px', maxHeight: '600px' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} className="text-gray-900">
              {outputValue}
            </ReactMarkdown>
          </div>
        )}
      </div>
    )
  }

  const renderEmailNewsletter = () => {
    const subject = formData['subject'] || ''
    const preheader = formData['preheader'] || ''
    const html = formData['html'] || ''
    const plainText = formData['plainText'] || ''
    const subjectVariations = formData['subjectVariations'] || ''

    const copyToClipboard = () => {
      navigator.clipboard.writeText(html)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }

    const downloadHTML = () => {
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `email-newsletter-${Date.now()}.html`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }

    return (
      <div className="space-y-6">
        {/* Subject Line Section */}
        <div className="p-4 bg-gradient-to-br from-green-50 to-teal-50 border-2 border-green-300 rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">📧</span>
            <div>
              <label className="block text-base font-bold text-green-900">
                Email Subject Line
              </label>
              <p className="text-xs text-green-700 mt-0.5">
                Optimized for 40-60 characters for mobile preview
              </p>
            </div>
          </div>
          <input
            type="text"
            value={subject}
            onChange={(e) => handleFieldChange('subject', e.target.value)}
            className="w-full px-4 py-3 border-2 border-green-300 rounded-lg focus:border-green-500 focus:ring-2 focus:ring-green-200 focus:outline-none text-base font-semibold bg-white shadow-inner"
            placeholder="Email subject line..."
          />
          <div className="mt-2 text-xs text-green-700">
            Character count: {subject.length} {subject.length >= 40 && subject.length <= 60 ? '✅' : subject.length > 60 ? '⚠️ Too long' : '⚠️ Too short'}
          </div>
        </div>

        {/* Preheader Section */}
        <div className="p-4 bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-300 rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">👁️</span>
            <div>
              <label className="block text-base font-bold text-blue-900">
                Preheader Text
              </label>
              <p className="text-xs text-blue-700 mt-0.5">
                Appears after subject line in inbox (85-100 characters)
              </p>
            </div>
          </div>
          <textarea
            value={preheader}
            onChange={(e) => handleFieldChange('preheader', e.target.value)}
            rows={2}
            className="w-full px-4 py-3 border-2 border-blue-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none text-sm bg-white shadow-inner resize-vertical"
            placeholder="Preheader text..."
          />
          <div className="mt-2 text-xs text-blue-700">
            Character count: {preheader.length} {preheader.length >= 85 && preheader.length <= 100 ? '✅' : preheader.length > 100 ? '⚠️ Too long' : '⚠️ Too short'}
          </div>
        </div>

        {/* Subject Variations */}
        {subjectVariations && (
          <div className="p-4 bg-gray-50 border-2 border-gray-300 rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🔄</span>
              <label className="block text-sm font-bold text-gray-900">
                A/B Test Subject Variations
              </label>
            </div>
            <textarea
              value={typeof subjectVariations === 'string' ? subjectVariations : JSON.stringify(subjectVariations, null, 2)}
              onChange={(e) => handleFieldChange('subjectVariations', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm bg-white resize-vertical"
            />
          </div>
        )}

        {/* HTML Email Section */}
        <div className="p-4 bg-gradient-to-br from-orange-50 to-amber-50 border-2 border-orange-300 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📄</span>
              <div>
                <label className="block text-base font-bold text-orange-900">
                  HTML Email Newsletter
                </label>
                <p className="text-xs text-orange-700 mt-0.5">
                  Production-ready HTML with inline CSS
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="px-3 py-1 text-xs font-semibold bg-white border-2 border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50 transition-colors"
              >
                {showPreview ? '📝 Code' : '👁️ Preview'}
              </button>
              <button
                onClick={copyToClipboard}
                className="px-3 py-1 text-xs font-semibold bg-white border-2 border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50 transition-colors"
              >
                {copied ? '✅ Copied!' : '📋 Copy'}
              </button>
              <button
                onClick={downloadHTML}
                className="px-3 py-1 text-xs font-semibold bg-white border-2 border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50 transition-colors"
              >
                ⬇️ Download
              </button>
            </div>
          </div>

          {showPreview ? (
            <div className="border-2 border-orange-300 rounded-lg bg-white overflow-hidden">
              <div className="bg-orange-100 px-3 py-2 text-xs font-semibold text-orange-800 border-b-2 border-orange-300">
                Email Preview (rendered HTML)
              </div>
              <div className="p-4 max-h-[500px] overflow-auto">
                <iframe
                  srcDoc={html}
                  className="w-full min-h-[400px] border-0"
                  title="Email Preview"
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
          ) : (
            <textarea
              value={html}
              onChange={(e) => handleFieldChange('html', e.target.value)}
              rows={20}
              className="w-full px-4 py-3 border-2 border-orange-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200 focus:outline-none text-xs font-mono bg-white shadow-inner resize-vertical"
              placeholder="HTML email code..."
            />
          )}

          <div className="mt-2 flex items-center gap-2 text-xs text-orange-600">
            <span>💡</span>
            <span>Tip: The HTML uses inline CSS and table-based layout for maximum email client compatibility</span>
          </div>
        </div>

        {/* Plain Text Version */}
        {plainText && (
          <div className="p-4 bg-gray-50 border-2 border-gray-300 rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">📝</span>
              <div>
                <label className="block text-sm font-bold text-gray-900">
                  Plain Text Version
                </label>
                <p className="text-xs text-gray-600 mt-0.5">
                  For text-only email clients
                </p>
              </div>
            </div>
            <textarea
              value={plainText}
              onChange={(e) => handleFieldChange('plainText', e.target.value)}
              rows={8}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm font-mono bg-white resize-vertical"
            />
          </div>
        )}
      </div>
    )
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">{stageName}</h2>
            <p className="text-sm text-gray-600 mt-1">Edit stage output data</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {saveSuccess && (
            <div className="mb-4 p-3 bg-green-50 border-2 border-green-200 rounded-lg">
              <p className="text-sm text-green-700 font-semibold">✅ Data saved successfully!</p>
            </div>
          )}

          {saveError && (
            <div className="mb-4 p-3 bg-red-50 border-2 border-red-200 rounded-lg">
              <p className="text-sm text-red-700 font-semibold">❌ {saveError}</p>
            </div>
          )}

        {/* For Stage 1: Show prompt/output sections first */}
        {stageId === 1 && (
          <>
            {/* Prefer explicit creativePrompt field if present */}
            {formData['creativePrompt'] && renderCreativePrompt()}
            {/* Then show the generic output prompt (used as input to next stage) */}
            {renderStage1OutputPrompt()}
            <div className="my-6 border-t-2 border-gray-200"></div>
            <h3 className="text-sm font-semibold text-gray-600 mb-4 uppercase tracking-wide">Additional Details</h3>
          </>
        )}

        {/* For Stage 2: Show generated content output first, then email newsletter if applicable */}
        {stageId === 2 && (
          <>
            {/* Show generated content (hooks, captions, hashtags) first */}
            {renderStage2Output()}
            {/* Then show email newsletter if contentType is email */}
            {formData['contentType'] === 'email-newsletter' && formData['html'] && (
              <>
                {renderEmailNewsletter()}
              </>
            )}
            {(formData['output'] || (formData['contentType'] === 'email-newsletter' && formData['html'])) && (
              <div className="my-6 border-t-2 border-gray-200"></div>
            )}
            <h3 className="text-sm font-semibold text-gray-600 mb-4 uppercase tracking-wide">Additional Details</h3>
          </>
        )}

          <div className="space-y-4">
            {Object.entries(formData)
              .filter(([key]) => {
                // Don't render these fields twice in special sections
                if (stageId === 1) {
                  if (key === 'creativePrompt') return false
                  if (key === 'output') return false
                }
                if (stageId === 2) {
                  // Don't render output field twice (it's shown in renderStage2Output)
                  if (key === 'output') return false
                  // Don't render email fields twice if it's an email newsletter
                  if (formData['contentType'] === 'email-newsletter') {
                    return !['html', 'subject', 'preheader', 'plainText', 'subjectVariations', 'contentType'].includes(key)
                  }
                }
                return true
              })
              .map(([key, value]) => renderField(key, value))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`px-6 py-2 rounded-lg font-semibold transition-all ${
              isSaving
                ? 'bg-blue-400 text-white cursor-wait'
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg'
            }`}
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Saving...
              </span>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
