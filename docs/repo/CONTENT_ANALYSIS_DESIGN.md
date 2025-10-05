# Content Analysis System Design

## Overview

Intelligent content analysis system that extracts, analyzes, and categorizes webpage content using AI. Performs deep analysis on page visits, with smart deduplication to avoid redundant processing.

## Architecture

### Core Components

#### 1. ContentAnalyzer (`src/main/ContentAnalyzer.ts`)
- Main orchestrator for content analysis
- Manages analysis queue and worker
- Handles deduplication logic (compare HTML/screenshot)
- Continues processing even if tab/window closes or user switches accounts
- Uses cheaper model (GPT-5-nano or Claude Haiku)

#### 2. CategoryManager (`src/main/CategoryManager.ts`)
- Maintains global category taxonomy (max 1000 high-level categories)
- Loads/saves categories from disk
- Provides category list to analysis prompts
- Returns "other" when limit reached
- Categories shared across all users

#### 3. AnalysisQueue (internal to ContentAnalyzer)
- FIFO queue for pending analyses
- Persists to disk (`analysis-queue.json`) to survive app restarts
- Worker processes one analysis at a time
- Tracks status: `pending` | `in_progress` | `completed` | `failed`

### Data Structures

```typescript
// Content Analysis Result
interface ContentAnalysisResult {
  analysisId: string              // Unique ID for this analysis
  activityIds: string[]           // Multiple activities can link to same analysis
  userId: string                  // User who triggered the analysis
  timestamp: Date                 // When analysis was performed
  url: string                     // Page URL
  
  // Text-based extractions
  pageDescription: string         // AI-generated 2-3 sentence summary
  rawText: ExtractedText          // Structured text extraction
  rawHtml: string                 // Full HTML for deduplication
  htmlHash: string                // SHA-256 hash for quick comparison
  
  // Visual analysis
  screenshotDescription: string   // AI description of screenshot
  screenshotPath: string          // Path to screenshot file
  screenshotHash: string          // SHA-256 hash for comparison
  screenshotMetadata: ScreenshotMetadata
  
  // Categorization
  category: string                // High-level (from global list or "other")
  subcategory: string             // Specific type (unlimited)
  brand: string                   // Company/organization (unlimited)
  
  // Language detection
  languages: string[]             // All detected languages, e.g., ["en", "sv"]
  primaryLanguage: string         // Main language
  
  // Analysis metadata
  analysisStatus: 'completed' | 'failed'
  modelUsed: string
  tokensUsed?: number
  analysisTime: number            // Time taken in ms
  error?: string
  llmInteractionId?: string       // Reference to debug log entry
}

// Structured text extraction
interface ExtractedText {
  title: string
  metaDescription?: string
  headings: Array<{
    level: number                 // h1, h2, etc.
    text: string
  }>
  paragraphs: string[]            // Main content paragraphs
  links: Array<{
    text: string
    href: string
  }>
  fullText: string                // Cleaned, formatted full text
  textLength: number
}

// Screenshot metadata for viewport context
interface ScreenshotMetadata {
  viewportWidth: number
  viewportHeight: number
  documentHeight: number
  scrollPosition: {
    x: number
    y: number
  }
  zoomFactor: number
  capturedAt: Date
}

// Queue item persisted to disk
interface AnalysisQueueItem {
  queueId: string
  activityId: string
  userId: string
  url: string
  timestamp: Date
  status: 'pending' | 'in_progress'
  retryCount: number
  lastError?: string
}

// LLM Debug Log Entry
interface LLMDebugLog {
  interactionId: string
  timestamp: Date
  analysisId: string
  activityId: string
  userId: string
  model: string
  
  // Request
  prompt: string
  screenshotPath: string          // Reference to screenshot, not base64
  maxTokens?: number
  
  // Response
  rawResponse: string
  parsedResponse?: any
  parseError?: string
  
  // Metadata
  tokensUsed?: number
  responseTime: number            // ms
  retryAttempt: number
  success: boolean
}
```

### Storage Structure

```
/users/user-data/{userId}/
  ├── raw-activity/
  │   ├── 2025-09-30.json              # Existing activity tracking
  │   └── ...
  ├── content-analysis/
  │   ├── 2025-09-30.json              # Analysis results (by date)
  │   ├── index.json                   # Fast lookup: url+hash → analysisId
  │   └── ...
  ├── screenshots/
  │   ├── {activityId}.png             # Screenshot files
  │   └── ...
  ├── llm-debug-logs/
  │   ├── 2025-09-30.json              # LLM interactions for debugging
  │   └── ...
  └── analysis-queue.json              # Pending analyses (persisted)

/users/global/
  └── categories.json                  # Global category taxonomy
```

## Analysis Flow

### 1. Tab Activation Trigger

```
User switches to tab
       ↓
Tab.show() fires
       ↓
page_visit activity created → activityId
       ↓
ContentAnalyzer.onPageVisit(activityId, url, userId)
```

### 2. Deduplication Check

```
ContentAnalyzer.onPageVisit()
       ↓
Extract current page HTML
       ↓
Compute HTML hash (SHA-256)
       ↓
Capture screenshot
       ↓
Compute screenshot hash (SHA-256)
       ↓
Check index.json for matching url+hash
       ↓
   MATCH FOUND?
   ├── YES → Link activityId to existing analysisId
   │         Update activityIds array
   │         Done (no new analysis)
   │
   └── NO  → Queue new analysis
             Store HTML, screenshot
             Add to AnalysisQueue
```

### 3. Analysis Processing

```
AnalysisQueue.worker (continuous loop)
       ↓
Pick next pending item from queue
       ↓
Mark as 'in_progress'
       ↓
Load HTML, screenshot, metadata
       ↓
Extract structured text from HTML
       ↓
Load current category list
       ↓
Build analysis prompt with:
  - Extracted text
  - Screenshot (as image)
  - Category examples
  - Example output JSON
       ↓
Call LLM (GPT-5-nano)
       ↓
Save LLM interaction to debug logs
       ↓
Parse JSON response
       ↓
   VALID JSON?
   ├── NO  → Retry (max 3 times)
   │         If all retries fail, mark as 'failed'
   │
   └── YES → Save ContentAnalysisResult
             Update index.json
             Add new categories to global list
             Remove from queue
             Mark as 'completed'
```

### 4. Error Handling & Retries

```
LLM Call Failed / Invalid JSON
       ↓
Check error type
   ├── 429 (Rate Limit) → Wait exponentially (2^retryCount seconds)
   │
   └── Other errors → Retry immediately
       ↓
retryCount < 3?
   ├── YES → Increment retryCount
   │         Retry from "Call LLM" step
   │
   └── NO  → Mark as 'failed'
             Save partial result with error
             Log for investigation
             Remove from queue
```

## AI Prompt Design

### Prompt Template

```
You are analyzing a webpage to extract structured information.

=== EXTRACTED TEXT ===
{extractedText.fullText}

=== PAGE METADATA ===
URL: {url}
Title: {extractedText.title}
Meta Description: {extractedText.metaDescription}

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
- banking, insurance, finance
- grocery, restaurant, food-delivery
- news, media, journalism
- e-commerce, shopping, marketplace
- social-media, forum, community
- education, online-learning, university
- health, medical, pharmacy
- travel, hotel, transportation
- entertainment, streaming, gaming
- government, public-service

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

Now analyze the webpage and return JSON:
```

### Retry Prompt (on JSON parse error)

```
Your previous response could not be parsed as valid JSON.

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

Try again:
```

## Text Extraction Fix

### Current Issue
```
Failed to get page text: Error: Script failed to execute
```

### Root Causes
1. Page not fully loaded when `executeJavaScript` is called
2. CSP (Content Security Policy) blocking
3. Navigation happened during execution
4. Cross-origin iframe access

### Solution

```typescript
async getTabText(): Promise<string> {
  try {
    // Wait for page to be fully loaded
    if (this.webContentsView.webContents.isLoading()) {
      await new Promise(resolve => {
        this.webContentsView.webContents.once('did-finish-load', resolve);
      });
    }
    
    // Execute with timeout and error handling
    const result = await Promise.race([
      this.runJs("document.documentElement.innerText"),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 5000)
      )
    ]);
    
    return result as string;
  } catch (error) {
    console.error('Failed to extract text:', error);
    // Fallback: try getting from HTML
    try {
      const html = await this.getTabHtml();
      return this.stripHtmlTags(html);
    } catch {
      return '';
    }
  }
}

async extractStructuredText(): Promise<ExtractedText> {
  const extractionScript = `
    (function() {
      try {
        return {
          title: document.title || '',
          metaDescription: document.querySelector('meta[name="description"]')?.content || '',
          headings: Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
            .map(h => ({
              level: parseInt(h.tagName[1]),
              text: h.innerText.trim()
            })),
          paragraphs: Array.from(document.querySelectorAll('p'))
            .map(p => p.innerText.trim())
            .filter(t => t.length > 20),
          links: Array.from(document.querySelectorAll('a[href]'))
            .slice(0, 50) // Limit to first 50 links
            .map(a => ({
              text: a.innerText.trim(),
              href: a.href
            })),
          fullText: document.body.innerText || '',
          textLength: (document.body.innerText || '').length
        };
      } catch (e) {
        return { error: e.message };
      }
    })()
  `;
  
  const result = await this.runJs(extractionScript);
  if (result.error) {
    throw new Error(`Text extraction failed: ${result.error}`);
  }
  return result as ExtractedText;
}
```

## Category Management

### Global Categories Storage

```json
{
  "version": 1,
  "lastUpdated": "2025-09-30T10:00:00.000Z",
  "categories": [
    {
      "name": "banking",
      "count": 45,
      "firstSeen": "2025-09-25T12:00:00.000Z",
      "lastUsed": "2025-09-30T09:30:00.000Z"
    },
    {
      "name": "news",
      "count": 123,
      "firstSeen": "2025-09-25T12:00:00.000Z",
      "lastUsed": "2025-09-30T10:00:00.000Z"
    }
    // ... up to 1000 categories
  ]
}
```

### Category Limit Handling

- When 1000 categories reached, LLM instructed to use "other"
- Subcategory and brand remain unlimited
- Periodic cleanup: remove categories with count < 3 and lastUsed > 6 months

## Integration with Existing Systems

### ActivityCollector Hook

```typescript
// In Tab.ts - when tab becomes active
async show(): Promise<void> {
  this._isVisible = true;
  this.webContentsView.setVisible(true);
  this.recordHistoryEntry();
  
  // Trigger content analysis
  if (this.contentAnalyzer) {
    const activityId = await this.recordPageVisit();
    await this.contentAnalyzer.onPageVisit(
      activityId,
      this._url,
      this.activityCollector.getUserId()
    );
  }
}
```

### UserDataManager Extension

```typescript
// New methods in UserDataManager.ts

async saveContentAnalysis(
  userId: string,
  analysis: ContentAnalysisResult
): Promise<void>

async getContentAnalysis(
  userId: string,
  analysisId: string
): Promise<ContentAnalysisResult | null>

async getAnalysisByActivity(
  userId: string,
  activityId: string
): Promise<ContentAnalysisResult | null>

async getAnalysisIndex(
  userId: string
): Promise<Map<string, string>> // url+hash → analysisId

async updateAnalysisIndex(
  userId: string,
  url: string,
  hash: string,
  analysisId: string
): Promise<void>

async saveScreenshot(
  userId: string,
  activityId: string,
  image: NativeImage
): Promise<string> // Returns path

async getScreenshot(
  userId: string,
  activityId: string
): Promise<Buffer | null>
```

## Performance Considerations

### Optimization Strategies

1. **Deduplication First**: Always check for existing analysis before queuing
2. **Async Processing**: Never block tab activation on analysis
3. **Single Worker**: Process one analysis at a time to avoid API rate limits
4. **Hash-based Comparison**: Use SHA-256 hashes for fast content comparison
5. **Index for Fast Lookups**: Maintain in-memory index of url+hash → analysisId
6. **Screenshot Reuse**: Store once, reference multiple times
7. **Queue Persistence**: Batch writes to disk (every 10 items or 30 seconds)

### Resource Management

- **Memory**: Limit queue size to 100 items in memory
- **Disk**: Rotate analysis files monthly (archive old data)
- **API Costs**: Use cheapest model: GPT-5-nano
- **Rate Limiting**: Respect API rate limits (built into `ai` SDK)

## Future Enhancements

### Phase 2
- Query interface for analysis results
- Search by category/brand/language
- Analytics dashboard
- Re-analyze outdated content (hash mismatch)

### Phase 3
- Screenshot diff visualization
- Content change tracking over time
- Proactive insights ("You visit banking sites frequently")
- Export analysis data

## Testing Strategy

### Unit Tests
- ContentAnalyzer deduplication logic
- CategoryManager limit enforcement
- JSON parsing with retry logic
- Hash computation accuracy

### Integration Tests
- End-to-end analysis flow
- Queue persistence across restarts
- Multiple tabs analyzed correctly
- User switch doesn't break analysis

### Manual Testing
- Visit same page twice (should reuse analysis)
- Close app mid-analysis (should resume)
- Visit 20+ different sites (category diversity)
- Check category.json stays under 1000

---

## Implementation Checklist

- [ ] Create `ContentAnalyzer.ts` with queue management
- [ ] Create `CategoryManager.ts` with global category storage
- [ ] Fix text extraction in `Tab.ts` (with retries)
- [ ] Add structured text extraction method
- [ ] Add screenshot metadata capture
- [ ] Extend `UserDataManager.ts` with analysis methods
- [ ] Create analysis prompt with examples
- [ ] Implement JSON parsing with retry logic
- [ ] Add deduplication with hash comparison
- [ ] Integrate with `ActivityCollector` hook
- [ ] Add queue persistence logic
- [ ] Test with real pages (bank, news, e-commerce)
- [ ] Update `ActivityTypes.ts` documentation
- [ ] Add to FEATURES.md documentation
- [ ] Add to FILES.md with dependencies
