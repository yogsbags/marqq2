"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  Check,
  CheckCircle2,
  Download,
  File,
  FileText,
  Globe,
  Lightbulb,
  Newspaper,
  Palette,
  Pencil,
  Rocket,
  Search,
  Sparkles,
  Target,
  XCircle,
  Zap,
} from "lucide-react";
import { EditModal } from "./EditModal";

type WorkflowStage = {
  id: number;
  name: string;
  status: "idle" | "running" | "completed" | "error";
  message: string;
};

type PublishedUrls = {
  wordpress?: string;
  uatWordpress?: string;
  frontend?: string;
  sanityDesk?: string;
};

type StageData = {
  data: any[];
  summary: {
    total: number;
    showing: number;
    approved: number;
  };
  file: string;
  googleSheetsUrl?: string;
};

export function EnhancedBulkGenerator() {
  const [isRunning, setIsRunning] = useState(false);
  const [stages, setStages] = useState<WorkflowStage[]>([
    { id: 1, name: "Stage 1: SEO Research", status: "idle", message: "" },
    { id: 2, name: "Stage 2: Topic Generation", status: "idle", message: "" },
    { id: 3, name: "Stage 3: Deep Research", status: "idle", message: "" },
    { id: 4, name: "Stage 4: Content Creation", status: "idle", message: "" },
    { id: 5, name: "Stage 5: Content Validation", status: "idle", message: "" },
    { id: 6, name: "Stage 6: SEO Optimization", status: "idle", message: "" },
    { id: 7, name: "Stage 7: Publication", status: "idle", message: "" },
    { id: 8, name: "Stage 8: Completion", status: "idle", message: "" },
  ]);
  const [logs, setLogs] = useState<string[]>([]);
  const [publishedUrls, setPublishedUrls] = useState<PublishedUrls>({});
  const [stageData, setStageData] = useState<Record<number, StageData>>({});
  const [expandedStage, setExpandedStage] = useState<number | null>(null);
  const [topicLimit, setTopicLimit] = useState<number>(1);
  const [executionMode, setExecutionMode] = useState<"full" | "staged">("full");
  const [executingStage, setExecutingStage] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] =
    useState<string>("derivatives");
  const [customTopic, setCustomTopic] = useState<string>("");
  const [customTitle, setCustomTitle] = useState<string>("");
  const [contentOutline, setContentOutline] = useState<string>("");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<{
    stageId: number;
    data: any;
    index: number;
  } | null>(null);

  // Comprehensive broking & wealth categories
  const categories = [
    { value: "derivatives", label: "Derivatives (F&O, Options, Futures)" },
    { value: "mutual_funds", label: "Mutual Funds & ETFs" },
    { value: "stock_market", label: "Stock Market & Equities" },
    { value: "commodities", label: "Commodities (Gold, Silver, Crude)" },
    { value: "forex", label: "Currency & Forex Trading" },
    { value: "bonds", label: "Bonds & Fixed Income" },
    { value: "ipo", label: "IPO & SME IPO" },
    { value: "tax_planning", label: "Tax Planning & Optimization" },
    { value: "retirement_planning", label: "Retirement & Pension Planning" },
    { value: "insurance", label: "Insurance & Risk Management" },
    {
      value: "trading_strategies",
      label: "Trading Strategies (Intraday, Swing)",
    },
    { value: "technical_analysis", label: "Technical Analysis" },
    { value: "fundamental_analysis", label: "Fundamental Analysis" },
    { value: "portfolio_management", label: "Portfolio Management (PMS)" },
    { value: "wealth_management", label: "Wealth Management (HNI/UHNI)" },
    { value: "real_estate", label: "Real Estate Investment" },
    {
      value: "alternative_investments",
      label: "Alternative Investments (REITs, AIFs)",
    },
    {
      value: "international_investing",
      label: "International Investing (US Stocks)",
    },
    { value: "demat_account", label: "Demat Account & Broker Comparison" },
    { value: "personal_finance", label: "Personal Finance & Budgeting" },
    { value: "estate_planning", label: "Estate Planning & Succession" },
    {
      value: "investment_strategies",
      label: "Investment Strategies & Asset Allocation",
    },
  ];

  const updateStage = async (
    stageId: number,
    status: WorkflowStage["status"],
    message: string,
  ) => {
    setStages((prev) =>
      prev.map((stage) =>
        stage.id === stageId ? { ...stage, status, message } : stage,
      ),
    );

    // Fetch CSV data when stage completes
    if (status === "completed") {
      try {
        const response = await fetch(`/api/workflow/data?stage=${stageId}`);
        if (response.ok) {
          const data = await response.json();
          setStageData((prev) => ({ ...prev, [stageId]: data }));
        }
      } catch (error) {
        console.error(`Failed to fetch data for stage ${stageId}:`, error);
      }
    }
  };

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);

    // Extract URLs from log messages
    if (message.includes("🔗 Local WordPress:")) {
      const url = message.split("🔗 Local WordPress:")[1]?.trim();
      if (url) setPublishedUrls((prev) => ({ ...prev, wordpress: url }));
    } else if (message.includes("🔗 UAT WordPress:")) {
      const url = message.split("🔗 UAT WordPress:")[1]?.trim();
      if (url) setPublishedUrls((prev) => ({ ...prev, uatWordpress: url }));
    } else if (message.includes("🔗 Frontend:")) {
      const url = message.split("🔗 Frontend:")[1]?.trim();
      if (url) setPublishedUrls((prev) => ({ ...prev, frontend: url }));
    } else if (message.includes("🔗 Sanity Desk:")) {
      const url = message.split("🔗 Sanity Desk:")[1]?.trim();
      if (url) setPublishedUrls((prev) => ({ ...prev, sanityDesk: url }));
    }
  };

  const approveAllForStage = async (
    stageIdToApprove: number,
    label: string,
  ) => {
    addLog(`Approving all ${label}...`);
    const resp = await fetch(
      `/api/workflow/approve-all?stageId=${stageIdToApprove}`,
    );
    if (!resp.ok) {
      let details = "";
      try {
        const err = await resp.json();
        details = (err as any)?.error || (err as any)?.details || "";
      } catch {
        // ignore
      }
      throw new Error(
        `Failed to approve ${label}${details ? `: ${details}` : ""}`,
      );
    }
    const result = (await resp.json()) as { approved: number };
    if (result.approved > 0) {
      addLog(`Approved ${result.approved} ${label}`);
    } else {
      addLog("All items already approved");
    }
  };

  const executeStage = async (stageId: number) => {
    setExecutingStage(stageId);
    addLog(`Starting Stage ${stageId} execution...`);

    try {
      // "Approve & Continue" should actually approve the prerequisite stage before running the next stage.
      // Stage 2 requires approved Stage 1 gaps; Stage 3 requires approved Stage 2 topics (unless custom title);
      // Stage 4 requires approved Stage 3 deep research.
      try {
        if (stageId === 2) {
          await approveAllForStage(1, "research gap(s) for topic generation");
          addLog("⏳ Waiting for CSV synchronization...");
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } else if (stageId === 3 && !customTitle) {
          await approveAllForStage(2, "topic(s) for deep research");
          addLog("⏳ Waiting for CSV synchronization...");
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } else if (stageId === 3 && customTitle) {
          addLog(
            "Custom title mode: Skipping topic approval (bypasses topic generation)",
          );
        } else if (stageId === 4) {
          await approveAllForStage(
            3,
            "deep research item(s) for content creation",
          );
          addLog("⏳ Waiting for CSV synchronization...");
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (approveError) {
        addLog(
          `Warning: Could not auto-approve: ${
            approveError instanceof Error
              ? approveError.message
              : "Unknown error"
          }`,
        );
        // Continue anyway - user might have manually approved
      }

      const response = await fetch("/api/workflow/stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stageId,
          topicLimit,
          category: selectedCategory,
          customTopic,
          customTitle,
          contentOutline,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.stage) {
                  await updateStage(data.stage, data.status, data.message);
                  addLog(`Stage ${data.stage}: ${data.message}`);
                } else if (data.log) {
                  addLog(data.log);
                }
              } catch (e) {
                console.error("Parse error:", e);
              }
            }
          }
        }
      }

      addLog(`Stage ${stageId} completed!`);
    } catch (error) {
      addLog(
        `Error in Stage ${stageId}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      console.error("Stage error:", error);
      toast.error(`Stage ${stageId} execution failed`);
    } finally {
      setExecutingStage(null);
    }
  };

  const executeWorkflow = async () => {
    setIsRunning(true);
    setLogs([]);
    setPublishedUrls({});
    setStageData({});
    setExpandedStage(null);

    // Reset all stages
    setStages(stages.map((s) => ({ ...s, status: "idle", message: "" })));

    try {
      addLog("Starting full workflow execution...");

      const response = await fetch("/api/workflow/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicLimit,
          category: selectedCategory,
          customTopic,
          customTitle,
          contentOutline,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.stage) {
                  updateStage(data.stage, data.status, data.message);
                  addLog(`Stage ${data.stage}: ${data.message}`);
                } else if (data.log) {
                  addLog(data.log);
                }
              } catch (e) {
                console.error("Parse error:", e);
              }
            }
          }
        }
      }

      addLog("Workflow completed successfully!");
      toast.success("Workflow completed successfully!");
    } catch (error) {
      addLog(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      console.error("Workflow error:", error);
      toast.error("Workflow execution failed");
    } finally {
      setIsRunning(false);
    }
  };

  const getStatusIcon = (status: WorkflowStage["status"]) => {
    switch (status) {
      case "idle":
        return <span className="inline-block h-5 w-5 rounded-full border-2 border-border" />;
      case "running":
        return <span className="inline-block w-5 h-5 rounded-full bg-blue-500 dark:bg-blue-400" />;
      case "completed":
        return <CheckCircle2 className="w-5 h-5" />;
      case "error":
        return <XCircle className="w-5 h-5" />;
    }
  };

  const getStatusColor = (status: WorkflowStage["status"]) => {
    switch (status) {
      case "idle":
        return "text-muted-foreground";
      case "running":
        return "text-blue-500 dark:text-blue-400 animate-pulse";
      case "completed":
        return "text-green-500 dark:text-green-400";
      case "error":
        return "text-red-500 dark:text-red-400";
    }
  };

  const handleEditRow = (stageId: number, rowData: any, rowIndex: number) => {
    setEditingRow({ stageId, data: rowData, index: rowIndex });
    setEditModalOpen(true);
  };

  const handleEditSubmit = async (editedData: Record<string, any>) => {
    if (!editingRow) return;

    try {
      addLog(
        `Submitting edited data for ${stages[editingRow.stageId - 1].name}...`,
      );

      const response = await fetch("/api/workflow/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stageId: editingRow.stageId,
          rowIndex: editingRow.index,
          data: editedData,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      // Refresh stage data
      const dataResponse = await fetch(
        `/api/workflow/data?stage=${editingRow.stageId}`,
      );
      if (dataResponse.ok) {
        const data = await dataResponse.json();
        setStageData((prev) => ({ ...prev, [editingRow.stageId]: data }));
      }

      addLog(
        `Successfully updated ${stages[editingRow.stageId - 1].name} data`,
      );

      if (result.message) {
        addLog(`   ${result.message}`);
      }
    } catch (error) {
      addLog(
        `Failed to update data: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      throw error;
    }
  };

  const isContentStage = (stageId: number) => {
    return stageId === 4 || stageId === 5;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 px-8 pb-8 pt-2">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 space-y-2 text-center">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">
            SEO/LLMO
          </h1>
          <p className="text-sm text-muted-foreground">
            Build, optimize, and automate SEO and LLMO content workflows in one place.
          </p>
        </div>

        {/* Main Control */}
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-8 mb-8">
          <h2 className="text-2xl font-semibold text-foreground mb-4">
            Workflow Control
          </h2>

          {/* Execution Mode Toggle */}
          <div className="mb-6 rounded-lg border-2 border-border bg-muted/50 p-4">
            <label className="mb-3 block text-sm font-medium text-foreground">
              Execution Mode:
            </label>
            <div className="flex gap-4">
              <button
                onClick={() => setExecutionMode("full")}
                disabled={isRunning || executingStage !== null}
                className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-all ${
                  executionMode === "full"
                    ? "bg-orange-500 text-white shadow-md"
                    : "bg-card border-2 border-border text-foreground hover:border-orange-300 dark:hover:border-orange-500"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Zap className="w-4 h-4" />
                  <span>Full Workflow</span>
                </div>
                <p className="text-xs mt-1 opacity-80">
                  Execute all 8 stages automatically
                </p>
              </button>
              <button
                onClick={() => setExecutionMode("staged")}
                disabled={isRunning || executingStage !== null}
                className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-all ${
                  executionMode === "staged"
                    ? "bg-purple-500 text-white shadow-md"
                    : "bg-card border-2 border-border text-foreground hover:border-purple-300 dark:hover:border-purple-500"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Target className="w-4 h-4" />
                  <span>Stage-by-Stage</span>
                </div>
                <p className="text-xs mt-1 opacity-80">
                  Review output and approve each stage
                </p>
              </button>
            </div>
          </div>

          {/* Controls Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Category Selection */}
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Content Category:
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                disabled={isRunning || executingStage !== null}
                className="w-full rounded-lg border-2 border-border bg-background px-4 py-2 font-medium text-foreground transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-900 disabled:cursor-not-allowed disabled:bg-muted"
              >
                {categories.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Focus research on specific category
              </p>
            </div>

            {/* Custom Topic Input */}
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Custom Topic (Optional):
              </label>
              <input
                type="text"
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                disabled={isRunning || executingStage !== null}
                placeholder="e.g., wealth maximization"
                className="w-full rounded-lg border-2 border-border bg-background px-4 py-2 font-medium text-foreground transition-colors placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-900 disabled:cursor-not-allowed disabled:bg-muted"
              />
              <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
                <Sparkles className="w-3 h-3 mt-0.5 flex-shrink-0" />
                Stage 1 will research this custom topic instead of category
                (overrides category)
              </p>
            </div>
          </div>

          {/* Custom Title Row */}
          <div className="grid grid-cols-1 gap-6 mb-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Custom Title (Optional):
              </label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                disabled={isRunning || executingStage !== null}
                placeholder="e.g., Best Options Strategies for Beginners in 2025"
                className="w-full rounded-lg border-2 border-border bg-background px-4 py-2 font-medium text-foreground transition-colors placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-900 disabled:cursor-not-allowed disabled:bg-muted"
              />
              <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
                <Rocket className="w-3 h-3 mt-0.5 flex-shrink-0" />
                Bypass Stages 1-2 - Jump straight to deep research & content
                creation (Stage 3+)
              </p>
            </div>
          </div>

          {/* Content Outline Row */}
          <div className="grid grid-cols-1 gap-6 mb-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Content Outline (Optional):
              </label>
              <textarea
                value={contentOutline}
                onChange={(e) => setContentOutline(e.target.value)}
                disabled={isRunning || executingStage !== null}
                placeholder={`## Introduction
Brief overview of derivatives trading

## What are Derivatives?
### Types of Derivatives
- Futures
- Options

## How to Trade Derivatives
Step-by-step guide

## Risk Management
Important considerations

## Conclusion
Key takeaways`}
                rows={12}
                className="w-full resize-y rounded-lg border-2 border-border bg-background px-4 py-2 font-mono text-sm text-foreground transition-colors placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-900 disabled:cursor-not-allowed disabled:bg-muted"
              />
              <div className="flex items-start gap-2 mt-2">
                <div className="flex-1">
                  <p className="flex items-start gap-1 text-xs text-muted-foreground">
                    <FileText className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    Provide a custom content structure. AI will follow this
                    exact outline when generating the article.
                  </p>
                  <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground/80">
                    <Lightbulb className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    Supports markdown headers (##, ###), bullet points, and
                    plain text. Newlines are preserved as-is.
                  </p>
                </div>
                <div className="flex-shrink-0 whitespace-nowrap rounded border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  {contentOutline.split("\n").length} lines •{" "}
                  {contentOutline.length.toLocaleString()} chars
                </div>
              </div>
            </div>
          </div>

          {/* Topic Limit Control Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Topic Limit:
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTopicLimit(Math.max(1, topicLimit - 1))}
                  disabled={
                    isRunning || executingStage !== null || topicLimit <= 1
                  }
                  className="h-8 w-8 rounded border border-border bg-muted text-foreground transition-colors hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  −
                </button>
                <input
                  type="number"
                  value={topicLimit}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 1;
                    setTopicLimit(Math.min(50, Math.max(1, val)));
                  }}
                  disabled={isRunning || executingStage !== null}
                  min="1"
                  max="50"
                  className="w-20 rounded-lg border-2 border-border bg-background px-2 py-2 text-center font-semibold text-foreground focus:border-blue-500 focus:outline-none disabled:bg-muted"
                />
                <button
                  onClick={() => setTopicLimit(Math.min(50, topicLimit + 1))}
                  disabled={
                    isRunning || executingStage !== null || topicLimit >= 50
                  }
                  className="h-8 w-8 rounded border border-border bg-muted text-foreground transition-colors hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  +
                </button>
                <span className="ml-2 text-xs text-muted-foreground">
                  (1-50 topics)
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Number of topics to generate
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between mb-6">
            <div></div>

            {/* Full Workflow Button (only shown in full mode) */}
            {executionMode === "full" && (
              <button
                onClick={executeWorkflow}
                disabled={isRunning || executingStage !== null}
                className={`px-8 py-4 rounded-lg font-semibold text-lg transition-all transform hover:scale-105 ${
                  isRunning || executingStage !== null
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-lg hover:shadow-xl"
                }`}
              >
                {isRunning ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Running...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Rocket className="w-5 h-5" />
                    Execute Full Workflow
                  </span>
                )}
              </button>
            )}

            {/* Staged Mode Info */}
            {executionMode === "staged" && (
              <div className="rounded-lg border-2 border-purple-200 bg-purple-50 px-4 py-3 text-sm dark:border-purple-800/70 dark:bg-purple-950/20">
                <p className="font-semibold text-purple-700 dark:text-purple-400">
                  Stage-by-Stage Mode Active
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Execute and review each stage individually below
                </p>
              </div>
            )}
          </div>

          {/* Workflow Stages */}
          <div className="space-y-3">
            {stages.map((stage) => (
              <div
                key={stage.id}
                className={`rounded-lg border-2 transition-all ${
                  stage.status === "running"
                    ? "border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30"
                    : stage.status === "completed"
                      ? "border-green-300 dark:border-green-600 bg-green-50 dark:bg-green-900/30"
                      : stage.status === "error"
                        ? "border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/30"
                        : "border-border bg-muted/30"
                }`}
              >
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <span
                        className={`text-2xl ${getStatusColor(stage.status)}`}
                      >
                        {getStatusIcon(stage.status)}
                      </span>
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground">
                          {stage.name}
                        </h3>
                        {stage.message && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {stage.message}
                          </p>
                        )}
                        {stageData[stage.id]?.summary && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <BarChart3 className="w-3 h-3 flex-shrink-0" />
                            {stageData[stage.id].summary.total} items •{" "}
                            {stageData[stage.id].summary.approved} approved
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {stage.status === "running" && (
                        <div className="flex gap-1">
                          <div
                            className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                            style={{ animationDelay: "0ms" }}
                          />
                          <div
                            className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                            style={{ animationDelay: "150ms" }}
                          />
                          <div
                            className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                            style={{ animationDelay: "300ms" }}
                          />
                        </div>
                      )}

                      {/* Google Sheets Button */}
                      {stageData[stage.id]?.googleSheetsUrl &&
                        stage.status === "completed" && (
                          <a
                            href={stageData[stage.id].googleSheetsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-1"
                            title="View in Google Sheets"
                          >
                            <BarChart3 className="w-3 h-3" /> Google Sheets
                          </a>
                        )}

                      {/* View Data Button */}
                      {stageData[stage.id]?.data &&
                        stage.status === "completed" && (
                          <button
                            onClick={() =>
                              setExpandedStage(
                                expandedStage === stage.id ? null : stage.id,
                              )
                            }
                            className="text-sm px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                          >
                            {expandedStage === stage.id
                              ? "▲ Hide Data"
                              : "▼ View Data"}
                          </button>
                        )}

                      {/* Stage Execution Button (only in staged mode) */}
                      {executionMode === "staged" && (
                        <>
                          {stage.id === 1 ? (
                            <button
                              onClick={() => executeStage(stage.id)}
                              disabled={
                                executingStage !== null ||
                                isRunning ||
                                stage.status === "completed"
                              }
                              className={`text-sm px-4 py-2 rounded-lg font-semibold transition-all ${
                                executingStage === stage.id
                                  ? "bg-purple-400 dark:bg-purple-600 text-white cursor-wait"
                                  : stage.status === "completed"
                                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                                    : "bg-purple-500 dark:bg-purple-600 text-white hover:bg-purple-600 dark:hover:bg-purple-700 shadow-md hover:shadow-lg"
                              }`}
                            >
                              {executingStage === stage.id ? (
                                <span className="flex items-center gap-2">
                                  <svg
                                    className="animate-spin h-4 w-4"
                                    viewBox="0 0 24 24"
                                  >
                                    <circle
                                      className="opacity-25"
                                      cx="12"
                                      cy="12"
                                      r="10"
                                      stroke="currentColor"
                                      strokeWidth="4"
                                      fill="none"
                                    />
                                    <path
                                      className="opacity-75"
                                      fill="currentColor"
                                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    />
                                  </svg>
                                  Executing...
                                </span>
                              ) : stage.status === "completed" ? (
                                <span className="flex items-center gap-1"><Check className="inline h-3 w-3" /> Completed</span>
                              ) : (
                                "▶ Execute Stage"
                              )}
                            </button>
                          ) : (
                            <button
                              onClick={() => executeStage(stage.id)}
                              disabled={
                                executingStage !== null ||
                                isRunning ||
                                stage.status === "completed" ||
                                stages[stage.id - 2]?.status !== "completed"
                              }
                              className={`text-sm px-4 py-2 rounded-lg font-semibold transition-all ${
                                executingStage === stage.id
                                  ? "bg-purple-400 dark:bg-purple-600 text-white cursor-wait"
                                  : stage.status === "completed"
                                      ? "bg-muted text-muted-foreground cursor-not-allowed"
                                      : stages[stage.id - 2]?.status !==
                                        "completed"
                                      ? "bg-muted text-muted-foreground cursor-not-allowed"
                                      : "bg-purple-500 dark:bg-purple-600 text-white hover:bg-purple-600 dark:hover:bg-purple-700 shadow-md hover:shadow-lg"
                              }`}
                            >
                              {executingStage === stage.id ? (
                                <span className="flex items-center gap-2">
                                  <svg
                                    className="animate-spin h-4 w-4"
                                    viewBox="0 0 24 24"
                                  >
                                    <circle
                                      className="opacity-25"
                                      cx="12"
                                      cy="12"
                                      r="10"
                                      stroke="currentColor"
                                      strokeWidth="4"
                                      fill="none"
                                    />
                                    <path
                                      className="opacity-75"
                                      fill="currentColor"
                                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    />
                                  </svg>
                                  Executing...
                                </span>
                              ) : stage.status === "completed" ? (
                                <span className="flex items-center gap-1"><Check className="inline h-3 w-3" /> Completed</span>
                              ) : stages[stage.id - 2]?.status !==
                                "completed" ? (
                                "⏸ Waiting"
                              ) : (
                                <span className="flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Approve & Continue
                                </span>
                              )}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expandable CSV Data */}
                {expandedStage === stage.id &&
                  stageData[stage.id]?.data &&
                  stageData[stage.id]?.summary && (
                    <div className="border-t-2 border-green-200 bg-background p-4 dark:border-green-800/70">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <h4 className="flex items-center gap-1 font-semibold text-foreground">
                            <File className="w-4 h-4 flex-shrink-0" />
                            {stageData[stage.id].file} (Showing last{" "}
                            {stageData[stage.id].summary.showing} of{" "}
                            {stageData[stage.id].summary.total})
                          </h4>
                          <button
                            onClick={async () => {
                              try {
                                const response = await fetch(
                                  `/api/workflow/download-csv?filename=${encodeURIComponent(stageData[stage.id].file)}`,
                                );
                                if (!response.ok) {
                                  const error = await response.json();
                                  alert(`Download failed: ${error.error}`);
                                  return;
                                }
                                const blob = await response.blob();
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement("a");
                                a.href = url;
                                a.download = stageData[stage.id].file;
                                document.body.appendChild(a);
                                a.click();
                                window.URL.revokeObjectURL(url);
                                document.body.removeChild(a);
                              } catch (error) {
                                alert(
                                  "Download failed: " +
                                    (error instanceof Error
                                      ? error.message
                                      : "Unknown error"),
                                );
                              }
                            }}
                            className="text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" /> Download CSV
                          </button>

                          {/* Download Markdown Button */}
                          {(stage.id === 4 || stage.id === 5) &&
                            stageData[stage.id].data.some(
                              (row: any) =>
                                row.content_id && row.article_content,
                            ) && (
                              <button
                                onClick={async () => {
                                  try {
                                    const contentRows = stageData[
                                      stage.id
                                    ].data.filter(
                                      (row: any) =>
                                        row.content_id && row.article_content,
                                    );
                                    if (contentRows.length === 0) {
                                      alert("No content ID found");
                                      return;
                                    }
                                    const contentRow =
                                      contentRows[contentRows.length - 1];
                                    if (!contentRow || !contentRow.content_id) {
                                      alert("No content ID found");
                                      return;
                                    }
                                    const response = await fetch(
                                      `/api/workflow/download-markdown?contentId=${encodeURIComponent(contentRow.content_id)}`,
                                    );
                                    if (!response.ok) {
                                      const contentType =
                                        response.headers.get("content-type") ||
                                        "";
                                      const error = contentType.includes(
                                        "application/json",
                                      )
                                        ? await response.json()
                                        : { error: await response.text() };
                                      alert(
                                        `Download failed: ${error.error || error.message || "Unknown error"}`,
                                      );
                                      return;
                                    }
                                    const blob = await response.blob();
                                    const url =
                                      window.URL.createObjectURL(blob);
                                    const a = document.createElement("a");
                                    a.href = url;
                                    a.download =
                                      response.headers
                                        .get("Content-Disposition")
                                        ?.split("filename=")[1]
                                        ?.replace(/"/g, "") || "article.md";
                                    document.body.appendChild(a);
                                    a.click();
                                    window.URL.revokeObjectURL(url);
                                    document.body.removeChild(a);
                                    addLog(`Downloaded Markdown`);
                                  } catch (error) {
                                    alert(
                                      "Markdown download failed: " +
                                        (error instanceof Error
                                          ? error.message
                                          : "Unknown error"),
                                    );
                                  }
                                }}
                                className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-1"
                              >
                                <FileText className="w-3 h-3" /> Download Markdown
                              </button>
                            )}

                          {/* Download HTML Button */}
                          {(stage.id === 4 || stage.id === 5) &&
                            stageData[stage.id].data.some(
                              (row: any) =>
                                row.content_id && row.article_content,
                            ) && (
                              <button
                                onClick={async () => {
                                  try {
                                    const contentRows = stageData[
                                      stage.id
                                    ].data.filter(
                                      (row: any) =>
                                        row.content_id && row.article_content,
                                    );
                                    if (contentRows.length === 0) {
                                      alert("No content ID found");
                                      return;
                                    }
                                    const contentRow =
                                      contentRows[contentRows.length - 1];
                                    if (!contentRow || !contentRow.content_id) {
                                      alert("No content ID found");
                                      return;
                                    }
                                    const response = await fetch(
                                      `/api/workflow/download-html?contentId=${encodeURIComponent(contentRow.content_id)}`,
                                    );
                                    if (!response.ok) {
                                      const contentType =
                                        response.headers.get("content-type") ||
                                        "";
                                      const error = contentType.includes(
                                        "application/json",
                                      )
                                        ? await response.json()
                                        : { error: await response.text() };
                                      alert(
                                        `Download failed: ${error.error || error.message || "Unknown error"}`,
                                      );
                                      return;
                                    }
                                    const blob = await response.blob();
                                    const url =
                                      window.URL.createObjectURL(blob);
                                    const a = document.createElement("a");
                                    a.href = url;
                                    a.download =
                                      response.headers
                                        .get("Content-Disposition")
                                        ?.split("filename=")[1]
                                        ?.replace(/"/g, "") || "article.html";
                                    document.body.appendChild(a);
                                    a.click();
                                    window.URL.revokeObjectURL(url);
                                    document.body.removeChild(a);
                                    addLog(`Downloaded HTML`);
                                  } catch (error) {
                                    alert(
                                      "HTML download failed: " +
                                        (error instanceof Error
                                          ? error.message
                                          : "Unknown error"),
                                    );
                                  }
                                }}
                                className="text-xs px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors flex items-center gap-1"
                              >
                                <File className="w-3 h-3" /> Download HTML
                              </button>
                            )}

                          {/* Download Raw Content Button */}
                          {(stage.id === 4 || stage.id === 5) &&
                            stageData[stage.id].data.some(
                              (row: any) =>
                                row.content_id && row.article_content,
                            ) && (
                              <button
                                onClick={async () => {
                                  try {
                                    const contentRows = stageData[
                                      stage.id
                                    ].data.filter(
                                      (row: any) =>
                                        row.content_id && row.article_content,
                                    );
                                    if (contentRows.length === 0) {
                                      alert("No content ID found");
                                      return;
                                    }
                                    const contentRow =
                                      contentRows[contentRows.length - 1];
                                    if (!contentRow || !contentRow.content_id) {
                                      alert("No content ID found");
                                      return;
                                    }
                                    const response = await fetch(
                                      `/api/workflow/download-raw-markdown?contentId=${encodeURIComponent(contentRow.content_id)}`,
                                    );
                                    if (!response.ok) {
                                      const contentType =
                                        response.headers.get("content-type") ||
                                        "";
                                      const error = contentType.includes(
                                        "application/json",
                                      )
                                        ? await response.json()
                                        : { error: await response.text() };
                                      alert(
                                        `Download failed: ${error.error || error.message || "Unknown error"}`,
                                      );
                                      return;
                                    }
                                    const blob = await response.blob();
                                    const url =
                                      window.URL.createObjectURL(blob);
                                    const a = document.createElement("a");
                                    a.href = url;
                                    a.download =
                                      response.headers
                                        .get("Content-Disposition")
                                        ?.split("filename=")[1]
                                        ?.replace(/"/g, "") || "article-raw.md";
                                    document.body.appendChild(a);
                                    a.click();
                                    window.URL.revokeObjectURL(url);
                                    document.body.removeChild(a);
                                    addLog(`Downloaded Raw Content`);
                                  } catch (error) {
                                    alert(
                                      "Raw content download failed: " +
                                        (error instanceof Error
                                          ? error.message
                                          : "Unknown error"),
                                    );
                                  }
                                }}
                                className="text-xs px-3 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors flex items-center gap-1"
                              >
                                <Search className="w-3 h-3" /> Download Raw Content
                              </button>
                            )}
                        </div>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <CheckCircle2 className="w-3 h-3 text-green-500" />
                          {stageData[stage.id].summary.approved} approved
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <div className="max-h-96 overflow-y-auto">
                          {stageData[stage.id].data.map(
                            (row: any, idx: number) => (
                              <div
                                key={idx}
                                className="relative mb-3 rounded border border-border bg-muted/40 p-3 text-xs"
                              >
                                {/* Edit Button */}
                                <button
                                  onClick={() =>
                                    handleEditRow(stage.id, row, idx)
                                  }
                                  className="absolute top-2 right-2 px-3 py-1 bg-amber-500 dark:bg-amber-600 text-white rounded hover:bg-amber-600 dark:hover:bg-amber-700 transition-colors flex items-center gap-1 text-xs font-semibold shadow-md hover:shadow-lg"
                                  title="Edit this row"
                                >
                                  <svg
                                    className="w-3 h-3"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                    />
                                  </svg>
                                  Edit
                                </button>

                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pr-16">
                                  {Object.entries(row)
                                    .slice(0, 6)
                                    .map(([key, value]) => (
                                      <div key={key} className="break-words">
                                        <span className="font-semibold text-muted-foreground">
                                          {key}:
                                        </span>
                                        <span className="ml-1 text-foreground">
                                          {typeof value === "string" &&
                                          value.length > 100
                                            ? value.substring(0, 100) + "..."
                                            : String(value)}
                                        </span>
                                      </div>
                                    ))}
                                </div>
                                {Object.keys(row).length > 6 && (
                                  <details className="mt-2">
                                      <summary className="cursor-pointer text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
                                      Show {Object.keys(row).length - 6} more
                                      fields...
                                    </summary>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                                      {Object.entries(row)
                                        .slice(6)
                                        .map(([key, value]) => (
                                          <div
                                            key={key}
                                            className="break-words"
                                          >
                                            <span className="font-semibold text-muted-foreground">
                                              {key}:
                                            </span>
                                            <span className="ml-1 text-foreground">
                                              {typeof value === "string" &&
                                              value.length > 100
                                                ? value.substring(0, 100) +
                                                  "..."
                                                : String(value)}
                                            </span>
                                          </div>
                                        ))}
                                    </div>
                                  </details>
                                )}
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    </div>
                  )}
              </div>
            ))}
          </div>
        </div>

        {/* Published URLs Section */}
        {Object.keys(publishedUrls).length > 0 && (
          <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-8 mb-8">
            <h2 className="mb-4 flex items-center gap-2 text-2xl font-semibold text-foreground">
              <Newspaper className="w-6 h-6" /> Published Content URLs
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {publishedUrls.wordpress && (
                <div className="p-4 rounded-lg border-2 border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="flex items-center gap-2 font-semibold text-foreground">
                      <Globe className="w-4 h-4" /> Local WordPress
                    </h3>
                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(publishedUrls.wordpress!)
                      }
                      className="text-xs px-2 py-1 bg-blue-600 dark:bg-blue-700 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                  <a
                    href={publishedUrls.wordpress}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline break-all"
                  >
                    {publishedUrls.wordpress}
                  </a>
                </div>
              )}

              {publishedUrls.uatWordpress && (
                <div className="p-4 rounded-lg border-2 border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/30">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="flex items-center gap-2 font-semibold text-foreground">
                      <Rocket className="w-4 h-4" /> UAT WordPress
                    </h3>
                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(
                          publishedUrls.uatWordpress!,
                        )
                      }
                      className="text-xs px-2 py-1 bg-purple-600 dark:bg-purple-700 text-white rounded hover:bg-purple-700 dark:hover:bg-purple-800 transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                  <a
                    href={publishedUrls.uatWordpress}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 hover:underline break-all"
                  >
                    {publishedUrls.uatWordpress}
                  </a>
                </div>
              )}

              {publishedUrls.frontend && (
                <div className="p-4 rounded-lg border-2 border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/30">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="flex items-center gap-2 font-semibold text-foreground">
                      <Palette className="w-4 h-4" /> Next.js Frontend
                    </h3>
                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(publishedUrls.frontend!)
                      }
                      className="text-xs px-2 py-1 bg-green-600 dark:bg-green-700 text-white rounded hover:bg-green-700 dark:hover:bg-green-800 transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                  <a
                    href={publishedUrls.frontend}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 hover:underline break-all"
                  >
                    {publishedUrls.frontend}
                  </a>
                </div>
              )}

              {publishedUrls.sanityDesk && (
                <div className="p-4 rounded-lg border-2 border-orange-200 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/30">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="flex items-center gap-2 font-semibold text-foreground">
                      <Pencil className="w-4 h-4" /> Sanity Desk
                    </h3>
                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(publishedUrls.sanityDesk!)
                      }
                      className="text-xs px-2 py-1 bg-orange-600 dark:bg-orange-700 text-white rounded hover:bg-orange-700 dark:hover:bg-orange-800 transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                  <a
                    href={publishedUrls.sanityDesk}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-300 hover:underline break-all"
                  >
                    {publishedUrls.sanityDesk}
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Live Logs */}
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-8">
          <h2 className="mb-4 text-2xl font-semibold text-foreground">
            Live Logs
          </h2>
          <div className="h-96 overflow-y-auto rounded-lg bg-slate-950 p-4 font-mono text-sm text-green-400">
            {logs.length === 0 ? (
              <p className="italic text-slate-400">
                Waiting for workflow execution...
              </p>
            ) : (
              logs.map((log, index) => (
                <div
                  key={index}
                  className="mb-1 text-green-400"
                >
                  {log}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-muted-foreground">
          <p className="text-sm">
            Enhanced Bulk Generator • Port 3007 •
            <span className="ml-2">
              WordPress: 8080 | Sanity: 3333 | Next.js: 3001
            </span>
          </p>
        </div>
      </div>

      {/* Edit Modal */}
      {editingRow && (
        <EditModal
          isOpen={editModalOpen}
          onClose={() => {
            setEditModalOpen(false);
            setEditingRow(null);
          }}
          data={editingRow.data}
          stageId={editingRow.stageId}
          stageName={
            stages[editingRow.stageId - 1]?.name ||
            `Stage ${editingRow.stageId}`
          }
          onSubmit={handleEditSubmit}
          isContentStage={isContentStage(editingRow.stageId)}
        />
      )}
    </div>
  );
}
