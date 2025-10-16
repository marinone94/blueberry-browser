# Content Analysis System

Complete documentation for the AI-powered content analysis system with intelligent cookie dialog detection.

## Table of Contents
- [Overview](#overview)
- [Architecture](#architecture)
- [Data Structures](#data-structures)
- [Analysis Flow](#analysis-flow)
- [Cookie Dialog Detection](#cookie-dialog-detection)
- [Storage and Persistence](#storage-and-persistence)
- [Performance Characteristics](#performance-characteristics)

---

## Overview

Intelligent content analysis system that extracts, analyzes, and categorizes webpage content using AI. Performs deep analysis on page visits, with smart deduplication to avoid redundant processing and intelligent cookie dialog detection for accurate content capture.

### Key Features

- **AI-Powered Analysis**: Uses GPT-5-nano or Claude Haiku for cost-effective analysis
- **Smart Deduplication**: Compares HTML and screenshots to avoid redundant analysis
- **Cookie Dialog Detection**: Multi-strategy approach to handle consent overlays
- **Persistent Queue**: Survives app restarts and continues processing
- **User Isolation**: Per-user analysis storage
- **Rich Metadata**: Extracts text, categories, languages, and visual descriptions

---

## Architecture

### Core Components

#### 1. ContentAnalyzer (`src/main/features/content/ContentAnalyzer.ts`)

**Purpose**: Main orchestrator for content analysis

**Responsibilities**:
- Manages analysis queue and worker
- Handles deduplication logic (compare HTML/screenshot)
- Continues processing even if tab/window closes or user switches accounts
- Uses cheaper model (GPT-5-nano or Claude Haiku)

**Key Methods**:
- `analyzeContent(activityId, userId, url, html, screenshot)` - Queue analysis
- `checkForDuplicate(htmlHash, screenshotHash)` - Deduplication check
- `processQueue()` - Worker loop
- `performAnalysis(item)` - Execute AI analysis

#### 2. CategoryManager (`src/main/features/content/CategoryManager.ts`)

**Purpose**: Maintains global category taxonomy

**Responsibilities**:
- Maximum 1000 high-level categories
- Loads/saves categories from disk
- Provides category list to analysis prompts
- Returns "other" when limit reached
- Categories shared across all users

**Key Methods**:
- `getCategories()` - Get current category list
- `addCategory(category)` - Add new category (if under limit)
- `loadCategories()` - Load from disk
- `saveCategories()` - Persist to disk

#### 3. AnalysisQueue (internal to ContentAnalyzer)

**Purpose**: Manage pending analyses

**Features**:
- FIFO queue for pending analyses
- Persists to disk (`analysis-queue.json`) to survive app restarts
- Worker processes one analysis at a time
- Tracks status: `pending` | `in_progress` | `completed` | `failed`

**Persistence Strategy**:
- Queue saved to disk after each operation
- Loaded on ContentAnalyzer initialization
- In-progress items reset to pending on restart

---

## Data Structures

### ContentAnalysisResult

```typescript
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
```

### ExtractedText

```typescript
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
```

### ScreenshotMetadata

```typescript
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
```

---

## Analysis Flow

### Triggering Analysis

**Trigger Events**:
1. **Page Visit**: User navigates to new page (via `page_visit` activity)
2. **Tab Focus**: Inactive tab becomes visible again
3. **Manual Trigger**: User requests analysis

**Flow**:

1. **Activity Collection** (`ActivityCollector`):
   ```typescript
   collectActivity('page_visit', {
     url, title, tabId
   })
   ```

2. **Content Analysis Trigger** (`ContentAnalyzer`):
   ```typescript
   // Check if analysis needed
   if (shouldAnalyze(url)) {
     queueAnalysis(activityId, userId, url)
   }
   ```

3. **Cookie Dialog Handling**:
   ```typescript
   // Wait for cookie dialog to be dismissed
   await waitForCookieDialogDismissal(tabId)
   ```

4. **Content Extraction**:
   ```typescript
   const html = await tab.getTabHtml()
   const text = await tab.getTabText()
   const screenshot = await tab.screenshot()
   ```

5. **Deduplication Check**:
   ```typescript
   const htmlHash = sha256(html)
   const screenshotHash = sha256(screenshot)
   
   const existing = await checkForDuplicate(htmlHash, screenshotHash)
   if (existing) {
     // Link activity to existing analysis
     return linkActivity(activityId, existing.analysisId)
   }
   ```

6. **Queue Analysis**:
   ```typescript
   queueItem = {
     analysisId: uuid(),
     activityIds: [activityId],
     userId,
     url,
     html,
     screenshot,
     status: 'pending'
   }
   
   queue.push(queueItem)
   await saveQueue()
   ```

7. **AI Analysis** (async worker):
   ```typescript
   const result = await performAnalysis(queueItem)
   await saveAnalysis(result)
   updateQueue(analysisId, 'completed')
   ```

### Deduplication Strategy

**Purpose**: Avoid re-analyzing identical pages

**Comparison Methods**:

1. **HTML Hash Comparison**:
   - SHA-256 hash of page HTML
   - Fast exact comparison
   - Catches identical pages

2. **Screenshot Hash Comparison**:
   - SHA-256 hash of screenshot image
   - Catches visually identical pages
   - More forgiving than HTML comparison

**Deduplication Logic**:
```typescript
checkForDuplicate(htmlHash, screenshotHash) {
  // Exact HTML match (highest priority)
  if (existingByHtml = findByHtmlHash(htmlHash)) {
    return existingByHtml
  }
  
  // Screenshot match (visual similarity)
  if (existingByScreenshot = findByScreenshotHash(screenshotHash)) {
    return existingByScreenshot
  }
  
  return null // No duplicate found
}
```

**Benefits**:
- Saves API costs
- Faster processing
- Multiple activities can share one analysis
- Handles page refreshes efficiently

---

## Cookie Dialog Detection

### Problem Statement

Cookie consent dialogs present several challenges for automated content analysis:

1. **Full Coverage**: Dialogs often cover the entire page, blocking meaningful content
2. **Timing**: Dialogs appear dynamically after page load
3. **False Positives**: Legitimate content about cookies (recipes, privacy policies) shouldn't trigger waiting
4. **Variety**: Different consent management platforms use different implementations
5. **User Control**: Users should be able to dismiss dialogs naturally through interaction

### Solution: Multi-Strategy Detection

The system combines **four complementary strategies** to handle cookie dialogs intelligently:

#### Strategy 1: DOM-Based Detection

Analyzes the page's DOM structure to detect cookie consent dialogs with a confidence score.

**Detection Algorithm**:
```typescript
interface DetectionResult {
  hasDialog: boolean;      // True if score > 50
  confidence: number;      // 0.0 to 1.0
  details?: {
    score: number;
    foundElements: Array;
    hasCMP: boolean;       // Consent Management Platform detected
    buttonMatches: number;
  };
}
```

**Scoring Factors**:

**Selector Matches** (30 points each):
- `[id*="cookie"][id*="banner"]`
- `[id*="onetrust"]`, `[id*="cookiebot"]`
- `[class*="cookie"][class*="consent"]`
- `.cmp-banner`, `.cookie-notice`
- `[role="dialog"][aria-label*="cookie"]`
- Plus 15+ more common patterns

**Visual Indicators**:
- High z-index (>1000): +20 points, (>9999): +30 points
- Fixed positioning: +15 points
- Absolute positioning: +10 points
- Large coverage (>20%): +15 points, (>50%): +25 points, (>80%): +35 points

**Button Text Matches** (+10 each, max 3):
- "accept cookies", "accept all"
- "reject cookies", "manage cookies"
- "i agree", "i accept"
- "cookie settings", "cookie preferences"

**CMP Detection** (+40 points):
- `window.OneTrust`
- `window.Cookiebot`
- `window.CookieConsent`
- `window.__tcfapi` (IAB TCF)
- `window.__cmp`
- `window.Didomi`

**Backdrop Detection** (+20 points):
- Fixed position overlay with high z-index
- Covers >80% of viewport

**Confidence Thresholds**:
- **<50**: No dialog (or false positive)
- **50-60**: Low confidence (5 second wait)
- **60-100**: High confidence (15 second wait + interaction tracking)

#### Strategy 2: Polling for Dismissal

Continuously checks if the dialog has been dismissed by the user.

**Implementation**:
```typescript
async pollForDialogDismissal(tabId, maxDuration) {
  const startTime = Date.now()
  
  while (Date.now() - startTime < maxDuration) {
    const result = await tab.runJs(`detectCookieConsent()`)
    
    if (!result.hasDialog) {
      console.log('Cookie dialog dismissed')
      return true
    }
    
    await sleep(1000) // Check every second
  }
  
  return false // Timeout
}
```

#### Strategy 3: User Interaction Listening

Waits for user interaction (click, keyboard, scroll) which typically dismisses dialogs.

**Implementation**:
```typescript
setupInteractionListener(tabId) {
  tab.webContents.on('did-interact', () => {
    console.log('User interaction detected')
    // Trigger dialog re-check
    checkDialogStatus()
  })
}
```

#### Strategy 4: Timeout Fallback

Ensures analysis proceeds even if dialog persists or detection fails.

**Timeouts**:
- Low confidence (50-60): 5 seconds
- High confidence (60-100): 15 seconds
- Maximum wait: 15 seconds

### Complete Flow

```
┌─────────────────────────────────────────┐
│  Page loads, tab becomes visible        │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  Run detectCookieConsent()              │
│  Get confidence score                    │
└─────────────────┬───────────────────────┘
                  │
         ┌────────┴────────┐
         │                 │
    score < 50        score >= 50
         │                 │
         ▼                 ▼
┌─────────────┐   ┌──────────────────────┐
│ No dialog   │   │ Cookie dialog found   │
│ Proceed     │   │ Start wait strategies │
└──────┬──────┘   └──────────┬────────────┘
       │                     │
       │          ┌──────────┴────────────┐
       │          │                       │
       │    ┌─────▼──────┐     ┌─────────▼────────┐
       │    │ Strategy 1: │     │   Strategy 2:    │
       │    │  Polling    │     │  User Interact.  │
       │    │ (every 1s)  │     │   Detection      │
       │    └─────┬──────┘     └─────────┬────────┘
       │          │                       │
       │          └──────────┬────────────┘
       │                     │
       │          ┌──────────▼────────────┐
       │          │  Dialog dismissed?    │
       │          │  OR                   │
       │          │  Timeout reached?     │
       │          └──────────┬────────────┘
       │                     │
       └──────────┬──────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  Capture page content and screenshot    │
│  Queue for AI analysis                   │
└─────────────────────────────────────────┘
```

### Configuration

**Tunable Parameters**:

```typescript
const config = {
  // Detection thresholds
  minScoreForDialog: 50,           // Minimum score to consider dialog present
  highConfidenceScore: 60,         // Score for high confidence detection
  
  // Wait durations
  lowConfidenceWait: 5000,         // 5 seconds
  highConfidenceWait: 15000,       // 15 seconds
  maxWaitTime: 15000,              // Maximum wait regardless
  
  // Polling
  pollInterval: 1000,              // Check every second
  
  // Interaction tracking
  interactionTimeout: 2000         // Wait 2s after interaction
}
```

### Performance Impact

**Time Costs**:
- No dialog detected: 0ms wait
- Low confidence dialog: Up to 5 seconds
- High confidence dialog: Up to 15 seconds
- Average across all pages: ~2-3 seconds

**API Cost Savings**:
- Without detection: $0.10-0.20 per 100 pages (analyzing overlays)
- With detection: Proper content captured, no wasted analysis
- ROI: Positive after ~500 page analyses

---

## Storage and Persistence

### Storage Structure

**Per-User Storage**:
```
users/user-data/{userId}/
├── content-analysis/
│   ├── index.json                 # Analysis index
│   ├── analysis-{id}.json         # Individual analyses
│   └── screenshots/
│       └── screenshot-{id}.png    # Screenshot files
└── llm-debug-logs/               # Optional debug logs
    └── content-analysis-{id}.json
```

### Index File

**Purpose**: Fast lookups without reading all analysis files

**Structure**:
```json
{
  "analyses": [
    {
      "analysisId": "analysis-123",
      "activityIds": ["activity-1", "activity-2"],
      "url": "https://example.com",
      "timestamp": "2025-10-16T15:30:00.000Z",
      "htmlHash": "sha256-hash",
      "screenshotHash": "sha256-hash",
      "category": "technology",
      "primaryLanguage": "en"
    }
  ],
  "htmlHashIndex": {
    "sha256-hash": "analysis-123"
  },
  "screenshotHashIndex": {
    "sha256-hash": "analysis-123"
  }
}
```

**Benefits**:
- Fast deduplication checks
- Quick category lookups
- Efficient activity-to-analysis mapping
- No need to read full analysis files

### Analysis Queue Persistence

**File**: `users/analysis-queue.json`

**Structure**:
```json
{
  "queue": [
    {
      "analysisId": "analysis-456",
      "activityIds": ["activity-3"],
      "userId": "user-123",
      "url": "https://example.com",
      "status": "pending",
      "queuedAt": "2025-10-16T15:35:00.000Z",
      "html": "...",
      "screenshot": "base64-data"
    }
  ]
}
```

**Behavior**:
- Saved after each queue operation
- Loaded on ContentAnalyzer startup
- In-progress items reset to pending
- Failed items can be retried

---

## Performance Characteristics

### Analysis Performance

**Timing**:
- **Queue**: <10ms
- **Deduplication Check**: ~50ms (index lookup)
- **Cookie Dialog Detection**: 50-500ms
- **Cookie Dialog Wait**: 0-15s
- **Content Extraction**: 200-500ms
- **AI Analysis**: 2-5s (GPT-5-nano)
- **Total**: ~3-10s per unique page

**API Costs**:
- GPT-5-nano: ~$0.002 per analysis
- Claude Haiku: ~$0.001 per analysis
- 100 pages: ~$0.10-0.20
- 1000 pages: ~$1-2

### Deduplication Effectiveness

**Typical Deduplication Rates**:
- News sites: 40-60% (many refreshes)
- E-commerce: 30-50% (product variants)
- Documentation: 60-80% (repeated visits)
- Overall average: ~45%

**Cost Savings**:
- Without deduplication: $2 per 1000 activities
- With deduplication: ~$1.10 per 1000 activities
- Savings: ~45% reduction

### Storage Efficiency

**Per Analysis**:
- Analysis JSON: 5-15 KB
- Screenshot PNG: 100-500 KB
- Total: ~105-515 KB

**For 1000 Analyses**:
- JSON files: ~5-15 MB
- Screenshots: ~100-500 MB
- Total: ~105-515 MB

**Optimization**:
- Screenshot compression (PNG)
- Index file for fast lookups
- Lazy loading of full analyses

---

## Related Features

- [Activity Tracking](./activity-tracking.md) - Triggers content analysis
- [Proactive Insights](./proactive-insights.md) - Uses analysis results
- [Vector Search](./vector-search.md) - Indexes page content
- [AI Chat](./ai-chat.md) - Uses analysis for context
- [User Accounts](./user-accounts.md) - Per-user storage isolation

