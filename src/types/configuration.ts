/**
 * Configuration and settings types
 */

/**
 * Extension configuration interface
 */
export interface ExtensionConfiguration {
  autoRefresh: boolean;
  showCompleted: boolean;
  defaultGoalType: 'task' | 'milestone' | 'objective';
  treeView: TreeViewConfiguration;
  storage: StorageConfiguration;
  ui: UIConfiguration;
}

/**
 * Tree view specific configuration
 */
export interface TreeViewConfiguration {
  showIcons: boolean;
  showDescription: boolean;
  showProgress: boolean;
  compactMode: boolean;
  expandDepth: number;
  sortBy: 'name' | 'date' | 'priority' | 'status';
  sortOrder: 'asc' | 'desc';
}

/**
 * Storage configuration
 */
export interface StorageConfiguration {
  autoBackup: boolean;
  backupInterval: number; // in minutes
  maxBackups: number;
  location: 'workspace' | 'global';
}

/**
 * UI configuration
 */
export interface UIConfiguration {
  theme: 'auto' | 'light' | 'dark';
  showNotifications: boolean;
  confirmDelete: boolean;
  showWelcome: boolean;
}

/**
 * Configuration change event
 */
export interface ConfigurationChangeEvent {
  section: keyof ExtensionConfiguration;
  oldValue: any;
  newValue: any;
  timestamp: Date;
}

/**
 * Configuration provider interface
 */
export interface ConfigurationProvider {
  get<T>(key: string, defaultValue?: T): T;
  update(key: string, value: any, global?: boolean): Promise<void>;
  has(key: string): boolean;
  inspect<T>(key: string): ConfigurationInspection<T> | undefined;
}

/**
 * Configuration inspection result
 */
export interface ConfigurationInspection<T> {
  key: string;
  defaultValue?: T;
  globalValue?: T;
  workspaceValue?: T;
  workspaceFolderValue?: T;
}