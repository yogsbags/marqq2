'use strict';

/**
 * Phase 8.3 — Structured Logger
 *
 * Zero-dependency structured logger for the agentic platform.
 * Writes JSON-lines to stdout (and optionally a file).
 *
 * Features:
 *   • Levels: debug < info < warn < error
 *   • Structured fields: requestId, goalId, agentId, durationMs, etc.
 *   • Pretty-print mode for development (LOG_PRETTY=true)
 *   • Minimum level control (LOG_LEVEL env var)
 *   • Child loggers (inherit parent context fields)
 *
 * Usage:
 *   const { logger } = require('./observability/logger');
 *
 *   logger.info('Agent executed', { goalId: 'find-leads', agentId: 'kiran', durationMs: 340 });
 *   logger.warn('Connector missing', { goalId: 'optimize-roas', connector: 'google_ads' });
 *   logger.error('Agent crash', { goalId: 'find-leads', err: error.message, stack: error.stack });
 *
 *   // Child logger (inherits requestId)
 *   const reqLog = logger.child({ requestId: 'req-abc123' });
 *   reqLog.info('Routing started', { message: 'Find me leads' });
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function resolveLevel(name) {
  const n = (name || '').toLowerCase();
  return LEVELS[n] !== undefined ? n : 'info';
}

const MIN_LEVEL  = resolveLevel(process.env.LOG_LEVEL);
const PRETTY     = process.env.LOG_PRETTY === 'true';
const MIN_LEVEL_NUM = LEVELS[MIN_LEVEL];

// ANSI colours for pretty mode
const COLOURS = {
  debug: '\x1b[90m',  // grey
  info:  '\x1b[36m',  // cyan
  warn:  '\x1b[33m',  // yellow
  error: '\x1b[31m',  // red
  reset: '\x1b[0m',
};

function formatPretty(level, msg, fields) {
  const c   = COLOURS[level] || '';
  const r   = COLOURS.reset;
  const ts  = new Date().toISOString().substring(11, 23); // HH:mm:ss.mmm
  const extra = Object.keys(fields).length > 0
    ? '  ' + JSON.stringify(fields)
    : '';
  return `${c}[${ts}] ${level.toUpperCase().padEnd(5)} ${msg}${r}${extra}`;
}

function formatJson(level, msg, fields) {
  return JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...fields,
  });
}

class Logger {
  /**
   * @param {Object} [ctx={}] - Inherited context fields
   * @param {string} [ctx.requestId]
   * @param {string} [ctx.goalId]
   * @param {string} [ctx.agentId]
   */
  constructor(ctx = {}) {
    this._ctx = ctx;
  }

  // ── Level methods ────────────────────────────────────────────────────────────

  debug(msg, fields = {}) { this._write('debug', msg, fields); }
  info (msg, fields = {}) { this._write('info',  msg, fields); }
  warn (msg, fields = {}) { this._write('warn',  msg, fields); }
  error(msg, fields = {}) { this._write('error', msg, fields); }

  /**
   * Log at info level and return the elapsed ms since `startMs`.
   * Shorthand for timing a block:
   *
   *   const start = Date.now();
   *   await doWork();
   *   logger.timed('Work done', start, { goalId });
   */
  timed(msg, startMs, fields = {}) {
    this.info(msg, { ...fields, durationMs: Date.now() - startMs });
  }

  /**
   * Create a child logger that inherits this logger's context
   * and merges additional fields.
   *
   * @param {Object} extraCtx
   * @returns {Logger}
   */
  child(extraCtx = {}) {
    return new Logger({ ...this._ctx, ...extraCtx });
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  _write(level, msg, fields) {
    if (LEVELS[level] < MIN_LEVEL_NUM) return;

    const merged = { ...this._ctx, ...fields };
    const line   = PRETTY
      ? formatPretty(level, msg, merged)
      : formatJson(level, msg, merged);

    if (level === 'error') {
      process.stderr.write(line + '\n');
    } else {
      process.stdout.write(line + '\n');
    }
  }
}

// ── Singleton export ───────────────────────────────────────────────────────────

const logger = new Logger();

module.exports = Logger;
module.exports.logger = logger;
module.exports.LEVELS = LEVELS;
