/**
 * Data migration system for schema changes and version compatibility
 * Handles backward compatibility and data transformation between versions
 */

import { Goal, Task } from '../models/goal';
import { ValidationResult, ValidationError } from './validators';
import { CURRENT_SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSIONS } from './schemas';
import { validateCompleteDataSet } from './validators';

/**
 * Migration result interface
 */
export interface MigrationResult<T = unknown> {
  success: boolean;
  data?: T;
  errors: string[];
  warnings: string[];
  fromVersion: string;
  toVersion: string;
  migrationsApplied: string[];
  backupCreated?: boolean;
}

/**
 * Migration step interface
 */
export interface MigrationStep {
  id: string;
  fromVersion: string;
  toVersion: string;
  description: string;
  migrate: (data: unknown) => MigrationStepResult;
  rollback?: (data: unknown) => MigrationStepResult;
}

/**
 * Migration step result
 */
export interface MigrationStepResult {
  success: boolean;
  data?: unknown;
  errors: string[];
  warnings: string[];
  changes: string[];
}

/**
 * Migration context for tracking state
 */
export interface MigrationContext {
  originalData: unknown;
  currentData: unknown;
  sourceVersion: string;
  targetVersion: string;
  appliedSteps: string[];
  createBackup: boolean;
  validateAfterEachStep: boolean;
}

/**
 * Legacy data format interfaces for backward compatibility
 */

// Version 0.9.x format (before proper versioning)
interface LegacyGoalV09 {
  id: string;
  title: string;
  description?: string;
  status: 'active' | 'completed' | 'paused'; // Old status values
  parent?: string; // Was 'parent' instead of 'parentId'
  dependencies?: string[]; // Was 'dependencies' instead of 'blockedByIds'
  tasks: LegacyTaskV09[];
  created: string; // Was 'created' instead of 'createdAt'
  completed?: string; // Was 'completed' instead of 'completedAt'
}

interface LegacyTaskV09 {
  id: string;
  text: string; // Was 'text' instead of 'title'
  done: boolean; // Was boolean instead of status enum
  order: number;
  created: string; // Was 'created' instead of 'createdAt'
}

// Version 1.0-beta format (had some field differences)
interface GoalV10Beta extends Omit<Goal, 'metadata'> {
  meta?: { // Was 'meta' instead of 'metadata'
    color?: string;
    priority?: number;
    tags?: string[];
  };
}

/**
 * Registry of all available migration steps
 */
const migrationSteps: MigrationStep[] = [
  // Migration from 0.9.x to 1.0
  {
    id: 'migrate-0.9-to-1.0',
    fromVersion: '0.9',
    toVersion: '1.0.0',
    description: 'Migrate from legacy format to version 1.0',
    migrate: (data: unknown): MigrationStepResult => {
      const errors: string[] = [];
      const warnings: string[] = [];
      const changes: string[] = [];

      try {
        if (!Array.isArray(data)) {
          return {
            success: false,
            errors: ['Data must be an array of goals'],
            warnings,
            changes
          };
        }

        const migratedGoals: Goal[] = (data as LegacyGoalV09[]).map(legacyGoal => {
          const migratedGoal: Goal = {
            id: legacyGoal.id,
            title: legacyGoal.title,
            description: legacyGoal.description,
            status: migrateLegacyStatus(legacyGoal.status),
            parentId: legacyGoal.parent,
            blockedByIds: legacyGoal.dependencies || [],
            tasks: legacyGoal.tasks.map(legacyTask => ({
              id: legacyTask.id,
              title: legacyTask.text,
              status: legacyTask.done ? 'done' as const : 'todo' as const,
              order: legacyTask.order,
              createdAt: new Date(legacyTask.created),
              completedAt: legacyTask.done ? new Date(legacyTask.created) : undefined,
              description: undefined
            })),
            createdAt: new Date(legacyGoal.created),
            completedAt: legacyGoal.completed ? new Date(legacyGoal.completed) : undefined,
            metadata: undefined
          };

          changes.push(`Migrated goal: ${legacyGoal.title}`);
          return migratedGoal;
        });

        changes.push('Renamed field: parent -> parentId');
        changes.push('Renamed field: dependencies -> blockedByIds');
        changes.push('Renamed field: created -> createdAt');
        changes.push('Renamed field: completed -> completedAt');
        changes.push('Migrated task field: text -> title');
        changes.push('Migrated task field: done (boolean) -> status (enum)');
        
        return {
          success: true,
          data: migratedGoals,
          errors,
          warnings,
          changes
        };
      } catch (error) {
        return {
          success: false,
          errors: [`Migration failed: ${error}`],
          warnings,
          changes
        };
      }
    }
  },

  // Migration from 1.0-beta to 1.0.0
  {
    id: 'migrate-1.0-beta-to-1.0.0',
    fromVersion: '1.0-beta',
    toVersion: '1.0.0',
    description: 'Migrate from 1.0-beta format to stable 1.0.0',
    migrate: (data: unknown): MigrationStepResult => {
      const errors: string[] = [];
      const warnings: string[] = [];
      const changes: string[] = [];

      try {
        if (!Array.isArray(data)) {
          return {
            success: false,
            errors: ['Data must be an array of goals'],
            warnings,
            changes
          };
        }

        const migratedGoals: Goal[] = (data as GoalV10Beta[]).map(betaGoal => {
          const migratedGoal: Goal = {
            ...betaGoal,
            metadata: betaGoal.meta ? {
              color: betaGoal.meta.color,
              priority: betaGoal.meta.priority,
              tags: betaGoal.meta.tags,
              estimatedHours: undefined,
              actualHours: undefined,
              dueDate: undefined
            } : undefined
          };

          // Remove the old 'meta' property
          delete (migratedGoal as any).meta;

          changes.push(`Migrated goal metadata: ${betaGoal.title}`);
          return migratedGoal;
        });

        changes.push('Renamed field: meta -> metadata');
        changes.push('Added new metadata fields: estimatedHours, actualHours, dueDate');

        return {
          success: true,
          data: migratedGoals,
          errors,
          warnings,
          changes
        };
      } catch (error) {
        return {
          success: false,
          errors: [`Migration failed: ${error}`],
          warnings,
          changes
        };
      }
    }
  }
];

/**
 * Helper function to migrate legacy status values
 */
function migrateLegacyStatus(legacyStatus: string): Goal['status'] {
  switch (legacyStatus) {
    case 'active': return 'in-progress';
    case 'paused': return 'blocked';
    case 'completed': return 'completed';
    default: return 'planned';
  }
}

/**
 * Detects the version of data format
 */
export function detectDataVersion(data: unknown): string {
  if (typeof data !== 'object' || data === null) {
    return 'unknown';
  }

  // Check for explicit version field
  const versionedData = data as { version?: string };
  if (versionedData.version) {
    return versionedData.version;
  }

  // Check if it's an array (goal data)
  if (Array.isArray(data) && data.length > 0) {
    const firstItem = data[0];
    if (typeof firstItem === 'object' && firstItem !== null) {
      // Check for legacy 0.9.x format
      if ('parent' in firstItem || 'dependencies' in firstItem || 'created' in firstItem) {
        return '0.9';
      }
      
      // Check for 1.0-beta format
      if ('meta' in firstItem) {
        return '1.0-beta';
      }
      
      // Check for current format
      if ('metadata' in firstItem || 'createdAt' in firstItem) {
        return '1.0.0';
      }
    }
  }

  // Check for storage data format
  const storageData = data as { goals?: unknown[], exportedAt?: string };
  if (storageData.goals && Array.isArray(storageData.goals)) {
    if (storageData.exportedAt) {
      return '1.0.0'; // Export format
    }
    return detectDataVersion(storageData.goals);
  }

  return 'unknown';
}

/**
 * Checks if a version is supported for migration
 */
export function isVersionSupported(version: string): boolean {
  return SUPPORTED_SCHEMA_VERSIONS.includes(version as any) || 
         version === '0.9' || 
         version === '1.0-beta';
}

/**
 * Gets the migration path between two versions
 */
export function getMigrationPath(fromVersion: string, toVersion: string): MigrationStep[] {
  if (fromVersion === toVersion) {
    return [];
  }

  // Simple linear migration path for now
  // In the future, this could be enhanced with a graph-based approach
  const path: MigrationStep[] = [];
  
  if (fromVersion === '0.9' && toVersion === CURRENT_SCHEMA_VERSION) {
    const step09to10 = migrationSteps.find(s => s.fromVersion === '0.9');
    if (step09to10) path.push(step09to10);
  }
  
  if (fromVersion === '1.0-beta' && toVersion === CURRENT_SCHEMA_VERSION) {
    const stepBetaTo10 = migrationSteps.find(s => s.fromVersion === '1.0-beta');
    if (stepBetaTo10) path.push(stepBetaTo10);
  }

  return path;
}

/**
 * Performs data migration from one version to another
 */
export function migrateData(
  data: unknown,
  targetVersion: string = CURRENT_SCHEMA_VERSION,
  options: {
    createBackup?: boolean;
    validateAfterEachStep?: boolean;
    allowPartialMigration?: boolean;
  } = {}
): MigrationResult {
  const {
    createBackup = true,
    validateAfterEachStep = true,
    allowPartialMigration = false
  } = options;

  const sourceVersion = detectDataVersion(data);
  
  if (sourceVersion === 'unknown') {
    return {
      success: false,
      errors: ['Unable to detect data version'],
      warnings: [],
      fromVersion: sourceVersion,
      toVersion: targetVersion,
      migrationsApplied: []
    };
  }

  if (sourceVersion === targetVersion) {
    return {
      success: true,
      data,
      errors: [],
      warnings: ['Data is already at target version'],
      fromVersion: sourceVersion,
      toVersion: targetVersion,
      migrationsApplied: []
    };
  }

  if (!isVersionSupported(sourceVersion)) {
    return {
      success: false,
      errors: [`Unsupported source version: ${sourceVersion}`],
      warnings: [],
      fromVersion: sourceVersion,
      toVersion: targetVersion,
      migrationsApplied: []
    };
  }

  const migrationPath = getMigrationPath(sourceVersion, targetVersion);
  
  if (migrationPath.length === 0) {
    return {
      success: false,
      errors: [`No migration path found from ${sourceVersion} to ${targetVersion}`],
      warnings: [],
      fromVersion: sourceVersion,
      toVersion: targetVersion,
      migrationsApplied: []
    };
  }

  const context: MigrationContext = {
    originalData: data,
    currentData: data,
    sourceVersion,
    targetVersion,
    appliedSteps: [],
    createBackup,
    validateAfterEachStep
  };

  const errors: string[] = [];
  const warnings: string[] = [];
  const migrationsApplied: string[] = [];

  // Apply each migration step
  for (const step of migrationPath) {
    try {
      const stepResult = step.migrate(context.currentData);
      
      if (!stepResult.success) {
        const errorMsg = `Migration step ${step.id} failed: ${stepResult.errors.join(', ')}`;
        errors.push(errorMsg);
        
        if (!allowPartialMigration) {
          return {
            success: false,
            errors: [...errors, ...stepResult.errors],
            warnings: [...warnings, ...stepResult.warnings],
            fromVersion: sourceVersion,
            toVersion: targetVersion,
            migrationsApplied
          };
        }
      } else {
        context.currentData = stepResult.data;
        context.appliedSteps.push(step.id);
        migrationsApplied.push(step.id);
        warnings.push(...stepResult.warnings);
        
        // Validate after each step if requested
        if (validateAfterEachStep && stepResult.data) {
          const validationResult = validateCompleteDataSet(stepResult.data);
          if (!validationResult.isValid) {
            warnings.push(`Validation warnings after ${step.id}: ${validationResult.errors.length} issues found`);
          }
        }
      }
    } catch (error) {
      const errorMsg = `Migration step ${step.id} threw an exception: ${error}`;
      errors.push(errorMsg);
      
      if (!allowPartialMigration) {
        return {
          success: false,
          errors,
          warnings,
          fromVersion: sourceVersion,
          toVersion: targetVersion,
          migrationsApplied
        };
      }
    }
  }

  // Final validation
  let finalData = context.currentData;
  if (finalData) {
    const finalValidation = validateCompleteDataSet(finalData);
    if (!finalValidation.isValid) {
      errors.push(`Final validation failed: ${finalValidation.errors.length} errors found`);
      finalValidation.errors.forEach(error => {
        errors.push(`${error.field}: ${error.message}`);
      });
    } else {
      finalData = finalValidation.data;
    }
  }

  return {
    success: errors.length === 0,
    data: finalData,
    errors,
    warnings,
    fromVersion: sourceVersion,
    toVersion: targetVersion,
    migrationsApplied,
    backupCreated: createBackup
  };
}

/**
 * Creates a backup of data before migration
 */
export function createMigrationBackup(data: unknown, reason = 'migration'): {
  version: string;
  backupCreatedAt: string;
  reason: string;
  data: unknown;
} {
  return {
    version: CURRENT_SCHEMA_VERSION,
    backupCreatedAt: new Date().toISOString(),
    reason,
    data
  };
}

/**
 * Validates that migrated data is compatible with current system
 */
export function validateMigratedData(data: unknown): ValidationResult<Goal[]> {
  return validateCompleteDataSet(data, {
    strict: false, // Be lenient with migrated data
    checkHierarchy: true,
    checkConsistency: true
  });
}

/**
 * Gets migration information for a specific version
 */
export function getMigrationInfo(version: string): {
  isSupported: boolean;
  isCurrent: boolean;
  availableMigrations: string[];
  description: string;
} {
  const isSupported = isVersionSupported(version);
  const isCurrent = version === CURRENT_SCHEMA_VERSION;
  const availableMigrations = migrationSteps
    .filter(step => step.fromVersion === version)
    .map(step => step.id);

  let description = '';
  if (version === '0.9') {
    description = 'Legacy format with different field names and structure';
  } else if (version === '1.0-beta') {
    description = 'Beta format with minor differences in metadata structure';
  } else if (version === '1.0.0') {
    description = 'Current stable format';
  } else {
    description = 'Unknown or unsupported version';
  }

  return {
    isSupported,
    isCurrent,
    availableMigrations,
    description
  };
}

/**
 * Registers a custom migration step
 */
export function registerMigrationStep(step: MigrationStep): boolean {
  // Check for conflicts
  const existingStep = migrationSteps.find(s => 
    s.id === step.id || 
    (s.fromVersion === step.fromVersion && s.toVersion === step.toVersion)
  );

  if (existingStep) {
    console.warn(`Migration step conflict: ${step.id} already exists or conflicts with existing migration`);
    return false;
  }

  migrationSteps.push(step);
  return true;
}

/**
 * Gets all available migration steps
 */
export function getAvailableMigrationSteps(): MigrationStep[] {
  return [...migrationSteps]; // Return a copy to prevent external modification
}