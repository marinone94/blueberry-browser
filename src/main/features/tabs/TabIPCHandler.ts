import { ipcMain } from "electron";
import { BaseIPCHandler } from "../../core/ipc/BaseIPCHandler";

/**
 * TabIPCHandler - Handles all tab management related IPC communication.
 * 
 * This handler manages:
 * - Tab creation and deletion
 * - Tab switching and listing
 * - Navigation (URL loading, back/forward, reload)
 * - Tab-specific operations (screenshot, JavaScript execution)
 * - Active tab information
 * 
 * Extracted from the monolithic EventManager for better maintainability.
 */
export class TabIPCHandler extends BaseIPCHandler {
  get name(): string {
    return "tabs";
  }

  registerHandlers(): void {
    console.log("[TabIPCHandler] Registering tab management handlers...");

    // Tab lifecycle management
    ipcMain.handle("create-tab", (_, url?: string) => {
      const newTab = this.mainWindow.createTab(url);
      this.mainWindow.switchActiveTab(newTab.id);
      return { id: newTab.id, title: newTab.title, url: newTab.url };
    });

    ipcMain.handle("close-tab", (_, id: string) => {
      this.mainWindow.closeTab(id);
    });

    ipcMain.handle("switch-tab", (_, id: string) => {
      this.mainWindow.switchActiveTab(id);
    });

    ipcMain.handle("get-tabs", () => {
      const activeTabId = this.mainWindow.activeTab?.id;
      return this.mainWindow.allTabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        isActive: activeTabId === tab.id,
      }));
    });

    // Navigation handlers - Active tab
    ipcMain.handle("navigate-to", (_, url: string) => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.loadURL(url);
      }
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

    // Navigation handlers - Specific tab
    ipcMain.handle("navigate-tab", async (_, tabId: string, url: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        await tab.loadURL(url);
        return true;
      }
      return false;
    });

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

    // Tab operations
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

    // Tab information
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

    console.log("[TabIPCHandler] Tab management handlers registered successfully");
  }

  cleanup(): void {
    console.log("[TabIPCHandler] Cleaning up tab management handlers...");
    
    // Remove all tab-related handlers
    ipcMain.removeHandler("create-tab");
    ipcMain.removeHandler("close-tab");
    ipcMain.removeHandler("switch-tab");
    ipcMain.removeHandler("get-tabs");
    ipcMain.removeHandler("navigate-to");
    ipcMain.removeHandler("navigate-tab");
    ipcMain.removeHandler("go-back");
    ipcMain.removeHandler("go-forward");
    ipcMain.removeHandler("reload");
    ipcMain.removeHandler("tab-go-back");
    ipcMain.removeHandler("tab-go-forward");
    ipcMain.removeHandler("tab-reload");
    ipcMain.removeHandler("tab-screenshot");
    ipcMain.removeHandler("tab-run-js");
    ipcMain.removeHandler("get-active-tab-info");
    
    console.log("[TabIPCHandler] Tab management handlers cleaned up");
  }
}

