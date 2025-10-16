import { ipcMain } from "electron";
import { BaseIPCHandler } from "../core/ipc";
import type { Window } from "../Window";

/**
 * UIIPCHandler
 * 
 * Handles IPC for UI-related operations including:
 * - Sidebar toggling
 * - Inter-component communication (topbar <-> sidebar)
 * 
 * These are lightweight utility handlers for UI coordination.
 */
export class UIIPCHandler extends BaseIPCHandler {
  constructor(mainWindow: Window) {
    super(mainWindow);
  }

  get name(): string {
    return "ui";
  }

  registerHandlers(): void {
    // ========================================================================
    // SIDEBAR MANAGEMENT
    // ========================================================================

    // Toggle sidebar visibility
    ipcMain.handle("toggle-sidebar", () => {
      this.mainWindow.sidebar.toggle();
      this.mainWindow.updateAllBounds();
      return true;
    });

    // ========================================================================
    // INTER-COMPONENT COMMUNICATION
    // ========================================================================

    // Send message from topbar to sidebar
    ipcMain.handle("send-to-sidebar", (_, type: string, data?: any) => {
      this.mainWindow.sidebar.view.webContents.send("topbar-message", type, data);
      return { success: true };
    });

    // ========================================================================
    // DARK MODE BROADCASTING
    // ========================================================================

    // Dark mode broadcasting - when one renderer changes dark mode, notify all others
    ipcMain.on("dark-mode-changed", (event, isDarkMode: boolean) => {
      this.broadcastDarkMode(event.sender, isDarkMode);
    });
  }

  /**
   * Broadcast dark mode change to all renderer processes except the sender
   */
  private broadcastDarkMode(sender: Electron.WebContents, isDarkMode: boolean): void {
    // Send to topbar (if not the sender)
    if (this.mainWindow.topBar.view.webContents !== sender) {
      this.mainWindow.topBar.view.webContents.send("dark-mode-updated", isDarkMode);
    }

    // Send to sidebar (if not the sender)
    if (this.mainWindow.sidebar.view.webContents !== sender) {
      this.mainWindow.sidebar.view.webContents.send("dark-mode-updated", isDarkMode);
    }

    // Send to all tabs (if not the sender)
    for (const tab of this.mainWindow.allTabs) {
      if (tab.view.webContents !== sender) {
        tab.view.webContents.send("dark-mode-updated", isDarkMode);
      }
    }
  }

  cleanup(): void {
    console.log("[UIIPCHandler] Cleaning up UI handlers...");
    
    ipcMain.removeHandler("toggle-sidebar");
    ipcMain.removeHandler("send-to-sidebar");
    ipcMain.removeAllListeners("dark-mode-changed");
    
    console.log("[UIIPCHandler] All UI handlers cleaned up");
  }
}

