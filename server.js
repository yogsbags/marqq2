import { createServer, request as httpRequest } from 'node:http'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = Number(process.env.PORT || 3007)
const BACKEND_PORT = Number(process.env.BACKEND_PORT || 3008)
const BACKEND_ORIGIN = `http://127.0.0.1:${BACKEND_PORT}`

const distDir = path.join(__dirname, 'dist')

function isApiRequest(urlPathname) {
  return urlPathname.startsWith('/api/') || urlPathname === '/health'
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
      return 'application/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.svg':
      return 'image/svg+xml'
    case '.ico':
      return 'image/x-icon'
    case '.woff':
      return 'font/woff'
    case '.woff2':
      return 'font/woff2'
    default:
      return 'application/octet-stream'
  }
}

function proxyToBackend(req, res) {
  const targetUrl = new URL(req.url || '/', BACKEND_ORIGIN)

  const proxyReq = httpRequest(
    {
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port,
      method: req.method,
      path: targetUrl.pathname + targetUrl.search,
      headers: {
        ...req.headers,
        host: `127.0.0.1:${BACKEND_PORT}`
      }
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
      proxyRes.pipe(res)
    }
  )

  proxyReq.on('error', (err) => {
    res.statusCode = 502
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'Backend unavailable', details: err.message }))
  })

  req.pipe(proxyReq)
}

async function serveFile(res, filePath) {
  const data = await fs.readFile(filePath)
  res.statusCode = 200
  res.setHeader('content-type', contentTypeFor(filePath))
  res.end(data)
}

async function serveFrontend(req, res) {
  const url = new URL(req.url || '/', 'http://localhost')
  const rawPath = decodeURIComponent(url.pathname)
  const safePath = path.normalize(rawPath).replace(/^(\.\.(\/|\\|$))+/, '')

  const candidate = path.join(distDir, safePath)
  try {
    const stat = await fs.stat(candidate)
    if (stat.isFile()) {
      return await serveFile(res, candidate)
    }
  } catch {
    // fallthrough to SPA index.html
  }

  // SPA fallback
  const indexPath = path.join(distDir, 'index.html')
  try {
    return await serveFile(res, indexPath)
  } catch (err) {
    res.statusCode = 500
    res.setHeader('content-type', 'text/plain; charset=utf-8')
    res.end(`Missing frontend build output. Run \`npm run build\` first.\n${err.message}`)
  }
}

function startBackend() {
  const backendScript = path.join(__dirname, 'platform', 'content-engine', 'backend-server.js')
  const child = spawn(process.execPath, [backendScript], {
    env: { ...process.env },
    stdio: 'inherit'
  })

  child.on('exit', (code, signal) => {
    console.log(`[backend] exited code=${code} signal=${signal}`)
  })

  return child
}

function startVoicebotAgent() {
  if (String(process.env.ENABLE_VOICEBOT_AGENT || '').toLowerCase() !== 'true') {
    console.log('[voicebot-agent] disabled (set ENABLE_VOICEBOT_AGENT=true to enable)')
    return null
  }

  const agentScript = path.join(__dirname, 'platform', 'voicebot', 'agent.js')
  const child = spawn(process.execPath, [agentScript, 'start'], {
    env: { ...process.env },
    stdio: 'inherit'
  })

  child.on('exit', (code, signal) => {
    console.log(`[voicebot-agent] exited code=${code} signal=${signal}`)
  })

  return child
}

const backendProcess = startBackend()
const voicebotAgentProcess = startVoicebotAgent()

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost')

  if (isApiRequest(url.pathname)) {
    return proxyToBackend(req, res)
  }

  try {
    await serveFrontend(req, res)
  } catch (err) {
    res.statusCode = 500
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'Server error', details: err.message }))
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Martech server listening on http://0.0.0.0:${PORT}`)
  console.log(`   - Frontend: dist/ (SPA)`)
  console.log(`   - Backend:  proxied to ${BACKEND_ORIGIN}`)
})

function shutdown() {
  server.close(() => process.exit(0))
  try {
    backendProcess.kill('SIGTERM')
  } catch {
    // ignore
  }
  try {
    voicebotAgentProcess?.kill('SIGTERM')
  } catch {
    // ignore
  }
  setTimeout(() => process.exit(0), 5000).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
