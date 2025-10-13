/**
 * LLM-powered content generation for realistic synthetic data
 */

import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import type { ContentAnalysisData, RealisticURL } from '../types';
import pLimit from 'p-limit';

/**
 * Generate realistic page content using LLM
 */
export class LLMContentGenerator {
  private cache: Map<string, any> = new Map();
  private verbose: boolean;
  private limit: ReturnType<typeof pLimit>;

  constructor(verbose = false, concurrency = 10) {
    this.verbose = verbose;
    this.limit = pLimit(concurrency);
  }

  /**
   * Generate a realistic URL and metadata for a given category/topic
   */
  async generateURL(category: string, subcategory: string, context?: string): Promise<RealisticURL> {
    const cacheKey = `url:${category}:${subcategory}:${context || ''}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    return this.limit(async () => {
      // Double-check cache after acquiring limit slot (avoid duplicate calls)
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      try {
      const prompt = `Generate a realistic URL, title, and brand for a webpage.

Category: ${category}
Subcategory: ${subcategory}
${context ? `Context: ${context}` : ''}

Requirements:
- Use real, well-known websites when appropriate
- URL should be realistic and follow proper format
- Title should be typical of real pages in this category
- Brand should be recognizable if applicable

Respond in JSON format:
{
  "url": "https://example.com/path",
  "domain": "example.com",
  "title": "Page Title | Brand",
  "brand": "Brand Name or empty string"
}`;

      const result = await generateText({
        model: openai('gpt-5-nano'),
        prompt,
      });

      const cleanedText = this.cleanJsonResponse(result.text);
      const data = JSON.parse(cleanedText);
      const urlData: RealisticURL = {
        url: data.url,
        domain: data.domain,
        title: data.title,
        category,
        subcategory,
        brand: data.brand || undefined,
      };

      this.cache.set(cacheKey, urlData);
      
      if (this.verbose) {
        console.log(`   🌐 Generated URL: ${urlData.url}`);
      }

      return urlData;
      } catch (error) {
        console.error('Failed to generate URL with LLM, using fallback:', error);
        return this.fallbackURL(category, subcategory);
      }
    });
  }

  /**
   * Generate realistic page content analysis
   */
  async generateContentAnalysis(url: string, title: string, category: string, subcategory: string): Promise<ContentAnalysisData> {
    const cacheKey = `content:${url}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    return this.limit(async () => {
      // Double-check cache after acquiring limit slot
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      try {
      const prompt = `Generate realistic webpage content for analysis.

URL: ${url}
Title: ${title}
Category: ${category}
Subcategory: ${subcategory}

Generate:
1. A detailed page description (2-3 sentences) - what the page is about
2. A screenshot description (1-2 sentences) - what would be visible
3. Full text content (150-300 words) - realistic page content
4. Meta description (1 sentence)
5. Primary language (e.g., "en", "es", "fr")
6. Brand name (if applicable)

Make it realistic and varied. For news sites, generate a news article. For shopping, generate product descriptions. For documentation, generate technical content.

Respond in JSON format:
{
  "pageDescription": "...",
  "screenshotDescription": "...",
  "fullText": "...",
  "metaDescription": "...",
  "primaryLanguage": "en",
  "brand": "..."
}`;

      const result = await generateText({
        model: openai('gpt-5-nano'),
        prompt,
      });

      const cleanedText = this.cleanJsonResponse(result.text);
      const data = JSON.parse(cleanedText);
      
      const contentAnalysis: ContentAnalysisData = {
        url,
        title,
        pageDescription: data.pageDescription,
        screenshotDescription: data.screenshotDescription,
        fullText: data.fullText,
        metaDescription: data.metaDescription,
        category,
        subcategory,
        brand: data.brand || '',
        primaryLanguage: data.primaryLanguage || 'en',
        languages: [data.primaryLanguage || 'en'],
      };

      this.cache.set(cacheKey, contentAnalysis);

      if (this.verbose) {
        console.log(`   📄 Generated content for: ${title}`);
      }

      return contentAnalysis;
      } catch (error) {
        console.error('Failed to generate content analysis with LLM:', error);
        return this.fallbackContentAnalysis(url, title, category, subcategory);
      }
    });
  }

  /**
   * Generate a realistic search query
   */
  async generateSearchQuery(category: string, intent: string): Promise<string> {
    const cacheKey = `search:${category}:${intent}`;
    if (this.cache.has(cacheKey)) {
      // Add variation by returning cached + random number
      const cached = this.cache.get(cacheKey);
      return Math.random() > 0.5 ? cached : await this.generateSearchQuery(category, intent);
    }

    return this.limit(async () => {
      // Double-check cache after acquiring limit slot
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        return Math.random() > 0.5 ? cached : cached + ' ' + Math.random().toString(36).substr(2, 3);
      }

      try {
      const prompt = `Generate a realistic search query.

Category: ${category}
Intent: ${intent}

Generate a search query that a real user would type. Make it natural, possibly with typos or informal language. Just the query, no explanation.

Examples:
- "best laptop for programming 2025"
- "how to fix wifi not connecting"
- "recipe for chocolate chip cookies"

Query:`;

      const result = await generateText({
        model: openai('gpt-5-nano'),
        prompt,
      });

      const query = result.text.trim().replace(/^["']|["']$/g, '');
      this.cache.set(cacheKey, query);

      if (this.verbose) {
        console.log(`   🔍 Generated search: "${query}"`);
      }

      return query;
      } catch (error) {
        console.error('Failed to generate search query:', error);
        return `${category} ${intent}`;
      }
    });
  }

  /**
   * Generate a sequence of related URLs for a browsing journey
   */
  async generateBrowsingJourney(intent: string, steps: number): Promise<RealisticURL[]> {
    return this.limit(async () => {
      try {
      const prompt = `Generate a realistic browsing journey with ${steps} steps.

User Intent: ${intent}

Generate ${steps} URLs that represent a natural browsing progression. For example:
- Shopping: search → product listing → product detail → reviews → comparison → checkout
- Research: search → overview article → detailed article → academic source → video
- Problem-solving: search → stack overflow → documentation → blog post → github issue

For each step, provide: URL, domain, title, category, subcategory, brand (if applicable)

Respond in JSON format as an array:
[
  {
    "url": "...",
    "domain": "...",
    "title": "...",
    "category": "...",
    "subcategory": "...",
    "brand": "..."
  }
]`;

      const result = await generateText({
        model: openai('gpt-5-nano'),
        prompt,
      });

      const cleanedText = this.cleanJsonResponse(result.text);
      const data = JSON.parse(cleanedText);
      
      if (this.verbose) {
        console.log(`   🎯 Generated ${steps}-step journey: ${intent}`);
      }

      return data.map((item: any) => ({
        url: item.url,
        domain: item.domain,
        title: item.title,
        category: item.category,
        subcategory: item.subcategory,
        brand: item.brand || undefined,
      }));
      } catch (error) {
        console.error('Failed to generate browsing journey:', error);
        // Fallback to simple generation
        return Promise.all(
          Array.from({ length: steps }).map((_, i) =>
            this.generateURL('general', 'web', `${intent} step ${i + 1}`)
          )
        );
      }
    });
  }

  /**
   * Fallback URL generator (without LLM)
   */
  private fallbackURL(category: string, subcategory: string): RealisticURL {
    const domain = `${subcategory.toLowerCase().replace(/\s+/g, '')}.com`;
    return {
      url: `https://${domain}/${Math.random().toString(36).substring(7)}`,
      domain,
      title: `${subcategory} - ${category}`,
      category,
      subcategory,
    };
  }

  /**
   * Fallback content analysis (without LLM)
   */
  private fallbackContentAnalysis(url: string, title: string, category: string, subcategory: string): ContentAnalysisData {
    return {
      url,
      title,
      pageDescription: `This is a ${subcategory} page in the ${category} category.`,
      screenshotDescription: `Screenshot showing a typical ${subcategory} webpage.`,
      fullText: `This is synthetic content for ${title}. ${category} - ${subcategory}. This page contains information about ${subcategory}. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`,
      metaDescription: `${subcategory} - ${category}`,
      category,
      subcategory,
      brand: '',
      primaryLanguage: 'en',
      languages: ['en'],
    };
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * Clean JSON response by removing markdown code blocks
   */
  private cleanJsonResponse(text: string): string {
    // Remove markdown code blocks (```json ... ``` or ``` ... ```)
    let cleaned = text.trim();
    
    // Remove opening code block
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
    
    // Remove closing code block
    cleaned = cleaned.replace(/\s*```\s*$/, '');
    
    return cleaned.trim();
  }
}

