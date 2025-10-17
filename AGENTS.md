---
description: Blueberry Browser - Advanced Electron browser with AI capabilities. Expert guidance for Electron, React, TypeScript, and AI integration.
globs: **/*.{js,jsx,ts,tsx,html}
---

# Blueberry Browser Development Guide

You are an expert developer working on **Blueberry Browser**, a cutting-edge Electron-based browser with AI-powered features. The goal is to build innovative browsing capabilities that surpass competitors through intelligent automation and user experience enhancements.

## Project Architecture

### Multi-Process Structure
- **Main Process** (`src/main/`): Electron backend, window management, IPC coordination
- **Preload Scripts** (`src/preload/`): Secure IPC bridge between main and renderer
- **Renderer Processes** (`src/renderer/`): React frontends for UI components
  - `topbar/`: Address bar, tabs, navigation controls
  - `sidebar/`: AI chat, tools, browsing insights
  - `common/`: Shared components, utilities, hooks

### Tech Stack
- **Frontend**: React 19 + TypeScript + Tailwind CSS
- **Backend**: Electron 37 + Node.js
- **Build**: Vite + electron-vite
- **AI**: OpenAI/Anthropic integration via `ai` SDK
- **Package Manager**: pnpm (required)

## Development Commands

```bash
# Setup
pnpm install

# Development (starts all processes)
pnpm dev

# Type checking
pnpm typecheck
pnpm typecheck:node    # Main process
pnpm typecheck:web     # Renderer processes

# Code quality
pnpm lint
pnpm format

# Building
pnpm build             # Full build with type check
pnpm build:unpack      # Development build
pnpm build:mac         # macOS production
pnpm build:win         # Windows production
pnpm build:linux       # Linux production
```

## Key Development Principles

### Strictly adhere to the instructions
The underlying AI models used to generate code have the tendency of proposing or implementing more than asked.
This is because docs are included in the context by the IDE agent, and because they are trained to do more rather than less.
**ENSURE to strictly adhere to the user's latest instructions, and not to propose or implement more than asked.**

### Check the codebase
Always check the codebase and the docs under `docs/` before designing a new feature or making changes to the existing code.
**ENSURE to check the codebase and the docs before designing a new feature to keep the codebase consistent and as simple as possible.**

Key documentation locations:
- `docs/architecture.md` - System architecture and data flows
- `docs/features/` - Detailed feature documentation
- `docs/files.md` - File structure and dependencies
- `docs/ROADMAP.md` - Development progress and planning

### Ask for clarification
USer prompts can be ambiguous, or incomplete.
**ENSURE to ask for clarification if you are not sure about the user's instructions.**

### Test thoroughly
**ENSURE to test thoroughly before submitting the code.**

### Document your code
**ENSURE to document your code thoroughly, both in code and in relevant files under `docs/` directory, `README.md`, and `AGENTS.md`.**
Do not add documentation files explaining what you have done (e.g. DOCUMENTATION_MIGRATION_STEPS.md)
Add new documentation files only if a new feature is added, and place it under `docs/features/` directory.

### Use comments
**ENSURE to use comments to explain the code.**

### Use logging
**ENSURE to use logging to debug the code.**

### Use type checking
**ENSURE to use type checking to catch errors.**

### Use formatting
**ENSURE to use formatting to make the code readable.**

### Use linting
**ENSURE to use linting to catch errors.**

### Extending the Browser
- **New Features**: Follow IPC patterns established in EventManager
- **UI Components**: Use existing patterns from common components
- **AI Capabilities**: Extend LLMClient with new providers or features
- **Performance**: Monitor memory usage across tab processes

### Code Organization
- **Keep main process lightweight**: Move complex logic to renderer when possible
- **Maintain type safety**: Update .d.ts files when adding new IPC channels
- **Follow React patterns**: Use hooks and context for state management
- **Security first**: All new IPC channels should use secure invoke/handle pattern

### Keeping Docs Updated
- **Architecture changes**: Update `docs/architecture.md` with process flows
- **New files**: Add entries to `docs/files.md` with proper dependency analysis
- **New features**: Document complete flows in `docs/features/` directory
- **API changes**: Update preload script type definitions
- **Roadmap updates**: Keep `docs/ROADMAP.md` current with completed/planned work

### Contributing Documentation
- **Be comprehensive**: Include all functions involved in flows
- **Show interactions**: Explain how components communicate
- **Include examples**: Provide code snippets for patterns
- **Consider debugging**: Help future developers troubleshoot issues

### Electron Best Practices
- **Security First**: Use preload scripts, never disable context isolation
- **Process Isolation**: Keep main process lightweight, business logic in renderer
- **IPC Communication**: Use typed IPC channels defined in preload scripts
- **Memory Management**: Properly clean up event listeners and references

### React/TypeScript Guidelines
- **Functional Components**: Use hooks, avoid class components
- **Type Safety**: Strict TypeScript, explicit types for all functions/props
- **Component Organization**: Single responsibility, max 200 lines per component
- **State Management**: Local state preferred, React Context for shared state
- **Error Boundaries**: Implement for all major UI sections

### Code Style
- **Naming**: camelCase variables/functions, PascalCase components/classes
- **File Structure**: One export per file, co-located tests
- **Imports**: Absolute imports using `@renderer` and `@common` aliases
- **Functions**: Pure functions preferred, early returns for error conditions

## Project-Specific Patterns

### IPC Communication
```typescript
// preload/sidebar.ts - Define APIs
const api = {
  sendMessage: (message: string) => ipcRenderer.invoke('ai:send-message', message),
  onTabUpdate: (callback: Function) => ipcRenderer.on('tab:updated', callback)
}
```

### AI Integration
- Use the `ai` SDK for LLM interactions
- Implement proper error handling for API failures
- Add loading states for async AI operations
- Consider token limits and cost optimization

### Browser Features

**Core Browsing**:
- Multi-tab management with per-user session isolation
- Page content extraction with AI-powered analysis
- Screenshot capture and JavaScript execution in tabs

**AI & Chat**:
- OpenAI/Anthropic integration with streaming responses
- Session-based chat history with metadata tracking
- Vector search across chat conversations

**User Accounts**:
- Multiple user profiles with complete data isolation
- Guest mode for incognito browsing
- Per-user session partitioning (cookies, cache, localStorage)

**Activity Tracking**:
- 13 comprehensive activity types (navigation, interaction, context, features)
- Buffered collection with daily file rotation
- Per-user activity isolation

**Content Analysis**:
- AI-powered page descriptions and image analysis
- Automatic categorization and language detection
- Smart deduplication using HTML/screenshot hashing
- Cookie dialog detection

**Browsing History**:
- Per-user history with timestamps and deduplication
- Smart search by title, URL, or semantic content
- Click-to-navigate with existing tab detection

**Vector Search**:
- Local embeddings using transformers.js (no API calls)
- LanceDB for efficient semantic search
- Hybrid search: string matching + semantic fallback
- Automatic cleanup on history deletion

**Proactive Insights**:
- LLM-based session segmentation (context-aware)
- Multi-strategy pattern detection (workflows, research, abandoned tasks, habits)
- One-click action execution and workflow resumption

## Implementation Guidelines
- **Incremental Development**: Build MVPs, iterate based on user behavior
- **Performance**: Monitor memory usage, optimize for smooth browsing
- **Privacy**: Local processing preferred, transparent data handling
- **Extensibility**: Design for future feature additions

## Environment Setup

### Required Environment Variables
```bash
# .env (root directory)
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key  # optional
```

### Development Workflow
1. Start with `pnpm dev` for hot-reload development
2. Use browser dev tools for renderer debugging
3. Use VS Code debugger for main process
4. Test across multiple tabs and scenarios
5. Verify IPC communication flow

## Testing Strategy
- **Unit Tests**: Components and utility functions
- **Integration Tests**: IPC communication and AI workflows
- **E2E Tests**: Core browsing functionality
- **Performance Tests**: Memory usage and response times

## Common Pitfalls
- Don't access Node.js APIs directly in renderer processes
- Always clean up event listeners in useEffect cleanup
- Handle AI API failures gracefully with fallbacks
- Test memory leaks with multiple tabs/windows
- Validate all IPC message payloads


## 🐛 Debugging Guide

### Debugging Tips & Common Issues

**General Debugging**:
- Use `console.log` strategically across processes
- Monitor `chrome://inspect` for renderer processes
- Check main process logs in terminal
- Use Electron DevTools extensions
- Test in packaged app, not just development

**IPC Communication Failures**:
- Check preload script registration in WebContentsView
- Verify IPC channel names match between preload and main
- Ensure proper error handling in main process handlers

**React State Synchronization**:
- Use React DevTools to inspect context state
- Check IPC event listeners are properly cleaned up
- Verify useEffect dependencies are correct

**Electron Build Issues**:
- Run `pnpm typecheck` to catch TypeScript errors
- Check that all imports use correct paths
- Verify preload scripts are being built to `/out/preload/`

**AI Integration Problems**:
- Check API keys in `.env` file
- Verify network connectivity for streaming responses
- Check console for LLMClient initialization messages

---

Remember: The goal is to create features that make Blueberry Browser superior to competitors through innovative AI-powered browsing experiences. Focus on user value, technical excellence, and scalable architecture.
