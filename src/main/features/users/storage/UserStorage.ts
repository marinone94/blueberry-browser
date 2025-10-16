import { BaseStorage } from "../../../core/storage";
import { join } from "path";
import { promises as fs } from "fs";

/**
 * User preferences
 */
export interface UserPreferences {
  darkMode: boolean;
  defaultSearchEngine: string;
  homePage: string;
  // More preferences to be defined later
}

/**
 * User tab state
 */
export interface UserTabState {
  id: string;
  url: string;
  title: string;
  isActive: boolean;
  scrollPosition?: number;
  // More tab state to be defined later
}

/**
 * Behavioral profile
 */
export interface BehavioralProfile {
  frequentSites: Array<{ url: string; visits: number }>;
  searchPatterns: string[];
  activeHours: Array<{ hour: number; activity: number }>;
  // More behavioral data to be defined later
}

/**
 * Storage for user-specific data.
 * Manages preferences, tab states, and behavioral profiles.
 */
export class UserStorage extends BaseStorage {
  private readonly preferencesFilename = "preferences.json";
  private readonly tabsFilename = "tabs.json";
  private readonly behavioralProfileFilename = "behavioral-profile.json";

  /**
   * User Preferences Management
   */
  async savePreferences(userId: string, preferences: UserPreferences): Promise<void> {
    await this.saveUserFile(userId, this.preferencesFilename, preferences);
  }

  async loadPreferences(userId: string): Promise<UserPreferences> {
    return await this.loadUserFile<UserPreferences>(
      userId,
      this.preferencesFilename,
      {
        darkMode: false,
        defaultSearchEngine: "https://www.google.com/search?q=",
        homePage: "https://www.google.com"
      }
    );
  }

  /**
   * Tab State Management
   */
  async saveUserTabs(userId: string, tabs: UserTabState[]): Promise<void> {
    await this.saveUserFile(userId, this.tabsFilename, tabs);
  }

  async loadUserTabs(userId: string): Promise<UserTabState[]> {
    return await this.loadUserFile<UserTabState[]>(userId, this.tabsFilename, []);
  }

  async clearUserTabs(userId: string): Promise<void> {
    await this.saveUserTabs(userId, []);
  }

  /**
   * Behavioral Profile Management
   */
  async saveBehavioralProfile(userId: string, profile: BehavioralProfile): Promise<void> {
    await this.saveUserFile(userId, this.behavioralProfileFilename, profile);
  }

  async loadBehavioralProfile(userId: string): Promise<BehavioralProfile> {
    return await this.loadUserFile<BehavioralProfile>(
      userId,
      this.behavioralProfileFilename,
      {
        frequentSites: [],
        searchPatterns: [],
        activeHours: []
      }
    );
  }

  /**
   * Clear all data for a user
   * NOTE: This only clears user-specific files managed by UserStorage.
   * For complete user data deletion, all storage classes should be involved.
   */
  async clearUserData(userId: string): Promise<void> {
    const userDir = this.getUserDataPath(userId);
    
    try {
      await fs.rm(userDir, { recursive: true, force: true });
      console.log(`UserStorage: Cleared all data for user ${userId}`);
    } catch (error) {
      console.error(`UserStorage: Failed to clear data for user ${userId}:`, error);
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
   * Calculates size of all files in user directory
   */
  async getUserDataSize(userId: string): Promise<number> {
    const userDir = this.getUserDataPath(userId);
    
    try {
      const files = await this.readDirectory(userDir);
      let totalSize = 0;
      
      for (const file of files) {
        const filePath = join(userDir, file);
        totalSize += await this.getFileSize(filePath);
      }
      
      return totalSize;
    } catch {
      return 0;
    }
  }

  /**
   * Get detailed user data size breakdown by category
   */
  async getUserDataSizeDetailed(userId: string): Promise<{
    total: number;
    preferences: number;
    tabs: number;
    behavioralProfile: number;
  }> {
    const userDir = this.getUserDataPath(userId);
    
    try {
      return {
        total: await this.getUserDataSize(userId),
        preferences: await this.getFileSize(join(userDir, this.preferencesFilename)),
        tabs: await this.getFileSize(join(userDir, this.tabsFilename)),
        behavioralProfile: await this.getFileSize(join(userDir, this.behavioralProfileFilename))
      };
    } catch {
      return {
        total: 0,
        preferences: 0,
        tabs: 0,
        behavioralProfile: 0
      };
    }
  }
}

