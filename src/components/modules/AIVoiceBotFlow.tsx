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
  Bot, 
  Phone, 
  Play, 
  BarChart3, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  FileSpreadsheet,
  MessageSquare,
  Zap,
  TrendingUp,
  Mic,
  PhoneCall,
  Users,
  Target,
  Volume2,
  Settings,
  Calendar,
  Timer
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

interface AIVoiceBotFlowProps {
  autoStart?: boolean;
}

export function AIVoiceBotFlow({ autoStart = false }: AIVoiceBotFlowProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');
  
  const [steps, setSteps] = useState<WorkflowStep[]>([
    {
      id: 'upload',
      title: 'Upload Contact List',
      description: 'Upload your prospect contact list with phone numbers',
      icon: Upload,
      status: 'pending'
    },
    {
      id: 'script',
      title: 'Generate Voice Script',
      description: 'AI creates personalized conversation scripts',
      icon: MessageSquare,
      status: 'pending'
    },
    {
      id: 'voice',
      title: 'Configure Voice Bot',
      description: 'Set up voice parameters and conversation flow',
      icon: Bot,
      status: 'pending'
    },
    {
      id: 'test',
      title: 'Test Call',
      description: 'Run test calls to validate bot performance',
      icon: Phone,
      status: 'pending'
    },
    {
      id: 'campaign',
      title: 'Start Campaign',
      description: 'Launch automated voice calling campaign',
      icon: Play,
      status: 'pending'
    },
    {
      id: 'monitor',
      title: 'Monitor Results',
      description: 'Track call performance and conversation analytics',
      icon: BarChart3,
      status: 'pending'
    }
  ]);

  // Auto-start deployment when triggered via slash command
  useEffect(() => {
    if (autoStart && !isProcessing && currentStep === 0) {
      // Simulate file upload completion
      setUploadedFile(new File(['sample'], 'contact-list.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      updateStepStatus(0, 'completed');
      setCurrentStep(1);
      
      // Start deployment after a short delay
      setTimeout(() => {
        deployVoiceBot();
      }, 2000);
    }
  }, [autoStart]);

  const updateStepStatus = (stepIndex: number, status: WorkflowStep['status'], progress?: number) => {
    setSteps(prev => prev.map((step, index) => 
      index === stepIndex ? { ...step, status, progress } : step
    ));
  };

  const deployVoiceBot = async () => {
    setIsProcessing(true);
    
    try {
      // Execute actual AI agent tasks for voice bot
      const contentAgent = AgentService.getAgents().find(agent => agent.role.includes('Content'));
      if (contentAgent) {
        // Generate voice scripts
        await AgentService.executeTask(contentAgent.id, {
          type: 'content_generation',
          description: 'Generate personalized voice bot scripts for calling campaign',
          input: {
            contentType: 'voice_script',
            topic: 'Sales outreach for wealth management services',
            audience: { segment: 'Wealth Management Professionals' },
            tone: 'Professional & Conversational'
          }
        });
      }

      // Simulate AI voice bot deployment process
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
      
      toast.success('AI Voice Bot deployment completed successfully! 🎉');
      
      // Auto-switch to the last tab (monitor) after completion
      setActiveTab('monitor');
    } catch (error) {
      toast.error('AI Voice Bot deployment failed. Please try again.');
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
        <h1 className="text-3xl font-bold bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent">
          Voice Bot Workflow
        </h1>
        <p className="text-muted-foreground">
          Deploy intelligent voice bots for automated prospecting and lead qualification calls
        </p>
      </div>

      {/* Workflow Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Zap className="h-5 w-5 text-green-500" />
            <span>Voice Bot Workflow Progress</span>
          </CardTitle>
          <CardDescription>
            Follow the sequential steps to deploy AI voice bots for automated calling
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={cn(
                  "flex items-center space-x-4 p-4 rounded-lg border transition-all duration-300",
                  index === currentStep ? "border-green-500 bg-green-50 dark:bg-green-900/20" : "border-gray-200",
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
                index === currentStep ? "text-green-600" : ""
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
                <span>Upload Contact List</span>
              </CardTitle>
              <CardDescription>
                Upload your prospect contact list with phone numbers for voice bot calling
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div 
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-green-400 transition-colors cursor-pointer"
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById('voice-file-upload')?.click()}
              >
                <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <div className="space-y-2">
                  <span className="text-lg font-medium">Drop your contact list here</span>
                  <p className="text-sm text-muted-foreground">or click to browse</p>
                  <p className="text-xs text-muted-foreground">Supports .xlsx, .xls, .csv files (max 10MB)</p>
                </div>
              </div>
              
              <Input
                id="voice-file-upload"
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
                  <Phone className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                  <h4 className="font-medium">Phone Numbers</h4>
                  <p className="text-sm text-muted-foreground">Valid mobile/landline numbers</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <Users className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <h4 className="font-medium">Contact Details</h4>
                  <p className="text-sm text-muted-foreground">Names, companies, titles</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <Target className="h-8 w-8 text-purple-500 mx-auto mb-2" />
                  <h4 className="font-medium">Call Preferences</h4>
                  <p className="text-sm text-muted-foreground">Best time to call, timezone</p>
                </div>
              </div>

              {/* Sample Contact Data */}
              <div className="space-y-3">
                <h4 className="font-medium">Sample Contact Data</h4>
                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-3 font-medium">Name</th>
                          <th className="text-left p-3 font-medium">Company</th>
                          <th className="text-left p-3 font-medium">Phone</th>
                          <th className="text-left p-3 font-medium">Title</th>
                          <th className="text-left p-3 font-medium">Best Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        <tr className="hover:bg-muted/30">
                          <td className="p-3">Rajesh Sharma</td>
                          <td className="p-3">Avendus Wealth</td>
                          <td className="p-3">+91 98765 43210</td>
                          <td className="p-3">Investment Director</td>
                          <td className="p-3">10 AM - 12 PM</td>
                        </tr>
                        <tr className="hover:bg-muted/30">
                          <td className="p-3">Priya Patel</td>
                          <td className="p-3">IIFL Wealth</td>
                          <td className="p-3">+91 87654 32109</td>
                          <td className="p-3">Portfolio Manager</td>
                          <td className="p-3">2 PM - 4 PM</td>
                        </tr>
                        <tr className="hover:bg-muted/30">
                          <td className="p-3">Amit Gupta</td>
                          <td className="p-3">360 ONE Wealth</td>
                          <td className="p-3">+91 76543 21098</td>
                          <td className="p-3">Relationship Manager</td>
                          <td className="p-3">11 AM - 1 PM</td>
                        </tr>
                      </tbody>
                    </table>
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
                <MessageSquare className="h-5 w-5 text-purple-500" />
                <span>AI-Generated Voice Scripts</span>
              </CardTitle>
              <CardDescription>
                AI creates personalized conversation scripts based on your target audience
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <h4 className="font-medium">Script Configuration</h4>
                  <div className="space-y-2">
                    <div>
                      <Label htmlFor="script-tone">Conversation Tone</Label>
                      <select id="conversation-tone" className="w-full p-2 border rounded-md bg-white text-gray-900">
                        <option>Professional & Formal</option>
                        <option>Friendly & Conversational</option>
                        <option>Direct & Business-focused</option>
                        <option>Consultative & Advisory</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="script-length">Call Duration Target</Label>
                      <select id="call-duration" className="w-full p-2 border rounded-md bg-white text-gray-900">
                        <option>2-3 minutes (Quick intro)</option>
                        <option>5-7 minutes (Standard pitch)</option>
                        <option>10-15 minutes (Detailed discussion)</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="script-objective">Call Objective</Label>
                      <select id="call-objective" className="w-full p-2 border rounded-md bg-white text-gray-900">
                        <option>Schedule a meeting</option>
                        <option>Product demonstration</option>
                        <option>Qualify interest level</option>
                        <option>Gather requirements</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <h4 className="font-medium">Personalization Variables</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span>{'{firstName}'} - Contact's first name</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span>{'{company}'} - Company name</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span>{'{title}'} - Job title</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span>{'{industry}'} - Industry vertical</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span>{'{painPoint}'} - Identified challenge</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Generated Script Preview */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Generated Script Preview</h4>
                  <Badge className="bg-purple-100 text-purple-800">AI Generated</Badge>
                </div>
                
                <div className="border rounded-lg p-4 bg-muted/30">
                  <div className="space-y-4">
                    <div className="border-l-4 border-green-500 pl-4">
                      <h5 className="font-medium text-green-700">Opening (0-30 seconds)</h5>
                      <p className="text-sm mt-1">
                        "Hello {'{firstName}'}, this is Sarah from TechSolutions. I hope I'm catching you at a good time. 
                        I'm calling because I noticed {'{company}'} is in the {'{industry}'} space, and we've been helping 
                        similar companies like yours overcome challenges with {'{painPoint}'}. Do you have 3 minutes to discuss 
                        how we might be able to help?"
                      </p>
                    </div>
                    
                    <div className="border-l-4 border-blue-500 pl-4">
                      <h5 className="font-medium text-blue-700">Value Proposition (30-90 seconds)</h5>
                      <p className="text-sm mt-1">
                        "We specialize in helping {'{industry}'} companies like {'{company}'} increase efficiency by up to 40% 
                        through our AI-powered platform. Companies similar to yours have seen significant improvements in 
                        their operations within just 60 days of implementation."
                      </p>
                    </div>
                    
                    <div className="border-l-4 border-orange-500 pl-4">
                      <h5 className="font-medium text-orange-700">Qualification Questions (90-150 seconds)</h5>
                      <p className="text-sm mt-1">
                        "Can you tell me about your current approach to {'{painPoint}'}? What challenges are you facing 
                        in this area? How important would it be for {'{company}'} to solve this in the next quarter?"
                      </p>
                    </div>
                    
                    <div className="border-l-4 border-purple-500 pl-4">
                      <h5 className="font-medium text-purple-700">Call to Action (150-180 seconds)</h5>
                      <p className="text-sm mt-1">
                        "Based on what you've shared, I think there's definitely potential for us to help {'{company}'}. 
                        Would you be open to a 15-minute demo next week where I can show you exactly how we've helped 
                        other {'{industry}'} companies? I have Tuesday at 2 PM or Wednesday at 10 AM available."
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
                    <Volume2 className="h-4 w-4 mr-2" />
                    Preview Audio
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Voice Tab */}
        <TabsContent value="voice" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Bot className="h-5 w-5 text-green-500" />
                <span>Voice Bot Configuration</span>
              </CardTitle>
              <CardDescription>
                Configure voice parameters and conversation flow settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-4">
                  <h4 className="font-medium">Voice Settings</h4>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="voice-gender">Voice Gender</Label>
                      <select id="voice-gender" className="w-full p-2 border rounded-md bg-white text-gray-900">
                        <option>Female (Sarah - Professional)</option>
                        <option>Male (David - Authoritative)</option>
                        <option>Female (Emma - Friendly)</option>
                        <option>Male (James - Conversational)</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="voice-speed">Speaking Speed</Label>
                      <select id="speaking-speed" className="w-full p-2 border rounded-md bg-white text-gray-900">
                        <option>Slow (140 WPM)</option>
                        <option>Normal (160 WPM)</option>
                        <option>Fast (180 WPM)</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="voice-accent">Accent</Label>
                      <select id="accent" className="w-full p-2 border rounded-md bg-white text-gray-900">
                        <option>Indian English</option>
                        <option>American English</option>
                        <option>British English</option>
                        <option>Neutral</option>
                      </select>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <h4 className="font-medium">Conversation Flow</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="handle-interruptions">Handle Interruptions</Label>
                      <input type="checkbox" id="handle-interruptions" defaultChecked className="rounded" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="detect-voicemail">Voicemail Detection</Label>
                      <input type="checkbox" id="detect-voicemail" defaultChecked className="rounded" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="sentiment-analysis">Real-time Sentiment</Label>
                      <input type="checkbox" id="sentiment-analysis" defaultChecked className="rounded" />
                    </div>
                    <div>
                      <Label htmlFor="max-call-duration">Max Call Duration</Label>
                      <select id="max-call-duration" className="w-full p-2 border rounded-md bg-white text-gray-900">
                        <option>5 minutes</option>
                        <option>10 minutes</option>
                        <option>15 minutes</option>
                        <option>20 minutes</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Voice Bot Capabilities */}
              <div className="space-y-3">
                <h4 className="font-medium">AI Capabilities</h4>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="flex items-center space-x-3 p-3 border rounded-lg">
                    <Mic className="h-5 w-5 text-blue-500" />
                    <div>
                      <div className="font-medium">Natural Language Processing</div>
                      <div className="text-sm text-muted-foreground">Understands context and intent</div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 p-3 border rounded-lg">
                    <MessageSquare className="h-5 w-5 text-green-500" />
                    <div>
                      <div className="font-medium">Dynamic Responses</div>
                      <div className="text-sm text-muted-foreground">Adapts based on conversation</div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 p-3 border rounded-lg">
                    <TrendingUp className="h-5 w-5 text-orange-500" />
                    <div>
                      <div className="font-medium">Lead Scoring</div>
                      <div className="text-sm text-muted-foreground">Real-time interest assessment</div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 p-3 border rounded-lg">
                    <Calendar className="h-5 w-5 text-purple-500" />
                    <div>
                      <div className="font-medium">Meeting Scheduling</div>
                      <div className="text-sm text-muted-foreground">Books appointments automatically</div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Test Tab */}
        <TabsContent value="test" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Phone className="h-5 w-5 text-blue-500" />
                <span>Test Call Validation</span>
              </CardTitle>
              <CardDescription>
                Run test calls to validate bot performance before launching the campaign
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="p-4">
                  <h4 className="font-medium mb-3">Test Call Setup</h4>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="test-number">Your Test Number</Label>
                      <Input id="test-number" placeholder="+91 98765 43210" />
                    </div>
                    <div>
                      <Label htmlFor="test-scenario">Test Scenario</Label>
                      <select id="test-scenario" className="w-full p-2 border rounded-md">
                        <option>Interested Prospect</option>
                        <option>Busy/Not Interested</option>
                        <option>Wants More Information</option>
                        <option>Ready to Schedule Meeting</option>
                      </select>
                    </div>
                    <Button className="w-full">
                      <PhoneCall className="h-4 w-4 mr-2" />
                      Start Test Call
                    </Button>
                  </div>
                </Card>
                
                <Card className="p-4">
                  <h4 className="font-medium mb-3">Test Results</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span>Call Connection</span>
                      <Badge className="bg-green-100 text-green-800">Success</Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Voice Quality</span>
                      <Badge className="bg-green-100 text-green-800">Excellent</Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Script Flow</span>
                      <Badge className="bg-green-100 text-green-800">Natural</Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Response Handling</span>
                      <Badge className="bg-green-100 text-green-800">Accurate</Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Call Duration</span>
                      <span className="font-medium">3m 42s</span>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Test Call Transcript */}
              <div className="space-y-3">
                <h4 className="font-medium">Sample Test Call Transcript</h4>
                <div className="border rounded-lg p-4 bg-muted/30 max-h-64 overflow-y-auto">
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start space-x-3">
                      <Badge variant="outline" className="bg-blue-100 text-blue-800">Bot</Badge>
                      <p>"Hello Rajesh, this is Sarah from TechSolutions. I hope I'm catching you at a good time. I'm calling because I noticed Avendus Wealth is in the wealth management space..."</p>
                    </div>
                    <div className="flex items-start space-x-3">
                      <Badge variant="outline" className="bg-gray-100 text-gray-800">User</Badge>
                      <p>"Hi Sarah, yes I have a few minutes. What's this about?"</p>
                    </div>
                    <div className="flex items-start space-x-3">
                      <Badge variant="outline" className="bg-blue-100 text-blue-800">Bot</Badge>
                      <p>"Great! We specialize in helping wealth management companies like Avendus increase client engagement by up to 40% through our AI platform. Can you tell me about your current client communication challenges?"</p>
                    </div>
                    <div className="flex items-start space-x-3">
                      <Badge variant="outline" className="bg-gray-100 text-gray-800">User</Badge>
                      <p>"We do struggle with personalized communication at scale. Our relationship managers are overwhelmed."</p>
                    </div>
                    <div className="flex items-start space-x-3">
                      <Badge variant="outline" className="bg-blue-100 text-blue-800">Bot</Badge>
                      <p>"That's exactly what we help with. Would you be open to a 15-minute demo next week where I can show you how we've helped other wealth management firms? I have Tuesday at 2 PM available."</p>
                    </div>
                    <div className="flex items-start space-x-3">
                      <Badge variant="outline" className="bg-gray-100 text-gray-800">User</Badge>
                      <p>"Tuesday at 2 PM works for me. Please send me a calendar invite."</p>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Call Outcome: Meeting Scheduled ✅</span>
                  <Button variant="outline" size="sm">Download Full Transcript</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Campaign Tab */}
        <TabsContent value="campaign" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Play className="h-5 w-5 text-green-500" />
                <span>Launch Voice Campaign</span>
              </CardTitle>
              <CardDescription>
                Configure and start your automated voice calling campaign
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-4">
                  <h4 className="font-medium">Campaign Settings</h4>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="campaign-name">Campaign Name</Label>
                      <Input id="campaign-name" placeholder="Q1 2024 Wealth Management Outreach" />
                    </div>
                    <div>
                      <Label htmlFor="daily-call-limit">Daily Call Limit</Label>
                      <select id="daily-call-limit" className="w-full p-2 border rounded-md">
                        <option>50 calls per day</option>
                        <option>100 calls per day</option>
                        <option>200 calls per day</option>
                        <option>500 calls per day</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="calling-hours">Calling Hours</Label>
                      <select id="calling-hours" className="w-full p-2 border rounded-md">
                        <option>9 AM - 6 PM (Business Hours)</option>
                        <option>10 AM - 8 PM (Extended Hours)</option>
                        <option>9 AM - 9 PM (Full Day)</option>
                        <option>Custom Schedule</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="retry-attempts">Retry Attempts</Label>
                      <select id="retry-attempts" className="w-full p-2 border rounded-md">
                        <option>1 attempt</option>
                        <option>2 attempts</option>
                        <option>3 attempts</option>
                        <option>5 attempts</option>
                      </select>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <h4 className="font-medium">Campaign Targets</h4>
                  <div className="space-y-3">
                    <Card className="p-3">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">2,847</div>
                        <div className="text-sm text-muted-foreground">Total Contacts</div>
                      </div>
                    </Card>
                    <Card className="p-3">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">15%</div>
                        <div className="text-sm text-muted-foreground">Expected Connect Rate</div>
                      </div>
                    </Card>
                    <Card className="p-3">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-orange-600">427</div>
                        <div className="text-sm text-muted-foreground">Projected Conversations</div>
                      </div>
                    </Card>
                  </div>
                </div>
              </div>

              {/* Campaign Schedule */}
              <div className="space-y-3">
                <h4 className="font-medium">Campaign Schedule</h4>
                <div className="grid gap-3 md:grid-cols-7">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                    <div key={day} className="text-center p-3 border rounded-lg">
                      <div className="font-medium">{day}</div>
                      <div className="text-sm text-muted-foreground">9AM-6PM</div>
                      <input type="checkbox" defaultChecked={day !== 'Sat' && day !== 'Sun'} className="mt-2" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Launch Controls */}
              <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200">
                <div>
                  <h4 className="font-medium text-green-800 dark:text-green-200">Ready to Launch</h4>
                  <p className="text-sm text-green-600 dark:text-green-300">All configurations validated. Campaign ready to start.</p>
                </div>
                <Button className="bg-green-600 hover:bg-green-700">
                  <Play className="h-4 w-4 mr-2" />
                  Launch Campaign
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Monitor Tab */}
        <TabsContent value="monitor" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <BarChart3 className="h-5 w-5 text-indigo-500" />
                <span>Campaign Performance</span>
              </CardTitle>
              <CardDescription>
                Real-time monitoring and analytics for your voice bot campaign
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">1,247</div>
                  <div className="text-sm text-muted-foreground">Calls Made</div>
                  <div className="text-xs text-green-600">+18% vs yesterday</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">18.7%</div>
                  <div className="text-sm text-muted-foreground">Connect Rate</div>
                  <div className="text-xs text-green-600">+2.3% vs industry</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-orange-600">4m 32s</div>
                  <div className="text-sm text-muted-foreground">Avg Call Duration</div>
                  <div className="text-xs text-green-600">+45s vs target</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600">89</div>
                  <div className="text-sm text-muted-foreground">Meetings Scheduled</div>
                  <div className="text-xs text-green-600">12.3% conversion</div>
                </Card>
              </div>

              {/* Live Call Activity */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Live Call Activity</h4>
                  <Badge className="bg-green-100 text-green-800 animate-pulse">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                    3 Active Calls
                  </Badge>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                      <div>
                        <span className="font-medium">Rajesh Sharma - Avendus Wealth</span>
                        <p className="text-sm text-muted-foreground">Duration: 2m 15s • Discussing pain points</p>
                      </div>
                    </div>
                    <Badge className="bg-blue-100 text-blue-800">In Progress</Badge>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                      <div>
                        <span className="font-medium">Priya Patel - IIFL Wealth</span>
                        <p className="text-sm text-muted-foreground">Duration: 1m 42s • Value proposition phase</p>
                      </div>
                    </div>
                    <Badge className="bg-blue-100 text-blue-800">In Progress</Badge>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                      <div>
                        <span className="font-medium">Amit Gupta - 360 ONE Wealth</span>
                        <p className="text-sm text-muted-foreground">Duration: 3m 28s • Scheduling meeting</p>
                      </div>
                    </div>
                    <Badge className="bg-orange-100 text-orange-800">Closing</Badge>
                  </div>
                </div>
              </div>

              {/* Recent Call Results */}
              <div className="space-y-3">
                <h4 className="font-medium">Recent Call Results</h4>
                <div className="space-y-2">
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">Neha Singh - Waterfield Advisors</span>
                      <Badge className="bg-green-100 text-green-800">Meeting Scheduled</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      "This sounds very relevant to our current challenges. Let's schedule a demo for next Tuesday."
                    </p>
                    <div className="flex items-center space-x-4 mt-2 text-xs text-muted-foreground">
                      <span>Duration: 4m 15s</span>
                      <span>Interest Level: High</span>
                      <span>Next Action: Demo scheduled</span>
                    </div>
                  </div>
                  
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">Vikram Agarwal - ASK Investment</span>
                      <Badge className="bg-blue-100 text-blue-800">Follow-up Needed</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      "Interesting solution. Can you send me more information? I'll review and get back to you."
                    </p>
                    <div className="flex items-center space-x-4 mt-2 text-xs text-muted-foreground">
                      <span>Duration: 3m 02s</span>
                      <span>Interest Level: Medium</span>
                      <span>Next Action: Send materials</span>
                    </div>
                  </div>
                  
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">Kavya Reddy - Sanctum Wealth</span>
                      <Badge className="bg-gray-100 text-gray-800">Not Interested</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      "We're happy with our current solution. Not looking to change right now."
                    </p>
                    <div className="flex items-center space-x-4 mt-2 text-xs text-muted-foreground">
                      <span>Duration: 1m 48s</span>
                      <span>Interest Level: Low</span>
                      <span>Next Action: Follow-up in 6 months</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Campaign Controls */}
              <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200">
                <div>
                  <h4 className="font-medium text-blue-800 dark:text-blue-200">Campaign Active</h4>
                  <p className="text-sm text-blue-600 dark:text-blue-300">Running since 9:00 AM • Next batch starts in 15 minutes</p>
                </div>
                <div className="flex space-x-2">
                  <Button variant="outline" size="sm">
                    <Timer className="h-4 w-4 mr-2" />
                    Pause Campaign
                  </Button>
                  <Button variant="outline" size="sm">
                    <Settings className="h-4 w-4 mr-2" />
                    Adjust Settings
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Deploy Voice Bot Button */}
      <div className="flex justify-center">
        <Button
          onClick={deployVoiceBot}
          disabled={isProcessing || currentStep >= steps.length - 1}
          className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white px-8 py-3 text-lg font-semibold transition-all duration-300 hover:scale-105 shadow-lg"
        >
          {isProcessing ? (
            <>
              <Clock className="mr-2 h-5 w-5 animate-spin" />
              Deploying Voice Bot...
            </>
          ) : (
            <>
              <Zap className="mr-2 h-5 w-5" />
              Deploy Voice Bot
            </>
          )}
        </Button>
      </div>
    </div>
  );
}