import { Goal, Task, GoalStatus, TaskStatus } from '../models';
import { StorageService } from './storageService';
import { StateManager } from './stateManager';
import { DependencyService } from './dependencyService';
import { generateId } from '../utils';

/**
 * GoalManager handles all business logic related to goal operations.
 * This includes creating, updating, deleting goals and managing their lifecycle.
 */
export class GoalManager {
    private storageService: StorageService;
    private stateManager: StateManager;
    private dependencyService: DependencyService;

    constructor(
        storageService: StorageService,
        stateManager: StateManager,
        dependencyService: DependencyService
    ) {
        this.storageService = storageService;
        this.stateManager = stateManager;
        this.dependencyService = dependencyService;
    }

    /**
     * Creates a new goal with the specified title and optional parent
     */
    async createGoal(title: string, description?: string, parentId?: string): Promise<Goal> {
        const goal: Goal = {
            id: generateId(),
            title,
            description,
            status: 'planned',
            parentId,
            blockedByIds: [],
            tasks: [],
            createdAt: new Date(),
        };

        // Add to state and persist
        this.stateManager.addGoal(goal);
        await this.storageService.saveGoals(this.stateManager.getAllGoals());

        return goal;
    }

    /**
     * Updates an existing goal
     */
    async updateGoal(goalId: string, updates: Partial<Goal>): Promise<Goal> {
        const existingGoal = this.stateManager.getGoal(goalId);
        if (!existingGoal) {
            throw new Error(`Goal with id ${goalId} not found`);
        }

        const updatedGoal: Goal = { ...existingGoal, ...updates };
        
        // Handle status changes
        if (updates.status === 'completed' && existingGoal.status !== 'completed') {
            updatedGoal.completedAt = new Date();
            // Auto-unblock dependent goals
            await this.dependencyService.unblockDependentGoals(goalId);
        }

        this.stateManager.updateGoal(updatedGoal);
        await this.storageService.saveGoals(this.stateManager.getAllGoals());

        return updatedGoal;
    }

    /**
     * Deletes a goal and all its children
     */
    async deleteGoal(goalId: string): Promise<void> {
        // Remove dependencies first
        await this.dependencyService.removeAllDependencies(goalId);
        
        // Get all child goals for deletion
        const childGoals = this.stateManager.getChildGoals(goalId);
        
        // Delete children recursively
        for (const childGoal of childGoals) {
            await this.deleteGoal(childGoal.id);
        }

        // Delete the goal itself
        this.stateManager.removeGoal(goalId);
        await this.storageService.saveGoals(this.stateManager.getAllGoals());
    }

    /**
     * Adds a task to a goal
     */
    async addTask(goalId: string, title: string): Promise<Task> {
        const goal = this.stateManager.getGoal(goalId);
        if (!goal) {
            throw new Error(`Goal with id ${goalId} not found`);
        }

        const task: Task = {
            id: generateId(),
            title,
            status: 'todo',
            order: goal.tasks.length,
            createdAt: new Date(),
        };

        goal.tasks.push(task);
        this.stateManager.updateGoal(goal);
        await this.storageService.saveGoals(this.stateManager.getAllGoals());

        return task;
    }

    /**
     * Updates a task within a goal
     */
    async updateTask(goalId: string, taskId: string, updates: Partial<Task>): Promise<Task> {
        const goal = this.stateManager.getGoal(goalId);
        if (!goal) {
            throw new Error(`Goal with id ${goalId} not found`);
        }

        const taskIndex = goal.tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) {
            throw new Error(`Task with id ${taskId} not found in goal ${goalId}`);
        }

        const updatedTask: Task = { ...goal.tasks[taskIndex], ...updates };
        
        // Handle completion
        if (updates.status === 'done' && goal.tasks[taskIndex].status !== 'done') {
            updatedTask.completedAt = new Date();
        }

        goal.tasks[taskIndex] = updatedTask;
        this.stateManager.updateGoal(goal);
        await this.storageService.saveGoals(this.stateManager.getAllGoals());

        return updatedTask;
    }

    /**
     * Removes a task from a goal
     */
    async removeTask(goalId: string, taskId: string): Promise<void> {
        const goal = this.stateManager.getGoal(goalId);
        if (!goal) {
            throw new Error(`Goal with id ${goalId} not found`);
        }

        goal.tasks = goal.tasks.filter(t => t.id !== taskId);
        this.stateManager.updateGoal(goal);
        await this.storageService.saveGoals(this.stateManager.getAllGoals());
    }

    /**
     * Reorders tasks within a goal
     */
    async reorderTasks(goalId: string, taskId: string, newOrder: number): Promise<void> {
        const goal = this.stateManager.getGoal(goalId);
        if (!goal) {
            throw new Error(`Goal with id ${goalId} not found`);
        }

        const taskIndex = goal.tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) {
            throw new Error(`Task with id ${taskId} not found in goal ${goalId}`);
        }

        // Remove task from current position
        const [task] = goal.tasks.splice(taskIndex, 1);
        
        // Insert at new position
        goal.tasks.splice(newOrder, 0, task);
        
        // Update order values
        goal.tasks.forEach((t, index) => {
            t.order = index;
        });

        this.stateManager.updateGoal(goal);
        await this.storageService.saveGoals(this.stateManager.getAllGoals());
    }

    /**
     * Gets the completion progress for a goal
     */
    getGoalProgress(goalId: string): { completed: number; total: number; percentage: number } {
        const goal = this.stateManager.getGoal(goalId);
        if (!goal) {
            return { completed: 0, total: 0, percentage: 0 };
        }

        const childGoals = this.stateManager.getChildGoals(goalId);
        const completedTasks = goal.tasks.filter(t => t.status === 'done').length;
        const completedChildGoals = childGoals.filter(g => g.status === 'completed').length;
        
        const totalTasks = goal.tasks.length;
        const totalChildGoals = childGoals.length;
        const total = totalTasks + totalChildGoals;
        const completed = completedTasks + completedChildGoals;
        
        return {
            completed,
            total,
            percentage: total > 0 ? Math.round((completed / total) * 100) : 0
        };
    }
}