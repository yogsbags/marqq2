import { useEffect, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { toast } from 'sonner'
import {
  User, Building2, Mail, Phone, Globe, Linkedin,
  Twitter, Sparkles, Target, MessageSquare, Zap,
  ChevronRight, Crown, CheckCircle2, Save, Loader2,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type ProfileData = {
  name: string
  businessName: string
  email: string
  phone: string
  website: string
  linkedin: string
  twitter: string
  companyDescription: string
  targetCustomers: string
  brandVoice: string
  valueProposition: string
  seoKeywords: string
}

const EMPTY: ProfileData = {
  name: '',
  businessName: '',
  email: '',
  phone: '',
  website: '',
  linkedin: '',
  twitter: '',
  companyDescription: '',
  targetCustomers: '',
  brandVoice: '',
  valueProposition: '',
  seoKeywords: '',
}

// ─── Subscription banner ──────────────────────────────────────────────────────

function SubscriptionBanner() {
  return (
    <div className="rounded-xl border border-orange-300/40 dark:border-orange-700/40 bg-orange-50/60 dark:bg-orange-950/20 p-4 flex items-center gap-4">
      <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0">
        <Crown className="h-5 w-5 text-orange-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">Free Trial Plan</p>
        <p className="text-xs text-muted-foreground mt-0.5">Upgrade to unlock unlimited agents, tasks, and integrations.</p>
      </div>
      <button className="flex-shrink-0 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold px-4 py-2 transition-colors flex items-center gap-1.5">
        <Zap className="h-3.5 w-3.5" />
        Upgrade
      </button>
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/80 p-5 space-y-4">
      <div className="flex items-center gap-2 border-b border-border/40 pb-3">
        <span className="text-orange-500">{icon}</span>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  )
}

// ─── Field ────────────────────────────────────────────────────────────────────

function Field({
  label, value, onChange, placeholder, type = 'text', hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: 'text' | 'email' | 'tel' | 'url' | 'textarea'
  hint?: string
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {type === 'textarea' ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-orange-500/50 resize-none"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-orange-500/50"
        />
      )}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-foreground">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-5 w-9 rounded-full transition-colors',
          checked ? 'bg-orange-500' : 'bg-muted'
        )}
      >
        <span className={cn(
          'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5'
        )} />
      </button>
    </div>
  )
}

// ─── Root export ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'marqq_profile_data'

export function ProfilePage() {
  const { user } = useAuth()
  const { activeWorkspace } = useWorkspace()
  const [data, setData] = useState<ProfileData>({ ...EMPTY, email: user?.email || '' })
  const [emailNotifs, setEmailNotifs] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        setData(prev => ({ ...prev, ...parsed, email: user?.email || parsed.email || '' }))
      } else {
        setData(prev => ({ ...prev, email: user?.email || '' }))
      }
    } catch { /* ignore */ }
  }, [user])

  function set<K extends keyof ProfileData>(key: K) {
    return (v: string) => setData(prev => ({ ...prev, [key]: v }))
  }

  async function save() {
    setSaving(true)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      await new Promise(r => setTimeout(r, 400))
      setSaved(true)
      toast.success('Profile saved')
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScrollArea className="h-full">
      <div className="px-6 pb-10 pt-4 w-full space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">Profile</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {activeWorkspace?.name || 'Your workspace'} · {user?.email}
            </p>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className={cn(
              'flex items-center gap-1.5 rounded-lg text-white text-xs font-semibold px-3 py-1.5 transition-colors',
              saved ? 'bg-emerald-500' : 'bg-orange-500 hover:bg-orange-600',
              saving && 'opacity-60 cursor-not-allowed',
            )}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
             saved   ? <CheckCircle2 className="h-3.5 w-3.5" /> :
                       <Save className="h-3.5 w-3.5" />}
            {saved ? 'Saved' : 'Save changes'}
          </button>
        </div>

        {/* Subscription */}
        <SubscriptionBanner />

        {/* Preferences */}
        <Section icon={<Mail className="h-4 w-4" />} title="Preferences">
          <Toggle
            label="Email notifications for agent reports and completed tasks"
            checked={emailNotifs}
            onChange={setEmailNotifs}
          />
        </Section>

        {/* Two-column grid on large screens */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Personal info */}
          <Section icon={<User className="h-4 w-4" />} title="Personal information">
            <div className="space-y-3">
              <Field label="Name" value={data.name} onChange={set('name')} placeholder="Your full name" />
              <Field label="Email" value={data.email} onChange={set('email')} type="email" placeholder="you@company.com" />
              <Field label="Phone" value={data.phone} onChange={set('phone')} type="tel" placeholder="+91 98765 43210" />
            </div>
          </Section>

          {/* Social handles */}
          <Section icon={<Linkedin className="h-4 w-4" />} title="Social media">
            <div className="space-y-3">
              <Field
                label="LinkedIn"
                value={data.linkedin}
                onChange={set('linkedin')}
                placeholder="https://linkedin.com/company/your-company"
                type="url"
              />
              <Field
                label="X / Twitter"
                value={data.twitter}
                onChange={set('twitter')}
                placeholder="https://x.com/yourhandle"
                type="url"
              />
            </div>
          </Section>

          {/* Business info */}
          <Section icon={<Building2 className="h-4 w-4" />} title="Business information">
            <div className="space-y-3">
              <Field label="Business name" value={data.businessName} onChange={set('businessName')} placeholder="Acme Corp" />
              <Field
                label="Company description"
                value={data.companyDescription}
                onChange={set('companyDescription')}
                type="textarea"
                placeholder="Brief description of your company, products, and what makes you unique…"
                hint="Used by Veena to personalise content and research."
              />
              <Field
                label="Target customers"
                value={data.targetCustomers}
                onChange={set('targetCustomers')}
                type="textarea"
                placeholder="Who are your ideal customers? Include industry, role, company size…"
              />
            </div>
          </Section>

          {/* Brand */}
          <Section icon={<Sparkles className="h-4 w-4" />} title="Brand voice">
            <div className="space-y-3">
              <Field
                label="Brand voice"
                value={data.brandVoice}
                onChange={set('brandVoice')}
                type="textarea"
                placeholder="Describe your brand tone — e.g. professional but conversational, bold and confident, empathetic…"
                hint="Veena uses this when writing content on your behalf."
              />
              <Field
                label="Value proposition"
                value={data.valueProposition}
                onChange={set('valueProposition')}
                type="textarea"
                placeholder="What core value do you deliver? e.g. 'We help B2B SaaS teams 3× pipeline without extra headcount.'"
              />
            </div>
          </Section>

        </div>

        {/* SEO — full width */}
        <Section icon={<Globe className="h-4 w-4" />} title="SEO & website configuration">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              label="Website URL"
              value={data.website}
              onChange={set('website')}
              type="url"
              placeholder="https://yoursite.com"
            />
            <Field
              label="Primary SEO keywords"
              value={data.seoKeywords}
              onChange={set('seoKeywords')}
              type="textarea"
              placeholder="ai marketing automation, b2b lead scoring, marketing intelligence platform…"
              hint="Comma-separated. Used by the content automation and SEO agents."
            />
          </div>
        </Section>

        {/* Danger zone */}
        <div className="rounded-xl border border-red-300/40 dark:border-red-800/40 bg-red-50/40 dark:bg-red-950/20 p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Delete account</p>
            <p className="text-xs text-muted-foreground mt-0.5">Permanently remove your account and all associated data.</p>
          </div>
          <button className="text-xs font-medium text-red-600 dark:text-red-400 border border-red-300/60 dark:border-red-700/60 rounded-lg px-3 py-1.5 hover:bg-red-500/10 transition-colors flex items-center gap-1">
            Delete account
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>

      </div>
    </ScrollArea>
  )
}
