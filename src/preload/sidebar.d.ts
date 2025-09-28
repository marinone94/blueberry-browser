import { ElectronAPI } from "@electron-toolkit/preload";
import type { ChatRequest, ChatResponse, TabInfo } from "./types";

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

interface SidebarAPI {
  // Chat functionality
  sendChatMessage: (request: Partial<ChatRequest>) => Promise<void>;
  clearChat: () => Promise<boolean>;
  getMessages: () => Promise<any[]>;
  onChatResponse: (callback: (data: ChatResponse) => void) => void;
  onMessagesUpdated: (callback: (messages: any[]) => void) => void;
  removeChatResponseListener: () => void;
  removeMessagesUpdatedListener: () => void;

  // Page content access
  getPageContent: () => Promise<string | null>;
  getPageText: () => Promise<string | null>;
  getCurrentUrl: () => Promise<string | null>;

  // Tab information
  getActiveTabInfo: () => Promise<TabInfo | null>;

  // User Account Management (full access needed for modals)
  getCurrentUser: () => Promise<UserAccount | null>;
  getUsers: () => Promise<UserAccount[]>;
  createUser: (userData: {name: string, email?: string, birthday?: string}) => Promise<UserAccount>;
  switchUser: (userId: string, options?: {keepCurrentTabs: boolean}) => Promise<void>;
  updateUser: (userId: string, updates: {name?: string, email?: string, birthday?: string}) => Promise<UserAccount>;
  deleteUser: (userId: string) => Promise<void>;
  getUserStats: () => Promise<UserStats>;
  
  // Listen for messages from topbar
  onTopbarMessage: (callback: (type: string, data: any) => void) => void;

  // User change events
  onUserChanged: (callback: (userData: UserData) => void) => void;
  removeUserChangedListener: () => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    sidebarAPI: SidebarAPI;
  }
}

