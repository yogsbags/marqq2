# 502 Error Debugging Guide

## What Was Added (Latest Commits)

### 1. Health Check Endpoint
**File**: `app/api/health/route.ts`

**Purpose**: Comprehensive system diagnostics

**Test Once Deployed**:
```bash
curl https://<your-app>.railway.app/api/health
```

**Returns**:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-24T...",
  "backend": {
    "exists": true/false,
    "path": "/app/backend",
    "mainJs": true/false,
    "files": ["core", "video", "image", "config", "main.js", "package.json"]
  },
  "environment": {
    "nodeEnv": "production",
    "port": "8080",
    "groqKey": true/false,
    "geminiKey": true/false,
    "falKey": true/false,
    "heygenKey": true/false,
    "replicateKey": true/false
  }
}
```

### 2. Root API Route
**File**: `app/api/route.ts`

**Purpose**: Basic operational check

**Test Once Deployed**:
```bash
curl https://<your-app>.railway.app/api
```

**Returns**:
```json
{
  "status": "ok",
  "timestamp": "2025-11-24T...",
  "message": "API is operational"
}
```

### 3. Middleware Logging
**File**: `middleware.ts`

**Purpose**: Log every incoming request

**Logs to Railway Console**:
```
[Middleware] {
  method: "GET",
  pathname: "/",
  timestamp: "2025-11-24T...",
  headers: {
    host: "your-app.railway.app",
    userAgent: "Mozilla/5.0..."
  }
}
```

## Diagnostic Steps After Railway Rebuild

### Step 1: Check Railway Build Logs
```bash
# Look for build success
=== Successfully Built! ===
Build time: XX seconds
```

### Step 2: Check Railway Deployment Logs
Look for startup messages:
- `✓ Ready in XXms`
- `○ Compiling /`
- `✓ Compiled / in XXms`

### Step 3: Test Health Check Endpoint
```bash
# This is the MOST important test
curl https://<your-app>.railway.app/api/health
```

**If this returns 502**:
- Next.js server is not starting properly
- Check Railway logs for startup errors
- Look for module resolution errors
- Check for missing dependencies

**If this returns 200**:
- Server is running!
- Backend folder status will be in response
- Environment variables status will be in response

### Step 4: Test Root API Route
```bash
curl https://<your-app>.railway.app/api
```

This confirms basic API routing works.

### Step 5: Test Homepage
```bash
curl https://<your-app>.railway.app/
```

If API routes work but homepage fails, the issue is client-side rendering.

## Common 502 Causes and Solutions

### Cause 1: Next.js Server Crashes on Startup
**Symptoms**: Build succeeds but no logs after "Ready"

**Check For**:
- Import errors in page.tsx or layout.tsx
- Missing environment variables causing crashes
- Module not found errors

**Solution**: Check Railway logs for error stack traces

### Cause 2: Port Binding Issue
**Symptoms**: Server starts but can't be reached

**Check For**:
- PORT environment variable not set
- Server listening on wrong port

**Solution**: Verify railway.toml uses `-p $PORT`

### Cause 3: Backend Folder Missing
**Symptoms**: Health check shows backend.exists = false

**Check For**:
- Backend folder not committed to git
- .gitignore excluding backend/
- Build process deleting backend/

**Solution**: Verify backend/ is in git and deployed

### Cause 4: Module Resolution Errors
**Symptoms**: "Cannot find module" in logs

**Check For**:
- Missing dependencies in package.json
- NODE_PATH not set correctly
- npm ci failing silently

**Solution**: Check npm install logs in build

### Cause 5: Homepage Client-Side Error
**Symptoms**: API routes work (200) but / returns 502

**Check For**:
- React hydration errors
- Client-side crashes during render
- Missing dependencies for client components

**Solution**: Check browser console and Railway logs

## What to Share for Further Debugging

1. **Railway Build Logs**: Full output from latest build
2. **Railway Deployment Logs**: Server startup and request logs
3. **Health Check Response**: Output from `/api/health`
4. **Middleware Logs**: Request logging from Railway console

## Expected Healthy Output

### Health Check
```json
{
  "status": "healthy",
  "backend": {
    "exists": true,
    "mainJs": true,
    "files": ["core", "video", "image", "config", "main.js", "package.json"]
  },
  "environment": {
    "nodeEnv": "production",
    "groqKey": true,
    "geminiKey": true
  }
}
```

### Middleware Logs (Railway Console)
```
[Middleware] { method: "GET", pathname: "/api/health", ... }
[Health Check] {...}
[Middleware] { method: "GET", pathname: "/", ... }
[Root API] GET / request received
```

### Homepage
```
GET / 200 (HTML with React app)
```

## Next Steps

1. **Wait for Railway rebuild** (2-3 minutes)
2. **Check build logs** for success
3. **Test `/api/health`** immediately
4. **Share the health check response** if still 502
5. **Check Railway deployment logs** for error messages

---

**Status**: Logging deployed, awaiting Railway rebuild
**Date**: 2025-11-24
**Purpose**: Diagnose persistent 502 errors despite successful builds
