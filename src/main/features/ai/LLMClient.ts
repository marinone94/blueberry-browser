import { WebContents } from "electron";
import { streamText, type LanguageModel, type CoreMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import * as dotenv from "dotenv";
import { join } from "path";
import type { Window } from "../../Window";
import type { UserAccountManager } from "../users/UserAccountManager";
import type { StreamingMetrics } from "./storage";

// Load environment variables from .env file
dotenv.config({ path: join(__dirname, "../../.env") });

interface ChatRequest {
  message: string;
  messageId: string;
}

interface StreamChunk {
  content: string;
  isComplete: boolean;
}

type LLMProvider = "openai" | "anthropic";

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  openai: "gpt-5-mini",
  anthropic: "claude-sonnet-4-5-20250929",
};

const MAX_CONTEXT_LENGTH = 4000;

// Helper functions for calculating statistics
function calculateMean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

function calculateMedian(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function calculateStdDev(arr: number[], mean: number): number {
  if (arr.length === 0) return 0;
  const squaredDiffs = arr.map(val => Math.pow(val - mean, 2));
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / arr.length;
  return Math.sqrt(variance);
}

export class LLMClient {
  private readonly webContents: WebContents;
  private window: Window | null = null;
  private userAccountManager: UserAccountManager | null = null;
  private readonly provider: LLMProvider;
  private readonly modelName: string;
  private readonly model: LanguageModel | null;
  private messages: CoreMessage[] = [];
  private currentUserId: string | null = null;
  private currentSessionId: string | null = null;

  constructor(webContents: WebContents) {
    this.webContents = webContents;
    this.provider = this.getProvider();
    this.modelName = this.getModelName();
    this.model = this.initializeModel();

    this.logInitializationStatus();
  }

  // Set the window reference after construction to avoid circular dependencies
  setWindow(window: Window): void {
    this.window = window;
  }

  // Set the user account manager reference
  setUserAccountManager(userAccountManager: UserAccountManager): void {
    this.userAccountManager = userAccountManager;
    this.loadCurrentUserMessages();
  }

  /**
   * Load messages for current user
   */
  private async loadCurrentUserMessages(): Promise<void> {
    if (!this.userAccountManager || !this.window) return;

    const currentUser = this.userAccountManager.getCurrentUser();
    if (!currentUser) return;

    // No need to save when switching users - messages are automatically saved to enhanced history

    // Load messages for new user from enhanced chat history
    this.currentUserId = currentUser.id;
    try {
      // Load current session ID
      this.currentSessionId = await this.window.chatStorage.getCurrentSessionId(currentUser.id);
      
      // Load messages from enhanced chat history
      if (this.currentSessionId) {
        const sessionMessages = await this.window.chatStorage.getSessionMessages(currentUser.id, this.currentSessionId);
        this.messages = sessionMessages.map(msg => {
          const coreMessage: any = {
            role: msg.role,
            content: msg.content
          };
          return coreMessage;
        });
      } else {
        this.messages = [];
      }
      
      this.sendMessagesToRenderer();
      console.log(`Loaded ${this.messages.length} messages for user: ${currentUser.name}`);
    } catch (error) {
      console.error("Failed to load user messages:", error);
      this.messages = [];
      this.currentSessionId = null;
    }
  }


  /**
   * Handle user switching - called when user account changes
   */
  async handleUserSwitch(): Promise<void> {
    await this.loadCurrentUserMessages();
  }

  /**
   * Ensure we have a current session for enhanced chat history
   */
  private async ensureCurrentSession(): Promise<void> {
    if (!this.currentUserId || !this.window) return;
    
    // If we don't have a current session, create one
    if (!this.currentSessionId) {
      const contextUrl = this.window.activeTab?.url;
      this.currentSessionId = await this.window.chatStorage.createChatSession(
        this.currentUserId,
        contextUrl
      );
    }
  }

  private getProvider(): LLMProvider {
    const provider = process.env.LLM_PROVIDER?.toLowerCase();
    if (provider === "anthropic") return "anthropic";
    return "openai"; // Default to OpenAI
  }

  private getModelName(): string {
    return process.env.LLM_MODEL || DEFAULT_MODELS[this.provider];
  }

  private initializeModel(): LanguageModel | null {
    const apiKey = this.getApiKey();
    if (!apiKey) return null;

    switch (this.provider) {
      case "anthropic":
        return anthropic(this.modelName);
      case "openai":
        return openai(this.modelName);
      default:
        return null;
    }
  }

  private getApiKey(): string | undefined {
    switch (this.provider) {
      case "anthropic":
        return process.env.ANTHROPIC_API_KEY;
      case "openai":
        return process.env.OPENAI_API_KEY;
      default:
        return undefined;
    }
  }

  private logInitializationStatus(): void {
    if (this.model) {
      console.log(
        `✅ LLM Client initialized with ${this.provider} provider using model: ${this.modelName}`
      );
    } else {
      const keyName =
        this.provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
      console.error(
        `❌ LLM Client initialization failed: ${keyName} not found in environment variables.\n` +
          `Please add your API key to the .env file in the project root.`
      );
    }
  }

  async sendChatMessage(request: ChatRequest): Promise<void> {
    try {
      // Ensure we have a current session
      await this.ensureCurrentSession();
      
      const startTime = Date.now();
      
      // Get context from active tab
      let contextUrl: string | null = null;
      let contextTitle: string | null = null;
      let screenshot: string | null = null;
      
      if (this.window) {
        const activeTab = this.window.activeTab;
        if (activeTab) {
          contextUrl = activeTab.url;
          contextTitle = activeTab.title;
          
          try {
            const image = await activeTab.screenshot();
            screenshot = image.toDataURL();
          } catch (error) {
            console.error("Failed to capture screenshot:", error);
          }
        }
      }

      // Build user message content with screenshot first, then text
      const userContent: any[] = [];
      
      // Add screenshot as the first part if available
      if (screenshot) {
        userContent.push({
          type: "image",
          image: screenshot,
        });
      }
      
      // Add text content
      userContent.push({
        type: "text",
        text: request.message,
      });

      // Create user message in CoreMessage format
      const userMessage: CoreMessage = {
        role: "user",
        content: userContent.length === 1 ? request.message : userContent,
      };
      
      this.messages.push(userMessage);

      // Save user message to chat history
      if (this.currentUserId && this.currentSessionId) {
        await this.window?.chatStorage.addChatMessage(
          this.currentUserId,
          userMessage,
          this.currentSessionId,
          contextUrl || undefined,
          contextTitle || undefined
        );
      }

      // Send updated messages to renderer
      this.sendMessagesToRenderer();

      if (!this.model) {
        this.sendErrorMessage(
          request.messageId,
          "LLM service is not configured. Please add your API key to the .env file."
        );
        return;
      }

      const messages = await this.prepareMessagesWithContext(request);
      await this.streamResponse(messages, request.messageId, startTime, contextUrl, contextTitle);
    } catch (error) {
      console.error("Error in LLM request:", error);
      this.handleStreamError(error, request.messageId);
    }
  }

  async clearMessages(): Promise<void> {
    this.messages = [];
    this.sendMessagesToRenderer();
    
    // Don't clear the entire chat history, just reset current session
    // The user can start a new session if they want
    this.currentSessionId = null;
  }

  getMessages(): CoreMessage[] {
    return this.messages;
  }

  async setCurrentSessionId(sessionId: string): Promise<void> {
    // If we're switching away from a session, index it asynchronously (don't block UI)
    if (this.currentSessionId && this.currentSessionId !== sessionId && this.currentUserId && this.window) {
      // Fire and forget - don't await to avoid blocking UI
      this.indexCurrentSession().catch(error => {
        console.error('LLMClient: Background indexing failed:', error);
      });
    }
    
    this.currentSessionId = sessionId;
  }

  /**
   * Index the current session's messages for semantic search
   */
  private async indexCurrentSession(): Promise<void> {
    if (!this.currentSessionId || !this.currentUserId || !this.window) {
      return;
    }

    try {
      // Load session messages with full metadata
      const sessionMessages = await this.window.chatStorage.getSessionMessages(
        this.currentUserId,
        this.currentSessionId
      );

      // Only index if there are messages
      if (sessionMessages.length > 0) {
        console.log(`LLMClient: Indexing ${sessionMessages.length} messages from session ${this.currentSessionId}`);
        
        await this.window.vectorSearchManager.indexChatSession(
          this.currentUserId,
          this.currentSessionId,
          sessionMessages
        );
        
        console.log(`LLMClient: Successfully indexed session ${this.currentSessionId}`);
      }
    } catch (error) {
      console.error(`LLMClient: Failed to index session ${this.currentSessionId}:`, error);
    }
  }

  setMessages(messages: CoreMessage[]): void {
    this.messages = messages;
    this.sendMessagesToRenderer();
  }

  private sendMessagesToRenderer(): void {
    this.webContents.send("chat-messages-updated", this.messages);
  }

  private async prepareMessagesWithContext(_request: ChatRequest): Promise<CoreMessage[]> {
    // Get page context from active tab
    let pageUrl: string | null = null;
    let pageText: string | null = null;
    
    if (this.window) {
      const activeTab = this.window.activeTab;
      if (activeTab) {
        pageUrl = activeTab.url;
        try {
          pageText = await activeTab.getTabText();
        } catch (error) {
          console.error("Failed to get page text:", error);
        }
      }
    }

    // Build system message
    const systemMessage: CoreMessage = {
      role: "system",
      content: this.buildSystemPrompt(pageUrl, pageText),
    };

    // Include all messages in history (system + conversation)
    return [systemMessage, ...this.messages];
  }

  private buildSystemPrompt(url: string | null, pageText: string | null): string {
    const parts: string[] = [
      "You are a helpful AI assistant integrated into a web browser.",
      "You can analyze and discuss web pages with the user.",
      "The user's messages may include screenshots of the current page as the first image.",
    ];

    if (url) {
      parts.push(`\nCurrent page URL: ${url}`);
    }

    if (pageText) {
      const truncatedText = this.truncateText(pageText, MAX_CONTEXT_LENGTH);
      parts.push(`\nPage content (text):\n${truncatedText}`);
    }

    parts.push(
      "\nPlease provide helpful, accurate, and contextual responses about the current webpage.",
      "If the user asks about specific content, refer to the page content and/or screenshot provided."
    );

    return parts.join("\n");
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  }

  private async streamResponse(
    messages: CoreMessage[],
    messageId: string,
    startTime?: number,
    contextUrl?: string | null,
    contextTitle?: string | null
  ): Promise<void> {
    if (!this.model) {
      throw new Error("Model not initialized");
    }

    try {
      const result = await streamText({
        model: this.model,
        messages,
        maxRetries: 3,
        abortSignal: undefined, // Could add abort controller for cancellation
      });

      await this.processStream(result.textStream, messageId, startTime, contextUrl, contextTitle);
    } catch (error) {
      throw error; // Re-throw to be handled by the caller
    }
  }

  private async processStream(
    textStream: AsyncIterable<string>,
    messageId: string,
    startTime?: number,
    contextUrl?: string | null,
    contextTitle?: string | null
  ): Promise<void> {
    let accumulatedText = "";
    
    // Streaming performance tracking
    const streamStartTime = Date.now();
    let timeToFirstToken: number | null = null;
    const timeToOtherToken: number[] = [];
    let lastTokenTime = streamStartTime;
    let tokenCount = 0;

    // Create a placeholder assistant message
    const assistantMessage: CoreMessage = {
      role: "assistant",
      content: "",
    };
    
    // Keep track of the index for updates
    const messageIndex = this.messages.length;
    this.messages.push(assistantMessage);

    for await (const chunk of textStream) {
      const currentTime = Date.now();
      
      // Track time to first token
      if (timeToFirstToken === null) {
        timeToFirstToken = currentTime - streamStartTime;
      } else {
        // Track time between tokens
        timeToOtherToken.push(currentTime - lastTokenTime);
      }
      
      lastTokenTime = currentTime;
      tokenCount++;
      accumulatedText += chunk;

      // Update assistant message content
      this.messages[messageIndex] = {
        role: "assistant",
        content: accumulatedText,
      };
      this.sendMessagesToRenderer();

      this.sendStreamChunk(messageId, {
        content: chunk,
        isComplete: false,
      });
    }

    // Calculate response time
    const responseTime = startTime ? Date.now() - startTime : undefined;

    // Calculate streaming metrics
    let streamingMetrics: StreamingMetrics | undefined;
    if (timeToFirstToken !== null && timeToOtherToken.length > 0) {
      const meanTokenTime = calculateMean(timeToOtherToken);
      const medianTokenTime = calculateMedian(timeToOtherToken);
      const stdDevTokenTime = calculateStdDev(timeToOtherToken, meanTokenTime);
      
      streamingMetrics = {
        modelName: this.modelName,
        timeToFirstToken,
        timeToOtherToken,
        meanTokenTime,
        medianTokenTime,
        stdDevTokenTime,
        totalTokens: tokenCount
      };
    }

    // Final update with complete content
    this.messages[messageIndex] = {
      role: "assistant",
      content: accumulatedText,
    };
    this.sendMessagesToRenderer();

    // Save assistant message to chat history with streaming metrics
    if (this.currentUserId && this.currentSessionId) {
      await this.window?.chatStorage.addChatMessage(
        this.currentUserId,
        this.messages[messageIndex],
        this.currentSessionId,
        contextUrl || undefined,
        contextTitle || undefined,
        responseTime,
        streamingMetrics
      );
    }

    // Send the final complete signal
    this.sendStreamChunk(messageId, {
      content: accumulatedText,
      isComplete: true,
    });
  }

  private handleStreamError(error: unknown, messageId: string): void {
    console.error("Error streaming from LLM:", error);

    const errorMessage = this.getErrorMessage(error);
    this.sendErrorMessage(messageId, errorMessage);
  }

  private getErrorMessage(error: unknown): string {
    if (!(error instanceof Error)) {
      return "An unexpected error occurred. Please try again.";
    }

    const message = error.message.toLowerCase();

    if (message.includes("401") || message.includes("unauthorized")) {
      return "Authentication error: Please check your API key in the .env file.";
    }

    if (message.includes("429") || message.includes("rate limit")) {
      return "Rate limit exceeded. Please try again in a few moments.";
    }

    if (
      message.includes("network") ||
      message.includes("fetch") ||
      message.includes("econnrefused")
    ) {
      return "Network error: Please check your internet connection.";
    }

    if (message.includes("timeout")) {
      return "Request timeout: The service took too long to respond. Please try again.";
    }

    return "Sorry, I encountered an error while processing your request. Please try again.";
  }

  private sendErrorMessage(messageId: string, errorMessage: string): void {
    this.sendStreamChunk(messageId, {
      content: errorMessage,
      isComplete: true,
    });
  }

  private sendStreamChunk(messageId: string, chunk: StreamChunk): void {
    this.webContents.send("chat-response", {
      messageId,
      content: chunk.content,
      isComplete: chunk.isComplete,
    });
  }
}
