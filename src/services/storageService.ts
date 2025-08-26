import * as vscode from 'vscode';
import { Goal, StorageData } from '../models';
import { StorageOperationResult } from '../models/storage';
import { ValidationService, ValidationUtils } from '../validation';
import { WorkspaceManager } from './workspace-manager';
import { FileOperations, FileOperationResult, WriteOptions, ReadOptions } from './file-operations';
import { LockManager, LockType } from './lock-manager';
import { StorageUtils, IntegrityCheckResult, StorageStats } from '../utils/storage-utils';
import { createLogger } from '../utils/logger';

/**
 * Enhanced StorageService handles persistence of goal data using workspace file storage.
 * Features workspace isolation, atomic operations, concurrent access protection, and data validation.
 * 
 * Stream C Implementation:
 * - File-based storage in .vscode/goal-tree.json
 * - Integration with Stream B validation system
 * - Concurrent access protection via LockManager
 * - Atomic file operations with error recovery
 * - Comprehensive data integrity checks
 */
export class StorageService {
    private context: vscode.ExtensionContext;
    private isInitialized = false;
    private lastSaveTime: Date | undefined;
    private logger = createLogger('StorageService');
    
    // Legacy keys for migration from workspace state storage
    private readonly LEGACY_STORAGE_KEY = 'goalTreeData';
    private readonly LEGACY_BACKUP_KEY = 'goalTreeDataBackup';

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }
    
    /**
     * Initializes the storage service and performs workspace validation
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }
        
        const validation = await WorkspaceManager.validateWorkspaceForStorage();
        if (!validation.isReady) {
            throw new Error(`Storage initialization failed: ${validation.issues.join(', ')}`);
        }
        
        // Check for legacy data migration
        await this.migrateLegacyData();
        
        this.isInitialized = true;
        this.logger.info('StorageService initialized successfully');
    }

    /**
     * Loads all goals from workspace file storage with validation
     */
    async loadGoals(options: ReadOptions = {}): Promise<Goal[]> {
        await this.ensureInitialized();
        
        return await LockManager.withLock(
            LockType.READ,
            'Load goals from storage',
            async () => {
                try {
                    this.logger.debug('Loading goals from workspace storage');
                    
                    // Read storage file
                    const readResult = await FileOperations.readStorageFile<StorageData>({
                        fallbackToBackup: true,
                        validateJson: true,
                        ...options
                    });
                    
                    if (!readResult.success || !readResult.data) {
                        this.logger.warn('No storage data found, starting with empty goal list');
                        return [];
                    }
                    
                    // Extract goals from storage format
                    const extractResult = StorageUtils.extractGoalsFromStorage(readResult.data);
                    if (!extractResult.success || !extractResult.data) {
                        this.logger.error('Failed to extract goals from storage data', extractResult.errors);
                        return [];
                    }
                    
                    let goals = extractResult.data;
                    
                    // Validate data with Stream B validation system
                    const validationResult = ValidationService.validateDataSet(goals, {
                        strict: false,
                        checkHierarchy: true,
                        checkConsistency: true,
                        migrateIfNeeded: true
                    });
                    
                    if (validationResult.isValid && validationResult.data) {
                        goals = validationResult.data;
                    } else {
                        this.logger.warn('Data validation issues found', validationResult.errors);
                        // Continue with original data but log warnings
                    }
                    
                    // Perform integrity check
                    const integrityCheck = StorageUtils.performIntegrityCheck(goals);
                    if (!integrityCheck.isValid) {
                        this.logger.warn('Data integrity issues detected', integrityCheck.issues);
                    }
                    
                    this.logger.info(`Successfully loaded ${goals.length} goals from storage`);
                    return goals;
                    
                } catch (error) {
                    this.logger.error('Unexpected error loading goals', error);
                    return [];
                }
            }
        );
    }

    /**
     * Saves goals to workspace file storage with validation and backup
     */
    async saveGoals(goals: Goal[], options: WriteOptions = {}): Promise<StorageOperationResult> {
        await this.ensureInitialized();
        
        const startTime = Date.now();
        
        return await LockManager.withLock(
            LockType.WRITE,
            'Save goals to storage',
            async () => {
                try {
                    this.logger.debug(`Saving ${goals.length} goals to workspace storage`);
                    
                    // Validate and optimize goals before saving
                    const optimizeResult = StorageUtils.optimizeForStorage(goals);
                    if (!optimizeResult.success || !optimizeResult.data) {
                        throw new Error(`Data optimization failed: ${optimizeResult.errors.join(', ')}`);
                    }
                    
                    const optimizedGoals = optimizeResult.data;
                    
                    // Validate using Stream B validation system
                    const validationResult = ValidationService.validateDataSet(optimizedGoals, {
                        strict: false,
                        checkHierarchy: true,
                        checkConsistency: true,
                        migrateIfNeeded: true
                    });
                    
                    if (!validationResult.isValid || !validationResult.data) {
                        throw new Error(`Validation failed: ${validationResult.errors?.map((e: any) => e.message).join(', ')}`);
                    }
                    
                    // Create proper StorageData structure
                    const existingSaveCount = await this.getSaveCount();
                    const storageData: StorageData = {
                        version: StorageUtils.CURRENT_VERSION,
                        lastSaved: new Date(),
                        goals: validationResult.data,
                        metadata: {
                            saveCount: existingSaveCount + 1,
                            extensionVersion: this.getExtensionVersion(),
                            workspaceId: WorkspaceManager.getWorkspaceId(),
                            checksum: StorageUtils.calculateChecksum(validationResult.data)
                        }
                    };
                    
                    // Write to file with atomic operations
                    const writeResult = await FileOperations.writeStorageFile(storageData, {
                        createBackup: true,
                        validateJson: true,
                        atomic: true,
                        ...options
                    });
                    
                    if (!writeResult.success) {
                        throw new Error(`File write failed: ${writeResult.error?.message}`);
                    }
                    
                    this.lastSaveTime = new Date();
                    
                    const duration = Date.now() - startTime;
                    this.logger.info(`Successfully saved ${goals.length} goals to storage in ${duration}ms`);
                    
                    return {
                        success: true,
                        operation: 'save',
                        dataSize: writeResult.metadata?.fileSize || 0,
                        duration
                    };
                    
                } catch (error) {
                    const duration = Date.now() - startTime;
                    this.logger.error('Failed to save goals', error);
                    
                    return {
                        success: false,
                        error: error instanceof Error ? error.message : String(error),
                        operation: 'save',
                        dataSize: 0,
                        duration
                    };
                }
            }
        );
    }

    /**
     * Creates a backup of current goal data using file operations
     */
    async createBackup(): Promise<StorageOperationResult> {
        await this.ensureInitialized();
        
        const startTime = Date.now();
        
        try {
            this.logger.debug('Creating backup of current storage');
            
            const backupResult = await FileOperations.createBackup();
            
            if (!backupResult.success) {
                throw new Error(`Backup creation failed: ${backupResult.error?.message}`);
            }
            
            const duration = Date.now() - startTime;
            this.logger.info(`Backup created successfully in ${duration}ms`);
            
            return {
                success: true,
                operation: 'backup',
                dataSize: 0,
                duration
            };
            
        } catch (error) {
            const duration = Date.now() - startTime;
            this.logger.error('Failed to create backup', error);
            
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                operation: 'backup',
                dataSize: 0,
                duration
            };
        }
    }

    /**
     * Recovers goals from backup file
     */
    async recoverFromBackup(): Promise<Goal[]> {
        await this.ensureInitialized();
        
        try {
            this.logger.info('Attempting to recover goals from backup');
            
            const backupExists = await WorkspaceManager.backupFileExists();
            if (!backupExists) {
                this.logger.warn('No backup file found for recovery');
                return [];
            }
            
            // Load backup using read operation (which handles backup fallback)
            const goals = await this.loadGoals({ fallbackToBackup: true });
            this.logger.info(`Successfully recovered ${goals.length} goals from backup`);
            
            return goals;
            
        } catch (error) {
            this.logger.error('Failed to recover from backup', error);
            return [];
        }
    }

    /**
     * Exports goals to JSON for external backup
     */
    async exportGoals(): Promise<string> {
        await this.ensureInitialized();
        
        const goals = await this.loadGoals();
        const stats = StorageUtils.calculateStorageStats(goals);
        
        return JSON.stringify({
            version: StorageUtils.CURRENT_VERSION,
            exportedAt: new Date().toISOString(),
            sourceVersion: this.getExtensionVersion(),
            goals,
            statistics: stats,
            checksum: StorageUtils.calculateChecksum(goals)
        }, null, 2);
    }

    /**
     * Imports goals from JSON with comprehensive validation
     */
    async importGoals(jsonData: string, overwrite: boolean = false): Promise<{ imported: number; errors: string[]; warnings: string[] }> {
        await this.ensureInitialized();
        
        const errors: string[] = [];
        const warnings: string[] = [];
        let imported = 0;

        try {
            this.logger.debug(`Importing goals data, overwrite: ${overwrite}`);
            
            // Use Stream B validation for import
            const importResult = ValidationService.importData(jsonData);
            
            if (!importResult.isValid || !importResult.data) {
                errors.push(...importResult.errors.map(e => e.message));
                return { imported: 0, errors, warnings };
            }
            
            const importGoals = importResult.data;
            const currentGoals = overwrite ? [] : await this.loadGoals();
            
            // Check for ID conflicts if not overwriting
            let validImportGoals = importGoals;
            if (!overwrite) {
                const existingIds = new Set(currentGoals.map(g => g.id));
                validImportGoals = importGoals.filter(goal => {
                    if (existingIds.has(goal.id)) {
                        warnings.push(`Goal with ID ${goal.id} already exists, skipping`);
                        return false;
                    }
                    return true;
                });
            }
            
            const mergedGoals = overwrite ? validImportGoals : [...currentGoals, ...validImportGoals];
            
            // Save with validation
            const saveResult = await this.saveGoals(mergedGoals);
            
            if (!saveResult.success) {
                errors.push(`Failed to save imported goals: ${saveResult.error}`);
                return { imported: 0, errors, warnings };
            }
            
            imported = validImportGoals.length;
            this.logger.info(`Successfully imported ${imported} goals`);

        } catch (error) {
            errors.push(`Import failed: ${error}`);
        }

        return { imported, errors, warnings };
    }

    /**
     * Clears all goal data (with backup)
     */
    async clearAllData(): Promise<StorageOperationResult> {
        await this.ensureInitialized();
        
        const startTime = Date.now();
        
        return await LockManager.withLock(
            LockType.WRITE,
            'Clear all data',
            async () => {
                try {
                    this.logger.info('Clearing all goal data');
                    
                    // Create backup first
                    const backupResult = await this.createBackup();
                    if (!backupResult.success) {
                        this.logger.warn('Backup creation failed before clearing data');
                    }
                    
                    // Delete storage file
                    const deleteResult = await FileOperations.deleteStorageFile(false); // Backup already created
                    
                    if (!deleteResult.success) {
                        throw new Error(`Failed to delete storage file: ${deleteResult.error?.message}`);
                    }
                    
                    this.lastSaveTime = undefined;
                    
                    const duration = Date.now() - startTime;
                    this.logger.info(`All data cleared successfully in ${duration}ms`);
                    
                    return {
                        success: true,
                        operation: 'save',
                        dataSize: 0,
                        duration
                    };
                    
                } catch (error) {
                    const duration = Date.now() - startTime;
                    this.logger.error('Failed to clear data', error);
                    
                    return {
                        success: false,
                        error: error instanceof Error ? error.message : String(error),
                        operation: 'save',
                        dataSize: 0,
                        duration
                    };
                }
            }
        );
    }

    /**
     * Gets comprehensive storage statistics
     */
    async getStorageInfo(): Promise<{
        goalCount: number;
        taskCount: number;
        fileSize: number;
        lastSaved?: Date;
        lastBackup?: Date;
        storageStats: StorageStats;
        workspaceId?: string;
        fileExists: boolean;
        backupExists: boolean;
    }> {
        await this.ensureInitialized();
        
        try {
            const goals = await this.loadGoals();
            const fileInfo = await WorkspaceManager.getStorageFileInfo();
            const backupExists = await WorkspaceManager.backupFileExists();
            const storageStats = StorageUtils.calculateStorageStats(goals, fileInfo.size);
            
            let taskCount = 0;
            for (const goal of goals) {
                if (goal.tasks) {
                    taskCount += goal.tasks.length;
                }
            }
            
            return {
                goalCount: goals.length,
                taskCount,
                fileSize: fileInfo.size || 0,
                lastSaved: this.lastSaveTime || fileInfo.lastModified,
                storageStats,
                workspaceId: WorkspaceManager.getWorkspaceId(),
                fileExists: fileInfo.exists,
                backupExists
            };
            
        } catch (error) {
            this.logger.error('Failed to get storage info', error);
            return {
                goalCount: 0,
                taskCount: 0,
                fileSize: 0,
                storageStats: StorageUtils.calculateStorageStats([]),
                fileExists: false,
                backupExists: false
            };
        }
    }

    /**
     * Performs comprehensive data integrity check
     */
    async performIntegrityCheck(): Promise<IntegrityCheckResult> {
        await this.ensureInitialized();
        
        try {
            const goals = await this.loadGoals();
            return StorageUtils.performIntegrityCheck(goals);
        } catch (error) {
            this.logger.error('Failed to perform integrity check', error);
            return {
                isValid: false,
                issues: [{
                    type: 'error',
                    field: 'system',
                    message: `Integrity check failed: ${error}`
                }],
                summary: {
                    totalGoals: 0,
                    validGoals: 0,
                    totalTasks: 0,
                    validTasks: 0,
                    orphanedGoals: 0,
                    circularDependencies: []
                }
            };
        }
    }
    
    /**
     * Gets current lock information for debugging
     */
    getLockInfo() {
        const workspaceId = WorkspaceManager.getWorkspaceId();
        return {
            currentLocks: LockManager.getLockInfo(workspaceId),
            isReadLocked: LockManager.isLocked(LockType.READ, workspaceId),
            isWriteLocked: LockManager.isLocked(LockType.WRITE, workspaceId),
            statistics: LockManager.getStatistics()
        };
    }
    
    /**
     * Cleanup resources and temporary files
     */
    async cleanup(): Promise<void> {
        try {
            // Cleanup temp files
            await FileOperations.cleanup();
            
            // Release any workspace-specific locks
            const workspaceId = WorkspaceManager.getWorkspaceId();
            if (workspaceId) {
                LockManager.releaseWorkspaceLocks(workspaceId);
            }
            
            this.logger.debug('Storage service cleanup completed');
        } catch (error) {
            this.logger.error('Error during cleanup', error);
        }
    }
    
    // Private helper methods
    
    /**
     * Ensures the storage service is initialized
     */
    private async ensureInitialized(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }
    }
    
    /**
     * Gets the current save count from existing storage
     */
    private async getSaveCount(): Promise<number> {
        try {
            const readResult = await FileOperations.readStorageFile<StorageData>();
            if (readResult.success && readResult.data?.metadata?.saveCount) {
                return readResult.data.metadata.saveCount;
            }
        } catch {
            // Ignore errors, return 0
        }
        return 0;
    }
    
    /**
     * Gets the current extension version
     */
    private getExtensionVersion(): string {
        return this.context.extension?.packageJSON?.version || '1.0.0';
    }
    
    /**
     * Migrates legacy data from workspace state to file storage
     */
    private async migrateLegacyData(): Promise<void> {
        try {
            // Check if file storage already exists
            const fileExists = await WorkspaceManager.storageFileExists();
            if (fileExists) {
                return; // Already migrated
            }
            
            // Check for legacy workspace state data
            const legacyData = this.context.workspaceState.get<Goal[]>(this.LEGACY_STORAGE_KEY);
            if (legacyData && Array.isArray(legacyData) && legacyData.length > 0) {
                this.logger.info(`Migrating ${legacyData.length} goals from legacy storage`);
                
                // Save to new file format
                const saveResult = await this.saveGoals(legacyData);
                if (saveResult.success) {
                    // Clear legacy data
                    await this.context.workspaceState.update(this.LEGACY_STORAGE_KEY, undefined);
                    await this.context.workspaceState.update(this.LEGACY_BACKUP_KEY, undefined);
                    this.logger.info('Legacy data migration completed successfully');
                }
            }
        } catch (error) {
            this.logger.error('Failed to migrate legacy data', error);
        }
    }
}