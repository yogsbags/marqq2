'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to console and any error reporting service
    console.error('[Error Boundary]', error)
  }, [error])

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-8">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-lg">
        <h2 className="text-2xl font-bold text-red-600 mb-4">Something went wrong!</h2>
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-800 font-mono">
            {error.message || 'An unexpected error occurred'}
          </p>
          {error.digest && (
            <p className="text-xs text-red-600 mt-2">
              Error ID: {error.digest}
            </p>
          )}
        </div>
        <button
          onClick={reset}
          className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-semibold"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
