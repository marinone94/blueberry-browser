/**
 * Workflow Focused Scenario
 * User creating repeated patterns for workflow automation
 */

import type { GeneratorConfig } from '../types';

export const workflowFocusedScenario: GeneratorConfig = {
  userId: 'test-user-workflows',
  dateRange: {
    start: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    days: 14,
  },
  sessions: {
    perDay: { min: 5, max: 10 }, // More sessions
    durationMinutes: { min: 10, max: 45 }, // Shorter, focused
  },
  patterns: [
    {
      type: 'sequential',
      weight: 0.8, // 80% sequential - more workflows!
      categories: ['documentation', 'productivity'],
    },
    {
      type: 'thematic',
      weight: 0.2,
      categories: ['technology'],
    },
  ],
  activityTypes: {
    page_visit: 1.0,
    page_interaction: 0.8,
    navigation_event: 0.7,
    tab_action: 0.6,
    search_query: 0.3,
    scroll_event: 0.6,
    click_event: 0.4,
  },
  contentAnalysis: {
    generate: true,
    percentage: 0.9, // High percentage required for workflow detection (needs 2+ analyzed activities per session)
  },
  realism: {
    peakHours: [9, 10, 11, 14, 15, 16],
    weekendReduction: 0.5,
  },
};