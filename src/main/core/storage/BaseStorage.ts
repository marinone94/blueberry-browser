import { app } from "electron";
import { join } from "path";
import { promises as fs } from "fs";

/**
 * Base class for all feature storage classes.
 * Provides common file I/O operations for user-specific data.
 * 
 * Each feature gets its own storage class that extends this base.
 * Data is organized as: userData/users/user-data/{userId}/{feature-specific-files}
 */
export abstract class BaseStorage {
  protected readonly userDataPath: string;
  protected readonly usersDir: string;

  constructor() {
    this.userDataPath = app.getPath("userData");
    this.usersDir = join(this.userDataPath, "users");
  }

  /**
   * Get the data directory path for a specific user
   */
  protected getUserDataPath(userId: string): string {
    return join(this.usersDir, "user-data", userId);
  }

  /**
   * Ensure user data directory exists
   */
  protected async ensureUserDataDir(userId: string): Promise<void> {
    const userDir = this.getUserDataPath(userId);
    try {
      await fs.mkdir(userDir, { recursive: true });
    } catch (error) {
      console.error(`BaseStorage: Failed to create user directory for ${userId}:`, error);
    }
  }

  /**
   * Ensure any directory exists
   */
  protected async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      // Directory might already exist, ignore error
    }
  }

  /**
   * Save data to a user-specific file
   */
  protected async saveUserFile<T>(userId: string, filename: string, data: T): Promise<void> {
    await this.ensureUserDataDir(userId);
    const filePath = join(this.getUserDataPath(userId), filename);
    
    try {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (error) {
      console.error(`BaseStorage: Failed to save ${filename} for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Load data from a user-specific file
   */
  protected async loadUserFile<T>(userId: string, filename: string, defaultValue: T): Promise<T> {
    const filePath = join(this.getUserDataPath(userId), filename);
    
    try {
      const data = await fs.readFile(filePath, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is corrupted, return default
      return defaultValue;
    }
  }

  /**
   * Check if a user file exists
   */
  protected async userFileExists(userId: string, filename: string): Promise<boolean> {
    const filePath = join(this.getUserDataPath(userId), filename);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file size in bytes
   */
  protected async getFileSize(filePath: string): Promise<number> {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  /**
   * Delete a user file
   */
  protected async deleteUserFile(userId: string, filename: string): Promise<void> {
    const filePath = join(this.getUserDataPath(userId), filename);
    try {
      await fs.unlink(filePath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error(`BaseStorage: Failed to delete ${filename} for user ${userId}:`, error);
      }
    }
  }

  /**
   * Read directory contents
   */
  protected async readDirectory(dirPath: string): Promise<string[]> {
    try {
      return await fs.readdir(dirPath);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Write raw buffer to file
   */
  protected async writeBuffer(filePath: string, buffer: Buffer): Promise<void> {
    try {
      await fs.writeFile(filePath, buffer);
    } catch (error) {
      console.error(`BaseStorage: Failed to write buffer to ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Read raw buffer from file
   */
  protected async readBuffer(filePath: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(filePath);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      console.error(`BaseStorage: Failed to read buffer from ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Write raw text to file
   */
  protected async writeText(filePath: string, text: string): Promise<void> {
    try {
      await fs.writeFile(filePath, text, 'utf-8');
    } catch (error) {
      console.error(`BaseStorage: Failed to write text to ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Read raw text from file
   */
  protected async readText(filePath: string): Promise<string | null> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      console.error(`BaseStorage: Failed to read text from ${filePath}:`, error);
      return null;
    }
  }
}

