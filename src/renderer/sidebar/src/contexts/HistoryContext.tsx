import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

interface BrowsingHistoryEntry {
  id: string;
  url: string;
  title: string;
  visitedAt: Date;
  favicon?: string;
}

interface HistoryContextType {
  history: BrowsingHistoryEntry[]
  isLoading: boolean
  searchQuery: string
  setSearchQuery: (query: string) => void
  refreshHistory: () => Promise<void>
  clearHistory: () => Promise<void>
  removeEntry: (entryId: string) => Promise<void>
  navigateToUrl: (url: string) => Promise<{id: string, title: string, url: string, wasExisting: boolean}>
  searchHistory: (query: string) => Promise<void>
}

const HistoryContext = createContext<HistoryContextType | null>(null)

export const useHistory = (): HistoryContextType => {
  const context = useContext(HistoryContext)
  if (!context) {
    throw new Error('useHistory must be used within a HistoryProvider')
  }
  return context
}

interface HistoryProviderProps {
  children: React.ReactNode
}

export const HistoryProvider: React.FC<HistoryProviderProps> = ({ children }) => {
  const [history, setHistory] = useState<BrowsingHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const refreshHistory = useCallback(async () => {
    setIsLoading(true)
    try {
      console.log('HistoryContext: Loading browsing history...')
      const historyData = await window.sidebarAPI.getBrowsingHistory()
      console.log('HistoryContext: Raw history data:', historyData)
      
      // Convert string dates back to Date objects and sort by latest visit
      const processedHistory = historyData.map(entry => {
        const date = new Date(entry.visitedAt)
        console.log('Date conversion:', entry.visitedAt, '->', date, 'Valid:', !isNaN(date.getTime()))
        return {
          ...entry,
          visitedAt: date
        }
      }).sort((a, b) => b.visitedAt.getTime() - a.visitedAt.getTime()) // Sort newest first
      
      console.log('HistoryContext: Processed and sorted history:', processedHistory)
      setHistory(processedHistory)
    } catch (error) {
      console.error('Failed to load history:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const searchHistory = useCallback(async (query: string) => {
    setIsLoading(true)
    try {
      console.log('[HistoryContext] Searching history with query:', query)
      if (query.trim()) {
        // Smart search: basic string search first, semantic fallback if no results
        // Quotes trigger exact match only (no semantic fallback)
        const results = await window.sidebarAPI.searchBrowsingHistory(query, { limit: 100 })
        console.log('[HistoryContext] Search results:', {
          count: results.length,
          mode: (results[0] as any)?._searchMode || 'unknown'
        })
        
        // Process results and convert dates
        const processedResults = results.map(entry => ({
          ...entry,
          visitedAt: new Date(entry.visitedAt)
        }))
        
        // Check if results are from semantic search (have _searchScore)
        const hasSemanticScores = processedResults.some((entry: any) => entry._searchScore !== undefined)
        
        if (hasSemanticScores) {
          // For semantic search results, keep backend sort order (already sorted by score + date)
          console.log('[HistoryContext] Using semantic search sort order (score + recency)')
          setHistory(processedResults)
        } else {
          // For basic text search, sort by visit date (newest first)
          console.log('[HistoryContext] Using date sort order (basic search)')
          const sortedResults = processedResults.sort((a, b) => b.visitedAt.getTime() - a.visitedAt.getTime())
          setHistory(sortedResults)
        }
      } else {
        console.log('[HistoryContext] Empty query, loading full history')
        await refreshHistory()
      }
    } catch (error) {
      console.error('[HistoryContext] Failed to search history:', error)
    } finally {
      setIsLoading(false)
    }
  }, [refreshHistory])

  const clearHistory = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await window.sidebarAPI.clearBrowsingHistory()
      if (result.success) {
        setHistory([])
      } else {
        console.error('Failed to clear history:', result.error)
      }
    } catch (error) {
      console.error('Failed to clear history:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const removeEntry = useCallback(async (entryId: string) => {
    try {
      const result = await window.sidebarAPI.removeHistoryEntry(entryId)
      if (result.success) {
        setHistory(prev => prev.filter(entry => entry.id !== entryId))
      } else {
        console.error('Failed to remove history entry:', result.error)
      }
    } catch (error) {
      console.error('Failed to remove history entry:', error)
    }
  }, [])

  const navigateToUrl = useCallback(async (url: string) => {
    try {
      const result = await window.sidebarAPI.navigateFromHistory(url)
      console.log(result.wasExisting ? 
        `Switched to existing tab: ${result.title}` : 
        `Opened new tab: ${result.title}`)
      return result
    } catch (error) {
      console.error('Failed to navigate to URL:', error)
      throw error
    }
  }, [])

  // Load initial history
  useEffect(() => {
    refreshHistory()
  }, [refreshHistory])

  // Listen for user changes and refresh history
  useEffect(() => {
    const handleUserChange = () => {
      console.log('User changed - refreshing history')
      refreshHistory()
    }

    window.sidebarAPI.onUserChanged(handleUserChange)

    return () => {
      window.sidebarAPI.removeUserChangedListener()
    }
  }, [refreshHistory])

  // Search when query changes
  useEffect(() => {
    console.log('HistoryContext: Search effect triggered with query:', searchQuery)
    const timeoutId = setTimeout(() => {
      if (searchQuery.trim()) {
        searchHistory(searchQuery)
      } else {
        refreshHistory()
      }
    }, 300) // Debounce search

    return () => clearTimeout(timeoutId)
  }, [searchQuery]) // Remove searchHistory and refreshHistory from dependencies to prevent loops

  const value: HistoryContextType = {
    history,
    isLoading,
    searchQuery,
    setSearchQuery,
    refreshHistory,
    clearHistory,
    removeEntry,
    navigateToUrl,
    searchHistory
  }

  return (
    <HistoryContext.Provider value={value}>
      {children}
    </HistoryContext.Provider>
  )
}
