/**
 * Tab-related type definitions
 */

export type HistoryCallback = (entry: {
  url: string;
  title: string;
  visitedAt: Date;
  favicon?: string;
}) => Promise<{ id: string; analysisId?: string } | undefined>;

export interface TabInfo {
  id: string;
  title: string;
  url: string;
  isActive: boolean;
}

export interface ActiveTabInfo {
  id: string;
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
}

