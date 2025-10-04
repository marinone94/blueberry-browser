/**
 * Shopping Journey Scenario
 * User researching and comparing products before purchase
 */

import type { GeneratorConfig } from '../types';

export const shoppingJourneyScenario: GeneratorConfig = {
  userId: 'test-user-shopping',
  dateRange: {
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    days: 7,
  },
  sessions: {
    perDay: { min: 2, max: 5 },
    durationMinutes: { min: 10, max: 45 },
  },
  patterns: [
    {
      type: 'sequential',
      weight: 0.6, // 60% of sessions are sequential shopping journeys
      template: 'shopping',
      categories: ['shopping', 'reviews', 'comparisons'],
    },
    {
      type: 'thematic',
      weight: 0.3, // 30% reading reviews and articles
      categories: ['reviews', 'technology', 'consumer-advice'],
    },
    {
      type: 'random',
      weight: 0.1, // 10% random browsing
    },
  ],
  activityTypes: {
    page_visit: 1.0,
    page_interaction: 0.9,
    navigation_event: 0.8,
    tab_action: 0.5,
    search_query: 0.4,
    click_event: 0.3,
    scroll_event: 0.6,
    form_interaction: 0.1, // Occasionally fill out forms
  },
  contentAnalysis: {
    generate: true,
    percentage: 0.6, // Analyze 60% of pages
  },
  realism: {
    peakHours: [12, 13, 14, 19, 20, 21], // Lunch break and evening
    weekendReduction: 0.2, // 20% less activity on weekends
  },
};

