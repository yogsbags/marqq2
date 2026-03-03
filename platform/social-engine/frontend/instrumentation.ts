export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Instrumentation] Server starting...')
    console.log('[Instrumentation] Node version:', process.version)
    console.log('[Instrumentation] Platform:', process.platform)
    console.log('[Instrumentation] CWD:', process.cwd())
    console.log('[Instrumentation] PORT:', process.env.PORT)
    console.log('[Instrumentation] NODE_ENV:', process.env.NODE_ENV)

    // Check backend folder at startup
    const fs = await import('fs')
    const path = await import('path')
    const backendPath = path.join(process.cwd(), 'backend')

    try {
      const backendExists = fs.existsSync(backendPath)
      console.log('[Instrumentation] Backend folder exists:', backendExists)

      if (backendExists) {
        const files = fs.readdirSync(backendPath)
        console.log('[Instrumentation] Backend files:', files)
      }
    } catch (error) {
      console.error('[Instrumentation] Error checking backend:', error)
    }

    console.log('[Instrumentation] Server initialization complete')
  }
}
