import { app } from "electron";
import { join, dirname } from "path";
import { promises as fs } from "fs";
import type { CoreMessage } from "ai";
import type { RawActivityData } from "./ActivityTypes";

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

  // ============================================================================
  // RAW ACTIVITY DATA MANAGEMENT
  // ============================================================================

  /**
   * Save raw activity data to daily files
   */
  async saveRawActivityData(userId: string, activities: RawActivityData[]): Promise<void> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const filePath = this.getRawActivityFilePath(userId, today);
    
    try {
      // Load existing data for today
      let existingData: RawActivityData[] = [];
      try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        existingData = JSON.parse(fileContent);
      } catch {
        // File doesn't exist yet, start with empty array
      }

      // Append new activities
      existingData.push(...activities);

      // Ensure directory exists
      await this.ensureDirectoryExists(dirname(filePath));

      // Save back to file
      await fs.writeFile(filePath, JSON.stringify(existingData, null, 2));

    } catch (error) {
      console.error(`Failed to save raw activity data for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Load raw activity data for a specific date
   */
  async loadRawActivityData(userId: string, date?: string): Promise<RawActivityData[]> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const filePath = this.getRawActivityFilePath(userId, targetDate);
    
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(fileContent);
      
      // Convert timestamp strings back to Date objects
      return data.map((activity: any) => ({
        ...activity,
        timestamp: new Date(activity.timestamp)
      }));
    } catch {
      return []; // Return empty array if file doesn't exist
    }
  }

  /**
   * Get date range of available activity data
   */
  async getRawActivityDateRange(userId: string): Promise<{ startDate: string; endDate: string; totalDays: number }> {
    const rawDataDir = this.getRawActivityDir(userId);
    
    try {
      const files = await fs.readdir(rawDataDir);
      const dateFiles = files
        .filter(f => f.endsWith('.json') && /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .map(f => f.replace('.json', ''))
        .sort();

      if (dateFiles.length === 0) {
        return { startDate: '', endDate: '', totalDays: 0 };
      }

      return {
        startDate: dateFiles[0],
        endDate: dateFiles[dateFiles.length - 1],
        totalDays: dateFiles.length
      };
    } catch {
      return { startDate: '', endDate: '', totalDays: 0 };
    }
  }

  /**
   * Clear raw activity data before a specific date
   */
  async clearRawActivityData(userId: string, beforeDate?: string): Promise<void> {
    const rawDataDir = this.getRawActivityDir(userId);
    
    try {
      const files = await fs.readdir(rawDataDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const fileDate = file.replace('.json', '');
          
          if (!beforeDate || fileDate < beforeDate) {
            await fs.unlink(join(rawDataDir, file));
          }
        }
      }
    } catch (error) {
      console.error(`Failed to clear raw activity data for user ${userId}:`, error);
    }
  }

  /**
   * Get total size of raw activity data for a user
   */
  async getRawActivityDataSize(userId: string): Promise<number> {
    const rawDataDir = this.getRawActivityDir(userId);
    
    try {
      const files = await fs.readdir(rawDataDir);
      let totalSize = 0;
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const stats = await fs.stat(join(rawDataDir, file));
          totalSize += stats.size;
        }
      }
      
      return totalSize;
    } catch {
      return 0;
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS FOR RAW ACTIVITY DATA
  // ============================================================================

  private getRawActivityDir(userId: string): string {
    return join(this.getUserDataPath(userId), 'raw-activity');
  }

  private getRawActivityFilePath(userId: string, date: string): string {
    return join(this.getRawActivityDir(userId), `${date}.json`);
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      // Directory might already exist, ignore error
    }
  }
}
