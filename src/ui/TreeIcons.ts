/**
 * Tree Icons system for the Goal Tree extension
 * Provides comprehensive icon support using VS Code ThemeIcon and custom icons
 * for visual indicators of goal states, tasks, and progress
 */

import * as vscode from 'vscode';
import { GoalStatus, GoalStatusType } from '../types/GoalStatus';
import { TaskStatus, TaskStatusType } from '../types/Goal';

/**
 * LRU Cache for icon optimization
 */
class IconCache {
  private cache = new Map<string, { icon: IconConfig; lastUsed: number }>();
  private maxSize = 1000;
  private hitCount = 0;
  private missCount = 0;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  get(key: string): IconConfig | null {
    const entry = this.cache.get(key);
    if (entry) {
      entry.lastUsed = Date.now();
      this.hitCount++;
      return entry.icon;
    }
    this.missCount++;
    return null;
  }

  set(key: string, icon: IconConfig): void {
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }
    this.cache.set(key, { icon, lastUsed: Date.now() });
  }

  private evictLRU(): void {
    let oldestKey = '';
    let oldestTime = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  clear(): void {
    this.cache.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }

  getStats() {
    return {
      size: this.cache.size,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: this.hitCount / (this.hitCount + this.missCount) || 0
    };
  }
}

/**
 * Icon preloading system
 */
class IconPreloader {
  private preloadedIcons = new Set<string>();
  private preloadQueue: string[] = [];
  private isPreloading = false;

  /**
   * Add icons to preload queue
   */
  queueForPreload(iconIds: string[]): void {
    for (const iconId of iconIds) {
      if (!this.preloadedIcons.has(iconId) && !this.preloadQueue.includes(iconId)) {
        this.preloadQueue.push(iconId);
      }
    }
    this.processQueue();
  }

  /**
   * Process the preload queue
   */
  private async processQueue(): Promise<void> {
    if (this.isPreloading || this.preloadQueue.length === 0) {
      return;
    }

    this.isPreloading = true;
    
    while (this.preloadQueue.length > 0) {
      const iconId = this.preloadQueue.shift()!;
      await this.preloadIcon(iconId);
      this.preloadedIcons.add(iconId);
      
      // Small delay to avoid blocking the UI thread
      await new Promise(resolve => setTimeout(resolve, 1));
    }

    this.isPreloading = false;
  }

  /**
   * Preload a specific icon
   */
  private async preloadIcon(iconId: string): Promise<void> {
    // In VS Code, icons are loaded on-demand, but we can at least validate them
    try {
      new vscode.ThemeIcon(iconId);
    } catch (error) {
      console.warn(`Failed to preload icon: ${iconId}`, error);
    }
  }

  /**
   * Check if an icon is preloaded
   */
  isPreloaded(iconId: string): boolean {
    return this.preloadedIcons.has(iconId);
  }

  /**
   * Get preload statistics
   */
  getStats() {
    return {
      preloadedCount: this.preloadedIcons.size,
      queueLength: this.preloadQueue.length,
      isPreloading: this.isPreloading
    };
  }
}

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
 * Enhanced with caching, preloading, and advanced visual features
 */
export class TreeIcons {
  private static cache = new IconCache(1000);
  private static preloader = new IconPreloader();
  private static initialized = false;
  
  /**
   * Initialize the icon system with preloading
   */
  static initialize(): void {
    if (this.initialized) {
      return;
    }

    // Preload commonly used icons
    const commonIcons = [
      'circle-outline', 'play-circle', 'error', 'check-all',
      'circle-filled', 'clock', 'check', 'home', 'folder',
      'folder-opened', 'arrow-right', 'flame', 'watch', 'tag', 'graph'
    ];
    
    this.preloader.queueForPreload(commonIcons);
    this.initialized = true;
  }
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
   * Enhanced with caching and additional visual states
   */
  static getGoalIcon(
    status: GoalStatusType, 
    options?: {
      hasChildren?: boolean;
      isExpanded?: boolean;
      isRoot?: boolean;
      isHighPriority?: boolean;
      isOverdue?: boolean;
      isUrgent?: boolean;
      completionPercentage?: number;
      hasActiveTasks?: boolean;
    }
  ): IconConfig {
    const opts = options || {};
    
    // Create cache key for this icon configuration
    const cacheKey = `goal:${status}:${JSON.stringify(opts)}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Generate icon
    const icon = this.generateGoalIcon(status, opts);
    
    // Cache the result
    this.cache.set(cacheKey, icon);
    
    return icon;
  }

  /**
   * Internal method to generate goal icons
   */
  private static generateGoalIcon(
    status: GoalStatusType,
    options: {
      hasChildren?: boolean;
      isExpanded?: boolean;
      isRoot?: boolean;
      isHighPriority?: boolean;
      isOverdue?: boolean;
      isUrgent?: boolean;
      completionPercentage?: number;
      hasActiveTasks?: boolean;
    }
  ): IconConfig {
    // Handle special cases first
    if (options.isRoot) {
      return this.SPECIAL_ICONS.root;
    }
    
    if (options.hasChildren) {
      // Enhanced folder icons with status indication
      const baseFolderIcon = options.isExpanded 
        ? this.SPECIAL_ICONS.folderOpen 
        : this.SPECIAL_ICONS.folder;
        
      // Add status color overlay for folders
      if (options.hasActiveTasks || status === GoalStatus.IN_PROGRESS) {
        return {
          ...baseFolderIcon,
          icon: new vscode.ThemeIcon(
            options.isExpanded ? 'folder-opened' : 'folder',
            new vscode.ThemeColor('charts.orange')
          )
        };
      }
      
      return baseFolderIcon;
    }
    
    // Handle urgent state (overrides other priorities)
    if (options.isUrgent) {
      return {
        icon: new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground')),
        tooltip: `Urgent ${this.GOAL_ICONS[status].tooltip}`,
        accessibilityLabel: `Urgent ${this.GOAL_ICONS[status].accessibilityLabel}`
      };
    }
    
    // Get base icon for status
    const baseIcon = this.GOAL_ICONS[status];
    
    // Enhanced modifiers with more visual states
    if (options.isHighPriority || options.isOverdue) {
      return this.getModifiedIcon(baseIcon, {
        priority: options.isHighPriority,
        overdue: options.isOverdue,
        urgent: options.isUrgent
      });
    }
    
    // Add progress indicator for in-progress goals
    if (status === GoalStatus.IN_PROGRESS && typeof options.completionPercentage === 'number') {
      return this.getProgressEnhancedIcon(baseIcon, options.completionPercentage);
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
   * Create a progress-enhanced icon for active goals
   */
  private static getProgressEnhancedIcon(baseIcon: IconConfig, completionPercentage: number): IconConfig {
    // Use different play icons based on progress
    let iconName: string;
    let color: vscode.ThemeColor;
    
    if (completionPercentage < 25) {
      iconName = 'play-circle';
      color = new vscode.ThemeColor('charts.red');
    } else if (completionPercentage < 50) {
      iconName = 'play-circle';
      color = new vscode.ThemeColor('charts.orange');
    } else if (completionPercentage < 75) {
      iconName = 'play-circle';
      color = new vscode.ThemeColor('charts.yellow');
    } else {
      iconName = 'play-circle';
      color = new vscode.ThemeColor('charts.green');
    }
    
    return {
      icon: new vscode.ThemeIcon(iconName, color),
      tooltip: `${baseIcon.tooltip} (${completionPercentage.toFixed(0)}% complete)`,
      accessibilityLabel: `${baseIcon.accessibilityLabel}, ${completionPercentage.toFixed(0)} percent complete`
    };
  }

  /**
   * Create an icon with overlay indicators for special states
   * Enhanced with additional modifier support
   */
  private static getModifiedIcon(
    baseIcon: IconConfig, 
    modifiers: { priority?: boolean; overdue?: boolean; urgent?: boolean; }
  ): IconConfig {
    // Enhanced modifier handling with priority
    if (modifiers.urgent) {
      return {
        icon: new vscode.ThemeIcon('alert', new vscode.ThemeColor('editorError.foreground')),
        tooltip: `Urgent: ${baseIcon.tooltip}`,
        accessibilityLabel: `Urgent ${baseIcon.accessibilityLabel}`
      };
    }
    
    if (modifiers.overdue) {
      return {
        ...this.SPECIAL_ICONS.overdue,
        tooltip: `Overdue: ${baseIcon.tooltip}`,
        accessibilityLabel: `Overdue ${baseIcon.accessibilityLabel}`
      };
    }
    
    if (modifiers.priority) {
      return {
        ...this.SPECIAL_ICONS.priority,
        tooltip: `High Priority: ${baseIcon.tooltip}`,
        accessibilityLabel: `High priority ${baseIcon.accessibilityLabel}`
      };
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

  /**
   * Get animated progress icon with rotation state
   */
  static getAnimatedProgressIcon(isActive: boolean = false): IconConfig {
    const iconName = isActive ? 'sync~spin' : 'sync';
    return {
      icon: new vscode.ThemeIcon(iconName, new vscode.ThemeColor('charts.blue')),
      tooltip: isActive ? 'Processing...' : 'Ready for updates',
      accessibilityLabel: isActive ? 'Processing updates' : 'Ready to process updates'
    };
  }

  /**
   * Get milestone icon based on achievement state
   */
  static getMilestoneIcon(isAchieved: boolean, isUpcoming: boolean = false): IconConfig {
    if (isAchieved) {
      return {
        icon: new vscode.ThemeIcon('milestone', new vscode.ThemeColor('charts.green')),
        tooltip: 'Milestone Achieved',
        accessibilityLabel: 'Milestone achieved'
      };
    }
    
    if (isUpcoming) {
      return {
        icon: new vscode.ThemeIcon('milestone', new vscode.ThemeColor('charts.yellow')),
        tooltip: 'Upcoming Milestone',
        accessibilityLabel: 'Upcoming milestone'
      };
    }
    
    return {
      icon: new vscode.ThemeIcon('milestone', new vscode.ThemeColor('charts.gray')),
      tooltip: 'Future Milestone',
      accessibilityLabel: 'Future milestone'
    };
  }

  /**
   * Get dependency relationship icon
   */
  static getDependencyIcon(type: 'blocks' | 'blocked-by' | 'related'): IconConfig {
    switch (type) {
      case 'blocks':
        return {
          icon: new vscode.ThemeIcon('arrow-right', new vscode.ThemeColor('charts.red')),
          tooltip: 'Blocks other goals',
          accessibilityLabel: 'This goal blocks other goals'
        };
      case 'blocked-by':
        return {
          icon: new vscode.ThemeIcon('arrow-left', new vscode.ThemeColor('charts.orange')),
          tooltip: 'Blocked by dependencies',
          accessibilityLabel: 'This goal is blocked by dependencies'
        };
      case 'related':
        return {
          icon: new vscode.ThemeIcon('link', new vscode.ThemeColor('charts.blue')),
          tooltip: 'Related to other goals',
          accessibilityLabel: 'This goal is related to other goals'
        };
    }
  }

  /**
   * Get cache statistics for debugging
   */
  static getCacheStats() {
    return {
      cache: this.cache.getStats(),
      preloader: this.preloader.getStats()
    };
  }

  /**
   * Clear all caches
   */
  static clearCache(): void {
    this.cache.clear();
  }

  /**
   * Preload icons for better performance
   */
  static preloadIcons(iconIds: string[]): void {
    this.preloader.queueForPreload(iconIds);
  }

  /**
   * Get icon theme variant (minimal, colorful, emoji)
   */
  static getThemedIcon(
    baseConfig: IconConfig,
    theme: 'minimal' | 'colorful' | 'emoji' | 'default' = 'default'
  ): IconConfig {
    switch (theme) {
      case 'minimal':
        return this.getMinimalIcon(baseConfig);
      case 'colorful':
        return this.getColorfulIcon(baseConfig);
      case 'emoji':
        return this.getEmojiIcon(baseConfig);
      default:
        return baseConfig;
    }
  }

  /**
   * Get minimal theme variant
   */
  private static getMinimalIcon(baseConfig: IconConfig): IconConfig {
    let iconName: string;
    
    if (baseConfig.icon instanceof vscode.ThemeIcon) {
      // Simplify complex icons for minimal theme
      switch (baseConfig.icon.id) {
        case 'play-circle':
          iconName = 'circle-filled';
          break;
        case 'check-all':
          iconName = 'check';
          break;
        case 'folder-opened':
          iconName = 'chevron-down';
          break;
        case 'folder':
          iconName = 'chevron-right';
          break;
        default:
          iconName = baseConfig.icon.id;
      }
    } else {
      iconName = 'circle-outline';
    }
    
    return {
      icon: new vscode.ThemeIcon(iconName, new vscode.ThemeColor('icon.foreground')),
      tooltip: baseConfig.tooltip,
      accessibilityLabel: baseConfig.accessibilityLabel
    };
  }

  /**
   * Get colorful theme variant
   */
  private static getColorfulIcon(baseConfig: IconConfig): IconConfig {
    if (baseConfig.icon instanceof vscode.ThemeIcon) {
      // Enhance colors for colorful theme
      let color: vscode.ThemeColor;
      
      switch (baseConfig.icon.id) {
        case 'circle-outline':
        case 'circle-filled':
          color = new vscode.ThemeColor('charts.blue');
          break;
        case 'play-circle':
        case 'clock':
          color = new vscode.ThemeColor('charts.orange');
          break;
        case 'check':
        case 'check-all':
          color = new vscode.ThemeColor('charts.green');
          break;
        case 'error':
        case 'warning':
          color = new vscode.ThemeColor('charts.red');
          break;
        default:
          color = baseConfig.icon.color || new vscode.ThemeColor('icon.foreground');
      }
      
      return {
        icon: new vscode.ThemeIcon(baseConfig.icon.id, color),
        tooltip: baseConfig.tooltip,
        accessibilityLabel: baseConfig.accessibilityLabel
      };
    }
    
    return baseConfig;
  }

  /**
   * Get emoji theme variant
   */
  private static getEmojiIcon(baseConfig: IconConfig): IconConfig {
    let emojiIcon: string;
    
    if (baseConfig.icon instanceof vscode.ThemeIcon) {
      // Map icons to appropriate emojis
      switch (baseConfig.icon.id) {
        case 'circle-outline':
          emojiIcon = '⭕';
          break;
        case 'circle-filled':
          emojiIcon = '🔵';
          break;
        case 'play-circle':
          emojiIcon = '▶️';
          break;
        case 'check':
        case 'check-all':
          emojiIcon = '✅';
          break;
        case 'error':
          emojiIcon = '❌';
          break;
        case 'warning':
          emojiIcon = '⚠️';
          break;
        case 'clock':
          emojiIcon = '⏱️';
          break;
        case 'flame':
          emojiIcon = '🔥';
          break;
        case 'home':
          emojiIcon = '🏠';
          break;
        case 'folder':
          emojiIcon = '📁';
          break;
        case 'folder-opened':
          emojiIcon = '📂';
          break;
        default:
          emojiIcon = '📌';
      }
    } else {
      emojiIcon = '📌';
    }
    
    return {
      icon: emojiIcon,
      tooltip: baseConfig.tooltip,
      accessibilityLabel: baseConfig.accessibilityLabel
    };
  }
}

/**
 * Enhanced icon utilities for common operations
 * Extended with performance optimizations and additional helpers
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
      return config.icon.id === 'play-circle' || config.icon.id === 'clock' || config.icon.id.includes('sync');
    }
    
    return false;
  }

  /**
   * Get icon priority for sorting
   */
  static getIconPriority(config: IconConfig): number {
    if (config.icon instanceof vscode.ThemeIcon) {
      // Higher numbers = higher priority in UI
      switch (config.icon.id) {
        case 'error':
        case 'warning':
        case 'alert':
          return 100;
        case 'flame':
        case 'watch':
          return 90;
        case 'play-circle':
        case 'sync~spin':
          return 80;
        case 'check-all':
        case 'check':
          return 70;
        default:
          return 50;
      }
    }
    
    return 10; // Low priority for non-ThemeIcon
  }

  /**
   * Create a composite icon description for screen readers
   */
  static createCompositeDescription(configs: IconConfig[]): string {
    const descriptions = configs
      .map(config => config.accessibilityLabel || config.tooltip || 'icon')
      .filter(Boolean);
    
    return descriptions.join(', ');
  }

  /**
   * Validate icon configuration for accessibility
   */
  static validateAccessibility(config: IconConfig): {
    valid: boolean;
    issues: string[];
    suggestions: string[];
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];
    
    if (!config.accessibilityLabel) {
      issues.push('Missing accessibility label');
      suggestions.push('Add accessibilityLabel property for screen readers');
    }
    
    if (!config.tooltip) {
      issues.push('Missing tooltip');
      suggestions.push('Add tooltip property for better user experience');
    }
    
    if (config.icon instanceof vscode.ThemeIcon && !config.icon.color) {
      suggestions.push('Consider adding color for better visual distinction');
    }
    
    return {
      valid: issues.length === 0,
      issues,
      suggestions
    };
  }

  /**
   * Get fallback icon for invalid configurations
   */
  static getFallbackIcon(): IconConfig {
    return {
      icon: new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('icon.foreground')),
      tooltip: 'Unknown item',
      accessibilityLabel: 'Unknown item type'
    };
  }

  /**
   * Merge multiple icon configurations (for overlays)
   */
  static mergeIconConfigs(primary: IconConfig, secondary: IconConfig): IconConfig {
    return {
      icon: primary.icon, // Use primary icon
      tooltip: `${primary.tooltip || ''} - ${secondary.tooltip || ''}`.trim(),
      accessibilityLabel: `${primary.accessibilityLabel || ''} with ${secondary.accessibilityLabel || ''}`.trim()
    };
  }

  /**
   * Create enhanced description for screen readers
   */
  static createEnhancedDescription(config: IconConfig, context?: {
    hasChildren?: boolean;
    childCount?: number;
    level?: number;
    position?: { index: number; total: number };
  }): string {
    const parts: string[] = [];
    
    // Base accessibility label
    if (config.accessibilityLabel) {
      parts.push(config.accessibilityLabel);
    }
    
    // Hierarchical context
    if (context) {
      if (typeof context.level === 'number') {
        parts.push(`level ${context.level}`);
      }
      
      if (context.hasChildren && typeof context.childCount === 'number') {
        parts.push(`with ${context.childCount} child items`);
      }
      
      if (context.position) {
        parts.push(`item ${context.position.index + 1} of ${context.position.total}`);
      }
    }
    
    return parts.join(', ');
  }

  /**
   * Get keyboard navigation hints
   */
  static getKeyboardHints(itemType: 'goal' | 'task' | 'folder'): string {
    const baseHints = 'Press Space to select, Enter to activate';
    
    switch (itemType) {
      case 'folder':
        return `${baseHints}, Arrow keys to expand/collapse`;
      case 'goal':
        return `${baseHints}, Tab to access context menu`;
      case 'task':
        return `${baseHints}, Tab to access task actions`;
      default:
        return baseHints;
    }
  }
}

/**
 * Legacy compatibility layer for TreeTypeUtils integration
 * Provides backward compatibility while leveraging enhanced features
 */
export class TreeIconsCompat {
  /**
   * Convert enhanced IconConfig to VS Code TreeItem iconPath for backward compatibility
   */
  static toTreeItemIconPath(config: IconConfig): vscode.ThemeIcon | vscode.Uri | { light: vscode.Uri; dark: vscode.Uri } {
    return IconUtils.toTreeItemIcon(config);
  }

  /**
   * Get goal icon compatible with TreeTypeUtils expectations
   */
  static getGoalIconCompat(
    goal: { status: GoalStatusType; },
    indicators: {
      isBlocked: boolean;
      isHighPriority: boolean;
      isOverdue: boolean;
      isUrgent?: boolean;
    },
    options?: {
      hasChildren?: boolean;
      isExpanded?: boolean;
      completionPercentage?: number;
    }
  ): vscode.ThemeIcon {
    const enhancedOptions = {
      hasChildren: options?.hasChildren,
      isExpanded: options?.isExpanded,
      isHighPriority: indicators.isHighPriority,
      isOverdue: indicators.isOverdue,
      isUrgent: indicators.isUrgent,
      completionPercentage: options?.completionPercentage
    };
    
    const iconConfig = TreeIcons.getGoalIcon(goal.status, enhancedOptions);
    
    // Ensure we return a ThemeIcon for compatibility
    if (iconConfig.icon instanceof vscode.ThemeIcon) {
      return iconConfig.icon;
    }
    
    // Fallback for non-ThemeIcon cases
    return new vscode.ThemeIcon('circle-outline');
  }

  /**
   * Get task icon compatible with TreeTypeUtils expectations
   */
  static getTaskIconCompat(task: { status: TaskStatusType; }): vscode.ThemeIcon {
    const iconConfig = TreeIcons.getTaskIcon(task.status);
    
    if (iconConfig.icon instanceof vscode.ThemeIcon) {
      return iconConfig.icon;
    }
    
    return new vscode.ThemeIcon('circle-small');
  }

  /**
   * Enhance existing TreeTypeUtils icon with accessibility features
   */
  static enhanceTreeTypeIcon(
    baseIcon: vscode.ThemeIcon,
    context: {
      type: 'goal' | 'task';
      status: GoalStatusType | TaskStatusType;
      tooltip?: string;
    }
  ): IconConfig {
    const accessibilityLabel = context.type === 'goal' ?
      TreeIcons.getGoalIcon(context.status as GoalStatusType).accessibilityLabel :
      TreeIcons.getTaskIcon(context.status as TaskStatusType).accessibilityLabel;
    
    return {
      icon: baseIcon,
      tooltip: context.tooltip,
      accessibilityLabel
    };
  }

  /**
   * Initialize compatibility mode with TreeIcons
   */
  static initializeCompatMode(): void {
    TreeIcons.initialize();
    
    // Preload icons commonly used by TreeTypeUtils
    const commonTreeIcons = [
      'circle-outline', 'play', 'error', 'check',
      'circle-small', 'play-circle', 'check-all',
      'folder', 'folder-opened'
    ];
    
    TreeIcons.preloadIcons(commonTreeIcons);
  }
}

