import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { BarChart3, Loader2, Sparkles, Plus, Trash2, Copy, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useGtmContext } from '@/lib/gtmContext';
import { GtmContextBanner } from '@/components/ui/gtm-context-banner';
import { saveSalesEnablement, loadSalesEnablement, createAutoSave } from '@/lib/persistence';
import type { ArtifactRecord } from '../api';

interface Battlecard {
  id: string;
  competitor: string;
  strengths: string[];
  weaknesses: string[];
  differentiators: string[];
  objectionHandlers: Array<{ objection: string; response: string }>;
}

interface DemoScript {
  duration: '5min' | '15min' | '30min';
  content: string;
}

interface ObjectionHandler {
  id: string;
  category: string;
  objection: string;
  response: string;
  supportingData: string;
}

interface PricingGuidance {
  tierRecommendations: string;
  discountStrategy: string;
  valueJustification: string;
  competitivePositioning: string;
}

interface Props {
  artifact?: ArtifactRecord | null;
}

export function SalesEnablementPage({ artifact }: Props = {}) {
  const { toast } = useToast();
  const { context: gtmCtx, dismiss: dismissGtm } = useGtmContext('company_intel_sales_enablement');

  // Battlecards state
  const [battlecards, setBattlecards] = useState<Battlecard[]>([]);
  const [selectedCompetitor, setSelectedCompetitor] = useState('');
  const [isGeneratingBattlecard, setIsGeneratingBattlecard] = useState(false);
  const [lastVerified, setLastVerified] = useState<string | null>(null);

  // Demo Scripts state
  const [demoScripts, setDemoScripts] = useState<{ '5min': string; '15min': string; '30min': string; }>({
    '5min': '',
    '15min': '',
    '30min': '',
  });
  const [isGeneratingScripts, setIsGeneratingScripts] = useState(false);

  // Objection Handlers state
  const [objectionHandlers, setObjectionHandlers] = useState<ObjectionHandler[]>([]);
  const [isGeneratingObjections, setIsGeneratingObjections] = useState(false);
  const [newObjection, setNewObjection] = useState({ category: '', objection: '', response: '', supportingData: '' });

  // Pricing Guidance state
  const [pricingGuidance, setPricingGuidance] = useState<PricingGuidance>({
    tierRecommendations: '',
    discountStrategy: '',
    valueJustification: '',
    competitivePositioning: '',
  });
  const [isGeneratingPricing, setIsGeneratingPricing] = useState(false);

  // Auto-save setup
  const autoSave = useMemo(
    () => createAutoSave(saveSalesEnablement, 2000),
    []
  );

  // Load saved data on mount; fall back to AI artifact if no saved data
  useEffect(() => {
    loadSalesEnablement()
      .then(data => {
        const hasSavedContent = !!(
          (data?.battlecards?.length ?? 0) > 0 ||
          (data?.objectionHandlers?.length ?? 0) > 0 ||
          data?.demoScripts?.['5min']?.trim() ||
          data?.demoScripts?.['15min']?.trim() ||
          data?.demoScripts?.['30min']?.trim() ||
          data?.pricingGuidance?.tierRecommendations?.trim()
        );
        if (hasSavedContent) {
          setBattlecards(data!.battlecards || []);
          setDemoScripts(data!.demoScripts || { '5min': '', '15min': '', '30min': '' });
          setObjectionHandlers(data!.objectionHandlers || []);
          setPricingGuidance(data!.pricingGuidance || {
            tierRecommendations: '',
            discountStrategy: '',
            valueJustification: '',
            competitivePositioning: '',
          });
        } else if (artifact?.data) {
          // No saved data — seed from AI-generated artifact
          const d = artifact.data as {
            battlecards?: Array<{ competitor?: string; strengths?: string[]; weaknesses?: string[]; differentiators?: string[]; objectionHandlers?: Array<{ objection: string; response: string }> }>;
            demoScripts?: { '5min'?: string; '15min'?: string; '30min'?: string };
            objectionHandlers?: Array<{ category?: string; objection?: string; response?: string; supportingData?: string }>;
            pricingGuidance?: { tierRecommendations?: string; discountStrategy?: string; valueJustification?: string; competitivePositioning?: string };
          };
          if (d.battlecards?.length) {
            setBattlecards(
              d.battlecards.map((b, i) => ({
                id: `battlecard-${i}-${Date.now()}`,
                competitor: b.competitor || '',
                strengths: b.strengths || [],
                weaknesses: b.weaknesses || [],
                differentiators: b.differentiators || [],
                objectionHandlers: b.objectionHandlers || [],
              }))
            );
          }
          if (d.demoScripts) {
            setDemoScripts({
              '5min': d.demoScripts['5min'] || '',
              '15min': d.demoScripts['15min'] || '',
              '30min': d.demoScripts['30min'] || '',
            });
          }
          if (d.objectionHandlers?.length) {
            setObjectionHandlers(
              d.objectionHandlers.map((o, i) => ({
                id: `objection-${i}-${Date.now()}`,
                category: o.category || '',
                objection: o.objection || '',
                response: o.response || '',
                supportingData: o.supportingData || '',
              }))
            );
          }
          if (d.pricingGuidance) {
            setPricingGuidance({
              tierRecommendations: d.pricingGuidance.tierRecommendations || '',
              discountStrategy: d.pricingGuidance.discountStrategy || '',
              valueJustification: d.pricingGuidance.valueJustification || '',
              competitivePositioning: d.pricingGuidance.competitivePositioning || '',
            });
          }
        }
      })
      .catch(err => {
        console.error('Failed to load sales enablement data:', err);
      });
  }, [artifact]);

  // Auto-save on state changes — skip if nothing to save yet
  useEffect(() => {
    const hasContent =
      battlecards.length > 0 ||
      objectionHandlers.length > 0 ||
      demoScripts['5min'].trim() ||
      demoScripts['15min'].trim() ||
      demoScripts['30min'].trim() ||
      pricingGuidance.tierRecommendations.trim();
    if (!hasContent) return;
    autoSave({
      battlecards,
      demoScripts,
      objectionHandlers,
      pricingGuidance,
      gtmContext: gtmCtx,
    });
  }, [battlecards, demoScripts, objectionHandlers, pricingGuidance, gtmCtx, autoSave]);

  // Battlecard generation
  const handleGenerateBattlecard = async () => {
    if (!selectedCompetitor.trim()) {
      toast({
        title: 'Competitor Required',
        description: 'Please enter a competitor name',
        variant: 'destructive',
      });
      return;
    }

    setIsGeneratingBattlecard(true);
    try {
      const response = await fetch('/api/sales-enablement/battlecard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            competitor: selectedCompetitor,
            companyName: 'Torqq AI',
            industry: 'B2B Marketing Technology',
            gtmInsights: gtmCtx?.bullets || [],
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate battlecard');
      }

      const data = await response.json();
      setBattlecards([...battlecards, { ...data.battlecard, verifiedAt: data.verifiedAt }]);
      setSelectedCompetitor('');
      setLastVerified(data.verifiedAt);

      toast({
        title: 'Live Competitive Intel Retrieved',
        description: `Battlecard for ${data.battlecard.competitor} created with current market data`,
      });
    } catch (error) {
      console.error('Battlecard generation error:', error);
      toast({
        title: 'Generation Failed',
        description: error instanceof Error ? error.message : 'Failed to generate battlecard',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingBattlecard(false);
    }
  };

  // Demo Scripts generation
  const handleGenerateDemoScripts = async () => {
    setIsGeneratingScripts(true);
    try {
      const response = await fetch('/api/sales-enablement/demo-scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            companyName: 'Torqq AI',
            valueProposition: 'Unified B2B Marketing Intelligence Platform with autonomous multi-agent AI',
            targetAudience: 'Marketing teams at B2B SaaS companies',
            keyFeatures: [
              'Lead Intelligence & Scoring',
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
        throw new Error(error.error || 'Failed to generate demo scripts');
      }

      const data = await response.json();
      setDemoScripts(data.scripts);

      toast({
        title: 'Demo Scripts Generated',
        description: 'All 3 demo scripts created successfully',
      });
    } catch (error) {
      console.error('Demo script generation error:', error);
      toast({
        title: 'Generation Failed',
        description: error instanceof Error ? error.message : 'Failed to generate demo scripts',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingScripts(false);
    }
  };

  // Objection Handlers generation
  const handleGenerateObjectionHandlers = async () => {
    setIsGeneratingObjections(true);
    try {
      const response = await fetch('/api/sales-enablement/objection-handlers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            companyName: 'Torqq AI',
            industry: 'B2B Marketing Technology',
            targetAudience: 'Marketing teams at B2B SaaS companies',
            commonConcerns: ['pricing', 'implementation', 'data security', 'ROI', 'integration'],
            gtmInsights: gtmCtx?.bullets || [],
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate objection handlers');
      }

      const data = await response.json();
      setObjectionHandlers(data.handlers);

      toast({
        title: 'Objection Handlers Generated',
        description: `Created ${data.handlers.length} objection handlers`,
      });
    } catch (error) {
      console.error('Objection handler generation error:', error);
      toast({
        title: 'Generation Failed',
        description: error instanceof Error ? error.message : 'Failed to generate objection handlers',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingObjections(false);
    }
  };

  // Pricing Guidance generation
  const handleGeneratePricingGuidance = async () => {
    setIsGeneratingPricing(true);
    try {
      const response = await fetch('/api/sales-enablement/pricing-guidance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            companyName: 'Torqq AI',
            industry: 'B2B Marketing Technology',
            targetAudience: 'Marketing teams at B2B SaaS companies',
            competitorPricing: battlecards.map(b => ({ competitor: b.competitor })),
            gtmInsights: gtmCtx?.bullets || [],
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate pricing guidance');
      }

      const data = await response.json();
      setPricingGuidance(data.guidance);

      toast({
        title: 'Pricing Guidance Generated',
        description: 'Strategic pricing recommendations created',
      });
    } catch (error) {
      console.error('Pricing guidance generation error:', error);
      toast({
        title: 'Generation Failed',
        description: error instanceof Error ? error.message : 'Failed to generate pricing guidance',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingPricing(false);
    }
  };

  // Helper functions
  const handleRemoveBattlecard = (index: number) => {
    setBattlecards(battlecards.filter((_, i) => i !== index));
  };

  const handleCopyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied',
      description: `${label} copied to clipboard`,
    });
  };

  const handleAddObjection = () => {
    if (!newObjection.category || !newObjection.objection || !newObjection.response) {
      toast({
        title: 'Missing Fields',
        description: 'Please fill category, objection, and response',
        variant: 'destructive',
      });
      return;
    }

    setObjectionHandlers([
      ...objectionHandlers,
      {
        id: Date.now().toString(),
        ...newObjection,
      },
    ]);
    setNewObjection({ category: '', objection: '', response: '', supportingData: '' });

    toast({
      title: 'Objection Added',
      description: 'Manual objection handler added',
    });
  };

  const handleRemoveObjection = (id: string) => {
    setObjectionHandlers(objectionHandlers.filter(h => h.id !== id));
  };

  const handleDownloadSalesKit = () => {
    const content = {
      battlecards,
      demoScripts,
      objectionHandlers,
      pricingGuidance,
      generatedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `torqq-ai-sales-enablement-kit-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: 'Sales Kit Downloaded',
      description: 'Complete sales enablement package saved',
    });
  };

  return (
    <div className="space-y-6">
      {/* GTM Context Banner */}
      {gtmCtx && <GtmContextBanner context={gtmCtx} onDismiss={dismissGtm} />}

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Sales Enablement</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Equip your sales team with battlecards, demo scripts, objection handlers, and pricing guidance
          </p>
        </div>
        <Button
          onClick={handleDownloadSalesKit}
          variant="outline"
          disabled={battlecards.length === 0 && !demoScripts['5min'] && objectionHandlers.length === 0}
        >
          <Download className="w-4 h-4 mr-2" />
          Download Sales Kit
        </Button>
      </div>

      {/* 1. Battlecards Generator */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>Competitive Battlecards</span>
            <Badge variant="secondary">AI-Powered</Badge>
          </CardTitle>
          <CardDescription>
            Generate comprehensive competitor analysis with strengths, weaknesses, differentiators, and objection handlers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Enter competitor name (e.g., HubSpot, Marketo)"
              value={selectedCompetitor}
              onChange={(e) => setSelectedCompetitor(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerateBattlecard()}
            />
            <Button
              onClick={handleGenerateBattlecard}
              disabled={isGeneratingBattlecard || !selectedCompetitor.trim()}
            >
              {isGeneratingBattlecard ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Battlecard
                </>
              )}
            </Button>
          </div>

          {battlecards.length > 0 && (
            <div className="space-y-4 mt-6">
              {battlecards.map((battlecard, index) => (
                <Card key={index} className="border-l-4 border-l-orange-500">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-1">
                        <CardTitle className="text-lg">{battlecard.competitor}</CardTitle>
                        {(battlecard as any).verifiedAt && (
                          <span className="text-xs text-muted-foreground">
                            Live data from {new Date((battlecard as any).verifiedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleCopyToClipboard(
                              JSON.stringify(battlecard, null, 2),
                              `${battlecard.competitor} Battlecard`
                            )
                          }
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveBattlecard(index)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-sm mb-2 text-green-600">Their Strengths</h4>
                      <ul className="list-disc list-inside text-sm space-y-1">
                        {battlecard.strengths.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm mb-2 text-red-600">Their Weaknesses</h4>
                      <ul className="list-disc list-inside text-sm space-y-1">
                        {battlecard.weaknesses.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm mb-2 text-blue-600">Our Differentiators</h4>
                      <ul className="list-disc list-inside text-sm space-y-1">
                        {battlecard.differentiators.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm mb-2">Objection Handlers</h4>
                      <div className="space-y-2">
                        {battlecard.objectionHandlers.map((oh, i) => (
                          <div key={i} className="bg-muted p-3 rounded">
                            <p className="text-sm font-medium">{oh.objection}</p>
                            <p className="text-sm text-muted-foreground mt-1">{oh.response}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* New fields from web intelligence */}
                    {(battlecard as any).customerSentiment && (
                      <div>
                        <h4 className="font-semibold text-sm mb-2 text-purple-600">Customer Sentiment</h4>
                        <p className="text-sm text-muted-foreground">
                          {(battlecard as any).customerSentiment}
                        </p>
                      </div>
                    )}

                    {(battlecard as any).recentNews && Array.isArray((battlecard as any).recentNews) && (battlecard as any).recentNews.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-sm mb-2 text-indigo-600">Recent News & Updates</h4>
                        <ul className="list-disc list-inside text-sm space-y-1">
                          {(battlecard as any).recentNews.map((news: string, i: number) => (
                            <li key={i}>{news}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {(battlecard as any).sourceUrls && Array.isArray((battlecard as any).sourceUrls) && (battlecard as any).sourceUrls.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-sm mb-2 text-muted-foreground">Sources Verified</h4>
                        <div className="flex flex-wrap gap-2">
                          {(battlecard as any).sourceUrls.map((url: string, i: number) => (
                            <a
                              key={i}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline"
                            >
                              Source {i + 1} →
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Demo Scripts Generator */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>Demo Scripts</span>
            <Badge variant="secondary">AI-Powered</Badge>
          </CardTitle>
          <CardDescription>
            Generate demo scripts for different meeting durations (5, 15, and 30 minutes)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleGenerateDemoScripts}
            disabled={isGeneratingScripts}
            className="w-full"
          >
            {isGeneratingScripts ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating Scripts...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate All Demo Scripts
              </>
            )}
          </Button>

          {(demoScripts['5min'] || demoScripts['15min'] || demoScripts['30min']) && (
            <div className="space-y-4 mt-6">
              {Object.entries(demoScripts).map(([duration, content]) => (
                content && (
                  <Card key={duration}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">
                          {duration === '5min' && '5-Minute Quick Demo'}
                          {duration === '15min' && '15-Minute Standard Demo'}
                          {duration === '30min' && '30-Minute Deep Dive'}
                        </CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyToClipboard(content, `${duration} Demo Script`)}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Textarea
                        value={content}
                        onChange={(e) =>
                          setDemoScripts({ ...demoScripts, [duration]: e.target.value })
                        }
                        rows={12}
                        className="font-mono text-sm"
                      />
                    </CardContent>
                  </Card>
                )
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Objection Handlers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>Objection Handlers</span>
            <Badge variant="secondary">AI-Powered</Badge>
          </CardTitle>
          <CardDescription>
            Generate responses to common sales objections with supporting data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleGenerateObjectionHandlers}
            disabled={isGeneratingObjections}
            className="w-full"
          >
            {isGeneratingObjections ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating Handlers...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Objection Handlers
              </>
            )}
          </Button>

          {/* Manual Add */}
          <div className="grid grid-cols-2 gap-3 mt-4 p-4 bg-muted rounded">
            <Input
              placeholder="Category (e.g., Pricing, Implementation)"
              value={newObjection.category}
              onChange={(e) => setNewObjection({ ...newObjection, category: e.target.value })}
            />
            <Input
              placeholder="Objection"
              value={newObjection.objection}
              onChange={(e) => setNewObjection({ ...newObjection, objection: e.target.value })}
            />
            <Textarea
              placeholder="Response"
              value={newObjection.response}
              onChange={(e) => setNewObjection({ ...newObjection, response: e.target.value })}
              rows={2}
              className="col-span-2"
            />
            <Input
              placeholder="Supporting Data (optional)"
              value={newObjection.supportingData}
              onChange={(e) => setNewObjection({ ...newObjection, supportingData: e.target.value })}
              className="col-span-2"
            />
            <Button onClick={handleAddObjection} className="col-span-2">
              <Plus className="w-4 h-4 mr-2" />
              Add Manual Objection Handler
            </Button>
          </div>

          {/* List */}
          {objectionHandlers.length > 0 && (
            <div className="space-y-3 mt-6">
              {objectionHandlers.map((handler) => (
                <Card key={handler.id} className="border-l-4 border-l-blue-500">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline">{handler.category}</Badge>
                        </div>
                        <p className="font-semibold text-sm mb-2">{handler.objection}</p>
                        <p className="text-sm text-muted-foreground mb-2">{handler.response}</p>
                        {handler.supportingData && (
                          <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                            <BarChart3 className="h-3 w-3 flex-shrink-0" /> {handler.supportingData}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveObjection(handler.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. Pricing Guidance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>Pricing Guidance</span>
            <Badge variant="secondary">AI-Powered</Badge>
          </CardTitle>
          <CardDescription>
            Strategic pricing recommendations, discount strategies, and competitive positioning
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleGeneratePricingGuidance}
            disabled={isGeneratingPricing}
            className="w-full"
          >
            {isGeneratingPricing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating Guidance...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Pricing Guidance
              </>
            )}
          </Button>

          {(pricingGuidance.tierRecommendations ||
            pricingGuidance.discountStrategy ||
            pricingGuidance.valueJustification ||
            pricingGuidance.competitivePositioning) && (
            <div className="space-y-4 mt-6">
              <div>
                <label className="text-sm font-semibold mb-2 block">Tier Recommendations</label>
                <Textarea
                  value={pricingGuidance.tierRecommendations}
                  onChange={(e) =>
                    setPricingGuidance({ ...pricingGuidance, tierRecommendations: e.target.value })
                  }
                  rows={4}
                  placeholder="Which pricing tier to recommend for different customer profiles..."
                />
              </div>

              <div>
                <label className="text-sm font-semibold mb-2 block">Discount Strategy</label>
                <Textarea
                  value={pricingGuidance.discountStrategy}
                  onChange={(e) =>
                    setPricingGuidance({ ...pricingGuidance, discountStrategy: e.target.value })
                  }
                  rows={4}
                  placeholder="When and how to offer discounts..."
                />
              </div>

              <div>
                <label className="text-sm font-semibold mb-2 block">Value Justification</label>
                <Textarea
                  value={pricingGuidance.valueJustification}
                  onChange={(e) =>
                    setPricingGuidance({ ...pricingGuidance, valueJustification: e.target.value })
                  }
                  rows={4}
                  placeholder="How to justify the price based on ROI and value delivered..."
                />
              </div>

              <div>
                <label className="text-sm font-semibold mb-2 block">Competitive Positioning</label>
                <Textarea
                  value={pricingGuidance.competitivePositioning}
                  onChange={(e) =>
                    setPricingGuidance({ ...pricingGuidance, competitivePositioning: e.target.value })
                  }
                  rows={4}
                  placeholder="How our pricing compares to competitors..."
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
