import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { promises as fs } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import type { InsightsStorage } from './storage';
import type { ActivityStorage } from '../activity/storage';
import type { ContentStorage } from '../content/storage';
import type { VectorSearchManager } from '../search/VectorSearchManager';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Content analysis result structure (matches ContentAnalyzer output)
 */
interface ContentAnalysis {
  analysisId: string;
  activityIds: string[];
  userId: string;
  timestamp: string;
  url: string;
  
  // Content
  pageDescription: string;
  rawText: {
    title: string;
    metaDescription?: string;
    fullText: string;
  };
  
  // Visual
  screenshotDescription: string;
  screenshotPath: string;
  
  // Categorization
  category: string;
  subcategory: string;
  brand: string;
  
  // Language
  primaryLanguage: string;
  languages: string[];
}

/**
 * Activity data structure (from raw activity logs)
 */
interface Activity {
  id: string;
  userId: string;
  timestamp: string;
  sessionId: string;
  type: string;
  data: {
    url?: string;
    title?: string;
    timeOnPage?: number;
    exitMethod?: string;
    action?: string;
    [key: string]: any;
  };
}

/**
 * Enriched activity with content analysis
 */
interface EnrichedActivity {
  activity: Activity;
  analysis?: ContentAnalysis;
}

/**
 * Browsing session with grouped activities
 */
interface BrowsingSession {
  sessionId: string;
  userId: string;
  startTime: Date;
  endTime: Date;
  duration: number; // milliseconds
  activities: EnrichedActivity[];
  primaryCategory?: string;
}

/**
 * Session boundary decision from LLM
 */
interface SessionBoundaryDecision {
  decision: 'NEW' | 'SAME';
  reason: string;
  confidence: number;
}

/**
 * Sequential pattern (workflow)
 */
interface SequentialPattern {
  type: 'sequential';
  patternId: string;
  steps: Array<{
    category: string;
    subcategory: string;
    brand?: string;
    pageDescriptionSummary: string;
    screenshotDescriptionSummary: string;
    url: string;
  }>;
  frequency: number;
  avgDuration: number;
  lastOccurrence: Date;
  semanticTheme: string;
  score: number;
}

/**
 * Topic research pattern
 */
interface TopicPattern {
  type: 'research_topic';
  patternId: string;
  mainCategory: string;
  subcategories: string[];
  brands: string[];
  semanticSummary: string;
  sessions: BrowsingSession[];
  totalTime: number;
  pagesSeen: number;
  keyInsights: string[];
  lastOccurrence: Date;
  score: number;
}

/**
 * Abandoned task pattern
 */
interface AbandonmentPattern {
  type: 'abandoned';
  patternId: string;
  session: BrowsingSession;
  intent: string;
  progressMade: string;
  whyAbandoned: string;
  completionScore: number;
  suggestions: string[];
  lastOccurrence: Date;
  score: number;
}

/**
 * Temporal pattern (time-based habit)
 */
interface TemporalPattern {
  type: 'temporal';
  patternId: string;
  dayOfWeek: number;
  hour: number;
  domain: string;
  frequency: number;
  confidence: number;
  lastOccurrence: Date;
  score: number;
}

type Pattern = SequentialPattern | TopicPattern | AbandonmentPattern | TemporalPattern;

/**
 * Actionable insight generated from patterns
 */
interface ProactiveInsight {
  id: string;
  userId: string;
  type: 'workflow' | 'research' | 'abandoned' | 'habit';
  title: string;
  description: string;
  actionType: 'open_urls' | 'resume_research' | 'remind' | 'create_workflow';
  actionParams: any;
  patterns: Pattern[];
  relevanceScore: number;
  createdAt: Date;
  triggeredAt?: Date;
  
  // Status tracking (replaces actedUpon)
  status: 'pending' | 'in_progress' | 'completed';
  
  // Legacy support (deprecated)
  actedUpon?: boolean;
  actedUponAt?: Date;
  
  // Progress tracking for abandoned tasks
  lastResumedAt?: Date;
  linkedSessionIds?: string[]; // Track all sessions related to this insight
  completionProgress?: number; // 0.0 - 1.0
  
  // Tracking for tab reopening
  openedTabUrls?: string[]; // URLs that were reopened by the user
  autoCompletionTimerId?: NodeJS.Timeout | null; // Timer for auto-completion logic
}

/**
 * Metadata for tracking insight generation
 */
interface InsightGenerationMetadata {
  userId: string;
  lastGenerationTimestamp: string;
  lastActivityTimestamp: string;
  totalInsightsGenerated: number;
  totalInsightsActedUpon: number;
}

/**
 * Saved workflow (persistent agent created from detected patterns)
 */
interface SavedWorkflow {
  // Identity
  id: string;                    // Format: workflow-{timestamp}-{random}
  userId: string;
  
  // Metadata
  name: string;                  // User-provided or auto-generated
  description: string;           // From original insight
  createdAt: Date;
  createdFrom: string;           // Original insight/pattern ID
  
  // Workflow Definition
  steps: Array<{
    url: string;
    title: string;               // Page title for display
    category: string;            // For future filtering
    subcategory: string;
  }>;
  
  // Usage Analytics
  lastUsed: Date | null;
  useCount: number;
  
  // UI State (future use)
  isPinned?: boolean;
  tags?: string[];
}

// ============================================================================
// PROACTIVE INSIGHTS MANAGER
// ============================================================================

/**
 * Manages proactive task intelligence by analyzing user behavior patterns
 * 
 * Features:
 * - LLM-based session segmentation using content analysis
 * - Multi-strategy pattern detection (sequential, topic, abandonment, temporal)
 * - Real-time insight generation and triggering
 */
export class ProactiveInsightsManager {
  // @ts-ignore - Reserved for future use when ProactiveInsightsManager is refactored
  private _insightsStorage: InsightsStorage;
  // @ts-ignore - Reserved for future use when ProactiveInsightsManager is refactored
  private _activityStorage: ActivityStorage;
  // @ts-ignore - Reserved for future use when ProactiveInsightsManager is refactored
  private _contentStorage: ContentStorage;
  private usersDir: string;
  private patternsCache: Map<string, Pattern[]> = new Map(); // userId -> patterns
  private insightsCache: Map<string, ProactiveInsight[]> = new Map(); // userId -> insights
  private autoCompletionTimers: Map<string, NodeJS.Timeout> = new Map(); // insightId -> timer
  private window: any; // Reference to Window for sending IPC events
  
  constructor(
    insightsStorage: InsightsStorage,
    activityStorage: ActivityStorage,
    contentStorage: ContentStorage,
    _vectorSearchManager: VectorSearchManager // Prefix with _ to indicate intentionally unused for now
  ) {
    this._insightsStorage = insightsStorage;
    this._activityStorage = activityStorage;
    this._contentStorage = contentStorage;
    this.usersDir = join(app.getPath("userData"), "users");
    // Storage classes reserved for future use when ProactiveInsightsManager is refactored
    // Currently it accesses files directly
  }

  /**
   * Set the window reference for sending IPC events
   */
  setWindow(window: any): void {
    this.window = window;
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Analyze user behavior and generate proactive insights
   * Should be run periodically (e.g., daily) or on-demand
   */
  async analyzeUserBehavior(userId: string): Promise<ProactiveInsight[]> {
    console.log(`[ProactiveInsights] Starting behavior analysis for user ${userId}`);
    
    try {
      // 1. Load metadata to get last generation timestamp
      const metadata = await this.loadGenerationMetadata(userId);
      const lastGenerationTime = metadata ? new Date(metadata.lastGenerationTimestamp) : new Date(0);
      
      console.log(`[ProactiveInsights] Last generation: ${lastGenerationTime.toISOString()}`);
      
      // 2. Load raw activities and content analyses (only new ones)
      const allActivities = await this.loadUserActivities(userId);
      const activities = allActivities.filter(a => new Date(a.timestamp) > lastGenerationTime);
      
      console.log(`[ProactiveInsights] Loaded ${activities.length} new activities out of ${allActivities.length} total`);
      
      if (activities.length === 0) {
        console.log(`[ProactiveInsights] No new activities to analyze`);
        // Return existing insights
        return await this.loadInsights(userId);
      }
      
      const contentAnalyses = await this.loadContentAnalyses(userId);
      
      console.log(`[ProactiveInsights] Loaded ${contentAnalyses.length} analyses`);
      
      // 3. Enrich activities with content analysis
      const enrichedActivities = this.enrichActivities(activities, contentAnalyses);
      
      // 4. Segment into sessions using LLM
      const sessions = await this.segmentSessions(enrichedActivities, userId);
      console.log(`[ProactiveInsights] Segmented into ${sessions.length} sessions`);
      
      // 5. Detect patterns (parallel)
      const [sequential, topic, abandoned, temporal] = await Promise.all([
        this.findSequentialPatterns(sessions),
        this.findTopicPatterns(sessions),
        this.findAbandonedTasks(sessions),
        this.findTemporalPatterns(enrichedActivities)
      ]);

      const allPatterns = [...sequential, ...topic, ...abandoned, ...temporal];
      console.log(`[ProactiveInsights] Found ${allPatterns.length} patterns in total`);
      
      // 6. Score and rank patterns
      const rankedPatterns = this.rankPatterns(allPatterns);
      this.patternsCache.set(userId, rankedPatterns);
      
      // 7. Generate actionable insights
      const newInsights = await this.generateInsights(rankedPatterns, userId, 20);
      
      // 8. Load existing insights and update with new session data
      const existingInsights = await this.loadInsights(userId);
      
      // 8a. Check for session linking - do active/in_progress abandoned tasks relate to new sessions?
      const updatedExistingInsights = await this.updateInsightsWithNewSessions(
        existingInsights,
        sessions,
        userId
      );
      
      // 8b. Keep insights that are in_progress or completed (not pending unless they're old)
      const activeInsights = updatedExistingInsights.filter(i => 
        i.status === 'in_progress' || i.status === 'completed'
      );
      
      // Combine: new insights + active insights
      const allInsights = [...newInsights, ...activeInsights];
      
      this.insightsCache.set(userId, allInsights);
      
      // 9. Save insights persistently
      await this.saveInsights(userId, allInsights);
      
      // 10. Update metadata
      // Use the latest activity timestamp as lastGenerationTimestamp to avoid re-processing
      // This is critical for synthetic data with past timestamps
      const allLoadedActivities = await this.loadUserActivities(userId);
      const lastActivityTimestamp = allLoadedActivities.length > 0 
        ? allLoadedActivities[allLoadedActivities.length - 1].timestamp 
        : new Date().toISOString();
        
      await this.saveGenerationMetadata(userId, {
        userId,
        lastGenerationTimestamp: lastActivityTimestamp, // Use last activity time, not current time
        lastActivityTimestamp,
        totalInsightsGenerated: (metadata?.totalInsightsGenerated || 0) + newInsights.length,
        totalInsightsActedUpon: activeInsights.filter(i => i.status === 'completed').length
      });
      
      console.log(`[ProactiveInsights] Generated ${newInsights.length} new insights, ${activeInsights.length} active insights`);
      
      return allInsights;
    } catch (error) {
      console.error('[ProactiveInsights] Error analyzing behavior:', error);
      return [];
    }
  }

  /**
   * Get insights for a user (from cache or load from disk)
   */
  async getInsights(userId: string): Promise<ProactiveInsight[]> {
    if (this.insightsCache.has(userId)) {
      return this.insightsCache.get(userId)!;
    }
    
    // Try loading from disk first
    const insights = await this.loadInsights(userId);
    if (insights.length > 0) {
      this.insightsCache.set(userId, insights);
      return insights;
    }
    
    // If no insights on disk, generate new ones
    return this.analyzeUserBehavior(userId);
  }

  /**
   * Mark an insight as in progress (user clicked to resume)
   */
  async markInsightAsInProgress(userId: string, insightId: string): Promise<void> {
    const insights = await this.getInsights(userId);
    const insight = insights.find(i => i.id === insightId);
    
    if (insight && insight.status === 'pending') {
      insight.status = 'in_progress';
      insight.lastResumedAt = new Date();
      
      // Initialize linkedSessionIds if needed
      if (!insight.linkedSessionIds) {
        insight.linkedSessionIds = [];
      }
      
      // Update cache and save
      this.insightsCache.set(userId, insights);
      await this.saveInsights(userId, insights);
      
      console.log(`[ProactiveInsights] Marked insight ${insightId} as in progress`);
    }
  }

  /**
   * Mark an insight as completed (manually or automatically)
   */
  async markInsightAsCompleted(userId: string, insightId: string): Promise<void> {
    console.log(`[ProactiveInsights] markInsightAsCompleted called for userId=${userId}, insightId=${insightId}`);
    const insights = await this.getInsights(userId);
    console.log(`[ProactiveInsights] Retrieved ${insights.length} insights from cache/storage`);
    const insight = insights.find(i => i.id === insightId);
    
    if (!insight) {
      console.error(`[ProactiveInsights] Insight ${insightId} not found!`);
      return;
    }
    
    console.log(`[ProactiveInsights] Found insight, current status: ${insight.status}`);
    
    if (insight.status !== 'completed') {
      insight.status = 'completed';
      insight.completionProgress = 1.0;
      insight.actedUponAt = new Date(); // For legacy compatibility
      
      console.log(`[ProactiveInsights] Updated insight status to completed, saving...`);
      
      // Update cache and save
      this.insightsCache.set(userId, insights);
      await this.saveInsights(userId, insights);
      
      console.log(`[ProactiveInsights] Marked insight ${insightId} as completed and saved to disk`);
    } else {
      console.log(`[ProactiveInsights] Insight ${insightId} was already completed, skipping`);
    }
  }

  /**
   * Legacy method for backward compatibility
   * @deprecated Use markInsightAsCompleted instead
   */
  async markInsightAsActedUpon(userId: string, insightId: string): Promise<void> {
    await this.markInsightAsCompleted(userId, insightId);
  }

  /**
   * Get tabs (URLs and titles) from session IDs
   * Returns tabs sorted in reverse chronological order (latest first)
   */
  async getTabsFromSessions(userId: string, sessionIds: string[]): Promise<Array<{url: string, title: string, timestamp: string, sessionId: string}>> {
    const allTabs: Array<{url: string, title: string, timestamp: string, sessionId: string}> = [];
    
    try {
      console.log(`[ProactiveInsights] Getting tabs for sessions:`, sessionIds);
      
      // Load activities for all sessions
      const activities = await this.loadUserActivities(userId);
      console.log(`[ProactiveInsights] Loaded ${activities.length} total activities`);
      
      // Debug: Show sample session IDs from activities
      const sampleSessionIds = [...new Set(activities.slice(0, 10).map(a => a.sessionId))];
      console.log(`[ProactiveInsights] Sample session IDs from activities:`, sampleSessionIds.slice(0, 3));
      
      // Filter activities that belong to the specified sessions
      const relevantActivities = activities.filter(a => sessionIds.includes(a.sessionId));
      console.log(`[ProactiveInsights] Filtered to ${relevantActivities.length} relevant activities for the specified sessions`);
      
      // Extract unique URLs with page visits and titles
      const urlMap = new Map<string, {url: string, title: string, timestamp: string, sessionId: string}>();
      
      for (const activity of relevantActivities) {
        // Look for page visit activities with URLs
        if (activity.type === 'page_visit' && activity.data?.url) {
          const url = activity.data.url;
          const title = activity.data.title || url;
          const timestamp = activity.timestamp;
          const sessionId = activity.sessionId;
          
          // Keep the latest occurrence of each URL
          if (!urlMap.has(url) || new Date(urlMap.get(url)!.timestamp) < new Date(timestamp)) {
            urlMap.set(url, { url, title, timestamp, sessionId });
          }
        }
      }
      
      // Convert to array and sort by timestamp (latest first)
      allTabs.push(...urlMap.values());
      allTabs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      console.log(`[ProactiveInsights] Found ${allTabs.length} unique tabs (URLs) across ${sessionIds.length} sessions`);
      if (allTabs.length > 0) {
        console.log(`[ProactiveInsights] Sample tabs:`, allTabs.slice(0, 3).map(t => t.title));
      }
      
      return allTabs;
    } catch (error) {
      console.error('[ProactiveInsights] Error getting tabs from sessions:', error);
      return [];
    }
  }

  /**
   * Track that a tab was opened for an insight
   */
  async trackOpenedTab(userId: string, insightId: string, url: string): Promise<void> {
    const insights = await this.getInsights(userId);
    const insight = insights.find(i => i.id === insightId);
    
    if (!insight) {
      console.error(`[ProactiveInsights] Insight ${insightId} not found for tracking opened tab`);
      return;
    }
    
    // Initialize openedTabUrls if needed
    if (!insight.openedTabUrls) {
      insight.openedTabUrls = [];
    }
    
    // Add the URL if not already tracked
    if (!insight.openedTabUrls.includes(url)) {
      insight.openedTabUrls.push(url);
      console.log(`[ProactiveInsights] Tracked opened tab for insight ${insightId}: ${url} (${insight.openedTabUrls.length} total)`);
    }
    
    // Update cache and save
    this.insightsCache.set(userId, insights);
    await this.saveInsights(userId, insights);
    
    // Start auto-completion timer if this is the first tab opened
    if (insight.openedTabUrls.length === 1) {
      this.startAutoCompletionTimer(userId, insightId);
    }
  }

  /**
   * Start a 5-minute timer for auto-completion logic
   */
  private startAutoCompletionTimer(userId: string, insightId: string): void {
    // Clear any existing timer for this insight
    const existingTimer = this.autoCompletionTimers.get(insightId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    console.log(`[ProactiveInsights] Starting auto-completion timer for insight ${insightId} (5 minutes)`);
    
    // Set a 5-minute timer
    const timer = setTimeout(async () => {
      await this.handleAutoCompletion(userId, insightId);
    }, 5 * 60 * 1000); // 5 minutes
    
    this.autoCompletionTimers.set(insightId, timer);
  }

  /**
   * Handle auto-completion logic after 5 minutes
   */
  private async handleAutoCompletion(userId: string, insightId: string): Promise<void> {
    console.log(`[ProactiveInsights] Auto-completion timer fired for insight ${insightId}`);
    
    try {
      const percentage = await this.getTabCompletionPercentage(userId, insightId);
      
      if (percentage > 0.5) {
        // More than 50% opened: auto-complete
        console.log(`[ProactiveInsights] Auto-completing insight ${insightId} (${(percentage * 100).toFixed(1)}% complete)`);
        await this.markInsightAsCompleted(userId, insightId);
        
        // Notify the renderer
        if (this.window?.sidebar?.view?.webContents) {
          this.window.sidebar.view.webContents.send('insight-auto-completed', {
            insightId,
            percentage,
            reason: 'More than 50% of tabs were opened'
          });
        }
      } else if (percentage > 0) {
        // Some tabs opened but less than 50%: ask for confirmation
        console.log(`[ProactiveInsights] Requesting completion confirmation for insight ${insightId} (${(percentage * 100).toFixed(1)}% complete)`);
        
        // Send confirmation request to renderer
        if (this.window?.sidebar?.view?.webContents) {
          this.window.sidebar.view.webContents.send('insight-completion-confirmation-request', {
            insightId,
            percentage
          });
        }
      }
      
      // Clean up the timer
      this.autoCompletionTimers.delete(insightId);
    } catch (error) {
      console.error(`[ProactiveInsights] Error in auto-completion handler:`, error);
      this.autoCompletionTimers.delete(insightId);
    }
  }

  /**
   * Cancel auto-completion timer for an insight
   */
  cancelAutoCompletionTimer(insightId: string): void {
    const timer = this.autoCompletionTimers.get(insightId);
    if (timer) {
      clearTimeout(timer);
      this.autoCompletionTimers.delete(insightId);
      console.log(`[ProactiveInsights] Cancelled auto-completion timer for insight ${insightId}`);
    }
  }

  /**
   * Get the completion percentage based on opened tabs
   */
  async getTabCompletionPercentage(userId: string, insightId: string): Promise<number> {
    const insights = await this.getInsights(userId);
    const insight = insights.find(i => i.id === insightId);
    
    if (!insight || !insight.linkedSessionIds || insight.linkedSessionIds.length === 0) {
      return 0;
    }
    
    const allTabs = await this.getTabsFromSessions(userId, insight.linkedSessionIds);
    const totalTabs = allTabs.length;
    const openedTabs = insight.openedTabUrls?.length || 0;
    
    if (totalTabs === 0) return 0;
    
    return openedTabs / totalTabs;
  }

  /**
   * Check if current context triggers any insights
   */
  async checkRealtimeTriggers(
    userId: string,
    currentUrl: string,
    recentActivities: Activity[]
  ): Promise<ProactiveInsight[]> {
    const insights = await this.getInsights(userId);
    const triggered: ProactiveInsight[] = [];
    
    // Check each insight for trigger conditions
    for (const insight of insights) {
      if (await this.shouldTrigger(insight, currentUrl, recentActivities)) {
        triggered.push(insight);
      }
    }
    
    return triggered;
  }

  // ============================================================================
  // WORKFLOW AUTOMATION
  // ============================================================================

  /**
   * Save a workflow insight as a permanent agent
   */
  async saveWorkflowAsAgent(
    userId: string, 
    insightId: string, 
    customName?: string
  ): Promise<{ success: boolean; workflow?: SavedWorkflow; error?: string }> {
    try {
      console.log(`[WorkflowAutomation] Saving workflow as agent: insightId=${insightId}`);
      
      // 1. Find insight by ID
      const insights = await this.getInsights(userId);
      const insight = insights.find(i => i.id === insightId);
      
      if (!insight) {
        return { success: false, error: 'Insight not found' };
      }
      
      // 2. Validate it's a workflow type
      if (insight.type !== 'workflow' || insight.actionType !== 'open_urls') {
        return { success: false, error: 'This insight is not a workflow' };
      }
      
      // 3. Extract steps from actionParams
      const urls = insight.actionParams.urls as string[];
      if (!urls || urls.length === 0) {
        return { success: false, error: 'Workflow has no steps' };
      }
      
      // 4. Get pattern details for step information
      const pattern = insight.patterns[0] as SequentialPattern;
      const steps = pattern.steps.map((step, index) => ({
        url: urls[index] || step.url,
        title: step.pageDescriptionSummary || step.url,
        category: step.category,
        subcategory: step.subcategory
      }));
      
      // 5. Load existing workflows
      const existingWorkflows = await this.loadSavedWorkflows(userId);
      
      // 6. Check for duplicates
      if (this.workflowExists(existingWorkflows, steps)) {
        return { success: false, error: 'A workflow with these steps already exists' };
      }
      
      // 7. Create SavedWorkflow object
      const workflow: SavedWorkflow = {
        id: `workflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        userId,
        name: customName || insight.title.replace('Detected workflow: ', ''),
        description: insight.description,
        createdAt: new Date(),
        createdFrom: insightId,
        steps,
        lastUsed: null,
        useCount: 0
      };
      
      // 8. Save to disk
      existingWorkflows.push(workflow);
      await this.saveSavedWorkflows(userId, existingWorkflows);
      
      console.log(`[WorkflowAutomation] Successfully saved workflow: ${workflow.name} (${workflow.steps.length} steps)`);
      
      return { success: true, workflow };
    } catch (error) {
      console.error('[WorkflowAutomation] Error saving workflow:', error);
      return { success: false, error: 'Failed to save workflow' };
    }
  }

  /**
   * Get all saved workflows for a user
   */
  async getSavedWorkflows(userId: string): Promise<SavedWorkflow[]> {
    try {
      const workflows = await this.loadSavedWorkflows(userId);
      
      // Sort by lastUsed (nulls last) then useCount
      return workflows.sort((a, b) => {
        if (a.lastUsed && b.lastUsed) {
          return b.lastUsed.getTime() - a.lastUsed.getTime();
        }
        if (a.lastUsed && !b.lastUsed) return -1;
        if (!a.lastUsed && b.lastUsed) return 1;
        return b.useCount - a.useCount;
      });
    } catch (error) {
      console.error('[WorkflowAutomation] Error getting workflows:', error);
      return [];
    }
  }

  /**
   * Execute a saved workflow (open all URLs in tabs)
   */
  async executeWorkflow(
    userId: string, 
    workflowId: string
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      console.log(`[WorkflowAutomation] Executing workflow: ${workflowId}`);
      
      // 1. Find workflow by ID
      const workflows = await this.loadSavedWorkflows(userId);
      const workflow = workflows.find(w => w.id === workflowId);
      
      if (!workflow) {
        return { success: false, error: 'Workflow not found' };
      }
      
      // 2. Open each URL in a new tab (using window reference)
      if (!this.window) {
        return { success: false, error: 'Window reference not available' };
      }
      
      let lastTab;
      for (const step of workflow.steps) {
        lastTab = this.window.createTab(step.url);
      }
      
      // 3. Switch to the last opened tab
      if (lastTab) {
        this.window.switchActiveTab(lastTab.id);
      }
      
      // 4. Update lastUsed and increment useCount
      workflow.lastUsed = new Date();
      workflow.useCount += 1;
      
      // 5. Save updated workflows
      await this.saveSavedWorkflows(userId, workflows);
      
      console.log(`[WorkflowAutomation] Successfully executed workflow: ${workflow.name} (${workflow.steps.length} tabs)`);
      
      return { success: true, message: `Opened ${workflow.steps.length} tabs` };
    } catch (error) {
      console.error('[WorkflowAutomation] Error executing workflow:', error);
      return { success: false, error: 'Failed to execute workflow' };
    }
  }

  /**
   * Delete a saved workflow
   */
  async deleteWorkflow(
    userId: string, 
    workflowId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`[WorkflowAutomation] Deleting workflow: ${workflowId}`);
      
      // 1. Load workflows
      const workflows = await this.loadSavedWorkflows(userId);
      
      // 2. Filter out target ID
      const updatedWorkflows = workflows.filter(w => w.id !== workflowId);
      
      if (updatedWorkflows.length === workflows.length) {
        return { success: false, error: 'Workflow not found' };
      }
      
      // 3. Save back to disk
      await this.saveSavedWorkflows(userId, updatedWorkflows);
      
      console.log(`[WorkflowAutomation] Successfully deleted workflow`);
      
      return { success: true };
    } catch (error) {
      console.error('[WorkflowAutomation] Error deleting workflow:', error);
      return { success: false, error: 'Failed to delete workflow' };
    }
  }

  /**
   * Rename a saved workflow
   */
  async renameWorkflow(
    userId: string, 
    workflowId: string, 
    newName: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`[WorkflowAutomation] Renaming workflow: ${workflowId} to "${newName}"`);
      
      // 1. Find workflow by ID
      const workflows = await this.loadSavedWorkflows(userId);
      const workflow = workflows.find(w => w.id === workflowId);
      
      if (!workflow) {
        return { success: false, error: 'Workflow not found' };
      }
      
      // 2. Update name
      workflow.name = newName;
      
      // 3. Save to disk
      await this.saveSavedWorkflows(userId, workflows);
      
      console.log(`[WorkflowAutomation] Successfully renamed workflow`);
      
      return { success: true };
    } catch (error) {
      console.error('[WorkflowAutomation] Error renaming workflow:', error);
      return { success: false, error: 'Failed to rename workflow' };
    }
  }

  /**
   * Check if a workflow with identical steps already exists
   */
  private workflowExists(
    workflows: SavedWorkflow[], 
    steps: Array<{url: string}>
  ): boolean {
    const stepUrls = steps.map(s => s.url).join('|');
    return workflows.some(w => {
      const workflowUrls = w.steps.map(s => s.url).join('|');
      return workflowUrls === stepUrls;
    });
  }

  // ============================================================================
  // SESSION LINKING & COMPLETION TRACKING
  // ============================================================================

  /**
   * Update existing insights with new session data
   * Links new sessions to abandoned tasks if they're related
   * Marks tasks as completed if completion score is high
   */
  private async updateInsightsWithNewSessions(
    insights: ProactiveInsight[],
    newSessions: BrowsingSession[],
    _userId: string // Unused for now, reserved for future per-user configuration
  ): Promise<ProactiveInsight[]> {
    const now = Date.now();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    
    for (const insight of insights) {
      // Only process abandoned tasks that are pending or in_progress
      if (insight.type !== 'abandoned' || insight.status === 'completed') {
        continue;
      }
      
      const pattern = insight.patterns[0] as AbandonmentPattern;
      if (!pattern || pattern.type !== 'abandoned') continue;
      
      // Check time window
      const timeSinceAbandonment = now - pattern.lastOccurrence.getTime();
      
      // For in_progress tasks: always check
      // For pending tasks: only check within 24h window
      const shouldCheck = insight.status === 'in_progress' || timeSinceAbandonment < TWENTY_FOUR_HOURS;
      
      if (!shouldCheck) continue;
      
      // Check if any new session relates to this abandoned task
      for (const session of newSessions) {
        const isRelated = await this.isSessionRelatedToAbandonedTask(session, pattern);
        
        if (isRelated) {
          console.log(`[ProactiveInsights] Linking session ${session.sessionId} to insight ${insight.id}`);
          
          // Link the session
          if (!insight.linkedSessionIds) {
            insight.linkedSessionIds = [];
          }
          if (!insight.linkedSessionIds.includes(session.sessionId)) {
            insight.linkedSessionIds.push(session.sessionId);
          }
          
          // Update status to in_progress if it was pending
          if (insight.status === 'pending') {
            insight.status = 'in_progress';
          }
          
          insight.lastResumedAt = session.endTime;
          
          // Check if this session indicates task completion
          const completionAnalysis = await this.llmAnalyzeCompletion(session);
          
          if (completionAnalysis.completionScore >= 0.6) {
            insight.status = 'completed';
            insight.completionProgress = completionAnalysis.completionScore;
            insight.actedUponAt = new Date();
            
            console.log(`[ProactiveInsights] Auto-completed insight ${insight.id} with score ${completionAnalysis.completionScore}`);
          } else {
            // Update progress but don't complete
            insight.completionProgress = completionAnalysis.completionScore;
          }
          
          break; // Only link to first matching session
        }
      }
    }
    
    return insights;
  }

  /**
   * Check if a session is related to an abandoned task
   */
  private async isSessionRelatedToAbandonedTask(
    session: BrowsingSession,
    abandonedPattern: AbandonmentPattern
  ): Promise<boolean> {
    // Get key characteristics of the abandoned session
    const abandonedActivities = abandonedPattern.session.activities
      .filter(a => a.analysis)
      .map(a => ({
        category: a.analysis!.category,
        subcategory: a.analysis!.subcategory,
        brand: a.analysis!.brand,
        url: a.analysis!.url,
        pageDesc: a.analysis!.pageDescription
      }));
    
    if (abandonedActivities.length === 0) return false;
    
    // Get characteristics of the new session
    const newActivities = session.activities
      .filter(a => a.analysis)
      .map(a => ({
        category: a.analysis!.category,
        subcategory: a.analysis!.subcategory,
        brand: a.analysis!.brand,
        url: a.analysis!.url,
        pageDesc: a.analysis!.pageDescription
      }));
    
    if (newActivities.length === 0) return false;
    
    // Simple heuristics for relatedness
    // 1. Check if primary categories match
    const categoriesMatch = abandonedActivities.some(a => 
      newActivities.some(n => n.category === a.category)
    );
    
    // 2. Check if any URLs/domains match
    const domainsMatch = abandonedActivities.some(a => {
      const abandonedDomain = new URL(a.url).hostname;
      return newActivities.some(n => new URL(n.url).hostname === abandonedDomain);
    });
    
    // 3. Check if brands match (strong signal)
    const brandsMatch = abandonedActivities.some(a => 
      a.brand && newActivities.some(n => n.brand === a.brand)
    );
    
    // If we have strong signals, use LLM for semantic confirmation
    if (categoriesMatch || domainsMatch || brandsMatch) {
      return await this.llmCheckSessionRelatedness(
        abandonedPattern.intent,
        abandonedActivities,
        newActivities
      );
    }
    
    return false;
  }

  /**
   * LLM determines if new session is related to abandoned task
   */
  private async llmCheckSessionRelatedness(
    abandonedIntent: string,
    abandonedActivities: any[],
    newActivities: any[]
  ): Promise<boolean> {
    const prompt = `You are analyzing if a user resumed an abandoned task.

Original abandoned task:
Intent: ${abandonedIntent}
Pages visited: ${abandonedActivities.slice(0, 3).map(a => 
  `- ${a.category}/${a.subcategory}${a.brand ? ` (${a.brand})` : ''}\n  ${a.pageDesc.substring(0, 100)}`
).join('\n')}

New browsing session:
Pages visited: ${newActivities.slice(0, 3).map(a => 
  `- ${a.category}/${a.subcategory}${a.brand ? ` (${a.brand})` : ''}\n  ${a.pageDesc.substring(0, 100)}`
).join('\n')}

Question: Is the user continuing the same task/goal?

Consider:
- Same product/service being researched
- Same brand or competitors
- Same problem being solved
- Logical continuation of the abandoned flow

Output JSON only:
{
  "isRelated": true/false,
  "reason": "one sentence explanation",
  "confidence": 0.0-1.0
}`;

    try {
      const result = await generateText({
        model: openai('gpt-5-nano'),
        prompt,
      });

      const parsed = JSON.parse(result.text);
      return parsed.isRelated === true && parsed.confidence > 0.6;
    } catch (error) {
      console.error('[ProactiveInsights] Error checking session relatedness:', error);
      return false;
    }
  }

  // ============================================================================
  // SESSION SEGMENTATION
  // ============================================================================

  /**
   * Segment activities into meaningful browsing sessions using LLM
   */
  private async segmentSessions(
    activities: EnrichedActivity[],
    userId: string
  ): Promise<BrowsingSession[]> {
    if (activities.length === 0) return [];
    
    // Check if activities have pre-existing sessionIds (from synthetic data)
    const hasPreexistingSessionIds = activities.every(a => a.activity.sessionId);
    
    if (hasPreexistingSessionIds) {
      // Use pre-existing session boundaries (for synthetic data)
      console.log(`[ProactiveInsights] Using pre-existing session boundaries from activities`);
      const sessionMap = new Map<string, EnrichedActivity[]>();
      
      for (const activity of activities) {
        const sessionId = activity.activity.sessionId;
        if (!sessionMap.has(sessionId)) {
          sessionMap.set(sessionId, []);
        }
        sessionMap.get(sessionId)!.push(activity);
      }
      
      return Array.from(sessionMap.values()).map(sessionActivities => 
        this.createSession(sessionActivities, userId)
      );
    }
    
    // Otherwise, use LLM-based semantic segmentation (for real user data)
    console.log(`[ProactiveInsights] Using LLM-based session segmentation`);
    const sessions: BrowsingSession[] = [];
    let currentSession: EnrichedActivity[] = [activities[0]];
    
    for (let i = 1; i < activities.length; i++) {
      const prev = activities[i - 1];
      const curr = activities[i];
      
      // LLM decides if context switched (pure semantic segmentation)
      if (prev.analysis && curr.analysis) {
        const decision = await this.llmDecideSessionBoundary(prev.analysis, curr.analysis);
        
        if (decision.decision === 'NEW') {
          sessions.push(this.createSession(currentSession, userId));
          currentSession = [curr];
          console.log(`[ProactiveInsights] Session boundary: ${decision.reason}`);
          continue;
        }
      }
      
      currentSession.push(curr);
    }
    
    // Add final session
    if (currentSession.length > 0) {
      sessions.push(this.createSession(currentSession, userId));
    }
    
    return sessions;
  }

  /**
   * LLM decides if there's a session boundary between two pages
   */
  private async llmDecideSessionBoundary(
    prev: ContentAnalysis,
    curr: ContentAnalysis
  ): Promise<SessionBoundaryDecision> {
    const prompt = `You are analyzing browsing behavior to detect context switches.

Previous page:
- URL: ${prev.url}
- Title: ${prev.rawText.title}
- Category: ${prev.category} / ${prev.subcategory}
- Brand: ${prev.brand || 'N/A'}
- Page Description: ${prev.pageDescription.substring(0, 200)}...
- Screenshot Description: ${prev.screenshotDescription.substring(0, 200)}...
- Language: ${prev.primaryLanguage}

Current page:
- URL: ${curr.url}
- Title: ${curr.rawText.title}
- Category: ${curr.category} / ${curr.subcategory}
- Brand: ${curr.brand || 'N/A'}
- Page Description: ${curr.pageDescription.substring(0, 200)}...
- Screenshot Description: ${curr.screenshotDescription.substring(0, 200)}...
- Language: ${curr.primaryLanguage}

Is this a NEW SESSION (context switch) or SAME SESSION (related browsing)?

Rules:
- Different top-level categories = usually NEW (tech → shopping)
- Same brand, different pages = SAME (exploring Intercom features)
- Research on same topic = SAME (comparing products in same category)
- Language switch = often NEW (unless translation/multilingual content)
- Related subcategories = SAME (ai customer service → chatbots)

Output JSON only:
{
  "decision": "NEW" or "SAME",
  "reason": "one sentence explanation",
  "confidence": 0.0-1.0
}`;

    try {
      const result = await generateText({
        model: openai('gpt-5-nano'), // Categorical task
        prompt,
      });

      const parsed = JSON.parse(result.text);
      return {
        decision: parsed.decision === 'NEW' ? 'NEW' : 'SAME',
        reason: parsed.reason || 'No reason provided',
        confidence: parsed.confidence || 0.5
      };
    } catch (error) {
      // TODO: reformat for retrying when json parsing fails
      console.error('[ProactiveInsights] Error in session boundary decision:', error);
      // Fallback: same category = same session
      return {
        decision: prev.category === curr.category ? 'SAME' : 'NEW',
        reason: 'Fallback: category comparison',
        confidence: 0.3
      };
    }
  }

  /**
   * Create a session object from activities
   */
  private createSession(activities: EnrichedActivity[], userId: string): BrowsingSession {
    const startTime = new Date(activities[0].activity.timestamp);
    const endTime = new Date(activities[activities.length - 1].activity.timestamp);
    const duration = endTime.getTime() - startTime.getTime();
    
    // Determine primary category (most common)
    const categories = activities
      .map(a => a.analysis?.category)
      .filter(Boolean) as string[];
    const primaryCategory = this.mostCommon(categories);
    
    // Use the actual sessionId from the activities (they all share the same sessionId)
    // instead of generating a new one, so we can later retrieve tabs from these sessions
    const sessionId = activities[0].activity.sessionId;
    
    return {
      sessionId,
      userId,
      startTime,
      endTime,
      duration,
      activities,
      primaryCategory
    };
  }

  // ============================================================================
  // PATTERN DETECTION
  // ============================================================================

  /**
   * Find sequential patterns (workflows)
   */
  private async findSequentialPatterns(sessions: BrowsingSession[]): Promise<SequentialPattern[]> {
    console.log(`[ProactiveInsights] Finding sequential patterns from ${sessions.length} sessions...`);
    
    // Extract content-based sequences (category + subcategory + brand tuples)
    const contentSequences = sessions
      .filter(s => s.activities.length >= 2 && s.activities.length <= 5)
      .map(session => ({
        session,
        sequence: session.activities
          .filter(a => a.analysis)
          .map(a => ({
            category: a.analysis!.category,
            subcategory: a.analysis!.subcategory,
            brand: a.analysis!.brand,
            pageDesc: a.analysis!.pageDescription,
            screenshotDesc: a.analysis!.screenshotDescription,
            url: a.analysis!.url,
            title: a.analysis!.rawText.title
          }))
      }))
      .filter(s => s.sequence.length >= 2);
    
    console.log(`[ProactiveInsights] Found ${contentSequences.length} content sequences with 2+ activities`);
    
    if (contentSequences.length < 2) {
      console.log('[ProactiveInsights] Not enough sequences for pattern detection');
      return [];
    }
    
    // Compare sequences to find similar ones
    const patterns: Map<string, SequentialPattern> = new Map();
    
    for (let i = 0; i < contentSequences.length; i++) {
      for (let j = i + 1; j < contentSequences.length; j++) {
        const seq1 = contentSequences[i].sequence;
        const seq2 = contentSequences[j].sequence;
        
        const similarity = this.compareSequences(seq1, seq2);
        
        // More than only category match
        if (similarity > 0.2) {
          // Found a matching pattern
          const patternKey = this.generateSequenceKey(seq1);
          
          if (!patterns.has(patternKey)) {
            patterns.set(patternKey, {
              type: 'sequential',
              patternId: `seq-${patternKey}`,
              steps: seq1.map(s => ({
                category: s.category,
                subcategory: s.subcategory,
                brand: s.brand,
                pageDescriptionSummary: s.pageDesc.substring(0, 100),
                screenshotDescriptionSummary: s.screenshotDesc.substring(0, 100),
                url: s.url
              })),
              frequency: 2,
              avgDuration: contentSequences[i].session.duration,
              lastOccurrence: contentSequences[i].session.endTime,
              semanticTheme: '',
              score: 0
            });
          } else {
            const pattern = patterns.get(patternKey)!;
            pattern.frequency += 1;
            pattern.lastOccurrence = new Date(
              Math.max(
                pattern.lastOccurrence.getTime(),
                contentSequences[j].session.endTime.getTime()
              )
            );
          }
        }
      }
    }
    
    // Filter by minimum frequency
    const allPatterns = Array.from(patterns.values());
    console.log(`[ProactiveInsights] Found ${allPatterns.length} raw patterns before frequency filter`);
    const frequentPatterns = allPatterns.filter(p => p.frequency >= 2);
    console.log(`[ProactiveInsights] ${frequentPatterns.length} patterns with frequency >= 2`);
    
    // Enrich with semantic themes using LLM
    for (const pattern of frequentPatterns) {
      pattern.semanticTheme = await this.llmExtractWorkflowTheme(pattern);
    }
    
    console.log(`[ProactiveInsights] Found ${frequentPatterns.length} sequential patterns`);
    return frequentPatterns;
  }

  /**
   * Compare two sequences for similarity
   */
  private compareSequences(seq1: any[], seq2: any[]): number {
    // Must have similar length
    if (Math.abs(seq1.length - seq2.length) > 1) return 0;
    
    const minLen = Math.min(seq1.length, seq2.length);
    let totalSimilarity = 0;
    
    for (let i = 0; i < minLen; i++) {
      
      // Category match (20% weight)
      const categoryMatch = seq1[i].category === seq2[i].category ? 0.2 : 0;
      
      // Subcategory match (40% weight)
      const subcategoryMatch = seq1[i].subcategory === seq2[i].subcategory ? 0.4 : 0;
      
      // Brand match (40% weight)
      const brandMatch = seq1[i].brand === seq2[i].brand ? 0.4 : 0;
      
      totalSimilarity += categoryMatch + subcategoryMatch + brandMatch;
    }
    
    return totalSimilarity / minLen;
  }

  /**
   * Generate a unique key for a sequence
   */
  private generateSequenceKey(sequence: any[]): string {
    return sequence
      .map(s => `${s.category}:${s.subcategory}:${s.brand || 'none'}`)
      .join('|');
  }

  /**
   * LLM extracts semantic theme from workflow
   */
  private async llmExtractWorkflowTheme(pattern: SequentialPattern): Promise<string> {
    const prompt = `Analyze this browsing workflow and give it a short, memorable name:

Steps:
${pattern.steps.map((s, i) => `
${i + 1}. ${s.category}/${s.subcategory}${s.brand ? ` (${s.brand})` : ''}
   Description: ${s.pageDescriptionSummary}
`).join('\n')}

Frequency: ${pattern.frequency} times

What is the user accomplishing? Name this workflow in 3-5 words.
Examples: "Daily news catchup", "Product comparison research", "Weekly expense reporting"

Output only the name, nothing else.`;

    try {
      const result = await generateText({
        model: openai('gpt-5-nano'),
        prompt,
      });

      return result.text.trim().replace(/['"]/g, '');
    } catch (error) {
      console.error('[ProactiveInsights] Error extracting theme:', error);
      return `${pattern.steps[0].category} workflow`;
    }
  }

  /**
   * Find topic research patterns
   */
  private async findTopicPatterns(sessions: BrowsingSession[]): Promise<TopicPattern[]> {
    console.log('[ProactiveInsights] Finding topic patterns...');
    
    // Group sessions by primary category
    const categoryGroups = new Map<string, BrowsingSession[]>();
    for (const session of sessions) {
      if (session.primaryCategory) {
        if (!categoryGroups.has(session.primaryCategory)) {
          categoryGroups.set(session.primaryCategory, []);
        }
        categoryGroups.get(session.primaryCategory)!.push(session);
      }
    }
    
    // Prepare all pattern data first (without LLM calls)
    const patternData: Array<{
      category: string;
      sessionGroup: BrowsingSession[];
      allContent: any[];
      totalTime: number;
      lastOccurrence: Date;
    }> = [];
    
    for (const [category, sessionGroup] of categoryGroups) {
      if (sessionGroup.length < 2) continue; // Need recurrence
      
      // Collect all content from these sessions
      const allContent = sessionGroup.flatMap(s =>
        s.activities
          .filter(a => a.analysis)
          .map(a => ({
            pageDesc: a.analysis!.pageDescription,
            subcategory: a.analysis!.subcategory,
            brand: a.analysis!.brand,
            screenshotDesc: a.analysis!.screenshotDescription,
            title: a.analysis!.rawText.title
          }))
      );
      
      const totalTime = sessionGroup.reduce((sum, s) => sum + s.duration, 0);
      const lastOccurrence = new Date(
        Math.max(...sessionGroup.map(s => s.endTime.getTime()))
      );
      
      patternData.push({
        category,
        sessionGroup,
        allContent,
        totalTime,
        lastOccurrence
      });
    }
    
    // Run LLM analysis in parallel for all patterns (limit to top 10 by session count)
    const topPatternData = patternData
      .sort((a, b) => b.sessionGroup.length - a.sessionGroup.length)
      .slice(0, 10);
    
    const analyses = await Promise.all(
      topPatternData.map(data => 
        this.llmAnalyzeResearchTopic(data.category, data.allContent)
      )
    );
    
    // Build final patterns
    const patterns: TopicPattern[] = topPatternData.map((data, index) => ({
      type: 'research_topic',
      patternId: `topic-${data.category}-${Date.now()}-${index}`,
      mainCategory: data.category,
      subcategories: [...new Set(data.allContent.map(c => c.subcategory))],
      brands: [...new Set(data.allContent.map(c => c.brand).filter(Boolean))],
      semanticSummary: analyses[index].summary,
      sessions: data.sessionGroup,
      totalTime: data.totalTime,
      pagesSeen: data.allContent.length,
      keyInsights: analyses[index].insights,
      lastOccurrence: data.lastOccurrence,
      score: 0
    }));
    
    console.log(`[ProactiveInsights] Found ${patterns.length} topic patterns`);
    return patterns;
  }

  /**
   * LLM analyzes a research topic
   */
  private async llmAnalyzeResearchTopic(
    category: string,
    content: any[]
  ): Promise<{ summary: string; insights: string[] }> {
    const prompt = `User has been researching: ${category}

Pages visited:
${content.slice(0, 10).map((c, i) => `
${i + 1}. ${c.subcategory}${c.brand ? ` - ${c.brand}` : ''}
   ${c.pageDesc.substring(0, 150)}
`).join('\n')}
${content.length > 10 ? `\n... and ${content.length - 10} more pages` : ''}

Task: Analyze what the user is trying to learn or accomplish.

Output JSON:
{
  "summary": "One sentence describing the research goal",
  "insights": ["Key finding 1", "Key finding 2", "Key finding 3"]
}

Be specific and actionable.`;

    try {
      const result = await generateText({
        model: openai('gpt-5-mini'), // Conversational task
        prompt,
      });

      // Extract JSON from potential markdown wrapper or extra text
      let jsonText = result.text.trim();
      const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || 
                        jsonText.match(/(\{[\s\S]*\})/);
      
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonText);
      return {
        summary: parsed.summary || 'Summary unavailable',
        insights: parsed.insights || []
      };
    } catch (error) {
      console.error('[ProactiveInsights] Error analyzing research topic:', error);
      return {
        summary: `Researching ${category}`,
        insights: []
      };
    }
  }

  /**
   * Find abandoned tasks
   */
  private async findAbandonedTasks(sessions: BrowsingSession[]): Promise<AbandonmentPattern[]> {
    console.log('[ProactiveInsights] Finding abandoned tasks...');
    
    // Filter candidate sessions first
    const candidateSessions = sessions.filter(session => {
      if (session.activities.length < 2) return false;
      
      const hasAnalysis = session.activities.some(a => a.analysis);
      if (!hasAnalysis) return false;
      
      if (session.duration < 30000) return false;
      
      return true;
    });
    
    // Limit to most recent 15 sessions for performance
    const sessionsToAnalyze = candidateSessions
      .sort((a, b) => b.endTime.getTime() - a.endTime.getTime())
      .slice(0, 15);
    
    // Run LLM analysis in parallel
    const analyses = await Promise.all(
      sessionsToAnalyze.map(session => 
        this.llmAnalyzeCompletion(session)
      )
    );
    
    // Build abandoned tasks from analysis results
    const abandoned: AbandonmentPattern[] = [];
    for (let i = 0; i < sessionsToAnalyze.length; i++) {
      const session = sessionsToAnalyze[i];
      const analysis = analyses[i];
      
      const isMeaningful = this.isAbandonmentAnalysisMeaningful(analysis);
      
      if (analysis.completionScore < 0.6 && isMeaningful) {
        abandoned.push({
          type: 'abandoned',
          patternId: `abandoned-${session.sessionId}`,
          session,
          intent: analysis.intent,
          progressMade: analysis.progress,
          whyAbandoned: analysis.reason,
          completionScore: analysis.completionScore,
          suggestions: analysis.suggestions,
          lastOccurrence: session.endTime,
          score: 0
        });
      } else if (!isMeaningful) {
        console.log(`[ProactiveInsights] Skipping abandoned task with generic analysis: ${analysis.intent}`);
      }
    }
    
    console.log(`[ProactiveInsights] Found ${abandoned.length} abandoned tasks`);
    return abandoned;
  }

  /**
   * LLM analyzes if a session's task was completed
   */
  private async llmAnalyzeCompletion(
    session: BrowsingSession
  ): Promise<{
    intent: string;
    progress: string;
    reason: string;
    completionScore: number;
    suggestions: string[];
  }> {
    const content = session.activities
      .filter(a => a.analysis)
      .map(a => ({
        category: a.analysis!.category,
        subcategory: a.analysis!.subcategory,
        brand: a.analysis!.brand,
        pageDesc: a.analysis!.pageDescription.substring(0, 150),
        title: a.analysis!.rawText.title,
        timeSpent: a.activity.data.timeOnPage || 0,
        exitMethod: a.activity.data.exitMethod || 'unknown'
      }));
    
    const prompt = `Analyze this browsing session to determine if the user completed their task:

Session timeline:
${content.map((c, i) => `
${i + 1}. ${c.category}/${c.subcategory}${c.brand ? ` (${c.brand})` : ''}
   Page: ${c.pageDesc}
   Time: ${Math.round(c.timeSpent / 1000)}s
   Exit: ${c.exitMethod}
`).join('\n')}

Total duration: ${Math.round(session.duration / 60000)} minutes

Questions:
1. What was the user trying to accomplish? (their intent)
2. What progress did they make?
3. Did they complete the task or abandon it? Why?
4. Completion score (0.0 = clearly abandoned, 1.0 = clearly completed)
5. If abandoned, what are 2-3 ways to help them resume?

Output JSON:
{
  "intent": "string",
  "progress": "string",
  "reason": "string (why completed/abandoned)",
  "completionScore": 0.0-1.0,
  "suggestions": ["suggestion 1", "suggestion 2"]
}`;

    try {
      const result = await generateText({
        model: openai('gpt-5-mini'), // Conversational task
        prompt,
      });

      const parsed = JSON.parse(result.text);
      return {
        intent: parsed.intent || 'Unknown intent',
        progress: parsed.progress || 'Unknown progress',
        reason: parsed.reason || 'Unknown reason',
        completionScore: parsed.completionScore || 0.5,
        suggestions: parsed.suggestions || []
      };
    } catch (error) {
      console.error('[ProactiveInsights] Error analyzing completion:', error);
      return {
        intent: 'Unknown',
        progress: 'Unknown',
        reason: 'Analysis failed',
        completionScore: 0.5,
        suggestions: []
      };
    }
  }

  /**
   * Validate that abandonment analysis is meaningful (not fallback/error values)
   */
  private isAbandonmentAnalysisMeaningful(analysis: {
    intent: string;
    progress: string;
    reason: string;
    completionScore: number;
    suggestions: string[];
  }): boolean {
    // List of generic/fallback values that indicate failed analysis
    const genericTerms = [
      'unknown',
      'analysis failed',
      'no reason provided',
      'n/a',
      'error',
      'unable to determine',
      'not clear',
      'unclear'
    ];
    
    // Check if intent is generic
    const intentLower = analysis.intent.toLowerCase();
    const isGenericIntent = genericTerms.some(term => intentLower.includes(term));
    
    if (isGenericIntent) {
      return false;
    }
    
    // Check if progress is generic
    const progressLower = analysis.progress.toLowerCase();
    const isGenericProgress = genericTerms.some(term => progressLower.includes(term));
    
    if (isGenericProgress) {
      return false;
    }
    
    // Check if we have at least one suggestion
    if (analysis.suggestions.length === 0) {
      return false;
    }
    
    // Intent should be at least somewhat descriptive (more than 10 chars)
    if (analysis.intent.length < 10) {
      return false;
    }
    
    return true;
  }

  /**
   * Find temporal patterns (time-based habits)
   */
  private async findTemporalPatterns(activities: EnrichedActivity[]): Promise<TemporalPattern[]> {
    console.log('[ProactiveInsights] Finding temporal patterns...');
    
    // Group by (day_of_week, hour, domain)
    const timeBuckets = new Map<string, { count: number; lastOccurrence: Date }>();
    
    for (const activity of activities) {
      if (!activity.analysis) continue;
      
      const date = new Date(activity.activity.timestamp);
      const domain = new URL(activity.analysis.url).hostname;
      const key = `${date.getDay()}-${date.getHours()}-${domain}`;
      
      if (!timeBuckets.has(key)) {
        timeBuckets.set(key, { count: 0, lastOccurrence: date });
      }
      
      const bucket = timeBuckets.get(key)!;
      bucket.count += 1;
      if (date > bucket.lastOccurrence) {
        bucket.lastOccurrence = date;
      }
    }
    
    // Find patterns with frequency >= 3
    const patterns: TemporalPattern[] = [];
    
    for (const [key, data] of timeBuckets) {
      if (data.count >= 3) {
        const [day, hour, domain] = key.split('-');
        patterns.push({
          type: 'temporal',
          patternId: `temporal-${key}`,
          dayOfWeek: parseInt(day),
          hour: parseInt(hour),
          domain,
          frequency: data.count,
          confidence: data.count / 10, // Simple confidence
          lastOccurrence: data.lastOccurrence,
          score: 0
        });
      }
    }
    
    console.log(`[ProactiveInsights] Found ${patterns.length} temporal patterns`);
    return patterns;
  }

  // ============================================================================
  // SCORING & RANKING
  // ============================================================================

  /**
   * Score and rank patterns by importance
   */
  private rankPatterns(patterns: Pattern[]): Pattern[] {
    for (const pattern of patterns) {
      pattern.score = this.calculatePatternScore(pattern);
    }
    
    return patterns.sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate composite score for a pattern
   */
  private calculatePatternScore(pattern: Pattern): number {
    const now = Date.now();
    
    // Frequency score (0-1)
    let frequencyScore = 0;
    if (pattern.type === 'sequential') {
      // Workflows detected even once (frequency >= 2) are valuable - boost their score
      frequencyScore = Math.min(pattern.frequency / 5, 1.0); // More generous: 2/5 = 0.4 instead of 2/10 = 0.2
    } else if (pattern.type === 'research_topic') {
      frequencyScore = Math.min(pattern.sessions.length / 10, 1.0);
    } else if (pattern.type === 'temporal') {
      frequencyScore = Math.min(pattern.frequency / 10, 1.0);
    } else if (pattern.type === 'abandoned') {
      frequencyScore = 1.0 - pattern.completionScore; // Lower completion = higher score
    }
    
    // Recency score (0-1, exponential decay)
    const daysAgo = (now - pattern.lastOccurrence.getTime()) / (1000 * 60 * 60 * 24);
    const recencyScore = 1.0 / (1 + daysAgo * 0.1);
    
    // Impact score (0-1, estimated time saved)
    let impactScore = 0;
    if (pattern.type === 'sequential') {
      // Workflows have high impact potential - boost the score
      impactScore = Math.min(pattern.steps.length * 10 / 60, 1.0); // 10s per step
    } else if (pattern.type === 'research_topic') {
      impactScore = Math.min(pattern.totalTime / (1000 * 60 * 60), 1.0); // Hours spent
    } else if (pattern.type === 'abandoned') {
      impactScore = Math.min(pattern.session.duration / (1000 * 60 * 30), 0.5); // 30min max
    } else if (pattern.type === 'temporal') {
      impactScore = Math.min(pattern.frequency / 20, 1.0);
    }
    
    // Weighted composite - boost sequential patterns slightly
    const baseScore = (
      frequencyScore * 0.3 +
      recencyScore * 0.3 +
      impactScore * 0.4
    );

    console.log(`[ProactiveInsights] Frequency score: ${frequencyScore}`);
    console.log(`[ProactiveInsights] Recency score: ${recencyScore}`);
    console.log(`[ProactiveInsights] Impact score: ${impactScore}`);
    console.log(`[ProactiveInsights] Base score for ${pattern.type}: ${baseScore}`);
    
    // Give workflow patterns a 100% boost to prioritize them
    const finalScore = pattern.type === 'sequential' ? Math.min(baseScore * 2, 1.0) : baseScore;
    console.log(`[ProactiveInsights] Final score for ${pattern.type}: ${finalScore}`);
    return finalScore;
  }

  // ============================================================================
  // INSIGHT GENERATION
  // ============================================================================

  /**
   * Generate actionable insights from patterns
   */
  private async generateInsights(
    patterns: Pattern[],
    userId: string,
    topN: number = 10
  ): Promise<ProactiveInsight[]> {
    console.log('[ProactiveInsights] Generating actionable insights...');
    
    const insights: ProactiveInsight[] = [];
    
    // Take top N patterns
    const topPatterns = patterns.slice(0, topN);
    
    for (const pattern of topPatterns) {
      const insight = await this.generateInsightFromPattern(pattern, userId);
      if (insight) {
        insights.push(insight);
      }
    }
    
    return insights;
  }

  /**
   * Generate a single insight from a pattern
   */
  private async generateInsightFromPattern(
    pattern: Pattern,
    userId: string
  ): Promise<ProactiveInsight | null> {
    try {
      if (pattern.type === 'sequential') {
        return {
          id: `insight-${pattern.patternId}`,
          userId,
          type: 'workflow',
          title: `Detected workflow: ${pattern.semanticTheme}`,
          description: `You've done this ${pattern.frequency} times. Would you like me to create a quick action?`,
          actionType: 'open_urls',
          actionParams: {
            urls: pattern.steps.map(s => s.url)
          },
          patterns: [pattern],
          relevanceScore: pattern.score,
          createdAt: new Date(),
          status: 'pending'
        };
      } else if (pattern.type === 'research_topic') {
        return {
          id: `insight-${pattern.patternId}`,
          userId,
          type: 'research',
          title: `Research summary: ${pattern.mainCategory}`,
          description: pattern.semanticSummary,
          actionType: 'resume_research',
          actionParams: {
            category: pattern.mainCategory,
            insights: pattern.keyInsights
          },
          patterns: [pattern],
          relevanceScore: pattern.score,
          createdAt: new Date(),
          status: 'pending',
          linkedSessionIds: pattern.sessions.map(s => s.sessionId)
        };
      } else if (pattern.type === 'abandoned') {
        // Additional validation: skip if intent is too generic or suspicious
        const intentLower = pattern.intent.toLowerCase();
        const suspiciousTerms = ['unknown', 'no action', 'did not navigate', 'likely'];
        
        if (suspiciousTerms.some(term => intentLower.includes(term))) {
          console.log(`[ProactiveInsights] Skipping insight with suspicious intent: ${pattern.intent}`);
          return null;
        }
        
        // Get the last URL from the session - prefer activity URL, fallback to analysis URL
        const lastActivity = pattern.session.activities[pattern.session.activities.length - 1];
        const lastUrl = lastActivity?.activity?.data?.url || lastActivity?.analysis?.url;
        
        // Skip if no URL available (can't resume)
        if (!lastUrl) {
          console.log(`[ProactiveInsights] Skipping abandoned task with no URL`);
          return null;
        }
        
        // Get the session ID for potential resumption
        const sessionId = pattern.session.sessionId;
        
        console.log(`[ProactiveInsights] Creating abandoned task insight: ${pattern.intent}, lastUrl: ${lastUrl}, sessionId: ${sessionId}`);
        
        return {
          id: `insight-${pattern.patternId}`,
          userId,
          type: 'abandoned',
          title: `Unfinished: ${pattern.intent}`,
          description: `You were ${pattern.progressMade}. ${pattern.suggestions[0] || 'Want to continue?'}`,
          actionType: 'resume_research',
          actionParams: {
            suggestions: pattern.suggestions,
            lastUrl,
            sessionId
          },
          patterns: [pattern],
          relevanceScore: pattern.score,
          createdAt: new Date(),
          status: 'pending',
          linkedSessionIds: [sessionId], // Initialize with the original abandoned session
          completionProgress: pattern.completionScore
        };
      } else if (pattern.type === 'temporal') {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return {
          id: `insight-${pattern.patternId}`,
          userId,
          type: 'habit',
          title: `Habit detected: ${pattern.domain}`,
          description: `You usually visit ${pattern.domain} on ${days[pattern.dayOfWeek]} at ${pattern.hour}:00`,
          actionType: 'remind',
          actionParams: {
            domain: pattern.domain,
            dayOfWeek: pattern.dayOfWeek,
            hour: pattern.hour
          },
          patterns: [pattern],
          relevanceScore: pattern.score,
          createdAt: new Date(),
          status: 'pending'
        };
      }
    } catch (error) {
      console.error('[ProactiveInsights] Error generating insight:', error);
    }
    
    return null;
  }

  /**
   * Check if an insight should be triggered
   */
  private async shouldTrigger(
    insight: ProactiveInsight,
    currentUrl: string,
    _recentActivities: Activity[] // Prefix with _ to indicate intentionally unused for now
  ): Promise<boolean> {
    // Simple triggering logic for now
    // Can be enhanced with more sophisticated rules
    
    if (insight.type === 'workflow') {
      // Check if current URL matches start of workflow
      const firstUrl = insight.actionParams.urls[0];
      return currentUrl.includes(new URL(firstUrl).hostname);
    }
    
    if (insight.type === 'habit') {
      // Check if current time matches habit time
      const now = new Date();
      return (
        now.getDay() === insight.actionParams.dayOfWeek &&
        now.getHours() === insight.actionParams.hour
      );
    }
    
    // Always show abandoned and research insights
    return insight.type === 'abandoned' || insight.type === 'research';
  }

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  /**
   * Load user activities from raw activity logs
   */
  private async loadUserActivities(userId: string): Promise<Activity[]> {
    const userDataPath = join(this.usersDir, 'user-data', userId, 'raw-activity');
    
    try {
      const files = await fs.readdir(userDataPath);
      const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse().slice(0, 30); // Last 30 days
      
      const allActivities: Activity[] = [];
      
      for (const file of jsonFiles) {
        const filePath = join(userDataPath, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const activities = JSON.parse(content) as Activity[];
        allActivities.push(...activities);
      }
      
      return allActivities.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    } catch (error) {
      console.error('[ProactiveInsights] Error loading activities:', error);
      return [];
    }
  }

  /**
   * Load content analyses
   */
  private async loadContentAnalyses(userId: string): Promise<ContentAnalysis[]> {
    const analysisPath = join(this.usersDir, 'user-data', userId, 'content-analysis');
    
    try {
      const files = await fs.readdir(analysisPath);
      const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse().slice(0, 30); // Last 30 days
      
      const allAnalyses: ContentAnalysis[] = [];
      
      for (const file of jsonFiles) {
        try {
          const filePath = join(analysisPath, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const analyses = JSON.parse(content);
          
          // Ensure it's an array before spreading
          if (Array.isArray(analyses)) {
            allAnalyses.push(...analyses);
          } else {
            console.warn(`[ProactiveInsights] Content analysis file ${file} is not an array, skipping`);
          }
        } catch (err) {
          console.error(`[ProactiveInsights] Error loading content analysis file ${file}:`, err);
          // Continue with next file
        }
      }
      
      return allAnalyses;
    } catch (error) {
      console.error('[ProactiveInsights] Error loading content analyses:', error);
      return [];
    }
  }

  /**
   * Enrich activities with content analysis
   */
  private enrichActivities(
    activities: Activity[],
    contentAnalyses: ContentAnalysis[]
  ): EnrichedActivity[] {
    // Create a map for quick lookup
    const analysisMap = new Map<string, ContentAnalysis>();
    for (const analysis of contentAnalyses) {
      for (const activityId of analysis.activityIds) {
        analysisMap.set(activityId, analysis);
      }
    }
    
    // Enrich activities
    return activities
      .filter(a => a.data.url) // Only keep activities with URLs
      .map(activity => ({
        activity,
        analysis: analysisMap.get(activity.id)
      }));
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Find most common element in array
   */
  private mostCommon<T>(arr: T[]): T | undefined {
    if (arr.length === 0) return undefined;
    
    const counts = new Map<T, number>();
    for (const item of arr) {
      counts.set(item, (counts.get(item) || 0) + 1);
    }
    
    let max = 0;
    let result: T | undefined;
    for (const [item, count] of counts) {
      if (count > max) {
        max = count;
        result = item;
      }
    }
    
    return result;
  }

  // ============================================================================
  // PERSISTENCE
  // ============================================================================

  /**
   * Get path to insights file
   */
  private getInsightsFilePath(userId: string): string {
    return join(this.usersDir, 'user-data', userId, 'insights.json');
  }

  /**
   * Get path to generation metadata file
   */
  private getMetadataFilePath(userId: string): string {
    return join(this.usersDir, 'user-data', userId, 'insights-metadata.json');
  }

  /**
   * Load insights from disk
   */
  private async loadInsights(userId: string): Promise<ProactiveInsight[]> {
    const filePath = this.getInsightsFilePath(userId);
    
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const insights = JSON.parse(fileContent);
      
      // Convert date strings back to Date objects and migrate legacy format
      const loadedInsights = insights.map((i: any) => {
        // Migrate legacy actedUpon to new status system
        let status: 'pending' | 'in_progress' | 'completed' = i.status || 'pending';
        if (!i.status && i.actedUpon) {
          status = 'completed';
        }
        
        // Convert dates in patterns as well
        const patterns = i.patterns?.map((p: any) => {
          const pattern: any = {
            ...p,
            lastOccurrence: p.lastOccurrence ? new Date(p.lastOccurrence) : undefined
          };
          
          // Convert dates in sessions (for TopicPattern and AbandonmentPattern)
          if (p.sessions) {
            pattern.sessions = p.sessions.map((s: any) => ({
              ...s,
              startTime: s.startTime ? new Date(s.startTime) : undefined,
              endTime: s.endTime ? new Date(s.endTime) : undefined,
              activities: s.activities?.map((a: any) => ({
                ...a,
                activity: {
                  ...a.activity,
                  timestamp: a.activity?.timestamp ? new Date(a.activity.timestamp) : undefined
                }
              })) || []
            }));
          }
          
          // Convert dates in single session (for AbandonmentPattern)
          if (p.session) {
            pattern.session = {
              ...p.session,
              startTime: p.session.startTime ? new Date(p.session.startTime) : undefined,
              endTime: p.session.endTime ? new Date(p.session.endTime) : undefined,
              activities: p.session.activities?.map((a: any) => ({
                ...a,
                activity: {
                  ...a.activity,
                  timestamp: a.activity?.timestamp ? new Date(a.activity.timestamp) : undefined
                }
              })) || []
            };
          }
          
          return pattern;
        }) || [];
        
        return {
          ...i,
          status,
          patterns,
          createdAt: new Date(i.createdAt),
          triggeredAt: i.triggeredAt ? new Date(i.triggeredAt) : undefined,
          actedUponAt: i.actedUponAt ? new Date(i.actedUponAt) : undefined,
          lastResumedAt: i.lastResumedAt ? new Date(i.lastResumedAt) : undefined,
          linkedSessionIds: i.linkedSessionIds || [],
          completionProgress: i.completionProgress || 0
        };
      });
      
      // Deduplicate insights by ID - keep the one with the most progressed status
      const statusPriority = { completed: 3, in_progress: 2, pending: 1 };
      const deduplicatedMap = new Map<string, ProactiveInsight>();
      
      for (const insight of loadedInsights) {
        const existing = deduplicatedMap.get(insight.id);
        if (!existing || statusPriority[insight.status] > statusPriority[existing.status]) {
          deduplicatedMap.set(insight.id, insight);
        }
      }
      
      const deduplicated = Array.from(deduplicatedMap.values());
      
      // Log if we found duplicates
      if (deduplicated.length < loadedInsights.length) {
        console.log(`[ProactiveInsights] Deduplicated ${loadedInsights.length - deduplicated.length} duplicate insights`);
      }
      
      return deduplicated;
    } catch {
      // File doesn't exist yet
      return [];
    }
  }

  /**
   * Save insights to disk
   */
  private async saveInsights(userId: string, insights: ProactiveInsight[]): Promise<void> {
    const filePath = this.getInsightsFilePath(userId);
    
    try {
      // Deduplicate before saving - keep the one with the most progressed status
      const statusPriority = { completed: 3, in_progress: 2, pending: 1 };
      const deduplicatedMap = new Map<string, ProactiveInsight>();
      
      for (const insight of insights) {
        const existing = deduplicatedMap.get(insight.id);
        if (!existing || statusPriority[insight.status] > statusPriority[existing.status]) {
          deduplicatedMap.set(insight.id, insight);
        }
      }
      
      const deduplicated = Array.from(deduplicatedMap.values());
      
      // Log if we're removing duplicates
      if (deduplicated.length < insights.length) {
        console.log(`[ProactiveInsights] Removing ${insights.length - deduplicated.length} duplicate insights before saving`);
      }
      
      // Ensure directory exists
      await fs.mkdir(join(this.usersDir, 'user-data', userId), { recursive: true });
      
      // Save insights
      await fs.writeFile(filePath, JSON.stringify(deduplicated, null, 2));
      
      console.log(`[ProactiveInsights] Saved ${deduplicated.length} insights for user ${userId}`);
    } catch (error) {
      console.error('[ProactiveInsights] Error saving insights:', error);
      throw error;
    }
  }

  /**
   * Load generation metadata
   */
  private async loadGenerationMetadata(userId: string): Promise<InsightGenerationMetadata | null> {
    const filePath = this.getMetadataFilePath(userId);
    
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(fileContent);
    } catch {
      // File doesn't exist yet
      return null;
    }
  }

  /**
   * Save generation metadata
   */
  private async saveGenerationMetadata(userId: string, metadata: InsightGenerationMetadata): Promise<void> {
    const filePath = this.getMetadataFilePath(userId);
    
    try {
      // Ensure directory exists
      await fs.mkdir(join(this.usersDir, 'user-data', userId), { recursive: true });
      
      // Save metadata
      await fs.writeFile(filePath, JSON.stringify(metadata, null, 2));
      
      console.log(`[ProactiveInsights] Saved generation metadata for user ${userId}`);
    } catch (error) {
      console.error('[ProactiveInsights] Error saving metadata:', error);
      throw error;
    }
  }

  /**
   * Get path to saved workflows file
   */
  private getSavedWorkflowsFilePath(userId: string): string {
    return join(this.usersDir, 'user-data', userId, 'saved-workflows.json');
  }

  /**
   * Load saved workflows from disk
   */
  private async loadSavedWorkflows(userId: string): Promise<SavedWorkflow[]> {
    const filePath = this.getSavedWorkflowsFilePath(userId);
    
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const workflows = JSON.parse(fileContent);
      
      // Convert date strings back to Date objects
      return workflows.map((w: any) => ({
        ...w,
        createdAt: new Date(w.createdAt),
        lastUsed: w.lastUsed ? new Date(w.lastUsed) : null
      }));
    } catch {
      // File doesn't exist yet
      return [];
    }
  }

  /**
   * Save workflows to disk
   */
  private async saveSavedWorkflows(userId: string, workflows: SavedWorkflow[]): Promise<void> {
    const filePath = this.getSavedWorkflowsFilePath(userId);
    
    try {
      // Ensure directory exists
      await fs.mkdir(join(this.usersDir, 'user-data', userId), { recursive: true });
      
      // Save workflows
      await fs.writeFile(filePath, JSON.stringify(workflows, null, 2));
      
      console.log(`[WorkflowAutomation] Saved ${workflows.length} workflows for user ${userId}`);
    } catch (error) {
      console.error('[WorkflowAutomation] Error saving workflows:', error);
      throw error;
    }
  }
}

