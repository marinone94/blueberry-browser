# Browser Core Features

Complete documentation for core browser functionality including tab management, navigation, and advanced features.

## Table of Contents
- [Tab Management](#tab-management)
  - [Creating a New Tab](#creating-a-new-tab)
  - [Closing a Tab](#closing-a-tab)
  - [Tab Switching](#tab-switching)
- [Navigation System](#navigation-system)
  - [URL Navigation](#url-navigation)
  - [Back/Forward Navigation](#backforward-navigation)
  - [Page Reload](#page-reload)
- [Advanced Features](#advanced-features)
  - [JavaScript Execution](#javascript-execution-in-tabs)
  - [Tab Screenshots](#tab-screenshots)
  - [External Link Handling](#external-link-handling)

---

## Tab Management

### Creating a New Tab

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

4. **Main Process IPC** (`TabIPCHandler.ts`):
   ```typescript
   ipcMain.handle("create-tab") → mainWindow.createTab(url)
   ```

5. **Window Management** (`Window.ts`):
   ```typescript
   createTab(url) → {
     const tabId = `tab-${++tabCounter}`
     const sessionPartition = userAccountManager.getCurrentSessionPartition()
     const tab = new Tab(tabId, url, sessionPartition, historyCallback)
     baseWindow.contentView.addChildView(tab.view)
     tab.view.setBounds({ x: 0, y: 88, width: bounds.width - 400, height: bounds.height - 88 })
     tabsMap.set(tabId, tab)
     if (activityCollector) tab.setActivityCollector(activityCollector)
     if (contentAnalyzer) tab.setContentAnalyzer(contentAnalyzer)
     if (first tab) switchActiveTab(tabId)
     return tab
   }
   ```

6. **Tab Initialization** (`features/tabs/Tab.ts`):
   ```typescript
   new Tab(id, url, sessionPartition, historyCallback) → {
     webContentsView = new WebContentsView({
       webPreferences: { 
         nodeIntegration: false, 
         contextIsolation: true, 
         partition: sessionPartition  // User-specific session
       }
     })
     setupEventListeners() // title/URL tracking, history recording
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
- `TabIPCHandler.registerHandlers()` - IPC routing
- `Window.createTab()` - Tab lifecycle management
- `Tab constructor` - Web content setup with session partitioning

### Closing a Tab

**User Action**: Click "×" button on tab

**Complete Flow**:

1. **UI Event** (`TabBar.tsx`):
   ```typescript
   onClose={() => closeTab(tab.id)} → stopPropagation → closeTab(tabId)
   ```

2. **Context & IPC Chain**:
   ```
   BrowserContext.closeTab() → topBarAPI.closeTab() → TabIPCHandler → Window.closeTab()
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

### Tab Switching

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

---

## Navigation System

### URL Navigation

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

### Back/Forward Navigation

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

### Page Reload

**User Action**: Click reload button

**Flow**: Similar pattern with `webContentsView.webContents.reload()` or `reloadIgnoringCache()` for force reload

---

## Advanced Features

### JavaScript Execution in Tabs

**Purpose**: Allow debugging, automation, or content analysis

**Flow**:
1. `topBarAPI.tabRunJs(tabId, code)` → TabIPCHandler → `tab.runJs(code)`
2. `Tab.runJs()` calls `webContents.executeJavaScript(code)`
3. Returns result or throws error
4. Used internally for content extraction: `getTabHtml()`, `getTabText()`

### Tab Screenshots

**Purpose**: Visual context for AI, debugging, or thumbnails

**Flow**:
1. `topBarAPI.tabScreenshot(tabId)` → TabIPCHandler → `tab.screenshot()`
2. `Tab.screenshot()` calls `webContents.capturePage()`
3. Returns NativeImage converted to base64 data URL
4. Automatically used in AI chat (via LLMClient) for visual context

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

## Related Features

- [AI Chat](./ai-chat.md) - Uses screenshots and page content from tabs
- [User Accounts](./user-accounts.md) - Tab session partitioning per user
- [Browsing History](./browsing-history.md) - Tracks tab navigation
- [Activity Tracking](./activity-tracking.md) - Monitors tab interactions

