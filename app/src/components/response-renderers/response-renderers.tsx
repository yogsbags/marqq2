/**
 * Response Renderers - UI components for different artifact types
 *
 * Each renderer handles a specific response_type:
 * - AnalysisRenderer: Metrics dashboard
 * - CreationRenderer: Content artifact with preview
 * - OptimizationRenderer: Before/after comparison
 * - ExecutionRenderer: Live campaign tracker
 * - DiscoveryRenderer: Result list with filters
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Download, Copy, Check } from 'lucide-react';

// ── ANALYSIS Renderer ──────────────────────────────────────────────────────

export function AnalysisRenderer({ artifact }: { artifact: any }) {
  if (!artifact || artifact.type !== 'analysis') {
    return <div className="text-red-600">Invalid analysis artifact</div>;
  }

  const { metrics = {}, findings = [], insights = [], trend, comparisons = [] } = artifact;

  return (
    <div className="space-y-4 mt-4">
      {/* Metrics Grid */}
      {Object.keys(metrics).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(metrics).slice(0, 8).map(([key, value]) => (
            <MetricCard
              key={key}
              label={key}
              value={value}
            />
          ))}
        </div>
      )}

      {/* Trend */}
      {trend && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <span className={trend.direction === 'up' ? '📈' : trend.direction === 'down' ? '📉' : '➡️'}>
            </span>
            <span className="text-sm text-gray-700">
              <span className="font-semibold">{Math.abs(trend.percentChange)}%</span> {trend.direction === 'up' ? 'increase' : trend.direction === 'down' ? 'decrease' : 'change'} ({trend.period})
            </span>
          </div>
        </div>
      )}

      {/* Findings */}
      {findings.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-semibold text-gray-900 text-sm">Key Findings</h4>
          <ul className="space-y-2">
            {findings.map((finding, idx) => (
              <li key={idx} className="flex gap-2 text-sm text-gray-700">
                <span className="text-blue-600 font-bold">•</span>
                <span>{finding}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Insights */}
      {insights.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
          <h4 className="font-semibold text-amber-900 text-sm">💡 Insights</h4>
          <ul className="space-y-2">
            {insights.map((insight, idx) => (
              <li key={idx} className="text-sm text-amber-900">{insight}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Comparisons */}
      {comparisons.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-semibold text-gray-900 text-sm">Comparisons</h4>
          <div className="space-y-2">
            {comparisons.map((comp, idx) => (
              <div key={idx} className="flex justify-between items-center text-sm">
                <span className="text-gray-700">{comp.name}</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{comp.value}</span>
                  {comp.percentile && (
                    <span className="text-xs text-gray-500">({comp.percentile}th percentile)</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── CREATION Renderer ──────────────────────────────────────────────────────

export function CreationRenderer({ artifact }: { artifact: any }) {
  const [activeTab, setActiveTab] = useState('preview');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!artifact || artifact.type !== 'content') {
    return <div className="text-red-600">Invalid creation artifact</div>;
  }

  const { title, sections = [], emails = [], content, format, wordCount, seoScore, variations = [] } = artifact;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-4 mt-4">
      {/* Header */}
      {title && (
        <div className="border-b pb-3">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <div className="flex gap-4 mt-2 text-xs text-gray-600">
            {wordCount && <span>📝 {wordCount} words</span>}
            {seoScore && <span>🔍 SEO: {seoScore}/100</span>}
            {format && <span>📋 {format}</span>}
          </div>
        </div>
      )}

      {/* Tabs */}
      {(sections.length > 0 || emails.length > 0 || variations.length > 0) && (
        <div className="flex gap-2 border-b">
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-4 py-2 text-sm font-medium transition ${
              activeTab === 'preview'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Preview
          </button>
          {variations.length > 0 && (
            <button
              onClick={() => setActiveTab('variations')}
              className={`px-4 py-2 text-sm font-medium transition ${
                activeTab === 'variations'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Variations ({variations.length})
            </button>
          )}
        </div>
      )}

      {/* Content Preview */}
      {activeTab === 'preview' && (
        <div className="space-y-3">
          {/* Sections */}
          {sections.length > 0 && (
            <div className="space-y-4">
              {sections.map((section, idx) => (
                <div key={idx} className="border rounded-lg p-4 bg-white">
                  {section.title && (
                    <h4 className="font-bold text-gray-900 mb-2">{section.title}</h4>
                  )}
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{section.content}</p>
                  <button
                    onClick={() => handleCopy(section.content, `section-${idx}`)}
                    className="mt-2 text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    {copiedId === `section-${idx}` ? (
                      <>
                        <Check size={14} /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={14} /> Copy
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Emails */}
          {emails.length > 0 && (
            <div className="space-y-3">
              {emails.map((email, idx) => (
                <div key={idx} className="border rounded-lg p-4 bg-white">
                  <div className="mb-3 pb-3 border-b">
                    <p className="text-sm font-semibold text-gray-900">Email {idx + 1}</p>
                    <p className="text-xs text-gray-600">Subject: {email.subject}</p>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap mb-2">{email.body}</p>
                  {email.cta && (
                    <p className="text-sm font-semibold text-blue-600 mb-3">CTA: {email.cta}</p>
                  )}
                  <button
                    onClick={() => handleCopy(`${email.subject}\n\n${email.body}`, `email-${idx}`)}
                    className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    {copiedId === `email-${idx}` ? (
                      <>
                        <Check size={14} /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={14} /> Copy
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Raw Content */}
          {content && !sections.length && !emails.length && (
            <div className="border rounded-lg p-4 bg-gray-50">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{content}</p>
              <button
                onClick={() => handleCopy(content, 'content')}
                className="mt-2 text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                {copiedId === 'content' ? (
                  <>
                    <Check size={14} /> Copied!
                  </>
                ) : (
                  <>
                    <Copy size={14} /> Copy all
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Variations */}
      {activeTab === 'variations' && variations.length > 0 && (
        <div className="space-y-3">
          {variations.map((variation, idx) => (
            <button
              key={idx}
              className="w-full text-left border rounded-lg p-4 hover:border-blue-400 hover:bg-blue-50 transition"
            >
              <p className="text-sm font-medium text-gray-900">{variation}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── OPTIMIZATION Renderer ──────────────────────────────────────────────────

export function OptimizationRenderer({ artifact }: { artifact: any }) {
  const [activeScenario, setActiveScenario] = useState(0);

  if (!artifact || artifact.type !== 'optimization_plan') {
    return <div className="text-red-600">Invalid optimization artifact</div>;
  }

  const { current_state, recommendation, expected_impact, whatIfScenarios = [] } = artifact;

  return (
    <div className="space-y-4 mt-4">
      {/* Current State */}
      {current_state && (
        <div className="border rounded-lg p-4 bg-gray-50">
          <h4 className="font-semibold text-gray-900 mb-2">📊 Current State</h4>
          {current_state.description && (
            <p className="text-sm text-gray-700 mb-3">{current_state.description}</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(current_state.metrics).map(([key, value]) => (
              <div key={key} className="text-xs">
                <p className="text-gray-600">{key}</p>
                <p className="font-semibold text-gray-900">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendation */}
      {recommendation && (
        <div className="border rounded-lg p-4 bg-blue-50 border-blue-200">
          <h4 className="font-semibold text-blue-900 mb-2">💡 Recommendation</h4>
          <p className="text-sm text-blue-900 mb-3">{recommendation.description}</p>
          <div className="space-y-2">
            {recommendation.changes.map((change, idx) => (
              <div key={idx} className="flex justify-between items-center text-sm bg-white rounded p-2">
                <span className="text-gray-600">{change.field}</span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 line-through">{change.current}</span>
                  <span className="text-green-600 font-semibold">→ {change.recommended}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expected Impact */}
      {expected_impact && (
        <div className="border rounded-lg p-4 bg-green-50 border-green-200">
          <h4 className="font-semibold text-green-900 mb-2">✓ Expected Impact</h4>
          <p className="text-sm text-green-900 mb-3">{expected_impact.description}</p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {Object.entries(expected_impact.metrics).map(([key, value]) => (
              <div key={key} className="text-xs">
                <p className="text-green-700">{key}</p>
                <p className="font-semibold text-green-900">{value}</p>
              </div>
            ))}
          </div>
          <div className="text-sm font-semibold text-green-900">
            Expected improvement: <span className="text-lg">{expected_impact.improvement.toFixed(1)}%</span>
          </div>
        </div>
      )}

      {/* What-If Scenarios */}
      {whatIfScenarios.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-semibold text-gray-900 mb-2">🔄 What-If Scenarios</h4>
          <div className="flex gap-2 mb-3">
            {whatIfScenarios.map((scenario, idx) => (
              <button
                key={idx}
                onClick={() => setActiveScenario(idx)}
                className={`px-3 py-2 text-sm rounded transition ${
                  activeScenario === idx
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {scenario.name}
              </button>
            ))}
          </div>
          {whatIfScenarios[activeScenario] && (
            <div className="border rounded-lg p-4 bg-white">
              <div className="space-y-2">
                {Object.entries(whatIfScenarios[activeScenario].projectedImpact).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-gray-600">{key}</span>
                    <span className="font-semibold text-gray-900">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── EXECUTION Renderer ─────────────────────────────────────────────────────

export function ExecutionRenderer({ artifact }: { artifact: any }) {
  if (!artifact || artifact.type !== 'execution_tracker') {
    return <div className="text-red-600">Invalid execution artifact</div>;
  }

  const { status, metrics = {}, controls = [], campaign_name, startedAt } = artifact;

  const statusColors = {
    queued: 'bg-gray-100 text-gray-700',
    running: 'bg-green-100 text-green-700',
    paused: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-blue-100 text-blue-700',
    error: 'bg-red-100 text-red-700'
  };

  return (
    <div className="space-y-4 mt-4">
      {/* Status */}
      <div className="flex items-center justify-between">
        <div>
          {campaign_name && <p className="font-semibold text-gray-900">{campaign_name}</p>}
          {startedAt && <p className="text-xs text-gray-600">Started: {new Date(startedAt).toLocaleString()}</p>}
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${statusColors[status] || statusColors.queued}`}>
          {status.toUpperCase()}
        </span>
      </div>

      {/* Metrics */}
      {Object.keys(metrics).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Object.entries(metrics).map(([key, value]) => (
            <MetricCard key={key} label={key} value={value} />
          ))}
        </div>
      )}

      {/* Controls */}
      {controls.length > 0 && (
        <div className="flex gap-2">
          {controls.map((control, idx) => (
            <button
              key={idx}
              className="px-4 py-2 text-sm rounded border border-gray-300 hover:bg-gray-50 transition"
            >
              {control.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── DISCOVERY Renderer ─────────────────────────────────────────────────────

export function DiscoveryRenderer({ artifact }: { artifact: any }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!artifact || artifact.type !== 'discovery_results') {
    return <div className="text-red-600">Invalid discovery artifact</div>;
  }

  const { count, results = [], downloadUrl, downloadFormat } = artifact;

  return (
    <div className="space-y-4 mt-4">
      {/* Summary */}
      <div className="flex justify-between items-center mb-4">
        <p className="font-semibold text-gray-900">Found {count} result{count !== 1 ? 's' : ''}</p>
        {downloadUrl && (
          <a
            href={downloadUrl}
            download
            className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            <Download size={16} />
            Download ({downloadFormat || 'CSV'})
          </a>
        )}
      </div>

      {/* Results List */}
      <div className="space-y-2">
        {results.slice(0, 10).map((result, idx) => {
          const resultId = result.id || `result-${idx}`;
          const isExpanded = expandedId === resultId;

          return (
            <div
              key={idx}
              className="border rounded-lg overflow-hidden transition hover:border-blue-300"
            >
              <button
                onClick={() => setExpandedId(isExpanded ? null : resultId)}
                className="w-full px-4 py-3 text-left hover:bg-gray-50 transition flex items-center justify-between"
              >
                <div className="flex-1">
                  {result.name || result.title ? (
                    <p className="font-semibold text-gray-900">{result.name || result.title}</p>
                  ) : null}
                  <p className="text-xs text-gray-600 mt-1">
                    {Object.keys(result)
                      .filter(k => k !== 'id' && k !== 'name' && k !== 'title')
                      .slice(0, 2)
                      .map(k => `${k}: ${String(result[k]).slice(0, 30)}`)
                      .join(' • ')}
                  </p>
                </div>
                {isExpanded ? (
                  <ChevronUp size={20} className="text-gray-400" />
                ) : (
                  <ChevronDown size={20} className="text-gray-400" />
                )}
              </button>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="border-t px-4 py-3 bg-gray-50 space-y-2">
                  {Object.entries(result)
                    .filter(([key]) => key !== 'id' && key !== 'name' && key !== 'title')
                    .map(([key, value]) => (
                      <div key={key} className="text-sm">
                        <p className="text-gray-600 font-medium">{key}</p>
                        <p className="text-gray-900">{String(value)}</p>
                      </div>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Show More */}
      {results.length > 10 && (
        <button className="w-full py-2 text-sm text-blue-600 hover:text-blue-700 border-t mt-4">
          Show {results.length - 10} more results
        </button>
      )}
    </div>
  );
}

// ── Utility: Metric Card ───────────────────────────────────────────────────

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
      <p className="text-xs text-gray-600 capitalize mb-1">{label}</p>
      <p className="text-lg font-bold text-gray-900">{value}</p>
    </div>
  );
}

// ── Main Dispatcher ────────────────────────────────────────────────────────

export function ResponseRenderer({ artifact, responseType }: { artifact: any; responseType?: string }) {
  const type = artifact?.type || responseType;

  switch (type) {
    case 'analysis':
      return <AnalysisRenderer artifact={artifact} />;
    case 'content':
      return <CreationRenderer artifact={artifact} />;
    case 'optimization_plan':
      return <OptimizationRenderer artifact={artifact} />;
    case 'execution_tracker':
      return <ExecutionRenderer artifact={artifact} />;
    case 'discovery_results':
      return <DiscoveryRenderer artifact={artifact} />;
    default:
      return (
        <div className="bg-gray-50 border border-gray-200 rounded p-4 text-sm text-gray-700">
          <pre>{JSON.stringify(artifact, null, 2)}</pre>
        </div>
      );
  }
}
