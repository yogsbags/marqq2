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
  DollarSign, 
  Brain, 
  Target, 
  TrendingUp, 
  BarChart3, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  Zap,
  Calculator,
  PieChart,
  LineChart
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

export function BudgetOptimizationFlow() {
  const [currentStep, setCurrentStep] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');
  
  const [steps, setSteps] = useState<WorkflowStep[]>([
    {
      id: 'upload',
      title: 'Upload Campaign Data',
      description: 'Upload current campaign performance data',
      icon: Upload,
      status: 'pending'
    },
    {
      id: 'analysis',
      title: 'AI Budget Analysis',
      description: 'AI analyzes spending patterns and performance',
      icon: Brain,
      status: 'pending'
    },
    {
      id: 'recommendations',
      title: 'Generate Recommendations',
      description: 'Create optimization recommendations',
      icon: Target,
      status: 'pending'
    },
    {
      id: 'modeling',
      title: 'Scenario Modeling',
      description: 'Model different budget allocation scenarios',
      icon: Calculator,
      status: 'pending'
    },
    {
      id: 'optimization',
      title: 'Deploy Optimization',
      description: 'Apply optimized budget allocation',
      icon: TrendingUp,
      status: 'pending'
    },
    {
      id: 'tracking',
      title: 'Performance Tracking',
      description: 'Monitor optimized campaign performance',
      icon: BarChart3,
      status: 'pending'
    }
  ]);

  const updateStepStatus = (stepIndex: number, status: WorkflowStep['status'], progress?: number) => {
    setSteps(prev => prev.map((step, index) => 
      index === stepIndex ? { ...step, status, progress } : step
    ));
  };

  const deployBudgetOptimization = async () => {
    setIsProcessing(true);
    
    try {
      // Execute actual AI agent tasks for budget optimization
      const optimizerAgent = AgentService.getAgents().find(agent => agent.role.includes('Optimization'));
      if (optimizerAgent) {
        // Execute campaign optimization
        await AgentService.executeTask(optimizerAgent.id, {
          type: 'campaign_optimization',
          description: 'Analyze campaign performance and optimize budget allocation',
          input: {
            campaignData: [
              { name: 'Search Ads', spend: 50000, conversions: 245, ctr: 0.045 },
              { name: 'Social Media', spend: 30000, conversions: 156, ctr: 0.032 },
              { name: 'Display Ads', spend: 20000, conversions: 89, ctr: 0.018 }
            ],
            totalBudget: 125000,
            timeframe: '30d'
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
      
      toast.success('Budget Optimization workflow completed successfully! 🎉');
      setActiveTab('tracking'); // Auto-switch to last tab
    } catch (error) {
      toast.error('Budget Optimization workflow failed. Please try again.');
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
          Campaign Budget Optimization
        </h1>
        <p className="text-muted-foreground">
          Optimize your marketing spend with AI-powered budget allocation and performance tracking
        </p>
      </div>

      {/* Workflow Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Zap className="h-5 w-5 text-green-500" />
            <span>Budget Optimization Workflow</span>
          </CardTitle>
          <CardDescription>
            Follow the sequential steps to optimize your campaign budget allocation
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
                <span>Upload Campaign Data</span>
              </CardTitle>
              <CardDescription>
                Upload current campaign performance data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div 
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-green-400 transition-colors cursor-pointer"
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById('budget-file-upload')?.click()}
              >
                <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <div className="space-y-2">
                  <span className="text-lg font-medium">Drop your campaign data file here</span>
                  <p className="text-sm text-muted-foreground">or click to browse</p>
                  <p className="text-xs text-muted-foreground">Supports .xlsx, .xls, .csv files (max 10MB)</p>
                </div>
              </div>
              
              <Input
                id="budget-file-upload"
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
                  <DollarSign className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                  <h4 className="font-medium">Campaign Spend</h4>
                  <p className="text-sm text-muted-foreground">Budget allocation, costs</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <TrendingUp className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <h4 className="font-medium">Performance Data</h4>
                  <p className="text-sm text-muted-foreground">ROI, conversions, metrics</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <Target className="h-8 w-8 text-purple-500 mx-auto mb-2" />
                  <h4 className="font-medium">Channel Data</h4>
                  <p className="text-sm text-muted-foreground">Platform performance</p>
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
                <span>AI Budget Analysis</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="p-4">
                  <PieChart className="h-8 w-8 text-blue-500 mb-2" />
                  <h4 className="font-medium">Spend Distribution</h4>
                  <p className="text-sm text-muted-foreground">Analyzing current allocation</p>
                </Card>
                <Card className="p-4">
                  <LineChart className="h-8 w-8 text-green-500 mb-2" />
                  <h4 className="font-medium">Performance Trends</h4>
                  <p className="text-sm text-muted-foreground">Identifying patterns</p>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Target className="h-5 w-5 text-red-500" />
                <span>Optimization Recommendations</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-900/20">
                  <h4 className="font-medium text-green-800 dark:text-green-200">Increase Search Ads Budget</h4>
                  <p className="text-sm text-green-600 dark:text-green-300">+25% allocation recommended for 18% ROAS improvement</p>
                </div>
                <div className="p-4 border rounded-lg bg-orange-50 dark:bg-orange-900/20">
                  <h4 className="font-medium text-orange-800 dark:text-orange-200">Reduce Display Ads</h4>
                  <p className="text-sm text-orange-600 dark:text-orange-300">-15% allocation due to low conversion rates</p>
                </div>
                <div className="p-4 border rounded-lg bg-blue-50 dark:bg-blue-900/20">
                  <h4 className="font-medium text-blue-800 dark:text-blue-200">Optimize Social Media</h4>
                  <p className="text-sm text-blue-600 dark:text-blue-300">Reallocate budget to high-performing platforms</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="modeling" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Calculator className="h-5 w-5 text-purple-500" />
                <span>Scenario Modeling</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">+18%</div>
                  <div className="text-sm text-muted-foreground">ROAS Improvement</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">₹2.1L</div>
                  <div className="text-sm text-muted-foreground">Additional Revenue</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600">8</div>
                  <div className="text-sm text-muted-foreground">Campaigns Optimized</div>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="optimization" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <TrendingUp className="h-5 w-5 text-green-500" />
                <span>Deploy Optimization</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="optimization-name">Optimization Name</Label>
                  <Input id="optimization-name" placeholder="Q1 2024 Budget Optimization" />
                </div>
                <Button className="w-full">Apply Budget Optimization</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tracking" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <BarChart3 className="h-5 w-5 text-indigo-500" />
                <span>Performance Tracking</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">₹125K</div>
                  <div className="text-sm text-muted-foreground">Budget Optimized</div>
                  <div className="text-xs text-green-600">+20% vs last month</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">18.5%</div>
                  <div className="text-sm text-muted-foreground">Cost Reduction</div>
                  <div className="text-xs text-green-600">+7% improvement</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-orange-600">3.2x</div>
                  <div className="text-sm text-muted-foreground">ROAS</div>
                  <div className="text-xs text-green-600">+11% vs target</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600">Real-time</div>
                  <div className="text-sm text-muted-foreground">Adjustments</div>
                  <div className="text-xs text-green-600">Active monitoring</div>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Deploy Button */}
      <div className="flex justify-center">
        <Button
          onClick={deployBudgetOptimization}
          disabled={isProcessing}
          className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white px-8 py-3 text-lg font-semibold transition-all duration-300 hover:scale-105 shadow-lg"
        >
          {isProcessing ? (
            <>
              <Clock className="mr-2 h-5 w-5 animate-spin" />
              Optimizing Budget...
            </>
          ) : (
            <>
              <Zap className="mr-2 h-5 w-5" />
              Deploy Budget Optimization
            </>
          )}
        </Button>
      </div>
    </div>
  );
}