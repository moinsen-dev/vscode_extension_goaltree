import * as vscode from 'vscode';
import * as fs from 'fs/promises';

/**
 * WorkspaceManager handles workspace isolation and storage location management
 * for the Goal Tree extension. Manages .vscode/goal-tree.json file placement.
 */
export class WorkspaceManager {
    private static readonly STORAGE_DIRECTORY = '.vscode';
    private static readonly STORAGE_FILENAME = 'goal-tree.json';
    private static readonly BACKUP_SUFFIX = '.backup';
    private static readonly TEMP_SUFFIX = '.tmp';

    /**
     * Gets the workspace root URI
     * @returns The workspace root URI or undefined if no workspace is open
     */
    static getWorkspaceRoot(): vscode.Uri | undefined {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        return workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri : undefined;
    }

    /**
     * Gets the storage directory path (.vscode folder)
     * @returns Promise resolving to the .vscode directory URI, or undefined if no workspace
     */
    static async getStorageDirectory(): Promise<vscode.Uri | undefined> {
        const workspaceRoot = this.getWorkspaceRoot();
        if (!workspaceRoot) {
            return undefined;
        }

        const storageDir = vscode.Uri.joinPath(workspaceRoot, this.STORAGE_DIRECTORY);
        
        // Ensure the .vscode directory exists
        try {
            await fs.access(storageDir.fsPath);
        } catch {
            // Directory doesn't exist, create it
            try {
                await fs.mkdir(storageDir.fsPath, { recursive: true });
            } catch (error) {
                throw new Error(`Failed to create storage directory: ${error}`);
            }
        }

        return storageDir;
    }

    /**
     * Gets the primary storage file path (goal-tree.json)
     * @returns Promise resolving to the storage file URI, or undefined if no workspace
     */
    static async getStorageFilePath(): Promise<vscode.Uri | undefined> {
        const storageDir = await this.getStorageDirectory();
        if (!storageDir) {
            return undefined;
        }

        return vscode.Uri.joinPath(storageDir, this.STORAGE_FILENAME);
    }

    /**
     * Gets the backup file path (goal-tree.json.backup)
     * @returns Promise resolving to the backup file URI, or undefined if no workspace
     */
    static async getBackupFilePath(): Promise<vscode.Uri | undefined> {
        const storageDir = await this.getStorageDirectory();
        if (!storageDir) {
            return undefined;
        }

        return vscode.Uri.joinPath(storageDir, this.STORAGE_FILENAME + this.BACKUP_SUFFIX);
    }

    /**
     * Gets the temporary file path for atomic writes (goal-tree.json.tmp)
     * @returns Promise resolving to the temporary file URI, or undefined if no workspace
     */
    static async getTempFilePath(): Promise<vscode.Uri | undefined> {
        const storageDir = await this.getStorageDirectory();
        if (!storageDir) {
            return undefined;
        }

        return vscode.Uri.joinPath(storageDir, this.STORAGE_FILENAME + this.TEMP_SUFFIX);
    }

    /**
     * Checks if storage file exists
     * @returns Promise resolving to true if the storage file exists
     */
    static async storageFileExists(): Promise<boolean> {
        const filePath = await this.getStorageFilePath();
        if (!filePath) {
            return false;
        }

        try {
            await fs.access(filePath.fsPath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Checks if backup file exists
     * @returns Promise resolving to true if the backup file exists
     */
    static async backupFileExists(): Promise<boolean> {
        const filePath = await this.getBackupFilePath();
        if (!filePath) {
            return false;
        }

        try {
            await fs.access(filePath.fsPath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Gets storage file information
     * @returns Promise resolving to file stats or undefined if file doesn't exist
     */
    static async getStorageFileInfo(): Promise<{
        exists: boolean;
        size?: number;
        lastModified?: Date;
        path?: string;
    }> {
        const filePath = await this.getStorageFilePath();
        if (!filePath) {
            return { exists: false };
        }

        try {
            const stats = await fs.stat(filePath.fsPath);
            return {
                exists: true,
                size: stats.size,
                lastModified: stats.mtime,
                path: filePath.fsPath
            };
        } catch {
            return { exists: false };
        }
    }

    /**
     * Validates workspace state for storage operations
     * @returns Object indicating if workspace is ready and any issues
     */
    static async validateWorkspaceForStorage(): Promise<{
        isReady: boolean;
        workspaceOpen: boolean;
        storageDirectoryExists: boolean;
        storageDirectoryWritable: boolean;
        issues: string[];
    }> {
        const issues: string[] = [];
        let workspaceOpen = false;
        let storageDirectoryExists = false;
        let storageDirectoryWritable = false;

        // Check if workspace is open
        const workspaceRoot = this.getWorkspaceRoot();
        if (workspaceRoot) {
            workspaceOpen = true;
        } else {
            issues.push('No workspace folder is currently open');
        }

        if (workspaceOpen) {
            try {
                const storageDir = await this.getStorageDirectory();
                if (storageDir) {
                    storageDirectoryExists = true;
                    
                    // Test write permissions by attempting to create a test file
                    try {
                        const testFile = vscode.Uri.joinPath(storageDir, '.test-write-permission');
                        await fs.writeFile(testFile.fsPath, 'test');
                        await fs.unlink(testFile.fsPath);
                        storageDirectoryWritable = true;
                    } catch (error) {
                        issues.push(`Storage directory is not writable: ${error}`);
                    }
                }
            } catch (error) {
                issues.push(`Failed to access storage directory: ${error}`);
            }
        }

        const isReady = workspaceOpen && storageDirectoryExists && storageDirectoryWritable;

        return {
            isReady,
            workspaceOpen,
            storageDirectoryExists,
            storageDirectoryWritable,
            issues
        };
    }

    /**
     * Gets workspace-specific identifier for locking
     * @returns Unique identifier for the current workspace
     */
    static getWorkspaceId(): string | undefined {
        const workspaceRoot = this.getWorkspaceRoot();
        if (!workspaceRoot) {
            return undefined;
        }

        // Use the workspace folder path as a unique identifier
        return workspaceRoot.fsPath;
    }

    /**
     * Cleanup temporary files
     * @returns Promise resolving when cleanup is complete
     */
    static async cleanupTempFiles(): Promise<void> {
        const tempFile = await this.getTempFilePath();
        if (tempFile) {
            try {
                await fs.unlink(tempFile.fsPath);
            } catch {
                // Ignore errors - temp file might not exist
            }
        }
    }

    /**
     * Gets storage configuration for the workspace
     */
    static getStorageConfig(): {
        filename: string;
        directory: string;
        backupSuffix: string;
        tempSuffix: string;
    } {
        return {
            filename: this.STORAGE_FILENAME,
            directory: this.STORAGE_DIRECTORY,
            backupSuffix: this.BACKUP_SUFFIX,
            tempSuffix: this.TEMP_SUFFIX
        };
    }
}