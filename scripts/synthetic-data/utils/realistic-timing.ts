/**
 * Realistic timing patterns for synthetic browsing data
 */

/**
 * Generate realistic timestamp within a day, respecting peak hours
 */
export function generateTimestamp(date: Date, peakHours: number[] = [9, 10, 11, 14, 15, 16, 20, 21]): Date {
  // Weight distribution towards peak hours
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
  
  let hour: number;
  if (Math.random() < 0.7 && !isWeekend) {
    // 70% during peak hours on weekdays
    hour = peakHours[Math.floor(Math.random() * peakHours.length)];
  } else if (isWeekend) {
    // More spread out on weekends, favor afternoon/evening
    hour = randomWeighted([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22], [1, 2, 3, 4, 5, 6, 5, 4, 3, 4, 5, 4, 2]);
  } else {
    // Random hour during active time
    hour = Math.floor(Math.random() * 16) + 7; // 7am to 11pm
  }

  const minute = Math.floor(Math.random() * 60);
  const second = Math.floor(Math.random() * 60);
  const millisecond = Math.floor(Math.random() * 1000);

  const timestamp = new Date(date);
  timestamp.setHours(hour, minute, second, millisecond);
  
  return timestamp;
}

/**
 * Generate realistic dwell time based on content type
 */
export function generateDwellTime(category: string, subcategory: string): number {
  const baseTime: Record<string, [number, number]> = {
    // [min, max] in seconds
    'news': [10, 180],
    'article': [30, 300],
    'video': [60, 600],
    'shopping': [20, 240],
    'product': [15, 180],
    'search': [3, 30],
    'social': [5, 300],
    'documentation': [60, 900],
    'tutorial': [120, 1200],
    'blog': [45, 300],
    'forum': [30, 600],
    'email': [10, 120],
    'default': [10, 120],
  };

  const key = subcategory.toLowerCase() in baseTime ? subcategory.toLowerCase() : 
               category.toLowerCase() in baseTime ? category.toLowerCase() : 'default';
  
  const [min, max] = baseTime[key];
  
  // Log-normal distribution for more realistic dwell times
  const mean = (min + max) / 2;
  const stdDev = (max - min) / 4;
  const logNormal = Math.exp(normalRandom() * Math.log(stdDev + 1) + Math.log(mean));
  
  return Math.max(min, Math.min(max, Math.floor(logNormal))) * 1000; // Convert to ms
}

/**
 * Generate realistic session duration
 */
export function generateSessionDuration(minMinutes: number, maxMinutes: number): number {
  // Exponential distribution favoring shorter sessions
  const lambda = 1 / ((minMinutes + maxMinutes) / 2);
  const duration = -Math.log(1 - Math.random()) / lambda;
  
  return Math.max(minMinutes, Math.min(maxMinutes, duration)) * 60 * 1000; // Convert to ms
}

/**
 * Generate number of sessions per day with realistic distribution
 */
export function generateSessionsPerDay(min: number, max: number, isWeekend: boolean, weekendReduction: number = 0.3): number {
  const baseCount = Math.floor(Math.random() * (max - min + 1)) + min;
  
  if (isWeekend) {
    return Math.max(1, Math.floor(baseCount * (1 - weekendReduction)));
  }
  
  return baseCount;
}

/**
 * Generate realistic gap between activities within a session
 */
export function generateActivityGap(activityType: string, previousType?: string): number {
  // Gaps in milliseconds
  const gaps: Record<string, [number, number]> = {
    'page_visit': [0, 500], // Immediate after navigation
    'navigation_event': [2000, 15000], // User deciding where to go next
    'click_event': [500, 5000], // User reading/thinking
    'scroll_event': [1000, 8000], // User reading
    'keyboard_input': [500, 3000], // Typing pace
    'search_query': [3000, 20000], // Thinking about what to search
    'tab_action': [2000, 30000], // Switching context
    'focus_change': [0, 1000], // Immediate
    'default': [1000, 5000],
  };

  const key = activityType in gaps ? activityType : 'default';
  const [min, max] = gaps[key];
  
  return Math.floor(Math.random() * (max - min)) + min;
}

/**
 * Check if activity should occur based on time of day
 */
export function shouldGenerateActivity(timestamp: Date, activityType: string): boolean {
  const hour = timestamp.getHours();
  
  // Less activity during sleeping hours (1am-6am)
  if (hour >= 1 && hour < 6) {
    return Math.random() < 0.05; // 5% chance
  }
  
  // Early morning (6am-8am) - light activity
  if (hour >= 6 && hour < 8) {
    return Math.random() < 0.4; // 40% chance
  }
  
  // Late night (11pm-1am) - reduced activity
  if (hour >= 23 || hour < 1) {
    return Math.random() < 0.3; // 30% chance
  }
  
  // Normal hours - full activity
  return true;
}

/**
 * Generate realistic scroll depth percentage
 */
export function generateScrollDepth(dwellTime: number): number {
  // Longer dwell time = more scrolling
  if (dwellTime < 5000) return Math.random() * 30; // Quick visit, minimal scroll
  if (dwellTime < 30000) return Math.random() * 60 + 20; // Medium visit
  return Math.random() * 40 + 60; // Long visit, deep scroll
}

/**
 * Generate realistic click count
 */
export function generateClickCount(dwellTime: number): number {
  // Roughly 1 click per 10 seconds, with variance
  const baseClicks = dwellTime / 10000;
  return Math.max(0, Math.floor(baseClicks * (0.5 + Math.random())));
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Normal distribution random number (Box-Muller transform)
 */
function normalRandom(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Weighted random selection
 */
function randomWeighted<T>(items: T[], weights: number[]): T {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;
  
  for (let i = 0; i < items.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      return items[i];
    }
  }
  
  return items[items.length - 1];
}

/**
 * Generate realistic exit method based on context
 */
export function generateExitMethod(nextActivityType?: string): string {
  if (!nextActivityType) return 'close';
  
  const exitMethods: Record<string, string[]> = {
    'navigation_event': ['navigation', 'click'],
    'tab_action': ['switch_tab', 'new_tab'],
    'close': ['close'],
    'default': ['navigation', 'back', 'switch_tab'],
  };
  
  const key = nextActivityType in exitMethods ? nextActivityType : 'default';
  const methods = exitMethods[key];
  
  return methods[Math.floor(Math.random() * methods.length)];
}

