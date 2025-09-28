import { BaseWindow, shell } from "electron";
import { Tab } from "./Tab";
import { TopBar } from "./TopBar";
import { SideBar } from "./SideBar";
import { UserAccountManager, type TabSwitchOptions } from "./UserAccountManager";
import { UserDataManager, type UserTabState } from "./UserDataManager";

export class Window {
  private _baseWindow: BaseWindow;
  private tabsMap: Map<string, Tab> = new Map();
  private activeTabId: string | null = null;
  private prevActiveTabId: string | null = null;
  private tabCounter: number = 0;
  private _topBar: TopBar;
  private _sideBar: SideBar;
  private _userDataManager: UserDataManager;
  private _userAccountManager: UserAccountManager;

  constructor() {
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

    this._topBar = new TopBar(this._baseWindow);
    this._sideBar = new SideBar(this._baseWindow);

    // Set the window reference on the LLM client to avoid circular dependency
    this._sideBar.client.setWindow(this);
    this._sideBar.client.setUserAccountManager(this._userAccountManager);

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
      // Clean up all tabs when window is closed
      this.tabsMap.forEach((tab) => tab.destroy());
      this.tabsMap.clear();
    });
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
    const tab = new Tab(tabId, url, sessionPartition);

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

    // Hide the tab initially - it will be shown when activated via EventManager
    tab.hide();

    return tab;
  }

  closeTab(tabId: string): boolean {
    const tab = this.tabsMap.get(tabId);
    if (!tab) {
      return false;
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

    // If no tabs left, close the window
    if (this.tabsMap.size === 0) {
      this._baseWindow.close();
    }

    return true;
  }

  switchActiveTab(tabId: string): boolean {
    const tab = this.tabsMap.get(tabId);
    if (!tab) {
      return false;
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

  get userDataManager(): UserDataManager {
    return this._userDataManager;
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

      // Handle tab switching based on options
      if (options.keepCurrentTabs) {
        // Keep current tabs - they now belong to the new user
        // Update all existing tabs to use new user's session partition
        await this.reloadAllTabsWithNewSession();
      } else {
        // Close current tabs and load user's saved tabs
        await this.closeAllTabs();
        
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
    await this.closeAllTabs();
    
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
  async closeAllTabs(): Promise<void> {
    const tabIds = Array.from(this.tabsMap.keys());
    for (const tabId of tabIds) {
      this.closeTab(tabId);
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
