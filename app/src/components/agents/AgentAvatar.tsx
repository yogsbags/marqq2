import { cn } from '@/lib/utils'

type Props = {
  name: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const avatarMap: Record<
  string,
  {
    shell: string
    skin: string
    hair: string
    shirt: string
    accent: string
  }
> = {
  veena: { shell: 'from-teal-100 to-cyan-200 dark:from-teal-950 dark:to-cyan-900', skin: '#F0C9A8', hair: '#1A3A3A', shirt: '#0D9488', accent: '#5EEAD4' },
  isha: { shell: 'from-amber-100 to-yellow-200 dark:from-amber-950 dark:to-yellow-900', skin: '#EFC09A', hair: '#3B2000', shirt: '#D97706', accent: '#FCD34D' },
  neel: { shell: 'from-blue-100 to-indigo-200 dark:from-blue-950 dark:to-indigo-900', skin: '#D8A27D', hair: '#1A2456', shirt: '#2563EB', accent: '#93C5FD' },
  tara: { shell: 'from-violet-100 to-purple-200 dark:from-violet-950 dark:to-purple-900', skin: '#F3C9AF', hair: '#3B1A5B', shirt: '#7C3AED', accent: '#C4B5FD' },
  sam: { shell: 'from-lime-100 to-green-200 dark:from-lime-950 dark:to-green-900', skin: '#EAC49A', hair: '#2D3A1A', shirt: '#65A30D', accent: '#BEF264' },
  kiran: { shell: 'from-pink-100 to-rose-200 dark:from-pink-950 dark:to-rose-900', skin: '#F6C7A5', hair: '#4A1A2C', shirt: '#DB2777', accent: '#F9A8D4' },
  zara: { shell: 'from-indigo-100 to-violet-200 dark:from-indigo-950 dark:to-violet-900', skin: '#F6C7A5', hair: '#3B2C67', shirt: '#5B5CE2', accent: '#B6A5FF' },
  maya: { shell: 'from-sky-100 to-cyan-200 dark:from-sky-950 dark:to-cyan-900', skin: '#EFC09A', hair: '#243B7A', shirt: '#0EA5E9', accent: '#8BE3FF' },
  riya: { shell: 'from-fuchsia-100 to-purple-200 dark:from-fuchsia-950 dark:to-purple-900', skin: '#F3C9AF', hair: '#5B2167', shirt: '#A855F7', accent: '#F0ABFC' },
  arjun: { shell: 'from-emerald-100 to-green-200 dark:from-emerald-950 dark:to-green-900', skin: '#D9A77E', hair: '#243B2F', shirt: '#16A34A', accent: '#86EFAC' },
  dev: { shell: 'from-orange-100 to-amber-200 dark:from-orange-950 dark:to-amber-900', skin: '#D8A27D', hair: '#4B2E1F', shirt: '#F97316', accent: '#FDBA74' },
  priya: { shell: 'from-rose-100 to-pink-200 dark:from-rose-950 dark:to-pink-900', skin: '#EFB89A', hair: '#4A2238', shirt: '#E11D48', accent: '#FDA4AF' },
}

export function AgentAvatar({ name, size = 'md', className }: Props) {
  const avatar = avatarMap[name.toLowerCase()] || avatarMap.zara
  const sizeClass = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-14 w-14' : 'h-10 w-10'

  return (
    <div className={cn('rounded-2xl bg-gradient-to-br p-0.5 shadow-sm', avatar.shell, sizeClass, className)}>
      <div className="flex h-full w-full items-center justify-center rounded-[calc(1rem-2px)] bg-white/75 dark:bg-slate-950/70">
        <svg viewBox="0 0 64 64" className="h-[86%] w-[86%]" aria-hidden="true">
          <circle cx="32" cy="32" r="30" fill={avatar.accent} opacity="0.16" />
          <path d="M16 56c2-10 10-16 16-16s14 6 16 16" fill={avatar.shirt} />
          <circle cx="32" cy="28" r="12" fill={avatar.skin} />
          <path d="M20 28c0-9 5-16 12-16s12 7 12 16c-3-3-7-5-12-5s-9 2-12 5Z" fill={avatar.hair} />
          <circle cx="27" cy="29" r="1.5" fill="#1F2937" />
          <circle cx="37" cy="29" r="1.5" fill="#1F2937" />
          <path d="M28 35c2.5 2 5.5 2 8 0" stroke="#7C4A2D" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        </svg>
      </div>
    </div>
  )
}
