import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Upload, 
  PenTool, 
  Brain, 
  Eye, 
  Send, 
  BarChart3, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  Zap,
  FileText,
  Image,
  Video,
  Megaphone
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { AgentService } from '@/services/agentService';

interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress?: number;
}

export function AIContentFlow() {
  const [currentStep, setCurrentStep] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');
  
  const [steps, setSteps] = useState<WorkflowStep[]>([
    {
      id: 'upload',
      title: 'Upload Brand Assets',
      description: 'Upload brand guidelines and existing content',
      icon: Upload,
      status: 'pending'
    },
    {
      id: 'analysis',
      title: 'AI Content Analysis',
      description: 'AI analyzes brand voice and content patterns',
      icon: Brain,
      status: 'pending'
    },
    {
      id: 'generation',
      title: 'Generate Content',
      description: 'AI creates personalized content at scale',
      icon: PenTool,
      status: 'pending'
    },
    {
      id: 'review',
      title: 'Content Review',
      description: 'Review and approve generated content',
      icon: Eye,
      status: 'pending'
    },
    {
      id: 'publish',
      title: 'Publish Content',
      description: 'Deploy content across multiple channels',
      icon: Send,
      status: 'pending'
    },
    {
      id: 'performance',
      title: 'Performance Tracking',
      description: 'Monitor content performance and engagement',
      icon: BarChart3,
      status: 'pending'
    }
  ]);

  const updateStepStatus = (stepIndex: number, status: WorkflowStep['status'], progress?: number) => {
    setSteps(prev => prev.map((step, index) => 
      index === stepIndex ? { ...step, status, progress } : step
    ));
  };

  const deployAIContent = async () => {
    setIsProcessing(true);
    
    try {
      // Execute actual AI agent tasks for content generation
      const contentAgent = AgentService.getAgents().find(agent => agent.role.includes('Content'));
      if (contentAgent) {
        // Execute content generation task
        await AgentService.executeTask(contentAgent.id, {
          type: 'content_generation',
          description: 'Generate AI-powered marketing content across multiple channels',
          input: {
            contentType: 'multi_channel_campaign',
            topic: 'AI Marketing Automation Benefits',
            audience: { segment: 'Marketing Professionals' },
            channels: ['blog', 'social_media', 'email', 'ads'],
            brandGuidelines: {
              tone: 'Professional & Innovative',
              style: 'Data-driven & Results-focused'
            }
          }
        });
      }

      for (let i = currentStep; i < steps.length; i++) {
        updateStepStatus(i, 'processing', 0);
        
        for (let progress = 0; progress <= 100; progress += 20) {
          updateStepStatus(i, 'processing', progress);
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        updateStepStatus(i, 'completed', 100);
        
        if (i < steps.length - 1) {
          setCurrentStep(i + 1);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      toast.success('AI Content Generation workflow completed successfully! 🎉');
      setActiveTab('performance'); // Auto-switch to last tab
    } catch (error) {
      toast.error('AI Content Generation workflow failed. Please try again.');
      updateStepStatus(currentStep, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = ['.xlsx', '.xls', '.csv', '.pdf', '.txt', '.docx'];
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      
      if (!validTypes.includes(fileExtension)) {
        toast.error('Please upload a valid file (.xlsx, .xls, .csv, .pdf, .txt, .docx)');
        return;
      }
      
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File size must be less than 10MB');
        return;
      }
      
      setUploadedFile(file);
      updateStepStatus(0, 'completed');
      setCurrentStep(1);
      toast.success(`${file.name} uploaded successfully! 🎉`);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    
    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      
      // Create a synthetic event to reuse the existing upload logic
      const syntheticEvent = {
        target: { files: [file] }
      } as React.ChangeEvent<HTMLInputElement>;
      
      handleFileUpload(syntheticEvent);
    }
  };

  const getStepIcon = (step: WorkflowStep) => {
    const IconComponent = step.icon;
    
    if (step.status === 'completed') {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    } else if (step.status === 'processing') {
      return <Clock className="h-5 w-5 text-orange-500 animate-spin" />;
    } else if (step.status === 'error') {
      return <AlertCircle className="h-5 w-5 text-red-500" />;
    }
    
    return <IconComponent className="h-5 w-5 text-gray-400" />;
  };

  const getStepStatus = (step: WorkflowStep) => {
    switch (step.status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case 'processing':
        return <Badge className="bg-orange-100 text-orange-800">Processing</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent">
          AI Content Generation
        </h1>
        <p className="text-muted-foreground">
          Create engaging, personalized content at scale using AI-powered content generation
        </p>
      </div>

      {/* Workflow Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Zap className="h-5 w-5 text-cyan-500" />
            <span>Content Generation Workflow</span>
          </CardTitle>
          <CardDescription>
            Follow the sequential steps to deploy AI-powered content generation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={cn(
                  "flex items-center space-x-4 p-4 rounded-lg border transition-all duration-300",
                  index === currentStep ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20" : "border-gray-200",
                  step.status === 'completed' ? "bg-green-50 dark:bg-green-900/20 border-green-200" : "",
                  step.status === 'error' ? "bg-red-50 dark:bg-red-900/20 border-red-200" : ""
                )}
              >
                <div className="flex-shrink-0">
                  {getStepIcon(step)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">{step.title}</h3>
                    {getStepStatus(step)}
                  </div>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                  {step.status === 'processing' && step.progress !== undefined && (
                    <Progress value={step.progress} className="mt-2 h-2" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          {steps.map((step, index) => (
            <TabsTrigger
              key={step.id}
              value={step.id}
              className={cn(
                "text-xs",
                step.status === 'completed' ? "text-green-600" : "",
                index === currentStep ? "text-cyan-600" : ""
              )}
            >
              {step.title.split(' ')[0]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="upload" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Upload className="h-5 w-5 text-blue-500" />
                <span>Upload Brand Assets</span>
              </CardTitle>
              <CardDescription>
                Upload brand guidelines, logos, and existing content
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div 
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-cyan-400 transition-colors cursor-pointer"
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById('content-file-upload')?.click()}
              >
                <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <div className="space-y-2">
                  <span className="text-lg font-medium">Drop your brand assets here</span>
                  <p className="text-sm text-muted-foreground">or click to browse</p>
                  <p className="text-xs text-muted-foreground">Supports documents, images, and content files (max 10MB)</p>
                </div>
              </div>
              
              <Input
                id="content-file-upload"
                type="file"
                accept=".xlsx,.xls,.csv,.pdf,.txt,.docx,.jpg,.jpeg,.png,.gif"
                onChange={handleFileUpload}
                className="hidden"
              />
              
              {uploadedFile && (
                <div className="flex items-center space-x-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-green-800 dark:text-green-200">{uploadedFile.name}</span>
                    <p className="text-xs text-green-600 dark:text-green-300">
                      {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB • Ready for processing
                    </p>
                  </div>
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100">
                    Uploaded
                  </Badge>
                </div>
              )}
              
              <div className="grid gap-4 md:grid-cols-3 mt-6">
                <Card className="p-4 text-center">
                  <FileText className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                  <h4 className="font-medium">Brand Guidelines</h4>
                  <p className="text-sm text-muted-foreground">Voice, tone, style guides</p>
                </Card>
                <Card className="p-4 text-center">
                  <Image className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <h4 className="font-medium">Visual Assets</h4>
                  <p className="text-sm text-muted-foreground">Logos, images, graphics</p>
                </Card>
                <Card className="p-4 text-center">
                  <PenTool className="h-8 w-8 text-purple-500 mx-auto mb-2" />
                  <h4 className="font-medium">Existing Content</h4>
                  <p className="text-sm text-muted-foreground">Blogs, social posts, emails</p>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Brain className="h-5 w-5 text-purple-500" />
                <span>AI Content Analysis</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="p-4">
                  <h4 className="font-medium mb-3">Brand Voice Analysis</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Tone:</span>
                      <span className="font-medium">Professional & Friendly</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Style:</span>
                      <span className="font-medium">Conversational</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Audience:</span>
                      <span className="font-medium">Business Professionals</span>
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <h4 className="font-medium mb-3">Content Patterns</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Avg. Length:</span>
                      <span className="font-medium">250-400 words</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Key Topics:</span>
                      <span className="font-medium">Technology, Innovation</span>
                    </div>
                    <div className="flex justify-between">
                      <span>CTA Style:</span>
                      <span className="font-medium">Action-oriented</span>
                    </div>
                  </div>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="generation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <PenTool className="h-5 w-5 text-green-500" />
                <span>AI Content Generation</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-4">
                  <h4 className="font-medium">Content Types</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span>Blog Posts</span>
                      <Badge className="bg-blue-100 text-blue-800">450 generated</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span>Social Media Posts</span>
                      <Badge className="bg-green-100 text-green-800">680 generated</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span>Email Templates</span>
                      <Badge className="bg-purple-100 text-purple-800">120 generated</Badge>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <h4 className="font-medium">Generation Stats</h4>
                  <div className="space-y-3">
                    <Card className="p-3">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-cyan-600">1,200+</div>
                        <div className="text-sm text-muted-foreground">Content Pieces</div>
                      </div>
                    </Card>
                    <Card className="p-3">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">24.7%</div>
                        <div className="text-sm text-muted-foreground">Engagement Rate</div>
                      </div>
                    </Card>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="review" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Eye className="h-5 w-5 text-orange-500" />
                <span>Content Review & Approval</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">Blog Post: "Future of AI in Marketing"</h4>
                    <Badge className="bg-green-100 text-green-800">Approved</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    Artificial Intelligence is revolutionizing the marketing landscape, offering unprecedented opportunities for personalization and efficiency...
                  </p>
                  <div className="flex space-x-2">
                    <Button size="sm" variant="outline">Edit</Button>
                    <Button size="sm" variant="outline">Approve</Button>
                  </div>
                </div>
                
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">Social Post: "Weekly Tech Tips"</h4>
                    <Badge className="bg-yellow-100 text-yellow-800">Pending Review</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    🚀 This week's tech tip: Automate your marketing workflows to save 40% more time! Here's how...
                  </p>
                  <div className="flex space-x-2">
                    <Button size="sm" variant="outline">Edit</Button>
                    <Button size="sm" variant="outline">Approve</Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="publish" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Send className="h-5 w-5 text-blue-500" />
                <span>Multi-Channel Publishing</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <Card className="p-4 text-center">
                  <Megaphone className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                  <h4 className="font-medium">Social Media</h4>
                  <p className="text-sm text-muted-foreground">LinkedIn, Twitter, Facebook</p>
                  <Badge className="bg-green-100 text-green-800 mt-2">680 posts scheduled</Badge>
                </Card>
                <Card className="p-4 text-center">
                  <FileText className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <h4 className="font-medium">Blog Platform</h4>
                  <p className="text-sm text-muted-foreground">Website, Medium, LinkedIn</p>
                  <Badge className="bg-blue-100 text-blue-800 mt-2">45 articles published</Badge>
                </Card>
                <Card className="p-4 text-center">
                  <Video className="h-8 w-8 text-purple-500 mx-auto mb-2" />
                  <h4 className="font-medium">Email Campaigns</h4>
                  <p className="text-sm text-muted-foreground">Newsletters, Sequences</p>
                  <Badge className="bg-purple-100 text-purple-800 mt-2">12 campaigns active</Badge>
                </Card>
              </div>
              
              <div className="mt-6">
                <div>
                  <Label htmlFor="publish-schedule">Publishing Schedule</Label>
                  <Input id="publish-schedule" placeholder="Daily at 9 AM, 2 PM, 6 PM" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <BarChart3 className="h-5 w-5 text-indigo-500" />
                <span>Content Performance Analytics</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-cyan-600">1.2K</div>
                  <div className="text-sm text-muted-foreground">Content Created</div>
                  <div className="text-xs text-green-600">+45% vs last month</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">24.7%</div>
                  <div className="text-sm text-muted-foreground">Engagement Rate</div>
                  <div className="text-xs text-green-600">+18% vs industry avg</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">120hrs</div>
                  <div className="text-sm text-muted-foreground">Time Saved</div>
                  <div className="text-xs text-green-600">+30% efficiency</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600">Multi-channel</div>
                  <div className="text-sm text-muted-foreground">Distribution</div>
                  <div className="text-xs text-green-600">8 platforms active</div>
                </Card>
              </div>
              
              <div className="mt-6 space-y-3">
                <h4 className="font-medium">Top Performing Content</h4>
                <div className="space-y-2">
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">AI Marketing Trends 2024</span>
                      <Badge className="bg-green-100 text-green-800">High Engagement</Badge>
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <span>2.4K views</span>
                      <span>180 likes</span>
                      <span>45 shares</span>
                      <span>32% engagement rate</span>
                    </div>
                  </div>
                  
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">Automation Success Stories</span>
                      <Badge className="bg-blue-100 text-blue-800">Trending</Badge>
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <span>1.8K views</span>
                      <span>142 likes</span>
                      <span>28 shares</span>
                      <span>28% engagement rate</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Deploy Button */}
      <div className="flex justify-center">
        <Button
          onClick={deployAIContent}
          disabled={isProcessing}
          className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white px-8 py-3 text-lg font-semibold transition-all duration-300 hover:scale-105 shadow-lg"
        >
          {isProcessing ? (
            <>
              <Clock className="mr-2 h-5 w-5 animate-spin" />
              Generating Content...
            </>
          ) : (
            <>
              <Zap className="mr-2 h-5 w-5" />
              Deploy AI Content Generation
            </>
          )}
        </Button>
      </div>
    </div>
  );
}