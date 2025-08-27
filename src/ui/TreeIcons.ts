/**
 * Tree Icons system for the Goal Tree extension
 * Provides comprehensive icon support using VS Code ThemeIcon and custom icons
 * for visual indicators of goal states, tasks, and progress
 */

import * as vscode from 'vscode';
import { GoalStatus, GoalStatusType } from '../types/GoalStatus';
import { TaskStatus, TaskStatusType } from '../types/Goal';

/**
 * Icon theme configuration for different visual styles
 */
export interface IconTheme {
  /** Base icon style (codicon, custom, or emoji) */
  style: 'codicon' | 'custom' | 'emoji';
  
  /** Size variant for different contexts */
  size: 'small' | 'medium' | 'large';
  
  /** Whether to show status overlay indicators */
  showOverlays: boolean;
  
  /** Color scheme adaptation */
  colorScheme: 'auto' | 'dark' | 'light';
}

/**
 * Icon configuration for a specific item type
 */
export interface IconConfig {
  /** The icon identifier (ThemeIcon.id or path) */
  icon: string | vscode.ThemeIcon;
  
  /** Optional color override */
  color?: vscode.ThemeColor;
  
  /** Tooltip text for the icon */
  tooltip?: string;
  
  /** Accessibility label */
  accessibilityLabel?: string;
}

/**
 * Central icon registry for all tree view icons
 */
export class TreeIcons {
  private static readonly GOAL_ICONS: Record<GoalStatusType, IconConfig> = {
    [GoalStatus.PLANNED]: {
      icon: new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.blue')),
      tooltip: 'Planned Goal',
      accessibilityLabel: 'Planned goal, not yet started'
    },
    
    [GoalStatus.IN_PROGRESS]: {
      icon: new vscode.ThemeIcon('play-circle', new vscode.ThemeColor('charts.orange')),
      tooltip: 'In Progress Goal',
      accessibilityLabel: 'Goal currently in progress'
    },
    
    [GoalStatus.BLOCKED]: {
      icon: new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red')),
      tooltip: 'Blocked Goal',
      accessibilityLabel: 'Goal blocked by dependencies'
    },
    
    [GoalStatus.COMPLETED]: {
      icon: new vscode.ThemeIcon('check-all', new vscode.ThemeColor('charts.green')),
      tooltip: 'Completed Goal',
      accessibilityLabel: 'Goal successfully completed'
    }
  };

  private static readonly TASK_ICONS: Record<TaskStatusType, IconConfig> = {
    [TaskStatus.TODO]: {
      icon: new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.gray')),
      tooltip: 'Todo Task',
      accessibilityLabel: 'Task to be done'
    },
    
    [TaskStatus.IN_PROGRESS]: {
      icon: new vscode.ThemeIcon('clock', new vscode.ThemeColor('charts.yellow')),
      tooltip: 'In Progress Task',
      accessibilityLabel: 'Task currently in progress'
    },
    
    [TaskStatus.DONE]: {
      icon: new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green')),
      tooltip: 'Completed Task',
      accessibilityLabel: 'Task completed successfully'
    }
  };

  private static readonly SPECIAL_ICONS: Record<string, IconConfig> = {
    root: {
      icon: new vscode.ThemeIcon('home', new vscode.ThemeColor('icon.foreground')),
      tooltip: 'Root Goal',
      accessibilityLabel: 'Root level goal'
    },
    
    folder: {
      icon: new vscode.ThemeIcon('folder', new vscode.ThemeColor('icon.foreground')),
      tooltip: 'Goal Folder',
      accessibilityLabel: 'Goal with child goals'
    },
    
    folderOpen: {
      icon: new vscode.ThemeIcon('folder-opened', new vscode.ThemeColor('icon.foreground')),
      tooltip: 'Expanded Goal Folder',
      accessibilityLabel: 'Expanded goal with child goals'
    },
    
    dependency: {
      icon: new vscode.ThemeIcon('arrow-right', new vscode.ThemeColor('charts.purple')),
      tooltip: 'Dependency Link',
      accessibilityLabel: 'Goal dependency relationship'
    },
    
    priority: {
      icon: new vscode.ThemeIcon('flame', new vscode.ThemeColor('charts.red')),
      tooltip: 'High Priority',
      accessibilityLabel: 'High priority item'
    },
    
    overdue: {
      icon: new vscode.ThemeIcon('watch', new vscode.ThemeColor('editorError.foreground')),
      tooltip: 'Overdue',
      accessibilityLabel: 'Item is overdue'
    },
    
    tag: {
      icon: new vscode.ThemeIcon('tag', new vscode.ThemeColor('charts.blue')),
      tooltip: 'Tagged Item',
      accessibilityLabel: 'Item with tags'
    },
    
    progress: {
      icon: new vscode.ThemeIcon('graph', new vscode.ThemeColor('charts.green')),
      tooltip: 'Progress Indicator',
      accessibilityLabel: 'Progress visualization'
    }
  };

  /**
   * Get icon for a goal based on its status and properties
   */
  static getGoalIcon(
    status: GoalStatusType, 
    options?: {
      hasChildren?: boolean;
      isExpanded?: boolean;
      isRoot?: boolean;
      isHighPriority?: boolean;
      isOverdue?: boolean;
    }
  ): IconConfig {
    const opts = options || {};
    
    // Handle special cases first
    if (opts.isRoot) {
      return this.SPECIAL_ICONS.root;
    }
    
    if (opts.hasChildren) {
      return opts.isExpanded 
        ? this.SPECIAL_ICONS.folderOpen 
        : this.SPECIAL_ICONS.folder;
    }
    
    // Get base icon for status
    const baseIcon = this.GOAL_ICONS[status];
    
    // Apply modifiers based on options
    if (opts.isHighPriority || opts.isOverdue) {
      return this.getModifiedIcon(baseIcon, {
        priority: opts.isHighPriority,
        overdue: opts.isOverdue
      });
    }
    
    return baseIcon;
  }

  /**
   * Get icon for a task based on its status
   */
  static getTaskIcon(status: TaskStatusType): IconConfig {
    return this.TASK_ICONS[status];
  }

  /**
   * Get special purpose icons
   */
  static getSpecialIcon(type: keyof typeof TreeIcons.SPECIAL_ICONS): IconConfig {
    return this.SPECIAL_ICONS[type];
  }

  /**
   * Create a progress indicator icon based on completion percentage
   */
  static getProgressIcon(completionPercentage: number): IconConfig {
    let iconName: string;
    let color: vscode.ThemeColor;
    
    if (completionPercentage === 0) {
      iconName = 'circle-outline';
      color = new vscode.ThemeColor('charts.gray');
    } else if (completionPercentage < 25) {
      iconName = 'circle-filled';
      color = new vscode.ThemeColor('charts.red');
    } else if (completionPercentage < 50) {
      iconName = 'circle-filled';
      color = new vscode.ThemeColor('charts.orange');
    } else if (completionPercentage < 75) {
      iconName = 'circle-filled';
      color = new vscode.ThemeColor('charts.yellow');
    } else if (completionPercentage < 100) {
      iconName = 'circle-filled';
      color = new vscode.ThemeColor('charts.blue');
    } else {
      iconName = 'pass-filled';
      color = new vscode.ThemeColor('charts.green');
    }
    
    return {
      icon: new vscode.ThemeIcon(iconName, color),
      tooltip: `${completionPercentage.toFixed(0)}% Complete`,
      accessibilityLabel: `${completionPercentage.toFixed(0)} percent complete`
    };
  }

  /**
   * Create an icon with overlay indicators for special states
   */
  private static getModifiedIcon(
    baseIcon: IconConfig, 
    modifiers: { priority?: boolean; overdue?: boolean; }
  ): IconConfig {
    // For now, return base icon - in the future we could composite icons
    // or use different icon variants based on modifiers
    if (modifiers.overdue) {
      return this.SPECIAL_ICONS.overdue;
    }
    
    if (modifiers.priority) {
      return this.SPECIAL_ICONS.priority;
    }
    
    return baseIcon;
  }

  /**
   * Get all available icons for debugging/configuration purposes
   */
  static getAllIcons(): Record<string, IconConfig> {
    return {
      ...this.GOAL_ICONS,
      ...this.TASK_ICONS,
      ...this.SPECIAL_ICONS
    };
  }

  /**
   * Validate that an icon configuration is valid
   */
  static validateIconConfig(config: IconConfig): boolean {
    try {
      // Check if icon is properly configured
      if (typeof config.icon === 'string') {
        return config.icon.length > 0;
      }
      
      if (config.icon instanceof vscode.ThemeIcon) {
        return config.icon.id.length > 0;
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create a custom icon configuration
   */
  static createCustomIcon(
    iconId: string,
    color?: vscode.ThemeColor,
    tooltip?: string,
    accessibilityLabel?: string
  ): IconConfig {
    return {
      icon: new vscode.ThemeIcon(iconId, color),
      tooltip,
      accessibilityLabel
    };
  }
}

/**
 * Icon utilities for common operations
 */
export class IconUtils {
  /**
   * Convert IconConfig to VS Code TreeItem iconPath
   */
  static toTreeItemIcon(config: IconConfig): vscode.ThemeIcon | vscode.Uri | { light: vscode.Uri; dark: vscode.Uri } {
    if (config.icon instanceof vscode.ThemeIcon) {
      return config.icon;
    }
    
    if (typeof config.icon === 'string') {
      // Assume it's a file path for custom icons
      return vscode.Uri.file(config.icon);
    }
    
    // Fallback to default icon
    return new vscode.ThemeIcon('circle-outline');
  }

  /**
   * Get the tooltip text from an icon configuration
   */
  static getTooltip(config: IconConfig): string | undefined {
    return config.tooltip;
  }

  /**
   * Get the accessibility label from an icon configuration
   */
  static getAccessibilityLabel(config: IconConfig): string | undefined {
    return config.accessibilityLabel;
  }

  /**
   * Check if an icon represents a completed state
   */
  static isCompletedState(config: IconConfig): boolean {
    if (config.icon instanceof vscode.ThemeIcon) {
      return config.icon.id === 'check-all' || config.icon.id === 'check' || config.icon.id === 'pass-filled';
    }
    
    return false;
  }

  /**
   * Check if an icon represents a blocked/error state  
   */
  static isErrorState(config: IconConfig): boolean {
    if (config.icon instanceof vscode.ThemeIcon) {
      return config.icon.id === 'error' || config.icon.id === 'warning';
    }
    
    return false;
  }

  /**
   * Check if an icon represents an active/in-progress state
   */
  static isActiveState(config: IconConfig): boolean {
    if (config.icon instanceof vscode.ThemeIcon) {
      return config.icon.id === 'play-circle' || config.icon.id === 'clock';
    }
    
    return false;
  }
}

export { IconConfig, IconTheme };