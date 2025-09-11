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
  Users, 
  Map, 
  PenTool, 
  Send, 
  BarChart3, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  Zap,
  Heart,
  Target,
  MessageSquare,
  Mail,
  Calendar
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

export function UserEngagementFlow() {
  const [currentStep, setCurrentStep] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');
  
  const [steps, setSteps] = useState<WorkflowStep[]>([
    {
      id: 'upload',
      title: 'Upload Customer Data',
      description: 'Upload customer data for segmentation analysis',
      icon: Upload,
      status: 'pending'
    },
    {
      id: 'segment',
      title: 'Customer Segmentation',
      description: 'AI segments customers based on behavior patterns',
      icon: Users,
      status: 'pending'
    },
    {
      id: 'journey',
      title: 'Design Journey Maps',
      description: 'Create personalized customer journey workflows',
      icon: Map,
      status: 'pending'
    },
    {
      id: 'content',
      title: 'Generate Content',
      description: 'AI creates personalized content for each segment',
      icon: PenTool,
      status: 'pending'
    },
    {
      id: 'launch',
      title: 'Launch Campaigns',
      description: 'Deploy multi-channel engagement campaigns',
      icon: Send,
      status: 'pending'
    },
    {
      id: 'track',
      title: 'Track Engagement',
      description: 'Monitor engagement metrics and optimize',
      icon: BarChart3,
      status: 'pending'
    }
  ]);

  const updateStepStatus = (stepIndex: number, status: WorkflowStep['status'], progress?: number) => {
    setSteps(prev => prev.map((step, index) => 
      index === stepIndex ? { ...step, status, progress } : step
    ));
  };

  const deployEngagementFlow = async () => {
    setIsProcessing(true);
    
    try {
      // Execute actual AI agent tasks for user engagement
      const customerAgent = AgentService.getAgents().find(agent => agent.role.includes('Customer'));
      if (customerAgent) {
        // Execute customer segmentation
        await AgentService.executeTask(customerAgent.id, {
          type: 'customer_segmentation',
          description: 'Segment customers and create personalized engagement journeys',
          input: {
            customerData: Array(500).fill({}).map(() => ({
              id: Math.random().toString(),
              email: 'customer@example.com',
              ltv: Math.random() * 10000,
              engagementScore: Math.random() * 100,
              lastActivity: new Date()
            })),
            criteria: { method: 'behavioral', includeChurnRisk: true }
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
      
      toast.success('User Engagement workflow completed successfully! 🎉');
      setActiveTab('track'); // Auto-switch to last tab
    } catch (error) {
      toast.error('User Engagement workflow failed. Please try again.');
      updateStepStatus(currentStep, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = ['.xlsx', '.xls', '.csv'];
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      
      if (!validTypes.includes(fileExtension)) {
        toast.error('Please upload a valid Excel (.xlsx, .xls) or CSV (.csv) file');
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
        <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-pink-600 bg-clip-text text-transparent">
          User Engagement & Lifecycle
        </h1>
        <p className="text-muted-foreground">
          Create personalized customer journeys and boost engagement across all touchpoints
        </p>
      </div>

      {/* Workflow Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Zap className="h-5 w-5 text-orange-500" />
            <span>Engagement Workflow Progress</span>
          </CardTitle>
          <CardDescription>
            Follow the sequential steps to deploy personalized engagement campaigns
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={cn(
                  "flex items-center space-x-4 p-4 rounded-lg border transition-all duration-300",
                  index === currentStep ? "border-orange-500 bg-orange-50 dark:bg-orange-900/20" : "border-gray-200",
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
                index === currentStep ? "text-orange-600" : ""
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
                <span>Upload Customer Data</span>
              </CardTitle>
              <CardDescription>
                Upload customer data for segmentation analysis
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div 
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-orange-400 transition-colors cursor-pointer"
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById('engagement-file-upload')?.click()}
              >
                <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <div className="space-y-2">
                  <span className="text-lg font-medium">Drop your customer data file here</span>
                  <p className="text-sm text-muted-foreground">or click to browse</p>
                  <p className="text-xs text-muted-foreground">Supports .xlsx, .xls, .csv files (max 10MB)</p>
                </div>
              </div>
              
              <Input
                id="engagement-file-upload"
                type="file"
                accept=".xlsx,.xls,.csv"
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

              <div className="grid gap-4 md:grid-cols-3">
                <div className="text-center p-4 border rounded-lg">
                  <Users className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                  <h4 className="font-medium">Customer Data</h4>
                  <p className="text-sm text-muted-foreground">Names, emails, demographics</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <Heart className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <h4 className="font-medium">Engagement History</h4>
                  <p className="text-sm text-muted-foreground">Interactions, preferences</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <Target className="h-8 w-8 text-purple-500 mx-auto mb-2" />
                  <h4 className="font-medium">Behavioral Data</h4>
                  <p className="text-sm text-muted-foreground">Purchase patterns, activity</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="segment" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-purple-500" />
                <span>Customer Segmentation</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <Card className="p-4 text-center">
                  <Heart className="h-8 w-8 text-red-500 mx-auto mb-2" />
                  <h4 className="font-medium">High-Value Customers</h4>
                  <p className="text-sm text-muted-foreground">1,247 customers</p>
                </Card>
                <Card className="p-4 text-center">
                  <Target className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                  <h4 className="font-medium">Growth Potential</h4>
                  <p className="text-sm text-muted-foreground">2,156 customers</p>
                </Card>
                <Card className="p-4 text-center">
                  <Users className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <h4 className="font-medium">New Customers</h4>
                  <p className="text-sm text-muted-foreground">892 customers</p>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="journey" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Map className="h-5 w-5 text-green-500" />
                <span>Customer Journey Maps</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium">Onboarding Journey</h4>
                  <p className="text-sm text-muted-foreground">Welcome series for new customers</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium">Retention Journey</h4>
                  <p className="text-sm text-muted-foreground">Keep existing customers engaged</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium">Upsell Journey</h4>
                  <p className="text-sm text-muted-foreground">Promote additional products</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="content" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <PenTool className="h-5 w-5 text-purple-500" />
                <span>Personalized Content</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="p-4">
                  <MessageSquare className="h-8 w-8 text-blue-500 mb-2" />
                  <h4 className="font-medium">Email Templates</h4>
                  <p className="text-sm text-muted-foreground">24 personalized templates</p>
                </Card>
                <Card className="p-4">
                  <Mail className="h-8 w-8 text-green-500 mb-2" />
                  <h4 className="font-medium">SMS Messages</h4>
                  <p className="text-sm text-muted-foreground">12 SMS templates</p>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="launch" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Send className="h-5 w-5 text-orange-500" />
                <span>Campaign Launch</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="campaign-name">Campaign Name</Label>
                  <Input id="campaign-name" placeholder="Q1 2024 Engagement Campaign" />
                </div>
                <Button className="w-full">Launch Multi-Channel Campaign</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="track" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <BarChart3 className="h-5 w-5 text-indigo-500" />
                <span>Engagement Tracking</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">67.8%</div>
                  <div className="text-sm text-muted-foreground">Engagement Rate</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">2.1K</div>
                  <div className="text-sm text-muted-foreground">Conversions</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-orange-600">156</div>
                  <div className="text-sm text-muted-foreground">Active Journeys</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600">+15%</div>
                  <div className="text-sm text-muted-foreground">Growth Rate</div>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Deploy Button */}
      <div className="flex justify-center">
        <Button
          onClick={deployEngagementFlow}
          disabled={isProcessing}
          className="bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white px-8 py-3 text-lg font-semibold transition-all duration-300 hover:scale-105 shadow-lg"
        >
          {isProcessing ? (
            <>
              <Clock className="mr-2 h-5 w-5 animate-spin" />
              Deploying Engagement Flow...
            </>
          ) : (
            <>
              <Zap className="mr-2 h-5 w-5" />
              Deploy Engagement Flow
            </>
          )}
        </Button>
      </div>
    </div>
  );
}