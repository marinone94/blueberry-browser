import { BaseStorage } from "../../../core/storage";
import { join } from "path";

/**
 * Storage for content analysis data.
 * Handles multiple data types:
 * - Content analyses (stored in daily files with index)
 * - Screenshots (stored as PNG files by activity ID)
 * - Raw HTML (stored by hash for deduplication)
 * - LLM debug logs (stored in daily files)
 */
export class ContentStorage extends BaseStorage {

  // ============================================================================
  // DIRECTORY PATHS
  // ============================================================================

  private getContentAnalysisDir(userId: string): string {
    return join(this.getUserDataPath(userId), 'content-analysis');
  }

  private getContentAnalysisFilePath(userId: string, date: string): string {
    return join(this.getContentAnalysisDir(userId), `${date}.json`);
  }

  private getContentAnalysisIndexPath(userId: string): string {
    return join(this.getContentAnalysisDir(userId), 'index.json');
  }

  private getScreenshotsDir(userId: string): string {
    return join(this.getUserDataPath(userId), 'screenshots');
  }

  private getRawHtmlDir(userId: string): string {
    return join(this.getUserDataPath(userId), 'raw-html');
  }

  private getLLMDebugLogsDir(userId: string): string {
    return join(this.getUserDataPath(userId), 'llm-debug-logs');
  }

  private getLLMDebugLogsFilePath(userId: string, date: string): string {
    return join(this.getLLMDebugLogsDir(userId), `${date}.json`);
  }

  // ============================================================================
  // CONTENT ANALYSIS MANAGEMENT
  // ============================================================================

  /**
   * Save a content analysis result
   * Stores in daily files for efficient access
   */
  async saveContentAnalysis(userId: string, analysis: any): Promise<void> {
    try {
      const analysisDir = this.getContentAnalysisDir(userId);
      await this.ensureDirectoryExists(analysisDir);

      const date = new Date().toISOString().split('T')[0];
      const filePath = this.getContentAnalysisFilePath(userId, date);

      // Load existing analyses for today
      let analyses: any[] = [];
      try {
        const data = await this.readText(filePath);
        if (data) {
          analyses = JSON.parse(data);
        }
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          console.error('ContentStorage: Error reading existing analyses:', error);
        }
      }

      // Add new analysis
      analyses.push(analysis);

      // Save back
      await this.writeText(filePath, JSON.stringify(analyses, null, 2));

      console.log(`ContentStorage: Saved content analysis ${analysis.analysisId} for user ${userId}`);
    } catch (error) {
      console.error('ContentStorage: Error saving content analysis:', error);
      throw error;
    }
  }

  /**
   * Get a content analysis by ID
   * Searches through all date files
   */
  async getContentAnalysis(userId: string, analysisId: string): Promise<any | null> {
    try {
      const analysisDir = this.getContentAnalysisDir(userId);
      const files = await this.readDirectory(analysisDir);
      
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'index.json') {
          const filePath = join(analysisDir, file);
          const data = await this.readText(filePath);
          if (!data) continue;
          
          const analyses = JSON.parse(data);
          const found = analyses.find((a: any) => a.analysisId === analysisId);
          if (found) {
            return found;
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('ContentStorage: Error getting content analysis:', error);
      return null;
    }
  }

  /**
   * Get analysis by activity ID
   */
  async getAnalysisByActivity(userId: string, activityId: string): Promise<any | null> {
    try {
      const analysisDir = this.getContentAnalysisDir(userId);
      const files = await this.readDirectory(analysisDir);
      
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'index.json') {
          const filePath = join(analysisDir, file);
          const data = await this.readText(filePath);
          if (!data) continue;
          
          const analyses = JSON.parse(data);
          const found = analyses.find((a: any) => 
            a.activityIds && a.activityIds.includes(activityId)
          );
          if (found) {
            return found;
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('ContentStorage: Error getting analysis by activity:', error);
      return null;
    }
  }

  /**
   * Load analysis index (url+hash -> analysisId mapping)
   */
  async getAnalysisIndex(userId: string): Promise<Map<string, string>> {
    try {
      const indexPath = this.getContentAnalysisIndexPath(userId);
      const data = await this.readText(indexPath);
      if (!data) {
        return new Map();
      }
      
      const obj = JSON.parse(data);
      return new Map(Object.entries(obj));
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return new Map();
      }
      console.error('ContentStorage: Error loading analysis index:', error);
      return new Map();
    }
  }

  /**
   * Update analysis index
   */
  async updateAnalysisIndex(
    userId: string,
    key: string,
    analysisId: string
  ): Promise<void> {
    try {
      const analysisDir = this.getContentAnalysisDir(userId);
      await this.ensureDirectoryExists(analysisDir);

      const index = await this.getAnalysisIndex(userId);
      index.set(key, analysisId);

      const indexPath = this.getContentAnalysisIndexPath(userId);
      const obj = Object.fromEntries(index);
      await this.writeText(indexPath, JSON.stringify(obj, null, 2));
    } catch (error) {
      console.error('ContentStorage: Error updating analysis index:', error);
      throw error;
    }
  }

  /**
   * Link an activity ID to an existing analysis
   */
  async linkActivityToAnalysis(
    userId: string,
    activityId: string,
    analysisId: string
  ): Promise<void> {
    try {
      const analysis = await this.getContentAnalysis(userId, analysisId);
      if (!analysis) {
        throw new Error(`Analysis ${analysisId} not found`);
      }

      // Add activity ID if not already present
      if (!analysis.activityIds.includes(activityId)) {
        analysis.activityIds.push(activityId);

        // Find and update the analysis in its date file
        const date = new Date(analysis.timestamp).toISOString().split('T')[0];
        const filePath = this.getContentAnalysisFilePath(userId, date);
        
        const data = await this.readText(filePath);
        if (!data) {
          throw new Error(`Analysis file for date ${date} not found`);
        }
        
        const analyses = JSON.parse(data);
        const index = analyses.findIndex((a: any) => a.analysisId === analysisId);
        
        if (index !== -1) {
          analyses[index] = analysis;
          await this.writeText(filePath, JSON.stringify(analyses, null, 2));
          console.log(`ContentStorage: Linked activity ${activityId} to analysis ${analysisId}`);
        }
      }
    } catch (error) {
      console.error('ContentStorage: Error linking activity to analysis:', error);
      throw error;
    }
  }

  /**
   * Get all analysis IDs for a specific URL
   */
  async getAnalysisIdsForUrl(userId: string, url: string): Promise<string[]> {
    try {
      const analysisDir = this.getContentAnalysisDir(userId);
      const files = await this.readDirectory(analysisDir);
      const analysisIds: string[] = [];
      
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'index.json') {
          const filePath = join(analysisDir, file);
          const data = await this.readText(filePath);
          if (!data) continue;
          
          const analyses = JSON.parse(data);
          for (const analysis of analyses) {
            if (analysis.url === url) {
              analysisIds.push(analysis.analysisId);
            }
          }
        }
      }
      
      return analysisIds;
    } catch (error) {
      console.error('ContentStorage: Error getting analysis IDs for URL:', error);
      return [];
    }
  }

  /**
   * Get all analysis IDs for a user
   */
  async getAllAnalysisIds(userId: string): Promise<string[]> {
    try {
      const analysisDir = this.getContentAnalysisDir(userId);
      const files = await this.readDirectory(analysisDir);
      const analysisIds: string[] = [];
      
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'index.json') {
          const filePath = join(analysisDir, file);
          const data = await this.readText(filePath);
          if (!data) continue;
          
          const analyses = JSON.parse(data);
          for (const analysis of analyses) {
            analysisIds.push(analysis.analysisId);
          }
        }
      }
      
      return analysisIds;
    } catch (error) {
      console.error('ContentStorage: Error getting all analysis IDs:', error);
      return [];
    }
  }

  /**
   * Get all content analyses for a user
   */
  async getAllContentAnalyses(userId: string): Promise<any[]> {
    try {
      const analysisDir = this.getContentAnalysisDir(userId);
      const files = await this.readDirectory(analysisDir);
      const allAnalyses: any[] = [];
      
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'index.json') {
          const filePath = join(analysisDir, file);
          const data = await this.readText(filePath);
          if (!data) continue;
          
          const analyses = JSON.parse(data);
          allAnalyses.push(...analyses);
        }
      }
      
      return allAnalyses;
    } catch (error) {
      console.error('ContentStorage: Error getting all content analyses:', error);
      return [];
    }
  }

  // ============================================================================
  // SCREENSHOT MANAGEMENT
  // ============================================================================

  /**
   * Save a screenshot
   * Screenshots are stored as PNG files with activity ID as filename
   */
  async saveScreenshot(
    userId: string,
    activityId: string,
    imageBuffer: Buffer
  ): Promise<string> {
    try {
      const screenshotsDir = this.getScreenshotsDir(userId);
      await this.ensureDirectoryExists(screenshotsDir);

      const filename = `${activityId}.png`;
      const filePath = join(screenshotsDir, filename);

      await this.writeBuffer(filePath, imageBuffer);

      console.log(`ContentStorage: Saved screenshot for activity ${activityId}`);
      return filePath;
    } catch (error) {
      console.error('ContentStorage: Error saving screenshot:', error);
      throw error;
    }
  }

  /**
   * Get a screenshot
   */
  async getScreenshot(userId: string, activityId: string): Promise<Buffer | null> {
    try {
      const screenshotsDir = this.getScreenshotsDir(userId);
      const filename = `${activityId}.png`;
      const filePath = join(screenshotsDir, filename);

      return await this.readBuffer(filePath);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      console.error('ContentStorage: Error reading screenshot:', error);
      return null;
    }
  }

  /**
   * Check if screenshot exists
   */
  async hasScreenshot(userId: string, activityId: string): Promise<boolean> {
    const screenshot = await this.getScreenshot(userId, activityId);
    return screenshot !== null;
  }

  /**
   * Delete a screenshot
   */
  async deleteScreenshot(userId: string, activityId: string): Promise<void> {
    try {
      const filename = `${activityId}.png`;
      await this.deleteUserFile(userId, join('screenshots', filename));
      console.log(`ContentStorage: Deleted screenshot for activity ${activityId}`);
    } catch (error) {
      console.error('ContentStorage: Error deleting screenshot:', error);
    }
  }

  // ============================================================================
  // RAW HTML MANAGEMENT
  // ============================================================================

  /**
   * Save raw HTML by hash
   * HTML is deduplicated by hash - same content stored only once
   */
  async saveRawHtml(
    userId: string,
    htmlHash: string,
    html: string
  ): Promise<string> {
    try {
      const htmlDir = this.getRawHtmlDir(userId);
      await this.ensureDirectoryExists(htmlDir);

      const filename = `${htmlHash}.html`;
      const filePath = join(htmlDir, filename);

      // Only save if doesn't already exist (deduplication)
      const existingHtml = await this.readText(filePath);
      if (existingHtml !== null) {
        console.log(`ContentStorage: HTML already exists for hash ${htmlHash}`);
      } else {
        await this.writeText(filePath, html);
        console.log(`ContentStorage: Saved raw HTML with hash ${htmlHash}`);
      }

      return filePath;
    } catch (error) {
      console.error('ContentStorage: Error saving raw HTML:', error);
      throw error;
    }
  }

  /**
   * Get raw HTML by hash
   */
  async getRawHtml(userId: string, htmlHash: string): Promise<string | null> {
    try {
      const htmlDir = this.getRawHtmlDir(userId);
      const filename = `${htmlHash}.html`;
      const filePath = join(htmlDir, filename);

      return await this.readText(filePath);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      console.error('ContentStorage: Error reading raw HTML:', error);
      return null;
    }
  }

  /**
   * Check if raw HTML exists for a hash
   */
  async hasRawHtml(userId: string, htmlHash: string): Promise<boolean> {
    const html = await this.getRawHtml(userId, htmlHash);
    return html !== null;
  }

  // ============================================================================
  // LLM DEBUG LOGS MANAGEMENT
  // ============================================================================

  /**
   * Save LLM debug log
   * Logs are stored in daily files for efficient access
   */
  async saveLLMDebugLog(userId: string, log: any): Promise<void> {
    try {
      const logsDir = this.getLLMDebugLogsDir(userId);
      await this.ensureDirectoryExists(logsDir);

      const date = new Date().toISOString().split('T')[0];
      const filePath = this.getLLMDebugLogsFilePath(userId, date);

      // Load existing logs for today
      let logs: any[] = [];
      try {
        const data = await this.readText(filePath);
        if (data) {
          logs = JSON.parse(data);
        }
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          console.error('ContentStorage: Error reading existing logs:', error);
        }
      }

      // Add new log
      logs.push(log);

      // Save back
      await this.writeText(filePath, JSON.stringify(logs, null, 2));

      console.log(`ContentStorage: Saved LLM debug log ${log.interactionId}`);
    } catch (error) {
      console.error('ContentStorage: Error saving LLM debug log:', error);
      // Don't throw - debug logs should not break the main flow
    }
  }

  /**
   * Get LLM debug logs for a specific date
   */
  async getLLMDebugLogs(userId: string, date?: string): Promise<any[]> {
    try {
      const targetDate = date || new Date().toISOString().split('T')[0];
      const filePath = this.getLLMDebugLogsFilePath(userId, targetDate);
      
      const data = await this.readText(filePath);
      if (!data) {
        return [];
      }
      
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  /**
   * Get all LLM debug logs for a user
   */
  async getAllLLMDebugLogs(userId: string): Promise<any[]> {
    try {
      const logsDir = this.getLLMDebugLogsDir(userId);
      const files = await this.readDirectory(logsDir);
      const allLogs: any[] = [];
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = join(logsDir, file);
          const data = await this.readText(filePath);
          if (!data) continue;
          
          const logs = JSON.parse(data);
          allLogs.push(...logs);
        }
      }
      
      return allLogs;
    } catch (error) {
      console.error('ContentStorage: Error getting all LLM debug logs:', error);
      return [];
    }
  }

  // ============================================================================
  // CLEANUP & MAINTENANCE
  // ============================================================================

  /**
   * Clear all content analyses for a user
   */
  async clearContentAnalyses(userId: string): Promise<void> {
    try {
      const analysisDir = this.getContentAnalysisDir(userId);
      const files = await this.readDirectory(analysisDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          await this.deleteUserFile(userId, join('content-analysis', file));
        }
      }
      
      console.log(`ContentStorage: Cleared all content analyses for user ${userId}`);
    } catch (error) {
      console.error('ContentStorage: Error clearing content analyses:', error);
    }
  }

  /**
   * Clear all screenshots for a user
   */
  async clearScreenshots(userId: string): Promise<void> {
    try {
      const screenshotsDir = this.getScreenshotsDir(userId);
      const files = await this.readDirectory(screenshotsDir);
      
      for (const file of files) {
        if (file.endsWith('.png')) {
          await this.deleteUserFile(userId, join('screenshots', file));
        }
      }
      
      console.log(`ContentStorage: Cleared all screenshots for user ${userId}`);
    } catch (error) {
      console.error('ContentStorage: Error clearing screenshots:', error);
    }
  }

  /**
   * Clear all raw HTML for a user
   */
  async clearRawHtml(userId: string): Promise<void> {
    try {
      const htmlDir = this.getRawHtmlDir(userId);
      const files = await this.readDirectory(htmlDir);
      
      for (const file of files) {
        if (file.endsWith('.html')) {
          await this.deleteUserFile(userId, join('raw-html', file));
        }
      }
      
      console.log(`ContentStorage: Cleared all raw HTML for user ${userId}`);
    } catch (error) {
      console.error('ContentStorage: Error clearing raw HTML:', error);
    }
  }

  /**
   * Clear all LLM debug logs for a user
   */
  async clearLLMDebugLogs(userId: string): Promise<void> {
    try {
      const logsDir = this.getLLMDebugLogsDir(userId);
      const files = await this.readDirectory(logsDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          await this.deleteUserFile(userId, join('llm-debug-logs', file));
        }
      }
      
      console.log(`ContentStorage: Cleared all LLM debug logs for user ${userId}`);
    } catch (error) {
      console.error('ContentStorage: Error clearing LLM debug logs:', error);
    }
  }

  /**
   * Get total content storage size for a user (in bytes)
   */
  async getContentStorageSize(userId: string): Promise<{
    total: number;
    analyses: number;
    screenshots: number;
    rawHtml: number;
    debugLogs: number;
  }> {
    const analysisDir = this.getContentAnalysisDir(userId);
    const screenshotsDir = this.getScreenshotsDir(userId);
    const htmlDir = this.getRawHtmlDir(userId);
    const logsDir = this.getLLMDebugLogsDir(userId);

    const calculateDirSize = async (dirPath: string): Promise<number> => {
      try {
        const files = await this.readDirectory(dirPath);
        let size = 0;
        for (const file of files) {
          const filePath = join(dirPath, file);
          size += await this.getFileSize(filePath);
        }
        return size;
      } catch {
        return 0;
      }
    };

    const [analyses, screenshots, rawHtml, debugLogs] = await Promise.all([
      calculateDirSize(analysisDir),
      calculateDirSize(screenshotsDir),
      calculateDirSize(htmlDir),
      calculateDirSize(logsDir)
    ]);

    return {
      total: analyses + screenshots + rawHtml + debugLogs,
      analyses,
      screenshots,
      rawHtml,
      debugLogs
    };
  }
}

