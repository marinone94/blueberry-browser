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
        score: result._distance ? 1 - result._distance : 0 // Convert distance to similarity
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
      await this.contentTable.delete(`analysisId = '${analysisId}'`);
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
        .map(id => `analysisId = '${id}'`)
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
   * Generate a concise summary of a chat session using LLM
   */
  private async generateChatSummary(messages: Array<{ role: string; content: any }>): Promise<string> {
    try {
      // Initialize LLM for summaries if not done yet
      const { openai } = await import('@ai-sdk/openai');
      const { generateText } = await import('ai');
      
      // Format conversation for summarization
      const conversationText = messages
        .map(m => {
          const contentStr = typeof m.content === 'string' 
            ? m.content 
            : JSON.stringify(m.content);
          return `${m.role}: ${contentStr}`;
        })
        .join('\n\n');

      const result = await generateText({
        model: openai('gpt-5-nano'),
        prompt: `Provide a concise 2-3 sentence summary of this conversation that captures the main topics discussed and key points:\n\n${conversationText}`
      });

      return result.text;
    } catch (error) {
      console.error('VectorSearchManager: Failed to generate chat summary:', error);
      // Fallback to first user message if summary fails
      const firstUserMsg = messages.find(m => m.role === 'user');
      if (firstUserMsg && typeof firstUserMsg.content === 'string') {
        return firstUserMsg.content.substring(0, 200);
      }
      return 'Chat session';
    }
  }

  /**
   * Index a complete chat session with embeddings for each message and a summary
   * Should be called when a session is deactivated (user switches away)
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
    await this.ensureInitialized(userId);

    // Filter out system messages and only index user/assistant messages
    const indexableMessages = messages.filter(m => m.role !== 'system');
    
    if (indexableMessages.length === 0) {
      console.log(`VectorSearchManager: No messages to index for session ${sessionId}`);
      return;
    }

    const documents: IndexedChatDocument[] = [];

    // Index each user message
    for (const msg of indexableMessages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
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
      }
    }

    // Generate and index session summary
    try {
      const summary = await this.generateChatSummary(
        indexableMessages.map(m => ({ role: m.role, content: m.content }))
      );
      
      const summaryEmbedding = await this.generateEmbedding(summary);
      documents.push({
        id: `${sessionId}-summary`,
        sessionId,
        userId,
        contentType: 'sessionSummary',
        content: summary,
        timestamp: new Date().toISOString(),
        vector: Array.from(summaryEmbedding)
      });

      console.log(`VectorSearchManager: Generated summary for session ${sessionId}: "${summary}"`);
    } catch (error) {
      console.error('VectorSearchManager: Failed to generate/index session summary:', error);
    }

    // Add documents to table
    if (documents.length > 0) {
      const records = documents as unknown as Record<string, unknown>[];
      
      if (!this.chatTable) {
        // Create table with first batch
        this.chatTable = await this.db.createTable('chat_history', records);
        console.log(`VectorSearchManager: Created chat table with ${documents.length} documents`);
      } else {
        // Add to existing table
        await this.chatTable.add(records);
        console.log(`VectorSearchManager: Indexed ${documents.length} documents for chat session ${sessionId}`);
      }
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
      await this.chatTable.delete(`sessionId = '${sessionId}'`);
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
        .map(id => `sessionId = '${id}'`)
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
        score: result._distance ? 1 - result._distance : 0
      }));
    } catch (error) {
      console.error('VectorSearchManager: Chat search failed:', error);
      return [];
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

