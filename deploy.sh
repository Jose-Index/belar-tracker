#!/bin/bash
# BELAR Tracker v9 — Deploy Script
# Ejecutar desde la carpeta donde descomprimiste el tar.gz

echo "🟢 BELAR Tracker v9 — Deploying..."

# Navigate to project
cd belar-tracker-v9 2>/dev/null || { echo "❌ No se encuentra la carpeta belar-tracker-v9. Descomprime primero el tar.gz."; exit 1; }

# Init git
rm -rf .git
git init
git checkout -b main

# Add all files
git add -A
git commit -m "🚀 BELAR Tracker v9 — Full rebuild with Supabase"

# Force push to existing repo (replaces all content)
git remote add origin https://github.com/Jose-Index/belar-tracker.git 2>/dev/null || git remote set-url origin https://github.com/Jose-Index/belar-tracker.git
git push origin main --force

echo ""
echo "✅ Push completado. Vercel detectará el push y deployará automáticamente."
echo ""
echo "⚠️  IMPORTANTE: Configura las env vars en Vercel:"
echo "   NEXT_PUBLIC_SUPABASE_URL = https://ruqgzfoperkfmahpbpcv.supabase.co"
echo "   NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1cWd6Zm9wZXJrZm1haHBicGN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNzcwNDQsImV4cCI6MjA5MDk1MzA0NH0.dCU32VikP5UayKv7JQuTloYn3RlawHlwn7igL6kbJ9I"
echo ""
echo "🔗 Tu tracker estará en: https://belar-tracker.vercel.app"
