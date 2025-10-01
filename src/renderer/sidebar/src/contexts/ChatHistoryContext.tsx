import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'

interface ChatSession {
    id: string
    userId: string
    title: string
    startedAt: Date
    lastMessageAt: Date
    lastActiveAt: Date
    messageCount: number
    contextUrls: string[]
    totalResponseTime: number
    averageResponseTime: number
}

interface ChatHistoryContextType {
    sessions: ChatSession[]
    currentSessionId: string | null
    isLoading: boolean
    loadSessions: () => Promise<void>
    switchToSession: (sessionId: string) => Promise<void>
    createNewSession: (title?: string) => Promise<string>
    clearHistory: () => Promise<void>
}

const ChatHistoryContext = createContext<ChatHistoryContextType | null>(null)

export const useChatHistory = (): ChatHistoryContextType => {
    const context = useContext(ChatHistoryContext)
    if (!context) {
        throw new Error('useChatHistory must be used within a ChatHistoryProvider')
    }
    return context
}

export const ChatHistoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [sessions, setSessions] = useState<ChatSession[]>([])
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)

    const loadSessions = useCallback(async () => {
        setIsLoading(true)
        try {
            const [sessionsData, history] = await Promise.all([
                window.sidebarAPI.getChatSessions(),
                window.sidebarAPI.getChatHistory()
            ])
            // Filter out sessions with 0 messages
            const filteredSessions = sessionsData.filter(session => session.messageCount > 0)
            setSessions(filteredSessions)
            setCurrentSessionId(history?.currentSessionId || null)
        } catch (error) {
            console.error('Failed to load chat sessions:', error)
        } finally {
            setIsLoading(false)
        }
    }, [])

    const switchToSession = useCallback(async (sessionId: string) => {
        setIsLoading(true)
        try {
            await window.sidebarAPI.switchToSession(sessionId)
            setCurrentSessionId(sessionId)
            await loadSessions()
        } catch (error) {
            console.error('Failed to switch to session:', error)
        } finally {
            setIsLoading(false)
        }
    }, [loadSessions])

    const createNewSession = useCallback(async (title?: string): Promise<string> => {
        try {
            const currentUrl = await window.sidebarAPI.getCurrentUrl()
            const sessionId = await window.sidebarAPI.createChatSession(currentUrl || undefined, title)
            await loadSessions()
            return sessionId
        } catch (error) {
            console.error('Failed to create new session:', error)
            throw error
        }
    }, [loadSessions])

    const clearHistory = useCallback(async () => {
        const confirmed = confirm('Are you sure you want to clear all chat history? This cannot be undone.')
        if (!confirmed) return
        
        setIsLoading(true)
        try {
            await window.sidebarAPI.clearChatHistory()
            setSessions([])
            setCurrentSessionId(null)
        } catch (error) {
            console.error('Failed to clear chat history:', error)
        } finally {
            setIsLoading(false)
        }
    }, [])

    // Load initial data
    useEffect(() => {
        loadSessions()
    }, [loadSessions])

    const value: ChatHistoryContextType = {
        sessions,
        currentSessionId,
        isLoading,
        loadSessions,
        switchToSession,
        createNewSession,
        clearHistory
    }

    return (
        <ChatHistoryContext.Provider value={value}>
            {children}
        </ChatHistoryContext.Provider>
    )
}
