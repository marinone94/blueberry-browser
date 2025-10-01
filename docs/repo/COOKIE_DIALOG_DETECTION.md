# Cookie Consent Dialog Detection System

## Overview

The Cookie Dialog Detection System is a smart, multi-strategy approach to handling cookie consent dialogs that appear when users visit web pages. This ensures content analysis captures the actual page content rather than just cookie consent overlays.

## Problem Statement

Cookie consent dialogs present several challenges for automated content analysis:

1. **Full Coverage**: Dialogs often cover the entire page, blocking meaningful content
2. **Timing**: Dialogs appear dynamically after page load
3. **False Positives**: Legitimate content about cookies (recipes, privacy policies) shouldn't trigger waiting
4. **Variety**: Different consent management platforms use different implementations
5. **User Control**: Users should be able to dismiss dialogs naturally through interaction

## Solution: Multi-Strategy Detection

The system combines **three complementary strategies** to handle cookie dialogs intelligently:

### Strategy 1: DOM-Based Detection
Analyzes the page's DOM structure to detect cookie consent dialogs with a confidence score.

### Strategy 2: Polling for Dismissal
Continuously checks if the dialog has been dismissed by the user.

### Strategy 3: User Interaction Listening
Waits for user interaction (click, keyboard, scroll) which typically dismisses dialogs.

### Strategy 4: Timeout Fallback
Ensures analysis proceeds even if dialog persists or detection fails.

---

## Implementation Details

### Detection Algorithm

The `detectCookieConsent()` method uses a scoring system to determine dialog presence:

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

#### Scoring Factors

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

#### Confidence Thresholds

- **<50**: No dialog (or false positive)
- **50-60**: Low confidence (5 second wait)
- **60-100**: High confidence (15 second wait + interaction tracking)

---

## Flow Diagram

```
┌─────────────────────────────────────────┐
│  Page loads, tab becomes visible        │
└────────────────┬────────────────────────┘
                 ▼
┌─────────────────────────────────────────┐
│  triggerContentAnalysis()                │
│  - Check hasAnalyzedThisPage flag       │
│  - Generate activityId                   │
└────────────────┬────────────────────────┘
                 ▼
┌─────────────────────────────────────────┐
│  handleContentAnalysisWithCookieDetection│
└────────────────┬────────────────────────┘
                 ▼
┌─────────────────────────────────────────┐
│  Wait 2s for page to settle              │
│  Wait for page load completion           │
└────────────────┬────────────────────────┘
                 ▼
┌─────────────────────────────────────────┐
│  detectCookieConsent()                   │
│  - Scan DOM for cookie dialog patterns  │
│  - Calculate confidence score            │
└────────────────┬────────────────────────┘
                 ▼
          ┌──────┴──────┐
          │  Has Dialog? │
          └──────┬──────┘
                 │
        ┌────────┴────────┐
        │                 │
       YES               NO
        │                 │
        ▼                 ▼
┌───────────────┐   ┌──────────────┐
│ Confidence?   │   │ Proceed      │
└───────┬───────┘   │ immediately  │
        │           └──────────────┘
   ┌────┴────┐
   │         │
HIGH(>60%) LOW(50-60%)
   │         │
   │         └────────────┐
   │                      ▼
   │            ┌─────────────────┐
   │            │ Race: Dismissal │
   │            │ vs Interaction  │
   │            │ (5 seconds)     │
   │            └─────────────────┘
   │
   ▼
┌─────────────────────────────────────────┐
│  Race: Dismissal vs Interaction (15s)   │
│  ┌──────────────┐  ┌─────────────────┐  │
│  │ Polling Loop │  │ Event Listeners │  │
│  │ Check every  │  │ - mouseDown     │  │
│  │ 1 second     │  │ - keyDown       │  │
│  │              │  │ - scroll        │  │
│  └──────────────┘  └─────────────────┘  │
└────────────────┬────────────────────────┘
                 ▼
┌─────────────────────────────────────────┐
│  First to complete wins:                 │
│  - Dialog dismissed (polling detected)   │
│  - User interacted (event fired)         │
│  - Timeout reached (15s or 5s)           │
└────────────────┬────────────────────────┘
                 ▼
┌─────────────────────────────────────────┐
│  Wait 1.5s for page re-render            │
└────────────────┬────────────────────────┘
                 ▼
┌─────────────────────────────────────────┐
│  Double-check: detectCookieConsent()     │
│  (log warning if still present)          │
└────────────────┬────────────────────────┘
                 ▼
┌─────────────────────────────────────────┐
│  contentAnalyzer.onPageVisit()           │
│  - Extract HTML and text                 │
│  - Capture screenshot                    │
│  - Queue for LLM analysis                │
└─────────────────────────────────────────┘
```

---

## Code Examples

### Basic Flow

```typescript
// In Tab.ts - when tab becomes visible or page finishes loading
async show(): Promise<void> {
  this._isVisible = true;
  this.webContentsView.setVisible(true);
  this.recordHistoryEntry();
  this.triggerContentAnalysis();
}

private triggerContentAnalysis(): void {
  if (!this.hasAnalyzedThisPage && this.contentAnalyzer && this.activityCollector) {
    this.hasAnalyzedThisPage = true;
    const userId = this.activityCollector.getUserId();
    const activityId = `activity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Smart cookie detection + analysis
    this.handleContentAnalysisWithCookieDetection(activityId, userId).catch(error => {
      console.error('Content analysis with cookie detection failed:', error);
    });
  }
}
```

### Detection Example

```typescript
const detection = await this.detectCookieConsent();
// detection = {
//   hasDialog: true,
//   confidence: 0.85,
//   details: {
//     score: 85,
//     foundElements: [
//       {
//         selector: '[id*="onetrust"]',
//         zIndex: 9999,
//         coverage: '45.2%',
//         position: 'fixed'
//       }
//     ],
//     hasCMP: true,
//     buttonMatches: 2
//   }
// }
```

### Waiting Strategy

```typescript
if (detection.confidence > 0.6) {
  // High confidence - wait up to 15 seconds
  await Promise.race([
    this.waitForCookieDialogDismissal(15000),
    this.setupFirstInteractionListener(15000)
  ]);
} else {
  // Low confidence - brief wait
  await Promise.race([
    this.waitForCookieDialogDismissal(5000),
    this.setupFirstInteractionListener(5000)
  ]);
}
```

---

## Configuration & Tuning

### Adjustable Parameters

```typescript
// Initial page settle time
await new Promise(resolve => setTimeout(resolve, 2000)); // 2s default

// High confidence wait time
const HIGH_CONFIDENCE_WAIT = 15000; // 15s

// Low confidence wait time
const LOW_CONFIDENCE_WAIT = 5000; // 5s

// Polling interval for dismissal check
const CHECK_INTERVAL = 1000; // 1s

// Post-dismissal render time
const RENDER_DELAY = 1500; // 1.5s

// Confidence threshold
const THRESHOLD = 50; // Score > 50 = dialog detected
const HIGH_CONFIDENCE = 60; // Score > 60 = high confidence
```

### Customizing Detection Patterns

Add more selectors in `detectCookieConsent()`:

```typescript
selectors: [
  '[id*="cookie" i][id*="banner" i]',
  '[id*="your-custom-pattern" i]',
  '.your-company-cookie-class',
  // ...
]
```

Add more button patterns:

```typescript
buttonTexts: [
  'accept cookies',
  'your custom button text',
  // ...
]
```

---

## Logging & Debugging

The system provides detailed console logging with emoji indicators:

- 🔍 **Checking**: Scanning for cookie dialog
- 🍪 **Detected**: Cookie dialog found
- ⏳ **Waiting**: Polling for dismissal
- ✓ **Success**: Dialog dismissed or interaction detected
- ⏱️  **Timeout**: Wait time expired
- ⚠️  **Warning**: Dialog still present but proceeding
- 🚀 **Starting**: Beginning content analysis
- ❌ **Error**: Operation failed
- 🔄 **Fallback**: Retrying with simpler approach

### Example Output

```
🔍 Checking for cookie consent dialog...
🍪 Cookie dialog detected with 85% confidence
   Details: {
     "score": 85,
     "foundElements": [...],
     "hasCMP": true,
     "buttonMatches": 2
   }
📋 Strategy: Wait for user dismissal OR interaction (max 15s)
⏳ Cookie dialog still present (confidence: 85%), waiting... [1s/15s]
⏳ Cookie dialog still present (confidence: 85%), waiting... [2s/15s]
✓ User interaction detected
✓ Cookie dialog confirmed dismissed
🚀 Starting content analysis...
✓ Content analysis completed
```

---

## Edge Cases & Handling

### 1. Page with Legitimate Cookie Content

**Scenario**: Recipe website with "chocolate chip cookies" in title

**Handling**: 
- Detection requires multiple indicators (not just "cookie" text)
- Scoring system needs structural evidence (overlays, buttons, CMPs)
- False positives score low (<50) and don't trigger waiting

### 2. Persistent Dialog

**Scenario**: Dialog requires action and user doesn't interact

**Handling**:
- Timeout ensures analysis proceeds after 15s
- Warning logged but analysis continues
- LLM may still describe the dialog in analysis

### 3. Late-Appearing Dialog

**Scenario**: Dialog appears 5 seconds after page load

**Handling**:
- Initial 2s settle time catches most cases
- If dialog appears after analysis starts, current analysis proceeds
- Next page visit will have dialog (already loaded)

### 4. Multiple Dialogs

**Scenario**: Cookie dialog followed by newsletter popup

**Handling**:
- Detection focuses on cookie-specific patterns
- Generic popups score lower
- User interaction typically dismisses the first dialog

### 5. SPA Navigation

**Scenario**: Single-page app changes content without full reload

**Handling**:
- `did-navigate-in-page` event resets `hasAnalyzedThisPage` flag
- New analysis triggered on next tab focus
- Each navigation treated as new page

---

## Performance Considerations

### Time Costs

| Scenario | Time Impact |
|----------|-------------|
| No dialog detected | ~3s (2s settle + 1s detection) |
| Low confidence dialog | ~8s (3s + 5s wait) |
| High confidence, quick dismissal | ~6s (3s + 3s interaction) |
| High confidence, slow dismissal | ~18s (3s + 15s timeout) |

### Memory Usage

- Minimal: Only event listeners and timeouts
- Automatic cleanup on completion
- No persistent state between analyses

### API Cost Impact

- No direct API calls for detection (pure DOM analysis)
- Prevents wasted LLM analysis on overlay-only content
- Estimated savings: 30-50% reduction in low-quality analyses

---

## Testing Strategy

### Unit Tests

```typescript
describe('Cookie Dialog Detection', () => {
  test('detects OneTrust banner', async () => {
    // Inject OneTrust HTML
    const detection = await tab.detectCookieConsent();
    expect(detection.hasDialog).toBe(true);
    expect(detection.confidence).toBeGreaterThan(0.7);
  });
  
  test('ignores cookie recipe page', async () => {
    // Load recipe page with "cookie" in content
    const detection = await tab.detectCookieConsent();
    expect(detection.hasDialog).toBe(false);
  });
  
  test('waits for user interaction', async () => {
    const start = Date.now();
    const promise = tab.setupFirstInteractionListener(5000);
    
    // Simulate click after 2s
    setTimeout(() => simulateClick(), 2000);
    
    const result = await promise;
    expect(result).toBe(true);
    expect(Date.now() - start).toBeLessThan(3000);
  });
});
```

### Integration Tests

```typescript
describe('Content Analysis with Cookie Detection', () => {
  test('full flow with cookie dialog', async () => {
    const tab = createTab('https://example.com');
    await tab.show();
    
    // Should detect dialog and wait
    await waitFor(() => {
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Cookie dialog detected')
      );
    });
    
    // Simulate user clicking accept
    await simulateAcceptCookies();
    
    // Should proceed with analysis
    await waitFor(() => {
      expect(contentAnalyzer.onPageVisit).toHaveBeenCalled();
    });
  });
});
```

### Manual Testing Checklist

- [ ] Visit banking site with cookie banner (Swedbank, Nordea)
- [ ] Visit news site with consent dialog (The Guardian, BBC)
- [ ] Visit recipe site with "cookie" in content
- [ ] Visit site without cookie dialog
- [ ] Test timeout by not dismissing dialog
- [ ] Test quick dismissal (<3 seconds)
- [ ] Test scroll interaction triggering
- [ ] Test keyboard interaction triggering
- [ ] Test SPA navigation (Twitter, Reddit)
- [ ] Test multiple tabs with different dialog states

---

## Future Enhancements

### Phase 1 (Current)
✅ DOM-based detection with scoring
✅ Polling for dismissal
✅ User interaction detection
✅ Timeout fallback

### Phase 2 (Planned)
- [ ] Machine learning model for detection
- [ ] Auto-dismiss common cookie dialogs
- [ ] Per-site settings (never wait on trusted sites)
- [ ] Visual diff to confirm dialog dismissal

### Phase 3 (Future)
- [ ] Browser extension API integration
- [ ] Consent preference synchronization
- [ ] Analytics on dialog patterns
- [ ] Automated acceptance with user consent

---

## Troubleshooting

### Problem: False positives

**Symptoms**: Waits unnecessarily on pages without dialogs

**Solutions**:
- Increase confidence threshold from 50 to 60
- Reduce wait time for low-confidence detections
- Add site-specific blacklist

### Problem: Missed dialogs

**Symptoms**: Analysis captures dialog content instead of page

**Solutions**:
- Add missing selectors to detection patterns
- Increase initial settle time from 2s to 3s
- Check browser console for dialog platform names

### Problem: Timeout too long

**Symptoms**: Users wait 15s unnecessarily

**Solutions**:
- Reduce high-confidence timeout to 10s
- Implement user preference for wait time
- Skip waiting on revisited URLs

### Problem: Detection script fails

**Symptoms**: Error in detectCookieConsent()

**Solutions**:
- Check CSP (Content Security Policy) blocks
- Verify page is fully loaded before detection
- Add try-catch around each selector check

---

## Related Documentation

- [Content Analysis Design](./CONTENT_ANALYSIS_DESIGN.md)
- [Activity Tracking Implementation](./ACTIVITY_TRACKING_IMPLEMENTATION.md)
- [Features Overview](./FEATURES.md)

---

## Changelog

### v1.0.0 (2025-09-30)
- Initial implementation
- Multi-strategy detection system
- DOM-based scoring algorithm
- Polling and interaction detection
- Comprehensive logging
