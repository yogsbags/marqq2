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
  Users, 
  Target, 
  UserPlus, 
  Send, 
  BarChart3, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  FileSpreadsheet,
  Brain,
  Zap,
  TrendingUp,
  Mail,
  Phone,
  MessageSquare
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { AgentService } from '@/services/agentService';

interface LeadIntelligenceFlowProps {
  autoStart?: boolean;
}

interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress?: number;
}

export function LeadIntelligenceFlow({ autoStart = false }: LeadIntelligenceFlowProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');
  
  const [steps, setSteps] = useState<WorkflowStep[]>([
    {
      id: 'upload',
      title: 'Upload Customer Data',
      description: 'Upload your existing customer Excel file for analysis',
      icon: Upload,
      status: 'pending'
    },
    {
      id: 'enrich',
      title: 'Enrich Leads',
      description: 'AI enriches customer data with additional insights',
      icon: Brain,
      status: 'pending'
    },
    {
      id: 'icp',
      title: 'Find ICP',
      description: 'Identify your Ideal Customer Profile patterns',
      icon: Target,
      status: 'pending'
    },
    {
      id: 'lookalike',
      title: 'Build Lookalike Audience',
      description: 'Create similar audience based on your best customers',
      icon: UserPlus,
      status: 'pending'
    },
    {
      id: 'outreach',
      title: 'AI Outreach',
      description: 'Deploy AI agents for personalized outreach campaigns',
      icon: Send,
      status: 'pending'
    },
    {
      id: 'results',
      title: 'View Results',
      description: 'Monitor campaign performance and engagement metrics',
      icon: BarChart3,
      status: 'pending'
    }
  ]);

  // Auto-start deployment when triggered via slash command
  useEffect(() => {
    if (autoStart && !isProcessing && currentStep === 0) {
      // Simulate file upload completion
      setUploadedFile(new File(['sample'], 'customer-data.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      updateStepStatus(0, 'completed');
      setCurrentStep(1);
      
      // Start deployment after a short delay
      setTimeout(() => {
        deployAIAgent();
      }, 2000);
    }
  }, [autoStart]);

  const updateStepStatus = (stepIndex: number, status: WorkflowStep['status'], progress?: number) => {
    setSteps(prev => prev.map((step, index) => 
      index === stepIndex ? { ...step, status, progress } : step
    ));
  };

  const deployAIAgent = async () => {
    setIsProcessing(true);
    
    try {
      // Execute actual AI agent tasks
      const leadAgent = AgentService.getAgents().find(agent => agent.role.includes('Lead'));
      if (leadAgent) {
        // Execute lead analysis task
        await AgentService.executeTask(leadAgent.id, {
          type: 'lead_analysis',
          description: 'Analyze uploaded customer data and generate lead intelligence',
          input: {
            email: 'prospect@company.com',
            company: 'Target Company',
            customerDataset: Array(1000).fill({}).map(() => ({
              email: 'customer@example.com',
              company: 'Example Inc',
              revenue: Math.random() * 1000000,
              industry: 'Technology'
            }))
          }
        });
      }

      // Simulate AI agent deployment process
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
      
      toast.success('AI Agent deployment completed successfully! 🎉');
      
      // Auto-switch to the last tab (results) after completion
      setActiveTab('results');
    } catch (error) {
      toast.error('AI Agent deployment failed. Please try again.');
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
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          Lead Intelligence & AI Agents
        </h1>
        <p className="text-muted-foreground">
          Transform your customer data into high-converting leads using AI-powered workflows
        </p>
      </div>

      {/* Workflow Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Zap className="h-5 w-5 text-orange-500" />
            <span>AI Agent Workflow Progress</span>
          </CardTitle>
          <CardDescription>
            Follow the sequential steps to deploy AI agents for lead generation
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
              disabled={false}
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

        {/* Upload Tab */}
        <TabsContent value="upload" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileSpreadsheet className="h-5 w-5 text-blue-500" />
                <span>Upload Customer Data</span>
              </CardTitle>
              <CardDescription>
                Upload your existing customer Excel file to begin the AI analysis
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div 
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-orange-400 transition-colors cursor-pointer"
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById('file-upload')?.click()}
              >
                <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <div className="space-y-2">
                  <span className="text-lg font-medium">Drop your Excel or CSV file here</span>
                  <p className="text-sm text-muted-foreground">or click to browse</p>
                  <p className="text-xs text-muted-foreground">Supports .xlsx, .xls, .csv files (max 10MB)</p>
                </div>
              </div>
              
              <Input
                id="file-upload"
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
                  <p className="text-sm text-muted-foreground">Names, emails, companies</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <TrendingUp className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <h4 className="font-medium">Purchase History</h4>
                  <p className="text-sm text-muted-foreground">Revenue, frequency, dates</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <Target className="h-8 w-8 text-purple-500 mx-auto mb-2" />
                  <h4 className="font-medium">Demographics</h4>
                  <p className="text-sm text-muted-foreground">Industry, size, location</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Enrich Tab */}
        <TabsContent value="enrich" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Brain className="h-5 w-5 text-purple-500" />
                <span>AI Data Enrichment</span>
              </CardTitle>
              <CardDescription>
                AI agents enrich your customer data with additional insights
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <h4 className="font-medium">Enrichment Sources</h4>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm">LinkedIn Company Data</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm">Industry Classifications</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm">Technographic Data</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm">Financial Information</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <h4 className="font-medium">AI Insights</h4>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Brain className="h-4 w-4 text-purple-500" />
                      <span className="text-sm">Buying Intent Signals</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Brain className="h-4 w-4 text-purple-500" />
                      <span className="text-sm">Propensity Scoring</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Brain className="h-4 w-4 text-purple-500" />
                      <span className="text-sm">Behavioral Patterns</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Brain className="h-4 w-4 text-purple-500" />
                      <span className="text-sm">Engagement Preferences</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Enriched Data Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Enriched Customer Data</h4>
                  <Badge className="bg-green-100 text-green-800">1,247 records enriched</Badge>
                </div>
                
                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-3 font-medium">Original Data</th>
                          <th className="text-left p-3 font-medium">Company Size</th>
                          <th className="text-left p-3 font-medium">Industry</th>
                          <th className="text-left p-3 font-medium">Revenue</th>
                          <th className="text-left p-3 font-medium">Technology Stack</th>
                          <th className="text-left p-3 font-medium">Intent Score</th>
                          <th className="text-left p-3 font-medium">Location</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        <tr className="hover:bg-muted/30">
                          <td className="p-3">
                            <div>
                              <div className="font-medium">Avendus Wealth Management</div>
                              <div className="text-xs text-muted-foreground">rajesh.sharma@avendus.com</div>
                            </div>
                          </td>
                          <td className="p-3">
                            <Badge variant="outline">100-250 employees</Badge>
                          </td>
                          <td className="p-3">HNI Wealth Management</td>
                          <td className="p-3">₹500Cr - ₹1,200Cr</td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              <Badge className="text-xs bg-blue-100 text-blue-800">Salesforce</Badge>
                              <Badge className="text-xs bg-green-100 text-green-800">Temenos</Badge>
                              <Badge className="text-xs bg-purple-100 text-purple-800">FactSet</Badge>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center space-x-2">
                              <div className="w-12 bg-gray-200 rounded-full h-2">
                                <div className="bg-green-500 h-2 rounded-full" style={{width: '92%'}}></div>
                              </div>
                              <span className="text-xs font-medium text-green-600">92%</span>
                            </div>
                          </td>
                          <td className="p-3">Mumbai, Maharashtra</td>
                        </tr>
                        <tr className="hover:bg-muted/30">
                          <td className="p-3">
                            <div>
                              <div className="font-medium">IIFL Wealth Management</div>
                              <div className="text-xs text-muted-foreground">priya.patel@iiflwealth.com</div>
                            </div>
                          </td>
                          <td className="p-3">
                            <Badge variant="outline">250-500 employees</Badge>
                          </td>
                          <td className="p-3">Private Wealth & Family Office</td>
                          <td className="p-3">₹800Cr - ₹1,800Cr</td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              <Badge className="text-xs bg-orange-100 text-orange-800">Murex</Badge>
                              <Badge className="text-xs bg-red-100 text-red-800">Refinitiv</Badge>
                              <Badge className="text-xs bg-blue-100 text-blue-800">Tableau</Badge>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center space-x-2">
                              <div className="w-12 bg-gray-200 rounded-full h-2">
                                <div className="bg-green-500 h-2 rounded-full" style={{width: '88%'}}></div>
                              </div>
                              <span className="text-xs font-medium text-green-600">88%</span>
                            </div>
                          </td>
                          <td className="p-3">Bangalore, Karnataka</td>
                        </tr>
                        <tr className="hover:bg-muted/30">
                          <td className="p-3">
                            <div>
                              <div className="font-medium">360 ONE Wealth Management</div>
                              <div className="text-xs text-muted-foreground">amit.gupta@360one.co.in</div>
                            </div>
                          </td>
                          <td className="p-3">
                            <Badge variant="outline">500-1000 employees</Badge>
                          </td>
                          <td className="p-3">Ultra HNI Wealth Advisory</td>
                          <td className="p-3">₹1,200Cr - ₹2,500Cr</td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              <Badge className="text-xs bg-purple-100 text-purple-800">SimCorp</Badge>
                              <Badge className="text-xs bg-green-100 text-green-800">Charles River</Badge>
                              <Badge className="text-xs bg-blue-100 text-blue-800">Aladdin</Badge>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center space-x-2">
                              <div className="w-12 bg-gray-200 rounded-full h-2">
                                <div className="bg-green-500 h-2 rounded-full" style={{width: '95%'}}></div>
                              </div>
                              <span className="text-xs font-medium text-green-600">95%</span>
                            </div>
                          </td>
                          <td className="p-3">Mumbai, Maharashtra</td>
                        </tr>
                        <tr className="hover:bg-muted/30">
                          <td className="p-3">
                            <div>
                              <div className="font-medium">Waterfield Advisors</div>
                              <div className="text-xs text-muted-foreground">neha.singh@waterfieldadvisors.com</div>
                            </div>
                          </td>
                          <td className="p-3">
                            <Badge variant="outline">50-100 employees</Badge>
                          </td>
                          <td className="p-3">Multi-Family Office Services</td>
                          <td className="p-3">₹300Cr - ₹800Cr</td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              <Badge className="text-xs bg-blue-100 text-blue-800">Advent Geneva</Badge>
                              <Badge className="text-xs bg-orange-100 text-orange-800">Dynamo</Badge>
                              <Badge className="text-xs bg-green-100 text-green-800">Yodlee</Badge>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center space-x-2">
                              <div className="w-12 bg-gray-200 rounded-full h-2">
                                <div className="bg-orange-500 h-2 rounded-full" style={{width: '78%'}}></div>
                              </div>
                              <span className="text-xs font-medium text-orange-600">78%</span>
                            </div>
                          </td>
                          <td className="p-3">Bangalore, Karnataka</td>
                        </tr>
                        <tr className="hover:bg-muted/30">
                          <td className="p-3">
                            <div>
                              <div className="font-medium">ASK Investment Managers</div>
                              <div className="text-xs text-muted-foreground">vikram.agarwal@askgroup.in</div>
                            </div>
                          </td>
                          <td className="p-3">
                            <Badge variant="outline">100-250 employees</Badge>
                          </td>
                          <td className="p-3">Alternative Investment & PMS</td>
                          <td className="p-3">₹600Cr - ₹1,500Cr</td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              <Badge className="text-xs bg-red-100 text-red-800">Eze Castle</Badge>
                              <Badge className="text-xs bg-purple-100 text-purple-800">SS&C</Badge>
                              <Badge className="text-xs bg-blue-100 text-blue-800">Palantir</Badge>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center space-x-2">
                              <div className="w-12 bg-gray-200 rounded-full h-2">
                                <div className="bg-green-500 h-2 rounded-full" style={{width: '85%'}}></div>
                              </div>
                              <span className="text-xs font-medium text-green-600">85%</span>
                            </div>
                          </td>
                          <td className="p-3">Mumbai, Maharashtra</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Showing 5 of 2,847 enriched records</span>
                  <Button variant="outline" size="sm">View All Records</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ICP Tab */}
        <TabsContent value="icp" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Target className="h-5 w-5 text-red-500" />
                <span>Ideal Customer Profile</span>
              </CardTitle>
              <CardDescription>
                AI identifies patterns in your best customers to create your ICP
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="p-4">
                  <h4 className="font-medium mb-3">Company Characteristics</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Industry:</span>
                      <span className="font-medium">SaaS, Technology</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Company Size:</span>
                      <span className="font-medium">50-500 employees</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Revenue:</span>
                      <span className="font-medium">$10M - $100M</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Location:</span>
                      <span className="font-medium">North America, Europe</span>
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <h4 className="font-medium mb-3">Behavioral Patterns</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Purchase Cycle:</span>
                      <span className="font-medium">3-6 months</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Decision Makers:</span>
                      <span className="font-medium">CTO, VP Engineering</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pain Points:</span>
                      <span className="font-medium">Scalability, Security</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Budget Range:</span>
                      <span className="font-medium">$50K - $500K</span>
                    </div>
                  </div>
                </Card>
              </div>
              
              <div className="p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium mb-2 flex items-center">
                  <Brain className="h-4 w-4 mr-2 text-blue-500" />
                  AI Confidence Score
                </h4>
                <div className="flex items-center space-x-3">
                  <Progress value={87} className="flex-1" />
                  <span className="font-bold text-blue-600">87%</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  High confidence based on 1,247 customer data points analyzed
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Lookalike Tab */}
        <TabsContent value="lookalike" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <UserPlus className="h-5 w-5 text-green-500" />
                <span>Lookalike Audience</span>
              </CardTitle>
              <CardDescription>
                AI builds a lookalike audience based on your ICP patterns
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">12,847</div>
                  <div className="text-sm text-muted-foreground">Total Prospects</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">89%</div>
                  <div className="text-sm text-muted-foreground">Match Score</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600">2,156</div>
                  <div className="text-sm text-muted-foreground">High-Intent Leads</div>
                </Card>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Audience Segments</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <span className="font-medium">Enterprise SaaS Companies</span>
                      <p className="text-sm text-muted-foreground">High-growth tech companies</p>
                    </div>
                    <Badge className="bg-green-100 text-green-800">3,421 leads</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <span className="font-medium">Mid-Market Technology</span>
                      <p className="text-sm text-muted-foreground">Scaling technology companies</p>
                    </div>
                    <Badge className="bg-blue-100 text-blue-800">5,892 leads</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <span className="font-medium">Emerging Startups</span>
                      <p className="text-sm text-muted-foreground">Fast-growing startups</p>
                    </div>
                    <Badge className="bg-purple-100 text-purple-800">3,534 leads</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Outreach Tab */}
        <TabsContent value="outreach" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Send className="h-5 w-5 text-orange-500" />
                <span>AI Outreach Campaign</span>
              </CardTitle>
              <CardDescription>
                Deploy AI agents for personalized outreach across multiple channels
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Card className="p-4 text-center">
                  <Mail className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                  <h4 className="font-medium">Email Campaigns</h4>
                  <p className="text-sm text-muted-foreground">Personalized email sequences</p>
                </Card>
                <Card className="p-4 text-center">
                  <MessageSquare className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <h4 className="font-medium">LinkedIn Outreach</h4>
                  <p className="text-sm text-muted-foreground">Social selling automation</p>
                </Card>
                <Card className="p-4 text-center">
                  <Phone className="h-8 w-8 text-purple-500 mx-auto mb-2" />
                  <h4 className="font-medium">Cold Calling</h4>
                  <p className="text-sm text-muted-foreground">AI-powered phone outreach</p>
                </Card>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="campaign-name">Campaign Name</Label>
                  <Input id="campaign-name" placeholder="Q1 2024 Lead Generation Campaign" />
                </div>
                <div>
                  <Label htmlFor="message-template">AI Message Template</Label>
                  <Textarea 
                    id="message-template" 
                    placeholder="Hi {firstName}, I noticed {company} is growing rapidly in the {industry} space. Our platform has helped similar companies like {similarCompany} achieve {benefit}..."
                    rows={4}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="send-rate">Send Rate (per day)</Label>
                    <Input id="send-rate" type="number" placeholder="50" />
                  </div>
                  <div>
                    <Label htmlFor="follow-up">Follow-up Sequence</Label>
                    <select className="w-full p-2 border rounded-md">
                      <option>3-touch sequence</option>
                      <option>5-touch sequence</option>
                      <option>7-touch sequence</option>
                    </select>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Results Tab */}
        <TabsContent value="results" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <BarChart3 className="h-5 w-5 text-indigo-500" />
                <span>Campaign Results</span>
              </CardTitle>
              <CardDescription>
                Real-time performance metrics and AI insights
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">2,847</div>
                  <div className="text-sm text-muted-foreground">Emails Sent</div>
                  <div className="text-xs text-green-600">+12% vs last week</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">24.3%</div>
                  <div className="text-sm text-muted-foreground">Open Rate</div>
                  <div className="text-xs text-green-600">+5.2% vs industry</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-orange-600">8.7%</div>
                  <div className="text-sm text-muted-foreground">Response Rate</div>
                  <div className="text-xs text-green-600">+3.1% vs last month</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600">156</div>
                  <div className="text-sm text-muted-foreground">Qualified Leads</div>
                  <div className="text-xs text-green-600">+28% conversion</div>
                </Card>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Recent Responses</h4>
                <div className="space-y-2">
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">TechCorp Solutions</span>
                      <Badge className="bg-green-100 text-green-800">Interested</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      "This looks interesting. Can we schedule a demo next week?"
                    </p>
                  </div>
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">InnovateLabs Inc</span>
                      <Badge className="bg-blue-100 text-blue-800">Meeting Scheduled</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      "Perfect timing! We're evaluating solutions. Let's talk Thursday."
                    </p>
                  </div>
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">DataDriven Systems</span>
                      <Badge className="bg-orange-100 text-orange-800">Follow-up Needed</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      "Not right now, but check back in Q2."
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Deploy AI Agent Button */}
      <div className="flex justify-center">
        <Button
          onClick={deployAIAgent}
          disabled={isProcessing || currentStep >= steps.length - 1}
          className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white px-8 py-3 text-lg font-semibold transition-all duration-300 hover:scale-105 shadow-lg"
        >
          {isProcessing ? (
            <>
              <Clock className="mr-2 h-5 w-5 animate-spin" />
              Deploying AI Agent...
            </>
          ) : (
            <>
              <Zap className="mr-2 h-5 w-5" />
              Deploy AI Agent
            </>
          )}
        </Button>
      </div>
    </div>
  );
}