# User Account Management

Complete documentation for the multi-user account system with complete data isolation.

## Table of Contents
- [Overview](#overview)
- [User Account Creation](#user-account-creation)
- [User Switching with Tab Management](#user-switching-with-tab-management)
- [Guest User Management](#guest-user-management)
- [Session Isolation](#session-isolation)
- [Data Storage](#data-storage)

---

## Overview

The user account management system provides complete isolation between users through:
- Separate session partitions (cookies, cache, localStorage)
- Individual data storage per user
- Per-user chat history and browsing history
- Guest user for incognito-like browsing
- Maximum 10 users limit

**Key Components**:
- `UserAccountManager` - Core account logic and switching
- `UserStorage` - File system operations and persistence
- `UserIPCHandler` - IPC communication layer

---

## User Account Creation

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
- `UserStorage` (extends BaseStorage) - Automatic user data directory creation

**Data Structure**:
```typescript
interface UserAccount {
  id: string                  // UUID v4
  name: string                // Display name
  email?: string              // Optional email
  birthday?: string           // Optional birthday
  isGuest: boolean            // Guest user flag
  sessionPartition: string    // e.g., "persist:user-abc123"
  createdAt: Date
  updatedAt: Date
}
```

**Validation Rules**:
- Name must be unique across all users
- Name cannot be empty
- Email must be valid format if provided
- Maximum 10 users (excluding guest)

---

## User Switching with Tab Management

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

**Tab Management Options**:

**Option 1: Keep Current Tabs** (`keepCurrentTabs: true`):
- Current tabs saved to new user's tab history
- All tabs reload with new session partition
- URLs preserved, but cookies/cache cleared
- Good for moving work to different account

**Option 2: Load User's Tabs** (`keepCurrentTabs: false`):
- Current tabs closed
- New user's saved tabs loaded
- Complete context switch
- Good for switching between distinct workflows

---

## Guest User Management

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

**Guest User Behavior**:
- Fresh state on every app launch
- No browsing history saved
- No chat history persisted
- Cookies and localStorage cleared on restart
- Perfect for temporary browsing or demos

**When to Use Guest User**:
- Privacy-sensitive browsing
- Demo or presentation mode
- Testing without affecting personal data
- Temporary browsing sessions

---

## Session Isolation

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

**Session Partition Format**:
- Regular users: `persist:user-{userId}`
- Guest user: `persist:guest`
- Prefix `persist:` enables data persistence (except guest)

**Security Benefits**:
- No cookie leakage between users
- No cache poisoning attacks
- Complete browsing context isolation
- Independent authentication states

**Performance Characteristics**:
- Each session has independent cache
- Cache size managed per session
- Memory usage scales with active users
- Inactive sessions can be garbage collected

---

## Data Storage

### Storage Structure

```
users/
├── accounts.json              # All user accounts metadata
├── current-user.json          # Last active non-guest user
└── user-data/
    ├── guest/                 # Always cleared on startup
    │   ├── chat-history.json
    │   ├── tabs.json
    │   ├── browsing-history.json
    │   └── raw-activity/
    ├── user-123/              # Regular user data
    │   ├── chat-history.json
    │   ├── tabs.json
    │   ├── browsing-history.json
    │   ├── content-analysis/
    │   ├── raw-activity/
    │   └── embeddings/
    └── user-456/
        └── ... (same structure)
```

### Accounts Metadata (`accounts.json`)

```json
{
  "users": [
    {
      "id": "guest",
      "name": "Guest User",
      "isGuest": true,
      "sessionPartition": "persist:guest",
      "createdAt": "2025-10-16T10:00:00.000Z",
      "updatedAt": "2025-10-16T10:00:00.000Z"
    },
    {
      "id": "user-abc123",
      "name": "Alice",
      "email": "alice@example.com",
      "isGuest": false,
      "sessionPartition": "persist:user-abc123",
      "createdAt": "2025-09-15T08:00:00.000Z",
      "updatedAt": "2025-10-16T15:30:00.000Z"
    }
  ]
}
```

### Current User Tracking (`current-user.json`)

```json
{
  "userId": "user-abc123",
  "timestamp": "2025-10-16T15:30:00.000Z"
}
```

**Purpose**: Remember last active user for next app launch

### Data Cleanup

**Guest User Cleanup** (on every startup):
```typescript
async setupGuestUser() {
  await userDataManager.clearUserData('guest')
  // Fresh guest user created
}
```

**Regular User Deletion**:
```typescript
async deleteUser(userId: string) {
  // Cannot delete guest or current user
  if (userId === 'guest' || userId === currentUserId) {
    throw new Error('Cannot delete guest or current user')
  }
  
  // Remove from accounts
  users.delete(userId)
  await saveAccounts()
  
  // Delete all user data
  await userDataManager.clearUserData(userId)
}
```

---

## Integration with Other Features

### Chat History Integration
- Each user has separate chat history file
- Chat sessions isolated per user
- Vector embeddings stored per user
- See [Chat History](./chat-history.md)

### Browsing History Integration
- Per-user browsing history
- History entries linked to user ID
- Search scoped to current user
- See [Browsing History](./browsing-history.md)

### Activity Tracking Integration
- Activities tagged with user ID
- Complete activity separation
- Per-user analytics
- See [Activity Tracking](./activity-tracking.md)

### Content Analysis Integration
- Page analyses stored per user
- User-specific insights
- Independent analysis history
- See [Content Analysis](./content-analysis.md)

---

## Related Features

- [Chat History](./chat-history.md) - Per-user chat sessions
- [Browsing History](./browsing-history.md) - User-specific history
- [Activity Tracking](./activity-tracking.md) - User activity isolation
- [Browser Core](./browser-core.md) - Session partitioning
- [Vector Search](./vector-search.md) - Per-user embeddings

