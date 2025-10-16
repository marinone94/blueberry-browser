# Blueberry Browser

> An AI-powered Electron browser that learns from user behavior to enhance productivity and automate repetitive tasks.

## Overview

Blueberry Browser is a next-generation browsing platform built with Electron, React, and TypeScript. It combines traditional web browsing with intelligent AI capabilities that understand user patterns, predict needs, and automate tasks.

**Key Innovation**: Unlike conventional browsers, Blueberry actively learns from user behavior to provide contextual assistance, predictive text completion, and automated task execution.

### Core Features

- **AI Chat Sidebar**: Integrated OpenAI/Anthropic powered assistant for browsing support
- **Smart Tab Management**: Intelligent organization and navigation
- **Workflow Recognition**: Detect and automate recurring browsing patterns
- **Page Content Extraction**: AI-powered content analysis and summarization
- **Script Generation**: Automated form filling and data extraction capabilities
- **Predictive Completion**: Context-aware suggestions for user actions

## Quick Start

### Prerequisites
- Node.js 18+
- pnpm (required package manager)
- OpenAI API key

### Installation & Setup

```bash
# Install dependencies
pnpm install

# Create environment file
echo "OPENAI_API_KEY=your-api-key-here" > .env

# Start development server
pnpm dev
```


## Development
For detailed development guidelines, architecture documentation, and best practices, see **[AGENTS.md](./AGENTS.md)**.

### Available Commands
```bash
pnpm dev              # Start all processes with hot reload
pnpm typecheck        # Full TypeScript validation
pnpm lint             # Code quality checks
pnpm format           # Auto-format code
pnpm build            # Production build
```

### Architecture
- **Main Process**: Electron backend with window/tab management
- **Preload Scripts**: Secure IPC communication layer
- **Renderer Processes**: 
  - `topbar`: Address bar, navigation, tab controls
  - `sidebar`: AI chat interface and tools
  - `common`: Shared UI components and utilities


## Feature Development
For comprehensive development guidance, see **[AGENTS.md](./AGENTS.md#development-commands)**.

### Current Capabilities
✅ **Basic Browser Foundation**
- Multi-tab navigation and management
- Address bar with URL handling
- Secure IPC communication between processes
- AI chat integration with OpenAI

✅ **AI Integration**
- Chat interface with streaming responses
- Context-aware conversations
- Error handling for API failures

✅ **User Account Management**
- Multiple user profiles with complete isolation
- Per-user browsing history and chat data
- Session partitioning for privacy
- Guest mode for incognito browsing

✅ **Browsing History**
- Per-user history tracking with timestamps
- Smart deduplication and 1000-entry limit
- Search by title or URL with real-time filtering
- Click-to-navigate with existing tab detection
- Manual refresh and bulk clear options

✅ **Activity Tracking & Content Analysis**
- Comprehensive 13-type activity tracking (clicks, scrolls, navigation, etc.)
- AI-powered content analysis with image descriptions
- Automatic categorization and language detection
- Intelligent deduplication with HTML/screenshot hashing
- Cookie dialog detection and handling

✅ **Vector Search**
- Local semantic search using LanceDB + transformers.js
- Embeddings for page descriptions, titles, and screenshots
- Smart search across browsing and chat history
- Hybrid search: string matching with semantic fallback

✅ **AI Proactive Insights**
- LLM-based session segmentation (context-aware, no time limits)
- Multi-strategy pattern detection: workflows, research topics, abandoned tasks, temporal habits
- Automatic workflow detection with one-click resumption
- Research topic summaries with key findings
- One-click action execution from insights panel

### 🚧 Development Roadmap
During the challenge, the development roadmap is documented in **[ROADMAP.md](./docs/ROADMAP.md)**.
Currently .gitignored as the repo is public.

### 🔮 Future Vision
Seamless UX on a browser designed from the ground up for the Intelligence Age.
A browser that anticipates your needs, automate anything possible, and helps you stay on track when instant gratification needs kick in to derail.
Something that works for you, not to exploit you. Something that is always on your side.
A true companion, something that you can trust:

- **Proactive browsing**: Reminds, asks, acts proactively based on user behavior, preferences, etc.
- **Access to email, calendar, etc.**: Access to email, calendar, notes, to improve proactivity and context awareness.
- **Browser completion**: Predict next action or what to type, like Cursor's tab completion model.
- **Agentic browsing**: Browser agents fully capable of acting on user's behalf, without human intervention, aligned with user's goals and preferences.
- **Parallel search**: Work on different tabs in parallel, to speed up the task completion.
- **Parallel tasks**: Work on different tasks in parallel, to further increase productivity.
- **Remote browsing**: Dedicated web/mobile app to collect feedback, trigger and monitor jobs on a remote Blueberry instance.
- **Fully local when possible**: Custom, optimized models for local processing when the hardware supports it.
- **Federated learning**: Use user data to improve the general models, without compromising privacy.
- **Vertical agents**: User can create vertical agents for specific tasks with detailed instructions, permissions, and preferences. Automatically selected based on the task at hand, or manually picked by the user.
---

*Building the future of intelligent browsing, one feature at a time.*
