import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Check, Loader2, Sparkles, Plus, Trash2, TrendingUp, DollarSign, Target } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useGtmContext } from '@/lib/gtmContext';
import { GtmContextBanner } from '@/components/ui/gtm-context-banner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { savePricingIntelligence, loadPricingIntelligence, createAutoSave } from '@/lib/persistence';
import type { ArtifactRecord } from '../api';

interface CompetitorPricing {
  id: string;
  competitor: string;
  startingPrice: string;
  tier1: string;
  tier2: string;
  tier3: string;
  pricingModel: string;
  notes: string;
}

interface PricingRecommendation {
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
}

interface PriceElasticity {
  segment: string;
  pricePoint: string;
  expectedDemand: string;
  revenue: string;
  elasticity: string;
}

interface Props {
  artifact?: ArtifactRecord | null;
}

export function PricingIntelligencePage({ artifact }: Props = {}) {
  const { toast } = useToast();
  const { context: gtmCtx, dismiss: dismissGtm } = useGtmContext('company_intel_pricing');

  // Competitive Pricing Matrix
  const [competitors, setCompetitors] = useState<CompetitorPricing[]>([]);
  const [newCompetitor, setNewCompetitor] = useState({
    competitor: '',
    startingPrice: '',
    tier1: '',
    tier2: '',
    tier3: '',
    pricingModel: 'tiered',
    notes: '',
  });
  const [isGeneratingMatrix, setIsGeneratingMatrix] = useState(false);

  // Pricing Recommendations
  const [recommendation, setRecommendation] = useState<PricingRecommendation | undefined>(undefined);
  const [isGeneratingRecommendation, setIsGeneratingRecommendation] = useState(false);

  // Price Elasticity
  const [elasticityData, setElasticityData] = useState<PriceElasticity[]>([]);
  const [isGeneratingElasticity, setIsGeneratingElasticity] = useState(false);

  // Value Metrics
  const [valueMetrics, setValueMetrics] = useState<string[]>([]);
  const [newMetric, setNewMetric] = useState('');
  const [isGeneratingMetrics, setIsGeneratingMetrics] = useState(false);

  // Auto-save setup
  const autoSave = useMemo(
    () => createAutoSave(savePricingIntelligence, 2000),
    []
  );

  // Load saved data on mount; fall back to AI artifact if no saved data
  useEffect(() => {
    loadPricingIntelligence()
      .then(data => {
        const hasSavedContent = !!(
          (data?.competitiveMatrix?.length ?? 0) > 0 ||
          (data?.valueMetrics?.length ?? 0) > 0 ||
          data?.recommendations?.recommendedModel?.trim()
        );
        if (hasSavedContent) {
          setCompetitors(data!.competitiveMatrix || []);
          setValueMetrics(data!.valueMetrics || []);
          setRecommendation(data!.recommendations || undefined);
          setElasticityData(data!.elasticityData || []);
        } else if (artifact?.data) {
          // No saved data — seed from AI-generated artifact
          const d = artifact.data as {
            pricingModelSummary?: string;
            publicPricingVisibility?: string;
            competitorBenchmarks?: Array<{ name?: string; pricingModel?: string; startingPoint?: string; notes?: string }>;
            packagingRecommendations?: Array<{ offer?: string; targetCustomer?: string; pricingApproach?: string; rationale?: string }>;
            valueMetrics?: string[];
            risks?: string[];
            nextQuestions?: string[];
          };
          if (d.competitorBenchmarks?.length) {
            setCompetitors(
              d.competitorBenchmarks.map((b, i) => ({
                id: `comp-${i}-${Date.now()}`,
                competitor: b.name || '',
                startingPrice: b.startingPoint || '',
                tier1: '',
                tier2: '',
                tier3: '',
                pricingModel: b.pricingModel || '',
                notes: b.notes || '',
              }))
            );
          }
          if (d.valueMetrics?.length) setValueMetrics(d.valueMetrics);
          if (d.pricingModelSummary || d.packagingRecommendations?.length) {
            setRecommendation({
              recommendedModel: d.pricingModelSummary || '',
              rationale: d.publicPricingVisibility || '',
              suggestedTiers: (d.packagingRecommendations || []).map((r) => ({
                name: r.offer || '',
                price: r.pricingApproach || '',
                features: r.rationale ? [r.rationale] : [],
                targetCustomer: r.targetCustomer || '',
              })),
              valueMetrics: d.valueMetrics || [],
              implementationSteps: d.nextQuestions || [],
            });
          }
        }
      })
      .catch(err => {
        console.error('Failed to load pricing intelligence data:', err);
      });
  }, [artifact]);

  // Auto-save on state changes — skip if nothing to save yet
  useEffect(() => {
    const hasContent =
      competitors.length > 0 ||
      valueMetrics.length > 0 ||
      !!recommendation?.recommendedModel?.trim();
    if (!hasContent) return;
    autoSave({
      competitiveMatrix: competitors,
      valueMetrics,
      recommendations: recommendation,
      elasticityData,
      gtmContext: gtmCtx,
    });
  }, [competitors, valueMetrics, recommendation, elasticityData, gtmCtx, autoSave]);

  // State for data freshness tracking
  const [lastVerified, setLastVerified] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<string | null>(null);

  // Generate Competitive Pricing Matrix
  const handleGenerateMatrix = async () => {
    setIsGeneratingMatrix(true);
    try {
      const response = await fetch('/api/pricing-intelligence/competitive-matrix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            companyName: 'Torqq AI',
            industry: 'B2B Marketing Technology',
            targetMarket: 'SMB and Mid-Market',
            existingCompetitors: competitors.map(c => c.competitor),
            gtmInsights: gtmCtx?.bullets || [],
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate competitive matrix');
      }

      const data = await response.json();
      setCompetitors(data.competitors);
      setLastVerified(data.verifiedAt);
      setDataSource(data.dataSource);

      toast({
        title: 'Live Data Retrieved',
        description: `Added ${data.competitors.length} competitor profiles with current pricing from web`,
      });
    } catch (error) {
      console.error('Matrix generation error:', error);
      toast({
        title: 'Generation Failed',
        description: error instanceof Error ? error.message : 'Failed to generate matrix',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingMatrix(false);
    }
  };

  // Generate Pricing Recommendations
  const handleGenerateRecommendations = async () => {
    setIsGeneratingRecommendation(true);
    try {
      const response = await fetch('/api/pricing-intelligence/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            companyName: 'Torqq AI',
            productType: 'B2B SaaS Platform',
            targetCustomers: ['SMB', 'Mid-Market', 'Enterprise'],
            competitorPricing: competitors,
            currentValueMetrics: valueMetrics,
            gtmInsights: gtmCtx?.bullets || [],
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate recommendations');
      }

      const data = await response.json();
      setRecommendation(data.recommendation);

      toast({
        title: 'Recommendations Generated',
        description: 'Strategic pricing model and tiers created',
      });
    } catch (error) {
      console.error('Recommendations generation error:', error);
      toast({
        title: 'Generation Failed',
        description: error instanceof Error ? error.message : 'Failed to generate recommendations',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingRecommendation(false);
    }
  };

  // Generate Price Elasticity Analysis
  const handleGenerateElasticity = async () => {
    setIsGeneratingElasticity(true);
    try {
      const response = await fetch('/api/pricing-intelligence/elasticity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            companyName: 'Torqq AI',
            basePrice: recommendation?.suggestedTiers?.[1]?.price || '$500/month',
            segments: ['SMB', 'Mid-Market', 'Enterprise'],
            competitorPricing: competitors,
            gtmInsights: gtmCtx?.bullets || [],
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate elasticity analysis');
      }

      const data = await response.json();
      setElasticityData(data.elasticity);

      toast({
        title: 'Elasticity Analysis Complete',
        description: `Analyzed ${data.elasticity.length} price points`,
      });
    } catch (error) {
      console.error('Elasticity generation error:', error);
      toast({
        title: 'Generation Failed',
        description: error instanceof Error ? error.message : 'Failed to generate elasticity',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingElasticity(false);
    }
  };

  // Generate Value Metrics
  const handleGenerateValueMetrics = async () => {
    setIsGeneratingMetrics(true);
    try {
      const response = await fetch('/api/pricing-intelligence/value-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            companyName: 'Torqq AI',
            productType: 'B2B Marketing Intelligence Platform',
            keyFeatures: [
              'Lead Intelligence',
              'Content Automation',
              'Social Media Campaigns',
              'Video Generation',
              'Budget Optimization',
            ],
            gtmInsights: gtmCtx?.bullets || [],
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate value metrics');
      }

      const data = await response.json();
      setValueMetrics(data.metrics);

      toast({
        title: 'Value Metrics Generated',
        description: `Identified ${data.metrics.length} key value metrics`,
      });
    } catch (error) {
      console.error('Value metrics generation error:', error);
      toast({
        title: 'Generation Failed',
        description: error instanceof Error ? error.message : 'Failed to generate value metrics',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingMetrics(false);
    }
  };

  // Helper functions
  const handleAddCompetitor = () => {
    if (!newCompetitor.competitor || !newCompetitor.startingPrice) {
      toast({
        title: 'Missing Fields',
        description: 'Please provide competitor name and starting price',
        variant: 'destructive',
      });
      return;
    }

    setCompetitors([
      ...competitors,
      {
        id: Date.now().toString(),
        ...newCompetitor,
      },
    ]);
    setNewCompetitor({
      competitor: '',
      startingPrice: '',
      tier1: '',
      tier2: '',
      tier3: '',
      pricingModel: 'tiered',
      notes: '',
    });

    toast({
      title: 'Competitor Added',
      description: 'Pricing data added to matrix',
    });
  };

  const handleRemoveCompetitor = (id: string) => {
    setCompetitors(competitors.filter(c => c.id !== id));
  };

  const handleAddMetric = () => {
    if (!newMetric.trim()) return;
    setValueMetrics([...valueMetrics, newMetric.trim()]);
    setNewMetric('');
  };

  const handleRemoveMetric = (index: number) => {
    setValueMetrics(valueMetrics.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      {/* GTM Context Banner */}
      {gtmCtx && <GtmContextBanner context={gtmCtx} onDismiss={dismissGtm} />}

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Pricing Intelligence</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time competitive pricing analysis powered by live web data
          </p>
        </div>
        <div className="flex gap-2">
          {lastVerified && (
            <Badge variant="default" className="flex items-center gap-1">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              Verified {new Date(lastVerified).toLocaleDateString()}
            </Badge>
          )}
          {dataSource && (
            <Badge variant="secondary" className="flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              {dataSource === 'live_web_tools' ? 'Live Web Data' : 'Strategic Pricing'}
            </Badge>
          )}
        </div>
      </div>

      {/* 1. Competitive Pricing Matrix */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>Competitive Pricing Matrix</span>
            <Badge variant="secondary">AI-Powered</Badge>
          </CardTitle>
          <CardDescription>
            Analyze competitor pricing tiers, models, and positioning
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleGenerateMatrix}
            disabled={isGeneratingMatrix}
            className="w-full"
          >
            {isGeneratingMatrix ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing Competitors...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Auto-Generate Competitive Matrix
              </>
            )}
          </Button>

          {/* Manual Add Competitor */}
          <div className="grid grid-cols-2 gap-3 p-4 bg-muted rounded">
            <Input
              placeholder="Competitor Name"
              value={newCompetitor.competitor}
              onChange={(e) => setNewCompetitor({ ...newCompetitor, competitor: e.target.value })}
            />
            <Input
              placeholder="Starting Price (e.g., $99/mo)"
              value={newCompetitor.startingPrice}
              onChange={(e) => setNewCompetitor({ ...newCompetitor, startingPrice: e.target.value })}
            />
            <Input
              placeholder="Tier 1 Price"
              value={newCompetitor.tier1}
              onChange={(e) => setNewCompetitor({ ...newCompetitor, tier1: e.target.value })}
            />
            <Input
              placeholder="Tier 2 Price"
              value={newCompetitor.tier2}
              onChange={(e) => setNewCompetitor({ ...newCompetitor, tier2: e.target.value })}
            />
            <Input
              placeholder="Tier 3 Price"
              value={newCompetitor.tier3}
              onChange={(e) => setNewCompetitor({ ...newCompetitor, tier3: e.target.value })}
            />
            <Select
              value={newCompetitor.pricingModel}
              onValueChange={(value) => setNewCompetitor({ ...newCompetitor, pricingModel: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pricing Model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tiered">Tiered</SelectItem>
                <SelectItem value="usage-based">Usage-Based</SelectItem>
                <SelectItem value="flat-rate">Flat Rate</SelectItem>
                <SelectItem value="freemium">Freemium</SelectItem>
                <SelectItem value="per-user">Per User</SelectItem>
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Notes (optional)"
              value={newCompetitor.notes}
              onChange={(e) => setNewCompetitor({ ...newCompetitor, notes: e.target.value })}
              rows={2}
              className="col-span-2"
            />
            <Button onClick={handleAddCompetitor} className="col-span-2">
              <Plus className="w-4 h-4 mr-2" />
              Add Competitor Manually
            </Button>
          </div>

          {/* Competitor List */}
          {competitors.length > 0 && (
            <div className="space-y-3 mt-6">
              <h4 className="font-semibold text-sm">Competitive Landscape ({competitors.length} competitors)</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-2">Competitor</th>
                      <th className="text-left p-2">Starting</th>
                      <th className="text-left p-2">Tier 1</th>
                      <th className="text-left p-2">Tier 2</th>
                      <th className="text-left p-2">Tier 3</th>
                      <th className="text-left p-2">Model</th>
                      <th className="text-left p-2">Source</th>
                      <th className="text-left p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {competitors.map((comp) => (
                      <tr key={comp.id} className="border-t">
                        <td className="p-2 font-medium">{comp.competitor}</td>
                        <td className="p-2">{comp.startingPrice}</td>
                        <td className="p-2">{comp.tier1 || '-'}</td>
                        <td className="p-2">{comp.tier2 || '-'}</td>
                        <td className="p-2">{comp.tier3 || '-'}</td>
                        <td className="p-2">
                          <Badge variant="outline">{comp.pricingModel}</Badge>
                        </td>
                        <td className="p-2">
                          {(comp as any).sourceUrl ? (
                            <a
                              href={(comp as any).sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline text-xs"
                            >
                              Verify →
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">Manual</span>
                          )}
                        </td>
                        <td className="p-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveCompetitor(comp.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Value Metrics Calculator */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            <span>Value Metrics</span>
            <Badge variant="secondary">AI-Powered</Badge>
          </CardTitle>
          <CardDescription>
            Identify and calculate key value metrics for pricing decisions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleGenerateValueMetrics}
            disabled={isGeneratingMetrics}
            className="w-full"
          >
            {isGeneratingMetrics ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing Value Metrics...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Value Metrics
              </>
            )}
          </Button>

          {/* Manual Add Metric */}
          <div className="flex gap-2">
            <Input
              placeholder="Add value metric (e.g., Leads generated per month)"
              value={newMetric}
              onChange={(e) => setNewMetric(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddMetric()}
            />
            <Button onClick={handleAddMetric}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {/* Metrics List */}
          {valueMetrics.length > 0 && (
            <div className="space-y-2">
              {valueMetrics.map((metric, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-muted rounded"
                >
                  <span className="text-sm">{metric}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveMetric(index)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Pricing Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            <span>Pricing Strategy Recommendations</span>
            <Badge variant="secondary">AI-Powered</Badge>
          </CardTitle>
          <CardDescription>
            AI-powered pricing model and tier recommendations based on competitive analysis
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleGenerateRecommendations}
            disabled={isGeneratingRecommendation || (competitors.length === 0 && valueMetrics.length === 0)}
            className="w-full"
          >
            {isGeneratingRecommendation ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating Strategy...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Pricing Strategy
              </>
            )}
          </Button>

          {recommendation && (
            <div className="space-y-6 mt-6">
              {/* Recommended Model */}
              <div>
                <h4 className="font-semibold mb-2">Recommended Pricing Model</h4>
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded">
                  <Badge className="mb-2">{recommendation.recommendedModel}</Badge>
                  <p className="text-sm">{recommendation.rationale}</p>
                </div>
              </div>

              {/* Suggested Tiers */}
              {recommendation.suggestedTiers && recommendation.suggestedTiers.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Suggested Pricing Tiers</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {recommendation.suggestedTiers.map((tier, index) => (
                      <Card key={index} className="border-2">
                        <CardHeader>
                          <CardTitle className="text-lg">{tier.name}</CardTitle>
                          <p className="text-2xl font-bold text-blue-600">{tier.price}</p>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground mb-3">{tier.targetCustomer}</p>
                          <ul className="text-sm space-y-1">
                            {tier.features.map((feature, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <Check className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                                <span>{feature}</span>
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Value Metrics from Recommendation */}
              {recommendation.valueMetrics && recommendation.valueMetrics.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Key Value Metrics for Pricing</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {recommendation.valueMetrics.map((metric, index) => (
                      <Badge key={index} variant="outline">{metric}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Implementation Steps */}
              {recommendation.implementationSteps && recommendation.implementationSteps.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Implementation Steps</h4>
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    {recommendation.implementationSteps.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. Price Elasticity Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>Price Elasticity Analysis</span>
            <Badge variant="secondary">AI-Powered</Badge>
          </CardTitle>
          <CardDescription>
            Understand demand sensitivity at different price points
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleGenerateElasticity}
            disabled={isGeneratingElasticity || !recommendation}
            className="w-full"
          >
            {isGeneratingElasticity ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing Elasticity...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Elasticity Analysis
              </>
            )}
          </Button>

          {elasticityData.length > 0 && (
            <div className="overflow-x-auto mt-6">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2">Segment</th>
                    <th className="text-left p-2">Price Point</th>
                    <th className="text-left p-2">Expected Demand</th>
                    <th className="text-left p-2">Revenue</th>
                    <th className="text-left p-2">Elasticity</th>
                  </tr>
                </thead>
                <tbody>
                  {elasticityData.map((data, index) => (
                    <tr key={index} className="border-t">
                      <td className="p-2 font-medium">{data.segment}</td>
                      <td className="p-2">{data.pricePoint}</td>
                      <td className="p-2">{data.expectedDemand}</td>
                      <td className="p-2">{data.revenue}</td>
                      <td className="p-2">
                        <Badge
                          variant={
                            data.elasticity.includes('High') ? 'destructive' :
                            data.elasticity.includes('Low') ? 'default' : 'secondary'
                          }
                        >
                          {data.elasticity}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
