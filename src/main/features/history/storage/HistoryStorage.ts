import { BaseStorage } from "../../../core/storage";
import type { RawActivityData } from "../../../shared/types/ActivityTypes";
import { join } from "path";

/**
 * Browsing history entry
 */
export interface BrowsingHistoryEntry {
  id: string;
  url: string;
  title: string;
  visitedAt: Date;
  favicon?: string;
  analysisId?: string; // Link to content analysis for semantic search
}

/**
 * Storage for browsing history.
 * Manages user's browsing history with search and analysis linking.
 */
export class HistoryStorage extends BaseStorage {
  private readonly maxHistoryEntries: number = 1000;
  private readonly historyFilename = "browsing-history.json";

  /**
   * Save browsing history
   */
  async saveBrowsingHistory(userId: string, history: BrowsingHistoryEntry[]): Promise<void> {
    await this.saveUserFile(userId, this.historyFilename, history);
  }

  /**
   * Load browsing history
   */
  async loadBrowsingHistory(userId: string): Promise<BrowsingHistoryEntry[]> {
    const history = await this.loadUserFile<BrowsingHistoryEntry[]>(
      userId,
      this.historyFilename,
      []
    );
    
    // Convert date strings back to Date objects
    return history.map(entry => ({
      ...entry,
      visitedAt: new Date(entry.visitedAt)
    }));
  }

  /**
   * Clear all browsing history
   */
  async clearBrowsingHistory(userId: string): Promise<void> {
    await this.saveBrowsingHistory(userId, []);
  }

  /**
   * Add a history entry
   */
  async addHistoryEntry(userId: string, entry: Omit<BrowsingHistoryEntry, 'id'>): Promise<BrowsingHistoryEntry> {
    const history = await this.loadBrowsingHistory(userId);
    
    // Check if URL already exists in recent history (within last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const existingIndex = history.findIndex(h => 
      h.url === entry.url && new Date(h.visitedAt) > oneHourAgo
    );
    
    let returnEntry: BrowsingHistoryEntry;
    
    if (existingIndex >= 0) {
      // Update existing entry with new timestamp
      history[existingIndex].visitedAt = entry.visitedAt;
      history[existingIndex].title = entry.title; // Update title in case it changed
      returnEntry = history[existingIndex];
    } else {
      // Add new entry
      const newEntry: BrowsingHistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ...entry
      };
      history.unshift(newEntry); // Add to beginning
      returnEntry = newEntry;
    }
    
    // Keep only last maxHistoryEntries entries
    if (this.maxHistoryEntries && history.length > this.maxHistoryEntries) {
      history.splice(this.maxHistoryEntries);
    }
    
    await this.saveBrowsingHistory(userId, history);
    return returnEntry;
  }

  /**
   * Remove a history entry by ID
   */
  async removeHistoryEntry(userId: string, entryId: string): Promise<void> {
    const history = await this.loadBrowsingHistory(userId);
    const filteredHistory = history.filter(entry => entry.id !== entryId);
    await this.saveBrowsingHistory(userId, filteredHistory);
  }

  /**
   * Get a specific history entry by ID
   */
  async getHistoryEntry(userId: string, entryId: string): Promise<BrowsingHistoryEntry | null> {
    const history = await this.loadBrowsingHistory(userId);
    return history.find(entry => entry.id === entryId) || null;
  }

  /**
   * Link a browsing history entry to its content analysis
   */
  async linkHistoryToAnalysis(userId: string, historyEntryId: string, analysisId: string): Promise<void> {
    const history = await this.loadBrowsingHistory(userId);
    const entry = history.find(h => h.id === historyEntryId);
    
    if (entry) {
      entry.analysisId = analysisId;
      await this.saveBrowsingHistory(userId, history);
      console.log(`HistoryStorage: Linked history entry ${historyEntryId} to analysis ${analysisId}`);
    }
  }

  /**
   * Search history by query string
   * Searches in title and URL (content analysis search requires ContentStorage)
   */
  async searchHistory(userId: string, query: string, limit: number = 50): Promise<BrowsingHistoryEntry[]> {
    const history = await this.loadBrowsingHistory(userId);
    const searchTerm = query.toLowerCase();
    
    console.log(`[HistoryStorage] Searching ${history.length} history entries for: "${searchTerm}"`);
    
    // Search in title and URL
    const matches = history.filter(entry =>
      entry.title.toLowerCase().includes(searchTerm) || 
      entry.url.toLowerCase().includes(searchTerm)
    );
    
    console.log(`[HistoryStorage] Found ${matches.length} matches`);
    return matches.slice(0, limit);
  }

  /**
   * Get history entries for a specific URL
   */
  async getHistoryEntriesForUrl(userId: string, url: string): Promise<BrowsingHistoryEntry[]> {
    const history = await this.loadBrowsingHistory(userId);
    return history.filter(entry => entry.url === url);
  }

  /**
   * Populate browsing history from raw activity data
   * Useful for reconstructing history from synthetic data
   */
  async populateHistoryFromActivities(userId: string): Promise<number> {
    console.log(`[HistoryStorage] Populating browsing history from activities for user ${userId}`);
    
    try {
      // Load all activity files
      const activityDir = join(this.getUserDataPath(userId), 'raw-activity');
      const files = await this.readDirectory(activityDir);
      const jsonFiles = files.filter(f => f.endsWith('.json')).sort();
      
      let processedCount = 0;
      const existingHistory = await this.loadBrowsingHistory(userId);
      const existingUrls = new Set(existingHistory.map(h => `${h.url}|${new Date(h.visitedAt).getTime()}`));
      
      for (const file of jsonFiles) {
        const filePath = join(activityDir, file);
        const content = await this.readText(filePath);
        if (!content) continue;
        
        const activities = JSON.parse(content) as RawActivityData[];
        
        // Process page_visit activities
        for (const activity of activities) {
          if (activity.type === 'page_visit' && activity.data.url && activity.data.title) {
            const timestamp = new Date(activity.timestamp).getTime();
            const key = `${activity.data.url}|${timestamp}`;
            
            // Skip if already exists (avoid duplicates)
            if (existingUrls.has(key)) {
              continue;
            }
            
            // Add to history
            const entry: Omit<BrowsingHistoryEntry, 'id'> = {
              url: activity.data.url,
              title: activity.data.title,
              visitedAt: new Date(activity.timestamp),
              favicon: undefined,
              analysisId: undefined
            };
            
            await this.addHistoryEntry(userId, entry);
            existingUrls.add(key);
            processedCount++;
          }
        }
      }
      
      console.log(`[HistoryStorage] Added ${processedCount} history entries from activities`);
      return processedCount;
    } catch (error) {
      console.error(`[HistoryStorage] Error populating history from activities:`, error);
      return 0;
    }
  }
}
