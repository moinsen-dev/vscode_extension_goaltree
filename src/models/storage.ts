/**
 * Storage and persistence related models
 */

import { Goal } from './goal';
import { GoalStatistics } from './progress';

/**
 * Main storage data structure
 */
export interface StorageData {
  /** Schema version for migration compatibility */
  version: string;
  
  /** When this data was last saved */
  lastSaved: Date;
  
  /** All goals in the workspace */
  goals: Goal[];
  
  /** Storage metadata */
  metadata: StorageMetadata;
}

/**
 * Storage metadata
 */
export interface StorageMetadata {
  /** Number of saves performed */
  saveCount: number;
  
  /** Extension version when last saved */
  extensionVersion: string;
  
  /** Workspace identifier */
  workspaceId?: string;
  
  /** Data integrity checksum */
  checksum?: string;
  
  /** Compression used */
  compression?: 'none' | 'gzip';
  
  /** Custom user settings */
  userSettings?: Record<string, any>;
}

/**
 * Backup data structure
 */
export interface BackupData {
  /** Original storage data */
  data: StorageData;
  
  /** When the backup was created */
  createdAt: Date;
  
  /** Reason for the backup */
  reason: 'manual' | 'auto' | 'before_import' | 'before_update';
  
  /** Optional backup description */
  description?: string;
  
  /** Size of the backup in bytes */
  sizeBytes: number;
}

/**
 * Import/Export format
 */
export interface ExportData {
  /** Format version */
  version: string;
  
  /** When the export was created */
  exportedAt: Date;
  
  /** Source extension version */
  sourceVersion: string;
  
  /** Exported goals */
  goals: Goal[];
  
  /** Export options used */
  options: ExportOptions;
  
  /** Statistics at time of export */
  statistics?: GoalStatistics;
}

/**
 * Export configuration options
 */
export interface ExportOptions {
  /** Whether to include completed goals */
  includeCompleted: boolean;
  
  /** Whether to include metadata */
  includeMetadata: boolean;
  
  /** Whether to include statistics */
  includeStatistics: boolean;
  
  /** Date range filter */
  dateRange?: {
    start: Date;
    end: Date;
  };
  
  /** Goal IDs to export (empty means all) */
  goalIds: string[];
  
  /** Export format */
  format: 'json' | 'csv' | 'markdown';
  
  /** Pretty print JSON */
  prettyPrint: boolean;
}

/**
 * Import result
 */
export interface ImportResult {
  /** Number of goals successfully imported */
  imported: number;
  
  /** Number of goals skipped due to conflicts */
  skipped: number;
  
  /** Number of goals that failed to import */
  failed: number;
  
  /** Total goals in the import file */
  total: number;
  
  /** Detailed error messages */
  errors: string[];
  
  /** Warnings during import */
  warnings: string[];
  
  /** IDs of successfully imported goals */
  importedGoalIds: string[];
}

/**
 * Storage operation result
 */
export interface StorageOperationResult {
  /** Whether the operation succeeded */
  success: boolean;
  
  /** Error message if failed */
  error?: string;
  
  /** Operation type */
  operation: 'save' | 'load' | 'backup' | 'restore' | 'export' | 'import';
  
  /** Size of data processed in bytes */
  dataSize: number;
  
  /** Time taken for the operation in milliseconds */
  duration: number;
}

/**
 * Storage configuration
 */
export interface StorageConfig {
  /** Auto-save interval in milliseconds */
  autoSaveInterval: number;
  
  /** Maximum number of backups to keep */
  maxBackups: number;
  
  /** Enable compression for large datasets */
  enableCompression: boolean;
  
  /** Compression threshold in bytes */
  compressionThreshold: number;
  
  /** Validate data integrity on load */
  validateIntegrity: boolean;
  
  /** Create backup before each save */
  autoBackup: boolean;
}

/**
 * Migration information
 */
export interface MigrationInfo {
  /** Current data version */
  currentVersion: string;
  
  /** Target version to migrate to */
  targetVersion: string;
  
  /** Whether migration is required */
  migrationRequired: boolean;
  
  /** Migration steps to be performed */
  migrationSteps: MigrationStep[];
  
  /** Whether backup is recommended before migration */
  backupRecommended: boolean;
}

/**
 * Individual migration step
 */
export interface MigrationStep {
  /** Step identifier */
  id: string;
  
  /** Description of what this step does */
  description: string;
  
  /** From version */
  fromVersion: string;
  
  /** To version */
  toVersion: string;
  
  /** Whether this step can be safely rolled back */
  reversible: boolean;
}

/**
 * Storage health check result
 */
export interface StorageHealthCheck {
  /** Overall health status */
  healthy: boolean;
  
  /** Issues found */
  issues: StorageIssue[];
  
  /** Recommendations for improvement */
  recommendations: string[];
  
  /** Storage statistics */
  statistics: {
    totalSize: number;
    goalCount: number;
    taskCount: number;
    lastBackup?: Date;
    corruptedEntries: number;
  };
}

/**
 * Storage issue details
 */
export interface StorageIssue {
  /** Issue severity */
  severity: 'low' | 'medium' | 'high' | 'critical';
  
  /** Issue category */
  category: 'corruption' | 'performance' | 'integrity' | 'compatibility';
  
  /** Issue description */
  description: string;
  
  /** Suggested fix */
  suggestedFix?: string;
  
  /** Affected goal IDs */
  affectedGoals: string[];
}