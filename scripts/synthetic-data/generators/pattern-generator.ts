/**
 * Generate different browsing patterns
 */

import type { GeneratedActivity } from '../types';
import type { LLMContentGenerator } from '../utils/llm-content-generator';
import pLimit from 'p-limit';

export class PatternGenerator {
  // Cache for repeated workflows - key: journey name, value: URLs
  private workflowCache: Map<string, any[]> = new Map();
  
  constructor(private llm: LLMContentGenerator) {}

  /**
   * Generate activities for a specific pattern type
   */
  async generatePattern(
    type: string,
    date: Date,
    startTime: Date,
    duration: number
  ): Promise<GeneratedActivity[]> {
    switch (type) {
      case 'sequential':
        return this.generateSequentialPattern(startTime, duration);
      case 'thematic':
        return this.generateThematicPattern(startTime, duration);
      case 'random':
        return this.generateRandomPattern(startTime, duration);
      case 'temporal':
        return this.generateTemporalPattern(startTime, duration);
      default:
        return this.generateRandomPattern(startTime, duration);
    }
  }

  /**
   * Sequential pattern: user follows a goal-oriented journey
   * Example: Shopping research → Compare products → Read reviews → Purchase
   * 
   * UPDATED: Now supports repeated workflows for pattern detection
   * - Some journeys are "repeated workflows" (cached and reused)
   * - Others are one-off explorations (generated fresh each time)
   */
  private async generateSequentialPattern(startTime: Date, duration: number): Promise<GeneratedActivity[]> {
    // Repeated workflows - these will be cached and reused to create patterns
    const repeatedWorkflows = [
      { name: 'Daily productivity start', steps: 3 },    // Gmail → Calendar → Slack
      { name: 'Dev workflow check', steps: 3 },          // GitHub → Stack Overflow → Docs
      { name: 'Morning news routine', steps: 4 },        // News sites
      { name: 'Project management flow', steps: 3 },     // Jira → Confluence → Slack
    ];
    
    // One-off explorations - these generate new URLs each time
    const explorativeJourneys = [
      'Shopping for a laptop',
      'Planning a vacation',
      'Learning a new programming language',
      'Troubleshooting a technical problem',
      'Researching a health condition',
      'Comparing insurance plans',
    ];
    
    // 60% chance of repeated workflow, 40% chance of explorative journey
    const isRepeatedWorkflow = Math.random() < 0.6;
    
    let urls: any[];
    
    if (isRepeatedWorkflow) {
      // Use a repeated workflow - cache and reuse the same URLs
      const workflow = repeatedWorkflows[Math.floor(Math.random() * repeatedWorkflows.length)];
      
      if (!this.workflowCache.has(workflow.name)) {
        // First time generating this workflow - create and cache it
        console.log(`[GSD] Creating new repeated workflow: "${workflow.name}"`);
        const generatedUrls = await this.llm.generateBrowsingJourney(workflow.name, workflow.steps);
        this.workflowCache.set(workflow.name, generatedUrls);
      }
      
      urls = this.workflowCache.get(workflow.name)!;
      console.log(`[GSD] Reusing workflow: "${workflow.name}" (${urls.length} steps)`);
    } else {
      // Explorative journey - generate new URLs each time
      const journey = explorativeJourneys[Math.floor(Math.random() * explorativeJourneys.length)];
      const steps = Math.min(8, Math.floor(duration / (5 * 60 * 1000))); // ~5 min per step
      urls = await this.llm.generateBrowsingJourney(journey, steps);
    }
    
    const activities: GeneratedActivity[] = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      
      // Tab creation if first or occasionally
      if (i === 0 || Math.random() < 0.2) {
        activities.push({
          type: 'tab_action',
          url: url.url,
          title: url.title,
          timestamp: startTime,
          data: {
            action: 'create',
            tabId: `tab-${i + 1}`,
            totalTabs: i + 1,
          },
          category: url.category,
          subcategory: url.subcategory,
        });
      }

      // Navigation
      if (i > 0) {
        activities.push({
          type: 'navigation_event',
          url: url.url,
          title: url.title,
          timestamp: startTime,
          data: {
            fromUrl: urls[i - 1].url,
            method: 'click',
          },
          category: url.category,
          subcategory: url.subcategory,
        });
      }

      // Page visit
      activities.push({
        type: 'page_visit',
        url: url.url,
        title: url.title,
        timestamp: startTime,
        data: {},
        category: url.category,
        subcategory: url.subcategory,
      });

      // Page interaction
      activities.push({
        type: 'page_interaction',
        url: url.url,
        title: url.title,
        timestamp: startTime,
        data: {},
        category: url.category,
        subcategory: url.subcategory,
      });
    }

    return activities;
  }

  /**
   * Thematic pattern: user browses related content on similar topics
   * Example: Reading multiple tech news articles
   */
  private async generateThematicPattern(startTime: Date, duration: number): Promise<GeneratedActivity[]> {
    const themes = [
      { category: 'technology', subcategories: ['AI', 'programming', 'gadgets', 'software'] },
      { category: 'news', subcategories: ['world', 'politics', 'business', 'science'] },
      { category: 'entertainment', subcategories: ['movies', 'music', 'games', 'streaming'] },
      { category: 'education', subcategories: ['tutorials', 'courses', 'documentation', 'articles'] },
    ];

    const theme = themes[Math.floor(Math.random() * themes.length)];
    const numPages = Math.min(12, Math.floor(duration / (3 * 60 * 1000))); // ~3 min per page
    const activities: GeneratedActivity[] = [];

    // Parallelize URL generation for all pages
    const pageParams = Array.from({ length: numPages }, (_, i) => ({
      index: i,
      subcategory: theme.subcategories[Math.floor(Math.random() * theme.subcategories.length)],
    }));

    const limit = pLimit(10); // Max 10 concurrent requests
    const urls = await Promise.all(
      pageParams.map(params => 
        limit(async () => ({
          ...params,
          url: await this.llm.generateURL(theme.category, params.subcategory),
        }))
      )
    );

    for (const { index: i, subcategory, url } of urls) {
      // Occasionally open new tab
      if (i === 0 || Math.random() < 0.3) {
        activities.push({
          type: 'tab_action',
          url: url.url,
          title: url.title,
          timestamp: startTime,
          data: {
            action: i === 0 ? 'create' : 'switch',
            tabId: `tab-${Math.floor(i / 3) + 1}`,
            totalTabs: Math.floor(i / 3) + 1,
          },
          category: theme.category,
          subcategory,
        });
      }

      // Navigation
      if (i > 0) {
        activities.push({
          type: 'navigation_event',
          url: url.url,
          title: url.title,
          timestamp: startTime,
          data: { method: 'click' },
          category: theme.category,
          subcategory,
        });
      }

      // Visit and interact
      activities.push({
        type: 'page_visit',
        url: url.url,
        title: url.title,
        timestamp: startTime,
        data: {},
        category: theme.category,
        subcategory,
      });

      activities.push({
        type: 'page_interaction',
        url: url.url,
        title: url.title,
        timestamp: startTime,
        data: {},
        category: theme.category,
        subcategory,
      });
    }

    return activities;
  }

  /**
   * Random pattern: unfocused browsing across different topics
   */
  private async generateRandomPattern(startTime: Date, duration: number): Promise<GeneratedActivity[]> {
    const categories = [
      { category: 'technology', subcategories: ['news', 'reviews', 'tutorials'] },
      { category: 'shopping', subcategories: ['electronics', 'clothing', 'books'] },
      { category: 'social', subcategories: ['twitter', 'reddit', 'youtube'] },
      { category: 'news', subcategories: ['world', 'local', 'business'] },
      { category: 'entertainment', subcategories: ['movies', 'music', 'games'] },
    ];

    const numPages = Math.min(10, Math.floor(duration / (2 * 60 * 1000))); // ~2 min per page
    const activities: GeneratedActivity[] = [];

    // Parallelize URL generation for all pages
    const pageParams = Array.from({ length: numPages }, (_, i) => {
      const theme = categories[Math.floor(Math.random() * categories.length)];
      const subcategory = theme.subcategories[Math.floor(Math.random() * theme.subcategories.length)];
      return { index: i, category: theme.category, subcategory };
    });

    const limit = pLimit(10); // Max 10 concurrent requests
    const urls = await Promise.all(
      pageParams.map(params => 
        limit(async () => ({
          ...params,
          url: await this.llm.generateURL(params.category, params.subcategory),
        }))
      )
    );

    for (const { index: i, category, subcategory, url } of urls) {
      if (i === 0) {
        activities.push({
          type: 'tab_action',
          url: url.url,
          title: url.title,
          timestamp: startTime,
          data: { action: 'create', tabId: 'tab-1', totalTabs: 1 },
          category,
          subcategory,
        });
      }

      if (i > 0 && Math.random() < 0.3) {
        activities.push({
          type: 'navigation_event',
          url: url.url,
          title: url.title,
          timestamp: startTime,
          data: { method: 'type' },
          category,
          subcategory,
        });
      }

      activities.push({
        type: 'page_visit',
        url: url.url,
        title: url.title,
        timestamp: startTime,
        data: {},
        category,
        subcategory,
      });

      activities.push({
        type: 'page_interaction',
        url: url.url,
        title: url.title,
        timestamp: startTime,
        data: {},
        category,
        subcategory,
      });
    }

    return activities;
  }

  /**
   * Temporal pattern: repeated visits to same sites over time
   * Example: Checking email, news sites, social media throughout the day
   */
  private async generateTemporalPattern(startTime: Date, duration: number): Promise<GeneratedActivity[]> {
    const routineSites = [
      { category: 'email', subcategory: 'webmail', frequency: 0.4 },
      { category: 'social', subcategory: 'twitter', frequency: 0.3 },
      { category: 'news', subcategory: 'tech', frequency: 0.2 },
      { category: 'productivity', subcategory: 'project-management', frequency: 0.1 },
    ];

    const activities: GeneratedActivity[] = [];
    
    // Filter sites based on frequency roll
    const sitesToVisit = routineSites.filter(site => Math.random() < site.frequency);
    
    // Parallelize URL generation for all sites
    const limit = pLimit(10); // Max 10 concurrent requests
    const urlResults = await Promise.all(
      sitesToVisit.map(site => 
        limit(async () => ({
          ...site,
          urlData: await this.llm.generateURL(site.category, site.subcategory),
        }))
      )
    );

    // Generate activities for each visited site
    for (const { category, subcategory, urlData } of urlResults) {
      // Visit
      activities.push({
        type: 'page_visit',
        url: urlData.url,
        title: urlData.title,
        timestamp: startTime,
        data: {},
        category,
        subcategory,
      });

      // Quick interaction
      activities.push({
        type: 'page_interaction',
        url: urlData.url,
        title: urlData.title,
        timestamp: startTime,
        data: {},
        category,
        subcategory,
      });
    }

    return activities;
  }
}

