# Features & Code Flows

This document traces the complete code execution paths for each major feature in Blueberry Browser, showing how different components interact to deliver functionality.

---

## Core Browser Functionality

### Tab Management

#### Creating a New Tab

**User Action**: Click "+" button in tab bar

**Complete Flow**:

1. **UI Interaction** (`TabBar.tsx`):
   ```typescript
   handleCreateTab() → createTab('https://www.google.com')
   ```

2. **Context Layer** (`BrowserContext.tsx`):
   ```typescript
   createTab(url) → setIsLoading(true) → window.topBarAPI.createTab(url)
   ```

3. **Preload Bridge** (`topbar.ts`):
   ```typescript
   electronAPI.ipcRenderer.invoke("create-tab", url)
   ```

4. **Main Process IPC** (`EventManager.ts`):
   ```typescript
   ipcMain.handle("create-tab") → mainWindow.createTab(url)
   ```

5. **Window Management** (`Window.ts`):
   ```typescript
   createTab(url) → {
     const tabId = `tab-${++tabCounter}`
     const tab = new Tab(tabId, url)
     baseWindow.contentView.addChildView(tab.view)
     tab.view.setBounds({ x: 0, y: 88, width: bounds.width - 400, height: bounds.height - 88 })
     tabsMap.set(tabId, tab)
     if (first tab) switchActiveTab(tabId)
     return tab
   }
   ```

6. **Tab Initialization** (`Tab.ts`):
   ```typescript
   new Tab(id, url) → {
     webContentsView = new WebContentsView({
       webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
     })
     setupEventListeners() // title/URL tracking
     loadURL(url)
   }
   ```

7. **Response Chain**:
   ```
   Tab instance → Window.createTab returns tab info → EventManager returns to IPC → 
   Preload script returns promise → BrowserContext updates state → 
   refreshTabs() → UI updates with new tab
   ```

**Key Functions Involved**:
- `TabBar.handleCreateTab()` - UI trigger
- `BrowserContext.createTab()` - State management
- `EventManager.handleTabEvents()` - IPC routing
- `Window.createTab()` - Tab lifecycle management
- `Tab constructor` - Web content setup

#### Closing a Tab

**User Action**: Click "×" button on tab

**Complete Flow**:

1. **UI Event** (`TabBar.tsx`):
   ```typescript
   onClose={() => closeTab(tab.id)} → stopPropagation → closeTab(tabId)
   ```

2. **Context & IPC Chain**:
   ```
   BrowserContext.closeTab() → topBarAPI.closeTab() → EventManager → Window.closeTab()
   ```

3. **Tab Cleanup** (`Window.ts`):
   ```typescript
   closeTab(tabId) → {
     const tab = tabsMap.get(tabId)
     baseWindow.contentView.removeChildView(tab.view)
     tab.destroy() // WebContents cleanup
     tabsMap.delete(tabId)
     if (active tab) switch to remaining tab
     if (no tabs left) close window
   }
   ```

4. **Active Tab Switching Logic**:
   - If closed tab was active → automatically switch to first remaining tab
   - If no tabs remain → trigger window close
   - Update window title to match new active tab

#### Tab Switching

**User Action**: Click on inactive tab

**Complete Flow**:

1. **TabItem Click** (`TabBar.tsx`):
   ```typescript
   onClick={() => !isActive && onActivate()} → switchTab(tab.id)
   ```

2. **Tab Visibility Management** (`Window.ts`):
   ```typescript
   switchActiveTab(tabId) → {
     if (currentActiveTab) currentTab.hide() // setVisible(false)
     newTab.show() // setVisible(true)
     activeTabId = tabId
     baseWindow.setTitle(newTab.title)
   }
   ```

**Performance**: Uses visibility toggling rather than DOM manipulation for instant switching

### Navigation System

#### URL Navigation

**User Action**: Type URL in address bar and press Enter

**Complete Flow**:

1. **Address Bar Input** (`AddressBar.tsx`):
   ```typescript
   handleSubmit(e) → {
     e.preventDefault()
     finalUrl = processUrl(url) // Add https:// or convert to search
     navigateToUrl(finalUrl)
   }
   ```

2. **URL Processing Logic**:
   ```typescript
   processUrl(input) → {
     if (!starts with http) {
       if (contains '.' && no spaces) return `https://${input}`
       else return `https://google.com/search?q=${encodeURIComponent(input)}`
     }
   }
   ```

3. **Tab Navigation** (`BrowserContext.tsx`):
   ```typescript
   navigateToUrl(url) → {
     if (!activeTab) return
     setIsLoading(true)
     window.topBarAPI.navigateTab(activeTab.id, url)
     setTimeout(() => refreshTabs(), 500) // Allow navigation to start
   }
   ```

4. **Tab URL Loading** (`Tab.ts`):
   ```typescript
   loadURL(url) → {
     this._url = url
     return webContentsView.webContents.loadURL(url)
   }
   ```

5. **Automatic Updates**:
   - `did-navigate` events update tab URL and title
   - BrowserContext polls every 2 seconds to sync UI state
   - Address bar displays updated URL when navigation completes

#### Back/Forward Navigation

**User Action**: Click back/forward buttons

**Complete Flow**:

1. **Button Click** (`AddressBar.tsx`):
   ```typescript
   <ToolBarButton Icon={ArrowLeft} onClick={goBack} active={canGoBack} />
   ```

2. **Navigation History** (`Tab.ts`):
   ```typescript
   goBack() → {
     if (webContentsView.webContents.navigationHistory.canGoBack()) {
       webContentsView.webContents.navigationHistory.goBack()
     }
   }
   ```

3. **State Synchronization**:
   - Navigation events trigger URL/title updates
   - BrowserContext refreshTabs() syncs UI state
   - Button states update based on `canGoBack()`/`canGoForward()`

#### Page Reload

**User Action**: Click reload button

**Flow**: Similar pattern with `webContentsView.webContents.reload()` or `reloadIgnoringCache()` for force reload

---

## AI Chat Functionality

### Sending a Chat Message

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

3. **Main Process Reception** (`EventManager.ts`):
   ```typescript
   ipcMain.handle("sidebar-chat-message", async (_, request) → {
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
       temperature: 0.7
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

### Screenshot Integration

**Automatic Process**: Every chat message includes a screenshot of the current page

**Implementation Details**:
1. `LLMClient` calls `window.activeTab.screenshot()`
2. `Tab.screenshot()` uses `webContentsView.webContents.capturePage()`
3. Image converted to base64 data URL
4. Included as first content item in multimodal message
5. AI can analyze both visual content and text context

### Page Content Analysis

**Process**: AI has access to current page text content for context-aware responses

**Flow**:
1. `LLMClient` calls `activeTab.getTabText()`
2. `Tab.getTabText()` executes `document.documentElement.innerText` in page context
3. Text truncated to 4000 characters to manage API costs
4. Included in system prompt for AI context

---

## User Interface Features

### Dark Mode Synchronization

**User Action**: Click dark mode toggle in address bar

**Cross-Process Synchronization Flow**:

1. **Toggle Button** (`DarkModeToggle.tsx`):
   ```typescript
   onClick={toggleDarkMode} // from useDarkMode hook
   ```

2. **Dark Mode Hook** (`useDarkMode.ts`):
   ```typescript
   toggleDarkMode() → {
     setIsDarkMode(!isDarkMode)
     // useEffect automatically triggers
   }
   
   useEffect(() => {
     // Update DOM
     document.documentElement.classList.toggle("dark", isDarkMode)
     
     // Persist preference
     localStorage.setItem("darkMode", JSON.stringify(isDarkMode))
     
     // Broadcast to main process
     window.electron.ipcRenderer.send("dark-mode-changed", isDarkMode)
   }, [isDarkMode])
   ```

3. **Main Process Broadcasting** (`EventManager.ts`):
   ```typescript
   ipcMain.on("dark-mode-changed", (event, isDarkMode) => {
     broadcastDarkMode(event.sender, isDarkMode)
   })
   
   broadcastDarkMode(sender, isDarkMode) → {
     // Send to topbar if sender was sidebar
     if (topBarWebContents !== sender) {
       topBarWebContents.send("dark-mode-updated", isDarkMode)
     }
     
     // Send to sidebar if sender was topbar  
     if (sidebarWebContents !== sender) {
       sidebarWebContents.send("dark-mode-updated", isDarkMode)
     }
     
     // Send to all tabs
     allTabs.forEach(tab => {
       if (tab.webContents !== sender) {
         tab.webContents.send("dark-mode-updated", isDarkMode)
       }
     })
   }
   ```

4. **Other Process Updates** (`useDarkMode.ts`):
   ```typescript
   useEffect(() => {
     const handleDarkModeUpdate = (_, newDarkMode) => {
       setIsDarkMode(newDarkMode) // Triggers DOM update
     }
     
     window.electron.ipcRenderer.on("dark-mode-updated", handleDarkModeUpdate)
     
     return () => {
       window.electron.ipcRenderer.removeListener("dark-mode-updated", handleDarkModeUpdate)
     }
   }, [])
   ```

**Result**: All processes (topbar, sidebar, any tabs) instantly synchronize to the same dark/light mode

### Sidebar Toggle

**User Action**: Click sidebar toggle button (or press Cmd+E)

**Complete Flow**:

1. **Multiple Triggers**:
   - **Button**: `AddressBar.tsx` → `toggleSidebar()`
   - **Menu**: `Menu.ts` → `handleToggleSidebar()`

2. **IPC Communication**:
   ```typescript
   window.topBarAPI.toggleSidebar() → EventManager → mainWindow.sidebar.toggle()
   ```

3. **Sidebar State Change** (`SideBar.ts`):
   ```typescript
   toggle() → {
     if (isVisible) hide() else show()
   }
   
   hide() → {
     isVisible = false
     webContentsView.setBounds({ x: 0, y: 0, width: 0, height: 0 })
   }
   
   show() → {
     isVisible = true
     setupBounds() // 400px width on right side
   }
   ```

4. **Layout Recalculation** (`Window.ts`):
   ```typescript
   updateAllBounds() → {
     updateTabBounds() // Adjust tab width based on sidebar visibility
     sidebar.updateBounds() // Update sidebar positioning
   }
   ```

5. **UI State Sync**:
   - Button icon changes: `PanelLeft` ↔ `PanelLeftClose`
   - Tab content automatically reflows to available space
   - No content lost or reloaded during toggle

---

## User Account Management

### User Account Creation

**User Action**: Create new user account with name, email (optional), birthday (optional)

**Complete Flow**:

1. **UI Interaction**: User fills account creation form
2. **Validation**: Name uniqueness and email format validation  
3. **IPC Call**: `topBarAPI.createUser(userData)`
4. **UserAccountManager**: Creates user with UUID and session partition
5. **Data Persistence**: User saved to `accounts.json`
6. **Response**: Success/error returned to UI

**Key Functions Involved**:
- `UserAccountManager.createUser()` - Core user creation logic
- `UserAccountManager.validateUserName()` - Name uniqueness check
- `UserDataManager.ensureUserDataDir()` - Create user data directory

### User Switching with Tab Management

**User Action**: Switch to different user account

**Complete Flow**:

1. **UI Interaction**: User selects different account from switcher
2. **Tab Management Decision**: Keep current tabs or load user's saved tabs
3. **IPC Call**: `topBarAPI.switchUser(userId, {keepCurrentTabs: boolean})`

4. **UserAccountManager.switchUser()**:
   ```typescript
   if (options.keepCurrentTabs) {
     // Save current tabs to new user
     await saveCurrentUserTabs(currentTabs)
   }
   switchUser(userId) // Change current user
   ```

5. **Window.switchUser()**:
   ```typescript
   if (options.keepCurrentTabs) {
     // Reload all tabs with new session partition
     await reloadAllTabsWithNewSession()
   } else {
     // Close current tabs, load user's saved tabs
     await closeAllTabs()
     loadUserTabs(switchResult.tabsToLoad)
   }
   ```

6. **LLMClient.handleUserSwitch()**:
   ```typescript
   // Save current user's chat history
   await saveMessagesForUser(previousUserId)
   // Load new user's chat history  
   messages = await loadChatHistory(newUserId)
   ```

7. **EventManager.broadcastUserChange()**: Notify all renderers of user change

**Key Functions Involved**:
- `UserAccountManager.switchUser()` - Core switching logic
- `Window.switchUser()` - Tab management during switch
- `Window.reloadAllTabsWithNewSession()` - Session partition update
- `LLMClient.handleUserSwitch()` - Chat history switching
- `EventManager.broadcastUserChange()` - UI synchronization

### Guest User Management

**Purpose**: Provide incognito-like browsing experience

**Guest User Characteristics**:
- Always available and fresh on startup
- No data persistence between sessions
- Session partition: `persist:guest`
- Cannot be deleted
- Data cleared on every app restart

**Implementation** (`UserAccountManager`):
```typescript
private static readonly GUEST_USER: UserAccount = {
  id: 'guest',
  name: 'Guest User', 
  email: '',
  isGuest: true,
  sessionPartition: 'persist:guest'
}

async setupGuestUser() {
  // Always clear guest data for fresh start
  await userDataManager.clearUserData('guest')
  // Create fresh guest user
  users.set('guest', { ...GUEST_USER, createdAt: new Date() })
}
```

### Session Isolation

**Purpose**: Complete privacy between users

**Implementation**: Each user gets unique Electron session partition
```typescript
// Tab.ts constructor
new WebContentsView({
  webPreferences: {
    partition: sessionPartition // e.g., "persist:user-123"
  }
})
```

**Isolation Includes**:
- Cookies and localStorage
- Cache and IndexedDB  
- Service Workers
- Network requests/responses
- Extensions (if any)

---

## Browsing History Management

### Per-User History Tracking

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

3. **History Storage** (`UserDataManager.ts`):
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

### History UI Features

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

3. **Smart Navigation** (`EventManager.ts`):
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

### User Switching Integration

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

### Search and Management

**Search Features**:
- Real-time search by title or URL
- Results sorted by recency
- Debounced for performance (300ms)
- Clear search to return to full history

**Management Actions**:
- **Individual Removal**: X button on hover
- **Bulk Clear**: Confirmation dialog with 3-second timeout
- **Manual Refresh**: Force reload history data
- **Smart Navigation**: Reuse existing tabs when possible

**Key Functions Involved**:
- `Tab.recordHistoryEntry()` - Capture navigation events
- `UserDataManager.addHistoryEntry()` - Store with deduplication
- `HistoryContext.refreshHistory()` - Load and sort for UI
- `History.tsx` - Complete UI with search and management
- `EventManager.navigate-from-history` - Smart tab navigation

---

## Enhanced Chat History System

### Overview

Blueberry Browser implements a sophisticated chat history system that organizes AI conversations into persistent sessions with comprehensive metadata tracking. This enables users to manage multiple conversation threads, track context, and analyze chat performance over time.

### Chat Session Architecture

**Purpose**: Organize conversations into separate sessions with full context preservation and metadata tracking

**Key Features**:
- **Session-based Organization**: Each conversation is a distinct session with unique ID
- **Comprehensive Metadata**: Tracks timestamps, URLs, response times, and message counts
- **User Isolation**: Complete chat history separation between user accounts
- **Persistent Storage**: All sessions and messages saved to disk automatically
- **Smart Session Management**: Create, switch, and clear sessions with ease

### Chat History Data Structure

#### ChatSession Interface
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

#### ChatMessage Interface
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

#### ChatHistory Interface
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

### Complete Flow: Chat History Management

#### Creating a New Session

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

3. **IPC Communication** (`EventManager.ts`):
   ```typescript
   ipcMain.handle("create-chat-session", async (_, contextUrl?, title?) → {
     const currentUser = userAccountManager.getCurrentUser()
     return await userDataManager.createChatSession(currentUser.id, contextUrl, title)
   })
   ```

4. **Session Creation** (`UserDataManager.ts`):
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

#### Sending a Message with History Tracking

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

4. **Message Persistence** (`UserDataManager.ts`):
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

#### Switching Between Sessions

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

3. **IPC Handler** (`EventManager.ts`):
   ```typescript
   ipcMain.handle("switch-to-session", async (_, sessionId) → {
     const currentUser = userAccountManager.getCurrentUser()
     await userDataManager.setCurrentSessionId(currentUser.id, sessionId)
     await sidebar.client.loadCurrentUserMessages()
     return true
   })
   ```

4. **Session Activation** (`UserDataManager.ts`):
   ```typescript
   setCurrentSessionId(userId, sessionId) → {
     const history = await loadChatHistory(userId)
     history.currentSessionId = sessionId
     history.updatedAt = new Date()
     
     // Update lastActiveAt for analytics
     const session = history.sessions.find(s => s.id === sessionId)
     if (session) {
       session.lastActiveAt = new Date()
     }
     
     await saveChatHistory(userId, history)
   }
   ```

5. **Message Loading** (`LLMClient.ts`):
   ```typescript
   loadCurrentUserMessages() → {
     this.currentSessionId = await userDataManager.getCurrentSessionId(userId)
     
     if (this.currentSessionId) {
       const sessionMessages = await userDataManager.getSessionMessages(userId, sessionId)
       this.messages = sessionMessages.map(convertToCoreFormat)
     } else {
       this.messages = []
     }
     
     sendMessagesToRenderer()
   }
   ```

### Chat History UI Features

#### Chat History View (`ChatHistory.tsx`)

**Purpose**: Comprehensive interface for managing conversation sessions

**UI Components**:

1. **Header Section**:
   - Back button to return to chat
   - Session count display
   - "New Chat" button

2. **Sessions List**:
   - **Visual Indicators**:
     - "Current" badge for active session
     - Border highlight for current session
     - Hover effects for interactivity
   
   - **Session Information**:
     - Session title (prominent)
     - Last active timestamp with smart formatting
     - Message count
     - Average response time
     - Context URLs (up to 2 shown, with "+N more")
   
   - **Interaction**:
     - Click to switch to session
     - Automatic close after selection

3. **Empty State**:
   - Friendly message for new users
   - Call-to-action button

4. **Footer Actions**:
   - "Clear All History" button with confirmation

**Smart Time Formatting**:
```typescript
formatDate(date) → {
  if (invalid) return 'Recently'
  return dateObj.toLocaleString() // e.g., "9/30/2025, 3:45:12 PM"
}

formatDuration(ms) → {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}
```

#### Context Management (`ChatHistoryContext.tsx`)

**Purpose**: React context for chat history state management

**State Management**:
- `sessions`: Array of all conversation sessions
- `currentSessionId`: ID of active session
- `isLoading`: Loading state for operations

**Operations**:
- `loadSessions()`: Refresh sessions list from storage
- `switchToSession(sessionId)`: Change active session
- `createNewSession(title?)`: Create new conversation
- `clearHistory()`: Delete all sessions with confirmation

**Automatic Data Refresh**:
```typescript
useEffect(() => {
  loadSessions() // Load on mount
}, [])
```

### Data Storage & Persistence

#### File Structure
```
users/user-data/{userId}/
└── chat-history.json          # Complete chat history for user
```

#### Storage Format
```json
{
  "sessions": [
    {
      "id": "session-1727725838321-abc123",
      "userId": "07bb0c68-fc82-45e2-8d7b-8f5df9d31044",
      "title": "session-1727725838321-abc123",
      "startedAt": "2025-09-30T10:30:38.321Z",
      "lastMessageAt": "2025-09-30T10:35:12.456Z",
      "lastActiveAt": "2025-09-30T15:20:00.000Z",
      "messageCount": 8,
      "contextUrls": ["https://example.com", "https://docs.example.com"],
      "totalResponseTime": 15420,
      "averageResponseTime": 3855
    }
  ],
  "messages": [
    {
      "id": "msg-1727725840123-xyz789",
      "role": "user",
      "content": "How does this feature work?",
      "timestamp": "2025-09-30T10:30:40.123Z",
      "contextUrl": "https://example.com",
      "contextTitle": "Example Documentation",
      "sessionId": "session-1727725838321-abc123",
      "messageIndex": 0,
      "source": "user"
    },
    {
      "id": "msg-1727725843456-def456",
      "role": "assistant",
      "content": "This feature works by...",
      "timestamp": "2025-09-30T10:30:43.456Z",
      "contextUrl": "https://example.com",
      "contextTitle": "Example Documentation",
      "sessionId": "session-1727725838321-abc123",
      "responseTime": 3333,
      "streamingMetrics": {
        "tokensPerSecond": 42.5,
        "totalTokens": 142,
        "firstTokenDelay": 250
      },
      "messageIndex": 1,
      "source": "assistant"
    }
  ],
  "currentSessionId": "session-1727725838321-abc123",
  "totalConversations": 15,
  "totalMessages": 127,
  "createdAt": "2025-09-15T08:00:00.000Z",
  "updatedAt": "2025-09-30T15:20:00.000Z"
}
```

#### Automatic Persistence
- **Real-time Saving**: Every message automatically saved to disk
- **Session Updates**: Metadata updated with each interaction
- **Date Serialization**: All dates properly serialized/deserialized
- **Atomic Writes**: File operations are atomic to prevent corruption

### User Account Integration

#### Per-User Chat History

**Complete Isolation**:
- Each user account has separate chat history file
- No cross-user data access possible
- Guest user history cleared on app restart

**Automatic User Switching**:
```typescript
// LLMClient.handleUserSwitch()
handleUserSwitch() → {
  // Load messages for new user
  await loadCurrentUserMessages()
  
  // Current session ID automatically loaded
  // Messages restored to chat interface
  // Previous user's data automatically saved
}
```

#### Guest User Behavior

**Ephemeral Chat History**:
- Guest user can create sessions and send messages
- All chat history cleared on app restart
- No persistence between sessions
- Provides privacy for temporary browsing

### Performance Optimizations

#### Efficient Data Loading
- **Lazy Loading**: Only load messages for current session
- **Sorted Sessions**: Sessions pre-sorted by `lastActiveAt`
- **Filtered Display**: Hide empty sessions (0 messages) from UI
- **Minimal IPC**: Batch operations to reduce IPC overhead

#### Memory Management
- **Message Pagination**: Only active session messages in memory
- **Smart Caching**: Session list cached in context
- **Incremental Updates**: Only changed data persisted
- **Date Conversion**: Efficient date object serialization

### Security & Privacy

#### Data Protection
- **Local Storage Only**: All chat history stored locally
- **No Cloud Sync**: No external transmission of conversations
- **User Isolation**: Complete separation between accounts
- **Session Security**: Session IDs are cryptographically random

#### Deletion & Cleanup
- **Clear All**: Delete all sessions and messages with confirmation
- **Per-Session Delete**: (Future feature) Delete individual sessions
- **Automatic Cleanup**: Old sessions can be archived (future feature)
- **Guest Clearing**: Automatic cleanup on app restart

### Key Functions Involved

**Session Management**:
- `UserDataManager.createChatSession()` - Create new session
- `UserDataManager.setCurrentSessionId()` - Switch sessions
- `UserDataManager.getChatSessions()` - Retrieve all sessions
- `UserDataManager.getCurrentSessionId()` - Get active session

**Message Management**:
- `UserDataManager.addChatMessage()` - Save message with metadata
- `UserDataManager.getSessionMessages()` - Load session messages
- `LLMClient.sendChatMessage()` - Send message with history tracking
- `LLMClient.loadCurrentUserMessages()` - Load messages on session change

**UI Components**:
- `ChatHistory.tsx` - Chat history interface
- `ChatHistoryContext.tsx` - State management
- `Chat.tsx` - Main chat interface with history integration

**IPC Handlers** (`EventManager.ts`):
- `get-chat-history` - Load complete history
- `get-chat-sessions` - Load all sessions
- `get-session-messages` - Load specific session
- `create-chat-session` - Create new session
- `switch-to-session` - Change active session
- `clear-chat-history` - Delete all history

This enhanced chat history system provides a foundation for sophisticated conversation management and enables advanced features like conversation analysis, AI-powered summaries, and proactive assistance based on chat patterns.

---

## Advanced Browser Features

### JavaScript Execution in Tabs

**Purpose**: Allow debugging, automation, or content analysis

**Flow**:
1. `topBarAPI.tabRunJs(tabId, code)` → EventManager → `tab.runJs(code)`
2. `Tab.runJs()` calls `webContents.executeJavaScript(code)`
3. Returns result or throws error
4. Used by AI for content extraction: `getTabHtml()`, `getTabText()`

### Tab Screenshots

**Purpose**: Visual context for AI, debugging, or thumbnails

**Flow**:
1. `topBarAPI.tabScreenshot(tabId)` → EventManager → `tab.screenshot()`
2. `Tab.screenshot()` calls `webContents.capturePage()`
3. Returns NativeImage converted to base64 data URL
4. Automatically used in AI chat for visual context

### External Link Handling

**Security Feature**: Prevent tab hijacking

**Implementation** (`Window.ts`):
```typescript
tab.webContents.setWindowOpenHandler((details) => {
  shell.openExternal(details.url) // Open in system browser
  return { action: "deny" } // Prevent new window in app
})
```

---

## Performance & Memory Management

### Tab Process Isolation

**Architecture**: Each tab runs in separate Electron renderer process
- **Memory**: Isolated memory spaces prevent one tab from affecting others
- **Security**: Sandboxed processes with no Node.js access
- **Crashes**: Individual tab crashes don't affect the browser

### Automatic Cleanup

**Window Closure** (`Window.ts`):
```typescript
baseWindow.on("closed", () => {
  // Clean up all tabs
  tabsMap.forEach(tab => tab.destroy())
  tabsMap.clear()
})
```

**Application Exit** (`index.ts`):
```typescript
app.on("window-all-closed", () => {
  if (eventManager) {
    eventManager.cleanup() // Remove all IPC listeners
    eventManager = null
  }
  // Null all references for GC
})
```

### Resource Optimization

**AI Context Management**:
- Page text truncated to 4000 characters
- Screenshots only captured when needed for chat
- Conversation history maintained but not persisted between sessions

**UI Performance**:
- Tab switching uses visibility toggle (instant)
- Address bar state managed separately from display
- Auto-scroll only triggers on new messages

---

## Error Handling & Resilience

### IPC Error Handling

**Pattern**: All IPC calls wrapped in try-catch with user feedback

**Example** (`BrowserContext.tsx`):
```typescript
const createTab = async (url?: string) => {
  setIsLoading(true)
  try {
    await window.topBarAPI.createTab(url)
    await refreshTabs()
  } catch (error) {
    console.error('Failed to create tab:', error)
    // UI remains responsive, error logged
  } finally {
    setIsLoading(false)
  }
}
```

### AI Error Handling

**LLMClient Error Types** (`LLMClient.ts`):
- **401 Unauthorized**: "Check your API key"
- **429 Rate Limit**: "Try again in a few moments"
- **Network Errors**: "Check your internet connection"
- **Timeout**: "Service took too long to respond"
- **Generic**: "An error occurred, please try again"

**Streaming Resilience**:
- Partial responses still display to user
- Error messages replace loading indicators
- Conversation history preserved even on errors

### Tab Error Recovery

**Navigation Failures**:
- Invalid URLs convert to Google searches
- Network errors display in tab content
- Back/forward buttons disabled when no history available

---

## User Activity Tracking System

### Comprehensive Activity Collection

**Purpose**: Track detailed user behavior across all interactions to build comprehensive user profiles and enable proactive browsing capabilities

**Complete Flow**:

1. **Activity Monitoring Initialization** (`Window.ts`):
   ```typescript
   createTab(url) → {
     const activityCollector = new ActivityCollector(userDataManager, currentUser.id)
     tab.setActivityCallback((activity) => activityCollector.collectActivity(activity))
   }
   ```

2. **Tab-Level Activity Tracking** (`Tab.ts`):
   ```typescript
   // Page navigation tracking
   webContents.on('did-navigate', () => {
     recordActivity('page_visit', {
       url, title, loadTime, referrer, userAgent
     })
   })
   
   // User interaction monitoring
   webContents.on('did-finish-load', () => {
     injectActivityScript() // Monitor clicks, scrolls, keyboard input
   })
   
   // Focus/blur tracking
   show() → recordActivity('focus_change', {focusType: 'tab_focus'})
   hide() → recordActivity('focus_change', {focusType: 'tab_blur'})
   ```

3. **In-Page Activity Monitoring** (Injected Script):
   ```javascript
   // Click tracking
   document.addEventListener('click', (e) => {
     window.electronAPI.reportActivity('click_event', {
       x: e.clientX, y: e.clientY,
       elementTag: e.target.tagName,
       elementClass: e.target.className,
       clickType: e.button === 0 ? 'left' : 'right'
     })
   })
   
   // Scroll depth monitoring
   window.addEventListener('scroll', throttle(() => {
     window.electronAPI.reportActivity('scroll_event', {
       scrollTop: window.scrollY,
       viewportHeight: window.innerHeight,
       documentHeight: document.body.scrollHeight
     })
   }, 500))
   
   // Keyboard input tracking
   document.addEventListener('keydown', () => {
     keyboardEventCount++
     // Debounced reporting every 2 seconds
   })
   ```

4. **Activity Data Buffering** (`ActivityCollector.ts`):
   ```typescript
   collectActivity(type, data) → {
     const activity = {
       id: generateId(),
       userId: this.userId,
       timestamp: new Date(),
       sessionId: this.sessionId,
       type,
       data
     }
     
     this.buffer.push(activity)
     
     // Flush buffer when full or on timer
     if (buffer.length >= BUFFER_SIZE) {
       flushActivities()
     }
   }
   
   flushActivities() → {
     userDataManager.saveRawActivityData(userId, buffer)
     buffer.length = 0
   }
   ```

5. **Persistent Storage** (`UserDataManager.ts`):
   ```typescript
   saveRawActivityData(userId, activities) → {
     const today = new Date().toISOString().split('T')[0]
     const filePath = `users/user-data/${userId}/raw-activity/${today}.json`
     
     // Append to daily file
     const existingData = await readJsonFile(filePath) || []
     existingData.push(...activities)
     await writeJsonFile(filePath, existingData)
   }
   ```

### Activity Types Tracked

**13 Comprehensive Activity Categories**:

1. **Page Visits**: URL, title, load time, referrer tracking
2. **Page Interactions**: Time on page, scroll depth, click counts, exit methods
3. **Click Events**: Precise coordinates, element details, click types
4. **Scroll Events**: Direction, speed, viewport position tracking
5. **Keyboard Input**: Key counts, input contexts, typing patterns
6. **Mouse Movements**: Movement paths, speeds, interaction patterns
7. **Search Queries**: Query analysis, search engine detection
8. **Navigation Events**: Navigation methods, load times, URL transitions
9. **Tab Actions**: Tab lifecycle events, tab switching patterns
10. **Focus Changes**: Window and tab focus patterns
11. **Chat Interactions**: AI chat usage, message patterns, context
12. **Content Extraction**: Page content analysis, media detection
13. **Form Interactions**: Form usage patterns, completion rates

### Chat Integration Tracking

**User Action**: Send message in AI chat interface

**Activity Tracking Flow**:

1. **Chat Message Capture** (`LLMClient.ts`):
   ```typescript
   sendChatMessage(request) → {
     // Record chat interaction
     activityCollector.collectActivity('chat_interaction', {
       userMessage: request.message,
       messageLength: request.message.length,
       contextUrl: activeTab?.url,
       conversationLength: messages.length
     })
     
     // Process AI response and track response time
     const startTime = Date.now()
     await streamResponse(contextMessages, messageId)
     const responseTime = Date.now() - startTime
     
     // Update activity with response time
     activityCollector.collectActivity('chat_interaction', {
       responseTime,
       conversationLength: messages.length + 1
     })
   }
   ```

2. **Content Context Tracking**:
   ```typescript
   // Automatically track content extraction for AI context
   const pageText = await activeTab.getTabText()
   const screenshot = await activeTab.screenshot()
   
   activityCollector.collectActivity('content_extraction', {
     url: activeTab.url,
     title: activeTab.title,
     contentType: detectContentType(pageText),
     textLength: pageText.length,
     hasImages: containsImages(pageText),
     language: detectLanguage(pageText)
   })
   ```

### Data Storage Structure

**Daily Activity Files**:
```
users/user-data/{userId}/raw-activity/
├── 2025-09-29.json    # Daily activity logs
├── 2025-09-30.json
└── 2025-10-01.json
```

**Activity Record Format**:
```json
{
  "id": "activity-1759172738321-1uw4ddyqc",
  "userId": "07bb0c68-fc82-45e2-8d7b-8f5df9d31044", 
  "timestamp": "2025-09-29T19:05:38.321Z",
  "sessionId": "session-1759172738310-xjo4mdj1c",
  "type": "click_event",
  "data": {
    "url": "https://example.com",
    "x": 245,
    "y": 156,
    "elementTag": "BUTTON",
    "elementClass": "submit-btn",
    "clickType": "left",
    "isDoubleClick": false
  }
}
```

### Performance Optimizations

**Buffered Collection**:
- Activities buffered in memory (default: 50 items)
- Automatic flushing every 30 seconds
- Immediate flush on buffer full or app close

**Throttled Event Monitoring**:
- Mouse movements: 100ms throttle
- Scroll events: 500ms throttle  
- Keyboard events: Debounced reporting every 2 seconds

**Efficient Storage**:
- Daily JSON files for easy analysis
- Compressed data structures
- Automatic cleanup of old activity files

### User Privacy & Control

**Per-User Isolation**:
- Complete activity separation between user accounts
- Guest user activities cleared on app restart
- Session-based activity grouping

**Data Access Patterns**:
- Local storage only - no external transmission
- Structured data format for future analysis
- User-controlled data retention policies

### Key Functions Involved

**Activity Collection**:
- `ActivityCollector.collectActivity()` - Core activity recording
- `Tab.recordActivity()` - Tab-level activity capture  
- `Tab.injectActivityScript()` - In-page monitoring setup
- `UserDataManager.saveRawActivityData()` - Persistent storage

**Data Management**:
- `ActivityCollector.flushActivities()` - Buffer management
- `UserDataManager.getRawActivityData()` - Data retrieval
- `UserDataManager.cleanupOldActivity()` - Data maintenance

**Integration Points**:
- `Window.createTab()` - Activity collector initialization
- `LLMClient.sendChatMessage()` - Chat interaction tracking
- `Tab event handlers` - Navigation and interaction capture

This comprehensive activity tracking system provides the foundation for building detailed user profiles and enabling advanced proactive browsing capabilities while maintaining strict privacy and performance standards.

---

## Content Analysis System

### Overview

The Content Analysis System performs intelligent, AI-powered analysis of visited web pages to extract structured information including text content, visual descriptions, language detection, and hierarchical categorization. The system operates asynchronously to avoid blocking the browser, with smart deduplication to prevent redundant analysis of unchanged content.

### Page Visit Analysis Flow

**User Action**: User switches to a tab (tab activation)

**Trigger**: First activation of a page

**Complete Flow**:

1. **Tab Activation** (`Tab.ts`):
   ```typescript
   show() → {
     if (!hasAnalyzedThisPage && contentAnalyzer && activityCollector) {
       hasAnalyzedThisPage = true
       activityId = generateActivityId()
       userId = activityCollector.getUserId()
       
       // Trigger async analysis (non-blocking)
       contentAnalyzer.onPageVisit(activityId, url, userId, this)
     }
   }
   ```

2. **Data Extraction** (`ContentAnalyzer.ts`):
   ```typescript
   onPageVisit(activityId, url, userId, tab) → {
     // Extract page HTML
     html = await tab.getTabHtml()
     htmlHash = computeHash(html)
     
     // Extract structured text
     extractedText = await tab.extractStructuredText()
     // Returns: { title, metaDescription, headings, paragraphs, links, fullText }
     
     // Capture screenshot with metadata
     screenshotData = await tab.getScreenshotWithMetadata()
     screenshotBuffer = screenshotData.image.toPNG()
     screenshotHash = computeHash(screenshotBuffer)
   }
   ```

3. **Deduplication Check** (`ContentAnalyzer.ts`):
   ```typescript
   // Create index key from URL + content hashes
   indexKey = `${url}:${htmlHash}:${screenshotHash}`
   analysisIndex = await userDataManager.getAnalysisIndex(userId)
   existingAnalysisId = analysisIndex.get(indexKey)
   
   if (existingAnalysisId) {
     // Reuse existing analysis - just link activity ID
     await userDataManager.linkActivityToAnalysis(userId, activityId, existingAnalysisId)
     return // No new analysis needed
   }
   ```

4. **Storage & Queueing** (`ContentAnalyzer.ts`):
   ```typescript
   // Save screenshot for analysis
   screenshotPath = await userDataManager.saveScreenshot(userId, activityId, screenshotBuffer)
   
   // Store temp data for queue processing
   tempData = { activityId, html, htmlHash, extractedText, screenshotHash, screenshotMetadata }
   await saveTempAnalysisData(userId, activityId, tempData)
   
   // Add to processing queue
   await addToQueue({ activityId, userId, url, timestamp })
   ```

5. **Queue Processing** (`ContentAnalyzer.ts` Worker):
   ```typescript
   processNextInQueue() → {
     // Load saved data
     tempData = await loadTempAnalysisData(activityId)
     screenshotBuffer = await userDataManager.getScreenshot(userId, activityId)
     
     // Get current categories for prompt
     exampleCategories = categoryManager.getExampleCategories()
     
     // Build analysis prompt
     prompt = buildAnalysisPrompt(url, extractedText, exampleCategories)
   }
   ```

6. **LLM Analysis** (`ContentAnalyzer.ts`):
   ```typescript
   // Call GPT-4o-mini with multimodal input
   result = await streamText({
     model: 'gpt-4o-mini',
     messages: [{
       role: 'user',
       content: [
         { type: 'image', image: screenshotDataUrl },
         { type: 'text', text: prompt }
       ]
     }]
   })
   
   // Stream and parse response
   rawResponse = ''
   for await (chunk of result.textStream) {
     rawResponse += chunk
   }
   
   llmResponse = parseJSONResponse(rawResponse)
   // Returns: { pageDescription, screenshotDescription, languages, 
   //            primaryLanguage, category, subcategory, brand }
   ```

7. **Retry Logic** (if JSON parsing fails):
   ```typescript
   if (!llmResponse && retryCount < MAX_RETRIES) {
     // Send retry prompt
     retryPrompt = "Your previous response could not be parsed as valid JSON..."
     
     // Retry with more explicit instructions
     result = await streamText({
       messages: [...previousMessages, { role: 'user', content: retryPrompt }],
       temperature: 0.1  // Lower temperature for stricter output
     })
   }
   
   // Rate limit handling: Only exponential backoff for 429 errors
   if (error.includes('429')) {
     waitTime = Math.pow(2, retryCount) * 1000
     await sleep(waitTime)
   }
   ```

8. **Category Management** (`CategoryManager.ts`):
   ```typescript
   // Record new category usage
   await categoryManager.recordCategoryUse(llmResponse.category)
   
   // If new category:
   if (categories.size < MAX_CATEGORIES) {
     categories.set(categoryName, {
       name, count: 1, firstSeen: Date, lastUsed: Date
     })
   }
   // If at limit, LLM instructed to use "other"
   ```

9. **Save Analysis Result** (`UserDataManager.ts`):
   ```typescript
   analysisResult = {
     analysisId, activityIds: [activityId], userId, timestamp, url,
     pageDescription, rawText, rawHtml, htmlHash,
     screenshotDescription, screenshotPath, screenshotHash, screenshotMetadata,
     category, subcategory, brand,
     languages, primaryLanguage,
     analysisStatus: 'completed', modelUsed: 'gpt-4o-mini',
     analysisTime, llmInteractionId
   }
   
   // Save to content-analysis/{date}.json
   await userDataManager.saveContentAnalysis(userId, analysisResult)
   
   // Update index for deduplication
   await userDataManager.updateAnalysisIndex(userId, indexKey, analysisId)
   ```

10. **Debug Logging** (`UserDataManager.ts`):
    ```typescript
    // Save complete LLM interaction for debugging
    await userDataManager.saveLLMDebugLog(userId, {
      interactionId, timestamp, analysisId, activityId, userId,
      model: 'gpt-4o-mini',
      prompt,
      screenshotPath,  // Reference only, not full base64
      rawResponse,
      parsedResponse,
      responseTime,
      retryAttempt,
      success: true
    })
    
    // Clean up temporary data
    await deleteTempAnalysisData(activityId)
    ```

### Text Extraction Methods

**Robust Text Extraction** (`Tab.ts`):

```typescript
async extractStructuredText() → {
  // Wait for page load
  if (isLoading()) await waitForLoad()
  
  // Execute extraction script with timeout
  result = await Promise.race([
    runJs(extractionScript),
    timeout(5000)
  ])
  
  // Fallback on error
  catch (error) {
    text = await getTabText()  // Simple innerText fallback
    return { title, fullText: text, ... }
  }
  
  // Returns structured data:
  return {
    title, metaDescription,
    headings: [{ level, text }],
    paragraphs: [text],
    links: [{ text, href }],
    fullText, textLength
  }
}
```

**Screenshot with Metadata** (`Tab.ts`):

```typescript
async getScreenshotWithMetadata() → {
  image = await screenshot()
  
  metadata = await runJs(`
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentHeight: document.scrollHeight,
      scrollPosition: { x: window.scrollX, y: window.scrollY },
      zoomFactor: window.devicePixelRatio
    }
  `)
  
  return { image, metadata: { ...metadata, capturedAt: Date } }
}
```

### Storage Structure

```
/users/user-data/{userId}/
  ├── content-analysis/
  │   ├── 2025-09-30.json              # Daily analysis results
  │   └── index.json                   # url:htmlHash:screenshotHash → analysisId
  ├── screenshots/
  │   └── {activityId}.png             # Reusable screenshots
  ├── llm-debug-logs/
  │   └── 2025-09-30.json              # Complete LLM interactions for debugging
  └── raw-activity/
      └── 2025-09-30.json              # Activity tracking (existing)

/users/global/
  └── categories.json                  # Global category taxonomy (max 1000)

/users/
  └── analysis-queue.json              # Persistent analysis queue
```

### Data Structures

**Content Analysis Result**:
```typescript
{
  analysisId: string
  activityIds: string[]                 // Multiple activities can share one analysis
  userId: string
  timestamp: Date
  url: string
  
  // Text extraction
  pageDescription: string               // AI-generated 2-3 sentence summary
  rawText: {
    title, metaDescription, headings, paragraphs, links, fullText, textLength
  }
  rawHtml: string                       // Full HTML for deduplication
  htmlHash: string                      // SHA-256 hash
  
  // Visual analysis
  screenshotDescription: string         // AI description of visual elements
  screenshotPath: string                // Relative path to PNG
  screenshotHash: string                // SHA-256 hash
  screenshotMetadata: {
    viewportWidth, viewportHeight, documentHeight,
    scrollPosition: { x, y }, zoomFactor, capturedAt
  }
  
  // Categorization
  category: string                      // High-level (global, max 1000)
  subcategory: string                   // Specific type (unlimited)
  brand: string                         // Company/org name (unlimited)
  
  // Language detection
  languages: string[]                   // ISO 639-1 codes
  primaryLanguage: string
  
  // Metadata
  analysisStatus: 'completed' | 'failed'
  modelUsed: string
  tokensUsed?: number
  analysisTime: number                  // Milliseconds
  error?: string
  llmInteractionId?: string             // Link to debug log
}
```

**LLM Debug Log**:
```typescript
{
  interactionId: string
  timestamp: Date
  analysisId: string
  activityId: string
  userId: string
  model: string
  
  // Request
  prompt: string                        // Complete prompt sent to LLM
  screenshotPath: string                // Reference only, not base64
  temperature?: number
  maxTokens?: number
  
  // Response
  rawResponse: string                   // Raw LLM output
  parsedResponse?: object               // Parsed JSON
  parseError?: string
  
  // Metadata
  tokensUsed?: number
  responseTime: number                  // Milliseconds
  retryAttempt: number
  success: boolean
}
```

### Key Features

**Smart Deduplication**:
- Compares HTML hash + screenshot hash before analysis
- Multiple page visits → same analysis if content unchanged
- Content changes (scrolled, interacted) → new analysis

**Async Processing**:
- Tab activation never blocked by analysis
- Queue persists across app restarts
- Continues processing even if tab/window closed or user switches accounts

**Category Management**:
- Global taxonomy shared across users
- Max 1000 high-level categories
- Unlimited subcategories and brands
- AI instructed to reuse existing categories when possible
- Periodic cleanup of unused categories (< 3 uses, > 6 months old)

**Error Handling**:
- Retry up to 3 times on JSON parse failure
- Exponential backoff only for rate limit errors (429)
- Failed analyses saved with error details
- Debug logs preserved for troubleshooting

**Performance**:
- Uses lightweight GPT-4o-mini model
- Single worker processes queue sequentially
- Hash-based deduplication prevents redundant API calls
- Text extraction with timeout protection

### Key Functions Involved

**Content Analysis**:
- `ContentAnalyzer.onPageVisit()` - Entry point, extraction & deduplication
- `ContentAnalyzer.performAnalysis()` - LLM analysis execution
- `ContentAnalyzer.processNextInQueue()` - Queue worker
- `Tab.extractStructuredText()` - Page text extraction
- `Tab.getScreenshotWithMetadata()` - Screenshot capture with context

**Category Management**:
- `CategoryManager.load()` - Load global categories
- `CategoryManager.recordCategoryUse()` - Track category usage
- `CategoryManager.getExampleCategories()` - Provide examples for prompts
- `CategoryManager.cleanup()` - Remove unused categories

**Data Storage**:
- `UserDataManager.saveContentAnalysis()` - Save analysis results
- `UserDataManager.getAnalysisIndex()` - Load deduplication index
- `UserDataManager.linkActivityToAnalysis()` - Link multiple activities
- `UserDataManager.saveScreenshot()` - Store screenshot files
- `UserDataManager.saveLLMDebugLog()` - Debug logging

**Integration Points**:
- `Window.initialize()` - Create CategoryManager and ContentAnalyzer
- `Window.createTab()` - Pass ContentAnalyzer to new tabs
- `Tab.show()` - Trigger analysis on first activation
- `Tab.setContentAnalyzer()` - Inject analyzer into tabs

### Example Analysis Output

For `https://www.google.com`:

```json
{
  "pageDescription": "The Google homepage allows users to perform web searches and access various Google services. It features a simple layout with a prominent search bar and options for signing in and accessing Gmail and Images.",
  "screenshotDescription": "The layout is clean and minimalistic, dominated by the Google logo in vibrant colors. Below the logo, there is a central search bar, flanked by buttons for 'Google Search' and 'I'm Feeling Lucky'. The footer includes links to various Google services and mentions that the page is offered in Swedish.",
  "languages": ["en", "sv"],
  "primaryLanguage": "sv",
  "category": "search-engine",
  "subcategory": "web-search",
  "brand": "Google"
}
```

This intelligent content analysis system enables advanced features like semantic search across browsing history, automatic content categorization, and proactive browsing assistance based on deep understanding of visited pages.

---

This comprehensive feature analysis demonstrates how Blueberry Browser coordinates multiple processes and technologies to deliver a seamless, AI-enhanced browsing experience.
