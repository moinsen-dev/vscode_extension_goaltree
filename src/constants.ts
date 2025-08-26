/**
 * Shared constants for the goal tree extension
 */

// Extension Information
export const EXTENSION_ID = 'goal-tree';
export const EXTENSION_NAME = 'Goal Tree';
export const EXTENSION_PUBLISHER = 'moinsen-dev';
export const EXTENSION_VERSION = '0.0.1';

// Commands
export const COMMANDS = {
    // Tree view commands
    OPEN_VIEW: 'goalTree.openView',
    REFRESH_VIEW: 'goalTree.refreshView',
    SELECT_ITEM: 'goalTree.selectItem',
    
    // Goal management commands
    CREATE_GOAL: 'goalTree.createGoal',
    CREATE_SUB_GOAL: 'goalTree.createSubGoal',
    EDIT_GOAL: 'goalTree.editGoal',
    DELETE_GOAL: 'goalTree.deleteGoal',
    DUPLICATE_GOAL: 'goalTree.duplicateGoal',
    
    // Goal status commands
    MARK_IN_PROGRESS: 'goalTree.markInProgress',
    MARK_COMPLETED: 'goalTree.markCompleted',
    MARK_BLOCKED: 'goalTree.markBlocked',
    MARK_PLANNED: 'goalTree.markPlanned',
    
    // Task management commands
    ADD_TASK: 'goalTree.addTask',
    EDIT_TASK: 'goalTree.editTask',
    DELETE_TASK: 'goalTree.deleteTask',
    TOGGLE_TASK: 'goalTree.toggleTask',
    MOVE_TASK_UP: 'goalTree.moveTaskUp',
    MOVE_TASK_DOWN: 'goalTree.moveTaskDown',
    
    // Dependency commands
    ADD_DEPENDENCY: 'goalTree.addDependency',
    REMOVE_DEPENDENCY: 'goalTree.removeDependency',
    SHOW_DEPENDENCIES: 'goalTree.showDependencies',
    
    // View configuration commands
    TOGGLE_COMPLETED: 'goalTree.toggleCompleted',
    GROUP_BY_STATUS: 'goalTree.groupByStatus',
    SORT_BY_TITLE: 'goalTree.sortByTitle',
    SORT_BY_CREATED: 'goalTree.sortByCreated',
    SORT_BY_PRIORITY: 'goalTree.sortByPriority',
    
    // Import/Export commands
    EXPORT_GOALS: 'goalTree.exportGoals',
    IMPORT_GOALS: 'goalTree.importGoals',
    
    // Statistics commands
    SHOW_STATISTICS: 'goalTree.showStatistics'
} as const;

// View IDs
export const VIEWS = {
    GOAL_TREE: 'goalTreeView',
    GOAL_TREE_CONTAINER: 'goalTreeContainer'
} as const;

// Configuration Keys
export const CONFIG_KEYS = {
    SHOW_COMPLETED: 'goalTree.showCompleted',
    SHOW_TASK_COUNTS: 'goalTree.showTaskCounts',
    AUTO_REFRESH: 'goalTree.autoRefresh',
    DEFAULT_GOAL_TYPE: 'goalTree.defaultGoalType',
    GROUP_BY_STATUS: 'goalTree.groupByStatus',
    MAX_DEPTH: 'goalTree.maxDepth',
    SORT_ORDER: 'goalTree.sortOrder',
    SORT_DIRECTION: 'goalTree.sortDirection',
    
    // Filter settings
    FILTER_SEARCH_TEXT: 'goalTree.filter.searchText',
    FILTER_STATUS: 'goalTree.filter.status',
    FILTER_TAGS: 'goalTree.filter.tags',
    FILTER_PRIORITY_RANGE: 'goalTree.filter.priorityRange',
    FILTER_HAS_TASKS_ONLY: 'goalTree.filter.hasTasksOnly',
    FILTER_BLOCKED_ONLY: 'goalTree.filter.blockedOnly',
    
    // Storage settings
    STORAGE_AUTO_SAVE_INTERVAL: 'goalTree.storage.autoSaveInterval',
    STORAGE_MAX_BACKUPS: 'goalTree.storage.maxBackups',
    STORAGE_ENABLE_COMPRESSION: 'goalTree.storage.enableCompression',
    STORAGE_COMPRESSION_THRESHOLD: 'goalTree.storage.compressionThreshold',
    
    // Performance settings
    PERFORMANCE_MAX_GOALS_IN_VIEW: 'goalTree.performance.maxGoalsInView',
    PERFORMANCE_ENABLE_VIRTUALIZATION: 'goalTree.performance.enableVirtualization',
    PERFORMANCE_DEBOUNCE_INTERVAL: 'goalTree.performance.debounceInterval',
    
    // Notification settings
    NOTIFICATIONS_SHOW_GOAL_COMPLETION: 'goalTree.notifications.showGoalCompletion',
    NOTIFICATIONS_SHOW_GOAL_BLOCKED: 'goalTree.notifications.showGoalBlocked',
    NOTIFICATIONS_SHOW_IMPORT_EXPORT_RESULTS: 'goalTree.notifications.showImportExportResults',
    NOTIFICATIONS_SOUND_ENABLED: 'goalTree.notifications.soundEnabled',
    
    // Debug settings
    DEBUG_ENABLE_LOGGING: 'goalTree.debug.enableLogging',
    DEBUG_LOG_LEVEL: 'goalTree.debug.logLevel',
    DEBUG_LOG_TO_FILE: 'goalTree.debug.logToFile',
    DEBUG_PERFORMANCE_MONITORING: 'goalTree.debug.performanceMonitoring'
} as const;

// Storage Keys
export const STORAGE_KEYS = {
    GOAL_TREE_DATA: 'goalTreeData',
    GOAL_TREE_DATA_BACKUP: 'goalTreeDataBackup',
    TREE_VIEW_STATE: 'treeViewState',
    USER_PREFERENCES: 'userPreferences'
} as const;

// Goal and Task Limits
export const LIMITS = {
    MAX_GOAL_TITLE_LENGTH: 200,
    MAX_GOAL_DESCRIPTION_LENGTH: 2000,
    MAX_TASK_TITLE_LENGTH: 200,
    MAX_TASK_DESCRIPTION_LENGTH: 1000,
    MAX_HIERARCHY_DEPTH: 10,
    MAX_GOALS_PER_PARENT: 100,
    MAX_TASKS_PER_GOAL: 50,
    MAX_BLOCKING_RELATIONSHIPS: 20,
    MAX_TAGS_PER_GOAL: 10,
    MAX_TAG_LENGTH: 30
} as const;

// Default Values
export const DEFAULTS = {
    AUTO_SAVE_INTERVAL: 5000, // 5 seconds
    MAX_BACKUPS: 10,
    COMPRESSION_THRESHOLD: 100000, // 100KB
    DEBOUNCE_INTERVAL: 300, // 300ms
    MAX_GOALS_IN_VIEW: 1000,
    GOAL_PRIORITY: 3, // Medium priority (1-5 scale)
    GOAL_TYPE: 'task'
} as const;

// Goal Status Values
export const GOAL_STATUS = {
    PLANNED: 'planned',
    IN_PROGRESS: 'in-progress',
    BLOCKED: 'blocked',
    COMPLETED: 'completed'
} as const;

// Task Status Values
export const TASK_STATUS = {
    TODO: 'todo',
    IN_PROGRESS: 'in-progress',
    DONE: 'done'
} as const;

// Tree Node Types
export const TREE_NODE_TYPES = {
    GOAL: 'goal',
    TASK: 'task',
    CATEGORY: 'category'
} as const;

// Context Values for Commands
export const CONTEXT_VALUES = {
    GOAL: 'goal',
    TASK: 'task',
    CATEGORY: 'category',
    
    // Goal status contexts
    GOAL_PLANNED: 'goal_status-planned',
    GOAL_IN_PROGRESS: 'goal_status-in-progress',
    GOAL_BLOCKED: 'goal_status-blocked',
    GOAL_COMPLETED: 'goal_status-completed',
    
    // Task status contexts
    TASK_TODO: 'task_status-todo',
    TASK_IN_PROGRESS: 'task_status-in-progress',
    TASK_DONE: 'task_status-done',
    
    // Additional contexts
    HAS_TASKS: 'has-tasks',
    HAS_CHILDREN: 'has-children',
    IS_BLOCKED: 'blocked',
    
    // Priority contexts
    HIGH_PRIORITY: 'high-priority',
    MEDIUM_PRIORITY: 'medium-priority',
    LOW_PRIORITY: 'low-priority',
    
    // Urgency contexts
    URGENT: 'urgent',
    OVERDUE: 'overdue',
    HAS_DEPENDENCIES: 'has-dependencies'
} as const;

// Icons (VS Code built-in icons)
export const ICONS = {
    // Goal status icons (standard)
    GOAL_PLANNED: '$(circle-outline)',
    GOAL_IN_PROGRESS: '$(play)',
    GOAL_BLOCKED: '$(stop)',
    GOAL_COMPLETED: '$(check)',
    
    // Goal status icons (enhanced)
    GOAL_PLANNED_PRIORITY: '$(circle-large-outline)',
    GOAL_IN_PROGRESS_PRIORITY: '$(play)',
    GOAL_BLOCKED_DEPENDENCY: '$(debug-disconnect)',
    GOAL_BLOCKED_ERROR: '$(error)',
    GOAL_COMPLETED_SUCCESS: '$(pass)',
    
    // Task status icons (standard)
    TASK_TODO: '$(circle-outline)',
    TASK_IN_PROGRESS: '$(play)',
    TASK_DONE: '$(check)',
    
    // Task status icons (enhanced)
    TASK_TODO_SMALL: '$(circle-small)',
    TASK_IN_PROGRESS_CIRCLE: '$(play-circle)',
    TASK_DONE_ALL: '$(check-all)',
    
    // Priority indicators
    PRIORITY_HIGHEST: '$(flame)',
    PRIORITY_HIGH: '$(triangle-up)',
    PRIORITY_MEDIUM: '$(dash)',
    PRIORITY_LOW: '$(triangle-down)',
    PRIORITY_LOWEST: '$(circle-small)',
    
    // Progress indicators
    PROGRESS_FULL: '$(check-all)',
    PROGRESS_PARTIAL: '$(loading)',
    PROGRESS_EMPTY: '$(circle-outline)',
    PROGRESS_BAR_FULL: '$(chrome-maximize)',
    PROGRESS_BAR_PARTIAL: '$(chrome-restore)',
    
    // Status indicators
    STATUS_URGENT: '$(clock)',
    STATUS_OVERDUE: '$(warning)',
    STATUS_BLOCKED: '$(lock)',
    STATUS_DEPENDENCY: '$(link)',
    STATUS_SUCCESS: '$(pass)',
    STATUS_IN_PROGRESS: '$(sync)',
    
    // Tree structure icons
    FOLDER: '$(folder)',
    LIST: '$(list-unordered)',
    HIERARCHY: '$(list-tree)',
    
    // Action icons
    ADD: '$(plus)',
    EDIT: '$(edit)',
    DELETE: '$(trash)',
    REFRESH: '$(refresh)',
    EXPORT: '$(export)',
    IMPORT: '$(import)',
    SETTINGS: '$(gear)',
    
    // Other icons
    STATISTICS: '$(graph)',
    DEPENDENCY: '$(link)',
    SEARCH: '$(search)',
    FILTER: '$(filter)',
    SORT: '$(arrow-up)',
    WARNING: '$(warning)',
    ERROR: '$(error)',
    INFO: '$(info)',
    
    // Theme-aware indicators
    LIGHT_MODE: '$(light-bulb)',
    DARK_MODE: '$(circle-filled)',
    AUTO_MODE: '$(eye)'
} as const;

// Colors (VS Code theme colors)
export const COLORS = {
    SUCCESS: 'charts.green',
    WARNING: 'charts.yellow',
    ERROR: 'charts.red',
    INFO: 'charts.blue',
    PRIMARY: 'charts.purple'
} as const;

// File Extensions
export const FILE_EXTENSIONS = {
    JSON: 'json',
    CSV: 'csv',
    MARKDOWN: 'md',
    VSIX: 'vsix'
} as const;

// Export/Import Formats
export const EXPORT_FORMATS = {
    JSON: 'json',
    CSV: 'csv',
    MARKDOWN: 'markdown'
} as const;

// Error Messages
export const ERROR_MESSAGES = {
    GOAL_NOT_FOUND: 'Goal not found',
    TASK_NOT_FOUND: 'Task not found',
    INVALID_GOAL_DATA: 'Invalid goal data',
    INVALID_TASK_DATA: 'Invalid task data',
    CIRCULAR_DEPENDENCY: 'Circular dependency detected',
    STORAGE_ERROR: 'Storage operation failed',
    VALIDATION_ERROR: 'Validation failed',
    IMPORT_ERROR: 'Import operation failed',
    EXPORT_ERROR: 'Export operation failed',
    NETWORK_ERROR: 'Network operation failed',
    PERMISSION_ERROR: 'Permission denied',
    CONCURRENT_MODIFICATION: 'Data was modified by another process'
} as const;

// Success Messages
export const SUCCESS_MESSAGES = {
    GOAL_CREATED: 'Goal created successfully',
    GOAL_UPDATED: 'Goal updated successfully',
    GOAL_DELETED: 'Goal deleted successfully',
    TASK_CREATED: 'Task created successfully',
    TASK_UPDATED: 'Task updated successfully',
    TASK_DELETED: 'Task deleted successfully',
    DATA_EXPORTED: 'Data exported successfully',
    DATA_IMPORTED: 'Data imported successfully',
    SETTINGS_SAVED: 'Settings saved successfully',
    BACKUP_CREATED: 'Backup created successfully',
    BACKUP_RESTORED: 'Backup restored successfully'
} as const;

// Validation Patterns
export const VALIDATION_PATTERNS = {
    ID: /^[a-z0-9\-_]+$/i,
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    URL: /^https?:\/\/.+/,
    COLOR_HEX: /^#[0-9a-f]{6}$/i,
    SAFE_STRING: /^[a-zA-Z0-9\s.,!?;:()\-_'"]+$/
} as const;

// Time Constants
export const TIME = {
    SECOND: 1000,
    MINUTE: 60 * 1000,
    HOUR: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000,
    WEEK: 7 * 24 * 60 * 60 * 1000,
    MONTH: 30 * 24 * 60 * 60 * 1000,
    YEAR: 365 * 24 * 60 * 60 * 1000
} as const;

// Priority Levels
export const PRIORITY_LEVELS = {
    LOWEST: 1,
    LOW: 2,
    MEDIUM: 3,
    HIGH: 4,
    HIGHEST: 5
} as const;

// Keyboard Shortcuts
export const KEYBOARD_SHORTCUTS = {
    CREATE_GOAL: 'ctrl+shift+g',
    REFRESH_VIEW: 'f5',
    DELETE_ITEM: 'delete',
    EDIT_ITEM: 'f2',
    TOGGLE_COMPLETED: 'ctrl+shift+c',
    SEARCH: 'ctrl+f',
    EXPORT: 'ctrl+e',
    IMPORT: 'ctrl+i'
} as const;

// API Endpoints (for future integrations)
export const API_ENDPOINTS = {
    BASE_URL: 'https://api.goal-tree.dev',
    SYNC: '/sync',
    BACKUP: '/backup',
    EXPORT: '/export',
    IMPORT: '/import'
} as const;

// Feature Flags
export const FEATURES = {
    CLOUD_SYNC: false,
    COLLABORATION: false,
    AI_SUGGESTIONS: false,
    ADVANCED_ANALYTICS: false,
    CUSTOM_THEMES: false,
    PLUGIN_SYSTEM: false
} as const;

// Environment
export const ENVIRONMENT = {
    DEVELOPMENT: 'development',
    PRODUCTION: 'production',
    TEST: 'test'
} as const;