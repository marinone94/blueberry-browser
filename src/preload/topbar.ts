import { contextBridge } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

// TopBar specific APIs
const topBarAPI = {
  // Tab management
  createTab: (url?: string) =>
    electronAPI.ipcRenderer.invoke("create-tab", url),
  closeTab: (tabId: string) =>
    electronAPI.ipcRenderer.invoke("close-tab", tabId),
  switchTab: (tabId: string) =>
    electronAPI.ipcRenderer.invoke("switch-tab", tabId),
  getTabs: () => electronAPI.ipcRenderer.invoke("get-tabs"),

  // Tab navigation
  navigateTab: (tabId: string, url: string) =>
    electronAPI.ipcRenderer.invoke("navigate-tab", tabId, url),
  goBack: (tabId: string) =>
    electronAPI.ipcRenderer.invoke("tab-go-back", tabId),
  goForward: (tabId: string) =>
    electronAPI.ipcRenderer.invoke("tab-go-forward", tabId),
  reload: (tabId: string) =>
    electronAPI.ipcRenderer.invoke("tab-reload", tabId),

  // Tab actions
  tabScreenshot: (tabId: string) =>
    electronAPI.ipcRenderer.invoke("tab-screenshot", tabId),
  tabRunJs: (tabId: string, code: string) =>
    electronAPI.ipcRenderer.invoke("tab-run-js", tabId, code),

  // Sidebar
  toggleSidebar: () =>
    electronAPI.ipcRenderer.invoke("toggle-sidebar"),

  // User Account Management
  getUsers: () => electronAPI.ipcRenderer.invoke("get-users"),
  getCurrentUser: () => electronAPI.ipcRenderer.invoke("get-current-user"),
  createUser: (userData: {name: string, email?: string, birthday?: string}) =>
    electronAPI.ipcRenderer.invoke("create-user", userData),
  switchUser: (userId: string, options?: {keepCurrentTabs: boolean}) =>
    electronAPI.ipcRenderer.invoke("switch-user", userId, options),
  updateUser: (userId: string, updates: {name?: string, email?: string, birthday?: string}) =>
    electronAPI.ipcRenderer.invoke("update-user", userId, updates),
  deleteUser: (userId: string) =>
    electronAPI.ipcRenderer.invoke("delete-user", userId),
  getUserStats: () => electronAPI.ipcRenderer.invoke("get-user-stats"),
  resetGuestUser: () => electronAPI.ipcRenderer.invoke("reset-guest-user"),
  saveCurrentUserTabs: () => electronAPI.ipcRenderer.invoke("save-current-user-tabs"),

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
    contextBridge.exposeInMainWorld("topBarAPI", topBarAPI);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.topBarAPI = topBarAPI;
}

