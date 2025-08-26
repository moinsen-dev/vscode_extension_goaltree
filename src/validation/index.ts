/**
 * Validation System Entry Point
 * Exports all validation functionality for the Goal Tree extension
 */

// JSON Schema definitions
export {
  goalSchema,
  taskSchema,
  goalsArraySchema,
  storageDataSchema,
  backupDataSchema,
  importExportSchema,
  schemaRegistry,
  strictValidationOptions,
  permissiveValidationOptions,
  CURRENT_SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS
} from './schemas';

export type {
  SchemaValidationOptions,
  SchemaId
} from './schemas';

// Type guards
export {
  isString,
  isNonEmptyString,
  isValidDate,
  isValidDateString,
  isTaskStatus,
  isGoalStatus,
  isTask,
  isGoalMetadata,
  isGoal,
  isGoalArray,
  isTreeNodeType,
  isCategoryNode,
  isTreeNode,
  isStorageData,
  isBackupData,
  isImportExportData,
  validateGoalWithErrors,
  validateTaskWithErrors
} from './type-guards';

export type {
  TypeGuardResult
} from './type-guards';

// Validation utilities
export {
  validateGoal,
  validateTask,
  validateGoals,
  validateStorageData,
  validateBackupData,
  validateImportExportData,
  sanitizeGoal,
  batchValidate,
  validateGoalHierarchy,
  validateDataConsistency,
  validateCompleteDataSet
} from './validators';

export type {
  ValidationError,
  ValidationResult,
  ValidationStats
} from './validators';

// Migration system
export {
  detectDataVersion,
  isVersionSupported,
  getMigrationPath,
  migrateData,
  createMigrationBackup,
  validateMigratedData,
  getMigrationInfo,
  registerMigrationStep,
  getAvailableMigrationSteps
} from './migration';

export type {
  MigrationResult,
  MigrationStep,
  MigrationStepResult,
  MigrationContext
} from './migration';

// Import needed functions for ValidationService
import { 
  detectDataVersion, 
  isVersionSupported, 
  getMigrationInfo, 
  migrateData 
} from './migration';
import { 
  validateCompleteDataSet, 
  validateGoals, 
  sanitizeGoal 
} from './validators';
import { 
  isGoal, 
  isTask, 
  isGoalArray 
} from './type-guards';
import { CURRENT_SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSIONS } from './schemas';
import { Goal, Task } from '../models/goal';

/**
 * Main validation facade for easy integration
 */
export class ValidationService {
  /**
   * Validates a complete dataset with all validation rules
   */
  static validateDataSet(
    data: unknown,
    options: {
      strict?: boolean;
      checkHierarchy?: boolean;
      checkConsistency?: boolean;
      migrateIfNeeded?: boolean;
    } = {}
  ) {
    const { migrateIfNeeded = true, ...validateOptions } = options;
    
    // Try migration first if needed
    if (migrateIfNeeded) {
      const version = detectDataVersion(data);
      if (version !== CURRENT_SCHEMA_VERSION && isVersionSupported(version)) {
        const migrationResult = migrateData(data);
        if (migrationResult.success && migrationResult.data) {
          data = migrationResult.data;
        }
      }
    }
    
    return validateCompleteDataSet(data, validateOptions);
  }

  /**
   * Safely imports external data with validation and migration
   */
  static importData(jsonString: string) {
    try {
      const data = JSON.parse(jsonString);
      return this.validateDataSet(data, {
        strict: false,
        migrateIfNeeded: true,
        checkHierarchy: true,
        checkConsistency: true
      });
    } catch (error) {
      return {
        isValid: false,
        errors: [{ field: 'json', message: `Invalid JSON: ${error}` }],
        data: undefined
      };
    }
  }

  /**
   * Prepares data for safe storage
   */
  static prepareForStorage(goals: unknown) {
    const validationResult = validateGoals(goals, false); // Permissive validation
    
    if (validationResult.isValid && validationResult.data) {
      // Additional sanitization
      return {
        isValid: true,
        data: {
          version: CURRENT_SCHEMA_VERSION,
          updatedAt: new Date().toISOString(),
          goals: validationResult.data
        },
        errors: []
      };
    }
    
    return validationResult;
  }

  /**
   * Gets comprehensive validation report
   */
  static getValidationReport(data: unknown) {
    const version = detectDataVersion(data);
    const versionInfo = getMigrationInfo(version);
    const validationResult = this.validateDataSet(data, {
      strict: true,
      checkHierarchy: true,
      checkConsistency: true,
      migrateIfNeeded: false
    });

    return {
      version,
      versionInfo,
      validation: validationResult,
      needsMigration: version !== CURRENT_SCHEMA_VERSION && versionInfo.isSupported,
      canMigrate: versionInfo.isSupported && versionInfo.availableMigrations.length > 0
    };
  }
}

/**
 * Validation utilities for common operations
 */
export const ValidationUtils = {
  /**
   * Quick validation for single goal
   */
  isValidGoal: (goal: unknown): goal is Goal => isGoal(goal),
  
  /**
   * Quick validation for single task
   */
  isValidTask: (task: unknown): task is Task => isTask(task),
  
  /**
   * Quick validation for goal array
   */
  isValidGoalArray: (goals: unknown): goals is Goal[] => isGoalArray(goals),
  
  /**
   * Clean and validate goal data
   */
  sanitizeAndValidate: (goal: unknown) => sanitizeGoal(goal),
  
  /**
   * Check if data needs migration
   */
  needsMigration: (data: unknown): boolean => {
    const version = detectDataVersion(data);
    return version !== CURRENT_SCHEMA_VERSION && isVersionSupported(version);
  },
  
  /**
   * Get data format information
   */
  getDataInfo: (data: unknown) => {
    const version = detectDataVersion(data);
    return {
      version,
      isSupported: isVersionSupported(version),
      isCurrent: version === CURRENT_SCHEMA_VERSION,
      needsMigration: version !== CURRENT_SCHEMA_VERSION
    };
  }
};

/**
 * Type exports for external use
 */
export type {
  Goal,
  Task,
  GoalStatus,
  TaskStatus
} from '../models/goal';

/**
 * Constants for external use
 */
export const ValidationConstants = {
  CURRENT_VERSION: CURRENT_SCHEMA_VERSION,
  SUPPORTED_VERSIONS: SUPPORTED_SCHEMA_VERSIONS,
  MAX_TITLE_LENGTH: 200,
  MAX_DESCRIPTION_LENGTH: 2000,
  MAX_TASK_DESCRIPTION_LENGTH: 1000,
  MIN_PRIORITY: 1,
  MAX_PRIORITY: 5
} as const;

/**
 * Default export - ValidationService for convenient access
 */
export default ValidationService;