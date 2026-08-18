import { createContext, useContext } from 'react'

export const SearchContext = createContext<{ open: () => void }>({ open: () => {} })

// eslint-disable-next-line react-refresh/only-export-components
export function useSearchPalette() {
  return useContext(SearchContext)
}
