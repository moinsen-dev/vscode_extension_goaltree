/**
 * JSON Schema definitions for Goal Tree data models
 * Provides runtime validation schemas that correspond to TypeScript interfaces
 */

import { Goal, Task, GoalStatus, TaskStatus } from '../models/goal';

/**
 * JSON Schema for TaskStatus enum
 */
const taskStatusSchema = {
  type: 'string' as const,
  enum: ['todo', 'in-progress', 'done'] as const
};

/**
 * JSON Schema for GoalStatus enum
 */
const goalStatusSchema = {
  type: 'string' as const,
  enum: ['planned', 'in-progress', 'blocked', 'completed'] as const
};

/**
 * JSON Schema for Task interface
 */
export const taskSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      minLength: 1
    },
    title: {
      type: 'string',
      minLength: 1,
      maxLength: 200
    },
    status: taskStatusSchema,
    order: {
      type: 'number',
      minimum: 0
    },
    createdAt: {
      type: 'string',
      format: 'date-time'
    },
    completedAt: {
      type: 'string',
      format: 'date-time',
      nullable: true
    },
    description: {
      type: 'string',
      maxLength: 1000,
      nullable: true
    }
  },
  required: ['id', 'title', 'status', 'order', 'createdAt'],
  additionalProperties: false
} as const;

/**
 * JSON Schema for Goal metadata
 */
const goalMetadataSchema = {
  type: 'object',
  properties: {
    color: {
      type: 'string',
      nullable: true
    },
    priority: {
      type: 'number',
      minimum: 1,
      maximum: 5,
      nullable: true
    },
    estimatedHours: {
      type: 'number',
      minimum: 0,
      nullable: true
    },
    actualHours: {
      type: 'number',
      minimum: 0,
      nullable: true
    },
    tags: {
      type: 'array',
      items: {
        type: 'string',
        minLength: 1
      },
      nullable: true
    },
    dueDate: {
      type: 'string',
      format: 'date-time',
      nullable: true
    }
  },
  additionalProperties: false,
  nullable: true
} as const;

/**
 * JSON Schema for Goal interface
 */
export const goalSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      minLength: 1
    },
    title: {
      type: 'string',
      minLength: 1,
      maxLength: 200
    },
    description: {
      type: 'string',
      maxLength: 2000,
      nullable: true
    },
    status: goalStatusSchema,
    parentId: {
      type: 'string',
      minLength: 1,
      nullable: true
    },
    blockedByIds: {
      type: 'array',
      items: {
        type: 'string',
        minLength: 1
      }
    },
    tasks: {
      type: 'array',
      items: taskSchema
    },
    createdAt: {
      type: 'string',
      format: 'date-time'
    },
    completedAt: {
      type: 'string',
      format: 'date-time',
      nullable: true
    },
    metadata: goalMetadataSchema
  },
  required: ['id', 'title', 'status', 'blockedByIds', 'tasks', 'createdAt'],
  additionalProperties: false
} as const;

/**
 * JSON Schema for array of Goals (storage format)
 */
export const goalsArraySchema = {
  type: 'array',
  items: goalSchema
} as const;

/**
 * JSON Schema for storage data format
 */
export const storageDataSchema = {
  type: 'object',
  properties: {
    version: {
      type: 'string',
      pattern: '^\\d+\\.\\d+(\\.\\d+)?$'
    },
    createdAt: {
      type: 'string',
      format: 'date-time'
    },
    updatedAt: {
      type: 'string',
      format: 'date-time'
    },
    goals: goalsArraySchema
  },
  required: ['version', 'goals'],
  additionalProperties: false
} as const;

/**
 * JSON Schema for backup data format
 */
export const backupDataSchema = {
  type: 'object',
  properties: {
    version: {
      type: 'string',
      pattern: '^\\d+\\.\\d+(\\.\\d+)?$'
    },
    backupCreatedAt: {
      type: 'string',
      format: 'date-time'
    },
    originalCreatedAt: {
      type: 'string',
      format: 'date-time'
    },
    originalUpdatedAt: {
      type: 'string',
      format: 'date-time'
    },
    reason: {
      type: 'string',
      enum: ['manual', 'auto-save', 'migration', 'corruption-recovery']
    },
    goals: goalsArraySchema
  },
  required: ['version', 'backupCreatedAt', 'reason', 'goals'],
  additionalProperties: false
} as const;

/**
 * JSON Schema for import/export format
 */
export const importExportSchema = {
  type: 'object',
  properties: {
    version: {
      type: 'string',
      pattern: '^\\d+\\.\\d+(\\.\\d+)?$'
    },
    exportedAt: {
      type: 'string',
      format: 'date-time'
    },
    exportedBy: {
      type: 'string',
      nullable: true
    },
    metadata: {
      type: 'object',
      properties: {
        totalGoals: { type: 'number' },
        totalTasks: { type: 'number' },
        workspaceName: { type: 'string', nullable: true },
        description: { type: 'string', nullable: true }
      },
      additionalProperties: false,
      nullable: true
    },
    goals: goalsArraySchema
  },
  required: ['version', 'exportedAt', 'goals'],
  additionalProperties: false
} as const;

/**
 * Schema validation options
 */
export interface SchemaValidationOptions {
  /** Allow additional properties not defined in schema */
  allowAdditionalProperties?: boolean;
  /** Remove additional properties during validation */
  removeAdditional?: boolean | 'all' | 'failing';
  /** Coerce types where possible (e.g., string dates to Date objects) */
  coerceTypes?: boolean;
  /** Use defaults defined in schema */
  useDefaults?: boolean;
  /** Maximum number of errors to collect before stopping */
  allErrors?: boolean;
  /** Verbose error reporting */
  verbose?: boolean;
}

/**
 * Default validation options for strict validation
 */
export const strictValidationOptions: SchemaValidationOptions = {
  allowAdditionalProperties: false,
  removeAdditional: 'all',
  coerceTypes: false,
  useDefaults: false,
  allErrors: true,
  verbose: true
};

/**
 * Permissive validation options for importing data
 */
export const permissiveValidationOptions: SchemaValidationOptions = {
  allowAdditionalProperties: true,
  removeAdditional: 'failing',
  coerceTypes: true,
  useDefaults: true,
  allErrors: true,
  verbose: false
};

/**
 * Schema registry for easy access to all schemas
 */
export const schemaRegistry = {
  task: taskSchema,
  goal: goalSchema,
  goalsArray: goalsArraySchema,
  storageData: storageDataSchema,
  backupData: backupDataSchema,
  importExport: importExportSchema
} as const;

/**
 * Schema identifiers for error reporting
 */
export type SchemaId = keyof typeof schemaRegistry;

/**
 * Current schema version for migration purposes
 */
export const CURRENT_SCHEMA_VERSION = '1.0.0';

/**
 * Supported schema versions for backward compatibility
 */
export const SUPPORTED_SCHEMA_VERSIONS = ['1.0.0', '1.0'] as const;