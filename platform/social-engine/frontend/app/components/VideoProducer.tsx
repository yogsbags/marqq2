'use client'

type VideoProducerProps = {
  videoData: {
    videoId?: string
    status?: string
    avatar?: {
      provider: string
      url: string
      duration: number
      status: string
    }
    broll?: {
      provider: string
      clips: Array<{
        timeRange: string
        url: string
        provider: string
        status: string
      }>
      totalDuration: number
      providerUsage: Record<string, number>
    }
    composite?: {
      url: string
      status: string
      renders: Record<string, string>
    }
    progress?: number
  }
}

export default function VideoProducer({ videoData }: VideoProducerProps) {
  if (!videoData) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Waiting for video production to start...</p>
      </div>
    )
  }

  const { avatar, broll, composite, progress = 0 } = videoData

  // Calculate overall progress
  const avatarProgress = avatar?.status === 'completed' ? 100 : avatar?.status === 'processing' ? 50 : 0
  const brollProgress = broll?.clips?.length
    ? (broll.clips.filter(c => c.status === 'completed').length / broll.clips.length) * 100
    : 0
  const compositeProgress = composite?.status === 'completed' ? 100 : composite?.status === 'processing' ? 50 : 0

  const overallProgress = (avatarProgress + brollProgress + compositeProgress) / 3

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">🎬 Video Production Progress</h3>
        <div className="text-sm font-medium text-blue-600">
          {Math.round(overallProgress)}% Complete
        </div>
      </div>

      {/* Overall Progress Bar */}
      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
        <div
          className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-500 video-progress"
          style={{ width: `${overallProgress}%` }}
        />
      </div>

      {/* Avatar Production */}
      {avatar && (
        <div className="p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">🎭</span>
              <h4 className="font-semibold text-gray-800">HeyGen AI Avatar</h4>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
              avatar.status === 'completed' ? 'bg-green-100 text-green-700' :
              avatar.status === 'processing' ? 'bg-yellow-100 text-yellow-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              {avatar.status}
            </span>
          </div>
          {avatar.status === 'completed' && avatar.url && (
            <div className="mt-2">
              <p className="text-xs text-gray-600 mb-1">Duration: {avatar.duration}s</p>
              <a
                href={avatar.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:text-blue-800 hover:underline break-all"
              >
                📥 Download: {avatar.url}
              </a>
            </div>
          )}
          {avatar.status === 'processing' && (
            <div className="mt-2 flex items-center gap-2">
              <svg className="animate-spin h-4 w-4 text-blue-600" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-xs text-gray-600">Generating avatar video...</span>
            </div>
          )}
        </div>
      )}

      {/* Veo B-Roll Production */}
      {broll && (
        <div className="p-4 bg-purple-50 rounded-lg border-2 border-purple-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🎬</span>
              <h4 className="font-semibold text-gray-800">Veo 3.1 Scene Extension</h4>
            </div>
            <span className="text-xs font-medium text-purple-700">
              {broll.clips?.filter(c => c.status === 'completed').length || 0}/{broll.clips?.length || 0} clips
            </span>
          </div>

          {/* Progress bar for clips */}
          <div className="w-full bg-gray-200 rounded-full h-2 mb-3 overflow-hidden">
            <div
              className="bg-purple-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${brollProgress}%` }}
            />
          </div>

          {/* Clip List */}
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {broll.clips?.map((clip, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs p-2 bg-white rounded">
                <div className="flex items-center gap-2 flex-1">
                  <span className={`${
                    clip.status === 'completed' ? 'text-green-500' :
                    clip.status === 'processing' ? 'text-yellow-500' :
                    'text-gray-400'
                  }`}>
                    {clip.status === 'completed' ? '✅' : clip.status === 'processing' ? '⏳' : '⏸'}
                  </span>
                  <span className="text-gray-700 font-medium">{clip.timeRange}</span>
                  <span className="text-gray-500">({clip.provider})</span>
                </div>
                {clip.status === 'completed' && (
                  <span className="text-green-600 font-medium">Ready</span>
                )}
              </div>
            ))}
          </div>

          {/* Provider Usage */}
          {broll.providerUsage && (
            <div className="mt-3 pt-3 border-t border-purple-200">
              <p className="text-xs text-gray-600 mb-1">Provider Usage:</p>
              <div className="flex gap-3 text-xs">
                {Object.entries(broll.providerUsage).map(([provider, count]) => (
                  <span key={provider} className="px-2 py-1 bg-purple-100 text-purple-700 rounded font-medium">
                    {provider}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Shotstack Compositing */}
      {composite && (
        <div className="p-4 bg-green-50 rounded-lg border-2 border-green-200">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">✂️</span>
              <h4 className="font-semibold text-gray-800">Shotstack Compositing</h4>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
              composite.status === 'completed' ? 'bg-green-100 text-green-700' :
              composite.status === 'processing' ? 'bg-yellow-100 text-yellow-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              {composite.status}
            </span>
          </div>

          {composite.status === 'processing' && (
            <div className="mt-2 flex items-center gap-2">
              <svg className="animate-spin h-4 w-4 text-green-600" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-xs text-gray-600">Compositing avatar + b-roll...</span>
            </div>
          )}

          {composite.status === 'completed' && composite.renders && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-medium text-gray-700">Multi-Platform Renders:</p>
              {Object.entries(composite.renders).map(([platform, url]) => (
                <div key={platform} className="flex items-center justify-between p-2 bg-white rounded text-xs">
                  <span className="font-medium text-gray-700 capitalize">{platform}</span>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    📥 Download
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Status Message */}
      <div className="text-center pt-4">
        {overallProgress === 100 ? (
          <p className="text-green-600 font-semibold">✅ Video production complete!</p>
        ) : overallProgress > 0 ? (
          <p className="text-blue-600 font-semibold">🔄 Production in progress...</p>
        ) : (
          <p className="text-gray-500">⏳ Waiting to start...</p>
        )}
      </div>
    </div>
  )
}
