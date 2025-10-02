import { connect, Table } from 'vectordb';
import { pipeline, env } from '@huggingface/transformers';
import { join } from 'path';
import { app } from 'electron';

// Configure local model caching to app directory
env.cacheDir = join(app.getPath('userData'), 'models');

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Represents a document indexed in the vector database
 */
export interface IndexedDocument {
  id: string;                    // Unique document ID
  analysisId: string;            // Reference to content analysis
  userId: string;                // User who owns this document
  url: string;                   // Original page URL
  contentType: 'pageDescription' | 'title' | 'metaDescription' | 'screenshotDescription';
  content: string;               // The actual text content
  timestamp: string;             // ISO timestamp
  vector: number[];              // Embedding vector
}

/**
 * Represents a chat document indexed in the vector database
 */
export interface IndexedChatDocument {
  id: string;                    // Unique document ID
  sessionId: string;             // Reference to chat session
  userId: string;                // User who owns this document
  contentType: 'userMessage' | 'assistantMessage' | 'sessionSummary';
  content: string;               // The actual text content
  messageId?: string;            // Original message ID (for messages)
  timestamp: string;             // ISO timestamp
  vector: number[];              // Embedding vector
}

/**
 * Search result with similarity score
 */
export interface SearchResult {
  id: string;
  analysisId: string;
  url: string;
  contentType: string;
  content: string;
  timestamp: Date;
  score: number;                 // Similarity score (0-1)
}

// ============================================================================
// VECTOR SEARCH MANAGER
// ============================================================================

/**
 * Manages vector embeddings and semantic search for browsing content
 * 
 * Key features:
 * - Local embeddings using Transformers.js (no API calls)
 * - LanceDB for efficient vector storage and search
 * - Per-user isolated databases
 * - Separate documents for different content types
 */
export class VectorSearchManager {
  private db: any = null;
  private embedder: any = null;
  private contentTable: Table | null = null;
  private chatTable: Table | null = null;
  private currentUserId: string | null = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  /**
   * Initialize the vector search manager for a specific user
   */
  async initialize(userId: string): Promise<void> {
    // If already initializing for this user, wait for it
    if (this.initializationPromise && this.currentUserId === userId) {
      return this.initializationPromise;
    }

    // If initializing for different user, wait and then reinitialize
    if (this.initializationPromise && this.currentUserId !== userId) {
      await this.initializationPromise;
      this.isInitialized = false;
    }

    // If already initialized for this user, no-op
    if (this.isInitialized && this.currentUserId === userId) {
      return;
    }

    // Start new initialization
    this.initializationPromise = this._doInitialize(userId);
    await this.initializationPromise;
    this.initializationPromise = null;
  }

  private async _doInitialize(userId: string): Promise<void> {
    try {
      console.log(`VectorSearchManager: Initializing for user ${userId}...`);

      // Database path in user's vector-db directory
      const dbPath = join(
        app.getPath('userData'),
        'users',
        'user-data',
        userId,
        'vector-db'
      );

      console.log(`VectorSearchManager: DB path: ${dbPath}`);

      // Connect to LanceDB (creates if doesn't exist)
      this.db = await connect(dbPath);

      // Initialize embeddings model (downloads once, ~25MB)
      console.log('VectorSearchManager: Loading embeddings model...');
      this.embedder = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2'
      );
      console.log('VectorSearchManager: Embeddings model loaded');

      // Try to open existing browsing content table
      try {
        this.contentTable = await this.db.openTable('browsing_content');
        console.log('VectorSearchManager: Opened existing content table');
      } catch {
        console.log('VectorSearchManager: Content table does not exist yet, will create on first insert');
        this.contentTable = null;
      }

      // Try to open existing chat table
      try {
        this.chatTable = await this.db.openTable('chat_history');
        console.log('VectorSearchManager: Opened existing chat table');
      } catch {
        console.log('VectorSearchManager: Chat table does not exist yet, will create on first insert');
        this.chatTable = null;
      }

      this.currentUserId = userId;
      this.isInitialized = true;

      console.log(`VectorSearchManager: Initialized successfully for user ${userId}`);
    } catch (error) {
      console.error('VectorSearchManager: Initialization failed:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  /**
   * Index content from a content analysis result
   * Creates separate documents for each content type
   */
  async indexContentAnalysis(
    analysisId: string,
    userId: string,
    url: string,
    timestamp: Date,
    content: {
      pageDescription: string;
      title: string;
      metaDescription?: string;
      screenshotDescription: string;
    }
  ): Promise<void> {
    await this.ensureInitialized(userId);

    const documents: IndexedDocument[] = [];

    // Index page description
    if (content.pageDescription && content.pageDescription.trim().length > 0) {
      const embedding = await this.generateEmbedding(content.pageDescription);
      documents.push({
        id: `${analysisId}-pageDescription`,
        analysisId,
        userId,
        url,
        contentType: 'pageDescription',
        content: content.pageDescription,
        timestamp: timestamp.toISOString(),
        vector: Array.from(embedding)
      });
    }

    // Index title
    if (content.title && content.title.trim().length > 0) {
      const embedding = await this.generateEmbedding(content.title);
      documents.push({
        id: `${analysisId}-title`,
        analysisId,
        userId,
        url,
        contentType: 'title',
        content: content.title,
        timestamp: timestamp.toISOString(),
        vector: Array.from(embedding)
      });
    }

    // Index meta description
    if (content.metaDescription && content.metaDescription.trim().length > 0) {
      const embedding = await this.generateEmbedding(content.metaDescription);
      documents.push({
        id: `${analysisId}-metaDescription`,
        analysisId,
        userId,
        url,
        contentType: 'metaDescription',
        content: content.metaDescription,
        timestamp: timestamp.toISOString(),
        vector: Array.from(embedding)
      });
    }

    // Index screenshot description
    if (content.screenshotDescription && content.screenshotDescription.trim().length > 0) {
      const embedding = await this.generateEmbedding(content.screenshotDescription);
      documents.push({
        id: `${analysisId}-screenshotDescription`,
        analysisId,
        userId,
        url,
        contentType: 'screenshotDescription',
        content: content.screenshotDescription,
        timestamp: timestamp.toISOString(),
        vector: Array.from(embedding)
      });
    }

    // Add documents to table
    if (documents.length > 0) {
      // Cast to Record<string, unknown>[] for LanceDB compatibility
      const records = documents as unknown as Record<string, unknown>[];
      
      if (!this.contentTable) {
        // Create table with first batch
        this.contentTable = await this.db.createTable('browsing_content', records);
        console.log(`VectorSearchManager: Created content table with ${documents.length} documents`);
      } else {
        // Add to existing table
        await this.contentTable.add(records);
        console.log(`VectorSearchManager: Indexed ${documents.length} documents for analysis ${analysisId}`);
      }
    }
  }

  /**
   * Search browsing content by semantic similarity
   */
  async searchBrowsingContent(
    userId: string,
    query: string,
    options: {
      limit?: number;
      contentTypes?: Array<'pageDescription' | 'title' | 'metaDescription' | 'screenshotDescription'>;
    } = {}
  ): Promise<SearchResult[]> {
    await this.ensureInitialized(userId);

    if (!this.contentTable) {
      console.log('VectorSearchManager: No content table exists yet');
      return [];
    }

    const limit = options.limit || 20;

    try {
      // Generate query embedding
      const queryEmbedding = await this.generateEmbedding(query);

      // Search vector database
      let searchQuery = this.contentTable
        .search(Array.from(queryEmbedding))
        .limit(limit);

      // Filter by content type if specified
      if (options.contentTypes && options.contentTypes.length > 0) {
        const contentTypeFilter = options.contentTypes
          .map(ct => `contentType = '${ct}'`)
          .join(' OR ');
        searchQuery = searchQuery.filter(contentTypeFilter);
      }

      const results = await searchQuery.execute();

      // Convert to SearchResult format
      return results.map((result: any) => ({
        id: result.id,
        analysisId: result.analysisId,
        url: result.url,
        contentType: result.contentType,
        content: result.content,
        timestamp: new Date(result.timestamp),
        score: result._distance !== undefined ? 1 / (1 + result._distance) : 0 // Convert L2 distance to similarity score
      }));
    } catch (error) {
      console.error('VectorSearchManager: Search failed:', error);
      return [];
    }
  }

  /**
   * Delete all documents associated with an analysis
   * Used when browsing history is cleaned up
   */
  async deleteAnalysisDocuments(userId: string, analysisId: string): Promise<void> {
    await this.ensureInitialized(userId);

    if (!this.contentTable) {
      return;
    }

    try {
      // Delete all documents with this analysisId
      await this.contentTable.delete(`"analysisId" = '${analysisId}'`);
      console.log(`VectorSearchManager: Deleted documents for analysis ${analysisId}`);
    } catch (error) {
      console.error(`VectorSearchManager: Failed to delete documents for analysis ${analysisId}:`, error);
    }
  }

  /**
   * Delete all documents for multiple analyses (batch operation)
   */
  async deleteMultipleAnalyses(userId: string, analysisIds: string[]): Promise<void> {
    await this.ensureInitialized(userId);

    if (!this.contentTable || analysisIds.length === 0) {
      return;
    }

    try {
      // Build filter for multiple IDs
      const filter = analysisIds
        .map(id => `"analysisId" = '${id}'`)
        .join(' OR ');
      
      await this.contentTable.delete(filter);
      console.log(`VectorSearchManager: Deleted documents for ${analysisIds.length} analyses`);
    } catch (error) {
      console.error('VectorSearchManager: Failed to delete multiple analyses:', error);
    }
  }

  /**
   * Get statistics about indexed content
   */
  async getStats(userId: string): Promise<{
    totalDocuments: number;
    byContentType: Record<string, number>;
  }> {
    await this.ensureInitialized(userId);

    if (!this.contentTable) {
      return {
        totalDocuments: 0,
        byContentType: {}
      };
    }

    try {
      const count = await this.contentTable.countRows();
      
      // Get breakdown by content type (this is approximate)
      const byContentType: Record<string, number> = {
        pageDescription: 0,
        title: 0,
        metaDescription: 0,
        screenshotDescription: 0
      };

      // Note: LanceDB doesn't have a native groupBy, so this is a simplified version
      // In production, you might want to maintain these stats separately

      return {
        totalDocuments: count,
        byContentType
      };
    } catch (error) {
      console.error('VectorSearchManager: Failed to get stats:', error);
      return {
        totalDocuments: 0,
        byContentType: {}
      };
    }
  }

  // ============================================================================
  // PRIVATE UTILITIES
  // ============================================================================

  private async ensureInitialized(userId: string): Promise<void> {
    if (!this.isInitialized || this.currentUserId !== userId) {
      await this.initialize(userId);
    }
  }

  private async generateEmbedding(text: string): Promise<Float32Array> {
    if (!this.embedder) {
      throw new Error('Embeddings model not initialized');
    }

    try {
      const output = await this.embedder(text, {
        pooling: 'mean',
        normalize: true
      });
      return output.data;
    } catch (error) {
      console.error('VectorSearchManager: Failed to generate embedding:', error);
      throw error;
    }
  }

  // ============================================================================
  // CHAT HISTORY EMBEDDING
  // ============================================================================

  /**
   * Extract text content from a message, handling multimodal content
   * Filters out images and other non-text content
   */
  private extractTextContent(content: any): string {
    if (typeof content === 'string') {
      return content;
    } else if (Array.isArray(content)) {
      // Extract text from content parts, skip images
      return content
        .filter((part: any) => part.type === 'text')
        .map((part: any) => part.text || '')
        .join(' ');
    } else if (typeof content === 'object' && content !== null) {
      // Try to extract text property
      return content.text || '';
    }
    return '';
  }

  /**
   * Generate a concise summary of a chat session using LLM
   * Handles long conversations by truncating to fit context window
   */
  private async generateChatSummary(messages: Array<{ role: string; content: any }>): Promise<string> {
    try {
      // Initialize LLM for summaries if not done yet
      const { openai } = await import('@ai-sdk/openai');
      const { generateText } = await import('ai');
      
      // Truncate messages to fit context window
      // Prioritize: first message + last N messages
      const MAX_CHARS = 30000; // Leave room for prompt
      const MAX_MESSAGE_CHARS = 1000; // Max chars per message
      
      // Extract text content from messages (filter out images!)
      const textMessages = messages.map(m => ({
        role: m.role,
        text: this.extractTextContent(m.content)
      }));
      
      // Format conversation for summarization
      let conversationText = textMessages
        .map(m => `${m.role}: ${m.text}`)
        .join('\n\n');

      // If too long, truncate intelligently
      if (conversationText.length > MAX_CHARS) {
        console.log(`VectorSearchManager: Conversation too long (${conversationText.length} chars), truncating...`);
        
        // Keep first message and most recent messages
        const firstMsg = textMessages[0];
        let recentMessages = textMessages.slice(-4); // Last 4 messages
        
        // If first message not in recent, add it
        if (!recentMessages.some(m => m === firstMsg)) {
          recentMessages = [firstMsg, ...recentMessages];
        }
        
        conversationText = recentMessages
          .map(m => {
            // Truncate individual messages
            const truncated = m.text.length > MAX_MESSAGE_CHARS 
              ? m.text.substring(0, MAX_MESSAGE_CHARS) + '...' 
              : m.text;
            return `${m.role}: ${truncated}`;
          })
          .join('\n\n');
        
        console.log(`VectorSearchManager: Truncated to ${conversationText.length} chars`);
      }

      const result = await generateText({
        model: openai('gpt-5-nano'),
        prompt: `Provide a concise 2-3 sentence summary of this conversation that captures the main topics discussed and key points:\n\n${conversationText}`
      });

      return result.text;
    } catch (error) {
      console.error('VectorSearchManager: Failed to generate chat summary:', error);
      // Fallback to first user message if summary fails
      const firstUserMsg = messages.find(m => m.role === 'user');
      if (firstUserMsg) {
        const text = this.extractTextContent(firstUserMsg.content);
        return text.substring(0, 200) || 'Chat session';
      }
      return 'Chat session';
    }
  }

  /**
   * Index a complete chat session with embeddings for each message and a summary
   * Should be called when a session is deactivated (user switches away)
   * Only indexes new messages that haven't been indexed yet
   */
  async indexChatSession(
    userId: string,
    sessionId: string,
    messages: Array<{
      id: string;
      role: 'user' | 'assistant' | 'system';
      content: any;
      timestamp: Date;
    }>
  ): Promise<void> {
    console.log(`VectorSearchManager: [ENTRY] indexChatSession called for session ${sessionId} with ${messages.length} messages`);
    await this.ensureInitialized(userId);

    // Filter out system messages and only index user/assistant messages
    const indexableMessages = messages.filter(m => m.role !== 'system');
    
    if (indexableMessages.length === 0) {
      console.log(`VectorSearchManager: No messages to index for session ${sessionId}`);
      return;
    }
    
    console.log(`VectorSearchManager: Session ${sessionId} has ${indexableMessages.length} indexable messages`);

    // Check which messages are already indexed
    let existingMessageIds = new Set<string>();
    let summaryExists = false;
    
    if (this.chatTable) {
      try {
        console.log(`VectorSearchManager: Checking for existing documents for session ${sessionId}...`);
        
        // Query existing documents for this specific session
        // Use countRows first to check if table has any data
        const totalRows = await this.chatTable.countRows();
        console.log(`VectorSearchManager: Table has ${totalRows} total rows`);
        
        if (totalRows === 0) {
          console.log(`VectorSearchManager: Table is empty, no existing documents`);
        } else {
          // Scan all rows and filter in JavaScript (not ideal but more reliable)
          // For small tables this is acceptable
          const allDocs: any[] = [];
          const batchSize = 1000;
          let offset = 0;
          
          while (offset < Math.min(totalRows, 10000)) {  // Max 10k docs to scan
            const batch = await this.chatTable
              .search(Array(384).fill(0))
              .limit(batchSize)
              .execute();
            
            if (!batch || batch.length === 0) break;
            
            // Filter for this session
            const sessionDocs = batch.filter((doc: any) => doc.sessionId === sessionId);
            allDocs.push(...sessionDocs);
            
            offset += batch.length;
            if (batch.length < batchSize) break; // No more docs
          }
          
          const existingDocs = allDocs;
          console.log(`VectorSearchManager: Found ${existingDocs.length} documents for this session (scanned ${offset} total)`);
          
          for (const doc of existingDocs) {
            if (doc.contentType === 'sessionSummary') {
              summaryExists = true;
              console.log(`VectorSearchManager: Found existing summary with id: ${doc.id}`);
            } else if (doc.messageId && typeof doc.messageId === 'string') {
              existingMessageIds.add(doc.messageId);
              console.log(`VectorSearchManager: Found existing message: ${doc.messageId}`);
            }
          }
        }
        
        console.log(`VectorSearchManager: Session ${sessionId} has ${existingMessageIds.size} indexed messages and ${summaryExists ? 'a' : 'no'} summary`);
      } catch (error) {
        console.error('VectorSearchManager: Error checking existing documents:', error);
        console.log('VectorSearchManager: Assuming no existing documents due to error');
        // If error, assume nothing is indexed yet
      }
    } else {
      console.log(`VectorSearchManager: Chat table doesn't exist yet, will create on first insert`);
    }

    const documents: IndexedChatDocument[] = [];
    let newMessagesCount = 0;

    // Index only new messages
    for (const msg of indexableMessages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        // Skip if already indexed
        if (existingMessageIds.has(msg.id)) {
          console.log(`VectorSearchManager: Skipping already indexed message: ${msg.id}`);
          continue;
        }

        // Extract text content from message (handle multimodal content)
        let textContent = '';
        if (typeof msg.content === 'string') {
          textContent = msg.content;
        } else if (Array.isArray(msg.content)) {
          // Extract text from content parts (multimodal messages)
          textContent = msg.content
            .filter((part: any) => part.type === 'text')
            .map((part: any) => part.text)
            .join(' ');
        }

        if (textContent.trim().length === 0) {
          continue; // Skip empty messages
        }

        const embedding = await this.generateEmbedding(textContent);
        documents.push({
          id: `${sessionId}-${msg.id}`,
          sessionId,
          userId,
          contentType: msg.role === 'user' ? 'userMessage' : 'assistantMessage',
          content: textContent,
          messageId: msg.id,
          timestamp: msg.timestamp.toISOString(),
          vector: Array.from(embedding)
        });
        newMessagesCount++;
      }
    }

    // Only generate and index summary if:
    // 1. Summary doesn't exist yet, OR
    // 2. There are new messages to index
    if (!summaryExists || newMessagesCount > 0) {
      try {
        const summary = await this.generateChatSummary(
          indexableMessages.map(m => ({ role: m.role, content: m.content }))
        );
        
        const summaryEmbedding = await this.generateEmbedding(summary);
        
        // If summary exists, we need to delete the old one first
        if (summaryExists && this.chatTable) {
          try {
            console.log(`VectorSearchManager: Attempting to delete old summary with id: ${sessionId}-summary`);
            await this.chatTable.delete(`"id" = '${sessionId}-summary'`);
            console.log(`VectorSearchManager: Successfully deleted old summary for session ${sessionId}`);
          } catch (error) {
            console.error(`VectorSearchManager: FAILED to delete old summary for session ${sessionId}:`, error);
            console.error('VectorSearchManager: This may cause duplicate summaries!');
          }
        }
        
        documents.push({
          id: `${sessionId}-summary`,
          sessionId,
          userId,
          contentType: 'sessionSummary',
          content: summary,
          timestamp: new Date().toISOString(),
          vector: Array.from(summaryEmbedding)
        });

        console.log(`VectorSearchManager: Generated ${summaryExists ? 'updated' : 'new'} summary for session ${sessionId}: "${summary}"`);
      } catch (error) {
        console.error('VectorSearchManager: Failed to generate/index session summary:', error);
      }
    } else {
      console.log(`VectorSearchManager: Summary already exists and no new messages for session ${sessionId}, skipping summary generation`);
    }

    // Add documents to table
    if (documents.length > 0) {
      const records = documents as unknown as Record<string, unknown>[];
      
      if (!this.chatTable) {
        // Create table with first batch
        this.chatTable = await this.db.createTable('chat_history', records);
        console.log(`VectorSearchManager: Created chat table with ${documents.length} documents (${newMessagesCount} messages, ${documents.length - newMessagesCount} summaries)`);
      } else {
        // Add to existing table
        await this.chatTable.add(records);
        console.log(`VectorSearchManager: Indexed ${documents.length} new documents for session ${sessionId} (${newMessagesCount} messages, ${documents.length - newMessagesCount} summaries)`);
      }
    } else {
      console.log(`VectorSearchManager: No new documents to index for session ${sessionId} - all messages already indexed`);
    }
  }

  /**
   * Delete all documents associated with a chat session
   */
  async deleteChatSessionDocuments(userId: string, sessionId: string): Promise<void> {
    await this.ensureInitialized(userId);

    if (!this.chatTable) {
      return;
    }

    try {
      await this.chatTable.delete(`"sessionId" = '${sessionId}'`);
      console.log(`VectorSearchManager: Deleted documents for chat session ${sessionId}`);
    } catch (error) {
      console.error(`VectorSearchManager: Failed to delete documents for session ${sessionId}:`, error);
    }
  }

  /**
   * Delete all documents for multiple chat sessions (batch operation)
   */
  async deleteMultipleChatSessions(userId: string, sessionIds: string[]): Promise<void> {
    await this.ensureInitialized(userId);

    if (!this.chatTable || sessionIds.length === 0) {
      return;
    }

    try {
      const filter = sessionIds
        .map(id => `"sessionId" = '${id}'`)
        .join(' OR ');
      
      await this.chatTable.delete(filter);
      console.log(`VectorSearchManager: Deleted documents for ${sessionIds.length} chat sessions`);
    } catch (error) {
      console.error('VectorSearchManager: Failed to delete multiple chat sessions:', error);
    }
  }

  /**
   * Search chat history by semantic similarity
   */
  async searchChatHistory(
    userId: string,
    query: string,
    options: {
      limit?: number;
      contentTypes?: Array<'userMessage' | 'assistantMessage' | 'sessionSummary'>;
    } = {}
  ): Promise<Array<{
    id: string;
    sessionId: string;
    contentType: string;
    content: string;
    messageId?: string;
    timestamp: Date;
    score: number;
  }>> {
    await this.ensureInitialized(userId);

    if (!this.chatTable) {
      console.log('VectorSearchManager: No chat table exists yet');
      return [];
    }

    const limit = options.limit || 20;

    try {
      // Generate query embedding
      const queryEmbedding = await this.generateEmbedding(query);

      // Search vector database
      let searchQuery = this.chatTable
        .search(Array.from(queryEmbedding))
        .limit(limit);

      // Filter by content type if specified
      if (options.contentTypes && options.contentTypes.length > 0) {
        const contentTypeFilter = options.contentTypes
          .map(ct => `contentType = '${ct}'`)
          .join(' OR ');
        searchQuery = searchQuery.filter(contentTypeFilter);
      }

      const results = await searchQuery.execute();

      // Convert to result format
      return results.map((result: any) => ({
        id: result.id,
        sessionId: result.sessionId,
        contentType: result.contentType,
        content: result.content,
        messageId: result.messageId,
        timestamp: new Date(result.timestamp),
        score: result._distance !== undefined ? 1 / (1 + result._distance) : 0 // Convert L2 distance to similarity score
      }));
    } catch (error) {
      console.error('VectorSearchManager: Chat search failed:', error);
      return [];
    }
  }

  /**
   * Re-index all chat sessions for a user
   * Useful after corruption or database reset
   */
  async reindexAllChatSessions(
    userId: string,
    userDataManager: any
  ): Promise<void> {
    console.log(`VectorSearchManager: Starting full re-index of chat sessions for user ${userId}`);
    await this.ensureInitialized(userId);

    try {
      // Get all chat sessions
      const history = await userDataManager.loadChatHistory(userId);
      const sessions = history.sessions;

      console.log(`VectorSearchManager: Found ${sessions.length} sessions to re-index`);

      for (const session of sessions) {
        if (session.messageCount === 0) continue;

        try {
          console.log(`VectorSearchManager: Re-indexing session ${session.id} (${session.messageCount} messages)`);
          
          // Load session messages
          const messages = await userDataManager.getSessionMessages(userId, session.id);
          
          // Index the session
          await this.indexChatSession(userId, session.id, messages);
        } catch (error) {
          console.error(`VectorSearchManager: Failed to re-index session ${session.id}:`, error);
        }
      }

      console.log(`VectorSearchManager: Completed re-indexing ${sessions.length} chat sessions`);
    } catch (error) {
      console.error('VectorSearchManager: Re-index failed:', error);
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    this.db = null;
    this.embedder = null;
    this.contentTable = null;
    this.chatTable = null;
    this.currentUserId = null;
    this.isInitialized = false;
    console.log('VectorSearchManager: Destroyed');
  }
}

