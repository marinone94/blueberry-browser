import { ElectronAPI } from "@electron-toolkit/preload";
import type { TabInfo } from "./types";

interface ExtendedElectronAPI extends ElectronAPI {
  reportActivity: (activityType: string, data: any) => void;
}

interface UserAccount {
  id: string;
  name: string;
  email: string;
  birthday?: string;
  createdAt: Date;
  lastActiveAt: Date;
  sessionPartition: string;
  isGuest: boolean;
}

interface UserStats {
  totalUsers: number;
  nonGuestUsers: number;
  currentUser: string | null;
  maxUsers: number;
  hasGuestUser: boolean;
}

interface UserData {
  currentUser: UserAccount | null;
  allUsers: UserAccount[];
  userStats: UserStats;
}

interface TopBarAPI {
  // Tab management
  createTab: (
    url?: string
  ) => Promise<{ id: string; title: string; url: string } | null>;
  closeTab: (tabId: string) => Promise<boolean>;
  switchTab: (tabId: string) => Promise<boolean>;
  getTabs: () => Promise<TabInfo[]>;

  // Tab navigation
  navigateTab: (tabId: string, url: string) => Promise<void>;
  goBack: (tabId: string) => Promise<void>;
  goForward: (tabId: string) => Promise<void>;
  reload: (tabId: string) => Promise<void>;

  // Tab actions
  tabScreenshot: (tabId: string) => Promise<string | null>;
  tabRunJs: (tabId: string, code: string) => Promise<any>;

  // Sidebar
  toggleSidebar: () => Promise<void>;

  // User Account Management
  getUsers: () => Promise<UserAccount[]>;
  getCurrentUser: () => Promise<UserAccount | null>;
  createUser: (userData: {name: string, email?: string, birthday?: string}) => Promise<{success: boolean, user?: UserAccount, error?: string}>;
  switchUser: (userId: string, options?: {keepCurrentTabs: boolean}) => Promise<{success: boolean, error?: string}>;
  updateUser: (userId: string, updates: {name?: string, email?: string, birthday?: string}) => Promise<{success: boolean, user?: UserAccount, error?: string}>;
  deleteUser: (userId: string) => Promise<{success: boolean, error?: string}>;
  getUserStats: () => Promise<UserStats>;
  resetGuestUser: () => Promise<{success: boolean}>;
  saveCurrentUserTabs: () => Promise<{success: boolean}>;
  
  // Communication with sidebar
  sendToSidebar: (type: string, data?: any) => Promise<{success: boolean}>;
  
  // User change events
  onUserChanged: (callback: (userData: UserData) => void) => void;
  removeUserChangedListener: () => void;
}

declare global {
  interface Window {
    electronAPI: ExtendedElectronAPI;
    topBarAPI: TopBarAPI;
  }
}

