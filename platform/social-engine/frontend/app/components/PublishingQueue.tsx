'use client'

type PublishingQueueProps = {
  publishedUrls: Record<string, string>
  platforms: string[]
}

export default function PublishingQueue({ publishedUrls, platforms }: PublishingQueueProps) {
  const platformConfig: Record<string, { icon: string; color: string; label: string }> = {
    linkedin: { icon: '🔗', color: 'bg-blue-500', label: 'LinkedIn' },
    instagram: { icon: '📸', color: 'bg-pink-500', label: 'Instagram' },
    youtube: { icon: '📺', color: 'bg-red-500', label: 'YouTube' },
    facebook: { icon: '👥', color: 'bg-blue-600', label: 'Facebook' },
    twitter: { icon: '🐦', color: 'bg-sky-500', label: 'Twitter/X' },
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">📤 Publishing Queue</h3>

      {/* Platform Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {platforms.map(platform => {
          const config = platformConfig[platform]
          const url = publishedUrls[platform]
          const isPublished = !!url

          return (
            <div
              key={platform}
              className={`p-4 rounded-lg border-2 transition-all ${
                isPublished
                  ? 'border-green-300 bg-green-50'
                  : 'border-gray-300 bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{config.icon}</span>
                  <h4 className="font-semibold text-gray-800">{config.label}</h4>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  isPublished
                    ? 'bg-green-100 text-green-700'
                    : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {isPublished ? 'Published' : 'Uploading...'}
                </span>
              </div>

              {isPublished ? (
                <div className="space-y-2">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs text-blue-600 hover:text-blue-800 hover:underline break-all"
                  >
                    🔗 {url}
                  </a>
                  <div className="flex gap-2">
                    <button
                      onClick={() => navigator.clipboard.writeText(url)}
                      className="flex-1 text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    >
                      📋 Copy URL
                    </button>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-center text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                    >
                      👁️ View Post
                    </a>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-gray-600" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="text-xs text-gray-600">Publishing to {config.label}...</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Summary */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-800">Publishing Progress</p>
            <p className="text-xs text-gray-600 mt-1">
              {Object.keys(publishedUrls).length} of {platforms.length} platforms complete
            </p>
          </div>
          <div className="text-2xl">
            {Object.keys(publishedUrls).length === platforms.length ? '✅' : '⏳'}
          </div>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 mt-3 overflow-hidden">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${(Object.keys(publishedUrls).length / platforms.length) * 100}%` }}
          />
        </div>
      </div>

      {/* All Published Message */}
      {Object.keys(publishedUrls).length === platforms.length && (
        <div className="text-center p-4 bg-green-100 rounded-lg border-2 border-green-300">
          <p className="text-green-700 font-semibold">
            🎉 Campaign successfully published to all platforms!
          </p>
        </div>
      )}
    </div>
  )
}
