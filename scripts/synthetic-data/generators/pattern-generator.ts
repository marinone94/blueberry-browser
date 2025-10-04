/**
 * Generate different browsing patterns
 */

import type { GeneratedActivity } from '../types';
import type { LLMContentGenerator } from '../utils/llm-content-generator';

export class PatternGenerator {
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
   */
  private async generateSequentialPattern(startTime: Date, duration: number): Promise<GeneratedActivity[]> {
    const journeys = [
      'Shopping for a laptop',
      'Planning a vacation',
      'Learning a new programming language',
      'Troubleshooting a technical problem',
      'Researching a health condition',
      'Comparing insurance plans',
    ];

    const journey = journeys[Math.floor(Math.random() * journeys.length)];
    const steps = Math.min(8, Math.floor(duration / (5 * 60 * 1000))); // ~5 min per step
    
    const urls = await this.llm.generateBrowsingJourney(journey, steps);
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

    for (let i = 0; i < numPages; i++) {
      const subcategory = theme.subcategories[Math.floor(Math.random() * theme.subcategories.length)];
      const url = await this.llm.generateURL(theme.category, subcategory);

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

    for (let i = 0; i < numPages; i++) {
      const theme = categories[Math.floor(Math.random() * categories.length)];
      const subcategory = theme.subcategories[Math.floor(Math.random() * theme.subcategories.length)];
      const url = await this.llm.generateURL(theme.category, subcategory);

      if (i === 0) {
        activities.push({
          type: 'tab_action',
          url: url.url,
          title: url.title,
          timestamp: startTime,
          data: { action: 'create', tabId: 'tab-1', totalTabs: 1 },
          category: theme.category,
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
          category: theme.category,
          subcategory,
        });
      }

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
    const visitedSites: Map<string, any> = new Map();

    // Generate or retrieve URLs for routine sites
    for (const site of routineSites) {
      if (Math.random() < site.frequency) {
        let urlData = visitedSites.get(site.subcategory);
        if (!urlData) {
          urlData = await this.llm.generateURL(site.category, site.subcategory);
          visitedSites.set(site.subcategory, urlData);
        }

        // Visit
        activities.push({
          type: 'page_visit',
          url: urlData.url,
          title: urlData.title,
          timestamp: startTime,
          data: {},
          category: site.category,
          subcategory: site.subcategory,
        });

        // Quick interaction
        activities.push({
          type: 'page_interaction',
          url: urlData.url,
          title: urlData.title,
          timestamp: startTime,
          data: {},
          category: site.category,
          subcategory: site.subcategory,
        });
      }
    }

    return activities;
  }
}

