import { ipcMain } from "electron";
import { BaseIPCHandler } from "../../core/ipc";
import type { Window } from "../../Window";

/**
 * UserIPCHandler
 * 
 * Handles IPC for user account management including:
 * - User CRUD operations (create, read, update, delete)
 * - User switching with tab management
 * - User statistics
 * - Guest user management
 * 
 * Extracted from EventManager lines 563-645
 */
export class UserIPCHandler extends BaseIPCHandler {
  constructor(mainWindow: Window) {
    super(mainWindow);
  }

  get name(): string {
    return "users";
  }

  registerHandlers(): void {
    // ========================================================================
    // USER CRUD OPERATIONS
    // ========================================================================

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

    // ========================================================================
    // USER SWITCHING
    // ========================================================================

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

    // Save current user's tabs
    ipcMain.handle("save-current-user-tabs", async () => {
      await this.mainWindow.saveCurrentUserTabs();
      return { success: true };
    });

    // ========================================================================
    // USER STATISTICS & MANAGEMENT
    // ========================================================================

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
  }

  /**
   * Broadcast user change to all renderer processes
   */
  private broadcastUserChange(): void {
    const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
    
    // Notify topbar
    this.mainWindow.topBar.view.webContents.send("user-changed", currentUser);
    
    // Notify sidebar
    this.mainWindow.sidebar.view.webContents.send("user-changed", currentUser);
    
    // Notify all tabs
    for (const tab of this.mainWindow.allTabs) {
      tab.view.webContents.send("user-changed", currentUser);
    }
  }

  cleanup(): void {
    console.log("[UserIPCHandler] Cleaning up user account handlers...");
    
    // Remove all user-related handlers
    ipcMain.removeHandler("get-users");
    ipcMain.removeHandler("get-current-user");
    ipcMain.removeHandler("create-user");
    ipcMain.removeHandler("update-user");
    ipcMain.removeHandler("delete-user");
    ipcMain.removeHandler("switch-user");
    ipcMain.removeHandler("save-current-user-tabs");
    ipcMain.removeHandler("get-user-stats");
    ipcMain.removeHandler("reset-guest-user");
    
    console.log("[UserIPCHandler] All user account handlers cleaned up");
  }
}

