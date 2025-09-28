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
