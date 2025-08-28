/**
 * StorageService - Issue #12 Stream B Implementation
 * 
 * Provides workspace-isolated JSON persistence for goal data with the following features:
 * - VS Code workspace storage in .vscode/goal-tree.json
 * - Auto-save with debouncing to avoid blocking UI operations
 * - Schema validation using type guards from Stream A
 * - Error recovery for corrupted data files
 * - Backup/restore capabilities
 * - Event emission for data changes
 * - Concurrent access protection
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Goal, Task } from '../types';
import { isGoal, isGoalArray, validateGoalWithErrors } from '../types/Goal';
import { debounce, DebouncePresets, DebouncedFunction } from '../utils/debounce';

/**
 * Storage configuration options
 */
export interface StorageConfig {
  /** Auto-save debounce delay in milliseconds */
  autoSaveDelay?: number;
  /** Maximum auto-save delay in milliseconds */
  maxAutoSaveDelay?: number;
  /** Enable backup creation before writes */
  createBackups?: boolean;
  /** Maximum number of backups to keep */
  maxBackups?: number;
  /** Enable strict schema validation */
  strictValidation?: boolean;
}

/**
 * Storage operation result
 */
export interface StorageResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
  operation: string;
}

/**
 * Data change event
 */
export interface DataChangeEvent {
  type: 'created' | 'updated' | 'deleted' | 'bulk_update';
  goalIds: string[];
  timestamp: Date;
  source: string;
}

/**
 * Storage file metadata
 */
export interface StorageMetadata {
  version: string;
  created: Date;
  lastModified: Date;
  goalCount: number;
  checksum: string;
  workspaceId: string;
}

/**
 * Internal storage data format
 */
interface StorageData {
  metadata: StorageMetadata;
  goals: Goal[];
}

/**
 * Backup data format
 */
interface BackupData extends StorageData {
  backupReason: string;
  originalTimestamp: Date;
}
/**
 * StorageService provides workspace-isolated persistence for goal data
 */
export class StorageService {
  private static readonly STORAGE_FILE = 'goal-tree.json';
  private static readonly BACKUP_PREFIX = 'goal-tree.backup';
  private static readonly VSCODE_DIR = '.vscode';
  private static readonly DATA_VERSION = '1.0.0';
  
  private readonly context: vscode.ExtensionContext;
  private readonly config: Required<StorageConfig>;
  private readonly changeEmitter = new vscode.EventEmitter<DataChangeEvent>();
  private readonly autoSaveFunction: DebouncedFunction<() => Promise<void>>;
  
  private isInitialized = false;
  private currentData: Goal[] = [];
  private fileLock = new Map<string, Promise<any>>();
  private lastSaveTime?: Date;
  
  /**
   * Event fired when data changes
   */
  readonly onDataChange = this.changeEmitter.event;
  
  constructor(context: vscode.ExtensionContext, config: StorageConfig = {}) {
    this.context = context;
    this.config = {
      autoSaveDelay: config.autoSaveDelay ?? 1000,
      maxAutoSaveDelay: config.maxAutoSaveDelay ?? 5000,
      createBackups: config.createBackups ?? true,
      maxBackups: config.maxBackups ?? 5,
      strictValidation: config.strictValidation ?? false,
    };
    
    // Setup auto-save function with debouncing
    this.autoSaveFunction = debounce(
      async () => {
        try {
          await this.performSave();
        } catch (error) {
          console.error('Auto-save failed:', error);
          vscode.window.showErrorMessage('Auto-save failed. Please save manually.');
        }
      },
      {
        delay: this.config.autoSaveDelay,
        maxDelay: this.config.maxAutoSaveDelay,
      }
    );
  }
  
  /**
   * Initialize the storage service
   */
  async initialize(): Promise<StorageResult<void>> {
    if (this.isInitialized) {
      return { success: true, timestamp: new Date(), operation: 'initialize' };
    }
    
    try {
      // Ensure .vscode directory exists
      const workspaceFolder = this.getWorkspaceFolder();
      if (!workspaceFolder) {
        throw new Error('No workspace folder found. StorageService requires an open workspace.');
      }
      
      const vscodeDir = path.join(workspaceFolder.uri.fsPath, StorageService.VSCODE_DIR);
      await this.ensureDirectoryExists(vscodeDir);
      
      // Load existing data or create new
      const loadResult = await this.loadFromDisk();
      if (loadResult.success && loadResult.data) {
        this.currentData = loadResult.data;
      } else {
        console.warn('Failed to load existing data:', loadResult.error);
        this.currentData = [];
      }
      
      this.isInitialized = true;
      
      return {
        success: true,
        timestamp: new Date(),
        operation: 'initialize'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        operation: 'initialize'
      };
    }
  }
  
  /**
   * Get all goals
   */
  async getGoals(): Promise<StorageResult<Goal[]>> {
    await this.ensureInitialized();
    
    try {
      // Return a deep copy to prevent external mutations
      const goals = JSON.parse(JSON.stringify(this.currentData));
      
      return {
        success: true,
        data: goals,
        timestamp: new Date(),
        operation: 'get_goals'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        operation: 'get_goals'
      };
    }
  }
  
  /**
   * Get a specific goal by ID
   */
  async getGoal(id: string): Promise<StorageResult<Goal | undefined>> {
    await this.ensureInitialized();
    
    try {
      const goal = this.currentData.find(g => g.id === id);
      return {
        success: true,
        data: goal ? JSON.parse(JSON.stringify(goal)) : undefined,
        timestamp: new Date(),
        operation: 'get_goal'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        operation: 'get_goal'
      };
    }
  }
  
  /**
   * Save a single goal (create or update)
   */
  async saveGoal(goal: Goal): Promise<StorageResult<Goal>> {
    await this.ensureInitialized();
    
    try {
      // Validate goal using type guards
      const validationResult = validateGoalWithErrors(goal);
      if (!validationResult.isValid) {
        throw new Error(`Invalid goal data: ${validationResult.errors.join(', ')}`);
      }
      
      const existingIndex = this.currentData.findIndex(g => g.id === goal.id);
      const isUpdate = existingIndex >= 0;
      
      // Update timestamps
      const updatedGoal = {
        ...goal,
        updatedAt: new Date(),
        createdAt: isUpdate ? this.currentData[existingIndex].createdAt : goal.createdAt || new Date()
      };
      
      if (isUpdate) {
        this.currentData[existingIndex] = updatedGoal;
      } else {
        this.currentData.push(updatedGoal);
      }
      
      // Trigger auto-save
      this.autoSaveFunction();
      
      // Emit change event
      this.changeEmitter.fire({
        type: isUpdate ? 'updated' : 'created',
        goalIds: [goal.id],
        timestamp: new Date(),
        source: 'StorageService.saveGoal'
      });
      
      return {
        success: true,
        data: JSON.parse(JSON.stringify(updatedGoal)),
        timestamp: new Date(),
        operation: isUpdate ? 'update_goal' : 'create_goal'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        operation: 'save_goal'
      };
    }
  }
  
  /**
   * Save multiple goals (bulk operation)
   */
  async saveGoals(goals: Goal[]): Promise<StorageResult<Goal[]>> {
    await this.ensureInitialized();
    
    try {
      // Validate all goals
      const validationErrors: string[] = [];
      goals.forEach((goal, index) => {
        const validationResult = validateGoalWithErrors(goal, `goals[${index}]`);
        if (!validationResult.isValid) {
          validationErrors.push(...validationResult.errors);
        }
      });
      
      if (validationErrors.length > 0 && this.config.strictValidation) {
        throw new Error(`Invalid goals data: ${validationErrors.join(', ')}`);
      }
      
      // Replace all data (this is a bulk replace operation)
      const updatedGoals = goals.map(goal => ({
        ...goal,
        updatedAt: new Date(),
        createdAt: goal.createdAt || new Date()
      }));
      
      this.currentData = updatedGoals;
      
      // Trigger auto-save
      this.autoSaveFunction();
      
      // Emit change event
      this.changeEmitter.fire({
        type: 'bulk_update',
        goalIds: goals.map(g => g.id),
        timestamp: new Date(),
        source: 'StorageService.saveGoals'
      });
      
      return {
        success: true,
        data: JSON.parse(JSON.stringify(updatedGoals)),
        timestamp: new Date(),
        operation: 'save_goals'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        operation: 'save_goals'
      };
    }
  }
  
  /**
   * Delete a goal by ID
   */
  async deleteGoal(id: string): Promise<StorageResult<void>> {
    await this.ensureInitialized();
    
    try {
      const initialLength = this.currentData.length;
      this.currentData = this.currentData.filter(g => g.id !== id);
      
      if (this.currentData.length < initialLength) {
        // Goal was deleted, trigger auto-save
        this.autoSaveFunction();
        
        // Emit change event
        this.changeEmitter.fire({
          type: 'deleted',
          goalIds: [id],
          timestamp: new Date(),
          source: 'StorageService.deleteGoal'
        });
        
        return {
          success: true,
          timestamp: new Date(),
          operation: 'delete_goal'
        };
      } else {
        return {
          success: false,
          error: 'Goal not found',
          timestamp: new Date(),
          operation: 'delete_goal'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        operation: 'delete_goal'
      };
    }
  }
  
  /**
   * Force immediate save to disk
   */
  async save(): Promise<StorageResult<void>> {
    await this.ensureInitialized();
    
    // Cancel pending auto-save and save immediately
    this.autoSaveFunction.cancel();
    
    return this.performSave();
  }
  
  /**
   * Create a backup of current data
   */
  async createBackup(reason = 'manual'): Promise<StorageResult<string>> {
    await this.ensureInitialized();
    
    try {
      const workspaceFolder = this.getWorkspaceFolder();
      if (!workspaceFolder) {
        throw new Error('No workspace folder found');
      }
      
      const backupFileName = `${StorageService.BACKUP_PREFIX}.${Date.now()}.json`;
      const backupPath = path.join(
        workspaceFolder.uri.fsPath,
        StorageService.VSCODE_DIR,
        backupFileName
      );
      
      const backupData: BackupData = {
        metadata: this.createMetadata(),
        goals: this.currentData,
        backupReason: reason,
        originalTimestamp: new Date()
      };
      
      await this.writeFileWithLock(backupPath, JSON.stringify(backupData, null, 2));
      
      // Clean up old backups
      await this.cleanupOldBackups();
      
      return {
        success: true,
        data: backupPath,
        timestamp: new Date(),
        operation: 'create_backup'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        operation: 'create_backup'
      };
    }
  }
  
  /**
   * Restore from a backup file
   */
  async restoreFromBackup(backupPath?: string): Promise<StorageResult<Goal[]>> {
    await this.ensureInitialized();
    
    try {
      let targetBackupPath = backupPath;
      
      // If no backup path specified, find the most recent backup
      if (!targetBackupPath) {
        const recentBackup = await this.findMostRecentBackup();
        if (!recentBackup) {
          throw new Error('No backup files found');
        }
        targetBackupPath = recentBackup;
      }
      
      const backupContent = await fs.readFile(targetBackupPath, 'utf-8');
      const backupData = JSON.parse(backupContent) as BackupData;
      
      // Validate backup data
      if (!isGoalArray(backupData.goals)) {
        throw new Error('Invalid backup data: goals array is corrupted');
      }
      
      // Create a backup of current state before restoring
      await this.createBackup('pre-restore');
      
      // Restore the data
      this.currentData = backupData.goals;
      
      // Save to disk immediately
      await this.performSave();
      
      // Emit change event
      this.changeEmitter.fire({
        type: 'bulk_update',
        goalIds: this.currentData.map(g => g.id),
        timestamp: new Date(),
        source: 'StorageService.restoreFromBackup'
      });
      
      return {
        success: true,
        data: JSON.parse(JSON.stringify(this.currentData)),
        timestamp: new Date(),
        operation: 'restore_backup'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        operation: 'restore_backup'
      };
    }
  }
  
  /**
   * Get storage statistics and health information
   */
  async getStorageInfo(): Promise<StorageResult<{
    goalCount: number;
    taskCount: number;
    fileSize: number;
    lastSaved?: Date;
    workspaceId: string;
    backupCount: number;
    isHealthy: boolean;
    issues: string[];
  }>> {
    await this.ensureInitialized();
    
    try {
      const workspaceFolder = this.getWorkspaceFolder();
      if (!workspaceFolder) {
        throw new Error('No workspace folder found');
      }
      
      const storageFilePath = path.join(
        workspaceFolder.uri.fsPath,
        StorageService.VSCODE_DIR,
        StorageService.STORAGE_FILE
      );
      
      let fileSize = 0;
      try {
        const stats = await fs.stat(storageFilePath);
        fileSize = stats.size;
      } catch {
        // File doesn't exist yet, that's ok
      }
      
      const taskCount = this.currentData.reduce((count, goal) => count + goal.tasks.length, 0);
      const backupFiles = await this.getBackupFiles();
      const issues: string[] = [];
      
      // Check for potential issues
      if (this.currentData.length > 1000) {
        issues.push('Large number of goals may impact performance');
      }
      
      if (fileSize > 10 * 1024 * 1024) { // 10MB
        issues.push('Storage file is getting large');
      }
      
      if (backupFiles.length === 0 && this.currentData.length > 0) {
        issues.push('No backups found - consider creating manual backups');
      }
      
      return {
        success: true,
        data: {
          goalCount: this.currentData.length,
          taskCount,
          fileSize,
          lastSaved: this.lastSaveTime,
          workspaceId: this.getWorkspaceId(),
          backupCount: backupFiles.length,
          isHealthy: issues.length === 0,
          issues
        },
        timestamp: new Date(),
        operation: 'get_storage_info'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        operation: 'get_storage_info'
      };
    }
  }
  
  /**
   * Dispose of resources
   */
  dispose(): void {
    // Cancel any pending auto-save
    this.autoSaveFunction.cancel();
    
    // Dispose event emitter
    this.changeEmitter.dispose();
    
    // Clear file locks
    this.fileLock.clear();
  }
  
  // Private methods
  
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      const result = await this.initialize();
      if (!result.success) {
        throw new Error(`StorageService initialization failed: ${result.error}`);
      }
    }
  }
  
  private getWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    return vscode.workspace.workspaceFolders?.[0];
  }
  
  private getWorkspaceId(): string {
    const workspaceFolder = this.getWorkspaceFolder();
    return workspaceFolder ? path.basename(workspaceFolder.uri.fsPath) : 'unknown';
  }
  
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      // Ignore if directory already exists
      if ((error as any).code !== 'EEXIST') {
        throw error;
      }
    }
  }
  
  private createMetadata(): StorageMetadata {
    return {
      version: StorageService.DATA_VERSION,
      created: new Date(),
      lastModified: new Date(),
      goalCount: this.currentData.length,
      checksum: this.calculateChecksum(this.currentData),
      workspaceId: this.getWorkspaceId()
    };
  }
  
  private calculateChecksum(data: Goal[]): string {
    // Simple checksum based on content
    const content = JSON.stringify(data.map(g => ({ id: g.id, title: g.title, updatedAt: g.updatedAt })));
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
  
  private async performSave(): Promise<StorageResult<void>> {
    try {
      const workspaceFolder = this.getWorkspaceFolder();
      if (!workspaceFolder) {
        throw new Error('No workspace folder found');
      }
      
      // Create backup if configured
      if (this.config.createBackups && this.currentData.length > 0) {
        await this.createBackup('auto-save');
      }
      
      const storageFilePath = path.join(
        workspaceFolder.uri.fsPath,
        StorageService.VSCODE_DIR,
        StorageService.STORAGE_FILE
      );
      
      const storageData: StorageData = {
        metadata: this.createMetadata(),
        goals: this.currentData
      };
      
      await this.writeFileWithLock(storageFilePath, JSON.stringify(storageData, null, 2));
      this.lastSaveTime = new Date();
      
      return {
        success: true,
        timestamp: new Date(),
        operation: 'save'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        operation: 'save'
      };
    }
  }
  
  private async loadFromDisk(): Promise<StorageResult<Goal[]>> {
    try {
      const workspaceFolder = this.getWorkspaceFolder();
      if (!workspaceFolder) {
        throw new Error('No workspace folder found');
      }
      
      const storageFilePath = path.join(
        workspaceFolder.uri.fsPath,
        StorageService.VSCODE_DIR,
        StorageService.STORAGE_FILE
      );
      
      try {
        const content = await fs.readFile(storageFilePath, 'utf-8');
        const storageData = JSON.parse(content) as StorageData;
        
        // Validate data structure
        if (!storageData.goals || !Array.isArray(storageData.goals)) {
          throw new Error('Invalid storage data structure');
        }
        
        // Validate each goal
        const validatedGoals: Goal[] = [];
        const validationErrors: string[] = [];
        
        for (let i = 0; i < storageData.goals.length; i++) {
          const validationResult = validateGoalWithErrors(storageData.goals[i], `goals[${i}]`);
          if (validationResult.isValid) {
            validatedGoals.push(storageData.goals[i] as Goal);
          } else {
            validationErrors.push(`Goal ${i}: ${validationResult.errors.join(', ')}`);
          }
        }
        
        if (validationErrors.length > 0) {
          console.warn('Data validation issues during load:', validationErrors);
          
          if (this.config.strictValidation && validatedGoals.length === 0) {
            throw new Error(`All goals failed validation: ${validationErrors.join('; ')}`);
          }
        }
        
        return {
          success: true,
          data: validatedGoals,
          timestamp: new Date(),
          operation: 'load'
        };
      } catch (fileError) {
        // Try to recover from backup
        if ((fileError as any).code === 'ENOENT') {
          // File doesn't exist, not an error
          return {
            success: true,
            data: [],
            timestamp: new Date(),
            operation: 'load'
          };
        }
        
        // Try to recover from backup
        const backupRecovery = await this.tryRecoverFromBackup();
        if (backupRecovery.success) {
          console.warn('Primary storage corrupted, recovered from backup');
          return backupRecovery;
        }
        
        throw fileError;
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        operation: 'load'
      };
    }
  }
  
  private async tryRecoverFromBackup(): Promise<StorageResult<Goal[]>> {
    try {
      const mostRecentBackup = await this.findMostRecentBackup();
      if (!mostRecentBackup) {
        throw new Error('No backup files found for recovery');
      }
      
      const backupContent = await fs.readFile(mostRecentBackup, 'utf-8');
      const backupData = JSON.parse(backupContent) as BackupData;
      
      if (!isGoalArray(backupData.goals)) {
        throw new Error('Backup data is also corrupted');
      }
      
      return {
        success: true,
        data: backupData.goals,
        timestamp: new Date(),
        operation: 'recover_from_backup'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        operation: 'recover_from_backup'
      };
    }
  }
  
  private async writeFileWithLock(filePath: string, content: string): Promise<void> {
    const lockKey = filePath;
    
    // Wait for any existing operation on this file to complete
    if (this.fileLock.has(lockKey)) {
      await this.fileLock.get(lockKey);
    }
    
    // Create new lock promise
    const lockPromise = this.performWrite(filePath, content);
    this.fileLock.set(lockKey, lockPromise);
    
    try {
      await lockPromise;
    } finally {
      // Clean up lock
      this.fileLock.delete(lockKey);
    }
  }
  
  private async performWrite(filePath: string, content: string): Promise<void> {
    // Write to temporary file first (atomic operation)
    const tempFile = `${filePath}.tmp`;
    
    try {
      await fs.writeFile(tempFile, content, 'utf-8');
      
      // Atomic move (rename) to final location
      await fs.rename(tempFile, filePath);
    } catch (error) {
      // Clean up temp file if it exists
      try {
        await fs.unlink(tempFile);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }
  
  private async getBackupFiles(): Promise<string[]> {
    try {
      const workspaceFolder = this.getWorkspaceFolder();
      if (!workspaceFolder) {
        return [];
      }
      
      const vscodeDir = path.join(workspaceFolder.uri.fsPath, StorageService.VSCODE_DIR);
      const files = await fs.readdir(vscodeDir);
      
      return files
        .filter(file => file.startsWith(StorageService.BACKUP_PREFIX))
        .map(file => path.join(vscodeDir, file))
        .sort((a, b) => b.localeCompare(a)); // Most recent first
    } catch {
      return [];
    }
  }
  
  private async findMostRecentBackup(): Promise<string | null> {
    const backupFiles = await this.getBackupFiles();
    return backupFiles.length > 0 ? backupFiles[0] : null;
  }
  
  private async cleanupOldBackups(): Promise<void> {
    try {
      const backupFiles = await this.getBackupFiles();
      
      if (backupFiles.length > this.config.maxBackups) {
        const filesToDelete = backupFiles.slice(this.config.maxBackups);
        
        for (const file of filesToDelete) {
          try {
            await fs.unlink(file);
          } catch (error) {
            console.warn('Failed to delete old backup:', file, error);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to cleanup old backups:', error);
    }
  }
}

/**
 * Factory function to create a StorageService instance
 */
export function createStorageService(
  context: vscode.ExtensionContext, 
  config?: StorageConfig
): StorageService {
  return new StorageService(context, config);
}

/**
 * Storage service utilities
 */
export const StorageServiceUtils = {
  /**
   * Get default storage configuration
   */
  getDefaultConfig(): StorageConfig {
    return {
      autoSaveDelay: 1000,
      maxAutoSaveDelay: 5000,
      createBackups: true,
      maxBackups: 5,
      strictValidation: false,
    };
  },
  
  /**
   * Get storage configuration optimized for performance
   */
  getPerformanceConfig(): StorageConfig {
    return {
      autoSaveDelay: 2000,
      maxAutoSaveDelay: 10000,
      createBackups: false,
      maxBackups: 0,
      strictValidation: false,
    };
  },
  
  /**
   * Get storage configuration optimized for reliability
   */
  getReliabilityConfig(): StorageConfig {
    return {
      autoSaveDelay: 500,
      maxAutoSaveDelay: 2000,
      createBackups: true,
      maxBackups: 10,
      strictValidation: true,
    };
  },
};

