import { BaseStorage } from "../../../core/storage";
import { join, dirname } from "path";
import type { RawActivityData } from "../../../shared/types/ActivityTypes";

/**
 * Storage for raw activity data.
 * Stores activities in daily files (YYYY-MM-DD.json format) for efficient access.
 */
export class ActivityStorage extends BaseStorage {

  /**
   * Get the raw activity directory for a user
   */
  private getRawActivityDir(userId: string): string {
    return join(this.getUserDataPath(userId), 'raw-activity');
  }

  /**
   * Get the file path for a specific date's activity data
   */
  private getRawActivityFilePath(userId: string, date: string): string {
    return join(this.getRawActivityDir(userId), `${date}.json`);
  }

  /**
   * Save raw activity data to daily files
   * Appends new activities to existing data for the current day
   */
  async saveRawActivityData(userId: string, activities: RawActivityData[]): Promise<void> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const filePath = this.getRawActivityFilePath(userId, today);
    
    try {
      // Load existing data for today
      let existingData: RawActivityData[] = [];
      try {
        const fileContent = await this.readText(filePath);
        if (fileContent) {
          existingData = JSON.parse(fileContent);
        }
      } catch {
        // File doesn't exist yet, start with empty array
      }

      // Append new activities
      existingData.push(...activities);

      // Ensure directory exists
      await this.ensureDirectoryExists(dirname(filePath));

      // Save back to file
      await this.writeText(filePath, JSON.stringify(existingData, null, 2));

      console.log(`ActivityStorage: Saved ${activities.length} activities for user ${userId} on ${today}`);
    } catch (error) {
      console.error(`ActivityStorage: Failed to save raw activity data for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Load raw activity data for a specific date
   * Returns empty array if no data exists for that date
   */
  async loadRawActivityData(userId: string, date?: string): Promise<RawActivityData[]> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const filePath = this.getRawActivityFilePath(userId, targetDate);
    
    try {
      const fileContent = await this.readText(filePath);
      if (!fileContent) {
        return [];
      }
      
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
   * Load raw activity data for a date range
   * Returns activities sorted by timestamp
   */
  async loadRawActivityDataRange(userId: string, startDate: string, endDate: string): Promise<RawActivityData[]> {
    const rawDataDir = this.getRawActivityDir(userId);
    
    try {
      const files = await this.readDirectory(rawDataDir);
      const dateFiles = files
        .filter(f => f.endsWith('.json') && /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .map(f => f.replace('.json', ''))
        .filter(date => date >= startDate && date <= endDate)
        .sort();

      const allActivities: RawActivityData[] = [];

      for (const date of dateFiles) {
        const activities = await this.loadRawActivityData(userId, date);
        allActivities.push(...activities);
      }

      // Sort by timestamp
      allActivities.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      return allActivities;
    } catch (error) {
      console.error(`ActivityStorage: Error loading activity range:`, error);
      return [];
    }
  }

  /**
   * Get date range of available activity data
   * Returns start date, end date, and total number of days with data
   */
  async getRawActivityDateRange(userId: string): Promise<{ startDate: string; endDate: string; totalDays: number }> {
    const rawDataDir = this.getRawActivityDir(userId);
    
    try {
      const files = await this.readDirectory(rawDataDir);
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
   * If no date provided, clears all activity data
   */
  async clearRawActivityData(userId: string, beforeDate?: string): Promise<void> {
    const rawDataDir = this.getRawActivityDir(userId);
    
    try {
      const files = await this.readDirectory(rawDataDir);
      
      let deletedCount = 0;
      for (const file of files) {
        if (file.endsWith('.json')) {
          const fileDate = file.replace('.json', '');
          
          if (!beforeDate || fileDate < beforeDate) {
            await this.deleteUserFile(userId, join('raw-activity', file));
            deletedCount++;
          }
        }
      }

      console.log(`ActivityStorage: Cleared ${deletedCount} activity files for user ${userId}`);
    } catch (error) {
      console.error(`ActivityStorage: Failed to clear raw activity data for user ${userId}:`, error);
    }
  }

  /**
   * Get total size of raw activity data for a user (in bytes)
   */
  async getRawActivityDataSize(userId: string): Promise<number> {
    const rawDataDir = this.getRawActivityDir(userId);
    
    try {
      const files = await this.readDirectory(rawDataDir);
      let totalSize = 0;
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = join(rawDataDir, file);
          totalSize += await this.getFileSize(filePath);
        }
      }
      
      return totalSize;
    } catch {
      return 0;
    }
  }

  /**
   * Get activity count for a specific date
   */
  async getActivityCountForDate(userId: string, date: string): Promise<number> {
    const activities = await this.loadRawActivityData(userId, date);
    return activities.length;
  }

  /**
   * Get all available activity dates
   */
  async getActivityDates(userId: string): Promise<string[]> {
    const rawDataDir = this.getRawActivityDir(userId);
    
    try {
      const files = await this.readDirectory(rawDataDir);
      return files
        .filter(f => f.endsWith('.json') && /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .map(f => f.replace('.json', ''))
        .sort();
    } catch {
      return [];
    }
  }

  /**
   * Check if activity data exists for a specific date
   */
  async hasActivityDataForDate(userId: string, date: string): Promise<boolean> {
    const filePath = this.getRawActivityFilePath(userId, date);
    const fileContent = await this.readText(filePath);
    return fileContent !== null;
  }
}

