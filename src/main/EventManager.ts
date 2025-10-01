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

    // Search browsing history
    ipcMain.handle("search-browsing-history", async (_, query: string, limit?: number) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return [];
      
      return await this.mainWindow.userDataManager.searchHistory(currentUser.id, query, limit);
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
