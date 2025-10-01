import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';

interface Category {
  name: string;
  count: number;
  firstSeen: Date;
  lastUsed: Date;
}

interface CategoryData {
  version: number;
  lastUpdated: Date;
  categories: Category[];
}

export class CategoryManager {
  private categoriesPath: string;
  private categories: Map<string, Category> = new Map();
  private readonly MAX_CATEGORIES = 1000;
  private readonly VERSION = 1;
  private isLoaded: boolean = false;

  constructor() {
    const userDataPath = app.getPath('userData');
    const globalPath = path.join(userDataPath, 'users', 'global');
    this.categoriesPath = path.join(globalPath, 'categories.json');
  }

  /**
   * Load categories from disk
   */
  async load(): Promise<void> {
    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(this.categoriesPath), { recursive: true });

      try {
        const data = await fs.readFile(this.categoriesPath, 'utf-8');
        const parsed: CategoryData = JSON.parse(data);
        
        // Convert to Map for efficient lookups
        this.categories.clear();
        parsed.categories.forEach(cat => {
          this.categories.set(cat.name.toLowerCase(), {
            ...cat,
            firstSeen: new Date(cat.firstSeen),
            lastUsed: new Date(cat.lastUsed)
          });
        });

        console.log(`CategoryManager: Loaded ${this.categories.size} categories`);
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          // File doesn't exist yet - start with empty categories
          console.log('CategoryManager: No existing categories file, starting fresh');
        } else {
          console.error('CategoryManager: Error loading categories:', error);
        }
      }

      this.isLoaded = true;
    } catch (error) {
      console.error('CategoryManager: Failed to initialize:', error);
      this.isLoaded = true; // Continue with empty categories
    }
  }

  /**
   * Save categories to disk
   */
  async save(): Promise<void> {
    if (!this.isLoaded) {
      console.warn('CategoryManager: Cannot save before loading');
      return;
    }

    try {
      const data: CategoryData = {
        version: this.VERSION,
        lastUpdated: new Date(),
        categories: Array.from(this.categories.values())
      };

      await fs.writeFile(
        this.categoriesPath,
        JSON.stringify(data, null, 2),
        'utf-8'
      );

      console.log(`CategoryManager: Saved ${this.categories.size} categories`);
    } catch (error) {
      console.error('CategoryManager: Failed to save categories:', error);
    }
  }

  /**
   * Get all category names for prompt
   */
  getCategoryNames(): string[] {
    return Array.from(this.categories.keys()).sort();
  }

  /**
   * Get example categories for prompt (top 10 by usage)
   */
  getExampleCategories(): string[] {
    const examples = [
      'banking',
      'news',
      'e-commerce',
      'social-media',
      'education',
      'entertainment',
      'health',
      'travel',
      'food-delivery',
      'government'
    ];

    // Return existing categories if they exist, otherwise return default examples
    const existingExamples = examples.filter(ex => this.categories.has(ex));
    
    if (existingExamples.length >= 5) {
      return existingExamples;
    }

    // Add top categories by usage
    const topCategories = Array.from(this.categories.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10 - existingExamples.length)
      .map(c => c.name);

    return [...existingExamples, ...topCategories].slice(0, 10);
  }

  /**
   * Record that a category was used
   */
  async recordCategoryUse(categoryName: string): Promise<void> {
    if (!this.isLoaded) {
      await this.load();
    }

    const normalized = categoryName.toLowerCase().trim();
    
    if (!normalized || normalized === 'other') {
      // Don't track "other" or empty categories
      return;
    }

    const existing = this.categories.get(normalized);

    if (existing) {
      // Update existing category
      existing.count++;
      existing.lastUsed = new Date();
    } else {
      // Check if we can add a new category
      if (this.categories.size >= this.MAX_CATEGORIES) {
        console.warn(`CategoryManager: Max categories (${this.MAX_CATEGORIES}) reached, not adding "${normalized}"`);
        return;
      }

      // Add new category
      this.categories.set(normalized, {
        name: normalized,
        count: 1,
        firstSeen: new Date(),
        lastUsed: new Date()
      });

      console.log(`CategoryManager: Added new category "${normalized}" (${this.categories.size}/${this.MAX_CATEGORIES})`);
    }

    // Save periodically (every 10 new categories)
    if (this.categories.size % 10 === 0) {
      await this.save();
    }
  }

  /**
   * Check if we're at the category limit
   */
  isAtLimit(): boolean {
    return this.categories.size >= this.MAX_CATEGORIES;
  }

  /**
   * Get category count
   */
  getCategoryCount(): number {
    return this.categories.size;
  }

  /**
   * Get category statistics
   */
  getStatistics(): {
    total: number;
    maxAllowed: number;
    mostUsed: Array<{ name: string; count: number }>;
    recentlyUsed: Array<{ name: string; lastUsed: Date }>;
  } {
    const sortedByCount = Array.from(this.categories.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const sortedByRecent = Array.from(this.categories.values())
      .sort((a, b) => b.lastUsed.getTime() - a.lastUsed.getTime())
      .slice(0, 10);

    return {
      total: this.categories.size,
      maxAllowed: this.MAX_CATEGORIES,
      mostUsed: sortedByCount.map(c => ({ name: c.name, count: c.count })),
      recentlyUsed: sortedByRecent.map(c => ({ name: c.name, lastUsed: c.lastUsed }))
    };
  }

  /**
   * Clean up old unused categories
   * Removes categories with count < 3 and not used in 6 months
   */
  async cleanup(): Promise<number> {
    if (!this.isLoaded) {
      await this.load();
    }

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    let removedCount = 0;

    for (const [name, category] of this.categories.entries()) {
      if (category.count < 3 && category.lastUsed < sixMonthsAgo) {
        this.categories.delete(name);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`CategoryManager: Cleaned up ${removedCount} unused categories`);
      await this.save();
    }

    return removedCount;
  }
}
