import torqqLogo from '@/assets/torqq-logo.svg';

export type BrandConfig = {
  name: string;
  shortName: string;
  supportEmail: string;
  titleSuffix: string;
  platformTagline: string;
  logoSrc: string;
  faviconSrc: string;
  wordmarkFontClass: string;
  agentName: string;
  agentInitial: string;
  agentTagline: string;
};

export const BRANDS = {
  marqq: {
    name: 'Marqq AI',
    shortName: 'Marqq',
    supportEmail: 'support@marqq.ai',
    titleSuffix: 'Marqq AI',
    platformTagline: 'Marketing Intelligence Platform',
    logoSrc: torqqLogo,
    faviconSrc: torqqLogo,
    wordmarkFontClass: 'font-brand-amplitude',
    agentName: 'Veena',
    agentInitial: 'V',
    agentTagline: 'AI Marketing OS',
  },
  torqq: {
    name: 'Torqq AI',
    shortName: 'Torqq',
    supportEmail: 'support@torqq.ai',
    titleSuffix: 'Torqq AI',
    platformTagline: 'Marketing Intelligence Platform',
    logoSrc: torqqLogo,
    faviconSrc: torqqLogo,
    wordmarkFontClass: 'font-brand',
    agentName: 'Veena',
    agentInitial: 'V',
    agentTagline: 'AI Marketing OS',
  },
  /** Legacy key; same public branding as Marqq (avoid Elevate AI in titles/UI). */
  elevate: {
    name: 'Marqq AI',
    shortName: 'Marqq',
    supportEmail: 'support@marqq.ai',
    titleSuffix: 'Marqq AI',
    platformTagline: 'Marketing Intelligence Platform',
    logoSrc: torqqLogo,
    faviconSrc: torqqLogo,
    wordmarkFontClass: 'font-brand-amplitude',
    agentName: 'Veena',
    agentInitial: 'V',
    agentTagline: 'AI Marketing OS',
  },
} as const satisfies Record<string, BrandConfig>;

export const ACTIVE_BRAND_KEY = 'marqq';
export const BRAND: BrandConfig = BRANDS[ACTIVE_BRAND_KEY];
