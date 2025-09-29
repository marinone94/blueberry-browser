import { app } from "electron";
import { join } from "path";
import { promises as fs } from "fs";
import type { CoreMessage } from "ai";

// Dummy interfaces for future implementation
export interface UserPreferences {
  darkMode: boolean;
  defaultSearchEngine: string;
  homePage: string;
  // More preferences to be defined later
}

export interface BrowsingHistoryEntry {
  id: string;
  url: string;
  title: string;
  visitedAt: Date;
  favicon?: string;
  // More fields to be defined later
}

export interface BehavioralProfile {
  frequentSites: Array<{ url: string; visits: number }>;
  searchPatterns: string[];
  activeHours: Array<{ hour: number; activity: number }>;
  // More behavioral data to be defined later
}

export interface UserTabState {
  id: string;
  url: string;
  title: string;
  isActive: boolean;
  scrollPosition?: number;
  // More tab state to be defined later
}

/**
 * Manages user-specific data persistence and file system operations.
 * Each user gets isolated data storage for complete privacy.
 */
export class UserDataManager {
  private readonly userDataPath: string;
  private readonly usersDir: string;
  private readonly maxHistoryEntries: number = 1000;

  constructor() {
    this.userDataPath = app.getPath("userData");
    this.usersDir = join(this.userDataPath, "users");
    this.ensureDirectoriesExist();
  }

  /**
   * Ensure required directories exist
   */
  private async ensureDirectoriesExist(): Promise<void> {
    try {
      await fs.mkdir(this.usersDir, { recursive: true });
      await fs.mkdir(join(this.usersDir, "user-data"), { recursive: true });
    } catch (error) {
      console.error("Failed to create user directories:", error);
    }
  }

  /**
   * Get the data directory path for a specific user
   */
  private getUserDataPath(userId: string): string {
    return join(this.usersDir, "user-data", userId);
  }

  /**
   * Ensure user data directory exists
   */
  private async ensureUserDataDir(userId: string): Promise<void> {
    const userDir = this.getUserDataPath(userId);
    try {
      await fs.mkdir(userDir, { recursive: true });
    } catch (error) {
      console.error(`Failed to create user directory for ${userId}:`, error);
    }
  }

  /**
   * Save data to a user-specific file
   */
  private async saveUserFile<T>(userId: string, filename: string, data: T): Promise<void> {
    await this.ensureUserDataDir(userId);
    const filePath = join(this.getUserDataPath(userId), filename);
    
    try {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (error) {
      console.error(`Failed to save ${filename} for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Load data from a user-specific file
   */
  private async loadUserFile<T>(userId: string, filename: string, defaultValue: T): Promise<T> {
    const filePath = join(this.getUserDataPath(userId), filename);
    
    try {
      const data = await fs.readFile(filePath, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is corrupted, return default
      return defaultValue;
    }
  }

  /**
   * Chat History Management
   */
  async saveChatHistory(userId: string, messages: CoreMessage[]): Promise<void> {
    await this.saveUserFile(userId, "chat-history.json", messages);
  }

  async loadChatHistory(userId: string): Promise<CoreMessage[]> {
    return await this.loadUserFile(userId, "chat-history.json", []);
  }

  async clearChatHistory(userId: string): Promise<void> {
    await this.saveChatHistory(userId, []);
  }

  /**
   * Tab State Management
   */
  async saveUserTabs(userId: string, tabs: UserTabState[]): Promise<void> {
    await this.saveUserFile(userId, "tabs.json", tabs);
  }

  async loadUserTabs(userId: string): Promise<UserTabState[]> {
    return await this.loadUserFile(userId, "tabs.json", []);
  }

  async clearUserTabs(userId: string): Promise<void> {
    await this.saveUserTabs(userId, []);
  }

  /**
   * User Preferences Management
   */
  async savePreferences(userId: string, preferences: UserPreferences): Promise<void> {
    await this.saveUserFile(userId, "preferences.json", preferences);
  }

  async loadPreferences(userId: string): Promise<UserPreferences> {
    return await this.loadUserFile(userId, "preferences.json", {
      darkMode: false,
      defaultSearchEngine: "https://www.google.com/search?q=",
      homePage: "https://www.google.com"
    });
  }

  /**
   * Browsing History Management
   */
  async addHistoryEntry(userId: string, entry: Omit<BrowsingHistoryEntry, 'id'>): Promise<void> {
    const history = await this.loadBrowsingHistory(userId);
    
    // Check if URL already exists in recent history (within last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const existingIndex = history.findIndex(h => 
      h.url === entry.url && new Date(h.visitedAt) > oneHourAgo
    );
    
    if (existingIndex >= 0) {
      // Update existing entry with new timestamp
      history[existingIndex].visitedAt = entry.visitedAt;
      history[existingIndex].title = entry.title; // Update title in case it changed
    } else {
      // Add new entry
      const newEntry: BrowsingHistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ...entry
      };
      history.unshift(newEntry); // Add to beginning
    }
    
    // Keep only last maxHistoryEntries entries
    if (this.maxHistoryEntries && history.length > this.maxHistoryEntries) {
      history.splice(this.maxHistoryEntries);
    }
    
    await this.saveBrowsingHistory(userId, history);
  }

  async saveBrowsingHistory(userId: string, history: BrowsingHistoryEntry[]): Promise<void> {
    await this.saveUserFile(userId, "browsing-history.json", history);
  }

  async loadBrowsingHistory(userId: string): Promise<BrowsingHistoryEntry[]> {
    return await this.loadUserFile(userId, "browsing-history.json", []);
  }

  async clearBrowsingHistory(userId: string): Promise<void> {
    await this.saveBrowsingHistory(userId, []);
  }

  async removeHistoryEntry(userId: string, entryId: string): Promise<void> {
    const history = await this.loadBrowsingHistory(userId);
    const filteredHistory = history.filter(entry => entry.id !== entryId);
    await this.saveBrowsingHistory(userId, filteredHistory);
  }

  async searchHistory(userId: string, query: string, limit: number = 50): Promise<BrowsingHistoryEntry[]> {
    const history = await this.loadBrowsingHistory(userId);
    const searchTerm = query.toLowerCase();
    
    return history
      .filter(entry => 
        entry.title.toLowerCase().includes(searchTerm) || 
        entry.url.toLowerCase().includes(searchTerm)
      )
      .slice(0, limit);
  }

  /**
   * Behavioral Profile Management (dummy implementation for now)
   */
  async saveBehavioralProfile(userId: string, profile: BehavioralProfile): Promise<void> {
    await this.saveUserFile(userId, "behavioral-profile.json", profile);
  }

  async loadBehavioralProfile(userId: string): Promise<BehavioralProfile> {
    return await this.loadUserFile(userId, "behavioral-profile.json", {
      frequentSites: [],
      searchPatterns: [],
      activeHours: []
    });
  }

  /**
   * Clear all data for a user
   */
  async clearUserData(userId: string): Promise<void> {
    const userDir = this.getUserDataPath(userId);
    
    try {
      await fs.rm(userDir, { recursive: true, force: true });
    } catch (error) {
      console.error(`Failed to clear data for user ${userId}:`, error);
    }
  }

  /**
   * Check if user has any data
   */
  async hasUserData(userId: string): Promise<boolean> {
    const userDir = this.getUserDataPath(userId);
    
    try {
      await fs.access(userDir);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get user data size in bytes
   */
  async getUserDataSize(userId: string): Promise<number> {
    const userDir = this.getUserDataPath(userId);
    
    try {
      const files = await fs.readdir(userDir);
      let totalSize = 0;
      
      for (const file of files) {
        const stats = await fs.stat(join(userDir, file));
        totalSize += stats.size;
      }
      
      return totalSize;
    } catch {
      return 0;
    }
  }
}
