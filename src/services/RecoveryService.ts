import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { Goal } from '../models/goal';
import { StorageData, StorageOperationResult } from '../models/storage';
import { WorkspaceManager } from './workspace-manager';
import { BackupService, BackupServiceResult, RestoreOptions } from './BackupService';
import { BackupUtils, BackupFileInfo, BackupTrigger } from '../utils/backup-utils';
import { IntegrityChecker, ComprehensiveIntegrityResult, AutoRepairResult } from './integrity-checker';
import { ValidationService, ValidationUtils } from '../validation';
import { StorageUtils } from '../utils/storage-utils';
import { createLogger } from '../utils/logger';

/**
 * Recovery strategy options
 */
export enum RecoveryStrategy {
    AUTO_REPAIR_ONLY = 'auto-repair-only',
    BACKUP_RESTORE = 'backup-restore',
    LATEST_BACKUP = 'latest-backup',
    BEST_BACKUP = 'best-backup',
    USER_CHOICE = 'user-choice',
    MERGE_SOURCES = 'merge-sources'
}

/**
 * Data corruption severity levels
 */
export enum CorruptionSeverity {
    NONE = 'none',
    MINOR = 'minor',
    MODERATE = 'moderate', 
    SEVERE = 'severe',
    TOTAL = 'total'
}

/**
 * Recovery scenario information
 */
export interface RecoveryScenario {
    scenario: string;
    severity: CorruptionSeverity;
    dataRecoverable: boolean;
    recommendedStrategy: RecoveryStrategy;
    availableStrategies: RecoveryStrategy[];
    description: string;
    automaticRecovery: boolean;
}

/**
 * Recovery operation result
 */
export interface RecoveryResult {
    success: boolean;
    strategy: RecoveryStrategy;
    recoveredGoals?: Goal[];
    originalGoalCount: number;
    recoveredGoalCount: number;
    lostGoalCount: number;
    repairReport?: AutoRepairResult;
    integrityReport?: ComprehensiveIntegrityResult;
    backupUsed?: BackupFileInfo;
    warnings: string[];
    errors: string[];
    duration: number;
}

/**
 * Recovery options for different scenarios
 */
export interface RecoveryOptions {
    strategy?: RecoveryStrategy;
    allowDataLoss?: boolean;
    skipValidation?: boolean;
    createBackupBeforeRecovery?: boolean;
    maxBackupsToTry?: number;
    repairCorruption?: boolean;
}

/**
 * RecoveryService provides comprehensive error recovery and data restoration
 * capabilities for corrupted, missing, or invalid goal data.
 */
export class RecoveryService {
    private context: vscode.ExtensionContext;
    private backupService: BackupService;
    private logger = createLogger('RecoveryService');

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.backupService = new BackupService(context);
    }

    /**
     * Initializes the recovery service
     */
    async initialize(): Promise<void> {
        try {
            await this.backupService.initialize();
            this.logger.info('RecoveryService initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize RecoveryService', error);
            throw error;
        }
    }

    /**
     * Analyzes data corruption and recommends recovery strategy
     */
    async analyzeCorruption(corruptedData?: any): Promise<RecoveryScenario> {
        this.logger.debug('Analyzing data corruption scenario');

        try {
            // Check if we have any data at all
            if (!corruptedData) {
                return {
                    scenario: 'no-data',
                    severity: CorruptionSeverity.TOTAL,
                    dataRecoverable: false,
                    recommendedStrategy: RecoveryStrategy.LATEST_BACKUP,
                    availableStrategies: [RecoveryStrategy.LATEST_BACKUP, RecoveryStrategy.BEST_BACKUP],
                    description: 'No goal data found - storage file may be missing or empty',
                    automaticRecovery: true
                };
            }

            // Try to extract goals from whatever data we have
            let goals: Goal[] = [];
            let extractionFailed = false;

            try {
                const extractResult = StorageUtils.extractGoalsFromStorage(corruptedData);
                if (extractResult.success && extractResult.data) {
                    goals = extractResult.data;
                } else {
                    extractionFailed = true;
                }
            } catch (error) {
                extractionFailed = true;
            }

            // If extraction completely failed
            if (extractionFailed) {
                return {
                    scenario: 'extraction-failed',
                    severity: CorruptionSeverity.SEVERE,
                    dataRecoverable: false,
                    recommendedStrategy: RecoveryStrategy.BEST_BACKUP,
                    availableStrategies: [RecoveryStrategy.BEST_BACKUP, RecoveryStrategy.LATEST_BACKUP],
                    description: 'Data format is corrupted and cannot be parsed - backup recovery required',
                    automaticRecovery: true
                };
            }

            // If no goals were extracted
            if (goals.length === 0) {
                return {
                    scenario: 'no-goals',
                    severity: CorruptionSeverity.MODERATE,
                    dataRecoverable: false,
                    recommendedStrategy: RecoveryStrategy.LATEST_BACKUP,
                    availableStrategies: [RecoveryStrategy.LATEST_BACKUP, RecoveryStrategy.BEST_BACKUP],
                    description: 'Storage file contains no goal data - may be corrupted or cleared',
                    automaticRecovery: true
                };
            }

            // Perform integrity check on extracted goals
            const integrityResult = await IntegrityChecker.performComprehensiveCheck(goals);

            // Determine severity based on integrity issues
            let severity = CorruptionSeverity.NONE;
            if (integrityResult.criticalIssues > 0) {
                severity = integrityResult.criticalIssues > goals.length / 2 ? 
                    CorruptionSeverity.SEVERE : CorruptionSeverity.MODERATE;
            } else if (integrityResult.errorIssues > 0) {
                severity = CorruptionSeverity.MINOR;
            }

            // Determine if data is recoverable through auto-repair
            const isAutoRepairable = integrityResult.autoRepairableIssues >= integrityResult.criticalIssues + integrityResult.errorIssues;
            
            if (severity === CorruptionSeverity.NONE) {
                return {
                    scenario: 'healthy-data',
                    severity,
                    dataRecoverable: true,
                    recommendedStrategy: RecoveryStrategy.AUTO_REPAIR_ONLY,
                    availableStrategies: [RecoveryStrategy.AUTO_REPAIR_ONLY],
                    description: 'Data is healthy and requires no recovery',
                    automaticRecovery: false
                };
            }

            if (isAutoRepairable) {
                return {
                    scenario: 'auto-repairable',
                    severity,
                    dataRecoverable: true,
                    recommendedStrategy: RecoveryStrategy.AUTO_REPAIR_ONLY,
                    availableStrategies: [
                        RecoveryStrategy.AUTO_REPAIR_ONLY,
                        RecoveryStrategy.BACKUP_RESTORE,
                        RecoveryStrategy.MERGE_SOURCES
                    ],
                    description: `Data has ${integrityResult.totalIssues} issues but ${integrityResult.autoRepairableIssues} can be automatically repaired`,
                    automaticRecovery: severity <= CorruptionSeverity.MINOR
                };
            }

            // Data has issues that can't be auto-repaired
            return {
                scenario: 'manual-recovery-needed',
                severity,
                dataRecoverable: true,
                recommendedStrategy: severity >= CorruptionSeverity.SEVERE ? 
                    RecoveryStrategy.BEST_BACKUP : RecoveryStrategy.BACKUP_RESTORE,
                availableStrategies: [
                    RecoveryStrategy.BACKUP_RESTORE,
                    RecoveryStrategy.BEST_BACKUP,
                    RecoveryStrategy.MERGE_SOURCES,
                    RecoveryStrategy.USER_CHOICE
                ],
                description: `Data has ${integrityResult.totalIssues} issues with ${integrityResult.criticalIssues} critical problems requiring backup recovery`,
                automaticRecovery: false
            };

        } catch (error) {
            this.logger.error('Failed to analyze corruption', error);
            return {
                scenario: 'analysis-failed',
                severity: CorruptionSeverity.TOTAL,
                dataRecoverable: false,
                recommendedStrategy: RecoveryStrategy.LATEST_BACKUP,
                availableStrategies: [RecoveryStrategy.LATEST_BACKUP],
                description: `Corruption analysis failed: ${error}`,
                automaticRecovery: false
            };
        }
    }

    /**
     * Performs automatic recovery using the best available strategy
     */
    async performAutoRecovery(
        corruptedData?: any,
        options: RecoveryOptions = {}
    ): Promise<RecoveryResult> {
        const startTime = Date.now();
        const warnings: string[] = [];
        const errors: string[] = [];

        this.logger.info('Starting automatic recovery process');

        try {
            // Analyze corruption to determine strategy
            const scenario = await this.analyzeCorruption(corruptedData);
            const strategy = options.strategy || scenario.recommendedStrategy;

            this.logger.info(`Using recovery strategy: ${strategy} for scenario: ${scenario.scenario}`);

            // Create backup before recovery if requested
            if (options.createBackupBeforeRecovery && corruptedData) {
                try {
                    const extractResult = StorageUtils.extractGoalsFromStorage(corruptedData);
                    if (extractResult.success && extractResult.data && extractResult.data.length > 0) {
                        await this.backupService.createBackup(extractResult.data, {
                            trigger: BackupTrigger.RECOVERY_INITIATED,
                            description: 'Backup created before recovery operation'
                        });
                        warnings.push('Created backup of corrupted data before recovery');
                    }
                } catch (error) {
                    warnings.push(`Failed to backup corrupted data: ${error}`);
                }
            }

            // Execute recovery strategy
            const result = await this.executeRecoveryStrategy(strategy, corruptedData, options);

            result.warnings.unshift(...warnings);
            result.errors.unshift(...errors);
            result.duration = Date.now() - startTime;

            this.logger.info(`Auto recovery completed: ${result.success ? 'success' : 'failure'} in ${result.duration}ms`);
            
            return result;

        } catch (error) {
            const duration = Date.now() - startTime;
            this.logger.error('Auto recovery failed', error);

            return {
                success: false,
                strategy: options.strategy || RecoveryStrategy.AUTO_REPAIR_ONLY,
                originalGoalCount: 0,
                recoveredGoalCount: 0,
                lostGoalCount: 0,
                warnings,
                errors: [...errors, String(error)],
                duration
            };
        }
    }

    /**
     * Recovers data from the best available backup
     */
    async recoverFromBestBackup(options: RecoveryOptions = {}): Promise<RecoveryResult> {
        const startTime = Date.now();
        const warnings: string[] = [];
        const errors: string[] = [];

        try {
            this.logger.info('Starting recovery from best backup');

            // Get list of available backups
            const { backups } = await this.backupService.listBackups();
            
            if (backups.length === 0) {
                return {
                    success: false,
                    strategy: RecoveryStrategy.BEST_BACKUP,
                    originalGoalCount: 0,
                    recoveredGoalCount: 0,
                    lostGoalCount: 0,
                    warnings,
                    errors: ['No backups available for recovery'],
                    duration: Date.now() - startTime
                };
            }

            // Find the best backup (most recent valid one)
            let bestBackup: BackupFileInfo | undefined;
            const maxBackupsToTry = options.maxBackupsToTry || 5;
            
            for (let i = 0; i < Math.min(backups.length, maxBackupsToTry); i++) {
                const backup = backups[i];
                
                if (backup.isValid) {
                    bestBackup = backup;
                    break;
                }
                
                // Try to validate corrupted backups
                const validation = await BackupUtils.validateBackupIntegrity(backup.path);
                if (validation.isValid || (validation.goalCount && validation.goalCount > 0)) {
                    bestBackup = backup;
                    if (!validation.isValid) {
                        warnings.push(`Using backup with integrity issues: ${validation.errors.join(', ')}`);
                    }
                    break;
                }
            }

            if (!bestBackup) {
                return {
                    success: false,
                    strategy: RecoveryStrategy.BEST_BACKUP,
                    originalGoalCount: 0,
                    recoveredGoalCount: 0,
                    lostGoalCount: 0,
                    warnings,
                    errors: [`No usable backup found after checking ${Math.min(backups.length, maxBackupsToTry)} backups`],
                    duration: Date.now() - startTime
                };
            }

            // Restore from the best backup
            const restoreOptions: RestoreOptions = {
                validateBeforeRestore: !options.skipValidation,
                repairCorruption: options.repairCorruption ?? true,
                skipValidation: options.skipValidation ?? false
            };

            const restoreResult = await this.backupService.restoreFromBackup(bestBackup.path, restoreOptions);

            if (!restoreResult.success) {
                return {
                    success: false,
                    strategy: RecoveryStrategy.BEST_BACKUP,
                    originalGoalCount: 0,
                    recoveredGoalCount: 0,
                    lostGoalCount: 0,
                    warnings,
                    errors: [...errors, restoreResult.error || 'Restore failed'],
                    duration: Date.now() - startTime
                };
            }

            const recoveredGoals = restoreResult.goals || [];
            
            if (restoreResult.warnings) {
                warnings.push(...restoreResult.warnings);
            }

            this.logger.info(`Successfully recovered ${recoveredGoals.length} goals from backup`);

            return {
                success: true,
                strategy: RecoveryStrategy.BEST_BACKUP,
                recoveredGoals,
                originalGoalCount: 0, // Unknown for backup recovery
                recoveredGoalCount: recoveredGoals.length,
                lostGoalCount: 0, // Cannot determine from backup alone
                integrityReport: restoreResult.integrityReport,
                backupUsed: bestBackup,
                warnings,
                errors,
                duration: Date.now() - startTime
            };

        } catch (error) {
            this.logger.error('Recovery from best backup failed', error);
            return {
                success: false,
                strategy: RecoveryStrategy.BEST_BACKUP,
                originalGoalCount: 0,
                recoveredGoalCount: 0,
                lostGoalCount: 0,
                warnings,
                errors: [...errors, String(error)],
                duration: Date.now() - startTime
            };
        }
    }

    /**
     * Attempts to merge data from multiple sources (current + backups)
     */
    async mergeFromMultipleSources(
        corruptedData?: any,
        options: RecoveryOptions = {}
    ): Promise<RecoveryResult> {
        const startTime = Date.now();
        const warnings: string[] = [];
        const errors: string[] = [];

        try {
            this.logger.info('Starting merge recovery from multiple sources');

            const allGoals = new Map<string, Goal>();
            let originalGoalCount = 0;

            // Try to extract goals from corrupted data first
            if (corruptedData) {
                try {
                    const extractResult = StorageUtils.extractGoalsFromStorage(corruptedData);
                    if (extractResult.success && extractResult.data) {
                        originalGoalCount = extractResult.data.length;
                        
                        // Add valid goals from corrupted data
                        for (const goal of extractResult.data) {
                            if (ValidationUtils.isValidGoal(goal)) {
                                allGoals.set(goal.id, goal);
                            }
                        }
                        
                        this.logger.debug(`Extracted ${allGoals.size} valid goals from corrupted data`);
                    }
                } catch (error) {
                    warnings.push(`Failed to extract goals from corrupted data: ${error}`);
                }
            }

            // Merge goals from backups
            const { backups } = await this.backupService.listBackups();
            const maxBackupsToCheck = Math.min(backups.length, options.maxBackupsToTry || 3);

            for (let i = 0; i < maxBackupsToCheck; i++) {
                const backup = backups[i];
                
                try {
                    const { goals } = await BackupUtils.loadBackup(backup.path);
                    
                    for (const goal of goals) {
                        if (ValidationUtils.isValidGoal(goal)) {
                            // Use the most recent valid version of each goal
                            const existing = allGoals.get(goal.id);
                            if (!existing || new Date(goal.createdAt) > new Date(existing.createdAt)) {
                                allGoals.set(goal.id, goal);
                            }
                        }
                    }
                    
                    this.logger.debug(`Merged goals from backup: ${backup.path.fsPath}`);
                    
                } catch (error) {
                    warnings.push(`Failed to load backup ${backup.path.fsPath}: ${error}`);
                }
            }

            const mergedGoals = Array.from(allGoals.values());
            
            if (mergedGoals.length === 0) {
                return {
                    success: false,
                    strategy: RecoveryStrategy.MERGE_SOURCES,
                    originalGoalCount,
                    recoveredGoalCount: 0,
                    lostGoalCount: originalGoalCount,
                    warnings,
                    errors: [...errors, 'No valid goals found from any source'],
                    duration: Date.now() - startTime
                };
            }

            // Perform integrity check on merged data
            let integrityReport: ComprehensiveIntegrityResult | undefined;
            let finalGoals = mergedGoals;

            if (!options.skipValidation) {
                integrityReport = await IntegrityChecker.performComprehensiveCheck(mergedGoals);
                
                // Attempt auto-repair if needed
                if (!integrityReport.isHealthy && integrityReport.autoRepairableIssues > 0) {
                    const repairResult = await IntegrityChecker.performAutoRepair(
                        mergedGoals,
                        integrityReport.issues.filter(i => i.autoRepairable),
                        false
                    );
                    
                    if (repairResult.success) {
                        finalGoals = repairResult.modifiedGoals;
                        warnings.push(`Auto-repaired ${repairResult.repairedCount} issues in merged data`);
                        
                        // Re-check integrity
                        integrityReport = await IntegrityChecker.performComprehensiveCheck(finalGoals);
                    }
                }
            }

            const lostGoalCount = Math.max(0, originalGoalCount - finalGoals.length);
            
            this.logger.info(`Merge recovery completed: ${finalGoals.length} goals recovered, ${lostGoalCount} lost`);

            return {
                success: true,
                strategy: RecoveryStrategy.MERGE_SOURCES,
                recoveredGoals: finalGoals,
                originalGoalCount,
                recoveredGoalCount: finalGoals.length,
                lostGoalCount,
                integrityReport,
                warnings,
                errors,
                duration: Date.now() - startTime
            };

        } catch (error) {
            this.logger.error('Merge recovery failed', error);
            return {
                success: false,
                strategy: RecoveryStrategy.MERGE_SOURCES,
                originalGoalCount: 0,
                recoveredGoalCount: 0,
                lostGoalCount: 0,
                warnings,
                errors: [...errors, String(error)],
                duration: Date.now() - startTime
            };
        }
    }

    /**
     * Validates recovery readiness and backup availability
     */
    async validateRecoveryReadiness(): Promise<{
        ready: boolean;
        backupCount: number;
        validBackupCount: number;
        latestBackupAge: number; // hours
        issues: string[];
        recommendations: string[];
    }> {
        const issues: string[] = [];
        const recommendations: string[] = [];

        try {
            const { backups, statistics } = await this.backupService.listBackups();
            
            let ready = true;
            
            if (statistics.total === 0) {
                ready = false;
                issues.push('No backups available for recovery');
                recommendations.push('Create a backup to enable recovery capabilities');
            }

            if (statistics.valid === 0 && statistics.total > 0) {
                ready = false;
                issues.push('No valid backups available');
                recommendations.push('Check backup integrity and create new backups');
            }

            const latestBackupAge = statistics.newestDate ? 
                (Date.now() - statistics.newestDate.getTime()) / (1000 * 60 * 60) : 0;

            if (latestBackupAge > 24) {
                issues.push('Latest backup is older than 24 hours');
                recommendations.push('Create a recent backup for better recovery options');
            }

            if (statistics.valid < 3) {
                recommendations.push('Maintain at least 3 valid backups for robust recovery');
            }

            return {
                ready,
                backupCount: statistics.total,
                validBackupCount: statistics.valid,
                latestBackupAge,
                issues,
                recommendations
            };

        } catch (error) {
            this.logger.error('Failed to validate recovery readiness', error);
            return {
                ready: false,
                backupCount: 0,
                validBackupCount: 0,
                latestBackupAge: 0,
                issues: ['Failed to check recovery readiness'],
                recommendations: ['Ensure backup system is functional']
            };
        }
    }

    /**
     * Cleanup recovery service resources
     */
    async cleanup(): Promise<void> {
        await this.backupService.cleanup();
        this.logger.debug('RecoveryService cleanup completed');
    }

    // Private methods

    private async executeRecoveryStrategy(
        strategy: RecoveryStrategy,
        corruptedData?: any,
        options: RecoveryOptions = {}
    ): Promise<RecoveryResult> {
        switch (strategy) {
            case RecoveryStrategy.AUTO_REPAIR_ONLY:
                return await this.executeAutoRepair(corruptedData, options);
                
            case RecoveryStrategy.LATEST_BACKUP:
                return await this.recoverFromLatestBackup(options);
                
            case RecoveryStrategy.BEST_BACKUP:
                return await this.recoverFromBestBackup(options);
                
            case RecoveryStrategy.MERGE_SOURCES:
                return await this.mergeFromMultipleSources(corruptedData, options);
                
            case RecoveryStrategy.BACKUP_RESTORE:
                return await this.recoverFromBestBackup(options);
                
            default:
                throw new Error(`Unsupported recovery strategy: ${strategy}`);
        }
    }

    private async executeAutoRepair(corruptedData: any, options: RecoveryOptions): Promise<RecoveryResult> {
        const startTime = Date.now();
        const warnings: string[] = [];
        const errors: string[] = [];

        try {
            // Extract goals from corrupted data
            const extractResult = StorageUtils.extractGoalsFromStorage(corruptedData);
            if (!extractResult.success || !extractResult.data) {
                throw new Error('Cannot extract goals for auto-repair');
            }

            const originalGoals = extractResult.data;
            const originalGoalCount = originalGoals.length;

            // Perform integrity check
            const integrityResult = await IntegrityChecker.performComprehensiveCheck(originalGoals);
            
            if (integrityResult.autoRepairableIssues === 0) {
                return {
                    success: true,
                    strategy: RecoveryStrategy.AUTO_REPAIR_ONLY,
                    recoveredGoals: originalGoals,
                    originalGoalCount,
                    recoveredGoalCount: originalGoals.length,
                    lostGoalCount: 0,
                    integrityReport: integrityResult,
                    warnings: ['No repairs needed'],
                    errors,
                    duration: Date.now() - startTime
                };
            }

            // Attempt auto-repair
            const repairableIssues = integrityResult.issues.filter(i => i.autoRepairable);
            const repairResult = await IntegrityChecker.performAutoRepair(originalGoals, repairableIssues, false);

            if (!repairResult.success) {
                throw new Error('Auto-repair failed');
            }

            const recoveredGoals = repairResult.modifiedGoals;
            const lostGoalCount = Math.max(0, originalGoalCount - recoveredGoals.length);

            if (repairResult.repairedCount > 0) {
                warnings.push(`Auto-repaired ${repairResult.repairedCount} issues`);
            }

            if (repairResult.failedCount > 0) {
                warnings.push(`Failed to repair ${repairResult.failedCount} issues`);
            }

            return {
                success: true,
                strategy: RecoveryStrategy.AUTO_REPAIR_ONLY,
                recoveredGoals,
                originalGoalCount,
                recoveredGoalCount: recoveredGoals.length,
                lostGoalCount,
                repairReport: repairResult,
                integrityReport: integrityResult,
                warnings,
                errors,
                duration: Date.now() - startTime
            };

        } catch (error) {
            return {
                success: false,
                strategy: RecoveryStrategy.AUTO_REPAIR_ONLY,
                originalGoalCount: 0,
                recoveredGoalCount: 0,
                lostGoalCount: 0,
                warnings,
                errors: [...errors, String(error)],
                duration: Date.now() - startTime
            };
        }
    }

    private async recoverFromLatestBackup(options: RecoveryOptions): Promise<RecoveryResult> {
        const startTime = Date.now();
        const warnings: string[] = [];
        const errors: string[] = [];

        try {
            const { backups } = await this.backupService.listBackups();
            
            if (backups.length === 0) {
                throw new Error('No backups available');
            }

            // Use the most recent backup (first in the sorted list)
            const latestBackup = backups[0];
            
            const restoreOptions: RestoreOptions = {
                validateBeforeRestore: !options.skipValidation,
                repairCorruption: options.repairCorruption ?? true,
                skipValidation: options.skipValidation ?? false
            };

            const restoreResult = await this.backupService.restoreFromBackup(latestBackup.path, restoreOptions);

            if (!restoreResult.success) {
                throw new Error(restoreResult.error || 'Restore failed');
            }

            const recoveredGoals = restoreResult.goals || [];
            
            if (restoreResult.warnings) {
                warnings.push(...restoreResult.warnings);
            }

            return {
                success: true,
                strategy: RecoveryStrategy.LATEST_BACKUP,
                recoveredGoals,
                originalGoalCount: 0,
                recoveredGoalCount: recoveredGoals.length,
                lostGoalCount: 0,
                integrityReport: restoreResult.integrityReport,
                backupUsed: latestBackup,
                warnings,
                errors,
                duration: Date.now() - startTime
            };

        } catch (error) {
            return {
                success: false,
                strategy: RecoveryStrategy.LATEST_BACKUP,
                originalGoalCount: 0,
                recoveredGoalCount: 0,
                lostGoalCount: 0,
                warnings,
                errors: [...errors, String(error)],
                duration: Date.now() - startTime
            };
        }
    }
}