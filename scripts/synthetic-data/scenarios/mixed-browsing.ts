/**
 * Mixed Browsing Scenario
 * Typical casual user with varied interests
 */

import type { GeneratorConfig } from '../types';

export const mixedBrowsingScenario: GeneratorConfig = {
  userId: 'test-user-mixed',
  dateRange: {
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    days: 7,
  },
  sessions: {
    perDay: { min: 2, max: 6 },
    durationMinutes: { min: 5, max: 60 },
  },
  patterns: [
    {
      type: 'random',
      weight: 0.4, // 40% random browsing
    },
    {
      type: 'thematic',
      weight: 0.3, // 30% focused on a topic
      categories: ['news', 'entertainment', 'technology'],
    },
    {
      type: 'sequential',
      weight: 0.2, // 20% goal-oriented
    },
    {
      type: 'temporal',
      weight: 0.1, // 10% routine sites
    },
  ],
  activityTypes: {
    page_visit: 1.0,
    page_interaction: 0.8,
    navigation_event: 0.9,
    tab_action: 0.6,
    search_query: 0.3,
    click_event: 0.4,
    scroll_event: 0.5,
    keyboard_input: 0.2,
  },
  contentAnalysis: {
    generate: true,
    percentage: 0.5, // Analyze 50% of pages
  },
  realism: {
    peakHours: [8, 9, 12, 13, 19, 20, 21, 22],
    weekendReduction: 0.1, // Similar activity on weekends
  },
};

