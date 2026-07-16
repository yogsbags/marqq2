export type AgentInputAttachmentKind = 'document' | 'image' | 'video' | 'data' | 'other'

export type AgentInputAttachment = {
  name: string
  type: string
  size: number
  kind: AgentInputAttachmentKind
  text?: string
  base64?: string
}

const TEXT_SNIPPET_LIMIT = 12_000

export const AGENT_ATTACHMENT_ACCEPT = [
  '.csv',
  '.pdf',
  '.txt',
  '.md',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.xls',
  '.xlsx',
  '.mp4',
  '.mov',
  '.webm',
  '.m4v',
].join(',')

export const AGENT_ATTACHMENT_TYPES = [
  'text/csv',
  'text/plain',
  'text/markdown',
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

function extensionOf(fileName: string) {
  return fileName.toLowerCase().split('.').pop() || ''
}

export function isSupportedAgentAttachment(file: File) {
  const ext = extensionOf(file.name)
  return (
    AGENT_ATTACHMENT_TYPES.includes(file.type) ||
    ['csv', 'pdf', 'txt', 'md', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'xls', 'xlsx', 'mp4', 'mov', 'webm', 'm4v'].includes(ext)
  )
}

function inferAttachmentKind(file: File): AgentInputAttachmentKind {
  const ext = extensionOf(file.name)
  if (file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image'
  if (file.type.startsWith('video/') || ['mp4', 'mov', 'webm', 'm4v'].includes(ext)) return 'video'
  if (file.type.includes('csv') || file.type.includes('excel') || file.type.includes('spreadsheet') || ['csv', 'xls', 'xlsx'].includes(ext)) return 'data'
  if (file.type.includes('pdf') || ['pdf', 'txt', 'md'].includes(ext)) return 'document'
  return 'other'
}

function shouldReadAsText(file: File) {
  const ext = extensionOf(file.name)
  return file.type.startsWith('text/') || ['csv', 'txt', 'md'].includes(ext)
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Unable to read file'))
    reader.readAsDataURL(file)
  })
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Unable to read file'))
    reader.readAsText(file)
  })
}

export async function createAgentInputAttachment(file: File): Promise<AgentInputAttachment> {
  const base = {
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    kind: inferAttachmentKind(file),
  }

  if (shouldReadAsText(file)) {
    const text = await readAsText(file)
    return {
      ...base,
      text: text.slice(0, TEXT_SNIPPET_LIMIT),
    }
  }

  const dataUrl = await readAsDataUrl(file)
  const base64 = dataUrl.includes(',') ? dataUrl.split(',').pop() || '' : dataUrl
  return {
    ...base,
    base64,
  }
}

export function formatAttachmentForPrompt(attachment: AgentInputAttachment) {
  const lines = [
    `Attachment: ${attachment.name}`,
    `Type: ${attachment.type}`,
    `Kind: ${attachment.kind}`,
    `Size: ${attachment.size} bytes`,
  ]
  if (attachment.text) {
    lines.push(`Readable excerpt:\n${attachment.text}`)
  } else if (attachment.base64) {
    lines.push('Binary payload attached for backend multimodal processing.')
  }
  return lines.join('\n')
}
