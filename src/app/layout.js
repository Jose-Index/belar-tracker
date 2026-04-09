import '../styles/globals.css'

export const metadata = {
  title: 'BELAR Tracker v9',
  description: 'Portfolio tracker — Capa JOSE · Ecosistema IA Personal',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
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
