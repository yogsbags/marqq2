import { useState, useRef, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import {
  HiX as X,
  HiPaperAirplane as Send,
  HiChat as Bot,
  HiUser as User,
  HiTrash as Trash2,
  HiPaperClip as Paperclip,
  HiDocumentText as FileText,
  HiPhotograph as Image,
  HiTable as FileSpreadsheet
} from 'react-icons/hi';
import { cn } from '@/lib/utils';
import { GroqService, ChatMessage } from '@/services/groqService';
import { executeGuidedWorkflow, type GuidedGoal, type GuidedWorkflowResponse } from '@/services/guidedWorkflowService';
import { toast } from 'sonner';
import { CSVAnalysisPanel } from '@/components/ui/csv-analysis-panel';

// Slash command definitions
const SLASH_COMMANDS = [
  {
    command: '/agents',
    description: 'Open AI Agents Dashboard',
    action: 'agents'
  },
  {
    command: '/workflows',
    description: 'Open Workflow Builder',
    action: 'workflows'
  },
  {
    command: '/lead-intelligence',
    description: 'Deploy Lead Intelligence & AI Agents workflow',
    action: 'lead-intelligence'
  },
  {
    command: '/voice-bot',
    description: 'Deploy AI Voice Bot automation workflow',
    action: 'voice-bot'
  },
  {
    command: '/video-bot',
    description: 'Deploy AI Video Bot & Digital Avatar workflow',
    action: 'video-bot'
  },
  {
    command: '/user-engagement',
    description: 'Deploy User Engagement & Lifecycle workflow',
    action: 'user-engagement'
  },
  {
    command: '/budget-optimization',
    description: 'Deploy Campaign Budget Optimization workflow',
    action: 'budget-optimization'
  },
  {
    command: '/performance-scorecard',
    description: 'Deploy Performance Scorecard workflow',
    action: 'performance-scorecard'
  },
  {
    command: '/ai-content',
    description: 'Deploy AI Content Generation workflow',
    action: 'ai-content'
  },
  {
    command: '/customer-view',
    description: 'Deploy Unified Customer View workflow',
    action: 'customer-view'
  },
  {
    command: '/seo-llmo',
    description: 'Deploy SEO/LLMO Optimization workflow',
    action: 'seo-llmo'
  },
  {
    command: '/company-intel',
    description: 'Open Company Intelligence (strategy, calendar, ICPs, competitors)',
    action: 'company-intel'
  },
  {
    command: '/help',
    description: 'Show available slash commands',
    action: 'help'
  }
];

function detectGuidedGoal(input: string): GuidedGoal | null {
  const text = input.toLowerCase();

  const roiSignals = ['roi', 'roas', 'budget', 'reduce cpa', 'improve cpa', 'campaign efficiency'];
  if (roiSignals.some((signal) => text.includes(signal))) {
    return 'roi';
  }

  const contentSignals = ['content plan', 'content strategy', 'content calendar', 'social calendar', 'monthly content'];
  if (contentSignals.some((signal) => text.includes(signal))) {
    return 'content';
  }

  const leadsSignals = ['more leads', 'lead generation', 'qualified leads', 'pipeline growth', 'lead flow'];
  if (leadsSignals.some((signal) => text.includes(signal))) {
    return 'leads';
  }

  return null;
}

function toActionPlanMessage(response: GuidedWorkflowResponse): string {
  const lines = response.actionPlan.what_to_do_this_week.map((item) => `- ${item}`).join('\n');
  return [
    `## Guided Workflow Ready`,
    response.assistantMessage,
    ``,
    `## This Week Action Plan`,
    lines,
    ``,
    `**Owner:** ${response.actionPlan.owner}`,
    `**Expected Impact:** ${response.actionPlan.expected_impact}`,
    ``,
    `I am opening the recommended workflow now.`,
  ].join('\n');
}

// Convert markdown to rich text HTML
function markdownToRichText(markdown: string): string {
  let html = markdown;

  // Escape HTML to prevent XSS
  const escapeHtml = (text: string) => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // Code blocks (```code```)
  html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
    return `<pre class="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg overflow-x-auto my-2"><code class="text-xs font-mono">${escapeHtml(code.trim())}</code></pre>`;
  });

  // Inline code (`code`)
  html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>');

  // Headings (## Heading)
  html = html.replace(/^### (.*$)/gm, '<h3 class="text-base font-semibold mt-4 mb-2 text-gray-900 dark:text-gray-100">$1</h3>');
  html = html.replace(/^## (.*$)/gm, '<h2 class="text-lg font-semibold mt-4 mb-2 text-gray-900 dark:text-gray-100">$1</h2>');
  html = html.replace(/^# (.*$)/gm, '<h1 class="text-xl font-bold mt-4 mb-2 text-gray-900 dark:text-gray-100">$1</h1>');

  // Bold (**text** or __text__)
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong class="font-semibold">$1</strong>');

  // Italic (*text* or _text_)
  html = html.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');
  html = html.replace(/_(.*?)_/g, '<em class="italic">$1</em>');

  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-orange-600 dark:text-orange-400 hover:underline">$1</a>');

  // Unordered lists (- item or * item)
  html = html.replace(/^[*+-]\s+(.+)$/gm, '<li class="ml-4 list-disc">$1</li>');

  // Ordered lists (1. item)
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li class="ml-4 list-decimal">$1</li>');

  // Wrap consecutive list items in <ul> or <ol>
  html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, (match) => {
    if (match.includes('list-decimal')) {
      return `<ol class="space-y-1 my-2">${match}</ol>`;
    }
    return `<ul class="space-y-1 my-2">${match}</ul>`;
  });

  // Horizontal rules (---)
  html = html.replace(/^---$/gm, '<hr class="my-4 border-gray-300 dark:border-gray-700" />');

  // Line breaks (double newline = paragraph, single newline = <br>)
  html = html.split('\n\n').map(paragraph => {
    if (paragraph.trim()) {
      // Check if it's already a block element (heading, list, pre, hr)
      if (/^<(h[1-6]|ul|ol|pre|hr)/.test(paragraph.trim())) {
        return paragraph.trim();
      }
      // Convert single newlines to <br> within paragraphs
      const withBreaks = paragraph.replace(/\n/g, '<br />');
      return `<p class="leading-relaxed mb-2">${withBreaks}</p>`;
    }
    return '';
  }).join('');

  return html;
}

// Component to format AI responses with rich text (not markdown)
function FormattedMessage({ content, isAI }: { content: string; isAI: boolean }) {
  if (!isAI) {
    return <p className="text-sm whitespace-pre-wrap">{content}</p>;
  }

  // Convert markdown to rich text HTML
  const richTextHtml = markdownToRichText(content);

  return (
    <div
      className="text-sm prose prose-sm dark:prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: richTextHtml }}
    />
  );
}

export type Message = {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  file?: {
    name: string;
    size: number;
    type: string;
    url?: string;
  };
};

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  messages: Message[];
  onMessagesChange: Dispatch<SetStateAction<Message[]>>;
  onModuleSelect?: (moduleId: string | null) => void;
}

export function ChatPanel({ isOpen, onClose, messages, onMessagesChange, onModuleSelect }: ChatPanelProps) {
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredCommands, setFilteredCommands] = useState(SLASH_COMMANDS);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showCSVAnalysis, setShowCSVAnalysis] = useState(false);
  const [csvFile, setCSVFile] = useState<File | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  // Handle input changes and slash command suggestions
  const handleInputChange = (value: string) => {
    setInputValue(value);

    if (value.startsWith('/')) {
      const query = value.toLowerCase();
      const filtered = SLASH_COMMANDS.filter(cmd =>
        cmd.command.toLowerCase().includes(query) ||
        cmd.description.toLowerCase().includes(query.slice(1))
      );
      setFilteredCommands(filtered);
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  // Execute slash command
  const executeSlashCommand = async (command: string) => {
    const cmd = SLASH_COMMANDS.find(c => c.command === command);
    if (!cmd) return false;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: command,
      sender: 'user',
      timestamp: new Date(),
    };

    onMessagesChange([...messages, userMessage]);
    setInputValue('');
    setShowSuggestions(false);
    setIsTyping(true);

    // Navigate to the appropriate module first
    if (onModuleSelect && cmd.action !== 'help') {
      const moduleMap: Record<string, string> = {
        'lead-intelligence': 'lead-intelligence',
        'voice-bot': 'ai-voice-bot',
        'video-bot': 'ai-video-bot',
        'user-engagement': 'user-engagement',
        'budget-optimization': 'budget-optimization',
        'performance-scorecard': 'performance-scorecard',
        'ai-content': 'ai-content',
        'customer-view': 'unified-customer-view',
        'seo-llmo': 'seo-llmo',
        'company-intel': 'company-intelligence'
      };

      const moduleId = moduleMap[cmd.action];
      if (moduleId) {
        // Set hash to indicate auto-start
        window.location.hash = 'auto-start';
        onModuleSelect(moduleId);
      } else if (cmd.action === 'agents') {
        onModuleSelect('dashboard');
      } else if (cmd.action === 'workflows') {
        onModuleSelect('workflow-builder');
      }
    }

    try {
      let responseContent = '';

      switch (cmd.action) {
        case 'agents':
          responseContent = `**AI Agents Dashboard - Navigating to Module**

**Module Loading:** AI Agents Dashboard [Done]
**Available Agents:** 4 specialized marketing agents ready

**Your AI Marketing Team:**
• **Lead Analyst** - Lead Intelligence & Scoring specialist
• **Content Creator** - AI Content Generation specialist
• **Campaign Optimizer** - Budget & Performance optimization specialist
• **Customer Insights** - Customer Analytics & Segmentation specialist

**Agent Capabilities:**
• Autonomous task execution
• Real-time chat and consultation
• Tool integration and automation
• Memory and learning from interactions
• Collaborative workflow orchestration

**Next:** Check the AI Agents Dashboard to interact with your marketing AI team!`;
          break;

        case 'workflows':
          responseContent = `**Workflow Builder - Navigating to Module**

**Module Loading:** Agent Workflow Builder [Done]
**Workflow Orchestration:** Multi-agent collaboration system

**Build Custom Workflows:**
• Chain multiple AI agents together
• Create complex marketing automation
• Define sequential or parallel task execution
• Monitor workflow performance and results

**Pre-built Templates:**
• Complete Lead Analysis Pipeline
• Content Marketing Pipeline
• Campaign Optimization Suite
• Customer Journey Mapping

**Features:**
• Visual workflow designer
• Agent task configuration
• Real-time execution monitoring
• Result aggregation and analysis

**Next:** Check the Workflow Builder to create powerful multi-agent marketing workflows!`;
          break;

        case 'lead-intelligence':
          responseContent = `**Lead Intelligence & AI Agents - Navigating to Module**

**Module Loading:** Lead Intelligence & Scoring [Done]
**Auto-Deployment:** Starting AI Agent workflow...

• **Step 1:** Upload Customer Data [Done]
• **Step 2:** Enrich Leads with AI [Pending]
• **Step 3:** Find Ideal Customer Profile [Pending]
• **Step 4:** Build Lookalike Audience [Pending]
• **Step 5:** Deploy AI Outreach [Pending]
• **Step 6:** Monitor Results [Pending]

**Status:** Module loaded! AI Agent deployment will start automatically...

**Expected Results:**
• 12,847 total prospects identified
• 89% match score with your ICP
• 2,156 high-intent leads ready for outreach

**Next:** Check the Lead Intelligence module - the AI workflow is starting!`;
          break;

        case 'voice-bot':
          responseContent = `**AI Voice Bot Automation - Navigating to Module**

**Module Loading:** AI Voice Bot Automation [Done]
**Auto-Deployment:** Starting Voice Bot workflow...

• **Step 1:** Upload Contact List [Done]
• **Step 2:** Generate Voice Script [Pending]
• **Step 3:** Configure Voice Bot [Pending]
• **Step 4:** Run Test Call [Pending]
• **Step 5:** Start Campaign [Pending]
• **Step 6:** Monitor Results [Pending]

**Status:** Module loaded! Voice Bot deployment will start automatically...

**Expected Results:**
• 2,847 contacts ready for calling
• 15% expected connect rate
• 427 projected conversations
• 89.2% success rate target

**Next:** Check the AI Voice Bot module - the workflow is starting!`;
          break;

        case 'video-bot':
          responseContent = `**AI Video Bot & Digital Avatar - Navigating to Module**

**Module Loading:** AI Video Bot & Digital Avatar [Done]
**Auto-Deployment:** Starting Video Bot workflow...

• **Step 1:** Upload Content Data [Done]
• **Step 2:** Create Digital Avatar [Pending]
• **Step 3:** Generate Video Scripts [Pending]
• **Step 4:** Video Production [Pending]
• **Step 5:** Deploy Videos [Pending]
• **Step 6:** Video Analytics [Pending]

**Status:** Module loaded! Video Bot deployment will start automatically...

**Expected Results:**
• 2,400+ videos ready for production
• 78.9% engagement rate target
• 15.2% conversion rate improvement
• Multi-channel video deployment

**Next:** Check the AI Video Bot module - the workflow is starting!`;
          break;

        case 'user-engagement':
          responseContent = `**User Engagement & Lifecycle - Navigating to Module**

**Module Loading:** User Engagement & Lifecycle [Done]
**Auto-Deployment:** Starting Engagement workflow...

• **Step 1:** Upload Customer Data [Done]
• **Step 2:** Customer Segmentation [Pending]
• **Step 3:** Design Journey Maps [Pending]
• **Step 4:** Generate Content [Pending]
• **Step 5:** Launch Campaigns [Pending]
• **Step 6:** Track Engagement [Pending]

**Status:** Module loaded! Engagement workflow will start automatically...

**Expected Results:**
• 5 customer segments identified
• 12 journey templates created
• 85% engagement rate target
• Multi-channel campaign deployment

**Next:** Check the User Engagement module - the workflow is starting!`;
          break;

        case 'budget-optimization':
          responseContent = `**Campaign Budget Optimization - Navigating to Module**

**Module Loading:** Campaign Budget Optimization [Done]
**Auto-Deployment:** Starting Budget workflow...

• **Step 1:** Upload Campaign Data [Done]
• **Step 2:** AI Budget Analysis [Pending]
• **Step 3:** Generate Recommendations [Pending]
• **Step 4:** Scenario Modeling [Pending]
• **Step 5:** Deploy Optimization [Pending]
• **Step 6:** Performance Tracking [Pending]

**Status:** Module loaded! Budget optimization will start automatically...

**Expected Results:**
• +18% ROAS improvement
• +₹2.1L additional revenue
• Optimized allocation across 8 campaigns
• Real-time budget adjustments

**Next:** Check the Budget Optimization module - the workflow is starting!`;
          break;

        case 'performance-scorecard':
          responseContent = `**Performance Scorecard - Navigating to Module**

**Module Loading:** Performance Scorecard [Done]
**Auto-Deployment:** Starting Scorecard workflow...

• **Step 1:** Upload Performance Data [Done]
• **Step 2:** AI Performance Analysis [Pending]
• **Step 3:** Generate Scorecard [Pending]
• **Step 4:** Industry Benchmarking [Pending]
• **Step 5:** Predictive Forecasting [Pending]
• **Step 6:** Live Dashboard [Pending]

**Status:** Module loaded! Scorecard generation will start automatically...

**Expected Results:**
• Overall score: 92/100 (Excellent)
• Top 10% industry ranking
• ₹52.7L revenue tracked
• Real-time performance monitoring

**Next:** Check the Performance Scorecard module - the workflow is starting!`;
          break;

        case 'ai-content':
          responseContent = `**AI Content Generation - Navigating to Module**

**Module Loading:** AI Content Generation [Done]
**Auto-Deployment:** Starting Content workflow...

• **Step 1:** Upload Brand Assets [Done]
• **Step 2:** AI Content Analysis [Pending]
• **Step 3:** Generate Content [Pending]
• **Step 4:** Content Review [Pending]
• **Step 5:** Publish Content [Pending]
• **Step 6:** Performance Tracking [Pending]

**Status:** Module loaded! Content generation will start automatically...

**Expected Results:**
• 1,200+ content pieces generated
• 24.7% engagement rate target
• Multi-channel content deployment
• 120 hours of time saved

**Next:** Check the AI Content module - the workflow is starting!`;
          break;

        case 'customer-view':
          responseContent = `**Unified Customer View - Navigating to Module**

**Module Loading:** Unified Customer View [Done]
**Auto-Deployment:** Starting Customer View workflow...

• **Step 1:** Upload Customer Data [Done]
• **Step 2:** Data Integration [Pending]
• **Step 3:** Build Unified Profiles [Pending]
• **Step 4:** Smart Segmentation [Pending]
• **Step 5:** Generate Insights [Pending]
• **Step 6:** Deploy Dashboard [Pending]

**Status:** Module loaded! Customer View deployment will start automatically...

**Expected Results:**
• 45,000 profiles unified
• 91.3% targeting accuracy
• 360-degree customer view
• Real-time insights dashboard

**Next:** Check the Unified Customer View module - the workflow is starting!`;
          break;

        case 'seo-llmo':
          responseContent = `**SEO & LLMO Optimization - Navigating to Module**

**Module Loading:** SEO & LLMO Optimization [Done]
**Auto-Deployment:** Starting SEO/LLMO workflow...

• **Step 1:** Upload Website Data [Done]
• **Step 2:** SEO Analysis [Pending]
• **Step 3:** Keyword Research [Pending]
• **Step 4:** Content Optimization [Pending]
• **Step 5:** Deploy Changes [Pending]
• **Step 6:** Performance Monitoring [Pending]

**Status:** Module loaded! SEO/LLMO optimization will start automatically...

**Expected Results:**
• 3,200+ keywords optimized
• Top 3 average search ranking
• +67% organic traffic growth
• 89% LLMO readiness score

**Next:** Check the SEO/LLMO module - the workflow is starting!`;
          break;

        case 'help':
          responseContent = `**Available Slash Commands**

**Agentic AI Commands:**
• \`/agents\` - Open AI Agents Dashboard - interact with your marketing AI team
• \`/workflows\` - Open Workflow Builder - create multi-agent workflows

**Agentic AI Commands:**
• \`/ai-agents\` - Deploy AI Agents Hub - manage all autonomous agents
• \`/agent-workflows\` - Deploy Agent Workflows - create multi-step AI workflows
• \`/autonomous-campaigns\` - Deploy Autonomous Campaigns - self-optimizing campaigns
• \`/agent-orchestration\` - Deploy Multi-Agent Orchestration - coordinate multiple AI agents
• \`/agent-marketplace\` - Access Agent Marketplace - browse and deploy pre-built agents
• \`/predictive-intelligence\` - Deploy Predictive Intelligence - AI forecasting and predictions
• \`/real-time-personalization\` - Deploy Real-time Personalization - dynamic content adaptation

**Workflow Deployments:**
• \`/lead-intelligence\` - Deploy Lead Intelligence & AI Agents
• \`/voice-bot\` - Deploy AI Voice Bot Automation
• \`/video-bot\` - Deploy AI Video Bot & Digital Avatar
• \`/user-engagement\` - Deploy User Engagement & Lifecycle
• \`/budget-optimization\` - Deploy Campaign Budget Optimization
• \`/performance-scorecard\` - Deploy Performance Scorecard
• \`/ai-content\` - Deploy AI Content Generation
• \`/customer-view\` - Deploy Unified Customer View
• \`/seo-llmo\` - Deploy SEO/LLMO Optimization

**Utility Commands:**
• \`/help\` - Show this help message

**How to use:**
Simply type any slash command and press Enter to instantly trigger the corresponding workflow deployment. The AI will bypass normal chat processing and execute the action directly!

**Pro Tip:** Start typing "/" to see command suggestions with auto-complete!`;
          break;

        default:
          return false;
      }

      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 1500));

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: responseContent,
        sender: 'ai',
        timestamp: new Date(),
      };

      onMessagesChange([...messages, userMessage, aiMessage]);

      // Show success toast
      if (cmd.action !== 'help') {
        toast.success(`${cmd.description} started successfully!`);
      }

      return true;
    } catch (error) {
      console.error('Slash command error:', error);
      toast.error('Failed to execute command. Please try again.');
      return false;
    } finally {
      setIsTyping(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    // Check if it's a slash command
    if (inputValue.startsWith('/')) {
      const success = await executeSlashCommand(inputValue.trim());
      if (success) return;
      // If slash command failed, fall through to normal processing
    }

    // Create file info if file is selected
    let fileInfo = undefined;
    if (selectedFile) {
      fileInfo = {
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type,
        url: URL.createObjectURL(selectedFile)
      };
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue || (selectedFile ? `Uploaded file: ${selectedFile.name}` : ''),
      sender: 'user',
      timestamp: new Date(),
      file: fileInfo,
    };

    onMessagesChange([...messages, userMessage]);
    const currentInput = inputValue;
    const currentFile = selectedFile;
    setInputValue('');
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setIsTyping(true);

    try {
      const guidedGoal = currentFile ? null : detectGuidedGoal(currentInput);
      if (guidedGoal) {
        try {
          const guidedResponse = await executeGuidedWorkflow({
            userRequest: currentInput,
            goal: guidedGoal,
            moduleHint: 'company-intelligence',
            mode: 'guided',
          });

          sessionStorage.setItem(
            `guided_action_plan_${guidedResponse.actionPlan.goal}`,
            JSON.stringify(guidedResponse.actionPlan)
          );

          if (onModuleSelect) {
            window.location.hash = guidedResponse.navigation.hash;
            onModuleSelect(guidedResponse.navigation.moduleId);
          }

          const aiMessage: Message = {
            id: (Date.now() + 1).toString(),
            content: toActionPlanMessage(guidedResponse),
            sender: 'ai',
            timestamp: new Date(),
          };
          onMessagesChange([...messages, userMessage, aiMessage]);
          toast.success('Guided workflow started');
          return;
        } catch (guidedError) {
          console.error('Guided workflow execution failed:', guidedError);
        }
      }

      // Convert messages to Groq format
      const chatMessages: ChatMessage[] = messages.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));

      // Add the current user message
      let messageContent = currentInput;
      if (currentFile) {
        messageContent += currentFile ? ` [File uploaded: ${currentFile.name} (${formatFileSize(currentFile.size)})]` : '';
      }

      chatMessages.push({
        role: 'user',
        content: messageContent
      });

      // Get AI response from Groq
      const aiResponse = await GroqService.getChatResponse(chatMessages);

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: aiResponse,
        sender: 'ai',
        timestamp: new Date(),
      };

      onMessagesChange([...messages, userMessage, aiMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      toast.error('Failed to get AI response. Please try again.');

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: 'Sorry, I\'m having trouble connecting right now. Please try again in a moment.',
        sender: 'ai',
        timestamp: new Date(),
      };

      onMessagesChange([...messages, userMessage, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (showSuggestions && filteredCommands.length > 0) {
        // Auto-complete first suggestion
        const firstCommand = filteredCommands[0];
        setInputValue(firstCommand.command);
        setShowSuggestions(false);
      } else {
        handleSendMessage();
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (command: string) => {
    setInputValue(command);
    setShowSuggestions(false);
  };

  const handleClearChat = () => {
    const welcomeMessage: Message = {
      id: '1',
      content: 'Hello! I\'m your AI assistant. How can I help you with your marketing campaigns today?',
      sender: 'ai',
      timestamp: new Date(),
    };
    onMessagesChange([welcomeMessage]);
    toast.success('Chat cleared');
  };

  // File upload handlers
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = [
        'text/csv',
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ];

      if (!validTypes.includes(file.type)) {
        toast.error('Please upload a valid CSV, PDF, or image file');
        return;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File size must be less than 10MB');
        return;
      }

      setSelectedFile(file);
      toast.success(`${file.name} selected for upload`);

      // Auto-open CSV analysis for CSV files
      if (file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv') ||
          file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
        setCSVFile(file);
        setShowCSVAnalysis(true);
      }
    }
  };

  const removeSelectedFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.includes('image')) {
      return <Image className="h-4 w-4" />;
    } else if (fileType.includes('pdf')) {
      return <FileText className="h-4 w-4" />;
    } else if (fileType.includes('csv') || fileType.includes('excel') || fileType.includes('spreadsheet')) {
      return <FileSpreadsheet className="h-4 w-4" />;
    }
    return <FileText className="h-4 w-4" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      {/* Chat Panel */}
      <div className={cn(
        "fixed top-0 right-0 h-full w-96 bg-background border-l shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-orange-500 to-orange-600 text-white">
          <div className="flex items-center space-x-3">
            <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-white">
              <Bot className="h-5 w-5" style={{ display: 'block', color: '#ffffff' }} />
            </div>
            <div>
              <h3 className="font-semibold">AI Assistant</h3>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClearChat}
              className="h-8 w-8 bg-white/10 hover:bg-white/30 border border-white/40 hover:border-white/60 transition-colors"
              title="Clear chat"
              style={{ color: '#ffffff' }}
            >
              <Trash2 className="h-4 w-4" style={{ display: 'block', color: '#ffffff' }} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 bg-white/10 hover:bg-white/30 border border-white/40 hover:border-white/60 transition-colors"
              title="Close chat"
              style={{ color: '#ffffff' }}
            >
              <X className="h-4 w-4" style={{ display: 'block', color: '#ffffff' }} />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex items-start space-x-3",
                  message.sender === 'user' ? "flex-row-reverse space-x-reverse" : "justify-start"
                )}
              >
                <Avatar className="h-8 w-8">
                  {message.sender === 'ai' ? (
                    <AvatarFallback className="bg-orange-100 text-orange-600">
                      <Bot className="h-4 w-4" />
                    </AvatarFallback>
                  ) : (
                    <AvatarFallback className="bg-blue-100 text-blue-600">
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  )}
                </Avatar>
                <Card className={cn(
                  "p-3 max-w-[280px]",
                  message.sender === 'user'
                    ? "bg-orange-500 text-white"
                    : "bg-muted text-left"
                )}>
                  {/* File attachment display */}
                  {message.file && (
                    <div className={cn(
                      "flex items-center space-x-2 p-2 rounded mb-2 border",
                      message.sender === 'user'
                        ? "bg-orange-400 border-orange-300"
                        : "bg-background border-border"
                    )}>
                      {getFileIcon(message.file.type)}
                      <div className="flex-1 min-w-0">
                        <div className={cn(
                          "text-xs font-medium truncate",
                          message.sender === 'user' ? "text-orange-100" : "text-foreground"
                        )}>
                          {message.file.name}
                        </div>
                        <div className={cn(
                          "text-xs opacity-70",
                          message.sender === 'user' ? "text-orange-200" : "text-muted-foreground"
                        )}>
                          {formatFileSize(message.file.size)}
                        </div>
                      </div>
                      {message.file.url && message.file.type.includes('image') && (
                        <img
                          src={message.file.url}
                          alt={message.file.name}
                          className="w-8 h-8 object-cover rounded"
                        />
                      )}
                    </div>
                  )}
                  <FormattedMessage
                    content={message.content}
                    isAI={message.sender === 'ai'}
                  />
                  <p className={cn(
                    "text-xs mt-1 opacity-70",
                    message.sender === 'user' ? "text-orange-100" : "text-muted-foreground"
                  )}>
                    {message.timestamp.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </Card>
              </div>
            ))}

            {/* Typing Indicator */}
            {isTyping && (
              <div className="flex items-start space-x-3 justify-start">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-orange-100 text-orange-600">
                    <Bot className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <Card className="p-3 bg-muted text-left">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                </Card>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="p-4 border-t bg-muted/30">
          {/* Selected File Preview */}
          {selectedFile && (
            <div className="mb-3 p-3 bg-background border rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {getFileIcon(selectedFile.type)}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{selectedFile.name}</div>
                    <div className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</div>
                  </div>
                  {selectedFile.type.includes('image') && (
                    <img
                      src={URL.createObjectURL(selectedFile)}
                      alt={selectedFile.name}
                      className="w-10 h-10 object-cover rounded"
                    />
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={removeSelectedFile}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Slash Command Suggestions */}
          {showSuggestions && filteredCommands.length > 0 && (
            <div className="mb-3 border rounded-lg bg-background shadow-lg max-h-48 overflow-y-auto">
              {filteredCommands.map((cmd, index) => (
                <div
                  key={cmd.command}
                  className="flex items-center space-x-3 p-3 hover:bg-muted/50 cursor-pointer border-b last:border-b-0"
                  onClick={() => handleSuggestionClick(cmd.command)}
                >
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center">
                      <span className="text-orange-600 font-mono text-sm">/</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{cmd.command}</div>
                    <div className="text-xs text-muted-foreground truncate">{cmd.description}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex space-x-2">
            {/* File Upload Button */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              className="flex-shrink-0 hover:bg-orange-50 hover:border-orange-200 bg-white border-gray-300 text-gray-700"
              title="Upload file (CSV, PDF, Images)"
            >
              <Paperclip className="h-4 w-4 text-gray-700" style={{ display: 'block' }} />
            </Button>

            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.pdf,.jpg,.jpeg,.png,.gif,.webp,.xls,.xlsx"
              onChange={handleFileSelect}
              className="hidden"
            />

            <Input
              value={inputValue}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={selectedFile ? "Add a message (optional)..." : "Ask me anything or use /commands..."}
              className="flex-1"
              disabled={isTyping}
            />
            <Button
              onClick={handleSendMessage}
              disabled={(!inputValue.trim() && !selectedFile) || isTyping}
              className="bg-orange-500 hover:bg-orange-600"
            >
              <Send className="h-4 w-4 text-white" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            AI can make mistakes. Use /help for slash commands. Upload CSV, PDF, or images.
          </p>
        </div>
      </div>

      {/* CSV Analysis Panel */}
      {showCSVAnalysis && csvFile && (
        <CSVAnalysisPanel
          file={csvFile}
          onClose={() => {
            setShowCSVAnalysis(false);
            setCSVFile(null);
          }}
        />
      )}
    </>
  );
}
