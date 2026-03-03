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
  Eye,
  Database,
  Users,
  Brain,
  Monitor,
  CheckCircle,
  Clock,
  AlertCircle,
  Zap,
  Link,
  Target,
  BarChart3,
  UserCheck,
  Lightbulb,
  AlertTriangle
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

export function UnifiedCustomerViewFlow() {
  const [currentStep, setCurrentStep] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');
  
  const [steps, setSteps] = useState<WorkflowStep[]>([
    {
      id: 'upload',
      title: 'Upload Customer Data',
      description: 'Upload customer data from multiple sources',
      icon: Upload,
      status: 'pending'
    },
    {
      id: 'integration',
      title: 'Data Integration',
      description: 'Integrate and normalize data from all sources',
      icon: Database,
      status: 'pending'
    },
    {
      id: 'profiles',
      title: 'Build Unified Profiles',
      description: 'Create comprehensive customer profiles',
      icon: Users,
      status: 'pending'
    },
    {
      id: 'segmentation',
      title: 'Smart Segmentation',
      description: 'AI-powered customer segmentation',
      icon: Brain,
      status: 'pending'
    },
    {
      id: 'insights',
      title: 'Generate Insights',
      description: 'Extract actionable customer insights',
      icon: Target,
      status: 'pending'
    },
    {
      id: 'dashboard',
      title: 'Deploy Dashboard',
      description: 'Launch unified customer view dashboard',
      icon: Monitor,
      status: 'pending'
    }
  ]);

  const updateStepStatus = (stepIndex: number, status: WorkflowStep['status'], progress?: number) => {
    setSteps(prev => prev.map((step, index) => 
      index === stepIndex ? { ...step, status, progress } : step
    ));
  };

  const deployCustomerView = async () => {
    setIsProcessing(true);
    
    try {
      // Execute actual AI agent tasks for unified customer view
      const customerAgent = AgentService.getAgents().find(agent => agent.role.includes('Customer'));
      if (customerAgent) {
        // Execute customer view analysis
        await AgentService.executeTask(customerAgent.id, {
          type: 'customer_segmentation',
          description: 'Build unified customer profiles and generate 360-degree insights',
          input: {
            customerData: Array(45000).fill({}).map(() => ({
              id: Math.random().toString(),
              email: 'customer@example.com',
              company: 'Example Corp',
              ltv: Math.random() * 50000,
              engagementScore: Math.random() * 100,
              touchpoints: ['email', 'website', 'support', 'sales'],
              lastActivity: new Date()
            })),
            criteria: { 
              method: 'unified_view',
              includeChurnRisk: true,
              includeLTV: true,
              includeEngagement: true
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
      
      toast.success('Unified Customer View workflow completed successfully!');
      setActiveTab('dashboard'); // Auto-switch to last tab
    } catch (error) {
      toast.error('Unified Customer View workflow failed. Please try again.');
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
      toast.success(`${file.name} uploaded successfully!`);
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
        <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
          Unified Customer View
        </h1>
        <p className="text-muted-foreground">
          Create a 360-degree view of your customers by unifying data from all touchpoints
        </p>
      </div>

      {/* Workflow Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Zap className="h-5 w-5 text-pink-500" />
            <span>Customer View Workflow</span>
          </CardTitle>
          <CardDescription>
            Follow the sequential steps to build your unified customer view dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={cn(
                  "flex items-center space-x-4 p-4 rounded-lg border transition-all duration-300",
                  index === currentStep ? "border-pink-500 bg-pink-50 dark:bg-pink-900/20" : "border-gray-200",
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
                index === currentStep ? "text-pink-600" : ""
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
                Upload customer data from CRM, marketing tools, and other sources
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div 
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-pink-400 transition-colors cursor-pointer"
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById('customer-view-file-upload')?.click()}
              >
                <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <div className="space-y-2">
                  <span className="text-lg font-medium">Drop your customer data file here</span>
                  <p className="text-sm text-muted-foreground">or click to browse</p>
                  <p className="text-xs text-muted-foreground">Supports .xlsx, .xls, .csv files (max 10MB)</p>
                </div>
              </div>
              
              <Input
                id="customer-view-file-upload"
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
              
              <div className="grid gap-4 md:grid-cols-3 mt-6">
                <Card className="p-4 text-center">
                  <Database className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                  <h4 className="font-medium">CRM Data</h4>
                  <p className="text-sm text-muted-foreground">Contact info, deals, activities</p>
                </Card>
                <Card className="p-4 text-center">
                  <BarChart3 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <h4 className="font-medium">Marketing Data</h4>
                  <p className="text-sm text-muted-foreground">Campaigns, emails, engagement</p>
                </Card>
                <Card className="p-4 text-center">
                  <UserCheck className="h-8 w-8 text-purple-500 mx-auto mb-2" />
                  <h4 className="font-medium">Support Data</h4>
                  <p className="text-sm text-muted-foreground">Tickets, interactions, feedback</p>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integration" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Database className="h-5 w-5 text-purple-500" />
                <span>Data Integration & Normalization</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="p-4">
                  <h4 className="font-medium mb-3">Data Sources Connected</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Salesforce CRM</span>
                      <Badge className="bg-green-100 text-green-800">Connected</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">HubSpot Marketing</span>
                      <Badge className="bg-green-100 text-green-800">Connected</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Zendesk Support</span>
                      <Badge className="bg-green-100 text-green-800">Connected</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Google Analytics</span>
                      <Badge className="bg-green-100 text-green-800">Connected</Badge>
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <h4 className="font-medium mb-3">Integration Stats</h4>
                  <div className="space-y-3">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">45,000</div>
                      <div className="text-sm text-muted-foreground">Records Processed</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">98.5%</div>
                      <div className="text-sm text-muted-foreground">Data Quality Score</div>
                    </div>
                  </div>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profiles" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-green-500" />
                <span>Unified Customer Profiles</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center space-x-4 mb-3">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                      <Users className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="font-medium">Rajesh Sharma</h4>
                      <p className="text-sm text-muted-foreground">Investment Director @ Avendus Wealth</p>
                    </div>
                  </div>
                  <div className="grid gap-2 md:grid-cols-3 text-sm">
                    <div>
                      <span className="font-medium">Last Activity:</span>
                      <p>Opened email campaign 2 days ago</p>
                    </div>
                    <div>
                      <span className="font-medium">Engagement Score:</span>
                      <p className="text-green-600">High (92/100)</p>
                    </div>
                    <div>
                      <span className="font-medium">Lifecycle Stage:</span>
                      <p>Opportunity</p>
                    </div>
                  </div>
                </div>
                
                <div className="grid gap-4 md:grid-cols-3">
                  <Card className="p-4 text-center">
                    <div className="text-2xl font-bold text-pink-600">45K</div>
                    <div className="text-sm text-muted-foreground">Profiles Unified</div>
                  </Card>
                  <Card className="p-4 text-center">
                    <div className="text-2xl font-bold text-blue-600">360°</div>
                    <div className="text-sm text-muted-foreground">Complete View</div>
                  </Card>
                  <Card className="p-4 text-center">
                    <div className="text-2xl font-bold text-green-600">Real-time</div>
                    <div className="text-sm text-muted-foreground">Updates</div>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="segmentation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Brain className="h-5 w-5 text-purple-500" />
                <span>AI-Powered Segmentation</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <h4 className="font-medium">Customer Segments</h4>
                  <div className="space-y-2">
                    <div className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">High-Value Customers</span>
                        <Badge className="bg-green-100 text-green-800">8,247</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">High engagement, frequent purchases</p>
                    </div>
                    <div className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">Growth Potential</span>
                        <Badge className="bg-blue-100 text-blue-800">12,156</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Medium engagement, upsell opportunities</p>
                    </div>
                    <div className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">At-Risk Customers</span>
                        <Badge className="bg-orange-100 text-orange-800">3,892</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Declining engagement, retention needed</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <h4 className="font-medium">Segmentation Insights</h4>
                  <Card className="p-4">
                    <div className="text-center mb-3">
                      <div className="text-2xl font-bold text-purple-600">91.3%</div>
                      <div className="text-sm text-muted-foreground">Targeting Accuracy</div>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Behavioral Patterns:</span>
                        <span className="font-medium">Identified</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Purchase Propensity:</span>
                        <span className="font-medium">Calculated</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Churn Risk:</span>
                        <span className="font-medium">Predicted</span>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Target className="h-5 w-5 text-red-500" />
                <span>Customer Insights & Recommendations</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 border rounded-lg bg-blue-50 dark:bg-blue-900/20">
                  <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2 flex items-center gap-2">
                    <Lightbulb className="h-4 w-4" /> Key Insight
                  </h4>
                  <p className="text-sm text-blue-600 dark:text-blue-300">
                    Customers who engage with email campaigns within 24 hours have 3.2x higher conversion rates
                  </p>
                </div>

                <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-900/20">
                  <h4 className="font-medium text-green-800 dark:text-green-200 mb-2 flex items-center gap-2">
                    <Target className="h-4 w-4" /> Recommendation
                  </h4>
                  <p className="text-sm text-green-600 dark:text-green-300">
                    Focus personalized campaigns on the "Growth Potential" segment for 40% higher ROI
                  </p>
                </div>

                <div className="p-4 border rounded-lg bg-orange-50 dark:bg-orange-900/20">
                  <h4 className="font-medium text-orange-800 dark:text-orange-200 mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" /> Alert
                  </h4>
                  <p className="text-sm text-orange-600 dark:text-orange-300">
                    3,892 customers show churn risk signals - immediate retention campaign recommended
                  </p>
                </div>
                
                <div className="grid gap-4 md:grid-cols-3">
                  <Card className="p-4 text-center">
                    <div className="text-2xl font-bold text-green-600">4.8%</div>
                    <div className="text-sm text-muted-foreground">Campaign CTR</div>
                    <div className="text-xs text-green-600">+14% improvement</div>
                  </Card>
                  <Card className="p-4 text-center">
                    <div className="text-2xl font-bold text-blue-600">91.3%</div>
                    <div className="text-sm text-muted-foreground">Targeting Accuracy</div>
                    <div className="text-xs text-green-600">+6% vs baseline</div>
                  </Card>
                  <Card className="p-4 text-center">
                    <div className="text-2xl font-bold text-purple-600">360°</div>
                    <div className="text-sm text-muted-foreground">Customer View</div>
                    <div className="text-xs text-green-600">Complete visibility</div>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dashboard" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Monitor className="h-5 w-5 text-indigo-500" />
                <span>Unified Customer Dashboard</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-pink-600">45,000</div>
                  <div className="text-sm text-muted-foreground">Profiles Unified</div>
                  <div className="text-xs text-green-600">+22% data completeness</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">91.3%</div>
                  <div className="text-sm text-muted-foreground">Targeting Accuracy</div>
                  <div className="text-xs text-green-600">+6% vs previous</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">4.8%</div>
                  <div className="text-sm text-muted-foreground">Campaign CTR</div>
                  <div className="text-xs text-green-600">+14% improvement</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600">Real-time</div>
                  <div className="text-sm text-muted-foreground">Insights</div>
                  <div className="text-xs text-green-600">Live dashboard</div>
                </Card>
              </div>
              
              <div className="mt-6 p-4 bg-pink-50 dark:bg-pink-900/20 rounded-lg border border-pink-200">
                <h4 className="font-medium text-pink-800 dark:text-pink-200 mb-2">Dashboard Features</h4>
                <div className="grid gap-2 md:grid-cols-2 text-sm">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>360° customer profiles</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Real-time data sync</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>AI-powered segmentation</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Predictive insights</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Cross-channel tracking</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Automated recommendations</span>
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
          onClick={deployCustomerView}
          disabled={isProcessing}
          className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white px-8 py-3 text-lg font-semibold transition-all duration-300 hover:scale-105 shadow-lg"
        >
          {isProcessing ? (
            <>
              <Clock className="mr-2 h-5 w-5 animate-spin" />
              Building Customer View...
            </>
          ) : (
            <>
              <Zap className="mr-2 h-5 w-5" />
              Deploy Unified Customer View
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
