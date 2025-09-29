import { BaseWindow, shell } from "electron";
import { Tab, type HistoryCallback } from "./Tab";
import { TopBar } from "./TopBar";
import { SideBar } from "./SideBar";
import { UserAccountManager, type TabSwitchOptions } from "./UserAccountManager";
import { UserDataManager, type UserTabState } from "./UserDataManager";
import { ActivityCollector } from "./ActivityCollector";

export class Window {
  private _baseWindow!: BaseWindow;
  private tabsMap: Map<string, Tab> = new Map();
  private activeTabId: string | null = null;
  private prevActiveTabId: string | null = null;
  private tabCounter: number = 0;
  private _topBar!: TopBar;
  private _sideBar!: SideBar;
  private _userDataManager!: UserDataManager;
  private _userAccountManager!: UserAccountManager;
  private _activityCollector?: ActivityCollector;

  private constructor() {
    // Private constructor - use Window.create() instead
  }

  static async create(): Promise<Window> {
    const window = new Window();
    await window.initialize();
    return window;
  }

  private async initialize(): Promise<void> {
    // Create the browser window.
    this._baseWindow = new BaseWindow({
      width: 1000,
      height: 800,
      show: true,
      autoHideMenuBar: false,
      titleBarStyle: "hidden",
      ...(process.platform !== "darwin" ? { titleBarOverlay: true } : {}),
      trafficLightPosition: { x: 15, y: 13 },
    });

    this._baseWindow.setMinimumSize(1000, 800);

    // Initialize user management
    this._userDataManager = new UserDataManager();
    this._userAccountManager = new UserAccountManager(this._userDataManager);
    
    // Wait for user accounts to initialize before proceeding
    await this.waitForUserAccountsInitialization();

    this._topBar = new TopBar(this._baseWindow);
    this._sideBar = new SideBar(this._baseWindow);

    // Set the window reference on the LLM client to avoid circular dependency
    this._sideBar.client.setWindow(this);
    this._sideBar.client.setUserAccountManager(this._userAccountManager);

    // Initialize activity tracking
    await this.initializeActivityTracking();

    // Create the first tab with current user's session
    const firstTab = this.createTab();
    this.switchActiveTab(firstTab.id);

    // Set up window resize handler
    this._baseWindow.on("resize", () => {
      this.updateTabBounds();
      this._topBar.updateBounds();
      this._sideBar.updateBounds();
      // Notify renderer of resize through active tab
      const bounds = this._baseWindow.getBounds();
      if (this.activeTab) {
        this.activeTab.webContents.send("window-resized", {
          width: bounds.width,
          height: bounds.height,
        });
      }
    });

    // Handle external link opening
    this.tabsMap.forEach((tab) => {
      tab.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url);
        return { action: "deny" };
      });
    });

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this._baseWindow.on("closed", () => {
      // Clean up activity collector
      if (this._activityCollector) {
        this._activityCollector.destroy();
      }
      
      // Clean up all tabs when window is closed
      this.tabsMap.forEach((tab) => tab.destroy());
      this.tabsMap.clear();
    });
  }

  /**
   * Initialize activity tracking for the current user
   */
  private async initializeActivityTracking(): Promise<void> {
    const currentUser = this._userAccountManager.getCurrentUser();
    if (currentUser && !currentUser.isGuest) {
      // Destroy existing collector if any
      if (this._activityCollector) {
        await this._activityCollector.destroy();
      }
      
      // Create new collector for current user
      this._activityCollector = new ActivityCollector(currentUser.id, this._userDataManager);
      console.log(`ActivityCollector initialized for user: ${currentUser.name} (${currentUser.id})`);
      
      // Set collector for all existing tabs
      this.tabsMap.forEach(tab => {
        tab.setActivityCollector(this._activityCollector!);
      });
    } else {
      // No activity tracking for guest users
      if (this._activityCollector) {
        await this._activityCollector.destroy();
        this._activityCollector = undefined;
      }
      console.log('Activity tracking disabled for guest user');
    }
  }

  /**
   * Find a tab by its WebContents instance
   */
  findTabByWebContents(webContents: any): Tab | undefined {
    for (const tab of this.tabsMap.values()) {
      if (tab.webContents === webContents) {
        return tab;
      }
    }
    return undefined;
  }

  // Getters
  get window(): BaseWindow {
    return this._baseWindow;
  }

  get activeTab(): Tab | null {
    if (this.activeTabId) {
      return this.tabsMap.get(this.activeTabId) || null;
    }
    return null;
  }

  get allTabs(): Tab[] {
    return Array.from(this.tabsMap.values());
  }

  get tabCount(): number {
    return this.tabsMap.size;
  }

  // Tab management methods
  createTab(url?: string): Tab {
    const tabId = `tab-${++this.tabCounter}`;
    const sessionPartition = this._userAccountManager.getCurrentSessionPartition();
    
    // Create history callback
    const historyCallback: HistoryCallback = (entry) => {
      const currentUser = this._userAccountManager.getCurrentUser();
      if (currentUser) {
        this._userDataManager.addHistoryEntry(currentUser.id, entry).catch(error => {
          console.error('Failed to save history entry:', error);
        });
      }
    };
    
    const tab = new Tab(tabId, url, sessionPartition, historyCallback);

    // Set activity collector if available
    if (this._activityCollector) {
      tab.setActivityCollector(this._activityCollector);
    }

    // Add the tab's WebContentsView to the window
    this._baseWindow.contentView.addChildView(tab.view);

    // Set the bounds to fill the window below the topbar and to the left of sidebar
    const bounds = this._baseWindow.getBounds();
    tab.view.setBounds({
      x: 0,
      y: 88, // Start below the topbar
      width: bounds.width - 400, // Subtract sidebar width
      height: bounds.height - 88, // Subtract topbar height
    });

    // Store the tab
    this.tabsMap.set(tabId, tab);

    // Track tab creation
    if (this._activityCollector) {
      this._activityCollector.collectTabAction({
        action: 'create',
        tabId: tabId,
        url: url,
        totalTabs: this.tabsMap.size
      });
    }

    // Hide the tab initially - it will be shown when activated via EventManager
    tab.hide();

    return tab;
  }

  closeTab(tabId: string, preventWindowClose: boolean = false): boolean {
    const tab = this.tabsMap.get(tabId);
    if (!tab) {
      return false;
    }

    // Track tab closure
    if (this._activityCollector) {
      this._activityCollector.collectTabAction({
        action: 'close',
        tabId: tabId,
        url: tab.url,
        totalTabs: this.tabsMap.size - 1
      });
    }

    // Remove the WebContentsView from the window
    this._baseWindow.contentView.removeChildView(tab.view);

    // Destroy the tab
    tab.destroy();

    // Remove from our tabs map
    this.tabsMap.delete(tabId);

    // Clean up prevActiveTabId if it was the closed tab
    if (this.prevActiveTabId === tabId) {
      this.prevActiveTabId = null;
    }

    // If this was the active tab, switch to another tab
    if (this.activeTabId === tabId) {
      this.activeTabId = null;

      // Switch to the previous active tab if it still exists
      if (this.prevActiveTabId && this.tabsMap.has(this.prevActiveTabId)) {
        this.switchActiveTab(this.prevActiveTabId);
      // If no valid previous active tab, switch to the last one
      } else {
        const remainingTabs = Array.from(this.tabsMap.keys());
        if (remainingTabs.length > 0) {
          this.switchActiveTab(remainingTabs[remainingTabs.length - 1]);
        }
      }
    }

    // If no tabs left, close the window (unless prevented)
    if (this.tabsMap.size === 0 && !preventWindowClose) {
      this._baseWindow.close();
    }

    return true;
  }

  switchActiveTab(tabId: string): boolean {
    const tab = this.tabsMap.get(tabId);
    if (!tab) {
      return false;
    }

    // Track tab switching
    if (this._activityCollector && this.activeTabId !== tabId) {
      this._activityCollector.collectTabAction({
        action: 'switch',
        tabId: tabId,
        url: tab.url,
        totalTabs: this.tabsMap.size
      });
    }

    // Hide the currently active tab
    if (this.activeTabId && this.activeTabId !== tabId) {
      const currentTab = this.tabsMap.get(this.activeTabId);
      if (currentTab) {
        currentTab.hide();
        this.prevActiveTabId = this.activeTabId;
      }
    }

    // Show the new active tab
    tab.show();
    this.activeTabId = tabId;

    // Update the window title to match the tab title
    this._baseWindow.setTitle(tab.title || "Blueberry Browser");

    return true;
  }

  getTab(tabId: string): Tab | null {
    return this.tabsMap.get(tabId) || null;
  }

  // Window methods
  show(): void {
    this._baseWindow.show();
  }

  hide(): void {
    this._baseWindow.hide();
  }

  close(): void {
    this._baseWindow.close();
  }

  focus(): void {
    this._baseWindow.focus();
  }

  minimize(): void {
    this._baseWindow.minimize();
  }

  maximize(): void {
    this._baseWindow.maximize();
  }

  unmaximize(): void {
    this._baseWindow.unmaximize();
  }

  isMaximized(): boolean {
    return this._baseWindow.isMaximized();
  }

  setTitle(title: string): void {
    this._baseWindow.setTitle(title);
  }

  setBounds(bounds: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }): void {
    this._baseWindow.setBounds(bounds);
  }

  getBounds(): { x: number; y: number; width: number; height: number } {
    return this._baseWindow.getBounds();
  }

  // Handle window resize to update tab bounds
  private updateTabBounds(): void {
    const bounds = this._baseWindow.getBounds();
    // Only subtract sidebar width if it's visible
    const sidebarWidth = this._sideBar.getIsVisible() ? 400 : 0;

    this.tabsMap.forEach((tab) => {
      tab.view.setBounds({
        x: 0,
        y: 88, // Start below the topbar
        width: bounds.width - sidebarWidth,
        height: bounds.height - 88, // Subtract topbar height
      });
    });
  }

  // Public method to update all bounds when sidebar is toggled
  updateAllBounds(): void {
    this.updateTabBounds();
    this._sideBar.updateBounds();
  }

  // Getter for sidebar to access from main process
  get sidebar(): SideBar {
    return this._sideBar;
  }


  // Getter for topBar to access from main process
  get topBar(): TopBar {
    return this._topBar;
  }

  // Getter for all tabs as array
  get tabs(): Tab[] {
    return Array.from(this.tabsMap.values());
  }

  // Getter for baseWindow to access from Menu
  get baseWindow(): BaseWindow {
    return this._baseWindow;
  }

  // User Account Management
  get userAccountManager(): UserAccountManager {
    return this._userAccountManager;
  }

  get activityCollector(): ActivityCollector | undefined {
    return this._activityCollector;
  }

  get userDataManager(): UserDataManager {
    return this._userDataManager;
  }

  /**
   * Wait for user accounts to be initialized
   */
  private async waitForUserAccountsInitialization(): Promise<void> {
    // Wait for user accounts to be loaded
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds max
    
    while (attempts < maxAttempts) {
      const users = this._userAccountManager.getAllUsers();
      if (users.length > 0) {
        console.log(`User accounts initialized after ${attempts * 100}ms`);
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    console.warn('User accounts initialization timeout - proceeding anyway');
  }

  /**
   * Convert current tabs to UserTabState format
   */
  private getCurrentTabsState(): UserTabState[] {
    return this.allTabs.map(tab => ({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      isActive: tab.id === this.activeTabId
    }));
  }

  /**
   * Switch user with tab management options
   */
  async switchUser(userId: string, options: TabSwitchOptions = { keepCurrentTabs: false }): Promise<{ success: boolean; error?: string }> {
    try {
      // Save current user's tabs if they want to keep them
      if (options.keepCurrentTabs && !this._userAccountManager.isCurrentUserGuest()) {
        const currentTabs = this.getCurrentTabsState();
        await this._userAccountManager.saveCurrentUserTabs(currentTabs);
      }

      // Switch user
      const switchResult = await this._userAccountManager.switchUser(userId, options);
      if (!switchResult.success) {
        return switchResult;
      }

      // Reinitialize activity tracking for new user
      await this.initializeActivityTracking();

      // Handle tab switching based on options
      if (options.keepCurrentTabs) {
        // Keep current tabs - they now belong to the new user
        // Update all existing tabs to use new user's session partition
        await this.reloadAllTabsWithNewSession();
      } else {
        // Close current tabs and load user's saved tabs
        await this.closeAllTabs(true); // Prevent window close during user switch
        
        if (switchResult.tabsToLoad && switchResult.tabsToLoad.length > 0) {
          // Load user's saved tabs
          for (const tabState of switchResult.tabsToLoad) {
            const tab = this.createTab(tabState.url);
            if (tabState.isActive) {
              this.switchActiveTab(tab.id);
            }
          }
        } else {
          // No saved tabs, create a default tab
          const defaultTab = this.createTab();
          this.switchActiveTab(defaultTab.id);
        }
      }

      console.log(`Successfully switched to user: ${this._userAccountManager.getCurrentUser()?.name}`);
      return { success: true };
    } catch (error) {
      console.error("Failed to switch user:", error);
      return { success: false, error: "Failed to switch user" };
    }
  }

  /**
   * Reload all tabs with new session partition (for user switching)
   */
  async reloadAllTabsWithNewSession(): Promise<void> {
    const tabStates = this.getCurrentTabsState();
    const activeTabState = tabStates.find(tab => tab.isActive);
    
    // Close all existing tabs
    await this.closeAllTabs(true); // Prevent window close during session reload
    
    // Recreate tabs with new session partition
    for (const tabState of tabStates) {
      const tab = this.createTab(tabState.url);
      if (tabState.isActive) {
        this.switchActiveTab(tab.id);
      }
    }
    
    // If no active tab was found, activate the first one
    if (!activeTabState && this.allTabs.length > 0) {
      this.switchActiveTab(this.allTabs[0].id);
    }
  }

  /**
   * Close all tabs
   */
  async closeAllTabs(preventWindowClose: boolean = false): Promise<void> {
    const tabIds = Array.from(this.tabsMap.keys());
    for (const tabId of tabIds) {
      this.closeTab(tabId, preventWindowClose);
    }
  }

  /**
   * Save current user's tabs
   */
  async saveCurrentUserTabs(): Promise<void> {
    const currentTabs = this.getCurrentTabsState();
    await this._userAccountManager.saveCurrentUserTabs(currentTabs);
  }


  /**
   * Create tab from saved state
   */
  createTabFromState(tabState: UserTabState): Tab {
    const tab = this.createTab(tabState.url);
    // Additional restoration logic can be added here (scroll position, etc.)
    return tab;
  }
}
