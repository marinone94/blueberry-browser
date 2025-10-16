import { ipcMain, WebContents } from "electron";
import type { Window } from "./Window";
import type { ActivityType } from "./shared/types/ActivityTypes";

export class EventManager {
  private mainWindow: Window;

  constructor(mainWindow: Window) {
    this.mainWindow = mainWindow;
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Tab management events
    this.handleTabEvents();

    // Sidebar events
    this.handleSidebarEvents();

    // Page content events
    this.handlePageContentEvents();

    // Dark mode events
    this.handleDarkModeEvents();

    // User account events
    this.handleUserAccountEvents();

    // History events
    this.handleHistoryEvents();

    // Proactive insights events
    this.handleInsightsEvents();

    // Workflow automation events
    this.handleWorkflowAutomationEvents();

    // Activity tracking events
    this.handleActivityTrackingEvents();

    // Inter-component communication events
    this.handleCommunicationEvents();

    // Debug events
    this.handleDebugEvents();
  }

  private handleTabEvents(): void {
    // Create new tab
    ipcMain.handle("create-tab", (_, url?: string) => {
      const newTab = this.mainWindow.createTab(url);
      this.mainWindow.switchActiveTab(newTab.id);
      return { id: newTab.id, title: newTab.title, url: newTab.url };
    });

    // Close tab
    ipcMain.handle("close-tab", (_, id: string) => {
      this.mainWindow.closeTab(id);
    });

    // Switch tab
    ipcMain.handle("switch-tab", (_, id: string) => {
      this.mainWindow.switchActiveTab(id);
    });

    // Get tabs
    ipcMain.handle("get-tabs", () => {
      const activeTabId = this.mainWindow.activeTab?.id;
      return this.mainWindow.allTabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        isActive: activeTabId === tab.id,
      }));
    });

    // Navigation (for compatibility with existing code)
    ipcMain.handle("navigate-to", (_, url: string) => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.loadURL(url);
      }
    });

    ipcMain.handle("navigate-tab", async (_, tabId: string, url: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        await tab.loadURL(url);
        return true;
      }
      return false;
    });

    ipcMain.handle("go-back", () => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.goBack();
      }
    });

    ipcMain.handle("go-forward", () => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.goForward();
      }
    });

    ipcMain.handle("reload", () => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.reload();
      }
    });

    // Tab-specific navigation handlers
    ipcMain.handle("tab-go-back", (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        tab.goBack();
        return true;
      }
      return false;
    });

    ipcMain.handle("tab-go-forward", (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        tab.goForward();
        return true;
      }
      return false;
    });

    ipcMain.handle("tab-reload", (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        tab.reload();
        return true;
      }
      return false;
    });

    ipcMain.handle("tab-screenshot", async (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        const image = await tab.screenshot();
        return image.toDataURL();
      }
      return null;
    });

    ipcMain.handle("tab-run-js", async (_, tabId: string, code: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        return await tab.runJs(code);
      }
      return null;
    });

    // Tab info
    ipcMain.handle("get-active-tab-info", () => {
      const activeTab = this.mainWindow.activeTab;
      if (activeTab) {
        return {
          id: activeTab.id,
          url: activeTab.url,
          title: activeTab.title,
          canGoBack: activeTab.webContents.canGoBack(),
          canGoForward: activeTab.webContents.canGoForward(),
        };
      }
      return null;
    });
  }

  private handleSidebarEvents(): void {
    // Toggle sidebar
    ipcMain.handle("toggle-sidebar", () => {
      this.mainWindow.sidebar.toggle();
      this.mainWindow.updateAllBounds();
      return true;
    });

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

    // Chat History handlers
    ipcMain.handle("get-chat-history", async () => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return null;
      return await this.mainWindow.userDataManager.loadChatHistory(currentUser.id);
    });

    ipcMain.handle("get-chat-sessions", async () => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return [];
      return await this.mainWindow.userDataManager.getChatSessions(currentUser.id);
    });

    ipcMain.handle("get-session-messages", async (_, sessionId: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return [];
      return await this.mainWindow.userDataManager.getSessionMessages(currentUser.id, sessionId);
    });

    ipcMain.handle("create-chat-session", async (_, contextUrl?: string, title?: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) throw new Error("No current user");
      return await this.mainWindow.userDataManager.createChatSession(currentUser.id, contextUrl, title);
    });

    ipcMain.handle("switch-to-session", async (_, sessionId: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return;
      
      // Update LLMClient's current session (this will trigger indexing of the old session)
      await this.mainWindow.sidebar.client.setCurrentSessionId(sessionId);
      
      // Set current session ID in user data manager
      await this.mainWindow.userDataManager.setCurrentSessionId(currentUser.id, sessionId);
      
      // Load messages for this session and convert to CoreMessage format for display
      const sessionMessages = await this.mainWindow.userDataManager.getSessionMessages(currentUser.id, sessionId);
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

    ipcMain.handle("delete-chat-session", async (_, sessionId: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return;
      
      await this.mainWindow.userDataManager.deleteChatSession(
        currentUser.id,
        sessionId,
        this.mainWindow.vectorSearchManager
      );
    });

    ipcMain.handle("clear-chat-history", async () => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return;
      
      // Get all session IDs before clearing
      const history = await this.mainWindow.userDataManager.loadChatHistory(currentUser.id);
      const sessionIds = history.sessions.map(s => s.id);
      
      // Delete vector documents for all sessions
      if (sessionIds.length > 0) {
        await this.mainWindow.vectorSearchManager.deleteMultipleChatSessions(currentUser.id, sessionIds);
      }
      
      await this.mainWindow.userDataManager.clearChatHistory(currentUser.id);
    });

    ipcMain.handle("reindex-all-chats", async () => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) {
        console.log('[EventManager] No current user, cannot re-index');
        return { success: false, error: 'No current user' };
      }

      try {
        console.log('[EventManager] Starting full chat re-index...');
        await this.mainWindow.vectorSearchManager.reindexAllChatSessions(
          currentUser.id,
          this.mainWindow.userDataManager
        );
        console.log('[EventManager] Chat re-index completed successfully');
        return { success: true };
      } catch (error) {
        console.error('[EventManager] Chat re-index failed:', error);
        return { success: false, error: String(error) };
      }
    });

    ipcMain.handle("reindex-browsing-history", async () => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) {
        console.log('[EventManager] No current user, cannot re-index browsing history');
        return { success: false, error: 'No current user', indexed: 0, skipped: 0, alreadyIndexed: 0, errors: 0 };
      }

      try {
        console.log('[EventManager] Starting browsing history re-index (missing entries only)...');
        const result = await this.mainWindow.vectorSearchManager.reindexAllBrowsingHistory(
          currentUser.id,
          this.mainWindow.userDataManager
        );
        console.log('[EventManager] Browsing history re-index completed:', result);
        return result;
      } catch (error) {
        console.error('[EventManager] Browsing history re-index failed:', error);
        return { success: false, error: String(error), indexed: 0, skipped: 0, alreadyIndexed: 0, errors: 0 };
      }
    });

    ipcMain.handle("search-chat-history", async (_, query: string, options?: {
      exactMatch?: boolean;
      dateFrom?: string;
      dateTo?: string;
      limit?: number;
    }) => {
      const startTime = Date.now();
      console.log(`[EventManager] Chat history search requested:`, {
        query,
        options,
        timestamp: new Date().toISOString()
      });

      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) {
        console.log('[EventManager] No current user, returning empty results');
        return [];
      }

      const limit = options?.limit || 20;
      const exactMatch = options?.exactMatch || false;
      
      try {
        // Load all sessions and messages
        const history = await this.mainWindow.userDataManager.loadChatHistory(currentUser.id);
        let sessions = history.sessions;
        console.log(`[EventManager] Loaded ${sessions.length} sessions for user ${currentUser.id}`);
        
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
          console.log(`[EventManager] Empty query, returning ${Math.min(sessions.length, limit)} date-filtered sessions`);
          return sessions.slice(0, limit);
        }

        console.log(`[EventManager] Search mode: ${exactMatch ? 'EXACT' : 'SEMANTIC'}`);

        const queryLower = query.toLowerCase();
        const scoredSessions: Array<{session: any, score: number, matchType: string}> = [];

        if (exactMatch) {
          // Exact substring matching (quoted search)
          console.log('[EventManager] Performing exact substring match search');
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
            const messages = await this.mainWindow.userDataManager.getSessionMessages(currentUser.id, session.id);
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
          console.log('[EventManager] Performing semantic vector search');
          const vectorStartTime = Date.now();
          const vectorResults = await this.mainWindow.vectorSearchManager.searchChatHistory(
            currentUser.id,
            query,
            { limit: limit * 2 } // Get more results to combine with text search
          );
          console.log(`[EventManager] Vector search returned ${vectorResults.length} results in ${Date.now() - vectorStartTime}ms`);

          // Create a map of sessionId -> vector score
          const vectorScores = new Map<string, number>();
          for (const result of vectorResults) {
            const existing = vectorScores.get(result.sessionId) || 0;
            vectorScores.set(result.sessionId, Math.max(existing, result.score));
          }

          // Score each session using both text and vector similarity
          // Strategy: Prioritize exact text matches over semantic similarity
          console.log(`[EventManager] Scoring ${sessions.length} sessions for query: "${query}"`);
          
          for (const session of sessions) {
            let score = 0;
            let matchType = '';
            let hasExactMatch = false;

            // Text matching for title (highest weight for exact matches)
            if (session.title.toLowerCase().includes(queryLower)) {
              score += 15;
              matchType = 'title';
              hasExactMatch = true;
              console.log(`[EventManager] Title match in session ${session.id.substring(0, 20)}`);
            }

            // Check context URLs
            if (session.contextUrls.some((url: string) => url.toLowerCase().includes(queryLower))) {
              score += 8;
              if (!matchType) matchType = 'url';
              hasExactMatch = true;
              console.log(`[EventManager] URL match in session ${session.id.substring(0, 20)}`);
            }

            // Check date/timestamp in query
            const sessionDate = new Date(session.lastActiveAt).toISOString();
            if (sessionDate.includes(queryLower)) {
              score += 5;
              if (!matchType) matchType = 'date';
              hasExactMatch = true;
            }

            // ALWAYS check message content for exact matches (not conditional)
            const messages = await this.mainWindow.userDataManager.getSessionMessages(currentUser.id, session.id);
            for (const msg of messages) {
              const contentStr = typeof msg.content === 'string' 
                ? msg.content 
                : JSON.stringify(msg.content);
              if (contentStr.toLowerCase().includes(queryLower)) {
                score += 12; // Higher weight for exact content match
                if (!matchType) matchType = 'content';
                hasExactMatch = true;
                console.log(`[EventManager] Content match in session ${session.id.substring(0, 20)} (role: ${msg.role})`);
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
        console.log(`[EventManager] Search completed in ${duration}ms:`, {
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
        console.error(`[EventManager] Search failed after ${duration}ms:`, error);
        return [];
      }
    });
  }

  private handlePageContentEvents(): void {
    // Get page content
    ipcMain.handle("get-page-content", async () => {
      if (this.mainWindow.activeTab) {
        try {
          return await this.mainWindow.activeTab.getTabHtml();
        } catch (error) {
          console.error("Error getting page content:", error);
          return null;
        }
      }
      return null;
    });

    // Get page text
    ipcMain.handle("get-page-text", async () => {
      if (this.mainWindow.activeTab) {
        try {
          return await this.mainWindow.activeTab.getTabText();
        } catch (error) {
          console.error("Error getting page text:", error);
          return null;
        }
      }
      return null;
    });

    // Get current URL
    ipcMain.handle("get-current-url", () => {
      if (this.mainWindow.activeTab) {
        return this.mainWindow.activeTab.url;
      }
      return null;
    });
  }

  private handleDarkModeEvents(): void {
    // Dark mode broadcasting
    ipcMain.on("dark-mode-changed", (event, isDarkMode) => {
      this.broadcastDarkMode(event.sender, isDarkMode);
    });
  }

  private handleUserAccountEvents(): void {
    // Get all users
    ipcMain.handle("get-users", () => {
      return this.mainWindow.userAccountManager.getAllUsers();
    });

    // Get current user
    ipcMain.handle("get-current-user", () => {
      return this.mainWindow.userAccountManager.getCurrentUser();
    });

    // Create new user
    ipcMain.handle("create-user", async (_, userData: {name: string, email?: string, birthday?: string}) => {
      const result = await this.mainWindow.userAccountManager.createUser(userData);
      return result;
    });

    // Switch user
    ipcMain.handle("switch-user", async (_, userId: string, options?: {keepCurrentTabs: boolean}) => {
      const switchOptions = options || { keepCurrentTabs: false };
      
      // Switch user in window (handles tab management)
      const result = await this.mainWindow.switchUser(userId, switchOptions);
      
      if (result.success) {
        // Notify LLM client about user switch
        await this.mainWindow.sidebar.client.handleUserSwitch();
        
        // Broadcast user change to all renderer processes
        this.broadcastUserChange();
      }
      
      return result;
    });

    // Update user
    ipcMain.handle("update-user", async (_, userId: string, updates: {name?: string, email?: string, birthday?: string}) => {
      const result = await this.mainWindow.userAccountManager.updateUser(userId, updates);
      
      if (result.success) {
        this.broadcastUserChange();
      }
      
      return result;
    });

    // Delete user
    ipcMain.handle("delete-user", async (_, userId: string) => {
      const result = await this.mainWindow.userAccountManager.deleteUser(userId);
      
      if (result.success) {
        // If current user was deleted, LLM client will automatically switch
        await this.mainWindow.sidebar.client.handleUserSwitch();
        this.broadcastUserChange();
      }
      
      return result;
    });

    // Get user statistics
    ipcMain.handle("get-user-stats", () => {
      return this.mainWindow.userAccountManager.getUserStats();
    });

    // Reset guest user
    ipcMain.handle("reset-guest-user", async () => {
      await this.mainWindow.userAccountManager.resetGuestUser();
      
      // If current user is guest, reload their messages
      if (this.mainWindow.userAccountManager.isCurrentUserGuest()) {
        await this.mainWindow.sidebar.client.handleUserSwitch();
      }
      
      this.broadcastUserChange();
      return { success: true };
    });

    // Save current user's tabs
    ipcMain.handle("save-current-user-tabs", async () => {
      await this.mainWindow.saveCurrentUserTabs();
      return { success: true };
    });
  }

  private handleHistoryEvents(): void {
    // Get browsing history
    ipcMain.handle("get-browsing-history", async () => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return [];
      
      return await this.mainWindow.userDataManager.loadBrowsingHistory(currentUser.id);
    });

    // Search browsing history with smart search (string first, semantic fallback)
    ipcMain.handle("search-browsing-history", async (_, query: string, options?: {
      limit?: number;
      exactMatch?: boolean;
    }) => {
      const startTime = Date.now();
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return [];

      const limit = options?.limit || 50;
      
      // Check if query is surrounded by quotes for exact match only
      let searchQuery = query.trim();
      let exactMatchOnly = options?.exactMatch || false;
      
      if (searchQuery.startsWith('"') && searchQuery.endsWith('"')) {
        exactMatchOnly = true;
        searchQuery = searchQuery.slice(1, -1); // Remove quotes
      }

      console.log('[EventManager] Browsing history search:', {
        query: searchQuery,
        exactMatchOnly,
        limit,
        timestamp: new Date().toISOString()
      });

      // Step 1: Try basic string search (title/URL contains query)
      const basicResults = await this.mainWindow.userDataManager.searchHistory(
        currentUser.id, 
        searchQuery, 
        limit
      );

      console.log('[EventManager] Basic search results:', basicResults.length);

      // If we have results or exact match only, return basic results
      if (basicResults.length > 0 || exactMatchOnly) {
        const duration = Date.now() - startTime;
        console.log('[EventManager] Returning basic search results:', {
          count: basicResults.length,
          durationMs: duration,
          searchMode: exactMatchOnly ? 'EXACT_ONLY' : 'BASIC'
        });
        return basicResults.map(r => ({
          ...r,
          _searchMode: exactMatchOnly ? 'exact' : 'basic'
        }));
      }

      // Step 2: Fallback to semantic search if no basic results
      console.log('[EventManager] No basic results, trying semantic search...');
      
      try {
        const semanticResults = await this.mainWindow.vectorSearchManager.searchBrowsingContent(
          currentUser.id,
          searchQuery,
          { limit: limit * 2 } // Get more for grouping
        );

        console.log('[EventManager] Semantic search results:', semanticResults.length);

        if (semanticResults.length === 0) {
          const duration = Date.now() - startTime;
          console.log('[EventManager] No results found:', {
            durationMs: duration
          });
          return [];
        }

        // Load full browsing history and all content analyses to map vector results
        const fullHistory = await this.mainWindow.userDataManager.loadBrowsingHistory(currentUser.id);
        const allAnalyses = await this.mainWindow.userDataManager.getAllContentAnalyses(currentUser.id);
        
        // Create a map of analysisId -> URL for matching
        const analysisUrlMap = new Map<string, string>();
        for (const analysis of allAnalyses) {
          analysisUrlMap.set(analysis.analysisId, analysis.url);
        }
        
        // Create a map of analysisId -> history entry by matching URLs
        const historyMap = new Map<string, any>();
        for (const entry of fullHistory) {
          // Direct match if entry has analysisId
          if (entry.analysisId) {
            historyMap.set(entry.analysisId, entry);
          } else {
            // Try to match by URL - find all analyses for this URL
            for (const [analysisId, analysisUrl] of analysisUrlMap.entries()) {
              if (analysisUrl === entry.url && !historyMap.has(analysisId)) {
                // Match by URL, prioritizing more recent history entries
                historyMap.set(analysisId, entry);
                break; // Take first match to avoid duplicates
              }
            }
          }
        }
        
        // Map vector results to history entries and attach scores
        const resultsMap = new Map<string, { entry: any; score: number; contentType: string; content: string }>();
        for (const vectorResult of semanticResults) {
          const historyEntry = historyMap.get(vectorResult.analysisId);
          if (historyEntry) {
            const existing = resultsMap.get(historyEntry.id);
            // Keep the highest score for each entry
            if (!existing || vectorResult.score > existing.score) {
              resultsMap.set(historyEntry.id, {
                entry: historyEntry,
                score: vectorResult.score,
                contentType: vectorResult.contentType,
                content: vectorResult.content
              });
            }
          }
        }
        
        // Sort by score (primary) and visit date (secondary)
        const sortedResults = Array.from(resultsMap.values())
          .sort((a, b) => {
            // Primary sort: higher score first
            const scoreDiff = b.score - a.score;
            if (Math.abs(scoreDiff) > 0.01) { // Significant score difference
              return scoreDiff;
            }
            // Secondary sort: more recent visit first (for similar scores)
            const aDate = new Date(a.entry.visitedAt).getTime();
            const bDate = new Date(b.entry.visitedAt).getTime();
            return bDate - aDate;
          })
          .slice(0, limit)
          .map(r => ({
            ...r.entry,
            _searchMode: 'semantic' as const,
            _searchScore: r.score,
            _matchedContent: r.content,
            _matchedContentType: r.contentType
          }));

        const duration = Date.now() - startTime;
        console.log('[EventManager] Returning semantic search results:', {
          count: sortedResults.length,
          durationMs: duration,
          searchMode: 'SEMANTIC',
          topScores: sortedResults.slice(0, 5).map(r => ({
            title: r.title,
            score: r._searchScore?.toFixed(3),
            contentType: r._matchedContentType,
            visitedAt: r.visitedAt
          }))
        });

        return sortedResults;
      } catch (error) {
        console.error('[EventManager] Semantic search failed:', error);
        return [];
      }
    });

    // Clear browsing history
    ipcMain.handle("clear-browsing-history", async () => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return { success: false, error: "No current user" };
      
      await this.mainWindow.userDataManager.clearBrowsingHistory(currentUser.id);
      return { success: true };
    });

    // Remove single history entry
    ipcMain.handle("remove-history-entry", async (_, entryId: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return { success: false, error: "No current user" };
      
      await this.mainWindow.userDataManager.removeHistoryEntry(currentUser.id, entryId);
      return { success: true };
    });

    // Navigate to URL from history (activate existing tab or create new one)
    ipcMain.handle("navigate-from-history", async (_, url: string) => {
      // Check if URL is already open in an existing tab
      const existingTab = this.mainWindow.allTabs.find(tab => tab.url === url);
      
      if (existingTab) {
        // Activate the existing tab
        this.mainWindow.switchActiveTab(existingTab.id);
        return { id: existingTab.id, title: existingTab.title, url: existingTab.url, wasExisting: true };
      } else {
        // Create a new tab
        const newTab = this.mainWindow.createTab(url);
        this.mainWindow.switchActiveTab(newTab.id);
        return { id: newTab.id, title: newTab.title, url: newTab.url, wasExisting: false };
      }
    });
  }

  private handleInsightsEvents(): void {
    // Analyze user behavior and generate insights
    ipcMain.handle("analyze-behavior", async () => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return [];
      
      try {
        console.log('[EventManager] Analyzing behavior for user:', currentUser.name);
        const insights = await this.mainWindow.proactiveInsightsManager.analyzeUserBehavior(currentUser.id);
        console.log('[EventManager] Generated insights:', insights.length);
        return insights;
      } catch (error) {
        console.error('[EventManager] Failed to analyze behavior:', error);
        return [];
      }
    });

    // Get cached insights
    ipcMain.handle("get-insights", async () => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return [];
      
      try {
        const insights = await this.mainWindow.proactiveInsightsManager.getInsights(currentUser.id);
        return insights;
      } catch (error) {
        console.error('[EventManager] Failed to get insights:', error);
        return [];
      }
    });

    // Check for real-time triggers
    ipcMain.handle("check-insight-triggers", async (_, currentUrl: string, recentActivitiesJson: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return [];
      
      try {
        const recentActivities = JSON.parse(recentActivitiesJson);
        const triggered = await this.mainWindow.proactiveInsightsManager.checkRealtimeTriggers(
          currentUser.id,
          currentUrl,
          recentActivities
        );
        return triggered;
      } catch (error) {
        console.error('[EventManager] Failed to check triggers:', error);
        return [];
      }
    });

    // Execute insight action
    ipcMain.handle("execute-insight-action", async (_, insightId: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return { success: false, error: 'No user logged in' };
      
      try {
        const insights = await this.mainWindow.proactiveInsightsManager.getInsights(currentUser.id);
        const insight = insights.find(i => i.id === insightId);
        
        if (!insight) {
          return { success: false, error: 'Insight not found' };
        }

        // Check if already completed (except for reminders)
        if (insight.status === 'completed' && insight.actionType !== 'remind') {
          return { success: false, error: 'This insight has already been completed' };
        }

        // Execute action based on type
        if (insight.actionType === 'open_urls') {
          const urls = insight.actionParams.urls as string[];
          let lastTab;
          for (const url of urls) {
            lastTab = this.mainWindow.createTab(url);
          }
          // Switch to the last opened tab
          if (lastTab) {
            this.mainWindow.switchActiveTab(lastTab.id);
          }
          
          // Mark as completed for workflow insights
          await this.mainWindow.proactiveInsightsManager.markInsightAsCompleted(currentUser.id, insightId);
          
          return { success: true, message: `Opened ${urls.length} tabs` };
        } else if (insight.actionType === 'resume_research') {
          const lastUrl = insight.actionParams.lastUrl as string | undefined;
          console.log(`[EventManager] Resuming research with URL: ${lastUrl}`);
          
          if (lastUrl) {
            try {
              const newTab = this.mainWindow.createTab(lastUrl);
              this.mainWindow.switchActiveTab(newTab.id);
              
              // For abandoned tasks: mark as in_progress (not completed)
              // The system will auto-detect completion based on browsing activity
              if (insight.type === 'abandoned') {
                await this.mainWindow.proactiveInsightsManager.markInsightAsInProgress(currentUser.id, insightId);
              } else {
                // For other research insights: mark as completed
                await this.mainWindow.proactiveInsightsManager.markInsightAsCompleted(currentUser.id, insightId);
              }
              
              return { success: true, message: 'Resumed where you left off' };
            } catch (error) {
              console.error('[EventManager] Failed to create tab:', error);
              return { success: false, error: 'Failed to create tab' };
            }
          }
          return { success: false, error: 'No URL available to resume' };
        } else if (insight.actionType === 'remind') {
          // Check if reminder with same domain, day, and hour already exists
          const existingReminders = await this.mainWindow.userDataManager.getReminders(currentUser.id);
          
          // Extract key properties from the new reminder
          const newDomain = insight.actionParams?.domain;
          const newDayOfWeek = insight.actionParams?.dayOfWeek;
          const newHour = insight.actionParams?.hour;
          
          // Check for duplicate based on content (domain, day, hour)
          // Only consider it a duplicate if all three match
          const existingReminder = existingReminders.find(r => {
            if (r.completed) return false; // Ignore completed reminders
            
            const existingDomain = r.actionParams?.domain;
            const existingDayOfWeek = r.actionParams?.dayOfWeek;
            const existingHour = r.actionParams?.hour;
            
            // All three must match for it to be a duplicate
            return existingDomain === newDomain && 
                   existingDayOfWeek === newDayOfWeek && 
                   existingHour === newHour;
          });
          
          if (existingReminder) {
            return { success: false, error: 'A similar reminder already exists for this time and website' };
          }
          
          // Store reminder
          const reminder = {
            id: `reminder-${Date.now()}`,
            insightId: insight.id,
            userId: currentUser.id,
            title: insight.title,
            description: insight.description,
            actionParams: insight.actionParams,
            createdAt: new Date().toISOString(),
            completed: false
          };
          
          await this.mainWindow.userDataManager.saveReminder(currentUser.id, reminder);
          
          // Send success message to UI
          this.mainWindow.sidebar.view.webContents.send('reminder-set', {
            message: 'Reminder saved successfully',
            reminder
          });
          
          // Note: We don't mark reminders as acted upon, as they can be set multiple times
          
          return { success: true, message: 'Reminder set successfully' };
        }

        return { success: true, message: 'Action executed' };
      } catch (error) {
        console.error('[EventManager] Failed to execute insight action:', error);
        return { success: false, error: 'Failed to execute action' };
      }
    });

    // Get reminders for current user
    ipcMain.handle("get-reminders", async () => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return [];
      
      try {
        return await this.mainWindow.userDataManager.getReminders(currentUser.id);
      } catch (error) {
        console.error('[EventManager] Failed to get reminders:', error);
        return [];
      }
    });

    // Complete a reminder
    ipcMain.handle("complete-reminder", async (_, reminderId: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return { success: false, error: 'No user logged in' };
      
      try {
        await this.mainWindow.userDataManager.completeReminder(currentUser.id, reminderId);
        return { success: true };
      } catch (error) {
        console.error('[EventManager] Failed to complete reminder:', error);
        return { success: false, error: 'Failed to complete reminder' };
      }
    });

    // Delete a reminder
    ipcMain.handle("delete-reminder", async (_, reminderId: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return { success: false, error: 'No user logged in' };
      
      try {
        await this.mainWindow.userDataManager.deleteReminder(currentUser.id, reminderId);
        return { success: true };
      } catch (error) {
        console.error('[EventManager] Failed to delete reminder:', error);
        return { success: false, error: 'Failed to delete reminder' };
      }
    });

    // Execute reminder action (open URL, etc)
    ipcMain.handle("execute-reminder-action", async (_, reminderId: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return { success: false, error: 'No user logged in' };
      
      try {
        const reminders = await this.mainWindow.userDataManager.getReminders(currentUser.id);
        const reminder = reminders.find(r => r.id === reminderId);
        
        if (!reminder) {
          return { success: false, error: 'Reminder not found' };
        }

        // Execute the action based on action params
        if (reminder.actionParams?.domain) {
          // Temporal pattern - open the domain
          const newTab = this.mainWindow.createTab(`https://${reminder.actionParams.domain}`);
          this.mainWindow.switchActiveTab(newTab.id);
        }

        // Mark as completed
        await this.mainWindow.userDataManager.completeReminder(currentUser.id, reminderId);
        
        return { success: true, message: 'Reminder executed' };
      } catch (error) {
        console.error('[EventManager] Failed to execute reminder:', error);
        return { success: false, error: 'Failed to execute reminder' };
      }
    });

    // Mark insight as completed manually
    ipcMain.handle("mark-insight-completed", async (_, insightId: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return { success: false, error: 'No user logged in' };
      
      try {
        await this.mainWindow.proactiveInsightsManager.markInsightAsCompleted(currentUser.id, insightId);
        return { success: true, message: 'Insight marked as completed' };
      } catch (error) {
        console.error('[EventManager] Failed to mark insight as completed:', error);
        return { success: false, error: 'Failed to mark insight as completed' };
      }
    });

    // Get tabs from session IDs (for unfinished tasks)
    ipcMain.handle("get-insight-session-tabs", async (_, insightId: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return { success: false, error: 'No user logged in', tabs: [] };
      
      try {
        const insights = await this.mainWindow.proactiveInsightsManager.getInsights(currentUser.id);
        const insight = insights.find(i => i.id === insightId);
        
        if (!insight) {
          return { success: false, error: 'Insight not found', tabs: [] };
        }
        
        if (!insight.linkedSessionIds || insight.linkedSessionIds.length === 0) {
          return { success: false, error: 'No sessions linked to this insight', tabs: [] };
        }
        
        const tabs = await this.mainWindow.proactiveInsightsManager.getTabsFromSessions(
          currentUser.id, 
          insight.linkedSessionIds
        );
        
        return { success: true, tabs, totalTabs: tabs.length, openedTabs: insight.openedTabUrls || [] };
      } catch (error) {
        console.error('[EventManager] Failed to get session tabs:', error);
        return { success: false, error: 'Failed to get session tabs', tabs: [] };
      }
    });

    // Open a tab and track it for an insight
    ipcMain.handle("open-and-track-tab", async (_, insightId: string, url: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return { success: false, error: 'No user logged in' };
      
      try {
        // Open the tab
        const newTab = this.mainWindow.createTab(url);
        this.mainWindow.switchActiveTab(newTab.id);
        
        // Track the opened tab
        await this.mainWindow.proactiveInsightsManager.trackOpenedTab(currentUser.id, insightId, url);
        
        // Get completion percentage
        const completionPercentage = await this.mainWindow.proactiveInsightsManager.getTabCompletionPercentage(
          currentUser.id, 
          insightId
        );
        
        console.log(`[EventManager] Opened and tracked tab: ${url}, completion: ${(completionPercentage * 100).toFixed(1)}%`);
        
        return { success: true, message: 'Tab opened and tracked', completionPercentage };
      } catch (error) {
        console.error('[EventManager] Failed to open and track tab:', error);
        return { success: false, error: 'Failed to open and track tab' };
      }
    });

    // Get tab completion percentage for an insight
    ipcMain.handle("get-tab-completion-percentage", async (_, insightId: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return { success: false, error: 'No user logged in', percentage: 0 };
      
      try {
        const percentage = await this.mainWindow.proactiveInsightsManager.getTabCompletionPercentage(
          currentUser.id, 
          insightId
        );
        
        return { success: true, percentage };
      } catch (error) {
        console.error('[EventManager] Failed to get tab completion percentage:', error);
        return { success: false, error: 'Failed to get completion percentage', percentage: 0 };
      }
    });
  }

  private handleWorkflowAutomationEvents(): void {
    // Save workflow as agent
    ipcMain.handle('workflow:save-as-agent', async (_, insightId: string, customName?: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return { success: false, error: 'No user logged in' };
      
      try {
        return await this.mainWindow.proactiveInsightsManager.saveWorkflowAsAgent(
          currentUser.id, 
          insightId, 
          customName
        );
      } catch (error) {
        console.error('[EventManager] Failed to save workflow as agent:', error);
        return { success: false, error: 'Failed to save workflow as agent' };
      }
    });

    // Get all saved workflows
    ipcMain.handle('workflow:get-all', async () => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return [];
      
      try {
        return await this.mainWindow.proactiveInsightsManager.getSavedWorkflows(currentUser.id);
      } catch (error) {
        console.error('[EventManager] Failed to get workflows:', error);
        return [];
      }
    });

    // Execute workflow
    ipcMain.handle('workflow:execute', async (_, workflowId: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return { success: false, error: 'No user logged in' };
      
      try {
        return await this.mainWindow.proactiveInsightsManager.executeWorkflow(
          currentUser.id, 
          workflowId
        );
      } catch (error) {
        console.error('[EventManager] Failed to execute workflow:', error);
        return { success: false, error: 'Failed to execute workflow' };
      }
    });

    // Delete workflow
    ipcMain.handle('workflow:delete', async (_, workflowId: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return { success: false, error: 'No user logged in' };
      
      try {
        return await this.mainWindow.proactiveInsightsManager.deleteWorkflow(
          currentUser.id, 
          workflowId
        );
      } catch (error) {
        console.error('[EventManager] Failed to delete workflow:', error);
        return { success: false, error: 'Failed to delete workflow' };
      }
    });

    // Rename workflow
    ipcMain.handle('workflow:rename', async (_, workflowId: string, newName: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return { success: false, error: 'No user logged in' };
      
      try {
        return await this.mainWindow.proactiveInsightsManager.renameWorkflow(
          currentUser.id, 
          workflowId, 
          newName
        );
      } catch (error) {
        console.error('[EventManager] Failed to rename workflow:', error);
        return { success: false, error: 'Failed to rename workflow' };
      }
    });
  }

  private handleCommunicationEvents(): void {
    // Send message from topbar to sidebar
    ipcMain.handle("send-to-sidebar", (_, type: string, data?: any) => {
      this.mainWindow.sidebar.view.webContents.send("topbar-message", type, data);
      return { success: true };
    });
  }

  private handleDebugEvents(): void {
    // Ping test
    ipcMain.on("ping", () => console.log("pong"));
  }

  private handleActivityTrackingEvents(): void {
    // Handle activity reports from renderer processes (injected scripts)
    ipcMain.on('report-activity', (event, activityType: ActivityType, data: any) => {
      const webContents = event.sender;
      const tab = this.mainWindow.findTabByWebContents(webContents);
      
      if (tab) {
        // Let the tab handle the activity report
        tab.handleActivityReport(activityType, data);
      } else {
        console.warn('Activity report from unknown WebContents:', activityType);
      }
    });

    // Activity data query endpoints for future use
    ipcMain.handle('get-activity-data', async (_, userId: string, date?: string) => {
      try {
        return await this.mainWindow.userDataManager.loadRawActivityData(userId, date);
      } catch (error) {
        console.error('Failed to load activity data:', error);
        return [];
      }
    });

    ipcMain.handle('get-activity-date-range', async (_, userId: string) => {
      try {
        return await this.mainWindow.userDataManager.getRawActivityDateRange(userId);
      } catch (error) {
        console.error('Failed to get activity date range:', error);
        return { startDate: '', endDate: '', totalDays: 0 };
      }
    });

    ipcMain.handle('clear-activity-data', async (_, userId: string, beforeDate?: string) => {
      try {
        await this.mainWindow.userDataManager.clearRawActivityData(userId, beforeDate);
        return { success: true };
      } catch (error) {
        console.error('Failed to clear activity data:', error);
        return { success: false, error: String(error) };
      }
    });

    ipcMain.handle('get-activity-data-size', async (_, userId: string) => {
      try {
        return await this.mainWindow.userDataManager.getRawActivityDataSize(userId);
      } catch (error) {
        console.error('Failed to get activity data size:', error);
        return 0;
      }
    });

    ipcMain.handle('populate-history-from-activities', async (_, userId: string) => {
      try {
        const count = await this.mainWindow.userDataManager.populateHistoryFromActivities(userId);
        return { success: true, count };
      } catch (error) {
        console.error('Failed to populate history from activities:', error);
        return { success: false, error: String(error) };
      }
    });

    // Handle chat interactions from sidebar
    ipcMain.on('chat-interaction', (_, data: {
      userMessage: string;
      contextUrl?: string;
      conversationLength: number;
      responseTime?: number;
    }) => {
      if (this.mainWindow.activityCollector) {
        this.mainWindow.activityCollector.collectChatInteraction({
          userMessage: data.userMessage,
          messageLength: data.userMessage.length,
          contextUrl: data.contextUrl,
          conversationLength: data.conversationLength,
          responseTime: data.responseTime
        });
      }
    });

    console.log('Activity tracking IPC handlers initialized');
  }

  private broadcastUserChange(): void {
    const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
    const allUsers = this.mainWindow.userAccountManager.getAllUsers();
    const userStats = this.mainWindow.userAccountManager.getUserStats();

    const userData = {
      currentUser,
      allUsers,
      userStats
    };

    // Send to topbar
    this.mainWindow.topBar.view.webContents.send("user-changed", userData);

    // Send to sidebar
    this.mainWindow.sidebar.view.webContents.send("user-changed", userData);

    // Send to all tabs
    this.mainWindow.allTabs.forEach((tab) => {
      tab.webContents.send("user-changed", userData);
    });
  }

  private broadcastDarkMode(sender: WebContents, isDarkMode: boolean): void {
    // Send to topbar
    if (this.mainWindow.topBar.view.webContents !== sender) {
      this.mainWindow.topBar.view.webContents.send(
        "dark-mode-updated",
        isDarkMode
      );
    }

    // Send to sidebar
    if (this.mainWindow.sidebar.view.webContents !== sender) {
      this.mainWindow.sidebar.view.webContents.send(
        "dark-mode-updated",
        isDarkMode
      );
    }

    // Send to all tabs
    this.mainWindow.allTabs.forEach((tab) => {
      if (tab.webContents !== sender) {
        tab.webContents.send("dark-mode-updated", isDarkMode);
      }
    });
  }

  // Clean up event listeners
  public cleanup(): void {
    ipcMain.removeAllListeners();
  }
}
