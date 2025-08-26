import * as vscode from 'vscode';
import { Goal } from '../models/goal';
import { StorageOperationResult } from '../models/storage';
import { WorkspaceManager } from './workspace-manager';
import { BackupUtils, BackupMetadata, BackupTrigger, BackupRotationPolicy, BackupFileInfo } from '../utils/backup-utils';
import { IntegrityChecker, ComprehensiveIntegrityResult } from './integrity-checker';
import { createLogger } from '../utils/logger';

/**
 * Backup creation options
 */
export interface BackupOptions {
    trigger: BackupTrigger;
    description?: string;
    validateIntegrity?: boolean;
    applyRotation?: boolean;
    customMetadata?: Record<string, any>;
}

/**
 * Backup schedule configuration
 */
export interface BackupSchedule {
    enabled: boolean;
    intervalMinutes: number;
    maxDailyBackups: number;
    onlyOnChanges: boolean;
    retentionDays: number;
}

/**
 * Backup restoration options
 */
export interface RestoreOptions {
    validateBeforeRestore?: boolean;
    createBackupBeforeRestore?: boolean;
    repairCorruption?: boolean;
    skipValidation?: boolean;
}

/**
 * Backup service result
 */
export interface BackupServiceResult extends StorageOperationResult {
    backupId?: string;
    backupPath?: vscode.Uri;
    metadata?: BackupMetadata;
    integrityReport?: ComprehensiveIntegrityResult;
}

/**
 * BackupService provides comprehensive backup management including
 * scheduled backups, integrity validation, rotation policies, and restoration.
 */
export class BackupService {
    private context: vscode.ExtensionContext;
    private isInitialized = false;
    private logger = createLogger('BackupService');
    private scheduleTimer?: NodeJS.Timeout;
    private lastBackupHash?: string;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Initializes the backup service and starts scheduled backups if enabled
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            // Ensure backup directory exists
            await BackupUtils.ensureBackupDirectory();

            // Load and apply rotation policy on startup
            await this.applyRotationPolicy();

            // Start scheduled backups if enabled
            const schedule = await this.getBackupSchedule();
            if (schedule.enabled) {
                this.startScheduledBackups(schedule);
            }

            this.isInitialized = true;
            this.logger.info('BackupService initialized successfully');

        } catch (error) {
            this.logger.error('Failed to initialize BackupService', error);
            throw error;
        }
    }

    /**
     * Creates a manual backup with optional integrity validation
     */
    async createBackup(
        goals: Goal[],
        options: BackupOptions = { trigger: BackupTrigger.MANUAL }
    ): Promise<BackupServiceResult> {
        await this.ensureInitialized();
        
        const startTime = Date.now();
        
        try {
            this.logger.debug(`Creating backup with trigger: ${options.trigger}`);

            // Validate integrity before backup if requested
            let integrityReport: ComprehensiveIntegrityResult | undefined;
            if (options.validateIntegrity) {
                integrityReport = await IntegrityChecker.performComprehensiveCheck(goals);
                
                if (!integrityReport.isHealthy) {
                    this.logger.warn(`Creating backup with ${integrityReport.criticalIssues} critical issues`);
                }
            }

            // Create backup metadata
            const metadata = BackupUtils.createBackupMetadata(
                goals,
                options.trigger,
                this.getExtensionVersion(),
                options.description
            );

            // Add custom metadata if provided
            if (options.customMetadata) {
                (metadata as any).custom = options.customMetadata;
            }

            // Save backup and metadata
            const { backupPath, metadataPath, fileSize } = await BackupUtils.saveBackupWithMetadata(goals, metadata);

            // Update metadata with actual file size
            metadata.fileSize = fileSize;

            // Apply rotation policy if requested
            if (options.applyRotation) {
                await this.applyRotationPolicy();
            }

            // Update last backup hash for change detection
            this.lastBackupHash = metadata.checksum;

            const duration = Date.now() - startTime;
            this.logger.info(`Backup created successfully: ${metadata.id} (${fileSize} bytes, ${duration}ms)`);

            return {
                success: true,
                operation: 'backup',
                dataSize: fileSize,
                duration,
                backupId: metadata.id,
                backupPath,
                metadata,
                integrityReport
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            this.logger.error('Failed to create backup', error);

            return {
                success: false,
                operation: 'backup',
                error: error instanceof Error ? error.message : String(error),
                dataSize: 0,
                duration
            };
        }
    }

    /**
     * Lists all available backups with their metadata and validation status
     */
    async listBackups(): Promise<{
        backups: BackupFileInfo[];
        statistics: {
            total: number;
            valid: number;
            invalid: number;
            totalSize: number;
            oldestDate?: Date;
            newestDate?: Date;
        };
    }> {
        await this.ensureInitialized();

        try {
            const backups = await BackupUtils.listBackups();
            
            let totalSize = 0;
            let validCount = 0;
            let invalidCount = 0;
            let oldestDate: Date | undefined;
            let newestDate: Date | undefined;

            for (const backup of backups) {
                totalSize += backup.metadata.fileSize;
                
                if (backup.isValid) {
                    validCount++;
                } else {
                    invalidCount++;
                }

                const backupDate = new Date(backup.metadata.createdAt);
                if (!oldestDate || backupDate < oldestDate) {
                    oldestDate = backupDate;
                }
                if (!newestDate || backupDate > newestDate) {
                    newestDate = backupDate;
                }
            }

            return {
                backups,
                statistics: {
                    total: backups.length,
                    valid: validCount,
                    invalid: invalidCount,
                    totalSize,
                    oldestDate,
                    newestDate
                }
            };

        } catch (error) {
            this.logger.error('Failed to list backups', error);
            return {
                backups: [],
                statistics: {
                    total: 0,
                    valid: 0,
                    invalid: 0,
                    totalSize: 0
                }
            };
        }
    }

    /**
     * Restores goals from a specific backup
     */
    async restoreFromBackup(
        backupPath: vscode.Uri,
        options: RestoreOptions = {}
    ): Promise<{
        success: boolean;
        goals?: Goal[];
        metadata?: BackupMetadata;
        integrityReport?: ComprehensiveIntegrityResult;
        error?: string;
        warnings?: string[];
    }> {
        await this.ensureInitialized();

        const warnings: string[] = [];

        try {
            this.logger.info(`Restoring from backup: ${backupPath.fsPath}`);

            // Validate backup integrity first if requested
            if (options.validateBeforeRestore && !options.skipValidation) {
                const validation = await BackupUtils.validateBackupIntegrity(backupPath);
                
                if (!validation.isValid) {
                    if (options.repairCorruption && validation.goalCount && validation.goalCount > 0) {
                        warnings.push('Backup has integrity issues but contains recoverable data');
                    } else {
                        return {
                            success: false,
                            error: `Backup validation failed: ${validation.errors.join(', ')}`
                        };
                    }
                }

                if (validation.warnings.length > 0) {
                    warnings.push(...validation.warnings);
                }
            }

            // Load backup data
            const { goals, metadata } = await BackupUtils.loadBackup(backupPath);

            if (!goals || goals.length === 0) {
                return {
                    success: false,
                    error: 'Backup contains no goal data'
                };
            }

            // Perform integrity check on restored data
            let integrityReport: ComprehensiveIntegrityResult | undefined;
            if (!options.skipValidation) {
                integrityReport = await IntegrityChecker.performComprehensiveCheck(goals);

                // Attempt automatic repair if corruption is detected and repair is enabled
                if (options.repairCorruption && !integrityReport.isHealthy && integrityReport.autoRepairableIssues > 0) {
                    this.logger.info(`Attempting to repair ${integrityReport.autoRepairableIssues} issues in restored data`);
                    
                    const repairResult = await IntegrityChecker.performAutoRepair(
                        goals,
                        integrityReport.issues.filter(i => i.autoRepairable),
                        false // Don't create backup during restoration
                    );

                    if (repairResult.success && repairResult.repairedCount > 0) {
                        warnings.push(`Automatically repaired ${repairResult.repairedCount} data issues`);
                        
                        // Re-check integrity after repair
                        integrityReport = await IntegrityChecker.performComprehensiveCheck(repairResult.modifiedGoals);
                        
                        this.logger.info(`Restoration completed successfully with ${warnings.length} warnings`);
                        
                        return {
                            success: true,
                            goals: repairResult.modifiedGoals,
                            metadata,
                            integrityReport,
                            warnings: warnings.length > 0 ? warnings : undefined
                        };
                    }
                }

                if (!integrityReport.isHealthy && integrityReport.criticalIssues > 0) {
                    warnings.push(`Restored data has ${integrityReport.criticalIssues} critical integrity issues`);
                }
            }

            this.logger.info(`Restoration completed successfully with ${warnings.length} warnings`);

            return {
                success: true,
                goals,
                metadata,
                integrityReport,
                warnings: warnings.length > 0 ? warnings : undefined
            };

        } catch (error) {
            this.logger.error('Failed to restore from backup', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                warnings: warnings.length > 0 ? warnings : undefined
            };
        }
    }

    /**
     * Applies backup rotation policy to clean up old backups
     */
    async applyRotationPolicy(customPolicy?: BackupRotationPolicy): Promise<{
        deleted: number;
        kept: number;
        errors: string[];
    }> {
        await this.ensureInitialized();

        try {
            const policy = customPolicy || await this.getRotationPolicy();
            const result = await BackupUtils.applyRotationPolicy(policy);

            this.logger.info(`Rotation policy applied: deleted ${result.deleted}, kept ${result.kept} backups`);

            if (result.errors.length > 0) {
                this.logger.warn(`Rotation policy had ${result.errors.length} errors`, result.errors);
            }

            return result;

        } catch (error) {
            this.logger.error('Failed to apply rotation policy', error);
            return {
                deleted: 0,
                kept: 0,
                errors: [String(error)]
            };
        }
    }

    /**
     * Validates all backup files for integrity
     */
    async validateAllBackups(): Promise<{
        totalBackups: number;
        validBackups: number;
        invalidBackups: number;
        corruptedBackups: BackupFileInfo[];
        repairableBackups: BackupFileInfo[];
        issues: string[];
    }> {
        await this.ensureInitialized();

        return await IntegrityChecker.validateBackupFiles();
    }

    /**
     * Gets backup space usage information
     */
    async getBackupSpaceInfo(): Promise<{
        backupCount: number;
        totalSize: number;
        formattedSize: string;
        oldestBackup?: Date;
        newestBackup?: Date;
        averageBackupSize: number;
        availableSpace?: number;
        recommendations: string[];
    }> {
        await this.ensureInitialized();

        const spaceInfo = await BackupUtils.getBackupSpaceInfo();
        const recommendations: string[] = [];

        // Generate recommendations
        if (spaceInfo.backupCount > 20) {
            recommendations.push('Consider reducing backup retention period - you have many backups');
        }

        if (spaceInfo.totalSize > 100 * 1024 * 1024) { // > 100MB
            recommendations.push('Backup storage is using significant space - consider cleanup');
        }

        if (spaceInfo.availableSpace && spaceInfo.availableSpace < 500 * 1024 * 1024) { // < 500MB
            recommendations.push('Low disk space detected - backup operations may fail');
        }

        if (spaceInfo.backupCount === 0) {
            recommendations.push('No backups found - consider creating a backup');
        }

        const averageSize = spaceInfo.backupCount > 0 ? spaceInfo.totalSize / spaceInfo.backupCount : 0;

        return {
            ...spaceInfo,
            formattedSize: this.formatBytes(spaceInfo.totalSize),
            averageBackupSize: averageSize,
            recommendations
        };
    }

    /**
     * Creates a backup before major operations (if data has changed)
     */
    async createPreOperationBackup(goals: Goal[], operationDescription: string): Promise<BackupServiceResult> {
        const currentHash = require('crypto')
            .createHash('md5')
            .update(JSON.stringify(goals))
            .digest('hex');

        // Only create backup if data has changed since last backup
        if (this.lastBackupHash !== currentHash) {
            return await this.createBackup(goals, {
                trigger: BackupTrigger.BEFORE_MAJOR_CHANGE,
                description: `Before ${operationDescription}`,
                validateIntegrity: true,
                applyRotation: false
            });
        }

        return {
            success: true,
            operation: 'backup',
            dataSize: 0,
            duration: 0
        };
    }

    /**
     * Configures backup schedule
     */
    async configureSchedule(schedule: BackupSchedule): Promise<void> {
        await this.ensureInitialized();

        // Store schedule in extension context
        await this.context.workspaceState.update('backupSchedule', schedule);

        // Restart scheduling
        this.stopScheduledBackups();
        if (schedule.enabled) {
            this.startScheduledBackups(schedule);
        }

        this.logger.info(`Backup schedule ${schedule.enabled ? 'enabled' : 'disabled'}: every ${schedule.intervalMinutes} minutes`);
    }

    /**
     * Gets current backup schedule
     */
    async getBackupSchedule(): Promise<BackupSchedule> {
        const defaultSchedule: BackupSchedule = {
            enabled: false,
            intervalMinutes: 60, // Every hour
            maxDailyBackups: 24,
            onlyOnChanges: true,
            retentionDays: 30
        };

        const stored = this.context.workspaceState.get<BackupSchedule>('backupSchedule');
        return stored ? { ...defaultSchedule, ...stored } : defaultSchedule;
    }

    /**
     * Cleanup resources and stop scheduled backups
     */
    async cleanup(): Promise<void> {
        this.stopScheduledBackups();
        this.logger.debug('BackupService cleanup completed');
    }

    // Private methods

    private async ensureInitialized(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }
    }

    private async getRotationPolicy(): Promise<BackupRotationPolicy> {
        // Could be made configurable in the future
        return BackupUtils.DEFAULT_ROTATION_POLICY;
    }

    private getExtensionVersion(): string {
        return this.context.extension?.packageJSON?.version || '1.0.0';
    }

    private startScheduledBackups(schedule: BackupSchedule): void {
        this.stopScheduledBackups();

        this.scheduleTimer = setInterval(async () => {
            try {
                // Only create backup if there are recent changes (if configured)
                if (schedule.onlyOnChanges) {
                    // This would need to be coordinated with the storage service
                    // to check if data has changed since last backup
                    this.logger.debug('Scheduled backup check - change detection needed');
                    // Implementation would depend on change tracking from Stream D
                }

                this.logger.debug('Creating scheduled backup');
                
                // This would need goals from the storage service
                // For now, we'll just log that scheduling is active
                this.logger.info('Scheduled backup would be created here');

            } catch (error) {
                this.logger.error('Scheduled backup failed', error);
            }
        }, schedule.intervalMinutes * 60 * 1000);

        this.logger.info(`Scheduled backups started: every ${schedule.intervalMinutes} minutes`);
    }

    private stopScheduledBackups(): void {
        if (this.scheduleTimer) {
            clearInterval(this.scheduleTimer);
            this.scheduleTimer = undefined;
            this.logger.debug('Scheduled backups stopped');
        }
    }

    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}