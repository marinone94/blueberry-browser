import { contextBridge } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

// Extended electronAPI with activity tracking
const extendedElectronAPI = {
  ...electronAPI,
  // Activity reporting for injected scripts
  reportActivity: (activityType: string, data: any) =>
    electronAPI.ipcRenderer.send("report-activity", activityType, data),
  // Chat interaction reporting
  reportChatInteraction: (data: {
    userMessage: string;
    contextUrl?: string;
    conversationLength: number;
    responseTime?: number;
  }) => electronAPI.ipcRenderer.send("chat-interaction", data),
};
import type { ChatRequest, ChatResponse } from "./types";

// Sidebar specific APIs
const sidebarAPI = {
  // Chat functionality
  sendChatMessage: (request: Partial<ChatRequest>) =>
    electronAPI.ipcRenderer.invoke("sidebar-chat-message", request),

  clearChat: () => electronAPI.ipcRenderer.invoke("sidebar-clear-chat"),

  getMessages: () => electronAPI.ipcRenderer.invoke("sidebar-get-messages"),

  onChatResponse: (callback: (data: ChatResponse) => void) => {
    electronAPI.ipcRenderer.on("chat-response", (_, data) => callback(data));
  },

  onMessagesUpdated: (callback: (messages: any[]) => void) => {
    electronAPI.ipcRenderer.on("chat-messages-updated", (_, messages) =>
      callback(messages)
    );
  },

  removeChatResponseListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("chat-response");
  },

  removeMessagesUpdatedListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("chat-messages-updated");
  },

  // Chat History functionality
  getChatHistory: () => electronAPI.ipcRenderer.invoke("get-chat-history"),
  getChatSessions: () => electronAPI.ipcRenderer.invoke("get-chat-sessions"),
  getSessionMessages: (sessionId: string) => electronAPI.ipcRenderer.invoke("get-session-messages", sessionId),
  createChatSession: (contextUrl?: string, title?: string) => electronAPI.ipcRenderer.invoke("create-chat-session", contextUrl, title),
  switchToSession: (sessionId: string) => electronAPI.ipcRenderer.invoke("switch-to-session", sessionId),
  deleteChatSession: (sessionId: string) => electronAPI.ipcRenderer.invoke("delete-chat-session", sessionId),
  clearChatHistory: () => electronAPI.ipcRenderer.invoke("clear-chat-history"),
  searchChatHistory: (query: string, options?: {
    exactMatch?: boolean;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  }) => electronAPI.ipcRenderer.invoke("search-chat-history", query, options),
  reindexAllChats: () => electronAPI.ipcRenderer.invoke("reindex-all-chats"),

  // Page content access
  getPageContent: () => electronAPI.ipcRenderer.invoke("get-page-content"),
  getPageText: () => electronAPI.ipcRenderer.invoke("get-page-text"),
  getCurrentUrl: () => electronAPI.ipcRenderer.invoke("get-current-url"),

  // Tab information
  getActiveTabInfo: () => electronAPI.ipcRenderer.invoke("get-active-tab-info"),

  // User Account Management (full access needed for modals)
  getCurrentUser: () => electronAPI.ipcRenderer.invoke("get-current-user"),
  getUsers: () => electronAPI.ipcRenderer.invoke("get-users"),
  createUser: (userData: {name: string, email?: string, birthday?: string}) => 
    electronAPI.ipcRenderer.invoke("create-user", userData),
  switchUser: (userId: string, options?: {keepCurrentTabs: boolean}) => 
    electronAPI.ipcRenderer.invoke("switch-user", userId, options),
  updateUser: (userId: string, updates: {name?: string, email?: string, birthday?: string}) => 
    electronAPI.ipcRenderer.invoke("update-user", userId, updates),
  deleteUser: (userId: string) => electronAPI.ipcRenderer.invoke("delete-user", userId),
  getUserStats: () => electronAPI.ipcRenderer.invoke("get-user-stats"),
  
  // History functionality
  getBrowsingHistory: () => electronAPI.ipcRenderer.invoke("get-browsing-history"),
  searchBrowsingHistory: (query: string, options?: { limit?: number; exactMatch?: boolean }) => 
    electronAPI.ipcRenderer.invoke("search-browsing-history", query, options),
  clearBrowsingHistory: () => electronAPI.ipcRenderer.invoke("clear-browsing-history"),
  removeHistoryEntry: (entryId: string) => 
    electronAPI.ipcRenderer.invoke("remove-history-entry", entryId),
  navigateFromHistory: (url: string) => 
    electronAPI.ipcRenderer.invoke("navigate-from-history", url),
  reindexBrowsingHistory: () => electronAPI.ipcRenderer.invoke("reindex-browsing-history"),

  // Activity data functionality (for future use)
  getActivityData: (userId: string, date?: string) =>
    electronAPI.ipcRenderer.invoke("get-activity-data", userId, date),
  getActivityDateRange: (userId: string) =>
    electronAPI.ipcRenderer.invoke("get-activity-date-range", userId),
  clearActivityData: (userId: string, beforeDate?: string) =>
    electronAPI.ipcRenderer.invoke("clear-activity-data", userId, beforeDate),
  getActivityDataSize: (userId: string) =>
    electronAPI.ipcRenderer.invoke("get-activity-data-size", userId),
  populateHistoryFromActivities: (userId: string) =>
    electronAPI.ipcRenderer.invoke("populate-history-from-activities", userId),
  
  // Proactive Insights functionality
  analyzeBehavior: () => electronAPI.ipcRenderer.invoke("analyze-behavior"),
  getInsights: () => electronAPI.ipcRenderer.invoke("get-insights"),
  checkInsightTriggers: (currentUrl: string, recentActivities: any[]) => 
    electronAPI.ipcRenderer.invoke("check-insight-triggers", currentUrl, JSON.stringify(recentActivities)),
  executeInsightAction: (insightId: string) => 
    electronAPI.ipcRenderer.invoke("execute-insight-action", insightId),
  markInsightCompleted: (insightId: string) => 
    electronAPI.ipcRenderer.invoke("mark-insight-completed", insightId),
  
  // Session tabs for unfinished tasks
  getInsightSessionTabs: (insightId: string) =>
    electronAPI.ipcRenderer.invoke("get-insight-session-tabs", insightId),
  openAndTrackTab: (insightId: string, url: string) =>
    electronAPI.ipcRenderer.invoke("open-and-track-tab", insightId, url),
  getTabCompletionPercentage: (insightId: string) =>
    electronAPI.ipcRenderer.invoke("get-tab-completion-percentage", insightId),
  
  // Reminders functionality
  getReminders: () => electronAPI.ipcRenderer.invoke("get-reminders"),
  completeReminder: (reminderId: string) => 
    electronAPI.ipcRenderer.invoke("complete-reminder", reminderId),
  deleteReminder: (reminderId: string) => 
    electronAPI.ipcRenderer.invoke("delete-reminder", reminderId),
  executeReminderAction: (reminderId: string) => 
    electronAPI.ipcRenderer.invoke("execute-reminder-action", reminderId),
  
  // Listen for reminder events
  onReminderSet: (callback: (data: any) => void) => {
    electronAPI.ipcRenderer.on("reminder-set", (_, data) => callback(data));
  },
  removeReminderSetListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("reminder-set");
  },
  
  // Listen for insight auto-completion events
  onInsightAutoCompleted: (callback: (data: { insightId: string; percentage: number; reason: string }) => void) => {
    electronAPI.ipcRenderer.on("insight-auto-completed", (_, data) => callback(data));
  },
  removeInsightAutoCompletedListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("insight-auto-completed");
  },
  onInsightCompletionConfirmationRequest: (callback: (data: { insightId: string; percentage: number }) => void) => {
    electronAPI.ipcRenderer.on("insight-completion-confirmation-request", (_, data) => callback(data));
  },
  removeInsightCompletionConfirmationRequestListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("insight-completion-confirmation-request");
  },
  
  // Listen for messages from topbar
  onTopbarMessage: (callback: (type: string, data: any) => void) => {
    electronAPI.ipcRenderer.on("topbar-message", (_, type, data) => callback(type, data));
  },

  // User change events
  onUserChanged: (callback: (userData: any) => void) => {
    electronAPI.ipcRenderer.on("user-changed", (_, userData) => callback(userData));
  },
  removeUserChangedListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("user-changed");
  },
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electronAPI", extendedElectronAPI);
    contextBridge.exposeInMainWorld("sidebarAPI", sidebarAPI);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electronAPI = extendedElectronAPI;
  // @ts-ignore (define in dts)
  window.sidebarAPI = sidebarAPI;
}
