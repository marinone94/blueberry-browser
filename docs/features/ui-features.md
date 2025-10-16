# User Interface Features

Complete documentation for UI features including dark mode synchronization and sidebar toggle.

## Table of Contents
- [Dark Mode Synchronization](#dark-mode-synchronization)
- [Sidebar Toggle](#sidebar-toggle)

---

## Dark Mode Synchronization

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

3. **Main Process Broadcasting** (`UIIPCHandler.ts`):
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

### Architecture

**Shared Hook Pattern**:
- `useDarkMode.ts` hook used in both topbar and sidebar
- Same logic for persistence and IPC communication
- Consistent behavior across all UI components

**Persistence**:
- Preference saved to localStorage
- Automatically restored on app restart
- Per-user preferences (future enhancement)

**Performance**:
- DOM updates happen synchronously
- IPC broadcast is asynchronous but non-blocking
- No visual flicker or delay

---

## Sidebar Toggle

**User Action**: Click sidebar toggle button (or press Cmd+E)

**Complete Flow**:

1. **Multiple Triggers**:
   - **Button**: `AddressBar.tsx` → `toggleSidebar()`
   - **Menu**: `Menu.ts` → `handleToggleSidebar()`

2. **IPC Communication**:
   ```typescript
   window.topBarAPI.toggleSidebar() → UIIPCHandler → mainWindow.sidebar.toggle()
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

### Architecture

**Layout Management**:
- Sidebar: 400px fixed width when visible, 0px when hidden
- Tabs: Automatically adjust width to fill remaining space
- TopBar: Always 88px height, full width

**State Management**:
- Sidebar state maintained in `SideBar.ts`
- No React state needed - pure bounds manipulation
- Instant visual feedback

**Keyboard Shortcut**:
- `Cmd+E` (macOS) or `Ctrl+E` (Windows/Linux)
- Registered in `Menu.ts`
- Works globally across all windows

### Performance

**Bounds Manipulation**:
- Uses Electron's native `setBounds()` for instant updates
- No DOM manipulation or re-rendering
- Zero-cost abstraction

**Memory Efficiency**:
- Sidebar WebContentsView not destroyed when hidden
- Content remains loaded and interactive
- Instant show/hide without reload

---

## Related Features

- [Browser Core](./browser-core.md) - Tab layout and bounds calculation
- [AI Chat](./ai-chat.md) - Sidebar content and interactions
- [User Accounts](./user-accounts.md) - Per-user UI preferences (future)

