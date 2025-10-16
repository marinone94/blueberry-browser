import { ipcMain } from "electron";
import { BaseIPCHandler } from "../../core/ipc";
import type { Window } from "../../Window";

/**
 * InsightsIPCHandler
 * 
 * Handles IPC for proactive insights and workflow automation including:
 * - Behavior analysis and insight generation
 * - Reminder management
 * - Workflow automation (save, execute, manage)
 * - Insight execution and tracking
 * 
 * Extracted from EventManager lines 846-1259
 */
export class InsightsIPCHandler extends BaseIPCHandler {
  constructor(mainWindow: Window) {
    super(mainWindow);
  }

  get name(): string {
    return "insights";
  }

  registerHandlers(): void {
    // ========================================================================
    // INSIGHTS ANALYSIS
    // ========================================================================

    // Analyze user behavior and generate insights
    ipcMain.handle("analyze-behavior", async () => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return [];
      
      try {
        console.log('[InsightsIPCHandler] Analyzing behavior for user:', currentUser.name);
        const insights = await this.mainWindow.proactiveInsightsManager.analyzeUserBehavior(currentUser.id);
        console.log('[InsightsIPCHandler] Generated insights:', insights.length);
        return insights;
      } catch (error) {
        console.error('[InsightsIPCHandler] Failed to analyze behavior:', error);
        return [];
      }
    });

    // Get cached insights
    ipcMain.handle("get-insights", async () => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return [];
      
      try {
        const insights = await this.mainWindow.proactiveInsightsManager.getInsights(currentUser.id);
        return insights;
      } catch (error) {
        console.error('[InsightsIPCHandler] Failed to get insights:', error);
        return [];
      }
    });

    // Check for real-time triggers
    ipcMain.handle("check-insight-triggers", async (_, currentUrl: string, recentActivitiesJson: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return [];
      
      try {
        const recentActivities = JSON.parse(recentActivitiesJson);
        const triggered = await this.mainWindow.proactiveInsightsManager.checkRealtimeTriggers(
          currentUser.id,
          currentUrl,
          recentActivities
        );
        return triggered;
      } catch (error) {
        console.error('[InsightsIPCHandler] Failed to check triggers:', error);
        return [];
      }
    });

    // ========================================================================
    // INSIGHT ACTIONS & EXECUTION
    // ========================================================================

    // Execute insight action
    ipcMain.handle("execute-insight-action", async (_, insightId: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return { success: false, error: 'No user logged in' };
      
      try {
        const insights = await this.mainWindow.proactiveInsightsManager.getInsights(currentUser.id);
        const insight = insights.find(i => i.id === insightId);
        
        if (!insight) {
          return { success: false, error: 'Insight not found' };
        }

        // Check if already completed (except for reminders)
        if (insight.status === 'completed' && insight.actionType !== 'remind') {
          return { success: false, error: 'This insight has already been completed' };
        }

        // Execute action based on type
        if (insight.actionType === 'open_urls') {
          const urls = insight.actionParams.urls as string[];
          let lastTab;
          for (const url of urls) {
            lastTab = this.mainWindow.createTab(url);
          }
          // Switch to the last opened tab
          if (lastTab) {
            this.mainWindow.switchActiveTab(lastTab.id);
          }
          
          // Mark as completed for workflow insights
          await this.mainWindow.proactiveInsightsManager.markInsightAsCompleted(currentUser.id, insightId);
          
          return { success: true, message: `Opened ${urls.length} tabs` };
        } else if (insight.actionType === 'resume_research') {
          const lastUrl = insight.actionParams.lastUrl as string | undefined;
          console.log(`[InsightsIPCHandler] Resuming research with URL: ${lastUrl}`);
          
          if (lastUrl) {
            try {
              const newTab = this.mainWindow.createTab(lastUrl);
              this.mainWindow.switchActiveTab(newTab.id);
              
              // For abandoned tasks: mark as in_progress (not completed)
              // The system will auto-detect completion based on browsing activity
              if (insight.type === 'abandoned') {
                await this.mainWindow.proactiveInsightsManager.markInsightAsInProgress(currentUser.id, insightId);
              } else {
                // For other research insights: mark as completed
                await this.mainWindow.proactiveInsightsManager.markInsightAsCompleted(currentUser.id, insightId);
              }
              
              return { success: true, message: 'Resumed where you left off' };
            } catch (error) {
              console.error('[InsightsIPCHandler] Failed to create tab:', error);
              return { success: false, error: 'Failed to create tab' };
            }
          }
          return { success: false, error: 'No URL available to resume' };
        } else if (insight.actionType === 'remind') {
          // Check if reminder with same domain, day, and hour already exists
          const existingReminders = await this.mainWindow.insightsStorage.getReminders(currentUser.id);
          
          // Extract key properties from the new reminder
          const newDomain = insight.actionParams?.domain;
          const newDayOfWeek = insight.actionParams?.dayOfWeek;
          const newHour = insight.actionParams?.hour;
          
          // Check for duplicate based on content (domain, day, hour)
          // Only consider it a duplicate if all three match
          const existingReminder = existingReminders.find(r => {
            if (r.completed) return false; // Ignore completed reminders
            
            const existingDomain = r.actionParams?.domain;
            const existingDayOfWeek = r.actionParams?.dayOfWeek;
            const existingHour = r.actionParams?.hour;
            
            // All three must match for it to be a duplicate
            return existingDomain === newDomain && 
                   existingDayOfWeek === newDayOfWeek && 
                   existingHour === newHour;
          });
          
          if (existingReminder) {
            return { success: false, error: 'A similar reminder already exists for this time and website' };
          }
          
          // Store reminder
          const reminder = {
            id: `reminder-${Date.now()}`,
            insightId: insight.id,
            userId: currentUser.id,
            title: insight.title,
            description: insight.description,
            actionParams: insight.actionParams,
            createdAt: new Date(),
            completed: false
          };
          
          await this.mainWindow.insightsStorage.saveReminder(currentUser.id, reminder);
          
          // Send success message to UI
          this.mainWindow.sidebar.view.webContents.send('reminder-set', {
            message: 'Reminder saved successfully',
            reminder
          });
          
          // Note: We don't mark reminders as acted upon, as they can be set multiple times
          
          return { success: true, message: 'Reminder set successfully' };
        }

        return { success: true, message: 'Action executed' };
      } catch (error) {
        console.error('[InsightsIPCHandler] Failed to execute insight action:', error);
        return { success: false, error: 'Failed to execute action' };
      }
    });

    // Mark insight as completed manually
    ipcMain.handle("mark-insight-completed", async (_, insightId: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return { success: false, error: 'No user logged in' };
      
      try {
        await this.mainWindow.proactiveInsightsManager.markInsightAsCompleted(currentUser.id, insightId);
        return { success: true, message: 'Insight marked as completed' };
      } catch (error) {
        console.error('[InsightsIPCHandler] Failed to mark insight as completed:', error);
        return { success: false, error: 'Failed to mark insight as completed' };
      }
    });

    // ========================================================================
    // SESSION TAB MANAGEMENT
    // ========================================================================

    // Get tabs from session IDs (for unfinished tasks)
    ipcMain.handle("get-insight-session-tabs", async (_, insightId: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return { success: false, error: 'No user logged in', tabs: [] };
      
      try {
        const insights = await this.mainWindow.proactiveInsightsManager.getInsights(currentUser.id);
        const insight = insights.find(i => i.id === insightId);
        
        if (!insight) {
          return { success: false, error: 'Insight not found', tabs: [] };
        }
        
        if (!insight.linkedSessionIds || insight.linkedSessionIds.length === 0) {
          return { success: false, error: 'No sessions linked to this insight', tabs: [] };
        }
        
        const tabs = await this.mainWindow.proactiveInsightsManager.getTabsFromSessions(
          currentUser.id, 
          insight.linkedSessionIds
        );
        
        return { success: true, tabs, totalTabs: tabs.length, openedTabs: insight.openedTabUrls || [] };
      } catch (error) {
        console.error('[InsightsIPCHandler] Failed to get session tabs:', error);
        return { success: false, error: 'Failed to get session tabs', tabs: [] };
      }
    });

    // Open a tab and track it for an insight
    ipcMain.handle("open-and-track-tab", async (_, insightId: string, url: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return { success: false, error: 'No user logged in' };
      
      try {
        // Open the tab
        const newTab = this.mainWindow.createTab(url);
        this.mainWindow.switchActiveTab(newTab.id);
        
        // Track the opened tab
        await this.mainWindow.proactiveInsightsManager.trackOpenedTab(currentUser.id, insightId, url);
        
        // Get completion percentage
        const completionPercentage = await this.mainWindow.proactiveInsightsManager.getTabCompletionPercentage(
          currentUser.id, 
          insightId
        );
        
        console.log(`[InsightsIPCHandler] Opened and tracked tab: ${url}, completion: ${(completionPercentage * 100).toFixed(1)}%`);
        
        return { success: true, message: 'Tab opened and tracked', completionPercentage };
      } catch (error) {
        console.error('[InsightsIPCHandler] Failed to open and track tab:', error);
        return { success: false, error: 'Failed to open and track tab' };
      }
    });

    // Get tab completion percentage for an insight
    ipcMain.handle("get-tab-completion-percentage", async (_, insightId: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return { success: false, error: 'No user logged in', percentage: 0 };
      
      try {
        const percentage = await this.mainWindow.proactiveInsightsManager.getTabCompletionPercentage(
          currentUser.id, 
          insightId
        );
        
        return { success: true, percentage };
      } catch (error) {
        console.error('[InsightsIPCHandler] Failed to get tab completion percentage:', error);
        return { success: false, error: 'Failed to get completion percentage', percentage: 0 };
      }
    });

    // ========================================================================
    // REMINDERS
    // ========================================================================

    // Get reminders for current user
    ipcMain.handle("get-reminders", async () => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return [];
      
      try {
        return await this.mainWindow.insightsStorage.getReminders(currentUser.id);
      } catch (error) {
        console.error('[InsightsIPCHandler] Failed to get reminders:', error);
        return [];
      }
    });

    // Complete a reminder
    ipcMain.handle("complete-reminder", async (_, reminderId: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return { success: false, error: 'No user logged in' };
      
      try {
        await this.mainWindow.insightsStorage.completeReminder(currentUser.id, reminderId);
        return { success: true };
      } catch (error) {
        console.error('[InsightsIPCHandler] Failed to complete reminder:', error);
        return { success: false, error: 'Failed to complete reminder' };
      }
    });

    // Delete a reminder
    ipcMain.handle("delete-reminder", async (_, reminderId: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return { success: false, error: 'No user logged in' };
      
      try {
        await this.mainWindow.insightsStorage.deleteReminder(currentUser.id, reminderId);
        return { success: true };
      } catch (error) {
        console.error('[InsightsIPCHandler] Failed to delete reminder:', error);
        return { success: false, error: 'Failed to delete reminder' };
      }
    });

    // Execute reminder action (open URL, etc)
    ipcMain.handle("execute-reminder-action", async (_, reminderId: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return { success: false, error: 'No user logged in' };
      
      try {
        const reminders = await this.mainWindow.insightsStorage.getReminders(currentUser.id);
        const reminder = reminders.find(r => r.id === reminderId);
        
        if (!reminder) {
          return { success: false, error: 'Reminder not found' };
        }

        // Execute the action based on action params
        if (reminder.actionParams?.domain) {
          // Temporal pattern - open the domain
          const newTab = this.mainWindow.createTab(`https://${reminder.actionParams.domain}`);
          this.mainWindow.switchActiveTab(newTab.id);
        }

        // Mark as completed
        await this.mainWindow.insightsStorage.completeReminder(currentUser.id, reminderId);
        
        return { success: true, message: 'Reminder executed' };
      } catch (error) {
        console.error('[InsightsIPCHandler] Failed to execute reminder:', error);
        return { success: false, error: 'Failed to execute reminder' };
      }
    });

    // ========================================================================
    // WORKFLOW AUTOMATION
    // ========================================================================

    // Save workflow as agent
    ipcMain.handle('workflow:save-as-agent', async (_, insightId: string, customName?: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return { success: false, error: 'No user logged in' };
      
      try {
        return await this.mainWindow.proactiveInsightsManager.saveWorkflowAsAgent(
          currentUser.id, 
          insightId, 
          customName
        );
      } catch (error) {
        console.error('[InsightsIPCHandler] Failed to save workflow as agent:', error);
        return { success: false, error: 'Failed to save workflow as agent' };
      }
    });

    // Get all saved workflows
    ipcMain.handle('workflow:get-all', async () => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return [];
      
      try {
        return await this.mainWindow.proactiveInsightsManager.getSavedWorkflows(currentUser.id);
      } catch (error) {
        console.error('[InsightsIPCHandler] Failed to get workflows:', error);
        return [];
      }
    });

    // Execute workflow
    ipcMain.handle('workflow:execute', async (_, workflowId: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return { success: false, error: 'No user logged in' };
      
      try {
        return await this.mainWindow.proactiveInsightsManager.executeWorkflow(
          currentUser.id, 
          workflowId
        );
      } catch (error) {
        console.error('[InsightsIPCHandler] Failed to execute workflow:', error);
        return { success: false, error: 'Failed to execute workflow' };
      }
    });

    // Delete workflow
    ipcMain.handle('workflow:delete', async (_, workflowId: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return { success: false, error: 'No user logged in' };
      
      try {
        return await this.mainWindow.proactiveInsightsManager.deleteWorkflow(
          currentUser.id, 
          workflowId
        );
      } catch (error) {
        console.error('[InsightsIPCHandler] Failed to delete workflow:', error);
        return { success: false, error: 'Failed to delete workflow' };
      }
    });

    // Rename workflow
    ipcMain.handle('workflow:rename', async (_, workflowId: string, newName: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return { success: false, error: 'No user logged in' };
      
      try {
        return await this.mainWindow.proactiveInsightsManager.renameWorkflow(
          currentUser.id, 
          workflowId, 
          newName
        );
      } catch (error) {
        console.error('[InsightsIPCHandler] Failed to rename workflow:', error);
        return { success: false, error: 'Failed to rename workflow' };
      }
    });
  }

  cleanup(): void {
    console.log("[InsightsIPCHandler] Cleaning up insights handlers...");
    
    // Remove all insight-related handlers
    ipcMain.removeHandler("analyze-behavior");
    ipcMain.removeHandler("get-insights");
    ipcMain.removeHandler("check-insight-triggers");
    ipcMain.removeHandler("execute-insight-action");
    ipcMain.removeHandler("mark-insight-completed");
    ipcMain.removeHandler("get-insight-session-tabs");
    ipcMain.removeHandler("open-and-track-tab");
    ipcMain.removeHandler("get-tab-completion-percentage");
    
    // Remove reminder handlers
    ipcMain.removeHandler("get-reminders");
    ipcMain.removeHandler("complete-reminder");
    ipcMain.removeHandler("delete-reminder");
    ipcMain.removeHandler("execute-reminder-action");
    
    // Remove workflow handlers
    ipcMain.removeHandler("workflow:save-as-agent");
    ipcMain.removeHandler("workflow:get-all");
    ipcMain.removeHandler("workflow:execute");
    ipcMain.removeHandler("workflow:delete");
    ipcMain.removeHandler("workflow:rename");
    
    console.log("[InsightsIPCHandler] All insights handlers cleaned up");
  }
}

