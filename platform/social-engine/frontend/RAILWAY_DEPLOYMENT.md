# Railway Deployment Guide

## ✅ Setup Complete

Your social media automation platform is now ready for Railway deployment with a working monorepo structure.

## 📋 What Was Done

### 1. Monorepo Structure Created
```
frontend/
├── app/                         # Next.js app
├── backend/                     # Backend (committed to git)
│   ├── core/                   # Workflow orchestrator
│   ├── video/                  # Video generation modules
│   ├── image/                  # Image generation
│   ├── config/                 # Configuration
│   ├── data/                   # Campaign state files (runtime)
│   └── main.js                 # CLI entry point
└── railway.toml                # Railway deployment config
```

**Note:** Backend folder is committed to git (same pattern as reference project).

### 2. Railway Configuration (railway.toml)
- **Builder**: Nixpacks (default build process)
- **Start Command**: `node_modules/.bin/next start -p $PORT`
- **Restart Policy**: On failure (max 10 retries)

### 3. API Routes Updated
All three API routes now use the monorepo pattern:
- `/api/workflow/execute` - Full campaign execution with SSE streaming
- `/api/workflow/stage` - Single stage execution with LongCat support
- `/api/workflow/data` - Fetch workflow stage data

Path pattern: `path.join(process.cwd(), 'backend')`

### 4. Module Resolution
Added NODE_PATH configuration for backend to find dependencies:
```javascript
const parentNodeModules = path.join(process.cwd(), 'node_modules')
const nodeEnv = {
  ...process.env,
  NODE_PATH: parentNodeModules + (process.env.NODE_PATH ? ':' + process.env.NODE_PATH : '')
}
```

## 🚀 Deployment Steps

### 1. Connect to Railway
1. Go to [Railway.app](https://railway.app)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select: `yogsbags/pl-social-media`
4. Railway will automatically detect `frontend/railway.toml`

### 2. Configure Environment Variables
Set these in Railway dashboard (Settings → Variables):

**Required for AI Generation:**
```bash
GROQ_API_KEY=<your-groq-api-key>
GEMINI_API_KEY=<your-gemini-api-key>
```

**Required for Video Generation:**
```bash
FAL_KEY=<your-fal-key>              # LongCat long-form videos
HEYGEN_API_KEY=<your-heygen-key>    # AI avatar videos
```

**Required for Image Generation:**
```bash
REPLICATE_API_TOKEN=<your-replicate-token>
```

**MoEngage (server-side only):**
```bash
MOENGAGE_WORKSPACE_ID=<your-moengage-workspace-id>
MOENGAGE_DATA_API_KEY=<your-moengage-data-api-key>
MOENGAGE_REPORTING_API_KEY=<your-moengage-reporting-api-key>
# Optional overrides if your region differs:
# MOENGAGE_BASE_URL=https://api-01.moengage.com
# MOENGAGE_REPORTS_BASE_URL=https://api-01.moengage.com
```

**Optional:**
```bash
NEXT_PUBLIC_API_URL=<backend-api-url-if-needed>
```

### 3. Deploy
Railway will automatically:
1. Run `npm ci` (install dependencies)
2. Run `npm run build` (build Next.js)
3. Start with `next start -p $PORT`

## 🔍 Verification

### Local Testing
Already verified locally:
```bash
✅ Backend folder created successfully
✅ All modules copied (core, video, image, config)
✅ main.js executable and working
✅ Dev server running on port 3004
✅ API routes serving successfully (GET / 200)
```

### Railway Testing
After deployment, test these endpoints:

1. **Homepage**: `https://<your-app>.railway.app/`
   - Should show dashboard

2. **Workflow Data**: `https://<your-app>.railway.app/api/workflow/data?stage=1`
   - Should return campaign data or empty state

3. **Stage Execution**: `POST https://<your-app>.railway.app/api/workflow/stage`
   ```json
   {
     "stageId": 1,
     "campaignType": "linkedin-carousel",
     "topic": "AI in finance"
   }
   ```
   - Should return SSE stream with logs

## 📁 File Structure Reference

### Backend Files (Committed to Git)
```
backend/
├── core/
│   ├── orchestrator.js          # Workflow orchestration
│   └── state-manager.js         # Campaign state management
├── video/
│   ├── video-coordinator.js     # Video workflow coordination
│   ├── video-generator.js       # VEO video generation
│   ├── avatar-generator.js      # HeyGen avatar videos
│   ├── longcat-generator.js     # LongCat long-form videos
│   └── video-editor.js          # Shotstack editing
├── image/
│   └── image-generator.js       # Image generation
├── config/
│   ├── brand-config.js          # Brand settings
│   ├── heygen-avatar-config.js  # Avatar configurations
│   └── plindia-images.json      # Image assets
├── main.js                       # CLI entry point
└── package.json                  # Backend dependencies
```

### Frontend API Routes
```
app/api/workflow/execute/route.ts  - Full campaign workflow
app/api/workflow/stage/route.ts    - Individual stage execution
app/api/workflow/data/route.ts     - Fetch stage data
```

## 🐛 Troubleshooting

### Backend Not Found (502 Errors)
**Error**: "ENOENT: no such file or directory, open 'backend/main.js'"
- **Fix**: Verify backend/ folder is committed to git (not in .gitignore)
- **Fix**: Check Railway is building from `/frontend` root directory

### Module Resolution Errors
**Error**: "Cannot find module 'groq-sdk'"
- **Fix**: Verify NODE_PATH is set in environment
- **Fix**: Ensure npm ci installed all dependencies

### Stage Execution Fails
**Error**: "spawn ENOENT" when executing backend
- **Fix**: Verify main.js has correct path in API routes
- **Fix**: Check workingDir is set to backend/ subdirectory

## 📊 Expected Behavior

### Build Process
```
1. Checkout code from GitHub (includes backend/ folder)
2. Run: npm ci
   ✓ Dependencies installed
3. Run: npm run build
   ✓ Next.js built successfully
4. Start: next start -p 8080
   ✓ Ready on http://localhost:8080
```

### Runtime
```
1. User visits dashboard → GET / 200
2. User executes workflow → POST /api/workflow/stage
3. API spawns: node backend/main.js stage planning
4. Backend streams logs via SSE
5. Backend saves state to backend/data/campaign-state.json
6. Frontend receives completion status
```

## 🎯 Next Steps

1. **Deploy to Railway**: Follow deployment steps above
2. **Configure Environment Variables**: Add all API keys
3. **Test Endpoints**: Verify API routes work
4. **Execute First Campaign**: Run a test workflow
5. **Monitor Logs**: Check Railway dashboard for any issues

## 📝 Notes

- **Port**: Railway automatically assigns $PORT (usually 8080)
- **Data Persistence**: Use Railway volumes for backend/data/ if needed
- **API Keys**: Never commit API keys to git - use Railway environment variables
- **Build Time**: First build takes 2-3 minutes, subsequent builds are faster

## 🔗 Resources

- **Repository**: https://github.com/yogsbags/pl-social-media
- **Railway Docs**: https://docs.railway.app
- **Next.js Deployment**: https://nextjs.org/docs/deployment

---

**Status**: ✅ Ready for deployment
**Last Updated**: 2025-11-24
**Deployed By**: Railway.app
