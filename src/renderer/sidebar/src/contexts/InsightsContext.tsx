import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

interface ProactiveInsight {
  id: string
  userId: string
  type: 'workflow' | 'research' | 'abandoned' | 'habit'
  title: string
  description: string
  actionType: 'open_urls' | 'resume_research' | 'remind' | 'create_workflow'
  actionParams: any
  patterns: any[]
  relevanceScore: number
  createdAt: string  // ISO date string (serialized by IPC)
  triggeredAt?: string  // ISO date string (serialized by IPC)
  
  // Status tracking
  status: 'pending' | 'in_progress' | 'completed'
  
  // Legacy support (deprecated)
  actedUpon?: boolean
  actedUponAt?: string  // ISO date string (serialized by IPC)
  
  // Progress tracking for abandoned tasks
  lastResumedAt?: string  // ISO date string (serialized by IPC)
  linkedSessionIds?: string[]  // Track all sessions related to this insight
  completionProgress?: number  // 0.0 - 1.0
  
  // Tracking for tab reopening
  openedTabUrls?: string[]  // URLs that were reopened by the user
}

interface SessionTab {
  url: string
  title: string
  timestamp: string
  sessionId: string
}

interface InsightsContextType {
  insights: ProactiveInsight[]
  isLoading: boolean
  isAnalyzing: boolean
  error: string | null
  analyzeBehavior: () => Promise<void>
  refreshInsights: () => Promise<void>
  executeAction: (insightId: string) => Promise<{ success: boolean; message?: string; error?: string }>
  markCompleted: (insightId: string) => Promise<{ success: boolean; message?: string; error?: string }>
  getSessionTabs: (insightId: string) => Promise<{ success: boolean; tabs: SessionTab[]; totalTabs: number; openedTabs: string[]; error?: string }>
  openAndTrackTab: (insightId: string, url: string) => Promise<{ success: boolean; message?: string; completionPercentage?: number; error?: string }>
}

const InsightsContext = createContext<InsightsContextType | undefined>(undefined)

export const InsightsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [insights, setInsights] = useState<ProactiveInsight[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load cached insights on mount
  useEffect(() => {
    loadInsights()
  }, [])

  const loadInsights = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const cachedInsights = await window.sidebarAPI.getInsights()
      setInsights(cachedInsights)
    } catch (err) {
      console.error('Failed to load insights:', err)
      setError('Failed to load insights')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const analyzeBehavior = useCallback(async () => {
    setIsAnalyzing(true)
    setError(null)
    try {
      console.log('[InsightsContext] Starting behavior analysis...')
      const newInsights = await window.sidebarAPI.analyzeBehavior()
      console.log('[InsightsContext] Analysis complete, got', newInsights.length, 'insights')
      setInsights(newInsights)
    } catch (err) {
      console.error('Failed to analyze behavior:', err)
      setError('Failed to analyze behavior')
    } finally {
      setIsAnalyzing(false)
    }
  }, [])

  const refreshInsights = useCallback(async () => {
    await loadInsights()
  }, [loadInsights])

  const executeAction = useCallback(async (insightId: string) => {
    try {
      const result = await window.sidebarAPI.executeInsightAction(insightId)
      
      // Reload insights after execution to get updated status
      if (result.success) {
        await loadInsights()
      }
      
      return result
    } catch (err) {
      console.error('Failed to execute action:', err)
      return { success: false, error: 'Failed to execute action' }
    }
  }, [loadInsights])

  const markCompleted = useCallback(async (insightId: string) => {
    try {
      const result = await window.sidebarAPI.markInsightCompleted(insightId)
      
      // Reload insights after completion
      if (result.success) {
        await loadInsights()
      }
      
      return result
    } catch (err) {
      console.error('Failed to mark as completed:', err)
      return { success: false, error: 'Failed to mark as completed' }
    }
  }, [loadInsights])

  const getSessionTabs = useCallback(async (insightId: string) => {
    try {
      const result = await window.sidebarAPI.getInsightSessionTabs(insightId)
      return result
    } catch (err) {
      console.error('Failed to get session tabs:', err)
      return { success: false, tabs: [], totalTabs: 0, openedTabs: [], error: 'Failed to get session tabs' }
    }
  }, [])

  const openAndTrackTab = useCallback(async (insightId: string, url: string) => {
    try {
      const result = await window.sidebarAPI.openAndTrackTab(insightId, url)
      
      // Reload insights to update the opened tabs count
      if (result.success) {
        await loadInsights()
      }
      
      return result
    } catch (err) {
      console.error('Failed to open and track tab:', err)
      return { success: false, error: 'Failed to open and track tab' }
    }
  }, [loadInsights])

  return (
    <InsightsContext.Provider
      value={{
        insights,
        isLoading,
        isAnalyzing,
        error,
        analyzeBehavior,
        refreshInsights,
        executeAction,
        markCompleted,
        getSessionTabs,
        openAndTrackTab,
      }}
    >
      {children}
    </InsightsContext.Provider>
  )
}

export const useInsights = () => {
  const context = useContext(InsightsContext)
  if (!context) {
    throw new Error('useInsights must be used within InsightsProvider')
  }
  return context
}

