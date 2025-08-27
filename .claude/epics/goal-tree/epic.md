---
name: goal-tree
status: backlog
created: 2025-08-26T08:10:57Z
updated: 2025-08-26T18:49:23Z
last_sync: 2025-08-26T18:49:23Z
progress: 0%
prd: .claude/prds/goal-tree.md
github: https://github.com/moinsen-dev/vscode_extension_goaltree/issues/1
---

# Epic: goal-tree

## Overview
Implementation of a hierarchical goal and task management system as a VS Code extension. The system provides a tree-based interface in the sidebar for organizing complex development work into manageable, trackable goals with dependency relationships and progress visualization.

## Architecture Decisions

### Extension Architecture Pattern
- **TreeDataProvider Pattern**: Use VS Code's native TreeDataProvider for sidebar integration
- **Model-View-Controller**: Separate data models, UI components, and business logic
- **Event-Driven State**: Use VS Code's EventEmitter for state change notifications
- **Command Pattern**: Implement all operations as VS Code commands for keyboard accessibility

### Technology Stack
- **TypeScript**: Full type safety and VS Code integration
- **VS Code Extension API**: Native sidebar TreeView and command palette integration
- **JSON Storage**: Simple file-based persistence with workspace isolation
- **No External Dependencies**: Minimize bundle size and installation complexity

### Data Architecture
- **Hierarchical Tree Structure**: Goals contain sub-goals and tasks in unlimited nesting
- **Immutable State Updates**: Prevent inconsistent state during operations
- **Workspace Isolation**: Each VS Code workspace maintains separate goal trees
- **Schema Validation**: Validate data integrity on load and save

## Technical Approach

### Extension Structure
```
src/
├── extension.ts          # Extension entry point and activation
├── models/              # Data models and interfaces
│   ├── Goal.ts
│   ├── Task.ts
│   └── GoalTree.ts
├── services/            # Business logic and data management
│   ├── GoalManager.ts
│   ├── StorageService.ts
│   └── DependencyResolver.ts
├── providers/           # VS Code integration
│   ├── GoalTreeProvider.ts
│   └── GoalTreeItem.ts
├── commands/            # Command palette handlers
│   ├── GoalCommands.ts
│   └── TaskCommands.ts
└── utils/               # Helper utilities
    ├── IdGenerator.ts
    └── Validators.ts
```

### Core Data Models
```typescript
interface Goal {
  id: string
  title: string
  description?: string
  status: 'planned' | 'in-progress' | 'blocked' | 'completed'
  parentId?: string
  blockedByIds: string[]
  tasks: Task[]
  createdAt: Date
  completedAt?: Date
}

interface Task {
  id: string
  title: string
  status: 'todo' | 'in-progress' | 'done'
  order: number
  createdAt: Date
  completedAt?: Date
}
```

### Storage Strategy
- **File Location**: `.vscode/goal-tree.json` in workspace root
- **Format**: Human-readable JSON for version control compatibility
- **Auto-save**: Immediate persistence on all changes
- **Validation**: Schema validation on load with error recovery

## Implementation Strategy

### Phase 1: Core Foundation
- Extension scaffold with proper VS Code integration
- Basic Goal and Task data models with TypeScript interfaces
- Simple JSON storage service with workspace isolation
- TreeDataProvider implementation for sidebar display

### Phase 2: Goal Operations
- Goal creation, editing, deletion with proper validation
- Hierarchical parent-child relationships
- Status management (planned → in-progress → blocked → completed)
- Command palette integration for all operations

### Phase 3: Task Management
- Task creation and management within goals
- Task reordering with drag-and-drop support
- Task completion tracking and visual feedback
- Progress calculation based on task completion

### Phase 4: Dependency System
- Blocking relationship management between goals
- Visual dependency indicators in tree view
- Circular dependency detection and prevention
- Auto-unblocking when dependencies complete

### Phase 5: Polish & Performance
- Performance optimization for large goal trees
- Keyboard shortcuts for common operations
- Error handling and data recovery
- Extension settings and configuration

## Task Breakdown Preview

1. **Extension Infrastructure** - VS Code extension setup, build pipeline, and activation
2. **Data Models & Storage** - TypeScript interfaces, JSON persistence, workspace isolation
3. **Tree View Implementation** - TreeDataProvider, tree items, basic display
4. **Goal Management System** - CRUD operations, hierarchy, status management
5. **Task Management System** - Task operations, reordering, progress tracking
6. **Command Integration** - Command palette, keyboard shortcuts, context menus
7. **Dependency Management** - Blocking relationships, validation, auto-resolution
8. **UI Polish & Testing** - Icons, theming, error handling, comprehensive testing

## Dependencies

### VS Code Platform Requirements
- VS Code Engine: minimum version 1.80.0
- Node.js runtime provided by VS Code
- File system access for workspace storage

### Development Dependencies
- TypeScript 5.x for type safety and compilation
- @types/vscode for VS Code API type definitions
- VS Code Extension Test Runner for automated testing
- webpack or esbuild for extension bundling

### Internal System Dependencies
- TreeDataProvider must implement VS Code's interface contract
- StorageService requires workspace context for file operations
- CommandHandler depends on VS Code's command registration system
- DependencyResolver requires access to complete goal tree state

## Success Criteria (Technical)

### Performance Benchmarks
- Tree view renders within 500ms for up to 1000 goals
- Goal operations complete within 100ms
- Extension activation under 200ms
- Memory usage under 50MB for typical workloads

### Quality Gates
- 100% TypeScript compilation without errors
- All operations covered by automated tests
- No data loss during normal operations
- Graceful error handling for corrupted data

### Acceptance Criteria
- All PRD functional requirements implemented
- TreeView follows VS Code UI patterns and conventions
- Command palette integration for all operations
- Keyboard accessibility for primary workflows

## Estimated Effort

### Overall Timeline: 4-6 weeks
- **Week 1**: Extension setup and core data models
- **Week 2**: Tree view implementation and basic goal operations
- **Week 3**: Task management and progress tracking
- **Week 4**: Dependency system and validation
- **Week 5-6**: Polish, testing, and performance optimization

### Resource Requirements
- 1 senior developer with VS Code extension experience
- Access to VS Code extension testing infrastructure
- Target users for feedback during development

### Critical Path Items
1. VS Code TreeDataProvider implementation (blocks all UI work)
2. Goal hierarchy system (blocks dependency features)
3. Storage service stability (blocks all persistence)
4. Command system integration (blocks user interactions)

The implementation leverages VS Code's native patterns and APIs to create a performant, intuitive goal management system that integrates seamlessly with developer workflows while maintaining clear boundaries and avoiding scope creep.

## Tasks Created
- [ ] #2 - Extension Infrastructure Setup (parallel: true)
- [ ] #3 - Data Models and Storage Service (parallel: true)
- [ ] #4 - Goal Management System (parallel: true)
- [ ] #5 - Dependency Management (parallel: true)
- [ ] #6 - Tree View Implementation (parallel: false)
- [ ] #7 - Task Management System (parallel: true)
- [ ] #8 - UI Polish and Testing (parallel: false)
- [ ] #9 - Command Integration (parallel: true)

Total tasks:        8
Parallel tasks:        6
Sequential tasks: 2
Estimated total effort: 114-144 hours
