'use client'

import { useState, useRef } from 'react'

type FileType = 'pdf' | 'image' | 'video'

interface FileUploadProps {
  fileType: FileType
  label: string
  description?: string
  accept: string
  multiple?: boolean
  maxFiles?: number
  maxSizeMB?: number
  onFilesChange: (files: File[]) => void
  disabled?: boolean
  icon?: string
}

export default function FileUpload({
  fileType,
  label,
  description,
  accept,
  multiple = false,
  maxFiles = 10,
  maxSizeMB = 50,
  onFilesChange,
  disabled = false,
  icon = '📁'
}: FileUploadProps) {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string>('')
  const inputRef = useRef<HTMLInputElement>(null)

  const validateFile = (file: File): string | null => {
    // Check file size
    const fileSizeMB = file.size / (1024 * 1024)
    if (fileSizeMB > maxSizeMB) {
      return `File "${file.name}" is too large. Max size: ${maxSizeMB}MB`
    }

    // Check file type
    const acceptedTypes = accept.split(',').map(t => t.trim())
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase()
    const mimeType = file.type

    const isAccepted = acceptedTypes.some(type => {
      if (type.startsWith('.')) {
        return fileExtension === type.toLowerCase()
      }
      if (type.includes('*')) {
        const [main] = type.split('/')
        return mimeType.startsWith(main)
      }
      return mimeType === type
    })

    if (!isAccepted) {
      return `File "${file.name}" is not an accepted file type`
    }

    return null
  }

  const generatePreview = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      if (fileType === 'image') {
        const reader = new FileReader()
        reader.onload = (e) => resolve(e.target?.result as string)
        reader.readAsDataURL(file)
      } else if (fileType === 'video') {
        const url = URL.createObjectURL(file)
        resolve(url)
      } else {
        resolve('') // No preview for PDFs
      }
    })
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files) return

    setError('')
    const fileArray = Array.from(files)

    // Validate total file count
    const totalFiles = uploadedFiles.length + fileArray.length
    if (totalFiles > maxFiles) {
      setError(`Maximum ${maxFiles} file${maxFiles > 1 ? 's' : ''} allowed`)
      return
    }

    // Validate each file
    const validFiles: File[] = []
    for (const file of fileArray) {
      const validationError = validateFile(file)
      if (validationError) {
        setError(validationError)
        return
      }
      validFiles.push(file)
    }

    // Generate previews
    const newPreviews: string[] = []
    for (const file of validFiles) {
      const preview = await generatePreview(file)
      newPreviews.push(preview)
    }

    const updatedFiles = [...uploadedFiles, ...validFiles]
    const updatedPreviews = [...previews, ...newPreviews]

    setUploadedFiles(updatedFiles)
    setPreviews(updatedPreviews)
    onFilesChange(updatedFiles)
  }

  const removeFile = (index: number) => {
    const updatedFiles = uploadedFiles.filter((_, i) => i !== index)
    const updatedPreviews = previews.filter((_, i) => i !== index)

    // Revoke video URLs to prevent memory leaks
    if (fileType === 'video' && previews[index]) {
      URL.revokeObjectURL(previews[index])
    }

    setUploadedFiles(updatedFiles)
    setPreviews(updatedPreviews)
    onFilesChange(updatedFiles)
    setError('')
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (!disabled && e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files)
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  return (
    <div className="mb-6">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {icon} {label}
      </label>
      {description && (
        <p className="text-xs text-gray-500 mb-3">{description}</p>
      )}

      {/* Upload Area */}
      <div
        className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-all ${
          dragActive
            ? 'border-blue-500 bg-blue-50'
            : uploadedFiles.length > 0
            ? 'border-green-300 bg-green-50'
            : 'border-gray-300 bg-gray-50'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-gray-400'}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleChange}
          disabled={disabled}
          className="hidden"
        />

        <div className="space-y-2">
          <div className="text-4xl">{icon}</div>
          <p className="text-sm text-gray-600">
            <span className="font-semibold text-blue-600">Click to upload</span> or drag and drop
          </p>
          <p className="text-xs text-gray-500">
            {accept} • Max {maxSizeMB}MB per file
            {multiple && ` • Up to ${maxFiles} files`}
          </p>
          {uploadedFiles.length > 0 && (
            <p className="text-sm font-semibold text-green-600">
              ✓ {uploadedFiles.length} file{uploadedFiles.length > 1 ? 's' : ''} uploaded
            </p>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">❌ {error}</p>
        </div>
      )}

      {/* Uploaded Files List */}
      {uploadedFiles.length > 0 && (
        <div className="mt-4 space-y-3">
          {uploadedFiles.map((file, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-3 bg-white border-2 border-gray-200 rounded-lg hover:border-gray-300 transition-all"
            >
              {/* Preview */}
              <div className="flex-shrink-0">
                {fileType === 'image' && previews[index] && (
                  <img
                    src={previews[index]}
                    alt={file.name}
                    className="w-16 h-16 object-cover rounded"
                  />
                )}
                {fileType === 'video' && previews[index] && (
                  <video
                    src={previews[index]}
                    className="w-16 h-16 object-cover rounded"
                    muted
                  />
                )}
                {fileType === 'pdf' && (
                  <div className="w-16 h-16 bg-red-100 rounded flex items-center justify-center">
                    <span className="text-2xl">📄</span>
                  </div>
                )}
              </div>

              {/* File Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {file.name}
                </p>
                <p className="text-xs text-gray-500">
                  {formatFileSize(file.size)}
                </p>
              </div>

              {/* Remove Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  removeFile(index)
                }}
                disabled={disabled}
                className="flex-shrink-0 p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
