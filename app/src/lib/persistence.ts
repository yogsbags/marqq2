import { supabase } from './supabase';

function isMissingTableError(error: unknown) {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === 'PGRST205'
  );
}

function warnMissingTable(tableName: string) {
  console.warn(`[Persistence] Supabase table "${tableName}" is missing. Skipping remote persistence for now.`);
}

// ============================================================================
// POSITIONING & MESSAGING PERSISTENCE
// ============================================================================

export interface PositioningData {
  valueProposition?: string;
  messagingPillars?: Array<{
    id: string;
    pillar: string;
    description: string;
    audienceRelevance: string;
  }>;
  differentiators?: string[];
  brandVoiceTone?: string[];
  brandVoiceDos?: string[];
  brandVoiceDonts?: string[];
  elevatorPitchShort?: string;
  elevatorPitchMedium?: string;
  elevatorPitchLong?: string;
  gtmContext?: any;
}

export async function savePositioning(data: PositioningData) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: result, error } = await supabase
    .from('positioning_messaging')
    .upsert({
      user_id: user.id,
      value_proposition: data.valueProposition,
      messaging_pillars: data.messagingPillars || [],
      differentiators: data.differentiators || [],
      brand_voice_tone: data.brandVoiceTone || [],
      brand_voice_dos: data.brandVoiceDos || [],
      brand_voice_donts: data.brandVoiceDonts || [],
      elevator_pitch_short: data.elevatorPitchShort,
      elevator_pitch_medium: data.elevatorPitchMedium,
      elevator_pitch_long: data.elevatorPitchLong,
      gtm_context: data.gtmContext,
    }, {
      onConflict: 'user_id'
    })
    .select()
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      warnMissingTable('positioning_messaging');
      return null;
    }
    throw error;
  }
  return result;
}

export async function loadPositioning(): Promise<PositioningData | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('positioning_messaging')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      warnMissingTable('positioning_messaging');
      return null;
    }
    throw error;
  }
  if (!data) return null;

  return {
    valueProposition: data.value_proposition,
    messagingPillars: data.messaging_pillars,
    differentiators: data.differentiators,
    brandVoiceTone: data.brand_voice_tone,
    brandVoiceDos: data.brand_voice_dos,
    brandVoiceDonts: data.brand_voice_donts,
    elevatorPitchShort: data.elevator_pitch_short,
    elevatorPitchMedium: data.elevator_pitch_medium,
    elevatorPitchLong: data.elevator_pitch_long,
    gtmContext: data.gtm_context,
  };
}

// ============================================================================
// SALES ENABLEMENT PERSISTENCE
// ============================================================================

export interface SalesEnablementData {
  battlecards?: Array<{
    id: string;
    competitor: string;
    strengths: string[];
    weaknesses: string[];
    differentiators: string[];
    objectionHandlers: Array<{ objection: string; response: string }>;
  }>;
  demoScripts?: {
    '5min': string;
    '15min': string;
    '30min': string;
  };
  objectionHandlers?: Array<{
    id: string;
    category: string;
    objection: string;
    response: string;
    supportingData: string;
  }>;
  pricingGuidance?: {
    tierRecommendations: string;
    discountStrategy: string;
    valueJustification: string;
    competitivePositioning: string;
  };
  gtmContext?: any;
}

export async function saveSalesEnablement(data: SalesEnablementData) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: result, error } = await supabase
    .from('sales_enablement')
    .upsert({
      user_id: user.id,
      battlecards: data.battlecards || [],
      demo_scripts: data.demoScripts || {},
      objection_handlers: data.objectionHandlers || [],
      pricing_guidance: data.pricingGuidance || {},
      gtm_context: data.gtmContext,
    }, {
      onConflict: 'user_id'
    })
    .select()
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      warnMissingTable('sales_enablement');
      return null;
    }
    throw error;
  }
  return result;
}

export async function loadSalesEnablement(): Promise<SalesEnablementData | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('sales_enablement')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      warnMissingTable('sales_enablement');
      return null;
    }
    throw error;
  }
  if (!data) return null;

  return {
    battlecards: data.battlecards,
    demoScripts: data.demo_scripts,
    objectionHandlers: data.objection_handlers,
    pricingGuidance: data.pricing_guidance,
    gtmContext: data.gtm_context,
  };
}

// ============================================================================
// PRICING INTELLIGENCE PERSISTENCE
// ============================================================================

export interface PricingIntelligenceData {
  competitiveMatrix?: Array<{
    id: string;
    competitor: string;
    startingPrice: string;
    tier1: string;
    tier2: string;
    tier3: string;
    pricingModel: string;
    notes: string;
  }>;
  valueMetrics?: string[];
  recommendations?: {
    recommendedModel: string;
    rationale: string;
    suggestedTiers: Array<{
      name: string;
      price: string;
      features: string[];
      targetCustomer: string;
    }>;
    valueMetrics: string[];
    implementationSteps: string[];
  };
  elasticityData?: Array<{
    segment: string;
    pricePoint: string;
    expectedDemand: string;
    revenue: string;
    elasticity: string;
  }>;
  gtmContext?: any;
}

export async function savePricingIntelligence(data: PricingIntelligenceData) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: result, error } = await supabase
    .from('pricing_intelligence')
    .upsert({
      user_id: user.id,
      competitive_matrix: data.competitiveMatrix || [],
      value_metrics: data.valueMetrics || [],
      recommendations: data.recommendations,
      elasticity_data: data.elasticityData || [],
      gtm_context: data.gtmContext,
    }, {
      onConflict: 'user_id'
    })
    .select()
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      warnMissingTable('pricing_intelligence');
      return null;
    }
    throw error;
  }
  return result;
}

export async function loadPricingIntelligence(): Promise<PricingIntelligenceData | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('pricing_intelligence')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      warnMissingTable('pricing_intelligence');
      return null;
    }
    throw error;
  }
  if (!data) return null;

  return {
    competitiveMatrix: data.competitive_matrix,
    valueMetrics: data.value_metrics,
    recommendations: data.recommendations,
    elasticityData: data.elasticity_data,
    gtmContext: data.gtm_context,
  };
}

// ============================================================================
// GTM STRATEGIES PERSISTENCE
// ============================================================================

export interface GtmStrategyData {
  title: string;
  executiveSummary: string;
  assumptions: string[];
  sections: Array<{
    id: string;
    title: string;
    summary: string;
    bullets: string[];
    recommendedAgentTarget: string;
    deployLabel?: string;
  }>;
  nextSteps: string[];
  interviewAnswers?: any;
  name?: string;
}

export async function saveGtmStrategy(data: GtmStrategyData) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Mark all existing strategies as inactive
  await supabase
    .from('gtm_strategies')
    .update({ is_active: false })
    .eq('user_id', user.id);

  // Insert new strategy as active
  const { data: result, error } = await supabase
    .from('gtm_strategies')
    .insert({
      user_id: user.id,
      title: data.title,
      executive_summary: data.executiveSummary,
      assumptions: data.assumptions,
      sections: data.sections,
      next_steps: data.nextSteps,
      interview_answers: data.interviewAnswers,
      name: data.name || 'Untitled Strategy',
      is_active: true,
    })
    .select()
    .single();

  if (error) throw error;
  return result;
}

export async function loadActiveGtmStrategy(): Promise<GtmStrategyData | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('gtm_strategies')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    title: data.title,
    executiveSummary: data.executive_summary,
    assumptions: data.assumptions,
    sections: data.sections,
    nextSteps: data.next_steps,
    interviewAnswers: data.interview_answers,
    name: data.name,
  };
}

export async function loadAllGtmStrategies() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('gtm_strategies')
    .select('id, name, title, created_at, updated_at, is_active')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function loadGtmStrategyById(id: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('gtm_strategies')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error) throw error;

  return {
    title: data.title,
    executiveSummary: data.executive_summary,
    assumptions: data.assumptions,
    sections: data.sections,
    nextSteps: data.next_steps,
    interviewAnswers: data.interview_answers,
    name: data.name,
  };
}

export async function deleteGtmStrategy(id: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('gtm_strategies')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) throw error;
}

// ============================================================================
// AUTO-SAVE UTILITY
// ============================================================================

export function createAutoSave<T>(
  saveFunction: (data: T) => Promise<any>,
  debounceMs: number = 2000
) {
  let timeoutId: NodeJS.Timeout | null = null;

  return (data: T) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(async () => {
      try {
        await saveFunction(data);
        console.log('Auto-saved successfully');
      } catch (error) {
        if (!isMissingTableError(error)) {
          console.error('Auto-save failed:', error);
        }
      }
    }, debounceMs);
  };
}
