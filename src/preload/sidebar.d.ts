import { ElectronAPI } from "@electron-toolkit/preload";
import type { ChatRequest, ChatResponse, TabInfo } from "./types";

interface ExtendedElectronAPI extends ElectronAPI {
  reportActivity: (activityType: string, data: any) => void;
  reportChatInteraction: (data: {
    userMessage: string;
    contextUrl?: string;
    conversationLength: number;
    responseTime?: number;
  }) => void;
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

interface BrowsingHistoryEntry {
  id: string;
  url: string;
  title: string;
  visitedAt: Date;
  favicon?: string;
}

interface UserData {
  currentUser: UserAccount | null;
  allUsers: UserAccount[];
  userStats: UserStats;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string | any[];
  timestamp: Date;
  contextUrl?: string;
  contextTitle?: string;
  sessionId: string;
  responseTime?: number;
  messageIndex: number;
  source: 'user' | 'assistant' | 'system';
}

interface ChatSession {
  id: string;
  userId: string;
  title: string;
  startedAt: Date;
  lastMessageAt: Date;
  lastActiveAt: Date;
  messageCount: number;
  contextUrls: string[];
  totalResponseTime: number;
  averageResponseTime: number;
}

interface ChatHistory {
  sessions: ChatSession[];
  messages: ChatMessage[];
  currentSessionId: string | null;
  totalConversations: number;
  totalMessages: number;
  createdAt: Date;
  updatedAt: Date;
}

interface ProactiveInsight {
  id: string;
  userId: string;
  type: 'workflow' | 'research' | 'abandoned' | 'habit';
  title: string;
  description: string;
  actionType: 'open_urls' | 'resume_research' | 'remind' | 'create_workflow';
  actionParams: any;
  patterns: any[];
  relevanceScore: number;
  createdAt: string;  // ISO date string (serialized by IPC)
  triggeredAt?: string;  // ISO date string (serialized by IPC)
  
  // Status tracking
  status: 'pending' | 'in_progress' | 'completed';
  
  // Legacy support (deprecated)
  actedUpon?: boolean;
  actedUponAt?: string;  // ISO date string (serialized by IPC)
  
  // Progress tracking for abandoned tasks
  lastResumedAt?: string;  // ISO date string (serialized by IPC)
  linkedSessionIds?: string[];  // Track all sessions related to this insight
  completionProgress?: number;  // 0.0 - 1.0
  
  // Tracking for tab reopening
  openedTabUrls?: string[];  // URLs that were reopened by the user
}

interface SavedWorkflow {
  id: string;
  userId: string;
  name: string;
  description: string;
  createdAt: string;  // ISO date string (serialized by IPC)
  createdFrom: string;
  steps: Array<{
    url: string;
    title: string;
    category: string;
    subcategory: string;
  }>;
  lastUsed: string | null;  // ISO date string (serialized by IPC)
  useCount: number;
  isPinned?: boolean;
  tags?: string[];
}

interface SessionTab {
  url: string;
  title: string;
  timestamp: string;
  sessionId: string;
}

interface Reminder {
  id: string;
  insightId: string;
  userId: string;
  title: string;
  description: string;
  actionParams: any;
  createdAt: string;
  completed: boolean;
  completedAt?: string;
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

  // Chat History functionality
  getChatHistory: () => Promise<ChatHistory>;
  getChatSessions: () => Promise<ChatSession[]>;
  getSessionMessages: (sessionId: string) => Promise<ChatMessage[]>;
  createChatSession: (contextUrl?: string, title?: string) => Promise<string>;
  switchToSession: (sessionId: string) => Promise<void>;
  deleteChatSession: (sessionId: string) => Promise<void>;
  clearChatHistory: () => Promise<void>;
  searchChatHistory: (query: string, options?: {
    exactMatch?: boolean;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  }) => Promise<ChatSession[]>;
  reindexAllChats: () => Promise<{success: boolean, error?: string}>;

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
  
  // History functionality
  getBrowsingHistory: () => Promise<BrowsingHistoryEntry[]>;
  searchBrowsingHistory: (query: string, options?: {limit?: number, exactMatch?: boolean}) => Promise<BrowsingHistoryEntry[]>;
  clearBrowsingHistory: () => Promise<{success: boolean, error?: string}>;
  removeHistoryEntry: (entryId: string) => Promise<{success: boolean, error?: string}>;
  navigateFromHistory: (url: string) => Promise<{id: string, title: string, url: string, wasExisting: boolean}>;
  reindexBrowsingHistory: () => Promise<{success: boolean, indexed: number, skipped: number, alreadyIndexed: number, errors: number, error?: string}>;

  // Activity data functionality (for future use)
  getActivityData: (userId: string, date?: string) => Promise<any[]>;
  getActivityDateRange: (userId: string) => Promise<{startDate: string, endDate: string, totalDays: number}>;
  clearActivityData: (userId: string, beforeDate?: string) => Promise<{success: boolean, error?: string}>;
  getActivityDataSize: (userId: string) => Promise<number>;
  populateHistoryFromActivities: (userId: string) => Promise<{success: boolean, count?: number, error?: string}>;
  
  // Proactive Insights functionality
  analyzeBehavior: () => Promise<ProactiveInsight[]>;
  getInsights: () => Promise<ProactiveInsight[]>;
  checkInsightTriggers: (currentUrl: string, recentActivities: any[]) => Promise<ProactiveInsight[]>;
  executeInsightAction: (insightId: string) => Promise<{success: boolean, message?: string, error?: string}>;
  markInsightCompleted: (insightId: string) => Promise<{success: boolean, message?: string, error?: string}>;
  
  // Session tabs for unfinished tasks
  getInsightSessionTabs: (insightId: string) => Promise<{success: boolean, tabs: SessionTab[], totalTabs: number, openedTabs: string[], error?: string}>;
  openAndTrackTab: (insightId: string, url: string) => Promise<{success: boolean, message?: string, completionPercentage?: number, error?: string}>;
  getTabCompletionPercentage: (insightId: string) => Promise<{success: boolean, percentage: number, error?: string}>;
  
  // Reminders functionality
  getReminders: () => Promise<Reminder[]>;
  completeReminder: (reminderId: string) => Promise<{success: boolean, error?: string}>;
  deleteReminder: (reminderId: string) => Promise<{success: boolean, error?: string}>;
  executeReminderAction: (reminderId: string) => Promise<{success: boolean, message?: string, error?: string}>;
  onReminderSet: (callback: (data: any) => void) => void;
  removeReminderSetListener: () => void;
  
  // Workflow automation
  saveWorkflowAsAgent: (insightId: string, customName?: string) => Promise<{success: boolean, workflow?: SavedWorkflow, error?: string}>;
  getSavedWorkflows: () => Promise<SavedWorkflow[]>;
  executeWorkflow: (workflowId: string) => Promise<{success: boolean, message?: string, error?: string}>;
  deleteWorkflow: (workflowId: string) => Promise<{success: boolean, error?: string}>;
  renameWorkflow: (workflowId: string, newName: string) => Promise<{success: boolean, error?: string}>;
  
  // Listen for insight auto-completion events
  onInsightAutoCompleted: (callback: (data: { insightId: string; percentage: number; reason: string }) => void) => void;
  removeInsightAutoCompletedListener: () => void;
  onInsightCompletionConfirmationRequest: (callback: (data: { insightId: string; percentage: number }) => void) => void;
  removeInsightCompletionConfirmationRequestListener: () => void;
  
  // Listen for messages from topbar
  onTopbarMessage: (callback: (type: string, data: any) => void) => void;

  // User change events
  onUserChanged: (callback: (userData: UserData) => void) => void;
  removeUserChangedListener: () => void;
}

declare global {
  interface Window {
    electronAPI: ExtendedElectronAPI;
    sidebarAPI: SidebarAPI;
  }
}

