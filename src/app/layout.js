import '../styles/globals.css'

export const metadata = {
  title: 'BELAR Tracker',
  description: 'Portfolio tracker — Capa JOSE · Ecosistema IA Personal',
  manifest: '/site.webmanifest?v=7',
}

export const viewport = {
  themeColor: '#FAF8F5',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        {/* Favicons multipropósito con versioning para forzar refetch.
            Safari/macOS y Apple Touch Icon prefieren PNG real sobre SVG. */}
        <link rel="icon" type="image/svg+xml" href="/icon.svg?v=7" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icon-16.png?v=7" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icon-32.png?v=7" />
        <link rel="icon" type="image/png" sizes="48x48" href="/icon-48.png?v=7" />
        <link rel="icon" type="image/png" sizes="64x64" href="/icon-64.png?v=7" />
        <link rel="icon" type="image/png" sizes="128x128" href="/icon-128.png?v=7" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png?v=7" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png?v=7" />
        <link rel="shortcut icon" href="/favicon.ico?v=7" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=7" />
        <link rel="apple-touch-icon-precomposed" sizes="180x180" href="/apple-touch-icon-precomposed.png?v=7" />
        <meta name="apple-mobile-web-app-title" content="BELAR" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
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
