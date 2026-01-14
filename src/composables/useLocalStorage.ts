import { ref, watch } from 'vue'

export function useLocalStorage<T>(key: string, defaultValue: T) {
  const stored = localStorage.getItem(key)
  const initial = stored ? JSON.parse(stored) : defaultValue

  const state = ref<T>(initial) as { value: T }

  watch(
    () => state.value,
    (newValue) => {
      localStorage.setItem(key, JSON.stringify(newValue))
    },
    { deep: true }
  )

  return state
}

export interface AppPreferences {
  theme: 'dark' | 'light'
  showMinimap: boolean
  hiddenRoles: string[]
  layout: 'force' | 'hierarchical' | 'circle'
  driftPaused: boolean
  lastfmUsername: string
}

export const defaultPreferences: AppPreferences = {
  theme: 'dark',
  showMinimap: true,
  hiddenRoles: [],
  layout: 'force',
  driftPaused: false,
  lastfmUsername: '',
}
