import { useState, useEffect } from 'react'
import type { ThemeMode } from '@/types'
import { readStoredItem, writeStoredItem } from '@/utils/persistentStorage'

const THEME_MODE_KEY = 'theme-mode'
const THEME_LIGHT_DEFAULT_KEY = 'theme-light-default-v103'

function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute('data-theme', mode)
}

function readStoredMode(): ThemeMode {
  const stored = readStoredItem(THEME_MODE_KEY)
  if (stored === 'dark') return 'dark'
  // Light is the default for new installs and for the old "system" value.
  return 'light'
}

// Default to the light theme. Existing installs are moved to light once so the
// old forced-dark migration does not keep overriding the new default; an
// explicit user choice of dark after this point still persists.
// initTheme() is called from the entry because Settings is lazy-loaded.
export function initTheme() {
  if (!readStoredItem(THEME_LIGHT_DEFAULT_KEY)) {
    writeStoredItem(THEME_MODE_KEY, 'light')
    writeStoredItem(THEME_LIGHT_DEFAULT_KEY, '1')
  }
  applyTheme(readStoredMode())
}

export function useTheme() {
  // 惰性读取：每次挂载都从存储取最新值，避免路由切回设置页时用陈旧值。
  const [mode, setMode] = useState<ThemeMode>(readStoredMode)

  useEffect(() => {
    applyTheme(mode)
    writeStoredItem(THEME_MODE_KEY, mode)
  }, [mode])

  const toggle = () => {
    setMode(prev => prev === 'light' ? 'dark' : 'light')
  }

  return { mode, setMode, toggle }
}
