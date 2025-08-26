import * as vscode from 'vscode';
import { Goal } from '../models';

/**
 * StorageService handles persistence of goal data using VS Code's workspace storage.
 * Provides JSON-based storage with backup and recovery capabilities.
 */
export class StorageService {
    private context: vscode.ExtensionContext;
    private readonly STORAGE_KEY = 'goalTreeData';
    private readonly BACKUP_KEY = 'goalTreeDataBackup';

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Loads all goals from workspace storage
     */
    async loadGoals(): Promise<Goal[]> {
        try {
            const data = this.context.workspaceState.get<Goal[]>(this.STORAGE_KEY, []);
            
            // Validate data structure
            if (!Array.isArray(data)) {
                console.warn('Invalid goal data found, attempting backup recovery');
                return await this.recoverFromBackup();
            }

            // Validate each goal has required fields
            const validatedGoals = data.filter(this.isValidGoal);
            
            if (validatedGoals.length !== data.length) {
                console.warn(`Filtered out ${data.length - validatedGoals.length} invalid goals`);
            }

            return validatedGoals;
        } catch (error) {
            console.error('Failed to load goals:', error);
            return await this.recoverFromBackup();
        }
    }

    /**
     * Saves goals to workspace storage with backup
     */
    async saveGoals(goals: Goal[]): Promise<void> {
        try {
            // Create backup before saving
            await this.createBackup();
            
            // Validate goals before saving
            const validGoals = goals.filter(this.isValidGoal);
            
            // Save to primary storage
            await this.context.workspaceState.update(this.STORAGE_KEY, validGoals);
            
        } catch (error) {
            console.error('Failed to save goals:', error);
            throw new Error(`Storage operation failed: ${error}`);
        }
    }

    /**
     * Creates a backup of current goal data
     */
    async createBackup(): Promise<void> {
        try {
            const currentData = this.context.workspaceState.get<Goal[]>(this.STORAGE_KEY, []);
            await this.context.workspaceState.update(this.BACKUP_KEY, {
                data: currentData,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Failed to create backup:', error);
        }
    }

    /**
     * Recovers goals from backup
     */
    async recoverFromBackup(): Promise<Goal[]> {
        try {
            const backup = this.context.workspaceState.get<{data: Goal[], timestamp: string}>(this.BACKUP_KEY);
            
            if (backup && Array.isArray(backup.data)) {
                console.info(`Recovering ${backup.data.length} goals from backup created at ${backup.timestamp}`);
                return backup.data.filter(this.isValidGoal);
            }
        } catch (error) {
            console.error('Failed to recover from backup:', error);
        }
        
        return [];
    }

    /**
     * Exports goals to JSON for external backup
     */
    async exportGoals(): Promise<string> {
        const goals = await this.loadGoals();
        return JSON.stringify({
            version: '1.0',
            exportedAt: new Date().toISOString(),
            goals
        }, null, 2);
    }

    /**
     * Imports goals from JSON with validation
     */
    async importGoals(jsonData: string, overwrite: boolean = false): Promise<{ imported: number; errors: string[] }> {
        const errors: string[] = [];
        let imported = 0;

        try {
            const data = JSON.parse(jsonData);
            
            if (!data.goals || !Array.isArray(data.goals)) {
                throw new Error('Invalid import format: missing goals array');
            }

            const currentGoals = overwrite ? [] : await this.loadGoals();
            const importGoals = data.goals.filter((goal: any) => {
                if (this.isValidGoal(goal)) {
                    // Check for ID conflicts
                    const exists = currentGoals.some(existing => existing.id === goal.id);
                    if (exists && !overwrite) {
                        errors.push(`Goal with ID ${goal.id} already exists`);
                        return false;
                    }
                    return true;
                } else {
                    errors.push(`Invalid goal structure: ${goal.title || 'Unknown'}`);
                    return false;
                }
            });

            const mergedGoals = overwrite ? importGoals : [...currentGoals, ...importGoals];
            await this.saveGoals(mergedGoals);
            imported = importGoals.length;

        } catch (error) {
            errors.push(`Import failed: ${error}`);
        }

        return { imported, errors };
    }

    /**
     * Clears all goal data (with backup)
     */
    async clearAllData(): Promise<void> {
        await this.createBackup();
        await this.context.workspaceState.update(this.STORAGE_KEY, []);
    }

    /**
     * Gets storage statistics
     */
    getStorageInfo(): { goalCount: number; lastBackup?: string; storageUsed: number } {
        const goals = this.context.workspaceState.get<Goal[]>(this.STORAGE_KEY, []);
        const backup = this.context.workspaceState.get<{data: Goal[], timestamp: string}>(this.BACKUP_KEY);
        
        return {
            goalCount: goals.length,
            lastBackup: backup?.timestamp,
            storageUsed: JSON.stringify(goals).length
        };
    }

    /**
     * Validates if an object is a valid Goal
     */
    private isValidGoal(goal: any): goal is Goal {
        return goal &&
            typeof goal.id === 'string' &&
            typeof goal.title === 'string' &&
            typeof goal.status === 'string' &&
            ['planned', 'in-progress', 'blocked', 'completed'].includes(goal.status) &&
            Array.isArray(goal.blockedByIds) &&
            Array.isArray(goal.tasks) &&
            goal.createdAt &&
            (goal.parentId === undefined || typeof goal.parentId === 'string') &&
            (goal.description === undefined || typeof goal.description === 'string');
    }
}