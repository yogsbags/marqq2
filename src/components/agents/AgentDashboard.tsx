import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Bot, 
  Brain, 
  Users, 
  Target, 
  PenTool, 
  BarChart3,
  Play,
  Pause,
  Settings,
  MessageSquare,
  Zap,
  CheckCircle,
  Clock,
  AlertTriangle,
  TrendingUp,
  Eye,
  Send
} from 'lucide-react';
import { AgentService } from '@/services/agentService';
import { Agent, AgentTask, AgentWorkflow } from '@/types/agent';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function AgentDashboard() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [workflows, setWorkflows] = useState<AgentWorkflow[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<Array<{role: string, content: string, timestamp: Date}>>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    loadAgents();
    loadWorkflows();
  }, []);

  const loadAgents = () => {
    const agentList = AgentService.getAgents();
    setAgents(agentList);
    if (agentList.length > 0 && !selectedAgent) {
      setSelectedAgent(agentList[0]);
    }
  };

  const loadWorkflows = () => {
    const workflowList = AgentService.getWorkflows();
    setWorkflows(workflowList);
  };

  const handleAgentChat = async () => {
    if (!selectedAgent || !chatMessage.trim()) return;

    setIsProcessing(true);
    try {
      const response = await AgentService.agentChat(selectedAgent.id, chatMessage);
      
      setChatHistory(prev => [
        ...prev,
        { role: 'user', content: chatMessage, timestamp: new Date() },
        { role: 'assistant', content: response, timestamp: new Date() }
      ]);
      
      setChatMessage('');
      toast.success('Agent responded successfully');
    } catch (error) {
      toast.error('Failed to get agent response');
    } finally {
      setIsProcessing(false);
    }
  };

  const executeAgentTask = async (agentId: string, taskType: AgentTask['type'], input: any) => {
    setIsProcessing(true);
    try {
      const task = await AgentService.executeTask(agentId, {
        type: taskType,
        description: `Execute ${taskType} task`,
        input
      });
      
      toast.success(`Task completed: ${task.description}`);
      loadAgents(); // Refresh agents to show updated task history
    } catch (error) {
      toast.error('Task execution failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const createSampleWorkflow = async () => {
    setIsProcessing(true);
    try {
      const agentIds = agents.map(a => a.id);
      const workflow = AgentService.createWorkflow(
        'Complete Marketing Analysis',
        'Comprehensive analysis including lead scoring, content generation, and campaign optimization',
        agentIds
      );
      
      // Execute workflow with sample data
      await AgentService.executeWorkflow(workflow.id, {
        email: 'john.doe@techcorp.com',
        company: 'TechCorp Solutions',
        campaignData: [
          { name: 'Search Ads', spend: 50000, conversions: 245 },
          { name: 'Social Media', spend: 30000, conversions: 156 }
        ],
        totalBudget: 100000,
        contentType: 'blog_post',
        topic: 'AI Marketing Automation'
      });
      
      loadWorkflows();
      toast.success('Sample workflow executed successfully');
    } catch (error) {
      toast.error('Workflow execution failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const getAgentIcon = (role: string) => {
    if (role.includes('Lead')) return Target;
    if (role.includes('Content')) return PenTool;
    if (role.includes('Optimization')) return TrendingUp;
    if (role.includes('Customer')) return Users;
    return Bot;
  };

  const getTaskStatusIcon = (status: AgentTask['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'processing':
        return <Clock className="h-4 w-4 text-orange-500 animate-spin" />;
      case 'failed':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
          Agentic AI Dashboard
        </h1>
        <p className="text-muted-foreground">
          Manage and interact with your autonomous AI marketing agents
        </p>
      </div>

      {/* Agent Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {agents.map((agent) => {
          const IconComponent = getAgentIcon(agent.role);
          return (
            <Card 
              key={agent.id} 
              className={cn(
                "transition-all duration-300 hover:scale-105 cursor-pointer",
                selectedAgent?.id === agent.id ? "ring-2 ring-purple-500" : ""
              )}
              onClick={() => setSelectedAgent(agent)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center space-x-2 text-sm">
                  <IconComponent className="h-4 w-4 text-purple-500" />
                  <span>{agent.name}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">{agent.role}</p>
                  <div className="flex items-center justify-between">
                    <Badge variant={agent.isActive ? "default" : "secondary"}>
                      {agent.isActive ? 'Active' : 'Idle'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {agent.completedTasks.length} tasks
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="chat">Agent Chat</TabsTrigger>
          <TabsTrigger value="tasks">Task Execution</TabsTrigger>
          <TabsTrigger value="workflows">Workflows</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {selectedAgent && (
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    {React.createElement(getAgentIcon(selectedAgent.role), { className: "h-5 w-5 text-purple-500" })}
                    <span>{selectedAgent.name}</span>
                  </CardTitle>
                  <CardDescription>{selectedAgent.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Capabilities</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedAgent.capabilities.map((capability, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {capability}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">Available Tools</h4>
                    <div className="space-y-2">
                      {selectedAgent.tools.map((tool, index) => (
                        <div key={index} className="flex items-center space-x-2 text-sm">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <span className="font-medium">{tool.name}</span>
                          <span className="text-muted-foreground">- {tool.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Performance Stats</h4>
                    <div className="grid gap-2 grid-cols-2">
                      <div className="text-center p-2 border rounded">
                        <div className="text-lg font-bold text-green-600">{selectedAgent.completedTasks.length}</div>
                        <div className="text-xs text-muted-foreground">Completed Tasks</div>
                      </div>
                      <div className="text-center p-2 border rounded">
                        <div className="text-lg font-bold text-blue-600">
                          {selectedAgent.completedTasks.filter(t => t.status === 'completed').length}
                        </div>
                        <div className="text-xs text-muted-foreground">Success Rate</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Tasks</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-64">
                    <div className="space-y-2">
                      {selectedAgent.completedTasks.length > 0 ? (
                        selectedAgent.completedTasks.slice(-5).map((task) => (
                          <div key={task.id} className="flex items-center space-x-3 p-2 border rounded">
                            {getTaskStatusIcon(task.status)}
                            <div className="flex-1">
                              <div className="text-sm font-medium">{task.description}</div>
                              <div className="text-xs text-muted-foreground">
                                {task.createdAt.toLocaleString()}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center text-muted-foreground py-8">
                          <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>No tasks completed yet</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="chat" className="space-y-4">
          {selectedAgent && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <MessageSquare className="h-5 w-5 text-blue-500" />
                  <span>Chat with {selectedAgent.name}</span>
                </CardTitle>
                <CardDescription>
                  Have a conversation with your AI agent to get marketing insights and recommendations
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ScrollArea className="h-64 border rounded-lg p-4">
                  <div className="space-y-3">
                    {chatHistory.length === 0 && (
                      <div className="text-center text-muted-foreground py-8">
                        <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>Start a conversation with {selectedAgent.name}</p>
                        <p className="text-xs">Ask about marketing strategies, campaign optimization, or data analysis</p>
                      </div>
                    )}
                    
                    {chatHistory.map((msg, index) => (
                      <div
                        key={index}
                        className={cn(
                          "flex",
                          msg.role === 'user' ? "justify-end" : "justify-start"
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[80%] p-3 rounded-lg",
                            msg.role === 'user' 
                              ? "bg-purple-500 text-white" 
                              : "bg-muted"
                          )}
                        >
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          <p className={cn(
                            "text-xs mt-1 opacity-70",
                            msg.role === 'user' ? "text-purple-100" : "text-muted-foreground"
                          )}>
                            {msg.timestamp.toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))}
                    
                    {isProcessing && (
                      <div className="flex justify-start">
                        <div className="bg-muted p-3 rounded-lg">
                          <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
                
                <div className="flex space-x-2">
                  <Input
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    placeholder="Ask your agent about marketing strategies..."
                    onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleAgentChat()}
                    disabled={isProcessing}
                  />
                  <Button 
                    onClick={handleAgentChat}
                    disabled={!chatMessage.trim() || isProcessing}
                    className="bg-purple-500 hover:bg-purple-600"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setChatMessage('Analyze my lead conversion rates and suggest improvements')}
                  >
                    Lead Analysis
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setChatMessage('Create a content strategy for Q1 2024')}
                  >
                    Content Strategy
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setChatMessage('How can I optimize my campaign budget allocation?')}
                  >
                    Budget Optimization
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="tasks" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Execute Agent Tasks</CardTitle>
                <CardDescription>
                  Run specific tasks with your AI agents
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 grid-cols-2">
                  <Button
                    variant="outline"
                    className="h-auto p-4 flex flex-col items-center space-y-2"
                    onClick={() => executeAgentTask(
                      agents.find(a => a.role.includes('Lead'))?.id || '',
                      'lead_analysis',
                      {
                        email: 'prospect@company.com',
                        company: 'Sample Corp',
                        customerDataset: Array(100).fill({}).map(() => ({
                          email: 'customer@example.com',
                          company: 'Example Inc',
                          revenue: Math.random() * 1000000
                        }))
                      }
                    )}
                    disabled={isProcessing}
                  >
                    <Target className="h-6 w-6 text-blue-500" />
                    <span className="text-sm">Lead Analysis</span>
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="h-auto p-4 flex flex-col items-center space-y-2"
                    onClick={() => executeAgentTask(
                      agents.find(a => a.role.includes('Content'))?.id || '',
                      'content_generation',
                      {
                        contentType: 'blog_post',
                        topic: 'AI Marketing Trends 2024',
                        audience: { segment: 'Marketing Professionals' },
                        optimizeForSEO: true,
                        targetKeywords: ['AI marketing', 'automation', 'ROI']
                      }
                    )}
                    disabled={isProcessing}
                  >
                    <PenTool className="h-6 w-6 text-green-500" />
                    <span className="text-sm">Content Generation</span>
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="h-auto p-4 flex flex-col items-center space-y-2"
                    onClick={() => executeAgentTask(
                      agents.find(a => a.role.includes('Optimization'))?.id || '',
                      'campaign_optimization',
                      {
                        campaignData: [
                          { name: 'Search Ads', spend: 50000, conversions: 245, ctr: 0.045 },
                          { name: 'Social Media', spend: 30000, conversions: 156, ctr: 0.032 },
                          { name: 'Display Ads', spend: 20000, conversions: 89, ctr: 0.018 }
                        ],
                        totalBudget: 100000,
                        timeframe: '30d'
                      }
                    )}
                    disabled={isProcessing}
                  >
                    <TrendingUp className="h-6 w-6 text-orange-500" />
                    <span className="text-sm">Campaign Optimization</span>
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="h-auto p-4 flex flex-col items-center space-y-2"
                    onClick={() => executeAgentTask(
                      agents.find(a => a.role.includes('Customer'))?.id || '',
                      'customer_segmentation',
                      {
                        customerData: Array(500).fill({}).map(() => ({
                          id: Math.random().toString(),
                          email: 'customer@example.com',
                          ltv: Math.random() * 10000,
                          engagementScore: Math.random() * 100,
                          lastActivity: new Date()
                        })),
                        criteria: { method: 'behavioral', includeChurnRisk: true }
                      }
                    )}
                    disabled={isProcessing}
                  >
                    <Users className="h-6 w-6 text-purple-500" />
                    <span className="text-sm">Customer Segmentation</span>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Task Results</CardTitle>
                <CardDescription>
                  View results from recently executed tasks
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-64">
                  <div className="space-y-2">
                    {agents.flatMap(agent => agent.completedTasks)
                      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                      .slice(0, 10)
                      .map((task) => (
                        <div key={task.id} className="p-3 border rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-sm">{task.description}</span>
                            {getTaskStatusIcon(task.status)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {task.createdAt.toLocaleString()}
                          </div>
                          {task.result && (
                            <div className="mt-2 text-xs">
                              <Badge className="bg-green-100 text-green-800">
                                Task completed successfully
                              </Badge>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="workflows" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Agent Workflows</span>
                <Button 
                  onClick={createSampleWorkflow}
                  disabled={isProcessing}
                  className="bg-purple-500 hover:bg-purple-600"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  Run Sample Workflow
                </Button>
              </CardTitle>
              <CardDescription>
                Orchestrate multiple agents to work together on complex marketing tasks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {workflows.length > 0 ? (
                  workflows.map((workflow) => (
                    <div key={workflow.id} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium">{workflow.name}</h4>
                        <Badge 
                          variant={workflow.status === 'completed' ? 'default' : 'secondary'}
                          className={cn(
                            workflow.status === 'completed' ? 'bg-green-100 text-green-800' : '',
                            workflow.status === 'running' ? 'bg-blue-100 text-blue-800' : '',
                            workflow.status === 'failed' ? 'bg-red-100 text-red-800' : ''
                          )}
                        >
                          {workflow.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{workflow.description}</p>
                      
                      <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                        <span>{workflow.agents.length} agents</span>
                        <span>{workflow.tasks.length} tasks</span>
                        <span>Created: {workflow.createdAt.toLocaleDateString()}</span>
                      </div>
                      
                      {workflow.tasks.length > 0 && (
                        <div className="mt-3">
                          <div className="flex items-center space-x-2 mb-2">
                            <span className="text-sm font-medium">Task Progress:</span>
                            <Progress 
                              value={(workflow.tasks.filter(t => t.status === 'completed').length / workflow.tasks.length) * 100} 
                              className="flex-1 h-2" 
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No workflows created yet</p>
                    <p className="text-xs">Click "Run Sample Workflow" to see agents in action</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Common agentic AI operations for your marketing platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-center space-y-2"
              onClick={() => {
                const leadAgent = agents.find(a => a.role.includes('Lead'));
                if (leadAgent) {
                  setChatMessage('Analyze our top 100 leads and identify the best prospects for immediate outreach');
                  setSelectedAgent(leadAgent);
                  setActiveTab('chat');
                }
              }}
            >
              <Target className="h-6 w-6 text-blue-500" />
              <span className="text-sm text-center">Analyze Top Leads</span>
            </Button>
            
            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-center space-y-2"
              onClick={() => {
                const contentAgent = agents.find(a => a.role.includes('Content'));
                if (contentAgent) {
                  setChatMessage('Create a week\'s worth of social media content for our AI marketing platform');
                  setSelectedAgent(contentAgent);
                  setActiveTab('chat');
                }
              }}
            >
              <PenTool className="h-6 w-6 text-green-500" />
              <span className="text-sm text-center">Generate Content</span>
            </Button>
            
            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-center space-y-2"
              onClick={() => {
                const optimizerAgent = agents.find(a => a.role.includes('Optimization'));
                if (optimizerAgent) {
                  setChatMessage('Review our current campaign performance and suggest budget optimizations');
                  setSelectedAgent(optimizerAgent);
                  setActiveTab('chat');
                }
              }}
            >
              <TrendingUp className="h-6 w-6 text-orange-500" />
              <span className="text-sm text-center">Optimize Campaigns</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}