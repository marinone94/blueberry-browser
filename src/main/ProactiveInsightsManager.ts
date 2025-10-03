import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { promises as fs } from 'fs';
import { join } from 'path';
import type { UserDataManager } from './UserDataManager';
import type { VectorSearchManager } from './VectorSearchManager';

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
  private userDataManager: UserDataManager;
  private patternsCache: Map<string, Pattern[]> = new Map(); // userId -> patterns
  private insightsCache: Map<string, ProactiveInsight[]> = new Map(); // userId -> insights
  
  constructor(
    userDataManager: UserDataManager,
    _vectorSearchManager: VectorSearchManager // Prefix with _ to indicate intentionally unused for now
  ) {
    this.userDataManager = userDataManager;
    // vectorSearchManager reserved for future use (similarity computations)
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
      // 1. Load raw activities and content analyses
      const activities = await this.loadUserActivities(userId);
      const contentAnalyses = await this.loadContentAnalyses(userId);
      
      console.log(`[ProactiveInsights] Loaded ${activities.length} activities, ${contentAnalyses.length} analyses`);
      
      // 2. Enrich activities with content analysis
      const enrichedActivities = this.enrichActivities(activities, contentAnalyses);
      
      // 3. Segment into sessions using LLM
      const sessions = await this.segmentSessions(enrichedActivities, userId);
      console.log(`[ProactiveInsights] Segmented into ${sessions.length} sessions`);
      
      // 4. Detect patterns (parallel)
      const [sequential, topic, abandoned, temporal] = await Promise.all([
        this.findSequentialPatterns(sessions),
        this.findTopicPatterns(sessions),
        this.findAbandonedTasks(sessions),
        this.findTemporalPatterns(enrichedActivities)
      ]);
      
      const allPatterns = [...sequential, ...topic, ...abandoned, ...temporal];
      console.log(`[ProactiveInsights] Found ${allPatterns.length} patterns`);
      
      // 5. Score and rank patterns
      const rankedPatterns = this.rankPatterns(allPatterns);
      this.patternsCache.set(userId, rankedPatterns);
      
      // 6. Generate actionable insights
      const insights = await this.generateInsights(rankedPatterns, userId);
      this.insightsCache.set(userId, insights);
      
      console.log(`[ProactiveInsights] Generated ${insights.length} insights`);
      
      return insights;
    } catch (error) {
      console.error('[ProactiveInsights] Error analyzing behavior:', error);
      return [];
    }
  }

  /**
   * Get insights for a user (from cache or generate new)
   */
  async getInsights(userId: string): Promise<ProactiveInsight[]> {
    if (this.insightsCache.has(userId)) {
      return this.insightsCache.get(userId)!;
    }
    
    return this.analyzeUserBehavior(userId);
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
    
    return {
      sessionId: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
    console.log('[ProactiveInsights] Finding sequential patterns...');
    
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
        
        if (similarity > 0.7) {
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
    const frequentPatterns = Array.from(patterns.values()).filter(p => p.frequency >= 2);
    
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
      
      // Category match (40% weight)
      const categoryMatch = seq1[i].category === seq2[i].category ? 0.4 : 0;
      
      // Subcategory match (30% weight)
      const subcategoryMatch = seq1[i].subcategory === seq2[i].subcategory ? 0.3 : 0;
      
      // Brand match (30% weight)
      const brandMatch = seq1[i].brand === seq2[i].brand ? 0.3 : 0;
      
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
    
    const patterns: TopicPattern[] = [];
    
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
      
      // LLM analyzes the research topic
      const analysis = await this.llmAnalyzeResearchTopic(category, allContent);
      
      const totalTime = sessionGroup.reduce((sum, s) => sum + s.duration, 0);
      const lastOccurrence = new Date(
        Math.max(...sessionGroup.map(s => s.endTime.getTime()))
      );
      
      patterns.push({
        type: 'research_topic',
        patternId: `topic-${category}-${Date.now()}`,
        mainCategory: category,
        subcategories: [...new Set(allContent.map(c => c.subcategory))],
        brands: [...new Set(allContent.map(c => c.brand).filter(Boolean))],
        semanticSummary: analysis.summary,
        sessions: sessionGroup,
        totalTime,
        pagesSeen: allContent.length,
        keyInsights: analysis.insights,
        lastOccurrence,
        score: 0
      });
    }
    
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

      const parsed = JSON.parse(result.text);
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
    
    const abandoned: AbandonmentPattern[] = [];
    
    for (const session of sessions) {
      if (session.activities.length < 2) continue;
      
      // LLM analyzes if task was completed
      const analysis = await this.llmAnalyzeCompletion(session);
      
      if (analysis.completionScore < 0.6) {
        // Likely abandoned
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
      frequencyScore = Math.min(pattern.frequency / 10, 1.0);
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
      impactScore = Math.min(pattern.steps.length * 5 / 60, 1.0); // 5s per step
    } else if (pattern.type === 'research_topic') {
      impactScore = Math.min(pattern.totalTime / (1000 * 60 * 60), 1.0); // Hours spent
    } else if (pattern.type === 'abandoned') {
      impactScore = Math.min(pattern.session.duration / (1000 * 60 * 30), 1.0); // 30min max
    } else if (pattern.type === 'temporal') {
      impactScore = Math.min(pattern.frequency / 20, 1.0);
    }
    
    // Weighted composite
    return (
      frequencyScore * 0.3 +
      recencyScore * 0.3 +
      impactScore * 0.4
    );
  }

  // ============================================================================
  // INSIGHT GENERATION
  // ============================================================================

  /**
   * Generate actionable insights from patterns
   */
  private async generateInsights(
    patterns: Pattern[],
    userId: string
  ): Promise<ProactiveInsight[]> {
    console.log('[ProactiveInsights] Generating actionable insights...');
    
    const insights: ProactiveInsight[] = [];
    
    // Take top N patterns
    const topPatterns = patterns.slice(0, 10);
    
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
          createdAt: new Date()
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
          createdAt: new Date()
        };
      } else if (pattern.type === 'abandoned') {
        return {
          id: `insight-${pattern.patternId}`,
          userId,
          type: 'abandoned',
          title: `Unfinished: ${pattern.intent}`,
          description: `You were ${pattern.progressMade}. ${pattern.suggestions[0] || 'Want to continue?'}`,
          actionType: 'resume_research',
          actionParams: {
            suggestions: pattern.suggestions,
            lastUrl: pattern.session.activities[pattern.session.activities.length - 1].analysis?.url
          },
          patterns: [pattern],
          relevanceScore: pattern.score,
          createdAt: new Date()
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
          createdAt: new Date()
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
    const userDataPath = join(this.userDataManager['usersDir'], 'user-data', userId, 'raw-activity');
    
    try {
      const files = await fs.readdir(userDataPath);
      const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse().slice(0, 7); // Last 7 days
      
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
    const analysisPath = join(this.userDataManager['usersDir'], 'user-data', userId, 'content-analysis');
    
    try {
      const files = await fs.readdir(analysisPath);
      const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse().slice(0, 7); // Last 7 days
      
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
}

