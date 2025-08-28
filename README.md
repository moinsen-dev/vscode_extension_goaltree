# Goal Tree - VS Code Extension

Visual goal management and tree visualization for VS Code. Organize, track, and visualize your goals in a hierarchical tree structure directly within your development environment.

## Features

- **Hierarchical Goal Management**: Create and organize goals in a tree structure with parent-child relationships
- **Multiple Goal Types**: Support for Tasks, Milestones, and Objectives
- **Status Tracking**: Track goals through various states (Not Started, In Progress, Completed, Blocked, Cancelled)
- **Priority Levels**: Set priority levels from Low to Critical
- **Visual Tree View**: Interactive tree view in VS Code's Activity Bar
- **Quick Actions**: Create, delete, and manage goals with intuitive commands
- **Auto-refresh**: Automatically update the tree view when changes occur
- **Configuration Options**: Customize default goal types and display preferences

## Installation

### From VS Code Marketplace (Coming Soon)
1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Goal Tree"
4. Click Install

### From VSIX Package
1. Download the `.vsix` file from releases
2. Open VS Code
3. Run command `Extensions: Install from VSIX...`
4. Select the downloaded `.vsix` file

### Development Installation
1. Clone the repository
2. Run `npm install`
3. Press F5 to open a new Extension Development Host window

## Usage

### Opening the Goal Tree View
- Click the Goal Tree icon in the Activity Bar, or
- Use the command palette (Ctrl+Shift+P) and run "Goal Tree: Open View"

### Creating Goals
- Click the "+" button in the Goal Tree view, or
- Use the command "Goal Tree: Create New Goal"
- Enter a title for your goal

### Managing Goals
- **Delete**: Right-click a goal and select "Delete Goal" or click the trash icon
- **Refresh**: Click the refresh icon to update the tree view
- **View Details**: Hover over goals to see detailed information in tooltips

### Goal Hierarchy
- Goals can have parent-child relationships
- Child goals are displayed as nested items under their parents
- Deleting a parent goal will also delete all its children

## Configuration

Access settings through VS Code's Settings (File > Preferences > Settings) and search for "Goal Tree":

| Setting | Description | Default |
|---------|-------------|---------|
| `goalTree.autoRefresh` | Automatically refresh the goal tree view when files change | `true` |
| `goalTree.showCompleted` | Show completed goals in the tree view | `true` |
| `goalTree.defaultGoalType` | Default type when creating new goals | `"task"` |

## Commands

The extension contributes the following commands:

- `goalTree.openView`: Open Goal Tree view
- `goalTree.createGoal`: Create New Goal
- `goalTree.deleteGoal`: Delete Goal
- `goalTree.refreshView`: Refresh tree view

## Goal Types

### Task
- Basic actionable item
- Suitable for individual work items
- Icon: Circle outline (empty) or checkmark (completed)

### Milestone
- Significant achievement or checkpoint
- Represents completion of a set of tasks
- Icon: Milestone symbol

### Objective  
- High-level goal or target
- Strategic or long-term focus
- Icon: Target symbol

## Goal Status

- **Not Started**: Goal hasn't been begun
- **In Progress**: Currently working on the goal
- **Completed**: Goal has been finished
- **Blocked**: Goal is waiting on dependencies
- **Cancelled**: Goal has been abandoned

## Goal Priority

- **Low**: Nice to have, no urgency
- **Medium**: Standard priority (default)
- **High**: Important, should be prioritized
- **Critical**: Urgent, highest priority

## Development

### Prerequisites
- Node.js (v16 or higher)
- VS Code (v1.74.0 or higher)

### Building
```bash
npm install
npm run compile
```

### Testing
```bash
npm test
```

### Packaging
```bash
npm run package
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a detailed list of changes and version history.

## Support

- Report bugs and request features through [GitHub Issues](https://github.com/moinsen-dev/vscode_extension_goaltree/issues)
- Join discussions in [GitHub Discussions](https://github.com/moinsen-dev/vscode_extension_goaltree/discussions)

## Roadmap

- [ ] Goal templates and presets
- [ ] Due date tracking and notifications  
- [ ] Progress tracking with percentages
- [ ] Goal sharing and collaboration features
- [ ] Integration with task management systems
- [ ] Advanced filtering and search capabilities
- [ ] Goal analytics and reporting
- [ ] Import/export functionality
- [ ] Custom goal attributes and metadata

---

**Enjoy managing your goals visually in VS Code!**