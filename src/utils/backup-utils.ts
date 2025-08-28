import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Goal } from '../models/goal';
import { StorageData } from '../models/storage';
import { WorkspaceManager } from '../services/workspace-manager';
import { StorageUtils } from './storage-utils';
import { createLogger } from './logger';

/**
 * Backup metadata interface
 */
export interface BackupMetadata {
    id: string;
    createdAt: Date;
    goalCount: number;
    taskCount: number;
    fileSize: number;
    checksum: string;
    extensionVersion: string;
    workspaceId?: string;
    trigger: BackupTrigger;
    description?: string;
}

/**
 * Backup triggers - what caused the backup
 */
export enum BackupTrigger {
    MANUAL = 'manual',
    AUTO_SAVE = 'auto-save',
    BEFORE_MAJOR_CHANGE = 'before-major-change',
    SCHEDULED = 'scheduled',
    RECOVERY_INITIATED = 'recovery-initiated',
    DATA_MIGRATION = 'data-migration',
    EXTENSION_UPDATE = 'extension-update'
}

/**
 * Backup rotation policy
 */
export interface BackupRotationPolicy {
    maxDailyBackups: number;
    maxWeeklyBackups: number;
    maxMonthlyBackups: number;
    retentionDays: number;
    deleteOrphaned: boolean;
}

/**
 * Backup file info
 */
export interface BackupFileInfo {
    path: vscode.Uri;
    metadata: BackupMetadata;
    isValid: boolean;
    errors?: string[];
}

/**
 * Backup utilities for managing backup files, rotation, and metadata
 */
export class BackupUtils {
    private static readonly logger = createLogger('BackupUtils');
    private static readonly BACKUP_EXTENSION = '.backup.json';
    private static readonly METADATA_EXTENSION = '.backup-meta.json';
    private static readonly MAX_BACKUP_FILENAME_LENGTH = 100;

    /**
     * Default backup rotation policy
     */
    static readonly DEFAULT_ROTATION_POLICY: BackupRotationPolicy = {
        maxDailyBackups: 5,
        maxWeeklyBackups: 4,
        maxMonthlyBackups: 6,
        retentionDays: 90,
        deleteOrphaned: true
    };

    /**
     * Generates a backup filename with timestamp and metadata
     */
    static generateBackupFilename(trigger: BackupTrigger, timestamp?: Date): string {
        const now = timestamp || new Date();
        const dateStr = now.toISOString().slice(0, 19).replace(/[:]/g, '-');
        const triggerStr = trigger.toLowerCase().replace(/_/g, '-');
        
        const filename = `goal-tree-${dateStr}-${triggerStr}${this.BACKUP_EXTENSION}`;
        
        // Ensure filename doesn't exceed limits
        if (filename.length > this.MAX_BACKUP_FILENAME_LENGTH) {
            const truncatedTrigger = triggerStr.slice(0, 10);
            return `goal-tree-${dateStr}-${truncatedTrigger}${this.BACKUP_EXTENSION}`;
        }
        
        return filename;
    }

    /**
     * Generates backup metadata filename
     */
    static generateMetadataFilename(backupFilename: string): string {
        const baseName = backupFilename.replace(this.BACKUP_EXTENSION, '');
        return baseName + this.METADATA_EXTENSION;
    }

    /**
     * Creates backup metadata object
     */
    static createBackupMetadata(
        goals: Goal[],
        trigger: BackupTrigger,
        extensionVersion: string,
        description?: string
    ): BackupMetadata {
        const stats = StorageUtils.calculateStorageStats(goals);
        
        return {
            id: this.generateBackupId(),
            createdAt: new Date(),
            goalCount: goals.length,
            taskCount: stats.taskCount,
            fileSize: 0, // Will be set after file creation
            checksum: StorageUtils.calculateChecksum(goals),
            extensionVersion,
            workspaceId: WorkspaceManager.getWorkspaceId(),
            trigger,
            description
        };
    }

    /**
     * Saves backup data and metadata to files
     */
    static async saveBackupWithMetadata(
        goals: Goal[],
        metadata: BackupMetadata,
        backupDir?: vscode.Uri
    ): Promise<{ backupPath: vscode.Uri; metadataPath: vscode.Uri; fileSize: number }> {
        const backupDirectory = backupDir || await this.getBackupDirectory();
        
        // Generate filenames
        const backupFilename = this.generateBackupFilename(metadata.trigger, metadata.createdAt);
        const metadataFilename = this.generateMetadataFilename(backupFilename);
        
        const backupPath = vscode.Uri.joinPath(backupDirectory, backupFilename);
        const metadataPath = vscode.Uri.joinPath(backupDirectory, metadataFilename);

        try {
            // Create backup data structure
            const storageData: StorageData = {
                version: StorageUtils.CURRENT_VERSION,
                lastSaved: metadata.createdAt,
                goals,
                metadata: {
                    saveCount: 1,
                    extensionVersion: metadata.extensionVersion,
                    workspaceId: metadata.workspaceId,
                    checksum: metadata.checksum
                }
            };

            // Write backup file
            const backupContent = JSON.stringify(storageData, null, 2);
            await fs.writeFile(backupPath.fsPath, backupContent, 'utf8');
            
            // Update metadata with actual file size
            const updatedMetadata = {
                ...metadata,
                fileSize: backupContent.length
            };
            
            // Write metadata file
            const metadataContent = JSON.stringify(updatedMetadata, null, 2);
            await fs.writeFile(metadataPath.fsPath, metadataContent, 'utf8');
            
            this.logger.debug(`Backup saved: ${backupFilename} (${backupContent.length} bytes)`);
            
            return {
                backupPath,
                metadataPath,
                fileSize: backupContent.length
            };
            
        } catch (error) {
            // Cleanup on error
            try {
                await fs.unlink(backupPath.fsPath).catch(() => {});
                await fs.unlink(metadataPath.fsPath).catch(() => {});
            } catch {
                // Ignore cleanup errors
            }
            throw new Error(`Failed to save backup: ${error}`);
        }
    }

    /**
     * Loads backup data from file
     */
    static async loadBackup(backupPath: vscode.Uri): Promise<{ goals: Goal[]; metadata?: BackupMetadata }> {
        try {
            const content = await fs.readFile(backupPath.fsPath, 'utf8');
            const data = JSON.parse(content);
            
            // Extract goals from storage format
            const extractResult = StorageUtils.extractGoalsFromStorage(data);
            if (!extractResult.success || !extractResult.data) {
                throw new Error(`Failed to extract goals: ${extractResult.errors.join(', ')}`);
            }
            
            // Try to load metadata
            let metadata: BackupMetadata | undefined;
            const metadataPath = this.getMetadataPathForBackup(backupPath);
            
            try {
                const metadataContent = await fs.readFile(metadataPath.fsPath, 'utf8');
                metadata = JSON.parse(metadataContent);
            } catch (error) {
                this.logger.warn(`Could not load backup metadata for ${backupPath.fsPath}: ${error}`);
            }
            
            return {
                goals: extractResult.data,
                metadata
            };
            
        } catch (error) {
            throw new Error(`Failed to load backup from ${backupPath.fsPath}: ${error}`);
        }
    }

    /**
     * Gets all available backups with metadata
     */
    static async listBackups(backupDir?: vscode.Uri): Promise<BackupFileInfo[]> {
        const backupDirectory = backupDir || await this.getBackupDirectory();
        const backups: BackupFileInfo[] = [];
        
        try {
            // Ensure backup directory exists
            await this.ensureBackupDirectory(backupDirectory);
            
            // Read directory contents
            const files = await fs.readdir(backupDirectory.fsPath);
            
            // Filter backup files
            const backupFiles = files.filter(file => file.endsWith(this.BACKUP_EXTENSION));
            
            for (const filename of backupFiles) {
                const backupPath = vscode.Uri.joinPath(backupDirectory, filename);
                const metadataPath = this.getMetadataPathForBackup(backupPath);
                
                let metadata: BackupMetadata | undefined;
                let isValid = true;
                const errors: string[] = [];
                
                // Try to load metadata
                try {
                    const metadataContent = await fs.readFile(metadataPath.fsPath, 'utf8');
                    metadata = JSON.parse(metadataContent);
                } catch (error) {
                    errors.push(`Missing or invalid metadata: ${error}`);
                    isValid = false;
                    
                    // Create minimal metadata from filename
                    metadata = this.extractMetadataFromFilename(filename);
                }
                
                // Validate backup file integrity
                try {
                    const stats = await fs.stat(backupPath.fsPath);
                    if (metadata && stats.size !== metadata.fileSize && metadata.fileSize > 0) {
                        errors.push(`File size mismatch: expected ${metadata.fileSize}, actual ${stats.size}`);
                        isValid = false;
                    }
                } catch (error) {
                    errors.push(`Cannot access backup file: ${error}`);
                    isValid = false;
                }
                
                if (metadata) {
                    backups.push({
                        path: backupPath,
                        metadata,
                        isValid,
                        errors: errors.length > 0 ? errors : undefined
                    });
                }
            }
            
            // Sort by creation date (newest first)
            backups.sort((a, b) => b.metadata.createdAt.getTime() - a.metadata.createdAt.getTime());
            
            return backups;
            
        } catch (error) {
            this.logger.error(`Failed to list backups from ${backupDirectory.fsPath}: ${error}`);
            return [];
        }
    }

    /**
     * Applies backup rotation policy to cleanup old backups
     */
    static async applyRotationPolicy(
        policy: BackupRotationPolicy = this.DEFAULT_ROTATION_POLICY,
        backupDir?: vscode.Uri
    ): Promise<{ deleted: number; kept: number; errors: string[] }> {
        const backups = await this.listBackups(backupDir);
        const now = new Date();
        const errors: string[] = [];
        let deleted = 0;
        let kept = 0;

        try {
            // Group backups by time period
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const weekStart = new Date(today.getTime() - (today.getDay() * 24 * 60 * 60 * 1000));
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            
            const dailyBackups: BackupFileInfo[] = [];
            const weeklyBackups: BackupFileInfo[] = [];
            const monthlyBackups: BackupFileInfo[] = [];
            const oldBackups: BackupFileInfo[] = [];
            
            for (const backup of backups) {
                const backupDate = new Date(backup.metadata.createdAt);
                const daysSinceBackup = Math.floor((now.getTime() - backupDate.getTime()) / (1000 * 60 * 60 * 24));
                
                if (daysSinceBackup > policy.retentionDays) {
                    oldBackups.push(backup);
                } else if (backupDate >= today) {
                    dailyBackups.push(backup);
                } else if (backupDate >= weekStart) {
                    weeklyBackups.push(backup);
                } else if (backupDate >= monthStart) {
                    monthlyBackups.push(backup);
                } else {
                    oldBackups.push(backup);
                }
            }
            
            // Apply rotation limits
            const toDelete: BackupFileInfo[] = [];
            
            // Keep only the newest backups in each category
            if (dailyBackups.length > policy.maxDailyBackups) {
                toDelete.push(...dailyBackups.slice(policy.maxDailyBackups));
            }
            
            if (weeklyBackups.length > policy.maxWeeklyBackups) {
                toDelete.push(...weeklyBackups.slice(policy.maxWeeklyBackups));
            }
            
            if (monthlyBackups.length > policy.maxMonthlyBackups) {
                toDelete.push(...monthlyBackups.slice(policy.maxMonthlyBackups));
            }
            
            // Add all old backups to deletion list
            toDelete.push(...oldBackups);
            
            // Delete invalid backups if policy allows
            if (policy.deleteOrphaned) {
                toDelete.push(...backups.filter(b => !b.isValid));
            }
            
            // Remove duplicates
            const uniqueToDelete = Array.from(new Map(toDelete.map(b => [b.path.fsPath, b])).values());
            
            // Perform deletions
            for (const backup of uniqueToDelete) {
                try {
                    await this.deleteBackup(backup.path);
                    deleted++;
                    this.logger.debug(`Deleted backup: ${path.basename(backup.path.fsPath)}`);
                } catch (error) {
                    errors.push(`Failed to delete ${backup.path.fsPath}: ${error}`);
                }
            }
            
            kept = backups.length - deleted;
            
            this.logger.info(`Backup rotation completed: deleted ${deleted}, kept ${kept} backups`);
            
        } catch (error) {
            errors.push(`Rotation policy execution failed: ${error}`);
        }
        
        return { deleted, kept, errors };
    }

    /**
     * Deletes a backup and its metadata
     */
    static async deleteBackup(backupPath: vscode.Uri): Promise<void> {
        const metadataPath = this.getMetadataPathForBackup(backupPath);
        
        // Delete backup file
        await fs.unlink(backupPath.fsPath);
        
        // Delete metadata file (ignore errors)
        try {
            await fs.unlink(metadataPath.fsPath);
        } catch {
            // Metadata might not exist or might already be deleted
        }
    }

    /**
     * Gets the backup directory path
     */
    static async getBackupDirectory(): Promise<vscode.Uri> {
        const workspaceDir = await WorkspaceManager.getStorageDirectory();
        if (!workspaceDir) {
            throw new Error('Cannot determine workspace storage directory');
        }
        
        return vscode.Uri.joinPath(workspaceDir, 'backups');
    }

    /**
     * Ensures the backup directory exists
     */
    static async ensureBackupDirectory(backupDir?: vscode.Uri): Promise<vscode.Uri> {
        const backupDirectory = backupDir || await this.getBackupDirectory();
        
        try {
            await fs.mkdir(backupDirectory.fsPath, { recursive: true });
        } catch (error) {
            throw new Error(`Failed to create backup directory ${backupDirectory.fsPath}: ${error}`);
        }
        
        return backupDirectory;
    }

    /**
     * Validates backup file integrity
     */
    static async validateBackupIntegrity(backupPath: vscode.Uri): Promise<{
        isValid: boolean;
        errors: string[];
        warnings: string[];
        metadata?: BackupMetadata;
        goalCount?: number;
    }> {
        const errors: string[] = [];
        const warnings: string[] = [];
        let metadata: BackupMetadata | undefined;
        let goalCount: number | undefined;

        try {
            // Load backup data
            const { goals, metadata: loadedMetadata } = await this.loadBackup(backupPath);
            metadata = loadedMetadata;
            goalCount = goals.length;

            // Verify metadata consistency
            if (metadata) {
                if (metadata.goalCount !== goals.length) {
                    errors.push(`Goal count mismatch: metadata shows ${metadata.goalCount}, actual ${goals.length}`);
                }

                // Verify checksum
                const actualChecksum = StorageUtils.calculateChecksum(goals);
                if (metadata.checksum !== actualChecksum) {
                    errors.push(`Checksum mismatch: expected ${metadata.checksum}, actual ${actualChecksum}`);
                }

                // Check file size
                try {
                    const stats = await fs.stat(backupPath.fsPath);
                    if (metadata.fileSize > 0 && Math.abs(stats.size - metadata.fileSize) > 100) {
                        warnings.push(`File size differs from metadata by ${Math.abs(stats.size - metadata.fileSize)} bytes`);
                    }
                } catch (error) {
                    errors.push(`Cannot verify file size: ${error}`);
                }
            } else {
                warnings.push('No metadata found for backup validation');
            }

            // Perform data integrity check
            const integrityResult = StorageUtils.performIntegrityCheck(goals);
            if (!integrityResult.isValid) {
                const errorIssues = integrityResult.issues.filter(i => i.type === 'error');
                if (errorIssues.length > 0) {
                    errors.push(`Data integrity errors: ${errorIssues.map(i => i.message).join(', ')}`);
                }
                
                const warningIssues = integrityResult.issues.filter(i => i.type === 'warning');
                if (warningIssues.length > 0) {
                    warnings.push(`Data integrity warnings: ${warningIssues.map(i => i.message).join(', ')}`);
                }
            }

        } catch (error) {
            errors.push(`Failed to validate backup: ${error}`);
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            metadata,
            goalCount
        };
    }

    /**
     * Gets available backup space information
     */
    static async getBackupSpaceInfo(): Promise<{
        backupCount: number;
        totalSize: number;
        oldestBackup?: Date;
        newestBackup?: Date;
        availableSpace?: number;
    }> {
        try {
            const backups = await this.listBackups();
            let totalSize = 0;
            let oldestBackup: Date | undefined;
            let newestBackup: Date | undefined;

            for (const backup of backups) {
                totalSize += backup.metadata.fileSize || 0;

                const backupDate = new Date(backup.metadata.createdAt);
                if (!oldestBackup || backupDate < oldestBackup) {
                    oldestBackup = backupDate;
                }
                if (!newestBackup || backupDate > newestBackup) {
                    newestBackup = backupDate;
                }
            }

            // Try to get available disk space (may not work on all systems)
            let availableSpace: number | undefined;
            try {
                const backupDir = await this.getBackupDirectory();
                // Note: fs.statfs is not available in Node.js, fallback to undefined
                const stats = undefined;
                if (stats && 'available' in stats) {
                    availableSpace = (stats as any).available;
                }
            } catch {
                // Ignore errors getting disk space
            }

            return {
                backupCount: backups.length,
                totalSize,
                oldestBackup,
                newestBackup,
                availableSpace
            };

        } catch (error) {
            this.logger.error(`Failed to get backup space info: ${error}`);
            return {
                backupCount: 0,
                totalSize: 0
            };
        }
    }

    // Private helper methods

    private static generateBackupId(): string {
        return `backup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private static getMetadataPathForBackup(backupPath: vscode.Uri): vscode.Uri {
        const backupFilename = path.basename(backupPath.fsPath);
        const metadataFilename = this.generateMetadataFilename(backupFilename);
        return vscode.Uri.joinPath(vscode.Uri.file(path.dirname(backupPath.fsPath)), metadataFilename);
    }

    private static extractMetadataFromFilename(filename: string): BackupMetadata {
        // Extract date and trigger from filename
        // Format: goal-tree-YYYY-MM-DDTHH-MM-SS-trigger.backup.json
        const parts = filename.replace(this.BACKUP_EXTENSION, '').split('-');
        
        let createdAt = new Date();
        let trigger = BackupTrigger.MANUAL;
        
        try {
            if (parts.length >= 7) {
                // Parse date: YYYY-MM-DDTHH-MM-SS
                const dateStr = parts.slice(2, 8).join('-').replace(/-/g, ':').replace(/T/, 'T').slice(0, 19) + 'Z';
                createdAt = new Date(dateStr);
                
                // Extract trigger
                if (parts.length > 8) {
                    const triggerStr = parts.slice(8).join('-').toUpperCase().replace(/-/g, '_');
                    if (Object.values(BackupTrigger).includes(triggerStr as BackupTrigger)) {
                        trigger = triggerStr as BackupTrigger;
                    }
                }
            }
        } catch (error) {
            this.logger.warn(`Failed to parse backup filename ${filename}: ${error}`);
        }
        
        return {
            id: this.generateBackupId(),
            createdAt,
            goalCount: 0,
            taskCount: 0,
            fileSize: 0,
            checksum: '',
            extensionVersion: 'unknown',
            trigger,
            description: 'Metadata extracted from filename'
        };
    }
}