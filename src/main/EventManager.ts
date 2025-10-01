import { ipcMain, WebContents } from "electron";
import type { Window } from "./Window";
import type { ActivityType } from "./ActivityTypes";

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

      // Step 1: Try basic string search (title/URL/page description/screenshot description contains query)
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
          { limit }
        );

        console.log('[EventManager] Semantic search results:', semanticResults.length);

        if (semanticResults.length === 0) {
          const duration = Date.now() - startTime;
          console.log('[EventManager] No results found:', {
            durationMs: duration
          });
          return [];
        }

        // Group results by analysisId and get the best match for each
        const resultsByAnalysisId = new Map<string, typeof semanticResults[0]>();
        for (const result of semanticResults) {
          const existing = resultsByAnalysisId.get(result.analysisId);
          if (!existing || result.score > existing.score) {
            resultsByAnalysisId.set(result.analysisId, result);
          }
        }

        // Convert to browsing history entries
        const analysisIds = Array.from(resultsByAnalysisId.keys());
        const historyEntries = await this.mainWindow.userDataManager.loadBrowsingHistory(currentUser.id);
        
        const semanticHistoryResults = historyEntries
          .filter(entry => analysisIds.includes(entry.id))
          .map(entry => {
            const semanticResult = resultsByAnalysisId.get(entry.id)!;
            return {
              ...entry,
              _searchMode: 'semantic' as const,
              _searchScore: semanticResult.score,
              _matchedContent: semanticResult.content,
              _matchedContentType: semanticResult.contentType
            };
          })
          .sort((a, b) => (b._searchScore || 0) - (a._searchScore || 0))
          .slice(0, limit);

        const duration = Date.now() - startTime;
        console.log('[EventManager] Returning semantic search results:', {
          count: semanticHistoryResults.length,
          durationMs: duration,
          searchMode: 'SEMANTIC',
          topScores: semanticHistoryResults.slice(0, 5).map(r => ({
            title: r.title,
            score: r._searchScore?.toFixed(2),
            contentType: r._matchedContentType
          }))
        });

        return semanticHistoryResults;
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
