# File Structure & Analysis

This document provides a comprehensive analysis of all source files in the Blueberry Browser repository, organized by functional groupings.

---

## Application Core & Lifecycle

### 📄 src/main/index.ts
**Purpose**: Main application entry point and lifecycle management

**Key Functions**:
- `createWindow()`: Instantiates main Window, AppMenu, and EventManager
- App lifecycle handlers for `whenReady`, `activate`, `window-all-closed`

**Dependencies**:
- **Uses**: Window, AppMenu, EventManager classes
- **Used by**: Electron framework (application entry point)

**Runtime Behavior**:
- Sets app user model ID for Windows taskbar integration
- Creates main window on app ready
- Handles macOS dock icon re-activation
- Performs cleanup on window closure (EventManager cleanup, reference nulling)

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
**Purpose**: Main window management with multiple WebContentsViews

**Key Classes**:
- `Window`: Manages BaseWindow container with TopBar, SideBar, and multiple Tabs

**Key Methods**:
- `createTab(url?: string)`: Creates new Tab instance and adds to BaseWindow
- `closeTab(tabId: string)`: Removes and destroys tab, handles active tab switching
- `switchActiveTab(tabId: string)`: Shows/hides tabs, updates window title
- `updateAllBounds()`: Recalculates layout when sidebar toggles

**Dependencies**:
- **Uses**: Tab, TopBar, SideBar classes
- **Used by**: index.ts (main entry), EventManager (via IPC), Menu (via menu actions)

**Layout Management**:
- BaseWindow with hidden title bar and traffic light positioning for macOS
- TopBar at top (88px height)
- Sidebar on right (400px width, toggleable)
- Tabs fill remaining space with automatic bounds calculation

**Memory Management**:
- Maintains tabsMap for O(1) tab lookups
- Proper cleanup of WebContentsView references on window close
- External link handling via shell.openExternal

### 📄 src/main/Tab.ts
**Purpose**: Individual browser tab with web content

**Key Classes**:
- `Tab`: Wraps WebContentsView with browser functionality

**Key Methods**:
- `loadURL(url: string)`: Navigates to URL
- `screenshot()`: Captures page screenshot as NativeImage
- `runJs(code: string)`: Executes JavaScript in page context
- `getTabHtml()`: Extracts full page HTML
- `getTabText()`: Extracts readable text content
- Navigation methods: `goBack()`, `goForward()`, `reload()`, `stop()`

**Dependencies**:
- **Uses**: Electron WebContentsView
- **Used by**: Window (tab creation/management), EventManager (via IPC calls)

**Security Configuration**:
- Sandboxed environment (`sandbox: true`)
- Context isolation enabled
- No Node.js integration in renderer
- Web security enabled

**Event Handling**:
- Automatic title and URL tracking via navigation events
- `page-title-updated`, `did-navigate`, `did-navigate-in-page`

### 📄 src/main/TopBar.ts
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
- Dev mode: Loads from Vite dev server (`/topbar/`)
- Production: Loads from `../renderer/topbar.html`

### 📄 src/main/SideBar.ts
**Purpose**: AI chat interface container

**Key Classes**:
- `SideBar`: Manages WebContentsView for sidebar React app and LLMClient

**Key Methods**:
- `toggle()`, `show()`, `hide()`: Visibility management
- `updateBounds()`: 400px width positioning on right side
- `getIsVisible()`: State access for layout calculations

**Dependencies**:
- **Uses**: LLMClient for AI functionality, sidebar.js preload script
- **Used by**: Window class, EventManager (for IPC toggle operations)

**Layout Behavior**:
- Right-aligned 400px width when visible
- Zero-sized bounds when hidden
- Automatic bounds recalculation on window resize

---

## Inter-Process Communication

### 📄 src/main/EventManager.ts
**Purpose**: Central IPC hub managing all main↔renderer communication

**Key Classes**:
- `EventManager`: Registers and handles all IPC channels

**Key Method Groups**:
- `handleTabEvents()`: Tab lifecycle, navigation, actions (screenshot, JS execution)
- `handleSidebarEvents()`: AI chat, sidebar toggle
- `handlePageContentEvents()`: Page content and text extraction
- `handleDarkModeEvents()`: Dark mode synchronization across processes
- `handleDebugEvents()`: Development utilities

**Dependencies**:
- **Uses**: Window class (accesses all components via window instance)
- **Used by**: index.ts (instantiated with main window)

**IPC Channel Mapping**:
```
Tab Management: create-tab, close-tab, switch-tab, get-tabs
Navigation: navigate-tab, tab-go-back, tab-go-forward, tab-reload  
Tab Actions: tab-screenshot, tab-run-js
Sidebar: toggle-sidebar, sidebar-chat-message, sidebar-clear-chat
Content: get-page-content, get-page-text, get-current-url
Dark Mode: dark-mode-changed (→ broadcast to all processes)
```

**Error Handling**:
- Try-catch blocks around async operations
- Console error logging with context
- Null checks for active tab operations

### 📄 src/preload/topbar.ts
**Purpose**: Secure IPC bridge for browser navigation interface

**Exposed APIs**:
- **Tab Management**: `createTab`, `closeTab`, `switchTab`, `getTabs`
- **Navigation**: `navigateTab`, `goBack`, `goForward`, `reload`
- **Tab Actions**: `tabScreenshot`, `tabRunJs`
- **Sidebar**: `toggleSidebar`

**Dependencies**:
- **Uses**: @electron-toolkit/preload for secure IPC access
- **Used by**: TopBar React components via `window.topBarAPI`

**Type Safety**: Companion `.d.ts` file provides complete TypeScript definitions

### 📄 src/preload/sidebar.ts
**Purpose**: Secure IPC bridge for AI chat interface

**Exposed APIs**:
- **Chat**: `sendChatMessage`, `clearChat`, `getMessages`
- **Event Listeners**: `onChatResponse`, `onMessagesUpdated`
- **Page Access**: `getPageContent`, `getPageText`, `getCurrentUrl`
- **Tab Info**: `getActiveTabInfo`

**Dependencies**:
- **Uses**: @electron-toolkit/preload for IPC, custom ChatRequest/ChatResponse interfaces
- **Used by**: Sidebar React components via `window.sidebarAPI`

**Event Management**:
- Proper listener setup/cleanup for streaming chat responses
- Message update notifications from main process

### 📄 src/preload/topbar.d.ts & sidebar.d.ts
**Purpose**: TypeScript definitions for preload script APIs

**Interfaces Defined**:
- `TopBarAPI`: All topbar function signatures with proper return types
- `SidebarAPI`: All sidebar function signatures with proper return types
- `TabInfo`: Tab data structure
- `ChatRequest`, `ChatResponse`: Chat message interfaces

**Global Declarations**:
- Extends `Window` interface with `topBarAPI` and `sidebarAPI` properties
- Provides full type safety for renderer processes

---

## AI Integration

### 📄 src/main/LLMClient.ts
**Purpose**: AI language model integration with context awareness

**Key Classes**:
- `LLMClient`: Manages OpenAI/Anthropic API communication with streaming

**Key Methods**:
- `sendChatMessage(request: ChatRequest)`: Main AI interaction entry point
- `streamResponse()`: Handles AI response streaming with real-time updates
- `prepareMessagesWithContext()`: Builds conversation with page context
- `buildSystemPrompt()`: Creates context-aware system message

**Dependencies**:
- **Uses**: ai SDK (streamText), @ai-sdk/openai, @ai-sdk/anthropic, Window (for screenshots/content)
- **Used by**: SideBar class, EventManager (via chat IPC)

**AI Provider Support**:
- OpenAI (default): GPT-5-mini model
- Anthropic: Claude 4 Sonnet model
- Environment variable configuration (`LLM_PROVIDER`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`)

**Context Integration**:
- Automatic screenshot capture of active tab
- Page text extraction for AI context
- URL and content truncation (4000 char limit)
- Multi-modal support (image + text messages)

**Streaming Architecture**:
- Real-time token streaming to renderer
- Message state management with CoreMessage format
- Error handling with user-friendly messages
- Rate limiting and authentication error handling

**Message Flow**:
1. Screenshot capture → Page text extraction → Context building
2. System prompt generation with page context
3. Streaming API call with conversation history
4. Real-time updates to renderer via IPC
5. Final message storage in conversation history

---

## React Applications

### TopBar Application

#### 📄 src/renderer/topbar/src/main.tsx
**Purpose**: TopBar React application entry point

**Key Functions**:
- ReactDOM.createRoot rendering with StrictMode
- Mounts TopBarApp component

**Dependencies**:
- **Uses**: TopBarApp, index.css
- **Used by**: Electron TopBar WebContentsView

#### 📄 src/renderer/topbar/src/TopBarApp.tsx
**Purpose**: Main TopBar component layout

**Key Components**:
- BrowserProvider context wrapper
- TabBar component (40px height)
- AddressBar component (48px height)

**Dependencies**:
- **Uses**: BrowserContext, TabBar, AddressBar
- **Used by**: main.tsx

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

**Dependencies**:
- **Uses**: topBarAPI from preload script
- **Used by**: All TopBar components

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

**Dependencies**:
- **Uses**: BrowserContext, Favicon, TabBarButton components
- **Used by**: TopBarApp

#### 📄 src/renderer/topbar/src/components/AddressBar.tsx
**Purpose**: URL input and navigation controls

**Key Features**:
- **Navigation Controls**: Back, forward, reload buttons with loading states
- **Address Input**: URL editing with focus/blur states, auto-protocol detection
- **Smart URL Handling**: Domain detection vs search query routing
- **Sidebar Toggle**: Integrated sidebar control
- **Dark Mode Toggle**: Theme switching

**State Management**:
- URL editing state separate from display state
- Focus state for expanded input mode
- Loading state integration with navigation buttons

**Dependencies**:
- **Uses**: BrowserContext, ToolBarButton, Favicon, DarkModeToggle
- **Used by**: TopBarApp

#### 📄 src/renderer/topbar/src/components/TabBarButton.tsx
**Purpose**: Tab bar action buttons (add tab)

**Features**:
- Icon-based button with hover states
- app-region-no-drag for clickability
- Consistent styling with toolbar buttons

#### 📄 src/renderer/topbar/src/components/ToolBarButton.tsx
**Purpose**: Toolbar action buttons (navigation, reload, etc.)

**Features**:
- Active/inactive state handling
- Toggle state support
- Icon or children content
- Disabled state styling

#### 📄 src/renderer/topbar/src/components/Favicon.tsx
**Purpose**: Website favicon display with fallback

**Features**:
- Image loading with error handling
- Globe icon fallback
- 16x16px consistent sizing

#### 📄 src/renderer/topbar/src/components/DarkModeToggle.tsx
**Purpose**: Dark/light mode switching

**Features**:
- Sun/moon icon toggle
- Integration with common useDarkMode hook
- IPC broadcast for cross-process synchronization

### Sidebar Application

#### 📄 src/renderer/sidebar/src/main.tsx
**Purpose**: Sidebar React application entry point

**Similar to TopBar main.tsx**, mounts SidebarApp with React StrictMode

#### 📄 src/renderer/sidebar/src/SidebarApp.tsx
**Purpose**: Main sidebar layout with chat interface

**Key Features**:
- ChatProvider context wrapper
- Dark mode class application
- Chat component integration
- Full height container with border

**Dependencies**:
- **Uses**: ChatContext, Chat component, useDarkMode hook
- **Used by**: main.tsx

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

**Dependencies**:
- **Uses**: sidebarAPI from preload script
- **Used by**: Chat component

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

**Dependencies**:
- **Uses**: ChatContext, react-markdown, remark plugins, Lucide icons
- **Used by**: SidebarApp

---

## Shared Components

### 📄 src/renderer/common/components/Button.tsx
**Purpose**: Reusable button component with design system variants

**Features**:
- **Variants**: default, destructive, outline, secondary, ghost, link
- **Sizes**: xs, sm, default, lg, icon, icon-xs
- **Advanced Features**: asChild prop for polymorphic rendering, focus-visible states, aria-invalid support

**Dependencies**:
- **Uses**: Radix UI Slot, class-variance-authority, utils
- **Used by**: Sidebar Chat component

**Design System**:
- Consistent with Tailwind CSS design tokens
- Dark mode support built-in
- Accessibility features (focus rings, disabled states)

### 📄 src/renderer/common/hooks/useDarkMode.ts
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

**Dependencies**:
- **Uses**: Electron IPC via window.electron
- **Used by**: TopBar DarkModeToggle, SidebarApp

### 📄 src/renderer/common/lib/utils.ts
**Purpose**: Utility functions for styling and class management

**Key Functions**:
- `cn()`: Tailwind CSS class merging with conflict resolution

**Dependencies**:
- **Uses**: clsx for conditional classes, tailwind-merge for conflict resolution
- **Used by**: All component files for className handling

---

## Configuration & Build

### package.json
**Purpose**: Project configuration, dependencies, and build scripts

**Key Scripts**:
- `dev`: Development mode with hot reload
- `build`: TypeScript compilation + Vite build
- `typecheck`: Multi-target TypeScript validation
- Platform builds: `build:mac`, `build:win`, `build:linux`

**Dependencies**:
- **AI**: @ai-sdk/openai, @ai-sdk/anthropic, ai
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

**Development Features**:
- Hot module replacement for React apps
- File system access for development
- Multi-entry build configuration

### TypeScript Configuration Files
- **tsconfig.json**: Base TypeScript configuration
- **tsconfig.node.json**: Node.js/Electron main process config
- **tsconfig.web.json**: Browser/renderer process config

### Styling Configuration
- **tailwind.config.js**: Tailwind CSS customization
- **postcss.config.js**: PostCSS processing pipeline

---

## File Dependencies Summary

### Import Hierarchies

**Main Process Dependencies**:
```
index.ts → Window, Menu, EventManager
Window → Tab, TopBar, SideBar
EventManager → Window (all components via window reference)
SideBar → LLMClient
```

**Renderer Dependencies**:
```
TopBar: main.tsx → TopBarApp → BrowserContext → topBarAPI (preload)
Sidebar: main.tsx → SidebarApp → ChatContext → sidebarAPI (preload)
Common: All renderers use common components, hooks, utilities
```

**IPC Communication Flow**:
```
Renderer → Preload Script → EventManager → Main Process Classes → Back to Renderer
```

This file structure enables a clean separation of concerns while maintaining efficient communication between all application components.
