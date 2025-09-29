import { contextBridge } from "electron";
import { electronAPI } from "@electron-toolkit/preload";
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
  searchBrowsingHistory: (query: string, limit?: number) => 
    electronAPI.ipcRenderer.invoke("search-browsing-history", query, limit),
  clearBrowsingHistory: () => electronAPI.ipcRenderer.invoke("clear-browsing-history"),
  removeHistoryEntry: (entryId: string) => 
    electronAPI.ipcRenderer.invoke("remove-history-entry", entryId),
  navigateFromHistory: (url: string) => 
    electronAPI.ipcRenderer.invoke("navigate-from-history", url),
  
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
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("sidebarAPI", sidebarAPI);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.sidebarAPI = sidebarAPI;
}
