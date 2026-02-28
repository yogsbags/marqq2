import { useState, useRef, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import {
  HiPaperAirplane as Send,
  HiChat as Bot,
  HiUser as User,
  HiTrash as Trash2,
  HiPaperClip as Paperclip,
  HiDocumentText as FileText,
  HiPhotograph as Image,
  HiTable as FileSpreadsheet,
  HiX as X
} from 'react-icons/hi';
import { cn } from '@/lib/utils';
import { GroqService, ChatMessage } from '@/services/groqService';
import { executeGuidedWorkflow, type GuidedGoal, type GuidedWorkflowResponse } from '@/services/guidedWorkflowService';
import { toast } from 'sonner';
import { CSVAnalysisPanel } from '@/components/ui/csv-analysis-panel';
import type { Message, Conversation } from '@/types/chat';
import { addAiTask, extractActionItems } from '@/lib/taskStore';
import { markdownToRichText } from '@/lib/markdown';
import { GTMWizard } from '@/components/gtm/GTMWizard';
import { GettingStartedChecklist } from '@/components/dashboard/GettingStartedChecklist';

// -- localStorage helpers

const CONV_KEY = 'torqq_conversations';

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(CONV_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map((c: any) => ({
      ...c,
      createdAt: new Date(c.createdAt),
      lastMessageAt: new Date(c.lastMessageAt),
      messages: c.messages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })),
    }));
  } catch { return []; }
}

function saveConversations(convs: Conversation[]) {
  localStorage.setItem(CONV_KEY, JSON.stringify(convs));
}

function generateName(firstUserMessage: string): string {
  return firstUserMessage.trim().slice(0, 40) || 'New conversation';
}

// -- Slash commands

const SLASH_COMMANDS = [
  { command: '/agents', description: 'Open AI Agents Dashboard', action: 'agents' },
  { command: '/workflows', description: 'Open Workflow Builder', action: 'workflows' },
  { command: '/lead-intelligence', description: 'Deploy Lead Intelligence & AI Agents workflow', action: 'lead-intelligence' },
  { command: '/voice-bot', description: 'Deploy AI Voice Bot automation workflow', action: 'voice-bot' },
  { command: '/video-bot', description: 'Deploy AI Video Bot & Digital Avatar workflow', action: 'video-bot' },
  { command: '/user-engagement', description: 'Deploy User Engagement & Lifecycle workflow', action: 'user-engagement' },
  { command: '/budget-optimization', description: 'Deploy Campaign Budget Optimization workflow', action: 'budget-optimization' },
  { command: '/performance-scorecard', description: 'Deploy Performance Scorecard workflow', action: 'performance-scorecard' },
  { command: '/ai-content', description: 'Deploy AI Content Generation workflow', action: 'ai-content' },
  { command: '/customer-view', description: 'Deploy Unified Customer View workflow', action: 'customer-view' },
  { command: '/seo-llmo', description: 'Deploy SEO/LLMO Optimization workflow', action: 'seo-llmo' },
  { command: '/company-intel', description: 'Open Company Intelligence (strategy, calendar, ICPs, competitors)', action: 'company-intel' },
  // Digital employee direct-chat commands
  { command: '/seo',         description: 'Ask Maya (SEO Monitor) for today\'s ranking update',          action: 'agent-maya'  },
  { command: '/leads',       description: 'Ask Arjun (Lead Intelligence) for today\'s lead insights',    action: 'agent-arjun' },
  { command: '/content',     description: 'Ask Riya (Content Producer) for content ideas this week',     action: 'agent-riya'  },
  { command: '/campaign',    description: 'Ask Zara (Campaign Strategist) for campaign recommendations', action: 'agent-zara'  },
  { command: '/competitors', description: 'Ask Dev (Performance Analyst) for competitor analysis',       action: 'agent-dev'   },
  { command: '/brief',       description: 'Ask Priya (Brand Intelligence) for a brand brief',            action: 'agent-priya' },
  { command: '/help', description: 'Show available slash commands', action: 'help' },
];

// Map slash commands to autonomous agents
const SLASH_AGENTS: Record<string, { name: string; label: string; defaultQuery: string }> = {
  '/seo':         { name: 'maya',  label: 'Maya · SEO & LLMO Monitor',   defaultQuery: 'Give me our top 5 ranking changes and 3 keyword opportunities today.' },
  '/leads':       { name: 'arjun', label: 'Arjun · Lead Intelligence',    defaultQuery: 'What are today\'s top lead insights and recommended outreach actions?' },
  '/content':     { name: 'riya',  label: 'Riya · Content Producer',      defaultQuery: 'Suggest 3 content pieces we should publish this week based on current trends.' },
  '/campaign':    { name: 'zara',  label: 'Zara · Campaign Strategist',   defaultQuery: 'Review our active campaigns and give me your top 3 strategic recommendations.' },
  '/competitors': { name: 'dev',   label: 'Dev · Performance Analyst',    defaultQuery: 'Give me a competitor landscape summary and our key performance gaps.' },
  '/brief':       { name: 'priya', label: 'Priya · Brand Intelligence',   defaultQuery: 'Provide a brand intelligence brief covering sentiment and messaging alignment.' },
};

// -- Guided goal detection

function detectGuidedGoal(input: string): GuidedGoal | null {
  const text = input.toLowerCase();
  const roiSignals = ['roi', 'roas', 'budget', 'reduce cpa', 'improve cpa', 'campaign efficiency'];
  if (roiSignals.some((signal) => text.includes(signal))) return 'roi';
  const contentSignals = ['content plan', 'content strategy', 'content calendar', 'social calendar', 'monthly content'];
  if (contentSignals.some((signal) => text.includes(signal))) return 'content';
  const leadsSignals = ['more leads', 'lead generation', 'qualified leads', 'pipeline growth', 'lead flow'];
  if (leadsSignals.some((signal) => text.includes(signal))) return 'leads';
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

function FormattedMessage({ content, isAI }: { content: string; isAI: boolean }) {
  if (!isAI) return <p className="text-sm whitespace-pre-wrap">{content}</p>;
  const richTextHtml = markdownToRichText(content);
  return (
    <div
      className="text-sm prose prose-sm dark:prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: richTextHtml }}
    />
  );
}

// -- Initial messages

const initialMessages: Message[] = [
  {
    id: '1',
    content: "Hello! I'm your AI assistant. How can I help you with your marketing campaigns today?",
    sender: 'ai',
    timestamp: new Date(),
  },
];

// -- Props

interface ChatHomeProps {
  onModuleSelect?: (moduleId: string | null) => void;
  activeConversationId?: string | null;
  onConversationsChange?: () => void;
}

// -- Component

export function ChatHome({ onModuleSelect, activeConversationId, onConversationsChange }: ChatHomeProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredCommands, setFilteredCommands] = useState(SLASH_COMMANDS);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showCSVAnalysis, setShowCSVAnalysis] = useState(false);
  const [csvFile, setCSVFile] = useState<File | null>(null);
  const [gtmActive, setGtmActive] = useState(false);

  // -- Helpers

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.includes('image')) return <Image className="h-4 w-4" />;
    if (fileType.includes('pdf')) return <FileText className="h-4 w-4" />;
    if (fileType.includes('csv') || fileType.includes('excel') || fileType.includes('spreadsheet')) return <FileSpreadsheet className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  // -- Conversation persistence

  const persistMessages = (updatedMessages: Message[], convId: string | null): string => {
    const conversations = loadConversations();
    const id = convId ?? `conv-${Date.now()}`;
    const firstUserMsg = updatedMessages.find(m => m.sender === 'user');
    const name = firstUserMsg ? generateName(firstUserMsg.content) : 'New conversation';
    const now = new Date();
    const existing = conversations.find(c => c.id === id);
    if (existing) {
      existing.messages = updatedMessages;
      existing.lastMessageAt = now;
    } else {
      conversations.push({ id, name, createdAt: now, lastMessageAt: now, messages: updatedMessages });
    }
    saveConversations(conversations);
    if (!convId) setCurrentConvId(id);
    onConversationsChange?.();
    return id;
  };

  const onMessagesChange: Dispatch<SetStateAction<Message[]>> = (updater) => {
    setMessages(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      persistMessages(next, currentConvId);
      return next;
    });
  };

  // -- Load conversation when activeConversationId changes

  useEffect(() => {
    if (!activeConversationId) return;
    const conversations = loadConversations();
    const conv = conversations.find(c => c.id === activeConversationId);
    if (conv) {
      setMessages(conv.messages);
      setCurrentConvId(conv.id);
    }
  }, [activeConversationId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!selectedFile) {
      setFilePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setFilePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  // -- New conversation

  const handleNewConversation = () => {
    setMessages(initialMessages);
    setCurrentConvId(null);
  };

  // -- Input handling

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

  // -- Slash command → follow-up task mapping

  const SLASH_FOLLOWUP_TASKS: Record<string, string> = {
    'lead-intelligence': 'Review and approve scored leads',
    'voice-bot': 'Monitor voice bot call results',
    'video-bot': 'Review generated avatar videos',
    'user-engagement': 'Review engagement campaign segments',
    'budget-optimization': 'Review budget optimization recommendations',
    'performance-scorecard': 'Review performance scorecard report',
    'ai-content': 'Review and publish AI-generated content',
    'customer-view': 'Review unified customer profiles',
    'seo-llmo': 'Review SEO optimization recommendations',
    'company-intel': 'Review company intelligence insights',
    'agents': 'Check in with AI agents dashboard',
    'workflows': 'Review and run pending workflows',
  };

  // -- Slash command execution

  const executeSlashCommand = async (command: string) => {
    const cmd = SLASH_COMMANDS.find(c => c.command === command);
    if (!cmd) return false;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: command,
      sender: 'user',
      timestamp: new Date(),
    };

    onMessagesChange(prev => [...prev, userMessage]);
    setInputValue('');
    setShowSuggestions(false);
    setIsTyping(true);

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
        'company-intel': 'company-intelligence',
      };
      const moduleId = moduleMap[cmd.action];
      if (moduleId) {
        window.location.hash = 'auto-start';
        onModuleSelect(moduleId);
      } else if (cmd.action === 'agents') {
        onModuleSelect('agent-dashboard');
      } else if (cmd.action === 'workflows') {
        onModuleSelect('workflow-builder');
      }
    }

    try {
      let responseContent = '';

      switch (cmd.action) {
        case 'agents':
          responseContent = `\u{1F916} **AI Agents Dashboard - Navigating to Module**\n\n**Module Loading:** AI Agents Dashboard \u2705\n**Available Agents:** 4 specialized marketing agents ready\n\n**Your AI Marketing Team:**\n\u2022 **Lead Analyst** - Lead Intelligence & Scoring specialist\n\u2022 **Content Creator** - AI Content Generation specialist\n\u2022 **Campaign Optimizer** - Budget & Performance optimization specialist\n\u2022 **Customer Insights** - Customer Analytics & Segmentation specialist\n\n**Agent Capabilities:**\n\u2022 Autonomous task execution\n\u2022 Real-time chat and consultation\n\u2022 Tool integration and automation\n\u2022 Memory and learning from interactions\n\u2022 Collaborative workflow orchestration\n\n**Next:** Check the AI Agents Dashboard to interact with your marketing AI team! \u{1F680}`;
          break;
        case 'workflows':
          responseContent = `\u26A1 **Workflow Builder - Navigating to Module**\n\n**Module Loading:** Agent Workflow Builder \u2705\n**Workflow Orchestration:** Multi-agent collaboration system\n\n**Build Custom Workflows:**\n\u2022 Chain multiple AI agents together\n\u2022 Create complex marketing automation\n\u2022 Define sequential or parallel task execution\n\u2022 Monitor workflow performance and results\n\n**Pre-built Templates:**\n\u2022 Complete Lead Analysis Pipeline\n\u2022 Content Marketing Pipeline\n\u2022 Campaign Optimization Suite\n\u2022 Customer Journey Mapping\n\n**Features:**\n\u2022 Visual workflow designer\n\u2022 Agent task configuration\n\u2022 Real-time execution monitoring\n\u2022 Result aggregation and analysis\n\n**Next:** Check the Workflow Builder to create powerful multi-agent marketing workflows! \u26A1`;
          break;
        case 'lead-intelligence':
          responseContent = `\u{1F680} **Lead Intelligence & AI Agents - Navigating to Module**\n\n**Module Loading:** Lead Intelligence & Scoring \u2705\n**Auto-Deployment:** Starting AI Agent workflow...\n\n\u2022 **Step 1:** Upload Customer Data \u2705\n\u2022 **Step 2:** Enrich Leads with AI \u23F3\n\u2022 **Step 3:** Find Ideal Customer Profile \u23F3\n\u2022 **Step 4:** Build Lookalike Audience \u23F3\n\u2022 **Step 5:** Deploy AI Outreach \u23F3\n\u2022 **Step 6:** Monitor Results \u23F3\n\n**Status:** Module loaded! AI Agent deployment will start automatically...\n\n**Expected Results:**\n\u2022 12,847 total prospects identified\n\u2022 89% match score with your ICP\n\u2022 2,156 high-intent leads ready for outreach\n\n**Next:** Check the Lead Intelligence module - the AI workflow is starting! \u{1F3AF}`;
          break;
        case 'voice-bot':
          responseContent = `\u{1F399}\uFE0F **AI Voice Bot Automation - Navigating to Module**\n\n**Module Loading:** AI Voice Bot Automation \u2705\n**Auto-Deployment:** Starting Voice Bot workflow...\n\n\u2022 **Step 1:** Upload Contact List \u2705\n\u2022 **Step 2:** Generate Voice Script \u23F3\n\u2022 **Step 3:** Configure Voice Bot \u23F3\n\u2022 **Step 4:** Run Test Call \u23F3\n\u2022 **Step 5:** Start Campaign \u23F3\n\u2022 **Step 6:** Monitor Results \u23F3\n\n**Status:** Module loaded! Voice Bot deployment will start automatically...\n\n**Expected Results:**\n\u2022 2,847 contacts ready for calling\n\u2022 15% expected connect rate\n\u2022 427 projected conversations\n\u2022 89.2% success rate target\n\n**Next:** Check the AI Voice Bot module - the workflow is starting! \u{1F4DE}`;
          break;
        case 'video-bot':
          responseContent = `\u{1F3AC} **AI Video Bot & Digital Avatar - Navigating to Module**\n\n**Module Loading:** AI Video Bot & Digital Avatar \u2705\n**Auto-Deployment:** Starting Video Bot workflow...\n\n\u2022 **Step 1:** Upload Content Data \u2705\n\u2022 **Step 2:** Create Digital Avatar \u23F3\n\u2022 **Step 3:** Generate Video Scripts \u23F3\n\u2022 **Step 4:** Video Production \u23F3\n\u2022 **Step 5:** Deploy Videos \u23F3\n\u2022 **Step 6:** Video Analytics \u23F3\n\n**Status:** Module loaded! Video Bot deployment will start automatically...\n\n**Expected Results:**\n\u2022 2,400+ videos ready for production\n\u2022 78.9% engagement rate target\n\u2022 15.2% conversion rate improvement\n\u2022 Multi-channel video deployment\n\n**Next:** Check the AI Video Bot module - the workflow is starting! \u{1F3A5}`;
          break;
        case 'user-engagement':
          responseContent = `\u{1F465} **User Engagement & Lifecycle - Navigating to Module**\n\n**Module Loading:** User Engagement & Lifecycle \u2705\n**Auto-Deployment:** Starting Engagement workflow...\n\n\u2022 **Step 1:** Upload Customer Data \u2705\n\u2022 **Step 2:** Customer Segmentation \u23F3\n\u2022 **Step 3:** Design Journey Maps \u23F3\n\u2022 **Step 4:** Generate Content \u23F3\n\u2022 **Step 5:** Launch Campaigns \u23F3\n\u2022 **Step 6:** Track Engagement \u23F3\n\n**Status:** Module loaded! Engagement workflow will start automatically...\n\n**Expected Results:**\n\u2022 5 customer segments identified\n\u2022 12 journey templates created\n\u2022 85% engagement rate target\n\u2022 Multi-channel campaign deployment\n\n**Next:** Check the User Engagement module - the workflow is starting! \u{1F3AF}`;
          break;
        case 'budget-optimization':
          responseContent = `\u{1F4B0} **Campaign Budget Optimization - Navigating to Module**\n\n**Module Loading:** Campaign Budget Optimization \u2705\n**Auto-Deployment:** Starting Budget workflow...\n\n\u2022 **Step 1:** Upload Campaign Data \u2705\n\u2022 **Step 2:** AI Budget Analysis \u23F3\n\u2022 **Step 3:** Generate Recommendations \u23F3\n\u2022 **Step 4:** Scenario Modeling \u23F3\n\u2022 **Step 5:** Deploy Optimization \u23F3\n\u2022 **Step 6:** Performance Tracking \u23F3\n\n**Status:** Module loaded! Budget optimization will start automatically...\n\n**Expected Results:**\n\u2022 +18% ROAS improvement\n\u2022 +\u20B92.1L additional revenue\n\u2022 Optimized allocation across 8 campaigns\n\u2022 Real-time budget adjustments\n\n**Next:** Check the Budget Optimization module - the workflow is starting! \u{1F4C8}`;
          break;
        case 'performance-scorecard':
          responseContent = `\u{1F4CA} **Performance Scorecard - Navigating to Module**\n\n**Module Loading:** Performance Scorecard \u2705\n**Auto-Deployment:** Starting Scorecard workflow...\n\n\u2022 **Step 1:** Upload Performance Data \u2705\n\u2022 **Step 2:** AI Performance Analysis \u23F3\n\u2022 **Step 3:** Generate Scorecard \u23F3\n\u2022 **Step 4:** Industry Benchmarking \u23F3\n\u2022 **Step 5:** Predictive Forecasting \u23F3\n\u2022 **Step 6:** Live Dashboard \u23F3\n\n**Status:** Module loaded! Scorecard generation will start automatically...\n\n**Expected Results:**\n\u2022 Overall score: 92/100 (Excellent)\n\u2022 Top 10% industry ranking\n\u2022 \u20B952.7L revenue tracked\n\u2022 Real-time performance monitoring\n\n**Next:** Check the Performance Scorecard module - the workflow is starting! \u{1F3C6}`;
          break;
        case 'ai-content':
          responseContent = `\u{1F3A8} **AI Content Generation - Navigating to Module**\n\n**Module Loading:** AI Content Generation \u2705\n**Auto-Deployment:** Starting Content workflow...\n\n\u2022 **Step 1:** Upload Brand Assets \u2705\n\u2022 **Step 2:** AI Content Analysis \u23F3\n\u2022 **Step 3:** Generate Content \u23F3\n\u2022 **Step 4:** Content Review \u23F3\n\u2022 **Step 5:** Publish Content \u23F3\n\u2022 **Step 6:** Performance Tracking \u23F3\n\n**Status:** Module loaded! Content generation will start automatically...\n\n**Expected Results:**\n\u2022 1,200+ content pieces generated\n\u2022 24.7% engagement rate target\n\u2022 Multi-channel content deployment\n\u2022 120 hours of time saved\n\n**Next:** Check the AI Content module - the workflow is starting! \u270D\uFE0F`;
          break;
        case 'customer-view':
          responseContent = `\u{1F441}\uFE0F **Unified Customer View - Navigating to Module**\n\n**Module Loading:** Unified Customer View \u2705\n**Auto-Deployment:** Starting Customer View workflow...\n\n\u2022 **Step 1:** Upload Customer Data \u2705\n\u2022 **Step 2:** Data Integration \u23F3\n\u2022 **Step 3:** Build Unified Profiles \u23F3\n\u2022 **Step 4:** Smart Segmentation \u23F3\n\u2022 **Step 5:** Generate Insights \u23F3\n\u2022 **Step 6:** Deploy Dashboard \u23F3\n\n**Status:** Module loaded! Customer View deployment will start automatically...\n\n**Expected Results:**\n\u2022 45,000 profiles unified\n\u2022 91.3% targeting accuracy\n\u2022 360-degree customer view\n\u2022 Real-time insights dashboard\n\n**Next:** Check the Unified Customer View module - the workflow is starting! \u{1F50D}`;
          break;
        case 'seo-llmo':
          responseContent = `\u{1F50D} **SEO & LLMO Optimization - Navigating to Module**\n\n**Module Loading:** SEO & LLMO Optimization \u2705\n**Auto-Deployment:** Starting SEO/LLMO workflow...\n\n\u2022 **Step 1:** Upload Website Data \u2705\n\u2022 **Step 2:** SEO Analysis \u23F3\n\u2022 **Step 3:** Keyword Research \u23F3\n\u2022 **Step 4:** Content Optimization \u23F3\n\u2022 **Step 5:** Deploy Changes \u23F3\n\u2022 **Step 6:** Performance Monitoring \u23F3\n\n**Status:** Module loaded! SEO/LLMO optimization will start automatically...\n\n**Expected Results:**\n\u2022 3,200+ keywords optimized\n\u2022 Top 3 average search ranking\n\u2022 +67% organic traffic growth\n\u2022 89% LLMO readiness score\n\n**Next:** Check the SEO/LLMO module - the workflow is starting! \u{1F4C8}`;
          break;
        case 'help':
          responseContent = `\u{1F916} **Available Slash Commands**\n\n**AI Team (live chat with autonomous agents):**\n\u2022 \`/seo\` - Ask Maya (SEO & LLMO Monitor) for today's ranking update\n\u2022 \`/leads\` - Ask Arjun (Lead Intelligence) for today's lead insights\n\u2022 \`/content\` - Ask Riya (Content Producer) for content ideas this week\n\u2022 \`/campaign\` - Ask Zara (Campaign Strategist) for campaign recommendations\n\u2022 \`/competitors\` - Ask Dev (Performance Analyst) for competitor analysis\n\u2022 \`/brief\` - Ask Priya (Brand Intelligence) for a brand brief\n\n**Agentic AI Commands:**\n\u2022 \`/agents\` - Open AI Agents Dashboard - interact with your marketing AI team\n\u2022 \`/workflows\` - Open Workflow Builder - create multi-agent workflows\n\n**Workflow Deployments:**\n\u2022 \`/lead-intelligence\` - Deploy Lead Intelligence & AI Agents\n\u2022 \`/voice-bot\` - Deploy AI Voice Bot Automation\n\u2022 \`/video-bot\` - Deploy AI Video Bot & Digital Avatar\n\u2022 \`/user-engagement\` - Deploy User Engagement & Lifecycle\n\u2022 \`/budget-optimization\` - Deploy Campaign Budget Optimization\n\u2022 \`/performance-scorecard\` - Deploy Performance Scorecard\n\u2022 \`/ai-content\` - Deploy AI Content Generation\n\u2022 \`/customer-view\` - Deploy Unified Customer View\n\u2022 \`/seo-llmo\` - Deploy SEO/LLMO Optimization\n\n**Utility Commands:**\n\u2022 \`/help\` - Show this help message\n\n**How to use:**\nSimply type any slash command and press Enter. For agent commands, you can add a question after the command: \`/seo what is our ranking for mutual funds?\`\n\n**Pro Tip:** Start typing "/" to see command suggestions with auto-complete! \u26A1`;
          break;
        default:
          return false;
      }

      await new Promise(resolve => setTimeout(resolve, 1500));

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: responseContent,
        sender: 'ai',
        timestamp: new Date(),
      };

      onMessagesChange(prev => {
        const alreadyHasUser = prev.some(m => m.id === userMessage.id);
        return alreadyHasUser ? [...prev, aiMessage] : [...prev, userMessage, aiMessage];
      });

      if (cmd.action !== 'help') {
        toast.success(`${cmd.description} started successfully!`);
        const followUp = SLASH_FOLLOWUP_TASKS[cmd.action];
        if (followUp) addAiTask(followUp, 'day');
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

  // -- Digital employee slash command: streams SSE response into chat

  const runAgentSlashCommand = async (agentEntry: { name: string; label: string; defaultQuery: string }, extraQuery: string) => {
    const query = extraQuery.trim() || agentEntry.defaultQuery;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue.trim(),
      sender: 'user',
      timestamp: new Date(),
    };

    onMessagesChange(prev => [...prev, userMessage]);
    setInputValue('');
    setShowSuggestions(false);
    setIsTyping(true);

    try {
      const res = await fetch(`/api/agents/${agentEntry.name}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      if (!res.ok) {
        throw new Error(`${agentEntry.label} is not available right now (backend offline?)`);
      }

      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      let accumulated = '';

      if (reader) {
        outer: while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of dec.decode(value).split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6).trim();
            if (payload === '[DONE]') break outer;
            try {
              const parsed = JSON.parse(payload);
              if (parsed.text) accumulated += parsed.text;
              if (parsed.error) throw new Error(parsed.error);
            } catch { /* ignore parse errors on partial chunks */ }
          }
        }
      }

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `**${agentEntry.label}**\n\n${accumulated || '_No output received._'}`,
        sender: 'ai',
        timestamp: new Date(),
      };
      onMessagesChange(prev => [...prev, aiMessage]);
      toast.success(`${agentEntry.label} responded`);
    } catch (err) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `**${agentEntry.label}** is offline or not configured.\n\nMake sure the AI backend is running (\`npm run dev:backend\`) and \`GROQ_API_KEY\` is set.`,
        sender: 'ai',
        timestamp: new Date(),
      };
      onMessagesChange(prev => [...prev, errorMessage]);
      toast.error(String(err));
    } finally {
      setIsTyping(false);
    }
  };

  // -- Send message

  const handleSendMessage = async () => {
    if (!inputValue.trim() && !selectedFile) return;

    if (inputValue.startsWith('/')) {
      // Check for digital employee slash commands first
      const parts = inputValue.trim().split(/\s+/);
      const cmd = parts[0];
      const agentEntry = SLASH_AGENTS[cmd];
      if (agentEntry) {
        await runAgentSlashCommand(agentEntry, parts.slice(1).join(' '));
        return;
      }

      const success = await executeSlashCommand(inputValue.trim());
      if (success) return;
    }

    let fileInfo = undefined;
    if (selectedFile) {
      fileInfo = {
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type,
        url: URL.createObjectURL(selectedFile),
      };
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue || (selectedFile ? `Uploaded file: ${selectedFile.name}` : ''),
      sender: 'user',
      timestamp: new Date(),
      file: fileInfo,
    };

    onMessagesChange(prev => [...prev, userMessage]);
    const currentInput = inputValue;
    const currentFile = selectedFile;
    setInputValue('');
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
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
          onMessagesChange(prev => {
            const alreadyHasUser = prev.some(m => m.id === userMessage.id);
            return alreadyHasUser ? [...prev, aiMessage] : [...prev, userMessage, aiMessage];
          });
          // Auto-populate taskboard from the guided action plan
          guidedResponse.actionPlan.what_to_do_this_week.forEach(item => addAiTask(item, 'week'));
          toast.success('Guided workflow started');
          return;
        } catch (guidedError) {
          console.error('Guided workflow execution failed:', guidedError);
        }
      }

      const chatMessages: ChatMessage[] = messages.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.content,
      }));

      let messageContent = currentInput;
      if (currentFile) {
        messageContent += ` [File uploaded: ${currentFile.name} (${formatFileSize(currentFile.size)})]`;
      }
      chatMessages.push({ role: 'user', content: messageContent });

      const aiResponse = await GroqService.getChatResponse(chatMessages);

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: aiResponse,
        sender: 'ai',
        timestamp: new Date(),
      };

      onMessagesChange(prev => {
        const alreadyHasUser = prev.some(m => m.id === userMessage.id);
        return alreadyHasUser ? [...prev, aiMessage] : [...prev, userMessage, aiMessage];
      });
      // Auto-populate taskboard from any action items in the response
      extractActionItems(aiResponse).forEach(item => addAiTask(item, 'week'));
    } catch (error) {
      console.error('Chat error:', error);
      toast.error('Failed to get AI response. Please try again.');

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "Sorry, I'm having trouble connecting right now. Please try again in a moment.",
        sender: 'ai',
        timestamp: new Date(),
      };

      onMessagesChange(prev => {
        const alreadyHasUser = prev.some(m => m.id === userMessage.id);
        return alreadyHasUser ? [...prev, errorMessage] : [...prev, userMessage, errorMessage];
      });
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (showSuggestions && filteredCommands.length > 0) {
        setInputValue(filteredCommands[0].command);
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

  // -- File upload

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validTypes = [
      'text/csv', 'application/pdf',
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];

    if (!validTypes.includes(file.type)) {
      toast.error('Please upload a valid CSV, PDF, or image file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    setSelectedFile(file);
    toast.success(`${file.name} selected for upload`);

    if (
      file.type === 'text/csv' ||
      file.name.toLowerCase().endsWith('.csv') ||
      file.name.toLowerCase().endsWith('.xlsx') ||
      file.name.toLowerCase().endsWith('.xls')
    ) {
      setCSVFile(file);
      setShowCSVAnalysis(true);
    }
  };

  const removeSelectedFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // -- Render

  return (
    <>
      {gtmActive && (
        <GTMWizard onClose={() => setGtmActive(false)} />
      )}
      <div className={cn('flex flex-col h-full bg-white dark:bg-gray-900', gtmActive && 'hidden')}>
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">AI Assistant</h2>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewConversation}
              className="text-xs h-7"
            >
              New chat
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewConversation}
              className="text-xs h-7 text-gray-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Onboarding checklist */}
        <GettingStartedChecklist onNavigate={(id) => onModuleSelect?.(id)} />

        {/* Messages */}
        <ScrollArea className="flex-1 px-4 py-4">
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex items-start space-x-3',
                  message.sender === 'user' ? 'flex-row-reverse space-x-reverse' : 'justify-start'
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
                <Card
                  className={cn(
                    'p-3 max-w-[75%]',
                    message.sender === 'user' ? 'bg-orange-500 text-white' : 'bg-muted text-left'
                  )}
                >
                  {message.file && (
                    <div
                      className={cn(
                        'flex items-center space-x-2 p-2 rounded mb-2 border',
                        message.sender === 'user'
                          ? 'bg-orange-400 border-orange-300'
                          : 'bg-background border-border'
                      )}
                    >
                      {getFileIcon(message.file.type)}
                      <div className="flex-1 min-w-0">
                        <div
                          className={cn(
                            'text-xs font-medium truncate',
                            message.sender === 'user' ? 'text-orange-100' : 'text-foreground'
                          )}
                        >
                          {message.file.name}
                        </div>
                        <div
                          className={cn(
                            'text-xs opacity-70',
                            message.sender === 'user' ? 'text-orange-200' : 'text-muted-foreground'
                          )}
                        >
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
                  <FormattedMessage content={message.content} isAI={message.sender === 'ai'} />
                  <p
                    className={cn(
                      'text-xs mt-1 opacity-70',
                      message.sender === 'user' ? 'text-orange-100' : 'text-muted-foreground'
                    )}
                  >
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </Card>
              </div>
            ))}

            {/* Quick-action buttons — shown only on a fresh chat */}
            {messages.length === 1 && (
              <div className="mt-2 grid grid-cols-2 gap-2 px-1">
                <button
                  onClick={() => setGtmActive(true)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/20 hover:text-orange-700 transition-all duration-150 text-left"
                >
                  <span className="text-base leading-none">🗺️</span>
                  <span>Create GTM Strategy</span>
                </button>
                <button
                  onClick={() => setInputValue('/budget-optimization')}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/20 hover:text-orange-700 transition-all duration-150 text-left"
                >
                  <span className="text-base leading-none">💰</span>
                  <span>Budget Analysis</span>
                </button>
                <button
                  onClick={() => setInputValue('/ai-content')}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/20 hover:text-orange-700 transition-all duration-150 text-left"
                >
                  <span className="text-base leading-none">✍️</span>
                  <span>Content Calendar</span>
                </button>
                <button
                  onClick={() => setInputValue('/lead-intelligence')}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/20 hover:text-orange-700 transition-all duration-150 text-left"
                >
                  <span className="text-base leading-none">🎯</span>
                  <span>Lead Intelligence</span>
                </button>
              </div>
            )}

            {/* Typing indicator */}
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

        {/* Slash command suggestions */}
        {showSuggestions && filteredCommands.length > 0 && (
          <div className="mx-4 mb-2 border rounded-lg bg-background shadow-lg max-h-48 overflow-y-auto">
            {filteredCommands.map((cmd) => (
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

        {/* Input bar */}
        <div className="border-t px-4 py-3">
          {/* Selected file preview */}
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
                      src={filePreviewUrl ?? ''}
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

          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              className="flex-shrink-0 hover:bg-orange-50 hover:border-orange-200 bg-white border-gray-300 text-gray-700"
              title="Upload file (CSV, PDF, Images)"
            >
              <Paperclip className="h-4 w-4 text-gray-700" style={{ display: 'block' }} />
            </Button>

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
              onKeyDown={handleKeyPress}
              placeholder={selectedFile ? 'Add a message (optional)...' : 'Ask me anything or use /commands...'}
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
