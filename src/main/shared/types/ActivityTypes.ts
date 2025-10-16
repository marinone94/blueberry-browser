// ============================================================================
// RAW ACTIVITY DATA COLLECTION INTERFACES
// ============================================================================

export interface RawActivityData {
  id: string;
  userId: string;
  timestamp: Date;
  sessionId: string;
  type: ActivityType;
  data: any; // Type-specific data payload
}

export type ActivityType = 
  | 'page_visit'
  | 'page_interaction' 
  | 'click_event'
  | 'scroll_event'
  | 'keyboard_input'
  | 'mouse_movement'
  | 'search_query'
  | 'navigation_event'
  | 'tab_action'
  | 'focus_change'
  | 'chat_interaction'
  | 'content_extraction'
  | 'form_interaction';

// ============================================================================
// SPECIFIC DATA STRUCTURES FOR EACH ACTIVITY TYPE
// ============================================================================

export interface PageVisitData {
  url: string;
  title: string;
  favicon?: string;
  referrer?: string;
  loadTime: number;
  userAgent: string;
}

export interface PageInteractionData {
  url: string;
  title: string;
  timeOnPage: number;
  scrollDepth: number;
  clickCount: number;
  keyboardEvents: number;
  focusEvents: number;
  exitMethod: 'navigation' | 'close' | 'back' | 'new_tab' | 'switch_tab';
}

export interface ClickEventData {
  url: string;
  x: number;
  y: number;
  elementTag?: string;
  elementClass?: string;
  elementId?: string;
  elementText?: string;
  clickType: 'left' | 'right' | 'middle';
  isDoubleClick: boolean;
}

export interface ScrollEventData {
  url: string;
  scrollTop: number;
  scrollLeft: number;
  viewportHeight: number;
  documentHeight: number;
  direction: 'up' | 'down' | 'left' | 'right';
  speed: number; // pixels per second
}

export interface KeyboardInputData {
  url: string;
  keyCount: number;
  inputType: 'search' | 'form' | 'address_bar' | 'other';
  elementTag?: string;
  hasShortcuts: boolean;
  typingSpeed?: number; // characters per minute
}

export interface MouseMovementData {
  url: string;
  movements: Array<{
    x: number;
    y: number;
    timestamp: number; // relative to start
  }>;
  totalDistance: number;
  averageSpeed: number;
}

export interface SearchQueryData {
  query: string;
  searchEngine: string;
  resultsPage: string;
  queryLength: number;
  hasTypos: boolean;
}

export interface NavigationEventData {
  fromUrl: string;
  toUrl: string;
  method: 'click' | 'type' | 'back' | 'forward' | 'bookmark' | 'history' | 'new_tab';
  loadTime: number;
}

export interface TabActionData {
  action: 'create' | 'close' | 'switch' | 'duplicate' | 'pin' | 'mute';
  tabId: string;
  url?: string;
  totalTabs: number;
}

export interface FocusChangeData {
  url: string;
  focusType: 'window_focus' | 'window_blur' | 'tab_focus' | 'tab_blur';
  previousState: string;
  duration: number; // time in previous state
}

export interface ChatInteractionData {
  userMessage: string;
  messageLength: number;
  contextUrl?: string;
  conversationLength: number; // messages in current conversation
  responseTime?: number; // AI response time when available
}

export interface ContentExtractionData {
  url: string;
  title: string;
  contentType: 'article' | 'video' | 'image' | 'social' | 'shopping' | 'other';
  textLength: number;
  hasImages: boolean;
  hasVideos: boolean;
  language?: string;
  selectedText?: string;
}

export interface FormInteractionData {
  url: string;
  formType: 'search' | 'login' | 'registration' | 'checkout' | 'contact' | 'other';
  fieldsCount: number;
  completedFields: number;
  submitted: boolean;
  timeToComplete: number;
}

