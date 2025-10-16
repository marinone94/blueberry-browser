# Vector Search Implementation

## Overview

This document describes the vector search implementation for semantic search of browsing content. The system enables AI-powered search of browsing history based on meaning rather than exact text matches.

**Status**: ✅ Indexing Implemented (Search UI pending)

## Architecture

### Technology Stack

- **Vector Database**: LanceDB (embedded, no external services required)
- **Embeddings**: Transformers.js v3 (`@huggingface/transformers`) with `Xenova/all-MiniLM-L6-v2` model
- **Storage**: Per-user vector databases in `user-data/{userId}/vector-db/`
- **Embedding Dimension**: 384 (all-MiniLM-L6-v2 output)

### Key Components

1. **VectorSearchManager** (`src/main/VectorSearchManager.ts`)
   - Manages LanceDB connections and embeddings generation
   - Per-user database isolation
   - Automatic initialization on first use

2. **ContentAnalyzer** (`src/main/ContentAnalyzer.ts`)
   - Indexes content during analysis pipeline
   - Creates separate documents for each content type

3. **UserDataManager** (`src/main/UserDataManager.ts`)
   - Handles cleanup when browsing history is deleted
   - Maintains referential integrity between history and vector DB

## Document Structure

Each analyzed page creates **4 separate vector documents**:

```typescript
interface IndexedDocument {
  id: string;                    // e.g., "analysis-123-pageDescription"
  analysisId: string;            // Reference to content analysis
  userId: string;                // User ownership
  url: string;                   // Original page URL
  contentType: 'pageDescription' | 'title' | 'metaDescription' | 'screenshotDescription';
  content: string;               // The actual text
  timestamp: string;             // ISO timestamp
  vector: number[];              // 384-dimensional embedding
}
```

### Why Separate Documents?

1. **Granular Matching**: Different content types serve different search purposes
   - Titles: Quick identification
   - Descriptions: Conceptual matching
   - Screenshots: Visual element descriptions
   
2. **Better Relevance**: User queries can match specific aspects of pages

3. **Flexible Ranking**: Can weight different content types differently in search

## Indexing Flow

### 1. Content Analysis Trigger
```
User visits page → ContentAnalyzer.onPageVisit()
  ↓
Extract HTML, text, screenshot
  ↓
Queue for LLM analysis
  ↓
ContentAnalyzer.performAnalysis()
```

### 2. Vector Indexing
```
LLM analysis completes
  ↓
Save analysis to content-analysis/{date}.json
  ↓
VectorSearchManager.indexContentAnalysis()
  ↓
For each content type:
  - Generate embedding (local, no API calls)
  - Create IndexedDocument
  ↓
Add documents to LanceDB table
```

### 3. Storage Location
```
/Users/{user}/Library/Application Support/blueberry-browser/
├── users/
│   └── user-data/
│       └── {userId}/
│           ├── content-analysis/     # JSON analysis files
│           │   └── 2025-10-01.json
│           ├── vector-db/            # LanceDB storage
│           │   └── browsing_content/ # Vector table
│           └── screenshots/          # PNG files
```

## Search API

### Basic Search
```typescript
const results = await vectorSearchManager.searchBrowsingContent(
  userId,
  "mortgage rates sweden",
  { limit: 20 }
);
```

### Filtered Search
```typescript
const results = await vectorSearchManager.searchBrowsingContent(
  userId,
  "banking features",
  { 
    limit: 10,
    contentTypes: ['pageDescription', 'title'] // Only search these types
  }
);
```

### Search Results
```typescript
interface SearchResult {
  id: string;
  analysisId: string;
  url: string;
  contentType: string;
  content: string;
  timestamp: Date;
  score: number;  // Similarity score (0-1)
}
```

## Cleanup & Data Management

### Automatic Cleanup

When browsing history is deleted, vector documents are automatically removed:

```typescript
// Delete single entry
await userDataManager.removeHistoryEntry(
  userId, 
  entryId,
  vectorSearchManager  // Optional, enables cleanup
);

// Clear all history
await userDataManager.clearBrowsingHistory(
  userId,
  vectorSearchManager  // Optional, enables cleanup
);
```

### Cleanup Flow

```
User deletes browsing history entry
  ↓
UserDataManager.removeHistoryEntry()
  ↓
Find all analyses for that URL
  ↓
VectorSearchManager.deleteMultipleAnalyses()
  ↓
Remove vector documents from LanceDB
```

## Performance Characteristics

### Embeddings Generation
- **Model Size**: ~25 MB (downloads once to app data)
- **Speed**: ~50-100ms per text (local, no network)
- **Dimension**: 384 floats = ~1.5 KB per embedding
- **4 embeddings per page**: ~6 KB vector data

### Storage
- **Per Document**: ~2 KB (metadata + vector)
- **Per Page Analysis**: ~8 KB (4 documents)
- **1000 pages**: ~8 MB vector database

### Search
- **Query Time**: 10-50ms for semantic search
- **Accuracy**: High semantic similarity matching
- **Scalability**: LanceDB handles millions of vectors efficiently

## Privacy & Security

### Local Processing
- ✅ All embeddings generated locally (no API calls)
- ✅ No data leaves the user's machine
- ✅ Per-user database isolation
- ✅ Automatic cleanup on history deletion

### Data Storage
- Vector databases stored in user's application data directory
- Same privacy model as browsing history
- Can be deleted by clearing user data

## Chat History Embedding

### Overview

Chat sessions are automatically indexed with vector embeddings to enable semantic search across conversation history. When a user switches away from a chat session, the system generates embeddings for all messages and creates an LLM-powered summary.

### Document Structure

Each chat session creates **N+1 documents** (N messages + 1 summary):

```typescript
interface IndexedChatDocument {
  id: string;                    // e.g., "session-123-msg-456"
  sessionId: string;             // Reference to chat session
  userId: string;                // User ownership
  contentType: 'userMessage' | 'assistantMessage' | 'sessionSummary';
  content: string;               // Message text or summary
  messageId?: string;            // Original message ID (for messages)
  timestamp: string;             // ISO timestamp
  vector: number[];              // 384-dimensional embedding
}
```

### Indexing Flow

#### Automatic Indexing on Session Deactivation

```
User switches to different session
  ↓
LLMClient.setCurrentSessionId(newSessionId)
  ↓
indexCurrentSession() triggered for old session
  ↓
Load all messages from UserDataManager
  ↓
VectorSearchManager.indexChatSession()
  ↓
For each user/assistant message:
  - Extract text content (handle multimodal)
  - Generate embedding
  - Create IndexedChatDocument
  ↓
Generate LLM summary of conversation
  ↓
Embed summary
  ↓
Add all documents to chat_history table
```

#### LLM Summary Generation

Summaries are generated using GPT-5-nano:

```typescript
// Prompt example
"Provide a concise 2-3 sentence summary of this conversation 
that captures the main topics discussed and key points:

user: How do I optimize React performance?
assistant: There are several key strategies...
user: What about memo vs useMemo?
assistant: Great question! memo() is for components..."

// Generated summary
"Conversation about React performance optimization, focusing on 
memoization strategies. Discussed differences between React.memo() 
for components and useMemo() for values, with examples."
```

### Deletion & Cleanup

Chat embeddings are automatically cleaned up when:

1. **Individual Session Deletion**:
   ```typescript
   UserDataManager.deleteChatSession(userId, sessionId, vectorSearchManager)
     ↓
   Remove session and messages from chat-history.json
     ↓
   VectorSearchManager.deleteChatSessionDocuments(userId, sessionId)
     ↓
   Delete all documents with matching sessionId
   ```

2. **Clear All History**:
   ```typescript
   ChatIPCHandler / HistoryIPCHandler: clear-chat-history handler
     ↓
   Get all session IDs
     ↓
   VectorSearchManager.deleteMultipleChatSessions(userId, sessionIds)
     ↓
   Batch delete all chat documents
     ↓
   UserDataManager.clearChatHistory(userId)
   ```

### Search API

```typescript
// Search chat history
const results = await vectorSearchManager.searchChatHistory(
  userId,
  "performance optimization tips",
  { 
    limit: 10,
    contentTypes: ['userMessage', 'assistantMessage', 'sessionSummary']
  }
);

// Results include session context
results.forEach(result => {
  console.log(`Session: ${result.sessionId}`);
  console.log(`Type: ${result.contentType}`);
  console.log(`Content: ${result.content}`);
  console.log(`Score: ${result.score}`);
});
```

### Storage

Chat embeddings are stored separately from browsing content:

```
/Users/{user}/Library/Application Support/blueberry-browser/
├── users/
│   └── user-data/
│       └── {userId}/
│           ├── chat-history.json        # Message storage
│           └── vector-db/               # LanceDB storage
│               ├── browsing_content/    # Browsing embeddings
│               └── chat_history/        # Chat embeddings (separate table)
```

### Performance

- **Indexing Time**: ~50-100ms per message + ~2-3s for LLM summary
- **Summary Generation**: Async, doesn't block UI
- **Storage**: ~2 KB per message + ~2 KB for summary
- **Search**: 10-50ms across thousands of messages

### Key Features

1. **Automatic**: No user action required, indexes on session switch
2. **Multimodal Support**: Extracts text from messages with images
3. **Smart Summaries**: LLM-generated summaries capture key topics
4. **Fast Search**: Semantic search across all conversations
5. **Privacy**: All embeddings generated locally
6. **Cleanup**: Automatic deletion with session management

## Future Enhancements

### Phase 2: Search UI (Not Yet Implemented)
- [ ] Add search IPC handlers
- [ ] Create search UI component
- [ ] Implement result ranking/filtering
- [ ] Add search history
- [ ] Highlight matching content

### Phase 3: Chat History Indexing ✅ Implemented
- [x] Index chat messages separately
- [x] Generate LLM summaries of chat sessions
- [x] Automatic embedding on session deactivation
- [x] Delete embeddings when sessions are deleted
- [ ] Link chat context to browsing content
- [ ] Enable cross-referencing in search

### Phase 4: Advanced Features (Not Yet Implemented)
- [ ] Hybrid search (vector + keyword)
- [ ] Time-based result weighting
- [ ] Category filtering in search
- [ ] Related page suggestions
- [ ] Automatic tagging based on clusters

## Integration Points

### For New Features

If you want to use vector search in your feature:

```typescript
// Get reference to VectorSearchManager from Window
const vectorSearchManager = window._vectorSearchManager;

// Ensure initialized for current user
await vectorSearchManager.initialize(userId);

// Search
const results = await vectorSearchManager.searchBrowsingContent(
  userId,
  query,
  { limit: 20 }
);

// Process results
for (const result of results) {
  // Get full analysis if needed
  const analysis = await userDataManager.getContentAnalysis(
    userId, 
    result.analysisId
  );
  
  // Display to user
  console.log(`${result.url}: ${result.content} (score: ${result.score})`);
}
```

### IPC Integration (To Be Implemented)

```typescript
// In preload/sidebar.ts or topbar.ts
searchBrowsingContent: (query: string, options?: SearchOptions) => 
  ipcRenderer.invoke('vector:search-browsing', query, options),

// In ChatIPCHandler / HistoryIPCHandler.ts
ipcMain.handle('vector:search-browsing', async (event, query, options) => {
  const userId = this.window.currentUserId;
  return await this.window._vectorSearchManager.searchBrowsingContent(
    userId,
    query,
    options
  );
});
```

## Troubleshooting

### Model Download Issues
**Problem**: Embeddings model fails to download
**Solution**: Check internet connection, model cache at `{appData}/models/`

### Slow Indexing
**Problem**: Indexing takes too long
**Solution**: Embeddings generation is CPU-bound, consider batching

### Search Returns No Results
**Problem**: No results for valid query
**Solution**: 
1. Check if content table exists: `getStats(userId)`
2. Verify user has analyzed pages
3. Check query relevance to indexed content

### Memory Usage
**Problem**: High memory usage
**Solution**: 
1. Embeddings model stays in memory (~100 MB)
2. This is expected for local ML
3. Model unloads when app closes

## Testing

### CLI Inspector Tool

A command-line tool is available for inspecting and testing the vector database:

```bash
# List all users
pnpm inspect-vectors list-users

# Show stats
pnpm inspect-vectors stats <userId>

# List documents
pnpm inspect-vectors list <userId> --limit 10

# Test search
pnpm inspect-vectors search <userId> "your query" --limit 5

# Show specific document with full vector
pnpm inspect-vectors show <userId> <documentId>
```

See `scripts/README.md` for detailed usage.

### Manual Testing Steps

1. **Test Indexing**:
   ```bash
   pnpm dev
   # Visit several pages
   # Check logs for "VectorSearchManager: Indexed X documents"
   
   # Verify with CLI
   pnpm inspect-vectors stats <userId>
   ```

2. **Verify Storage**:
   ```bash
   # Check files exist
   ls -lah ~/Library/Application\ Support/blueberry-browser/users/user-data/{userId}/vector-db/
   
   # Or use CLI
   pnpm inspect-vectors list <userId>
   ```

3. **Test Search**:
   ```bash
   # Test semantic search
   pnpm inspect-vectors search <userId> "banking services"
   pnpm inspect-vectors search <userId> "football team"
   
   # Verify results are semantically relevant
   ```

4. **Test Cleanup**:
   - Delete browsing history entry
   - Check logs for "VectorSearchManager: Deleted documents"
   - Verify with: `pnpm inspect-vectors stats <userId>`

## Technical Notes

### Why LanceDB?

1. **Embedded**: No Docker, no services, just works
2. **Fast**: Built on Apache Arrow, optimized for vectors
3. **Persistent**: Disk-based storage
4. **Scalable**: Handles millions of vectors
5. **Easy**: Simple API, TypeScript support

### Why Transformers.js v3?

1. **Local**: No API keys, no network calls
2. **Fast**: WebAssembly/ONNX runtime + optional WebGPU acceleration
3. **Privacy**: Data never leaves device
4. **Offline**: Works without internet (after initial model download)
5. **Quality**: all-MiniLM-L6-v2 is excellent for semantic search
6. **Official**: Official HuggingFace package with active development

### Alternative Approaches Considered

1. **SQLite + sqlite-vss**: More familiar but less optimized for vectors
2. **Vectra**: Simpler but less scalable
3. **External Vector DB (Pinecone, Weaviate)**: Requires network, breaks privacy
4. **OpenAI Embeddings API**: Costs money, requires network, privacy concerns

## References

- [LanceDB Documentation](https://lancedb.github.io/lancedb/)
- [Transformers.js](https://huggingface.co/docs/transformers.js)
- [all-MiniLM-L6-v2 Model](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)



---

## Related Features

- [Chat History](./chat-history.md) - Uses vector search for semantic chat search
- [Browsing History](./browsing-history.md) - Uses vector search for semantic page search  
- [Content Analysis](./content-analysis.md) - Content is indexed for vector search
- [Proactive Insights](./proactive-insights.md) - Uses vector search for pattern detection
