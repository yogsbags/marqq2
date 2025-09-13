import { useEffect } from 'react';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Upload, 
  Video, 
  User, 
  Play, 
  BarChart3, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  FileSpreadsheet,
  Camera,
  Zap,
  TrendingUp,
  Monitor,
  Settings,
  Palette,
  Mic,
  Eye,
  Share2,
  Users,
  Target,
  MessageSquare
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

interface AIVideoBotFlowProps {
  autoStart?: boolean;
}

export function AIVideoBotFlow({ autoStart = false }: AIVideoBotFlowProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');
  
  const [steps, setSteps] = useState<WorkflowStep[]>([
    {
      id: 'upload',
      title: 'Upload Content Data',
      description: 'Upload scripts, product info, and brand assets',
      icon: Upload,
      status: 'pending'
    },
    {
      id: 'avatar',
      title: 'Create Digital Avatar',
      description: 'AI generates realistic digital avatar',
      icon: User,
      status: 'pending'
    },
    {
      id: 'script',
      title: 'Generate Video Scripts',
      description: 'AI creates personalized video scripts',
      icon: MessageSquare,
      status: 'pending'
    },
    {
      id: 'production',
      title: 'Video Production',
      description: 'Generate AI-powered video content',
      icon: Video,
      status: 'pending'
    },
    {
      id: 'deployment',
      title: 'Deploy Videos',
      description: 'Distribute videos across channels',
      icon: Share2,
      status: 'pending'
    },
    {
      id: 'analytics',
      title: 'Video Analytics',
      description: 'Track video performance and engagement',
      icon: BarChart3,
      status: 'pending'
    }
  ]);

  // Auto-start deployment when triggered via slash command
  useEffect(() => {
    if (autoStart && !isProcessing && currentStep === 0) {
      // Simulate file upload completion
      setUploadedFile(new File(['sample'], 'video-content.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      updateStepStatus(0, 'completed');
      setCurrentStep(1);
      
      // Start deployment after a short delay
      setTimeout(() => {
        deployVideoBot();
      }, 2000);
    }
  }, [autoStart]);

  const updateStepStatus = (stepIndex: number, status: WorkflowStep['status'], progress?: number) => {
    setSteps(prev => prev.map((step, index) => 
      index === stepIndex ? { ...step, status, progress } : step
    ));
  };

  const deployVideoBot = async () => {
    setIsProcessing(true);
    
    try {
      // Execute actual AI agent tasks for video bot
      const contentAgent = AgentService.getAgents().find(agent => agent.role.includes('Content'));
      if (contentAgent) {
        // Generate video scripts and content
        await AgentService.executeTask(contentAgent.id, {
          type: 'content_generation',
          description: 'Generate video scripts and digital avatar content',
          input: {
            contentType: 'video_script',
            topic: 'Product demonstration and sales presentation',
            audience: { segment: 'Business Decision Makers' },
            videoLength: '90-120 seconds',
            tone: 'Professional & Engaging'
          }
        });
      }

      // Simulate AI video bot deployment process
      for (let i = currentStep; i < steps.length; i++) {
        updateStepStatus(i, 'processing', 0);
        
        // Simulate processing time with progress
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
      
      toast.success('AI Video Bot deployment completed successfully! 🎉');
      
      // Auto-switch to the last tab (analytics) after completion
      setActiveTab('analytics');
    } catch (error) {
      toast.error('AI Video Bot deployment failed. Please try again.');
      updateStepStatus(currentStep, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = ['.xlsx', '.xls', '.csv', '.mp4', '.mov', '.avi', '.jpg', '.jpeg', '.png'];
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      
      if (!validTypes.includes(fileExtension)) {
        toast.error('Please upload a valid file (Excel, CSV, Video, or Image)');
        return;
      }
      
      // Validate file size (max 50MB for videos)
      if (file.size > 50 * 1024 * 1024) {
        toast.error('File size must be less than 50MB');
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
        <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
          AI Video Bot & Digital Avatar
        </h1>
        <p className="text-muted-foreground">
          Create engaging video content with AI-powered digital avatars for personalized customer interactions
        </p>
      </div>

      {/* Workflow Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Zap className="h-5 w-5 text-amber-500" />
            <span>Video Bot Workflow Progress</span>
          </CardTitle>
          <CardDescription>
            Follow the sequential steps to deploy AI-powered video bots with digital avatars
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={cn(
                  "flex items-center space-x-4 p-4 rounded-lg border transition-all duration-300",
                  index === currentStep ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20" : "border-gray-200",
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
                index === currentStep ? "text-amber-600" : ""
              )}
            >
              {step.title.split(' ')[0]}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Upload Tab */}
        <TabsContent value="upload" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileSpreadsheet className="h-5 w-5 text-blue-500" />
                <span>Upload Content Data</span>
              </CardTitle>
              <CardDescription>
                Upload scripts, product information, and brand assets for video creation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div 
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-amber-400 transition-colors cursor-pointer"
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById('video-file-upload')?.click()}
              >
                <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <div className="space-y-2">
                  <span className="text-lg font-medium">Drop your content files here</span>
                  <p className="text-sm text-muted-foreground">or click to browse</p>
                  <p className="text-xs text-muted-foreground">Supports Excel, CSV, Videos, Images (max 50MB)</p>
                </div>
              </div>
              
              <Input
                id="video-file-upload"
                type="file"
                accept=".xlsx,.xls,.csv,.mp4,.mov,.avi,.jpg,.jpeg,.png"
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
                  <MessageSquare className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                  <h4 className="font-medium">Scripts & Content</h4>
                  <p className="text-sm text-muted-foreground">Video scripts, talking points</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <Target className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <h4 className="font-medium">Product Info</h4>
                  <p className="text-sm text-muted-foreground">Features, benefits, pricing</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <Palette className="h-8 w-8 text-purple-500 mx-auto mb-2" />
                  <h4 className="font-medium">Brand Assets</h4>
                  <p className="text-sm text-muted-foreground">Logos, colors, guidelines</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Avatar Tab */}
        <TabsContent value="avatar" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <User className="h-5 w-5 text-purple-500" />
                <span>AI Digital Avatar Creation</span>
              </CardTitle>
              <CardDescription>
                Create realistic digital avatars for your video content
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <h4 className="font-medium">Avatar Configuration</h4>
                  <div className="space-y-2">
                    <div>
                      <Label htmlFor="avatar-gender">Avatar Gender</Label>
                      <select id="avatar-gender" className="w-full p-2 border rounded-md bg-white text-gray-900">
                        <option>Female (Professional)</option>
                        <option>Male (Business)</option>
                        <option>Female (Friendly)</option>
                        <option>Male (Casual)</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="avatar-age">Age Range</Label>
                      <select id="avatar-age" className="w-full p-2 border rounded-md bg-white text-gray-900">
                        <option>25-35 (Young Professional)</option>
                        <option>35-45 (Experienced)</option>
                        <option>45-55 (Senior Expert)</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="avatar-style">Avatar Style</Label>
                      <select id="avatar-style" className="w-full p-2 border rounded-md bg-white text-gray-900">
                        <option>Business Professional</option>
                        <option>Casual Friendly</option>
                        <option>Tech Expert</option>
                        <option>Creative Professional</option>
                      </select>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <h4 className="font-medium">Avatar Preview</h4>
                  <div className="aspect-video bg-gradient-to-br from-purple-100 to-blue-100 rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <User className="h-16 w-16 text-purple-500 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Avatar preview will appear here</p>
                    </div>
                  </div>
                  <Button className="w-full" variant="outline">
                    <Camera className="h-4 w-4 mr-2" />
                    Generate Avatar Preview
                  </Button>
                </div>
              </div>

              {/* Avatar Features */}
              <div className="space-y-3">
                <h4 className="font-medium">AI Avatar Capabilities</h4>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="flex items-center space-x-3 p-3 border rounded-lg">
                    <Mic className="h-5 w-5 text-blue-500" />
                    <div>
                      <div className="font-medium">Natural Speech</div>
                      <div className="text-sm text-muted-foreground">Realistic voice synthesis</div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 p-3 border rounded-lg">
                    <Eye className="h-5 w-5 text-green-500" />
                    <div>
                      <div className="font-medium">Facial Expressions</div>
                      <div className="text-sm text-muted-foreground">Dynamic emotional responses</div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 p-3 border rounded-lg">
                    <Settings className="h-5 w-5 text-orange-500" />
                    <div>
                      <div className="font-medium">Customizable</div>
                      <div className="text-sm text-muted-foreground">Appearance and personality</div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 p-3 border rounded-lg">
                    <Video className="h-5 w-5 text-purple-500" />
                    <div>
                      <div className="font-medium">HD Quality</div>
                      <div className="text-sm text-muted-foreground">4K video generation</div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Script Tab */}
        <TabsContent value="script" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <MessageSquare className="h-5 w-5 text-green-500" />
                <span>AI Video Script Generation</span>
              </CardTitle>
              <CardDescription>
                AI creates personalized video scripts based on your content and audience
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <h4 className="font-medium">Script Configuration</h4>
                  <div className="space-y-2">
                    <div>
                      <Label htmlFor="video-type">Video Type</Label>
                      <select id="video-type" className="w-full p-2 border rounded-md bg-white text-gray-900">
                        <option>Product Demo</option>
                        <option>Sales Pitch</option>
                        <option>Educational Content</option>
                        <option>Customer Testimonial</option>
                        <option>Company Introduction</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="video-length">Target Length</Label>
                      <select id="video-length" className="w-full p-2 border rounded-md bg-white text-gray-900">
                        <option>30 seconds (Quick intro)</option>
                        <option>1-2 minutes (Standard)</option>
                        <option>3-5 minutes (Detailed)</option>
                        <option>5+ minutes (Comprehensive)</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="video-tone">Tone & Style</Label>
                      <select id="video-tone" className="w-full p-2 border rounded-md bg-white text-gray-900">
                        <option>Professional & Formal</option>
                        <option>Friendly & Conversational</option>
                        <option>Energetic & Enthusiastic</option>
                        <option>Educational & Informative</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <h4 className="font-medium">Generated Scripts</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span className="text-sm">Product Demo Script</span>
                      <Badge className="bg-blue-100 text-blue-800">Generated</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span className="text-sm">Welcome Message</span>
                      <Badge className="bg-green-100 text-green-800">Ready</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span className="text-sm">Feature Explanation</span>
                      <Badge className="bg-purple-100 text-purple-800">In Progress</Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* Script Preview */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Script Preview</h4>
                  <Badge className="bg-green-100 text-green-800">AI Generated</Badge>
                </div>
                
                <div className="border rounded-lg p-4 bg-muted/30">
                  <div className="space-y-4">
                    <div className="border-l-4 border-blue-500 pl-4">
                      <h5 className="font-medium text-blue-700">Opening Hook (0-10 seconds)</h5>
                      <p className="text-sm mt-1">
                        "Hi there! I'm Sarah, and I'm excited to show you how our AI platform can transform your marketing results in just 60 days."
                      </p>
                    </div>
                    
                    <div className="border-l-4 border-green-500 pl-4">
                      <h5 className="font-medium text-green-700">Problem Statement (10-30 seconds)</h5>
                      <p className="text-sm mt-1">
                        "Are you struggling with low conversion rates and wasted ad spend? You're not alone. 73% of businesses face the same challenge."
                      </p>
                    </div>
                    
                    <div className="border-l-4 border-orange-500 pl-4">
                      <h5 className="font-medium text-orange-700">Solution Presentation (30-60 seconds)</h5>
                      <p className="text-sm mt-1">
                        "Our AI-powered platform analyzes your customer data, optimizes your campaigns in real-time, and delivers personalized experiences that convert 3x better."
                      </p>
                    </div>
                    
                    <div className="border-l-4 border-purple-500 pl-4">
                      <h5 className="font-medium text-purple-700">Call to Action (60-90 seconds)</h5>
                      <p className="text-sm mt-1">
                        "Ready to see results? Click the button below to start your free 14-day trial and join over 10,000 successful businesses."
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="flex space-x-2">
                  <Button variant="outline" size="sm">
                    <Settings className="h-4 w-4 mr-2" />
                    Customize Script
                  </Button>
                  <Button variant="outline" size="sm">
                    <Play className="h-4 w-4 mr-2" />
                    Preview Audio
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Production Tab */}
        <TabsContent value="production" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Video className="h-5 w-5 text-red-500" />
                <span>AI Video Production</span>
              </CardTitle>
              <CardDescription>
                Generate high-quality videos with AI avatars and automated production
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-4">
                  <h4 className="font-medium">Production Settings</h4>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="video-quality">Video Quality</Label>
                      <select id="video-quality" className="w-full p-2 border rounded-md bg-white text-gray-900">
                        <option>4K Ultra HD (3840x2160)</option>
                        <option>Full HD (1920x1080)</option>
                        <option>HD (1280x720)</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="background">Background</Label>
                      <select id="background" className="w-full p-2 border rounded-md bg-white text-gray-900">
                        <option>Office Environment</option>
                        <option>Modern Studio</option>
                        <option>Custom Brand Background</option>
                        <option>Green Screen</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="branding">Brand Integration</Label>
                      <select id="branding" className="w-full p-2 border rounded-md bg-white text-gray-900">
                        <option>Logo + Brand Colors</option>
                        <option>Full Brand Package</option>
                        <option>Minimal Branding</option>
                        <option>No Branding</option>
                      </select>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <h4 className="font-medium">Production Queue</h4>
                  <div className="space-y-3">
                    <Card className="p-3">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-amber-600">2.4K</div>
                        <div className="text-sm text-muted-foreground">Videos in Queue</div>
                      </div>
                    </Card>
                    <Card className="p-3">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">15 min</div>
                        <div className="text-sm text-muted-foreground">Avg Production Time</div>
                      </div>
                    </Card>
                    <Card className="p-3">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">4K</div>
                        <div className="text-sm text-muted-foreground">Output Quality</div>
                      </div>
                    </Card>
                  </div>
                </div>
              </div>

              {/* Production Status */}
              <div className="space-y-3">
                <h4 className="font-medium">Current Production Status</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                      <div>
                        <span className="font-medium">Product Demo Video</span>
                        <p className="text-sm text-muted-foreground">Rendering avatar and background</p>
                      </div>
                    </div>
                    <Badge className="bg-blue-100 text-blue-800">85% Complete</Badge>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                      <div>
                        <span className="font-medium">Welcome Message</span>
                        <p className="text-sm text-muted-foreground">Queued for production</p>
                      </div>
                    </div>
                    <Badge className="bg-orange-100 text-orange-800">Pending</Badge>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <div>
                        <span className="font-medium">Feature Explanation</span>
                        <p className="text-sm text-muted-foreground">Production completed</p>
                      </div>
                    </div>
                    <Badge className="bg-green-100 text-green-800">Ready</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Deployment Tab */}
        <TabsContent value="deployment" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Share2 className="h-5 w-5 text-blue-500" />
                <span>Video Deployment</span>
              </CardTitle>
              <CardDescription>
                Deploy your AI-generated videos across multiple channels and platforms
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Card className="p-4 text-center">
                  <Monitor className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                  <h4 className="font-medium">Website Integration</h4>
                  <p className="text-sm text-muted-foreground">Landing pages, product pages</p>
                  <Badge className="bg-green-100 text-green-800 mt-2">24 videos deployed</Badge>
                </Card>
                <Card className="p-4 text-center">
                  <Users className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <h4 className="font-medium">Social Media</h4>
                  <p className="text-sm text-muted-foreground">LinkedIn, YouTube, Facebook</p>
                  <Badge className="bg-blue-100 text-blue-800 mt-2">156 posts scheduled</Badge>
                </Card>
                <Card className="p-4 text-center">
                  <MessageSquare className="h-8 w-8 text-purple-500 mx-auto mb-2" />
                  <h4 className="font-medium">Email Campaigns</h4>
                  <p className="text-sm text-muted-foreground">Video emails, newsletters</p>
                  <Badge className="bg-purple-100 text-purple-800 mt-2">89 campaigns active</Badge>
                </Card>
              </div>

              {/* Deployment Settings */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="deployment-schedule">Deployment Schedule</Label>
                  <Input id="deployment-schedule" placeholder="Daily at 9 AM, 2 PM, 6 PM" />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="target-audience">Target Audience</Label>
                    <select id="target-audience" className="w-full p-2 border rounded-md bg-white text-gray-900">
                      <option>All Customers</option>
                      <option>High-Value Prospects</option>
                      <option>Existing Customers</option>
                      <option>Custom Segment</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="deployment-priority">Priority</Label>
                    <select id="deployment-priority" className="w-full p-2 border rounded-md bg-white text-gray-900">
                      <option>High Priority</option>
                      <option>Standard</option>
                      <option>Low Priority</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Deployment Status */}
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200">
                <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">Deployment Ready</h4>
                <p className="text-sm text-blue-600 dark:text-blue-300 mb-3">
                  2,400 videos ready for deployment across all configured channels
                </p>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Share2 className="h-4 w-4 mr-2" />
                  Deploy All Videos
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <BarChart3 className="h-5 w-5 text-indigo-500" />
                <span>Video Performance Analytics</span>
              </CardTitle>
              <CardDescription>
                Track video performance, engagement metrics, and conversion rates
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-amber-600">2.4K</div>
                  <div className="text-sm text-muted-foreground">Videos Created</div>
                  <div className="text-xs text-green-600">+35% vs last month</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">78.9%</div>
                  <div className="text-sm text-muted-foreground">Engagement Rate</div>
                  <div className="text-xs text-green-600">+12% vs industry avg</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">15.2%</div>
                  <div className="text-sm text-muted-foreground">Conversion Rate</div>
                  <div className="text-xs text-green-600">+18% improvement</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600">4.2M</div>
                  <div className="text-sm text-muted-foreground">Total Views</div>
                  <div className="text-xs text-green-600">+45% growth</div>
                </Card>
              </div>

              {/* Top Performing Videos */}
              <div className="space-y-3">
                <h4 className="font-medium">Top Performing Videos</h4>
                <div className="space-y-2">
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">Product Demo - AI Features</span>
                      <Badge className="bg-green-100 text-green-800">High Performance</Badge>
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <span>156K views</span>
                      <span>89% completion rate</span>
                      <span>23% conversion rate</span>
                      <span>4.8/5 rating</span>
                    </div>
                  </div>
                  
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">Welcome Message - New Users</span>
                      <Badge className="bg-blue-100 text-blue-800">Trending</Badge>
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <span>98K views</span>
                      <span>76% completion rate</span>
                      <span>18% conversion rate</span>
                      <span>4.6/5 rating</span>
                    </div>
                  </div>
                  
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">Customer Success Story</span>
                      <Badge className="bg-purple-100 text-purple-800">Viral</Badge>
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <span>234K views</span>
                      <span>92% completion rate</span>
                      <span>31% conversion rate</span>
                      <span>4.9/5 rating</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Analytics Insights */}
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200">
                <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2">📊 Key Insights</h4>
                <div className="space-y-2 text-sm text-amber-600 dark:text-amber-300">
                  <p>• Videos with AI avatars have 78% higher engagement than static content</p>
                  <p>• Personalized video messages increase conversion rates by 15.2%</p>
                  <p>• Optimal video length for your audience is 90-120 seconds</p>
                  <p>• Best posting times: 9 AM, 2 PM, and 6 PM for maximum reach</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Deploy Video Bot Button */}
      <div className="flex justify-center">
        <Button
          onClick={deployVideoBot}
          disabled={isProcessing || currentStep >= steps.length - 1}
          className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white px-8 py-3 text-lg font-semibold transition-all duration-300 hover:scale-105 shadow-lg"
        >
          {isProcessing ? (
            <>
              <Clock className="mr-2 h-5 w-5 animate-spin" />
              Deploying Video Bot...
            </>
          ) : (
            <>
              <Zap className="mr-2 h-5 w-5" />
              Deploy AI Video Bot
            </>
          )}
        </Button>
      </div>
    </div>
  );
}