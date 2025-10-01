import { app } from "electron";
import { join, dirname } from "path";
import { promises as fs } from "fs";
import type { CoreMessage } from "ai";
import type { RawActivityData } from "./ActivityTypes";

// Dummy interfaces for future implementation
export interface UserPreferences {
  darkMode: boolean;
  defaultSearchEngine: string;
  homePage: string;
  // More preferences to be defined later
}

export interface BrowsingHistoryEntry {
  id: string;
  url: string;
  title: string;
  visitedAt: Date;
  favicon?: string;
  analysisId?: string;  // Link to content analysis
  // More fields to be defined later
}

export interface BehavioralProfile {
  frequentSites: Array<{ url: string; visits: number }>;
  searchPatterns: string[];
  activeHours: Array<{ hour: number; activity: number }>;
  // More behavioral data to be defined later
}

export interface UserTabState {
  id: string;
  url: string;
  title: string;
  isActive: boolean;
  scrollPosition?: number;
  // More tab state to be defined later
}

// Chat History Types with Metadata
// Streaming performance metrics
export interface StreamingMetrics {
  modelName: string; // Model used for generation
  timeToFirstToken: number; // Time to first token in ms
  timeToOtherToken: number[]; // Array of time between each token in ms
  meanTokenTime: number; // Mean time per token
  medianTokenTime: number; // Median time per token
  stdDevTokenTime: number; // Standard deviation of token times
  totalTokens: number; // Total number of tokens streamed
}

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
 * Manages user-specific data persistence and file system operations.
 * Each user gets isolated data storage for complete privacy.
 */
export class UserDataManager {
  private readonly userDataPath: string;
  private readonly usersDir: string;
  private readonly maxHistoryEntries: number = 1000;

  constructor() {
    this.userDataPath = app.getPath("userData");
    this.usersDir = join(this.userDataPath, "users");
    this.ensureDirectoriesExist();
  }

  /**
   * Ensure required directories exist
   */
  private async ensureDirectoriesExist(): Promise<void> {
    try {
      await fs.mkdir(this.usersDir, { recursive: true });
      await fs.mkdir(join(this.usersDir, "user-data"), { recursive: true });
    } catch (error) {
      console.error("Failed to create user directories:", error);
    }
  }

  /**
   * Get the data directory path for a specific user
   */
  private getUserDataPath(userId: string): string {
    return join(this.usersDir, "user-data", userId);
  }

  /**
   * Ensure user data directory exists
   */
  private async ensureUserDataDir(userId: string): Promise<void> {
    const userDir = this.getUserDataPath(userId);
    try {
      await fs.mkdir(userDir, { recursive: true });
    } catch (error) {
      console.error(`Failed to create user directory for ${userId}:`, error);
    }
  }

  /**
   * Save data to a user-specific file
   */
  private async saveUserFile<T>(userId: string, filename: string, data: T): Promise<void> {
    await this.ensureUserDataDir(userId);
    const filePath = join(this.getUserDataPath(userId), filename);
    
    try {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (error) {
      console.error(`Failed to save ${filename} for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Load data from a user-specific file
   */
  private async loadUserFile<T>(userId: string, filename: string, defaultValue: T): Promise<T> {
    const filePath = join(this.getUserDataPath(userId), filename);
    
    try {
      const data = await fs.readFile(filePath, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is corrupted, return default
      return defaultValue;
    }
  }

  /**
   * Chat History Management (with Metadata)
   */
  async saveChatHistory(userId: string, history: ChatHistory): Promise<void> {
    await this.saveUserFile(userId, "chat-history.json", history);
  }

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
    const rawHistory = await this.loadUserFile(userId, "chat-history.json", defaultHistory);
    
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
   * Delete a chat session and all its messages
   */
  async deleteChatSession(
    userId: string,
    sessionId: string,
    vectorSearchManager?: any // VectorSearchManager type to avoid circular dependency
  ): Promise<void> {
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
    
    // Delete associated vector documents
    if (vectorSearchManager) {
      try {
        await vectorSearchManager.deleteChatSessionDocuments(userId, sessionId);
      } catch (error) {
        console.error('UserDataManager: Failed to clean up vector documents for chat session:', error);
      }
    }
    
    console.log(`UserDataManager: Deleted chat session ${sessionId} with ${removedMessagesCount} messages`);
  }

  /**
   * Delete multiple chat sessions (batch operation)
   */
  async deleteMultipleChatSessions(
    userId: string,
    sessionIds: string[],
    vectorSearchManager?: any
  ): Promise<void> {
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
    
    // Delete associated vector documents
    if (vectorSearchManager) {
      try {
        await vectorSearchManager.deleteMultipleChatSessions(userId, sessionIds);
      } catch (error) {
        console.error('UserDataManager: Failed to clean up vector documents for chat sessions:', error);
      }
    }
    
    console.log(`UserDataManager: Deleted ${sessionIds.length} chat sessions with ${removedMessagesCount} messages`);
  }

  /**
   * Tab State Management
   */
  async saveUserTabs(userId: string, tabs: UserTabState[]): Promise<void> {
    await this.saveUserFile(userId, "tabs.json", tabs);
  }

  async loadUserTabs(userId: string): Promise<UserTabState[]> {
    return await this.loadUserFile(userId, "tabs.json", []);
  }

  async clearUserTabs(userId: string): Promise<void> {
    await this.saveUserTabs(userId, []);
  }

  /**
   * User Preferences Management
   */
  async savePreferences(userId: string, preferences: UserPreferences): Promise<void> {
    await this.saveUserFile(userId, "preferences.json", preferences);
  }

  async loadPreferences(userId: string): Promise<UserPreferences> {
    return await this.loadUserFile(userId, "preferences.json", {
      darkMode: false,
      defaultSearchEngine: "https://www.google.com/search?q=",
      homePage: "https://www.google.com"
    });
  }

  /**
   * Browsing History Management
   */
  async addHistoryEntry(userId: string, entry: Omit<BrowsingHistoryEntry, 'id'>): Promise<BrowsingHistoryEntry> {
    const history = await this.loadBrowsingHistory(userId);
    
    // Check if URL already exists in recent history (within last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const existingIndex = history.findIndex(h => 
      h.url === entry.url && new Date(h.visitedAt) > oneHourAgo
    );
    
    let returnEntry: BrowsingHistoryEntry;
    
    if (existingIndex >= 0) {
      // Update existing entry with new timestamp
      history[existingIndex].visitedAt = entry.visitedAt;
      history[existingIndex].title = entry.title; // Update title in case it changed
      returnEntry = history[existingIndex];
    } else {
      // Add new entry
      const newEntry: BrowsingHistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ...entry
      };
      history.unshift(newEntry); // Add to beginning
      returnEntry = newEntry;
    }
    
    // Keep only last maxHistoryEntries entries
    if (this.maxHistoryEntries && history.length > this.maxHistoryEntries) {
      history.splice(this.maxHistoryEntries);
    }
    
    await this.saveBrowsingHistory(userId, history);
    return returnEntry;
  }

  /**
   * Link a browsing history entry to its content analysis
   */
  async linkHistoryToAnalysis(userId: string, historyEntryId: string, analysisId: string): Promise<void> {
    const history = await this.loadBrowsingHistory(userId);
    const entry = history.find(h => h.id === historyEntryId);
    
    if (entry) {
      entry.analysisId = analysisId;
      await this.saveBrowsingHistory(userId, history);
      console.log(`UserDataManager: Linked history entry ${historyEntryId} to analysis ${analysisId}`);
    }
  }

  async saveBrowsingHistory(userId: string, history: BrowsingHistoryEntry[]): Promise<void> {
    await this.saveUserFile(userId, "browsing-history.json", history);
  }

  async loadBrowsingHistory(userId: string): Promise<BrowsingHistoryEntry[]> {
    return await this.loadUserFile(userId, "browsing-history.json", []);
  }

  async clearBrowsingHistory(
    userId: string,
    vectorSearchManager?: any // VectorSearchManager type to avoid circular dependency
  ): Promise<void> {
    // If vector search manager is provided, get all analysis IDs before clearing
    if (vectorSearchManager) {
      try {
        const allAnalysisIds = await this.getAllAnalysisIds(userId);
        if (allAnalysisIds.length > 0) {
          await vectorSearchManager.deleteMultipleAnalyses(userId, allAnalysisIds);
        }
      } catch (error) {
        console.error('UserDataManager: Failed to clean up vector documents:', error);
      }
    }
    
    await this.saveBrowsingHistory(userId, []);
  }

  // TODO: use history_id instead of url to cleanup vector documents
  async removeHistoryEntry(
    userId: string, 
    entryId: string,
    vectorSearchManager?: any // VectorSearchManager type to avoid circular dependency
  ): Promise<void> {
    const history = await this.loadBrowsingHistory(userId);
    
    // Find the entry to get its URL for analysis lookup
    const entryToRemove = history.find(entry => entry.id === entryId);
    
    const filteredHistory = history.filter(entry => entry.id !== entryId);
    await this.saveBrowsingHistory(userId, filteredHistory);
    
    // If vector search manager is provided, delete associated vector documents
    if (vectorSearchManager && entryToRemove) {
      try {
        // Find all analyses for this URL
        const analysisIds = await this.getAnalysisIdsForUrl(userId, entryToRemove.url);
        
        // Delete vector documents for these analyses
        if (analysisIds.length > 0) {
          await vectorSearchManager.deleteMultipleAnalyses(userId, analysisIds);
        }
      } catch (error) {
        console.error('UserDataManager: Failed to clean up vector documents:', error);
      }
    }
  }

  async searchHistory(userId: string, query: string, limit: number = 50): Promise<BrowsingHistoryEntry[]> {
    const history = await this.loadBrowsingHistory(userId);
    const searchTerm = query.toLowerCase();
    
    console.log(`[UserDataManager] Searching ${history.length} history entries for: "${searchTerm}"`);
    
    // Search in title, URL, page description, and screenshot description
    const matches: BrowsingHistoryEntry[] = [];
    let analysisChecked = 0;
    let analysisFound = 0;
    let analysisLinked = 0;
    
    for (const entry of history) {
      // Check title and URL first (fast)
      if (entry.title.toLowerCase().includes(searchTerm) || 
          entry.url.toLowerCase().includes(searchTerm)) {
        matches.push(entry);
        console.log(`[UserDataManager] Match found in title/URL: ${entry.title}`);
        continue;
      }
      
      // Check content analysis data (page description and screenshot description)
      // Use the analysisId link if available, otherwise skip
      if (entry.analysisId) {
        analysisLinked++;
        try {
          analysisChecked++;
          const analysis = await this.getContentAnalysis(userId, entry.analysisId);
          if (analysis) {
            analysisFound++;
            const pageDescMatch = analysis.pageDescription && 
              analysis.pageDescription.toLowerCase().includes(searchTerm);
            const screenshotMatch = analysis.screenshotDescription && 
              analysis.screenshotDescription.toLowerCase().includes(searchTerm);
            
            if (pageDescMatch || screenshotMatch) {
              matches.push(entry);
              console.log(`[UserDataManager] Match found in content analysis:`, {
                title: entry.title,
                url: entry.url,
                analysisId: entry.analysisId,
                pageDescMatch: !!pageDescMatch,
                screenshotMatch: !!screenshotMatch,
                pageDescSnippet: analysis.pageDescription?.substring(0, 100)
              });
            }
          }
        } catch (error) {
          console.warn(`[UserDataManager] Error loading analysis ${entry.analysisId}:`, error);
          continue;
        }
      }
      
      // Stop if we've hit the limit
      if (matches.length >= limit) {
        break;
      }
    }
    
    console.log(`[UserDataManager] Search complete:`, {
      totalEntries: history.length,
      analysisLinked,
      analysisChecked,
      analysisFound,
      matches: matches.length
    });
    
    return matches.slice(0, limit);
  }

  /**
   * Behavioral Profile Management (dummy implementation for now)
   */
  async saveBehavioralProfile(userId: string, profile: BehavioralProfile): Promise<void> {
    await this.saveUserFile(userId, "behavioral-profile.json", profile);
  }

  async loadBehavioralProfile(userId: string): Promise<BehavioralProfile> {
    return await this.loadUserFile(userId, "behavioral-profile.json", {
      frequentSites: [],
      searchPatterns: [],
      activeHours: []
    });
  }

  /**
   * Clear all data for a user
   */
  async clearUserData(userId: string): Promise<void> {
    const userDir = this.getUserDataPath(userId);
    
    try {
      await fs.rm(userDir, { recursive: true, force: true });
    } catch (error) {
      console.error(`Failed to clear data for user ${userId}:`, error);
    }
  }

  /**
   * Check if user has any data
   */
  async hasUserData(userId: string): Promise<boolean> {
    const userDir = this.getUserDataPath(userId);
    
    try {
      await fs.access(userDir);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get user data size in bytes
   */
  async getUserDataSize(userId: string): Promise<number> {
    const userDir = this.getUserDataPath(userId);
    
    try {
      const files = await fs.readdir(userDir);
      let totalSize = 0;
      
      for (const file of files) {
        const stats = await fs.stat(join(userDir, file));
        totalSize += stats.size;
      }
      
      return totalSize;
    } catch {
      return 0;
    }
  }

  // ============================================================================
  // RAW ACTIVITY DATA MANAGEMENT
  // ============================================================================

  /**
   * Save raw activity data to daily files
   */
  async saveRawActivityData(userId: string, activities: RawActivityData[]): Promise<void> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const filePath = this.getRawActivityFilePath(userId, today);
    
    try {
      // Load existing data for today
      let existingData: RawActivityData[] = [];
      try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        existingData = JSON.parse(fileContent);
      } catch {
        // File doesn't exist yet, start with empty array
      }

      // Append new activities
      existingData.push(...activities);

      // Ensure directory exists
      await this.ensureDirectoryExists(dirname(filePath));

      // Save back to file
      await fs.writeFile(filePath, JSON.stringify(existingData, null, 2));

    } catch (error) {
      console.error(`Failed to save raw activity data for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Load raw activity data for a specific date
   */
  async loadRawActivityData(userId: string, date?: string): Promise<RawActivityData[]> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const filePath = this.getRawActivityFilePath(userId, targetDate);
    
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(fileContent);
      
      // Convert timestamp strings back to Date objects
      return data.map((activity: any) => ({
        ...activity,
        timestamp: new Date(activity.timestamp)
      }));
    } catch {
      return []; // Return empty array if file doesn't exist
    }
  }

  /**
   * Get date range of available activity data
   */
  async getRawActivityDateRange(userId: string): Promise<{ startDate: string; endDate: string; totalDays: number }> {
    const rawDataDir = this.getRawActivityDir(userId);
    
    try {
      const files = await fs.readdir(rawDataDir);
      const dateFiles = files
        .filter(f => f.endsWith('.json') && /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .map(f => f.replace('.json', ''))
        .sort();

      if (dateFiles.length === 0) {
        return { startDate: '', endDate: '', totalDays: 0 };
      }

      return {
        startDate: dateFiles[0],
        endDate: dateFiles[dateFiles.length - 1],
        totalDays: dateFiles.length
      };
    } catch {
      return { startDate: '', endDate: '', totalDays: 0 };
    }
  }

  /**
   * Clear raw activity data before a specific date
   */
  async clearRawActivityData(userId: string, beforeDate?: string): Promise<void> {
    const rawDataDir = this.getRawActivityDir(userId);
    
    try {
      const files = await fs.readdir(rawDataDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const fileDate = file.replace('.json', '');
          
          if (!beforeDate || fileDate < beforeDate) {
            await fs.unlink(join(rawDataDir, file));
          }
        }
      }
    } catch (error) {
      console.error(`Failed to clear raw activity data for user ${userId}:`, error);
    }
  }

  /**
   * Get total size of raw activity data for a user
   */
  async getRawActivityDataSize(userId: string): Promise<number> {
    const rawDataDir = this.getRawActivityDir(userId);
    
    try {
      const files = await fs.readdir(rawDataDir);
      let totalSize = 0;
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const stats = await fs.stat(join(rawDataDir, file));
          totalSize += stats.size;
        }
      }
      
      return totalSize;
    } catch {
      return 0;
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS FOR RAW ACTIVITY DATA
  // ============================================================================

  private getRawActivityDir(userId: string): string {
    return join(this.getUserDataPath(userId), 'raw-activity');
  }

  private getRawActivityFilePath(userId: string, date: string): string {
    return join(this.getRawActivityDir(userId), `${date}.json`);
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      // Directory might already exist, ignore error
    }
  }

  // ============================================================================
  // CONTENT ANALYSIS STORAGE
  // ============================================================================

  private getContentAnalysisDir(userId: string): string {
    return join(this.getUserDataPath(userId), 'content-analysis');
  }

  private getContentAnalysisFilePath(userId: string, date: string): string {
    return join(this.getContentAnalysisDir(userId), `${date}.json`);
  }

  private getContentAnalysisIndexPath(userId: string): string {
    return join(this.getContentAnalysisDir(userId), 'index.json');
  }

  private getScreenshotsDir(userId: string): string {
    return join(this.getUserDataPath(userId), 'screenshots');
  }

  private getRawHtmlDir(userId: string): string {
    return join(this.getUserDataPath(userId), 'raw-html');
  }

  private getLLMDebugLogsDir(userId: string): string {
    return join(this.getUserDataPath(userId), 'llm-debug-logs');
  }

  private getLLMDebugLogsFilePath(userId: string, date: string): string {
    return join(this.getLLMDebugLogsDir(userId), `${date}.json`);
  }

  /**
   * Save a content analysis result
   */
  async saveContentAnalysis(userId: string, analysis: any): Promise<void> {
    try {
      const analysisDir = this.getContentAnalysisDir(userId);
      await this.ensureDirectoryExists(analysisDir);

      const date = new Date().toISOString().split('T')[0];
      const filePath = this.getContentAnalysisFilePath(userId, date);

      // Load existing analyses for today
      let analyses: any[] = [];
      try {
        const data = await fs.readFile(filePath, 'utf-8');
        analyses = JSON.parse(data);
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          console.error('Error reading existing analyses:', error);
        }
      }

      // Add new analysis
      analyses.push(analysis);

      // Save back
      await fs.writeFile(filePath, JSON.stringify(analyses, null, 2), 'utf-8');

      console.log(`UserDataManager: Saved content analysis ${analysis.analysisId} for user ${userId}`);
    } catch (error) {
      console.error('UserDataManager: Error saving content analysis:', error);
      throw error;
    }
  }

  /**
   * Get a content analysis by ID
   */
  async getContentAnalysis(userId: string, analysisId: string): Promise<any | null> {
    try {
      const analysisDir = this.getContentAnalysisDir(userId);
      
      // Search through all date files (could be optimized with an index)
      const files = await fs.readdir(analysisDir);
      
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'index.json') {
          const filePath = join(analysisDir, file);
          const data = await fs.readFile(filePath, 'utf-8');
          const analyses = JSON.parse(data);
          
          const found = analyses.find((a: any) => a.analysisId === analysisId);
          if (found) {
            return found;
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('UserDataManager: Error getting content analysis:', error);
      return null;
    }
  }

  /**
   * Get analysis by activity ID
   */
  async getAnalysisByActivity(userId: string, activityId: string): Promise<any | null> {
    try {
      const analysisDir = this.getContentAnalysisDir(userId);
      const files = await fs.readdir(analysisDir);
      
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'index.json') {
          const filePath = join(analysisDir, file);
          const data = await fs.readFile(filePath, 'utf-8');
          const analyses = JSON.parse(data);
          
          const found = analyses.find((a: any) => 
            a.activityIds && a.activityIds.includes(activityId)
          );
          if (found) {
            return found;
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('UserDataManager: Error getting analysis by activity:', error);
      return null;
    }
  }

  /**
   * Load analysis index (url+hash -> analysisId mapping)
   */
  async getAnalysisIndex(userId: string): Promise<Map<string, string>> {
    try {
      const indexPath = this.getContentAnalysisIndexPath(userId);
      const data = await fs.readFile(indexPath, 'utf-8');
      const obj = JSON.parse(data);
      return new Map(Object.entries(obj));
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return new Map();
      }
      console.error('UserDataManager: Error loading analysis index:', error);
      return new Map();
    }
  }

  /**
   * Update analysis index
   */
  async updateAnalysisIndex(
    userId: string,
    key: string,
    analysisId: string
  ): Promise<void> {
    try {
      const analysisDir = this.getContentAnalysisDir(userId);
      await this.ensureDirectoryExists(analysisDir);

      const index = await this.getAnalysisIndex(userId);
      index.set(key, analysisId);

      const indexPath = this.getContentAnalysisIndexPath(userId);
      const obj = Object.fromEntries(index);
      await fs.writeFile(indexPath, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (error) {
      console.error('UserDataManager: Error updating analysis index:', error);
      throw error;
    }
  }

  /**
   * Link an activity ID to an existing analysis
   */
  async linkActivityToAnalysis(
    userId: string,
    activityId: string,
    analysisId: string
  ): Promise<void> {
    try {
      const analysis = await this.getContentAnalysis(userId, analysisId);
      if (!analysis) {
        throw new Error(`Analysis ${analysisId} not found`);
      }

      // Add activity ID if not already present
      if (!analysis.activityIds.includes(activityId)) {
        analysis.activityIds.push(activityId);

        // Find and update the analysis in its date file
        const date = new Date(analysis.timestamp).toISOString().split('T')[0];
        const filePath = this.getContentAnalysisFilePath(userId, date);
        
        const data = await fs.readFile(filePath, 'utf-8');
        const analyses = JSON.parse(data);
        
        const index = analyses.findIndex((a: any) => a.analysisId === analysisId);
        if (index !== -1) {
          analyses[index] = analysis;
          await fs.writeFile(filePath, JSON.stringify(analyses, null, 2), 'utf-8');
          console.log(`UserDataManager: Linked activity ${activityId} to analysis ${analysisId}`);
        }
      }
    } catch (error) {
      console.error('UserDataManager: Error linking activity to analysis:', error);
      throw error;
    }
  }

  /**
   * Save a screenshot
   */
  async saveScreenshot(
    userId: string,
    activityId: string,
    imageBuffer: Buffer
  ): Promise<string> {
    try {
      const screenshotsDir = this.getScreenshotsDir(userId);
      await this.ensureDirectoryExists(screenshotsDir);

      const filename = `${activityId}.png`;
      const filePath = join(screenshotsDir, filename);

      await fs.writeFile(filePath, imageBuffer);

      console.log(`UserDataManager: Saved screenshot for activity ${activityId}`);
      return filePath;
    } catch (error) {
      console.error('UserDataManager: Error saving screenshot:', error);
      throw error;
    }
  }

  /**
   * Get a screenshot
   */
  async getScreenshot(userId: string, activityId: string): Promise<Buffer | null> {
    try {
      const screenshotsDir = this.getScreenshotsDir(userId);
      const filename = `${activityId}.png`;
      const filePath = join(screenshotsDir, filename);

      return await fs.readFile(filePath);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      console.error('UserDataManager: Error reading screenshot:', error);
      return null;
    }
  }

  /**
   * Save raw HTML by hash
   */
  async saveRawHtml(
    userId: string,
    htmlHash: string,
    html: string
  ): Promise<string> {
    try {
      const htmlDir = this.getRawHtmlDir(userId);
      await this.ensureDirectoryExists(htmlDir);

      const filename = `${htmlHash}.html`;
      const filePath = join(htmlDir, filename);

      // Only save if doesn't already exist (deduplication)
      try {
        await fs.access(filePath);
        console.log(`UserDataManager: HTML already exists for hash ${htmlHash}`);
      } catch {
        await fs.writeFile(filePath, html, 'utf-8');
        console.log(`UserDataManager: Saved raw HTML with hash ${htmlHash}`);
      }

      return filePath;
    } catch (error) {
      console.error('UserDataManager: Error saving raw HTML:', error);
      throw error;
    }
  }

  /**
   * Get raw HTML by hash
   */
  async getRawHtml(userId: string, htmlHash: string): Promise<string | null> {
    try {
      const htmlDir = this.getRawHtmlDir(userId);
      const filename = `${htmlHash}.html`;
      const filePath = join(htmlDir, filename);

      return await fs.readFile(filePath, 'utf-8');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      console.error('UserDataManager: Error reading raw HTML:', error);
      return null;
    }
  }

  /**
   * Get all analysis IDs for a specific URL
   */
  async getAnalysisIdsForUrl(userId: string, url: string): Promise<string[]> {
    try {
      const analysisDir = this.getContentAnalysisDir(userId);
      const files = await fs.readdir(analysisDir);
      const analysisIds: string[] = [];
      
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'index.json') {
          const filePath = join(analysisDir, file);
          const data = await fs.readFile(filePath, 'utf-8');
          const analyses = JSON.parse(data);
          
          for (const analysis of analyses) {
            if (analysis.url === url) {
              analysisIds.push(analysis.analysisId);
            }
          }
        }
      }
      
      return analysisIds;
    } catch (error) {
      console.error('UserDataManager: Error getting analysis IDs for URL:', error);
      return [];
    }
  }

  /**
   * Get all analysis IDs for a user
   */
  async getAllAnalysisIds(userId: string): Promise<string[]> {
    try {
      const analysisDir = this.getContentAnalysisDir(userId);
      const files = await fs.readdir(analysisDir);
      const analysisIds: string[] = [];
      
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'index.json') {
          const filePath = join(analysisDir, file);
          const data = await fs.readFile(filePath, 'utf-8');
          const analyses = JSON.parse(data);
          
          for (const analysis of analyses) {
            analysisIds.push(analysis.analysisId);
          }
        }
      }
      
      return analysisIds;
    } catch (error) {
      console.error('UserDataManager: Error getting all analysis IDs:', error);
      return [];
    }
  }

  /**
   * Save LLM debug log
   */
  async saveLLMDebugLog(userId: string, log: any): Promise<void> {
    try {
      const logsDir = this.getLLMDebugLogsDir(userId);
      await this.ensureDirectoryExists(logsDir);

      const date = new Date().toISOString().split('T')[0];
      const filePath = this.getLLMDebugLogsFilePath(userId, date);

      // Load existing logs for today
      let logs: any[] = [];
      try {
        const data = await fs.readFile(filePath, 'utf-8');
        logs = JSON.parse(data);
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          console.error('Error reading existing logs:', error);
        }
      }

      // Add new log
      logs.push(log);

      // Save back
      await fs.writeFile(filePath, JSON.stringify(logs, null, 2), 'utf-8');

      console.log(`UserDataManager: Saved LLM debug log ${log.interactionId}`);
    } catch (error) {
      console.error('UserDataManager: Error saving LLM debug log:', error);
      // Don't throw - debug logs should not break the main flow
    }
  }
}
