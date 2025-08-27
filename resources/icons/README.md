# Goal Tree Icons

This directory contains custom icon assets for the Goal Tree extension. The extension primarily uses VS Code's built-in ThemeIcon system for consistency, but custom icons can be placed here for specialized use cases.

## Icon Categories

### Goal Status Icons
- **planned.svg** - Icon for planned goals (not yet started)
- **in-progress.svg** - Icon for goals currently being worked on
- **blocked.svg** - Icon for goals blocked by dependencies
- **completed.svg** - Icon for successfully completed goals

### Task Status Icons
- **todo.svg** - Icon for tasks that need to be done
- **task-in-progress.svg** - Icon for tasks currently being worked on
- **done.svg** - Icon for completed tasks

### Special Purpose Icons
- **root-goal.svg** - Icon for root-level goals
- **folder-goal.svg** - Icon for goals with child goals (collapsed)
- **folder-goal-open.svg** - Icon for goals with child goals (expanded)
- **dependency.svg** - Icon for dependency relationships
- **priority.svg** - Icon for high priority items
- **overdue.svg** - Icon for overdue items
- **progress.svg** - Icon for progress indicators

### Progress Indicators
- **progress-0.svg** - 0% progress indicator
- **progress-25.svg** - 25% progress indicator
- **progress-50.svg** - 50% progress indicator
- **progress-75.svg** - 75% progress indicator
- **progress-100.svg** - 100% progress indicator

## Design Guidelines

### Size and Format
- Icons should be 16x16px for optimal display in the tree view
- SVG format is preferred for scalability and theme compatibility
- PNG format can be used as fallback with both light and dark variants

### Color Scheme
- Icons should work with both light and dark VS Code themes
- Use semantic colors that match VS Code's color system
- Avoid hardcoded colors; use CSS variables or theme-aware colors when possible

### Style
- Follow VS Code's visual design language
- Use consistent line weights and visual hierarchy
- Ensure good contrast and accessibility
- Keep designs simple and recognizable at small sizes

## Implementation Notes

The main icon system is implemented in `src/ui/TreeIcons.ts` and uses VS Code's ThemeIcon system by default. Custom icons from this directory can be used by:

1. Adding the icon file to the appropriate subdirectory
2. Registering the icon path in the TreeIcons configuration
3. Using the icon in TreeDataProvider implementations

## Theme Integration

Icons work with the theming system in `src/ui/TreeThemes.ts` to automatically adapt to:
- Light/Dark mode switching
- High contrast accessibility modes
- Custom color scheme preferences
- User-defined color overrides

## Future Enhancements

- Animated progress indicators
- Custom goal type icons based on metadata tags
- Priority-based icon overlays
- Status transition animations