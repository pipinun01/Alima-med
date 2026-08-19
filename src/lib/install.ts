/**
 * Установка на телефон или компьютер.
 *
 * Chrome и Edge сами предлагают установку событием beforeinstallprompt — его
 * нужно перехватить и придержать до нажатия кнопки. Safari на iPhone такого
 * события не знает, там остаётся показать, куда нажимать руками.
 */

import { useEffect, useState } from 'react'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((fn) => fn())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

/** Приложение уже открыто как приложение, а не как вкладка */
export function isStandalone() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  )
}

export const isIOS = () =>
  typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)

export function useInstall() {
  const [available, setAvailable] = useState(Boolean(deferred))

  useEffect(() => {
    const update = () => setAvailable(Boolean(deferred))
    listeners.add(update)
    return () => {
      listeners.delete(update)
    }
  }, [])

  const install = async () => {
    if (!deferred) return false
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    if (outcome === 'accepted') {
      deferred = null
      notify()
    }
    return outcome === 'accepted'
  }

  return { available, install, standalone: isStandalone(), ios: isIOS() }
}
