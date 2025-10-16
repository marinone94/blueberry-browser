# Activity Tracking

Comprehensive documentation for the user activity tracking system in Blueberry Browser.

## Table of Contents
- [Overview](#overview)
- [Activity Types](#activity-types)
- [Collection Architecture](#collection-architecture)
- [Data Flow](#data-flow)
- [Storage Architecture](#storage-architecture)
- [Privacy & Security](#privacy--security)
- [Performance Optimizations](#performance-optimizations)

---

## Overview

The activity tracking system provides comprehensive user behavior monitoring through a multi-layered architecture that captures, buffers, and persists detailed interaction data while maintaining performance and privacy.

**Key Components**:
- `ActivityCollector` - Buffered collection with automatic flushing
- `ActivityStorage` - Per-user daily file storage
- `ActivityIPCHandler` - IPC communication layer
- `Tab` - Activity injection and collection
- Activity processor pipeline (extensible)

**Design Principles**:
- Complete user isolation (per-user activity data)
- Guest user privacy (data cleared on restart)
- Buffered collection for performance
- Local-only storage
- Session-based grouping

---

## Activity Types

The system tracks 13 comprehensive activity types:

### Navigation Activities
1. **page_visit** - URL, title, load time, referrer tracking
2. **navigation_event** - Navigation methods, load times, URL transitions
3. **tab_action** - Tab lifecycle events (create, close, switch), tab counts

### Interaction Activities
4. **click_event** - Coordinates, element details, click types (single/double/right)
5. **scroll_event** - Direction, speed, viewport position, scroll depth
6. **keyboard_input** - Key counts, input contexts, typing patterns
7. **mouse_movement** - Movement paths, speeds, interaction patterns
8. **page_interaction** - Time on page, scroll depth, click counts, exit methods

### Context Activities
9. **focus_change** - Window and tab focus patterns, focus durations
10. **content_extraction** - Page content analysis requests, media detection

### Feature Activities
11. **search_query** - Query content, search engine detection
12. **chat_interaction** - AI chat usage, message patterns, context URLs
13. **form_interaction** - Form usage patterns, field types, completion rates

---

## Collection Architecture

### Component Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    Main Process                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │ActivityCollector│  │  ActivityTypes  │  │ActivityStor │  │
│  │   (Buffering)   │  │ (Type Defs)     │  │(Persistence)│  │
│  └─────────────────┘  └─────────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
           ┌────────────────┼────────────────┐
           │                │                │
    ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
    │ Tab Process │  │   TopBar    │  │   Sidebar   │
    │ (Activity   │  │ (Navigation │  │ (Chat       │
    │  Injection) │  │  Tracking)  │  │  Tracking)  │
    └─────────────┘  └─────────────┘  └─────────────┘
```

### ActivityCollector

**Purpose**: Manages buffered collection and storage of user activity data

**Key Features**:
- 100-item memory buffer prevents I/O bottlenecks
- Automatic flush every 30 seconds
- Session-based activity grouping
- Automatic retry on flush failures

**Key Methods**:
- `collectPageVisit(data)` - Record page visit
- `collectTabAction(data)` - Record tab lifecycle events
- `collectChatInteraction(data)` - Record AI chat usage
- `collectClickEvent(data)` - Record click interactions
- `flushBuffer()` - Persist buffered activities
- `destroy()` - Final flush and cleanup

### ActivityStorage

**Purpose**: Persistent storage for raw activity data

**Key Features**:
- Daily file rotation (one file per day)
- User-isolated storage
- Automatic directory creation
- Date-based file organization

**Storage Location**:
```
users/user-data/{userId}/raw-activity/
├── 2025-10-15.json    # Daily activity logs
├── 2025-10-16.json    # Automatic file rotation
└── 2025-10-17.json    # One file per day
```

---

## Data Flow

### Page Visit Tracking

**Complete Flow**:

1. **Tab Navigation** (`Tab.ts`):
   ```typescript
   webContents.on('did-navigate') → {
     const entry = { url, title, timestamp, loadTime, referrer }
     if (activityCollector) {
       activityCollector.collectPageVisit(entry)
     }
   }
   ```

2. **Activity Buffering** (`ActivityCollector.ts`):
   ```typescript
   collectPageVisit(data) → {
     const activity = {
       id: generateActivityId(),
       userId: this.userId,
       timestamp: new Date(),
       sessionId: this.sessionId,
       type: 'page_visit',
       data: data
     }
     dataBuffer.push(activity)
     if (buffer full) flushBuffer()
   }
   ```

3. **Periodic Flush** (every 30 seconds):
   ```typescript
   flushBuffer() → {
     const activities = dataBuffer
     dataBuffer = []
     activityStorage.saveRawActivityData(userId, activities)
   }
   ```

4. **Storage Persistence** (`ActivityStorage.ts`):
   ```typescript
   saveRawActivityData(userId, activities) → {
     const today = format(new Date(), 'yyyy-MM-dd')
     const filePath = getUserDataPath(userId) + `/raw-activity/${today}.json`
     appendActivitiesToFile(filePath, activities)
   }
   ```

### Tab Activity Tracking

**User Action**: Create, close, or switch tabs

**Flow**:
1. `Window.createTab()` → `activityCollector.collectTabAction({ action: 'create', ... })`
2. `Window.closeTab()` → `activityCollector.collectTabAction({ action: 'close', ... })`
3. `Window.switchActiveTab()` → `activityCollector.collectTabAction({ action: 'switch', ... })`

### In-Page Activity Injection

**Purpose**: Track user interactions within web pages

**Implementation** (`Tab.ts`):
```typescript
injectActivityScript() → {
  webContents.executeJavaScript(`
    // Click tracking with throttling
    document.addEventListener('click', throttle((e) => {
      window.electronAPI.reportActivity('click_event', {
        x: e.clientX,
        y: e.clientY,
        element: e.target.tagName,
        timestamp: Date.now()
      })
    }, 100))
    
    // Scroll tracking
    document.addEventListener('scroll', throttle((e) => {
      window.electronAPI.reportActivity('scroll_event', {
        scrollY: window.scrollY,
        scrollHeight: document.documentElement.scrollHeight,
        direction: calculateDirection()
      })
    }, 500))
    
    // Keyboard tracking (debounced)
    document.addEventListener('keydown', debounce((e) => {
      window.electronAPI.reportActivity('keyboard_input', {
        keyCount: 1,
        context: document.activeElement.tagName
      })
    }, 2000))
  `)
}
```

---

## Storage Architecture

### Data Record Schema

```typescript
interface RawActivityData {
  id: string;           // Unique activity identifier
  userId: string;       // User account isolation
  timestamp: Date;      // Precise timing
  sessionId: string;    // Browser session grouping
  type: ActivityType;   // One of 13 activity categories
  data: any;           // Type-specific payload
}
```

### File Organization

- One JSON file per day
- Activities appended to daily file
- Automatic file creation
- Date-based naming (YYYY-MM-DD.json)

### Storage Efficiency

- Buffered writes reduce I/O operations
- Daily files keep individual files manageable
- Session grouping enables efficient analysis
- User isolation via directory structure

---

## Privacy & Security

### User Isolation

- Complete activity separation between user accounts
- Guest user activities cleared on app restart
- No cross-user data leakage possible
- Per-user storage directories

### Local-Only Storage

- All activity data stored locally
- No external transmission or cloud storage
- User maintains complete control over data
- No third-party access

### Session Management

- Activities grouped by browser session
- Session IDs prevent cross-session correlation attacks
- Automatic session rotation on app restart
- Session-based cleanup possible

### Guest User Privacy

- Guest activities stored separately
- Automatic cleanup on app restart
- No persistence between sessions
- Incognito-like behavior

---

## Performance Optimizations

### Buffered Collection

- 100-item memory buffer reduces I/O
- Automatic flush every 30 seconds
- Manual flush on buffer full
- Final flush on application exit

### Event Throttling

- **Mouse movements**: 100ms throttle
- **Scroll events**: 500ms throttle  
- **Keyboard input**: 2 second debounce
- Prevents excessive activity recording

### Daily File Rotation

- Separate files per day
- Prevents single large file issues
- Efficient date-based queries
- Easy archival and cleanup

### Lazy Initialization

- Activity collector only created for non-guest users
- Per-tab injection on demand
- Cleanup on user switch
- Resource-efficient design

---

## Related Features

- [User Accounts](./user-accounts.md) - Per-user activity isolation
- [Browsing History](./browsing-history.md) - Uses navigation activities
- [Proactive Insights](./proactive-insights.md) - Analyzes activity patterns
- [Content Analysis](./content-analysis.md) - Uses content extraction activities
