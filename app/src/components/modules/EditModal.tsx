'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Sparkles, Pencil, FileText, BarChart3, AlertTriangle, CheckCircle2 } from 'lucide-react'

type EditModalProps = {
  isOpen: boolean
  onClose: () => void
  data: Record<string, any>
  stageId: number
  stageName: string
  onSubmit: (editedData: Record<string, any>) => Promise<void>
  isContentStage?: boolean
}

export function EditModal({
  isOpen,
  onClose,
  data,
  stageId,
  stageName,
  onSubmit,
  isContentStage = false
}: EditModalProps) {
  const [editedData, setEditedData] = useState<Record<string, any>>({})
  const [hasChanges, setHasChanges] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen && data) {
      setEditedData({ ...data })
      setHasChanges(false)
    }
  }, [isOpen, data])

  useEffect(() => {
    const changed = Object.keys(editedData).some(
      key => JSON.stringify(editedData[key]) !== JSON.stringify(data[key])
    )
    setHasChanges(changed)
  }, [editedData, data])

  const handleFieldChange = (field: string, value: any) => {
    setEditedData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async () => {
    if (!hasChanges) return

    setIsSubmitting(true)
    try {
      await onSubmit(editedData)
      onClose()
    } catch (error) {
      console.error('Submit error:', error)
      alert('Failed to submit changes: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderFieldEditor = (field: string, value: any) => {
    const isContentField = isContentStage && (
      field === 'content' ||
      field === 'article_body' ||
      field === 'full_content' ||
      field === 'markdown_content' ||
      field === 'article_content'
    )

    const isLongTextField = typeof value === 'string' && (
      value.length > 200 ||
      field.toLowerCase().includes('description') ||
      field.toLowerCase().includes('summary') ||
      field.toLowerCase().includes('excerpt')
    )

    if (isContentField) {
      return (
        <div className="space-y-2">
          <Label className="text-sm font-semibold flex items-center gap-1">
            {field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            <span className="ml-2 text-xs text-purple-600 flex items-center gap-0.5"><Sparkles className="h-3 w-3" /> Content Editor</span>
          </Label>
          <Textarea
            value={editedData[field] || ''}
            onChange={(e) => handleFieldChange(field, e.target.value)}
            rows={20}
            className="font-mono text-sm"
            placeholder={`Enter ${field.replace(/_/g, ' ')}...`}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Character count: {(editedData[field] || '').length.toLocaleString()}</span>
            <span>Words: {(editedData[field] || '').split(/\s+/).filter(Boolean).length.toLocaleString()}</span>
          </div>
        </div>
      )
    }

    if (isLongTextField) {
      return (
        <div className="space-y-2">
          <Label className="text-sm font-semibold">
            {field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </Label>
          <Textarea
            value={editedData[field] || ''}
            onChange={(e) => handleFieldChange(field, e.target.value)}
            rows={6}
            placeholder={`Enter ${field.replace(/_/g, ' ')}...`}
          />
          <span className="text-xs text-muted-foreground">
            {(editedData[field] || '').length} characters
          </span>
        </div>
      )
    }

    if (typeof value === 'number') {
      return (
        <div className="space-y-2">
          <Label className="text-sm font-semibold">
            {field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </Label>
          <Input
            type="number"
            value={editedData[field] || ''}
            onChange={(e) => handleFieldChange(field, parseFloat(e.target.value) || 0)}
          />
        </div>
      )
    }

    if (typeof value === 'boolean' || value === 'true' || value === 'false' || value === 'Yes' || value === 'No') {
      return (
        <div className="space-y-2">
          <Label className="text-sm font-semibold">
            {field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </Label>
          <select
            value={String(editedData[field])}
            onChange={(e) => handleFieldChange(field, e.target.value)}
            className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-gray-900 bg-white"
          >
            <option value="true">Yes / True</option>
            <option value="false">No / False</option>
          </select>
        </div>
      )
    }

    return (
      <div className="space-y-2">
        <Label className="text-sm font-semibold">
          {field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
        </Label>
        <Input
          type="text"
          value={editedData[field] || ''}
          onChange={(e) => handleFieldChange(field, e.target.value)}
          placeholder={`Enter ${field.replace(/_/g, ' ')}...`}
        />
      </div>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" /> Edit {stageName} Data
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1">
            {isContentStage
              ? <><FileText className="h-4 w-4" /> Content Editor Mode</>
              : <><BarChart3 className="h-4 w-4" /> Field Editor Mode</>
            }
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {Object.entries(data).map(([field, value]) => (
            <div key={field}>
              {renderFieldEditor(field, value)}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between pt-4 border-t">
          <div>
            {hasChanges ? (
              <span className="text-sm text-amber-600 font-semibold flex items-center gap-1">
                <AlertTriangle className="h-4 w-4 shrink-0" /> Unsaved changes detected
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">No changes</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!hasChanges || isSubmitting}
              className="bg-green-500 hover:bg-green-600"
            >
              {isSubmitting ? 'Submitting...' : <span className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Submit Changes</span>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

