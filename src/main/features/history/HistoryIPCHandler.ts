import { ipcMain } from "electron";
import { BaseIPCHandler } from "../../core/ipc";
import type { Window } from "../../Window";

/**
 * HistoryIPCHandler
 * 
 * Handles IPC for browsing history operations including:
 * - Loading full browsing history
 * - Smart search (basic string search + semantic fallback)
 * - Clearing history
 * - Removing individual entries
 * - Navigating to URLs from history
 * 
 * Extracted from EventManager lines 643-844
 */
export class HistoryIPCHandler extends BaseIPCHandler {
  constructor(mainWindow: Window) {
    super(mainWindow);
  }

  get name(): string {
    return "history";
  }

  registerHandlers(): void {
    // Get browsing history
    ipcMain.handle("get-browsing-history", async () => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return [];
      
      return await this.mainWindow.userDataManager.loadBrowsingHistory(currentUser.id);
    });

    // Search browsing history with smart search (string first, semantic fallback)
    ipcMain.handle("search-browsing-history", async (_, query: string, options?: {
      limit?: number;
      exactMatch?: boolean;
    }) => {
      const startTime = Date.now();
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return [];

      const limit = options?.limit || 50;
      
      // Check if query is surrounded by quotes for exact match only
      let searchQuery = query.trim();
      let exactMatchOnly = options?.exactMatch || false;
      
      if (searchQuery.startsWith('"') && searchQuery.endsWith('"')) {
        exactMatchOnly = true;
        searchQuery = searchQuery.slice(1, -1); // Remove quotes
      }

      console.log('[HistoryIPCHandler] Browsing history search:', {
        query: searchQuery,
        exactMatchOnly,
        limit,
        timestamp: new Date().toISOString()
      });

      // Step 1: Try basic string search (title/URL contains query)
      const basicResults = await this.mainWindow.userDataManager.searchHistory(
        currentUser.id, 
        searchQuery, 
        limit
      );

      console.log('[HistoryIPCHandler] Basic search results:', basicResults.length);

      // If we have results or exact match only, return basic results
      if (basicResults.length > 0 || exactMatchOnly) {
        const duration = Date.now() - startTime;
        console.log('[HistoryIPCHandler] Returning basic search results:', {
          count: basicResults.length,
          durationMs: duration,
          searchMode: exactMatchOnly ? 'EXACT_ONLY' : 'BASIC'
        });
        return basicResults.map(r => ({
          ...r,
          _searchMode: exactMatchOnly ? 'exact' : 'basic'
        }));
      }

      // Step 2: Fallback to semantic search if no basic results
      console.log('[HistoryIPCHandler] No basic results, trying semantic search...');
      
      try {
        const semanticResults = await this.mainWindow.vectorSearchManager.searchBrowsingContent(
          currentUser.id,
          searchQuery,
          { limit: limit * 2 } // Get more for grouping
        );

        console.log('[HistoryIPCHandler] Semantic search results:', semanticResults.length);

        if (semanticResults.length === 0) {
          const duration = Date.now() - startTime;
          console.log('[HistoryIPCHandler] No results found:', {
            durationMs: duration
          });
          return [];
        }

        // Load full browsing history and all content analyses to map vector results
        const fullHistory = await this.mainWindow.userDataManager.loadBrowsingHistory(currentUser.id);
        const allAnalyses = await this.mainWindow.userDataManager.getAllContentAnalyses(currentUser.id);
        
        // Create a map of analysisId -> URL for matching
        const analysisUrlMap = new Map<string, string>();
        for (const analysis of allAnalyses) {
          analysisUrlMap.set(analysis.analysisId, analysis.url);
        }
        
        // Create a map of analysisId -> history entry by matching URLs
        const historyMap = new Map<string, any>();
        for (const entry of fullHistory) {
          // Direct match if entry has analysisId
          if (entry.analysisId) {
            historyMap.set(entry.analysisId, entry);
          } else {
            // Try to match by URL - find all analyses for this URL
            for (const [analysisId, analysisUrl] of analysisUrlMap.entries()) {
              if (analysisUrl === entry.url && !historyMap.has(analysisId)) {
                // Match by URL, prioritizing more recent history entries
                historyMap.set(analysisId, entry);
                break; // Take first match to avoid duplicates
              }
            }
          }
        }
        
        // Map vector results to history entries and attach scores
        const resultsMap = new Map<string, { entry: any; score: number; contentType: string; content: string }>();
        for (const vectorResult of semanticResults) {
          const historyEntry = historyMap.get(vectorResult.analysisId);
          if (historyEntry) {
            const existing = resultsMap.get(historyEntry.id);
            // Keep the highest score for each entry
            if (!existing || vectorResult.score > existing.score) {
              resultsMap.set(historyEntry.id, {
                entry: historyEntry,
                score: vectorResult.score,
                contentType: vectorResult.contentType,
                content: vectorResult.content
              });
            }
          }
        }
        
        // Sort by score (primary) and visit date (secondary)
        const sortedResults = Array.from(resultsMap.values())
          .sort((a, b) => {
            // Primary sort: higher score first
            const scoreDiff = b.score - a.score;
            if (Math.abs(scoreDiff) > 0.01) { // Significant score difference
              return scoreDiff;
            }
            // Secondary sort: more recent visit first (for similar scores)
            const aDate = new Date(a.entry.visitedAt).getTime();
            const bDate = new Date(b.entry.visitedAt).getTime();
            return bDate - aDate;
          })
          .slice(0, limit)
          .map(r => ({
            ...r.entry,
            _searchMode: 'semantic' as const,
            _searchScore: r.score,
            _matchedContent: r.content,
            _matchedContentType: r.contentType
          }));

        const duration = Date.now() - startTime;
        console.log('[HistoryIPCHandler] Returning semantic search results:', {
          count: sortedResults.length,
          durationMs: duration,
          searchMode: 'SEMANTIC',
          topScores: sortedResults.slice(0, 5).map(r => ({
            title: r.title,
            score: r._searchScore?.toFixed(3),
            contentType: r._matchedContentType,
            visitedAt: r.visitedAt
          }))
        });

        return sortedResults;
      } catch (error) {
        console.error('[HistoryIPCHandler] Semantic search failed:', error);
        return [];
      }
    });

    // Clear browsing history
    ipcMain.handle("clear-browsing-history", async () => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return { success: false, error: "No current user" };
      
      await this.mainWindow.userDataManager.clearBrowsingHistory(currentUser.id);
      return { success: true };
    });

    // Remove single history entry
    ipcMain.handle("remove-history-entry", async (_, entryId: string) => {
      const currentUser = this.mainWindow.userAccountManager.getCurrentUser();
      if (!currentUser) return { success: false, error: "No current user" };
      
      await this.mainWindow.userDataManager.removeHistoryEntry(currentUser.id, entryId);
      return { success: true };
    });

    // Navigate to URL from history (activate existing tab or create new one)
    ipcMain.handle("navigate-from-history", async (_, url: string) => {
      // Check if URL is already open in an existing tab
      const existingTab = this.mainWindow.allTabs.find(tab => tab.url === url);
      
      if (existingTab) {
        // Activate the existing tab
        this.mainWindow.switchActiveTab(existingTab.id);
        return { id: existingTab.id, title: existingTab.title, url: existingTab.url, wasExisting: true };
      } else {
        // Create a new tab
        const newTab = this.mainWindow.createTab(url);
        this.mainWindow.switchActiveTab(newTab.id);
        return { id: newTab.id, title: newTab.title, url: newTab.url, wasExisting: false };
      }
    });

    console.log("HistoryIPCHandler: Handlers registered");
  }

  cleanup(): void {
    ipcMain.removeHandler("get-browsing-history");
    ipcMain.removeHandler("search-browsing-history");
    ipcMain.removeHandler("clear-browsing-history");
    ipcMain.removeHandler("remove-history-entry");
    ipcMain.removeHandler("navigate-from-history");

    console.log("HistoryIPCHandler: Handlers cleaned up");
  }
}

