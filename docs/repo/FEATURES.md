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

This comprehensive feature analysis demonstrates how Blueberry Browser coordinates multiple processes and technologies to deliver a seamless, AI-enhanced browsing experience.
