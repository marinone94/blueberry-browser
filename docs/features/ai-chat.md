# AI Chat Feature

Complete documentation for the AI-powered chat functionality with page context awareness and streaming responses.

## Table of Contents
- [Overview](#overview)
- [Sending a Chat Message](#sending-a-chat-message)
- [Screenshot Integration](#screenshot-integration)
- [Page Content Analysis](#page-content-analysis)
- [Streaming Architecture](#streaming-architecture)

---

## Overview

The AI Chat feature provides an intelligent sidebar interface that allows users to chat with AI about the current page. It automatically captures page screenshots and content to provide context-aware responses.

**Key Features**:
- Real-time streaming responses
- Automatic screenshot and content capture
- Multi-modal AI interaction (text + images)
- Conversation history management
- Support for multiple AI providers (OpenAI, Anthropic)

---

## Sending a Chat Message

**User Action**: Type message in sidebar and press Enter or click send

**Complete Flow**:

1. **Chat Input** (`Chat.tsx`):
   ```typescript
   handleSubmit() → {
     if (value.trim() && !disabled) {
       onSend(value.trim()) // → ChatContext.sendMessage
       setValue('')
       resetTextareaHeight()
     }
   }
   ```

2. **Context Processing** (`ChatContext.tsx`):
   ```typescript
   sendMessage(content) → {
     setIsLoading(true)
     const messageId = Date.now().toString()
     window.sidebarAPI.sendChatMessage({
       message: content,
       messageId: messageId
     })
   }
   ```

3. **Main Process Reception** (`ChatIPCHandler.ts`):
   ```typescript
   ipcMain.handle("ai:send-message", async (_, request) → {
     await mainWindow.sidebar.client.sendChatMessage(request)
   })
   ```

4. **AI Processing** (`LLMClient.ts`):
   ```typescript
   sendChatMessage(request) → {
     // Capture current page context
     screenshot = await activeTab.screenshot()
     pageText = await activeTab.getTabText()
     
     // Build user message with screenshot + text
     userContent = [{type: "image", image: screenshot}, {type: "text", text: request.message}]
     userMessage = {role: "user", content: userContent}
     messages.push(userMessage)
     
     // Send to renderer immediately for UI update
     sendMessagesToRenderer()
     
     // Prepare context and stream AI response
     contextMessages = await prepareMessagesWithContext()
     await streamResponse(contextMessages, messageId)
   }
   ```

5. **Context Building** (`LLMClient.ts`):
   ```typescript
   prepareMessagesWithContext() → {
     systemMessage = {
       role: "system", 
       content: buildSystemPrompt(activeTab.url, pageText)
     }
     return [systemMessage, ...messages] // Full conversation history
   }
   ```

6. **AI Streaming Response** (`LLMClient.ts`):
   ```typescript
   streamResponse(messages, messageId) → {
     result = await streamText({
       model: this.model, // OpenAI or Anthropic
       messages,
     })
     
     // Process stream chunk by chunk
     for await (chunk of result.textStream) {
       accumulatedText += chunk
       messages[assistantIndex].content = accumulatedText
       sendMessagesToRenderer() // Update UI
       
       webContents.send("chat-response", {
         messageId, content: chunk, isComplete: false
       })
     }
     
     // Final completion signal
     webContents.send("chat-response", {
       messageId, content: accumulatedText, isComplete: true
     })
   }
   ```

7. **UI Updates** (`ChatContext.tsx`):
   ```typescript
   // Listen for streaming updates
   handleChatResponse(data) → {
     if (data.isComplete) setIsLoading(false)
   }
   
   // Listen for message array updates
   handleMessagesUpdated(updatedMessages) → {
     convertedMessages = convertFromCoreFormat(updatedMessages)
     setMessages(convertedMessages)
   }
   ```

8. **Chat Rendering** (`Chat.tsx`):
   ```typescript
   // Messages auto-grouped into conversation turns
   ConversationTurnComponent → {
     UserMessage(content) // Right-aligned
     AssistantMessage(content, isStreaming) // Left-aligned with markdown
   }
   ```

**Key Functions Involved**:
- `Chat.handleSubmit()` - UI input capture
- `ChatContext.sendMessage()` - Message coordination
- `LLMClient.sendChatMessage()` - AI orchestration
- `LLMClient.streamResponse()` - Real-time streaming
- `ConversationTurnComponent` - UI rendering

---

## Screenshot Integration

**Automatic Process**: Every chat message includes a screenshot of the current page

**Implementation Details**:
1. `LLMClient` calls `window.activeTab.screenshot()`
2. `Tab.screenshot()` uses `webContentsView.webContents.capturePage()`
3. Image converted to base64 data URL
4. Included as first content item in multimodal message
5. AI can analyze both visual content and text context

**Benefits**:
- Visual understanding of page layout
- Can answer questions about UI elements
- Helps with debugging visual issues
- Provides richer context for AI responses

---

## Page Content Analysis

**Process**: AI has access to current page text content for context-aware responses

**Flow**:
1. `LLMClient` calls `activeTab.getTabText()`
2. `Tab.getTabText()` executes `document.documentElement.innerText` in page context
3. Text truncated to 4000 characters to manage API costs
4. Included in system prompt for AI context

**System Prompt Structure**:
```typescript
buildSystemPrompt(url, pageText) → {
  return `You are an AI assistant helping with web browsing.
  
  Current Page: ${url}
  
  Page Content:
  ${pageText.substring(0, 4000)}
  
  Please help the user with questions about this page or general browsing assistance.`
}
```

**Use Cases**:
- Summarize page content
- Answer questions about specific information on the page
- Extract structured data from the page
- Compare information across pages

---

## Streaming Architecture

### Real-time Response Streaming

The chat system uses server-sent events to stream AI responses in real-time:

**Streaming Flow**:
```
AI SDK streamText() → 
  for each chunk:
    1. Accumulate text
    2. Update in-memory messages
    3. Send chunk to renderer via IPC
    4. Renderer updates UI
  final:
    1. Send completion signal
    2. Set isComplete = true
    3. Clear loading state
```

**Benefits**:
- Immediate feedback to user
- Better perceived performance
- Can interrupt long responses
- Reduced wait time before seeing results

### Message Format

**Core Message Format** (Main Process):
```typescript
interface CoreMessage {
  role: 'user' | 'assistant' | 'system'
  content: string | MultimodalContent[]
}

interface MultimodalContent {
  type: 'text' | 'image'
  text?: string
  image?: string // base64 data URL
}
```

**Frontend Message Format** (Renderer):
```typescript
interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}
```

**Conversion**: ChatContext handles conversion between formats, extracting text content from multimodal messages for display.

---

## AI Provider Configuration

### Supported Providers

**OpenAI** (Default):
```typescript
model: openai('gpt-5-nano')
apiKey: process.env.OPENAI_API_KEY
```

**Anthropic**:
```typescript
model: anthropic('claude-4-sonnet-20250514')
apiKey: process.env.ANTHROPIC_API_KEY
```

### Configuration

Set provider via environment variable:
```bash
LLM_PROVIDER=openai  # or 'anthropic'
OPENAI_API_KEY=your-key
ANTHROPIC_API_KEY=your-key
```

### Error Handling

**Rate Limits**:
```typescript
catch (error) {
  if (error.message.includes('rate limit')) {
    sendErrorMessage('Too many requests. Please wait a moment.')
  }
}
```

**Authentication Errors**:
```typescript
catch (error) {
  if (error.message.includes('API key')) {
    sendErrorMessage('Invalid API key. Please check your configuration.')
  }
}
```

**Network Errors**:
```typescript
catch (error) {
  sendErrorMessage('Failed to connect to AI service. Please check your internet connection.')
}
```

---

## Related Features

- [Chat History](./chat-history.md) - Session management and search
- [Browser Core](./browser-core.md) - Screenshot and content extraction
- [Content Analysis](./content-analysis.md) - AI-powered page analysis
- [User Accounts](./user-accounts.md) - Per-user chat history
- [Vector Search](./vector-search.md) - Semantic search across conversations

