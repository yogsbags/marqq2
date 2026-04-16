import { useState, useRef, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { AgentAvatar } from '@/components/agents/AgentAvatar';
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
  { command: '/agents',               description: 'Open the AI team',                               action: 'agents' },
  { command: '/workflows',            description: 'Open workflow builder',                          action: 'workflows' },
  { command: '/lead-intelligence',    description: 'Find and score leads, build your ICP',           action: 'lead-intelligence' },
  { command: '/voice-bot',            description: 'Run outbound voice campaigns',                   action: 'voice-bot' },
  { command: '/video-bot',            description: 'Create AI video and avatar content',             action: 'video-bot' },
  { command: '/user-engagement',      description: 'Map customer journeys and lifecycle flows',      action: 'user-engagement' },
  { command: '/budget-optimization',  description: 'Analyse and reallocate campaign spend',          action: 'budget-optimization' },
  { command: '/performance-scorecard',description: 'Check performance across channels',              action: 'performance-scorecard' },
  { command: '/ai-content',           description: 'Create content — blog, email, social, ads',      action: 'ai-content' },
  { command: '/customer-view',        description: 'See a unified view of your customers',           action: 'customer-view' },
  { command: '/seo-llmo',             description: 'Optimise for search and AI answer engines',      action: 'seo-llmo' },
  { command: '/company-intel',        description: 'Build strategy, ICPs, competitive snapshot',     action: 'company-intel' },
  { command: '/help',                 description: 'How to talk to me',                              action: 'help' },
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
          responseContent = `I've opened the AI team for you. Assign work there, or tell me what you want done and I'll route it to the right person.`;
          break;

        case 'workflows':
          responseContent = `I've opened the workflow builder. Use it to chain agents or build a multi-step automation. Let me know if you want help designing it.`;
          break;

        case 'lead-intelligence':
          responseContent = `I've opened Lead Intelligence. Add your data or question there. Tell me what you're trying to find and I can help shape it first.`;
          break;

        case 'voice-bot':
          responseContent = `I've opened Voice Campaigns. Set the brief there, or keep talking here if you want help figuring out the campaign first.`;
          break;

        case 'video-bot':
          responseContent = `I've opened the video workspace. Build the workflow there, or tell me more about what you want to create.`;
          break;

        case 'user-engagement':
          responseContent = `I've opened User Engagement. Configure the flow there, or let me know the goal and I'll help scope it.`;
          break;

        case 'budget-optimization':
          responseContent = `I've opened Budget Optimization. Add your question, timeframe, and campaign data there to run the analysis.`;
          break;

        case 'performance-scorecard':
          responseContent = `I've opened the Performance Scorecard. Use it to understand what's happening and decide where to act next.`;
          break;

        case 'ai-content':
          responseContent = `I've opened the content workspace. Choose your format and brief there, or keep chatting and I'll help you shape it first.`;
          break;

        case 'customer-view':
          responseContent = `I've opened the Customer View. Explore context and signals there, or tell me what you're looking for.`;
          break;

        case 'seo-llmo':
          responseContent = `I've opened SEO / LLMO. Use it for structured work, or describe what you want to improve and we can scope it together.`;
          break;

        case 'help':
          responseContent = `Just tell me what you're working on in plain language — I'll figure out where to take it.\n\nIf you want to jump straight to an area, type \`/\` and the name. Or use \`@name\` to send work directly to a specialist.\n\n**Specialists:** @maya (SEO), @arjun (leads), @riya (content), @zara (campaigns), @dev (performance), @priya (brand), @kiran (social), @sam (email)`;
          break;

        default:
          return false;
      }

      await new Promise(resolve => setTimeout(resolve, 250));

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: responseContent,
        sender: 'ai',
        timestamp: new Date(),
      };

      onMessagesChange([...messages, userMessage, aiMessage]);

      if (cmd.action !== 'help') {
        toast.success(`Opened ${cmd.command.slice(1)}`);
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
      content: "Hi, I'm Veena. What are you working on?",
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
            <AgentAvatar name="veena" size="sm" className="h-8 w-8 rounded-full" />
            <div>
              <h3 className="font-semibold">Veena</h3>
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
                    <AvatarFallback className="bg-transparent p-0">
                      <AgentAvatar name="veena" size="sm" className="h-8 w-8 rounded-full" />
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
              placeholder={selectedFile ? "Add a message (optional)..." : "What are you working on?"}
              className="flex-1"
              disabled={isTyping}
            />
            <Button
              onClick={() => handleSendMessage()}
              disabled={(!inputValue.trim() && !selectedFile) || isTyping}
              className="bg-orange-500 hover:bg-orange-600"
            >
              <Send className="h-4 w-4 text-white" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Plain language works best. Type `/` to jump somewhere or `@name` to reach a specialist.
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
