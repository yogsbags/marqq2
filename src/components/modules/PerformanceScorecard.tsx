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
  BarChart3, 
  Brain, 
  Award, 
  TrendingUp, 
  Monitor, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  Zap,
  Target,
  Star,
  Trophy
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

export function PerformanceScorecard() {
  const [currentStep, setCurrentStep] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');
  
  const [steps, setSteps] = useState<WorkflowStep[]>([
    {
      id: 'upload',
      title: 'Upload Performance Data',
      description: 'Upload campaign and business performance data',
      icon: Upload,
      status: 'pending'
    },
    {
      id: 'analysis',
      title: 'AI Performance Analysis',
      description: 'AI analyzes performance across all metrics',
      icon: Brain,
      status: 'pending'
    },
    {
      id: 'scorecard',
      title: 'Generate Scorecard',
      description: 'Create comprehensive performance scorecard',
      icon: Award,
      status: 'pending'
    },
    {
      id: 'benchmarking',
      title: 'Industry Benchmarking',
      description: 'Compare performance against industry standards',
      icon: Target,
      status: 'pending'
    },
    {
      id: 'forecasting',
      title: 'Predictive Forecasting',
      description: 'Generate future performance predictions',
      icon: TrendingUp,
      status: 'pending'
    },
    {
      id: 'dashboard',
      title: 'Live Dashboard',
      description: 'Deploy real-time performance dashboard',
      icon: Monitor,
      status: 'pending'
    }
  ]);

  const updateStepStatus = (stepIndex: number, status: WorkflowStep['status'], progress?: number) => {
    setSteps(prev => prev.map((step, index) => 
      index === stepIndex ? { ...step, status, progress } : step
    ));
  };

  const deployPerformanceScorecard = async () => {
    setIsProcessing(true);
    
    try {
      // Execute actual AI agent tasks for performance analysis
      const optimizerAgent = AgentService.getAgents().find(agent => agent.role.includes('Optimization'));
      if (optimizerAgent) {
        // Execute performance analysis
        await AgentService.executeTask(optimizerAgent.id, {
          type: 'campaign_optimization',
          description: 'Generate comprehensive performance scorecard and benchmarking',
          input: {
            campaignData: [
              { name: 'Search Ads', spend: 50000, conversions: 245, ctr: 0.045 },
              { name: 'Social Media', spend: 30000, conversions: 156, ctr: 0.032 },
              { name: 'Email Marketing', spend: 15000, conversions: 189, ctr: 0.067 }
            ],
            totalBudget: 95000,
            timeframe: '90d',
            includeForecasting: true
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
      
      toast.success('Performance Scorecard workflow completed successfully! 🎉');
      setActiveTab('dashboard'); // Auto-switch to last tab
    } catch (error) {
      toast.error('Performance Scorecard workflow failed. Please try again.');
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
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      
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
        <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
          Performance Scorecard
        </h1>
        <p className="text-muted-foreground">
          Comprehensive performance analysis with AI-powered insights and industry benchmarking
        </p>
      </div>

      {/* Workflow Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Zap className="h-5 w-5 text-purple-500" />
            <span>Scorecard Generation Workflow</span>
          </CardTitle>
          <CardDescription>
            Follow the sequential steps to generate your comprehensive performance scorecard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={cn(
                  "flex items-center space-x-4 p-4 rounded-lg border transition-all duration-300",
                  index === currentStep ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20" : "border-gray-200",
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
                index === currentStep ? "text-purple-600" : ""
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
                <span>Upload Performance Data</span>
              </CardTitle>
              <CardDescription>
                Upload campaign performance and business metrics data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div 
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-purple-400 transition-colors cursor-pointer"
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById('scorecard-file-upload')?.click()}
              >
                <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <div className="space-y-2">
                  <span className="text-lg font-medium">Drop your performance data file here</span>
                  <p className="text-sm text-muted-foreground">or click to browse</p>
                  <p className="text-xs text-muted-foreground">Supports .xlsx, .xls, .csv files (max 10MB)</p>
                </div>
              </div>
              
              <Input
                id="scorecard-file-upload"
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
                  <BarChart3 className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                  <h4 className="font-medium">KPI Data</h4>
                  <p className="text-sm text-muted-foreground">Key performance indicators</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <TrendingUp className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <h4 className="font-medium">Business Metrics</h4>
                  <p className="text-sm text-muted-foreground">Revenue, growth, efficiency</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <Target className="h-8 w-8 text-purple-500 mx-auto mb-2" />
                  <h4 className="font-medium">Benchmark Data</h4>
                  <p className="text-sm text-muted-foreground">Industry comparisons</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Brain className="h-5 w-5 text-purple-500" />
                <span>AI Performance Analysis</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="p-4">
                  <BarChart3 className="h-8 w-8 text-blue-500 mb-2" />
                  <h4 className="font-medium">Metric Analysis</h4>
                  <p className="text-sm text-muted-foreground">Analyzing 24 KPIs</p>
                </Card>
                <Card className="p-4">
                  <TrendingUp className="h-8 w-8 text-green-500 mb-2" />
                  <h4 className="font-medium">Trend Analysis</h4>
                  <p className="text-sm text-muted-foreground">Identifying patterns</p>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scorecard" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Award className="h-5 w-5 text-yellow-500" />
                <span>Performance Scorecard</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center mb-6">
                <div className="text-6xl font-bold text-green-600 mb-2">92</div>
                <div className="text-xl font-semibold text-gray-700 dark:text-gray-300">Overall Score</div>
                <Badge className="bg-green-100 text-green-800 text-lg px-4 py-1">Excellent</Badge>
              </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Marketing Performance</span>
                    <span className="text-2xl font-bold text-blue-600">88</span>
                  </div>
                  <Progress value={88} className="h-2" />
                </Card>
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Sales Performance</span>
                    <span className="text-2xl font-bold text-green-600">95</span>
                  </div>
                  <Progress value={95} className="h-2" />
                </Card>
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Customer Satisfaction</span>
                    <span className="text-2xl font-bold text-purple-600">91</span>
                  </div>
                  <Progress value={91} className="h-2" />
                </Card>
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Operational Efficiency</span>
                    <span className="text-2xl font-bold text-orange-600">89</span>
                  </div>
                  <Progress value={89} className="h-2" />
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="benchmarking" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Target className="h-5 w-5 text-red-500" />
                <span>Industry Benchmarking</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg bg-green-50 dark:bg-green-900/20">
                  <div className="flex items-center space-x-3">
                    <Trophy className="h-6 w-6 text-yellow-500" />
                    <div>
                      <h4 className="font-medium">Industry Ranking</h4>
                      <p className="text-sm text-muted-foreground">Top 10% in your industry</p>
                    </div>
                  </div>
                  <Badge className="bg-green-100 text-green-800">Excellent</Badge>
                </div>
                
                <div className="grid gap-4 md:grid-cols-3">
                  <Card className="p-4 text-center">
                    <Star className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
                    <div className="text-2xl font-bold">₹52.7L</div>
                    <div className="text-sm text-muted-foreground">Revenue Tracked</div>
                  </Card>
                  <Card className="p-4 text-center">
                    <Target className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                    <div className="text-2xl font-bold">24</div>
                    <div className="text-sm text-muted-foreground">KPIs Tracked</div>
                  </Card>
                  <Card className="p-4 text-center">
                    <TrendingUp className="h-8 w-8 text-green-500 mx-auto mb-2" />
                    <div className="text-2xl font-bold">+12%</div>
                    <div className="text-sm text-muted-foreground">Score Improvement</div>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="forecasting" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <TrendingUp className="h-5 w-5 text-green-500" />
                <span>Predictive Forecasting</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="p-4">
                  <h4 className="font-medium mb-3">Next Quarter Forecast</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Revenue Growth</span>
                      <span className="font-bold text-green-600">+15%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Customer Acquisition</span>
                      <span className="font-bold text-blue-600">+22%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Market Share</span>
                      <span className="font-bold text-purple-600">+8%</span>
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <h4 className="font-medium mb-3">Risk Assessment</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Market Risk</span>
                      <Badge className="bg-green-100 text-green-800">Low</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Competition Risk</span>
                      <Badge className="bg-yellow-100 text-yellow-800">Medium</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Operational Risk</span>
                      <Badge className="bg-green-100 text-green-800">Low</Badge>
                    </div>
                  </div>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dashboard" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Monitor className="h-5 w-5 text-indigo-500" />
                <span>Live Performance Dashboard</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">92/100</div>
                  <div className="text-sm text-muted-foreground">Overall Score</div>
                  <div className="text-xs text-green-600">+12% improvement</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">89</div>
                  <div className="text-sm text-muted-foreground">Forecasts Generated</div>
                  <div className="text-xs text-green-600">+25% vs last month</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600">Top 10%</div>
                  <div className="text-sm text-muted-foreground">Industry Ranking</div>
                  <div className="text-xs text-green-600">Excellent performance</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-orange-600">Real-time</div>
                  <div className="text-sm text-muted-foreground">Monitoring</div>
                  <div className="text-xs text-green-600">Live updates</div>
                </Card>
              </div>
              
              <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200">
                <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">Dashboard Features</h4>
                <div className="grid gap-2 md:grid-cols-2 text-sm">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Real-time KPI tracking</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Industry benchmarking</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Predictive analytics</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Automated reporting</span>
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
          onClick={deployPerformanceScorecard}
          disabled={isProcessing}
          className="bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white px-8 py-3 text-lg font-semibold transition-all duration-300 hover:scale-105 shadow-lg"
        >
          {isProcessing ? (
            <>
              <Clock className="mr-2 h-5 w-5 animate-spin" />
              Generating Scorecard...
            </>
          ) : (
            <>
              <Zap className="mr-2 h-5 w-5" />
              Generate Performance Scorecard
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
