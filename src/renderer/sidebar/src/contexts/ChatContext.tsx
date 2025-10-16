import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: number
    isStreaming?: boolean
}

interface ChatContextType {
    messages: Message[]
    isLoading: boolean

    // Chat actions
    sendMessage: (content: string) => Promise<void>
    clearChat: () => void

    // Page content access
    getPageContent: () => Promise<string | null>
    getPageText: () => Promise<string | null>
    getCurrentUrl: () => Promise<string | null>
}

const ChatContext = createContext<ChatContextType | null>(null)

export const useChat = () => {
    const context = useContext(ChatContext)
    if (!context) {
        throw new Error('useChat must be used within a ChatProvider')
    }
    return context
}

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [messages, setMessages] = useState<Message[]>([])
    const [isLoading, setIsLoading] = useState(false)

    // Load initial messages from main process
    useEffect(() => {
        const loadMessages = async () => {
            try {
                const storedMessages = await window.sidebarAPI.getMessages()
                if (storedMessages && storedMessages.length > 0) {
                    // Convert CoreMessage format to our frontend Message format
                    const convertedMessages = storedMessages.map((msg: any, index: number) => ({
                        id: `msg-${index}`,
                        role: msg.role,
                        content: typeof msg.content === 'string' 
                            ? msg.content 
                            : msg.content.find((p: any) => p.type === 'text')?.text || '',
                        timestamp: Date.now(),
                        isStreaming: false
                    }))
                    setMessages(convertedMessages)
                } else {
                    setMessages([])
                }
            } catch (error) {
                console.error('[ChatContext] Failed to load messages:', error)
                setMessages([]) // Clear messages on error
            }
        }
        
        console.log('[ChatContext] Initial mount, loading messages...')
        loadMessages()

        // Listen for user changes and reload messages
        const handleUserChange = () => {
            console.log('[ChatContext] User changed, clearing and reloading messages...')
            // Immediately clear messages to prevent flash of old content
            setMessages([])
            setIsLoading(false) // Stop any ongoing loading
            // Then load new user's messages
            loadMessages()
        }

        window.sidebarAPI.onUserChanged(handleUserChange)

        return () => {
            window.sidebarAPI.removeUserChangedListener()
        }
    }, [])

    const sendMessage = useCallback(async (content: string) => {
        setIsLoading(true)

        try {
            const messageId = Date.now().toString()

            // Send message to main process (which will handle context)
            await window.sidebarAPI.sendChatMessage({
                message: content,
                messageId: messageId
            })

            // Messages will be updated via the chat-messages-updated event
        } catch (error) {
            console.error('Failed to send message:', error)
        } finally {
            setIsLoading(false)
        }
    }, [])

    const clearChat = useCallback(async () => {
        try {
            await window.sidebarAPI.clearChat()
            setMessages([])
        } catch (error) {
            console.error('Failed to clear chat:', error)
        }
    }, [])

    const getPageContent = useCallback(async () => {
        try {
            return await window.sidebarAPI.getPageContent()
        } catch (error) {
            console.error('Failed to get page content:', error)
            return null
        }
    }, [])

    const getPageText = useCallback(async () => {
        try {
            return await window.sidebarAPI.getPageText()
        } catch (error) {
            console.error('Failed to get page text:', error)
            return null
        }
    }, [])

    const getCurrentUrl = useCallback(async () => {
        try {
            return await window.sidebarAPI.getCurrentUrl()
        } catch (error) {
            console.error('Failed to get current URL:', error)
            return null
        }
    }, [])

    // Set up message listeners
    useEffect(() => {
        // Listen for streaming response updates
        const handleChatResponse = (data: { messageId: string; content: string; isComplete: boolean }) => {
            if (data.isComplete) {
                setIsLoading(false)
            }
        }

        // Listen for message updates from main process
        const handleMessagesUpdated = (updatedMessages: any[]) => {
            // Convert CoreMessage format to our frontend Message format
            const convertedMessages = updatedMessages.map((msg: any, index: number) => ({
                id: `msg-${index}`,
                role: msg.role,
                content: typeof msg.content === 'string' 
                    ? msg.content 
                    : msg.content.find((p: any) => p.type === 'text')?.text || '',
                timestamp: Date.now(),
                isStreaming: false
            }))
            setMessages(convertedMessages)
        }

        window.sidebarAPI.onChatResponse(handleChatResponse)
        window.sidebarAPI.onMessagesUpdated(handleMessagesUpdated)

        return () => {
            window.sidebarAPI.removeChatResponseListener()
            window.sidebarAPI.removeMessagesUpdatedListener()
        }
    }, [])

    const value: ChatContextType = {
        messages,
        isLoading,
        sendMessage,
        clearChat,
        getPageContent,
        getPageText,
        getCurrentUrl
    }

    return (
        <ChatContext.Provider value={value}>
            {children}
        </ChatContext.Provider>
    )
}

