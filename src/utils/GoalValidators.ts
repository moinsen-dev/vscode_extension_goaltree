/**
 * GoalValidators - Utility functions for goal and task validation
 * 
 * This module provides low-level validation functions used by the ValidationService
 * and other components to ensure data integrity and enforce business rules.
 */

/**
 * Validation configuration constants
 */
export const ValidationConfig = {
    TITLE_MIN_LENGTH: 1,
    TITLE_MAX_LENGTH: 200,
    DESCRIPTION_MAX_LENGTH: 2000,
    TASK_DESCRIPTION_MAX_LENGTH: 1000,
    MIN_PRIORITY: 1,
    MAX_PRIORITY: 5,
    MIN_HOURS: 0,
    MAX_HOURS: 10000,
    MAX_TAGS: 20,
    TAG_MIN_LENGTH: 1,
    TAG_MAX_LENGTH: 50
} as const;

/**
 * GoalValidators utility class with static validation methods
 */
export class GoalValidators {
    
    // ===========================================
    // Basic String Validation
    // ===========================================

    /**
     * Validate goal/task title
     */
    static isValidTitle(title: string): boolean {
        if (typeof title !== 'string') return false;
        
        const trimmed = title.trim();
        return trimmed.length >= ValidationConfig.TITLE_MIN_LENGTH && 
               trimmed.length <= ValidationConfig.TITLE_MAX_LENGTH;
    }

    /**
     * Validate goal description
     */
    static isValidDescription(description: string): boolean {
        if (typeof description !== 'string') return false;
        
        return description.length <= ValidationConfig.DESCRIPTION_MAX_LENGTH;
    }

    /**
     * Validate task description (shorter than goal description)
     */
    static isValidTaskDescription(description: string): boolean {
        if (typeof description !== 'string') return false;
        
        return description.length <= ValidationConfig.TASK_DESCRIPTION_MAX_LENGTH;
    }

    // ===========================================
    // Numeric Validation
    // ===========================================

    /**
     * Validate priority value (1-5)
     */
    static isValidPriority(priority: number): boolean {
        return typeof priority === 'number' && 
               Number.isInteger(priority) &&
               priority >= ValidationConfig.MIN_PRIORITY && 
               priority <= ValidationConfig.MAX_PRIORITY;
    }

    /**
     * Validate hour values (estimated/actual hours)
     */
    static isValidHours(hours: number): boolean {
        return typeof hours === 'number' && 
               hours >= ValidationConfig.MIN_HOURS && 
               hours <= ValidationConfig.MAX_HOURS &&
               !isNaN(hours) &&
               isFinite(hours);
    }

    /**
     * Validate task order value
     */
    static isValidOrder(order: number): boolean {
        return typeof order === 'number' && 
               Number.isInteger(order) &&
               order >= 0;
    }

    // ===========================================
    // Date Validation
    // ===========================================

    /**
     * Validate date value
     */
    static isValidDate(date: Date): boolean {
        return date instanceof Date && 
               !isNaN(date.getTime()) &&
               date.getTime() > 0;
    }

    /**
     * Validate due date is not too far in the past
     */
    static isReasonableDueDate(dueDate: Date, allowPastDays: number = 30): boolean {
        if (!this.isValidDate(dueDate)) return false;
        
        const now = new Date();
        const pastThreshold = new Date(now.getTime() - (allowPastDays * 24 * 60 * 60 * 1000));
        
        return dueDate >= pastThreshold;
    }

    // ===========================================
    // Array Validation
    // ===========================================

    /**
     * Validate tags array
     */
    static isValidTags(tags: string[]): boolean {
        if (!Array.isArray(tags)) return false;
        if (tags.length > ValidationConfig.MAX_TAGS) return false;
        
        return tags.every(tag => 
            typeof tag === 'string' && 
            tag.trim().length >= ValidationConfig.TAG_MIN_LENGTH &&
            tag.trim().length <= ValidationConfig.TAG_MAX_LENGTH &&
            !tag.includes(',') && // Prevent CSV issues
            !tag.includes(';')   // Prevent delimiter conflicts
        );
    }

    /**
     * Validate blocked by IDs array
     */
    static isValidBlockedByIds(blockedByIds: string[]): boolean {
        if (!Array.isArray(blockedByIds)) return false;
        
        return blockedByIds.every(id => this.isValidId(id)) &&
               new Set(blockedByIds).size === blockedByIds.length; // No duplicates
    }

    // ===========================================
    // ID Validation
    // ===========================================

    /**
     * Validate goal/task ID format
     */
    static isValidId(id: string): boolean {
        if (typeof id !== 'string') return false;
        
        // Basic format validation - adjust regex as needed for your ID format
        const idPattern = /^[a-zA-Z0-9_-]+$/;
        return id.length > 0 && 
               id.length <= 100 && 
               idPattern.test(id);
    }

    /**
     * Validate UUID format (if using UUIDs)
     */
    static isValidUUID(uuid: string): boolean {
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        return typeof uuid === 'string' && uuidPattern.test(uuid);
    }

    // ===========================================
    // Status Validation
    // ===========================================

    /**
     * Validate goal status value
     */
    static isValidGoalStatus(status: string): boolean {
        const validStatuses = ['planned', 'in-progress', 'blocked', 'completed'];
        return typeof status === 'string' && validStatuses.includes(status);
    }

    /**
     * Validate task status value
     */
    static isValidTaskStatus(status: string): boolean {
        const validStatuses = ['todo', 'in-progress', 'done'];
        return typeof status === 'string' && validStatuses.includes(status);
    }

    // ===========================================
    // Complex Validation
    // ===========================================

    /**
     * Validate goal metadata object
     */
    static isValidGoalMetadata(metadata: any): boolean {
        if (!metadata || typeof metadata !== 'object') return false;
        
        // Check each optional property
        if (metadata.color !== undefined && !this.isValidColor(metadata.color)) return false;
        if (metadata.priority !== undefined && !this.isValidPriority(metadata.priority)) return false;
        if (metadata.estimatedHours !== undefined && !this.isValidHours(metadata.estimatedHours)) return false;
        if (metadata.actualHours !== undefined && !this.isValidHours(metadata.actualHours)) return false;
        if (metadata.tags !== undefined && !this.isValidTags(metadata.tags)) return false;
        if (metadata.dueDate !== undefined && !this.isValidDate(metadata.dueDate)) return false;
        
        return true;
    }

    /**
     * Validate color value (hex, rgb, or named color)
     */
    static isValidColor(color: string): boolean {
        if (typeof color !== 'string') return false;
        
        // Hex color pattern
        const hexPattern = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
        if (hexPattern.test(color)) return true;
        
        // RGB pattern
        const rgbPattern = /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/;
        if (rgbPattern.test(color)) return true;
        
        // RGBA pattern
        const rgbaPattern = /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)$/;
        if (rgbaPattern.test(color)) return true;
        
        // Named colors (basic set)
        const namedColors = [
            'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink',
            'brown', 'black', 'white', 'gray', 'grey', 'cyan', 'magenta'
        ];
        return namedColors.includes(color.toLowerCase());
    }

    // ===========================================
    // Business Logic Validation
    // ===========================================

    /**
     * Validate that estimated and actual hours make sense together
     */
    static isReasonableHourComparison(estimatedHours?: number, actualHours?: number): boolean {
        if (estimatedHours === undefined || actualHours === undefined) return true;
        
        // Actual hours should not be more than 5x estimated (might indicate an error)
        return actualHours <= estimatedHours * 5;
    }

    /**
     * Validate that due date makes sense with creation date
     */
    static isReasonableDueDateForGoal(createdAt: Date, dueDate?: Date): boolean {
        if (!dueDate) return true;
        if (!this.isValidDate(createdAt) || !this.isValidDate(dueDate)) return false;
        
        // Due date should not be more than 10 years from creation
        const tenYearsFromCreation = new Date(createdAt.getTime() + (10 * 365 * 24 * 60 * 60 * 1000));
        return dueDate <= tenYearsFromCreation;
    }

    /**
     * Validate that a goal title is unique within its parent context
     */
    static isTitleUniqueInContext(title: string, existingTitles: string[]): boolean {
        const normalizedTitle = title.trim().toLowerCase();
        const normalizedExisting = existingTitles.map(t => t.trim().toLowerCase());
        
        return !normalizedExisting.includes(normalizedTitle);
    }

    // ===========================================
    // Sanitization Helpers
    // ===========================================

    /**
     * Sanitize title by trimming and normalizing whitespace
     */
    static sanitizeTitle(title: string): string {
        return title.trim().replace(/\s+/g, ' ');
    }

    /**
     * Sanitize description by trimming and normalizing line breaks
     */
    static sanitizeDescription(description: string): string {
        return description.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }

    /**
     * Sanitize tags by trimming and removing duplicates
     */
    static sanitizeTags(tags: string[]): string[] {
        if (!Array.isArray(tags)) return [];
        
        const sanitized = tags
            .map(tag => tag.trim())
            .filter(tag => tag.length > 0)
            .map(tag => tag.toLowerCase());
            
        return [...new Set(sanitized)]; // Remove duplicates
    }

    // ===========================================
    // Validation Error Messages
    // ===========================================

    /**
     * Get user-friendly error message for validation failures
     */
    static getValidationErrorMessage(field: string, value: any): string {
        switch (field) {
            case 'title':
                if (!value || typeof value !== 'string') {
                    return 'Title is required';
                }
                if (value.trim().length < ValidationConfig.TITLE_MIN_LENGTH) {
                    return 'Title cannot be empty';
                }
                if (value.trim().length > ValidationConfig.TITLE_MAX_LENGTH) {
                    return `Title cannot exceed ${ValidationConfig.TITLE_MAX_LENGTH} characters`;
                }
                break;
                
            case 'description':
                if (typeof value === 'string' && value.length > ValidationConfig.DESCRIPTION_MAX_LENGTH) {
                    return `Description cannot exceed ${ValidationConfig.DESCRIPTION_MAX_LENGTH} characters`;
                }
                break;
                
            case 'priority':
                if (typeof value === 'number') {
                    if (!Number.isInteger(value)) {
                        return 'Priority must be a whole number';
                    }
                    if (value < ValidationConfig.MIN_PRIORITY || value > ValidationConfig.MAX_PRIORITY) {
                        return `Priority must be between ${ValidationConfig.MIN_PRIORITY} and ${ValidationConfig.MAX_PRIORITY}`;
                    }
                }
                return 'Priority must be a number';
                
            case 'hours':
                if (typeof value === 'number') {
                    if (value < ValidationConfig.MIN_HOURS) {
                        return 'Hours cannot be negative';
                    }
                    if (value > ValidationConfig.MAX_HOURS) {
                        return `Hours cannot exceed ${ValidationConfig.MAX_HOURS}`;
                    }
                    if (!isFinite(value) || isNaN(value)) {
                        return 'Hours must be a valid number';
                    }
                }
                return 'Hours must be a number';
                
            default:
                return `Invalid ${field}`;
        }
        
        return `Invalid ${field}`;
    }

    // ===========================================
    // Validation Summary
    // ===========================================

    /**
     * Comprehensive validation of a goal object
     */
    static validateGoalObject(goal: any): { isValid: boolean; errors: string[]; warnings: string[] } {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Required fields
        if (!this.isValidId(goal.id)) {
            errors.push('Invalid or missing goal ID');
        }
        if (!this.isValidTitle(goal.title)) {
            errors.push(this.getValidationErrorMessage('title', goal.title));
        }
        if (!this.isValidGoalStatus(goal.status)) {
            errors.push('Invalid goal status');
        }

        // Optional fields
        if (goal.description !== undefined && !this.isValidDescription(goal.description)) {
            errors.push(this.getValidationErrorMessage('description', goal.description));
        }
        if (goal.parentId !== undefined && !this.isValidId(goal.parentId)) {
            errors.push('Invalid parent ID');
        }
        if (goal.blockedByIds !== undefined && !this.isValidBlockedByIds(goal.blockedByIds)) {
            errors.push('Invalid blocked by IDs');
        }

        // Metadata validation
        if (goal.metadata !== undefined && !this.isValidGoalMetadata(goal.metadata)) {
            errors.push('Invalid goal metadata');
        }

        // Date validations
        if (goal.createdAt !== undefined && !this.isValidDate(goal.createdAt)) {
            errors.push('Invalid creation date');
        }
        if (goal.dueDate !== undefined) {
            if (!this.isValidDate(goal.dueDate)) {
                errors.push('Invalid due date');
            } else if (goal.createdAt && !this.isReasonableDueDateForGoal(goal.createdAt, goal.dueDate)) {
                warnings.push('Due date seems unreasonable compared to creation date');
            }
        }

        // Hours validation
        if (goal.metadata?.estimatedHours !== undefined || goal.metadata?.actualHours !== undefined) {
            if (!this.isReasonableHourComparison(goal.metadata?.estimatedHours, goal.metadata?.actualHours)) {
                warnings.push('Actual hours significantly exceed estimated hours');
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }
}