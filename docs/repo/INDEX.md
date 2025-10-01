# Blueberry Browser Repository Documentation

Welcome to the comprehensive documentation for Blueberry Browser, an advanced Electron-based browser with AI-powered features. This documentation provides deep insights into the architecture, file structure, and feature implementations.

## 📋 Documentation Overview

### [ARCHITECTURE.md](./ARCHITECTURE.md)
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

### [FILES.md](./FILES.md)
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

### [FEATURES.md](./FEATURES.md)
**Complete Feature Flows**

End-to-end code execution traces for all major features:

- **Core Browser**: Tab management, navigation, URL handling
- **AI Chat**: Message sending, screenshot integration, content analysis, streaming responses
- **Enhanced Chat History**: Session-based organization, metadata tracking, conversation management
- **User Account Management**: Multi-user isolation, session partitioning, account switching
- **Browsing History**: Per-user tracking, smart navigation, search and management
- **Activity Tracking**: Comprehensive behavior monitoring, 13 activity types, buffered collection
- **UI Features**: Dark mode synchronization, sidebar toggle, cross-process coordination
- **Advanced Features**: JavaScript execution, screenshot capture, external link handling
- **Performance**: Process isolation, memory management, error handling

**Use this** to trace how user interactions flow through the entire codebase from UI to main process and back.

---

## 🚀 Quick Start

### For New Developers
1. **Start with [ARCHITECTURE.md](./ARCHITECTURE.md)** to understand Electron and the multi-process design
2. **Review [FILES.md](./FILES.md)** focusing on your area of interest (AI, UI, core browser)
3. **Use [FEATURES.md](./FEATURES.md)** to trace specific functionality you need to modify

### For Code Navigation
- **Finding a specific file?** → [FILES.md](./FILES.md) with file search
- **Understanding a user workflow?** → [FEATURES.md](./FEATURES.md) for complete flows
- **Adding new functionality?** → [ARCHITECTURE.md](./ARCHITECTURE.md) for IPC patterns

### For Debugging
- **IPC issues?** → [ARCHITECTURE.md](./ARCHITECTURE.md) IPC section + [FEATURES.md](./FEATURES.md) communication flows
- **React component issues?** → [FILES.md](./FILES.md) React Applications section
- **Main process crashes?** → [FILES.md](./FILES.md) Main Process components + error handling patterns

---

## 🏗️ Repository Structure

```
blueberry-browser/
├── src/
│   ├── main/               # Electron main process
│   │   ├── index.ts        # App entry point & lifecycle
│   │   ├── Window.ts       # BaseWindow with multi-view layout
│   │   ├── EventManager.ts # Central IPC hub
│   │   ├── Tab.ts          # Individual tab management
│   │   ├── LLMClient.ts    # AI integration with streaming
│   │   └── ...
│   ├── preload/            # Secure IPC bridges
│   │   ├── topbar.ts       # Browser navigation API
│   │   └── sidebar.ts      # AI chat API
│   └── renderer/           # React applications
│       ├── topbar/         # Browser UI (tabs, address bar)
│       ├── sidebar/        # AI chat interface
│       └── common/         # Shared components & utilities
├── docs/
│   ├── repo/              # This documentation
│   └── ROADMAP.md         # Future development plans
└── [config files]         # Build, TypeScript, styling configs
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
- **OpenAI GPT-4o-mini**: Primary AI model (configurable)
- **Anthropic Claude-3.5-Sonnet**: Alternative AI provider
- **Streaming Responses**: Real-time AI chat with proper state management

### Development Tools
- **electron-vite**: Electron-optimized Vite configuration
- **ESLint + Prettier**: Code quality and formatting
- **Tailwind CSS**: Utility-first styling with dark mode
- **electron-builder**: Cross-platform app packaging

---

## 📊 Key Metrics

### Codebase Size (original repo)
- **8 Main Process Files**: Core application logic (~1,500 lines)
- **4 Preload Scripts**: Secure IPC bridges (~300 lines)
- **15+ React Components**: Modern UI with TypeScript (~2,000 lines)
- **Complete Type Coverage**: Full TypeScript across all processes

### Feature Coverage
- ✅ **Multi-tab browsing** with process isolation
- ✅ **AI-powered chat** with page context awareness and streaming responses
- ✅ **Enhanced chat history** with session management and metadata tracking
- ✅ **Multi-user accounts** with complete data isolation and session partitioning
- ✅ **Per-user browsing history** with search and smart navigation
- ✅ **Comprehensive activity tracking** with 13 activity types and buffered collection
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

// Main Process (EventManager)
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
