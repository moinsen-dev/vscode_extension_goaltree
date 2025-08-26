import { Goal } from '../models/goal';
import { StorageData } from '../models/storage';
import { ValidationService, ValidationUtils } from '../validation';
import { StorageUtils, IntegrityCheckResult } from '../utils/storage-utils';
import { BackupUtils, BackupFileInfo, BackupTrigger } from '../utils/backup-utils';
import { createLogger } from '../utils/logger';

/**
 * Data integrity issue severity levels
 */
export enum IntegritySeverity {
    CRITICAL = 'critical',
    ERROR = 'error', 
    WARNING = 'warning',
    INFO = 'info'
}

/**
 * Extended integrity issue with more detailed information
 */
export interface IntegrityIssue {
    id: string;
    severity: IntegritySeverity;
    category: IntegrityCategory;
    field: string;
    message: string;
    goalId?: string;
    taskId?: string;
    autoRepairable: boolean;
    suggestedFix?: string;
    context?: any;
}

/**
 * Integrity issue categories
 */
export enum IntegrityCategory {
    DATA_CORRUPTION = 'data-corruption',
    VALIDATION_ERROR = 'validation-error',
    HIERARCHY_ISSUE = 'hierarchy-issue',
    REFERENCE_ERROR = 'reference-error',
    CONSISTENCY_ERROR = 'consistency-error',
    PERFORMANCE_ISSUE = 'performance-issue',
    SECURITY_ISSUE = 'security-issue'
}

/**
 * Comprehensive integrity check result
 */
export interface ComprehensiveIntegrityResult {
    isHealthy: boolean;
    overallScore: number; // 0-100
    totalIssues: number;
    criticalIssues: number;
    errorIssues: number;
    warningIssues: number;
    infoIssues: number;
    issues: IntegrityIssue[];
    autoRepairableIssues: number;
    repairSuggestions: string[];
    statistics: {
        totalGoals: number;
        totalTasks: number;
        hierarchyDepth: number;
        dependencyCount: number;
        checkDuration: number;
    };
    lastChecked: Date;
}

/**
 * Auto-repair result
 */
export interface AutoRepairResult {
    success: boolean;
    repairedCount: number;
    failedCount: number;
    repairedIssues: IntegrityIssue[];
    failedIssues: IntegrityIssue[];
    modifiedGoals: Goal[];
    backupCreated?: boolean;
    errors?: string[];
}

/**
 * IntegrityChecker provides comprehensive data integrity validation,
 * automated repair capabilities, and health monitoring for goal data.
 */
export class IntegrityChecker {
    private static readonly logger = createLogger('IntegrityChecker');
    private static issueIdCounter = 1;

    /**
     * Performs a comprehensive integrity check on goal data
     */
    static async performComprehensiveCheck(goals: Goal[]): Promise<ComprehensiveIntegrityResult> {
        const startTime = Date.now();
        const issues: IntegrityIssue[] = [];

        this.logger.debug(`Starting comprehensive integrity check on ${goals.length} goals`);

        try {
            // 1. Basic data validation
            await this.checkDataValidation(goals, issues);

            // 2. Hierarchy validation
            await this.checkHierarchyIntegrity(goals, issues);

            // 3. Reference validation
            await this.checkReferenceIntegrity(goals, issues);

            // 4. Consistency validation
            await this.checkDataConsistency(goals, issues);

            // 5. Performance analysis
            await this.checkPerformanceIssues(goals, issues);

            // 6. Security validation
            await this.checkSecurityIssues(goals, issues);

            // Calculate statistics
            const stats = StorageUtils.calculateStorageStats(goals);
            let totalTasks = 0;
            let maxDepth = 0;
            let dependencyCount = 0;

            for (const goal of goals) {
                if (goal.tasks) {
                    totalTasks += goal.tasks.length;
                }
                if (goal.blockedByIds) {
                    dependencyCount += goal.blockedByIds.length;
                }
            }

            // Count issues by severity
            const criticalIssues = issues.filter(i => i.severity === IntegritySeverity.CRITICAL).length;
            const errorIssues = issues.filter(i => i.severity === IntegritySeverity.ERROR).length;
            const warningIssues = issues.filter(i => i.severity === IntegritySeverity.WARNING).length;
            const infoIssues = issues.filter(i => i.severity === IntegritySeverity.INFO).length;
            const autoRepairableIssues = issues.filter(i => i.autoRepairable).length;

            // Calculate health score (100 - penalties)
            let score = 100;
            score -= (criticalIssues * 20); // Critical issues: -20 points each
            score -= (errorIssues * 10);    // Error issues: -10 points each
            score -= (warningIssues * 2);   // Warning issues: -2 points each
            score -= (infoIssues * 0.5);    // Info issues: -0.5 points each
            score = Math.max(0, Math.min(100, score));

            const isHealthy = criticalIssues === 0 && errorIssues === 0;

            // Generate repair suggestions
            const repairSuggestions = this.generateRepairSuggestions(issues);

            const result: ComprehensiveIntegrityResult = {
                isHealthy,
                overallScore: score,
                totalIssues: issues.length,
                criticalIssues,
                errorIssues,
                warningIssues,
                infoIssues,
                issues,
                autoRepairableIssues,
                repairSuggestions,
                statistics: {
                    totalGoals: goals.length,
                    totalTasks,
                    hierarchyDepth: stats.hierarchyDepth,
                    dependencyCount,
                    checkDuration: Date.now() - startTime
                },
                lastChecked: new Date()
            };

            this.logger.info(`Integrity check completed: ${issues.length} issues found, health score: ${score}/100`);
            return result;

        } catch (error) {
            this.logger.error('Integrity check failed', error);
            
            // Return error result
            return {
                isHealthy: false,
                overallScore: 0,
                totalIssues: 1,
                criticalIssues: 1,
                errorIssues: 0,
                warningIssues: 0,
                infoIssues: 0,
                issues: [{
                    id: this.generateIssueId(),
                    severity: IntegritySeverity.CRITICAL,
                    category: IntegrityCategory.DATA_CORRUPTION,
                    field: 'system',
                    message: `Integrity check failed: ${error}`,
                    autoRepairable: false
                }],
                autoRepairableIssues: 0,
                repairSuggestions: ['Manual data recovery may be required'],
                statistics: {
                    totalGoals: goals.length,
                    totalTasks: 0,
                    hierarchyDepth: 0,
                    dependencyCount: 0,
                    checkDuration: Date.now() - startTime
                },
                lastChecked: new Date()
            };
        }
    }

    /**
     * Attempts to automatically repair data integrity issues
     */
    static async performAutoRepair(
        goals: Goal[],
        issues: IntegrityIssue[],
        createBackup: boolean = true
    ): Promise<AutoRepairResult> {
        const startTime = Date.now();
        this.logger.info(`Starting auto-repair of ${issues.length} issues`);

        const repairedIssues: IntegrityIssue[] = [];
        const failedIssues: IntegrityIssue[] = [];
        const errors: string[] = [];
        let modifiedGoals = [...goals]; // Work on a copy
        let backupCreated = false;

        try {
            // Create backup before repair
            if (createBackup) {
                try {
                    const metadata = BackupUtils.createBackupMetadata(
                        goals,
                        BackupTrigger.BEFORE_MAJOR_CHANGE,
                        'auto-repair',
                        'Automatic backup before integrity repair'
                    );
                    await BackupUtils.saveBackupWithMetadata(goals, metadata);
                    backupCreated = true;
                    this.logger.info('Backup created before auto-repair');
                } catch (error) {
                    errors.push(`Failed to create backup: ${error}`);
                    this.logger.warn('Proceeding with repair without backup');
                }
            }

            // Only attempt to repair auto-repairable issues
            const repairableIssues = issues.filter(issue => issue.autoRepairable);
            
            for (const issue of repairableIssues) {
                try {
                    const repairResult = await this.repairSingleIssue(modifiedGoals, issue);
                    if (repairResult.success) {
                        modifiedGoals = repairResult.modifiedGoals;
                        repairedIssues.push(issue);
                        this.logger.debug(`Repaired issue: ${issue.id} - ${issue.message}`);
                    } else {
                        failedIssues.push(issue);
                        if (repairResult.error) {
                            errors.push(`Failed to repair ${issue.id}: ${repairResult.error}`);
                        }
                    }
                } catch (error) {
                    failedIssues.push(issue);
                    errors.push(`Exception repairing ${issue.id}: ${error}`);
                    this.logger.error(`Failed to repair issue ${issue.id}`, error);
                }
            }

            // Add non-repairable issues to failed list
            failedIssues.push(...issues.filter(issue => !issue.autoRepairable));

            const duration = Date.now() - startTime;
            this.logger.info(`Auto-repair completed in ${duration}ms: ${repairedIssues.length} repaired, ${failedIssues.length} failed`);

            return {
                success: repairedIssues.length > 0,
                repairedCount: repairedIssues.length,
                failedCount: failedIssues.length,
                repairedIssues,
                failedIssues,
                modifiedGoals,
                backupCreated,
                errors: errors.length > 0 ? errors : undefined
            };

        } catch (error) {
            this.logger.error('Auto-repair process failed', error);
            return {
                success: false,
                repairedCount: 0,
                failedCount: issues.length,
                repairedIssues: [],
                failedIssues: issues,
                modifiedGoals: goals,
                backupCreated,
                errors: [String(error)]
            };
        }
    }

    /**
     * Validates backup files for integrity
     */
    static async validateBackupFiles(): Promise<{
        validBackups: number;
        invalidBackups: number;
        corruptedBackups: BackupFileInfo[];
        repairableBackups: BackupFileInfo[];
        issues: string[];
    }> {
        this.logger.debug('Starting backup file validation');
        
        const issues: string[] = [];
        const corruptedBackups: BackupFileInfo[] = [];
        const repairableBackups: BackupFileInfo[] = [];
        let validBackups = 0;
        let invalidBackups = 0;

        try {
            const backups = await BackupUtils.listBackups();
            
            for (const backup of backups) {
                const validation = await BackupUtils.validateBackupIntegrity(backup.path);
                
                if (validation.isValid) {
                    validBackups++;
                } else {
                    invalidBackups++;
                    corruptedBackups.push(backup);
                    
                    // Check if backup is repairable
                    if (validation.goalCount !== undefined && validation.goalCount > 0) {
                        repairableBackups.push(backup);
                    }
                    
                    issues.push(`${backup.path.fsPath}: ${validation.errors.join(', ')}`);
                }
                
                // Add warnings to issues
                if (validation.warnings.length > 0) {
                    issues.push(`${backup.path.fsPath} warnings: ${validation.warnings.join(', ')}`);
                }
            }
            
            this.logger.info(`Backup validation completed: ${validBackups} valid, ${invalidBackups} invalid`);
            
        } catch (error) {
            issues.push(`Backup validation failed: ${error}`);
            this.logger.error('Backup validation failed', error);
        }

        return {
            validBackups,
            invalidBackups,
            corruptedBackups,
            repairableBackups,
            issues
        };
    }

    // Private validation methods

    private static async checkDataValidation(goals: Goal[], issues: IntegrityIssue[]): Promise<void> {
        for (const goal of goals) {
            // Use Stream B validation
            if (!ValidationUtils.isValidGoal(goal)) {
                issues.push({
                    id: this.generateIssueId(),
                    severity: IntegritySeverity.ERROR,
                    category: IntegrityCategory.VALIDATION_ERROR,
                    field: 'goal',
                    message: 'Goal fails basic validation',
                    goalId: goal.id,
                    autoRepairable: true,
                    suggestedFix: 'Sanitize and fix goal data'
                });
            }

            // Check individual fields
            if (!goal.id || goal.id.trim().length === 0) {
                issues.push({
                    id: this.generateIssueId(),
                    severity: IntegritySeverity.CRITICAL,
                    category: IntegrityCategory.DATA_CORRUPTION,
                    field: 'id',
                    message: 'Goal missing required ID',
                    goalId: goal.id,
                    autoRepairable: true,
                    suggestedFix: 'Generate new UUID for goal'
                });
            }

            if (!goal.title || goal.title.trim().length === 0) {
                issues.push({
                    id: this.generateIssueId(),
                    severity: IntegritySeverity.ERROR,
                    category: IntegrityCategory.VALIDATION_ERROR,
                    field: 'title',
                    message: 'Goal missing required title',
                    goalId: goal.id,
                    autoRepairable: true,
                    suggestedFix: 'Set default title based on ID'
                });
            }

            // Validate tasks
            if (goal.tasks) {
                for (const task of goal.tasks) {
                    if (!ValidationUtils.isValidTask(task)) {
                        issues.push({
                            id: this.generateIssueId(),
                            severity: IntegritySeverity.ERROR,
                            category: IntegrityCategory.VALIDATION_ERROR,
                            field: 'task',
                            message: 'Task fails basic validation',
                            goalId: goal.id,
                            taskId: task.id,
                            autoRepairable: true,
                            suggestedFix: 'Sanitize and fix task data'
                        });
                    }
                }
            }
        }
    }

    private static async checkHierarchyIntegrity(goals: Goal[], issues: IntegrityIssue[]): Promise<void> {
        const goalIds = new Set(goals.map(g => g.id));
        const parentChildMap = new Map<string, string[]>();
        
        // Build hierarchy map
        for (const goal of goals) {
            if (goal.parentId) {
                if (!goalIds.has(goal.parentId)) {
                    issues.push({
                        id: this.generateIssueId(),
                        severity: IntegritySeverity.ERROR,
                        category: IntegrityCategory.HIERARCHY_ISSUE,
                        field: 'parentId',
                        message: `Parent goal ${goal.parentId} does not exist`,
                        goalId: goal.id,
                        autoRepairable: true,
                        suggestedFix: 'Remove invalid parent reference'
                    });
                } else {
                    if (!parentChildMap.has(goal.parentId)) {
                        parentChildMap.set(goal.parentId, []);
                    }
                    parentChildMap.get(goal.parentId)!.push(goal.id);
                }
            }
        }

        // Check for circular references
        const visited = new Set<string>();
        const recursionStack = new Set<string>();
        
        const checkCircular = (goalId: string, path: string[]): void => {
            if (recursionStack.has(goalId)) {
                issues.push({
                    id: this.generateIssueId(),
                    severity: IntegritySeverity.CRITICAL,
                    category: IntegrityCategory.HIERARCHY_ISSUE,
                    field: 'parentId',
                    message: `Circular hierarchy detected: ${path.join(' -> ')} -> ${goalId}`,
                    goalId: goalId,
                    autoRepairable: true,
                    suggestedFix: 'Break circular reference by removing parent link'
                });
                return;
            }

            if (visited.has(goalId)) return;

            visited.add(goalId);
            recursionStack.add(goalId);

            const children = parentChildMap.get(goalId) || [];
            for (const childId of children) {
                checkCircular(childId, [...path, goalId]);
            }

            recursionStack.delete(goalId);
        };

        // Check all top-level goals
        for (const goal of goals) {
            if (!goal.parentId && !visited.has(goal.id)) {
                checkCircular(goal.id, []);
            }
        }
    }

    private static async checkReferenceIntegrity(goals: Goal[], issues: IntegrityIssue[]): Promise<void> {
        const goalIds = new Set(goals.map(g => g.id));

        for (const goal of goals) {
            // Check blocked-by references
            if (goal.blockedByIds && goal.blockedByIds.length > 0) {
                for (const blockedById of goal.blockedByIds) {
                    if (!goalIds.has(blockedById)) {
                        issues.push({
                            id: this.generateIssueId(),
                            severity: IntegritySeverity.WARNING,
                            category: IntegrityCategory.REFERENCE_ERROR,
                            field: 'blockedByIds',
                            message: `Blocked-by goal ${blockedById} does not exist`,
                            goalId: goal.id,
                            autoRepairable: true,
                            suggestedFix: 'Remove invalid blocked-by reference'
                        });
                    }

                    // Check for self-blocking
                    if (blockedById === goal.id) {
                        issues.push({
                            id: this.generateIssueId(),
                            severity: IntegritySeverity.ERROR,
                            category: IntegrityCategory.REFERENCE_ERROR,
                            field: 'blockedByIds',
                            message: 'Goal cannot be blocked by itself',
                            goalId: goal.id,
                            autoRepairable: true,
                            suggestedFix: 'Remove self-blocking reference'
                        });
                    }
                }
            }
        }
    }

    private static async checkDataConsistency(goals: Goal[], issues: IntegrityIssue[]): Promise<void> {
        const goalIdCounts = new Map<string, number>();
        
        // Check for duplicate goal IDs
        for (const goal of goals) {
            const count = goalIdCounts.get(goal.id) || 0;
            goalIdCounts.set(goal.id, count + 1);
        }

        for (const [goalId, count] of goalIdCounts.entries()) {
            if (count > 1) {
                issues.push({
                    id: this.generateIssueId(),
                    severity: IntegritySeverity.CRITICAL,
                    category: IntegrityCategory.CONSISTENCY_ERROR,
                    field: 'id',
                    message: `Duplicate goal ID found ${count} times`,
                    goalId: goalId,
                    autoRepairable: true,
                    suggestedFix: 'Generate unique IDs for duplicate goals'
                });
            }
        }

        // Check for duplicate task IDs within goals
        for (const goal of goals) {
            if (goal.tasks && goal.tasks.length > 0) {
                const taskIdCounts = new Map<string, number>();
                
                for (const task of goal.tasks) {
                    const count = taskIdCounts.get(task.id) || 0;
                    taskIdCounts.set(task.id, count + 1);
                }

                for (const [taskId, count] of taskIdCounts.entries()) {
                    if (count > 1) {
                        issues.push({
                            id: this.generateIssueId(),
                            severity: IntegritySeverity.ERROR,
                            category: IntegrityCategory.CONSISTENCY_ERROR,
                            field: 'task.id',
                            message: `Duplicate task ID found ${count} times within goal`,
                            goalId: goal.id,
                            taskId: taskId,
                            autoRepairable: true,
                            suggestedFix: 'Generate unique IDs for duplicate tasks'
                        });
                    }
                }
            }
        }

        // Check date consistency
        for (const goal of goals) {
            if (goal.completedAt && goal.createdAt && goal.completedAt < goal.createdAt) {
                issues.push({
                    id: this.generateIssueId(),
                    severity: IntegritySeverity.WARNING,
                    category: IntegrityCategory.CONSISTENCY_ERROR,
                    field: 'completedAt',
                    message: 'Goal completed before it was created',
                    goalId: goal.id,
                    autoRepairable: true,
                    suggestedFix: 'Clear invalid completion date'
                });
            }

            if (goal.tasks) {
                for (const task of goal.tasks) {
                    if (task.completedAt && task.createdAt && task.completedAt < task.createdAt) {
                        issues.push({
                            id: this.generateIssueId(),
                            severity: IntegritySeverity.WARNING,
                            category: IntegrityCategory.CONSISTENCY_ERROR,
                            field: 'task.completedAt',
                            message: 'Task completed before it was created',
                            goalId: goal.id,
                            taskId: task.id,
                            autoRepairable: true,
                            suggestedFix: 'Clear invalid task completion date'
                        });
                    }
                }
            }
        }
    }

    private static async checkPerformanceIssues(goals: Goal[], issues: IntegrityIssue[]): Promise<void> {
        // Check for performance issues that could impact the application
        
        // Very large number of goals
        if (goals.length > 1000) {
            issues.push({
                id: this.generateIssueId(),
                severity: IntegritySeverity.WARNING,
                category: IntegrityCategory.PERFORMANCE_ISSUE,
                field: 'goals',
                message: `Large number of goals (${goals.length}) may impact performance`,
                autoRepairable: false,
                suggestedFix: 'Consider archiving completed goals'
            });
        }

        // Check for goals with excessive tasks
        for (const goal of goals) {
            if (goal.tasks && goal.tasks.length > 50) {
                issues.push({
                    id: this.generateIssueId(),
                    severity: IntegritySeverity.INFO,
                    category: IntegrityCategory.PERFORMANCE_ISSUE,
                    field: 'tasks',
                    message: `Goal has many tasks (${goal.tasks.length}), consider breaking down`,
                    goalId: goal.id,
                    autoRepairable: false,
                    suggestedFix: 'Split large goals into smaller sub-goals'
                });
            }
        }

        // Check for very deep hierarchies
        const maxDepth = this.calculateMaxHierarchyDepth(goals);
        if (maxDepth > 5) {
            issues.push({
                id: this.generateIssueId(),
                severity: IntegritySeverity.INFO,
                category: IntegrityCategory.PERFORMANCE_ISSUE,
                field: 'hierarchy',
                message: `Deep hierarchy (${maxDepth} levels) may be hard to navigate`,
                autoRepairable: false,
                suggestedFix: 'Consider flattening the goal hierarchy'
            });
        }
    }

    private static async checkSecurityIssues(goals: Goal[], issues: IntegrityIssue[]): Promise<void> {
        // Check for potential security issues in goal data
        
        const dangerousPatterns = [
            /javascript:/i,
            /<script/i,
            /eval\(/i,
            /on\w+=/i // event handlers
        ];

        for (const goal of goals) {
            // Check goal title and description for dangerous content
            const textsToCheck = [
                { field: 'title', text: goal.title },
                { field: 'description', text: goal.description }
            ].filter(item => item.text);

            for (const { field, text } of textsToCheck) {
                for (const pattern of dangerousPatterns) {
                    if (pattern.test(text)) {
                        issues.push({
                            id: this.generateIssueId(),
                            severity: IntegritySeverity.WARNING,
                            category: IntegrityCategory.SECURITY_ISSUE,
                            field: field,
                            message: `Potentially unsafe content detected in ${field}`,
                            goalId: goal.id,
                            autoRepairable: true,
                            suggestedFix: 'Remove potentially unsafe content'
                        });
                    }
                }
            }

            // Check tasks
            if (goal.tasks) {
                for (const task of goal.tasks) {
                    const taskTexts = [
                        { field: 'task.title', text: task.title },
                        { field: 'task.description', text: task.description }
                    ].filter(item => item.text);

                    for (const { field, text } of taskTexts) {
                        for (const pattern of dangerousPatterns) {
                            if (pattern.test(text)) {
                                issues.push({
                                    id: this.generateIssueId(),
                                    severity: IntegritySeverity.WARNING,
                                    category: IntegrityCategory.SECURITY_ISSUE,
                                    field: field,
                                    message: `Potentially unsafe content detected in ${field}`,
                                    goalId: goal.id,
                                    taskId: task.id,
                                    autoRepairable: true,
                                    suggestedFix: 'Remove potentially unsafe content'
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    private static async repairSingleIssue(goals: Goal[], issue: IntegrityIssue): Promise<{
        success: boolean;
        modifiedGoals: Goal[];
        error?: string;
    }> {
        try {
            const modifiedGoals = [...goals];
            
            switch (issue.category) {
                case IntegrityCategory.DATA_CORRUPTION:
                    return await this.repairDataCorruption(modifiedGoals, issue);
                
                case IntegrityCategory.VALIDATION_ERROR:
                    return await this.repairValidationError(modifiedGoals, issue);
                
                case IntegrityCategory.HIERARCHY_ISSUE:
                    return await this.repairHierarchyIssue(modifiedGoals, issue);
                
                case IntegrityCategory.REFERENCE_ERROR:
                    return await this.repairReferenceError(modifiedGoals, issue);
                
                case IntegrityCategory.CONSISTENCY_ERROR:
                    return await this.repairConsistencyError(modifiedGoals, issue);
                
                case IntegrityCategory.SECURITY_ISSUE:
                    return await this.repairSecurityIssue(modifiedGoals, issue);
                
                default:
                    return {
                        success: false,
                        modifiedGoals: goals,
                        error: `No repair method for category ${issue.category}`
                    };
            }
        } catch (error) {
            return {
                success: false,
                modifiedGoals: goals,
                error: String(error)
            };
        }
    }

    private static async repairDataCorruption(goals: Goal[], issue: IntegrityIssue): Promise<{
        success: boolean;
        modifiedGoals: Goal[];
        error?: string;
    }> {
        // Implementation for repairing data corruption issues
        const goalIndex = goals.findIndex(g => g.id === issue.goalId);
        if (goalIndex === -1) {
            return { success: false, modifiedGoals: goals, error: 'Goal not found' };
        }

        const goal = goals[goalIndex];

        if (issue.field === 'id' && (!goal.id || goal.id.trim().length === 0)) {
            // Generate new ID
            goal.id = `goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            goals[goalIndex] = goal;
            return { success: true, modifiedGoals: goals };
        }

        return { success: false, modifiedGoals: goals, error: 'Unknown data corruption issue' };
    }

    private static async repairValidationError(goals: Goal[], issue: IntegrityIssue): Promise<{
        success: boolean;
        modifiedGoals: Goal[];
        error?: string;
    }> {
        // Implementation for repairing validation errors
        const goalIndex = goals.findIndex(g => g.id === issue.goalId);
        if (goalIndex === -1) {
            return { success: false, modifiedGoals: goals, error: 'Goal not found' };
        }

        const goal = goals[goalIndex];

        if (issue.field === 'title' && (!goal.title || goal.title.trim().length === 0)) {
            goal.title = `Untitled Goal (${goal.id.slice(0, 8)})`;
            goals[goalIndex] = goal;
            return { success: true, modifiedGoals: goals };
        }

        // Use ValidationUtils to sanitize the goal
        const sanitized = ValidationUtils.sanitizeAndValidate(goal);
        if (sanitized.isValid && sanitized.data) {
            goals[goalIndex] = sanitized.data;
            return { success: true, modifiedGoals: goals };
        }

        return { success: false, modifiedGoals: goals, error: 'Could not sanitize goal data' };
    }

    private static async repairHierarchyIssue(goals: Goal[], issue: IntegrityIssue): Promise<{
        success: boolean;
        modifiedGoals: Goal[];
        error?: string;
    }> {
        // Implementation for repairing hierarchy issues
        const goalIndex = goals.findIndex(g => g.id === issue.goalId);
        if (goalIndex === -1) {
            return { success: false, modifiedGoals: goals, error: 'Goal not found' };
        }

        const goal = goals[goalIndex];

        if (issue.field === 'parentId') {
            // Remove invalid parent reference
            delete goal.parentId;
            goals[goalIndex] = goal;
            return { success: true, modifiedGoals: goals };
        }

        return { success: false, modifiedGoals: goals, error: 'Unknown hierarchy issue' };
    }

    private static async repairReferenceError(goals: Goal[], issue: IntegrityIssue): Promise<{
        success: boolean;
        modifiedGoals: Goal[];
        error?: string;
    }> {
        // Implementation for repairing reference errors
        const goalIndex = goals.findIndex(g => g.id === issue.goalId);
        if (goalIndex === -1) {
            return { success: false, modifiedGoals: goals, error: 'Goal not found' };
        }

        const goal = goals[goalIndex];

        if (issue.field === 'blockedByIds' && goal.blockedByIds) {
            // Remove invalid references
            const validGoalIds = new Set(goals.map(g => g.id));
            goal.blockedByIds = goal.blockedByIds.filter(id => id !== goal.id && validGoalIds.has(id));
            goals[goalIndex] = goal;
            return { success: true, modifiedGoals: goals };
        }

        return { success: false, modifiedGoals: goals, error: 'Unknown reference error' };
    }

    private static async repairConsistencyError(goals: Goal[], issue: IntegrityIssue): Promise<{
        success: boolean;
        modifiedGoals: Goal[];
        error?: string;
    }> {
        // Implementation for repairing consistency errors
        const goalIndex = goals.findIndex(g => g.id === issue.goalId);
        if (goalIndex === -1) {
            return { success: false, modifiedGoals: goals, error: 'Goal not found' };
        }

        const goal = goals[goalIndex];

        if (issue.field === 'completedAt' && goal.completedAt && goal.createdAt && goal.completedAt < goal.createdAt) {
            delete goal.completedAt;
            goals[goalIndex] = goal;
            return { success: true, modifiedGoals: goals };
        }

        // Handle duplicate IDs by generating new ones
        if (issue.field === 'id') {
            goal.id = `goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            goals[goalIndex] = goal;
            return { success: true, modifiedGoals: goals };
        }

        return { success: false, modifiedGoals: goals, error: 'Unknown consistency error' };
    }

    private static async repairSecurityIssue(goals: Goal[], issue: IntegrityIssue): Promise<{
        success: boolean;
        modifiedGoals: Goal[];
        error?: string;
    }> {
        // Implementation for repairing security issues
        const goalIndex = goals.findIndex(g => g.id === issue.goalId);
        if (goalIndex === -1) {
            return { success: false, modifiedGoals: goals, error: 'Goal not found' };
        }

        const goal = goals[goalIndex];

        const dangerousPatterns = [
            /javascript:/gi,
            /<script.*?>/gi,
            /eval\(/gi,
            /on\w+=/gi
        ];

        let modified = false;

        if (issue.field === 'title' && goal.title) {
            let cleanedTitle = goal.title;
            for (const pattern of dangerousPatterns) {
                cleanedTitle = cleanedTitle.replace(pattern, '');
            }
            if (cleanedTitle !== goal.title) {
                goal.title = cleanedTitle;
                modified = true;
            }
        }

        if (issue.field === 'description' && goal.description) {
            let cleanedDescription = goal.description;
            for (const pattern of dangerousPatterns) {
                cleanedDescription = cleanedDescription.replace(pattern, '');
            }
            if (cleanedDescription !== goal.description) {
                goal.description = cleanedDescription;
                modified = true;
            }
        }

        if (modified) {
            goals[goalIndex] = goal;
            return { success: true, modifiedGoals: goals };
        }

        return { success: false, modifiedGoals: goals, error: 'No security issues found to repair' };
    }

    private static generateRepairSuggestions(issues: IntegrityIssue[]): string[] {
        const suggestions = new Set<string>();

        for (const issue of issues) {
            if (issue.suggestedFix) {
                suggestions.add(issue.suggestedFix);
            }
        }

        if (suggestions.size === 0) {
            suggestions.add('No specific repair suggestions available');
        }

        return Array.from(suggestions);
    }

    private static calculateMaxHierarchyDepth(goals: Goal[]): number {
        const parentChildMap = new Map<string, string[]>();
        
        for (const goal of goals) {
            if (goal.parentId) {
                if (!parentChildMap.has(goal.parentId)) {
                    parentChildMap.set(goal.parentId, []);
                }
                parentChildMap.get(goal.parentId)!.push(goal.id);
            }
        }

        const calculateDepth = (goalId: string, visited: Set<string>): number => {
            if (visited.has(goalId)) return 0;
            visited.add(goalId);
            
            const children = parentChildMap.get(goalId) || [];
            if (children.length === 0) return 0;
            
            let maxChildDepth = 0;
            for (const childId of children) {
                const childDepth = calculateDepth(childId, new Set(visited));
                maxChildDepth = Math.max(maxChildDepth, childDepth);
            }
            
            return maxChildDepth + 1;
        };

        let maxDepth = 0;
        for (const goal of goals) {
            if (!goal.parentId) {
                const depth = calculateDepth(goal.id, new Set());
                maxDepth = Math.max(maxDepth, depth);
            }
        }

        return maxDepth;
    }

    private static generateIssueId(): string {
        return `issue_${this.issueIdCounter++}_${Date.now()}`;
    }
}