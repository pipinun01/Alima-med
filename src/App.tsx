import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '@/context/ThemeContext'
import { AuthProvider } from '@/context/AuthContext'
import { SettingsProvider } from '@/context/SettingsContext'
import { TreeProvider } from '@/context/TreeContext'
import { AppShell } from '@/components/AppShell'
import { TelegramGate } from '@/components/TelegramGate'
import { HomePage } from '@/pages/HomePage'
import { NodePage } from '@/pages/NodePage'
import { ProfilePage } from '@/pages/ProfilePage'
import { EditorPage } from '@/pages/EditorPage'
import { SetupPage } from '@/pages/SetupPage'
import { isConfigured } from '@/lib/supabase'
import { initTelegram } from '@/lib/telegram'

export default function App() {
  useEffect(() => {
    initTelegram()
  }, [])

  if (!isConfigured) {
    return (
      <ThemeProvider>
        <SetupPage />
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <TelegramGate>
          <SettingsProvider>
            <TreeProvider>
              <BrowserRouter>
                <AppShell>
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/n/:id" element={<NodePage />} />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/edit" element={<EditorPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </AppShell>
              </BrowserRouter>
            </TreeProvider>
          </SettingsProvider>
        </TelegramGate>
      </AuthProvider>
    </ThemeProvider>
  )
}
