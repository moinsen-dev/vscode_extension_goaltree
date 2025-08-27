# Goal Tree Visual System

This module provides a comprehensive visual system for the Goal Tree extension, implementing icons, themes, and progress indicators for VS Code tree views.

## Components

### TreeIcons
Central icon registry providing VS Code ThemeIcon-based icons for all goal and task states.

```typescript
import { TreeIcons } from './ui/TreeIcons';

// Get icon for a goal based on its status
const icon = TreeIcons.getGoalIcon(GoalStatus.IN_PROGRESS, {
  hasChildren: true,
  isExpanded: false,
  isHighPriority: true
});

// Get icon for task status
const taskIcon = TreeIcons.getTaskIcon(TaskStatus.DONE);

// Get progress indicator icon
const progressIcon = TreeIcons.getProgressIcon(75);
```

### TreeThemes  
Theme management system supporting dark/light modes and accessibility.

```typescript
import { TreeThemes } from './ui/TreeThemes';

// Initialize theme system
TreeThemes.initialize(context);

// Get theme-appropriate colors
const goalColor = TreeThemes.getGoalColor(GoalStatus.COMPLETED);
const progressColor = TreeThemes.getProgressColor(50);
const uiColor = TreeThemes.getUIColor('background');
```

### ProgressCalculator
Sophisticated progress calculation for hierarchical goal structures.

```typescript
import { ProgressCalculator } from '../utils/ProgressCalculator';

const calculator = new ProgressCalculator({
  weightingMethod: 'task-count',
  includeBlocked: true
});

// Calculate progress for a goal
const progress = calculator.calculateGoalProgress(goal);

// Calculate hierarchical progress
const hierarchicalProgress = calculator.calculateHierarchicalProgress(hierarchy);

// Calculate overall project progress  
const overallProgress = calculator.calculateOverallProgress(allGoals);
```

## Integration with TreeDataProvider

The visual system is designed to integrate seamlessly with VS Code's TreeDataProvider:

```typescript
import { TreeIcons, TreeThemes, IconUtils } from './ui';
import { ProgressCalculator } from './utils/ProgressCalculator';

class GoalTreeItem extends vscode.TreeItem {
  constructor(goal: Goal, progressCalculator: ProgressCalculator) {
    super(goal.title, vscode.TreeItemCollapsibleState.None);
    
    // Set icon using visual system
    const iconConfig = TreeIcons.getGoalIcon(goal.status, {
      hasChildren: this.hasChildren,
      isRoot: !goal.parentId
    });
    this.iconPath = IconUtils.toTreeItemIcon(iconConfig);
    this.tooltip = IconUtils.getTooltip(iconConfig);
    
    // Set colors using theme system
    this.resourceUri = vscode.Uri.parse(`goal:${goal.id}`);
    
    // Add progress information
    const progress = progressCalculator.calculateGoalProgress(goal);
    this.description = `${progress.percentage.toFixed(0)}% (${progress.completed}/${progress.total})`;
  }
}
```

## Visual Indicators

### Goal States
- **Planned**: Blue circle outline (`circle-outline`)
- **In Progress**: Orange play circle (`play-circle`)  
- **Blocked**: Red error icon (`error`)
- **Completed**: Green checkmark (`check-all`)

### Task States  
- **Todo**: Gray circle outline (`circle-outline`)
- **In Progress**: Yellow clock (`clock`)
- **Done**: Green checkmark (`check`)

### Special States
- **Root Goal**: Home icon (`home`)
- **Goal with Children**: Folder icons (`folder`/`folder-opened`)
- **High Priority**: Flame icon (`flame`)
- **Overdue**: Watch icon (`watch`)

### Progress Indicators
Dynamic progress icons based on completion percentage:
- 0%: Gray circle outline
- 1-24%: Red filled circle  
- 25-49%: Orange filled circle
- 50-74%: Yellow filled circle
- 75-99%: Blue filled circle
- 100%: Green checkmark

## Theme Support

### Automatic Theme Switching
The system automatically adapts to VS Code's theme:
- **Dark Theme**: Optimized colors for dark backgrounds
- **Light Theme**: Optimized colors for light backgrounds  
- **High Contrast**: Accessibility-focused high contrast colors

### Color Customization
Users can override default colors through VS Code settings:

```json
{
  "goalTree.theme.colorScheme": "auto",
  "goalTree.theme.autoSwitch": true,
  "goalTree.theme.colorOverrides": {
    "planned": "charts.purple",
    "completed": "charts.blue"
  }
}
```

### Accessibility
- High contrast mode support
- Reduced motion preferences
- Screen reader optimized labels
- Semantic color usage

## Testing

Use the `VisualSystemDemo` class to test the visual system:

```typescript
import { visualSystemDemo } from './ui/VisualSystemDemo';

// Run comprehensive demo
visualSystemDemo.runFullDemo();

// Test specific components
visualSystemDemo.demonstrateIcons();
visualSystemDemo.demonstrateThemes();
visualSystemDemo.demonstrateProgress();

// Test accessibility features
visualSystemDemo.testAccessibility();
```

## Architecture

The visual system follows these design principles:

1. **Theme-Aware**: All colors use VS Code's ThemeColor system
2. **Accessible**: Full accessibility support with labels and high contrast
3. **Performant**: Minimal computational overhead for icon/color selection
4. **Extensible**: Easy to add new visual states and indicators
5. **Consistent**: Follows VS Code's visual design language

## Future Enhancements

- Animated progress indicators
- Custom icon themes
- Goal type-specific iconography  
- Visual dependency relationship indicators
- Progress trend visualization