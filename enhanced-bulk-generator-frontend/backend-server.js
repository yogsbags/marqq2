#!/usr/bin/env node

/**
 * Backend API Server for Enhanced Bulk Generator
 * Runs on port 3008 and handles workflow execution
 * This allows the Vite app (port 3007) to proxy API calls to it
 */

const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const dotenv = require('dotenv');
const multer = require('multer');
const http = require('http');
const https = require('https');
const { promisify } = require('util');
const crypto = require('crypto');
const unlink = promisify(fs.unlink);
const writeFile = promisify(fs.writeFile);

// Load environment variables from .env file
// Try multiple locations: current dir, parent dir (martech), and parent's parent
const envPaths = [
  path.resolve(__dirname, '.env'),
  path.resolve(__dirname, '..', '.env'),
  path.resolve(__dirname, '..', '..', '.env')
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
    console.log(`✅ Loaded environment variables from: ${envPath}`);
    break;
  }
}

const app = express();
const PORT = 3006;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory rate limiting + response cache (no permanent storage)
const budgetOptRateWindowMs = 60_000;
const budgetOptMaxRequestsPerWindow = 25;
const budgetOptRequestsByIp = new Map(); // ip -> number[]

const budgetOptCacheTtlMs = 60_000;
const budgetOptCache = new Map(); // key -> { expiresAt: number, value: any }

function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim();
  if (Array.isArray(xf) && xf[0]) return String(xf[0]);
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

function enforceBudgetOptRateLimit(req, res) {
  const ip = getClientIp(req);
  const now = Date.now();
  const list = budgetOptRequestsByIp.get(ip) || [];
  const nextList = list.filter((ts) => now - ts < budgetOptRateWindowMs);
  if (nextList.length >= budgetOptMaxRequestsPerWindow) {
    res.status(429).json({
      error: 'Rate limited',
      limit: `${budgetOptMaxRequestsPerWindow}/minute`,
      retryAfterSeconds: Math.ceil((budgetOptRateWindowMs - (now - nextList[0])) / 1000)
    });
    return false;
  }
  nextList.push(now);
  budgetOptRequestsByIp.set(ip, nextList);
  return true;
}

function cacheGet(cacheKey) {
  const hit = budgetOptCache.get(cacheKey);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    budgetOptCache.delete(cacheKey);
    return null;
  }
  return hit.value;
}

function cacheSet(cacheKey, value) {
  budgetOptCache.set(cacheKey, { expiresAt: Date.now() + budgetOptCacheTtlMs, value });
}

// Multer configuration for file uploads
const upload = multer({ dest: '/tmp' });

// Backend directory
const backendDir = path.join(__dirname, 'backend');
const mainJsPath = path.join(backendDir, 'main.js');
const companyIntelDbPath = path.join(backendDir, 'data', 'company-intelligence.json');
const voicebotKbPath = path.join(backendDir, 'data', 'voicebot-kb.json');

function readCompanyIntelDb() {
  try {
    if (!fs.existsSync(companyIntelDbPath)) {
      return { companies: {}, artifacts: {} };
    }
    const raw = fs.readFileSync(companyIntelDbPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      companies: parsed?.companies && typeof parsed.companies === 'object' ? parsed.companies : {},
      artifacts: parsed?.artifacts && typeof parsed.artifacts === 'object' ? parsed.artifacts : {}
    };
  } catch (error) {
    console.error('[Company Intel] Failed to read DB:', error);
    return { companies: {}, artifacts: {} };
  }
}

function writeCompanyIntelDb(nextDb) {
  try {
    const dir = path.dirname(companyIntelDbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(companyIntelDbPath, JSON.stringify(nextDb, null, 2));
  } catch (error) {
    console.error('[Company Intel] Failed to write DB:', error);
  }
}

function readVoicebotKbDb() {
  try {
    if (!fs.existsSync(voicebotKbPath)) {
      return { files: {} };
    }
    const raw = fs.readFileSync(voicebotKbPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return { files: parsed?.files && typeof parsed.files === 'object' ? parsed.files : {} };
  } catch (error) {
    console.error('[Voicebot KB] Failed to read DB:', error);
    return { files: {} };
  }
}

function writeVoicebotKbDb(nextDb) {
  try {
    const dir = path.dirname(voicebotKbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(voicebotKbPath, JSON.stringify(nextDb, null, 2));
  } catch (error) {
    console.error('[Voicebot KB] Failed to write DB:', error);
  }
}

function extractTextFromUploadedFile({ filename, mimetype, buffer }) {
  const name = String(filename || '').toLowerCase();
  const type = String(mimetype || '').toLowerCase();

  const isText =
    type.startsWith('text/') ||
    name.endsWith('.txt') ||
    name.endsWith('.md') ||
    name.endsWith('.csv') ||
    name.endsWith('.json');

  if (!isText) return null;

  try {
    const raw = buffer.toString('utf-8');
    return raw.replace(/\u0000/g, '').trim().slice(0, 200_000);
  } catch {
    return null;
  }
}

function normalizeWebsiteUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  try {
    const withProto = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(withProto);
    return url.toString();
  } catch {
    return null;
  }
}

async function fetchText(url, { timeoutMs = 15000, maxBytes = 2_000_000 } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs).unref();
  try {
    const resp = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'user-agent': 'martech-company-intel/1.0 (+https://github.com/yogsbags/martech)'
      },
      signal: controller.signal
    });

    const contentType = resp.headers.get('content-type') || '';
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Fetch failed: ${resp.status} ${text}`);
    }

    const arrayBuffer = await resp.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);
    const sliced = buf.length > maxBytes ? buf.subarray(0, maxBytes) : buf;
    const text = sliced.toString('utf-8');

    return { text, contentType, truncated: buf.length > maxBytes };
  } finally {
    clearTimeout(t);
  }
}

function stripHtml(html) {
  const raw = String(html || '');
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(text) {
  const raw = String(text || '');
  if (!raw) return raw;
  const basic = raw
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // numeric entities
  return basic.replace(/&#(\d+);/g, (_, num) => {
    const code = Number(num);
    if (!Number.isFinite(code)) return _;
    try {
      return String.fromCodePoint(code);
    } catch {
      return _;
    }
  });
}

function extractHtmlMeta(html) {
  const raw = String(html || '');
  const title =
    decodeHtmlEntities(
      raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ')?.trim() || ''
    );

  const metaDescription =
    decodeHtmlEntities(
      raw.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i)?.[1]?.trim() ||
        raw.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']description["'][^>]*>/i)?.[1]?.trim() ||
        ''
    ) ||
    '';

  const h1 = Array.from(raw.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi))
    .map((m) => stripHtml(m[1]))
    .map(decodeHtmlEntities)
    .filter(Boolean)
    .slice(0, 3);

  const h2 = Array.from(raw.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi))
    .map((m) => stripHtml(m[1]))
    .map(decodeHtmlEntities)
    .filter(Boolean)
    .slice(0, 6);

  return { title, metaDescription, h1, h2 };
}

function extractLinksFromHtml(html, baseUrl) {
  const raw = String(html || '');
  const links = [];
  for (const m of raw.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi)) {
    const href = String(m[1] || '').trim();
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
    try {
      const resolved = baseUrl ? new URL(href, baseUrl).toString() : href;
      links.push(resolved);
    } catch {
      // ignore
    }
  }
  return Array.from(new Set(links)).slice(0, 200);
}

function pickFirstUrlByIncludes(links, includesList) {
  for (const inc of includesList) {
    const found = links.find((u) => u.toLowerCase().includes(inc));
    if (found) return found;
  }
  return null;
}

function extractSocialLinks(links) {
  const norm = links.map((u) => String(u || '')).filter(Boolean);
  return {
    linkedin: pickFirstUrlByIncludes(norm, ['linkedin.com/company', 'linkedin.com/']),
    instagram: pickFirstUrlByIncludes(norm, ['instagram.com/']),
    youtube: pickFirstUrlByIncludes(norm, ['youtube.com/', 'youtu.be/']),
    twitter: pickFirstUrlByIncludes(norm, ['x.com/', 'twitter.com/'])
  };
}

function extractKeyPages(links) {
  const norm = links.map((u) => String(u || '')).filter(Boolean);
  return {
    about: pickFirstUrlByIncludes(norm, ['/about', 'about-us', 'our-story', 'company']),
    productsOrServices: pickFirstUrlByIncludes(norm, ['/products', '/product', '/services', '/service', '/solutions', '/offerings']),
    pricing: pickFirstUrlByIncludes(norm, ['/pricing', 'plans', 'fees']),
    contact: pickFirstUrlByIncludes(norm, ['/contact', 'get-in-touch', 'support'])
  };
}

function inferIndustry({ title, metaDescription }) {
  const text = `${title || ''} ${metaDescription || ''}`.toLowerCase();
  if (/(stock\s*broker|broking|online\s*trading|trade\s*online|trading\s*platform)/.test(text)) return 'Stock Broking / Online Trading';
  if (/(investment|wealth|portfolio|mutual fund|sip)/.test(text)) return 'Investments / Wealth Management';
  if (/(saas|software|platform|api)/.test(text)) return 'Software / Platform';
  return 'unknown';
}

function inferOfferingsFromHeadings({ h1, h2 }) {
  const candidates = []
    .concat(Array.isArray(h1) ? h1 : [])
    .concat(Array.isArray(h2) ? h2 : [])
    .map((t) => String(t || '').trim())
    .filter(Boolean);

  const uniq = Array.from(new Set(candidates));
  return uniq.slice(0, 12);
}

function defaultProductsByIndustry(industry) {
  const ind = String(industry || '').toLowerCase();
  if (ind.includes('stock broking') || ind.includes('trading')) {
    return [
      { name: 'Online Trading Platform', category: 'Trading', description: 'Equity trading platform for investors and traders.', targetCustomer: 'Retail investors', differentiator: 'Fast execution + reliable platform' },
      { name: 'Demat & Trading Account', category: 'Accounts', description: 'Account opening and management for market access.', targetCustomer: 'New investors', differentiator: 'Quick onboarding + support' },
      { name: 'Research & Advisory', category: 'Research', description: 'Market insights, reports, and research-driven ideas.', targetCustomer: 'Active investors', differentiator: 'Data-backed recommendations' },
      { name: 'Mutual Funds / SIP', category: 'Investments', description: 'Long-term investing via mutual funds and SIPs.', targetCustomer: 'Long-term investors', differentiator: 'Curated fund guidance' },
      { name: 'IPO / New Issues', category: 'Investments', description: 'Access to IPOs and new investment opportunities.', targetCustomer: 'Retail investors', differentiator: 'Simple application flow' },
      { name: 'Portfolio & Wealth Services', category: 'Wealth', description: 'Portfolio guidance and wealth solutions.', targetCustomer: 'HNI / mass affluent', differentiator: 'Goal-based advisory' }
    ];
  }
  return [];
}

function inferCompanyName({ explicitName, websiteUrl, title }) {
  const name = String(explicitName || '').trim();
  if (name) return name;

  const urlText = String(websiteUrl || '').trim();
  let hostBrand = '';
  if (urlText) {
    try {
      const u = new URL(urlText);
      const host = u.hostname.replace(/^www\./i, '');
      const sld = host.split('.')[0] || host;
      if (sld) {
        hostBrand = sld
          .replace(/[-_]+/g, ' ')
          .split(' ')
          .filter(Boolean)
          .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1))
          .join(' ')
          .slice(0, 80);
      }
    } catch {
      // ignore
    }
  }

  const titleText = String(title || '').trim();
  if (titleText) {
    const firstChunk = titleText.split(/\s[\|\-–—]\s/)[0]?.trim();
    const candidate = (firstChunk && firstChunk.length >= 2 ? firstChunk : titleText).slice(0, 80);
    const looksGeneric = /(trusted|online|platform|india|best|top|official|website|stock broker|broking|trading)/i.test(candidate);
    if (looksGeneric && hostBrand) return hostBrand;
    return candidate;
  }

  if (hostBrand) return hostBrand;

  return 'Untitled Company';
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Enhanced Bulk Generator Backend API' });
});

// AI Voice Bot (LiveKit): config + token minting
app.get('/api/voicebot/livekit/config', (req, res) => {
  res.json({
    livekitUrl: process.env.LIVEKIT_URL || null,
    configured: Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET),
    providers: {
      stt: {
        provider: 'deepgram',
        configured: Boolean(process.env.DEEPGRAM_API_KEY)
      },
      tts: {
        provider: 'cartesia',
        model: 'sonic-3-2025-10-27',
        voices: {
          en_male: process.env.CARTESIA_VOICE_ID_EN_MALE || '6303e5fb-a0a7-48f9-bb1a-dd42c216dc5d',
          en_female: process.env.CARTESIA_VOICE_ID_EN_FEMALE || '3b554273-4299-48b9-9aaf-eefd438e3941',
          hi_male: process.env.CARTESIA_VOICE_ID_HI_MALE || '6303e5fb-a0a7-48f9-bb1a-dd42c216dc5d',
          hi_female: process.env.CARTESIA_VOICE_ID_HI_FEMALE || '3b554273-4299-48b9-9aaf-eefd438e3941'
        }
      },
      llm: {
        provider: 'openai',
        model: 'gpt-4o',
        configured: Boolean(process.env.OPENAI_API_KEY)
      }
    }
  });
});

app.post('/api/voicebot/livekit/token', async (req, res) => {
  try {
    const livekitUrl = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!livekitUrl || !apiKey || !apiSecret) {
      return res.status(400).json({
        error: 'LiveKit not configured',
        required: ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET']
      });
    }

    const roomName = String(req.body?.roomName || 'voicebot-demo').trim() || 'voicebot-demo';
    const identity = String(req.body?.identity || crypto.randomUUID()).trim();
    const participantName = String(req.body?.participantName || 'User').trim() || 'User';
    const publish = req.body?.publish !== false; // default true

    const { AccessToken } = require('livekit-server-sdk');
    const at = new AccessToken(apiKey, apiSecret, { identity, name: participantName });
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: publish,
      canSubscribe: true
    });

    const token = await at.toJwt();
    res.json({ livekitUrl, roomName, identity, participantName, token });
  } catch (error) {
    res.status(500).json({ error: 'Token generation failed', details: error.message });
  }
});

// AI Voice Bot: dispatch the LiveKit Agents worker into a room
app.post('/api/voicebot/livekit/dispatch', async (req, res) => {
  try {
    const livekitUrl = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!livekitUrl || !apiKey || !apiSecret) {
      return res.status(400).json({
        error: 'LiveKit not configured',
        required: ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET']
      });
    }

    const roomName = String(req.body?.roomName || '').trim();
    if (!roomName) return res.status(400).json({ error: 'roomName is required' });

    const agentName = String(process.env.LIVEKIT_AGENT_NAME || 'martech-voicebot');
    const language = String(req.body?.language || 'en').trim().toLowerCase();
    const gender = String(req.body?.gender || 'female').trim().toLowerCase();

    const { AgentDispatchClient } = require('livekit-server-sdk');
    const client = new AgentDispatchClient(livekitUrl, apiKey, apiSecret);

    const dispatch = await client.createDispatch(roomName, agentName, {
      metadata: JSON.stringify({
        language: language === 'hi' ? 'hi' : 'en',
        gender: gender === 'male' ? 'male' : 'female'
      })
    });

    res.json({ dispatch });
  } catch (error) {
    res.status(500).json({ error: 'Dispatch failed', details: error.message });
  }
});

// AI Voice Bot (KB): upload/list/delete/search (files uploaded from UI)
app.get('/api/voicebot/kb/files', (req, res) => {
  const db = readVoicebotKbDb();
  const files = Object.values(db.files || {}).sort((a, b) => {
    const aTs = new Date(a?.createdAt || 0).getTime();
    const bTs = new Date(b?.createdAt || 0).getTime();
    return bTs - aTs;
  });
  res.json({ files });
});

app.post('/api/voicebot/kb/upload', upload.array('files', 10), async (req, res) => {
  try {
    const incoming = Array.isArray(req.files) ? req.files : [];
    if (!incoming.length) return res.status(400).json({ error: 'No files uploaded' });

    const db = readVoicebotKbDb();
    const createdAt = new Date().toISOString();
    const added = [];
    const rejected = [];

    for (const f of incoming) {
      const fileId = crypto.randomUUID();
      const buffer = fs.readFileSync(f.path);
      const text = extractTextFromUploadedFile({
        filename: f.originalname,
        mimetype: f.mimetype,
        buffer
      });

      if (!text) {
        rejected.push({ name: f.originalname, reason: 'Unsupported file type (use txt/md/csv/json)' });
        await unlink(f.path).catch(() => {});
        continue;
      }

      db.files[fileId] = {
        id: fileId,
        name: f.originalname,
        mime: f.mimetype,
        size: f.size,
        createdAt,
        text
      };
      added.push({ id: fileId, name: f.originalname });
      await unlink(f.path).catch(() => {});
    }

    writeVoicebotKbDb(db);
    res.json({ added, rejected });
  } catch (error) {
    res.status(500).json({ error: 'Upload failed', details: error.message });
  }
});

app.delete('/api/voicebot/kb/files/:id', (req, res) => {
  const id = String(req.params.id || '');
  const db = readVoicebotKbDb();
  if (!db.files?.[id]) return res.status(404).json({ error: 'Not found' });
  delete db.files[id];
  writeVoicebotKbDb(db);
  res.json({ ok: true });
});

function keywordSearchKb(db, query, { limit = 6 } = {}) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return [];
  const files = Object.values(db.files || {});
  const hits = [];
  for (const f of files) {
    const text = String(f?.text || '');
    const lower = text.toLowerCase();
    const idx = lower.indexOf(q);
    if (idx === -1) continue;
    const start = Math.max(0, idx - 300);
    const end = Math.min(text.length, idx + 900);
    hits.push({
      fileId: f.id,
      fileName: f.name,
      snippet: text.slice(start, end),
      score: 1
    });
  }
  return hits.slice(0, limit);
}

app.post('/api/voicebot/kb/search', async (req, res) => {
  const query = String(req.body?.query || '').trim();
  if (!query) return res.status(400).json({ error: 'query is required' });
  const db = readVoicebotKbDb();
  const results = keywordSearchKb(db, query, { limit: 6 });
  res.json({ results });
});

// AI Voice Bot: Deepgram STT (prerecorded)
app.post('/api/voicebot/stt', upload.single('audio'), async (req, res) => {
  try {
    const key = process.env.DEEPGRAM_API_KEY;
    if (!key) return res.status(400).json({ error: 'DEEPGRAM_API_KEY not set' });

    const language = String(req.body?.language || 'en').trim().toLowerCase();
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'audio file is required' });

    const audioBytes = fs.readFileSync(file.path);
    await unlink(file.path).catch(() => {});

    const url = new URL('https://api.deepgram.com/v1/listen');
    url.searchParams.set('model', 'nova-2');
    url.searchParams.set('smart_format', 'true');
    if (language === 'hi') url.searchParams.set('language', 'hi');
    else url.searchParams.set('language', 'en');

    const dgResp = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Token ${key}`,
        'Content-Type': file.mimetype || 'application/octet-stream'
      },
      body: audioBytes
    });

    if (!dgResp.ok) {
      const text = await dgResp.text().catch(() => '');
      return res.status(500).json({ error: 'Deepgram error', details: text || `HTTP ${dgResp.status}` });
    }

    const json = await dgResp.json();
    const transcript =
      json?.results?.channels?.[0]?.alternatives?.[0]?.transcript ||
      json?.results?.channels?.[0]?.alternatives?.[0]?.paragraphs?.transcript ||
      '';

    res.json({ transcript: String(transcript || '') });
  } catch (error) {
    res.status(500).json({ error: 'STT failed', details: error.message });
  }
});

// AI Voice Bot: GPT-4o dialogue + tool calling over uploaded KB
app.post('/api/voicebot/dialogue', async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'OPENAI_API_KEY not set' });

    const sessionId = String(req.body?.sessionId || '').trim() || crypto.randomUUID();
    const userText = String(req.body?.userText || '').trim();
    const language = String(req.body?.language || 'en').trim().toLowerCase();
    const voiceGender = String(req.body?.voiceGender || 'female').trim().toLowerCase();

    if (!userText) return res.status(400).json({ error: 'userText is required' });

    const OpenAI = require('openai');
    const client = new OpenAI({ apiKey });

    const db = readVoicebotKbDb();

    // Very small in-memory conversation state (ephemeral)
    global.__voicebotSessions = global.__voicebotSessions || {};
    const sessions = global.__voicebotSessions;
    sessions[sessionId] = sessions[sessionId] || [];

    const system = `You are an AI Voice Bot for outbound/inbound calls.
You must follow the current voicebot workflow stages: greeting -> value prop -> qualification -> CTA -> close.
You are polite, concise, and India-context friendly.

Language:
- If language=hi, respond in Hindi (Devanagari).
- If language=en, respond in English.

Voice constraints:
- Keep responses short enough for natural spoken delivery (1-3 sentences).
- Ask at most one question per turn.

Compliance (finance): No guaranteed returns, no personalized investment advice, no promises.

You have access to a knowledge base of uploaded client documents via a tool. Use it to fetch client details when needed.`;

    const tools = [
      {
        type: 'function',
        function: {
          name: 'search_client_kb',
          description: 'Search uploaded client knowledge base files for relevant details and return short snippets.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              limit: { type: 'number' }
            },
            required: ['query']
          }
        }
      }
    ];

    const messages = [
      { role: 'system', content: system },
      ...sessions[sessionId],
      { role: 'user', content: userText }
    ];

    const model = process.env.OPENAI_VOICEBOT_MODEL || 'gpt-4o';

    let completion = await client.chat.completions.create({
      model,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.4
    });

    const toolCalls = completion?.choices?.[0]?.message?.tool_calls || [];
    const citations = [];

    if (toolCalls.length) {
      const toolMessages = [];
      for (const tc of toolCalls) {
        if (tc.type !== 'function') continue;
        if (tc.function?.name !== 'search_client_kb') continue;
        let args = {};
        try {
          args = JSON.parse(tc.function.arguments || '{}');
        } catch {
          args = { query: String(tc.function.arguments || '') };
        }
        const query = String(args.query || '').trim();
        const limit = Number(args.limit || 6) || 6;
        const results = keywordSearchKb(db, query, { limit });
        for (const r of results) citations.push({ fileId: r.fileId, fileName: r.fileName });
        toolMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify({ results })
        });
      }

      completion = await client.chat.completions.create({
        model,
        messages: [...messages, ...toolMessages],
        temperature: 0.4
      });
    }

    const assistantText = String(completion?.choices?.[0]?.message?.content || '').trim();
    if (!assistantText) return res.status(500).json({ error: 'No assistant response' });

    sessions[sessionId].push({ role: 'user', content: userText });
    sessions[sessionId].push({ role: 'assistant', content: assistantText });

    res.json({
      sessionId,
      language,
      voiceGender,
      assistantText,
      citations: Array.from(new Map(citations.map((c) => [`${c.fileId}`, c])).values())
    });
  } catch (error) {
    res.status(500).json({ error: 'Dialogue failed', details: error.message });
  }
});

// Budget Optimization: list available real-time connectors (status only)
app.get('/api/budget-optimization/connectors', (req, res) => {
  const connectors = [
    {
      id: 'meta_ads',
      name: 'Meta Ads',
      status: process.env.META_ACCESS_TOKEN ? 'configured' : 'not_configured',
      notes: 'Planned: ad accounts, insights, creatives, change audit, budget updates'
    },
    {
      id: 'google_ads',
      name: 'Google Ads',
      status: process.env.GOOGLE_ADS_DEVELOPER_TOKEN ? 'configured' : 'not_configured',
      notes: 'Planned: account mapping + GAQL queries'
    },
    {
      id: 'ga4',
      name: 'Google Analytics 4',
      status: process.env.GA4_PROPERTY_ID ? 'configured' : 'not_configured',
      notes: 'Planned: active users, traffic sources, custom reports, funnels'
    },
    {
      id: 'tiktok_ads',
      name: 'TikTok Ads',
      status: process.env.TIKTOK_ACCESS_TOKEN ? 'configured' : 'not_configured',
      notes: 'Planned: insights + creative pull'
    },
    {
      id: 'shopify',
      name: 'Shopify',
      status: process.env.SHOPIFY_ACCESS_TOKEN ? 'configured' : 'not_configured',
      notes: 'Planned: orders + product analytics'
    },
    {
      id: 'snowflake',
      name: 'Snowflake',
      status: process.env.SNOWFLAKE_ACCOUNT ? 'configured' : 'not_configured',
      notes: 'Planned: run SQL against warehouse'
    },
    {
      id: 'manual',
      name: 'Manual Upload / Paste',
      status: 'available',
      notes: 'Upload CSV or paste JSON/CSV for analysis (no permanent storage)'
    }
  ];

  res.json({
    philosophy: 'Real-time fetch; no permanent storage',
    rateLimit: `${budgetOptMaxRequestsPerWindow}/minute`,
    cacheTtlSeconds: Math.round(budgetOptCacheTtlMs / 1000),
    connectors
  });
});

// Budget Optimization: analyze performance data + answer questions (Groq)
app.post('/api/budget-optimization/analyze', async (req, res) => {
  try {
    if (!enforceBudgetOptRateLimit(req, res)) return;

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return res.status(400).json({ error: 'GROQ_API_KEY not set' });

    const question = String(req.body?.question || '').trim();
    const timeframe = String(req.body?.timeframe || 'last_30_days').trim();
    const currency = String(req.body?.currency || 'INR').trim();
    const connectorsUsed = Array.isArray(req.body?.connectorsUsed) ? req.body.connectorsUsed.map(String) : [];
    const dataTextRaw = String(req.body?.dataText || '').trim();

    if (!question) return res.status(400).json({ error: 'question is required' });

    const maxChars = 25_000;
    const dataText = dataTextRaw.length > maxChars ? dataTextRaw.slice(0, maxChars) : dataTextRaw;

    const cacheKey = crypto
      .createHash('sha256')
      .update(JSON.stringify({ question, timeframe, currency, connectorsUsed, dataText }))
      .digest('hex');

    const cached = cacheGet(cacheKey);
    if (cached) return res.json({ cached: true, result: cached });

    const systemPrompt = `You are a senior performance marketing analyst and growth strategist for India-focused brands.
You behave like an "AI agent for performance marketing" (GoMarble-style): you do NOT assume a data warehouse exists.
You work with REAL-TIME connector data or user-provided exports. You do NOT permanently store any data.

Answer the user's question and output ONLY valid JSON (no markdown, no code fences, no extra keys).
Be compliance-safe for financial marketing: no guaranteed returns, no personalized investment advice.
If data is missing, make reasonable inferences and clearly label assumptions in "assumptions".`;

    const schema = `{
  "timeframe": string,
  "currency": string,
  "assumptions": string[],
  "kpiSnapshot": {
    "spend": number|null,
    "revenue": number|null,
    "roas": number|null,
    "cpa": number|null,
    "cpc": number|null,
    "ctr": number|null,
    "cvr": number|null
  },
  "diagnosis": {
    "summary": string,
    "drivers": [{"driver": string, "evidence": string, "impact": "high"|"medium"|"low", "confidence": number}]
  },
  "recommendations": [{
    "title": string,
    "why": string,
    "how": string[],
    "expectedImpact": string,
    "risk": string,
    "metricToWatch": string
  }],
  "budgetPlan": [{
    "channel": string,
    "currentBudget": number|null,
    "recommendedBudget": number|null,
    "delta": number|null,
    "rationale": string
  }],
  "creativeInsights": [{
    "platform": string,
    "whatWorked": string[],
    "whatToTest": string[],
    "doNotDo": string[]
  }],
  "reportHtml": string
}`;

    const userPrompt = `QUESTION:
${question}

TIMEFRAME: ${timeframe}
CURRENCY: ${currency}
CONNECTORS USED (if any): ${connectorsUsed.join(', ') || 'none'}

DATA (CSV/JSON export or notes; may be empty):
${dataText || '(none provided)'}

Return JSON matching this schema exactly:
${schema}`;

    const model = process.env.GROQ_BUDGET_OPT_MODEL || 'groq/compound';

    let rawText = await callGroqChatJson({
      apiKey: groqKey,
      model,
      systemPrompt,
      userPrompt,
      temperature: 0.35,
      maxTokens: 2400
    });

    let parsed = extractJsonFromText(rawText);
    if (!parsed) {
      rawText = await callGroqChatJson({
        apiKey: groqKey,
        model,
        systemPrompt: 'Return ONLY valid JSON. No markdown. No commentary. No code fences.',
        userPrompt: `Fix the following into valid JSON matching this schema exactly:\n\nSCHEMA:\n${schema}\n\nTEXT:\n${rawText}`,
        temperature: 0.2,
        maxTokens: 2400
      });
      parsed = extractJsonFromText(rawText);
    }

    if (!parsed) return res.status(500).json({ error: 'Unable to parse JSON from model response' });

    // Light sanitization: drop script tags in reportHtml if present.
    if (parsed && typeof parsed === 'object' && typeof parsed.reportHtml === 'string') {
      parsed.reportHtml = parsed.reportHtml.replace(/<script[\s\S]*?<\/script>/gi, '');
    }

    cacheSet(cacheKey, parsed);
    return res.json({ cached: false, result: parsed });
  } catch (error) {
    res.status(500).json({ error: 'Budget optimization analysis failed', details: error.message });
  }
});

// Performance Scorecard: list connectors (same philosophy as budget optimization)
app.get('/api/performance-scorecard/connectors', (req, res) => {
  const connectors = [
    { id: 'meta_ads', name: 'Meta Ads', status: process.env.META_ACCESS_TOKEN ? 'configured' : 'not_configured' },
    { id: 'google_ads', name: 'Google Ads', status: process.env.GOOGLE_ADS_DEVELOPER_TOKEN ? 'configured' : 'not_configured' },
    { id: 'ga4', name: 'Google Analytics 4', status: process.env.GA4_PROPERTY_ID ? 'configured' : 'not_configured' },
    { id: 'tiktok_ads', name: 'TikTok Ads', status: process.env.TIKTOK_ACCESS_TOKEN ? 'configured' : 'not_configured' },
    { id: 'shopify', name: 'Shopify', status: process.env.SHOPIFY_ACCESS_TOKEN ? 'configured' : 'not_configured' },
    { id: 'snowflake', name: 'Snowflake', status: process.env.SNOWFLAKE_ACCOUNT ? 'configured' : 'not_configured' },
    { id: 'manual', name: 'Manual Upload / Paste', status: 'available' }
  ];

  res.json({
    philosophy: 'Real-time fetch; no permanent storage',
    rateLimit: `${budgetOptMaxRequestsPerWindow}/minute`,
    cacheTtlSeconds: Math.round(budgetOptCacheTtlMs / 1000),
    connectors
  });
});

// Performance Scorecard: generate a scorecard (Groq)
app.post('/api/performance-scorecard/generate', async (req, res) => {
  try {
    if (!enforceBudgetOptRateLimit(req, res)) return;

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return res.status(400).json({ error: 'GROQ_API_KEY not set' });

    const timeframe = String(req.body?.timeframe || 'last_30_days').trim();
    const currency = String(req.body?.currency || 'INR').trim();
    const connectorsUsed = Array.isArray(req.body?.connectorsUsed) ? req.body.connectorsUsed.map(String) : [];
    const dataTextRaw = String(req.body?.dataText || '').trim();
    const businessContext = String(req.body?.businessContext || '').trim();

    if (!dataTextRaw && !businessContext) {
      return res.status(400).json({ error: 'Provide dataText or businessContext' });
    }

    const maxChars = 25_000;
    const dataText = dataTextRaw.length > maxChars ? dataTextRaw.slice(0, maxChars) : dataTextRaw;

    const cacheKey = crypto
      .createHash('sha256')
      .update(JSON.stringify({ kind: 'perf-scorecard', timeframe, currency, connectorsUsed, dataText, businessContext }))
      .digest('hex');

    const cached = cacheGet(cacheKey);
    if (cached) return res.json({ cached: true, result: cached });

    const systemPrompt = `You are a senior performance marketing analyst for India-focused brands.
Create a comprehensive Performance Scorecard using only the provided exports/notes (no assumptions of a data warehouse).
Output ONLY valid JSON (no markdown, no code fences, no extra keys).
Be compliance-safe for financial marketing: no guaranteed returns, no personalized investment advice.
If you must assume, list assumptions explicitly and keep them minimal.`;

    const schema = `{
  "timeframe": string,
  "currency": string,
  "assumptions": string[],
  "overallScore": number,
  "kpis": {
    "spend": number|null,
    "revenue": number|null,
    "roas": number|null,
    "leads": number|null,
    "customers": number|null,
    "cpa": number|null,
    "cpc": number|null,
    "ctr": number|null,
    "cvr": number|null
  },
  "sectionScores": [
    {"section": "Acquisition"|"Creative"|"Conversion"|"Retention"|"Measurement", "score": number, "notes": string[]}
  ],
  "channelBreakdown": [
    {"channel": string, "spend": number|null, "revenue": number|null, "roas": number|null, "cpa": number|null, "ctr": number|null, "cvr": number|null, "score": number, "notes": string}
  ],
  "benchmarks": [
    {"metric": string, "yourValue": string, "benchmark": string, "status": "above"|"near"|"below", "notes": string}
  ],
  "insights": string[],
  "recommendedActions": [
    {"title": string, "priority": "high"|"medium"|"low", "why": string, "how": string[], "metricToWatch": string}
  ],
  "forecast": {
    "horizon": string,
    "summary": string,
    "scenarios": [{"name": string, "assumption": string, "expectedOutcome": string}]
  },
  "reportHtml": string
}`;

    const userPrompt = `TIMEFRAME: ${timeframe}
CURRENCY: ${currency}
CONNECTORS USED: ${connectorsUsed.join(', ') || 'none'}

BUSINESS CONTEXT (optional):
${businessContext || '(none)'}

DATA (CSV/JSON export or notes):
${dataText || '(none)'}

Return JSON matching this schema exactly:
${schema}`;

    const model = process.env.GROQ_SCORECARD_MODEL || 'groq/compound';

    let rawText = await callGroqChatJson({
      apiKey: groqKey,
      model,
      systemPrompt,
      userPrompt,
      temperature: 0.35,
      maxTokens: 2600
    });

    let parsed = extractJsonFromText(rawText);
    if (!parsed) {
      rawText = await callGroqChatJson({
        apiKey: groqKey,
        model,
        systemPrompt: 'Return ONLY valid JSON. No markdown. No commentary. No code fences.',
        userPrompt: `Fix the following into valid JSON matching this schema exactly:\n\nSCHEMA:\n${schema}\n\nTEXT:\n${rawText}`,
        temperature: 0.2,
        maxTokens: 2600
      });
      parsed = extractJsonFromText(rawText);
    }

    if (!parsed) return res.status(500).json({ error: 'Unable to parse JSON from model response' });

    if (parsed && typeof parsed === 'object' && typeof parsed.reportHtml === 'string') {
      parsed.reportHtml = parsed.reportHtml.replace(/<script[\s\S]*?<\/script>/gi, '');
    }

    cacheSet(cacheKey, parsed);
    return res.json({ cached: false, result: parsed });
  } catch (error) {
    res.status(500).json({ error: 'Scorecard generation failed', details: error.message });
  }
});

// Company Intelligence: list companies
app.get('/api/company-intel/companies', (req, res) => {
  const db = readCompanyIntelDb();
  const companies = Object.values(db.companies || {}).sort((a, b) => {
    const aTs = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
    const bTs = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
    return bTs - aTs;
  });
  res.json({ companies });
});

	// Company Intelligence: create + ingest (website/company name)
app.post('/api/company-intel/companies', async (req, res) => {
  try {
    const companyName = String(req.body?.companyName || req.body?.name || '').trim();
    const websiteUrl = normalizeWebsiteUrl(req.body?.websiteUrl || req.body?.website || '');

    if (!companyName && !websiteUrl) {
      res.status(400).json({ error: 'Provide companyName or websiteUrl' });
      return;
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    let sourceHtml = '';
    let sourceText = '';
    let sourceMeta = { title: '', metaDescription: '', h1: [], h2: [] };
    let extractedLinks = [];
    let fetchInfo = null;

    if (websiteUrl) {
      const fetched = await fetchText(websiteUrl, { timeoutMs: 20000 });
      fetchInfo = { contentType: fetched.contentType, truncated: fetched.truncated };
      sourceHtml = fetched.text;
      sourceText = stripHtml(sourceHtml).slice(0, 15000);
      sourceMeta = extractHtmlMeta(sourceHtml);
      extractedLinks = extractLinksFromHtml(sourceHtml, websiteUrl);
    }

    const inferredName = inferCompanyName({ explicitName: companyName, websiteUrl, title: sourceMeta.title });
    const keyPages = extractKeyPages(extractedLinks);
    const socialLinks = extractSocialLinks(extractedLinks);

    // Fetch a few key pages (bounded) to give the LLM more signal for products/services
    const extraUrls = [keyPages.about, keyPages.productsOrServices, keyPages.pricing, keyPages.contact]
      .filter(Boolean)
      .slice(0, 3);

    const extraTexts = [];
    for (const u of extraUrls) {
      try {
        const fetched = await fetchText(u, { timeoutMs: 20000, maxBytes: 1_000_000 });
        extraTexts.push({
          url: u,
          title: extractHtmlMeta(fetched.text || '').title || '',
          excerpt: stripHtml(fetched.text || '').slice(0, 9000)
        });
      } catch {
        // ignore
      }
    }

    let profile = null;
    const groqKey = process.env.GROQ_API_KEY;
    const groqModel = process.env.GROQ_COMPANY_MODEL || 'groq/compound';

    if (groqKey && (companyName || websiteUrl)) {
      const systemPrompt = `You are a senior brand analyst and product marketing strategist.
Extract the company's products/services accurately from the provided website excerpts.
Return ONLY valid JSON. No markdown. No extra keys.`;

      const userPrompt = `Build a concise but information-rich company profile.
If company name is unknown, infer it from the domain/brand.

Inputs:
- Company name (may be unknown): ${companyName || '(unknown)'}
- Inferred brand name: ${inferredName}
- Website: ${websiteUrl || '(none)'}
- Homepage title: ${sourceMeta.title || '(unknown)'}
- Meta description: ${sourceMeta.metaDescription || '(none)'}
- H1: ${(sourceMeta.h1 || []).join(' | ') || '(none)'}
- H2: ${(sourceMeta.h2 || []).join(' | ') || '(none)'}
- Homepage excerpt:
${sourceText ? sourceText : '(none)'}

Extra pages (if available):
${extraTexts.length ? JSON.stringify(extraTexts, null, 2) : '(none)'}

Detected key pages:
${JSON.stringify(keyPages, null, 2)}

Detected social links:
${JSON.stringify(socialLinks, null, 2)}

Output JSON schema (MUST fill productsServices with 6-12 items if possible):
{
  "companyName": string,
  "websiteUrl": string | null,
  "summary": string,
  "industry": string,
  "geoFocus": string[],
  "productsServices": Array<{ "name": string, "category": string, "description": string, "targetCustomer": string, "differentiator": string }>,
  "offerings": string[],
  "primaryAudience": string[],
  "positioning": string,
  "brandVoice": { "tone": string, "style": string, "dos": string[], "donts": string[] },
  "keywords": string[],
  "complianceNotes": string[],
  "competitorsHint": string[],
  "keyPages": { "about": string | null, "productsOrServices": string | null, "pricing": string | null, "contact": string | null },
  "socialLinks": { "linkedin": string | null, "instagram": string | null, "youtube": string | null, "twitter": string | null },
  "sources": string[],
  "assumptions": string[]
}`;

      try {
        const raw = await callGroqChatJson({
          apiKey: groqKey,
          model: groqModel,
          systemPrompt,
          userPrompt,
          temperature: 0.35,
          maxTokens: 1800
        });
        profile = extractJsonFromText(raw);
      } catch {
        profile = null;
      }
    }

    const baseHeuristicProfile = {
      companyName: inferredName,
      websiteUrl: websiteUrl || null,
      summary: sourceMeta.metaDescription || sourceMeta.title || '',
      industry: inferIndustry({ title: sourceMeta.title, metaDescription: sourceMeta.metaDescription }),
      geoFocus: sourceMeta.title.toLowerCase().includes('india') || sourceMeta.metaDescription.toLowerCase().includes('india') ? ['India'] : ['India'],
      productsServices: [],
      offerings: inferOfferingsFromHeadings({ h1: sourceMeta.h1, h2: sourceMeta.h2 }),
      primaryAudience: [],
      positioning: sourceMeta.metaDescription || '',
      brandVoice: { tone: 'professional', style: 'clear', dos: [], donts: [] },
      keywords: [],
      complianceNotes: [],
      competitorsHint: [],
      keyPages,
      socialLinks,
      sources: [websiteUrl, ...extraUrls].filter(Boolean),
      assumptions: profile ? [] : ['Used website metadata extraction; AI enrichment unavailable or failed.']
    };

    if (!profile || typeof profile !== 'object') {
      profile = baseHeuristicProfile;
    } else {
      profile.keyPages = profile.keyPages && typeof profile.keyPages === 'object' ? profile.keyPages : keyPages;
      profile.socialLinks = profile.socialLinks && typeof profile.socialLinks === 'object' ? profile.socialLinks : socialLinks;
      profile.sources = Array.isArray(profile.sources) && profile.sources.length ? profile.sources : baseHeuristicProfile.sources;
      profile.summary = profile.summary || baseHeuristicProfile.summary;
      profile.industry = profile.industry || baseHeuristicProfile.industry;
      profile.geoFocus = Array.isArray(profile.geoFocus) && profile.geoFocus.length ? profile.geoFocus : baseHeuristicProfile.geoFocus;
      profile.offerings = Array.isArray(profile.offerings) && profile.offerings.length ? profile.offerings : baseHeuristicProfile.offerings;
      profile.primaryAudience = Array.isArray(profile.primaryAudience) ? profile.primaryAudience : baseHeuristicProfile.primaryAudience;
      profile.positioning = profile.positioning || baseHeuristicProfile.positioning;
      profile.brandVoice = profile.brandVoice && typeof profile.brandVoice === 'object' ? profile.brandVoice : baseHeuristicProfile.brandVoice;

      if (!Array.isArray(profile.productsServices) || profile.productsServices.length === 0) {
        const derivedFromOfferings = (baseHeuristicProfile.offerings || []).slice(0, 10).map((o) => ({
          name: String(o || '').slice(0, 80) || 'Service',
          category: baseHeuristicProfile.industry === 'unknown' ? 'Other' : baseHeuristicProfile.industry,
          description: '',
          targetCustomer: '',
          differentiator: ''
        }));
        profile.productsServices = derivedFromOfferings.length ? derivedFromOfferings : defaultProductsByIndustry(baseHeuristicProfile.industry);
      }
    }

	    const finalCompanyName = inferCompanyName({
	      explicitName: profile?.companyName || companyName,
	      websiteUrl: profile?.websiteUrl || websiteUrl,
	      title: sourceMeta.title
	    });

    const company = {
      id,
      companyName: finalCompanyName,
      websiteUrl: profile?.websiteUrl || websiteUrl || null,
      createdAt,
      updatedAt: createdAt,
      profile: profile || {
        companyName: finalCompanyName,
        websiteUrl: websiteUrl || null,
        summary: sourceMeta.metaDescription || '',
        industry: inferIndustry({ title: sourceMeta.title, metaDescription: sourceMeta.metaDescription }),
        geoFocus: sourceMeta.title.toLowerCase().includes('india') || sourceMeta.metaDescription.toLowerCase().includes('india') ? ['India'] : ['India'],
        productsServices: [],
        offerings: inferOfferingsFromHeadings({ h1: sourceMeta.h1, h2: sourceMeta.h2 }),
        primaryAudience: [],
        positioning: sourceMeta.metaDescription || '',
        brandVoice: { tone: 'professional', style: 'clear', dos: [], donts: [] },
        keywords: [],
        complianceNotes: [],
        competitorsHint: [],
        keyPages: extractKeyPages(extractedLinks),
        socialLinks: extractSocialLinks(extractedLinks),
        sources: websiteUrl ? [websiteUrl] : [],
        assumptions: ['Limited data; generated from minimal website metadata.']
      },
      sources: {
        fetchedAt: websiteUrl ? new Date().toISOString() : null,
        fetchInfo,
        meta: sourceMeta,
        textExcerpt: sourceText || '',
        linksExtracted: extractedLinks.slice(0, 60)
      }
    };

    const db = readCompanyIntelDb();
    db.companies[id] = company;
    writeCompanyIntelDb(db);

    res.json({ company });
  } catch (error) {
    res.status(500).json({ error: 'Company ingestion failed', details: error.message });
  }
});

// Company Intelligence: fetch one company (including stored artifacts)
app.get('/api/company-intel/companies/:id', (req, res) => {
  const id = String(req.params.id || '');
  const db = readCompanyIntelDb();
  const company = db.companies?.[id] || null;
  if (!company) {
    res.status(404).json({ error: 'Company not found' });
    return;
  }
  const artifacts = db.artifacts?.[id] || {};
  res.json({ company, artifacts });
});

function getArtifactSpec(type) {
  const specs = {
    competitor_intelligence: {
      label: 'Competitor Intelligence',
      schema: `{"topCompetitors":[{"name":string,"website":string|null,"whyRelevant":string,"positioningSnapshot":string,"strengths":string[],"weaknesses":string[]}],"comparison":{"yourDifferentiators":string[],"messagingGaps":string[],"opportunities":string[]},"notes":string[]}`
    },
    opportunities: {
      label: 'Opportunities',
      schema: `{"summary":string,"quickWins":[{"title":string,"priority":"high"|"medium"|"low","description":string,"expectedImpact":string,"timeToValue":string}],"opportunities":[{"title":string,"category":string,"priority":"high"|"medium"|"low","description":string,"expectedImpact":string,"effort":"low"|"medium"|"high","requirements":string[],"nextSteps":string[]}],"risksAndMitigations":[{"risk":string,"mitigation":string}],"90DayPlan":[{"week":number,"focus":string,"keyActivities":string[]}]}`
    },
    client_profiling: {
      label: 'Client Profiling Analytics',
      schema: `{"segments":[{"name":string,"profile":string,"jobsToBeDone":string[],"painPoints":string[],"objections":string[],"triggers":string[],"channels":string[]}],"insights":string[]}`
    },
    partner_profiling: {
      label: 'Partner Profiling Analytics',
      schema: `{"partnerTypes":[{"name":string,"valueExchange":string,"selectionCriteria":string[],"activationPlaybook":string[]}],"insights":string[]}`
    },
    icps: {
      label: 'ICPs / Cohorts',
      schema: `{"icps":[{"name":string,"who":string,"firmographics":string[],"psychographics":string[],"qualifiers":string[],"disqualifiers":string[],"hook":string,"channels":string[]}],"cohorts":[{"name":string,"definition":string,"priority":number,"messagingAngle":string}],"notes":string[]}`
    },
    social_calendar: {
      label: 'Social Media Content Calendar',
      schema: `{"timezone":string,"startDate":string,"weeks":number,"channels":string[],"cadence":{"postsPerWeek":number},"items":[{"date":string,"channel":string,"format":string,"pillar":string,"hook":string,"captionBrief":string,"cta":string,"assetNotes":string,"complianceNote":string}],"themes":string[]}`
    },
    marketing_strategy: {
      label: 'Marketing Strategy',
      schema: `{"objective":string,"targetSegments":string[],"positioning":string,"messagingPillars":string[],"funnelPlan":[{"stage":string,"goal":string,"channels":string[],"offers":string[]}],"kpis":string[],"90DayPlan":[{"week":number,"focus":string,"keyActivities":string[]}],"risksAndMitigations":string[]}`
    },
    content_strategy: {
      label: 'Content Strategy',
      schema: `{"contentPillars":[{"name":string,"purpose":string,"exampleTopics":string[]}],"formats":string[],"distributionRules":string[],"repurposingPlan":string[],"governance":{"reviewChecklist":string[]}}`
    },
    channel_strategy: {
      label: 'Channel Strategy',
      schema: `{"channels":[{"name":string,"role":string,"contentMix":string[],"cadence":string,"growthLoops":string[]}],"budgetSplitGuidance":string[],"measurement":string[]}`
    },
    lookalike_audiences: {
      label: 'Lookalike Audiences',
      schema: `{"seedAudiences":string[],"lookalikes":[{"platform":string,"targeting":string[],"exclusions":string[],"creativeAngles":string[]}],"measurement":string[]}`
    },
    lead_magnets: {
      label: 'Lead Magnets',
      schema: `{"leadMagnets":[{"name":string,"format":string,"promise":string,"outline":string[],"landingPageCopy":{"headline":string,"subheadline":string,"bullets":string[],"cta":string},"followUpSequence":[{"day":number,"subject":string,"goal":string}]}],"notes":string[]}`
    }
  };
  return specs[type] || null;
}

	// Company Intelligence: generate artifacts (strategy, calendar, ICPs, etc.)
	app.post('/api/company-intel/companies/:id/generate', async (req, res) => {
	  try {
	    const id = String(req.params.id || '');
	    const type = String(req.body?.type || '').trim();
	    const inputs = req.body?.inputs && typeof req.body.inputs === 'object' ? req.body.inputs : {};

    const spec = getArtifactSpec(type);
    if (!spec) {
      res.status(400).json({ error: 'Unknown type', supported: 'competitor_intelligence, opportunities, client_profiling, partner_profiling, icps, social_calendar, marketing_strategy, content_strategy, channel_strategy, lookalike_audiences, lead_magnets' });
      return;
    }

    const db = readCompanyIntelDb();
    const company = db.companies?.[id];
	    if (!company) {
	      res.status(404).json({ error: 'Company not found' });
	      return;
	    }

	    const groqKey = process.env.GROQ_API_KEY;
	    if (!groqKey) {
	      res.status(400).json({ error: 'GROQ_API_KEY not set' });
	      return;
	    }

	    const profile = company.profile || {};

	    const systemPrompt = `You are an expert growth marketer for India-focused brands.
	Generate the requested artifact: ${spec.label}.
	Return ONLY valid JSON (no markdown, no code fences, no extra keys).
	Prioritize clarity, measurability, and practical next steps.
	Keep compliance-safe for financial marketing: no guaranteed returns, no personalized investment advice.
	If you are unsure, still output the full schema with best-effort values.`;

	    const userPrompt = `Company profile (source: website/company input):
	${JSON.stringify(profile, null, 2)}
	
	Additional inputs (user provided):
	${JSON.stringify(inputs, null, 2)}
	
	Output MUST match this JSON schema exactly (keys and types):
	${spec.schema}`;

	    const requestedModel = process.env.GROQ_COMPANY_MODEL || 'groq/compound';
	    const modelCandidates = [
	      requestedModel,
	      'groq/compound-mini',
	      'llama-3.3-70b-versatile'
	    ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

	    let rawText = '';
	    let parsed = null;
	    let lastError = null;

	    for (const model of modelCandidates) {
	      try {
	        rawText = await callGroqChatJson({
	          apiKey: groqKey,
	          model,
	          systemPrompt,
	          userPrompt,
	          temperature: 0.4,
	          maxTokens: 2000
	        });
	        parsed = extractJsonFromText(rawText);
	        if (parsed) break;

	        // Repair attempt: ask to output strict JSON only
	        rawText = await callGroqChatJson({
	          apiKey: groqKey,
	          model,
	          systemPrompt: 'Return ONLY valid JSON. No markdown. No commentary. No code fences.',
	          userPrompt: `Fix the following into valid JSON matching this schema exactly:\n\nSCHEMA:\n${spec.schema}\n\nTEXT:\n${rawText}`,
	          temperature: 0.2,
	          maxTokens: 2000
	        });
	        parsed = extractJsonFromText(rawText);
	        if (parsed) break;
	      } catch (err) {
	        lastError = err;
	      }
	    }

	    if (!parsed) {
	      res.status(500).json({
	        error: 'Unable to parse JSON from model response',
	        details: lastError?.message || 'Unknown error'
	      });
	      return;
	    }

	    const now = new Date().toISOString();
	    db.artifacts[id] = db.artifacts[id] || {};
	    db.artifacts[id][type] = { type, updatedAt: now, data: parsed };
	    db.companies[id] = { ...company, updatedAt: now };
	    writeCompanyIntelDb(db);

    res.json({ artifact: db.artifacts[id][type] });
  } catch (error) {
    res.status(500).json({ error: 'Generation failed', details: error.message });
  }
});

// Execute full workflow (handles both enhanced-bulk-generator and social-media)
app.post('/api/workflow/execute', async (req, res) => {
  // Check if this is a social media request - if so, route to social media handler
  if (req.body.campaignType || req.body.contentType || req.body.useAvatar !== undefined || req.body.platforms) {
    // Call the social media execute handler directly
    return handleSocialMediaExecute(req, res);
  }

  // Enhanced-bulk-generator continues below...

  // Enhanced-bulk-generator workflow
  const encoder = new TextEncoder();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (data) => {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    res.write(message);
  };

  try {
    const { topicLimit = 1, category = 'derivatives', customTopic = '', customTitle = '', contentOutline = '' } = req.body;

    sendEvent({ log: '🔧 Initializing workflow execution...' });
    sendEvent({ log: `📊 Topic Limit: ${topicLimit}` });
    sendEvent({ log: `📂 Category Focus: ${category}` });

    if (customTopic) {
      sendEvent({ log: `✨ Custom Topic: "${customTopic}"` });
    }
    if (customTitle) {
      sendEvent({ log: `🚀 Custom Title: "${customTitle}"` });
    }
    if (contentOutline) {
      const lineCount = contentOutline.split('\n').length;
      sendEvent({ log: `📝 Content Outline: ${lineCount} lines provided` });
    }

    const args = [
      mainJsPath,
      'full',
      '--auto-approve',
      '--topic-limit',
      topicLimit.toString(),
      '--category',
      category,
    ];

    if (customTopic) {
      args.push('--custom-topic', customTopic);
    }
    if (customTitle) {
      args.push('--custom-title', customTitle);
    }
    if (contentOutline) {
      args.push('--content-outline-provided');
    }

    const envPath = path.resolve(__dirname, '..', '.env');
    const nodeEnv = {
      ...process.env,
      CONTENT_OUTLINE: contentOutline,
      ...(fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {})
    };

    const nodeProcess = spawn('node', args, {
      cwd: backendDir,
      env: nodeEnv,
    });

    let currentStage = 0;

    nodeProcess.stdout.on('data', (data) => {
      const output = data.toString();
      const lines = output.split('\n').filter(line => line.trim());

      for (const line of lines) {
        sendEvent({ log: line });

        const lowerLine = line.toLowerCase();

        // Stage detection logic
        if (lowerLine.includes('🎯 executing stage: research')) {
          sendEvent({ stage: 1, status: 'running', message: 'Analyzing competitors...' });
          currentStage = 1;
        } else if (lowerLine.includes('✅ research stage completed') || lowerLine.includes('✅ stage 1 complete')) {
          sendEvent({ stage: 1, status: 'completed', message: 'Research gaps identified' });
        } else if (lowerLine.includes('🎯 executing stage: topics')) {
          sendEvent({ stage: 2, status: 'running', message: 'Generating strategic topics...' });
          currentStage = 2;
        } else if (lowerLine.includes('✅ topic generation completed') || lowerLine.includes('✅ stage 2 complete')) {
          sendEvent({ stage: 2, status: 'completed', message: 'Topics generated' });
        } else if (lowerLine.includes('🎯 executing stage: deep-research')) {
          sendEvent({ stage: 3, status: 'running', message: 'Deep research in progress...' });
          currentStage = 3;
        } else if (lowerLine.includes('✅ deep research completed') || lowerLine.includes('✅ stage 3 complete')) {
          sendEvent({ stage: 3, status: 'completed', message: 'Deep research completed' });
        } else if (lowerLine.includes('🎯 executing stage: content')) {
          sendEvent({ stage: 4, status: 'running', message: 'Creating content...' });
          currentStage = 4;
        } else if (lowerLine.includes('✅ content creation completed') || lowerLine.includes('✅ stage 4 complete')) {
          sendEvent({ stage: 4, status: 'completed', message: 'Content created' });
        } else if (lowerLine.includes('🎯 executing stage: validation')) {
          sendEvent({ stage: 5, status: 'running', message: 'Validating content...' });
          currentStage = 5;
        } else if (lowerLine.includes('✅ content validation completed') || lowerLine.includes('✅ stage 5 complete')) {
          sendEvent({ stage: 5, status: 'completed', message: 'Content validated' });
        } else if (lowerLine.includes('🎯 executing stage: seo')) {
          sendEvent({ stage: 6, status: 'running', message: 'Optimizing SEO...' });
          currentStage = 6;
        } else if (lowerLine.includes('✅ seo optimization completed') || lowerLine.includes('✅ stage 6 complete')) {
          sendEvent({ stage: 6, status: 'completed', message: 'SEO optimized' });
        } else if (lowerLine.includes('🎯 executing stage: publication')) {
          sendEvent({ stage: 7, status: 'running', message: 'Publishing content...' });
          currentStage = 7;
        } else if (lowerLine.includes('✅ publication completed') || lowerLine.includes('✅ stage 7 complete')) {
          sendEvent({ stage: 7, status: 'completed', message: 'Content published' });
        } else if (lowerLine.includes('🎯 executing stage: completion')) {
          sendEvent({ stage: 8, status: 'running', message: 'Finalizing...' });
          currentStage = 8;
        } else if (lowerLine.includes('✅ workflow completed') || lowerLine.includes('✅ stage 8 complete')) {
          sendEvent({ stage: 8, status: 'completed', message: 'Workflow completed!' });
        }
      }
    });

    nodeProcess.stderr.on('data', (data) => {
      sendEvent({ log: `⚠️  ${data.toString()}` });
    });

    nodeProcess.on('close', (code) => {
      if (code === 0) {
        sendEvent({ log: '🎉 Workflow completed successfully!' });
        sendEvent({ stage: 8, status: 'completed', message: 'Workflow completed!' });
      } else {
        sendEvent({ log: `❌ Workflow exited with code ${code}` });
        sendEvent({ stage: currentStage || 1, status: 'error', message: `Process exited with code ${code}` });
      }
      res.end();
    });

    nodeProcess.on('error', (error) => {
      sendEvent({ log: `❌ Error: ${error.message}` });
      sendEvent({ stage: currentStage || 1, status: 'error', message: error.message });
      res.end();
    });

  } catch (error) {
    sendEvent({ log: `❌ Fatal error: ${error.message}` });
    sendEvent({ stage: 1, status: 'error', message: error.message });
    res.end();
  }
});

// Execute single stage
app.post('/api/workflow/stage', async (req, res) => {
  // Check if this is a social media request
  if ((req.body.stageId && req.body.campaignType) || req.body.contentType || req.body.useAvatar !== undefined || req.body.platforms) {
    // Route to social media stage handler
    return handleSocialMediaStage(req, res);
  }

  // Enhanced-bulk-generator stage
  const encoder = new TextEncoder();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (data) => {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    res.write(message);
  };

  try {
    const { stageId, topicLimit = 1, category = 'derivatives', customTopic = '', customTitle = '', contentOutline = '' } = req.body;

    const stageMap = {
      1: 'research',
      2: 'topics',
      3: 'deep-research',
      4: 'content',
      5: 'validation',
      6: 'seo',
      7: 'publication',
      8: 'completion'
    };

    const stageName = stageMap[stageId];
    if (!stageName) {
      sendEvent({ log: `❌ Invalid stage ID: ${stageId}` });
      res.end();
      return;
    }

    sendEvent({ log: `🚀 Starting Stage ${stageId}: ${stageName}...` });

    const args = [mainJsPath, 'stage', stageName];

    if (stageName === 'research' && customTopic) {
      args.push('--custom-topic', customTopic);
    } else if (stageName === 'topics') {
      args.push('--topic-limit', topicLimit.toString());
    }

    if (customTitle) {
      args.push('--custom-title', customTitle);
    }
    if (contentOutline) {
      args.push('--content-outline-provided');
    }

    const envPath = path.resolve(__dirname, '..', '.env');
    const nodeEnv = {
      ...process.env,
      CONTENT_OUTLINE: contentOutline,
      ...(fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {})
    };

    const nodeProcess = spawn('node', args, {
      cwd: backendDir,
      env: nodeEnv,
    });

    nodeProcess.stdout.on('data', (data) => {
      const output = data.toString();
      sendEvent({ log: output });
    });

    nodeProcess.stderr.on('data', (data) => {
      sendEvent({ log: `⚠️  ${data.toString()}` });
    });

    nodeProcess.on('close', (code) => {
      if (code === 0) {
        sendEvent({ stage: stageId, status: 'completed', message: 'Stage completed successfully' });
      } else {
        sendEvent({ stage: stageId, status: 'error', message: `Process exited with code ${code}` });
      }
      res.end();
    });

    nodeProcess.on('error', (error) => {
      sendEvent({ stage: stageId, status: 'error', message: error.message });
      res.end();
    });

  } catch (error) {
    sendEvent({ stage: stageId, status: 'error', message: error.message });
    res.end();
  }
});

// Get stage data
app.get('/api/workflow/data', async (req, res) => {
  try {
    const stage = parseInt(req.query.stage);
    const stageFiles = {
      1: 'research-gaps.csv',
      2: 'generated-topics.csv',
      3: 'topic-research.csv',
      4: 'created-content.csv',
      5: 'created-content.csv',
      6: 'created-content.csv',
      7: 'published-content.csv',
      8: 'workflow-status.csv'
    };

    const filename = stageFiles[stage];
    if (!filename) {
      return res.status(400).json({ error: 'Invalid stage' });
    }

    const csvPath = path.join(backendDir, 'data', filename);

    if (!fs.existsSync(csvPath)) {
      return res.json({ data: [], summary: { total: 0, showing: 0, approved: 0 }, file: filename });
    }

    // Read and parse CSV (simplified - you may want to use csv-parse)
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    const headers = lines[0]?.split(',') || [];
    const data = lines.slice(1).map(line => {
      const values = line.split(',');
      const row = {};
      headers.forEach((header, i) => {
        row[header.trim()] = values[i]?.trim() || '';
      });
      return row;
    });

    res.json({
      data: data.slice(-10), // Last 10 entries
      summary: {
        total: data.length,
        showing: Math.min(10, data.length),
        approved: data.filter(row => row.status === 'approved' || row.approved === 'true').length
      },
      file: filename
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Download CSV
app.get('/api/workflow/download-csv', async (req, res) => {
  try {
    const filename = req.query.filename;
    const csvPath = path.join(backendDir, 'data', filename);

    if (!fs.existsSync(csvPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.download(csvPath, filename);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Edit workflow data
app.post('/api/workflow/edit', async (req, res) => {
  try {
    const { stageId, rowIndex, data } = req.body;

    if (!stageId || rowIndex === undefined || !data) {
      return res.status(400).json({ error: 'Missing required fields: stageId, rowIndex, data' });
    }

    const STAGE_CSV_MAP = {
      1: 'research-gaps.csv',
      2: 'generated-topics.csv',
      3: 'topic-research.csv',
      4: 'created-content.csv',
      5: 'created-content.csv',
      6: 'created-content.csv',
      7: 'published-content.csv',
      8: 'workflow-status.csv'
    };

    const csvFile = STAGE_CSV_MAP[stageId];
    if (!csvFile) {
      return res.status(400).json({ error: 'Invalid stage ID' });
    }

    const csvPath = path.join(backendDir, 'data', csvFile);

    if (!fs.existsSync(csvPath)) {
      return res.status(404).json({ error: `CSV file not found: ${csvFile}` });
    }

    // Read and parse CSV
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      trim: true,
    });

    // Calculate actual index (rowIndex is relative to displayed data, which shows last 10)
    const actualIndex = records.length - 10 + rowIndex;

    if (actualIndex < 0 || actualIndex >= records.length) {
      return res.status(400).json({ error: `Invalid row index: ${rowIndex}` });
    }

    // Update the record with edited data
    records[actualIndex] = {
      ...records[actualIndex],
      ...data
    };

    // Convert back to CSV
    const updatedCsv = stringify(records, {
      header: true,
      columns: Object.keys(records[0])
    });

    // Write updated CSV back to file
    fs.writeFileSync(csvPath, updatedCsv, 'utf-8');

    res.json({
      success: true,
      message: `Successfully updated row ${rowIndex} in ${csvFile}`,
      stageId,
      rowIndex,
      file: csvFile
    });
  } catch (error) {
    console.error('Error updating CSV:', error);
    res.status(500).json({
      error: 'Failed to update CSV data',
      details: error.message
    });
  }
});

// Helper function to remove JSON metadata from markdown
function removeJsonMetadata(markdown) {
  if (!markdown) return '';
  let content = markdown;
  const articleEndMarkers = [
    /##\s*(?:Conclusion|Bottom\s+Line|Final\s+Thoughts|Summary|Takeaways|Next\s+Steps)/i,
    /##\s*FAQs?\s*(?:on|about)?/i,
    /---\s*$/m,
    /Ready\s+to\s+execute/i,
    /Open\s+your\s+PL\s+Capital\s+account/i
  ];

  let lastContentIndex = content.length;
  let foundEndMarker = false;

  for (const marker of articleEndMarkers) {
    const matches = Array.from(content.matchAll(new RegExp(marker.source, 'g')));
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      const afterMatch = content.substring(lastMatch.index + lastMatch[0].length);
      if (/["'][^"']+["']\s*:/.test(afterMatch)) {
        const jsonStartMatch = afterMatch.match(/["'][^"']+["']\s*:/);
        if (jsonStartMatch && jsonStartMatch.index !== undefined) {
          lastContentIndex = lastMatch.index + lastMatch[0].length + jsonStartMatch.index;
          foundEndMarker = true;
          break;
        }
      }
    }
  }

  if (foundEndMarker && lastContentIndex < content.length) {
    content = content.substring(0, lastContentIndex).trim();
  } else {
    content = content.replace(/["']content_upgrades["']\s*:\s*\[[\s\S]*?\]/gi, '');
    content = content.replace(/["']compliance["']\s*:\s*"[^"]*"/gi, '');
    content = content.replace(/["']quality_metrics["']\s*:\s*\{[\s\S]*?\}/gi, '');
    content = content.replace(/["'][^"']+["']\s*:\s*(?:\[[\s\S]*?\]|\{[\s\S]*?\}|"[^"]*"|\d+)/g, '');
  }

  content = content.replace(/\n{3,}/g, '\n\n').trim();
  return content;
}

// Helper function to format markdown
function formatMarkdown(content, primaryKeyword = null) {
  const { article_content, compliance } = content;
  let seo_metadata = {};
  try {
    seo_metadata = typeof content.seo_metadata === 'string'
      ? JSON.parse(content.seo_metadata)
      : content.seo_metadata;
  } catch (error) {
    console.warn('⚠️  Failed to parse seo_metadata, using defaults');
  }

  let markdown = '';
  if (seo_metadata?.title) {
    markdown += `# ${seo_metadata.title}\n\n`;
  }

  let normalizedArticleContent = article_content || '';
  if (typeof normalizedArticleContent === 'string') {
    normalizedArticleContent = normalizedArticleContent.replace(/\\n/g, '\n');
  }
  normalizedArticleContent = removeJsonMetadata(normalizedArticleContent);
  markdown += normalizedArticleContent;

  if (compliance) {
    markdown += `\n\n---\n\n${compliance}`;
  }

  markdown += '\n\n---\n\n## SEO Metadata\n\n';
  if (seo_metadata?.title) {
    markdown += `### SEO Meta Title\n\`\`\`\n${seo_metadata.title}\n\`\`\`\n\n`;
  }
  if (seo_metadata?.meta_description) {
    markdown += `### SEO Meta Description\n\`\`\`\n${seo_metadata.meta_description}\n\`\`\`\n\n`;
  }
  if (seo_metadata?.focus_keyphrase) {
    markdown += `### Focus Keyword\n\`\`\`\n${seo_metadata.focus_keyphrase}\n\`\`\`\n\n`;
  }
  if (seo_metadata?.secondary_keywords && seo_metadata.secondary_keywords.length > 0) {
    markdown += `### Secondary Keywords\n\`\`\`\n${seo_metadata.secondary_keywords.join(', ')}\n\`\`\`\n\n`;
  }

  const keyword = primaryKeyword || content.primary_keyword || content.topic_id || 'article';
  const slug = keyword.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
  const canonicalUrl = `https://www.plindia.com/blog/${slug}`;
  markdown += `### SEO Optimized URL\n\`\`\`\n${canonicalUrl}\n\`\`\`\n\n`;

  return markdown;
}

// Download Markdown
app.get('/api/workflow/download-markdown', async (req, res) => {
  try {
    const contentId = req.query.contentId;
    if (!contentId) {
      return res.status(400).json({ error: 'contentId parameter is required' });
    }

    const possiblePaths = [
      path.join(backendDir, 'data', 'created-content.csv'),
      path.join(__dirname, '..', 'data', 'created-content.csv'),
    ];

    const csvPath = possiblePaths.find(p => fs.existsSync(p));
    if (!csvPath) {
      return res.status(404).json({ error: 'created-content.csv not found' });
    }

    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    const content = records.find((r) => r.content_id === contentId);
    if (!content) {
      return res.status(404).json({ error: `Content not found: ${contentId}` });
    }

    const markdownContent = formatMarkdown(content, content.primary_keyword);
    let seoMeta = {};
    try {
      seoMeta = JSON.parse(content.seo_metadata || '{}');
    } catch (e) {}

    const sanitizedTitle = (seoMeta.title || content.topic_id || 'article')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const filename = `${sanitizedTitle}.md`;

    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.send(markdownContent);
  } catch (error) {
    console.error('Markdown download error:', error);
    res.status(500).json({
      error: 'Failed to download markdown file',
      message: error.message
    });
  }
});

// Helper function to convert markdown to HTML
function markdownToHtml(markdown, title = 'Article', metaDescription = '') {
  if (!markdown) return '';
  let html = markdown;
  html = html.replace(/### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/# (.*$)/gim, '<h1>$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/^\* (.+)$/gim, '<li>$1</li>');
  html = html.replace(/^- (.+)$/gim, '<li>$1</li>');
  html = html.replace(/(<li>.*?<\/li>\n?)+/g, (match) => '<ul>\n' + match + '</ul>\n');
  html = html.replace(/^---$/gim, '<hr>');
  const lines = html.split('\n');
  const processedLines = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) {
      processedLines.push('<br>');
      continue;
    }
    if (line.startsWith('<')) {
      processedLines.push(line);
      continue;
    }
    processedLines.push('<p>' + line + '</p>');
  }
  html = processedLines.join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${metaDescription}">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; color: #333; }
    h1, h2, h3 { margin-top: 1.5em; color: #2c3e50; }
    h1 { font-size: 2em; }
    h2 { font-size: 1.5em; border-bottom: 2px solid #eee; padding-bottom: 0.3em; }
    h3 { font-size: 1.25em; }
    p { margin: 1em 0; }
    ul, ol { margin: 1em 0; padding-left: 2em; }
    li { margin: 0.5em 0; }
    a { color: #3498db; text-decoration: none; }
    a:hover { text-decoration: underline; }
    hr { border: none; border-top: 2px solid #eee; margin: 2em 0; }
  </style>
</head>
<body>
${html}
</body>
</html>`;
}

// Download HTML
app.get('/api/workflow/download-html', async (req, res) => {
  try {
    const contentId = req.query.contentId;
    if (!contentId) {
      return res.status(400).json({ error: 'contentId parameter is required' });
    }

    const possiblePaths = [
      path.join(backendDir, 'data', 'created-content.csv'),
      path.join(__dirname, '..', 'data', 'created-content.csv'),
    ];

    const csvPath = possiblePaths.find(p => fs.existsSync(p));
    if (!csvPath) {
      return res.status(404).json({ error: 'created-content.csv not found' });
    }

    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    const content = records.find((r) => r.content_id === contentId);
    if (!content) {
      return res.status(404).json({ error: `Content not found: ${contentId}` });
    }

    let markdownContent = content.article_content || '';
    if (typeof markdownContent === 'string') {
      markdownContent = markdownContent.replace(/\\n/g, '\n');
    }
    markdownContent = removeJsonMetadata(markdownContent);

    let seoMeta = {};
    try {
      seoMeta = JSON.parse(content.seo_metadata || '{}');
    } catch (e) {}

    const title = seoMeta.title || 'Article';
    const metaDescription = seoMeta.meta_description || '';
    const htmlContent = markdownToHtml(markdownContent, title, metaDescription);

    const sanitizedTitle = (seoMeta.title || content.topic_id || 'article')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const filename = `${sanitizedTitle}-${contentId}.html`;

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.send(htmlContent);
  } catch (error) {
    console.error('HTML download error:', error);
    res.status(500).json({
      error: 'Failed to download HTML file',
      message: error.message
    });
  }
});

// Download Raw Markdown
app.get('/api/workflow/download-raw-markdown', async (req, res) => {
  try {
    const contentId = req.query.contentId;
    if (!contentId) {
      return res.status(400).json({ error: 'contentId parameter is required' });
    }

    const possiblePaths = [
      path.join(backendDir, 'data', 'created-content.csv'),
      path.join(__dirname, '..', 'data', 'created-content.csv'),
    ];

    const csvPath = possiblePaths.find(p => fs.existsSync(p));
    if (!csvPath) {
      return res.status(404).json({ error: 'created-content.csv not found' });
    }

    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    const content = records.find((r) => r.content_id === contentId);
    if (!content) {
      return res.status(404).json({ error: `Content not found: ${contentId}` });
    }

    const topicId = content.topic_id || 'unknown';
    const rawResponsesPaths = [
      path.join(backendDir, 'data', 'raw-responses'),
      path.join(__dirname, '..', 'data', 'raw-responses'),
    ];

    let rawResponseContent = null;
    for (const rawDir of rawResponsesPaths) {
      if (fs.existsSync(rawDir)) {
        try {
          const files = fs.readdirSync(rawDir).filter((f) => f.endsWith('.md'));
          let matchingFiles = files.filter((file) => file.startsWith(`${topicId}_`));
          if (matchingFiles.length === 0) {
            for (const file of files) {
              try {
                const filePath = path.join(rawDir, file);
                const fileContent = fs.readFileSync(filePath, 'utf-8');
                if (fileContent.includes(`Topic ID: ${topicId}`) || fileContent.includes(`content_id: ${contentId}`)) {
                  matchingFiles.push(file);
                }
              } catch (err) {
                continue;
              }
            }
          }
          if (matchingFiles.length > 0) {
            const sortedFiles = matchingFiles.sort().reverse();
            const rawResponsePath = path.join(rawDir, sortedFiles[0]);
            rawResponseContent = fs.readFileSync(rawResponsePath, 'utf-8');
            break;
          }
        } catch (error) {
          console.warn(`⚠️  Error reading raw-responses directory ${rawDir}:`, error);
        }
      }
    }

    if (!rawResponseContent) {
      return res.status(404).json({
        error: `Raw response file not found for content_id: ${contentId}`,
        message: 'The raw AI response file for this content was not found.'
      });
    }

    let seoMeta = {};
    try {
      seoMeta = JSON.parse(content.seo_metadata || '{}');
    } catch (e) {}

    const sanitizedTitle = (seoMeta.title || content.topic_id || 'article')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const filename = `${sanitizedTitle}-raw.md`;

    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.send(rawResponseContent);
  } catch (error) {
    console.error('Raw markdown download error:', error);
    res.status(500).json({
      error: 'Failed to download raw markdown file',
      message: error.message
    });
  }
});

// ============================================================================
// SOCIAL MEDIA API ROUTES
// ============================================================================

// Social Media backend directory
const socialMediaBackendDir = path.join(__dirname, '..', 'social-media-frontend', 'frontend', 'backend');
const socialMediaMainJsPath = path.join(socialMediaBackendDir, 'main.js');

// Helper function to save stage data for social media
function saveSocialMediaStageData(stageId, data) {
  try {
    const stateFilePath = path.join(socialMediaBackendDir, 'data', 'workflow-state.json');

    let state = {
      campaigns: {},
      content: {},
      visuals: {},
      videos: {},
      published: {},
      metrics: {}
    };

    if (fs.existsSync(stateFilePath)) {
      const stateContent = fs.readFileSync(stateFilePath, 'utf-8');
      state = JSON.parse(stateContent);
    }

    const timestamp = Date.now();
    const id = `${stageId}-${timestamp}`;

    const stageKeys = {
      1: 'campaigns',
      2: 'content',
      3: 'visuals',
      4: 'videos',
      5: 'published',
      6: 'metrics'
    };

    const key = stageKeys[stageId];
    if (key) {
      state[key][id] = {
        id,
        ...data,
        stageId,
        completedAt: new Date().toISOString()
      };
    }

    // Ensure data directory exists
    const dataDir = path.dirname(stateFilePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2));
    console.log(`[Social Media] Saved stage ${stageId} data:`, id);
  } catch (error) {
    console.error('[Social Media] Error saving stage data:', error);
  }
}

function readSocialMediaWorkflowState() {
  try {
    const stateFilePath = path.join(socialMediaBackendDir, 'data', 'workflow-state.json');
    if (!fs.existsSync(stateFilePath)) return null;
    const stateContent = fs.readFileSync(stateFilePath, 'utf-8');
    return JSON.parse(stateContent);
  } catch (error) {
    console.error('[Social Media] Error reading workflow state:', error);
    return null;
  }
}

function getLatestSocialMediaStateEntry(state, key, predicate) {
  try {
    if (!state || !state[key]) return null;
    const entries = Object.values(state[key]);
    const filtered = typeof predicate === 'function' ? entries.filter(predicate) : entries;
    const sorted = filtered.sort(
      (a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime()
    );
    return sorted[0] || null;
  } catch (error) {
    console.error('[Social Media] Error getting latest stage entry:', error);
    return null;
  }
}

async function callGeminiGenerateContent({ apiKey, model, prompt, temperature = 0.7, maxOutputTokens = 1400 }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens }
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text).filter(Boolean).join('\n').trim();
}

async function callGeminiGenerateContentJson({
  apiKey,
  model,
  prompt,
  temperature = 0.7,
  maxOutputTokens = 1400
}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens, responseMimeType: 'application/json' }
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text).filter(Boolean).join('\n').trim();
}

async function callGeminiGenerateContentJsonWithTools({
  apiKey,
  model,
  prompt,
  temperature = 0.7,
  maxOutputTokens = 1600,
  tools = []
}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools,
      generationConfig: { temperature, maxOutputTokens, responseMimeType: 'application/json' }
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text).filter(Boolean).join('\n').trim();
}

async function callGroqChatJson({
  apiKey,
  model,
  systemPrompt,
  userPrompt,
  temperature = 0.4,
  maxTokens = 1600
}) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature,
      max_tokens: maxTokens
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Groq API error: ${response.status}`);
  }

  const data = await response.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}

function extractJsonFromText(text) {
  if (!text) return null;

  // 1) Code-fence extraction (common LLM behavior)
  const fenceMatch =
    text.match(/```json\s*([\s\S]*?)\s*```/i) ||
    text.match(/```\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {
      // continue
    }
  }

  // 2) Try parsing the whole response as JSON
  try {
    return JSON.parse(text);
  } catch {
    // continue
  }

  // 3) Robust JSON object extraction: scan for the first complete JSON object,
  // respecting strings/escapes (handles embedded CSS braces in HTML strings).
  const len = text.length;
  let start = -1;
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < len; i++) {
    const ch = text[i];

    if (start === -1) {
      if (ch === '{') {
        start = i;
        depth = 1;
        inString = false;
        escape = false;
      }
      continue;
    }

    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') depth++;
    if (ch === '}') depth--;

    if (depth === 0) {
      const candidate = text.slice(start, i + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        // Continue searching for another JSON object start
        start = -1;
        depth = 0;
        inString = false;
        escape = false;
      }
    }
  }

  return null;
}

function extractLastMatch(text, regex) {
  if (!text) return null;
  let match = null;
  for (const m of text.matchAll(regex)) {
    match = m;
  }
  return match;
}

function extractImgBbUrlFromOutput(output) {
  const m = extractLastMatch(output, /(https?:\/\/[^\s]+imgbb\.com[^\s]*)/gi);
  if (!m) return null;
  return (m[1] || m[0] || '').replace(/[),.;\]]+$/g, '');
}

function extractVisualImagePathFromOutput(output) {
  const m =
    extractLastMatch(output, /✅\s*Visual generated:\s*(\/[^\s]+?\.(png|jpg|jpeg|webp))/gi) ||
    extractLastMatch(output, /(\/tmp\/[^\s]+?\.(png|jpg|jpeg|webp))/gi);
  if (!m) return null;
  return (m[1] || m[0] || '').replace(/[),.;\]]+$/g, '');
}

function extractCloudinaryUrlFromOutput(output) {
  const m = extractLastMatch(
    output,
    /(https?:\/\/(?:res\.)?cloudinary\.com\/[^\s]+?\.(mp4|mov|webm)(?:\?[^\s]*)?)/gi
  );
  if (!m) return null;
  return (m[1] || m[0] || '').replace(/[),.;\]]+$/g, '');
}

function extractHttpVideoUrlFromOutput(output) {
  const m = extractLastMatch(
    output,
    /(https?:\/\/[^\s]+?\.(mp4|mov|webm)(?:\?[^\s]*)?)/gi
  );
  if (!m) return null;
  return (m[1] || m[0] || '').replace(/[),.;\]]+$/g, '');
}

function extractVideoPathFromOutput(output) {
  const m =
    extractLastMatch(output, /✅\s*Video saved to\s*(\/[^\s]+?\.(mp4|mov|webm))/gi) ||
    extractLastMatch(output, /(\/tmp\/[^\s]+?\.(mp4|mov|webm))/gi);
  if (!m) return null;
  return (m[1] || m[0] || '').replace(/[),.;\]]+$/g, '');
}

// Social Media: Execute full workflow - extracted as reusable function
async function handleSocialMediaExecute(req, res) {
  const encoder = new TextEncoder();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (data) => {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    res.write(message);
  };

  try {
    const {
      campaignType,
      platforms = [],
      topic,
      duration = 90,
      useVeo = true,
      useAvatar = true,
      autoPublish = false,
      contentType,
      aspectRatio = '16:9',
      language = 'english',
      avatarId,
      avatarScriptText,
      avatarVoiceId,
      heygenAvatarGroupId
    } = req.body;

    const finalUseAvatar = contentType === 'avatar-video' ? true : (contentType === 'faceless-video' ? false : useAvatar);

    sendEvent({ log: '🚀 Starting full campaign workflow...' });
    sendEvent({ log: `Campaign: ${campaignType}` });
    sendEvent({ log: `Topic: ${topic}` });
    sendEvent({ log: `Platforms: ${platforms.join(', ')}` });

    if (!fs.existsSync(socialMediaMainJsPath)) {
      sendEvent({ log: `❌ Social Media backend not found at: ${socialMediaMainJsPath}` });
      res.end();
      return;
    }

    const args = [
      socialMediaMainJsPath,
      'campaign',
      campaignType,
      '--topic', topic,
      '--duration', duration.toString(),
      '--aspect-ratio', aspectRatio,
      '--language', language
    ];

    if (useVeo) args.push('--use-veo');
    if (finalUseAvatar) {
      args.push('--use-avatar');
      if (avatarId) args.push('--avatar-id', avatarId);
      if (avatarScriptText) args.push('--avatar-script', avatarScriptText);
      if (avatarVoiceId) args.push('--avatar-voice', avatarVoiceId);
      if (heygenAvatarGroupId) args.push('--heygen-avatar-group-id', heygenAvatarGroupId);
    } else {
      args.push('--no-avatar');
    }
    if (autoPublish) args.push('--auto-publish');

    platforms.forEach((platform) => {
      args.push('--platform', platform);
    });

	    const envPath = path.resolve(__dirname, '..', '.env');
	    const nodeEnv = {
	      ...process.env,
	      NODE_PATH: path.join(__dirname, '..', 'node_modules') + (process.env.NODE_PATH ? ':' + process.env.NODE_PATH : ''),
	      ...(fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {})
	    };

    sendEvent({ log: `🚀 Command: node ${args.slice(1).join(' ')}` });

    const nodeProcess = spawn('node', args, {
      cwd: socialMediaBackendDir,
      env: nodeEnv,
    });

    let currentStage = 1;
    let outputBuffer = '';

	    nodeProcess.stdout.on('data', (data) => {
	      const output = data.toString();
	      outputBuffer += output;
	      sendEvent({ log: output.trim() });

      // Parse stage progression
      if (output.includes('Stage 1:') || output.includes('Planning')) {
        currentStage = 1;
        sendEvent({ stage: 1, status: 'running', message: 'Generating campaign plan...' });
      } else if (output.includes('Stage 2:') || output.includes('Content')) {
        if (currentStage === 1) {
          const cleanOutput = extractPromptFromOutput(outputBuffer, 1);
          saveSocialMediaStageData(1, {
            type: 'campaign-planning',
            topic,
            campaignType,
            platforms,
            status: 'completed',
            output: cleanOutput // Save extracted prompt, not full logs
          });
          sendEvent({ stage: 1, status: 'completed', message: 'Plan created' });
        }
        currentStage = 2;
        sendEvent({ stage: 2, status: 'running', message: 'Generating scripts & captions...' });
      } else if (output.includes('Stage 3:') || output.includes('Visual')) {
        if (currentStage === 2) {
          const cleanOutput = extractPromptFromOutput(outputBuffer, 2);
          saveSocialMediaStageData(2, {
            type: 'content-generation',
            topic,
            campaignType,
            status: 'completed',
            output: cleanOutput // Save extracted prompt, not full logs
          });
          sendEvent({ stage: 2, status: 'completed', message: 'Content generated' });
        }
        currentStage = 3;
        sendEvent({ stage: 3, status: 'running', message: 'Creating visual assets...' });
      } else if (output.includes('Stage 4:') || output.includes('Video')) {
        if (currentStage === 3) {
          const cleanOutput = extractPromptFromOutput(outputBuffer, 3);
          saveSocialMediaStageData(3, {
            type: 'visual-assets',
            topic,
            campaignType,
            status: 'completed',
            output: cleanOutput // Save extracted prompt, not full logs
          });
          sendEvent({ stage: 3, status: 'completed', message: 'Assets created' });
        }
        currentStage = 4;
        sendEvent({ stage: 4, status: 'running', message: 'Producing video...' });
      } else if (output.includes('Stage 5:') || output.includes('Publishing')) {
        if (currentStage === 4) {
          const cleanOutput = extractPromptFromOutput(outputBuffer, 4);
          saveSocialMediaStageData(4, {
            type: 'video-production',
            topic,
            campaignType,
            duration,
            useVeo,
            useAvatar: finalUseAvatar,
            status: 'completed',
            output: cleanOutput // Save extracted prompt, not full logs
          });
          sendEvent({ stage: 4, status: 'completed', message: 'Video produced' });
        }
        currentStage = 5;
        sendEvent({ stage: 5, status: 'running', message: 'Publishing to platforms...' });
      } else if (output.includes('Stage 6:') || output.includes('Analytics')) {
        if (currentStage === 5) {
          const cleanOutput = extractPromptFromOutput(outputBuffer, 5);
          saveSocialMediaStageData(5, {
            type: 'publishing',
            topic,
            campaignType,
            platforms,
            status: 'completed',
            output: cleanOutput // Save extracted prompt, not full logs
          });
          sendEvent({ stage: 5, status: 'completed', message: 'Published' });
        }
        currentStage = 6;
        sendEvent({ stage: 6, status: 'running', message: 'Setting up tracking...' });
      }

      // Extract campaign data
      if (output.includes('Campaign ID:')) {
        const campaignId = output.match(/Campaign ID:\s*(\S+)/)?.[1];
        if (campaignId) {
          sendEvent({ campaignData: { campaignId } });
        }
      }

      // Extract published URLs
      if (output.includes('Published to')) {
        const urlMatch = output.match(/(https?:\/\/[^\s]+)/);
        if (urlMatch) {
          const platform = output.toLowerCase().includes('linkedin') ? 'linkedin' :
                         output.toLowerCase().includes('instagram') ? 'instagram' :
                         output.toLowerCase().includes('youtube') ? 'youtube' :
                         output.toLowerCase().includes('facebook') ? 'facebook' :
                         output.toLowerCase().includes('twitter') ? 'twitter' : 'unknown';
          sendEvent({ campaignData: { publishedUrls: { [platform]: urlMatch[1] } } });
        }
      }
    });

    nodeProcess.stderr.on('data', (data) => {
      sendEvent({ log: `⚠️  ${data.toString()}` });
    });

    nodeProcess.on('close', (code) => {
      if (code === 0) {
        sendEvent({ log: '🎉 Campaign workflow completed successfully!' });
        sendEvent({ stage: 6, status: 'completed', message: 'Workflow completed!' });
      } else {
        sendEvent({ log: `❌ Workflow exited with code ${code}` });
        sendEvent({ stage: currentStage || 1, status: 'error', message: `Process exited with code ${code}` });
      }
      res.end();
    });

    nodeProcess.on('error', (error) => {
      sendEvent({ log: `❌ Error: ${error.message}` });
      sendEvent({ stage: currentStage || 1, status: 'error', message: error.message });
      res.end();
    });

  } catch (error) {
    sendEvent({ log: `❌ Fatal error: ${error.message}` });
    sendEvent({ stage: 1, status: 'error', message: error.message });
    res.end();
  }
}

// Register the route handler
app.post('/api/workflow/social-media/execute', handleSocialMediaExecute);

// Helper function to extract creative brief/prompt from output buffer
// Removes logs, ASCII art, and other noise, keeping only the actual prompt content
function extractPromptFromOutput(outputBuffer, stageId) {
  if (!outputBuffer || typeof outputBuffer !== 'string') {
    return outputBuffer || '';
  }

  // For Stage 1 (Planning), extract the creative brief
  if (stageId === 1) {
    // Look for the creative brief markers
    const markers = [
      '✅ Creative Brief Generated:',
      'Campaign Brief:',
      '**Campaign Brief:**',
      'Campaign Overview'
    ];

    let startIndex = -1;
    for (const marker of markers) {
      const index = outputBuffer.indexOf(marker);
      if (index !== -1) {
        startIndex = index + marker.length;
        break;
      }
    }

    // If we found a start marker, extract from there
    if (startIndex !== -1) {
      let content = outputBuffer.substring(startIndex).trim();

      // Remove trailing completion messages
      const endMarkers = [
        '✅ Stage "planning" completed',
        '✅ Stage "planning" completed!',
        '✅ Stage completed',
        '✅ Stage completed!',
        '\n✅',
        '\n🎉'
      ];

      for (const endMarker of endMarkers) {
        const endIndex = content.indexOf(endMarker);
        if (endIndex !== -1) {
          content = content.substring(0, endIndex).trim();
          break;
        }
      }

      // Clean up: remove any leading/trailing whitespace and empty lines
      content = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n')
        .trim();

      // If we extracted meaningful content, return it
      if (content.length > 50) {
        return content;
      }
    }
  }

  // For Stage 3 (Visuals), extract hosted image URL (e.g., ImgBB)
  if (stageId === 3) {
    // Look for ImgBB URL in the output - multiple patterns to catch different formats
    const imgbbPatterns = [
      // Pattern 1: "Uploaded to ImgBB: https://..."
      /Uploaded to ImgBB:\s*(https?:\/\/[^\s\n"<>]+)/i,
      // Pattern 2: Direct i.ibb.co URL (most common format)
      /(https?:\/\/i\.ibb\.co\/[a-zA-Z0-9\/]+\.(jpg|jpeg|png|gif|webp))/i,
      // Pattern 3: Any URL containing imgbb
      /(https?:\/\/[^\s\n"<>]*imgbb[^\s\n"<>]*)/i,
      // Pattern 4: Generic image hosting URL pattern
      /(https?:\/\/[^\s\n"<>]+\.(jpg|jpeg|png|gif|webp))/i
    ];

    for (const pattern of imgbbPatterns) {
      const match = outputBuffer.match(pattern);
      if (match) {
        const url = match[1] || match[0];
        // Clean up the URL (remove trailing punctuation, newlines, etc.)
        let cleanUrl = url.trim();
        // Remove trailing non-URL characters
        cleanUrl = cleanUrl.replace(/[.,;:!?)\]\}]+$/, '');
        // Remove any trailing whitespace or newlines
        cleanUrl = cleanUrl.replace(/[\s\n\r]+$/, '');

        if (cleanUrl.startsWith('http') && cleanUrl.length > 10) {
          return cleanUrl;
        }
      }
    }
  }

  // For other stages or if extraction failed, try to find markdown content
  // Look for markdown patterns (headers, lists, etc.)
  const markdownPattern = /(?:^|\n)(?:#{1,6}\s+|[-*+]\s+|^\d+\.\s+)/m;
  const markdownMatch = outputBuffer.match(markdownPattern);

  if (markdownMatch) {
    const markdownStart = outputBuffer.indexOf(markdownMatch[0]);
    let markdownContent = outputBuffer.substring(markdownStart).trim();

    // Remove trailing completion messages
    const endMarkers = ['✅ Stage', '✅', '🎉', 'completed'];
    for (const endMarker of endMarkers) {
      const endIndex = markdownContent.lastIndexOf(endMarker);
      if (endIndex !== -1 && endIndex > markdownContent.length / 2) {
        markdownContent = markdownContent.substring(0, endIndex).trim();
        break;
      }
    }

    if (markdownContent.length > 50) {
      return markdownContent.trim();
    }
  }

  // Fallback: return the original output if we can't extract clean content
  return outputBuffer;
}

// Helper function to handle social media stage
async function handleSocialMediaStage(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (data) => {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    res.write(message);
  };

  try {
    const {
      stageId,
      campaignType,
      purpose,
      platforms = [],
      topic,
      duration = 90,
      useVeo = true,
      useAvatar = true,
      contentType,
      aspectRatio = '16:9',
      language = 'english',
      files,
      avatarId,
      avatarScriptText,
      avatarVoiceId,
      heygenAvatarGroupId,
      brandSettings,
      promptOverride,
      frameInterpolation,
      longCatConfig,
      targetAudience
    } = req.body;

    const stageIdNum = Number(stageId);

    const finalUseAvatar = contentType === 'avatar-video' ? true : (contentType === 'faceless-video' ? false : useAvatar);

    const stageNames = {
      1: 'planning',
      2: 'content',
      3: 'visuals',
      4: 'video',
      5: 'publishing',
      6: 'tracking'
    };

    const stageName = stageNames[stageIdNum];
    if (!stageName) {
      sendEvent({ log: `❌ Invalid stage ID: ${stageId}` });
      res.end();
      return;
    }

    sendEvent({ log: `🚀 Starting Stage ${stageIdNum}: ${stageName}...` });
    sendEvent({ stage: stageIdNum, status: 'running', message: `Executing ${stageName}...` });

    // Stage 1: Campaign Planning (generate creative prompt/brief here for UI consumption)
    // Rationale: the vendored social-media backend CLI doesn't implement a dedicated topic/prompt generator command,
    // and the UI expects Stage 1 to produce an editable creative prompt payload (creativePrompt/output).
	    if (stageIdNum === 1) {
      try {
        const groqKey = process.env.GROQ_API_KEY;
        const platformList = Array.isArray(platforms) ? platforms : [];

        if (!groqKey) {
          const fallback = `## Campaign Planning\n\n**Campaign Type:** ${campaignType}\n\n**Purpose:** ${purpose || 'brand-awareness'}\n\n**Target Audience:** ${targetAudience || 'all_clients'}\n\n**Platforms:** ${platformList.join(', ') || 'linkedin'}\n\n**Topic:** ${topic}\n\n### Creative Prompt\nDraft a concise, compliant campaign brief for PL Capital.`;

          const stageData = {
            type: 'campaign-planning',
            topic,
            campaignType,
            purpose,
            targetAudience,
            platforms: platformList,
            language,
            status: 'completed',
            creativePrompt: fallback,
            output: fallback
          };

          saveSocialMediaStageData(stageIdNum, stageData);
          sendEvent({ log: '⚠️ GROQ_API_KEY not set; using fallback planning prompt.' });
          sendEvent({ stage: stageIdNum, status: 'completed', message: `${stageName} completed`, data: stageData });
          res.end();
          return;
        }

        sendEvent({ log: '🧠 Generating creative prompt for campaign planning...' });

        const systemPrompt = `You are a senior campaign strategist and creative director for PL Capital (financial services, India).
Generate a campaign planning brief and a reusable creative prompt for downstream content generation.
Output MUST be markdown (not JSON).`;

        const userPrompt = `Create Stage 1 output for the Social Media workflow.

Inputs:
- Topic: ${topic}
- Campaign type: ${campaignType}
- Purpose: ${purpose || 'brand-awareness'}
- Target audience: ${targetAudience || 'all_clients'}
- Platforms: ${platformList.join(', ') || 'linkedin'}
- Language: ${language || 'english'}

Requirements:
1) Provide a crisp campaign brief tailored to purpose + audience (avoid generic finance content).
2) Provide an explicit section titled "Creative Prompt" that can be reused verbatim in later stages.
3) Keep it compliant: no guaranteed returns, no exaggerated claims, no personalized investment advice.
4) Include: objective, key message pillars (3-5), tone, content angles (3-5), CTA options (3), visual direction.

Format as markdown with clear headings (## / ###) and bullet points.`;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: 1800
          })
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `Groq API error: ${response.status}`);
        }

        const data = await response.json();
        const markdown = (data.choices?.[0]?.message?.content || '').trim();

        const stageData = {
          type: 'campaign-planning',
          topic,
          campaignType,
          purpose,
          targetAudience,
          platforms: platformList,
          language,
          status: 'completed',
          creativePrompt: markdown,
          output: markdown
        };

        // Send the markdown back in logs so it is visible in Live Logs as well
        sendEvent({ log: markdown });

        saveSocialMediaStageData(stageIdNum, stageData);
        sendEvent({ stage: stageIdNum, status: 'completed', message: `${stageName} completed`, data: stageData });
        res.end();
        return;
      } catch (error) {
        sendEvent({ stage: stageIdNum, status: 'error', message: error.message || 'Stage 1 planning failed' });
        res.end();
        return;
      }
	    }

	    const isEmailCampaign =
	      (Array.isArray(platforms) && platforms.includes('email')) ||
	      (typeof campaignType === 'string' && /email|newsletter/i.test(campaignType));

	    // Stage 2: Content Generation (post copy/captions/hashtags) using Gemini 3 Flash Preview.
	    // Stage 3 handles image/video asset generation; Stage 2 focuses on the textual content pack.
		    if (stageIdNum === 2 && !isEmailCampaign) {
		      try {
		        const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
		        const platformList = Array.isArray(platforms) ? platforms : [];

	        const state = readSocialMediaWorkflowState();
	        const planningEntry =
	          getLatestSocialMediaStateEntry(state, 'campaigns', (e) => e?.topic === topic) ||
	          getLatestSocialMediaStateEntry(state, 'campaigns');
	        const planningText = planningEntry?.creativePrompt || planningEntry?.output || '';

		        if (!geminiKey) {
		          const fallback = {
		            global: {
		              topic,
		              campaignType,
		              purpose: purpose || 'brand-awareness',
		              targetAudience: targetAudience || 'all_clients',
		              tone: 'professional, trustworthy, educational',
		              complianceNote: 'Avoid guaranteed returns; no personalized investment advice.'
		            },
		            platforms: Object.fromEntries(
		              (platformList.length ? platformList : ['linkedin']).map((p) => [
		                p,
		                {
		                  primaryCaption: `PL Capital | ${topic}\n\nKey takeaway: ...\n\nCTA: Learn more / Book a consultation.`,
		                  altCaptions: [],
		                  hashtags: ['#Investing', '#WealthManagement', '#FinancialPlanning'],
		                  ctaOptions: ['Learn more', 'Book a consultation', 'Follow for updates'],
		                  ...(campaignType === 'infographic'
		                    ? {
		                        infographic: {
		                          title: topic || 'Quick Finance Infographic',
		                          subtitle: '3 key points in 30 seconds',
		                          keyStats: [
		                            { label: 'Point 1', value: '...' },
		                            { label: 'Point 2', value: '...' },
		                            { label: 'Point 3', value: '...' }
		                          ],
		                          sections: [
		                            { heading: 'What it means', bullets: ['...', '...'] },
		                            { heading: 'How to use it', bullets: ['...', '...'] },
		                            { heading: 'Common mistake', bullets: ['...', '...'] }
		                          ],
		                          footerCta: 'Save this • Follow PL Capital',
		                          disclaimerLine: 'Market risks apply.'
		                        }
		                      }
		                    : {}),
		                  ...(p === 'twitter'
		                    ? {
		                        threadHook: `THREAD: ${topic}`,
		                        thread: [
		                          `THREAD: ${topic}\n\n1) Quick context...`,
	                          `2) One key point...`,
	                          `3) One practical takeaway...`,
	                          `4) Common mistake to avoid...`,
	                          `5) Summary + disclaimer: Market risks apply.`
	                        ],
	                        threadCta: 'Save + share if useful. Follow PL Capital for more.'
	                      }
	                    : {}),
	                  ...(p === 'whatsapp'
	                    ? {
	                        headline: `${topic}`,
	                        body: 'One quick takeaway.\nOne clear next step.',
	                        ctaText: 'Learn more',
	                        whatsAppMessage: `PL Capital: ${topic}\n\nKey takeaway: ...\n\nReply YES for details.\nMarket risks apply.`
	                      }
	                    : {})
	                }
	              ])
	            )
	          };

	          const stageData = {
	            type: 'content-generation',
	            topic,
	            campaignType,
	            purpose,
	            targetAudience,
	            platforms: platformList,
	            language,
	            status: 'completed',
	            model: 'fallback',
	            contentPack: fallback,
	            output: JSON.stringify(fallback, null, 2)
	          };

	          saveSocialMediaStageData(stageIdNum, stageData);
	          sendEvent({ log: '⚠️ GEMINI_API_KEY not set; using fallback content pack.' });
	          sendEvent({ stage: stageIdNum, status: 'completed', message: `${stageName} completed`, data: stageData });
	          res.end();
	          return;
	        }

	        const requestedModel = process.env.GEMINI_TEXT_MODEL || 'gemini-3-flash-preview';
	        const modelCandidates = [requestedModel, 'gemini-3-pro-preview'].filter(
	          (m, idx, arr) => m && arr.indexOf(m) === idx
	        );

		        const prompt = `You are a senior social media copywriter for PL Capital (financial services, India).
Generate Stage 2 "Content" output: captions/post copy that matches the campaign purpose, campaign type, and target audience.
Return ONLY valid JSON (no markdown, no code fences).

Inputs:
- Topic: ${topic}
- Campaign type: ${campaignType}
- Purpose: ${purpose || 'brand-awareness'}
- Target audience: ${targetAudience || 'all_clients'}
- Platforms: ${(platformList.length ? platformList : ['linkedin']).join(', ')}
- Language: ${language || 'english'}

Stage 1 planning context (if any):
${planningText ? planningText : '(none)'}

Requirements:
1) For each platform, create: primaryCaption, 3 altCaptions, 10-15 hashtags, 3 CTA options.
2) Platform constraints:
   - Twitter: primaryCaption must be <= 280 chars.
   - LinkedIn: professional, value-forward, slightly longer is OK.
     * If Campaign type is "linkedin-carousel": ALSO include a "carousel" object with a slide-by-slide plan suitable for a viral finance carousel in India:
       - slideCount: 7 to 9
       - coverText: 4–8 words (hook)
       - slides: array of length slideCount, each slide has: title (max 6 words), body (max 2 short lines), highlight (1 key number/term), visualCue (icons/graph idea)
       - finalSlideCta: 1 short line (e.g., "Save this checklist" / "Follow PL Capital")
       - disclaimerLine: 1 short line to use in caption or final slide footer (no guarantees)
   - Instagram (carousel): if Campaign type is "instagram-carousel": ALSO include a "carousel" object for platform === "instagram":
     * Style: Instagram swipe carousel (India context), punchy + saveable, but still compliant.
     * slideCount: 7 to 9 (prefer 8)
     * coverText: 3–6 words (hook)
     * slides: same structure as LinkedIn, but keep each body line even shorter (max ~32 chars per line).
     * finalSlideCta: "Save + Share" style CTA
     * disclaimerLine: short, non-scary.
   - Instagram: optimize for Reels virality in the Indian context:
     * Strong hook in the first 1–2 lines, short punchy lines, use line breaks, 0–2 emojis max.
     * Prefer relatable India cues where appropriate (₹, SIP, tax, salary day, “aaj ka quick tip”), but never personalized advice.
     * MUST include: "pinnedComment" idea, "coverText" (3–6 words), and 5–7 "onScreenText" lines (<= 36 chars each) suitable for subtitles.
     * Make it sound like a credible Indian finfluencer: direct, conversational, slightly playful but still compliant.
     * Include at least one "Save this" / "Share" / "Follow for more" style CTA option.
   - YouTube Shorts: optimize for retention + search:
     * primaryCaption should be a YouTube-style description (2 short paragraphs + bullets).
     * MUST include: "title" (<= 60 chars), "hook" (<= 12 words), "script" (spoken voiceover, 20–35s), "onScreenText" (6–10 short lines), and include "#shorts" in hashtags.
     * India context ok (₹, SIP, tax, Nifty/Sensex), but keep compliant (no promises).
   - Facebook Community: optimize for comments/discussion:
     * primaryCaption should be a community post (short intro + a clear question).
     * MUST include: "question", "pollOptions" (4 options), and "commentReplyBank" (5 short replies to common comments).
   - Twitter/X thread: optimize for shares/bookmarks:
     * primaryCaption must be the full thread text (tweet 1 + 6–10 follow-up tweets), each tweet <= 280 chars.
     * MUST include: "thread" (array of tweets), "threadHook" (tweet 1 as a standalone string), and "threadCta" (last tweet CTA).
     * Style: crisp, slightly contrarian hook, simple bullets, India context OK (₹, SIP, tax), zero hype, compliant.
   - WhatsApp Creative: optimize for forwards + CTR:
     * MUST include: "headline" (<= 10 words), "body" (<= 2 short lines), "ctaText" (2–4 words), and "whatsAppMessage" (ready-to-send message).
     * Keep it compliant and clear; avoid spammy language. Use ₹ cues if relevant.
   - Infographic: if Campaign type is "infographic": ALSO include an "infographic" object for EACH platform in the Platforms list:
     * Purpose: blueprint for a single, high-clarity, text-forward infographic image (NOT a carousel).
     * Keep every line short and readable on mobile.
     * infographic schema:
       - title: <= 10 words
       - subtitle: <= 14 words
       - keyStats: 3–5 items, each { label: <= 4 words, value: short, numbers allowed (₹, %, years) }
       - sections: 3–5 sections, each { heading: <= 4 words, bullets: 2–4 bullets, each bullet <= 8 words }
       - footerCta: <= 8 words (save/share/follow CTA)
       - disclaimerLine: <= 8 words (no guarantees)
   - YouTube: can be longer; include a clearer CTA.
3) Be compliant: no guaranteed returns, no exaggerated claims, no personalized investment advice. Add a short generic disclaimer where appropriate.
4) Output JSON schema (for platform === "instagram", pinnedComment, coverText, onScreenText are REQUIRED):
{
  "global": { "tone": string, "disclaimer": string, "language": string },
  "platforms": {
    "<platform>": {
      "primaryCaption": string,
      "altCaptions": string[],
      "hashtags": string[],
      "ctaOptions": string[],
      "pinnedComment"?: string,
      "coverText"?: string,
      "onScreenText"?: string[],
      "title"?: string,
      "hook"?: string,
      "script"?: string,
      "question"?: string,
      "pollOptions"?: string[],
      "commentReplyBank"?: string[],
      "threadHook"?: string,
      "thread"?: string[],
      "threadCta"?: string,
      "headline"?: string,
      "body"?: string,
      "ctaText"?: string,
      "whatsAppMessage"?: string,
      "carousel"?: {
        "slideCount": number,
        "coverText": string,
        "slides": Array<{ "title": string, "body": string, "highlight": string, "visualCue": string }>,
        "finalSlideCta": string,
        "disclaimerLine": string
      },
      "infographic"?: {
        "title": string,
        "subtitle": string,
        "keyStats": Array<{ "label": string, "value": string }>,
        "sections": Array<{ "heading": string, "bullets": string[] }>,
        "footerCta": string,
        "disclaimerLine": string
      }
    }
  }
}`;

	        sendEvent({ log: `🧠 Generating content pack with Gemini (${modelCandidates[0]})...` });

	        let rawText = '';
	        let modelUsed = '';
	        let parsed = null;
	        let lastError = null;

	        for (const model of modelCandidates) {
	          try {
	            rawText = await callGeminiGenerateContentJson({ apiKey: geminiKey, model, prompt });
	            parsed = extractJsonFromText(rawText) || null;
	            modelUsed = model;
	            if (parsed) break;
	          } catch (err) {
	            lastError = err;
	          }
	        }

	        if (!parsed) {
	          throw new Error(
	            lastError?.message ||
	              'Gemini returned an unexpected response; unable to parse JSON content pack.'
	          );
	        }

	        const stageData = {
	          type: 'content-generation',
	          topic,
	          campaignType,
	          purpose,
	          targetAudience,
	          platforms: platformList,
	          language,
	          status: 'completed',
	          model: modelUsed,
	          contentPack: parsed,
	          output: rawText
	        };

	        saveSocialMediaStageData(stageIdNum, stageData);
	        sendEvent({ log: '✅ Content pack generated successfully.' });
	        sendEvent({ stage: stageIdNum, status: 'completed', message: `${stageName} completed`, data: stageData });
	        res.end();
	        return;
	      } catch (error) {
	        sendEvent({ stage: stageIdNum, status: 'error', message: error.message || 'Stage 2 content failed' });
	        res.end();
	        return;
	      }
	    }

	    // Special handling for Stage 2: Generate email newsletter content (matching original frontend behavior)
	    if (stageIdNum === 2 && isEmailCampaign) {
	      sendEvent({ log: '📧 Generating HTML email newsletter...' });

	      try {
	        const groqKey = process.env.GROQ_API_KEY;
	        if (!groqKey) {
	          throw new Error('GROQ_API_KEY not set (required for email newsletter generation)');
	        }

	        const state = readSocialMediaWorkflowState();
	        const planningEntry =
	          getLatestSocialMediaStateEntry(state, 'campaigns', (e) => e?.topic === topic) ||
	          getLatestSocialMediaStateEntry(state, 'campaigns');
	        const creativePrompt = planningEntry?.creativePrompt || planningEntry?.output || '';

	        if (creativePrompt) {
	          sendEvent({ log: '📋 Using creative prompt from Stage 1' });
	        }

	        let brandGuidance = '';
	        if (brandSettings?.useBrandGuidelines) {
	          brandGuidance = `
**PL Capital Brand Guidelines:**
- **Primary Colors**: Navy (#0e0e6a), Blue (#3c3cf8)
- **Accent Colors**: Teal (#00d084), Green (#66e766)
- **Typography**: Figtree font family, professional sans-serif fallbacks
- **Tone & Voice**: Professional, trustworthy, data-driven yet approachable
- **Visual Style**: Clean, modern, corporate with subtle tech motifs
- **Key Values**: Trust, Innovation, Performance, Client-First
- **Messaging**: Focus on adaptive strategies, quantitative excellence, consistent alpha
`;
	        } else if (brandSettings?.customColors || brandSettings?.customTone || brandSettings?.customInstructions) {
	          brandGuidance = `
**Custom Brand Guidelines:**
${brandSettings.customColors ? `- **Brand Colors**: ${brandSettings.customColors}` : ''}
${brandSettings.customTone ? `- **Brand Tone**: ${brandSettings.customTone}` : ''}
${brandSettings.customInstructions ? `- **Additional Guidelines**: ${brandSettings.customInstructions}` : ''}
`;
	        }

	        const systemPrompt = `You are an expert email marketing specialist and HTML email designer.

Your task is to generate a complete, production-ready HTML email newsletter following industry best practices.
You MUST follow the provided layout reference and keep the header/footer image URLs intact.
Return ONLY valid JSON (no markdown, no code fences).`;

	        const userPrompt = `Generate a single HTML newsletter email for the given topic. Follow the layout reference closely.
Return ONLY valid JSON (no markdown, no code fences).

Inputs:
- Topic: ${topic}
- Campaign type: ${campaignType}
- Purpose: ${purpose || 'newsletter'}
- Target audience: ${targetAudience || 'investors and wealth builders'}
- Language: ${language || 'english'}

Stage 1 creative prompt (if any):
${creativePrompt || '(none)'}

Critical requirement: The newsletter copy MUST be tailored to the Purpose and Target audience above.
- Make the intro, “Market Highlights”, story headlines, and CTAs purpose-driven and audience-specific (avoid generic finance content).
- If Purpose implies lead-gen/consultation: emphasize clear next steps (consultation, portfolio review, speak to an advisor).
- If Purpose implies education/awareness: emphasize insights, explainers, and “learn more” CTAs.
- If Target audience implies specific segment (e.g., HNI/retail/SIP/young professionals): adjust language, examples, and CTAs accordingly.
- Keep compliance: no guaranteed returns, no exaggerated claims, no personalized investment advice.

Layout reference (use this structure and styling cues; OMIT web stories section):
- 600px wide, single-column responsive layout (table-based).
- Header section: use ONLY the provided header/banner image (it already contains the logo). Do NOT add a separate logo image or logo block anywhere.
  * Use this header image ONCE (link the image to plindia.com): https://d314e77m1bz5zy.cloudfront.net/bee/Images/bmsx/p7orqos0/xtp/w8t/1aj/Asset%201.png
  * Do NOT include any other logo, and do NOT duplicate the header image elsewhere in the email.
- Hero section: text-led (no additional hero image). Use a solid background color or simple accent divider instead of another image.
- Intro paragraph and section dividers (1px solid #0000a0).
- “Market Highlights” section.
- 3-column story grid with image + headline + “Read more” button:
  * Rounded 24px, background #00b34e, white text, Figtree bold 12px, generous horizontal padding.
- CTA section to visit PL Capital News (include a prominent button).
- Closing tagline and footer image:
  * Use this footer image ONCE: https://d314e77m1bz5zy.cloudfront.net/bee/Images/bmsx/p7orqos0/9wn/vw0/ds6/Asset%202.png
- Fonts: Figtree (load via Google Fonts); Colors: Navy/Blue (#0000a0 accents), CTA buttons #00b34e, body text #000.
- Social icons bar (below footer image): centered row of circular color icons linking to:
  * LinkedIn: https://www.linkedin.com/company/prabhudaslilladher/
  * Instagram: https://www.instagram.com/prabhudaslilladher/
  * X/Twitter: https://x.com/PLIndiaOnline
  * YouTube: https://www.youtube.com/@PrabhudasLilladherIndia
  * Telegram: https://t.me/PLIndiaOnline
  Use 32px circle-color icons (e.g., https://app-rsrc.getbee.io/public/resources/social-networks-icon-sets/circle-color/linkedin@2x.png etc.) in a single horizontal row (centered) — use a table with inline-block cells and equal padding so icons do NOT stack vertically on desktop or mobile.

IMPORTANT: Do NOT include any "Trending Web Stories" section.

Requirements:
1) Provide: subject (40-60 chars preferred), preheader (85-100 chars preferred), 3 subjectVariations, plainText, html.
2) HTML: production-ready, table-based, 600px width, mobile-first; inline CSS (no external stylesheets).
3) Include: header section with logo/link, hero/banner, intro, Market Highlights, 3-column story grid, primary CTA, footer image, social icons row, footer compliance/unsubscribe.
4) Compliance: no guaranteed returns, no exaggerated claims, no personalized investment advice. Include a short disclaimer in the footer.
5) Images: keep the header and footer image URLs exactly as provided above.
6) Content quality:
   - Market Highlights: 4-6 bullets, each concrete and relevant to the Topic + Purpose + Audience.
   - Story grid: 3 stories with distinct angles; each needs an image URL (can use relevant stock/illustrative URLs), headline, 1-2 line summary, and “Read more” button.
   - CTA section: align CTA button text and destination with Purpose (use plindia.com/news or plindia.com as appropriate).

Output JSON schema:
{
  "subject": string,
  "preheader": string,
  "subjectVariations": string[],
  "plainText": string,
  "html": string
}

${brandGuidance ? `Brand Requirements:\n${brandGuidance}\nIMPORTANT: You MUST use these exact brand colors in the email HTML.` : ''}`;

	        const model = process.env.GROQ_EMAIL_MODEL || 'openai/gpt-oss-120b';
	        sendEvent({ log: `🧠 Generating newsletter with Groq (${model})...` });

	        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
	          method: 'POST',
	          headers: {
	            'Authorization': `Bearer ${groqKey}`,
	            'Content-Type': 'application/json'
	          },
	          body: JSON.stringify({
	            model,
	            messages: [
	              { role: 'system', content: systemPrompt },
	              { role: 'user', content: userPrompt }
	            ],
	            temperature: 0.7,
	            max_tokens: 8000
	          })
	        });

	        if (!response.ok) {
	          const text = await response.text().catch(() => '');
	          throw new Error(text || `Groq API error: ${response.status}`);
	        }

	        const groqData = await response.json();
	        const rawText = (groqData.choices?.[0]?.message?.content || '').trim();
	        const emailData = extractJsonFromText(rawText);

	        if (!emailData) {
	          sendEvent({ log: `⚠️ Groq raw response (truncated): ${rawText.slice(0, 800)}` });
	          throw new Error('Groq returned an unexpected response; unable to parse JSON newsletter.');
	        }

	        sendEvent({ log: '✅ Email newsletter generated successfully!' });
	        sendEvent({ log: `📧 Subject: ${emailData.subject}` });
	        sendEvent({ log: `📝 Preheader: ${emailData.preheader}` });
	        sendEvent({ log: `📄 HTML: ${emailData.html?.length || 0} characters` });

	        const stageData = {
	          topic,
	          campaignType,
	          platforms,
	          status: 'completed',
	          type: 'content-generation',
	          contentType: 'email-newsletter',
	          subject: emailData.subject,
	          preheader: emailData.preheader,
	          subjectVariations: emailData.subjectVariations,
	          html: emailData.html,
	          plainText: emailData.plainText,
	          model,
	          output: rawText
	        };

	        saveSocialMediaStageData(stageIdNum, stageData);
	        sendEvent({ stage: stageIdNum, status: 'completed', message: 'Email newsletter generated', data: stageData });
	        sendEvent({ log: '✅ Stage 2 completed successfully!' });
	        res.end();
	        return;
	      } catch (error) {
	        sendEvent({ stage: stageIdNum, status: 'error', message: error.message || 'Email generation failed' });
	        res.end();
	        return;
	      }
	    }

	    // Map campaignType to format for orchestrator (matching original frontend behavior)
	    // BUT: Respect contentType from frontend - if user selected "Static Image", generate image, not video
	    let format;
	    if (contentType === 'image') {
	      // User selected "Static Image" - force image generation regardless of campaign type
	      if (campaignType === 'linkedin-carousel') format = 'carousel';
	      else if (campaignType === 'infographic') format = 'infographic';
	      else format = 'image';
	    } else if (contentType === 'faceless-video' || contentType === 'avatar-video') {
	      // User selected video - use campaign type mapping
	      const campaignTypeToFormat = {
	        'linkedin-testimonial': 'video-testimonial',
	        'linkedin-carousel': 'carousel',
	        'linkedin-data-viz': 'data-viz',
	        'instagram-reel': 'reel',
	        'instagram-carousel': 'carousel',
	        'youtube-explainer': 'explainer',
	        'infographic': 'infographic',
	        'email-newsletter': 'newsletter'
	      };
	      format = campaignTypeToFormat[campaignType] || campaignType;
	    } else {
	      // Default: use campaign type mapping
	      const campaignTypeToFormat = {
	        'linkedin-testimonial': 'video-testimonial',
	        'linkedin-carousel': 'carousel',
	        'linkedin-data-viz': 'data-viz',
	        'instagram-reel': 'reel',
	        'instagram-carousel': 'carousel',
	        'youtube-explainer': 'explainer',
	        'infographic': 'infographic',
	        'email-newsletter': 'newsletter'
	      };
	      format = campaignTypeToFormat[campaignType] || campaignType;
	    }

    // Build arguments for social media backend
    // The main.js expects: node main.js stage <stageName> [options]
    const args = [
      'stage',
      stageName,
      '--campaign-type', campaignType,
      '--format', format, // Add format parameter so orchestrator can detect video formats
      '--topic', topic,
      '--duration', duration.toString(),
      '--aspect-ratio', aspectRatio,
      '--language', language
    ];

    if (useVeo) args.push('--use-veo');
	    if (finalUseAvatar) {
	      args.push('--use-avatar');
	      if (avatarId) args.push('--avatar-id', avatarId);
	      if (avatarScriptText) args.push('--avatar-script', avatarScriptText);
	      if (avatarVoiceId) args.push('--avatar-voice', avatarVoiceId);
	      if (heygenAvatarGroupId) args.push('--heygen-avatar-group-id', heygenAvatarGroupId);
	      // For avatar videos (HeyGen or other providers), wait for completion so Stage 4 returns a playable URL.
	      args.push('--wait-for-completion');
	    } else {
	      args.push('--no-avatar');
	    }

    platforms.forEach((platform) => {
      args.push('--platform', platform);
    });

    if (files) {
      // Handle file uploads if needed
      args.push('--files', JSON.stringify(files));
    }

    if (brandSettings) {
      args.push('--brand-settings', JSON.stringify(brandSettings));
    }

    if (promptOverride) {
      args.push('--prompt-override', JSON.stringify(promptOverride));
    }

    if (frameInterpolation) {
      args.push('--frame-interpolation', JSON.stringify(frameInterpolation));
    }

    if (longCatConfig) {
      args.push('--longcat-config', JSON.stringify(longCatConfig));
    }

	    const envPath = path.resolve(__dirname, '..', '.env');
	    const nodeEnv = {
	      ...process.env,
	      NODE_PATH: path.join(__dirname, '..', 'node_modules') + (process.env.NODE_PATH ? ':' + process.env.NODE_PATH : ''),
	      ...(fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {})
	    };

    const nodeProcess = spawn('node', [socialMediaMainJsPath, ...args], {
      cwd: socialMediaBackendDir,
      env: nodeEnv,
    });

    let outputBuffer = '';

    nodeProcess.stdout.on('data', (data) => {
      const output = data.toString();
      outputBuffer += output;
      sendEvent({ log: output.trim() });

      // Parse stage progression and send events
	      if (output.includes('completed') || output.includes('Completed')) {
	        // Extract clean prompt content from output buffer
	        const cleanOutput = extractPromptFromOutput(outputBuffer, stageIdNum);
	        const hostedUrl = extractImgBbUrlFromOutput(outputBuffer);
	        const imagePath = stageIdNum === 3 ? extractVisualImagePathFromOutput(outputBuffer) : null;
	        const cloudinaryUrl = stageIdNum === 4 ? extractCloudinaryUrlFromOutput(outputBuffer) : null;
	        const httpVideoUrl = stageIdNum === 4 ? extractHttpVideoUrlFromOutput(outputBuffer) : null;
	        const videoPath = stageIdNum === 4 ? extractVideoPathFromOutput(outputBuffer) : null;

	        const stagePayload = {
	          type: stageName,
	          topic,
	          campaignType,
	          platforms,
	          status: 'completed',
	          output: cleanOutput // Save extracted prompt, not full logs
	        };

	        if (cloudinaryUrl) {
	          stagePayload.hostedUrl = cloudinaryUrl;
	        } else if (httpVideoUrl) {
	          stagePayload.hostedUrl = httpVideoUrl;
	        } else if (hostedUrl) {
	          stagePayload.hostedUrl = hostedUrl;
	        }

	        if (stageIdNum === 4 && (videoPath || cloudinaryUrl || httpVideoUrl)) {
	          stagePayload.videos = [
	            {
	              ...(videoPath ? { localPath: videoPath } : {}),
	              ...(cloudinaryUrl ? { hostedUrl: cloudinaryUrl } : {}),
	              ...(!cloudinaryUrl && httpVideoUrl ? { hostedUrl: httpVideoUrl } : {})
	            }
	          ];
	        } else if (imagePath || hostedUrl) {
	          stagePayload.images = [
	            {
	              ...(imagePath ? { path: imagePath } : {}),
	              ...(hostedUrl ? { hostedUrl } : {})
	            }
	          ];
	        }

	        saveSocialMediaStageData(stageIdNum, stagePayload);
	        sendEvent({ stage: stageIdNum, status: 'completed', message: `${stageName} completed` });
	      }
	    });

    nodeProcess.stderr.on('data', (data) => {
      sendEvent({ log: `ERROR: ${data.toString().trim()}` });
    });

	    nodeProcess.on('close', (code) => {
	      if (code === 0) {
	        sendEvent({ stage: stageIdNum, status: 'completed', message: `Stage ${stageIdNum} completed successfully` });
	      } else {
	        sendEvent({ stage: stageIdNum, status: 'error', message: `Stage ${stageIdNum} failed with code ${code}` });
	      }
	      res.end();
	    });
	  } catch (error) {
	    sendEvent({ stage: stageIdNum || 1, status: 'error', message: error.message });
	    res.end();
	  }
}

// Social Media: Execute single stage (alternative format: /api/workflow/social-media/stage)
app.post('/api/workflow/social-media/stage', handleSocialMediaStage);

// Social Media: Get avatars
app.get('/api/avatars', async (req, res) => {
  try {
    const configPaths = [
      path.join(socialMediaBackendDir, 'config', 'heygen-native-voice-mapping.json'),
      path.join(socialMediaBackendDir, '..', 'config', 'heygen-avatar-config.js'),
    ];

    const configPath = configPaths.find(p => fs.existsSync(p));
    if (!configPath) {
      return res.status(404).json({ error: 'Avatar config not found' });
    }

    let avatarData;
    if (configPath.endsWith('.json')) {
      avatarData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } else {
      // For .js files, we'd need to require them, but this is simpler for now
      return res.status(500).json({ error: 'JS config files not yet supported' });
    }

    res.json(avatarData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Social Media: List HeyGen avatars in a group (used by UI to pick "look"/variant ids)
const heygenAvatarGroupCache = new Map();

app.get('/api/heygen/avatar-group/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!groupId) {
      return res.status(400).json({ error: 'Missing groupId' });
    }

    const apiKey = process.env.HEYGEN_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: 'HEYGEN_API_KEY not configured on server' });
    }

    if (heygenAvatarGroupCache.has(groupId)) {
      return res.json(heygenAvatarGroupCache.get(groupId));
    }

    // HeyGen docs: List all avatars in one avatar group
    // https://docs.heygen.com/reference/list-all-avatars-in-one-avatar-group
    const url = `https://api.heygen.com/v2/avatar_group/${encodeURIComponent(groupId)}/avatars`;

    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return res.status(resp.status).json({ error: json?.error || json?.message || `HeyGen API error: ${resp.status}` });
    }

    // Normalize likely response shapes
    const raw =
      json?.data?.avatars ||
      json?.data?.data ||
      json?.data ||
      json?.avatars ||
      [];

    const avatars = Array.isArray(raw)
      ? raw
          .map((a) => ({
            avatarId: a?.avatar_id || a?.id || a?.avatarId || null,
            name: a?.avatar_name || a?.name || a?.avatarName || null
          }))
          .filter((a) => typeof a.avatarId === 'string' && a.avatarId.length > 0)
      : [];

    const payload = { groupId, avatars };
    heygenAvatarGroupCache.set(groupId, payload);
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Social Media: Get stage data (AI Content) - namespaced to avoid conflict with SEO/LLMO CSV route
app.get('/api/workflow/social-media/data', (req, res) => {
  try {
    const stageId = parseInt(req.query.stage);
    if (!stageId || isNaN(stageId)) {
      return res.status(400).json({ error: 'Missing or invalid stage parameter' });
    }

    const stateFilePath = path.join(socialMediaBackendDir, 'data', 'workflow-state.json');

    if (!fs.existsSync(stateFilePath)) {
      return res.status(404).json({ error: 'No workflow state found' });
    }

    const state = JSON.parse(fs.readFileSync(stateFilePath, 'utf-8'));
    const stageKeys = {
      1: 'campaigns',
      2: 'content',
      3: 'visuals',
      4: 'videos',
      5: 'published',
      6: 'metrics'
    };

    const key = stageKeys[stageId];
    if (!key || !state[key]) {
      return res.status(404).json({ error: `No data found for stage ${stageId}` });
    }

    res.json({ data: state[key], summary: {} });
  } catch (error) {
    console.error('[Social Media] Error getting stage data:', error);
    res.status(500).json({ error: error.message });
  }
});

// Social Media: Get stage data (alternative format: /api/workflow/social-media/stage/:stageId)
app.get('/api/workflow/social-media/stage/:stageId', (req, res) => {
  try {
    const { stageId } = req.params;
    const stateFilePath = path.join(socialMediaBackendDir, 'data', 'workflow-state.json');

    if (!fs.existsSync(stateFilePath)) {
      return res.status(404).json({ error: 'No workflow state found' });
    }

    const state = JSON.parse(fs.readFileSync(stateFilePath, 'utf-8'));
    const stageKeys = {
      1: 'campaigns',
      2: 'content',
      3: 'visuals',
      4: 'videos',
      5: 'published',
      6: 'metrics'
    };

    const key = stageKeys[parseInt(stageId)];
    if (!key || !state[key]) {
      return res.status(404).json({ error: `No data found for stage ${stageId}` });
    }

    res.json({ data: state[key], summary: {} });
  } catch (error) {
    console.error('[Social Media] Error getting stage data:', error);
    res.status(500).json({ error: error.message });
  }
});

// Social Media: Save stage data (AI Content) - namespaced to avoid conflict with SEO/LLMO CSV route
app.post('/api/workflow/social-media/data/save', async (req, res) => {
  try {
    const { stageId, dataId, editedData } = req.body;

    if (!stageId || !dataId || !editedData) {
      return res.status(400).json({ error: 'Missing required fields: stageId, dataId, editedData' });
    }

    const stateFilePath = path.join(socialMediaBackendDir, 'data', 'workflow-state.json');
    let state = { campaigns: {}, content: {}, visuals: {}, videos: {}, published: {}, metrics: {} };

    if (fs.existsSync(stateFilePath)) {
      state = JSON.parse(fs.readFileSync(stateFilePath, 'utf-8'));
    }

    const stageKeys = {
      1: 'campaigns',
      2: 'content',
      3: 'visuals',
      4: 'videos',
      5: 'published',
      6: 'metrics'
    };

    const key = stageKeys[parseInt(stageId)];
    if (!key) {
      return res.status(400).json({ error: `Invalid stage ID: ${stageId}` });
    }

    if (!state[key] || !state[key][dataId]) {
      return res.status(404).json({ error: `Data entry not found: ${dataId}` });
    }

    // Update the data entry
    state[key][dataId] = {
      ...state[key][dataId],
      ...editedData,
      updatedAt: new Date().toISOString()
    };

    // Ensure data directory exists
    const dataDir = path.dirname(stateFilePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2));
    console.log(`[Social Media] Updated stage ${stageId} data:`, dataId);

    res.json({ success: true, message: 'Data saved successfully' });
  } catch (error) {
    console.error('[Social Media] Error saving stage data:', error);
    res.status(500).json({ error: error.message });
  }
});

// Social Media: Generate topic
app.post('/api/topic/generate', async (req, res) => {
  try {
    const {
      campaignType,
      campaignTypeLabel,
      purpose,
      purposeLabel,
      purposeDescription,
      targetAudience,
      targetAudienceLabel,
      targetAudienceDescription,
      platforms,
      language
    } = req.body;

    // Generate topic directly (avoid spawning a CLI command that may not exist)
    const groqKey = process.env.GROQ_API_KEY;
    const platformList = Array.isArray(platforms) ? platforms : [];

    if (!groqKey) {
      const fallbackTopic = `PL Capital: ${campaignTypeLabel || campaignType || 'Campaign'} for ${purposeLabel || purpose || 'Brand Awareness'}`;
      return res.json({ topic: fallbackTopic, model: 'fallback' });
    }

    const systemPrompt = `You are a senior campaign strategist for PL Capital (financial services, India).
You generate punchy campaign topics that match the campaign format, objective, and audience.
Return ONLY valid JSON with a single key "topic". No markdown, no extra keys.`;

    const userPrompt = `Generate ONE strong social media campaign topic/title.

Constraints:
- Language: ${language || 'english'}
- Campaign type: ${campaignTypeLabel || campaignType || 'general'}
- Purpose: ${purposeLabel || purpose || 'brand-awareness'}${purposeDescription ? ` (${purposeDescription})` : ''}
- Target audience: ${targetAudienceLabel || targetAudience || 'all_clients'}${targetAudienceDescription ? ` (${targetAudienceDescription})` : ''}
- Platforms: ${platformList.join(', ') || 'linkedin'}

Guidance:
- Make it SPECIFIC to the purpose and audience above (avoid generic finance topics).
- Match the campaign type format (e.g. carousel = list/steps; reel = hook/benefit; newsletter = timely insights).
- Compliant for financial services: no guaranteed returns, no exaggerated claims.
- Prefer an India-relevant framing where appropriate (₹, SIP, tax, markets), but avoid giving personalized advice.
- 6 to 14 words max.

Return JSON like: {"topic":"..."} only.`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 200
      })
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(500).json({ error: text || `Groq API error: ${response.status}` });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Extract JSON from model output safely
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      return res.json({ topic: content.trim() || 'Generated topic', model: 'groq-llama-3.3-70b-versatile' });
    }

    const parsed = JSON.parse(match[0]);
    const topic = typeof parsed.topic === 'string' ? parsed.topic.trim() : '';
    if (!topic) {
      return res.json({ topic: content.trim() || 'Generated topic', model: 'groq-llama-3.3-70b-versatile' });
    }

    res.json({ topic, model: 'groq-llama-3.3-70b-versatile' });
  } catch (error) {
    console.error('[Social Media] Error in topic generation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Social Media: Health check
app.get('/api/health/social-media', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Social Media Backend API',
    backendExists: fs.existsSync(socialMediaMainJsPath),
    backendPath: socialMediaMainJsPath
  });
});

// ============================================================================
// VIDEO-GEN API ROUTES
// ============================================================================

// Video Gen: Generate Prompt
app.post('/api/video-gen/generate-prompt', async (req, res) => {
  try {
    const { userPrompt, reelType } = req.body;
    if (!userPrompt || !reelType) {
      return res.status(400).json({ error: 'Missing userPrompt or reelType' });
    }

    // This would need @google/generative-ai package
    // For now, return a basic fallback
    const MODEL_MAPPING = {
      educational: 'wan-2.5',
      market_update: 'wan-2.5',
      viral_hook: 'kling-2.6',
      advisor: 'omnihuman-1.5',
      cinematic: 'runway-gen-4'
    };
    const recommendedModel = MODEL_MAPPING[reelType] || 'kling-2.6';
    const basicPrompt = `A high-quality video about ${userPrompt} in style of ${reelType}. Professional financial aesthetic, emerald green and navy blue colors.`;

    res.json({
      optimizedPrompt: basicPrompt,
      recommendedModel,
      reelType,
      warning: "Gemini API Key missing. Using basic fallback."
    });
  } catch (error) {
    console.error('Error generating prompt:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Video Gen: Generate OVI Prompt
app.post('/api/video-gen/generate-ovi-prompt', async (req, res) => {
  try {
    const { script, gender = 'female', persona = 'financial advisor' } = req.body;
    if (!script) {
      return res.status(400).json({ error: 'Script is required' });
    }

    const genderDesc = gender === 'male' ? 'man' : 'woman';
    const visualDescription = `A professional ${genderDesc} in business attire`;
    const voiceCharacteristics = gender === 'male'
      ? 'Professional male voice, confident tone, clear enunciation, measured pace, studio quality acoustics, authoritative delivery, trustworthy demeanor'
      : 'Professional female voice, warm tone, clear enunciation, measured pace, studio quality acoustics, authoritative delivery, trustworthy demeanor';

    const oviPrompt = `${visualDescription} looks at camera and says, <S>${script}<E>.<AUDCAP>${voiceCharacteristics}<ENDAUDCAP>`;

    res.json({ prompt: oviPrompt });
  } catch (error) {
    console.error('OVI prompt generation failed:', error);
    res.status(500).json({ error: error.message || 'Failed to generate OVI prompt' });
  }
});

// Video Gen: Generate Script
app.post('/api/video-gen/generate-script', async (req, res) => {
  try {
    const { topic, language = 'en' } = req.body;
    if (!topic) {
      return res.status(400).json({ error: 'Missing topic' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('GEMINI_API_KEY not found, using fallback script');
      const fallbackScript = `Stop leaving your cash in a savings account earning pennies. Inflation is eating your wealth. Instead, consider a diversified index fund. It's the simplest way to grow your money over time. Start today, and thank yourself in ten years.`;
      return res.json({ script: fallbackScript, warning: 'GEMINI_API_KEY missing, using fallback' });
    }

    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3-pro-preview" });

    const SYSTEM_INSTRUCTION = `You are an expert scriptwriter for short-form financial video content (Reels/TikTok).
Your goal is to write a concise, engaging script for a "Financial Advisor" persona.

Constraints:
1.  **Duration:** Strictly under 30 seconds spoken (approx 60-75 words).
2.  **Tone:** Professional, trustworthy, yet accessible and engaging.
3.  **Structure:** Hook (first 3s) -> Value/Insight -> Call to Action.
4.  **Format:** Return ONLY the raw spoken text. No scene directions, no "Host:", no markdown formatting. Just the words to be spoken.

Example Output:
"Stop leaving your cash in a savings account earning pennies. Inflation is eating your wealth. Instead, consider a diversified index fund. It's the simplest way to grow your money over time. Start today, and thank yourself in ten years."`;

    const langMap = {
      hi: "Hindi (Devanagari script)",
      hinglish: "Hinglish (Hindi words written in English alphabet, casual Indian style)",
      bn: "Bengali",
      gu: "Gujarati",
      kn: "Kannada",
      ml: "Malayalam",
      mr: "Marathi",
      pa: "Punjabi",
      ta: "Tamil",
      te: "Telugu"
    };

    let langInstruction = "";
    if (langMap[language]) {
      langInstruction = `Write the script in ${langMap[language]}.`;
    }

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `Topic: "${topic}"\nLanguage: ${language}\n${langInstruction}\n\nWrite the script:` }] }],
      systemInstruction: { role: 'system', parts: [{ text: SYSTEM_INSTRUCTION }] },
    });

    const script = result.response.text();

    res.json({ script });
  } catch (error) {
    console.error('Error generating script:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// Video Gen: Generate Audio
app.post('/api/video-gen/generate-audio', async (req, res) => {
  try {
    const { text, language = 'en', gender = 'female', voiceId: customVoiceId } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Missing text' });
    }

    const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY;
    if (!CARTESIA_API_KEY) {
      return res.status(500).json({
        error: 'CARTESIA_API_KEY not configured',
        message: 'Please set CARTESIA_API_KEY in your .env file'
      });
    }

    // Voice IDs
    const VOICES = {
      female: '3b554273-4299-48b9-9aaf-eefd438e3941', // Indian Lady
      male: '6303e5fb-a0a7-48f9-bb1a-dd42c216dc5d',   // Sagar (Indian Male)
    };

    const voiceId = customVoiceId || VOICES[gender];
    const modelId = 'sonic-3-2025-10-27';

    const { CartesiaClient } = require('@cartesia/cartesia-js');
    const cartesia = new CartesiaClient({ apiKey: CARTESIA_API_KEY });
    const websocket = cartesia.tts.websocket({
      container: 'raw',
      encoding: 'pcm_f32le',
      sampleRate: 44100,
    });

    await websocket.connect();

    const response = await websocket.send({
      modelId,
      voice: { mode: 'id', id: voiceId },
      transcript: text,
      language: language === 'hinglish' ? 'hi' : language,
      addTimestamps: true, // Enable word-level timestamps
    });

    const chunks = [];
    const timestamps = [];

    // Wrap event listener in a promise
    await new Promise((resolve, reject) => {
      response.on('message', (message) => {
        if (typeof message === 'string') {
          try {
            const parsed = JSON.parse(message);
            if (parsed.data) {
              chunks.push(Buffer.from(parsed.data, 'base64'));
            }
            if (parsed.word_timestamps) {
              timestamps.push(...parsed.word_timestamps.words);
            }
            if (parsed.done) {
              resolve();
            }
          } catch (e) {
            console.error("Error parsing chunk:", e);
          }
        }
      });

      // Safety timeout
      setTimeout(() => resolve(), 15000);
    });

    const audioBuffer = Buffer.concat(chunks);
    const wavBuffer = addWavHeader(audioBuffer, 44100, 1, 32); // 44.1kHz, 1 channel, 32-bit float

    // Return as base64
    res.json({
      audioBase64: wavBuffer.toString('base64'),
      timestamps: timestamps // Include word timestamps for splitting
    });

  } catch (error) {
    console.error('Error generating audio:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// Helper function to add WAV header to PCM audio data
function addWavHeader(samples, sampleRate, numChannels, bitDepth) {
  const byteRate = (sampleRate * numChannels * bitDepth) / 8;
  const blockAlign = (numChannels * bitDepth) / 8;
  const dataSize = samples.length;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF chunk
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(3, 20); // AudioFormat (3 for IEEE Float)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitDepth, 34);

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  samples.copy(buffer, 44);
  return buffer;
}

// Video Gen: Clone Voice
app.post('/api/video-gen/clone-voice', upload.single('file'), async (req, res) => {
  let tempFilePath = null;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'ELEVENLABS_API_KEY not configured. Please add it to .env.local'
      });
    }

    tempFilePath = req.file.path;
    const ElevenLabsClient = require('elevenlabs').ElevenLabsClient;
    const client = new ElevenLabsClient({ apiKey });

    const voice = await client.voices.add({
      name: `Cloned Voice ${Date.now()}`,
      files: [fs.createReadStream(tempFilePath)],
      description: `Voice cloned from ${req.file.originalname}`,
    });

    if (!voice.voice_id) {
      throw new Error('Voice cloning failed: No voice_id returned from ElevenLabs');
    }

    // Clean up temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      await unlink(tempFilePath);
      tempFilePath = null;
    }

    res.json({
      success: true,
      voice_id: voice.voice_id,
      id: voice.voice_id,
      message: 'Voice cloned successfully using ElevenLabs',
    });
  } catch (error) {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        await unlink(tempFilePath);
      } catch (cleanupError) {
        console.error('Failed to cleanup temp file:', cleanupError);
      }
    }
    console.error('Voice cloning failed:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// Video Gen: Test Voice
app.post('/api/video-gen/test-voice', async (req, res) => {
  try {
    const { voice_id, text } = req.body;
    if (!voice_id) {
      return res.status(400).json({ error: 'No voice_id provided' });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'ELEVENLABS_API_KEY not configured'
      });
    }

    const ElevenLabsClient = require('elevenlabs').ElevenLabsClient;
    const client = new ElevenLabsClient({ apiKey });

    const testText = text || "Hello! This is a test of your cloned voice. How does it sound?";
    const audio = await client.textToSpeech.convert(voice_id, {
      text: testText,
      model_id: "eleven_multilingual_v2",
    });

    const chunks = [];
    for await (const chunk of audio) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    res.json({
      success: true,
      audio: buffer.toString('base64'),
      audio_type: 'audio/mpeg',
      text: testText,
    });
  } catch (error) {
    console.error('Test voice generation failed:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// Video Gen: Split Audio
app.post('/api/video-gen/split-audio', async (req, res) => {
  const tempFiles = [];
  try {
    const { audioBase64, timestamps, targetDuration = 10 } = req.body;

    if (!audioBase64 || !timestamps || !Array.isArray(timestamps)) {
      return res.status(400).json({
        error: 'audioBase64 and timestamps array are required'
      });
    }

    // Find optimal split points
    const splitPoints = findSplitPoints(timestamps, targetDuration);

    if (splitPoints.length === 0) {
      return res.json({
        success: true,
        segments: [audioBase64],
        splitPoints: []
      });
    }

    // Save audio to temp file
    const inputPath = path.join('/tmp', `audio_${Date.now()}.wav`);
    tempFiles.push(inputPath);
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    await writeFile(inputPath, audioBuffer);

    // Split audio using ffmpeg
    const segments = [];
    const boundaries = [0, ...splitPoints];

    for (let i = 0; i < boundaries.length; i++) {
      const startTime = boundaries[i];
      const endTime = i < boundaries.length - 1 ? boundaries[i + 1] : undefined;
      const outputPath = path.join('/tmp', `segment_${Date.now()}_${i}.wav`);
      tempFiles.push(outputPath);

      await splitAudioSegment(inputPath, outputPath, startTime, endTime);
      const segmentBuffer = await fs.promises.readFile(outputPath);
      segments.push(segmentBuffer.toString('base64'));
    }

    // Clean up temp files
    for (const file of tempFiles) {
      try {
        await unlink(file);
      } catch (err) {
        console.error(`Failed to delete ${file}:`, err);
      }
    }

    res.json({
      success: true,
      segments: segments,
      splitPoints: splitPoints
    });
  } catch (error) {
    for (const file of tempFiles) {
      try {
        await unlink(file);
      } catch (err) {
        // Ignore cleanup errors
      }
    }
    console.error('Audio splitting failed:', error);
    res.status(500).json({ error: error.message || 'Failed to split audio' });
  }
});

// Helper function to split audio segment
function splitAudioSegment(inputPath, outputPath, startTime, endTime) {
  return new Promise((resolve, reject) => {
    const ffmpeg = require('fluent-ffmpeg');
    let command = ffmpeg(inputPath).setStartTime(startTime);
    if (endTime !== undefined) {
      command = command.setDuration(endTime - startTime);
    }
    command
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

// Helper function to find split points
function findSplitPoints(timestamps, targetDuration) {
  if (timestamps.length === 0) return [];
  const totalDuration = timestamps[timestamps.length - 1].end;
  const splitPoints = [];
  const targets = [targetDuration, targetDuration * 2];

  for (const target of targets) {
    if (target >= totalDuration) continue;
    let bestIndex = 0;
    let minDiff = Infinity;

    for (let i = 0; i < timestamps.length; i++) {
      const wordEnd = timestamps[i].end;
      const diff = Math.abs(wordEnd - target);
      const isSentenceEnd = i < timestamps.length - 1 &&
        (timestamps[i].word.endsWith('.') ||
          timestamps[i].word.endsWith('!') ||
          timestamps[i].word.endsWith('?') ||
          timestamps[i + 1].start - timestamps[i].end > 0.3);

      if (diff < minDiff || (diff < minDiff * 1.5 && isSentenceEnd)) {
        minDiff = diff;
        bestIndex = i;
      }
    }
    splitPoints.push(timestamps[bestIndex].end);
  }
  return splitPoints;
}

// Video Gen: Stitch Videos
app.post('/api/video-gen/stitch-videos', async (req, res) => {
  const tempFiles = [];
  try {
    const { video_urls } = req.body;

    if (!video_urls || !Array.isArray(video_urls) || video_urls.length === 0) {
      return res.status(400).json({ error: 'video_urls array is required' });
    }

    if (video_urls.length === 1) {
      return res.json({
        video_url: video_urls[0],
        success: true
      });
    }

    // Download all video segments
    const downloadedFiles = [];
    for (let i = 0; i < video_urls.length; i++) {
      const tempPath = path.join('/tmp', `segment_${Date.now()}_${i}.mp4`);
      await downloadFile(video_urls[i], tempPath);
      downloadedFiles.push(tempPath);
      tempFiles.push(tempPath);
    }

    // Stitch videos together
    const outputPath = path.join('/tmp', `stitched_${Date.now()}.mp4`);
    tempFiles.push(outputPath);
    await stitchVideos(downloadedFiles, outputPath);

    // Read the stitched video and convert to base64
    const videoBuffer = fs.readFileSync(outputPath);
    const videoBase64 = videoBuffer.toString('base64');

    // Clean up temp files
    for (const file of tempFiles) {
      try {
        await unlink(file);
      } catch (err) {
        console.error(`Failed to delete ${file}:`, err);
      }
    }

    res.json({
      video_base64: videoBase64,
      success: true,
      message: 'Videos stitched successfully'
    });
  } catch (error) {
    for (const file of tempFiles) {
      try {
        await unlink(file);
      } catch (err) {
        // Ignore cleanup errors
      }
    }
    console.error('Video stitching failed:', error);
    res.status(500).json({ error: error.message || 'Failed to stitch videos' });
  }
});

// Helper to download a file
async function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(filepath);
    protocol.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(filepath, () => { });
      reject(err);
    });
  });
}

// Helper to stitch videos using ffmpeg
async function stitchVideos(inputFiles, outputFile) {
  return new Promise((resolve, reject) => {
    const ffmpeg = require('fluent-ffmpeg');
    const command = ffmpeg();
    inputFiles.forEach(file => command.input(file));
    command
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .mergeToFile(outputFile, '/tmp');
  });
}

// Video Gen: Extract Frame (placeholder - actual extraction happens client-side)
app.post('/api/video-gen/extract-frame', async (req, res) => {
  try {
    const { video_url } = req.body;
    if (!video_url) {
      return res.status(400).json({ error: 'video_url is required' });
    }
    // Frame extraction happens client-side using video element and canvas
    res.json({
      success: true,
      message: 'Frame extraction should be done client-side',
      video_url: video_url
    });
  } catch (error) {
    console.error('Frame extraction failed:', error);
    res.status(500).json({ error: error.message || 'Failed to extract frame' });
  }
});

// Video Gen: Extend Video
app.post('/api/video-gen/extend-video', async (req, res) => {
  try {
    const { video_url, prompt, model = 'wan-2.5', duration_seconds = 10, resolution = '720p', audio_url } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    // This would need @fal-ai/serverless-client package
    // For now, return an error indicating the feature needs setup
    res.status(501).json({
      error: 'Video extension requires Fal.ai API setup',
      message: 'Please configure FAL_KEY in environment variables'
    });
  } catch (error) {
    console.error('Video extension failed:', error);
    res.status(500).json({ error: error.message || 'Failed to extend video' });
  }
});

// Video Gen: Fal Proxy
app.all('/api/video-gen/fal/proxy', async (req, res) => {
  const FAL_KEY = process.env.FAL_KEY;
  const targetUrl = req.headers['x-fal-target-url'];

  if (!targetUrl) {
    return res.status(400).json({ error: "Missing x-fal-target-url header" });
  }

  try {
    const urlObj = new URL(targetUrl);
    if (!/(\.|^)fal\.(run|ai)$/.test(urlObj.host)) {
      return res.status(412).json({ error: "Invalid target URL" });
    }
  } catch (e) {
    return res.status(400).json({ error: "Invalid target URL format" });
  }

  if (!FAL_KEY) {
    return res.status(401).json({ error: "Missing Fal credentials" });
  }

  const headers = {};
  Object.keys(req.headers).forEach(key => {
    if (key.toLowerCase().startsWith('x-fal-')) {
      headers[key] = req.headers[key];
    }
  });
  headers['Authorization'] = `Key ${FAL_KEY}`;
  headers['Content-Type'] = 'application/json';
  headers['Accept'] = 'application/json';

  const body = req.method === 'GET' ? undefined : JSON.stringify(req.body);

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: body,
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json(JSON.parse(errorText));
    }

    const responseData = await response.json();
    res.json(responseData);
  } catch (error) {
    console.error("Proxy exception:", error);
    res.status(500).json({ error: error.message || "Proxy failed" });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Enhanced Bulk Generator Backend API running on http://localhost:${PORT}`);
  console.log(`📡 Ready to handle workflow requests from Vite app (port 3007)`);
  console.log(`📱 Social Media API routes available at /api/workflow/social-media/*`);
  console.log(`🎬 Video Gen API routes available at /api/video-gen/*`);
});
