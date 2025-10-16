import { ipcMain } from "electron";
import { BaseIPCHandler } from "../../core/ipc/BaseIPCHandler";
import type { ActivityType } from "../../shared/types/ActivityTypes";

/**
 * ActivityIPCHandler - Handles all activity tracking related IPC communication.
 * 
 * This handler manages:
 * - Activity data reporting from renderer processes
 * - Activity data queries
 * - Activity data management (clearing, size checks, etc.)
 * - Chat interactions from sidebar
 * - History population from activities
 * 
 * Extracted from the monolithic EventManager for better maintainability.
 */
export class ActivityIPCHandler extends BaseIPCHandler {
  get name(): string {
    return "activity";
  }

  registerHandlers(): void {
    console.log("[ActivityIPCHandler] Registering activity tracking handlers...");

    // Handle activity reports from renderer processes (injected scripts)
    ipcMain.on('report-activity', (event, activityType: ActivityType, data: any) => {
      const webContents = event.sender;
      const tab = this.mainWindow.findTabByWebContents(webContents);
      
      if (tab) {
        // Let the tab handle the activity report
        tab.handleActivityReport(activityType, data);
      } else {
        console.warn('[ActivityIPCHandler] Activity report from unknown WebContents:', activityType);
      }
    });

    // Activity data query endpoints
    ipcMain.handle('get-activity-data', async (_, userId: string, date?: string) => {
      try {
        return await this.mainWindow.activityStorage.loadRawActivityData(userId, date);
      } catch (error) {
        console.error('[ActivityIPCHandler] Failed to load activity data:', error);
        return [];
      }
    });

    ipcMain.handle('get-activity-date-range', async (_, userId: string) => {
      try {
        return await this.mainWindow.activityStorage.getRawActivityDateRange(userId);
      } catch (error) {
        console.error('[ActivityIPCHandler] Failed to get activity date range:', error);
        return { startDate: '', endDate: '', totalDays: 0 };
      }
    });

    ipcMain.handle('clear-activity-data', async (_, userId: string, beforeDate?: string) => {
      try {
        await this.mainWindow.activityStorage.clearRawActivityData(userId, beforeDate);
        return { success: true };
      } catch (error) {
        console.error('[ActivityIPCHandler] Failed to clear activity data:', error);
        return { success: false, error: String(error) };
      }
    });

    ipcMain.handle('get-activity-data-size', async (_, userId: string) => {
      try {
        return await this.mainWindow.activityStorage.getRawActivityDataSize(userId);
      } catch (error) {
        console.error('[ActivityIPCHandler] Failed to get activity data size:', error);
        return 0;
      }
    });

    ipcMain.handle('populate-history-from-activities', async (_, userId: string) => {
      try {
        const count = await this.mainWindow.historyStorage.populateHistoryFromActivities(userId);
        return { success: true, count };
      } catch (error) {
        console.error('[ActivityIPCHandler] Failed to populate history from activities:', error);
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

    console.log('[ActivityIPCHandler] Activity tracking IPC handlers registered successfully');
  }

  cleanup(): void {
    console.log("[ActivityIPCHandler] Cleaning up activity tracking handlers...");
    
    // Remove all activity-related handlers
    ipcMain.removeHandler('get-activity-data');
    ipcMain.removeHandler('get-activity-date-range');
    ipcMain.removeHandler('clear-activity-data');
    ipcMain.removeHandler('get-activity-data-size');
    ipcMain.removeHandler('populate-history-from-activities');
    
    // Remove listeners
    ipcMain.removeAllListeners('report-activity');
    ipcMain.removeAllListeners('chat-interaction');
    
    console.log("[ActivityIPCHandler] Activity tracking handlers cleaned up");
  }
}

