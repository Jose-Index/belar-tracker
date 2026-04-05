import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BELAR Tracker v8',
  description: 'Portfolio tracker — Capa JOSE',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
