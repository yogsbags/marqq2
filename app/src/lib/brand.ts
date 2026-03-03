import elevateLogo from '@/assets/elevate-logo.svg';
import torqqLogo from '@/assets/torqq-logo.svg';

export type BrandConfig = {
  name: string;
  shortName: string;
  supportEmail: string;
  titleSuffix: string;
  platformTagline: string;
  logoSrc: string;
};

export const BRANDS = {
  torqq: {
    name: 'Torqq AI',
    shortName: 'Torqq',
    supportEmail: 'support@torqq.ai',
    titleSuffix: 'Torqq AI',
    platformTagline: 'Marketing Intelligence Platform',
    logoSrc: torqqLogo,
  },
  elevate: {
    name: 'Elevate AI',
    shortName: 'Elevate',
    supportEmail: 'support@elevate.ai',
    titleSuffix: 'Elevate AI',
    platformTagline: 'Marketing Intelligence Platform',
    logoSrc: elevateLogo,
  },
} as const satisfies Record<string, BrandConfig>;

export const ACTIVE_BRAND_KEY = 'elevate';
export const BRAND: BrandConfig = BRANDS[ACTIVE_BRAND_KEY];
