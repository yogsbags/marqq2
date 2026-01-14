import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Plus,
  Trash2,
  Play,
  Clock,
  Bot,
  ArrowRight,
  Settings,
  Target,
  PenTool,
  TrendingUp,
  Users,
  Zap
} from 'lucide-react';
import { AgentService } from '@/services/agentService';
import { Agent } from '@/types/agent';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface WorkflowStep {
  id: string;
  agentId: string;
  taskType: 'lead_analysis' | 'content_generation' | 'campaign_optimization' | 'customer_segmentation';
  description: string;
  input: any;
}

export function AgentWorkflowBuilder() {
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [agents] = useState<Agent[]>(AgentService.getAgents());
  const [isExecuting, setIsExecuting] = useState(false);

  const addStep = () => {
    const newStep: WorkflowStep = {
      id: Date.now().toString(),
      agentId: agents[0]?.id || '',
      taskType: 'lead_analysis',
      description: '',
      input: {}
    };
    setSteps([...steps, newStep]);
  };

  const removeStep = (stepId: string) => {
    setSteps(steps.filter(step => step.id !== stepId));
  };

  const updateStep = (stepId: string, updates: Partial<WorkflowStep>) => {
    setSteps(steps.map(step =>
      step.id === stepId ? { ...step, ...updates } : step
    ));
  };

  const executeWorkflow = async () => {
    if (!workflowName.trim() || steps.length === 0) {
      toast.error('Please provide a workflow name and at least one step');
      return;
    }

    setIsExecuting(true);
    try {
      // Create workflow
      const workflow = AgentService.createWorkflow(
        workflowName,
        workflowDescription,
        steps.map(step => step.agentId)
      );

      // Execute each step sequentially
      for (const step of steps) {
        await AgentService.executeTask(step.agentId, {
          type: step.taskType,
          description: step.description,
          input: step.input
        });
      }

      toast.success('Workflow executed successfully! 🎉');

      // Reset form
      setWorkflowName('');
      setWorkflowDescription('');
      setSteps([]);
    } catch (error) {
      toast.error('Workflow execution failed');
    } finally {
      setIsExecuting(false);
    }
  };

  const getAgentIcon = (agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return Bot;

    if (agent.role.includes('Lead')) return Target;
    if (agent.role.includes('Content')) return PenTool;
    if (agent.role.includes('Optimization')) return TrendingUp;
    if (agent.role.includes('Customer')) return Users;
    return Bot;
  };

  const getTaskTypeColor = (taskType: string) => {
    switch (taskType) {
      case 'lead_analysis': return 'bg-blue-100 text-blue-800';
      case 'content_generation': return 'bg-green-100 text-green-800';
      case 'campaign_optimization': return 'bg-orange-100 text-orange-800';
      case 'customer_segmentation': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getSampleInput = (taskType: string) => {
    switch (taskType) {
      case 'lead_analysis':
        return JSON.stringify({
          email: 'prospect@company.com',
          company: 'Target Company',
          customerDataset: []
        }, null, 2);
      case 'content_generation':
        return JSON.stringify({
          contentType: 'blog_post',
          topic: 'AI Marketing Automation',
          audience: { segment: 'Marketing Professionals' },
          targetKeywords: ['AI', 'marketing', 'automation']
        }, null, 2);
      case 'campaign_optimization':
        return JSON.stringify({
          campaignData: [
            { name: 'Search Ads', spend: 50000, conversions: 245 }
          ],
          totalBudget: 100000
        }, null, 2);
      case 'customer_segmentation':
        return JSON.stringify({
          customerData: [],
          criteria: { method: 'behavioral' }
        }, null, 2);
      default:
        return '{}';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
          Agent Workflow Builder
        </h1>
        <p className="text-muted-foreground">
          Create custom workflows by chaining multiple AI agents together
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Workflow Configuration */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Workflow Configuration</CardTitle>
              <CardDescription>
                Define your multi-agent workflow for complex marketing tasks
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="workflow-name">Workflow Name</Label>
                  <Input
                    id="workflow-name"
                    value={workflowName}
                    onChange={(e) => setWorkflowName(e.target.value)}
                    placeholder="e.g., Complete Lead Analysis Pipeline"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="workflow-description">Description</Label>
                  <Input
                    id="workflow-description"
                    value={workflowDescription}
                    onChange={(e) => setWorkflowDescription(e.target.value)}
                    placeholder="Brief description of the workflow"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Workflow Steps */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Workflow Steps</span>
                <Button onClick={addStep} size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Step
                </Button>
              </CardTitle>
              <CardDescription>
                Define the sequence of agent tasks in your workflow
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {steps.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <Settings className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No steps added yet</p>
                    <p className="text-xs">Click "Add Step" to start building your workflow</p>
                  </div>
                ) : (
                  steps.map((step, index) => {
                    const agent = agents.find(a => a.id === step.agentId);
                    const IconComponent = getAgentIcon(step.agentId);

                    return (
                      <div key={step.id} className="relative">
                        <div className="flex items-start space-x-4 p-4 border rounded-lg">
                          <div className="flex-shrink-0 flex flex-col items-center">
                            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                              <span className="text-sm font-medium text-purple-600">{index + 1}</span>
                            </div>
                            {index < steps.length - 1 && (
                              <ArrowRight className="h-4 w-4 text-gray-400 mt-2 rotate-90" />
                            )}
                          </div>

                          <div className="flex-1 space-y-3">
                            <div className="grid gap-3 md:grid-cols-2">
                              <div>
                                <Label>Agent</Label>
                                <select
                                  value={step.agentId}
                                  onChange={(e) => updateStep(step.id, { agentId: e.target.value })}
                                  className="w-full p-2 border rounded-md bg-white text-gray-900"
                                >
                                  {agents.map(agent => (
                                    <option key={agent.id} value={agent.id}>
                                      {agent.name} - {agent.role}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <Label>Task Type</Label>
                                <select
                                  value={step.taskType}
                                  onChange={(e) => updateStep(step.id, {
                                    taskType: e.target.value as WorkflowStep['taskType'],
                                    input: JSON.parse(getSampleInput(e.target.value))
                                  })}
                                  className="w-full p-2 border rounded-md bg-white text-gray-900"
                                >
                                  <option value="lead_analysis">Lead Analysis</option>
                                  <option value="content_generation">Content Generation</option>
                                  <option value="campaign_optimization">Campaign Optimization</option>
                                  <option value="customer_segmentation">Customer Segmentation</option>
                                </select>
                              </div>
                            </div>

                            <div>
                              <Label>Step Description</Label>
                              <Input
                                value={step.description}
                                onChange={(e) => updateStep(step.id, { description: e.target.value })}
                                placeholder="Describe what this step should accomplish"
                              />
                            </div>

                            <div>
                              <Label>Input Data (JSON)</Label>
                              <Textarea
                                value={JSON.stringify(step.input, null, 2)}
                                onChange={(e) => {
                                  try {
                                    const parsed = JSON.parse(e.target.value);
                                    updateStep(step.id, { input: parsed });
                                  } catch {
                                    // Invalid JSON, don't update
                                  }
                                }}
                                rows={4}
                                className="font-mono text-xs"
                              />
                            </div>

                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <IconComponent className="h-4 w-4 text-purple-500" />
                                <span className="text-sm font-medium">{agent?.name}</span>
                                <Badge className={getTaskTypeColor(step.taskType)}>
                                  {step.taskType.replace('_', ' ')}
                                </Badge>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeStep(step.id)}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>

          {/* Execute Workflow */}
          {steps.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Ready to Execute</h4>
                    <p className="text-sm text-muted-foreground">
                      {steps.length} steps configured with {new Set(steps.map(s => s.agentId)).size} agents
                    </p>
                  </div>
                  <Button
                    onClick={executeWorkflow}
                    disabled={isExecuting || !workflowName.trim()}
                    className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
                  >
                    {isExecuting ? (
                      <>
                        <Clock className="h-4 w-4 mr-2 animate-spin" />
                        Executing...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Execute Workflow
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Available Agents */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Available Agents</CardTitle>
              <CardDescription>
                Drag and drop agents to build your workflow
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {agents.map((agent) => {
                  const IconComponent = getAgentIcon(agent.id);
                  return (
                    <div
                      key={agent.id}
                      className="p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => {
                        const newStep: WorkflowStep = {
                          id: Date.now().toString(),
                          agentId: agent.id,
                          taskType: agent.role.includes('Lead') ? 'lead_analysis' :
                                   agent.role.includes('Content') ? 'content_generation' :
                                   agent.role.includes('Optimization') ? 'campaign_optimization' :
                                   'customer_segmentation',
                          description: `${agent.name} task`,
                          input: {}
                        };
                        setSteps([...steps, newStep]);
                        toast.success(`Added ${agent.name} to workflow`);
                      }}
                    >
                      <div className="flex items-center space-x-3">
                        <IconComponent className="h-5 w-5 text-purple-500" />
                        <div className="flex-1">
                          <div className="font-medium text-sm">{agent.name}</div>
                          <div className="text-xs text-muted-foreground">{agent.role}</div>
                        </div>
                        <Badge variant={agent.isActive ? "default" : "secondary"} className="text-xs">
                          {agent.isActive ? 'Active' : 'Idle'}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Workflow Templates */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Templates</CardTitle>
              <CardDescription>
                Pre-built workflow templates for common marketing tasks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start text-left h-auto p-3"
                  onClick={() => {
                    setWorkflowName('Complete Lead Analysis');
                    setWorkflowDescription('End-to-end lead analysis with scoring and recommendations');
                    setSteps([
                      {
                        id: '1',
                        agentId: agents.find(a => a.role.includes('Lead'))?.id || '',
                        taskType: 'lead_analysis',
                        description: 'Analyze and score leads',
                        input: {
                          email: 'prospect@company.com',
                          company: 'Target Company'
                        }
                      }
                    ]);
                  }}
                >
                  <div>
                    <div className="font-medium">Complete Lead Analysis</div>
                    <div className="text-xs text-muted-foreground">Lead scoring + ICP analysis</div>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start text-left h-auto p-3"
                  onClick={() => {
                    setWorkflowName('Content Marketing Pipeline');
                    setWorkflowDescription('Generate and optimize content for multiple channels');
                    setSteps([
                      {
                        id: '1',
                        agentId: agents.find(a => a.role.includes('Customer'))?.id || '',
                        taskType: 'customer_segmentation',
                        description: 'Analyze target audience',
                        input: { customerData: [], criteria: {} }
                      },
                      {
                        id: '2',
                        agentId: agents.find(a => a.role.includes('Content'))?.id || '',
                        taskType: 'content_generation',
                        description: 'Generate targeted content',
                        input: {
                          contentType: 'blog_post',
                          topic: 'Marketing Automation',
                          audience: { segment: 'Business Professionals' }
                        }
                      }
                    ]);
                  }}
                >
                  <div>
                    <div className="font-medium">Content Marketing Pipeline</div>
                    <div className="text-xs text-muted-foreground">Audience analysis + content creation</div>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start text-left h-auto p-3"
                  onClick={() => {
                    setWorkflowName('Campaign Optimization Suite');
                    setWorkflowDescription('Comprehensive campaign analysis and optimization');
                    setSteps([
                      {
                        id: '1',
                        agentId: agents.find(a => a.role.includes('Optimization'))?.id || '',
                        taskType: 'campaign_optimization',
                        description: 'Analyze campaign performance',
                        input: {
                          campaignData: [
                            { name: 'Search Ads', spend: 50000, conversions: 245 }
                          ],
                          totalBudget: 100000
                        }
                      }
                    ]);
                  }}
                >
                  <div>
                    <div className="font-medium">Campaign Optimization Suite</div>
                    <div className="text-xs text-muted-foreground">Performance analysis + budget optimization</div>
                  </div>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Workflow Preview */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Workflow Preview</CardTitle>
              <CardDescription>
                Visual representation of your workflow
              </CardDescription>
            </CardHeader>
            <CardContent>
              {steps.length > 0 ? (
                <div className="space-y-3">
                  {steps.map((step, index) => {
                    const agent = agents.find(a => a.id === step.agentId);
                    const IconComponent = getAgentIcon(step.agentId);

                    return (
                      <div key={step.id} className="relative">
                        <div className="flex items-center space-x-3 p-3 border rounded-lg">
                          <div className="flex-shrink-0">
                            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                              <IconComponent className="h-4 w-4 text-purple-600" />
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="font-medium text-sm">{agent?.name}</div>
                            <Badge className={cn("text-xs", getTaskTypeColor(step.taskType))}>
                              {step.taskType.replace('_', ' ')}
                            </Badge>
                          </div>
                        </div>
                        {index < steps.length - 1 && (
                          <div className="flex justify-center my-2">
                            <ArrowRight className="h-4 w-4 text-gray-400 rotate-90" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <Zap className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No steps configured</p>
                  <p className="text-xs">Add agents to see workflow preview</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Execution Summary */}
          {steps.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Execution Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Total Steps:</span>
                    <span className="font-medium">{steps.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Agents Involved:</span>
                    <span className="font-medium">{new Set(steps.map(s => s.agentId)).size}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Estimated Time:</span>
                    <span className="font-medium">{steps.length * 2}-{steps.length * 5} min</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
