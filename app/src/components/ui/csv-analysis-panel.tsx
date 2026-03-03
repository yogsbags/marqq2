import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { X, FileSpreadsheet, MessageCircle, Send, Bot, User, BarChart3, AlertCircle, CheckCircle, Lightbulb, FileText } from 'lucide-react';
import { CSVAnalysisService } from '@/services/csvAnalysisService';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface CSVAnalysisPanelProps {
  file: File;
  onClose: () => void;
}

interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

export function CSVAnalysisPanel({ file, onClose }: CSVAnalysisPanelProps) {
  const [analysis, setAnalysis] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const [csvData, setCsvData] = useState<any[]>([]);

  useEffect(() => {
    analyzeCSV();
  }, [file]);

  const analyzeCSV = async () => {
    try {
      setIsAnalyzing(true);
      const result = await CSVAnalysisService.analyzeCSV(file);
      setAnalysis(result);
      setCsvData(result.sampleData);
      
      // Add welcome message
      const welcomeMessage: ChatMessage = {
        id: '1',
        content: `**CSV Analysis Complete!**\n\n${result.summary}\n\n**Key Insights:**\n${result.insights.map(insight => `• ${insight}`).join('\n')}\n\n**Ask me anything about your data!** Try questions like:\n• "How many rows are there?"\n• "What columns do we have?"\n• "Show me sample data"\n• "Any missing values?"`,
        sender: 'ai',
        timestamp: new Date(),
      };
      setChatMessages([welcomeMessage]);
      
      toast.success('CSV analysis completed successfully!');
    } catch (error) {
      console.error('CSV analysis error:', error);
      toast.error('Failed to analyze CSV file');
      
      const errorMessage: ChatMessage = {
        id: '1',
        content: 'Sorry, I had trouble analyzing your CSV file. Please make sure it\'s a valid CSV format and try again.',
        sender: 'ai',
        timestamp: new Date(),
      };
      setChatMessages([errorMessage]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleChatSubmit = async () => {
    if (!chatInput.trim() || isChatting) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      content: chatInput,
      sender: 'user',
      timestamp: new Date(),
    };

    setChatMessages(prev => [...prev, userMessage]);
    const currentInput = chatInput;
    setChatInput('');
    setIsChatting(true);

    try {
      const response = await CSVAnalysisService.queryChatData({
        question: currentInput,
        context: analysis?.summary || '',
        csvData: csvData
      });

      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: response,
        sender: 'ai',
        timestamp: new Date(),
      };

      setChatMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: 'Sorry, I had trouble processing your question. Please try again.',
        sender: 'ai',
        timestamp: new Date(),
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsChatting(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSubmit();
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-lg shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-t-lg">
          <div className="flex items-center space-x-3">
            {file.name.toLowerCase().endsWith('.csv') ? (
              <FileSpreadsheet className="h-6 w-6" />
            ) : (
              <FileText className="h-6 w-6" />
            )}
            <div>
              <h2 className="text-xl font-semibold">
                {file.name.toLowerCase().endsWith('.csv') ? 'CSV' : 'Excel'} Analysis & Chat
              </h2>
              <p className="text-blue-100 text-sm">{file.name} • {formatFileSize(file.size)}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-white hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Analysis Panel */}
          <div className="w-1/2 border-r flex flex-col">
            <div className="p-4 border-b">
              <h3 className="font-semibold flex items-center">
                <BarChart3 className="h-4 w-4 mr-2 text-blue-500" />
                Data Analysis
              </h3>
            </div>
            
            <ScrollArea className="flex-1 p-4">
              {isAnalyzing ? (
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                    <span>Analyzing your CSV data...</span>
                  </div>
                  <Progress value={75} className="w-full" />
                </div>
              ) : analysis ? (
                <div className="space-y-6">
                  {/* Summary */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Data Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{analysis.summary}</p>
                    </CardContent>
                  </Card>

                  {/* Key Metrics */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Key Metrics</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-3 bg-blue-50 rounded-lg">
                          <div className="text-2xl font-bold text-blue-600">{analysis.keyMetrics.totalRows.toLocaleString()}</div>
                          <div className="text-sm text-muted-foreground">Total Rows</div>
                        </div>
                        <div className="text-center p-3 bg-green-50 rounded-lg">
                          <div className="text-2xl font-bold text-green-600">{analysis.keyMetrics.totalColumns}</div>
                          <div className="text-sm text-muted-foreground">Columns</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Insights */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center">
                        <Lightbulb className="h-4 w-4 mr-2 text-yellow-500" />
                        AI Insights
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {analysis.insights.map((insight: string, index: number) => (
                          <div key={index} className="flex items-start space-x-2">
                            <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <span className="text-sm">{insight}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Recommendations */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center">
                        <AlertCircle className="h-4 w-4 mr-2 text-orange-500" />
                        Recommendations
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {analysis.recommendations.map((rec: string, index: number) => (
                          <div key={index} className="flex items-start space-x-2">
                            <div className="w-2 h-2 bg-orange-500 rounded-full mt-2 flex-shrink-0"></div>
                            <span className="text-sm">{rec}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Sample Data */}
                  {analysis.sampleData.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Sample Data</CardTitle>
                        <CardDescription>First 5 rows of your dataset</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse border border-gray-200">
                            <thead>
                              <tr className="bg-muted">
                                {Object.keys(analysis.sampleData[0]).map((header: string) => (
                                  <th key={header} className="border border-gray-200 p-2 text-left font-medium">
                                    {header}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {analysis.sampleData.map((row: any, index: number) => (
                                <tr key={index} className="hover:bg-muted/50">
                                  {Object.values(row).map((value: any, cellIndex: number) => (
                                    <td key={cellIndex} className="border border-gray-200 p-2">
                                      {String(value)}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                    <p className="text-muted-foreground">Failed to analyze CSV file</p>
                  </div>
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Chat Panel */}
          <div className="w-1/2 flex flex-col">
            <div className="p-4 border-b">
              <h3 className="font-semibold flex items-center">
                <MessageCircle className="h-4 w-4 mr-2 text-green-500" />
                Chat with Your Data
              </h3>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {chatMessages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex items-start space-x-3",
                      message.sender === 'user' ? "flex-row-reverse space-x-reverse" : ""
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center",
                      message.sender === 'ai' 
                        ? "bg-green-100 text-green-600" 
                        : "bg-blue-100 text-blue-600"
                    )}>
                      {message.sender === 'ai' ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                    </div>
                    <Card className={cn(
                      "max-w-[80%] p-3",
                      message.sender === 'user' 
                        ? "bg-blue-500 text-white" 
                        : "bg-muted"
                    )}>
                      <div className="text-sm whitespace-pre-wrap">
                        {message.sender === 'ai' ? (
                          <div dangerouslySetInnerHTML={{ 
                            __html: message.content
                              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                              .replace(/\n/g, '<br>')
                          }} />
                        ) : (
                          message.content
                        )}
                      </div>
                      <div className={cn(
                        "text-xs mt-1 opacity-70",
                        message.sender === 'user' ? "text-blue-100" : "text-muted-foreground"
                      )}>
                        {message.timestamp.toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </div>
                    </Card>
                  </div>
                ))}
                
                {/* Typing Indicator */}
                {isChatting && (
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                      <Bot className="h-4 w-4" />
                    </div>
                    <Card className="p-3 bg-muted">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                      </div>
                    </Card>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Chat Input */}
            <div className="p-4 border-t">
              <div className="flex space-x-2">
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask about your CSV data..."
                  disabled={isChatting || isAnalyzing}
                  className="flex-1"
                />
                <Button
                  onClick={handleChatSubmit}
                  disabled={!chatInput.trim() || isChatting || isAnalyzing}
                  className="bg-green-500 hover:bg-green-600"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Try asking: "How many rows?", "Show columns", "Any missing data?", "Sample data"
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}