# Blueberry Browser Architecture

## Electron Framework Overview

### What is Electron?

Electron is a framework that enables developers to build desktop applications using web technologies (HTML, CSS, JavaScript/TypeScript). It combines the Chromium rendering engine and the Node.js runtime, allowing developers to use web development skills to create native desktop applications.

### Core Electron Concepts

#### Process Model
Electron applications run in a **multi-process architecture**:

1. **Main Process**: The heart of the application that controls the application lifecycle, creates renderer processes, and manages system-level operations. There's only one main process per application.

2. **Renderer Processes**: Each BrowserWindow creates a separate renderer process that displays the user interface using web technologies. Multiple renderer processes can exist.

3. **Preload Scripts**: Security-conscious bridge layer that runs in the renderer context but has access to Node.js APIs. They expose a limited, secure API to the renderer process.

#### Security Model
Modern Electron applications use a strict security model:
- **Context Isolation**: Renderer processes run in an isolated context, preventing direct access to Node.js APIs
- **Sandbox Mode**: Renderer processes run in a sandboxed environment similar to web browsers
- **Preload Scripts**: The only secure way to bridge main and renderer processes

#### Inter-Process Communication (IPC)
Communication between processes happens through IPC channels:
- **ipcMain**: Main process side of IPC communication
- **ipcRenderer**: Renderer process side of IPC communication (accessed via preload scripts)
- **invoke/handle**: Promise-based request-response pattern
- **send/on**: Event-based one-way communication

---

## Blueberry Browser Implementation

### Architecture Overview

Blueberry Browser implements a sophisticated multi-window Electron architecture designed for AI-powered web browsing. The application uses Electron's BaseWindow with multiple WebContentsViews to create a flexible, performant browser interface.

```
┌─────────────────────────────────────────────────────────────┐
│                    Main Process                             │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │   Window    │  │ EventManager │  │      LLMClient      │ │
│  │  Manager    │  │   (IPC Hub)  │  │   (AI Features)     │ │
│  └─────────────┘  └──────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
           ┌────────────────┼────────────────┐
           │                │                │
    ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
    │   TopBar    │  │   Sidebar   │  │    Tabs     │
    │ (Renderer)  │  │ (Renderer)  │  │ (Multiple)  │
    │             │  │             │  │             │
    └─────────────┘  └─────────────┘  └─────────────┘
```

### Process Structure

#### Main Process Architecture
The main process (`src/main/`) orchestrates the entire application:

- **`index.ts`**: Application entry point, handles lifecycle events
- **`Window.ts`**: Manages BaseWindow with multiple WebContentsViews and user account integration
- **`EventManager.ts`**: Central IPC hub handling all communication including user account management
- **`Tab.ts`**: Individual tab management with user-specific session partitioning
- **`TopBar.ts`** & **`SideBar.ts`**: UI component managers
- **`LLMClient.ts`**: AI integration with user-specific chat history management
- **`Menu.ts`**: Application menu and keyboard shortcuts
- **`UserAccountManager.ts`**: Core user account management with session isolation
- **`UserDataManager.ts`**: User-specific data persistence and file system operations
- **`ActivityCollector.ts`**: Buffered collection and processing of user activity data
- **`ActivityTypes.ts`**: Comprehensive type definitions for 13 activity categories

#### Renderer Processes
The application runs three types of renderer processes:

1. **TopBar Renderer** (`src/renderer/topbar/`): Browser navigation interface
2. **Sidebar Renderer** (`src/renderer/sidebar/`): AI chat interface  
3. **Tab Renderers**: Individual web pages being browsed

#### Preload Scripts Security Layer
Two preload scripts (`src/preload/`) provide secure IPC bridges:

- **`topbar.ts`**: Exposes tab management, navigation, and user account management APIs
- **`sidebar.ts`**: Exposes AI chat, content extraction, and user account status APIs

---

## Component Interaction Flow

### Application Startup Sequence

1. **Main Process Initialization** (`index.ts`):
   ```typescript
   app.whenReady() → createWindow() → new Window()
   ```

2. **Window Setup** (`Window.ts`):
   ```typescript
   new BaseWindow() → new UserDataManager() → new UserAccountManager() → 
   new TopBar() → new SideBar() → createTab()
   ```

3. **Component Loading**:
   - TopBar loads React app via WebContentsView
   - Sidebar loads React app with AI client
   - First tab loads with default URL (Google)

4. **IPC Registration** (`EventManager.ts`):
   - Registers all IPC handlers for tab management
   - Sets up AI chat message handling
   - Configures page content extraction

### User Interaction Flow

#### Tab Creation Example:
```
User clicks "+" button (TopBar)
    ↓
TopBar React → topBarAPI.createTab()
    ↓
Preload Script → ipcRenderer.invoke("create-tab")
    ↓
EventManager → mainWindow.createTab()
    ↓
Window → new Tab() → BaseWindow.addChildView()
    ↓
Tab appears in browser
```

#### AI Chat Example:
```
User sends message (Sidebar)
    ↓
Chat Component → sidebarAPI.sendChatMessage()
    ↓
Preload Script → ipcRenderer.invoke("sidebar-chat-message")
    ↓
EventManager → sidebar.client.sendChatMessage()
    ↓
LLMClient → captures screenshot → gets page content → sends to AI
    ↓
Streaming response → WebContents.send("chat-response")
    ↓
Sidebar updates UI with AI response
```

---

## Activity Tracking Architecture

### Overview
The activity tracking system implements comprehensive user behavior monitoring through a multi-layered architecture that captures, buffers, and persists detailed interaction data while maintaining performance and privacy.

### Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Main Process                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │ActivityCollector│  │  ActivityTypes  │  │UserDataMgr  │  │
│  │   (Buffering)   │  │ (Type Defs)     │  │(Persistence)│  │
│  └─────────────────┘  └─────────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
           ┌────────────────┼────────────────┐
           │                │                │
    ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
    │ Tab Process │  │   TopBar    │  │   Sidebar   │
    │ (Activity   │  │ (Navigation │  │ (Chat       │
    │  Injection) │  │  Tracking)  │  │  Tracking)  │
    └─────────────┘  └─────────────┘  └─────────────┘
```

### Activity Collection Flow

#### Data Collection Pipeline
1. **Event Capture**: Browser events and injected page scripts capture user interactions
2. **Data Structuring**: Raw events converted to typed ActivityData structures
3. **Buffered Collection**: ActivityCollector buffers activities in memory
4. **Periodic Flushing**: Buffer automatically flushed every 30 seconds or when full
5. **Persistent Storage**: UserDataManager saves to daily JSON files per user

#### Activity Categories
The system tracks 13 comprehensive activity types:
- **Navigation**: `page_visit`, `navigation_event`, `tab_action`
- **Interaction**: `click_event`, `scroll_event`, `keyboard_input`, `mouse_movement`
- **Context**: `focus_change`, `page_interaction`, `content_extraction`
- **Features**: `search_query`, `chat_interaction`, `form_interaction`

#### Performance Optimizations
- **Buffered Collection**: Memory buffer (50 items) prevents I/O bottlenecks
- **Throttled Events**: Mouse movements (100ms), scrolls (500ms), keyboard (2s debounce)
- **Daily File Rotation**: Separate JSON files per day for efficient access
- **Session Grouping**: Activities grouped by session ID for analysis

### Integration Points

#### Tab-Level Integration
```typescript
// Window.ts - Activity collector per tab
createTab(url) → {
  const activityCollector = new ActivityCollector(userDataManager, currentUser.id)
  tab.setActivityCallback((activity) => activityCollector.collectActivity(activity))
}
```

#### In-Page Monitoring
```typescript
// Tab.ts - Inject monitoring scripts
webContents.on('did-finish-load', () => {
  injectActivityScript() // Monitors clicks, scrolls, keyboard
})
```

#### Chat System Integration
```typescript
// LLMClient.ts - Track AI interactions
sendChatMessage(request) → {
  activityCollector.collectActivity('chat_interaction', {
    userMessage: request.message,
    contextUrl: activeTab?.url,
    conversationLength: messages.length
  })
}
```

### Data Storage Architecture

#### File Structure
```
users/user-data/{userId}/raw-activity/
├── 2025-09-29.json    # Daily activity logs
├── 2025-09-30.json    # Automatic file rotation
└── 2025-10-01.json    # One file per day
```

#### Activity Record Schema
```typescript
interface RawActivityData {
  id: string;           // Unique activity identifier
  userId: string;       // User account isolation
  timestamp: Date;      // Precise timing
  sessionId: string;    // Browser session grouping
  type: ActivityType;   // One of 13 activity categories
  data: any;           // Type-specific payload
}
```

### Privacy & Security

#### User Isolation
- Complete activity separation between user accounts
- Guest user activities cleared on app restart
- No cross-user data leakage possible

#### Local-Only Storage
- All activity data stored locally
- No external transmission or cloud storage
- User maintains complete control over data

#### Session Management
- Activities grouped by browser session
- Session IDs prevent cross-session correlation attacks
- Automatic session rotation on app restart

---

## Chat History Architecture

### Overview
The chat history system implements a session-based architecture for organizing AI conversations with comprehensive metadata tracking. This enables multiple conversation threads, performance analytics, and context preservation across user sessions.

### Component Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    Main Process                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │   LLMClient     │  │UserDataManager  │  │EventManager │  │
│  │  (Message       │  │  (Persistence)  │  │  (IPC Hub)  │  │
│  │   Handling)     │  │                 │  │             │  │
│  └─────────────────┘  └─────────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
           ┌────────────────┼────────────────┐
           │                │                │
    ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
    │   Sidebar   │  │ChatHistory  │  │ChatHistory  │
    │    (Chat    │  │   Context   │  │     UI      │
    │  Interface) │  │   (State)   │  │ (Sessions)  │
    └─────────────┘  └─────────────┘  └─────────────┘
```

### Data Model

#### Session-Based Organization
- **ChatSession**: Container for related messages with metadata
- **ChatMessage**: Individual messages with timestamps and context
- **ChatHistory**: Complete user chat data with all sessions and messages

#### Metadata Tracking
Each session tracks:
- Message count and timestamps
- Context URLs from browsing
- Average AI response time
- Total conversation duration
- Last activity timestamp

### Persistence Architecture

#### Single-File Storage
All chat data stored in one JSON file per user:
```
users/user-data/{userId}/chat-history.json
```

**Benefits**:
- Atomic reads/writes for consistency
- Simple backup and restore
- Easy to migrate or export
- No database complexity

**Structure**:
```json
{
  "sessions": [...],      // All conversation sessions
  "messages": [...],      // All messages (linked by sessionId)
  "currentSessionId": "session-123",
  "totalConversations": 15,
  "totalMessages": 127,
  "createdAt": "2025-09-15T08:00:00.000Z",
  "updatedAt": "2025-09-30T15:20:00.000Z"
}
```

### Message Flow Architecture

#### Message Creation and Persistence
```
User sends message (Sidebar)
    ↓
LLMClient.sendChatMessage()
    ↓
1. Capture context (URL, screenshot, page text)
2. Create CoreMessage with multimodal content
3. Add to in-memory messages array
4. Save to disk via UserDataManager.addChatMessage()
    ↓
UserDataManager processes:
    - Create ChatMessage with ID and timestamp
    - Append to messages array
    - Update session metadata
    - Update response time metrics
    - Write to disk (atomic operation)
    ↓
Stream AI response
    ↓
Save assistant message with response time
    ↓
Update UI with complete conversation
```

#### Session Switching Architecture
```
User selects session (ChatHistory UI)
    ↓
ChatHistoryContext.switchToSession()
    ↓
IPC call to main process
    ↓
UserDataManager.setCurrentSessionId()
    - Update currentSessionId in history
    - Update session.lastActiveAt
    - Persist to disk
    ↓
LLMClient.loadCurrentUserMessages()
    - Load session messages from UserDataManager
    - Convert to CoreMessage format
    - Send to renderer
    ↓
UI updates with session messages
```

### Integration Points

#### User Account Integration
- Complete chat history isolation per user
- Automatic loading on user switch
- Guest user history cleared on restart
- Session IDs scoped to user accounts

#### Activity Tracking Integration
- Chat interactions recorded as activity data
- Response times tracked for analytics
- Context URLs linked to browsing history
- Message patterns available for profiling

#### LLMClient Integration
- Automatic message persistence on send
- Session metadata updated in real-time
- Context preservation across sessions
- In-memory message array synced with disk

### Performance Characteristics

#### Read Operations
- **Load Sessions**: O(1) file read + O(n) session sort
- **Load Messages**: O(1) file read + O(m) filter by sessionId
- **Switch Session**: O(1) file write + message load

#### Write Operations
- **Add Message**: O(1) append + O(1) metadata update + O(1) file write
- **Create Session**: O(1) append + O(1) file write
- **Clear History**: O(1) file write (overwrite with empty)

#### Optimizations
- Lazy loading: Only current session messages in memory
- Filtered display: Hide empty sessions in UI
- Sorted sessions: Pre-sorted by lastActiveAt
- Minimal IPC: Batch operations where possible

### Security Model

#### Data Protection
- Local-only storage (no cloud sync)
- User isolation through file system
- No cross-user data access
- Session IDs cryptographically random

#### Privacy Features
- Guest user automatic cleanup
- Clear all history with confirmation
- No external data transmission
- Complete user control over data

---

## User Account Management Architecture

### Overview
Blueberry Browser provides complete user isolation through a sophisticated account management system. Each user gets their own session partition, data storage, chat history, and tab management, ensuring complete privacy between users.

### Key Components

#### UserAccountManager
- **Purpose**: Core user account logic and switching
- **Features**:
  - Guest user (always fresh, like incognito mode)
  - User persistence across app restarts  
  - Tab management during user switching
  - Session partition isolation
  - Maximum 10 users limit

#### UserDataManager
- **Purpose**: File system operations and data persistence
- **Features**:
  - User-specific chat history
  - Tab state persistence
  - User preferences (dummy interfaces for now)
  - Browsing history (dummy interfaces for now)
  - Behavioral profiles (dummy interfaces for now)

### User Account Flow

#### User Switching with Tab Management
```
User clicks account switcher → UI calls switchUser(userId, options)
    ↓
UserAccountManager.switchUser():
    - Save current user's chat history if needed
    - Set new currentUserId
    - Handle tab switching based on options
    ↓
Window.switchUser():
    - If keepCurrentTabs: reload all tabs with new session partition
    - If not: close current tabs, load user's saved tabs
    ↓
LLMClient.handleUserSwitch():
    - Load new user's chat history
    - Update UI with user-specific messages
    ↓
EventManager.broadcastUserChange():
    - Notify all renderer processes of user change
```

#### Session Partitioning
Each user gets a unique Electron session partition:
```typescript
const sessionPartition = `persist:user-${userId}`;
// Guest user: "persist:guest"
```

This isolates:
- Cookies and localStorage
- Cache and IndexedDB
- Service Workers
- Network requests and responses

#### Data Storage Structure
```
userData/
├── users/
│   ├── accounts.json              # All user accounts metadata  
│   ├── current-user.json          # Last active non-guest user
│   └── user-data/
│       ├── guest/                 # Always cleared on startup
│       │   ├── chat-history.json
│       │   └── tabs.json
│       ├── user-123/
│       │   ├── chat-history.json
│       │   ├── tabs.json
│       │   ├── preferences.json
│       │   ├── browsing-history.json
│       │   └── behavioral-profile.json
│       └── user-456/
│           └── ... (same structure)
└── Sessions/                      # Electron session data (automatic)
    ├── guest/                     # Guest session partition
    ├── user-123/                  # User session partition
    └── user-456/
```

### Guest User Behavior
- **Always Fresh**: Guest user data is cleared on every app startup
- **Incognito-like**: No persistence of browsing data, cookies, or chat history
- **Always Available**: Guest user is always present for immediate browsing
- **Tab Management**: Guest user tabs are never saved between sessions

### User Persistence
- **Startup Behavior**: If a non-guest user was active last time, they become the current user
- **Guest Availability**: Guest user is always created fresh and available for switching
- **Tab Restoration**: Users can choose to keep current tabs or load their saved tabs when switching

---

## Development Server Architecture

### Hot Reload Development
When running `pnpm dev`, the development environment orchestrates multiple processes:

1. **Electron-Vite Dev Server**:
   - Serves TopBar React app on `http://localhost:5173/topbar/`
   - Serves Sidebar React app on `http://localhost:5173/sidebar/`
   - Provides hot module replacement (HMR)

2. **Main Process Compilation**:
   - TypeScript compilation with `tsc --watch`
   - Automatic Electron process restart on changes

3. **Preload Script Building**:
   - Compiled to `/out/preload/` directory
   - Loaded by WebContentsViews for secure IPC

### Build System

The production build process:
1. **TypeScript Compilation**: All source files compiled to `/out/`
2. **Renderer Bundling**: React apps bundled with Vite
3. **Electron Packaging**: electron-builder creates platform-specific distributables

---

## Security Implementation

### Context Isolation
All renderer processes run with `contextIsolation: true`:
```typescript
new WebContentsView({
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,  // Isolates renderer from Node.js
    sandbox: false,          // Disabled only for preload access
  }
})
```

### Preload Script API Surface
The preload scripts expose minimal, typed APIs:

**TopBar API**:
- Tab management (create, close, switch)
- Navigation (back, forward, reload)
- Screenshot and JavaScript execution

**Sidebar API**:
- AI chat message sending
- Page content extraction
- Tab information access

### IPC Security
All IPC communication uses the secure `invoke/handle` pattern with proper parameter validation in the main process.

---

## Performance Considerations

### Memory Management
- **Tab Isolation**: Each tab runs in its own process
- **Automatic Cleanup**: EventManager.cleanup() removes all listeners
- **View Management**: WebContentsViews properly added/removed from BaseWindow

### Process Optimization
- **Lightweight Main Process**: Business logic in renderer processes where possible
- **Efficient IPC**: Minimal data transfer, event-based updates
- **Streaming Responses**: AI responses streamed to avoid blocking

### Resource Monitoring
- **Tab Memory**: Each tab's memory isolated and manageable
- **AI Context**: Limited context length to control API costs
- **Screenshot Optimization**: Captured only when needed for AI

---

## Development Workflow

### Running the Application
```bash
pnpm dev          # Start development mode with hot reload
pnpm build        # Build for production
pnpm typecheck    # Validate TypeScript across all processes
```

### Debugging Different Processes
- **Main Process**: VS Code debugger or console.log in terminal
- **Renderer Processes**: Chrome DevTools (automatically opens in dev mode)
- **IPC Communication**: Log messages in both main and renderer sides

### Adding New Features
1. **IPC Handlers**: Add to EventManager.ts
2. **Preload APIs**: Extend preload scripts with proper TypeScript types
3. **UI Components**: Add to respective renderer directories
4. **Main Logic**: Implement in appropriate main process classes

This architecture provides a solid foundation for building advanced browser features while maintaining security, performance, and maintainability.
