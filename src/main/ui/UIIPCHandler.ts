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
  }

  cleanup(): void {
    console.log("[UIIPCHandler] Cleaning up UI handlers...");
    
    ipcMain.removeHandler("toggle-sidebar");
    ipcMain.removeHandler("send-to-sidebar");
    
    console.log("[UIIPCHandler] All UI handlers cleaned up");
  }
}

