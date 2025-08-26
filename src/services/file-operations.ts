import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { WorkspaceManager } from './workspace-manager';

/**
 * File operation error types
 */
export enum FileOperationErrorType {
    NO_WORKSPACE = 'NO_WORKSPACE',
    PERMISSION_DENIED = 'PERMISSION_DENIED',
    FILE_NOT_FOUND = 'FILE_NOT_FOUND',
    INVALID_JSON = 'INVALID_JSON',
    WRITE_FAILED = 'WRITE_FAILED',
    READ_FAILED = 'READ_FAILED',
    BACKUP_FAILED = 'BACKUP_FAILED',
    ATOMIC_WRITE_FAILED = 'ATOMIC_WRITE_FAILED',
    CLEANUP_FAILED = 'CLEANUP_FAILED',
    CORRUPTION_DETECTED = 'CORRUPTION_DETECTED'
}

/**
 * File operation error class
 */
export class FileOperationError extends Error {
    constructor(
        public type: FileOperationErrorType,
        message: string,
        public originalError?: unknown
    ) {
        super(message);
        this.name = 'FileOperationError';
    }
}

/**
 * File operation result interface
 */
export interface FileOperationResult<T = any> {
    success: boolean;
    data?: T;
    error?: FileOperationError;
    metadata?: {
        fileSize?: number;
        lastModified?: Date;
        backupCreated?: boolean;
        operationTime?: number;
    };
}

/**
 * File write options
 */
export interface WriteOptions {
    createBackup?: boolean;
    validateJson?: boolean;
    atomic?: boolean;
    retryAttempts?: number;
    retryDelay?: number;
}

/**
 * File read options
 */
export interface ReadOptions {
    fallbackToBackup?: boolean;
    validateJson?: boolean;
    maxSize?: number;
}

/**
 * FileOperations handles all file I/O operations for the Goal Tree storage
 * with atomic writes, error recovery, and data integrity validation.
 */
export class FileOperations {
    private static readonly DEFAULT_WRITE_OPTIONS: WriteOptions = {
        createBackup: true,
        validateJson: true,
        atomic: true,
        retryAttempts: 3,
        retryDelay: 100
    };

    private static readonly DEFAULT_READ_OPTIONS: ReadOptions = {
        fallbackToBackup: true,
        validateJson: true,
        maxSize: 50 * 1024 * 1024 // 50MB limit
    };

    /**
     * Reads the storage file with error handling and backup fallback
     */
    static async readStorageFile<T = any>(
        options: ReadOptions = {}
    ): Promise<FileOperationResult<T>> {
        const startTime = Date.now();
        const mergedOptions = { ...this.DEFAULT_READ_OPTIONS, ...options };

        try {
            // Validate workspace
            const validation = await WorkspaceManager.validateWorkspaceForStorage();
            if (!validation.isReady) {
                return {
                    success: false,
                    error: new FileOperationError(
                        FileOperationErrorType.NO_WORKSPACE,
                        `Workspace not ready: ${validation.issues.join(', ')}`
                    )
                };
            }

            // Get primary storage file path
            const filePath = await WorkspaceManager.getStorageFilePath();
            if (!filePath) {
                return {
                    success: false,
                    error: new FileOperationError(
                        FileOperationErrorType.NO_WORKSPACE,
                        'Cannot determine storage file path'
                    )
                };
            }

            // Attempt to read primary file
            let result = await this.attemptFileRead<T>(filePath, mergedOptions);
            
            // If primary read failed and backup fallback is enabled, try backup
            if (!result.success && mergedOptions.fallbackToBackup) {
                const backupPath = await WorkspaceManager.getBackupFilePath();
                if (backupPath && await WorkspaceManager.backupFileExists()) {
                    console.warn('Primary storage file read failed, attempting backup recovery');
                    result = await this.attemptFileRead<T>(backupPath, mergedOptions);
                    
                    if (result.success && result.metadata) {
                        result.metadata.backupCreated = true; // Indicate data came from backup
                    }
                }
            }

            // Add operation timing
            if (result.metadata) {
                result.metadata.operationTime = Date.now() - startTime;
            }

            return result;
        } catch (error) {
            return {
                success: false,
                error: new FileOperationError(
                    FileOperationErrorType.READ_FAILED,
                    `Unexpected error reading storage file: ${error}`,
                    error
                ),
                metadata: {
                    operationTime: Date.now() - startTime
                }
            };
        }
    }

    /**
     * Writes data to the storage file with atomic operations and backup creation
     */
    static async writeStorageFile<T = any>(
        data: T,
        options: WriteOptions = {}
    ): Promise<FileOperationResult<void>> {
        const startTime = Date.now();
        const mergedOptions = { ...this.DEFAULT_WRITE_OPTIONS, ...options };
        let backupCreated = false;

        try {
            // Validate workspace
            const validation = await WorkspaceManager.validateWorkspaceForStorage();
            if (!validation.isReady) {
                return {
                    success: false,
                    error: new FileOperationError(
                        FileOperationErrorType.NO_WORKSPACE,
                        `Workspace not ready: ${validation.issues.join(', ')}`
                    )
                };
            }

            // Get file paths
            const filePath = await WorkspaceManager.getStorageFilePath();
            if (!filePath) {
                return {
                    success: false,
                    error: new FileOperationError(
                        FileOperationErrorType.NO_WORKSPACE,
                        'Cannot determine storage file path'
                    )
                };
            }

            // Convert data to JSON
            let jsonContent: string;
            try {
                jsonContent = JSON.stringify(data, null, 2);
            } catch (error) {
                return {
                    success: false,
                    error: new FileOperationError(
                        FileOperationErrorType.INVALID_JSON,
                        `Failed to serialize data to JSON: ${error}`,
                        error
                    )
                };
            }

            // Validate JSON if requested
            if (mergedOptions.validateJson) {
                try {
                    JSON.parse(jsonContent); // Validate by parsing back
                } catch (error) {
                    return {
                        success: false,
                        error: new FileOperationError(
                            FileOperationErrorType.INVALID_JSON,
                            `JSON validation failed: ${error}`,
                            error
                        )
                    };
                }
            }

            // Create backup if requested and file exists
            if (mergedOptions.createBackup && await WorkspaceManager.storageFileExists()) {
                const backupResult = await this.createBackup();
                if (!backupResult.success) {
                    return {
                        success: false,
                        error: backupResult.error
                    };
                }
                backupCreated = true;
            }

            // Write file with retry logic
            const writeResult = await this.writeFileWithRetry(
                filePath,
                jsonContent,
                mergedOptions
            );

            if (!writeResult.success) {
                return writeResult;
            }

            return {
                success: true,
                metadata: {
                    fileSize: jsonContent.length,
                    backupCreated,
                    operationTime: Date.now() - startTime
                }
            };
        } catch (error) {
            return {
                success: false,
                error: new FileOperationError(
                    FileOperationErrorType.WRITE_FAILED,
                    `Unexpected error writing storage file: ${error}`,
                    error
                ),
                metadata: {
                    backupCreated,
                    operationTime: Date.now() - startTime
                }
            };
        }
    }

    /**
     * Creates a backup of the current storage file
     */
    static async createBackup(): Promise<FileOperationResult<void>> {
        try {
            const filePath = await WorkspaceManager.getStorageFilePath();
            const backupPath = await WorkspaceManager.getBackupFilePath();

            if (!filePath || !backupPath) {
                return {
                    success: false,
                    error: new FileOperationError(
                        FileOperationErrorType.NO_WORKSPACE,
                        'Cannot determine file paths for backup'
                    )
                };
            }

            // Check if original file exists
            if (!(await WorkspaceManager.storageFileExists())) {
                return { success: true }; // No file to backup
            }

            // Copy original file to backup location
            await fs.copyFile(filePath.fsPath, backupPath.fsPath);

            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: new FileOperationError(
                    FileOperationErrorType.BACKUP_FAILED,
                    `Failed to create backup: ${error}`,
                    error
                )
            };
        }
    }

    /**
     * Deletes the storage file (with backup)
     */
    static async deleteStorageFile(createBackup: boolean = true): Promise<FileOperationResult<void>> {
        try {
            const filePath = await WorkspaceManager.getStorageFilePath();
            if (!filePath) {
                return {
                    success: false,
                    error: new FileOperationError(
                        FileOperationErrorType.NO_WORKSPACE,
                        'Cannot determine storage file path'
                    )
                };
            }

            // Create backup if requested
            if (createBackup) {
                const backupResult = await this.createBackup();
                if (!backupResult.success) {
                    return backupResult;
                }
            }

            // Delete the file
            await fs.unlink(filePath.fsPath);
            
            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: new FileOperationError(
                    FileOperationErrorType.WRITE_FAILED,
                    `Failed to delete storage file: ${error}`,
                    error
                )
            };
        }
    }

    /**
     * Cleanup all temporary files
     */
    static async cleanup(): Promise<FileOperationResult<void>> {
        try {
            await WorkspaceManager.cleanupTempFiles();
            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: new FileOperationError(
                    FileOperationErrorType.CLEANUP_FAILED,
                    `Failed to cleanup temp files: ${error}`,
                    error
                )
            };
        }
    }

    /**
     * Attempts to read a single file with error handling
     */
    private static async attemptFileRead<T>(
        filePath: vscode.Uri,
        options: ReadOptions
    ): Promise<FileOperationResult<T>> {
        try {
            // Check file size if limit is set
            if (options.maxSize) {
                const stats = await fs.stat(filePath.fsPath);
                if (stats.size > options.maxSize) {
                    return {
                        success: false,
                        error: new FileOperationError(
                            FileOperationErrorType.READ_FAILED,
                            `File size (${stats.size}) exceeds limit (${options.maxSize})`
                        )
                    };
                }
            }

            // Read file content
            const content = await fs.readFile(filePath.fsPath, 'utf8');
            
            // Parse JSON
            let data: T;
            try {
                data = JSON.parse(content);
            } catch (error) {
                return {
                    success: false,
                    error: new FileOperationError(
                        FileOperationErrorType.INVALID_JSON,
                        `Invalid JSON in storage file: ${error}`,
                        error
                    )
                };
            }

            // Get file metadata
            const stats = await fs.stat(filePath.fsPath);

            return {
                success: true,
                data,
                metadata: {
                    fileSize: stats.size,
                    lastModified: stats.mtime
                }
            };
        } catch (error: any) {
            let errorType = FileOperationErrorType.READ_FAILED;
            
            if (error.code === 'ENOENT') {
                errorType = FileOperationErrorType.FILE_NOT_FOUND;
            } else if (error.code === 'EACCES' || error.code === 'EPERM') {
                errorType = FileOperationErrorType.PERMISSION_DENIED;
            }

            return {
                success: false,
                error: new FileOperationError(
                    errorType,
                    `Failed to read file: ${error.message}`,
                    error
                )
            };
        }
    }

    /**
     * Writes a file with retry logic and atomic operations
     */
    private static async writeFileWithRetry(
        filePath: vscode.Uri,
        content: string,
        options: WriteOptions
    ): Promise<FileOperationResult<void>> {
        const { retryAttempts = 3, retryDelay = 100, atomic = true } = options;

        for (let attempt = 0; attempt < retryAttempts; attempt++) {
            try {
                if (atomic) {
                    // Atomic write using temporary file
                    await this.atomicWrite(filePath, content);
                } else {
                    // Direct write
                    await fs.writeFile(filePath.fsPath, content, 'utf8');
                }
                
                return { success: true };
            } catch (error: any) {
                const isLastAttempt = attempt === retryAttempts - 1;
                
                if (isLastAttempt) {
                    let errorType = FileOperationErrorType.WRITE_FAILED;
                    
                    if (error.code === 'EACCES' || error.code === 'EPERM') {
                        errorType = FileOperationErrorType.PERMISSION_DENIED;
                    }

                    return {
                        success: false,
                        error: new FileOperationError(
                            errorType,
                            `Failed to write file after ${retryAttempts} attempts: ${error.message}`,
                            error
                        )
                    };
                }

                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
            }
        }

        return {
            success: false,
            error: new FileOperationError(
                FileOperationErrorType.WRITE_FAILED,
                'Unexpected end of retry loop'
            )
        };
    }

    /**
     * Performs atomic write using temporary file
     */
    private static async atomicWrite(filePath: vscode.Uri, content: string): Promise<void> {
        const tempPath = await WorkspaceManager.getTempFilePath();
        if (!tempPath) {
            throw new Error('Cannot determine temporary file path');
        }

        try {
            // Write to temporary file
            await fs.writeFile(tempPath.fsPath, content, 'utf8');
            
            // Atomic move from temp to target
            await fs.rename(tempPath.fsPath, filePath.fsPath);
        } catch (error) {
            // Cleanup temp file on error
            try {
                await fs.unlink(tempPath.fsPath);
            } catch {
                // Ignore cleanup errors
            }
            throw error;
        }
    }
}