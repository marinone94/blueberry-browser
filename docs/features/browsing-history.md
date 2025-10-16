# Browsing History Management

Complete documentation for per-user browsing history tracking, search, and management.

## Table of Contents
- [Overview](#overview)
- [Per-User History Tracking](#per-user-history-tracking)
- [History UI Features](#history-ui-features)
- [User Switching Integration](#user-switching-integration)
- [Search and Management](#search-and-management)

---

## Overview

The browsing history system provides:
- Automatic tracking of page visits per user
- Smart deduplication (same URL within 1 hour)
- Real-time search by title or URL
- Smart navigation (reuse existing tabs)
- Complete user isolation
- Maximum 1000 entries per user

**Key Components**:
- `Tab.ts` - History recording on navigation
- `HistoryStorage` - Persistence and deduplication
- `HistoryIPCHandler` - IPC communication layer
- `HistoryContext.tsx` - React state management
- `History.tsx` - Complete UI with search

---

## Per-User History Tracking

**Purpose**: Track and manage browsing history separately for each user account

**Complete Flow**:

1. **History Recording** (`Tab.ts`):
   ```typescript
   recordHistoryEntry() → {
     if (historyCallback && _url && _isVisible && !isSystemPage) {
       historyCallback({
         url: _url,
         title: _title || _url, 
         visitedAt: new Date(),
         favicon: extractedFavicon
       })
     }
   }
   ```

2. **Navigation Event Triggers**:
   - `did-navigate` - Page navigation
   - `did-navigate-in-page` - Hash/state changes
   - `did-finish-load` - Page load completion
   - `show()` - Tab becomes active (updates timestamp)

3. **History Storage** (`HistoryStorage.ts`):
   ```typescript
   addHistoryEntry(userId, entry) → {
     const history = await loadBrowsingHistory(userId)
     
     // Deduplication: Update existing entry if same URL within 1 hour
     const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
     const existingIndex = history.findIndex(h => 
       h.url === entry.url && new Date(h.visitedAt) > oneHourAgo
     )
     
     if (existingIndex >= 0) {
       history[existingIndex].visitedAt = entry.visitedAt
       history[existingIndex].title = entry.title
     } else {
       history.unshift({
         id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
         ...entry
       })
     }
     
     // Keep only last 1000 entries
     if (history.length > 1000) history.splice(1000)
     
     await saveBrowsingHistory(userId, history)
   }
   ```

### Data Structure

**History Entry**:
```typescript
interface HistoryEntry {
  id: string                // Unique identifier
  url: string               // Full URL
  title: string             // Page title
  visitedAt: Date           // Visit timestamp
  favicon?: string          // Favicon URL
  userId: string            // User who visited
}
```

### Deduplication Strategy

**Purpose**: Avoid cluttering history with repeated visits to same URL

**Rules**:
- Same URL within 1 hour → Update timestamp of existing entry
- Same URL after 1 hour → Create new entry
- Different URLs → Always create new entry

**Benefits**:
- Cleaner history view
- Accurate "last visited" timestamps
- Reduced storage space
- Better search results

### System Page Filtering

**Excluded from History**:
- Internal Electron pages (`electron://`)
- Development server URLs (`localhost:5173`)
- Data URLs (`data:`)
- About pages (`about:blank`)

**Implementation**:
```typescript
const isSystemPage = (url: string) => {
  return url.startsWith('electron://') || 
         url.startsWith('data:') || 
         url === 'about:blank' ||
         url.includes('localhost:5173')
}
```

---

## History UI Features

**User Action**: Click clock icon in sidebar to view history

**Complete Flow**:

1. **History Context** (`HistoryContext.tsx`):
   ```typescript
   refreshHistory() → {
     const historyData = await window.sidebarAPI.getBrowsingHistory()
     const processedHistory = historyData
       .map(entry => ({ ...entry, visitedAt: new Date(entry.visitedAt) }))
       .sort((a, b) => b.visitedAt.getTime() - a.visitedAt.getTime()) // Newest first
     setHistory(processedHistory)
   }
   ```

2. **History Display** (`History.tsx`):
   - **3-Column Layout**: Favicon | Title + Domain | Time + Remove
   - **Smart Time Formatting**: "Just now", "5m ago", "2h ago", "Yesterday"
   - **Real-time Search**: Filter by title or URL with 300ms debounce
   - **Manual Refresh**: Button to reload history data
   - **Clear All**: Confirmation dialog for bulk deletion

3. **Smart Navigation** (`HistoryIPCHandler.ts`):
   ```typescript
   ipcMain.handle("navigate-from-history", async (_, url: string) => {
     // Check if URL already open in existing tab
     const existingTab = mainWindow.allTabs.find(tab => tab.url === url)
     
     if (existingTab) {
       // Activate existing tab instead of creating duplicate
       mainWindow.switchActiveTab(existingTab.id)
       return { id: existingTab.id, title: existingTab.title, url, wasExisting: true }
     } else {
       // Create new tab
       const newTab = mainWindow.createTab(url)
       mainWindow.switchActiveTab(newTab.id)
       return { id: newTab.id, title: newTab.title, url, wasExisting: false }
     }
   })
   ```

### Time Formatting

**Smart Relative Time Display**:
- "Just now" - Within last minute
- "5m ago" - Within last hour
- "2h ago" - Within last day
- "Yesterday" - Previous day
- "3 days ago" - Within last week
- "Oct 10" - Older dates

**Implementation** (`History.tsx`):
```typescript
const formatTime = (date: Date) => {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  
  if (seconds < 60) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
```

### UI Components

**HistoryEntry Component**:
- Favicon (16x16px with fallback)
- Title (bold) and domain (gray)
- Relative timestamp
- Remove button (visible on hover)
- Click to navigate

**Empty States**:
- No history: "No browsing history yet"
- No search results: "No history entries match your search"
- Loading state: Spinner with "Loading..."

---

## User Switching Integration

**Automatic History Refresh**: History automatically refreshes when switching users

**Implementation** (`HistoryContext.tsx`):
```typescript
useEffect(() => {
  const handleUserChange = () => {
    console.log('User changed - refreshing history')
    refreshHistory()
  }
  
  window.sidebarAPI.onUserChanged(handleUserChange)
  return () => window.sidebarAPI.removeUserChangedListener()
}, [refreshHistory])
```

**Data Isolation**: Each user's history stored in separate JSON files:
- `users/user-data/{userId}/browsing-history.json`
- Complete privacy between user accounts
- History persists across sessions

### Storage Structure

**File Path**:
```
users/user-data/
├── guest/
│   └── browsing-history.json         # Cleared on restart
├── user-123/
│   └── browsing-history.json         # Persisted
└── user-456/
    └── browsing-history.json         # Persisted
```

**File Format**:
```json
[
  {
    "id": "1697472000000-abc123",
    "url": "https://example.com",
    "title": "Example Domain",
    "visitedAt": "2025-10-16T15:30:00.000Z",
    "favicon": "https://example.com/favicon.ico"
  },
  ...
]
```

---

## Search and Management

### Search Features

**Real-time Search**:
- Search by title or URL
- Case-insensitive matching
- Results sorted by recency
- Debounced for performance (300ms)
- Clear search to return to full history

**Implementation** (`HistoryContext.tsx`):
```typescript
searchHistory(query: string) {
  setSearchQuery(query)
  
  if (!query.trim()) {
    return refreshHistory() // Show all
  }
  
  const filtered = history.filter(entry => 
    entry.title.toLowerCase().includes(query.toLowerCase()) ||
    entry.url.toLowerCase().includes(query.toLowerCase())
  )
  
  setHistory(filtered)
}
```

### Management Actions

**Individual Removal**:
- X button visible on hover
- Instant removal from UI
- Persisted immediately
- No confirmation required

**Bulk Clear**:
- "Clear All History" button
- Confirmation dialog: "Are you sure? This cannot be undone"
- 3-second auto-hide after success
- Clears all entries for current user

**Manual Refresh**:
- Reload button to fetch latest data
- Useful after external changes
- Shows loading indicator

**Smart Navigation**:
- Checks for existing tabs with same URL
- Reuses existing tab if found
- Creates new tab only if needed
- Auto-close history panel after navigation

### Key Functions Involved

**Recording**:
- `Tab.recordHistoryEntry()` - Capture navigation events
- `HistoryStorage.addHistoryEntry()` - Store with deduplication

**Display**:
- `HistoryContext.refreshHistory()` - Load and sort for UI
- `History.tsx` - Complete UI with search and management

**Navigation**:
- `HistoryIPCHandler.navigate-from-history` - Smart tab navigation
- `Window.switchActiveTab()` - Activate existing tabs

---

## Performance Considerations

### Memory Efficiency
- Maximum 1000 entries per user
- Old entries automatically pruned
- Lazy loading of history (only when panel opened)
- No caching beyond React state

### Search Performance
- 300ms debounce prevents excessive filtering
- Simple string matching (fast for 1000 entries)
- No regex or complex parsing
- Results limited to 1000 entries

### Storage Efficiency
- JSON file format (human-readable)
- Single file per user (atomic writes)
- Deduplication reduces duplicate entries
- Automatic pruning keeps size bounded

---

## Related Features

- [User Accounts](./user-accounts.md) - Per-user isolation
- [Browser Core](./browser-core.md) - Navigation events
- [Activity Tracking](./activity-tracking.md) - Detailed interaction tracking
- [Vector Search](./vector-search.md) - Semantic search (future enhancement)

