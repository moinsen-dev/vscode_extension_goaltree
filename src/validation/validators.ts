/**
 * Runtime validation utilities using JSON Schema and AJV
 * Provides comprehensive validation for data integrity
 */

import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { Goal, Task } from '../models/goal';
import { 
  goalSchema, 
  taskSchema, 
  goalsArraySchema, 
  storageDataSchema,
  backupDataSchema,
  importExportSchema,
  schemaRegistry,
  SchemaValidationOptions,
  strictValidationOptions,
  permissiveValidationOptions,
  CURRENT_SCHEMA_VERSION
} from './schemas';
import { 
  isGoal, 
  isTask, 
  isGoalArray, 
  validateGoalWithErrors, 
  validateTaskWithErrors,
  TypeGuardResult
} from './type-guards';

/**
 * Validation error interface
 */
export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
  code?: string;
}

/**
 * Validation result interface
 */
export interface ValidationResult<T = unknown> {
  isValid: boolean;
  data?: T;
  errors: ValidationError[];
  warnings?: ValidationError[];
  schemaVersion?: string;
}

/**
 * Validation statistics
 */
export interface ValidationStats {
  totalItems: number;
  validItems: number;
  invalidItems: number;
  errors: number;
  warnings: number;
  processingTimeMs: number;
}

/**
 * AJV validator instance
 */
class SchemaValidator {
  private ajv: Ajv;
  private compiledSchemas: Map<string, ValidateFunction>;

  constructor(options: SchemaValidationOptions = strictValidationOptions) {
    this.ajv = new Ajv({
      allErrors: options.allErrors ?? true,
      verbose: options.verbose ?? true,
      strict: false,
      removeAdditional: options.removeAdditional ?? 'all',
      useDefaults: options.useDefaults ?? false,
      coerceTypes: options.coerceTypes ?? false,
      allowUnionTypes: true
    });

    addFormats(this.ajv);
    this.compiledSchemas = new Map();
    this.compileAllSchemas();
  }

  private compileAllSchemas(): void {
    Object.entries(schemaRegistry).forEach(([key, schema]) => {
      try {
        const validate = this.ajv.compile(schema);
        this.compiledSchemas.set(key, validate);
      } catch (error) {
        console.error(`Failed to compile schema ${key}:`, error);
      }
    });
  }

  public validateWithSchema<T>(
    data: unknown, 
    schemaKey: keyof typeof schemaRegistry
  ): ValidationResult<T> {
    const startTime = performance.now();
    const validate = this.compiledSchemas.get(schemaKey);
    
    if (!validate) {
      return {
        isValid: false,
        errors: [{ field: 'schema', message: `Schema '${schemaKey}' not found` }]
      };
    }

    const isValid = validate(data);
    const errors: ValidationError[] = [];

    if (!isValid && validate.errors) {
      validate.errors.forEach(error => {
        errors.push({
          field: error.instancePath || error.schemaPath || 'root',
          message: error.message || 'Validation failed',
          value: error.data,
          code: error.keyword
        });
      });
    }

    return {
      isValid,
      data: isValid ? data as T : undefined,
      errors,
      schemaVersion: CURRENT_SCHEMA_VERSION
    };
  }

  public getValidationStats(results: ValidationResult[]): ValidationStats {
    const totalItems = results.length;
    const validItems = results.filter(r => r.isValid).length;
    const invalidItems = totalItems - validItems;
    const errors = results.reduce((sum, r) => sum + r.errors.length, 0);
    const warnings = results.reduce((sum, r) => sum + (r.warnings?.length ?? 0), 0);

    return {
      totalItems,
      validItems,
      invalidItems,
      errors,
      warnings,
      processingTimeMs: 0 // Will be set by caller
    };
  }
}

// Global validator instances
const strictValidator = new SchemaValidator(strictValidationOptions);
const permissiveValidator = new SchemaValidator(permissiveValidationOptions);

/**
 * Validates a single Goal object
 */
export function validateGoal(goal: unknown, strict = true): ValidationResult<Goal> {
  const validator = strict ? strictValidator : permissiveValidator;
  
  // First try JSON schema validation
  const schemaResult = validator.validateWithSchema<Goal>(goal, 'goal');
  
  if (!schemaResult.isValid) {
    return schemaResult;
  }

  // Additional TypeScript type guard validation for better error messages
  const typeGuardResult = validateGoalWithErrors(goal);
  
  return {
    isValid: typeGuardResult.isValid && schemaResult.isValid,
    data: typeGuardResult.data,
    errors: [
      ...schemaResult.errors,
      ...typeGuardResult.errors.map(msg => ({ field: 'type', message: msg }))
    ],
    schemaVersion: CURRENT_SCHEMA_VERSION
  };
}

/**
 * Validates a single Task object
 */
export function validateTask(task: unknown, strict = true): ValidationResult<Task> {
  const validator = strict ? strictValidator : permissiveValidator;
  
  // First try JSON schema validation
  const schemaResult = validator.validateWithSchema<Task>(task, 'task');
  
  if (!schemaResult.isValid) {
    return schemaResult;
  }

  // Additional TypeScript type guard validation
  const typeGuardResult = validateTaskWithErrors(task);
  
  return {
    isValid: typeGuardResult.isValid && schemaResult.isValid,
    data: typeGuardResult.data,
    errors: [
      ...schemaResult.errors,
      ...typeGuardResult.errors.map(msg => ({ field: 'type', message: msg }))
    ],
    schemaVersion: CURRENT_SCHEMA_VERSION
  };
}

/**
 * Validates an array of Goals
 */
export function validateGoals(goals: unknown, strict = true): ValidationResult<Goal[]> {
  const startTime = performance.now();
  const validator = strict ? strictValidator : permissiveValidator;
  
  if (!Array.isArray(goals)) {
    return {
      isValid: false,
      errors: [{ field: 'root', message: 'Goals must be an array' }]
    };
  }

  const results: ValidationResult<Goal>[] = [];
  const validGoals: Goal[] = [];
  const allErrors: ValidationError[] = [];

  goals.forEach((goal, index) => {
    const result = validateGoal(goal, strict);
    results.push(result);
    
    if (result.isValid && result.data) {
      validGoals.push(result.data);
    } else {
      result.errors.forEach(error => {
        allErrors.push({
          ...error,
          field: `goals[${index}].${error.field}`
        });
      });
    }
  });

  const processingTime = performance.now() - startTime;
  const isValid = allErrors.length === 0;

  return {
    isValid,
    data: isValid ? validGoals : undefined,
    errors: allErrors,
    schemaVersion: CURRENT_SCHEMA_VERSION
  };
}

/**
 * Validates storage data format
 */
export function validateStorageData(data: unknown, strict = true): ValidationResult<{ version: string; goals: Goal[] }> {
  const validator = strict ? strictValidator : permissiveValidator;
  return validator.validateWithSchema(data, 'storageData');
}

/**
 * Validates backup data format
 */
export function validateBackupData(data: unknown, strict = true): ValidationResult<any> {
  const validator = strict ? strictValidator : permissiveValidator;
  return validator.validateWithSchema(data, 'backupData');
}

/**
 * Validates import/export data format
 */
export function validateImportExportData(data: unknown, strict = false): ValidationResult<any> {
  // Import data should be more permissive by default
  const validator = strict ? strictValidator : permissiveValidator;
  return validator.validateWithSchema(data, 'importExport');
}

/**
 * Validates and sanitizes Goal data for safe storage
 */
export function sanitizeGoal(goal: unknown): ValidationResult<Goal> {
  // Use permissive validation to allow data cleaning
  const result = validateGoal(goal, false);
  
  if (!result.isValid || !result.data) {
    return result;
  }

  const sanitized: Goal = {
    ...result.data,
    title: result.data.title.trim().substring(0, 200),
    description: result.data.description?.trim().substring(0, 2000) || undefined,
    tasks: result.data.tasks.map(task => ({
      ...task,
      title: task.title.trim().substring(0, 200),
      description: task.description?.trim().substring(0, 1000) || undefined
    }))
  };

  return {
    isValid: true,
    data: sanitized,
    errors: [],
    warnings: result.errors.map(error => ({ ...error })),
    schemaVersion: CURRENT_SCHEMA_VERSION
  };
}

/**
 * Batch validates multiple items with performance tracking
 */
export function batchValidate<T>(
  items: unknown[],
  validator: (item: unknown) => ValidationResult<T>
): ValidationResult<T[]> & { stats: ValidationStats } {
  const startTime = performance.now();
  
  const results = items.map(validator);
  const validItems: T[] = [];
  const allErrors: ValidationError[] = [];
  const allWarnings: ValidationError[] = [];

  results.forEach((result, index) => {
    if (result.isValid && result.data) {
      validItems.push(result.data);
    }
    
    result.errors.forEach(error => {
      allErrors.push({
        ...error,
        field: `item[${index}].${error.field}`
      });
    });

    result.warnings?.forEach(warning => {
      allWarnings.push({
        ...warning,
        field: `item[${index}].${warning.field}`
      });
    });
  });

  const processingTime = performance.now() - startTime;
  const isValid = allErrors.length === 0;

  const stats: ValidationStats = {
    totalItems: items.length,
    validItems: validItems.length,
    invalidItems: items.length - validItems.length,
    errors: allErrors.length,
    warnings: allWarnings.length,
    processingTimeMs: processingTime
  };

  return {
    isValid,
    data: isValid ? validItems : undefined,
    errors: allErrors,
    warnings: allWarnings,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    stats
  };
}

/**
 * Validates goal hierarchy integrity
 */
export function validateGoalHierarchy(goals: Goal[]): ValidationResult<Goal[]> {
  const errors: ValidationError[] = [];
  const goalIds = new Set(goals.map(g => g.id));
  
  // Check for duplicate IDs
  const seenIds = new Set<string>();
  goals.forEach((goal, index) => {
    if (seenIds.has(goal.id)) {
      errors.push({
        field: `goals[${index}].id`,
        message: `Duplicate goal ID: ${goal.id}`
      });
    }
    seenIds.add(goal.id);
  });

  // Check parent references
  goals.forEach((goal, index) => {
    if (goal.parentId && !goalIds.has(goal.parentId)) {
      errors.push({
        field: `goals[${index}].parentId`,
        message: `Parent goal not found: ${goal.parentId}`
      });
    }
  });

  // Check blocked by references
  goals.forEach((goal, index) => {
    goal.blockedByIds.forEach((blockedById, blockIndex) => {
      if (!goalIds.has(blockedById)) {
        errors.push({
          field: `goals[${index}].blockedByIds[${blockIndex}]`,
          message: `Blocking goal not found: ${blockedById}`
        });
      }
    });
  });

  // Check for circular dependencies
  const detectCircularDependency = (goalId: string, visited = new Set<string>()): boolean => {
    if (visited.has(goalId)) return true;
    
    visited.add(goalId);
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return false;
    
    for (const blockedById of goal.blockedByIds) {
      if (detectCircularDependency(blockedById, new Set(visited))) {
        return true;
      }
    }
    
    return false;
  };

  goals.forEach((goal, index) => {
    if (detectCircularDependency(goal.id)) {
      errors.push({
        field: `goals[${index}].blockedByIds`,
        message: `Circular dependency detected for goal: ${goal.id}`
      });
    }
  });

  return {
    isValid: errors.length === 0,
    data: errors.length === 0 ? goals : undefined,
    errors,
    schemaVersion: CURRENT_SCHEMA_VERSION
  };
}

/**
 * Validates data consistency rules
 */
export function validateDataConsistency(goals: Goal[]): ValidationResult<Goal[]> {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  goals.forEach((goal, goalIndex) => {
    // Check status consistency
    if (goal.status === 'completed' && !goal.completedAt) {
      warnings.push({
        field: `goals[${goalIndex}].completedAt`,
        message: 'Completed goal should have a completedAt timestamp'
      });
    }

    if (goal.status === 'blocked' && goal.blockedByIds.length === 0) {
      warnings.push({
        field: `goals[${goalIndex}].blockedByIds`,
        message: 'Blocked goal should have at least one blocking goal'
      });
    }

    // Check date consistency
    if (goal.completedAt && goal.createdAt) {
      const created = new Date(goal.createdAt);
      const completed = new Date(goal.completedAt);
      if (completed < created) {
        errors.push({
          field: `goals[${goalIndex}].completedAt`,
          message: 'Completed date cannot be before created date'
        });
      }
    }

    // Check task consistency
    goal.tasks.forEach((task, taskIndex) => {
      if (task.status === 'done' && !task.completedAt) {
        warnings.push({
          field: `goals[${goalIndex}].tasks[${taskIndex}].completedAt`,
          message: 'Completed task should have a completedAt timestamp'
        });
      }

      if (task.completedAt && task.createdAt) {
        const created = new Date(task.createdAt);
        const completed = new Date(task.completedAt);
        if (completed < created) {
          errors.push({
            field: `goals[${goalIndex}].tasks[${taskIndex}].completedAt`,
            message: 'Task completed date cannot be before created date'
          });
        }
      }
    });

    // Check metadata consistency
    if (goal.metadata?.dueDate && goal.createdAt) {
      const created = new Date(goal.createdAt);
      const due = new Date(goal.metadata.dueDate);
      if (due < created) {
        warnings.push({
          field: `goals[${goalIndex}].metadata.dueDate`,
          message: 'Due date is before creation date'
        });
      }
    }
  });

  return {
    isValid: errors.length === 0,
    data: errors.length === 0 ? goals : undefined,
    errors,
    warnings,
    schemaVersion: CURRENT_SCHEMA_VERSION
  };
}

/**
 * Comprehensive validation that combines all validation rules
 */
export function validateCompleteDataSet(
  data: unknown, 
  options: { strict?: boolean; checkHierarchy?: boolean; checkConsistency?: boolean } = {}
): ValidationResult<Goal[]> {
  const { strict = true, checkHierarchy = true, checkConsistency = true } = options;
  
  // Basic structure validation
  const structureResult = validateGoals(data, strict);
  if (!structureResult.isValid || !structureResult.data) {
    return structureResult;
  }

  let goals = structureResult.data;
  let allErrors = [...structureResult.errors];
  let allWarnings = [...(structureResult.warnings || [])];

  // Hierarchy validation
  if (checkHierarchy) {
    const hierarchyResult = validateGoalHierarchy(goals);
    if (!hierarchyResult.isValid) {
      allErrors.push(...hierarchyResult.errors);
    } else if (hierarchyResult.data) {
      goals = hierarchyResult.data;
    }
  }

  // Consistency validation
  if (checkConsistency) {
    const consistencyResult = validateDataConsistency(goals);
    allErrors.push(...consistencyResult.errors);
    allWarnings.push(...(consistencyResult.warnings || []));
    
    if (consistencyResult.data) {
      goals = consistencyResult.data;
    }
  }

  return {
    isValid: allErrors.length === 0,
    data: allErrors.length === 0 ? goals : undefined,
    errors: allErrors,
    warnings: allWarnings,
    schemaVersion: CURRENT_SCHEMA_VERSION
  };
}