/**
 * Tree Themes system for the Goal Tree extension
 * Provides comprehensive theming support for dark/light modes and custom themes
 * Handles color schemes, visual styling, and accessibility considerations
 */

import * as vscode from 'vscode';
import { GoalStatus, GoalStatusType } from '../types/GoalStatus';
import { TaskStatus, TaskStatusType } from '../types/Goal';

/**
 * Color scheme definitions for different themes
 */
export interface ColorScheme {
  /** Theme identifier */
  id: string;
  
  /** Human-readable theme name */
  name: string;
  
  /** Base VS Code theme kind this scheme is optimized for */
  baseTheme: vscode.ColorThemeKind;
  
  /** Goal status colors */
  goalColors: Record<GoalStatusType, vscode.ThemeColor>;
  
  /** Task status colors */
  taskColors: Record<TaskStatusType, vscode.ThemeColor>;
  
  /** UI element colors */
  uiColors: {
    progress: vscode.ThemeColor;
    priority: vscode.ThemeColor;
    overdue: vscode.ThemeColor;
    dependency: vscode.ThemeColor;
    hover: vscode.ThemeColor;
    selection: vscode.ThemeColor;
    border: vscode.ThemeColor;
    background: vscode.ThemeColor;
    text: vscode.ThemeColor;
    textSecondary: vscode.ThemeColor;
  };
  
  /** Progress bar colors for different completion levels */
  progressColors: {
    empty: vscode.ThemeColor;
    low: vscode.ThemeColor;        // 0-25%
    medium: vscode.ThemeColor;     // 25-50%
    high: vscode.ThemeColor;       // 50-75%
    complete: vscode.ThemeColor;   // 75-100%
    full: vscode.ThemeColor;       // 100%
  };
}

/**
 * Theme configuration options
 */
export interface ThemeConfig {
  /** Active color scheme */
  colorScheme: string;
  
  /** Whether to auto-switch themes based on VS Code theme */
  autoSwitch: boolean;
  
  /** Custom color overrides */
  colorOverrides?: Partial<ColorScheme['goalColors'] & ColorScheme['taskColors']>;
  
  /** Visual density (compact, normal, comfortable) */
  density: 'compact' | 'normal' | 'comfortable';
  
  /** Whether to show progress animations */
  animations: boolean;
  
  /** Accessibility enhancements */
  accessibility: {
    highContrast: boolean;
    reducedMotion: boolean;
    screenReaderOptimized: boolean;
  };
}

/**
 * Central theme management system
 */
export class TreeThemes {
  private static _activeTheme: ColorScheme | null = null;
  private static _config: ThemeConfig = {
    colorScheme: 'auto',
    autoSwitch: true,
    density: 'normal',
    animations: true,
    accessibility: {
      highContrast: false,
      reducedMotion: false,
      screenReaderOptimized: false
    }
  };

  /**
   * Predefined color schemes
   */
  private static readonly COLOR_SCHEMES: Record<string, ColorScheme> = {
    dark: {
      id: 'dark',
      name: 'Dark Theme',
      baseTheme: vscode.ColorThemeKind.Dark,
      goalColors: {
        [GoalStatus.PLANNED]: new vscode.ThemeColor('charts.blue'),
        [GoalStatus.IN_PROGRESS]: new vscode.ThemeColor('charts.orange'),
        [GoalStatus.BLOCKED]: new vscode.ThemeColor('charts.red'),
        [GoalStatus.COMPLETED]: new vscode.ThemeColor('charts.green')
      },
      taskColors: {
        [TaskStatus.TODO]: new vscode.ThemeColor('charts.gray'),
        [TaskStatus.IN_PROGRESS]: new vscode.ThemeColor('charts.yellow'),
        [TaskStatus.DONE]: new vscode.ThemeColor('charts.green')
      },
      uiColors: {
        progress: new vscode.ThemeColor('progressBar.background'),
        priority: new vscode.ThemeColor('charts.red'),
        overdue: new vscode.ThemeColor('editorError.foreground'),
        dependency: new vscode.ThemeColor('charts.purple'),
        hover: new vscode.ThemeColor('list.hoverBackground'),
        selection: new vscode.ThemeColor('list.activeSelectionBackground'),
        border: new vscode.ThemeColor('contrastBorder'),
        background: new vscode.ThemeColor('sideBar.background'),
        text: new vscode.ThemeColor('sideBar.foreground'),
        textSecondary: new vscode.ThemeColor('descriptionForeground')
      },
      progressColors: {
        empty: new vscode.ThemeColor('charts.gray'),
        low: new vscode.ThemeColor('charts.red'),
        medium: new vscode.ThemeColor('charts.orange'),
        high: new vscode.ThemeColor('charts.yellow'),
        complete: new vscode.ThemeColor('charts.blue'),
        full: new vscode.ThemeColor('charts.green')
      }
    },

    light: {
      id: 'light',
      name: 'Light Theme',
      baseTheme: vscode.ColorThemeKind.Light,
      goalColors: {
        [GoalStatus.PLANNED]: new vscode.ThemeColor('charts.blue'),
        [GoalStatus.IN_PROGRESS]: new vscode.ThemeColor('charts.orange'),
        [GoalStatus.BLOCKED]: new vscode.ThemeColor('charts.red'),
        [GoalStatus.COMPLETED]: new vscode.ThemeColor('charts.green')
      },
      taskColors: {
        [TaskStatus.TODO]: new vscode.ThemeColor('charts.gray'),
        [TaskStatus.IN_PROGRESS]: new vscode.ThemeColor('charts.yellow'),
        [TaskStatus.DONE]: new vscode.ThemeColor('charts.green')
      },
      uiColors: {
        progress: new vscode.ThemeColor('progressBar.background'),
        priority: new vscode.ThemeColor('charts.red'),
        overdue: new vscode.ThemeColor('editorError.foreground'),
        dependency: new vscode.ThemeColor('charts.purple'),
        hover: new vscode.ThemeColor('list.hoverBackground'),
        selection: new vscode.ThemeColor('list.activeSelectionBackground'),
        border: new vscode.ThemeColor('contrastBorder'),
        background: new vscode.ThemeColor('sideBar.background'),
        text: new vscode.ThemeColor('sideBar.foreground'),
        textSecondary: new vscode.ThemeColor('descriptionForeground')
      },
      progressColors: {
        empty: new vscode.ThemeColor('charts.gray'),
        low: new vscode.ThemeColor('charts.red'),
        medium: new vscode.ThemeColor('charts.orange'),
        high: new vscode.ThemeColor('charts.yellow'),
        complete: new vscode.ThemeColor('charts.blue'),
        full: new vscode.ThemeColor('charts.green')
      }
    },

    highContrast: {
      id: 'highContrast',
      name: 'High Contrast',
      baseTheme: vscode.ColorThemeKind.HighContrast,
      goalColors: {
        [GoalStatus.PLANNED]: new vscode.ThemeColor('contrastActiveBorder'),
        [GoalStatus.IN_PROGRESS]: new vscode.ThemeColor('focusBorder'),
        [GoalStatus.BLOCKED]: new vscode.ThemeColor('errorForeground'),
        [GoalStatus.COMPLETED]: new vscode.ThemeColor('debugIcon.stepOverForeground')
      },
      taskColors: {
        [TaskStatus.TODO]: new vscode.ThemeColor('foreground'),
        [TaskStatus.IN_PROGRESS]: new vscode.ThemeColor('focusBorder'),
        [TaskStatus.DONE]: new vscode.ThemeColor('debugIcon.stepOverForeground')
      },
      uiColors: {
        progress: new vscode.ThemeColor('contrastBorder'),
        priority: new vscode.ThemeColor('errorForeground'),
        overdue: new vscode.ThemeColor('errorForeground'),
        dependency: new vscode.ThemeColor('contrastActiveBorder'),
        hover: new vscode.ThemeColor('list.hoverBackground'),
        selection: new vscode.ThemeColor('list.activeSelectionBackground'),
        border: new vscode.ThemeColor('contrastBorder'),
        background: new vscode.ThemeColor('editor.background'),
        text: new vscode.ThemeColor('foreground'),
        textSecondary: new vscode.ThemeColor('descriptionForeground')
      },
      progressColors: {
        empty: new vscode.ThemeColor('contrastBorder'),
        low: new vscode.ThemeColor('errorForeground'),
        medium: new vscode.ThemeColor('focusBorder'),
        high: new vscode.ThemeColor('contrastActiveBorder'),
        complete: new vscode.ThemeColor('focusBorder'),
        full: new vscode.ThemeColor('debugIcon.stepOverForeground')
      }
    }
  };

  /**
   * Initialize the theme system
   */
  static initialize(context: vscode.ExtensionContext): void {
    // Load user configuration
    this.loadConfiguration();
    
    // Set initial theme
    this.updateActiveTheme();
    
    // Listen for theme changes
    const disposable = vscode.window.onDidChangeActiveColorTheme(() => {
      if (this._config.autoSwitch) {
        this.updateActiveTheme();
      }
    });
    
    context.subscriptions.push(disposable);
  }

  /**
   * Get the currently active theme
   */
  static getActiveTheme(): ColorScheme {
    if (!this._activeTheme) {
      this.updateActiveTheme();
    }
    return this._activeTheme!;
  }

  /**
   * Get color for a specific goal status
   */
  static getGoalColor(status: GoalStatusType): vscode.ThemeColor {
    const theme = this.getActiveTheme();
    return theme.goalColors[status];
  }

  /**
   * Get color for a specific task status
   */
  static getTaskColor(status: TaskStatusType): vscode.ThemeColor {
    const theme = this.getActiveTheme();
    return theme.taskColors[status];
  }

  /**
   * Get progress color based on completion percentage
   */
  static getProgressColor(completionPercentage: number): vscode.ThemeColor {
    const theme = this.getActiveTheme();
    
    if (completionPercentage === 0) {
      return theme.progressColors.empty;
    } else if (completionPercentage < 25) {
      return theme.progressColors.low;
    } else if (completionPercentage < 50) {
      return theme.progressColors.medium;
    } else if (completionPercentage < 75) {
      return theme.progressColors.high;
    } else if (completionPercentage < 100) {
      return theme.progressColors.complete;
    } else {
      return theme.progressColors.full;
    }
  }

  /**
   * Get UI color for specific elements
   */
  static getUIColor(element: keyof ColorScheme['uiColors']): vscode.ThemeColor {
    const theme = this.getActiveTheme();
    return theme.uiColors[element];
  }

  /**
   * Update the active theme based on current VS Code theme
   */
  private static updateActiveTheme(): void {
    const currentTheme = vscode.window.activeColorTheme;
    
    // Apply accessibility overrides first
    if (this._config.accessibility.highContrast || 
        currentTheme.kind === vscode.ColorThemeKind.HighContrast) {
      this._activeTheme = this.COLOR_SCHEMES.highContrast;
      return;
    }
    
    // Auto-detect theme if configured
    if (this._config.colorScheme === 'auto') {
      switch (currentTheme.kind) {
        case vscode.ColorThemeKind.Dark:
          this._activeTheme = this.COLOR_SCHEMES.dark;
          break;
        case vscode.ColorThemeKind.Light:
          this._activeTheme = this.COLOR_SCHEMES.light;
          break;
        default:
          this._activeTheme = this.COLOR_SCHEMES.dark; // fallback
      }
    } else {
      // Use explicitly configured theme
      this._activeTheme = this.COLOR_SCHEMES[this._config.colorScheme] || this.COLOR_SCHEMES.dark;
    }
    
    // Apply any color overrides
    if (this._config.colorOverrides) {
      this._activeTheme = this.applyColorOverrides(this._activeTheme, this._config.colorOverrides);
    }
  }

  /**
   * Apply user color overrides to a theme
   */
  private static applyColorOverrides(
    theme: ColorScheme, 
    overrides: Partial<ColorScheme['goalColors'] & ColorScheme['taskColors']>
  ): ColorScheme {
    const modifiedTheme = { ...theme };
    
    // Apply goal color overrides
    Object.entries(overrides).forEach(([key, value]) => {
      if (Object.values(GoalStatus).includes(key as GoalStatusType) && value) {
        modifiedTheme.goalColors[key as GoalStatusType] = value as vscode.ThemeColor;
      }
      if (Object.values(TaskStatus).includes(key as TaskStatusType) && value) {
        modifiedTheme.taskColors[key as TaskStatusType] = value as vscode.ThemeColor;
      }
    });
    
    return modifiedTheme;
  }

  /**
   * Load theme configuration from VS Code settings
   */
  private static loadConfiguration(): void {
    const config = vscode.workspace.getConfiguration('goalTree.theme');
    
    this._config = {
      colorScheme: config.get('colorScheme', 'auto'),
      autoSwitch: config.get('autoSwitch', true),
      colorOverrides: config.get('colorOverrides'),
      density: config.get('density', 'normal'),
      animations: config.get('animations', true),
      accessibility: {
        highContrast: config.get('accessibility.highContrast', false),
        reducedMotion: config.get('accessibility.reducedMotion', false),
        screenReaderOptimized: config.get('accessibility.screenReaderOptimized', false)
      }
    };
  }

  /**
   * Update theme configuration
   */
  static updateConfiguration(newConfig: Partial<ThemeConfig>): void {
    this._config = { ...this._config, ...newConfig };
    this.updateActiveTheme();
  }

  /**
   * Get current theme configuration
   */
  static getConfiguration(): ThemeConfig {
    return { ...this._config };
  }

  /**
   * Get all available color schemes
   */
  static getAvailableSchemes(): ColorScheme[] {
    return Object.values(this.COLOR_SCHEMES);
  }

  /**
   * Check if animations should be used based on configuration and system settings
   */
  static shouldUseAnimations(): boolean {
    return this._config.animations && !this._config.accessibility.reducedMotion;
  }

  /**
   * Check if high contrast mode is active
   */
  static isHighContrastMode(): boolean {
    return this._config.accessibility.highContrast || 
           vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast;
  }

  /**
   * Get CSS-like styles for web-based components
   */
  static getWebStyles(): Record<string, string> {
    const theme = this.getActiveTheme();
    
    return {
      '--goal-planned-color': theme.goalColors[GoalStatus.PLANNED].id,
      '--goal-in-progress-color': theme.goalColors[GoalStatus.IN_PROGRESS].id,
      '--goal-blocked-color': theme.goalColors[GoalStatus.BLOCKED].id,
      '--goal-completed-color': theme.goalColors[GoalStatus.COMPLETED].id,
      '--task-todo-color': theme.taskColors[TaskStatus.TODO].id,
      '--task-in-progress-color': theme.taskColors[TaskStatus.IN_PROGRESS].id,
      '--task-done-color': theme.taskColors[TaskStatus.DONE].id,
      '--ui-background': theme.uiColors.background.id,
      '--ui-text': theme.uiColors.text.id,
      '--ui-text-secondary': theme.uiColors.textSecondary.id,
      '--ui-border': theme.uiColors.border.id,
      '--ui-hover': theme.uiColors.hover.id,
      '--ui-selection': theme.uiColors.selection.id
    };
  }
}

/**
 * Theme utilities for common operations
 */
export class ThemeUtils {
  /**
   * Convert a ThemeColor to a string representation for debugging
   */
  static themeColorToString(color: vscode.ThemeColor): string {
    return `ThemeColor(${color.id})`;
  }

  /**
   * Check if two theme colors are the same
   */
  static areThemeColorsEqual(color1: vscode.ThemeColor, color2: vscode.ThemeColor): boolean {
    return color1.id === color2.id;
  }

  /**
   * Generate a CSS class name from a status
   */
  static getStatusClassName(status: GoalStatusType | TaskStatusType): string {
    return `goal-tree-${status.replace(/-/g, '-')}`;
  }

  /**
   * Get appropriate text color based on background
   */
  static getContrastTextColor(): vscode.ThemeColor {
    // For now, use VS Code's intelligent text coloring
    return new vscode.ThemeColor('foreground');
  }

  /**
   * Create a muted version of a color for secondary elements
   */
  static getMutedColor(): vscode.ThemeColor {
    // Return a muted version - for now just use description foreground
    return new vscode.ThemeColor('descriptionForeground');
  }
}

