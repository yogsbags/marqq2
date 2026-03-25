import { SpotlightTour, type SpotlightTourStep } from '@/components/tour/SpotlightTour'

/**
 * Shown on the Home screen right after workspace onboarding.
 * Targets use data-tour on HomeView + header + sidebar.
 */
const HOME_STEPS: SpotlightTourStep[] = [
  {
    target: null,
    title: 'Your Home workspace',
    description:
      'You are on Home — the fastest way to ship outcomes. Pick a goal below and Marqq routes you through setup, then into the right modules and agents with your context.',
    placement: 'center',
  },
  {
    target: 'home-start-here',
    title: 'Start with an outcome',
    description:
      'These priority goals cover the most common GTM jobs. Tap a card, answer a short intake, and we open the workflow with Veena and the right specialist agents.',
    placement: 'bottom',
  },
  {
    target: 'home-goal-grid',
    title: 'Goal cards = guided workflows',
    description:
      'Each card explains who it is for. You will get connector hints where useful (ads, CRM, social). Browse the full catalog anytime from the link above the grid.',
    placement: 'top',
  },
  {
    target: 'header-ask-ai',
    title: 'Ask AI anytime',
    description:
      'Use Ask AI for free-form tasks, slash commands (/leads, /content, /seo), and follow-ups. Your chat history stays in the drawer on the right.',
    placement: 'bottom',
  },
  {
    target: 'nav-home',
    title: 'Home in one click',
    description: 'Use Home in the sidebar whenever you want to switch goals or start a new outcome without losing your place.',
    placement: 'right',
  },
  {
    target: 'nav-company-intel',
    title: 'Company Intelligence',
    description:
      'When you are ready to go deep: open it here, then use the horizontal tabs for Overview, ICPs, competitors, positioning, and the rest — built from your site and refreshed over time.',
    placement: 'right',
  },
  {
    target: 'nav-dashboard',
    title: 'Your AI team',
    description:
      'Twelve agents run research, copy, analytics, and more. Open AI Team to assign tasks, see status, and pull market signals.',
    placement: 'right',
  },
  {
    target: 'nav-settings',
    title: 'Settings & Workspace',
    description: 'Invite teammates, connect integrations, and manage billing. Your workspace was auto-provisioned when you signed up.',
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
