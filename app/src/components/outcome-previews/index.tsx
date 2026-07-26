/**
 * Outcome previews — render drafts as the finished artifact
 * (email client, IG/LI/FB post, WhatsApp DM, CRM list, inline browser).
 */
import { useMemo, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  Heart, MessageCircle, Send, Bookmark, MoreHorizontal,
  ThumbsUp, Repeat2, Share2, Lock, ArrowLeft, Phone, Video,
  Search, Paperclip, Smile, CheckCheck, Globe, RefreshCw,
} from 'lucide-react'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initials(name?: string | null) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
}

function platformKey(platform?: string | null) {
  const p = String(platform || '').toLowerCase()
  if (p.includes('linkedin') || p === 'li') return 'linkedin'
  if (p.includes('instagram') || p === 'ig' || p === 'insta') return 'instagram'
  if (p.includes('facebook') || p === 'fb') return 'facebook'
  if (p.includes('twitter') || p === 'x') return 'x'
  return 'linkedin'
}

// ─── Email client (Gmail-style) ──────────────────────────────────────────────

export type EmailClientPreviewProps = {
  from?: string
  to?: string
  subject?: string
  body?: string
  previewText?: string
  cta?: string
  streaming?: boolean
  editable?: boolean
  onFromChange?: (v: string) => void
  onToChange?: (v: string) => void
  onSubjectChange?: (v: string) => void
  onBodyChange?: (v: string) => void
  className?: string
  toolbar?: ReactNode
}

export function EmailClientPreview({
  from = '',
  to = '',
  subject = '',
  body = '',
  previewText,
  cta,
  streaming,
  editable,
  onFromChange,
  onToChange,
  onSubjectChange,
  onBodyChange,
  className,
  toolbar,
}: EmailClientPreviewProps) {
  const field = (
    label: string,
    value: string,
    onChange?: (v: string) => void,
    placeholder?: string,
  ) => (
    <div className="flex items-center gap-3 border-b border-zinc-200/80 dark:border-zinc-700/60 px-4 py-2 min-h-[40px]">
      <span className="w-14 shrink-0 text-[11px] font-medium text-zinc-500">{label}</span>
      {editable && onChange ? (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={streaming}
          className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-zinc-100 outline-none placeholder:text-zinc-400"
        />
      ) : (
        <span className={cn('flex-1 text-sm truncate', value ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400')}>
          {value || placeholder || '—'}
        </span>
      )}
    </div>
  )

  return (
    <div className={cn(
      'overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 shadow-[0_8px_30px_rgba(0,0,0,0.08)]',
      className,
    )}>
      <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80 px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
        </div>
        <span className="ml-2 text-[11px] font-medium text-zinc-500">New Message</span>
        {streaming && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-medium text-orange-600">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
            Writing…
          </span>
        )}
        {toolbar && <div className="ml-auto flex items-center gap-1.5">{toolbar}</div>}
      </div>

      {field('From', from, onFromChange, 'you@company.com')}
      {field('To', to, onToChange, 'prospect@company.com')}
      {field('Subject', subject, onSubjectChange, 'Subject line')}
      {previewText ? (
        <div className="border-b border-zinc-200/80 dark:border-zinc-700/60 px-4 py-1.5 text-[11px] text-zinc-400 italic">
          Preview: {previewText}
        </div>
      ) : null}

      <div className="min-h-[180px] px-4 py-4">
        {editable && onBodyChange ? (
          <textarea
            value={body}
            onChange={(e) => onBodyChange(e.target.value)}
            disabled={streaming}
            placeholder="Email body…"
            className="w-full min-h-[180px] resize-y bg-transparent text-[15px] leading-7 text-zinc-900 dark:text-zinc-100 outline-none placeholder:text-zinc-400"
          />
        ) : (
          <p className="whitespace-pre-wrap text-[15px] leading-7 text-zinc-900 dark:text-zinc-100">
            {body || (streaming ? '' : '—')}
            {streaming && <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-orange-500 align-middle" />}
          </p>
        )}
        {cta ? (
          <div className="mt-4 inline-flex rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
            {cta}
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ─── Newsletter inside email chrome ──────────────────────────────────────────

export function NewsletterEmailPreview({
  subject,
  from,
  html,
  className,
  toolbar,
}: {
  subject?: string
  from?: string
  html: string
  className?: string
  toolbar?: ReactNode
}) {
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-[#f6f8fc] dark:bg-zinc-950 shadow-sm', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{subject || 'Newsletter'}</p>
          <p className="truncate text-[11px] text-zinc-500">{from || 'newsletter@yourbrand.com'}</p>
        </div>
        {toolbar}
      </div>
      <div className="mx-auto max-w-[640px] p-3 sm:p-5">
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <iframe
            srcDoc={html}
            title="Newsletter preview"
            sandbox="allow-same-origin"
            className="w-full border-0 bg-white"
            style={{ height: 520 }}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Social posts (LinkedIn / Instagram / Facebook) ──────────────────────────

export type SocialPostPreviewProps = {
  platform?: string
  authorName?: string
  authorHandle?: string
  post?: string
  hook?: string
  hashtags?: string[]
  cta?: string
  imageUrl?: string
  className?: string
  toolbar?: ReactNode
}

export function SocialPostPreview({
  platform,
  authorName = 'Your Brand',
  authorHandle,
  post = '',
  hook,
  hashtags = [],
  cta,
  imageUrl,
  className,
  toolbar,
}: SocialPostPreviewProps) {
  const key = platformKey(platform)
  const text = [hook, post].filter(Boolean).join('\n\n')
  const tags = hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`))

  if (key === 'instagram') {
    return (
      <div className={cn('mx-auto w-full max-w-[420px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950', className)}>
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] p-[2px]">
            <div className="flex h-full w-full items-center justify-center rounded-full bg-white text-[10px] font-bold text-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
              {initials(authorName)}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{authorHandle || authorName.toLowerCase().replace(/\s+/g, '')}</p>
          </div>
          {toolbar || <MoreHorizontal className="h-4 w-4 text-zinc-500" />}
        </div>
        <div className="aspect-square bg-zinc-100 dark:bg-zinc-900">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center px-8 text-center text-sm leading-6 text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap">
              {text || 'Post caption will appear here'}
            </div>
          )}
        </div>
        <div className="flex items-center gap-4 px-3 py-2.5 text-zinc-900 dark:text-zinc-100">
          <Heart className="h-6 w-6" />
          <MessageCircle className="h-6 w-6" />
          <Send className="h-6 w-6" />
          <Bookmark className="ml-auto h-6 w-6" />
        </div>
        <div className="space-y-1 px-3 pb-4">
          <p className="text-sm text-zinc-900 dark:text-zinc-100">
            <span className="font-semibold">{authorHandle || authorName.toLowerCase().replace(/\s+/g, '')}</span>{' '}
            <span className="whitespace-pre-wrap">{text}</span>
          </p>
          {tags.length > 0 && (
            <p className="text-sm text-[#00376b] dark:text-sky-400">{tags.join(' ')}</p>
          )}
          {cta && <p className="pt-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">{cta}</p>}
        </div>
      </div>
    )
  }

  if (key === 'facebook') {
    return (
      <div className={cn('mx-auto w-full max-w-[520px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950', className)}>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1877F2] text-sm font-bold text-white">
            {initials(authorName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{authorName}</p>
            <p className="text-[11px] text-zinc-500">Just now · Public</p>
          </div>
          {toolbar || <MoreHorizontal className="h-4 w-4 text-zinc-500" />}
        </div>
        <div className="px-4 pb-3 text-[15px] leading-6 text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap">
          {text}
          {tags.length > 0 && <span className="text-[#1877F2]"> {tags.join(' ')}</span>}
        </div>
        {imageUrl && <img src={imageUrl} alt="" className="w-full max-h-80 object-cover" />}
        {cta && (
          <div className="border-t border-zinc-100 px-4 py-2 text-sm font-medium text-[#1877F2] dark:border-zinc-800">
            {cta}
          </div>
        )}
        <div className="grid grid-cols-3 border-t border-zinc-100 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          {['Like', 'Comment', 'Share'].map((label) => (
            <button key={label} type="button" className="py-2.5 text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900">
              {label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (key === 'x') {
    return (
      <div className={cn('mx-auto w-full max-w-[480px] overflow-hidden rounded-2xl border border-zinc-200 bg-black text-zinc-100 shadow-sm dark:border-zinc-700', className)}>
        <div className="flex items-start gap-3 px-4 pt-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-bold">
            {initials(authorName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-bold">{authorName}</p>
              <span className="text-xs text-zinc-500">@{authorHandle || authorName.toLowerCase().replace(/\s+/g, '')}</span>
              <span className="text-xs text-zinc-600">· just now</span>
              {toolbar || <MoreHorizontal className="ml-auto h-4 w-4 text-zinc-500" />}
            </div>
            <div className="mt-1 text-[15px] leading-5 whitespace-pre-wrap">
              {text}
              {tags.length > 0 && <span className="text-sky-400"> {tags.join(' ')}</span>}
            </div>
            {cta && <p className="mt-1 text-sm font-semibold text-sky-400">{cta}</p>}
            {imageUrl && (
              <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-800 aspect-video bg-zinc-900">
                <img src={imageUrl} alt="" className="h-full w-full object-cover" />
              </div>
            )}
            <div className="mt-2 mb-2 flex items-center justify-between text-zinc-500 pr-6">
              <MessageCircle className="h-4 w-4" />
              <Repeat2 className="h-4 w-4" />
              <Heart className="h-4 w-4" />
              <Share2 className="h-4 w-4" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // LinkedIn (default)
  return (
    <div className={cn('mx-auto w-full max-w-[560px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950', className)}>
      <div className="flex items-start gap-3 px-4 pt-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0A66C2] text-sm font-bold text-white">
          {initials(authorName)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{authorName}</p>
          <p className="text-[12px] text-zinc-500">{authorHandle || 'Marketing · Your company'}</p>
          <p className="text-[11px] text-zinc-400">Just now · <Globe className="inline h-3 w-3" /></p>
        </div>
        {toolbar || <MoreHorizontal className="h-4 w-4 text-zinc-500" />}
      </div>
      <div className="px-4 py-3 text-[14px] leading-6 text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap">
        {text}
        {tags.length > 0 && (
          <p className="mt-2 text-[#0A66C2]">{tags.join(' ')}</p>
        )}
        {cta && <p className="mt-2 font-semibold text-zinc-900 dark:text-zinc-100">{cta}</p>}
      </div>
      {imageUrl && (
        <img src={imageUrl} alt="" className="w-full max-h-72 object-cover border-y border-zinc-100 dark:border-zinc-800" />
      )}
      <div className="flex items-center justify-between px-2 py-1 text-zinc-600 dark:text-zinc-400">
        {[
          { icon: ThumbsUp, label: 'Like' },
          { icon: MessageCircle, label: 'Comment' },
          { icon: Repeat2, label: 'Repost' },
          { icon: Share2, label: 'Send' },
        ].map(({ icon: Icon, label }) => (
          <button key={label} type="button" className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900">
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── WhatsApp DM ─────────────────────────────────────────────────────────────

export function WhatsAppDmPreview({
  contactName,
  message,
  streaming,
  editable,
  onMessageChange,
  className,
  toolbar,
}: {
  contactName?: string
  message?: string
  streaming?: boolean
  editable?: boolean
  onMessageChange?: (v: string) => void
  className?: string
  toolbar?: ReactNode
}) {
  return (
    <div className={cn('mx-auto flex w-full max-w-[380px] flex-col overflow-hidden rounded-[28px] border border-zinc-700 bg-[#0b141a] shadow-xl', className)} style={{ minHeight: 420 }}>
      <div className="flex items-center gap-3 bg-[#1f2c34] px-3 py-2.5 text-white">
        <ArrowLeft className="h-5 w-5 text-zinc-300" />
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#00a884] text-xs font-bold">
          {initials(contactName)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{contactName || 'Prospect'}</p>
          <p className="text-[11px] text-zinc-400">{streaming ? 'typing…' : 'online'}</p>
        </div>
        {toolbar || (
          <div className="flex items-center gap-3 text-zinc-300">
            <Video className="h-5 w-5" />
            <Phone className="h-5 w-5" />
          </div>
        )}
      </div>

      <div
        className="relative flex-1 space-y-2 overflow-y-auto px-3 py-4"
        style={{
          backgroundColor: '#0b141a',
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '18px 18px',
        }}
      >
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-[#005c4b] px-3 py-2 text-[14px] leading-5 text-[#e9edef] shadow-sm">
          {editable && onMessageChange ? (
            <textarea
              value={message || ''}
              onChange={(e) => onMessageChange(e.target.value)}
              disabled={streaming}
              className="w-full min-h-[72px] resize-none bg-transparent outline-none placeholder:text-emerald-100/40"
              placeholder="Type WhatsApp message…"
            />
          ) : (
            <p className="whitespace-pre-wrap">{message || (streaming ? '' : '—')}</p>
          )}
          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-emerald-100/70">
            <span>{streaming ? '…' : 'now'}</span>
            {!streaming && <CheckCheck className="h-3.5 w-3.5 text-sky-300" />}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-[#1f2c34] px-2 py-2">
        <Smile className="h-5 w-5 text-zinc-400" />
        <div className="flex-1 rounded-full bg-[#2a3942] px-4 py-2 text-xs text-zinc-400">Message</div>
        <Paperclip className="h-5 w-5 text-zinc-400" />
      </div>
    </div>
  )
}

// ─── CRM list ────────────────────────────────────────────────────────────────

export type CrmLeadRow = {
  id?: string
  name?: string
  title?: string
  company?: string
  email?: string
  status?: string
  score?: number | string | null
  selected?: boolean
}

export function CrmListPreview({
  leads,
  title = 'Pipeline',
  onSelect,
  onRemove,
  selectedId,
  className,
  emptyLabel = 'No contacts yet',
  toolbar,
}: {
  leads: CrmLeadRow[]
  title?: string
  onSelect?: (id: string) => void
  onRemove?: (id: string) => void
  selectedId?: string | null
  className?: string
  emptyLabel?: string
  toolbar?: ReactNode
}) {
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950', className)}>
      <div className="flex items-center gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/70">
        <div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</p>
          <p className="text-[11px] text-zinc-500">{leads.length} contacts</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] text-zinc-500 sm:flex dark:border-zinc-700 dark:bg-zinc-950">
            <Search className="h-3.5 w-3.5" />
            Search contacts
          </div>
          {toolbar}
        </div>
      </div>
      {!leads.length ? (
        <p className="px-4 py-10 text-center text-sm text-zinc-500">{emptyLabel}</p>
      ) : (
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-zinc-50/95 text-[10px] uppercase tracking-[0.14em] text-zinc-500 backdrop-blur dark:bg-zinc-900/95">
              <tr>
                {['Contact', 'Company', 'Email', 'Status', ...(onRemove ? [''] : [])].map((h, i) => (
                  <th key={`${h || 'actions'}-${i}`} className="px-4 py-2.5 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((lead, i) => {
                const id = lead.id || String(i)
                const active = selectedId ? selectedId === id : Boolean(lead.selected)
                return (
                  <tr
                    key={id}
                    onClick={() => onSelect?.(id)}
                    className={cn(
                      'border-t border-zinc-100 dark:border-zinc-800/80',
                      onSelect && 'cursor-pointer',
                      active ? 'bg-sky-50 dark:bg-sky-950/30' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/50',
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-[10px] font-bold text-white">
                          {initials(lead.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-zinc-900 dark:text-zinc-100">{lead.name || '—'}</p>
                          <p className="truncate text-[11px] text-zinc-500">{lead.title || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{lead.company || '—'}</td>
                    <td className="px-4 py-3 text-zinc-500">{lead.email || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        {lead.status || 'New'}
                      </span>
                    </td>
                    {onRemove ? (
                      <td className="px-2 py-3 text-right">
                        <button
                          type="button"
                          className="rounded-md px-2 py-1 text-[11px] font-medium text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                          onClick={(e) => {
                            e.stopPropagation()
                            onRemove(id)
                          }}
                          aria-label={`Remove ${lead.name || 'contact'}`}
                        >
                          Remove
                        </button>
                      </td>
                    ) : null}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Inline browser (landing page / blog) ────────────────────────────────────

export function InlineBrowserPreview({
  urlLabel = 'yoursite.com',
  title,
  html,
  children,
  className,
  toolbar,
}: {
  urlLabel?: string
  title?: string
  html?: string
  children?: ReactNode
  className?: string
  toolbar?: ReactNode
}) {
  const articleHtml = useMemo(() => {
    if (html) return html
    if (!children) return ''
    return ''
  }, [html, children])

  return (
    <div className={cn('overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.1)] dark:border-zinc-700 dark:bg-zinc-950', className)}>
      <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-100 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
        </div>
        <div className="mx-2 flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-950">
          <Lock className="h-3 w-3 shrink-0 text-emerald-600" />
          <span className="truncate text-[11px] text-zinc-600 dark:text-zinc-300">
            https://{urlLabel.replace(/^https?:\/\//, '')}
            {title ? `/${String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}` : ''}
          </span>
          <RefreshCw className="ml-auto h-3 w-3 shrink-0 text-zinc-400" />
        </div>
        {toolbar}
      </div>
      {html || articleHtml ? (
        <iframe
          srcDoc={html || articleHtml}
          title={title || 'Page preview'}
          sandbox="allow-same-origin"
          className="w-full border-0 bg-white"
          style={{ height: 560 }}
        />
      ) : (
        <div className="max-h-[560px] overflow-y-auto bg-white dark:bg-zinc-950">
          {children}
        </div>
      )}
    </div>
  )
}

export function BlogArticleBrowserPreview({
  title,
  metaDescription,
  sections = [],
  html,
  urlLabel,
  className,
  toolbar,
}: {
  title?: string
  metaDescription?: string
  sections?: Array<{ heading?: string; content?: string }>
  html?: string
  urlLabel?: string
  className?: string
  toolbar?: ReactNode
}) {
  return (
    <InlineBrowserPreview urlLabel={urlLabel || 'blog.yoursite.com'} title={title} html={html} className={className} toolbar={toolbar}>
      {!html && (
        <article className="mx-auto max-w-2xl px-6 py-10">
          {title && (
            <h1 className="font-serif text-3xl font-bold leading-tight tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
              {title}
            </h1>
          )}
          {metaDescription && (
            <p className="mt-4 text-base leading-7 text-zinc-600 dark:text-zinc-400">{metaDescription}</p>
          )}
          <div className="mt-8 space-y-8">
            {sections.map((section, i) => (
              <section key={i}>
                {section.heading && (
                  <h2 className="mb-3 text-xl font-semibold text-zinc-900 dark:text-zinc-100">{section.heading}</h2>
                )}
                {section.content && (
                  <p className="whitespace-pre-wrap text-[15px] leading-7 text-zinc-700 dark:text-zinc-300">
                    {section.content}
                  </p>
                )}
              </section>
            ))}
          </div>
        </article>
      )}
    </InlineBrowserPreview>
  )
}

export function LandingPageBrowserPreview({
  title,
  sections = [],
  html,
  urlLabel,
  className,
  toolbar,
}: {
  title?: string
  sections?: Array<{ label?: string; heading?: string; content?: string; cta?: string }>
  html?: string
  urlLabel?: string
  className?: string
  toolbar?: ReactNode
}) {
  return (
    <InlineBrowserPreview urlLabel={urlLabel || 'yoursite.com'} title={title || 'landing'} html={html} className={className} toolbar={toolbar}>
      {!html && (
        <div className="bg-gradient-to-b from-zinc-50 to-white dark:from-zinc-900 dark:to-zinc-950">
          <header className="flex items-center justify-between border-b border-zinc-200/70 px-6 py-4 dark:border-zinc-800">
            <span className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100">{title || 'Your Brand'}</span>
            <span className="rounded-full bg-zinc-900 px-3 py-1.5 text-[11px] font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
              Get started
            </span>
          </header>
          <div className="mx-auto max-w-3xl px-6 py-14 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
              {sections[0]?.heading || title || 'Your landing page headline'}
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
              {sections[0]?.content || 'Hero supporting copy appears here as the page would publish.'}
            </p>
            <div className="mt-8 inline-flex rounded-full bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white">
              {sections[0]?.cta || 'Primary CTA'}
            </div>
          </div>
          <div className="mx-auto grid max-w-4xl gap-6 px-6 pb-14 sm:grid-cols-2">
            {sections.slice(1).map((section, i) => (
              <div key={i} className="rounded-2xl border border-zinc-200 bg-white p-5 text-left dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-500">
                  {section.label || `Section ${i + 2}`}
                </p>
                {section.heading && (
                  <h3 className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{section.heading}</h3>
                )}
                {section.content && (
                  <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{section.content}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </InlineBrowserPreview>
  )
}

// ─── Meta Ads Manager–shaped draft ───────────────────────────────────────────

export type MetaAdsManagerPreviewProps = {
  campaignName?: string
  objective?: string
  dailyBudget?: string | number
  headline?: string
  primaryText?: string
  linkUrl?: string
  ctaType?: string
  imageUrl?: string
  status?: string
  className?: string
  toolbar?: ReactNode
}

export function MetaAdsManagerPreview({
  campaignName = 'Untitled campaign',
  objective = 'OUTCOME_TRAFFIC',
  dailyBudget,
  headline = '',
  primaryText = '',
  linkUrl = '',
  ctaType = 'LEARN_MORE',
  imageUrl,
  status = 'PAUSED',
  className,
  toolbar,
}: MetaAdsManagerPreviewProps) {
  const budgetLabel =
    dailyBudget == null || dailyBudget === ''
      ? '—'
      : `₹${Number(dailyBudget).toLocaleString('en-IN')}/day`

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.08)] dark:border-zinc-700 dark:bg-zinc-950',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-[#F0F2F5] px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/90">
        <span className="rounded bg-[#0866FF] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          Ads Manager
        </span>
        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate max-w-[240px]">
          {campaignName}
        </span>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            status === 'ACTIVE'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
              : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
          )}
        >
          {status || 'PAUSED'}
        </span>
        <span className="text-[11px] text-zinc-500">{objective.replace(/^OUTCOME_/, '')}</span>
        <span className="text-[11px] text-zinc-500">· {budgetLabel}</span>
        {toolbar ? <div className="ml-auto flex items-center gap-1.5">{toolbar}</div> : null}
      </div>

      <div className="grid gap-0 md:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-3 border-b border-zinc-100 p-4 dark:border-zinc-800 md:border-b-0 md:border-r">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Campaign structure</p>
          <div className="space-y-2 text-sm">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/60">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Campaign</p>
              <p className="font-medium text-zinc-900 dark:text-zinc-100">{campaignName}</p>
            </div>
            <div className="ml-3 rounded-lg border border-dashed border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-950">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Ad set</p>
              <p className="text-zinc-800 dark:text-zinc-200">{campaignName} — Ad Set</p>
              <p className="mt-1 text-xs text-zinc-500">Budget {budgetLabel} · Bid: lowest cost</p>
            </div>
            <div className="ml-6 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/40">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Ad</p>
              <p className="font-medium text-zinc-900 dark:text-zinc-100">{headline || 'Headline'}</p>
              <p className="mt-1 text-xs text-zinc-500">CTA: {ctaType}</p>
            </div>
          </div>
        </div>

        <div className="bg-zinc-50 p-4 dark:bg-zinc-900/40">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Feed preview</p>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950">
            <div className="flex items-center gap-2 px-3 py-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0866FF] text-[11px] font-bold text-white">
                Ad
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">Sponsored</p>
                <p className="text-[10px] text-zinc-500">Meta · Draft</p>
              </div>
            </div>
            {primaryText ? (
              <p className="px-3 pb-2 text-sm leading-5 text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
                {primaryText}
              </p>
            ) : null}
            {imageUrl ? (
              <img src={imageUrl} alt="" className="max-h-48 w-full object-cover bg-zinc-100" />
            ) : (
              <div className="flex h-28 items-center justify-center bg-zinc-100 text-xs text-zinc-400 dark:bg-zinc-800">
                Creative image (optional)
              </div>
            )}
            <div className="flex items-center justify-between gap-2 border-t border-zinc-100 px-3 py-2.5 dark:border-zinc-800">
              <div className="min-w-0">
                <p className="truncate text-[10px] uppercase tracking-wide text-zinc-500">
                  {linkUrl ? (() => { try { return new URL(linkUrl).hostname } catch { return linkUrl } })() : 'yoursite.com'}
                </p>
                <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {headline || 'Headline'}
                </p>
              </div>
              <span className="shrink-0 rounded-md bg-zinc-200 px-2.5 py-1 text-[11px] font-semibold text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100">
                {ctaType.replace(/_/g, ' ')}
              </span>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-4 text-zinc-500">
            Creates Campaign → Ad Set → Ad in <strong className="font-semibold text-zinc-700 dark:text-zinc-300">PAUSED</strong> state. Nothing spends until you enable it in Ads Manager.
          </p>
        </div>
      </div>
    </div>
  )
}

export { OutcomeGoLiveCta, outcomeKindFromPlatform, requestOutcomeGoLive } from './OutcomeGoLiveCta'
export type { OutcomeLiveKind, OutcomeGoLiveResult } from './OutcomeGoLiveCta'
