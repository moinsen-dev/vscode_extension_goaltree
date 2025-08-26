# Product Requirements Document: Goal Tracker VS Code Extension

## 1. Product Overview

### 1.1 Product Name
**GoalTree** - Hierarchical Goal & Task Tracker for VS Code

### 1.2 Vision Statement
Provide developers with a visual, context-aware tracking system that maintains clarity of purpose during complex refactoring work by organizing goals, sub-goals, tasks, and their associated git commits in a hierarchical structure.

### 1.3 Problem Statement
Developers often lose track of their original objectives when refactoring code, as discovering dependencies creates a cascade of prerequisite work. This leads to:
- Lost context about why certain work is being done
- Difficulty estimating completion time for original goals
- Scattered commits without clear association to larger objectives
- No clear visualization of blocking dependencies

### 1.4 Target Users
- Software developers working on complex refactoring projects
- Teams needing to track technical debt resolution
- Developers using Claude Code for AI-assisted development

## 2. Functional Requirements

### 2.1 Core Features

#### 2.1.1 Goal Management
- **Create Goal**: Quick creation via command palette or UI
- **Create Sub-Goal**: Convert blockers into sub-goals
- **Goal States**: planned → in-progress → blocked → completed
- **Goal Relationships**: Parent-child hierarchy with unlimited nesting
- **Blocking Dependencies**: Mark goals as blocked by other goals

#### 2.1.2 Task Management
- **Task Creation**: Add tasks to any goal
- **Task States**: todo → in-progress → done
- **Task Ordering**: Drag-and-drop reordering within a goal
- **Quick Actions**: Mark complete, delete, convert to goal

#### 2.1.3 Git Integration
- **Commit Linking**: Auto-detect and link commits to active task/goal
- **Branch Association**: Link git branches to goals
- **Commit Patterns**: Support conventional commits (feat:, fix:, etc.)
- **Manual Linking**: Ability to manually associate past commits

#### 2.1.4 Claude Code Integration
- **Session Tracking**: Read ~/.claude.json for Claude Code sessions
- **AI Task Association**: Link Claude Code tasks to goals
- **Token Usage**: Track token usage per goal/task
- **File Changes**: Track files modified by Claude Code

#### 2.1.5 Project Management
- **Multi-Project Support**: Separate goal trees per workspace folder
- **Project Switching**: Quick switch between project contexts
- **Global Overview**: Optional view of all projects' goals
- **Project Templates**: Save and reuse goal structures

### 2.2 User Interface Components

#### 2.2.1 Primary Tree View (Sidebar)
```
📁 Project: my-app
├── 🎯 Refactor Authentication [IN-PROGRESS]
│   ├── 📝 Tasks (2/5)
│   │   ├── ✅ Define auth interfaces
│   │   ├── 🔄 Extract JWT logic
│   │   └── ⏹️ Write unit tests
│   ├── 🔗 Commits (12)
│   ├── 🤖 Claude Sessions (3)
│   └── 🎯 Sub-goals
│       ├── ⚠️ Fix Circular Dependencies [BLOCKED]
│       └── ✅ Update Type Definitions [COMPLETED]
```

#### 2.2.2 Webview Dashboard
- **Dependency Graph**: Interactive visualization of goal dependencies
- **Timeline View**: Chronological view of commits/tasks/sessions
- **Progress Metrics**: Completion rates, time tracking, velocity
- **Burndown Charts**: Visual progress toward goal completion

#### 2.2.3 Status Bar
- **Active Goal/Task**: Shows current working context
- **Quick Switch**: Click to change active goal/task
- **Progress Indicator**: "2/5 tasks | 1 blocker"

#### 2.2.4 Command Palette Commands
```
GoalTree: Create New Goal
GoalTree: Create Sub-Goal for Current
GoalTree: Add Task to Current Goal
GoalTree: Mark Current Task Complete
GoalTree: Link Current Commit
GoalTree: Show Dependency Graph
GoalTree: Switch Project Context
GoalTree: Generate Progress Report
```

## 3. Data Models

### 3.1 Core Entities

```typescript
// Project Configuration
interface Project {
  id: string
  name: string
  rootPath: string
  created: Date
  settings: ProjectSettings
}

interface ProjectSettings {
  autoLinkCommits: boolean
  commitPattern?: string  // e.g., "[TASK-{id}]"
  trackClaudeCode: boolean
  defaultBranch: string
}

// Goal Management
interface Goal {
  id: string
  projectId: string
  title: string
  description?: string
  status: 'planned' | 'in-progress' | 'blocked' | 'completed'
  parentGoalId?: string
  blockingGoalIds: string[]  // Goals that block this one
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
  estimatedHours?: number
  actualHours?: number
  tags: string[]
  branch?: string  // Associated git branch
}

// Task Management
interface Task {
  id: string
  goalId: string
  title: string
  description?: string
  status: 'todo' | 'in-progress' | 'done'
  order: number
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
  assignedFiles?: string[]  // Files related to this task
}

// Git Integration
interface CommitLink {
  id: string
  projectId: string
  commitHash: string
  taskId?: string
  goalId: string
  message: string
  author: string
  timestamp: Date
  filesChanged: FileChange[]
  autoLinked: boolean  // vs manually linked
}

interface FileChange {
  path: string
  additions: number
  deletions: number
  status: 'added' | 'modified' | 'deleted'
}

// Claude Code Integration
interface ClaudeSession {
  id: string
  projectId: string
  goalId?: string
  taskId?: string
  sessionStart: Date
  sessionEnd?: Date
  tokensUsed: {
    input: number
    output: number
  }
  filesModified: string[]
  commands: ClaudeCommand[]
}

interface ClaudeCommand {
  timestamp: Date
  command: string
  result: string
  filesAffected: string[]
}

// Progress Tracking
interface GoalMetrics {
  goalId: string
  totalTasks: number
  completedTasks: number
  totalSubGoals: number
  completedSubGoals: number
  totalCommits: number
  totalHoursTracked: number
  claudeTokensUsed: number
  lastActivity: Date
}
```

### 3.2 Storage Schema

```typescript
// File Structure
interface StorageStructure {
  // ~/.goaltree/global.json
  global: {
    version: string
    projects: ProjectReference[]
    preferences: GlobalPreferences
  }

  // {workspace}/.goaltree/project.json
  project: {
    project: Project
    goals: Goal[]
    tasks: Task[]
    commits: CommitLink[]
    claudeSessions: ClaudeSession[]
    metrics: GoalMetrics[]
  }
}
```

## 4. Technical Architecture

### 4.1 Extension Architecture

```
VS Code Extension (TypeScript)
├── Extension Host
│   ├── Activation Events
│   ├── Command Handlers
│   ├── Git Integration (VS Code Git API)
│   └── File System Watcher
├── Tree View Provider
│   ├── Goal Tree
│   ├── Task List
│   └── Commit History
├── Webview Provider
│   ├── Dashboard (React/Preact)
│   ├── Dependency Graph (D3.js)
│   └── Analytics Charts
├── Data Layer
│   ├── Storage Service (JSON/SQLite)
│   ├── Git Service
│   ├── Claude Parser
│   └── Sync Service
└── Background Services
    ├── Auto-commit Linker
    ├── Claude Watcher (~/.claude.json)
    └── Progress Calculator
```

### 4.2 Integration Points

#### Git Integration
```typescript
class GitService {
  async getCurrentBranch(): Promise<string>
  async getRecentCommits(limit: number): Promise<Commit[]>
  async linkCommitToTask(commitHash: string, taskId: string): Promise<void>
  async watchRepository(callback: (commit: Commit) => void): Disposable
}
```

#### Claude Code Integration
```typescript
class ClaudeWatcher {
  private claudeFilePath = path.join(os.homedir(), '.claude.json')

  async parseClaudeJson(): Promise<ClaudeData>
  async watchClaudeFile(callback: (data: ClaudeData) => void): Disposable
  async linkSessionToGoal(sessionId: string, goalId: string): Promise<void>
}
```

## 5. User Workflows

### 5.1 Starting a Refactoring Goal
```
1. User opens project in VS Code
2. Cmd+Shift+P → "GoalTree: Create New Goal"
3. Enter: "Refactor Authentication System"
4. GoalTree creates goal, sets status to 'planned'
5. Optionally create and checkout new git branch
```

### 5.2 Discovering a Blocker
```
1. User working on "Extract Auth Service" task
2. Discovers circular dependency issue
3. Right-click task → "Create Blocking Sub-Goal"
4. Enter: "Fix Circular Dependencies"
5. Original goal marked as 'blocked'
6. New sub-goal becomes active
```

### 5.3 Claude Code Integration
```
1. User runs Claude Code for refactoring
2. Extension detects ~/.claude.json changes
3. Parses session data and file changes
4. Auto-links session to active goal/task
5. Shows token usage in goal metrics
```

### 5.4 Commit Workflow
```
1. User makes commits while task is active
2. Extension detects new commits
3. If commit message contains pattern → auto-link
4. Otherwise, prompt: "Link commit to current task?"
5. Update task progress and metrics
```

## 6. Implementation Roadmap

### Phase 1: Core Foundation (Week 1-2)
- [ ] Extension scaffold and basic structure
- [ ] Data models and storage layer
- [ ] Basic tree view with goals and tasks
- [ ] Command palette integration
- [ ] Project-specific storage

### Phase 2: Git Integration (Week 3)
- [ ] Git API integration
- [ ] Commit detection and linking
- [ ] Branch association
- [ ] Commit history view

### Phase 3: Advanced Features (Week 4-5)
- [ ] Dependency management and blocking
- [ ] Claude Code integration
- [ ] Webview dashboard
- [ ] Dependency graph visualization

### Phase 4: Polish & Enhancement (Week 6)
- [ ] Progress metrics and analytics
- [ ] Export/Import functionality
- [ ] Keyboard shortcuts
- [ ] Settings UI
- [ ] Documentation

## 7. Configuration Options

```json
{
  "goaltree.autoLinkCommits": true,
  "goaltree.commitPattern": "[GOAL-{goalId}]",
  "goaltree.trackClaudeCode": true,
  "goaltree.claudeJsonPath": "~/.claude.json",
  "goaltree.showStatusBar": true,
  "goaltree.defaultView": "tree",
  "goaltree.autoBranchNaming": "{goalId}-{goalTitle}",
  "goaltree.storage.location": "workspace",  // or "global"
  "goaltree.ui.theme": "auto",
  "goaltree.notifications.goalComplete": true,
  "goaltree.export.includeMetrics": true
}
```

## 8. Success Metrics

- **Adoption**: Active users after 30 days
- **Engagement**: Average goals created per user per week
- **Completion Rate**: Percentage of goals marked complete vs abandoned
- **Context Switches**: Reduction in time spent finding context
- **User Feedback**: Satisfaction score > 4/5

## 9. Future Enhancements

1. **Team Collaboration**: Share goals across team
2. **AI Suggestions**: Use AI to suggest task breakdowns
3. **Time Tracking**: Automatic time tracking per goal
4. **IDE Integration**: Support for other IDEs (IntelliJ, etc.)
5. **Mobile Companion**: View progress on mobile
6. **GitHub Integration**: Sync with GitHub Projects/Issues
7. **Reporting**: Generate sprint/progress reports

## 10. Technical Decisions

### Storage Choice
**Decision**: JSON files over SQLite initially
- **Rationale**: Simpler implementation, easier debugging, portable
- **Migration Path**: Abstract storage interface for future SQLite option

### UI Framework
**Decision**: VS Code native Tree View + React for Webview
- **Rationale**: Native performance for tree, rich interactivity for dashboard

### State Management
**Decision**: Simple event-based system with VS Code's EventEmitter
- **Rationale**: Aligns with VS Code patterns, avoids complexity
