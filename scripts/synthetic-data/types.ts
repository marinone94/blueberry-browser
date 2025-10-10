/**
 * Type definitions for synthetic data generation
 */

export interface GeneratorConfig {
  userId: string;
  dateRange: {
    start: string; // ISO date
    days: number;
  };
  sessions: {
    perDay: { min: number; max: number };
    durationMinutes: { min: number; max: number };
  };
  patterns: PatternConfig[];
  activityTypes: ActivityTypeWeights;
  contentAnalysis: {
    generate: boolean;
    percentage: number; // 0-1, how many page visits get content analysis
  };
  realism?: {
    peakHours?: number[]; // Hours with more activity (0-23)
    weekendReduction?: number; // 0-1, reduce weekend activity by this factor
  };
  concurrency?: {
    llmCalls?: number; // Max concurrent LLM API calls (default: 10)
    contentAnalysis?: number; // Max concurrent content analyses (default: 5)
  };
}

export interface PatternConfig {
  type: 'sequential' | 'thematic' | 'random' | 'temporal';
  weight: number; // 0-1, relative weight
  template?: string;
  categories?: string[];
  config?: Record<string, any>;
}

export interface ActivityTypeWeights {
  page_visit: number;
  page_interaction: number;
  navigation_event: number;
  tab_action: number;
  search_query?: number;
  click_event?: number;
  scroll_event?: number;
  keyboard_input?: number;
  focus_change?: number;
  chat_interaction?: number;
  content_extraction?: number;
  form_interaction?: number;
}

export interface GenerationResult {
  totalActivities: number;
  totalSessions: number;
  uniqueUrls: number;
  contentAnalyses: number;
  daysGenerated: number;
  patterns?: Record<string, number>;
  files?: string[];
}

export interface BrowsingPattern {
  type: 'sequential' | 'thematic' | 'random' | 'temporal';
  name: string;
  activities: GeneratedActivity[];
}

export interface GeneratedActivity {
  type: string;
  url: string;
  title: string;
  timestamp: Date;
  data: Record<string, any>;
  category?: string;
  subcategory?: string;
}

export interface ContentAnalysisData {
  url: string;
  title: string;
  pageDescription: string;
  screenshotDescription: string;
  category: string;
  subcategory: string;
  brand: string;
  primaryLanguage: string;
  languages: string[];
  fullText: string;
  metaDescription?: string;
}

export interface RealisticURL {
  url: string;
  domain: string;
  title: string;
  category: string;
  subcategory: string;
  brand?: string;
}

