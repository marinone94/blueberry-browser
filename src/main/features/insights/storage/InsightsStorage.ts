import { BaseStorage } from "../../../core/storage";

/**
 * Reminder interface
 * (Extended type definitions should be added as needed)
 */
export interface Reminder {
  id: string;
  userId: string;
  title: string;
  description?: string;
  dueDate?: Date;
  completed: boolean;
  completedAt?: string;
  createdAt: Date;
  [key: string]: any; // Allow for additional fields
}

/**
 * Storage for insights and reminders.
 * Manages user reminders and behavioral insights.
 */
export class InsightsStorage extends BaseStorage {
  private readonly remindersFilename = "reminders.json";

  /**
   * Save a reminder for a user
   */
  async saveReminder(userId: string, reminder: Reminder): Promise<void> {
    try {
      // Load existing reminders
      const reminders = await this.getReminders(userId);

      // Add new reminder
      reminders.push(reminder);

      // Save back to file
      await this.saveUserFile(userId, this.remindersFilename, reminders);

      console.log(`InsightsStorage: Saved reminder ${reminder.id} for user ${userId}`);
    } catch (error) {
      console.error(`InsightsStorage: Failed to save reminder for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get all reminders for a user
   */
  async getReminders(userId: string): Promise<Reminder[]> {
    const reminders = await this.loadUserFile<Reminder[]>(
      userId,
      this.remindersFilename,
      []
    );

    // Convert date strings back to Date objects
    return reminders.map(reminder => ({
      ...reminder,
      createdAt: new Date(reminder.createdAt),
      dueDate: reminder.dueDate ? new Date(reminder.dueDate) : undefined
    }));
  }

  /**
   * Get a specific reminder by ID
   */
  async getReminder(userId: string, reminderId: string): Promise<Reminder | null> {
    const reminders = await this.getReminders(userId);
    return reminders.find(r => r.id === reminderId) || null;
  }

  /**
   * Update a reminder
   */
  async updateReminder(userId: string, reminderId: string, updates: Partial<Reminder>): Promise<void> {
    try {
      const reminders = await this.getReminders(userId);
      const index = reminders.findIndex(r => r.id === reminderId);
      
      if (index !== -1) {
        reminders[index] = { ...reminders[index], ...updates };
        await this.saveUserFile(userId, this.remindersFilename, reminders);
        console.log(`InsightsStorage: Updated reminder ${reminderId} for user ${userId}`);
      } else {
        console.warn(`InsightsStorage: Reminder ${reminderId} not found for user ${userId}`);
      }
    } catch (error) {
      console.error(`InsightsStorage: Failed to update reminder ${reminderId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a reminder
   */
  async deleteReminder(userId: string, reminderId: string): Promise<void> {
    try {
      const reminders = await this.getReminders(userId);
      const filtered = reminders.filter(r => r.id !== reminderId);
      
      await this.saveUserFile(userId, this.remindersFilename, filtered);
      console.log(`InsightsStorage: Deleted reminder ${reminderId} for user ${userId}`);
    } catch (error) {
      console.error(`InsightsStorage: Failed to delete reminder ${reminderId}:`, error);
      throw error;
    }
  }

  /**
   * Mark a reminder as completed
   */
  async completeReminder(userId: string, reminderId: string): Promise<void> {
    await this.updateReminder(userId, reminderId, { 
      completed: true, 
      completedAt: new Date().toISOString() 
    });
  }

  /**
   * Get active (non-completed) reminders
   */
  async getActiveReminders(userId: string): Promise<Reminder[]> {
    const reminders = await this.getReminders(userId);
    return reminders.filter(r => !r.completed);
  }

  /**
   * Get completed reminders
   */
  async getCompletedReminders(userId: string): Promise<Reminder[]> {
    const reminders = await this.getReminders(userId);
    return reminders.filter(r => r.completed);
  }

  /**
   * Clear all reminders for a user
   */
  async clearReminders(userId: string): Promise<void> {
    await this.saveUserFile(userId, this.remindersFilename, []);
    console.log(`InsightsStorage: Cleared all reminders for user ${userId}`);
  }
}
