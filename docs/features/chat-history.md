# Chat History System

Complete documentation for the enhanced chat history system with session management, metadata tracking, and smart search capabilities.

## Table of Contents
- [Overview](#overview)
- [Chat Session Architecture](#chat-session-architecture)
- [Data Structures](#data-structures)
- [Complete Flows](#complete-flows)
  - [Creating a New Session](#creating-a-new-session)
  - [Sending a Message with History Tracking](#sending-a-message-with-history-tracking)
  - [Switching Between Sessions](#switching-between-sessions)
  - [Deleting a Session](#deleting-a-session)
- [Smart Chat Search](#smart-chat-search)
- [Performance Characteristics](#performance-characteristics)
- [Integration with Vector Search](#integration-with-vector-search)

---

## Overview

Blueberry Browser implements a sophisticated chat history system that organizes AI conversations into persistent sessions with comprehensive metadata tracking. This enables users to manage multiple conversation threads, track context, and analyze chat performance over time.

### Key Features

- **Session-based Organization**: Each conversation is a distinct session with unique ID
- **Comprehensive Metadata**: Tracks timestamps, URLs, response times, and message counts
- **User Isolation**: Complete chat history separation between user accounts
- **Persistent Storage**: All sessions and messages saved to disk automatically
- **Smart Session Management**: Create, switch, and clear sessions with ease
- **Vector Embeddings**: Semantic search across all conversations
- **Exact Match Search**: Find specific phrases or terms
- **Date Range Filtering**: Time-bounded search capabilities

---

## Chat Session Architecture

### Purpose

Organize conversations into separate sessions with full context preservation and metadata tracking.

### Storage Structure

**File Location**:
```
users/user-data/{userId}/chat-history.json
```

**Benefits of Single-File Storage**:
- Atomic reads/writes for consistency
- Simple backup and restore
- Easy to migrate or export
- No database complexity

**File Structure**:
```json
{
  "sessions": [...],           // All conversation sessions
  "messages": [...],           // All messages (linked by sessionId)
  "currentSessionId": "session-123",
  "totalConversations": 15,
  "totalMessages": 127,
  "createdAt": "2025-09-15T08:00:00.000Z",
  "updatedAt": "2025-09-30T15:20:00.000Z"
}
```

---

## Data Structures

### ChatSession Interface

```typescript
interface ChatSession {
  id: string;                    // Unique session identifier
  userId: string;                // User account ownership
  title: string;                 // Session title (initially session ID)
  startedAt: Date;              // Session creation timestamp
  lastMessageAt: Date;          // Last message in this session
  lastActiveAt: Date;           // Last time session was accessed
  messageCount: number;         // Total messages in session
  contextUrls: string[];        // All URLs referenced in session
  totalResponseTime: number;    // Cumulative AI response time
  averageResponseTime: number;  // Average AI response time
}
```

**Metadata Tracking**:
- **Timestamps**: Creation, last message, last access
- **Message Metrics**: Count of messages in session
- **Context URLs**: All pages referenced during conversation
- **Performance**: Response time tracking for analytics

### ChatMessage Interface

```typescript
interface ChatMessage {
  id: string;                   // Unique message identifier
  role: 'user' | 'assistant' | 'system';
  content: string | ContentPart[];
  timestamp: Date;              // Individual message timestamp
  contextUrl?: string;          // URL where message was sent
  contextTitle?: string;        // Page title at time of message
  sessionId: string;            // Parent session reference
  responseTime?: number;        // Time taken for AI response (ms)
  streamingMetrics?: {          // Streaming performance data
    tokensPerSecond: number;
    totalTokens: number;
    firstTokenDelay: number;
  };
  messageIndex: number;         // Order within session
  source: 'user' | 'assistant' | 'system';
}
```

**Multimodal Content**:
```typescript
type ContentPart = 
  | { type: 'text'; text: string }
  | { type: 'image'; image: string } // base64 data URL
```

### ChatHistory Interface

```typescript
interface ChatHistory {
  sessions: ChatSession[];      // All conversation sessions
  messages: ChatMessage[];      // All messages across sessions
  currentSessionId: string | null;  // Active session
  totalConversations: number;   // Lifetime conversation count
  totalMessages: number;        // Lifetime message count
  createdAt: Date;             // History file creation
  updatedAt: Date;             // Last modification
}
```

---

## Complete Flows

### Creating a New Session

**User Action**: Click "New Chat" button in chat history view

**Complete Flow**:

1. **UI Trigger** (`ChatHistory.tsx`):
   ```typescript
   handleNewChat() → {
     const sessionId = await createNewSession()
     await switchToSession(sessionId)
     onClose()
   }
   ```

2. **Context Layer** (`ChatHistoryContext.tsx`):
   ```typescript
   createNewSession(title?) → {
     const currentUrl = await window.sidebarAPI.getCurrentUrl()
     const sessionId = await window.sidebarAPI.createChatSession(currentUrl, title)
     await loadSessions()
     return sessionId
   }
   ```

3. **IPC Communication** (`ChatIPCHandler.ts`):
   ```typescript
   ipcMain.handle("create-chat-session", async (_, contextUrl?, title?) → {
     const currentUser = userAccountManager.getCurrentUser()
     return await userDataManager.createChatSession(currentUser.id, contextUrl, title)
   })
   ```

4. **Session Creation** (`ChatStorage.ts`):
   ```typescript
   createChatSession(userId, contextUrl?, title?) → {
     const history = await loadChatHistory(userId)
     const sessionId = `session-${Date.now()}-${Math.random().toString(36)}`
     
     const newSession = {
       id: sessionId,
       userId,
       title: title || sessionId,
       startedAt: new Date(),
       lastMessageAt: new Date(),
       lastActiveAt: new Date(),
       messageCount: 0,
       contextUrls: contextUrl ? [contextUrl] : [],
       totalResponseTime: 0,
       averageResponseTime: 0
     }
     
     history.sessions.push(newSession)
     history.currentSessionId = sessionId
     history.totalConversations++
     await saveChatHistory(userId, history)
     
     return sessionId
   }
   ```

5. **LLMClient Synchronization** (`LLMClient.ts`):
   ```typescript
   // Automatically loads new empty session
   loadCurrentUserMessages() → {
     this.currentSessionId = await userDataManager.getCurrentSessionId(userId)
     this.messages = []
     sendMessagesToRenderer()
   }
   ```

**Key Functions**:
- `ChatHistory.handleNewChat()` - UI trigger
- `ChatHistoryContext.createNewSession()` - Context coordination
- `ChatStorage.createChatSession()` - Session creation and persistence
- `LLMClient.loadCurrentUserMessages()` - Synchronize with AI client

---

### Sending a Message with History Tracking

**User Action**: Send message in chat interface

**Enhanced Flow with History Tracking**:

1. **Message Composition** (`Chat.tsx`):
   ```typescript
   handleSubmit() → {
     onSend(value.trim())
     setValue('')
   }
   ```

2. **Chat Context Processing** (`ChatContext.tsx`):
   ```typescript
   sendMessage(content) → {
     const messageId = Date.now().toString()
     window.sidebarAPI.sendChatMessage({
       message: content,
       messageId: messageId
     })
   }
   ```

3. **LLMClient Message Processing** (`LLMClient.ts`):
   ```typescript
   sendChatMessage(request) → {
     const startTime = Date.now()
     
     // Capture context
     const screenshot = await activeTab.screenshot()
     const pageText = await activeTab.getTabText()
     const contextUrl = activeTab.url
     const contextTitle = activeTab.title
     
     // Build user message with multimodal content
     const userMessage = {
       role: "user",
       content: [
         { type: "image", image: screenshot },
         { type: "text", text: request.message }
       ]
     }
     
     this.messages.push(userMessage)
     sendMessagesToRenderer()
     
     // Save user message to history
     await userDataManager.addChatMessage(
       currentUserId,
       userMessage,
       currentSessionId,
       contextUrl,
       contextTitle
     )
     
     // Stream AI response
     await streamResponse(contextMessages, messageId)
     
     const responseTime = Date.now() - startTime
     
     // Save assistant message to history with metrics
     await userDataManager.addChatMessage(
       currentUserId,
       assistantMessage,
       currentSessionId,
       contextUrl,
       contextTitle,
       responseTime,
       streamingMetrics
     )
   }
   ```

4. **Message Persistence** (`ChatStorage.ts`):
   ```typescript
   addChatMessage(userId, message, sessionId, contextUrl, contextTitle, responseTime) → {
     const history = await loadChatHistory(userId)
     
     const chatMessage = {
       id: `msg-${Date.now()}-${Math.random().toString(36)}`,
       role: message.role,
       content: message.content,
       timestamp: new Date(),
       contextUrl,
       contextTitle,
       sessionId,
       responseTime,
       streamingMetrics,
       messageIndex: history.messages.filter(m => m.sessionId === sessionId).length,
       source: message.role
     }
     
     history.messages.push(chatMessage)
     history.totalMessages++
     
     // Update session metadata
     const session = history.sessions.find(s => s.id === sessionId)
     session.lastMessageAt = new Date()
     session.messageCount++
     
     // Track context URLs
     if (contextUrl && !session.contextUrls.includes(contextUrl)) {
       session.contextUrls.push(contextUrl)
     }
     
     // Update response time metrics
     if (responseTime && message.role === 'assistant') {
       session.totalResponseTime += responseTime
       session.averageResponseTime = session.totalResponseTime / 
         assistantMessageCount
     }
     
     await saveChatHistory(userId, history)
   }
   ```

**Metadata Updates**:
- Message count incremented
- Last message timestamp updated
- Context URL added to session
- Response time metrics calculated
- Vector embeddings generated (see [Vector Search](./vector-search.md))

---

### Switching Between Sessions

**User Action**: Click on a session in chat history view

**Complete Flow**:

1. **Session Selection** (`ChatHistory.tsx`):
   ```typescript
   handleSelectSession(sessionId) → {
     await switchToSession(sessionId)
     onSelectSession(sessionId)
     onClose()
   }
   ```

2. **Context Update** (`ChatHistoryContext.tsx`):
   ```typescript
   switchToSession(sessionId) → {
     await window.sidebarAPI.switchToSession(sessionId)
     setCurrentSessionId(sessionId)
     await loadSessions()
   }
   ```

3. **IPC Handler** (`ChatIPCHandler.ts`):
   ```typescript
   ipcMain.handle("switch-to-session", async (_, sessionId) → {
     const currentUser = userAccountManager.getCurrentUser()
     await userDataManager.setCurrentSessionId(currentUser.id, sessionId)
     await sidebar.client.loadCurrentUserMessages()
     return true
   })
   ```

4. **Session Activation** (`ChatStorage.ts`):
   ```typescript
   setCurrentSessionId(userId, sessionId) → {
     const history = await loadChatHistory(userId)
     history.currentSessionId = sessionId
     history.updatedAt = new Date()
     
     // Update lastActiveAt for the session
     const session = history.sessions.find(s => s.id === sessionId)
     session.lastActiveAt = new Date()
     
     await saveChatHistory(userId, history)
   }
   ```

5. **Load Session Messages** (`LLMClient.ts`):
   ```typescript
   loadCurrentUserMessages() → {
     const history = await userDataManager.loadChatHistory(userId)
     const sessionMessages = history.messages.filter(m => m.sessionId === currentSessionId)
     
     // Convert to CoreMessage format
     this.messages = sessionMessages.map(m => ({
       role: m.role,
       content: m.content
     }))
     
     sendMessagesToRenderer()
   }
   ```

**UI Updates**:
- Chat interface clears and shows selected session
- Message history loads for the session
- Current session badge updates in history list
- Scroll position resets to bottom

---

### Deleting a Session

**User Action**: Click delete button on a session in chat history view

**Complete Flow**:

1. **Confirmation** (`ChatHistory.tsx`):
   ```typescript
   handleDeleteSession(sessionId) → {
     if (!confirm('Delete this conversation? This cannot be undone.')) return
     await deleteSession(sessionId)
   }
   ```

2. **Context Processing** (`ChatHistoryContext.tsx`):
   ```typescript
   deleteSession(sessionId) → {
     await window.sidebarAPI.deleteChatSession(sessionId)
     await loadSessions()
     
     // If deleted session was active, switch to another
     if (currentSessionId === sessionId) {
       const firstSession = sessions[0]
       if (firstSession) {
         await switchToSession(firstSession.id)
       }
     }
   }
   ```

3. **IPC Handler** (`ChatIPCHandler.ts`):
   ```typescript
   ipcMain.handle("delete-chat-session", async (_, sessionId) → {
     const currentUser = userAccountManager.getCurrentUser()
     
     // Delete vector embeddings first
     await vectorSearchManager.deleteSessionEmbeddings(currentUser.id, sessionId)
     
     // Delete session and messages
     await userDataManager.deleteChatSession(currentUser.id, sessionId)
     
     return true
   })
   ```

4. **Session Removal** (`ChatStorage.ts`):
   ```typescript
   deleteChatSession(userId, sessionId) → {
     const history = await loadChatHistory(userId)
     
     // Remove session
     history.sessions = history.sessions.filter(s => s.id !== sessionId)
     
     // Remove all messages from this session
     const deletedCount = history.messages.filter(m => m.sessionId === sessionId).length
     history.messages = history.messages.filter(m => m.sessionId !== sessionId)
     history.totalMessages -= deletedCount
     
     // Switch to another session if deleted was current
     if (history.currentSessionId === sessionId) {
       history.currentSessionId = history.sessions[0]?.id || null
     }
     
     await saveChatHistory(userId, history)
   }
   ```

5. **Vector Cleanup** (`VectorSearchManager.ts`):
   ```typescript
   deleteSessionEmbeddings(userId, sessionId) → {
     await ensureInitialized(userId)
     
     // Delete all embeddings for this session
     await chatTable
       .delete(`sessionId = '${sessionId}'`)
       .execute()
   }
   ```

**Cleanup Operations**:
- Session metadata removed
- All messages deleted
- Vector embeddings cleaned up
- Current session switched if needed
- UI refreshes to show remaining sessions

---

## Smart Chat Search

**Purpose**: Powerful semantic and exact match search across all chat conversations with advanced filtering

**User Action**: Open chat history and use search bar to find conversations

### Search Modes

#### 1. Semantic Search (Default)

**Usage**: Type natural language query

**How it Works**:
- Uses vector embeddings to find semantically similar messages
- Finds related concepts even if exact words not used
- Example: "mortgage rates" finds "home loan interest", "housing finance"
- Returns sessions ranked by relevance score

**Implementation**:
```typescript
// Generate query embedding
const queryEmbedding = await pipeline.embed(query)

// Search vector database
results = await chatTable
  .search(queryEmbedding)
  .limit(limit)
  .execute()

// Group by session and rank
sessionMap = groupBySessionWithScores(results)
```

#### 2. Exact Match Search

**Usage**: Wrap query in quotes: `"specific phrase"`

**How it Works**:
- Finds exact text matches in message content
- Case-insensitive
- Useful for finding specific terms or code snippets
- Example: `"useState hook"` finds only messages with that exact phrase

**Implementation**:
```typescript
// Detect quote-wrapped query
const exactMatch = query.startsWith('"') && query.endsWith('"')
const searchQuery = exactMatch ? query.slice(1, -1) : query

// SQL LIKE query
results = await chatTable
  .search()
  .filter(`content LIKE '%${sanitizedQuery}%'`)
  .execute()
```

#### 3. Date Range Filtering

**Usage**: Click calendar icon and set date range

**Features**:
- Filter by "From" date, "To" date, or both
- Works with both semantic and exact search
- Dates are inclusive
- Useful for finding conversations from specific time periods

**Implementation**:
```typescript
let filter = undefined

if (dateFrom) filter = `timestamp >= '${dateFrom}'`
if (dateTo) filter = filter 
  ? `${filter} AND timestamp <= '${dateTo}'`
  : `timestamp <= '${dateTo}'`

results = await chatTable
  .search(queryEmbedding)
  .filter(filter)
  .execute()
```

### Search Flow

**Complete Flow**:

1. **Search UI** (`ChatSearchBar.tsx`):
   ```typescript
   // User types in search bar
   <input
     value={query}
     onChange={(e) => setQuery(e.target.value)}
     placeholder='Search chats... (use "quotes" for exact match)'
   />
   
   // Debounced search (500ms)
   useEffect(() => {
     const timer = setTimeout(() => {
       setDebouncedQuery(query)
     }, 500)
     return () => clearTimeout(timer)
   }, [query])
   ```

2. **Search Mode Detection** (`ChatSearchBar.tsx`):
   ```typescript
   handleSearch() → {
     const trimmedQuery = debouncedQuery.trim()
     
     // Check if query is surrounded by quotes for exact match
     const exactMatch = trimmedQuery.startsWith('"') && trimmedQuery.endsWith('"')
     const searchQuery = exactMatch 
       ? trimmedQuery.slice(1, -1) // Remove quotes
       : trimmedQuery
     
     const searchOptions = {
       exactMatch,
       dateFrom: dateFrom || undefined,
       dateTo: dateTo || undefined
     }
     
     onSearch(searchQuery, searchOptions)
   }
   ```

3. **Context Processing** (`ChatHistoryContext.tsx`):
   ```typescript
   searchSessions(query, options) → {
     setIsSearching(true)
     
     const results = await window.sidebarAPI.searchChatHistory(query, {
       exactMatch: options.exactMatch,
       dateFrom: options.dateFrom,
       dateTo: options.dateTo,
       limit: 50
     })
     
     setSessions(results)
     setIsSearching(false)
   }
   ```

4. **IPC Communication** (`ChatIPCHandler.ts`):
   ```typescript
   ipcMain.handle('search-chat-history', async (_, query, options) → {
     const currentUser = userAccountManager.getCurrentUser()
     
     return await vectorSearchManager.searchChatHistory(
       currentUser.id,
       query,
       options
     )
   })
   ```

5. **Vector Search Execution** (`VectorSearchManager.ts`):
   ```typescript
   searchChatHistory(userId, query, options) → {
     await ensureInitialized(userId)
     
     if (options.exactMatch) {
       // Exact text matching in content field
       let filter = `content LIKE '%${sanitizedQuery}%'`
       
       if (dateFrom) filter += ` AND timestamp >= '${dateFrom}'`
       if (dateTo) filter += ` AND timestamp <= '${dateTo}'`
       
       results = await chatTable
         .search()
         .filter(filter)
         .limit(limit)
         .execute()
     } else {
       // Semantic vector search
       const queryEmbedding = await pipeline.embed(query)
       
       results = await chatTable
         .search(queryEmbedding)
         .filter(dateFilter)
         .limit(limit * 3)
         .execute()
     }
     
     // Group by session and aggregate
     sessionMap = groupBySession(results)
     
     // Load full session metadata
     const sessions = await loadSessionsWithMetadata(sessionMap)
     
     return sessions.sort((a, b) => b._searchScore - a._searchScore)
   }
   ```

### Search UI Components

**Search Input**:
- Text input with placeholder
- Search icon on left
- Clear button on right (when active)
- Calendar button to toggle date filters

**Date Range Filters** (expandable):
- From date input
- To date input
- Collapsible section

**Smart Indicators**:
- "Smart semantic search" - Vector similarity search active
- "Exact match search" - Text matching active
- "Filtering by date" - Only date filters applied
- "Searching..." - Search in progress

**Action Buttons**:
- Calendar icon - Toggle date filters
- X icon - Clear search (only shown when active)

### Search Results

**Result Display**:
- Sessions returned by search replace the full session list
- Each result shows:
  - Session title
  - Last active timestamp
  - Message count
  - Context URLs
  - Relevance score (internal)
  - Match type (semantic/exact)
- Click to load session (same as normal history)

**Example Results**:
```json
[
  {
    "id": "session-123",
    "title": "Mortgage Research",
    "messageCount": 15,
    "contextUrls": ["https://example.com/rates"],
    "_searchScore": 0.89,
    "_matchType": "semantic",
    "_matchedMessages": 3
  }
]
```

### Performance Optimizations

- **Debounced Input**: 500ms delay reduces API calls
- **Vector Search**: Efficient approximate nearest neighbor
- **Result Limits**: Maximum 50 sessions returned
- **Text Indexes**: Exact match uses database text indexes
- **Session Caching**: Metadata cached in context

---

## Performance Characteristics

### Read Operations

- **Load Sessions**: O(1) file read + O(n) session sort
- **Load Messages**: O(1) file read + O(m) filter by sessionId
- **Switch Session**: O(1) file write + message load

### Write Operations

- **Add Message**: O(1) append + O(1) metadata update + O(1) file write
- **Create Session**: O(1) append + O(1) file write
- **Delete Session**: O(n) filter + O(1) file write
- **Clear History**: O(1) file write (overwrite with empty)

### Optimizations

- **Lazy Loading**: Only current session messages in memory
- **Filtered Display**: Hide empty sessions in UI
- **Sorted Sessions**: Pre-sorted by lastActiveAt
- **Minimal IPC**: Batch operations where possible
- **Vector Embeddings**: Generated asynchronously after save

---

## Integration with Vector Search

### Automatic Embedding Generation

**When**: After session deactivation or user switch

**Process**:
1. Session marked as inactive
2. Messages without embeddings identified
3. Embeddings generated for each message
4. Stored in vector database for search

**Details**: See [Vector Search](./vector-search.md)

### Search Integration

**Semantic Search**:
- Uses pre-generated message embeddings
- Fast approximate nearest neighbor search
- Results grouped by session
- Ranked by average similarity score

**Exact Match**:
- Uses text content directly
- No embeddings required
- Fast database text search
- Case-insensitive matching

---

## Related Features

- [AI Chat](./ai-chat.md) - Message sending and streaming
- [User Accounts](./user-accounts.md) - Per-user chat isolation
- [Vector Search](./vector-search.md) - Semantic search implementation
- [Activity Tracking](./activity-tracking.md) - Chat interaction tracking
- [Content Analysis](./content-analysis.md) - Page context in messages

