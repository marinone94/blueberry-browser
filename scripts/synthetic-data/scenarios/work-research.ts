/**
 * Work Research Scenario
 * Professional user doing deep research on technical topics
 */

import type { GeneratorConfig } from '../types';

export const workResearchScenario: GeneratorConfig = {
  userId: 'test-user-work',
  dateRange: {
    start: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    days: 14,
  },
  sessions: {
    perDay: { min: 3, max: 8 },
    durationMinutes: { min: 15, max: 90 },
  },
  patterns: [
    {
      type: 'sequential',
      weight: 0.5, // 50% goal-oriented research
      categories: ['documentation', 'tutorials', 'stack-overflow'],
    },
    {
      type: 'thematic',
      weight: 0.4, // 40% reading related articles
      categories: ['technology', 'programming', 'ai'],
    },
    {
      type: 'temporal',
      weight: 0.1, // 10% routine checks (email, project management)
    },
  ],
  activityTypes: {
    page_visit: 1.0,
    page_interaction: 1.0, // High engagement
    navigation_event: 0.9,
    tab_action: 0.8, // Many tabs open
    search_query: 0.5,
    keyboard_input: 0.4, // Typing in documentation search
    scroll_event: 0.8,
    click_event: 0.5,
  },
  contentAnalysis: {
    generate: true,
    percentage: 0.7, // Analyze 70% - important for work context
  },
  realism: {
    peakHours: [9, 10, 11, 14, 15, 16], // Work hours
    weekendReduction: 0.7, // Much less work on weekends
  },
};

