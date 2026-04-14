'use strict';

/**
 * Phase 8.1 — Response Cache
 *
 * In-process LRU cache for agent responses. Keyed by goal_id + a
 * deterministic hash of the extracted params so identical requests
 * short-circuit the full agent call.
 *
 * TTL policy by response type:
 *   analysis      → 15 minutes   (metrics refresh slowly)
 *   optimization  → 30 minutes   (reallocation plans don't change minute-to-minute)
 *   creation      → 60 minutes   (content is largely static)
 *   discovery     → 10 minutes   (lead lists can change)
 *   execution     → 2 minutes    (live campaign status — must be fresh)
 *
 * No Redis dependency — uses a Map with size cap. For multi-process
 * deployments, swap the backing store in the _get/_set methods below.
 */

const crypto = require('crypto');

// TTL in milliseconds per response type
const TTL_MS = {
  analysis:     15 * 60_000,
  optimization: 30 * 60_000,
  creation:     60 * 60_000,
  discovery:    10 * 60_000,
  execution:     2 * 60_000,
  default:      15 * 60_000,
};

class ResponseCache {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxSize=500]   - Maximum cached entries before LRU eviction
   * @param {boolean} [options.enabled=true] - Master on/off switch
   */
  constructor(options = {}) {
    this.maxSize = options.maxSize ?? 500;
    this.enabled = options.enabled !== false;

    // Map preserves insertion order — we use this for LRU eviction
    this._store = new Map(); // key → { value, expiresAt, responseType }

    this.stats = { hits: 0, misses: 0, sets: 0, evictions: 0, invalidations: 0 };

    console.log(`[ResponseCache] Initialized (maxSize=${this.maxSize}, enabled=${this.enabled})`);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Build a deterministic cache key from goal + params.
   *
   * @param {string} goalId
   * @param {Object} [params={}] - Extracted intent params (entityId, timeframe, etc.)
   * @returns {string} Cache key
   */
  buildKey(goalId, params = {}) {
    const normalized = JSON.stringify(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== null)
          .sort(([a], [b]) => a.localeCompare(b))
      )
    );
    const hash = crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 10);
    return `${goalId}:${hash}`;
  }

  /**
   * Retrieve a cached response. Returns null on miss or expiry.
   *
   * @param {string} key - From buildKey()
   * @returns {Object|null} Cached response or null
   */
  get(key) {
    if (!this.enabled) return null;

    const entry = this._store.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this._store.delete(key);
      this.stats.misses++;
      return null;
    }

    // LRU: move to end (most recently used)
    this._store.delete(key);
    this._store.set(key, entry);

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Store a response in the cache.
   *
   * @param {string} key
   * @param {Object} response - Agent response object (must have response_type)
   * @param {number} [ttlOverrideMs] - Optional TTL override in ms
   */
  set(key, response, ttlOverrideMs) {
    if (!this.enabled) return;
    if (!response || typeof response !== 'object') return;

    const responseType = response.response_type || 'default';
    const ttl = ttlOverrideMs ?? TTL_MS[responseType] ?? TTL_MS.default;
    const expiresAt = Date.now() + ttl;

    // Evict oldest entry if at capacity
    if (this._store.size >= this.maxSize) {
      const oldestKey = this._store.keys().next().value;
      this._store.delete(oldestKey);
      this.stats.evictions++;
    }

    this._store.set(key, { value: response, expiresAt, responseType });
    this.stats.sets++;
  }

  /**
   * Invalidate all cache entries for a given goal.
   * Called when a connector is reconnected or data is known to be stale.
   *
   * @param {string} goalId
   * @returns {number} Number of entries removed
   */
  invalidateGoal(goalId) {
    const prefix = `${goalId}:`;
    let removed = 0;
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) {
        this._store.delete(key);
        removed++;
        this.stats.invalidations++;
      }
    }
    if (removed > 0) {
      console.log(`[ResponseCache] Invalidated ${removed} entries for goal "${goalId}"`);
    }
    return removed;
  }

  /**
   * Invalidate all entries of a given response type.
   * E.g. when GA4 reconnects, invalidate all 'analysis' entries.
   *
   * @param {string} responseType
   * @returns {number} Number of entries removed
   */
  invalidateByType(responseType) {
    let removed = 0;
    for (const [key, entry] of this._store.entries()) {
      if (entry.responseType === responseType) {
        this._store.delete(key);
        removed++;
        this.stats.invalidations++;
      }
    }
    console.log(`[ResponseCache] Invalidated ${removed} "${responseType}" entries`);
    return removed;
  }

  /**
   * Clear all cached entries. Use on connector status changes.
   */
  flush() {
    const size = this._store.size;
    this._store.clear();
    this.stats.invalidations += size;
    console.log(`[ResponseCache] Flushed ${size} entries`);
  }

  /**
   * Remove all expired entries. Run periodically to reclaim memory.
   * @returns {number} Entries removed
   */
  purgeExpired() {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this._store.entries()) {
      if (now > entry.expiresAt) {
        this._store.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Cache stats snapshot.
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      size: this._store.size,
      hit_rate_pct: total > 0 ? Math.round((this.stats.hits / total) * 100) : 0,
      enabled: this.enabled,
    };
  }

  // ── Middleware helper ──────────────────────────────────────────────────────

  /**
   * Wrap an agent execute() call with cache read/write.
   *
   * @param {string} goalId
   * @param {Object} params - Key-worthy params (entityId, timeframe, etc.)
   * @param {Function} executeFn - Async function that returns the agent response
   * @returns {Promise<{response: Object, fromCache: boolean}>}
   */
  async wrap(goalId, params, executeFn) {
    const key = this.buildKey(goalId, params);
    const cached = this.get(key);

    if (cached) {
      console.log(`[ResponseCache] HIT  ${key}`);
      return { response: { ...cached, _cached: true }, fromCache: true };
    }

    console.log(`[ResponseCache] MISS ${key}`);
    const response = await executeFn();

    // Only cache successful responses (confidence > 0)
    if (response && response.confidence > 0) {
      this.set(key, response);
    }

    return { response, fromCache: false };
  }
}

// ── Singleton export ───────────────────────────────────────────────────────────

const defaultCache = new ResponseCache({
  maxSize: 500,
  enabled: process.env.AGENT_CACHE_DISABLED !== 'true',
});

// Auto-purge expired entries every 5 minutes
setInterval(() => {
  const removed = defaultCache.purgeExpired();
  if (removed > 0) {
    console.log(`[ResponseCache] Auto-purged ${removed} expired entries`);
  }
}, 5 * 60_000).unref(); // .unref() so this doesn't keep the process alive

module.exports = ResponseCache;
module.exports.defaultCache = defaultCache;
module.exports.TTL_MS = TTL_MS;
