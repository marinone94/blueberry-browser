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
- Basic tab management and navigation
- Page content extraction for AI context
- Chat interface with AI integration
- Screenshot and JavaScript execution capabilities

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

## Debugging Tips
- Use `console.log` strategically across processes
- Monitor `chrome://inspect` for renderer processes
- Check main process logs in terminal
- Use Electron DevTools extensions
- Test in packaged app, not just development

---

Remember: The goal is to create features that make Blueberry Browser superior to competitors through innovative AI-powered browsing experiences. Focus on user value, technical excellence, and scalable architecture.
