/**
 * Auto-save service that coordinates change tracking, notifications, and storage
 * Provides non-blocking auto-save functionality with intelligent debouncing
 */

import * as vscode from 'vscode';
import { Goal } from '../models/goal';
import { StorageService } from './storageService';
import { ChangeTracker, ChangeEvent, ChangeType } from './change-tracker';
import { ChangeNotificationService } from './ChangeNotificationService';
import { debounce, DebouncedFunction, DebouncePresets } from '../utils/debounce';
import { createLogger } from '../utils/logger';

/**
 * Auto-save configuration options
 */
export interface AutoSaveConfig {
    /** Whether auto-save is enabled */
    enabled: boolean;
    
    /** Debounce delay for normal changes (ms) */
    debounceDelay: number;
    
    /** Maximum delay before forcing a save (ms) */
    maxDelay: number;
    
    /** Delay for urgent changes (ms) */
    urgentDelay: number;
    
    /** Maximum number of changes to batch before forcing a save */
    maxChangesPerBatch: number;
    
    /** Whether to show save notifications to the user */
    showNotifications: boolean;
    
    /** Whether to automatically create backups before saving */
    autoBackup: boolean;
    
    /** Minimum time between backups (ms) */
    backupInterval: number;
    
    /** Whether to log auto-save operations */
    enableLogging: boolean;
}

/**
 * Auto-save status information
 */
export interface AutoSaveStatus {
    /** Whether auto-save is currently enabled */
    enabled: boolean;
    
    /** Whether a save operation is currently in progress */
    saving: boolean;
    
    /** Number of changes pending save */
    pendingChanges: number;
    
    /** Whether there are urgent changes */
    hasUrgentChanges: boolean;
    
    /** Time of last successful save */
    lastSave?: Date;
    
    /** Time of next scheduled save */
    nextScheduledSave?: Date;
    
    /** Current save operation details */
    currentOperation?: {
        startTime: Date;
        changeCount: number;
        urgent: boolean;
    };
    
    /** Statistics about save operations */
    statistics: {
        totalSaves: number;
        successfulSaves: number;
        failedSaves: number;
        averageSaveTime: number;
        averageChangeCount: number;
        lastError?: string;
    };
}

/**
 * Auto-save service implementation
 */
export class AutoSaveService {
    private static instance: AutoSaveService;
    
    private config: AutoSaveConfig;
    private storageService: StorageService;
    private changeTracker: ChangeTracker;
    private notificationService: ChangeNotificationService;
    private logger = createLogger('AutoSaveService');
    
    private isInitialized = false;
    private currentSaveOperation: Promise<void> | null = null;
    private debouncedSave: DebouncedFunction<() => Promise<void>>;
    private urgentSave: DebouncedFunction<() => Promise<void>>;
    private lastBackupTime: Date | null = null;
    
    // Statistics
    private saveStatistics = {
        totalSaves: 0,
        successfulSaves: 0,
        failedSaves: 0,
        totalDuration: 0,
        totalChanges: 0,
        lastError: undefined as string | undefined
    };
    
    // Event listener disposables
    private disposables: vscode.Disposable[] = [];
    
    private constructor(
        storageService: StorageService,
        config?: Partial<AutoSaveConfig>
    ) {
        this.storageService = storageService;
        this.changeTracker = ChangeTracker.getInstance();
        this.notificationService = ChangeNotificationService.getInstance();
        
        // Set default configuration
        this.config = {
            enabled: true,
            debounceDelay: 1000,
            maxDelay: 5000,
            urgentDelay: 250,
            maxChangesPerBatch: 50,
            showNotifications: false,
            autoBackup: true,
            backupInterval: 5 * 60 * 1000, // 5 minutes
            enableLogging: true,
            ...config
        };
        
        // Create debounced save functions
        this.debouncedSave = debounce(
            () => this.performSave(false),
            {
                delay: this.config.debounceDelay,
                maxDelay: this.config.maxDelay
            }
        );
        
        this.urgentSave = debounce(
            () => this.performSave(true),
            {
                delay: this.config.urgentDelay,
                maxDelay: this.config.urgentDelay * 2
            }
        );
    }
    
    /**
     * Gets or creates the singleton instance
     */
    static getInstance(
        storageService?: StorageService,
        config?: Partial<AutoSaveConfig>
    ): AutoSaveService {
        if (!AutoSaveService.instance && storageService) {
            AutoSaveService.instance = new AutoSaveService(storageService, config);
        } else if (!AutoSaveService.instance) {
            throw new Error('AutoSaveService requires StorageService for initialization');
        }
        return AutoSaveService.instance;
    }
    
    /**
     * Initializes the auto-save service and sets up event listeners
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }
        
        try {
            // Ensure storage service is initialized
            await this.storageService.initialize();
            
            // Set up event listeners
            this.setupEventListeners();
            
            this.isInitialized = true;
            this.logger.info('AutoSaveService initialized successfully', {
                config: this.config
            });
            
            this.notificationService.notify('info', 'Auto-save service initialized');
            
        } catch (error) {
            this.logger.error('Failed to initialize AutoSaveService', error);
            this.notificationService.notify('error', 'Failed to initialize auto-save service', error);
            throw error;
        }
    }
    
    /**
     * Enables auto-save functionality
     */
    enable(): void {
        if (!this.config.enabled) {
            this.config.enabled = true;
            this.logger.info('Auto-save enabled');
            this.notificationService.notify('info', 'Auto-save enabled');
        }
    }
    
    /**
     * Disables auto-save functionality
     */
    disable(): void {
        if (this.config.enabled) {
            this.config.enabled = false;
            
            // Cancel any pending saves
            this.debouncedSave.cancel();
            this.urgentSave.cancel();
            
            this.logger.info('Auto-save disabled');
            this.notificationService.notify('info', 'Auto-save disabled');
        }
    }
    
    /**
     * Updates the auto-save configuration
     */
    updateConfig(newConfig: Partial<AutoSaveConfig>): void {
        const oldConfig = { ...this.config };
        this.config = { ...this.config, ...newConfig };
        
        // Recreate debounced functions if delays changed
        if (
            newConfig.debounceDelay !== undefined ||
            newConfig.maxDelay !== undefined ||
            newConfig.urgentDelay !== undefined
        ) {
            this.debouncedSave.cancel();
            this.urgentSave.cancel();
            
            this.debouncedSave = debounce(
                () => this.performSave(false),
                {
                    delay: this.config.debounceDelay,
                    maxDelay: this.config.maxDelay
                }
            );
            
            this.urgentSave = debounce(
                () => this.performSave(true),
                {
                    delay: this.config.urgentDelay,
                    maxDelay: this.config.urgentDelay * 2
                }
            );
        }
        
        this.logger.debug('Auto-save configuration updated', {
            oldConfig,
            newConfig: this.config
        });
    }
    
    /**
     * Triggers an immediate save operation
     */
    async saveNow(): Promise<void> {
        if (!this.isInitialized) {
            throw new Error('AutoSaveService not initialized');
        }
        
        // Cancel pending debounced saves
        this.debouncedSave.cancel();
        this.urgentSave.cancel();
        
        return this.performSave(true, 'Manual save triggered');
    }
    
    /**
     * Forces a save with backup creation
     */
    async saveWithBackup(): Promise<void> {
        if (!this.isInitialized) {
            throw new Error('AutoSaveService not initialized');
        }
        
        const oldAutoBackup = this.config.autoBackup;
        this.config.autoBackup = true;
        
        try {
            await this.saveNow();
        } finally {
            this.config.autoBackup = oldAutoBackup;
        }
    }
    
    /**
     * Gets the current auto-save status
     */
    getStatus(): AutoSaveStatus {
        const pendingChanges = this.changeTracker.getPendingChanges();
        const stats = this.changeTracker.getStatistics();
        
        return {
            enabled: this.config.enabled,
            saving: this.currentSaveOperation !== null,
            pendingChanges: pendingChanges.length,
            hasUrgentChanges: this.changeTracker.hasUrgentChanges(),
            lastSave: this.getLastSaveTime(),
            nextScheduledSave: this.getNextScheduledSave(),
            currentOperation: this.getCurrentOperationDetails(),
            statistics: {
                totalSaves: this.saveStatistics.totalSaves,
                successfulSaves: this.saveStatistics.successfulSaves,
                failedSaves: this.saveStatistics.failedSaves,
                averageSaveTime: this.saveStatistics.totalSaves > 0 
                    ? this.saveStatistics.totalDuration / this.saveStatistics.totalSaves 
                    : 0,
                averageChangeCount: this.saveStatistics.totalSaves > 0 
                    ? this.saveStatistics.totalChanges / this.saveStatistics.totalSaves 
                    : 0,
                lastError: this.saveStatistics.lastError
            }
        };
    }
    
    /**
     * Records a change and triggers auto-save if needed
     */
    recordChange(change: ChangeEvent): void {
        if (!this.isInitialized || !this.config.enabled) {
            return;
        }
        
        // Notify about the change
        this.notificationService.notifyChange(change);
        
        // Check if we should trigger urgent save
        if (change.metadata?.urgent || this.shouldTriggerUrgentSave()) {
            this.urgentSave();
            this.notificationService.notifySaveTriggered('Urgent change detected', 1, true);
        } else {
            // Check if we should force save due to batch size
            const pendingChanges = this.changeTracker.getPendingChanges();
            if (pendingChanges.length >= this.config.maxChangesPerBatch) {
                this.saveNow().catch(error => {
                    this.logger.error('Batch size save failed', error);
                });
                this.notificationService.notifySaveTriggered('Max batch size reached', pendingChanges.length, false);
            } else {
                // Normal debounced save
                this.debouncedSave();
                this.notificationService.notifySaveTriggered('Change detected', pendingChanges.length, false);
            }
        }
    }
    
    /**
     * Cancels any pending save operations
     */
    cancelPendingSaves(): void {
        this.debouncedSave.cancel();
        this.urgentSave.cancel();
        
        const pendingChanges = this.changeTracker.getPendingChanges().length;
        if (pendingChanges > 0) {
            this.notificationService.notifySaveCancelled('User cancelled', pendingChanges);
        }
    }
    
    /**
     * Flushes any pending saves immediately
     */
    async flushPendingSaves(): Promise<void> {
        // Force execution of any pending saves
        const normalSave = this.debouncedSave.flush();
        const urgentSave = this.urgentSave.flush();
        
        // Wait for any triggered saves to complete
        await Promise.all([normalSave, urgentSave].filter(Boolean));
    }
    
    /**
     * Disposes the auto-save service and cleans up resources
     */
    dispose(): void {
        // Cancel pending operations
        this.debouncedSave.cancel();
        this.urgentSave.cancel();
        
        // Dispose event listeners
        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables = [];
        
        this.isInitialized = false;
        this.logger.info('AutoSaveService disposed');
    }
    
    // Private methods
    
    /**
     * Sets up event listeners for change tracking
     */
    private setupEventListeners(): void {
        // Listen to change tracker events would be set up here if the change tracker
        // had its own event system. For now, changes are recorded directly via recordChange.
        
        // Set up cleanup on workspace close
        this.disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders(() => {
                this.flushPendingSaves().catch(error => {
                    this.logger.error('Failed to flush saves on workspace change', error);
                });
            })
        );
        
        // Set up cleanup on extension deactivate
        if (vscode.window.onDidCloseTerminal) {
            this.disposables.push(
                vscode.window.onDidCloseTerminal(() => {
                    this.flushPendingSaves().catch(error => {
                        this.logger.error('Failed to flush saves on terminal close', error);
                    });
                })
            );
        }
    }
    
    /**
     * Performs the actual save operation
     */
    private async performSave(urgent: boolean = false, reason?: string): Promise<void> {
        if (!this.config.enabled || !this.isInitialized) {
            return;
        }
        
        // Prevent concurrent saves
        if (this.currentSaveOperation) {
            await this.currentSaveOperation;
            return;
        }
        
        const pendingChanges = this.changeTracker.getPendingChanges();
        if (pendingChanges.length === 0) {
            return;
        }
        
        const startTime = Date.now();
        const changeCount = pendingChanges.length;
        
        this.currentSaveOperation = this.executeSave(urgent, startTime, changeCount, reason);
        
        try {
            await this.currentSaveOperation;
        } finally {
            this.currentSaveOperation = null;
        }
    }
    
    /**
     * Executes the save operation
     */
    private async executeSave(urgent: boolean, startTime: number, changeCount: number, reason?: string): Promise<void> {
        try {
            this.notificationService.notifySaveStarted(changeCount, urgent);
            
            // Create backup if needed
            if (this.config.autoBackup && this.shouldCreateBackup()) {
                try {
                    await this.storageService.createBackup();
                    this.lastBackupTime = new Date();
                    this.logger.debug('Backup created before save');
                } catch (error) {
                    this.logger.warn('Failed to create backup before save', error);
                    // Continue with save even if backup fails
                }
            }
            
            // Load current goals and save them
            const goals = await this.storageService.loadGoals();
            const saveResult = await this.storageService.saveGoals(goals);
            
            if (!saveResult.success) {
                throw new Error(saveResult.error || 'Save operation failed');
            }
            
            // Clear tracked changes after successful save
            this.changeTracker.clearChanges();
            
            const duration = Date.now() - startTime;
            
            // Update statistics
            this.saveStatistics.totalSaves++;
            this.saveStatistics.successfulSaves++;
            this.saveStatistics.totalDuration += duration;
            this.saveStatistics.totalChanges += changeCount;
            this.saveStatistics.lastError = undefined;
            
            // Notify about successful save
            this.notificationService.notifySaveCompleted(
                changeCount,
                duration,
                saveResult.dataSize || 0
            );
            
            if (this.config.showNotifications && changeCount > 10) {
                this.notificationService.notify(
                    'info',
                    `Auto-save completed: ${changeCount} changes saved`
                );
            }
            
        } catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // Update statistics
            this.saveStatistics.totalSaves++;
            this.saveStatistics.failedSaves++;
            this.saveStatistics.totalDuration += duration;
            this.saveStatistics.lastError = errorMessage;
            
            // Notify about failed save
            this.notificationService.notifySaveFailed(errorMessage, changeCount, duration);
            
            if (this.config.showNotifications) {
                this.notificationService.notify(
                    'error',
                    `Auto-save failed: ${errorMessage}`,
                    { changeCount, duration }
                );
            }
            
            this.logger.error('Save operation failed', error);
            throw error;
        }
    }
    
    /**
     * Determines if urgent save should be triggered
     */
    private shouldTriggerUrgentSave(): boolean {
        const pendingChanges = this.changeTracker.getPendingChanges();
        
        // Check for urgent change types
        return pendingChanges.some(change => 
            change.type === ChangeType.GOAL_DELETED ||
            change.type === ChangeType.TASK_DELETED ||
            change.type === ChangeType.GOAL_HIERARCHY_CHANGED ||
            change.type === ChangeType.BULK_OPERATION ||
            change.metadata?.urgent === true
        );
    }
    
    /**
     * Determines if a backup should be created
     */
    private shouldCreateBackup(): boolean {
        if (!this.lastBackupTime) {
            return true;
        }
        
        const timeSinceBackup = Date.now() - this.lastBackupTime.getTime();
        return timeSinceBackup >= this.config.backupInterval;
    }
    
    /**
     * Gets the time of the last successful save
     */
    private getLastSaveTime(): Date | undefined {
        // This would ideally come from storage service metadata
        // For now, we'll estimate based on when changes were cleared
        return undefined; // TODO: Implement proper last save tracking
    }
    
    /**
     * Gets the next scheduled save time
     */
    private getNextScheduledSave(): Date | undefined {
        if (this.debouncedSave.isPending()) {
            return new Date(Date.now() + this.config.debounceDelay);
        }
        if (this.urgentSave.isPending()) {
            return new Date(Date.now() + this.config.urgentDelay);
        }
        return undefined;
    }
    
    /**
     * Gets details about the current save operation
     */
    private getCurrentOperationDetails(): AutoSaveStatus['currentOperation'] {
        if (!this.currentSaveOperation) {
            return undefined;
        }
        
        return {
            startTime: new Date(), // TODO: Track actual start time
            changeCount: this.changeTracker.getPendingChanges().length,
            urgent: this.changeTracker.hasUrgentChanges()
        };
    }
}

/**
 * Utility functions for auto-save management
 */
export class AutoSaveUtils {
    /**
     * Creates a default auto-save configuration based on use case
     */
    static createConfig(preset: 'responsive' | 'balanced' | 'conservative'): AutoSaveConfig {
        const baseConfig: AutoSaveConfig = {
            enabled: true,
            debounceDelay: 1000,
            maxDelay: 5000,
            urgentDelay: 250,
            maxChangesPerBatch: 50,
            showNotifications: false,
            autoBackup: true,
            backupInterval: 5 * 60 * 1000,
            enableLogging: true
        };
        
        switch (preset) {
            case 'responsive':
                return {
                    ...baseConfig,
                    debounceDelay: 500,
                    maxDelay: 2000,
                    urgentDelay: 100,
                    maxChangesPerBatch: 25
                };
                
            case 'balanced':
                return baseConfig;
                
            case 'conservative':
                return {
                    ...baseConfig,
                    debounceDelay: 2000,
                    maxDelay: 10000,
                    urgentDelay: 500,
                    maxChangesPerBatch: 100,
                    backupInterval: 10 * 60 * 1000
                };
                
            default:
                return baseConfig;
        }
    }
    
    /**
     * Validates auto-save configuration
     */
    static validateConfig(config: Partial<AutoSaveConfig>): string[] {
        const errors: string[] = [];
        
        if (config.debounceDelay !== undefined && config.debounceDelay < 0) {
            errors.push('debounceDelay must be non-negative');
        }
        
        if (config.maxDelay !== undefined && config.maxDelay < 0) {
            errors.push('maxDelay must be non-negative');
        }
        
        if (config.urgentDelay !== undefined && config.urgentDelay < 0) {
            errors.push('urgentDelay must be non-negative');
        }
        
        if (config.maxChangesPerBatch !== undefined && config.maxChangesPerBatch <= 0) {
            errors.push('maxChangesPerBatch must be positive');
        }
        
        if (config.backupInterval !== undefined && config.backupInterval < 0) {
            errors.push('backupInterval must be non-negative');
        }
        
        if (
            config.debounceDelay !== undefined &&
            config.maxDelay !== undefined &&
            config.debounceDelay > config.maxDelay
        ) {
            errors.push('debounceDelay cannot be greater than maxDelay');
        }
        
        return errors;
    }
}