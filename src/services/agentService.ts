import { v4 as uuidv4 } from 'uuid';
import { GroqService, ChatMessage } from './groqService';
import { Agent, AgentTask, AgentTool, AgentMemory, AgentWorkflow } from '@/types/agent';

export class AgentService {
  private static agents: Map<string, Agent> = new Map();
  private static workflows: Map<string, AgentWorkflow> = new Map();

  // Initialize default marketing agents
  static initializeAgents(): void {
    const leadAnalystAgent = this.createAgent({
      name: 'Lead Analyst',
      role: 'Lead Intelligence Specialist',
      description: 'Analyzes customer data, scores leads, and identifies ideal customer profiles',
      capabilities: [
        'Lead scoring and qualification',
        'Customer data enrichment',
        'ICP identification',
        'Lookalike audience creation',
        'Behavioral pattern analysis'
      ],
      tools: [
        this.createLeadScoringTool(),
        this.createDataEnrichmentTool(),
        this.createICPAnalysisTool()
      ]
    });

    const contentCreatorAgent = this.createAgent({
      name: 'Content Creator',
      role: 'AI Content Generation Specialist',
      description: 'Creates personalized marketing content across multiple channels',
      capabilities: [
        'Blog post generation',
        'Social media content creation',
        'Email campaign writing',
        'Ad copy optimization',
        'Brand voice adaptation'
      ],
      tools: [
        this.createContentGenerationTool(),
        this.createBrandVoiceAnalysisTool(),
        this.createSEOOptimizationTool()
      ]
    });

    const campaignOptimizerAgent = this.createAgent({
      name: 'Campaign Optimizer',
      role: 'Budget & Performance Optimization Specialist',
      description: 'Optimizes marketing campaigns and budget allocation for maximum ROI',
      capabilities: [
        'Budget allocation optimization',
        'Campaign performance analysis',
        'A/B testing management',
        'ROI forecasting',
        'Real-time bid adjustments'
      ],
      tools: [
        this.createBudgetOptimizationTool(),
        this.createPerformanceAnalysisTool(),
        this.createROICalculatorTool()
      ]
    });

    const customerInsightsAgent = this.createAgent({
      name: 'Customer Insights',
      role: 'Customer Analytics & Segmentation Specialist',
      description: 'Analyzes customer behavior and creates actionable insights',
      capabilities: [
        'Customer segmentation',
        'Behavioral analysis',
        'Churn prediction',
        'Lifetime value calculation',
        'Journey mapping'
      ],
      tools: [
        this.createSegmentationTool(),
        this.createChurnPredictionTool(),
        this.createJourneyMappingTool()
      ]
    });

    // Register agents
    this.agents.set(leadAnalystAgent.id, leadAnalystAgent);
    this.agents.set(contentCreatorAgent.id, contentCreatorAgent);
    this.agents.set(campaignOptimizerAgent.id, campaignOptimizerAgent);
    this.agents.set(customerInsightsAgent.id, customerInsightsAgent);
  }

  // Create a new agent
  private static createAgent(config: {
    name: string;
    role: string;
    description: string;
    capabilities: string[];
    tools: AgentTool[];
  }): Agent {
    return {
      id: uuidv4(),
      name: config.name,
      role: config.role,
      description: config.description,
      capabilities: config.capabilities,
      tools: config.tools,
      memory: {
        shortTerm: {},
        longTerm: {},
        conversationHistory: []
      },
      isActive: true,
      completedTasks: []
    };
  }

  // Agent Tools
  private static createLeadScoringTool(): AgentTool {
    return {
      name: 'lead_scoring',
      description: 'Scores leads based on demographic, firmographic, and behavioral data',
      parameters: {
        customerData: 'object',
        scoringCriteria: 'object'
      },
      execute: async (params) => {
        // Simulate lead scoring algorithm
        const { customerData } = params;
        const baseScore = Math.random() * 100;
        
        // Adjust score based on data quality
        let score = baseScore;
        if (customerData.email) score += 10;
        if (customerData.company) score += 15;
        if (customerData.revenue) score += 20;
        if (customerData.industry) score += 10;
        
        return {
          score: Math.min(Math.round(score), 100),
          grade: score > 80 ? 'A' : score > 60 ? 'B' : score > 40 ? 'C' : 'D',
          reasoning: 'Score based on data completeness, company profile, and engagement indicators'
        };
      }
    };
  }

  private static createDataEnrichmentTool(): AgentTool {
    return {
      name: 'data_enrichment',
      description: 'Enriches customer data with additional company and contact information',
      parameters: {
        email: 'string',
        company: 'string'
      },
      execute: async (params) => {
        // Simulate data enrichment
        const enrichedData = {
          ...params,
          industry: 'Technology',
          companySize: '100-500 employees',
          revenue: '$10M-$50M',
          technologies: ['Salesforce', 'HubSpot', 'Google Analytics'],
          socialProfiles: {
            linkedin: `https://linkedin.com/company/${params.company?.toLowerCase().replace(/\s+/g, '-')}`,
            twitter: `@${params.company?.toLowerCase().replace(/\s+/g, '')}`
          },
          enrichmentScore: 0.85
        };
        
        return enrichedData;
      }
    };
  }

  private static createICPAnalysisTool(): AgentTool {
    return {
      name: 'icp_analysis',
      description: 'Analyzes customer data to identify Ideal Customer Profile patterns',
      parameters: {
        customerDataset: 'array'
      },
      execute: async (params) => {
        // Simulate ICP analysis
        return {
          profile: {
            industry: ['SaaS', 'Technology', 'Financial Services'],
            companySize: '50-500 employees',
            revenue: '$10M-$100M',
            geography: ['North America', 'Europe'],
            technologies: ['Salesforce', 'HubSpot', 'AWS'],
            painPoints: ['Lead generation', 'Customer retention', 'Marketing ROI']
          },
          confidence: 0.87,
          sampleSize: params.customerDataset?.length || 1000,
          keyIndicators: [
            'High email engagement rates',
            'Multiple decision makers involved',
            'Technology-forward companies',
            'Growth-stage businesses'
          ]
        };
      }
    };
  }

  private static createContentGenerationTool(): AgentTool {
    return {
      name: 'content_generation',
      description: 'Generates marketing content based on brand guidelines and target audience',
      parameters: {
        contentType: 'string',
        audience: 'object',
        brandGuidelines: 'object',
        topic: 'string'
      },
      execute: async (params) => {
        const { contentType, topic, audience } = params;
        
        // Use Groq for content generation
        const prompt = `Create ${contentType} content about "${topic}" for ${audience?.segment || 'business professionals'}. 
        Make it engaging, professional, and action-oriented. Include a clear call-to-action.`;
        
        try {
          const content = await GroqService.getChatResponse([
            { role: 'user', content: prompt }
          ]);
          
          return {
            content,
            contentType,
            topic,
            audience: audience?.segment || 'general',
            wordCount: content.split(' ').length,
            estimatedEngagement: Math.random() * 0.3 + 0.1, // 10-40%
            seoScore: Math.random() * 40 + 60 // 60-100
          };
        } catch (error) {
          throw new Error('Failed to generate content');
        }
      }
    };
  }

  private static createBrandVoiceAnalysisTool(): AgentTool {
    return {
      name: 'brand_voice_analysis',
      description: 'Analyzes existing content to understand brand voice and tone',
      parameters: {
        existingContent: 'array'
      },
      execute: async (params) => {
        return {
          tone: 'Professional & Friendly',
          style: 'Conversational',
          vocabulary: 'Business-focused with technical terms',
          sentenceLength: 'Medium (15-20 words)',
          personality: ['Innovative', 'Trustworthy', 'Results-driven'],
          confidence: 0.92
        };
      }
    };
  }

  private static createSEOOptimizationTool(): AgentTool {
    return {
      name: 'seo_optimization',
      description: 'Optimizes content for search engines and AI discoverability',
      parameters: {
        content: 'string',
        targetKeywords: 'array'
      },
      execute: async (params) => {
        const { content, targetKeywords } = params;
        
        return {
          optimizedContent: content,
          keywordDensity: targetKeywords?.reduce((acc: any, keyword: string) => {
            acc[keyword] = Math.random() * 0.03 + 0.01; // 1-4%
            return acc;
          }, {}),
          seoScore: Math.random() * 30 + 70, // 70-100
          recommendations: [
            'Add more internal links',
            'Optimize meta description',
            'Include target keywords in headings'
          ]
        };
      }
    };
  }

  private static createBudgetOptimizationTool(): AgentTool {
    return {
      name: 'budget_optimization',
      description: 'Analyzes campaign performance and recommends budget reallocation',
      parameters: {
        campaignData: 'array',
        totalBudget: 'number'
      },
      execute: async (params) => {
        const { campaignData, totalBudget } = params;
        
        return {
          recommendations: [
            {
              campaign: 'Search Ads',
              currentBudget: totalBudget * 0.4,
              recommendedBudget: totalBudget * 0.5,
              expectedROI: 3.2,
              reasoning: 'High conversion rate and low CPC'
            },
            {
              campaign: 'Social Media',
              currentBudget: totalBudget * 0.3,
              recommendedBudget: totalBudget * 0.25,
              expectedROI: 2.1,
              reasoning: 'Lower conversion but good brand awareness'
            }
          ],
          projectedImprovement: 0.18, // 18% ROI improvement
          confidence: 0.85
        };
      }
    };
  }

  private static createPerformanceAnalysisTool(): AgentTool {
    return {
      name: 'performance_analysis',
      description: 'Analyzes marketing campaign performance and identifies trends',
      parameters: {
        campaignData: 'array',
        timeframe: 'string'
      },
      execute: async (params) => {
        return {
          overallPerformance: {
            totalSpend: 125000,
            totalRevenue: 400000,
            roi: 3.2,
            conversions: 1247,
            conversionRate: 0.185
          },
          trends: [
            'Search campaigns showing 23% improvement',
            'Mobile traffic increasing by 45%',
            'Video content engagement up 67%'
          ],
          recommendations: [
            'Increase search ad budget by 25%',
            'Optimize mobile landing pages',
            'Create more video content'
          ]
        };
      }
    };
  }

  private static createROICalculatorTool(): AgentTool {
    return {
      name: 'roi_calculator',
      description: 'Calculates ROI and forecasts performance for different scenarios',
      parameters: {
        investment: 'number',
        revenue: 'number',
        timeframe: 'string'
      },
      execute: async (params) => {
        const { investment, revenue } = params;
        const roi = ((revenue - investment) / investment) * 100;
        
        return {
          roi: Math.round(roi * 100) / 100,
          paybackPeriod: Math.round((investment / (revenue / 12)) * 10) / 10, // months
          projectedAnnualReturn: revenue * 1.2, // 20% growth projection
          riskLevel: roi > 200 ? 'Low' : roi > 100 ? 'Medium' : 'High'
        };
      }
    };
  }

  private static createSegmentationTool(): AgentTool {
    return {
      name: 'customer_segmentation',
      description: 'Segments customers based on behavior, demographics, and value',
      parameters: {
        customerData: 'array',
        segmentationCriteria: 'object'
      },
      execute: async (params) => {
        return {
          segments: [
            {
              name: 'High-Value Customers',
              size: 1247,
              characteristics: ['High LTV', 'Frequent purchases', 'Low churn risk'],
              recommendedActions: ['VIP treatment', 'Upsell campaigns', 'Loyalty programs']
            },
            {
              name: 'Growth Potential',
              size: 2156,
              characteristics: ['Medium engagement', 'Growing companies', 'Tech-savvy'],
              recommendedActions: ['Educational content', 'Product demos', 'Feature highlights']
            },
            {
              name: 'At-Risk Customers',
              size: 892,
              characteristics: ['Declining engagement', 'Support tickets', 'Usage drop'],
              recommendedActions: ['Retention campaigns', 'Personal outreach', 'Success programs']
            }
          ],
          confidence: 0.89,
          totalCustomers: 4295
        };
      }
    };
  }

  private static createChurnPredictionTool(): AgentTool {
    return {
      name: 'churn_prediction',
      description: 'Predicts customer churn risk and recommends retention strategies',
      parameters: {
        customerData: 'object',
        behavioralData: 'object'
      },
      execute: async (params) => {
        const churnRisk = Math.random();
        
        return {
          churnProbability: Math.round(churnRisk * 100),
          riskLevel: churnRisk > 0.7 ? 'High' : churnRisk > 0.4 ? 'Medium' : 'Low',
          keyFactors: [
            'Decreased login frequency',
            'Reduced feature usage',
            'Support ticket volume'
          ],
          recommendedActions: [
            'Send personalized retention email',
            'Offer product training session',
            'Provide special discount or upgrade'
          ],
          confidence: 0.82
        };
      }
    };
  }

  private static createJourneyMappingTool(): AgentTool {
    return {
      name: 'journey_mapping',
      description: 'Maps customer journeys and identifies optimization opportunities',
      parameters: {
        customerData: 'object',
        touchpoints: 'array'
      },
      execute: async (params) => {
        return {
          journeyStages: [
            {
              stage: 'Awareness',
              touchpoints: ['Blog', 'Social Media', 'Search Ads'],
              conversionRate: 0.12,
              optimizationOpportunities: ['Improve ad targeting', 'Create more educational content']
            },
            {
              stage: 'Consideration',
              touchpoints: ['Website', 'Demo', 'Sales Calls'],
              conversionRate: 0.35,
              optimizationOpportunities: ['Streamline demo process', 'Add social proof']
            },
            {
              stage: 'Decision',
              touchpoints: ['Proposal', 'Trial', 'Negotiation'],
              conversionRate: 0.68,
              optimizationOpportunities: ['Simplify pricing', 'Add urgency elements']
            }
          ],
          overallConversionRate: 0.185,
          averageJourneyLength: '45 days',
          dropoffPoints: ['Demo scheduling', 'Pricing page', 'Trial signup']
        };
      }
    };
  }

  // Execute agent task
  static async executeTask(agentId: string, task: Omit<AgentTask, 'id' | 'status' | 'createdAt'>): Promise<AgentTask> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const fullTask: AgentTask = {
      ...task,
      id: uuidv4(),
      status: 'processing',
      createdAt: new Date()
    };

    try {
      // Update agent status
      agent.currentTask = fullTask;
      agent.isActive = true;

      // Execute task based on type
      let result;
      switch (task.type) {
        case 'lead_analysis':
          result = await this.executeLeadAnalysis(agent, task.input);
          break;
        case 'content_generation':
          result = await this.executeContentGeneration(agent, task.input);
          break;
        case 'campaign_optimization':
          result = await this.executeCampaignOptimization(agent, task.input);
          break;
        case 'customer_segmentation':
          result = await this.executeCustomerSegmentation(agent, task.input);
          break;
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }

      // Update task with result
      fullTask.status = 'completed';
      fullTask.result = result;
      fullTask.completedAt = new Date();

      // Update agent
      agent.currentTask = undefined;
      agent.completedTasks.push(fullTask);
      
      // Store in memory
      agent.memory.shortTerm[`task_${fullTask.id}`] = result;

      return fullTask;
    } catch (error) {
      fullTask.status = 'failed';
      fullTask.error = error instanceof Error ? error.message : 'Unknown error';
      fullTask.completedAt = new Date();

      agent.currentTask = undefined;
      agent.completedTasks.push(fullTask);

      throw error;
    }
  }

  // Task execution methods
  private static async executeLeadAnalysis(agent: Agent, input: any): Promise<any> {
    const leadScoringTool = agent.tools.find(t => t.name === 'lead_scoring');
    const enrichmentTool = agent.tools.find(t => t.name === 'data_enrichment');
    const icpTool = agent.tools.find(t => t.name === 'icp_analysis');

    if (!leadScoringTool || !enrichmentTool || !icpTool) {
      throw new Error('Required tools not available for lead analysis');
    }

    // Step 1: Enrich data
    const enrichedData = await enrichmentTool.execute({
      email: input.email,
      company: input.company
    });

    // Step 2: Score lead
    const scoringResult = await leadScoringTool.execute({
      customerData: enrichedData,
      scoringCriteria: input.scoringCriteria || {}
    });

    // Step 3: ICP analysis (if dataset provided)
    let icpResult = null;
    if (input.customerDataset) {
      icpResult = await icpTool.execute({
        customerDataset: input.customerDataset
      });
    }

    // Use AI to generate insights
    const aiInsights = await this.generateAIInsights(agent, {
      enrichedData,
      scoringResult,
      icpResult
    });

    return {
      enrichedData,
      leadScore: scoringResult,
      icpAnalysis: icpResult,
      aiInsights,
      recommendations: this.generateLeadRecommendations(scoringResult, enrichedData)
    };
  }

  private static async executeContentGeneration(agent: Agent, input: any): Promise<any> {
    const contentTool = agent.tools.find(t => t.name === 'content_generation');
    const brandTool = agent.tools.find(t => t.name === 'brand_voice_analysis');
    const seoTool = agent.tools.find(t => t.name === 'seo_optimization');

    if (!contentTool) {
      throw new Error('Content generation tool not available');
    }

    // Step 1: Analyze brand voice (if existing content provided)
    let brandAnalysis = null;
    if (brandTool && input.existingContent) {
      brandAnalysis = await brandTool.execute({
        existingContent: input.existingContent
      });
    }

    // Step 2: Generate content
    const contentResult = await contentTool.execute({
      contentType: input.contentType,
      topic: input.topic,
      audience: input.audience,
      brandGuidelines: brandAnalysis
    });

    // Step 3: SEO optimization (if requested)
    let seoResult = null;
    if (seoTool && input.optimizeForSEO) {
      seoResult = await seoTool.execute({
        content: contentResult.content,
        targetKeywords: input.targetKeywords || []
      });
    }

    return {
      content: contentResult,
      brandAnalysis,
      seoOptimization: seoResult,
      metadata: {
        generatedAt: new Date(),
        agentId: agent.id,
        version: '1.0'
      }
    };
  }

  private static async executeCampaignOptimization(agent: Agent, input: any): Promise<any> {
    const budgetTool = agent.tools.find(t => t.name === 'budget_optimization');
    const performanceTool = agent.tools.find(t => t.name === 'performance_analysis');
    const roiTool = agent.tools.find(t => t.name === 'roi_calculator');

    if (!budgetTool || !performanceTool || !roiTool) {
      throw new Error('Required tools not available for campaign optimization');
    }

    // Step 1: Analyze current performance
    const performanceResult = await performanceTool.execute({
      campaignData: input.campaignData,
      timeframe: input.timeframe || '30d'
    });

    // Step 2: Calculate ROI for different scenarios
    const roiResult = await roiTool.execute({
      investment: input.totalBudget,
      revenue: performanceResult.overallPerformance.totalRevenue,
      timeframe: input.timeframe || '30d'
    });

    // Step 3: Generate budget optimization recommendations
    const budgetResult = await budgetTool.execute({
      campaignData: input.campaignData,
      totalBudget: input.totalBudget
    });

    return {
      currentPerformance: performanceResult,
      roiAnalysis: roiResult,
      budgetOptimization: budgetResult,
      actionPlan: this.generateOptimizationActionPlan(budgetResult, performanceResult)
    };
  }

  private static async executeCustomerSegmentation(agent: Agent, input: any): Promise<any> {
    const segmentationTool = agent.tools.find(t => t.name === 'customer_segmentation');
    const churnTool = agent.tools.find(t => t.name === 'churn_prediction');
    const journeyTool = agent.tools.find(t => t.name === 'journey_mapping');

    if (!segmentationTool) {
      throw new Error('Segmentation tool not available');
    }

    // Step 1: Segment customers
    const segmentationResult = await segmentationTool.execute({
      customerData: input.customerData,
      segmentationCriteria: input.criteria || {}
    });

    // Step 2: Predict churn for high-value segments
    let churnAnalysis = null;
    if (churnTool) {
      churnAnalysis = await churnTool.execute({
        customerData: input.customerData,
        behavioralData: input.behavioralData || {}
      });
    }

    // Step 3: Map customer journeys
    let journeyAnalysis = null;
    if (journeyTool) {
      journeyAnalysis = await journeyTool.execute({
        customerData: input.customerData,
        touchpoints: input.touchpoints || []
      });
    }

    return {
      segmentation: segmentationResult,
      churnAnalysis,
      journeyMapping: journeyAnalysis,
      actionableInsights: this.generateSegmentationInsights(segmentationResult, churnAnalysis)
    };
  }

  // AI-powered insights generation
  private static async generateAIInsights(agent: Agent, data: any): Promise<string> {
    const prompt = `As a ${agent.role}, analyze the following data and provide actionable marketing insights:

Data: ${JSON.stringify(data, null, 2)}

Provide specific, actionable recommendations for improving marketing performance. Focus on:
1. Key opportunities identified
2. Specific actions to take
3. Expected impact and timeline
4. Risk factors to consider

Keep the response concise and business-focused.`;

    try {
      const insights = await GroqService.getChatResponse([
        { role: 'user', content: prompt }
      ]);
      
      return insights;
    } catch (error) {
      return 'Unable to generate AI insights at this time. Please try again later.';
    }
  }

  // Helper methods for generating recommendations
  private static generateLeadRecommendations(scoringResult: any, enrichedData: any): string[] {
    const recommendations = [];
    
    if (scoringResult.score > 80) {
      recommendations.push('High-priority lead: Schedule immediate sales call');
      recommendations.push('Add to VIP nurture sequence');
    } else if (scoringResult.score > 60) {
      recommendations.push('Medium-priority lead: Add to email nurture campaign');
      recommendations.push('Send relevant case studies and whitepapers');
    } else {
      recommendations.push('Low-priority lead: Add to general newsletter');
      recommendations.push('Monitor for engagement improvements');
    }

    if (enrichedData.technologies?.includes('Salesforce')) {
      recommendations.push('Highlight Salesforce integration capabilities');
    }

    return recommendations;
  }

  private static generateOptimizationActionPlan(budgetResult: any, performanceResult: any): string[] {
    return [
      'Implement recommended budget reallocation within 48 hours',
      'Monitor performance metrics daily for first week',
      'Adjust targeting parameters based on performance data',
      'Schedule weekly optimization reviews',
      'Set up automated alerts for significant performance changes'
    ];
  }

  private static generateSegmentationInsights(segmentationResult: any, churnAnalysis: any): string[] {
    const insights = [
      `Identified ${segmentationResult.segments.length} distinct customer segments`,
      'High-value customers show strong engagement patterns',
      'Growth potential segment represents largest opportunity'
    ];

    if (churnAnalysis && churnAnalysis.riskLevel === 'High') {
      insights.push('Immediate retention campaign needed for at-risk customers');
    }

    return insights;
  }

  // Workflow management
  static createWorkflow(name: string, description: string, agentIds: string[]): AgentWorkflow {
    const workflow: AgentWorkflow = {
      id: uuidv4(),
      name,
      description,
      agents: agentIds.map(id => this.agents.get(id)!).filter(Boolean),
      tasks: [],
      status: 'idle',
      createdAt: new Date()
    };

    this.workflows.set(workflow.id, workflow);
    return workflow;
  }

  static async executeWorkflow(workflowId: string, input: any): Promise<AgentWorkflow> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    workflow.status = 'running';

    try {
      // Execute tasks across agents in the workflow
      for (const agent of workflow.agents) {
        const task = await this.executeTask(agent.id, {
          type: this.getTaskTypeForAgent(agent),
          description: `Workflow task for ${workflow.name}`,
          input
        });
        
        workflow.tasks.push(task);
      }

      workflow.status = 'completed';
      workflow.completedAt = new Date();
    } catch (error) {
      workflow.status = 'failed';
      workflow.completedAt = new Date();
      throw error;
    }

    return workflow;
  }

  private static getTaskTypeForAgent(agent: Agent): AgentTask['type'] {
    if (agent.role.includes('Lead')) return 'lead_analysis';
    if (agent.role.includes('Content')) return 'content_generation';
    if (agent.role.includes('Optimization')) return 'campaign_optimization';
    if (agent.role.includes('Customer')) return 'customer_segmentation';
    return 'lead_analysis'; // default
  }

  // Public API methods
  static getAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  static getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  static getWorkflows(): AgentWorkflow[] {
    return Array.from(this.workflows.values());
  }

  static getWorkflow(workflowId: string): AgentWorkflow | undefined {
    return this.workflows.get(workflowId);
  }

  // Agent communication
  static async agentChat(agentId: string, message: string, context?: any): Promise<string> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Add to conversation history
    agent.memory.conversationHistory.push({
      role: 'user',
      content: message,
      timestamp: new Date()
    });

    // Create context-aware prompt
    const systemPrompt = `You are ${agent.name}, a ${agent.role}. 
    
Your capabilities include: ${agent.capabilities.join(', ')}.
Your available tools: ${agent.tools.map(t => t.name).join(', ')}.

Context: ${context ? JSON.stringify(context) : 'No additional context provided'}

Respond as this agent would, providing specific, actionable marketing advice based on your role and expertise.`;

    try {
      const response = await GroqService.getChatResponse([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ]);

      // Add response to conversation history
      agent.memory.conversationHistory.push({
        role: 'assistant',
        content: response,
        timestamp: new Date()
      });

      return response;
    } catch (error) {
      throw new Error('Failed to get agent response');
    }
  }
}

// Initialize agents when service is imported
AgentService.initializeAgents();