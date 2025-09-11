import { useEffect, useState } from 'react';
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
  Search, 
  Brain, 
  Target, 
  TrendingUp, 
  BarChart3, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  Zap,
  Globe,
  FileText,
  Eye,
  Link,
  Star,
  Award,
  Lightbulb,
  Settings
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

export function SEOLLMOFlow() {
  const [currentStep, setCurrentStep] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');
  
  const [steps, setSteps] = useState<WorkflowStep[]>([
    {
      id: 'upload',
      title: 'Upload Website Data',
      description: 'Upload website content and competitor data',
      icon: Upload,
      status: 'pending'
    },
    {
      id: 'analysis',
      title: 'SEO Analysis',
      description: 'AI analyzes current SEO performance',
      icon: Search,
      status: 'pending'
    },
    {
      id: 'keywords',
      title: 'Keyword Research',
      description: 'Identify high-value keywords and opportunities',
      icon: Target,
      status: 'pending'
    },
    {
      id: 'optimization',
      title: 'Content Optimization',
      description: 'Optimize content for search engines and LLMs',
      icon: Brain,
      status: 'pending'
    },
    {
      id: 'implementation',
      title: 'Deploy Changes',
      description: 'Implement SEO and LLMO improvements',
      icon: Settings,
      status: 'pending'
    },
    {
      id: 'monitoring',
      title: 'Performance Monitoring',
      description: 'Track rankings and organic traffic growth',
      icon: BarChart3,
      status: 'pending'
    }
  ]);

  const updateStepStatus = (stepIndex: number, status: WorkflowStep['status'], progress?: number) => {
    setSteps(prev => prev.map((step, index) => 
      index === stepIndex ? { ...step, status, progress } : step
    ));
  };

  const deploySEOLLMO = async () => {
    setIsProcessing(true);
    
    try {
      // Execute actual AI agent tasks for SEO/LLMO optimization
      const contentAgent = AgentService.getAgents().find(agent => agent.role.includes('Content'));
      if (contentAgent) {
        // Execute SEO optimization task
        await AgentService.executeTask(contentAgent.id, {
          type: 'content_generation',
          description: 'Optimize content for search engines and Large Language Models',
          input: {
            contentType: 'seo_optimization',
            topic: 'Website content optimization for AI discoverability',
            targetKeywords: ['AI marketing', 'marketing automation', 'lead intelligence'],
            optimizeForSEO: true,
            optimizeForLLMO: true,
            websiteData: {
              pages: 247,
              currentRankings: { 'AI marketing automation': 15, 'marketing intelligence': 8 }
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
      
      toast.success('SEO/LLMO optimization workflow completed successfully! 🎉');
      setActiveTab('monitoring'); // Auto-switch to last tab
    } catch (error) {
      toast.error('SEO/LLMO optimization workflow failed. Please try again.');
      updateStepStatus(currentStep, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = ['.xlsx', '.xls', '.csv', '.xml', '.html', '.txt'];
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      
      if (!validTypes.includes(fileExtension)) {
        toast.error('Please upload a valid file (.xlsx, .xls, .csv, .xml, .html, .txt)');
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
        <h1 className="text-3xl font-bold bg-gradient-to-r from-green-600 to-teal-600 bg-clip-text text-transparent">
          SEO & LLMO Optimization
        </h1>
        <p className="text-muted-foreground">
          Optimize your content for search engines and Large Language Models to maximize visibility
        </p>
      </div>

      {/* Workflow Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Zap className="h-5 w-5 text-green-500" />
            <span>SEO/LLMO Optimization Workflow</span>
          </CardTitle>
          <CardDescription>
            Follow the sequential steps to optimize your content for search engines and AI models
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

        <TabsContent value="upload" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Upload className="h-5 w-5 text-blue-500" />
                <span>Upload Website Data</span>
              </CardTitle>
              <CardDescription>
                Upload your website content, sitemap, and competitor analysis data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div 
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-green-400 transition-colors cursor-pointer"
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById('seo-file-upload')?.click()}
              >
                <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <div className="space-y-2">
                  <span className="text-lg font-medium">Drop your website data file here</span>
                  <p className="text-sm text-muted-foreground">or click to browse</p>
                  <p className="text-xs text-muted-foreground">Supports .xlsx, .xls, .csv, .xml, .html, .txt files (max 10MB)</p>
                </div>
              </div>
              
              <Input
                id="seo-file-upload"
                type="file"
                accept=".xlsx,.xls,.csv,.xml,.html,.txt"
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
                <Card className="p-4 text-center">
                  <Globe className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                  <h4 className="font-medium">Website Content</h4>
                  <p className="text-sm text-muted-foreground">Pages, blogs, product descriptions</p>
                </Card>
                <Card className="p-4 text-center">
                  <FileText className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <h4 className="font-medium">Sitemap & Structure</h4>
                  <p className="text-sm text-muted-foreground">XML sitemaps, URL structure</p>
                </Card>
                <Card className="p-4 text-center">
                  <Eye className="h-8 w-8 text-purple-500 mx-auto mb-2" />
                  <h4 className="font-medium">Competitor Analysis</h4>
                  <p className="text-sm text-muted-foreground">Competitor keywords, content</p>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Search className="h-5 w-5 text-purple-500" />
                <span>SEO Performance Analysis</span>
              </CardTitle>
              <CardDescription>
                AI analyzes your current SEO performance and identifies opportunities
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="p-4">
                  <h4 className="font-medium mb-3">Current SEO Health</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Technical SEO</span>
                      <div className="flex items-center space-x-2">
                        <Progress value={78} className="w-16 h-2" />
                        <span className="text-sm font-medium">78%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Content Quality</span>
                      <div className="flex items-center space-x-2">
                        <Progress value={85} className="w-16 h-2" />
                        <span className="text-sm font-medium">85%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Keyword Optimization</span>
                      <div className="flex items-center space-x-2">
                        <Progress value={62} className="w-16 h-2" />
                        <span className="text-sm font-medium">62%</span>
                      </div>
                    </div>
                  </div>
                </Card>
                
                <Card className="p-4">
                  <h4 className="font-medium mb-3">LLMO Readiness</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">AI Discoverability</span>
                      <div className="flex items-center space-x-2">
                        <Progress value={71} className="w-16 h-2" />
                        <span className="text-sm font-medium">71%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Structured Data</span>
                      <div className="flex items-center space-x-2">
                        <Progress value={45} className="w-16 h-2" />
                        <span className="text-sm font-medium">45%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Content Clarity</span>
                      <div className="flex items-center space-x-2">
                        <Progress value={89} className="w-16 h-2" />
                        <span className="text-sm font-medium">89%</span>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
              
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200">
                <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">🔍 Analysis Complete</h4>
                <p className="text-sm text-blue-600 dark:text-blue-300">
                  Analyzed 247 pages, identified 89 optimization opportunities, and found 34 high-impact keywords
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="keywords" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Target className="h-5 w-5 text-red-500" />
                <span>Keyword Research & Opportunities</span>
              </CardTitle>
              <CardDescription>
                AI-powered keyword research and content gap analysis
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">3.2K</div>
                  <div className="text-sm text-muted-foreground">Keywords Identified</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">156</div>
                  <div className="text-sm text-muted-foreground">High-Value Opportunities</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600">89%</div>
                  <div className="text-sm text-muted-foreground">Relevance Score</div>
                </Card>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Top Keyword Opportunities</h4>
                <div className="space-y-2">
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">"AI marketing automation"</span>
                      <Badge className="bg-green-100 text-green-800">High Opportunity</Badge>
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <span>Search Volume: 12K/month</span>
                      <span>Difficulty: Medium</span>
                      <span>Current Rank: #15</span>
                    </div>
                  </div>
                  
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">"marketing intelligence platform"</span>
                      <Badge className="bg-blue-100 text-blue-800">Medium Opportunity</Badge>
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <span>Search Volume: 8.5K/month</span>
                      <span>Difficulty: Low</span>
                      <span>Current Rank: #8</span>
                    </div>
                  </div>
                  
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">"customer engagement AI"</span>
                      <Badge className="bg-purple-100 text-purple-800">Quick Win</Badge>
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <span>Search Volume: 6.2K/month</span>
                      <span>Difficulty: Low</span>
                      <span>Current Rank: Not Ranking</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="optimization" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Brain className="h-5 w-5 text-purple-500" />
                <span>Content Optimization</span>
              </CardTitle>
              <CardDescription>
                AI optimizes your content for both search engines and Large Language Models
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-4">
                  <h4 className="font-medium">SEO Optimizations</h4>
                  <div className="space-y-2">
                    <div className="p-3 border rounded-lg bg-green-50 dark:bg-green-900/20">
                      <div className="flex items-center space-x-2 mb-1">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="font-medium text-sm">Title Tags Optimized</span>
                      </div>
                      <p className="text-xs text-muted-foreground">247 pages updated with target keywords</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-green-50 dark:bg-green-900/20">
                      <div className="flex items-center space-x-2 mb-1">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="font-medium text-sm">Meta Descriptions Enhanced</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Improved CTR potential by 23%</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-green-50 dark:bg-green-900/20">
                      <div className="flex items-center space-x-2 mb-1">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="font-medium text-sm">Header Structure Fixed</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Proper H1-H6 hierarchy implemented</p>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <h4 className="font-medium">LLMO Optimizations</h4>
                  <div className="space-y-2">
                    <div className="p-3 border rounded-lg bg-blue-50 dark:bg-blue-900/20">
                      <div className="flex items-center space-x-2 mb-1">
                        <Lightbulb className="h-4 w-4 text-blue-500" />
                        <span className="font-medium text-sm">Structured Data Added</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Schema markup for AI understanding</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-blue-50 dark:bg-blue-900/20">
                      <div className="flex items-center space-x-2 mb-1">
                        <Lightbulb className="h-4 w-4 text-blue-500" />
                        <span className="font-medium text-sm">Content Clarity Improved</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Enhanced for AI model comprehension</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-blue-50 dark:bg-blue-900/20">
                      <div className="flex items-center space-x-2 mb-1">
                        <Lightbulb className="h-4 w-4 text-blue-500" />
                        <span className="font-medium text-sm">FAQ Sections Added</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Optimized for voice search & AI queries</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Content Recommendations</h4>
                <div className="p-4 border rounded-lg">
                  <h5 className="font-medium mb-2">Page: "AI Marketing Solutions"</h5>
                  <div className="space-y-2 text-sm">
                    <p><strong>Original Title:</strong> "Marketing Solutions - Our Company"</p>
                    <p><strong>Optimized Title:</strong> "AI Marketing Automation Platform | Boost ROI by 300% | Torqq AI"</p>
                    <p className="text-green-600"><strong>Impact:</strong> +45% click-through rate potential</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="implementation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Settings className="h-5 w-5 text-orange-500" />
                <span>Deploy SEO/LLMO Changes</span>
              </CardTitle>
              <CardDescription>
                Implement all optimization recommendations across your website
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <h4 className="font-medium">Implementation Status</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span className="text-sm">Title Tags & Meta Descriptions</span>
                      <Badge className="bg-green-100 text-green-800">Deployed</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span className="text-sm">Structured Data Schema</span>
                      <Badge className="bg-green-100 text-green-800">Deployed</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span className="text-sm">Internal Linking Structure</span>
                      <Badge className="bg-blue-100 text-blue-800">In Progress</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span className="text-sm">Content Optimization</span>
                      <Badge className="bg-orange-100 text-orange-800">Pending</Badge>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <h4 className="font-medium">Technical Improvements</h4>
                  <Card className="p-4">
                    <div className="space-y-3">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">94%</div>
                        <div className="text-sm text-muted-foreground">Page Speed Score</div>
                        <div className="text-xs text-green-600">+12% improvement</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">98%</div>
                        <div className="text-sm text-muted-foreground">Mobile Friendliness</div>
                        <div className="text-xs text-green-600">+5% improvement</div>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>

              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200">
                <h4 className="font-medium text-green-800 dark:text-green-200 mb-2">🚀 Ready for Deployment</h4>
                <p className="text-sm text-green-600 dark:text-green-300 mb-3">
                  All optimizations are ready to be deployed. Expected impact: +67% organic traffic growth
                </p>
                <Button className="bg-green-600 hover:bg-green-700">
                  <Settings className="h-4 w-4 mr-2" />
                  Deploy All Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monitoring" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <BarChart3 className="h-5 w-5 text-indigo-500" />
                <span>Performance Monitoring</span>
              </CardTitle>
              <CardDescription>
                Track your SEO and LLMO performance improvements in real-time
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">3.2K</div>
                  <div className="text-sm text-muted-foreground">Keywords Optimized</div>
                  <div className="text-xs text-green-600">+28% vs last month</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">Top 3</div>
                  <div className="text-sm text-muted-foreground">Avg Search Ranking</div>
                  <div className="text-xs text-green-600">+15 positions</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600">+67%</div>
                  <div className="text-sm text-muted-foreground">Organic Traffic</div>
                  <div className="text-xs text-green-600">+22% growth rate</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-orange-600">89%</div>
                  <div className="text-sm text-muted-foreground">LLMO Score</div>
                  <div className="text-xs text-green-600">AI-ready content</div>
                </Card>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Ranking Improvements</h4>
                <div className="space-y-2">
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">"AI marketing automation"</span>
                      <div className="flex items-center space-x-2">
                        <Badge className="bg-green-100 text-green-800">#3</Badge>
                        <span className="text-xs text-green-600">↑12 positions</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <span>Traffic: +234%</span>
                      <span>Clicks: 2.4K/month</span>
                      <span>CTR: 8.9%</span>
                    </div>
                  </div>
                  
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">"marketing intelligence platform"</span>
                      <div className="flex items-center space-x-2">
                        <Badge className="bg-blue-100 text-blue-800">#1</Badge>
                        <span className="text-xs text-green-600">↑7 positions</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <span>Traffic: +189%</span>
                      <span>Clicks: 3.1K/month</span>
                      <span>CTR: 12.3%</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200">
                <h4 className="font-medium text-green-800 dark:text-green-200 mb-2">📈 Performance Summary</h4>
                <div className="grid gap-2 md:grid-cols-2 text-sm text-green-600 dark:text-green-300">
                  <div>• 67% increase in organic traffic</div>
                  <div>• 156 keywords in top 10 positions</div>
                  <div>• 89% improvement in LLMO readiness</div>
                  <div>• 23% higher click-through rates</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Deploy Button */}
      <div className="flex justify-center">
        <Button
          onClick={deploySEOLLMO}
          disabled={isProcessing}
          className="bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 text-white px-8 py-3 text-lg font-semibold transition-all duration-300 hover:scale-105 shadow-lg"
        >
          {isProcessing ? (
            <>
              <Clock className="mr-2 h-5 w-5 animate-spin" />
              Optimizing SEO/LLMO...
            </>
          ) : (
            <>
              <Zap className="mr-2 h-5 w-5" />
              Deploy SEO/LLMO Optimization
            </>
          )}
        </Button>
      </div>
    </div>
  );
}