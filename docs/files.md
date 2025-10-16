# File Structure & Analysis

This document provides a comprehensive analysis of all source files in the Blueberry Browser repository, organized by functional groupings.

---

## Application Core & Lifecycle

### 📄 src/main/index.ts
**Purpose**: Main application entry point and lifecycle management

**Key Functions**:
- `createWindow()`: Instantiates main Window, AppMenu, and IPCRegistry with feature handlers
- App lifecycle handlers for `whenReady`, `activate`, `window-all-closed`

**Dependencies**:
- **Uses**: Window, AppMenu, IPCRegistry classes, and feature IPC handlers (TabIPCHandler, ChatIPCHandler, UserIPCHandler, ActivityIPCHandler, ContentIPCHandler, HistoryIPCHandler, InsightsIPCHandler, UIIPCHandler)
- **Used by**: Electron framework (application entry point)

**Runtime Behavior**:
- Sets app user model ID for Windows taskbar integration
- Creates main window on app ready using Window.create() factory pattern
- Registers all feature-specific IPC handlers with IPCRegistry
- Handles macOS dock icon re-activation
- Performs cleanup on window closure (IPCRegistry cleanup, reference nulling)

### 📄 src/main/Menu.ts
**Purpose**: Native application menu and keyboard shortcuts

**Key Classes**:
- `AppMenu`: Creates and manages native menu bar

**Key Methods**:
- `createMenu()`: Builds menu template with accelerators
- Menu action handlers (`handleNewTab`, `handleCloseTab`, `handleToggleSidebar`, etc.)

**Dependencies**:
- **Uses**: Window class for tab and navigation operations
- **Used by**: index.ts (main entry point)

**Menu Structure**:
- File: New Tab (Cmd+T), Close Tab (Cmd+W), Quit
- Edit: Standard editing operations (Undo, Redo, Cut, Copy, Paste)
- View: Reload, Force Reload, Toggle Sidebar (Cmd+E), Developer Tools, Fullscreen
- Go: Back (Cmd+Left), Forward (Cmd+Right)

---

## Window Management & Layout

### 📄 src/main/Window.ts
**Purpose**: Main window management with multiple WebContentsViews and feature orchestration

**Key Classes**:
- `Window`: Manages BaseWindow container with TopBar, SideBar, and multiple Tabs

**Key Methods**:
- `static create()`: Factory method for async Window initialization
- `createTab(url?: string)`: Creates new Tab instance with session partition and history callback
- `closeTab(tabId: string)`: Removes and destroys tab, handles active tab switching
- `switchActiveTab(tabId: string)`: Shows/hides tabs, updates window title
- `updateAllBounds()`: Recalculates layout when sidebar toggles
- `switchUser(userId, options)`: Switch user accounts with tab management
- `initializeActivityTracking()`: Set up activity tracking for current user
- `waitForUserAccountsInitialization()`: Ensure user system ready before proceeding

**Dependencies**:
- **Uses**: Tab, TopBar, SideBar, UserAccountManager, storage classes (ChatStorage, HistoryStorage, ActivityStorage, ContentStorage, UserStorage, InsightsStorage), feature managers (ActivityCollector, ContentAnalyzer, CategoryManager, VectorSearchManager, ProactiveInsightsManager)
- **Used by**: index.ts (main entry), IPC handlers (via feature handlers), Menu (via menu actions)

**Storage Architecture**:
- Maintains instances of all storage classes for feature-owned data
- Provides storage access via getters to IPC handlers  
- User-isolated data management through UserAccountManager

**Feature Integration**:
- Initializes CategoryManager for global content categorization
- Sets up VectorSearchManager for semantic search
- Configures ProactiveInsightsManager with storage dependencies
- Manages ContentAnalyzer with history and vector search integration
- Coordinates ActivityCollector lifecycle with user switching

**Layout Management**:
- BaseWindow with hidden title bar and traffic light positioning for macOS
- TopBar at top (88px height)
- Sidebar on right (400px width, toggleable)
- Tabs fill remaining space with automatic bounds calculation

**Memory Management**:
- Maintains tabsMap for O(1) tab lookups
- Proper cleanup of WebContentsView references on window close
- Activity collector cleanup on user switch
- Content analyzer and category manager cleanup
- External link handling via shell.openExternal

---

## Feature Modules

### Tab Management

#### 📄 src/main/features/tabs/Tab.ts
**Purpose**: Individual browser tab with web content, activity tracking, and content analysis

**Key Classes**:
- `Tab`: Wraps WebContentsView with browser functionality

**Key Methods**:
- `loadURL(url: string)`: Navigates to URL
- `screenshot()`: Captures page screenshot as NativeImage
- `runJs(code: string)`: Executes JavaScript in page context
- `getTabHtml()`: Extracts full page HTML
- `getTabText()`: Extracts readable text content
- `setActivityCollector(collector)`: Set up activity tracking for the tab
- `setContentAnalyzer(analyzer)`: Set up content analysis for the tab
- `show()`, `hide()`: Visibility management
- Navigation methods: `goBack()`, `goForward()`, `reload()`, `stop()`

**Dependencies**:
- **Uses**: Electron WebContentsView, ActivityCollector (optional), ContentAnalyzer (optional), HistoryCallback
- **Used by**: Window (tab creation/management), TabIPCHandler

**Security Configuration**:
- User-specific session partitions for isolation
- Context isolation enabled
- No Node.js integration in renderer
- Web security enabled

**Event Handling**:
- Automatic title and URL tracking via navigation events
- `page-title-updated`, `did-navigate`, `did-navigate-in-page`
- Activity tracking injection via executeJavaScript
- Content analysis on page load and navigation
- History recording via callback mechanism

#### 📄 src/main/features/tabs/TabIPCHandler.ts
**Purpose**: IPC handler for tab management operations

**IPC Channels**:
- `create-tab`, `close-tab`, `switch-tab`, `get-tabs`
- `navigate-to`, `navigate-tab`, `go-back`, `go-forward`, `reload`
- `tab-go-back`, `tab-go-forward`, `tab-reload`
- `tab-screenshot`, `tab-run-js`
- `get-active-tab-info`

**Dependencies**:
- **Uses**: BaseIPCHandler, Window
- **Used by**: IPCRegistry

#### 📄 src/main/features/tabs/types.ts
**Purpose**: Type definitions for tab-related data structures

**Exports**: HistoryCallback, tab state interfaces

### User Management

#### 📄 src/main/features/users/UserAccountManager.ts
**Purpose**: Core user account management and session isolation

**Key Classes**:
- `UserAccountManager`: Manages user accounts, switching, and session partitioning

**Key Methods**:
- `createUser(userData)`: Create new user with validation and UUID generation
- `switchUser(userId, options)`: Switch between users with tab management options
- `deleteUser(userId)`: Remove user and cleanup data
- `updateUser(userId, updates)`: Update user information
- `getCurrentUser()`, `getAllUsers()`: User access methods
- `getCurrentSessionPartition()`: Get session partition for current user
- `isCurrentUserGuest()`: Check if current user is guest
- `getUserStats()`: Get user statistics

**Key Features**:
- Guest user (always fresh, incognito-like behavior)
- User persistence across app restarts
- Session partition isolation per user (`persist:user-${userId}`)
- Tab management during user switching
- Maximum 10 users limit
- Name uniqueness validation
- Email format validation

**Dependencies**:
- **Uses**: UserStorage for data persistence, uuid for ID generation
- **Used by**: Window (user switching), UserIPCHandler, LLMClient (chat history)

**Data Storage**:
- `accounts.json`: User metadata
- `current-user.json`: Last active non-guest user
- Session partitions: `persist:user-${userId}` or `persist:guest`

#### 📄 src/main/features/users/storage/UserStorage.ts
**Purpose**: User-specific data persistence and file system operations

**Key Classes**:
- `UserStorage`: Extends BaseStorage to handle user-isolated data

**Key Methods**:
- `savePreferences()`, `loadPreferences()`: User preferences management
- `saveUserTabs()`, `loadUserTabs()`: Tab state management
- `clearUserTabs()`: Clear saved tabs
- `saveBehavioralProfile()`, `loadBehavioralProfile()`: Behavioral data
- `clearUserData()`: Complete user data removal
- `getUserDataSize()`: Storage usage tracking
- `getUserDataSizeDetailed()`: Detailed size breakdown by category

**Key Features**:
- Complete user data isolation
- Automatic directory creation (via BaseStorage)
- Error handling and graceful degradation
- Support for multiple data types (preferences, tabs, behavioral profiles)

**Dependencies**:
- **Uses**: BaseStorage, Node.js fs/promises
- **Used by**: UserAccountManager (tab management, user switching)

**Storage Structure**:
```
userData/users/user-data/
├── user-123/
│   ├── tabs.json
│   ├── preferences.json
│   ├── behavioral-profile.json
│   ├── chat-history.json (via ChatStorage)
│   ├── browsing-history.json (via HistoryStorage)
│   └── raw-activity/ (via ActivityStorage)
└── guest/ (cleared on startup)
```

#### 📄 src/main/features/users/UserIPCHandler.ts
**Purpose**: IPC handler for user account operations

**IPC Channels**:
- `users:get-all`, `users:get-current`
- `users:create`, `users:switch`, `users:delete`, `users:update`

**Dependencies**:
- **Uses**: BaseIPCHandler, Window
- **Used by**: IPCRegistry

### AI Integration

#### 📄 src/main/features/ai/LLMClient.ts
**Purpose**: AI language model integration with user-specific chat history and session management

**Key Classes**:
- `LLMClient`: Manages OpenAI/Anthropic API communication with streaming

**Key Methods**:
- `sendChatMessage(request)`: Main AI interaction entry point with user-specific history
- `streamResponse()`: Handles AI response streaming with real-time updates
- `prepareMessagesWithContext()`: Builds conversation with page context
- `buildSystemPrompt()`: Creates context-aware system message
- `handleUserSwitch()`: Switch chat history when user account changes
- `loadCurrentUserMessages()`: Load chat history for current user
- `ensureCurrentSession()`: Create session if needed
- `setCurrentSessionId()`: Switch session and trigger indexing
- `indexCurrentSession()`: Index session messages for vector search
- `setWindow()`, `setUserAccountManager()`: Dependency injection

**Dependencies**:
- **Uses**: ai SDK (streamText), @ai-sdk/openai, @ai-sdk/anthropic, Window (for screenshots/content), UserAccountManager (user switching), ChatStorage (chat history persistence), VectorSearchManager (session indexing)
- **Used by**: SideBar class, ChatIPCHandler

**AI Provider Support**:
- OpenAI (default): GPT-5-mini model
- Anthropic: Claude-Sonnet-4-5 model
- Environment variable configuration (`LLM_PROVIDER`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`)

**Context Integration**:
- Automatic screenshot capture of active tab
- Page text extraction for AI context
- URL and content truncation (4000 char limit)
- Multi-modal support (image + text messages)

**Session Management**:
- Automatic session creation if none exists
- Background session indexing for search (fire and forget)
- Session-based message organization
- Integration with ChatStorage for persistence

**Streaming Architecture**:
- Real-time token streaming to renderer
- Message state management with CoreMessage format
- Streaming performance metrics collection (time to first token, mean/median token times)
- Error handling with user-friendly messages
- Rate limiting and authentication error handling

**Message Flow**:
1. Screenshot capture → Page text extraction → Context building
2. Ensure current session exists
3. System prompt generation with page context
4. Streaming API call with conversation history
5. Real-time updates to renderer via IPC
6. Final message storage in ChatStorage with metrics
7. Background session indexing for vector search

#### 📄 src/main/features/ai/storage/ChatStorage.ts
**Purpose**: Storage for AI chat history with session management

**Key Classes**:
- `ChatStorage`: Extends BaseStorage for chat persistence

**Key Methods**:
- `saveChatHistory()`, `loadChatHistory()`: Complete history persistence
- `createChatSession()`: Create new chat session with title
- `addChatMessage()`: Add message with context and metrics
- `getSessionMessages()`, `getChatSessions()`: Query methods
- `getCurrentSessionId()`, `setCurrentSessionId()`: Session tracking
- `updateSessionTitle()`: Rename sessions
- `deleteChatSession()`, `deleteMultipleChatSessions()`: Cleanup
- `clearChatHistory()`: Remove all history
- `searchSessions()`: Search by title

**Data Structures**:
- `ChatMessage`: Individual messages with role, content, timestamp, context, streaming metrics
- `ChatSession`: Session metadata with message count, timestamps, context URLs, response times
- `ChatHistory`: Complete user chat data with all sessions and messages
- `StreamingMetrics`: Performance data (time to first token, mean/median/stddev token times)

**Key Features**:
- Session-based organization
- Per-message context tracking (URL, title)
- Response time analytics
- Streaming performance metrics
- Message indexing support
- Date deserialization on load

**Dependencies**:
- **Uses**: BaseStorage
- **Used by**: LLMClient, ChatIPCHandler

**Storage Location**: `users/user-data/{userId}/chat-history.json`

#### 📄 src/main/features/ai/ChatIPCHandler.ts
**Purpose**: IPC handler for AI chat operations

**IPC Channels**:
- `ai:send-message`, `ai:clear-messages`, `ai:get-messages`
- `chat:create-session`, `chat:switch-session`, `chat:delete-session`
- `chat:get-sessions`, `chat:search-sessions`, `chat:clear-history`
- `chat:search-history` (vector search integration)

**Dependencies**:
- **Uses**: BaseIPCHandler, Window
- **Used by**: IPCRegistry

### Activity Tracking

#### 📄 src/main/features/activity/ActivityCollector.ts
**Purpose**: Buffered collection and storage of user activity data

**Key Classes**:
- `ActivityCollector`: Manages activity collection with automatic flushing

**Key Methods**:
- 13 collection methods for different activity types:
  - `collectPageVisit()`, `collectPageInteraction()`
  - `collectClickEvent()`, `collectScrollEvent()`, `collectKeyboardInput()`, `collectMouseMovement()`
  - `collectSearchQuery()`, `collectNavigationEvent()`, `collectTabAction()`
  - `collectFocusChange()`, `collectChatInteraction()`, `collectContentExtraction()`, `collectFormInteraction()`
- `getSessionId()`, `getUserId()`: Session/user access
- `flushBuffer()`: Persist buffered activities
- `destroy()`: Final flush and cleanup

**Key Features**:
- 100-item memory buffer prevents I/O bottlenecks
- Automatic flush every 30 seconds
- Session-based activity grouping
- Automatic retry on flush failures
- Per-user activity isolation

**Dependencies**:
- **Uses**: ActivityStorage, ActivityTypes (from shared/types)
- **Used by**: Window (initialization), Tab (activity injection)

**Data Flow**:
1. Activity collected → added to buffer
2. Buffer full or timer expires → flushBuffer()
3. Activities persisted to daily file via ActivityStorage
4. Buffer cleared for next batch

#### 📄 src/main/features/activity/storage/ActivityStorage.ts
**Purpose**: Persistent storage for raw activity data

**Key Classes**:
- `ActivityStorage`: Extends BaseStorage for activity persistence

**Key Methods**:
- `saveRawActivityData()`: Append activities to daily file
- `loadRawActivityData()`: Load activities for date range
- `getActivityDates()`: List dates with activity data
- `clearActivityData()`: Remove all activity for user

**Key Features**:
- Daily file rotation (one file per day)
- User-isolated storage
- Automatic directory creation
- Date-based file organization (YYYY-MM-DD.json)

**Dependencies**:
- **Uses**: BaseStorage
- **Used by**: ActivityCollector, ProactiveInsightsManager

**Storage Location**: `users/user-data/{userId}/raw-activity/{date}.json`

#### 📄 src/main/features/activity/ActivityIPCHandler.ts
**Purpose**: IPC handler for activity tracking operations

**IPC Channels**:
- `activity:get-dates`, `activity:load-data`, `activity:clear-data`

**Dependencies**:
- **Uses**: BaseIPCHandler, Window
- **Used by**: IPCRegistry

### Browsing History

#### 📄 src/main/features/history/storage/HistoryStorage.ts
**Purpose**: Storage for per-user browsing history

**Key Classes**:
- `HistoryStorage`: Extends BaseStorage for history persistence

**Key Methods**:
- `addHistoryEntry()`: Record page visit with metadata
- `getHistory()`: Load all history entries (sorted by recency)
- `searchHistory()`: Filter by URL or title
- `clearHistory()`: Remove all history for user
- `removeHistoryEntry()`: Delete individual entry
- `updateHistoryEntry()`: Modify existing entry

**Data Structures**:
- `HistoryEntry`: URL, title, visitCount, lastVisited, firstVisited, favicon, id

**Key Features**:
- Per-user history isolation
- Automatic visit count tracking
- Timestamp management (first/last visited)
- Search capability
- History entry IDs for linking

**Dependencies**:
- **Uses**: BaseStorage
- **Used by**: Tab (via history callback), HistoryIPCHandler, ContentAnalyzer

**Storage Location**: `users/user-data/{userId}/browsing-history.json`

#### 📄 src/main/features/history/HistoryIPCHandler.ts
**Purpose**: IPC handler for browsing history operations

**IPC Channels**:
- `history:get`, `history:search`, `history:clear`
- `history:remove-entry`, `history:navigate-to`

**Dependencies**:
- **Uses**: BaseIPCHandler, Window
- **Used by**: IPCRegistry

### Content Analysis

#### 📄 src/main/features/content/ContentAnalyzer.ts
**Purpose**: AI-powered content analysis with intelligent queuing and screenshot management

**Key Classes**:
- `ContentAnalyzer`: Manages content analysis pipeline

**Key Methods**:
- `analyzePageContent()`: Main analysis entry point with queuing
- `processQueue()`: Background queue processor
- `extractText()`: Extract structured text from HTML
- `extractScreenshotMetadata()`: Get screenshot details
- `analyzeWithAI()`: AI-powered content understanding
- `detectCookieDialog()`: Intelligent cookie banner detection
- `deduplicateAnalysis()`: Check for existing analysis
- `destroy()`: Cleanup queue and timers

**Key Features**:
- **Intelligent Queuing**: Prevents duplicate analysis, handles retries
- **AI Integration**: Uses OpenAI for semantic content understanding
- **Screenshot Management**: Saves and tracks screenshots with metadata
- **Cookie Detection**: Identifies cookie consent dialogs
- **Content Categorization**: Uses CategoryManager for consistent categories
- **Vector Indexing**: Automatic indexing for semantic search
- **Deduplication**: Content-based hashing to avoid redundant analysis

**Analysis Pipeline**:
1. Queue page for analysis (avoid duplicates)
2. Extract text and screenshot from tab
3. Analyze with AI (description, category, language)
4. Detect cookie dialogs
5. Save analysis with screenshots
6. Update category tracking
7. Index content for vector search
8. Link to browsing history

**Dependencies**:
- **Uses**: ContentStorage, HistoryStorage, CategoryManager, VectorSearchManager, AI SDK
- **Used by**: Tab (automatic analysis), ContentIPCHandler

#### 📄 src/main/features/content/CategoryManager.ts
**Purpose**: Global content category management and tracking

**Key Classes**:
- `CategoryManager`: Manages content categories across all users

**Key Methods**:
- `load()`, `save()`: Persistence methods
- `addCategory()`: Track new category with metadata
- `updateCategory()`: Update usage tracking
- `getCategories()`: Get all categories sorted by usage
- `getTopCategories()`: Get most used categories
- `hasCategory()`: Check category existence

**Key Features**:
- Global category registry (shared across users)
- Usage tracking (count, first seen, last used)
- Maximum 1000 categories limit
- Sorted by usage frequency
- Persistent storage with versioning

**Dependencies**:
- **Uses**: Node.js fs/promises
- **Used by**: ContentAnalyzer, Window

**Storage Location**: `users/global/categories.json`

#### 📄 src/main/features/content/storage/ContentStorage.ts
**Purpose**: Storage for analyzed content and screenshots

**Key Classes**:
- `ContentStorage`: Extends BaseStorage for content analysis

**Key Methods**:
- `saveAnalysis()`: Persist content analysis result
- `getAnalysis()`: Load analysis by ID
- `getUserAnalyses()`: Get all analyses for user
- `searchAnalyses()`: Search by URL, category, or content
- `deleteAnalysis()`: Remove analysis and screenshots
- `clearAllAnalyses()`: Remove all for user

**Data Structures**:
- `ContentAnalysisResult`: Complete analysis with text, AI descriptions, categorization, screenshots

**Key Features**:
- Per-user analysis storage
- Screenshot file management
- Search capabilities
- Analysis metadata tracking

**Dependencies**:
- **Uses**: BaseStorage
- **Used by**: ContentAnalyzer, ContentIPCHandler

**Storage Structure**:
```
users/user-data/{userId}/
├── content-analyses.json
└── screenshots/
    ├── {analysisId}-full.png
    └── {analysisId}-metadata.json
```

#### 📄 src/main/features/content/ContentIPCHandler.ts
**Purpose**: IPC handler for content analysis operations

**IPC Channels**:
- `content:analyze`, `content:get-analysis`, `content:get-analyses`
- `content:search`, `content:delete`, `content:clear`

**Dependencies**:
- **Uses**: BaseIPCHandler, Window
- **Used by**: IPCRegistry

### Vector Search

#### 📄 src/main/features/search/VectorSearchManager.ts
**Purpose**: Local semantic search using LanceDB and Transformers.js

**Key Classes**:
- `VectorSearchManager`: Manages vector embeddings and search

**Key Methods**:
- `initialize()`: Set up embedding model and database
- `indexPageContent()`: Index analyzed page content
- `indexChatSession()`: Index chat session messages
- `searchPages()`: Semantic search across browsing history
- `searchChatHistory()`: Semantic search across chat sessions
- `deletePageIndex()`: Remove page from index
- `deleteChatSessionIndex()`: Remove session from index
- `clearUserIndex()`: Remove all indices for user

**Key Features**:
- **Local Embeddings**: Uses all-MiniLM-L6-v2 model via Transformers.js
- **Vector Database**: LanceDB for efficient similarity search
- **Multi-Content Types**: Indexes page descriptions, titles, metadata, chat messages
- **User Isolation**: Separate tables per user
- **High Quality**: 384-dimensional embeddings
- **Privacy**: All processing local, no API calls

**Search Types**:
- Page content (descriptions, titles, meta)
- Chat messages (user, assistant, summaries)
- Semantic similarity with relevance scores

**Dependencies**:
- **Uses**: LanceDB (vectordb), Transformers.js (@huggingface/transformers)
- **Used by**: ContentAnalyzer, LLMClient, InsightsIPCHandler

**Model Configuration**:
- Model: `Xenova/all-MiniLM-L6-v2`
- Dimensions: 384
- Cache: Local model storage in app userData

### Proactive Insights

#### 📄 src/main/features/insights/ProactiveInsightsManager.ts
**Purpose**: AI-powered pattern detection and workflow automation

**Key Classes**:
- `ProactiveInsightsManager`: Detects patterns and generates insights

**Key Methods**:
- `analyzeUserBehavior()`: Main analysis entry point
- `detectWorkflowPatterns()`: Find repeated URL sequences
- `detectResearchPatterns()`: Identify research sessions
- `detectAbandonedTasks()`: Find incomplete work
- `detectHabitPatterns()`: Discover usage habits
- `executeInsightAction()`: Run insight actions
- `getInsights()`: Load user's insights
- `dismissInsight()`, `markInsightActedUpon()`: Insight management
- `saveWorkflow()`, `getSavedWorkflows()`: Workflow persistence
- `createReminder()`, `getReminders()`: Reminder management

**Insight Types**:
1. **Workflow Patterns**: Repeated URL sequences (e.g., daily news routine)
2. **Research Patterns**: Deep dives into specific topics
3. **Abandoned Tasks**: Unfinished research or work
4. **Habit Patterns**: Regular time-based behaviors

**Key Features**:
- **AI-Powered**: Uses OpenAI to understand semantic patterns
- **Multi-Source**: Analyzes activity data, browsing history, content analyses
- **Actionable**: Generates one-click workflow automations
- **Smart Reminders**: Context-aware task reminders
- **Workflow Saving**: User-curated automation library
- **Progress Tracking**: Monitors task completion
- **Auto-Completion**: Detects when tasks are finished

**Analysis Pipeline**:
1. Load user activity, history, and content analyses
2. Detect 4 types of patterns using AI
3. Score relevance and deduplicate insights
4. Generate actionable recommendations
5. Persist insights with status tracking
6. Enable one-click actions and reminders

**Dependencies**:
- **Uses**: InsightsStorage, ActivityStorage, ContentStorage, VectorSearchManager, AI SDK
- **Used by**: Window (initialization), InsightsIPCHandler

#### 📄 src/main/features/insights/storage/InsightsStorage.ts
**Purpose**: Storage for proactive insights, workflows, and reminders

**Key Classes**:
- `InsightsStorage`: Extends BaseStorage for insights persistence

**Key Methods**:
- `saveInsights()`, `loadInsights()`: Insight persistence
- `saveWorkflows()`, `loadWorkflows()`: Workflow library
- `saveReminders()`, `loadReminders()`: Reminder management
- `clearInsights()`: Remove all insights

**Data Structures**:
- `ProactiveInsight`: Pattern detection results with actions
- `SavedWorkflow`: User-curated automation workflows
- `Reminder`: Task reminders with completion tracking

**Dependencies**:
- **Uses**: BaseStorage
- **Used by**: ProactiveInsightsManager, InsightsIPCHandler

**Storage Location**: `users/user-data/{userId}/proactive-insights.json`

#### 📄 src/main/features/insights/InsightsIPCHandler.ts
**Purpose**: IPC handler for proactive insights operations

**IPC Channels**:
- `insights:analyze`, `insights:get`, `insights:dismiss`, `insights:act-upon`
- `insights:execute-action`, `insights:get-session-tabs`
- `workflows:save`, `workflows:get`, `workflows:delete`, `workflows:execute`
- `reminders:create`, `reminders:get`, `reminders:complete`, `reminders:delete`

**Dependencies**:
- **Uses**: BaseIPCHandler, Window
- **Used by**: IPCRegistry

### UI Management

#### 📄 src/main/ui/TopBar.ts
**Purpose**: Browser navigation UI container

**Key Classes**:
- `TopBar`: Manages WebContentsView for topbar React app

**Key Methods**:
- `createWebContentsView()`: Sets up React app with preload script
- `setupBounds()`: Fixed 88px height positioning
- `updateBounds()`: Handles window resize

**Dependencies**:
- **Uses**: topbar.js preload script, topbar React app
- **Used by**: Window class

**Development vs Production**:
- Dev mode: Loads from Vite dev server (`http://localhost:5173/topbar/`)
- Production: Loads from `../renderer/topbar/index.html`

#### 📄 src/main/ui/SideBar.ts
**Purpose**: AI chat interface container

**Key Classes**:
- `SideBar`: Manages WebContentsView for sidebar React app and LLMClient

**Key Methods**:
- `toggle()`, `show()`, `hide()`: Visibility management
- `updateBounds()`: 400px width positioning on right side
- `getIsVisible()`: State access for layout calculations

**Dependencies**:
- **Uses**: LLMClient for AI functionality, sidebar.js preload script
- **Used by**: Window class, UIIPCHandler (for toggle operations)

**Layout Behavior**:
- Right-aligned 400px width when visible
- Zero-sized bounds when hidden
- Automatic bounds recalculation on window resize

#### 📄 src/main/ui/UIIPCHandler.ts
**Purpose**: IPC handler for UI state management

**IPC Channels**:
- `ui:toggle-sidebar`
- `ui:dark-mode-changed` (broadcast to all processes)

**Dependencies**:
- **Uses**: BaseIPCHandler, Window
- **Used by**: IPCRegistry

---

## Core Infrastructure

### IPC System

#### 📄 src/main/core/ipc/IPCRegistry.ts
**Purpose**: Central registry for all IPC handlers in the application

**Key Classes**:
- `IPCRegistry`: Manages feature-specific IPC handlers

**Key Methods**:
- `registerHandler(handler)`: Register a new IPC handler for a feature
- `getHandler(name)`: Get a specific handler by name
- `hasHandler(name)`: Check if handler is registered
- `getHandlerNames()`: List all registered handlers
- `cleanup()`: Clean up all registered handlers on shutdown

**Architecture Benefits**:
- Replaces monolithic EventManager with modular, feature-based approach
- Each feature manages its own IPC handlers
- Better maintainability and testability
- Clear boundaries between features
- Automatic cleanup on shutdown

**Dependencies**:
- **Uses**: BaseIPCHandler subclasses from each feature
- **Used by**: index.ts (main entry point)

#### 📄 src/main/core/ipc/BaseIPCHandler.ts
**Purpose**: Base class for feature-specific IPC handlers

**Key Features**:
- Abstract class requiring `name`, `registerHandlers()`, and `cleanup()` implementation
- Each feature extends this to handle its own IPC communication
- Separation of concerns and cleaner code organization
- Standard lifecycle management

**Subclasses** (Feature-specific handlers):
- `TabIPCHandler`: Tab management, navigation, actions
- `ChatIPCHandler`: AI chat messaging
- `UserIPCHandler`: User account management
- `ActivityIPCHandler`: Activity tracking
- `ContentIPCHandler`: Content analysis
- `HistoryIPCHandler`: Browsing history management
- `InsightsIPCHandler`: Proactive insights
- `UIIPCHandler`: UI state management (sidebar toggle, dark mode)

**Error Handling**:
- Try-catch blocks in individual handlers
- Console error logging with context
- Proper cleanup on application shutdown

**Dependencies**:
- **Uses**: Window reference for accessing features
- **Used by**: IPCRegistry, all feature IPC handlers

### Storage System

#### 📄 src/main/core/storage/BaseStorage.ts
**Purpose**: Base class for all feature storage classes

**Key Classes**:
- `BaseStorage`: Provides common file I/O operations for user-specific data

**Key Methods**:
- `getUserDataPath(userId)`: Get user's data directory
- `ensureUserDataDir(userId)`: Create user directory
- `ensureDirectoryExists(path)`: Create any directory
- `saveUserFile()`: Write JSON file to user directory
- `loadUserFile()`: Read JSON file from user directory with defaults
- `appendToUserFile()`: Append data to existing file
- `deleteUserFile()`: Remove file
- `readDirectory()`: List directory contents
- `getFileSize()`: Get file size in bytes
- `fileExists()`: Check file existence

**Key Features**:
- User-isolated data organization: `userData/users/user-data/{userId}/`
- Automatic directory creation
- JSON serialization/deserialization
- Error handling and graceful fallbacks
- Consistent API for all storage operations
- Date handling (serialization/deserialization)

**Storage Structure**:
```
userData/
├── users/
│   ├── accounts.json              # UserAccountManager
│   ├── current-user.json          # UserAccountManager
│   ├── global/                    # Global data (categories)
│   │   └── categories.json
│   └── user-data/
│       ├── guest/                 # Guest user (cleared on startup)
│       └── user-{uuid}/           # Per-user directories
│           ├── tabs.json
│           ├── preferences.json
│           ├── behavioral-profile.json
│           ├── chat-history.json
│           ├── browsing-history.json
│           ├── content-analyses.json
│           ├── proactive-insights.json
│           ├── raw-activity/
│           │   └── {YYYY-MM-DD}.json
│           └── screenshots/
│               └── {analysisId}-full.png
└── Sessions/                      # Electron session data (automatic)
    ├── guest/
    └── user-{uuid}/
```

**Dependencies**:
- **Uses**: Node.js fs/promises, Electron app.getPath()
- **Used by**: All storage classes (ChatStorage, HistoryStorage, ActivityStorage, etc.)

---

## Shared Types & Utilities

### 📄 src/main/shared/types/ActivityTypes.ts
**Purpose**: Type definitions for all 13 activity types

**Exports**:
- `ActivityType`: Union type of all activity categories
- `RawActivityData`: Base activity record structure
- Type-specific data interfaces for each activity type:
  - `PageVisitData`, `PageInteractionData`, `ClickEventData`
  - `ScrollEventData`, `KeyboardInputData`, `MouseMovementData`
  - `SearchQueryData`, `NavigationEventData`, `TabActionData`
  - `FocusChangeData`, `ChatInteractionData`, `ContentExtractionData`
  - `FormInteractionData`

**Dependencies**:
- **Used by**: ActivityCollector, Tab, activity tracking features

---

## Preload Scripts (Security Layer)

### 📄 src/preload/topbar.ts
**Purpose**: Secure IPC bridge for browser navigation interface

**Exposed APIs** (via window.topBarAPI):
- **Tab Management**: `createTab`, `closeTab`, `switchTab`, `getTabs`
- **Navigation**: `navigateTab`, `goBack`, `goForward`, `reload`
- **Tab Actions**: `tabScreenshot`, `tabRunJs`
- **UI**: `toggleSidebar`
- **User Management**: `createUser`, `switchUser`, `deleteUser`, `updateUser`, `getUsers`, `getCurrentUser`

**Dependencies**:
- **Uses**: @electron-toolkit/preload for secure IPC access
- **Used by**: TopBar React components

**Type Safety**: Companion `.d.ts` file provides complete TypeScript definitions

### 📄 src/preload/sidebar.ts
**Purpose**: Secure IPC bridge for AI chat interface

**Exposed APIs** (via window.sidebarAPI):
- **Chat**: `sendChatMessage`, `clearMessages`, `getMessages`
- **Chat History**: `createChatSession`, `switchChatSession`, `deleteChatSession`, `getChatSessions`, `searchChatSessions`, `clearChatHistory`, `searchChatHistory`
- **Event Listeners**: `onChatResponse`, `onMessagesUpdated`, `onUserChanged`
- **Page Access**: `getPageContent`, `getPageText`, `getCurrentUrl`
- **Tab Info**: `getActiveTabInfo`
- **User Management**: `getUsers`, `getCurrentUser`, `createUser`, `switchUser`, `deleteUser`, `updateUser`
- **History**: `getHistory`, `searchHistory`, `clearHistory`, `removeHistoryEntry`, `navigateToHistory`
- **Insights**: `analyzeUserBehavior`, `getInsights`, `dismissInsight`, `markInsightActedUpon`, `executeInsightAction`, `getSessionTabs`, `saveWorkflow`, `getSavedWorkflows`, `deleteWorkflow`, `executeWorkflow`, `createReminder`, `getReminders`, `completeReminder`, `deleteReminder`

**Dependencies**:
- **Uses**: @electron-toolkit/preload for IPC
- **Used by**: Sidebar React components

**Event Management**:
- Proper listener setup/cleanup for streaming chat responses
- Message update notifications from main process
- User change notifications for state synchronization

### 📄 src/preload/topbar.d.ts & sidebar.d.ts
**Purpose**: TypeScript definitions for preload script APIs

**Interfaces Defined**:
- `TopBarAPI`: All topbar function signatures with proper return types
- `SidebarAPI`: All sidebar function signatures with proper return types
- `TabInfo`: Tab data structure
- `ChatRequest`, `ChatResponse`: Chat message interfaces
- `UserAccount`: User account structure
- `ProactiveInsight`: Insight data structure
- Plus all other data types exposed through IPC

**Global Declarations**:
- Extends `Window` interface with `topBarAPI` and `sidebarAPI` properties
- Provides full type safety for renderer processes

---

## React Applications

### TopBar Application

#### 📄 src/renderer/topbar/src/main.tsx
**Purpose**: TopBar React application entry point

**Key Functions**:
- ReactDOM.createRoot rendering with StrictMode
- Mounts TopBarApp component

#### 📄 src/renderer/topbar/src/TopBarApp.tsx
**Purpose**: Main TopBar component layout

**Key Components**:
- BrowserProvider context wrapper
- UserAccountProvider context wrapper
- TabBar component (40px height)
- AddressBar component (48px height)

**Styling**: Uses app-region-drag for window dragging with app-region-no-drag for interactive elements

#### 📄 src/renderer/topbar/src/contexts/BrowserContext.tsx
**Purpose**: Browser state management and IPC abstraction

**Key Context APIs**:
- **Tab Management**: `createTab`, `closeTab`, `switchTab`, `refreshTabs`
- **Navigation**: `navigateToUrl`, `goBack`, `goForward`, `reload`
- **Tab Actions**: `takeScreenshot`, `runJavaScript`

**State Management**:
- Tabs array with active tab detection
- Loading state tracking
- Automatic tab refresh every 2 seconds
- Error handling with console logging

#### 📄 src/renderer/topbar/src/contexts/UserAccountContext.tsx
**Purpose**: User account state management for topbar

**Key Context APIs**:
- `users`, `currentUser`, `isLoading`
- `createUser`, `switchUser`, `deleteUser`, `updateUser`
- `refreshUsers`

**State Management**:
- User list with current user tracking
- Loading states
- Error handling

#### 📄 src/renderer/topbar/src/components/TabBar.tsx
**Purpose**: Browser tab interface

**Key Components**:
- `TabItem`: Individual tab with favicon, title, close button
- `TabBar`: Tab container with add button

**Features**:
- Tab switching with click handlers
- Close button with hover states
- Favicon loading with fallback
- Add new tab functionality
- macOS traffic light spacing (20px)

#### 📄 src/renderer/topbar/src/components/AddressBar.tsx
**Purpose**: URL input and navigation controls

**Key Features**:
- **Navigation Controls**: Back, forward, reload buttons with loading states
- **Address Input**: URL editing with focus/blur states, auto-protocol detection
- **Smart URL Handling**: Domain detection vs search query routing
- **Sidebar Toggle**: Integrated sidebar control
- **Dark Mode Toggle**: Theme switching
- **User Indicator**: Shows current user with account switcher

**State Management**:
- URL editing state separate from display state
- Focus state for expanded input mode
- Loading state integration with navigation buttons

#### 📄 src/renderer/topbar/src/components/UserIndicator.tsx
**Purpose**: Current user display with account switcher trigger

**Features**:
- Displays current user name or "Guest"
- Click to open account switcher modal
- Visual indication of active user

#### 📄 src/renderer/topbar/src/components/AccountSwitcherModal.tsx
**Purpose**: User account switching interface (TopBar version)

**Features**:
- List all users with current indicator
- Switch user action
- Create new user action
- Delete user action
- Guest user always available

#### 📄 src/renderer/topbar/src/components/UserProfileModal.tsx
**Purpose**: User profile editing interface (TopBar version)

**Features**:
- Edit user name, email, birthday
- Form validation
- Update user information

#### Other TopBar Components:
- `TabBarButton.tsx`: Tab bar action buttons
- `ToolBarButton.tsx`: Toolbar action buttons  
- `Favicon.tsx`: Website favicon display with fallback
- `DarkModeToggle.tsx`: Dark/light mode switching

### Sidebar Application

#### 📄 src/renderer/sidebar/src/main.tsx
**Purpose**: Sidebar React application entry point

**Similar to TopBar main.tsx**, mounts SidebarApp with React StrictMode

#### 📄 src/renderer/sidebar/src/SidebarApp.tsx
**Purpose**: Main sidebar layout with multi-panel interface

**Key Features**:
- Multiple context providers (Chat, ChatHistory, History, Insights, UserAccount)
- Dark mode class application
- Conditional rendering of different panels:
  - Chat (default)
  - Chat History
  - Browsing History
  - Insights
  - Reminders
- Tab navigation at bottom
- Full height container with border

#### 📄 src/renderer/sidebar/src/contexts/ChatContext.tsx
**Purpose**: AI chat state management and IPC integration

**Key Context APIs**:
- **Chat Actions**: `sendMessage`, `clearChat`
- **Content Access**: `getPageContent`, `getPageText`, `getCurrentUrl`
- **Message State**: Automatic message loading and updates

**Message Conversion**:
- CoreMessage format (main process) ↔ Frontend Message format
- Handles text and multimodal content extraction
- Real-time streaming updates via IPC listeners

#### 📄 src/renderer/sidebar/src/contexts/ChatHistoryContext.tsx
**Purpose**: Chat history state management with search

**Key Context APIs**:
- `loadSessions()`, `switchToSession()`, `createNewSession()`
- `deleteSession()`, `clearHistory()`
- `searchSessions()`, `clearSearch()`

**State Management**:
- Sessions list with metadata
- Current session tracking
- Search state with loading indicators
- Vector search integration

#### 📄 src/renderer/sidebar/src/contexts/HistoryContext.tsx
**Purpose**: Browsing history state management

**Key Context APIs**:
- `refreshHistory()`, `searchHistory()`, `clearHistory()`
- `removeEntry()`, `navigateToUrl()`

**State Management**:
- History entries sorted by recency
- Search query tracking
- User change event handling

#### 📄 src/renderer/sidebar/src/contexts/InsightsContext.tsx
**Purpose**: Proactive insights state management

**Key Context APIs**:
- `analyzeUserBehavior()`, `getInsights()`
- `dismissInsight()`, `executeInsightAction()`
- `saveWorkflow()`, `getSavedWorkflows()`, `deleteWorkflow()`, `executeWorkflow()`
- `getSessionTabs()`

**State Management**:
- Insights list with filtering
- Workflows library
- Analysis status tracking
- Session tab preview

#### 📄 src/renderer/sidebar/src/contexts/UserAccountContext.tsx
**Purpose**: User account state management for sidebar

**Key Context APIs**:
- `users`, `currentUser`, `isLoading`
- `createUser`, `switchUser`, `deleteUser`, `updateUser`
- `refreshUsers`

**State Management**:
- User list with current user tracking
- Loading states
- Automatic refresh on user changes

#### 📄 src/renderer/sidebar/src/components/Chat.tsx
**Purpose**: Complete chat interface with AI conversation

**Key Components**:
- `UserMessage`: Right-aligned user messages
- `AssistantMessage`: Left-aligned AI responses with markdown rendering
- `StreamingText`: Real-time typing effect for AI responses
- `ChatInput`: Multi-line input with auto-resize and send button
- `ConversationTurnComponent`: Groups user/assistant message pairs

**Features**:
- **Markdown Rendering**: Full GitHub Flavored Markdown with syntax highlighting
- **Message Streaming**: Live typing animation during AI responses
- **Auto-scrolling**: Smooth scroll to new messages
- **Empty State**: Blueberry emoji with keyboard shortcut hint
- **Responsive Layout**: Auto-sizing input field (max 200px height)

**Message Grouping Logic**:
- Pairs user messages with corresponding AI responses
- Handles standalone assistant messages
- Loading indicators between conversation turns

#### 📄 src/renderer/sidebar/src/components/ChatHistory.tsx
**Purpose**: Complete chat history management interface with search

**Key Features**:
- **Session List**: All conversation sessions with metadata
- **Smart Search**: Integrated ChatSearchBar for semantic/exact search
- **Session Management**: Create, switch, delete conversations
- **Rich Metadata Display**: Message counts, timestamps, response times, context URLs
- **Clear All**: Bulk deletion with confirmation

**Session Display**:
- Title with truncation
- Current session badge
- Last active timestamp (formatted)
- Message count and average response time
- Context URLs (up to 2 shown + "more" indicator)
- Delete button (hover to reveal)

#### 📄 src/renderer/sidebar/src/components/ChatSearchBar.tsx
**Purpose**: Smart search UI component for chat history

**Key Features**:
- **Dual Search Modes**: Semantic vector search (default) or exact text match (quotes)
- **Date Range Filtering**: Optional from/to date filters with calendar UI
- **Debounced Input**: 500ms debounce to prevent excessive searches
- **Smart Indicators**: Visual feedback for search mode (semantic/exact/date-only)
- **Auto-clear**: X button to clear all filters and return to full list

#### 📄 src/renderer/sidebar/src/components/History.tsx
**Purpose**: Complete browsing history UI with search and management

**Key Components**:
- `HistoryEntry`: Individual history item with favicon, title, domain, time, remove button
- `History`: Main history interface with search, actions, scrollable list

**Features**:
- **3-Column Layout**: Favicon | Title + Domain | Timestamp + Remove
- **Smart Time Formatting**: "Just now", "5m ago", "2h ago", "Yesterday", "3 days ago"
- **Real-time Search**: Filter by title or URL with 300ms debounce
- **Manual Refresh**: Button to force reload history data
- **Bulk Clear**: Confirmation dialog with 3-second auto-hide
- **Smart Navigation**: Reuses existing tabs instead of creating duplicates

#### 📄 src/renderer/sidebar/src/components/Insights.tsx
**Purpose**: Proactive insights interface with pattern detection and workflows

**Key Features**:
- **Insight Display**: Show detected patterns with relevance scores
- **Filtering**: Filter by type (workflow, research, abandoned, habit)
- **Sorting**: Sort by date or relevance
- **Actions**: Execute insights, save workflows, dismiss insights
- **Session Preview**: View tabs from detected sessions
- **Workflow Library**: Manage saved workflows
- **Status Tracking**: Track insight completion and progress

**Insight Types Display**:
- Workflow patterns with open action
- Research sessions with continue action
- Abandoned tasks with resume action
- Habit patterns with informational display

#### 📄 src/renderer/sidebar/src/components/Reminders.tsx
**Purpose**: Task reminder interface with completion tracking

**Key Features**:
- **Reminder List**: Active and completed reminders
- **Execution**: One-click to execute reminder action
- **Completion**: Mark as complete
- **Deletion**: Remove reminders
- **Filtering**: Toggle completed reminders visibility
- **Auto-refresh**: Updates on user change

#### 📄 src/renderer/sidebar/src/components/Toast.tsx
**Purpose**: Toast notification system

**Features**:
- Success, error, info, warning variants
- Auto-dismiss after timeout
- Manual close button
- Positioned at bottom-right

#### Other Sidebar Components:
- `AccountCreationModal.tsx`: Create new user accounts
- `AccountSwitcherModal.tsx`: Switch between users (sidebar version)
- `UserProfileModal.tsx`: Edit user profile (sidebar version)

### Common Components & Utilities

#### 📄 src/renderer/common/components/Button.tsx
**Purpose**: Reusable button component with design system variants

**Features**:
- **Variants**: default, destructive, outline, secondary, ghost, link
- **Sizes**: xs, sm, default, lg, icon, icon-xs
- **Advanced Features**: asChild prop for polymorphic rendering, focus-visible states, aria-invalid support

**Design System**:
- Consistent with Tailwind CSS design tokens
- Dark mode support built-in
- Accessibility features (focus rings, disabled states)

#### 📄 src/renderer/common/hooks/useDarkMode.ts
**Purpose**: Dark mode state management with cross-process synchronization

**Features**:
- **Persistence**: localStorage integration
- **System Preference**: Respects OS dark mode setting
- **Cross-Process Sync**: IPC broadcasting to all windows
- **DOM Integration**: Automatic 'dark' class application

**Event Handling**:
- Listens for dark mode updates from other processes
- Sends dark mode changes to main process for broadcasting
- Proper cleanup of IPC listeners

#### 📄 src/renderer/common/lib/utils.ts
**Purpose**: Utility functions for styling and class management

**Key Functions**:
- `cn()`: Tailwind CSS class merging with conflict resolution

---

## Build Configuration

### package.json
**Purpose**: Project configuration, dependencies, and build scripts

**Key Scripts**:
- `dev`: Development mode with hot reload
- `build`: TypeScript compilation + Vite build
- `typecheck`: Multi-target TypeScript validation
- Platform builds: `build:mac`, `build:win`, `build:linux`

**Dependencies**:
- **AI**: @ai-sdk/openai, @ai-sdk/anthropic, ai
- **Vector Search**: vectordb (LanceDB), @huggingface/transformers
- **Electron**: electron, @electron-toolkit/utils
- **React**: react, react-dom, @vitejs/plugin-react
- **Styling**: tailwindcss, class-variance-authority
- **Markdown**: react-markdown, remark-gfm

### electron.vite.config.ts
**Purpose**: Vite build configuration for Electron

**Build Targets**:
- **Main**: Electron main process (externalized deps)
- **Preload**: Multiple preload scripts (topbar.ts, sidebar.ts)
- **Renderer**: Multiple React apps (topbar, sidebar)

**Path Aliases**:
- `@renderer`: src/renderer/src
- `@common`: src/renderer/common

---

## File Dependencies Summary

### Import Hierarchies

**Main Process Dependencies**:
```
index.ts → Window, Menu, IPCRegistry
Window → Tab, TopBar, SideBar, UserAccountManager, all storage classes, all feature managers
IPCRegistry → All IPC handlers from features
Feature Managers → Storage classes, other dependencies
```

**Feature Dependencies**:
```
ActivityCollector → ActivityStorage
ContentAnalyzer → ContentStorage, HistoryStorage, CategoryManager, VectorSearchManager
ProactiveInsightsManager → InsightsStorage, ActivityStorage, ContentStorage, VectorSearchManager
LLMClient → ChatStorage, UserAccountManager, VectorSearchManager
VectorSearchManager → (standalone, local dependencies)
```

**Renderer Dependencies**:
```
TopBar: main.tsx → TopBarApp → BrowserContext + UserAccountContext → topBarAPI (preload)
Sidebar: main.tsx → SidebarApp → Multiple Contexts → sidebarAPI (preload)
Common: All renderers use common components, hooks, utilities
```

**IPC Communication Flow**:
```
Renderer → Preload Script → IPC Handler → Feature Module → Back to Renderer
```

This modular architecture enables clean separation of concerns, easy testing, and maintainable code while ensuring security and performance.
