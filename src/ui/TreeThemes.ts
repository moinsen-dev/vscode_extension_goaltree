/**
 * Tree Themes system for the Goal Tree extension
 * Provides comprehensive theming support for dark/light modes and custom themes
 * Handles color schemes, visual styling, and accessibility considerations
 */

import * as vscode from 'vscode';
import { GoalStatus, GoalStatusType } from '../types/GoalStatus';
import { TaskStatus, TaskStatusType } from '../types/Goal';

/**
 * Theme change event data
 */
export interface ThemeChangeEvent {
  /** Previous theme */
  previousTheme: ColorScheme | null;
  
  /** New active theme */
  currentTheme: ColorScheme;
  
  /** Reason for theme change */
  changeReason: 'user' | 'system' | 'auto' | 'accessibility';
  
  /** Timestamp of the change */
  timestamp: number;
}

/**
 * Theme change listener function type
 */
export type ThemeChangeListener = (event: ThemeChangeEvent) => void | Promise<void>;

/**
 * Theme performance metrics
 */
interface ThemeMetrics {
  /** Number of theme changes */
  changeCount: number;
  
  /** Last theme change duration (ms) */
  lastChangeDuration: number;
  
  /** Average theme change duration (ms) */
  averageChangeDuration: number;
  
  /** Cache hit rate */
  cacheHitRate: number;
  
  /** Memory usage (estimated) */
  estimatedMemoryUsage: number;
}

/**
 * Enhanced theme configuration with performance settings
 */
export interface EnhancedThemeConfig extends ThemeConfig {
  /** Performance optimizations */
  performance: {
    /** Enable theme caching */
    enableCaching: boolean;
    
    /** Cache size limit */
    cacheSize: number;
    
    /** Debounce theme changes (ms) */
    debounceDelay: number;
    
    /** Enable performance monitoring */
    enableMetrics: boolean;
  };
  
  /** Advanced features */
  advanced: {
    /** Enable system theme sync */
    syncWithSystem: boolean;
    
    /** Custom theme definitions */
    customThemes: Record<string, Partial<ColorScheme>>;
    
    /** Theme transition animations */
    enableTransitions: boolean;
    
    /** Preload themes for faster switching */
    preloadThemes: boolean;
  };
}

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
 * Enhanced central theme management system
 * Features caching, performance monitoring, and dynamic adaptation
 */
export class TreeThemes {
  // Theme change listeners
  private static _listeners: ThemeChangeListener[] = [];
  
  // Performance metrics
  private static _metrics: ThemeMetrics = {
    changeCount: 0,
    lastChangeDuration: 0,
    averageChangeDuration: 0,
    cacheHitRate: 0,
    estimatedMemoryUsage: 0
  };
  
  // Theme cache for performance
  private static _themeCache = new Map<string, ColorScheme>();
  private static _colorCache = new Map<string, vscode.ThemeColor>();
  
  // System theme detection
  private static _systemThemeWatcher: vscode.Disposable | null = null;
  private static _lastSystemThemeCheck = 0;
  private static _systemThemeCheckInterval = 5000; // 5 seconds
  private static _activeTheme: ColorScheme | null = null;
  private static _config: EnhancedThemeConfig = {
    colorScheme: 'auto',
    autoSwitch: true,
    density: 'normal',
    animations: true,
    accessibility: {
      highContrast: false,
      reducedMotion: false,
      screenReaderOptimized: false
    },
    performance: {
      enableCaching: true,
      cacheSize: 100,
      debounceDelay: 150,
      enableMetrics: false
    },
    advanced: {
      syncWithSystem: true,
      customThemes: {},
      enableTransitions: true,
      preloadThemes: true
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
   * Initialize the enhanced theme system
   */
  static initialize(context: vscode.ExtensionContext): void {
    // Load user configuration
    this.loadConfiguration();
    
    // Set initial theme
    this.updateActiveTheme();
    
    // Preload themes if enabled
    if (this._config.advanced.preloadThemes) {
      this.preloadAllThemes();
    }
    
    // Listen for theme changes with debouncing
    let themeChangeTimeout: NodeJS.Timeout | null = null;
    const disposable = vscode.window.onDidChangeActiveColorTheme(() => {
      if (!this._config.autoSwitch) {
        return;
      }
      
      // Debounce theme changes for performance
      if (themeChangeTimeout) {
        clearTimeout(themeChangeTimeout);
      }
      
      themeChangeTimeout = setTimeout(() => {
        const startTime = Date.now();
        const previousTheme = this._activeTheme;
        
        this.updateActiveTheme('system');
        
        // Update metrics
        const duration = Date.now() - startTime;
        this.updateMetrics(duration);
        
        // Notify listeners
        if (previousTheme !== this._activeTheme) {
          this.notifyListeners({
            previousTheme,
            currentTheme: this._activeTheme!,
            changeReason: 'system',
            timestamp: Date.now()
          });
        }
      }, this._config.performance.debounceDelay);
    });
    
    // Set up system theme watcher if enabled
    if (this._config.advanced.syncWithSystem) {
      this.initializeSystemThemeWatcher();
    }
    
    context.subscriptions.push(disposable);
    
    if (this._systemThemeWatcher) {
      context.subscriptions.push(this._systemThemeWatcher);
    }
  }

  /**
   * Get the currently active theme with caching
   */
  static getActiveTheme(): ColorScheme {
    if (!this._activeTheme) {
      this.updateActiveTheme();
    }
    
    // Update cache hit metrics
    if (this._config.performance.enableMetrics) {
      const cacheKey = `active-theme-${this._activeTheme?.id || 'unknown'}`;
      const cached = this._themeCache.has(cacheKey);
      this._metrics.cacheHitRate = cached ? 
        (this._metrics.cacheHitRate * 0.9 + 0.1) : 
        (this._metrics.cacheHitRate * 0.9);
    }
    
    return this._activeTheme!;
  }

  /**
   * Get color for a specific goal status with caching
   */
  static getGoalColor(status: GoalStatusType): vscode.ThemeColor {
    const cacheKey = `goal-color-${status}-${this.getActiveTheme().id}`;
    
    if (this._config.performance.enableCaching) {
      const cached = this._colorCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }
    
    const theme = this.getActiveTheme();
    const color = theme.goalColors[status];
    
    if (this._config.performance.enableCaching) {
      this._colorCache.set(cacheKey, color);
      this.cleanupCache();
    }
    
    return color;
  }

  /**
   * Get color for a specific task status with caching
   */
  static getTaskColor(status: TaskStatusType): vscode.ThemeColor {
    const cacheKey = `task-color-${status}-${this.getActiveTheme().id}`;
    
    if (this._config.performance.enableCaching) {
      const cached = this._colorCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }
    
    const theme = this.getActiveTheme();
    const color = theme.taskColors[status];
    
    if (this._config.performance.enableCaching) {
      this._colorCache.set(cacheKey, color);
      this.cleanupCache();
    }
    
    return color;
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
   * Enhanced with change reason tracking and performance monitoring
   */
  private static updateActiveTheme(changeReason: 'user' | 'system' | 'auto' | 'accessibility' = 'auto'): void {
    const startTime = Date.now();
    const previousTheme = this._activeTheme;
    const currentTheme = vscode.window.activeColorTheme;
    
    // Check cache first for performance
    const cacheKey = `theme-${this._config.colorScheme}-${currentTheme.kind}-${this._config.accessibility.highContrast}`;
    
    if (this._config.performance.enableCaching && this._themeCache.has(cacheKey)) {
      this._activeTheme = this._themeCache.get(cacheKey)!;
      return;
    }
    
    let selectedTheme: ColorScheme;
    
    // Apply accessibility overrides first
    if (this._config.accessibility.highContrast || 
        currentTheme.kind === vscode.ColorThemeKind.HighContrast) {
      selectedTheme = this.COLOR_SCHEMES.highContrast;
    } else if (this._config.colorScheme === 'auto') {
      // Auto-detect theme based on system
      switch (currentTheme.kind) {
        case vscode.ColorThemeKind.Dark:
          selectedTheme = this.COLOR_SCHEMES.dark;
          break;
        case vscode.ColorThemeKind.Light:
          selectedTheme = this.COLOR_SCHEMES.light;
          break;
        default:
          selectedTheme = this.COLOR_SCHEMES.dark; // fallback
      }
    } else {
      // Use explicitly configured theme
      selectedTheme = this.COLOR_SCHEMES[this._config.colorScheme] || this.COLOR_SCHEMES.dark;
    }
    
    // Apply custom themes if configured
    if (this._config.advanced.customThemes[selectedTheme.id]) {
      selectedTheme = this.mergeWithCustomTheme(selectedTheme, this._config.advanced.customThemes[selectedTheme.id]);
    }
    
    // Apply any color overrides
    if (this._config.colorOverrides) {
      selectedTheme = this.applyColorOverrides(selectedTheme, this._config.colorOverrides);
    }
    
    this._activeTheme = selectedTheme;
    
    // Cache the result
    if (this._config.performance.enableCaching) {
      this._themeCache.set(cacheKey, selectedTheme);
      this.cleanupCache();
    }
    
    // Update metrics
    if (this._config.performance.enableMetrics) {
      const duration = Date.now() - startTime;
      this.updateMetrics(duration);
      
      if (previousTheme?.id !== selectedTheme.id) {
        this._metrics.changeCount++;
      }
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
      if (Object.values(GoalStatus).includes(key as any) && value) {
        modifiedTheme.goalColors[key as GoalStatusType] = value as vscode.ThemeColor;
      }
      if (Object.values(TaskStatus).includes(key as any) && value) {
        modifiedTheme.taskColors[key as TaskStatusType] = value as vscode.ThemeColor;
      }
    });
    
    return modifiedTheme;
  }

  /**
   * Load enhanced theme configuration from VS Code settings
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
      },
      performance: {
        enableCaching: config.get('performance.enableCaching', true),
        cacheSize: config.get('performance.cacheSize', 100),
        debounceDelay: config.get('performance.debounceDelay', 150),
        enableMetrics: config.get('performance.enableMetrics', false)
      },
      advanced: {
        syncWithSystem: config.get('advanced.syncWithSystem', true),
        customThemes: config.get('advanced.customThemes', {}),
        enableTransitions: config.get('advanced.enableTransitions', true),
        preloadThemes: config.get('advanced.preloadThemes', true)
      }
    };
  }

  /**
   * Update theme configuration with enhanced options
   */
  static updateConfiguration(newConfig: Partial<EnhancedThemeConfig>): void {
    const previousConfig = { ...this._config };
    this._config = this.deepMerge(this._config, newConfig) as EnhancedThemeConfig;
    
    // Clear caches if caching was disabled or cache size changed
    if (!this._config.performance.enableCaching || 
        previousConfig.performance.cacheSize !== this._config.performance.cacheSize) {
      this.clearAllCaches();
    }
    
    // Restart system theme watcher if sync setting changed
    if (previousConfig.advanced.syncWithSystem !== this._config.advanced.syncWithSystem) {
      if (this._systemThemeWatcher) {
        this._systemThemeWatcher.dispose();
        this._systemThemeWatcher = null;
      }
      
      if (this._config.advanced.syncWithSystem) {
        this.initializeSystemThemeWatcher();
      }
    }
    
    this.updateActiveTheme('user');
  }

  /**
   * Get current enhanced theme configuration
   */
  static getConfiguration(): EnhancedThemeConfig {
    return this.deepClone(this._config);
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

  /**
   * Add a theme change listener
   */
  static addThemeChangeListener(listener: ThemeChangeListener): vscode.Disposable {
    this._listeners.push(listener);
    
    return {
      dispose: () => {
        const index = this._listeners.indexOf(listener);
        if (index !== -1) {
          this._listeners.splice(index, 1);
        }
      }
    };
  }

  /**
   * Get theme performance metrics
   */
  static getMetrics(): ThemeMetrics {
    return { ...this._metrics };
  }

  /**
   * Clear all theme caches
   */
  static clearAllCaches(): void {
    this._themeCache.clear();
    this._colorCache.clear();
    
    if (this._config.performance.enableMetrics) {
      this._metrics.cacheHitRate = 0;
    }
  }

  /**
   * Preload all available themes
   */
  private static preloadAllThemes(): void {
    Object.values(this.COLOR_SCHEMES).forEach(theme => {
      const cacheKey = `preload-${theme.id}`;
      this._themeCache.set(cacheKey, theme);
    });
  }

  /**
   * Initialize system theme watcher
   */
  private static initializeSystemThemeWatcher(): void {
    // VS Code doesn't provide direct system theme events, so we'll poll periodically
    const checkSystemTheme = () => {
      const now = Date.now();
      if (now - this._lastSystemThemeCheck < this._systemThemeCheckInterval) {
        return;
      }
      
      this._lastSystemThemeCheck = now;
      
      // Check if system theme preferences changed
      const currentTheme = vscode.window.activeColorTheme;
      if (this._config.advanced.syncWithSystem && this._config.colorScheme === 'auto') {
        this.updateActiveTheme('system');
      }
    };
    
    // Check every 5 seconds when extension is active
    const interval = setInterval(checkSystemTheme, this._systemThemeCheckInterval);
    
    this._systemThemeWatcher = {
      dispose: () => {
        clearInterval(interval);
      }
    };
  }

  /**
   * Notify all theme change listeners
   */
  private static async notifyListeners(event: ThemeChangeEvent): Promise<void> {
    const promises = this._listeners.map(listener => {
      try {
        return Promise.resolve(listener(event));
      } catch (error) {
        console.error('Theme change listener error:', error);
        return Promise.resolve();
      }
    });
    
    await Promise.allSettled(promises);
  }

  /**
   * Update performance metrics
   */
  private static updateMetrics(duration: number): void {
    if (!this._config.performance.enableMetrics) {
      return;
    }
    
    this._metrics.lastChangeDuration = duration;
    
    // Calculate running average
    if (this._metrics.averageChangeDuration === 0) {
      this._metrics.averageChangeDuration = duration;
    } else {
      this._metrics.averageChangeDuration = 
        (this._metrics.averageChangeDuration * 0.8) + (duration * 0.2);
    }
    
    // Estimate memory usage
    this._metrics.estimatedMemoryUsage = 
      (this._themeCache.size * 1024) + // Rough estimate per theme
      (this._colorCache.size * 64);    // Rough estimate per color
  }

  /**
   * Clean up caches when they get too large
   */
  private static cleanupCache(): void {
    const maxCacheSize = this._config.performance.cacheSize;
    
    if (this._themeCache.size > maxCacheSize) {
      // Remove oldest entries (simple FIFO for now)
      const keysToRemove = Array.from(this._themeCache.keys()).slice(0, Math.floor(maxCacheSize * 0.2));
      keysToRemove.forEach(key => this._themeCache.delete(key));
    }
    
    if (this._colorCache.size > maxCacheSize * 2) {
      // Remove oldest entries
      const keysToRemove = Array.from(this._colorCache.keys()).slice(0, Math.floor(maxCacheSize * 0.4));
      keysToRemove.forEach(key => this._colorCache.delete(key));
    }
  }

  /**
   * Merge custom theme with base theme
   */
  private static mergeWithCustomTheme(baseTheme: ColorScheme, customTheme: Partial<ColorScheme>): ColorScheme {
    return this.deepMerge(baseTheme, customTheme) as ColorScheme;
  }

  /**
   * Deep merge utility
   */
  private static deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  /**
   * Deep clone utility
   */
  private static deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (obj instanceof Date) {
      return new Date(obj.getTime()) as unknown as T;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.deepClone(item)) as unknown as T;
    }
    
    const cloned = {} as T;
    for (const key in obj) {
      cloned[key] = this.deepClone(obj[key]);
    }
    
    return cloned;
  }
}

/**
 * Accessibility utilities for theme system
 */
export class AccessibilityUtils {
  /**
   * Check if high contrast mode should be used
   */
  static shouldUseHighContrast(): boolean {
    const config = TreeThemes.getConfiguration();
    return config.accessibility.highContrast || 
           vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast;
  }

  /**
   * Get accessible color contrast for text on background
   */
  static getAccessibleTextColor(backgroundColor: vscode.ThemeColor): vscode.ThemeColor {
    if (this.shouldUseHighContrast()) {
      return new vscode.ThemeColor('contrastActiveBorder');
    }
    
    // Use VS Code's intelligent contrast calculation
    return new vscode.ThemeColor('foreground');
  }

  /**
   * Get accessible focus indicator color
   */
  static getFocusIndicatorColor(): vscode.ThemeColor {
    if (this.shouldUseHighContrast()) {
      return new vscode.ThemeColor('focusBorder');
    }
    
    return new vscode.ThemeColor('focusBorder');
  }

  /**
   * Create accessible color scheme for specific disabilities
   */
  static createAccessibleColorScheme(
    baseScheme: ColorScheme,
    type: 'high-contrast' | 'colorblind-deuteranopia' | 'colorblind-protanopia' | 'colorblind-tritanopia'
  ): ColorScheme {
    const accessibleScheme = { ...baseScheme };
    
    switch (type) {
      case 'high-contrast':
        return this.createHighContrastScheme(accessibleScheme);
      case 'colorblind-deuteranopia':
      case 'colorblind-protanopia':
        return this.createRedGreenColorblindScheme(accessibleScheme);
      case 'colorblind-tritanopia':
        return this.createBlueYellowColorblindScheme(accessibleScheme);
      default:
        return accessibleScheme;
    }
  }

  /**
   * Create high contrast color scheme
   */
  private static createHighContrastScheme(baseScheme: ColorScheme): ColorScheme {
    return {
      ...baseScheme,
      id: `${baseScheme.id}-high-contrast`,
      name: `${baseScheme.name} (High Contrast)`,
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
        ...baseScheme.uiColors,
        text: new vscode.ThemeColor('foreground'),
        background: new vscode.ThemeColor('editor.background'),
        border: new vscode.ThemeColor('contrastBorder')
      }
    };
  }

  /**
   * Create red-green colorblind friendly scheme
   */
  private static createRedGreenColorblindScheme(baseScheme: ColorScheme): ColorScheme {
    return {
      ...baseScheme,
      id: `${baseScheme.id}-colorblind-rg`,
      name: `${baseScheme.name} (Colorblind Friendly)`,
      goalColors: {
        [GoalStatus.PLANNED]: new vscode.ThemeColor('charts.blue'),
        [GoalStatus.IN_PROGRESS]: new vscode.ThemeColor('charts.purple'),
        [GoalStatus.BLOCKED]: new vscode.ThemeColor('charts.yellow'),
        [GoalStatus.COMPLETED]: new vscode.ThemeColor('charts.blue')
      },
      taskColors: {
        [TaskStatus.TODO]: new vscode.ThemeColor('charts.gray'),
        [TaskStatus.IN_PROGRESS]: new vscode.ThemeColor('charts.purple'),
        [TaskStatus.DONE]: new vscode.ThemeColor('charts.blue')
      }
    };
  }

  /**
   * Create blue-yellow colorblind friendly scheme
   */
  private static createBlueYellowColorblindScheme(baseScheme: ColorScheme): ColorScheme {
    return {
      ...baseScheme,
      id: `${baseScheme.id}-colorblind-by`,
      name: `${baseScheme.name} (Blue-Yellow Colorblind Friendly)`,
      goalColors: {
        [GoalStatus.PLANNED]: new vscode.ThemeColor('charts.red'),
        [GoalStatus.IN_PROGRESS]: new vscode.ThemeColor('charts.green'),
        [GoalStatus.BLOCKED]: new vscode.ThemeColor('charts.red'),
        [GoalStatus.COMPLETED]: new vscode.ThemeColor('charts.green')
      },
      taskColors: {
        [TaskStatus.TODO]: new vscode.ThemeColor('charts.gray'),
        [TaskStatus.IN_PROGRESS]: new vscode.ThemeColor('charts.green'),
        [TaskStatus.DONE]: new vscode.ThemeColor('charts.green')
      }
    };
  }

  /**
   * Generate screen reader description for visual state
   */
  static generateScreenReaderDescription(
    type: 'goal' | 'task',
    status: GoalStatusType | TaskStatusType,
    additionalInfo?: {
      progress?: number;
      priority?: 'high' | 'normal' | 'low';
      isBlocked?: boolean;
      isOverdue?: boolean;
    }
  ): string {
    const parts: string[] = [];
    
    // Base description
    parts.push(type === 'goal' ? 'Goal' : 'Task');
    
    // Status description
    if (type === 'goal') {
      switch (status as GoalStatusType) {
        case GoalStatus.PLANNED:
          parts.push('planned but not started');
          break;
        case GoalStatus.IN_PROGRESS:
          parts.push('currently in progress');
          break;
        case GoalStatus.BLOCKED:
          parts.push('blocked by dependencies');
          break;
        case GoalStatus.COMPLETED:
          parts.push('completed successfully');
          break;
      }
    } else {
      switch (status as TaskStatusType) {
        case TaskStatus.TODO:
          parts.push('to be done');
          break;
        case TaskStatus.IN_PROGRESS:
          parts.push('in progress');
          break;
        case TaskStatus.DONE:
          parts.push('completed');
          break;
      }
    }
    
    // Additional information
    if (additionalInfo) {
      if (typeof additionalInfo.progress === 'number') {
        parts.push(`${additionalInfo.progress.toFixed(0)} percent complete`);
      }
      
      if (additionalInfo.priority === 'high') {
        parts.push('high priority');
      }
      
      if (additionalInfo.isBlocked) {
        parts.push('blocked');
      }
      
      if (additionalInfo.isOverdue) {
        parts.push('overdue');
      }
    }
    
    return parts.join(', ');
  }

  /**
   * Check if reduced motion is preferred
   */
  static shouldReduceMotion(): boolean {
    const config = TreeThemes.getConfiguration();
    return config.accessibility.reducedMotion;
  }

  /**
   * Get appropriate animation duration based on accessibility settings
   */
  static getAnimationDuration(defaultMs: number): number {
    if (this.shouldReduceMotion()) {
      return 0; // No animations
    }
    
    return defaultMs;
  }
}

/**
 * Enhanced theme utilities for common operations
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
   * Get appropriate text color based on background with accessibility support
   */
  static getContrastTextColor(): vscode.ThemeColor {
    return AccessibilityUtils.getAccessibleTextColor(new vscode.ThemeColor('editor.background'));
  }

  /**
   * Create a muted version of a color for secondary elements
   */
  static getMutedColor(): vscode.ThemeColor {
    if (AccessibilityUtils.shouldUseHighContrast()) {
      return new vscode.ThemeColor('foreground');
    }
    
    return new vscode.ThemeColor('descriptionForeground');
  }

  /**
   * Get focus ring color for accessibility
   */
  static getFocusRingColor(): vscode.ThemeColor {
    return AccessibilityUtils.getFocusIndicatorColor();
  }

  /**
   * Check if current theme supports animations
   */
  static shouldUseAnimations(): boolean {
    const config = TreeThemes.getConfiguration();
    return config.animations && !AccessibilityUtils.shouldReduceMotion();
  }
}

