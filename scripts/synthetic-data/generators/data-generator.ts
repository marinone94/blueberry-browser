/**
 * Main synthetic data generator orchestrator
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import cliProgress from 'cli-progress';
import type { GeneratorConfig, GenerationResult, GeneratedActivity } from '../types';
import { LLMContentGenerator } from '../utils/llm-content-generator';
import { 
  generateTimestamp, 
  generateDwellTime, 
  generateSessionDuration,
  generateSessionsPerDay,
  generateActivityGap,
  shouldGenerateActivity,
  generateScrollDepth,
  generateClickCount,
  generateExitMethod,
} from '../utils/realistic-timing';
import { PatternGenerator } from './pattern-generator';
import type { RawActivityData } from '../../../src/main/ActivityTypes';
import pLimit from 'p-limit';

export interface GeneratorOptions {
  verbose?: boolean;
  dryRun?: boolean;
}

export class SyntheticDataGenerator {
  private config: GeneratorConfig;
  private options: GeneratorOptions;
  private llm: LLMContentGenerator;
  private patternGenerator: PatternGenerator;
  private sessionId: string;
  private progressBar: cliProgress.SingleBar | null = null;
  
  private stats = {
    totalActivities: 0,
    totalSessions: 0,
    uniqueUrls: new Set<string>(),
    contentAnalyses: 0,
    patterns: new Map<string, number>(),
  };

  constructor(config: GeneratorConfig, options: GeneratorOptions = {}) {
    this.config = config;
    this.options = options;
    // Use config concurrency or default to 10
    const concurrency = config.concurrency?.llmCalls || 50;
    this.llm = new LLMContentGenerator(options.verbose, concurrency);
    this.patternGenerator = new PatternGenerator(this.llm);
    this.sessionId = this.generateSessionId();
  }

  /**
   * Generate all synthetic data
   */
  async generate(): Promise<GenerationResult> {
    const startDate = new Date(this.config.dateRange.start);
    
    // Initialize progress bar
    if (!this.options.verbose && !this.options.dryRun) {
      this.progressBar = new cliProgress.SingleBar({
        format: '🎲 Generating |{bar}| {percentage}% | Day {value}/{total} | {activities} activities | {sessions} sessions | {eta_formatted} remaining',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true,
      });
      this.progressBar.start(this.config.dateRange.days, 0, {
        activities: 0,
        sessions: 0,
      });
    }
    
    // Generate data for each day
    for (let day = 0; day < this.config.dateRange.days; day++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + day);
      
      if (this.options.verbose) {
        console.log(`\n📅 Generating day ${day + 1}/${this.config.dateRange.days}: ${currentDate.toISOString().split('T')[0]}`);
      }
      
      await this.generateDay(currentDate);
      
      // Update progress bar
      if (this.progressBar) {
        this.progressBar.update(day + 1, {
          activities: this.stats.totalActivities,
          sessions: this.stats.totalSessions,
        });
      }
    }

    // Stop progress bar
    if (this.progressBar) {
      this.progressBar.stop();
      console.log(''); // Add newline after progress bar
    }

    // Return results
    return {
      totalActivities: this.stats.totalActivities,
      totalSessions: this.stats.totalSessions,
      uniqueUrls: this.stats.uniqueUrls.size,
      contentAnalyses: this.stats.contentAnalyses,
      daysGenerated: this.config.dateRange.days,
      patterns: Object.fromEntries(this.stats.patterns),
    };
  }

  /**
   * Generate data for a single day
   */
  private async generateDay(date: Date): Promise<void> {
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const numSessions = generateSessionsPerDay(
      this.config.sessions.perDay.min,
      this.config.sessions.perDay.max,
      isWeekend,
      this.config.realism?.weekendReduction
    );

    const dailyActivities: RawActivityData[] = [];
    const dailyAnalyses: any[] = [];

    for (let s = 0; s < numSessions; s++) {
      const sessionStart = generateTimestamp(
        date, 
        this.config.realism?.peakHours
      );
      
      const sessionDuration = generateSessionDuration(
        this.config.sessions.durationMinutes.min,
        this.config.sessions.durationMinutes.max
      );

      this.sessionId = this.generateSessionId();
      this.stats.totalSessions++;

      if (this.options.verbose) {
        const timeStr = sessionStart.toTimeString().split(' ')[0];
        console.log(`  🔄 Session ${s + 1}/${numSessions} at ${timeStr} (${Math.round(sessionDuration / 60000)}min)`);
      }

      // Select pattern for this session
      const pattern = this.selectPattern();
      const patternActivities = await this.patternGenerator.generatePattern(
        pattern,
        date,
        sessionStart,
        sessionDuration
      );

      // Convert pattern activities to raw activities
      let currentTime = sessionStart.getTime();
      
      // First pass: create raw activities
      const activitiesForAnalysis: Array<{ rawActivity: RawActivityData; generatedActivity: GeneratedActivity }> = [];
      
      for (let i = 0; i < patternActivities.length; i++) {
        const activity = patternActivities[i];
        const nextActivity = patternActivities[i + 1];
        
        // Add time gap
        if (i > 0) {
          currentTime += generateActivityGap(activity.type, patternActivities[i - 1].type);
        }
        
        const activityTime = new Date(currentTime);
        
        // Check if we should generate this activity (time-based filtering)
        if (!shouldGenerateActivity(activityTime, activity.type)) {
          continue;
        }

        // Create raw activity
        const rawActivity = this.createRawActivity(
          activity,
          activityTime,
          nextActivity
        );
        
        dailyActivities.push(rawActivity);
        this.stats.totalActivities++;
        this.stats.uniqueUrls.add(activity.url);

        // Mark for content analysis if needed
        if (
          this.config.contentAnalysis.generate &&
          activity.type === 'page_visit' &&
          Math.random() < this.config.contentAnalysis.percentage
        ) {
          activitiesForAnalysis.push({ rawActivity, generatedActivity: activity });
        }

        // Advance time by dwell time for page interactions
        if (activity.type === 'page_interaction') {
          currentTime += activity.data.timeOnPage || 10000;
        }
      }

      // Second pass: parallelize content analysis generation
      if (activitiesForAnalysis.length > 0) {
        const concurrency = this.config.concurrency?.contentAnalysis || 5;
        const limit = pLimit(concurrency);
        const analyses = await Promise.all(
          activitiesForAnalysis.map(({ rawActivity, generatedActivity }) => 
            limit(async () => {
              const analysis = await this.generateContentAnalysis(rawActivity, generatedActivity);
              if (analysis) {
                this.stats.contentAnalyses++;
              }
              return analysis;
            })
          )
        );
        
        // Filter out null results
        dailyAnalyses.push(...analyses.filter(a => a !== null));
      }
    }

    // Write daily activities to file
    if (!this.options.dryRun) {
      await this.writeDailyActivities(date, dailyActivities);
      
      // Write content analyses
      if (dailyAnalyses.length > 0) {
        await this.writeContentAnalyses(date, dailyAnalyses);
      }
    }

    if (this.options.verbose) {
      console.log(`  ✅ Generated ${dailyActivities.length} activities, ${dailyAnalyses.length} analyses`);
    }
  }

  /**
   * Select a pattern based on weights
   */
  private selectPattern(): string {
    const totalWeight = this.config.patterns.reduce((sum, p) => sum + p.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const pattern of this.config.patterns) {
      random -= pattern.weight;
      if (random <= 0) {
        this.stats.patterns.set(pattern.type, (this.stats.patterns.get(pattern.type) || 0) + 1);
        return pattern.type;
      }
    }
    
    return this.config.patterns[0].type;
  }

  /**
   * Create raw activity data
   */
  private createRawActivity(
    activity: GeneratedActivity,
    timestamp: Date,
    nextActivity?: GeneratedActivity
  ): RawActivityData {
    const baseActivity: RawActivityData = {
      id: `activity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId: this.config.userId,
      timestamp,
      sessionId: this.sessionId,
      type: activity.type as any,
      data: { ...activity.data },
    };

    // Enhance data based on activity type
    switch (activity.type) {
      case 'page_visit':
        baseActivity.data = {
          url: activity.url,
          title: activity.title,
          loadTime: Math.floor(Math.random() * 2000) + 100,
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) blueberry-browser/1.0.0 Chrome/138.0.7204.251 Electron/37.5.0 Safari/537.36',
        };
        break;

      case 'page_interaction':
        const dwellTime = generateDwellTime(activity.category || 'general', activity.subcategory || 'web');
        baseActivity.data = {
          url: activity.url,
          title: activity.title,
          timeOnPage: dwellTime,
          scrollDepth: generateScrollDepth(dwellTime),
          clickCount: generateClickCount(dwellTime),
          keyboardEvents: Math.random() < 0.2 ? Math.floor(Math.random() * 50) : 0,
          focusEvents: Math.floor(Math.random() * 3),
          exitMethod: generateExitMethod(nextActivity?.type),
        };
        break;

      case 'navigation_event':
        baseActivity.data = {
          fromUrl: activity.data.fromUrl || '',
          toUrl: activity.url,
          method: activity.data.method || 'click',
          loadTime: Math.floor(Math.random() * 1000) + 50,
        };
        break;

      case 'tab_action':
        baseActivity.data = {
          action: activity.data.action || 'switch',
          tabId: activity.data.tabId || 'tab-1',
          url: activity.url,
          totalTabs: activity.data.totalTabs || 1,
        };
        break;

      case 'search_query':
        baseActivity.data = {
          query: activity.data.query || activity.title,
          searchEngine: activity.data.searchEngine || 'Google',
          resultsPage: activity.url,
          queryLength: (activity.data.query || activity.title).length,
          hasTypos: Math.random() < 0.05,
        };
        break;
    }

    return baseActivity;
  }

  /**
   * Generate content analysis for an activity
   */
  private async generateContentAnalysis(activity: RawActivityData, generatedActivity: GeneratedActivity): Promise<any | null> {
    try {
      const content = await this.llm.generateContentAnalysis(
        activity.data.url,
        activity.data.title,
        generatedActivity.category || 'general',
        generatedActivity.subcategory || 'web'
      );

      return {
        analysisId: uuidv4(),
        activityIds: [activity.id],
        userId: this.config.userId,
        timestamp: activity.timestamp.toISOString(),
        url: content.url,
        pageDescription: content.pageDescription,
        rawText: {
          title: content.title,
          metaDescription: content.metaDescription,
          fullText: content.fullText,
        },
        screenshotDescription: content.screenshotDescription,
        screenshotPath: '', // Not generating actual screenshots
        category: content.category,
        subcategory: content.subcategory,
        brand: content.brand,
        primaryLanguage: content.primaryLanguage,
        languages: content.languages,
      };
    } catch (error) {
      console.error('Failed to generate content analysis:', error);
      return null;
    }
  }

  /**
   * Write daily activities to file
   */
  private async writeDailyActivities(date: Date, activities: RawActivityData[]): Promise<void> {
    const dateStr = date.toISOString().split('T')[0];
    const filePath = this.getActivityFilePath(dateStr);
    
    await fs.mkdir(dirname(filePath), { recursive: true });
    
    // Append to existing file if it exists
    let existingActivities: RawActivityData[] = [];
    try {
      const existing = await fs.readFile(filePath, 'utf-8');
      existingActivities = JSON.parse(existing);
    } catch {
      // File doesn't exist, start fresh
    }
    
    const allActivities = [...existingActivities, ...activities];
    await fs.writeFile(filePath, JSON.stringify(allActivities, null, 2));
  }

  /**
   * Write content analyses to file
   */
  private async writeContentAnalyses(date: Date, analyses: any[]): Promise<void> {
    const dateStr = date.toISOString().split('T')[0];
    const filePath = this.getContentAnalysisFilePath(dateStr);
    
    await fs.mkdir(dirname(filePath), { recursive: true });
    
    // Append to existing file
    let existingAnalyses: any[] = [];
    try {
      const existing = await fs.readFile(filePath, 'utf-8');
      existingAnalyses = JSON.parse(existing);
    } catch {
      // File doesn't exist
    }
    
    const allAnalyses = [...existingAnalyses, ...analyses];
    await fs.writeFile(filePath, JSON.stringify(allAnalyses, null, 2));
  }

  /**
   * Get base user data path (same as Electron app)
   */
  private getUserDataPath(): string {
    const { homedir } = require('os');
    const appSupportPath = join(homedir(), 'Library', 'Application Support', 'blueberry-browser');
    return join(appSupportPath, 'users', 'user-data', this.config.userId);
  }

  /**
   * Get file path for daily activities
   */
  private getActivityFilePath(dateStr: string): string {
    return join(this.getUserDataPath(), 'raw-activity', `${dateStr}.json`);
  }

  /**
   * Get file path for content analyses
   */
  private getContentAnalysisFilePath(dateStr: string): string {
    return join(this.getUserDataPath(), 'content-analysis', `${dateStr}.json`);
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

