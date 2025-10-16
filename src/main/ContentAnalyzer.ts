import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import type { UserDataManager } from './UserDataManager';
import type { CategoryManager } from './CategoryManager';
import type { VectorSearchManager } from './VectorSearchManager';
import type { Tab } from './features/tabs';

// ============================================================================
// INTERFACES
// ============================================================================

interface AnalysisQueueItem {
  queueId: string;
  activityId: string;
  userId: string;
  url: string;
  historyEntryId?: string;  // Link to browsing history entry
  timestamp: Date;
  status: 'pending' | 'in_progress';
  retryCount: number;
  lastError?: string;
}

interface ExtractedText {
  title: string;
  metaDescription?: string;
  headings: Array<{ level: number; text: string }>;
  paragraphs: string[];
  links: Array<{ text: string; href: string }>;
  fullText: string;
  textLength: number;
}

interface ScreenshotMetadata {
  viewportWidth: number;
  viewportHeight: number;
  documentHeight: number;
  scrollPosition: { x: number; y: number };
  zoomFactor: number;
  capturedAt: Date;
}

interface ContentAnalysisResult {
  analysisId: string;
  activityIds: string[];
  userId: string;
  timestamp: Date;
  url: string;

  // Text-based extractions
  pageDescription: string;
  rawText: ExtractedText;
  htmlHash: string;  // Reference to raw-html/{hash}.html

  // Visual analysis
  screenshotDescription: string;
  screenshotPath: string;
  screenshotHash: string;
  screenshotMetadata: ScreenshotMetadata;

  // Categorization
  category: string;
  subcategory: string;
  brand: string;

  // Language detection
  languages: string[];
  primaryLanguage: string;

  // Analysis metadata
  analysisStatus: 'completed' | 'failed';
  modelUsed: string;
  tokensUsed?: number;
  analysisTime: number;
  error?: string;
  llmInteractionId?: string;
}

interface LLMAnalysisResponse {
  pageDescription: string;
  screenshotDescription: string;
  languages: string[];
  primaryLanguage: string;
  category: string;
  subcategory: string;
  brand: string;
}

// ============================================================================
// CONTENT ANALYZER
// ============================================================================

export class ContentAnalyzer {
  private userDataManager: UserDataManager;
  private categoryManager: CategoryManager;
  private vectorSearchManager: VectorSearchManager;
  private queue: AnalysisQueueItem[] = [];
  private queuePath: string;
  private isProcessing: boolean = false;
  private model = openai('gpt-5-nano');
  private readonly modelName = 'gpt-5-nano';
  private readonly MAX_RETRIES = 3;
  private readonly URL_BLACKLIST = [
    'https://www.google.com',
    'https://www.google.com/',
    'about:blank',
    'chrome://',
    'file://'
  ];

  constructor(
    userDataManager: UserDataManager,
    categoryManager: CategoryManager,
    vectorSearchManager: VectorSearchManager
  ) {
    this.userDataManager = userDataManager;
    this.categoryManager = categoryManager;
    this.vectorSearchManager = vectorSearchManager;

    const userDataPath = app.getPath('userData');
    this.queuePath = join(userDataPath, 'users', 'analysis-queue.json');

    // Load queue from disk
    this.loadQueue().catch(error => {
      console.error('ContentAnalyzer: Failed to load queue:', error);
    });

    // Start processing worker
    this.startWorker();

    console.log('ContentAnalyzer: Initialized');
  }

  // ============================================================================
  // QUEUE MANAGEMENT
  // ============================================================================

  private async loadQueue(): Promise<void> {
    try {
      const data = await fs.readFile(this.queuePath, 'utf-8');
      this.queue = JSON.parse(data).map((item: any) => ({
        ...item,
        timestamp: new Date(item.timestamp)
      }));
      console.log(`ContentAnalyzer: Loaded ${this.queue.length} items from queue`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log('ContentAnalyzer: No existing queue file, starting fresh');
      } else {
        console.error('ContentAnalyzer: Error loading queue:', error);
      }
    }
  }

  private async saveQueue(): Promise<void> {
    try {
      // Ensure directory exists
      await fs.mkdir(join(app.getPath('userData'), 'users'), { recursive: true });
      
      await fs.writeFile(
        this.queuePath,
        JSON.stringify(this.queue, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('ContentAnalyzer: Error saving queue:', error);
    }
  }

  private async addToQueue(item: Omit<AnalysisQueueItem, 'queueId' | 'status' | 'retryCount'>): Promise<void> {
    const queueItem: AnalysisQueueItem = {
      ...item,
      queueId: this.generateId('queue'),
      status: 'pending',
      retryCount: 0
    };

    this.queue.push(queueItem);
    await this.saveQueue();

    console.log(`ContentAnalyzer: Added to queue - ${item.url} (${this.queue.length} items)`);

    // Start worker if not already running
    if (!this.isProcessing) {
      this.processNextInQueue();
    }
  }

  private async removeFromQueue(queueId: string): Promise<void> {
    this.queue = this.queue.filter(item => item.queueId !== queueId);
    await this.saveQueue();
  }

  // ============================================================================
  // WORKER
  // ============================================================================

  private startWorker(): void {
    // Process queue continuously
    setInterval(() => {
      if (!this.isProcessing && this.queue.length > 0) {
        this.processNextInQueue();
      }
    }, 5000); // Check every 5 seconds
  }

  private async processNextInQueue(): Promise<void> {
    if (this.isProcessing) return;

    const pendingItem = this.queue.find(item => item.status === 'pending');
    if (!pendingItem) return;

    this.isProcessing = true;
    pendingItem.status = 'in_progress';
    await this.saveQueue();

    console.log(`ContentAnalyzer: Processing ${pendingItem.url}`);

    try {
      await this.performAnalysis(pendingItem);
      await this.removeFromQueue(pendingItem.queueId);
    } catch (error: any) {
      console.error('ContentAnalyzer: Analysis failed:', error);

      // Handle retry logic
      pendingItem.retryCount++;
      pendingItem.lastError = error.message;
      pendingItem.status = 'pending';

      if (pendingItem.retryCount >= this.MAX_RETRIES) {
        console.error(`ContentAnalyzer: Max retries reached for ${pendingItem.url}`);
        await this.removeFromQueue(pendingItem.queueId);
        
        // Save failed analysis result
        await this.saveFailedAnalysisResult(pendingItem, error.message);
      } else {
        // Check if it's a rate limit error (429)
        if (error.message.includes('429') || error.message.includes('rate limit')) {
          const waitTime = Math.pow(2, pendingItem.retryCount) * 1000;
          console.log(`ContentAnalyzer: Rate limited, waiting ${waitTime}ms before retry`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        await this.saveQueue();
      }
    } finally {
      this.isProcessing = false;
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  async onPageVisit(activityId: string, url: string, userId: string, tab: Tab): Promise<void> {
    try {
      console.log(`ContentAnalyzer: Page visit - ${url}`);

      // Check if URL is blacklisted
      if (this.isUrlBlacklisted(url)) {
        console.log(`ContentAnalyzer: URL blacklisted, skipping analysis - ${url}`);
        return;
      }

      // Extract current page data
      const html = await tab.getTabHtml();
      if (!html || html.length === 0) {
        console.log('ContentAnalyzer: No HTML content, skipping analysis');
        return;
      }

      const htmlHash = this.computeHash(html);

      // Extract structured text
      const extractedText = await tab.extractStructuredText();

      // Capture screenshot with metadata
      const screenshotData = await tab.getScreenshotWithMetadata();
      const screenshotBuffer = screenshotData.image.toPNG();
      const screenshotHash = this.computeHash(screenshotBuffer);

      // Check for existing analysis with same content
      const indexKey = `${url}:${htmlHash}:${screenshotHash}`;
      const analysisIndex = await this.userDataManager.getAnalysisIndex(userId);
      const existingAnalysisId = analysisIndex.get(indexKey);

      if (existingAnalysisId) {
        // Reuse existing analysis
        console.log(`ContentAnalyzer: Reusing existing analysis ${existingAnalysisId} for ${url}`);
        await this.userDataManager.linkActivityToAnalysis(userId, activityId, existingAnalysisId);
        return;
      }

      // Save screenshot for new analysis
      await this.userDataManager.saveScreenshot(
        userId,
        activityId,
        screenshotBuffer
      );

      // Save raw HTML to separate directory using hash
      await this.userDataManager.saveRawHtml(userId, htmlHash, html);

      // Store the extracted data temporarily so it's available during queue processing
      // We'll create a temporary storage for this
      const tempData = {
        activityId,
        htmlHash,
        extractedText,
        screenshotHash,
        screenshotMetadata: screenshotData.metadata
      };
      
      await this.saveTempAnalysisData(userId, activityId, tempData);

      // Queue new analysis with history entry ID
      await this.addToQueue({
        activityId,
        userId,
        url,
        historyEntryId: tab.currentHistoryId,  // Link to browsing history
        timestamp: new Date()
      });

    } catch (error) {
      console.error('ContentAnalyzer: Error in onPageVisit:', error);
    }
  }

  private async saveTempAnalysisData(_userId: string, activityId: string, data: any): Promise<void> {
    try {
      const tempDir = join(app.getPath('userData'), 'users', 'temp-analysis');
      await fs.mkdir(tempDir, { recursive: true });
      
      const tempPath = join(tempDir, `${activityId}.json`);
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('ContentAnalyzer: Failed to save temp data:', error);
    }
  }

  private async loadTempAnalysisData(activityId: string): Promise<any | null> {
    try {
      const tempDir = join(app.getPath('userData'), 'users', 'temp-analysis');
      const tempPath = join(tempDir, `${activityId}.json`);
      
      const data = await fs.readFile(tempPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  private async deleteTempAnalysisData(activityId: string): Promise<void> {
    try {
      const tempDir = join(app.getPath('userData'), 'users', 'temp-analysis');
      const tempPath = join(tempDir, `${activityId}.json`);
      
      await fs.unlink(tempPath);
    } catch (error) {
      // Ignore errors
    }
  }

  // ============================================================================
  // ANALYSIS LOGIC
  // ============================================================================

  private async performAnalysis(queueItem: AnalysisQueueItem): Promise<void> {
    const startTime = Date.now();
    const analysisId = this.generateId('analysis');
    const interactionId = this.generateId('llm');

    try {
      // Load temp data saved during onPageVisit
      const tempData = await this.loadTempAnalysisData(queueItem.activityId);
      
      if (!tempData) {
        throw new Error('Temp analysis data not found - page data may have been lost');
      }

      // Load screenshot
      const screenshotBuffer = await this.userDataManager.getScreenshot(
        queueItem.userId,
        queueItem.activityId
      );

      if (!screenshotBuffer) {
        throw new Error('Screenshot not found');
      }

      const screenshotDataUrl = `data:image/png;base64,${screenshotBuffer.toString('base64')}`;

      const extractedText: ExtractedText = tempData.extractedText;

      // Get categories for prompt
      const exampleCategories = this.categoryManager.getExampleCategories();

      // Build prompt
      const prompt = this.buildAnalysisPrompt(
        queueItem.url,
        extractedText,
        exampleCategories
      );

      // Call LLM with retry logic
      let llmResponse: LLMAnalysisResponse | null = null;
      let rawResponse = '';
      
      for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
        try {
          const result = await streamText({
            model: this.model,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'image', image: screenshotDataUrl },
                  { type: 'text', text: prompt }
                ]
              }
            ]
          });

          // Collect streaming response
          rawResponse = '';
          for await (const chunk of result.textStream) {
            rawResponse += chunk;
          }

          // Parse JSON response
          llmResponse = this.parseJSONResponse(rawResponse);

          if (llmResponse) {
            break; // Success!
          } else if (attempt < this.MAX_RETRIES - 1) {
            // Retry with more explicit prompt
            console.log(`ContentAnalyzer: Invalid JSON on attempt ${attempt + 1}, retrying...`);
            const retryPrompt = this.buildRetryPrompt();
            
            const retryResult = await streamText({
              model: this.model,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'image', image: screenshotDataUrl },
                    { type: 'text', text: prompt }
                  ]
                },
                {
                  role: 'assistant',
                  content: rawResponse
                },
                {
                  role: 'user',
                  content: retryPrompt
                }
              ]
            });

            rawResponse = '';
            for await (const chunk of retryResult.textStream) {
              rawResponse += chunk;
            }

            llmResponse = this.parseJSONResponse(rawResponse);
          }
        } catch (error: any) {
          const lc_error_message = error.message.toLowerCase()
          if (lc_error_message.includes('429') || lc_error_message.includes('rate limit') || lc_error_message.includes('too many requests') ) {
            throw error; // Propagate rate limit errors for exponential backoff
          }
          console.error(`ContentAnalyzer: LLM call failed on attempt ${attempt + 1}:`, error);
          
          if (attempt === this.MAX_RETRIES - 1) {
            throw error;
          }
        }
      }

      if (!llmResponse) {
        throw new Error('Failed to get valid JSON response from LLM after retries');
      }

      const analysisTime = Date.now() - startTime;

      // Record category usage
      await this.categoryManager.recordCategoryUse(llmResponse.category);

      // Create analysis result
      const analysisResult: ContentAnalysisResult = {
        analysisId,
        activityIds: [queueItem.activityId],
        userId: queueItem.userId,
        timestamp: new Date(),
        url: queueItem.url,
        pageDescription: llmResponse.pageDescription,
        rawText: extractedText,
        htmlHash: tempData.htmlHash,  // Reference only, HTML stored separately
        screenshotDescription: llmResponse.screenshotDescription,
        screenshotPath: `screenshots/${queueItem.activityId}.png`,
        screenshotHash: tempData.screenshotHash,
        screenshotMetadata: tempData.screenshotMetadata,
        category: llmResponse.category,
        subcategory: llmResponse.subcategory,
        brand: llmResponse.brand,
        languages: llmResponse.languages,
        primaryLanguage: llmResponse.primaryLanguage,
        analysisStatus: 'completed',
        modelUsed: this.modelName,
        analysisTime,
        llmInteractionId: interactionId
      };

      // Save analysis result
      await this.userDataManager.saveContentAnalysis(queueItem.userId, analysisResult);

      // Update index
      const indexKey = `${queueItem.url}:${analysisResult.htmlHash}:${analysisResult.screenshotHash}`;
      await this.userDataManager.updateAnalysisIndex(queueItem.userId, indexKey, analysisId);

      // Link analysis to browsing history entry
      if (queueItem.historyEntryId) {
        try {
          await this.userDataManager.linkHistoryToAnalysis(
            queueItem.userId,
            queueItem.historyEntryId,
            analysisId
          );
        } catch (linkError) {
          console.error('ContentAnalyzer: Failed to link history entry:', linkError);
        }
      }

      // Index content in vector database
      try {
        await this.vectorSearchManager.indexContentAnalysis(
          analysisId,
          queueItem.userId,
          queueItem.url,
          analysisResult.timestamp,
          {
            pageDescription: analysisResult.pageDescription,
            title: analysisResult.rawText.title,
            metaDescription: analysisResult.rawText.metaDescription,
            screenshotDescription: analysisResult.screenshotDescription
          }
        );
        console.log(`ContentAnalyzer: Vector indexed ${analysisId}`);
      } catch (vectorError) {
        // Don't fail the entire analysis if vector indexing fails
        console.error('ContentAnalyzer: Vector indexing failed:', vectorError);
      }

      // Save LLM debug log
      await this.userDataManager.saveLLMDebugLog(queueItem.userId, {
        interactionId,
        timestamp: new Date(),
        analysisId,
        activityId: queueItem.activityId,
        userId: queueItem.userId,
        model: this.modelName,
        prompt,
        screenshotPath: analysisResult.screenshotPath,
        rawResponse,
        parsedResponse: llmResponse,
        responseTime: analysisTime,
        retryAttempt: queueItem.retryCount,
        success: true
      });

      // Clean up temp data
      await this.deleteTempAnalysisData(queueItem.activityId);

      console.log(`ContentAnalyzer: Analysis completed for ${queueItem.url} in ${analysisTime}ms`);

    } catch (error) {
      // Save failed LLM debug log
      await this.userDataManager.saveLLMDebugLog(queueItem.userId, {
        interactionId,
        timestamp: new Date(),
        analysisId,
        activityId: queueItem.activityId,
        userId: queueItem.userId,
        model: this.modelName,
        prompt: '',
        screenshotPath: `screenshots/${queueItem.activityId}.png`,
        rawResponse: '',
        parseError: error instanceof Error ? error.message : String(error),
        responseTime: Date.now() - startTime,
        retryAttempt: queueItem.retryCount,
        success: false
      });

      throw error;
    }
  }

  private async saveFailedAnalysisResult(queueItem: AnalysisQueueItem, error: string): Promise<void> {
    const analysisId = this.generateId('analysis');

    const failedResult: ContentAnalysisResult = {
      analysisId,
      activityIds: [queueItem.activityId],
      userId: queueItem.userId,
      timestamp: new Date(),
      url: queueItem.url,
      pageDescription: '',
      rawText: {
        title: '',
        headings: [],
        paragraphs: [],
        links: [],
        fullText: '',
        textLength: 0
      },
      htmlHash: '',
      screenshotDescription: '',
      screenshotPath: `screenshots/${queueItem.activityId}.png`,
      screenshotHash: '',
      screenshotMetadata: {
        viewportWidth: 0,
        viewportHeight: 0,
        documentHeight: 0,
        scrollPosition: { x: 0, y: 0 },
        zoomFactor: 1,
        capturedAt: new Date()
      },
      category: 'other',
      subcategory: '',
      brand: '',
      languages: [],
      primaryLanguage: '',
      analysisStatus: 'failed',
      modelUsed: this.modelName,
      analysisTime: 0,
      error
    };

    await this.userDataManager.saveContentAnalysis(queueItem.userId, failedResult);
  }

  // ============================================================================
  // PROMPTS
  // ============================================================================

  private buildAnalysisPrompt(url: string, extractedText: ExtractedText, exampleCategories: string[]): string {
    const truncatedText = extractedText.fullText.slice(0, 4000);

    return `You are analyzing a webpage to extract structured information.

=== EXTRACTED TEXT ===
${truncatedText}

=== PAGE METADATA ===
URL: ${url}
Title: ${extractedText.title}
Metadata: ${extractedText.metaDescription ? `Meta Description: ${extractedText.metaDescription}` : 'na'}

=== SCREENSHOT ===
[Attached as multimodal image]

=== YOUR TASK ===
Analyze this webpage and provide structured information in JSON format.

1. PAGE DESCRIPTION: Write a 2-3 sentence description of what this page is about
2. SCREENSHOT DESCRIPTION: Describe what is visible in the screenshot (layout, key elements, visual design)
3. LANGUAGES: Detect all languages present on the page (ISO 639-1 codes like "en", "sv", "es")
4. CATEGORIZATION:
   - CATEGORY: High-level category (see examples below)
   - SUBCATEGORY: More specific type or section
   - BRAND: Company, organization, or website name

=== CATEGORY GUIDELINES ===
Choose the BEST FITTING category from existing categories, OR create a new one if needed.
Categories should be broad and reusable (e.g., "banking", "news", "e-commerce", "social-media").
Aim for generality to keep categories under 1000 total.

Example categories:
${exampleCategories.join(', ')}

If no category fits, create a new descriptive one.

=== OUTPUT FORMAT ===
Return ONLY valid JSON, no additional text:

{
  "pageDescription": "A 2-3 sentence summary of the page content and purpose",
  "screenshotDescription": "Description of what's visible: layout, main elements, colors, branding",
  "languages": ["en", "sv"],
  "primaryLanguage": "en",
  "category": "banking",
  "subcategory": "mortgage",
  "brand": "Swedbank"
}

=== EXAMPLE OUTPUT ===
{
  "pageDescription": "Swedbank's mortgage page provides information about home loans, interest rates, and application process for Swedish residents. The page includes calculators, eligibility requirements, and contact information for loan advisors.",
  "screenshotDescription": "Clean banking website with blue and orange branding. Header shows Swedbank logo and navigation menu. Main content area displays mortgage information with prominent call-to-action buttons and an interest rate table.",
  "languages": ["sv", "en"],
  "primaryLanguage": "sv",
  "category": "banking",
  "subcategory": "mortgage",
  "brand": "Swedbank"
}

Now analyze the webpage and return JSON:`;
  }

  private buildRetryPrompt(): string {
    return `Your previous response could not be parsed as valid JSON.

Please return ONLY the JSON object with no additional text, markdown formatting, or explanations.

The JSON must match this exact structure:
{
  "pageDescription": "string",
  "screenshotDescription": "string",
  "languages": ["string"],
  "primaryLanguage": "string",
  "category": "string",
  "subcategory": "string",
  "brand": "string"
}

Try again:`;
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  private parseJSONResponse(text: string): LLMAnalysisResponse | null {
    try {
      // Try direct parse
      const parsed = JSON.parse(text);
      
      // Validate required fields
      if (
        typeof parsed.pageDescription === 'string' &&
        typeof parsed.screenshotDescription === 'string' &&
        Array.isArray(parsed.languages) &&
        typeof parsed.primaryLanguage === 'string' &&
        typeof parsed.category === 'string' &&
        typeof parsed.subcategory === 'string' &&
        typeof parsed.brand === 'string'
      ) {
        return parsed as LLMAnalysisResponse;
      }
      
      return null;
    } catch {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          if (
            typeof parsed.pageDescription === 'string' &&
            typeof parsed.screenshotDescription === 'string' &&
            Array.isArray(parsed.languages) &&
            typeof parsed.primaryLanguage === 'string' &&
            typeof parsed.category === 'string' &&
            typeof parsed.subcategory === 'string' &&
            typeof parsed.brand === 'string'
          ) {
            return parsed as LLMAnalysisResponse;
          }
        } catch {
          return null;
        }
      }
      
      return null;
    }
  }

  private computeHash(data: string | Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private isUrlBlacklisted(url: string): boolean {
    // Check exact matches
    if (this.URL_BLACKLIST.includes(url)) {
      return true;
    }

    // Check prefix matches (for chrome://, file://, etc.)
    return this.URL_BLACKLIST.some(blacklisted => {
      if (blacklisted.endsWith('://')) {
        return url.startsWith(blacklisted);
      }
      return false;
    });
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  async destroy(): Promise<void> {
    await this.saveQueue();
    console.log('ContentAnalyzer: Destroyed');
  }
}
