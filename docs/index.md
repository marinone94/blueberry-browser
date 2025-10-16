# Blueberry Browser Repository Documentation

Welcome to the comprehensive documentation for Blueberry Browser, an advanced Electron-based browser with AI-powered features. This documentation provides deep insights into the architecture, file structure, and feature implementations.

## 📋 Documentation Overview

### [architecture.md](./architecture.md)
**Understanding the Foundation**

Comprehensive guide to Electron framework concepts and how Blueberry Browser implements them:

- **Electron Framework Overview**: Multi-process architecture, security model, IPC communication
- **Blueberry Implementation**: BaseWindow with WebContentsViews, process structure, component interactions
- **Activity Tracking Architecture**: Multi-layered monitoring, buffered collection, daily persistence
- **Chat History Architecture**: Session-based organization, metadata tracking, persistence flows
- **User Account Management**: Complete isolation, session partitioning, data storage structure
- **Development Workflow**: Hot reload, debugging strategies, adding new features
- **Security & Performance**: Context isolation, memory management, resource optimization

**Read this first** to understand the fundamental architecture before diving into specific files or features.

### [files.md](./files.md)
**Detailed Code Analysis**

File-by-file breakdown organized by functional groupings:

- **Application Core**: Entry points, lifecycle management, native menus
- **Window Management**: BaseWindow container, tab handling, layout calculation
- **IPC Communication**: EventManager hub, preload scripts, type definitions
- **AI Integration**: LLMClient with streaming, context awareness, provider support
- **React Applications**: TopBar and Sidebar with complete component hierarchies
- **Shared Components**: Common utilities, hooks, styling systems
- **Configuration**: Build system, TypeScript configs, dependency management

**Use this** as a reference for understanding what each file does, its dependencies, and its role in the larger system.

### [features/](./features/)
**Complete Feature Documentation**

Individual feature documentation with architecture, flows, and implementation details:

- **Core Browser**: Tab management, navigation, URL handling
- **AI Chat**: AI-powered chat with page context
- **Chat History**: Session management with search
- **User Accounts**: Multi-user with complete isolation
- **Browsing History**: Per-user history tracking
- **Activity Tracking**: Comprehensive behavior monitoring
- **Content Analysis**: AI-powered page analysis with cookie detection
- **Vector Search**: Local semantic search with embeddings
- **Proactive Insights**: Pattern detection and suggestions
- **UI Features**: Dark mode synchronization, sidebar toggle

**Use this** to understand how each feature works, from user interaction to implementation details.

---

## 🚀 Quick Start

### For New Developers
1. **Start with [architecture.md](./architecture.md)** to understand Electron and the multi-process design
2. **Review [files.md](./files.md)** focusing on your area of interest (AI, UI, core browser)
3. **Use [features/](./features/)** to understand specific functionality you need to modify

### For Code Navigation
- **Finding a specific file?** → [files.md](./files.md) with file search
- **Understanding a user workflow?** → [features/](./features/) for complete flows
- **Adding new functionality?** → [architecture.md](./architecture.md) for IPC patterns

### For Debugging
- **IPC issues?** → [architecture.md](./architecture.md) IPC section + feature docs for communication flows
- **React component issues?** → [files.md](./files.md) React Applications section
- **Main process crashes?** → [files.md](./files.md) Main Process components + error handling patterns

---

## 🏗️ Repository Structure

```
blueberry-browser/
├── src/
│   ├── main/                      # Electron main process
│   │   ├── core/                  # Core infrastructure
│   │   │   └── ipc/              # IPC handling framework
│   │   ├── features/              # Feature modules
│   │   │   ├── activity/         # Activity tracking
│   │   │   ├── ai/               # AI chat features
│   │   │   ├── content/          # Content analysis
│   │   │   ├── history/          # Browsing history
│   │   │   ├── insights/         # Proactive insights
│   │   │   ├── search/           # Vector search
│   │   │   ├── tabs/             # Tab management
│   │   │   └── users/            # User accounts
│   │   ├── shared/                # Shared code
│   │   │   └── types/            # Shared type definitions
│   │   ├── ui/                    # UI management
│   │   ├── index.ts              # App entry point & lifecycle
│   │   └── Window.ts             # BaseWindow with multi-view layout
│   ├── preload/                   # Secure IPC bridges
│   │   ├── topbar.ts             # Browser navigation API
│   │   └── sidebar.ts            # AI chat API
│   └── renderer/                  # React applications
│       ├── topbar/               # Browser UI (tabs, address bar)
│       ├── sidebar/              # AI chat interface
│       └── common/               # Shared components & utilities
├── docs/
│   ├── index.md                  # This file
│   ├── architecture.md           # System architecture
│   ├── files.md                  # File-by-file reference
│   ├── features/                 # Feature documentation
│   └── ROADMAP.md                # Future development plans
└── [config files]                # Build, TypeScript, styling configs
```

---

## 🔧 Technology Stack

### Core Technologies
- **Electron 37**: Desktop application framework
- **React 19**: UI components with hooks and context
- **TypeScript**: Type-safe development across all processes
- **Vite**: Fast development server and build tool

### AI Integration
- **AI SDK**: Universal LLM integration library
- **OpenAI GPT-5-mini**: Primary AI model (configurable)
- **Anthropic Claude-Sonnet-4-5**: Alternative AI provider
- **Streaming Responses**: Real-time AI chat with proper state management

### Development Tools
- **electron-vite**: Electron-optimized Vite configuration
- **ESLint + Prettier**: Code quality and formatting
- **Tailwind CSS**: Utility-first styling with dark mode
- **electron-builder**: Cross-platform app packaging

---

## 📊 Key Metrics

### Codebase Size
- **Main Process**: Feature-based architecture with modular IPC handlers
- **Preload Scripts**: Secure IPC bridges (~500 lines)
- **React Components**: Modern UI with TypeScript (~3,000+ lines)
- **Complete Type Coverage**: Full TypeScript across all processes

### Feature Coverage
- ✅ **Multi-tab browsing** with process isolation
- ✅ **AI-powered chat** with page context awareness and streaming responses
- ✅ **Enhanced chat history** with session management, metadata tracking, and deletion
- ✅ **Vector search & embeddings** for semantic search across browsing and chat history
- ✅ **Multi-user accounts** with complete data isolation and session partitioning
- ✅ **Per-user browsing history** with search and smart navigation
- ✅ **Comprehensive activity tracking** with 13 activity types and buffered collection
- ✅ **AI proactive insights** with pattern detection and one-click workflow automation
- ✅ **Content analysis** with intelligent cookie dialog detection
- ✅ **Screenshot integration** for visual AI analysis
- ✅ **Dark mode synchronization** across all processes
- ✅ **Native menu integration** with keyboard shortcuts
- ✅ **Cross-platform support** (macOS, Windows, Linux)

---

## 🎯 Development Patterns

### IPC Communication Pattern
```typescript
// Renderer Process
const result = await window.apiName.functionName(params)

// Preload Script  
apiName: {
  functionName: (params) => electronAPI.ipcRenderer.invoke("channel-name", params)
}

// Main Process (IPC Handler)
ipcMain.handle("channel-name", async (_, params) => {
  return await processFunction(params)
})
```

### React Context Pattern
```typescript
// Context definition with typed API
interface ContextType {
  state: StateType
  actions: ActionFunctions
}

// Provider with IPC integration
const Provider = ({ children }) => {
  const [state, setState] = useState()
  
  const action = useCallback(async (params) => {
    await window.api.function(params)
    // Update local state
  }, [])
  
  return <Context.Provider value={{ state, action }}>{children}</Context.Provider>
}
```

### Component Architecture
```typescript
// Functional components with proper TypeScript
interface Props {
  required: string
  optional?: boolean
}

const Component: React.FC<Props> = ({ required, optional = false }) => {
  const { state, actions } = useContext()
  
  return <div>{/* JSX with proper event handling */}</div>
}
```

---

### Development Tools
- **Chrome DevTools**: Available in all renderer processes during development
- **VS Code Debugger**: Can attach to main process
- **React DevTools**: Install browser extension for component inspection
- **IPC Logging**: Add console.log statements in both main and renderer sides

---

This documentation represents a complete analysis of the Blueberry Browser codebase as of the current version. For questions or clarifications about specific implementations, refer to the detailed sections in each documentation file or examine the source code with this context in mind.

