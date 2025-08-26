/**
 * Validation utilities for goals, tasks, and user input
 */

import { Goal, Task, CreateGoalParams, CreateTaskParams } from '../models';

/**
 * Validation result interface
 */
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings?: string[];
}

/**
 * Validates a goal object
 */
export function validateGoal(goal: Partial<Goal>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Required fields
    if (!goal.title || typeof goal.title !== 'string' || !goal.title.trim()) {
        errors.push('Goal title is required and cannot be empty');
    } else if (goal.title.length > 200) {
        errors.push('Goal title cannot exceed 200 characters');
    } else if (goal.title.length < 3) {
        warnings.push('Goal title is very short - consider adding more detail');
    }
    
    if (!goal.id || typeof goal.id !== 'string') {
        errors.push('Goal ID is required');
    }
    
    if (!goal.status) {
        errors.push('Goal status is required');
    } else if (!['planned', 'in-progress', 'blocked', 'completed'].includes(goal.status)) {
        errors.push('Goal status must be one of: planned, in-progress, blocked, completed');
    }
    
    if (!goal.createdAt || !(goal.createdAt instanceof Date)) {
        errors.push('Goal createdAt must be a valid Date');
    }
    
    if (!Array.isArray(goal.blockedByIds)) {
        errors.push('Goal blockedByIds must be an array');
    }
    
    if (!Array.isArray(goal.tasks)) {
        errors.push('Goal tasks must be an array');
    }
    
    // Optional field validation
    if (goal.description !== undefined) {
        if (typeof goal.description !== 'string') {
            errors.push('Goal description must be a string');
        } else if (goal.description.length > 2000) {
            errors.push('Goal description cannot exceed 2000 characters');
        }
    }
    
    if (goal.parentId !== undefined && (typeof goal.parentId !== 'string' || !goal.parentId.trim())) {
        errors.push('Goal parentId must be a non-empty string if provided');
    }
    
    if (goal.completedAt !== undefined) {
        if (!(goal.completedAt instanceof Date)) {
            errors.push('Goal completedAt must be a valid Date if provided');
        } else if (goal.createdAt && goal.completedAt < goal.createdAt) {
            errors.push('Goal completedAt cannot be before createdAt');
        }
    }
    
    // Metadata validation
    if (goal.metadata) {
        if (goal.metadata.priority !== undefined) {
            if (typeof goal.metadata.priority !== 'number' || 
                goal.metadata.priority < 1 || 
                goal.metadata.priority > 5) {
                errors.push('Goal priority must be a number between 1 and 5');
            }
        }
        
        if (goal.metadata.estimatedHours !== undefined) {
            if (typeof goal.metadata.estimatedHours !== 'number' || goal.metadata.estimatedHours < 0) {
                errors.push('Goal estimatedHours must be a non-negative number');
            }
        }
        
        if (goal.metadata.actualHours !== undefined) {
            if (typeof goal.metadata.actualHours !== 'number' || goal.metadata.actualHours < 0) {
                errors.push('Goal actualHours must be a non-negative number');
            }
        }
        
        if (goal.metadata.tags !== undefined) {
            if (!Array.isArray(goal.metadata.tags)) {
                errors.push('Goal tags must be an array');
            } else {
                for (const tag of goal.metadata.tags) {
                    if (typeof tag !== 'string' || !tag.trim()) {
                        errors.push('Goal tags must be non-empty strings');
                        break;
                    }
                }
            }
        }
        
        if (goal.metadata.dueDate !== undefined && !(goal.metadata.dueDate instanceof Date)) {
            errors.push('Goal dueDate must be a valid Date if provided');
        }
    }
    
    // Task validation
    if (goal.tasks && Array.isArray(goal.tasks)) {
        for (let i = 0; i < goal.tasks.length; i++) {
            const taskValidation = validateTask(goal.tasks[i]);
            if (!taskValidation.isValid) {
                errors.push(...taskValidation.errors.map(err => `Task ${i + 1}: ${err}`));
            }
            if (taskValidation.warnings) {
                warnings.push(...taskValidation.warnings.map(warn => `Task ${i + 1}: ${warn}`));
            }
        }
    }
    
    // Logical validation
    if (goal.status === 'completed' && !goal.completedAt) {
        warnings.push('Completed goal should have a completedAt date');
    }
    
    if (goal.status === 'blocked' && goal.blockedByIds && goal.blockedByIds.length === 0) {
        warnings.push('Blocked goal should have at least one blocking goal');
    }
    
    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Validates a task object
 */
export function validateTask(task: Partial<Task>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Required fields
    if (!task.title || typeof task.title !== 'string' || !task.title.trim()) {
        errors.push('Task title is required and cannot be empty');
    } else if (task.title.length > 200) {
        errors.push('Task title cannot exceed 200 characters');
    } else if (task.title.length < 2) {
        warnings.push('Task title is very short');
    }
    
    if (!task.id || typeof task.id !== 'string') {
        errors.push('Task ID is required');
    }
    
    if (!task.status) {
        errors.push('Task status is required');
    } else if (!['todo', 'in-progress', 'done'].includes(task.status)) {
        errors.push('Task status must be one of: todo, in-progress, done');
    }
    
    if (task.order === undefined || typeof task.order !== 'number' || task.order < 0) {
        errors.push('Task order must be a non-negative number');
    }
    
    if (!task.createdAt || !(task.createdAt instanceof Date)) {
        errors.push('Task createdAt must be a valid Date');
    }
    
    // Optional field validation
    if (task.description !== undefined) {
        if (typeof task.description !== 'string') {
            errors.push('Task description must be a string');
        } else if (task.description.length > 1000) {
            errors.push('Task description cannot exceed 1000 characters');
        }
    }
    
    if (task.completedAt !== undefined) {
        if (!(task.completedAt instanceof Date)) {
            errors.push('Task completedAt must be a valid Date if provided');
        } else if (task.createdAt && task.completedAt < task.createdAt) {
            errors.push('Task completedAt cannot be before createdAt');
        }
    }
    
    // Logical validation
    if (task.status === 'done' && !task.completedAt) {
        warnings.push('Completed task should have a completedAt date');
    }
    
    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Validates goal creation parameters
 */
export function validateCreateGoalParams(params: CreateGoalParams): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (!params.title || typeof params.title !== 'string' || !params.title.trim()) {
        errors.push('Title is required and cannot be empty');
    } else if (params.title.length > 200) {
        errors.push('Title cannot exceed 200 characters');
    } else if (params.title.length < 3) {
        warnings.push('Title is very short - consider adding more detail');
    }
    
    if (params.description !== undefined) {
        if (typeof params.description !== 'string') {
            errors.push('Description must be a string');
        } else if (params.description.length > 2000) {
            errors.push('Description cannot exceed 2000 characters');
        }
    }
    
    if (params.parentId !== undefined && (typeof params.parentId !== 'string' || !params.parentId.trim())) {
        errors.push('ParentId must be a non-empty string if provided');
    }
    
    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Validates task creation parameters
 */
export function validateCreateTaskParams(params: CreateTaskParams): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (!params.title || typeof params.title !== 'string' || !params.title.trim()) {
        errors.push('Title is required and cannot be empty');
    } else if (params.title.length > 200) {
        errors.push('Title cannot exceed 200 characters');
    } else if (params.title.length < 2) {
        warnings.push('Title is very short');
    }
    
    if (params.description !== undefined) {
        if (typeof params.description !== 'string') {
            errors.push('Description must be a string');
        } else if (params.description.length > 1000) {
            errors.push('Description cannot exceed 1000 characters');
        }
    }
    
    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Sanitizes user input by removing dangerous content
 */
export function sanitizeInput(input: string, options?: {
    maxLength?: number;
    allowMultiline?: boolean;
    stripHtml?: boolean;
}): string {
    if (typeof input !== 'string') {
        return '';
    }
    
    const opts = {
        maxLength: 1000,
        allowMultiline: true,
        stripHtml: true,
        ...options
    };
    
    let sanitized = input;
    
    // Strip HTML if requested
    if (opts.stripHtml) {
        sanitized = sanitized.replace(/<[^>]*>/g, '');
    }
    
    // Handle multiline
    if (!opts.allowMultiline) {
        sanitized = sanitized.replace(/[\r\n]/g, ' ');
    }
    
    // Remove excessive whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();
    
    // Truncate if too long
    if (opts.maxLength && sanitized.length > opts.maxLength) {
        sanitized = sanitized.substring(0, opts.maxLength).trim();
    }
    
    return sanitized;
}

/**
 * Truncates text to a specified length with ellipsis
 */
export function truncateText(text: string, maxLength: number, options?: {
    ellipsis?: string;
    wordBoundary?: boolean;
}): string {
    if (typeof text !== 'string' || text.length <= maxLength) {
        return text;
    }
    
    const opts = {
        ellipsis: '...',
        wordBoundary: true,
        ...options
    };
    
    let truncated = text.substring(0, maxLength - opts.ellipsis.length);
    
    if (opts.wordBoundary) {
        const lastSpace = truncated.lastIndexOf(' ');
        if (lastSpace > 0) {
            truncated = truncated.substring(0, lastSpace);
        }
    }
    
    return truncated + opts.ellipsis;
}

/**
 * Validates an email address format
 */
export function validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validates a URL format
 */
export function validateUrl(url: string): boolean {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

/**
 * Checks if a string contains only safe characters
 */
export function isSafeString(input: string): boolean {
    // Allow alphanumeric, spaces, and common punctuation
    const safeRegex = /^[a-zA-Z0-9\s.,!?;:()\-_'"]+$/;
    return safeRegex.test(input);
}

/**
 * Validates that a number is within a specified range
 */
export function validateNumberRange(value: number, min: number, max: number): ValidationResult {
    const errors: string[] = [];
    
    if (typeof value !== 'number' || isNaN(value)) {
        errors.push('Value must be a valid number');
    } else if (value < min) {
        errors.push(`Value must be at least ${min}`);
    } else if (value > max) {
        errors.push(`Value must be at most ${max}`);
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Batch validates multiple items
 */
export function batchValidate<T>(
    items: T[],
    validator: (item: T) => ValidationResult
): {
    allValid: boolean;
    results: ValidationResult[];
    totalErrors: number;
    totalWarnings: number;
} {
    const results = items.map(validator);
    
    return {
        allValid: results.every(r => r.isValid),
        results,
        totalErrors: results.reduce((sum, r) => sum + r.errors.length, 0),
        totalWarnings: results.reduce((sum, r) => sum + (r.warnings?.length ?? 0), 0)
    };
}