import '../styles/globals.css'

export const metadata = {
  title: 'BELAR Tracker',
  description: 'Portfolio tracker — Capa JOSE · Ecosistema IA Personal',
}

// Next 14.2+ exige themeColor en `viewport`, no en `metadata`
export const viewport = {
  themeColor: '#FAF8F5',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        {/* Iconos servidos desde /public con versioning para forzar refetch tras update.
            Sube el ?v=N en cada cambio visual del SVG. */}
        <link rel="icon" type="image/svg+xml" href="/icon.svg?v=5" />
        <link rel="apple-touch-icon" href="/apple-icon.svg?v=5" />
        <link rel="shortcut icon" type="image/svg+xml" href="/icon.svg?v=5" />
        <meta name="apple-mobile-web-app-title" content="BELAR" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  )
}
