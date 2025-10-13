/**
 * News Reader Scenario
 * User who regularly reads news from multiple sources
 */

import type { GeneratorConfig } from '../types';

export const newsReaderScenario: GeneratorConfig = {
  userId: 'test-user-news',
  dateRange: {
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    days: 30,
  },
  sessions: {
    perDay: { min: 3, max: 6 },
    durationMinutes: { min: 5, max: 20 }, // Quick sessions
  },
  patterns: [
    {
      type: 'thematic',
      weight: 0.6, // 60% reading related news articles
      categories: ['news', 'world', 'politics', 'technology', 'science'],
    },
    {
      type: 'temporal',
      weight: 0.3, // 30% routine news site checks
    },
    {
      type: 'random',
      weight: 0.1, // 10% discovering new sources
    },
  ],
  activityTypes: {
    page_visit: 1.0,
    page_interaction: 0.7, // Lower engagement - skimming
    navigation_event: 1.0, // Lots of navigation between articles
    tab_action: 0.4,
    search_query: 0.2,
    scroll_event: 0.6,
    click_event: 0.3,
  },
  contentAnalysis: {
    generate: true,
    percentage: 0.8, // High analysis rate for news content
  },
  realism: {
    peakHours: [7, 8, 12, 13, 18, 19], // Morning, lunch, evening
    weekendReduction: 0.3, // Less news reading on weekends
  },
};

