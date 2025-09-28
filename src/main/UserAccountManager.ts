import { app } from "electron";
import { join } from "path";
import { promises as fs } from "fs";
import { v4 as uuidv4 } from "uuid";
import { UserDataManager, type UserTabState } from "./UserDataManager";

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  birthday?: string;
  createdAt: Date;
  lastActiveAt: Date;
  sessionPartition: string;
  isGuest: boolean;
}

export interface CreateUserData {
  name: string;
  email?: string;
  birthday?: string;
}

export interface TabSwitchOptions {
  keepCurrentTabs: boolean; // If true, save current tabs to new user; if false, close current and load user's tabs
}

/**
 * Manages user accounts, switching, and session isolation.
 * Provides complete user isolation with session partitioning and tab management.
 */
export class UserAccountManager {
  private users: Map<string, UserAccount> = new Map();
  private currentUserId: string | null = null;
  private lastNonGuestUserId: string | null = null;
  private readonly maxUsers = 10;
  private readonly userDataManager: UserDataManager;
  private readonly accountsFilePath: string;
  private readonly currentUserFilePath: string;

  // Guest user constants
  private static readonly GUEST_USER_ID = "guest";

  constructor(userDataManager: UserDataManager) {
    this.userDataManager = userDataManager;
    
    const userDataPath = app.getPath("userData");
    const usersDir = join(userDataPath, "users");
    this.accountsFilePath = join(usersDir, "accounts.json");
    this.currentUserFilePath = join(usersDir, "current-user.json");
    
    this.initializeUsers();
  }

  /**
   * Initialize user accounts on startup
   */
  private async initializeUsers(): Promise<void> {
    try {
      await this.loadUsersFromDisk();
      await this.loadCurrentUserFromDisk();
      
      // Always create a fresh guest user
      await this.createFreshGuestUser();
      
      // If we had a last non-guest user, switch to them, otherwise use guest
      if (this.lastNonGuestUserId && this.users.has(this.lastNonGuestUserId)) {
        this.currentUserId = this.lastNonGuestUserId;
        await this.updateLastActiveTime(this.lastNonGuestUserId);
      } else {
        this.currentUserId = UserAccountManager.GUEST_USER_ID;
      }
      
      await this.saveCurrentUserToDisk();
    } catch (error) {
      console.error("Failed to initialize users:", error);
      // Fallback to guest user only
      await this.createFreshGuestUser();
      this.currentUserId = UserAccountManager.GUEST_USER_ID;
    }
  }

  /**
   * Create a fresh guest user (always start clean, like incognito)
   */
  private async createFreshGuestUser(): Promise<void> {
    // Always clear guest user data for fresh start
    await this.userDataManager.clearUserData(UserAccountManager.GUEST_USER_ID);
    
    const guestUser: UserAccount = {
      id: UserAccountManager.GUEST_USER_ID,
      name: "Guest User",
      email: "",
      createdAt: new Date(),
      lastActiveAt: new Date(),
      sessionPartition: "persist:guest",
      isGuest: true
    };
    
    this.users.set(UserAccountManager.GUEST_USER_ID, guestUser);
    console.log("Created fresh guest user");
  }

  /**
   * Load users from disk
   */
  private async loadUsersFromDisk(): Promise<void> {
    try {
      const data = await fs.readFile(this.accountsFilePath, "utf-8");
      const usersArray: UserAccount[] = JSON.parse(data);
      
      this.users.clear();
      for (const user of usersArray) {
        // Skip guest user from disk (we always create fresh)
        if (user.id === UserAccountManager.GUEST_USER_ID) {
          continue;
        }
        
        // Convert date strings back to Date objects
        user.createdAt = new Date(user.createdAt);
        user.lastActiveAt = new Date(user.lastActiveAt);
        this.users.set(user.id, user);
      }
    } catch (error) {
      // File doesn't exist or is corrupted, start fresh
      this.users.clear();
    }
  }

  /**
   * Save users to disk (exclude guest user)
   */
  private async saveUsersToDisk(): Promise<void> {
    try {
      const usersArray = Array.from(this.users.values()).filter(user => !user.isGuest);
      await fs.writeFile(this.accountsFilePath, JSON.stringify(usersArray, null, 2), "utf-8");
    } catch (error) {
      console.error("Failed to save users to disk:", error);
    }
  }

  /**
   * Load current user and last non-guest user from disk
   */
  private async loadCurrentUserFromDisk(): Promise<void> {
    try {
      const data = await fs.readFile(this.currentUserFilePath, "utf-8");
      const { lastNonGuestUserId } = JSON.parse(data);
      
      // Verify user still exists
      if (lastNonGuestUserId && this.users.has(lastNonGuestUserId)) {
        this.lastNonGuestUserId = lastNonGuestUserId;
      } else {
        this.lastNonGuestUserId = null;
      }
    } catch (error) {
      // File doesn't exist or is corrupted
      this.lastNonGuestUserId = null;
    }
  }

  /**
   * Save current user state to disk
   */
  private async saveCurrentUserToDisk(): Promise<void> {
    try {
      const data = { 
        lastNonGuestUserId: this.currentUserId !== UserAccountManager.GUEST_USER_ID ? this.currentUserId : this.lastNonGuestUserId
      };
      await fs.writeFile(this.currentUserFilePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (error) {
      console.error("Failed to save current user to disk:", error);
    }
  }

  /**
   * Generate unique session partition for user
   */
  private generateSessionPartition(userId: string): string {
    return `persist:user-${userId}`;
  }

  /**
   * Validate user name (unique, length, format)
   */
  private validateUserName(name: string, excludeUserId?: string): { valid: boolean; error?: string } {
    if (!name || name.trim().length === 0) {
      return { valid: false, error: "Name is required" };
    }

    if (name.trim().length > 50) {
      return { valid: false, error: "Name must be 50 characters or less" };
    }

    // Check uniqueness (exclude guest user and current user being updated)
    for (const [userId, user] of this.users) {
      if (userId !== excludeUserId && !user.isGuest && user.name.toLowerCase() === name.toLowerCase()) {
        return { valid: false, error: "Name already exists" };
      }
    }

    return { valid: true };
  }

  /**
   * Validate email format
   */
  private validateEmail(email: string): { valid: boolean; error?: string } {
    if (!email || email.trim().length === 0) {
      return { valid: true }; // Email is optional
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { valid: false, error: "Invalid email format" };
    }

    return { valid: true };
  }

  /**
   * Update last active time for user
   */
  private async updateLastActiveTime(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (user && !user.isGuest) { // Don't persist guest user activity
      user.lastActiveAt = new Date();
      await this.saveUsersToDisk();
    }
  }

  /**
   * Create a new user account
   */
  async createUser(userData: CreateUserData): Promise<{ success: boolean; user?: UserAccount; error?: string }> {
    try {
      // Check max users limit (excluding guest)
      const nonGuestUsers = Array.from(this.users.values()).filter(u => !u.isGuest);
      if (nonGuestUsers.length >= this.maxUsers) {
        return { success: false, error: `Maximum ${this.maxUsers} users allowed` };
      }

      // Validate input
      const nameValidation = this.validateUserName(userData.name);
      if (!nameValidation.valid) {
        return { success: false, error: nameValidation.error };
      }

      const emailValidation = this.validateEmail(userData.email || "");
      if (!emailValidation.valid) {
        return { success: false, error: emailValidation.error };
      }

      // Create user
      const userId = uuidv4();
      const newUser: UserAccount = {
        id: userId,
        name: userData.name.trim(),
        email: userData.email?.trim() || "",
        birthday: userData.birthday,
        createdAt: new Date(),
        lastActiveAt: new Date(),
        sessionPartition: this.generateSessionPartition(userId),
        isGuest: false
      };

      // Add to users map
      this.users.set(userId, newUser);
      
      // Save to disk
      await this.saveUsersToDisk();

      console.log(`Created new user: ${newUser.name} (${userId})`);
      return { success: true, user: newUser };
    } catch (error) {
      console.error("Failed to create user:", error);
      return { success: false, error: "Failed to create user" };
    }
  }

  /**
   * Switch to a different user with tab management options
   */
  async switchUser(userId: string, options: TabSwitchOptions = { keepCurrentTabs: false }): Promise<{ success: boolean; error?: string; tabsToLoad?: UserTabState[] }> {
    try {
      // Validate user exists
      if (!this.users.has(userId)) {
        return { success: false, error: "User not found" };
      }

      // If already current user, no need to switch
      if (this.currentUserId === userId) {
        return { success: true };
      }

      const previousUserId = this.currentUserId;
      const newUser = this.users.get(userId)!;

      // Handle current tabs before switching
      let tabsToLoad: UserTabState[] = [];
      
      if (previousUserId) {
        if (options.keepCurrentTabs) {
          // This will be handled by the caller (Window class) to get current tabs and save them to new user
          console.log(`Switching from ${previousUserId} to ${userId} - keeping current tabs`);
        } else {
          // Load the new user's saved tabs
          tabsToLoad = await this.userDataManager.loadUserTabs(userId);
          console.log(`Switching from ${previousUserId} to ${userId} - loading user's ${tabsToLoad.length} saved tabs`);
        }
      }

      // Switch to new user
      this.currentUserId = userId;
      
      // Update tracking
      if (!newUser.isGuest) {
        this.lastNonGuestUserId = userId;
        await this.updateLastActiveTime(userId);
      } else {
        // Guest user - always fresh, so clear any existing tabs
        await this.userDataManager.clearUserTabs(userId);
        tabsToLoad = [];
      }
      
      await this.saveCurrentUserToDisk();

      console.log(`Switched to user: ${newUser.name} (${userId})`);
      return { success: true, tabsToLoad };
    } catch (error) {
      console.error("Failed to switch user:", error);
      return { success: false, error: "Failed to switch user" };
    }
  }

  /**
   * Save current tabs for the current user
   */
  async saveCurrentUserTabs(tabs: UserTabState[]): Promise<void> {
    if (this.currentUserId && !this.isCurrentUserGuest()) {
      await this.userDataManager.saveUserTabs(this.currentUserId, tabs);
      console.log(`Saved ${tabs.length} tabs for user ${this.currentUserId}`);
    }
  }

  /**
   * Delete a user account
   */
  async deleteUser(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Cannot delete guest user
      if (userId === UserAccountManager.GUEST_USER_ID) {
        return { success: false, error: "Cannot delete guest user" };
      }

      // Validate user exists
      if (!this.users.has(userId)) {
        return { success: false, error: "User not found" };
      }

      const user = this.users.get(userId)!;

      // If deleting current user, switch to guest
      if (this.currentUserId === userId) {
        await this.switchUser(UserAccountManager.GUEST_USER_ID);
      }

      // If this was the last non-guest user, clear that tracking
      if (this.lastNonGuestUserId === userId) {
        this.lastNonGuestUserId = null;
        await this.saveCurrentUserToDisk();
      }

      // Remove user
      this.users.delete(userId);
      
      // Clear user data
      await this.userDataManager.clearUserData(userId);
      
      // Save changes
      await this.saveUsersToDisk();

      console.log(`Deleted user: ${user.name} (${userId})`);
      return { success: true };
    } catch (error) {
      console.error("Failed to delete user:", error);
      return { success: false, error: "Failed to delete user" };
    }
  }

  /**
   * Update user information
   */
  async updateUser(userId: string, updates: Partial<CreateUserData>): Promise<{ success: boolean; user?: UserAccount; error?: string }> {
    try {
      const user = this.users.get(userId);
      if (!user || user.isGuest) {
        return { success: false, error: "User not found or cannot update guest user" };
      }

      // Validate updates
      if (updates.name !== undefined) {
        const nameValidation = this.validateUserName(updates.name, userId);
        if (!nameValidation.valid) {
          return { success: false, error: nameValidation.error };
        }
        user.name = updates.name.trim();
      }

      if (updates.email !== undefined) {
        const emailValidation = this.validateEmail(updates.email);
        if (!emailValidation.valid) {
          return { success: false, error: emailValidation.error };
        }
        user.email = updates.email.trim();
      }

      if (updates.birthday !== undefined) {
        user.birthday = updates.birthday;
      }

      // Save changes
      await this.saveUsersToDisk();

      console.log(`Updated user: ${user.name} (${userId})`);
      return { success: true, user };
    } catch (error) {
      console.error("Failed to update user:", error);
      return { success: false, error: "Failed to update user" };
    }
  }

  /**
   * Get current user
   */
  getCurrentUser(): UserAccount | null {
    if (!this.currentUserId) return null;
    return this.users.get(this.currentUserId) || null;
  }

  /**
   * Get all users (sort by last active time, guest last)
   */
  getAllUsers(): UserAccount[] {
    return Array.from(this.users.values()).sort((a, b) => {
      // Guest user always goes last
      if (a.isGuest && !b.isGuest) return 1;
      if (!a.isGuest && b.isGuest) return -1;
      
      // For non-guest users, sort by last active time (most recent first)
      return b.lastActiveAt.getTime() - a.lastActiveAt.getTime();
    });
  }

  /**
   * Get non-guest users only
   */
  getNonGuestUsers(): UserAccount[] {
    return Array.from(this.users.values())
      .filter(user => !user.isGuest)
      .sort((a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime());
  }

  /**
   * Get user by ID
   */
  getUser(userId: string): UserAccount | null {
    return this.users.get(userId) || null;
  }

  /**
   * Get current user's session partition
   */
  getCurrentSessionPartition(): string {
    const currentUser = this.getCurrentUser();
    return currentUser?.sessionPartition || "persist:guest";
  }

  /**
   * Check if current user is guest
   */
  isCurrentUserGuest(): boolean {
    return this.currentUserId === UserAccountManager.GUEST_USER_ID;
  }

  /**
   * Get guest user
   */
  getGuestUser(): UserAccount | null {
    return this.users.get(UserAccountManager.GUEST_USER_ID) || null;
  }

  /**
   * Reset guest user (create fresh instance)
   */
  async resetGuestUser(): Promise<void> {
    await this.createFreshGuestUser();
    console.log("Reset guest user to fresh state");
  }

  /**
   * Get user statistics
   */
  getUserStats(): { totalUsers: number; nonGuestUsers: number; currentUser: string | null; maxUsers: number; hasGuestUser: boolean } {
    const nonGuestUsers = this.getNonGuestUsers();
    return {
      totalUsers: this.users.size,
      nonGuestUsers: nonGuestUsers.length,
      currentUser: this.getCurrentUser()?.name || null,
      maxUsers: this.maxUsers,
      hasGuestUser: this.users.has(UserAccountManager.GUEST_USER_ID)
    };
  }
}
