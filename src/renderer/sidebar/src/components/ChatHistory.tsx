import React from 'react'
import { useChatHistory } from '../contexts/ChatHistoryContext'
import { Button } from '@common/components/Button'
import { cn } from '@common/lib/utils'

interface ChatHistoryProps {
    onClose: () => void
    onSelectSession: (sessionId: string) => void
}

export const ChatHistory: React.FC<ChatHistoryProps> = ({ onClose, onSelectSession }) => {
    const {
        sessions,
        currentSessionId,
        isLoading,
        switchToSession,
        createNewSession,
        clearHistory,
        deleteSession
    } = useChatHistory()

    const handleNewChat = async () => {
        try {
            const sessionId = await createNewSession()
            await switchToSession(sessionId)
            onClose()
        } catch (error) {
            console.error('Failed to create new chat:', error)
        }
    }

    const handleSelectSession = async (sessionId: string) => {
        try {
            await switchToSession(sessionId)
            onSelectSession(sessionId)
            onClose()
        } catch (error) {
            console.error('Failed to switch session:', error)
        }
    }

    const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation() // Prevent triggering session selection
        
        const confirmed = confirm('Delete this conversation? This action cannot be undone.')
        if (!confirmed) return

        try {
            await deleteSession(sessionId)
        } catch (error) {
            console.error('Failed to delete session:', error)
        }
    }

    const formatDate = (date: Date | string) => {
        const dateObj = typeof date === 'string' ? new Date(date) : date
        if (isNaN(dateObj.getTime())) {
            return 'Recently'
        }
        return dateObj.toLocaleString()
    }

    const formatDuration = (ms: number) => {
        if (ms < 1000) return `${ms}ms`
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
        return `${(ms / 60000).toFixed(1)}m`
    }

    if (isLoading && sessions.length === 0) {
        return (
            <div className="h-full flex items-center justify-center bg-background">
                <div className="text-muted-foreground">Loading chats...</div>
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col bg-background">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClose}
                        className="h-8 w-8 p-0"
                    >
                        ←
                    </Button>
                    <div>
                        <h2 className="text-lg font-semibold">Chats</h2>
                        <p className="text-sm text-muted-foreground">
                            {sessions.length} conversation{sessions.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNewChat}
                >
                    New Chat
                </Button>
            </div>

            {/* Sessions List */}
            <div className="flex-1 overflow-y-auto">
                {sessions.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <h3 className="text-lg font-semibold mb-2">No conversations yet</h3>
                            <p className="text-muted-foreground mb-4">Start chatting to see your conversation history here</p>
                            <Button onClick={handleNewChat}>Start New Chat</Button>
                        </div>
                    </div>
                ) : (
                    <div className="p-4 space-y-3">
                        {sessions.map((session) => (
                            <div
                                key={session.id}
                                className={cn(
                                    "p-4 border rounded-lg cursor-pointer transition-colors hover:bg-muted/50 group relative",
                                    currentSessionId === session.id ? "border-primary bg-primary/5" : "border-border"
                                )}
                                onClick={() => handleSelectSession(session.id)}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-2">
                                            {currentSessionId === session.id && (
                                                <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">
                                                    Current
                                                </span>
                                            )}
                                        </div>
                                        
                                        <div className="font-medium text-sm mb-1 truncate">
                                            {session.title}
                                        </div>
                                        
                                        <div className="space-y-1">
                                            <div className="text-xs text-muted-foreground">
                                                {formatDate(session.lastActiveAt)}
                                            </div>
                                            
                                            <div className="text-xs text-muted-foreground">
                                                {session.messageCount} message{session.messageCount !== 1 ? 's' : ''}
                                                {session.averageResponseTime > 0 && (
                                                    <> • Avg response: {formatDuration(session.averageResponseTime)}</>
                                                )}
                                            </div>
                                            
                                            {session.contextUrls.length > 0 && (
                                                <div className="text-xs text-muted-foreground">
                                                    {session.contextUrls.slice(0, 2).map((url: string) => {
                                                        try {
                                                            return new URL(url).hostname
                                                        } catch {
                                                            return url
                                                        }
                                                    }).join(', ')}
                                                    {session.contextUrls.length > 2 && ` +${session.contextUrls.length - 2} more`}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => handleDeleteSession(e, session.id)}
                                        className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
                                        title="Delete conversation"
                                    >
                                        🗑️
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer with Clear History */}
            {sessions.length > 0 && (
                <div className="p-4 border-t border-border">
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={clearHistory}
                        className="w-full"
                    >
                        Clear All History
                    </Button>
                </div>
            )}
        </div>
    )
}
