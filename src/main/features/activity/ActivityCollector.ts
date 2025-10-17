import type { ActivityStorage } from "./storage";
import type {
  RawActivityData,
  ActivityType,
  PageVisitData,
  PageInteractionData,
  ClickEventData,
  ScrollEventData,
  KeyboardInputData,
  MouseMovementData,
  SearchQueryData,
  NavigationEventData,
  TabActionData,
  FocusChangeData,
  ChatInteractionData,
  ContentExtractionData,
  FormInteractionData
} from "../../shared/types/ActivityTypes";

/**
 * ActivityCollector - Manages buffered collection and storage of user activity data.
 * 
 * This class collects user activities across multiple types and manages efficient
 * batched storage to avoid excessive I/O operations.
 * 
 * Features:
 * - Buffered collection with automatic flushing
 * - Multiple activity types supported (13 total)
 * - Session-based tracking
 * - Automatic retry on flush failures
 */
export class ActivityCollector {
  private userId: string;
  private sessionId: string;
  private activityStorage: ActivityStorage;
  private dataBuffer: RawActivityData[] = [];
  private bufferFlushInterval: NodeJS.Timeout;
  private readonly BUFFER_SIZE = 100;
  private readonly FLUSH_INTERVAL = 30000; // 30 seconds

  constructor(userId: string, activityStorage: ActivityStorage) {
    this.userId = userId;
    this.sessionId = this.generateSessionId();
    this.activityStorage = activityStorage;
    
    // Set up periodic buffer flushing
    this.bufferFlushInterval = setInterval(() => {
      this.flushBuffer();
    }, this.FLUSH_INTERVAL);
  }

  // ============================================================================
  // PUBLIC COLLECTION METHODS
  // ============================================================================

  async collectPageVisit(data: PageVisitData): Promise<void> {
    await this.addActivity('page_visit', data);
  }

  async collectPageInteraction(data: PageInteractionData): Promise<void> {
    await this.addActivity('page_interaction', data);
  }

  async collectClickEvent(data: ClickEventData): Promise<void> {
    await this.addActivity('click_event', data);
  }

  async collectScrollEvent(data: ScrollEventData): Promise<void> {
    await this.addActivity('scroll_event', data);
  }

  async collectKeyboardInput(data: KeyboardInputData): Promise<void> {
    await this.addActivity('keyboard_input', data);
  }

  async collectMouseMovement(data: MouseMovementData): Promise<void> {
    await this.addActivity('mouse_movement', data);
  }

  async collectSearchQuery(data: SearchQueryData): Promise<void> {
    await this.addActivity('search_query', data);
  }

  async collectNavigationEvent(data: NavigationEventData): Promise<void> {
    await this.addActivity('navigation_event', data);
  }

  async collectTabAction(data: TabActionData): Promise<void> {
    await this.addActivity('tab_action', data);
  }

  async collectFocusChange(data: FocusChangeData): Promise<void> {
    await this.addActivity('focus_change', data);
  }

  async collectChatInteraction(data: ChatInteractionData): Promise<void> {
    await this.addActivity('chat_interaction', data);
  }

  async collectContentExtraction(data: ContentExtractionData): Promise<void> {
    await this.addActivity('content_extraction', data);
  }

  async collectFormInteraction(data: FormInteractionData): Promise<void> {
    await this.addActivity('form_interaction', data);
  }

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  getSessionId(): string {
    return this.sessionId;
  }

  getUserId(): string {
    return this.userId;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async addActivity(type: ActivityType, data: any): Promise<void> {
    const activity: RawActivityData = {
      id: this.generateActivityId(),
      userId: this.userId,
      timestamp: new Date(),
      sessionId: this.sessionId,
      type,
      data
    };

    this.dataBuffer.push(activity);

    // Flush buffer if it's getting full
    if (this.dataBuffer.length >= this.BUFFER_SIZE) {
      await this.flushBuffer();
    }
  }

  async flushBuffer(): Promise<void> {
    if (this.dataBuffer.length === 0) return;

    const activitiesToFlush = [...this.dataBuffer];
    this.dataBuffer = [];

    try {
      await this.activityStorage.saveRawActivityData(this.userId, activitiesToFlush);
      console.log(`[ActivityCollector] Flushed ${activitiesToFlush.length} activities for user ${this.userId}`);
    } catch (error) {
      console.error('[ActivityCollector] Failed to flush activity data:', error);
      // Re-add failed data to buffer for retry
      this.dataBuffer.unshift(...activitiesToFlush);
    }
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateActivityId(): string {
    return `activity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async destroy(): Promise<void> {
    if (this.bufferFlushInterval) {
      clearInterval(this.bufferFlushInterval);
    }
    await this.flushBuffer(); // Final flush
    console.log(`[ActivityCollector] Destroyed collector for user ${this.userId}`);
  }
}

