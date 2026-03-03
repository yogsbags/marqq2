import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PL Capital Social Media Engine',
  description: 'AI-Powered Multi-Platform Campaign Automation',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
