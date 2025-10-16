import { BaseStorage } from "../../../core/storage";
import type { CoreMessage } from "ai";

/**
 * Streaming performance metrics
 */
export interface StreamingMetrics {
  modelName: string; // Model used for generation
  timeToFirstToken: number; // Time to first token in ms
  timeToOtherToken: number[]; // Array of time between each token in ms
  meanTokenTime: number; // Mean time per token
  medianTokenTime: number; // Median time per token
  stdDevTokenTime: number; // Standard deviation of token times
  totalTokens: number; // Total number of tokens streamed
}

/**
 * Chat message
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string | any[];
  timestamp: Date;
  contextUrl?: string;
  contextTitle?: string;
  sessionId: string;
  responseTime?: number; // Total response time for assistant messages
  streamingMetrics?: StreamingMetrics; // Performance metrics for streamed responses
  messageIndex: number; // Position in conversation
  source: 'user' | 'assistant' | 'system'; // Message source identification
}

/**
 * Chat session
 */
export interface ChatSession {
  id: string;
  userId: string;
  title: string; // Title of the chat session (initially session ID, later extracted from content)
  startedAt: Date;
  lastMessageAt: Date;
  lastActiveAt: Date; // Last time the session was accessed or modified
  messageCount: number;
  contextUrls: string[]; // All URLs referenced in this session
  totalResponseTime: number; // Sum of all AI response times
  averageResponseTime: number;
}

/**
 * Complete chat history
 */
export interface ChatHistory {
  sessions: ChatSession[];
  messages: ChatMessage[];
  currentSessionId: string | null;
  totalConversations: number;
  totalMessages: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Storage for AI chat history.
 * Manages chat sessions, messages, and metadata with streaming metrics.
 */
export class ChatStorage extends BaseStorage {
  private readonly chatHistoryFilename = "chat-history.json";

  /**
   * Save chat history
   */
  async saveChatHistory(userId: string, history: ChatHistory): Promise<void> {
    await this.saveUserFile(userId, this.chatHistoryFilename, history);
  }

  /**
   * Load chat history
   */
  async loadChatHistory(userId: string): Promise<ChatHistory> {
    const defaultHistory: ChatHistory = {
      sessions: [],
      messages: [],
      currentSessionId: null,
      totalConversations: 0,
      totalMessages: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const rawHistory = await this.loadUserFile(userId, this.chatHistoryFilename, defaultHistory);
    
    // Convert date strings back to Date objects
    return {
      ...rawHistory,
      sessions: rawHistory.sessions?.map(session => ({
        ...session,
        title: session.title,
        startedAt: new Date(session.startedAt),
        lastMessageAt: new Date(session.lastMessageAt),
        lastActiveAt: new Date(session.lastActiveAt)
      })) || [],
      messages: rawHistory.messages?.map(message => ({
        ...message,
        timestamp: new Date(message.timestamp)
      })) || [],
      createdAt: new Date(rawHistory.createdAt),
      updatedAt: new Date(rawHistory.updatedAt)
    };
  }

  /**
   * Clear all chat history
   */
  async clearChatHistory(userId: string): Promise<void> {
    const emptyHistory: ChatHistory = {
      sessions: [],
      messages: [],
      currentSessionId: null,
      totalConversations: 0,
      totalMessages: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    await this.saveChatHistory(userId, emptyHistory);
  }

  /**
   * Create a new chat session
   */
  async createChatSession(userId: string, contextUrl?: string, title?: string): Promise<string> {
    const history = await this.loadChatHistory(userId);
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const newSession: ChatSession = {
      id: sessionId,
      userId,
      title: title || sessionId, // Use provided title or default to session ID
      startedAt: new Date(),
      lastMessageAt: new Date(),
      lastActiveAt: new Date(),
      messageCount: 0,
      contextUrls: contextUrl ? [contextUrl] : [],
      totalResponseTime: 0,
      averageResponseTime: 0
    };

    history.sessions.push(newSession);
    history.currentSessionId = sessionId;
    history.totalConversations++;
    history.updatedAt = new Date();

    await this.saveChatHistory(userId, history);
    
    console.log(`ChatStorage: Created new session ${sessionId} for user ${userId}`);
    return sessionId;
  }

  /**
   * Add a message to the chat history
   */
  async addChatMessage(
    userId: string,
    message: CoreMessage,
    sessionId: string,
    contextUrl?: string,
    contextTitle?: string,
    responseTime?: number,
    streamingMetrics?: StreamingMetrics
  ): Promise<void> {
    const history = await this.loadChatHistory(userId);
    
    // Determine message source based on role
    const source: 'user' | 'assistant' | 'system' = message.role as 'user' | 'assistant' | 'system';
    
    const chatMessage: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: message.role as 'user' | 'assistant' | 'system',
      content: message.content,
      timestamp: new Date(),
      contextUrl,
      contextTitle,
      sessionId,
      responseTime,
      streamingMetrics,
      messageIndex: history.messages.filter(m => m.sessionId === sessionId).length,
      source
    };

    history.messages.push(chatMessage);
    history.totalMessages++;
    history.updatedAt = new Date();

    // Update session metadata
    const session = history.sessions.find(s => s.id === sessionId);
    if (session) {
      session.lastMessageAt = new Date();
      session.lastActiveAt = new Date();
      session.messageCount++;
      
      if (contextUrl && !session.contextUrls.includes(contextUrl)) {
        session.contextUrls.push(contextUrl);
      }
      
      if (responseTime && message.role === 'assistant') {
        session.totalResponseTime += responseTime;
        session.averageResponseTime = session.totalResponseTime / 
          history.messages.filter(m => m.sessionId === sessionId && m.role === 'assistant').length;
      }
    }

    await this.saveChatHistory(userId, history);
  }

  /**
   * Get messages for a specific session
   */
  async getSessionMessages(userId: string, sessionId: string): Promise<ChatMessage[]> {
    const history = await this.loadChatHistory(userId);
    return history.messages
      .filter(m => m.sessionId === sessionId)
      .sort((a, b) => a.messageIndex - b.messageIndex);
  }

  /**
   * Get all chat sessions for a user (sorted by lastActiveAt)
   */
  async getChatSessions(userId: string): Promise<ChatSession[]> {
    const history = await this.loadChatHistory(userId);
    return history.sessions.sort((a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime());
  }

  /**
   * Get a specific chat session
   */
  async getChatSession(userId: string, sessionId: string): Promise<ChatSession | null> {
    const history = await this.loadChatHistory(userId);
    return history.sessions.find(s => s.id === sessionId) || null;
  }

  /**
   * Get current session ID
   */
  async getCurrentSessionId(userId: string): Promise<string | null> {
    const history = await this.loadChatHistory(userId);
    return history.currentSessionId;
  }

  /**
   * Set current session ID and update lastActiveAt
   */
  async setCurrentSessionId(userId: string, sessionId: string | null): Promise<void> {
    const history = await this.loadChatHistory(userId);
    history.currentSessionId = sessionId;
    history.updatedAt = new Date();
    
    // Update lastActiveAt for the session being switched to
    if (sessionId) {
      const session = history.sessions.find(s => s.id === sessionId);
      if (session) {
        session.lastActiveAt = new Date();
      }
    }
    
    await this.saveChatHistory(userId, history);
  }

  /**
   * Update session title
   */
  async updateSessionTitle(userId: string, sessionId: string, title: string): Promise<void> {
    const history = await this.loadChatHistory(userId);
    const session = history.sessions.find(s => s.id === sessionId);
    
    if (session) {
      session.title = title;
      history.updatedAt = new Date();
      await this.saveChatHistory(userId, history);
      console.log(`ChatStorage: Updated session ${sessionId} title to "${title}"`);
    }
  }

  /**
   * Delete a chat session and all its messages
   */
  async deleteChatSession(userId: string, sessionId: string): Promise<void> {
    const history = await this.loadChatHistory(userId);
    
    // Remove session
    history.sessions = history.sessions.filter(s => s.id !== sessionId);
    
    // Remove all messages for this session
    const removedMessagesCount = history.messages.filter(m => m.sessionId === sessionId).length;
    history.messages = history.messages.filter(m => m.sessionId !== sessionId);
    history.totalMessages -= removedMessagesCount;
    
    // If this was the current session, clear it
    if (history.currentSessionId === sessionId) {
      history.currentSessionId = null;
    }
    
    history.updatedAt = new Date();
    await this.saveChatHistory(userId, history);
    
    console.log(`ChatStorage: Deleted chat session ${sessionId} with ${removedMessagesCount} messages`);
  }

  /**
   * Delete multiple chat sessions (batch operation)
   */
  async deleteMultipleChatSessions(userId: string, sessionIds: string[]): Promise<void> {
    if (sessionIds.length === 0) return;
    
    const history = await this.loadChatHistory(userId);
    
    // Remove sessions
    history.sessions = history.sessions.filter(s => !sessionIds.includes(s.id));
    
    // Remove all messages for these sessions
    const removedMessagesCount = history.messages.filter(m => sessionIds.includes(m.sessionId)).length;
    history.messages = history.messages.filter(m => !sessionIds.includes(m.sessionId));
    history.totalMessages -= removedMessagesCount;
    
    // If current session was deleted, clear it
    if (history.currentSessionId && sessionIds.includes(history.currentSessionId)) {
      history.currentSessionId = null;
    }
    
    history.updatedAt = new Date();
    await this.saveChatHistory(userId, history);
    
    console.log(`ChatStorage: Deleted ${sessionIds.length} chat sessions with ${removedMessagesCount} messages`);
  }

  /**
   * Get total message count for a user
   */
  async getTotalMessageCount(userId: string): Promise<number> {
    const history = await this.loadChatHistory(userId);
    return history.totalMessages;
  }

  /**
   * Get total session count for a user
   */
  async getTotalSessionCount(userId: string): Promise<number> {
    const history = await this.loadChatHistory(userId);
    return history.sessions.length;
  }

  /**
   * Search sessions by title
   */
  async searchSessions(userId: string, query: string): Promise<ChatSession[]> {
    const history = await this.loadChatHistory(userId);
    const searchTerm = query.toLowerCase();
    
    return history.sessions
      .filter(session => session.title.toLowerCase().includes(searchTerm))
      .sort((a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime());
  }
}

