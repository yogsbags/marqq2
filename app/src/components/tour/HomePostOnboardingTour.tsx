import { SpotlightTour, type SpotlightTourStep } from '@/components/tour/SpotlightTour'

/**
 * Shown on the Home screen right after workspace onboarding.
 * Points at the GTM wizard progress — not auto-running agents.
 */
const HOME_STEPS: SpotlightTourStep[] = [
  {
    target: null,
    title: 'Your Home workspace',
    description:
      'You are on Home. Next you will complete a guided GTM wizard in the chat area — section by section — before any agent runs work for you.',
    placement: 'center',
  },
  {
    target: 'gtm-section-progress',
    title: 'GTM Wizard',
    description:
      'Answer each question with one of four options, then lock the section. Progress stays visible so you always know what is left.',
    placement: 'bottom',
  },
  {
    target: 'gtm-section-progress',
    title: 'Section progress',
    description:
      'Offer → Audience → Problem → Positioning → Goals must be locked in order. Unlock only reopens the last locked section.',
    placement: 'bottom',
  },
  {
    target: 'header-ask-ai',
    title: 'Ask AI anytime',
    description:
      'Use Ask AI for free-form tasks after your module profile is locked. Slash commands and chat history stay in the drawer.',
    placement: 'bottom',
  },
  {
    target: 'nav-home',
    title: 'Home in one click',
    description: 'Return here to continue an in-progress GTM module or add another product, service, app, or business line.',
    placement: 'right',
  },
  {
    target: 'nav-company-intel',
    title: 'Company Intelligence',
    description:
      'After you pick an execute task, workflows open here with your locked module profile as context.',
    placement: 'right',
  },
  {
    target: 'nav-settings',
    title: 'Settings & Workspace',
    description: 'Invite teammates, connect integrations, and manage billing from Settings.',
    placement: 'right',
  },
]

interface Props {
  onDone: () => void
}

export function HomePostOnboardingTour({ onDone }: Props) {
  return (
    <SpotlightTour
      steps={HOME_STEPS}
      storageKey="marqq_home_tour_done"
      onDone={onDone}
      tourLabel="Home"
    />
  )
}
