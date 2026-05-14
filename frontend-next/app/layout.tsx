import type { Metadata, Viewport } from 'next'
import { Montserrat } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import './globals.css'

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-montserrat',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'HealthcareAI — Unified Agentic Health Platform',
    template: '%s | HealthcareAI',
  },
  description:
    'AI-Powered Intelligent Healthcare Assistant. Get medical guidance, book appointments, and manage your health with our unified agentic AI platform.',
  keywords: ['healthcare', 'AI', 'medical', 'appointment', 'telemedicine', 'health assistant'],
  authors: [{ name: 'HealthcareAI Team' }],
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    siteName: 'HealthcareAI',
    title: 'HealthcareAI — AI-Powered Health Platform',
    description: 'Unified AI healthcare assistant for patients, doctors, and clinics.',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`bg-gray-50 ${montserrat.variable}`}>
      <body className="antialiased bg-gray-50 text-gray-900">
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: { borderRadius: '12px', fontSize: '14px', fontFamily: 'Montserrat, sans-serif' },
            success: { iconTheme: { primary: '#059669', secondary: '#fff' } },
            error:   { iconTheme: { primary: '#dc2626', secondary: '#fff' } },
          }}
        />
      </body>
    </html>
  )
}
