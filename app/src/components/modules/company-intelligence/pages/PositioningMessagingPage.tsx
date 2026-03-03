import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { GtmContextBanner } from '@/components/ui/gtm-context-banner';
import { useGtmContext } from '@/lib/gtmContext';
import { HiSparkles as Sparkles, HiPlus as Plus, HiTrash as Trash, HiRefresh as Refresh } from 'react-icons/hi';
import { Check, X as XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { savePositioning, loadPositioning, createAutoSave } from '@/lib/persistence';
import type { ArtifactRecord } from '../api';

interface MessagingPillar {
  id: string;
  pillar: string;
  description: string;
  audienceRelevance: string;
}

interface BrandVoice {
  tone: string[];
  dosList: string[];
  dontsList: string[];
}

interface ElevatorPitches {
  short: string;   // 30-second version
  medium: string;  // 1-minute version
  long: string;    // 2-minute version
}

interface Props {
  artifact?: ArtifactRecord | null;
}

export function PositioningMessagingPage({ artifact }: Props = {}) {
  const { context: gtmContext, isFromGtm, dismiss: dismissGtmContext } = useGtmContext('company_intel_marketing_strategy');

  // Value Proposition
  const [valueProposition, setValueProposition] = useState('');
  const [isGeneratingVP, setIsGeneratingVP] = useState(false);

  // Messaging Pillars
  const [messagingPillars, setMessagingPillars] = useState<MessagingPillar[]>([]);
  const [isGeneratingPillars, setIsGeneratingPillars] = useState(false);

  // Differentiators
  const [differentiators, setDifferentiators] = useState<string[]>([]);
  const [newDifferentiator, setNewDifferentiator] = useState('');

  // Brand Voice
  const [brandVoice, setBrandVoice] = useState<BrandVoice>({
    tone: [],
    dosList: [],
    dontsList: [],
  });
  const [newTone, setNewTone] = useState('');
  const [newDo, setNewDo] = useState('');
  const [newDont, setNewDont] = useState('');

  // Elevator Pitches
  const [elevatorPitches, setElevatorPitches] = useState<ElevatorPitches>({
    short: '',
    medium: '',
    long: '',
  });
  const [isGeneratingPitches, setIsGeneratingPitches] = useState(false);

  // Auto-save setup
  const autoSave = useMemo(
    () => createAutoSave(savePositioning, 2000),
    []
  );

  // Load saved data on mount; fall back to AI artifact if no saved data
  useEffect(() => {
    loadPositioning()
      .then(data => {
        // Only use saved data if it has actual content (prevents empty auto-saved rows
        // from blocking artifact seeding when the user first visits the page)
        const hasSavedContent = !!(
          data?.valueProposition?.trim() ||
          (data?.messagingPillars?.length ?? 0) > 0 ||
          (data?.differentiators?.length ?? 0) > 0 ||
          data?.elevatorPitchShort?.trim() ||
          data?.elevatorPitchMedium?.trim() ||
          data?.elevatorPitchLong?.trim()
        );
        if (hasSavedContent) {
          setValueProposition(data!.valueProposition || '');
          setMessagingPillars(data!.messagingPillars || []);
          setDifferentiators(data!.differentiators || []);
          setBrandVoice({
            tone: data!.brandVoiceTone || [],
            dosList: data!.brandVoiceDos || [],
            dontsList: data!.brandVoiceDonts || [],
          });
          setElevatorPitches({
            short: data!.elevatorPitchShort || '',
            medium: data!.elevatorPitchMedium || '',
            long: data!.elevatorPitchLong || '',
          });
        } else if (artifact?.data) {
          // No saved data — seed from AI-generated artifact
          const d = artifact.data as {
            valueProposition?: string;
            differentiators?: string[];
            messagingPillars?: Array<{ pillar?: string; description?: string; audienceRelevance?: string }>;
            brandVoice?: { tone?: string[]; dosList?: string[]; dontsList?: string[] };
            elevatorPitches?: { short?: string; medium?: string; long?: string };
          };
          if (d.valueProposition) setValueProposition(d.valueProposition);
          if (d.differentiators?.length) setDifferentiators(d.differentiators);
          if (d.messagingPillars?.length) {
            setMessagingPillars(
              d.messagingPillars.map((p, i) => ({
                id: `pillar-${i}-${Date.now()}`,
                pillar: p.pillar || '',
                description: p.description || '',
                audienceRelevance: p.audienceRelevance || '',
              }))
            );
          }
          if (d.brandVoice) {
            setBrandVoice({
              tone: d.brandVoice.tone || [],
              dosList: d.brandVoice.dosList || [],
              dontsList: d.brandVoice.dontsList || [],
            });
          }
          if (d.elevatorPitches) {
            setElevatorPitches({
              short: d.elevatorPitches.short || '',
              medium: d.elevatorPitches.medium || '',
              long: d.elevatorPitches.long || '',
            });
          }
        }
      })
      .catch(err => {
        console.error('Failed to load positioning data:', err);
      });
  }, [artifact]);

  // Auto-save on state changes — skip if there's nothing to save yet
  // (prevents creating an empty stub row that would block artifact seeding)
  useEffect(() => {
    const hasContent =
      valueProposition.trim() ||
      messagingPillars.length > 0 ||
      differentiators.length > 0 ||
      brandVoice.tone.length > 0 ||
      elevatorPitches.short.trim() ||
      elevatorPitches.medium.trim() ||
      elevatorPitches.long.trim();
    if (!hasContent) return;
    autoSave({
      valueProposition,
      messagingPillars,
      differentiators,
      brandVoiceTone: brandVoice.tone,
      brandVoiceDos: brandVoice.dosList,
      brandVoiceDonts: brandVoice.dontsList,
      elevatorPitchShort: elevatorPitches.short,
      elevatorPitchMedium: elevatorPitches.medium,
      elevatorPitchLong: elevatorPitches.long,
      gtmContext: gtmContext,
    });
  }, [valueProposition, messagingPillars, differentiators, brandVoice, elevatorPitches, gtmContext, autoSave]);

  const handleGenerateValueProp = async () => {
    setIsGeneratingVP(true);
    try {
      const response = await fetch('/api/positioning/value-proposition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            companyName: 'Torqq AI',
            industry: 'B2B Marketing Technology',
            targetAudience: 'Marketing teams at B2B SaaS companies',
            gtmInsights: gtmContext?.bullets || [],
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate value proposition');
      }

      const data = await response.json();
      setValueProposition(data.valueProposition);
      toast.success('Value proposition generated!');
    } catch (error) {
      console.error('Value proposition generation error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate value proposition');
    } finally {
      setIsGeneratingVP(false);
    }
  };

  const handleGeneratePillars = async () => {
    setIsGeneratingPillars(true);
    try {
      const response = await fetch('/api/positioning/messaging-pillars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            valueProposition: valueProposition || undefined,
            targetAudience: 'Marketing teams at B2B SaaS companies',
            gtmInsights: gtmContext?.bullets || [],
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate messaging pillars');
      }

      const data = await response.json();
      setMessagingPillars(data.pillars);
      toast.success('Messaging pillars generated!');
    } catch (error) {
      console.error('Messaging pillars generation error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate messaging pillars');
    } finally {
      setIsGeneratingPillars(false);
    }
  };

  const handleGenerateElevatorPitches = async () => {
    setIsGeneratingPitches(true);
    try {
      const response = await fetch('/api/positioning/elevator-pitches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            companyName: 'Torqq AI',
            valueProposition: valueProposition || undefined,
            targetAudience: 'Marketing teams at B2B SaaS companies',
            messagingPillars: messagingPillars.map(p => ({
              pillar: p.pillar,
              description: p.description,
            })),
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate elevator pitches');
      }

      const data = await response.json();
      setElevatorPitches({
        short: data.short,
        medium: data.medium,
        long: data.long,
      });
      toast.success('Elevator pitches generated!');
    } catch (error) {
      console.error('Elevator pitches generation error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate elevator pitches');
    } finally {
      setIsGeneratingPitches(false);
    }
  };

  const addDifferentiator = () => {
    if (!newDifferentiator.trim()) return;
    setDifferentiators([...differentiators, newDifferentiator.trim()]);
    setNewDifferentiator('');
  };

  const removeDifferentiator = (index: number) => {
    setDifferentiators(differentiators.filter((_, i) => i !== index));
  };

  const addTone = () => {
    if (!newTone.trim()) return;
    setBrandVoice({ ...brandVoice, tone: [...brandVoice.tone, newTone.trim()] });
    setNewTone('');
  };

  const removeTone = (index: number) => {
    setBrandVoice({ ...brandVoice, tone: brandVoice.tone.filter((_, i) => i !== index) });
  };

  const addDo = () => {
    if (!newDo.trim()) return;
    setBrandVoice({ ...brandVoice, dosList: [...brandVoice.dosList, newDo.trim()] });
    setNewDo('');
  };

  const removeDo = (index: number) => {
    setBrandVoice({ ...brandVoice, dosList: brandVoice.dosList.filter((_, i) => i !== index) });
  };

  const addDont = () => {
    if (!newDont.trim()) return;
    setBrandVoice({ ...brandVoice, dontsList: [...brandVoice.dontsList, newDont.trim()] });
    setNewDont('');
  };

  const removeDont = (index: number) => {
    setBrandVoice({ ...brandVoice, dontsList: brandVoice.dontsList.filter((_, i) => i !== index) });
  };

  const addPillar = () => {
    const newPillar: MessagingPillar = {
      id: Date.now().toString(),
      pillar: '',
      description: '',
      audienceRelevance: '',
    };
    setMessagingPillars([...messagingPillars, newPillar]);
  };

  const updatePillar = (id: string, field: keyof MessagingPillar, value: string) => {
    setMessagingPillars(
      messagingPillars.map(p => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const removePillar = (id: string) => {
    setMessagingPillars(messagingPillars.filter(p => p.id !== id));
  };

  return (
    <div className="space-y-6">
      {isFromGtm && gtmContext && (
        <GtmContextBanner context={gtmContext} onDismiss={dismissGtmContext} />
      )}

      {/* Value Proposition Builder */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-orange-600" />
            Value Proposition
          </CardTitle>
          <CardDescription>
            Your core value proposition in one compelling sentence. This is the foundation of all messaging.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={valueProposition}
            onChange={(e) => setValueProposition(e.target.value)}
            placeholder="We help [target audience] achieve [desired outcome] through [unique approach] that delivers [quantifiable benefit]."
            className="min-h-[100px]"
          />
        </CardContent>
        <CardFooter>
          <Button
            onClick={handleGenerateValueProp}
            disabled={isGeneratingVP}
            className="bg-orange-500 hover:bg-orange-600"
          >
            {isGeneratingVP ? (
              <>
                <Refresh className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate with AI
              </>
            )}
          </Button>
        </CardFooter>
      </Card>

      {/* Messaging Pillars */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Messaging Pillars (3-5 key themes)
          </CardTitle>
          <CardDescription>
            Core themes that support your value proposition and resonate with different audience segments.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {messagingPillars.map((pillar) => (
            <Card key={pillar.id} className="relative">
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-2 top-2 h-6 w-6 p-0"
                onClick={() => removePillar(pillar.id)}
              >
                <Trash className="h-4 w-4 text-red-600" />
              </Button>
              <CardContent className="pt-6 space-y-3">
                <div>
                  <Label>Pillar Name</Label>
                  <Input
                    value={pillar.pillar}
                    onChange={(e) => updatePillar(pillar.id, 'pillar', e.target.value)}
                    placeholder="e.g., Speed to Market"
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={pillar.description}
                    onChange={(e) => updatePillar(pillar.id, 'description', e.target.value)}
                    placeholder="What this pillar means and why it matters"
                    className="min-h-[60px]"
                  />
                </div>
                <div>
                  <Label>Audience Relevance</Label>
                  <Input
                    value={pillar.audienceRelevance}
                    onChange={(e) => updatePillar(pillar.id, 'audienceRelevance', e.target.value)}
                    placeholder="Which audience segment cares most about this"
                  />
                </div>
              </CardContent>
            </Card>
          ))}

          {messagingPillars.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No messaging pillars yet. Generate with AI or add manually.
            </div>
          )}
        </CardContent>
        <CardFooter className="gap-2">
          <Button
            onClick={handleGeneratePillars}
            disabled={isGeneratingPillars}
            className="bg-orange-500 hover:bg-orange-600"
          >
            {isGeneratingPillars ? (
              <>
                <Refresh className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate with AI
              </>
            )}
          </Button>
          <Button variant="outline" onClick={addPillar}>
            <Plus className="mr-2 h-4 w-4" />
            Add Manually
          </Button>
        </CardFooter>
      </Card>

      {/* Differentiators */}
      <Card>
        <CardHeader>
          <CardTitle>Key Differentiators</CardTitle>
          <CardDescription>
            What makes you uniquely different from competitors? Be specific and quantifiable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newDifferentiator}
              onChange={(e) => setNewDifferentiator(e.target.value)}
              placeholder="e.g., Only platform with autonomous AI agents"
              onKeyPress={(e) => e.key === 'Enter' && addDifferentiator()}
            />
            <Button onClick={addDifferentiator}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {differentiators.map((diff, idx) => (
              <Badge key={idx} variant="secondary" className="gap-2 px-3 py-1.5">
                {diff}
                <button onClick={() => removeDifferentiator(idx)} className="ml-1">
                  <Trash className="h-3 w-3 text-red-600" />
                </button>
              </Badge>
            ))}
          </div>

          {differentiators.length === 0 && (
            <div className="text-center py-4 text-sm text-muted-foreground">
              Add your key differentiators
            </div>
          )}
        </CardContent>
      </Card>

      {/* Brand Voice */}
      <Card>
        <CardHeader>
          <CardTitle>Brand Voice Guidelines</CardTitle>
          <CardDescription>
            Define your brand personality and communication style.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Tone */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Tone Attributes</Label>
            <div className="flex gap-2">
              <Input
                value={newTone}
                onChange={(e) => setNewTone(e.target.value)}
                placeholder="e.g., Professional, Data-driven, Approachable"
                onKeyPress={(e) => e.key === 'Enter' && addTone()}
              />
              <Button onClick={addTone} size="sm">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {brandVoice.tone.map((tone, idx) => (
                <Badge key={idx} className="gap-2 px-3 py-1.5 bg-orange-500">
                  {tone}
                  <button onClick={() => removeTone(idx)}>
                    <Trash className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          <Separator />

          {/* Do's */}
          <div className="space-y-3">
            <Label className="text-base font-semibold text-green-600 flex items-center gap-1">Do's <Check className="h-4 w-4" /></Label>
            <div className="flex gap-2">
              <Input
                value={newDo}
                onChange={(e) => setNewDo(e.target.value)}
                placeholder="e.g., Use data and metrics to back claims"
                onKeyPress={(e) => e.key === 'Enter' && addDo()}
              />
              <Button onClick={addDo} size="sm" variant="outline">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {brandVoice.dosList.map((item, idx) => (
                <li key={idx} className="flex items-start justify-between">
                  <span>{item}</span>
                  <button onClick={() => removeDo(idx)}>
                    <Trash className="h-3 w-3 text-red-600" />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <Separator />

          {/* Don'ts */}
          <div className="space-y-3">
            <Label className="text-base font-semibold text-red-600 flex items-center gap-1">Don'ts <XIcon className="h-4 w-4" /></Label>
            <div className="flex gap-2">
              <Input
                value={newDont}
                onChange={(e) => setNewDont(e.target.value)}
                placeholder="e.g., Don't use jargon or buzzwords"
                onKeyPress={(e) => e.key === 'Enter' && addDont()}
              />
              <Button onClick={addDont} size="sm" variant="outline">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {brandVoice.dontsList.map((item, idx) => (
                <li key={idx} className="flex items-start justify-between">
                  <span>{item}</span>
                  <button onClick={() => removeDont(idx)}>
                    <Trash className="h-3 w-3 text-red-600" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Elevator Pitches */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-orange-600" />
            Elevator Pitches
          </CardTitle>
          <CardDescription>
            Three versions of your pitch for different time constraints.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label className="text-base font-semibold">30-Second Pitch</Label>
            <Textarea
              value={elevatorPitches.short}
              onChange={(e) => setElevatorPitches({ ...elevatorPitches, short: e.target.value })}
              placeholder="Quick intro for networking events or cold outreach"
              className="min-h-[80px]"
            />
          </div>

          <Separator />

          <div className="space-y-3">
            <Label className="text-base font-semibold">1-Minute Pitch</Label>
            <Textarea
              value={elevatorPitches.medium}
              onChange={(e) => setElevatorPitches({ ...elevatorPitches, medium: e.target.value })}
              placeholder="Standard elevator pitch for discovery calls"
              className="min-h-[100px]"
            />
          </div>

          <Separator />

          <div className="space-y-3">
            <Label className="text-base font-semibold">2-Minute Pitch</Label>
            <Textarea
              value={elevatorPitches.long}
              onChange={(e) => setElevatorPitches({ ...elevatorPitches, long: e.target.value })}
              placeholder="Extended pitch for demos or deeper conversations"
              className="min-h-[120px]"
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button
            onClick={handleGenerateElevatorPitches}
            disabled={isGeneratingPitches}
            className="bg-orange-500 hover:bg-orange-600"
          >
            {isGeneratingPitches ? (
              <>
                <Refresh className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate All with AI
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
