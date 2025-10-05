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
- **Smart Chat Search**: Semantic & exact match search with date filtering, debounced input, vector embeddings
- **User Account Management**: Multi-user isolation, session partitioning, account switching
- **Browsing History**: Per-user tracking, smart navigation, search and management
- **Activity Tracking**: Comprehensive behavior monitoring, 13 activity types, buffered collection
- **Content Analysis**: AI-powered page analysis with intelligent cookie dialog detection
- **UI Features**: Dark mode synchronization, sidebar toggle, cross-process coordination
- **Advanced Features**: JavaScript execution, screenshot capture, external link handling
- **Performance**: Process isolation, memory management, error handling

**Use this** to trace how user interactions flow through the entire codebase from UI to main process and back.

### [CONTENT_ANALYSIS_DESIGN.md](./CONTENT_ANALYSIS_DESIGN.md)
**Content Analysis System Design**

Detailed technical design for the AI-powered content analysis system:

- **Architecture**: ContentAnalyzer, CategoryManager, AnalysisQueue components
- **Data Structures**: Analysis results, extracted text, screenshot metadata
- **Analysis Flow**: Deduplication, queueing, LLM processing, storage
- **AI Prompt Design**: Structured prompts for page categorization and language detection
- **Storage Structure**: Per-user analysis data, index-based deduplication, LLM debug logs

**Use this** for understanding the content analysis architecture and implementation details.

### [COOKIE_DIALOG_DETECTION.md](./COOKIE_DIALOG_DETECTION.md)
**Cookie Consent Dialog Detection System**

Comprehensive guide to the multi-strategy cookie dialog detection:

- **Problem & Solution**: Why cookie dialogs need special handling and how we solve it
- **Detection Algorithm**: DOM-based scoring system with confidence levels
- **Multi-Strategy Approach**: Polling, user interaction detection, timeout fallback
- **Configuration & Tuning**: Adjustable parameters and customization options
- **Flow Diagram**: Complete visual flow of detection and waiting strategies
- **Testing & Debugging**: Unit tests, integration tests, troubleshooting guide
- **Performance Considerations**: Time costs, memory usage, API cost savings

**Use this** for understanding and customizing the cookie dialog detection system.

### [VECTOR_SEARCH_IMPLEMENTATION.md](./VECTOR_SEARCH_IMPLEMENTATION.md)
**Vector Search & Semantic Embeddings**

Complete guide to the local vector search implementation for browsing and chat history:

- **Technology Stack**: LanceDB, Transformers.js, local embeddings (no API calls)
- **Document Structure**: Separate embeddings for page content types and chat messages
- **Indexing Flows**: Automatic indexing during content analysis and session deactivation
- **Chat History Embedding**: Per-message embeddings with LLM-generated summaries
- **Search API**: Semantic search across browsing content and conversations
- **Cleanup & Management**: Automatic deletion when history is removed
- **Privacy**: 100% local processing, no data leaves the device
- **Performance**: Fast embeddings generation and sub-50ms search times

**Use this** for understanding the vector search architecture and implementing semantic search features.

### [PROACTIVE_INSIGHTS_IMPLEMENTATION.md](./PROACTIVE_INSIGHTS_IMPLEMENTATION.md)
**AI Proactive Task Intelligence**

Advanced feature that analyzes user browsing behavior to detect patterns and provide actionable insights:

- **Pure Semantic Session Segmentation**: LLM-based context switching without arbitrary time limits
- **Multi-Strategy Pattern Detection**: 4 parallel strategies (workflows, research, abandonment, habits)
- **Scoring & Ranking**: Composite scoring based on frequency, recency, and impact
- **One-Click Actions**: Execute workflows, resume tasks, and automate repetitive patterns
- **Algorithm Design**: Content-based sequence comparison, LLM-powered analysis, temporal pattern detection
- **Cost Analysis**: ~$5/year per active user with efficient model usage
- **Implementation**: ProactiveInsightsManager, IPC integration, React UI components
- **Data Flow**: Leverages activity tracking, content analysis, and vector search infrastructure

**Use this** for understanding the proactive insights architecture and implementing intelligent behavior analysis features.

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
- **OpenAI GPT-5-nano**: Primary AI model (configurable)
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
- ✅ **Enhanced chat history** with session management, metadata tracking, and deletion
- ✅ **Vector search & embeddings** for semantic search across browsing and chat history
- ✅ **Multi-user accounts** with complete data isolation and session partitioning
- ✅ **Per-user browsing history** with search and smart navigation
- ✅ **Comprehensive activity tracking** with 13 activity types and buffered collection
- ✅ **AI proactive insights** with pattern detection and one-click workflow automation
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
