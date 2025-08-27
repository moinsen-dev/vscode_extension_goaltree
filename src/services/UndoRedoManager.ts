/**
 * UndoRedoManager Service - Undo/Redo capabilities for goal operations
 * 
 * This service provides comprehensive undo/redo functionality including:
 * - Command pattern implementation for all goal operations
 * - Undo/redo stack management
 * - Operation grouping for complex transactions
 * - State snapshots for rollback operations
 * - Integration with EventManager for operation tracking
 */

import {
    Goal,
    Task,
    CreateGoalParams,
    UpdateGoalParams,
    CreateTaskParams,
    UpdateTaskParams,
    GoalEvent,
    GoalEventType,
    GoalEventUtils
} from '../types';

/**
 * Base interface for all undoable commands
 */
export interface UndoableCommand {
    /** Unique identifier for the command */
    id: string;
    
    /** Human-readable description of the command */
    description: string;
    
    /** Timestamp when the command was executed */
    timestamp: Date;
    
    /** Execute the command */
    execute(): Promise<void> | void;
    
    /** Undo the command */
    undo(): Promise<void> | void;
    
    /** Whether this command can be undone */
    canUndo(): boolean;
    
    /** Whether this command can be redone */
    canRedo(): boolean;
    
    /** Related goal IDs affected by this command */
    affectedGoalIds: string[];
    
    /** Command metadata */
    metadata?: Record<string, any>;
}

/**
 * Command group for transaction-like operations
 */
export interface CommandGroup {
    /** Group identifier */
    id: string;
    
    /** Group description */
    description: string;
    
    /** Commands in this group */
    commands: UndoableCommand[];
    
    /** Timestamp when group was created */
    timestamp: Date;
    
    /** Whether this group can be treated as atomic */
    atomic: boolean;
}

/**
 * Undo/Redo operation result
 */
export interface UndoRedoResult {
    /** Whether the operation was successful */
    success: boolean;
    
    /** Commands that were processed */
    commandsProcessed: number;
    
    /** Error message if operation failed */
    error?: string;
    
    /** Commands that failed during operation */
    failedCommands?: Array<{
        command: UndoableCommand;
        error: string;
    }>;
}

/**
 * State snapshot for complex rollback operations
 */
interface StateSnapshot {
    id: string;
    timestamp: Date;
    description: string;
    goalStates: Map<string, Goal>;
    metadata?: Record<string, any>;
}

/**
 * UndoRedoManager provides undo/redo capabilities for goal operations
 */
export class UndoRedoManager {
    private undoStack: (UndoableCommand | CommandGroup)[] = [];
    private redoStack: (UndoableCommand | CommandGroup)[] = [];
    private stateSnapshots: StateSnapshot[] = [];
    private maxStackSize: number = 100;
    private maxSnapshotCount: number = 10;
    private currentGroup: CommandGroup | null = null;
    private logger: (message: string) => void;
    private isDisposed: boolean = false;

    constructor(
        maxStackSize: number = 100,
        maxSnapshotCount: number = 10,
        logger?: (message: string) => void
    ) {
        this.maxStackSize = maxStackSize;
        this.maxSnapshotCount = maxSnapshotCount;
        this.logger = logger || ((message: string) => console.log(`UndoRedoManager: ${message}`));
        this.log('UndoRedoManager initialized');
    }

    // ===========================================
    // Command Execution Methods
    // ===========================================

    /**
     * Execute a command and add it to the undo stack
     */
    async executeCommand(command: UndoableCommand): Promise<void> {
        if (this.isDisposed) {
            throw new Error('UndoRedoManager has been disposed');
        }

        try {
            // Execute the command
            await command.execute();

            // Add to current group or undo stack
            if (this.currentGroup) {
                this.currentGroup.commands.push(command);
            } else {
                this.addToUndoStack(command);
            }

            // Clear redo stack since we're executing new commands
            this.redoStack = [];

            this.log(`Command executed: ${command.description} (${command.id})`);

        } catch (error) {
            this.logError('Failed to execute command', error);
            throw error;
        }
    }

    /**
     * Start a command group for atomic operations
     */
    startCommandGroup(description: string, atomic: boolean = true): string {
        if (this.currentGroup) {
            throw new Error('Cannot start command group: another group is already active');
        }

        const groupId = this.generateId('group');
        this.currentGroup = {
            id: groupId,
            description,
            commands: [],
            timestamp: new Date(),
            atomic
        };

        this.log(`Started command group: ${description} (${groupId})`);
        return groupId;
    }

    /**
     * End the current command group
     */
    endCommandGroup(): CommandGroup | null {
        if (!this.currentGroup) {
            throw new Error('No active command group to end');
        }

        const group = this.currentGroup;
        this.currentGroup = null;

        // Only add to undo stack if group has commands
        if (group.commands.length > 0) {
            this.addToUndoStack(group);
            this.log(`Ended command group: ${group.description} (${group.commands.length} commands)`);
        }

        return group;
    }

    /**
     * Cancel the current command group without adding to undo stack
     */
    cancelCommandGroup(): void {
        if (this.currentGroup) {
            const group = this.currentGroup;
            this.currentGroup = null;
            this.log(`Cancelled command group: ${group.description}`);
        }
    }

    // ===========================================
    // Undo/Redo Operations
    // ===========================================

    /**
     * Undo the last operation
     */
    async undo(): Promise<UndoRedoResult> {
        if (this.isDisposed) {
            throw new Error('UndoRedoManager has been disposed');
        }

        if (!this.canUndo()) {
            return { success: false, commandsProcessed: 0, error: 'Nothing to undo' };
        }

        const item = this.undoStack.pop()!;
        
        try {
            if (this.isCommandGroup(item)) {
                return await this.undoCommandGroup(item);
            } else {
                return await this.undoCommand(item);
            }
        } catch (error) {
            // Put the item back if undo failed
            this.undoStack.push(item);
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logError('Undo operation failed', error);
            return { 
                success: false, 
                commandsProcessed: 0, 
                error: `Undo failed: ${errorMessage}` 
            };
        }
    }

    /**
     * Redo the last undone operation
     */
    async redo(): Promise<UndoRedoResult> {
        if (this.isDisposed) {
            throw new Error('UndoRedoManager has been disposed');
        }

        if (!this.canRedo()) {
            return { success: false, commandsProcessed: 0, error: 'Nothing to redo' };
        }

        const item = this.redoStack.pop()!;

        try {
            if (this.isCommandGroup(item)) {
                return await this.redoCommandGroup(item);
            } else {
                return await this.redoCommand(item);
            }
        } catch (error) {
            // Put the item back if redo failed
            this.redoStack.push(item);
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logError('Redo operation failed', error);
            return { 
                success: false, 
                commandsProcessed: 0, 
                error: `Redo failed: ${errorMessage}` 
            };
        }
    }

    /**
     * Undo multiple operations
     */
    async undoMultiple(count: number): Promise<UndoRedoResult> {
        let totalProcessed = 0;
        const failedCommands: Array<{ command: UndoableCommand; error: string }> = [];
        let lastError: string | undefined;

        for (let i = 0; i < count && this.canUndo(); i++) {
            try {
                const result = await this.undo();
                if (result.success) {
                    totalProcessed += result.commandsProcessed;
                } else {
                    lastError = result.error;
                    break;
                }
            } catch (error) {
                lastError = error instanceof Error ? error.message : String(error);
                break;
            }
        }

        return {
            success: lastError === undefined,
            commandsProcessed: totalProcessed,
            error: lastError,
            failedCommands
        };
    }

    /**
     * Redo multiple operations
     */
    async redoMultiple(count: number): Promise<UndoRedoResult> {
        let totalProcessed = 0;
        const failedCommands: Array<{ command: UndoableCommand; error: string }> = [];
        let lastError: string | undefined;

        for (let i = 0; i < count && this.canRedo(); i++) {
            try {
                const result = await this.redo();
                if (result.success) {
                    totalProcessed += result.commandsProcessed;
                } else {
                    lastError = result.error;
                    break;
                }
            } catch (error) {
                lastError = error instanceof Error ? error.message : String(error);
                break;
            }
        }

        return {
            success: lastError === undefined,
            commandsProcessed: totalProcessed,
            error: lastError,
            failedCommands
        };
    }

    // ===========================================
    // State Snapshot Management
    // ===========================================

    /**
     * Create a state snapshot for rollback operations
     */
    createSnapshot(description: string, goalStates: Map<string, Goal>): string {
        const snapshotId = this.generateId('snapshot');
        const snapshot: StateSnapshot = {
            id: snapshotId,
            timestamp: new Date(),
            description,
            goalStates: new Map(goalStates), // Deep copy
            metadata: {}
        };

        this.stateSnapshots.push(snapshot);
        this.trimSnapshots();

        this.log(`State snapshot created: ${description} (${snapshotId})`);
        return snapshotId;
    }

    /**
     * Rollback to a specific snapshot
     */
    async rollbackToSnapshot(snapshotId: string): Promise<StateSnapshot | null> {
        const snapshot = this.stateSnapshots.find(s => s.id === snapshotId);
        if (!snapshot) {
            throw new Error(`Snapshot with id ${snapshotId} not found`);
        }

        // Clear undo/redo stacks on rollback
        this.undoStack = [];
        this.redoStack = [];

        this.log(`Rolled back to snapshot: ${snapshot.description} (${snapshotId})`);
        return snapshot;
    }

    /**
     * Get all available snapshots
     */
    getSnapshots(): StateSnapshot[] {
        return [...this.stateSnapshots];
    }

    /**
     * Remove old snapshots
     */
    clearOldSnapshots(beforeDate: Date): number {
        const originalLength = this.stateSnapshots.length;
        this.stateSnapshots = this.stateSnapshots.filter(s => s.timestamp >= beforeDate);
        const removedCount = originalLength - this.stateSnapshots.length;
        
        this.log(`Cleared ${removedCount} old snapshots before ${beforeDate.toISOString()}`);
        return removedCount;
    }

    // ===========================================
    // State Query Methods
    // ===========================================

    /**
     * Check if undo is possible
     */
    canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    /**
     * Check if redo is possible
     */
    canRedo(): boolean {
        return this.redoStack.length > 0;
    }

    /**
     * Get the description of the next operation that would be undone
     */
    getUndoDescription(): string | null {
        if (this.undoStack.length === 0) return null;
        
        const item = this.undoStack[this.undoStack.length - 1];
        return item.description;
    }

    /**
     * Get the description of the next operation that would be redone
     */
    getRedoDescription(): string | null {
        if (this.redoStack.length === 0) return null;
        
        const item = this.redoStack[this.redoStack.length - 1];
        return item.description;
    }

    /**
     * Get undo stack size
     */
    getUndoStackSize(): number {
        return this.undoStack.length;
    }

    /**
     * Get redo stack size
     */
    getRedoStackSize(): number {
        return this.redoStack.length;
    }

    /**
     * Get command history (both undo and redo stacks)
     */
    getCommandHistory(): Array<{ item: UndoableCommand | CommandGroup; stack: 'undo' | 'redo' }> {
        const history: Array<{ item: UndoableCommand | CommandGroup; stack: 'undo' | 'redo' }> = [];
        
        // Add undo stack items (most recent first)
        for (let i = this.undoStack.length - 1; i >= 0; i--) {
            history.push({ item: this.undoStack[i], stack: 'undo' });
        }
        
        // Add redo stack items (most recent first)
        for (let i = this.redoStack.length - 1; i >= 0; i--) {
            history.push({ item: this.redoStack[i], stack: 'redo' });
        }
        
        return history;
    }

    // ===========================================
    // Configuration Methods
    // ===========================================

    /**
     * Set maximum stack sizes
     */
    setMaxStackSize(size: number): void {
        this.maxStackSize = size;
        this.trimStacks();
        this.log(`Max stack size set to ${size}`);
    }

    /**
     * Set maximum snapshot count
     */
    setMaxSnapshotCount(count: number): void {
        this.maxSnapshotCount = count;
        this.trimSnapshots();
        this.log(`Max snapshot count set to ${count}`);
    }

    /**
     * Clear all undo/redo history
     */
    clear(): void {
        this.undoStack = [];
        this.redoStack = [];
        this.currentGroup = null;
        this.log('All undo/redo history cleared');
    }

    /**
     * Clear snapshots
     */
    clearSnapshots(): void {
        this.stateSnapshots = [];
        this.log('All state snapshots cleared');
    }

    // ===========================================
    // Private Helper Methods
    // ===========================================

    private async undoCommand(command: UndoableCommand): Promise<UndoRedoResult> {
        if (!command.canUndo()) {
            return { 
                success: false, 
                commandsProcessed: 0, 
                error: `Command cannot be undone: ${command.description}` 
            };
        }

        await command.undo();
        this.redoStack.push(command);
        this.trimStacks();

        this.log(`Command undone: ${command.description} (${command.id})`);
        return { success: true, commandsProcessed: 1 };
    }

    private async redoCommand(command: UndoableCommand): Promise<UndoRedoResult> {
        if (!command.canRedo()) {
            return { 
                success: false, 
                commandsProcessed: 0, 
                error: `Command cannot be redone: ${command.description}` 
            };
        }

        await command.execute();
        this.undoStack.push(command);
        this.trimStacks();

        this.log(`Command redone: ${command.description} (${command.id})`);
        return { success: true, commandsProcessed: 1 };
    }

    private async undoCommandGroup(group: CommandGroup): Promise<UndoRedoResult> {
        const failedCommands: Array<{ command: UndoableCommand; error: string }> = [];
        let commandsProcessed = 0;

        // Undo commands in reverse order
        for (let i = group.commands.length - 1; i >= 0; i--) {
            const command = group.commands[i];
            
            try {
                if (command.canUndo()) {
                    await command.undo();
                    commandsProcessed++;
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                failedCommands.push({ command, error: errorMessage });
                
                if (group.atomic) {
                    // For atomic groups, stop on first failure
                    break;
                }
            }
        }

        if (failedCommands.length > 0 && group.atomic) {
            return {
                success: false,
                commandsProcessed,
                error: `Atomic group undo failed: ${failedCommands[0].error}`,
                failedCommands
            };
        }

        this.redoStack.push(group);
        this.trimStacks();

        this.log(`Command group undone: ${group.description} (${commandsProcessed} commands)`);
        return { 
            success: failedCommands.length === 0, 
            commandsProcessed,
            failedCommands: failedCommands.length > 0 ? failedCommands : undefined
        };
    }

    private async redoCommandGroup(group: CommandGroup): Promise<UndoRedoResult> {
        const failedCommands: Array<{ command: UndoableCommand; error: string }> = [];
        let commandsProcessed = 0;

        // Redo commands in original order
        for (const command of group.commands) {
            try {
                if (command.canRedo()) {
                    await command.execute();
                    commandsProcessed++;
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                failedCommands.push({ command, error: errorMessage });
                
                if (group.atomic) {
                    // For atomic groups, stop on first failure
                    break;
                }
            }
        }

        if (failedCommands.length > 0 && group.atomic) {
            return {
                success: false,
                commandsProcessed,
                error: `Atomic group redo failed: ${failedCommands[0].error}`,
                failedCommands
            };
        }

        this.undoStack.push(group);
        this.trimStacks();

        this.log(`Command group redone: ${group.description} (${commandsProcessed} commands)`);
        return { 
            success: failedCommands.length === 0, 
            commandsProcessed,
            failedCommands: failedCommands.length > 0 ? failedCommands : undefined
        };
    }

    private addToUndoStack(item: UndoableCommand | CommandGroup): void {
        this.undoStack.push(item);
        this.trimStacks();
    }

    private trimStacks(): void {
        // Trim undo stack
        if (this.undoStack.length > this.maxStackSize) {
            const excess = this.undoStack.length - this.maxStackSize;
            this.undoStack.splice(0, excess);
        }

        // Trim redo stack
        if (this.redoStack.length > this.maxStackSize) {
            const excess = this.redoStack.length - this.maxStackSize;
            this.redoStack.splice(0, excess);
        }
    }

    private trimSnapshots(): void {
        if (this.stateSnapshots.length > this.maxSnapshotCount) {
            const excess = this.stateSnapshots.length - this.maxSnapshotCount;
            this.stateSnapshots.splice(0, excess);
        }
    }

    private isCommandGroup(item: UndoableCommand | CommandGroup): item is CommandGroup {
        return 'commands' in item && Array.isArray((item as CommandGroup).commands);
    }

    private generateId(prefix: string = 'cmd'): string {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    private log(message: string): void {
        this.logger(message);
    }

    private logError(message: string, error: unknown): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger(`ERROR: ${message} - ${errorMessage}`);
    }

    // ===========================================
    // Lifecycle Methods
    // ===========================================

    /**
     * Dispose of the UndoRedoManager and clean up resources
     */
    dispose(): void {
        if (this.isDisposed) return;

        // Clear all stacks and snapshots
        this.undoStack = [];
        this.redoStack = [];
        this.stateSnapshots = [];
        this.currentGroup = null;

        this.isDisposed = true;
        this.log('UndoRedoManager disposed');
    }
}

/**
 * Create a default UndoRedoManager instance
 */
export function createUndoRedoManager(
    maxStackSize?: number,
    maxSnapshotCount?: number,
    logger?: (message: string) => void
): UndoRedoManager {
    return new UndoRedoManager(maxStackSize, maxSnapshotCount, logger);
}