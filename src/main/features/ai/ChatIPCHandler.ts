import { ipcMain } from "electron";
import { BaseIPCHandler } from "../../core/ipc";
import type { Window } from "../../Window";

/**
 * ChatIPCHandler
 * 
 * Handles IPC for AI chat operations including:
 * - Sending chat messages with streaming responses
 * - Managing chat sessions (create, switch, delete)
 * - Chat history operations (load, search, clear)
 * - Vector search re-indexing
 * 
 * Extracted from EventManager lines 172-517
 */
export class ChatIPCHandler extends BaseIPCHandler {
  constructor(mainWindow: Window) {
    super(mainWindow);
  }

  get name(): string {
    return "chat";
  }

  registerHandlers(): void {
    // ========================================================================
    // CHAT MESSAGING
    // ========================================================================

    // Chat message
    ipcMain.handle("sidebar-chat-message", async (_, request) => {
      // The LLMClient now handles getting the screenshot and context directly
      await this.mainWindow.sidebar.client.sendChatMessage(request);
    });

    // Clear chat
    ipcMain.handle("sidebar-clear-chat", async () => {
      await this.mainWindow.sidebar.client.clearMessages();
      return true;
    });

    // Get messages
    ipcMain.handle("sidebar-get-messages", () => {
      return this.mainWindow.sidebar.client.getMessages();
    });

    // ========================================================================
    // CHAT HISTORY
    // ========================================================================

    // Get chat history
    ipcMain.handle("get-chat-history", async () => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return null;
      return await this.mainWindow.chatStorage.loadChatHistory(currentUser.id);
    });

    // Get chat sessions
    ipcMain.handle("get-chat-sessions", async () => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return [];
      return await this.mainWindow.chatStorage.getChatSessions(currentUser.id);
    });

    // Get session messages
    ipcMain.handle("get-session-messages", async (_, sessionId: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return [];
      return await this.mainWindow.chatStorage.getSessionMessages(currentUser.id, sessionId);
    });

    // ========================================================================
    // SESSION MANAGEMENT
    // ========================================================================

    // Create chat session
    ipcMain.handle("create-chat-session", async (_, contextUrl?: string, title?: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) throw new Error("No current user");
      return await this.mainWindow.chatStorage.createChatSession(currentUser.id, contextUrl, title);
    });

    // Switch to session
    ipcMain.handle("switch-to-session", async (_, sessionId: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return;
      
      // Update LLMClient's current session (this will trigger indexing of the old session)
      await this.mainWindow.sidebar.client.setCurrentSessionId(sessionId);
      
      // Set current session ID in chat storage
      await this.mainWindow.chatStorage.setCurrentSessionId(currentUser.id, sessionId);
      
      // Load messages for this session and convert to CoreMessage format for display
      const sessionMessages = await this.mainWindow.chatStorage.getSessionMessages(currentUser.id, sessionId);
      const coreMessages = sessionMessages.map(msg => {
        const coreMessage: any = {
          role: msg.role,
          content: msg.content
        };
        return coreMessage;
      });
      
      // Update LLMClient's messages
      this.mainWindow.sidebar.client.setMessages(coreMessages);
    });

    // Delete chat session
    ipcMain.handle("delete-chat-session", async (_, sessionId: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return;
      
      await this.mainWindow.chatStorage.deleteChatSession(
        currentUser.id,
        sessionId
      );
      // Also delete vector search documents
      await this.mainWindow.vectorSearchManager.deleteChatSessionDocuments(
        currentUser.id,
        sessionId
      );
    });

    // Clear chat history
    ipcMain.handle("clear-chat-history", async () => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return;
      
      // Get all session IDs before clearing
      const history = await this.mainWindow.chatStorage.loadChatHistory(currentUser.id);
      const sessionIds = history.sessions.map(s => s.id);
      
      // Delete vector documents for all sessions
      if (sessionIds.length > 0) {
        await this.mainWindow.vectorSearchManager.deleteMultipleChatSessions(currentUser.id, sessionIds);
      }
      
      await this.mainWindow.chatStorage.clearChatHistory(currentUser.id);
    });

    // ========================================================================
    // VECTOR SEARCH & RE-INDEXING
    // ========================================================================

    // Re-index all chat sessions
    ipcMain.handle("reindex-all-chats", async () => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) {
        console.log('[ChatIPCHandler] No current user, cannot re-index');
        return { success: false, error: 'No current user' };
      }

      try {
        console.log('[ChatIPCHandler] Starting full chat re-index...');
        await this.mainWindow.vectorSearchManager.reindexAllChatSessions(
          currentUser.id,
          this.mainWindow.chatStorage
        );
        console.log('[ChatIPCHandler] Chat re-index completed successfully');
        return { success: true };
      } catch (error) {
        console.error('[ChatIPCHandler] Chat re-index failed:', error);
        return { success: false, error: String(error) };
      }
    });

    // Search chat history (hybrid: text + semantic vector search)
    ipcMain.handle("search-chat-history", async (_, query: string, options?: {
      exactMatch?: boolean;
      dateFrom?: string;
      dateTo?: string;
      limit?: number;
    }) => {
      const startTime = Date.now();
      console.log(`[ChatIPCHandler] Chat history search requested:`, {
        query,
        options,
        timestamp: new Date().toISOString()
      });

      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) {
        console.log('[ChatIPCHandler] No current user, returning empty results');
        return [];
      }

      const limit = options?.limit || 20;
      const exactMatch = options?.exactMatch || false;
      
      try {
        // Load all sessions and messages
        const history = await this.mainWindow.chatStorage.loadChatHistory(currentUser.id);
        let sessions = history.sessions;
        console.log(`[ChatIPCHandler] Loaded ${sessions.length} sessions for user ${currentUser.id}`);
        
        // Filter by date range if provided
        if (options?.dateFrom || options?.dateTo) {
          const dateFrom = options.dateFrom ? new Date(options.dateFrom) : null;
          const dateTo = options.dateTo ? new Date(options.dateTo) : null;
          
          sessions = sessions.filter(session => {
            const sessionDate = new Date(session.lastActiveAt);
            if (dateFrom && sessionDate < dateFrom) return false;
            if (dateTo && sessionDate > dateTo) return false;
            return true;
          });
        }

        // If query is empty, return date-filtered sessions
        if (!query.trim()) {
          console.log(`[ChatIPCHandler] Empty query, returning ${Math.min(sessions.length, limit)} date-filtered sessions`);
          return sessions.slice(0, limit);
        }

        console.log(`[ChatIPCHandler] Search mode: ${exactMatch ? 'EXACT' : 'SEMANTIC'}`);

        const queryLower = query.toLowerCase();
        const scoredSessions: Array<{session: any, score: number, matchType: string}> = [];

        if (exactMatch) {
          // Exact substring matching (quoted search)
          console.log('[ChatIPCHandler] Performing exact substring match search');
          for (const session of sessions) {
            let score = 0;
            let matchType = '';

            // Check title
            if (session.title.toLowerCase().includes(queryLower)) {
              score += 10;
              matchType = 'title';
            }

            // Check context URLs
            if (session.contextUrls.some((url: string) => url.toLowerCase().includes(queryLower))) {
              score += 5;
              if (!matchType) matchType = 'url';
            }

            // Check message content
            const messages = await this.mainWindow.chatStorage.getSessionMessages(currentUser.id, session.id);
            for (const msg of messages) {
              const contentStr = typeof msg.content === 'string' 
                ? msg.content 
                : JSON.stringify(msg.content);
              if (contentStr.toLowerCase().includes(queryLower)) {
                score += 1;
                if (!matchType) matchType = 'content';
              }
            }

            if (score > 0) {
              scoredSessions.push({ session, score, matchType });
            }
          }
        } else {
          // Semantic search using vector embeddings
          console.log('[ChatIPCHandler] Performing semantic vector search');
          const vectorStartTime = Date.now();
          const vectorResults = await this.mainWindow.vectorSearchManager.searchChatHistory(
            currentUser.id,
            query,
            { limit: limit * 2 } // Get more results to combine with text search
          );
          console.log(`[ChatIPCHandler] Vector search returned ${vectorResults.length} results in ${Date.now() - vectorStartTime}ms`);

          // Create a map of sessionId -> vector score
          const vectorScores = new Map<string, number>();
          for (const result of vectorResults) {
            const existing = vectorScores.get(result.sessionId) || 0;
            vectorScores.set(result.sessionId, Math.max(existing, result.score));
          }

          // Score each session using both text and vector similarity
          // Strategy: Prioritize exact text matches over semantic similarity
          console.log(`[ChatIPCHandler] Scoring ${sessions.length} sessions for query: "${query}"`);
          
          for (const session of sessions) {
            let score = 0;
            let matchType = '';
            let hasExactMatch = false;

            // Text matching for title (highest weight for exact matches)
            if (session.title.toLowerCase().includes(queryLower)) {
              score += 15;
              matchType = 'title';
              hasExactMatch = true;
              console.log(`[ChatIPCHandler] Title match in session ${session.id.substring(0, 20)}`);
            }

            // Check context URLs
            if (session.contextUrls.some((url: string) => url.toLowerCase().includes(queryLower))) {
              score += 8;
              if (!matchType) matchType = 'url';
              hasExactMatch = true;
              console.log(`[ChatIPCHandler] URL match in session ${session.id.substring(0, 20)}`);
            }

            // Check date/timestamp in query
            const sessionDate = new Date(session.lastActiveAt).toISOString();
            if (sessionDate.includes(queryLower)) {
              score += 5;
              if (!matchType) matchType = 'date';
              hasExactMatch = true;
            }

            // ALWAYS check message content for exact matches (not conditional)
            const messages = await this.mainWindow.chatStorage.getSessionMessages(currentUser.id, session.id);
            for (const msg of messages) {
              const contentStr = typeof msg.content === 'string' 
                ? msg.content 
                : JSON.stringify(msg.content);
              if (contentStr.toLowerCase().includes(queryLower)) {
                score += 12; // Higher weight for exact content match
                if (!matchType) matchType = 'content';
                hasExactMatch = true;
                console.log(`[ChatIPCHandler] Content match in session ${session.id.substring(0, 20)} (role: ${msg.role})`);
                break; // Only count once per session
              }
            }

            // Add vector similarity score (lower weight when exact match exists)
            const vectorScore = vectorScores.get(session.id) || 0;
            if (vectorScore > 0) {
              if (hasExactMatch) {
                // Semantic similarity as a tie-breaker for exact matches
                score += vectorScore * 3;
              } else {
                // Pure semantic match gets moderate weight
                score += vectorScore * 8;
                if (!matchType) matchType = 'semantic';
              }
            }

            if (score > 0) {
              scoredSessions.push({ session, score, matchType });
            }
          }
        }

        // Sort by score (descending) and return top results
        scoredSessions.sort((a, b) => b.score - a.score);
        const topResults = scoredSessions.slice(0, limit);
        
        const duration = Date.now() - startTime;
        console.log(`[ChatIPCHandler] Search completed in ${duration}ms:`, {
          totalCandidates: scoredSessions.length,
          returnedResults: topResults.length,
          topScores: topResults.slice(0, 5).map(s => ({
            title: s.session.title,
            score: s.score.toFixed(2),
            matchType: s.matchType
          }))
        });
        
        return topResults.map(s => ({
          ...s.session,
          _searchScore: s.score,
          _matchType: s.matchType
        }));

      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[ChatIPCHandler] Search failed after ${duration}ms:`, error);
        return [];
      }
    });
  }

  cleanup(): void {
    console.log("[ChatIPCHandler] Cleaning up chat handlers...");
    
    // Remove all chat-related handlers
    ipcMain.removeHandler("sidebar-chat-message");
    ipcMain.removeHandler("sidebar-clear-chat");
    ipcMain.removeHandler("sidebar-get-messages");
    ipcMain.removeHandler("get-chat-history");
    ipcMain.removeHandler("get-chat-sessions");
    ipcMain.removeHandler("get-session-messages");
    ipcMain.removeHandler("create-chat-session");
    ipcMain.removeHandler("switch-to-session");
    ipcMain.removeHandler("delete-chat-session");
    ipcMain.removeHandler("clear-chat-history");
    ipcMain.removeHandler("reindex-all-chats");
    ipcMain.removeHandler("search-chat-history");
    
    console.log("[ChatIPCHandler] All chat handlers cleaned up");
  }
}

