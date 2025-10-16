import { ipcMain } from "electron";
import { BaseIPCHandler } from "../../core/ipc";
import type { Window } from "../../Window";

/**
 * ContentIPCHandler
 * 
 * Handles IPC for page content extraction operations.
 * 
 * Channels:
 * - get-page-content: Returns raw HTML of current page
 * - get-page-text: Returns extracted text content of current page
 * - get-current-url: Returns URL of current page
 * 
 * Extracted from EventManager lines 516-550
 */
export class ContentIPCHandler extends BaseIPCHandler {
  constructor(mainWindow: Window) {
    super(mainWindow);
  }

  get name(): string {
    return "content";
  }

  registerHandlers(): void {
    // Get page content (raw HTML)
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

    // Get page text (extracted text content)
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

    console.log("ContentIPCHandler: Handlers registered");
  }

  cleanup(): void {
    ipcMain.removeHandler("get-page-content");
    ipcMain.removeHandler("get-page-text");
    ipcMain.removeHandler("get-current-url");

    console.log("ContentIPCHandler: Handlers cleaned up");
  }
}

