/**
 * GTM Context Handoff Utility
 *
 * When users click "Deploy Agent" from GTM Strategy Assistant,
 * this stores the GTM strategy context so modules can pre-populate forms.
 */

export interface GtmDeployContext {
  sectionId: string;
  sectionTitle: string;
  summary: string;
  bullets: string[];
  timestamp: number;
  agentTarget: string;
}

const GTM_CONTEXT_PREFIX = 'gtm_context_';
const CONTEXT_TTL = 3600000; // 1 hour

/**
 * Store GTM context for a specific agent target
 */
export function storeGtmContext(agentTarget: string, context: Omit<GtmDeployContext, 'timestamp' | 'agentTarget'>) {
  try {
    const fullContext: GtmDeployContext = {
      ...context,
      agentTarget,
      timestamp: Date.now(),
    };

    sessionStorage.setItem(
      `${GTM_CONTEXT_PREFIX}${agentTarget}`,
      JSON.stringify(fullContext)
    );
  } catch (error) {
    console.warn('[GTM Context] Failed to store context:', error);
  }
}

/**
 * Retrieve GTM context for a specific agent target
 * Returns null if context doesn't exist or has expired
 */
export function getGtmContext(agentTarget: string): GtmDeployContext | null {
  try {
    const stored = sessionStorage.getItem(`${GTM_CONTEXT_PREFIX}${agentTarget}`);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as GtmDeployContext;

    // Check if expired
    if (Date.now() - parsed.timestamp > CONTEXT_TTL) {
      clearGtmContext(agentTarget);
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn('[GTM Context] Failed to retrieve context:', error);
    return null;
  }
}

/**
 * Clear GTM context for a specific agent target
 */
export function clearGtmContext(agentTarget: string) {
  try {
    sessionStorage.removeItem(`${GTM_CONTEXT_PREFIX}${agentTarget}`);
  } catch (error) {
    console.warn('[GTM Context] Failed to clear context:', error);
  }
}

/**
 * Clear all GTM contexts
 */
export function clearAllGtmContexts() {
  try {
    const keys = Object.keys(sessionStorage);
    keys.forEach(key => {
      if (key.startsWith(GTM_CONTEXT_PREFIX)) {
        sessionStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.warn('[GTM Context] Failed to clear all contexts:', error);
  }
}

/**
 * React hook to access GTM context for the current module
 */
import { useEffect, useState } from 'react';

export function useGtmContext(agentTarget: string) {
  const [context, setContext] = useState<GtmDeployContext | null>(null);
  const [isFromGtm, setIsFromGtm] = useState(false);

  useEffect(() => {
    const gtmContext = getGtmContext(agentTarget);

    if (gtmContext) {
      setContext(gtmContext);
      setIsFromGtm(true);
    } else {
      setContext(null);
      setIsFromGtm(false);
    }
  }, [agentTarget]);

  const dismiss = () => {
    clearGtmContext(agentTarget);
    setContext(null);
    setIsFromGtm(false);
  };

  return { context, isFromGtm, dismiss };
}
