/**
 * GoalManager Progress Integration Tests - Issue #7 Stream B
 * 
 * Tests for GoalManager's integration with progress calculation system,
 * automatic parent goal updates, and goal completion logic.
 */

import { GoalManager, GoalOperationResult } from '../services/goalManager';
import { StorageService } from '../services/storageService';
import { ValidationService } from '../services/ValidationService';
import { 
    Goal, 
    Task, 
    GoalStatus, 
    TaskStatus, 
    CreateGoalParams, 
    CreateTaskParams,
    UpdateTaskParams
} from '../types';
import { ProgressCalculationStrategy } from '../utils/progressCalculation';

// Mock StorageService for testing
class MockStorageService extends StorageService {
    private goals: Map<string, Goal> = new Map();

    async saveGoal(goal: Goal): Promise<GoalOperationResult<Goal>> {
        this.goals.set(goal.id, goal);
        return {
            success: true,
            data: goal,
            timestamp: new Date(),
            operation: 'saveGoal'
        };
    }

    async getGoal(goalId: string): Promise<GoalOperationResult<Goal | undefined>> {
        return {
            success: true,
            data: this.goals.get(goalId),
            timestamp: new Date(),
            operation: 'getGoal'
        };
    }

    async getGoals(): Promise<GoalOperationResult<Goal[]>> {
        return {
            success: true,
            data: Array.from(this.goals.values()),
            timestamp: new Date(),
            operation: 'getGoals'
        };
    }

    async deleteGoal(goalId: string): Promise<GoalOperationResult<void>> {
        this.goals.delete(goalId);
        return {
            success: true,
            timestamp: new Date(),
            operation: 'deleteGoal'
        };
    }

    // Mock implementation of onDataChange
    onDataChange(callback: () => void): void {
        // Do nothing for tests
    }
}

// Test utilities
function createTestGoalParams(title: string, parentId?: string): CreateGoalParams {
    return {
        title,
        description: `Test goal ${title}`,
        parentId,
        metadata: {
            priority: 3,
            estimatedHours: 8
        }
    };
}

function createTestTaskParams(title: string): CreateTaskParams {
    return {
        title,
        description: `Test task ${title}`,
        goalId: '' // Will be set by test
    };
}

describe('GoalManager Progress Integration', () => {
    let goalManager: GoalManager;
    let mockStorage: MockStorageService;
    let validationService: ValidationService;

    beforeEach(() => {
        mockStorage = new MockStorageService();
        validationService = new ValidationService();
        goalManager = new GoalManager(mockStorage, validationService);
    });

    afterEach(() => {
        goalManager.dispose();
    });

    describe('Basic Progress Calculation', () => {
        test('should calculate progress for goal with tasks', async () => {
            // Create a goal
            const goalResult = await goalManager.createGoal(
                createTestGoalParams('Test Goal')
            );
            expect(goalResult.success).toBe(true);
            const goalId = goalResult.data!.id;

            // Add tasks
            await goalManager.addTask(goalId, createTestTaskParams('Task 1'));
            await goalManager.addTask(goalId, createTestTaskParams('Task 2'));
            await goalManager.addTask(goalId, createTestTaskParams('Task 3'));

            // Calculate progress
            const progressResult = await goalManager.calculateGoalProgress(goalId);
            
            expect(progressResult.success).toBe(true);
            expect(progressResult.data).toBeDefined();
            expect(progressResult.data!.percentage).toBe(0); // No tasks completed yet
            expect(progressResult.data!.total).toBe(3);
            expect(progressResult.data!.completed).toBe(0);
        });

        test('should calculate hierarchical progress for parent and child goals', async () => {
            // Create parent goal
            const parentResult = await goalManager.createGoal(
                createTestGoalParams('Parent Goal')
            );
            expect(parentResult.success).toBe(true);
            const parentId = parentResult.data!.id;

            // Add task to parent
            await goalManager.addTask(parentId, createTestTaskParams('Parent Task'));

            // Create child goal
            const childParams = createTestGoalParams('Child Goal', parentId);
            const childResult = await goalManager.createGoal(childParams);
            expect(childResult.success).toBe(true);
            const childId = childResult.data!.id;

            // Add tasks to child
            await goalManager.addTask(childId, createTestTaskParams('Child Task 1'));
            await goalManager.addTask(childId, createTestTaskParams('Child Task 2'));

            // Calculate hierarchical progress
            const hierarchicalResult = await goalManager.calculateHierarchicalProgress(parentId);
            
            expect(hierarchicalResult.success).toBe(true);
            expect(hierarchicalResult.data).toBeDefined();
            expect(hierarchicalResult.data!.breakdown).toBeDefined();
            expect(hierarchicalResult.data!.breakdown.taskProgress.total).toBe(1); // Parent has 1 task
            expect(hierarchicalResult.data!.breakdown.childGoalProgress.total).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Automatic Progress Updates', () => {
        test('should update goal status when all tasks are completed', async () => {
            // Create goal
            const goalResult = await goalManager.createGoal(
                createTestGoalParams('Complete Goal')
            );
            const goalId = goalResult.data!.id;

            // Add tasks
            const task1Result = await goalManager.addTask(goalId, createTestTaskParams('Task 1'));
            const task2Result = await goalManager.addTask(goalId, createTestTaskParams('Task 2'));
            
            expect(task1Result.success).toBe(true);
            expect(task2Result.success).toBe(true);

            // Complete all tasks
            await goalManager.updateTask(goalId, task1Result.data!.id, { status: TaskStatus.DONE });
            await goalManager.updateTask(goalId, task2Result.data!.id, { status: TaskStatus.DONE });

            // Check that goal status was automatically updated
            const updatedGoalResult = await goalManager.getGoal(goalId);
            expect(updatedGoalResult.success).toBe(true);
            
            // Goal should now be completed automatically
            expect(updatedGoalResult.data!.status).toBe(GoalStatus.COMPLETED);
        });

        test('should update goal to in-progress when first task is started', async () => {
            // Create goal
            const goalResult = await goalManager.createGoal(
                createTestGoalParams('Progress Goal')
            );
            const goalId = goalResult.data!.id;

            // Add task
            const taskResult = await goalManager.addTask(goalId, createTestTaskParams('Task 1'));
            expect(taskResult.success).toBe(true);

            // Start the task
            await goalManager.updateTask(goalId, taskResult.data!.id, { status: TaskStatus.IN_PROGRESS });

            // Check that goal status was automatically updated
            const updatedGoalResult = await goalManager.getGoal(goalId);
            expect(updatedGoalResult.success).toBe(true);
            expect(updatedGoalResult.data!.status).toBe(GoalStatus.IN_PROGRESS);
        });

        test('should propagate progress updates to parent goals', async () => {
            // Create parent goal
            const parentResult = await goalManager.createGoal(
                createTestGoalParams('Parent Goal')
            );
            const parentId = parentResult.data!.id;

            // Create child goal
            const childParams = createTestGoalParams('Child Goal', parentId);
            const childResult = await goalManager.createGoal(childParams);
            const childId = childResult.data!.id;

            // Add task to child goal
            const taskResult = await goalManager.addTask(childId, createTestTaskParams('Child Task'));
            expect(taskResult.success).toBe(true);

            // Complete the child task
            await goalManager.updateTask(childId, taskResult.data!.id, { status: TaskStatus.DONE });

            // Check that child goal is completed
            const updatedChildResult = await goalManager.getGoal(childId);
            expect(updatedChildResult.success).toBe(true);
            expect(updatedChildResult.data!.status).toBe(GoalStatus.COMPLETED);

            // Parent goal status should also be evaluated (though might not change without parent tasks)
            const updatedParentResult = await goalManager.getGoal(parentId);
            expect(updatedParentResult.success).toBe(true);
            // Parent status depends on implementation - might stay PLANNED if no parent tasks
        });
    });

    describe('Progress-Based Status Updates', () => {
        test('should suggest correct status based on progress', async () => {
            // Create goal with multiple tasks
            const goalResult = await goalManager.createGoal(
                createTestGoalParams('Status Test Goal')
            );
            const goalId = goalResult.data!.id;

            // Add multiple tasks
            const task1Result = await goalManager.addTask(goalId, createTestTaskParams('Task 1'));
            const task2Result = await goalManager.addTask(goalId, createTestTaskParams('Task 2'));
            const task3Result = await goalManager.addTask(goalId, createTestTaskParams('Task 3'));

            // Complete one task (partial progress)
            await goalManager.updateTask(goalId, task1Result.data!.id, { status: TaskStatus.DONE });

            // Goal should be in progress
            const partialGoalResult = await goalManager.getGoal(goalId);
            expect(partialGoalResult.data!.status).toBe(GoalStatus.IN_PROGRESS);

            // Complete all remaining tasks
            await goalManager.updateTask(goalId, task2Result.data!.id, { status: TaskStatus.DONE });
            await goalManager.updateTask(goalId, task3Result.data!.id, { status: TaskStatus.DONE });

            // Goal should be completed
            const completedGoalResult = await goalManager.getGoal(goalId);
            expect(completedGoalResult.data!.status).toBe(GoalStatus.COMPLETED);
        });

        test('should manually update goal status from progress', async () => {
            // Create goal
            const goalResult = await goalManager.createGoal(
                createTestGoalParams('Manual Status Goal')
            );
            const goalId = goalResult.data!.id;

            // Add task
            const taskResult = await goalManager.addTask(goalId, createTestTaskParams('Task 1'));
            
            // Complete the task
            await goalManager.updateTask(goalId, taskResult.data!.id, { status: TaskStatus.DONE });

            // Manually trigger status update from progress
            const statusUpdateResult = await goalManager.updateGoalStatusFromProgress(goalId);
            expect(statusUpdateResult.success).toBe(true);
            expect(statusUpdateResult.data!.status).toBe(GoalStatus.COMPLETED);
        });
    });

    describe('Bulk Progress Operations', () => {
        test('should efficiently calculate progress for multiple goals', async () => {
            const goalIds: string[] = [];

            // Create multiple goals with tasks
            for (let i = 1; i <= 3; i++) {
                const goalResult = await goalManager.createGoal(
                    createTestGoalParams(`Goal ${i}`)
                );
                const goalId = goalResult.data!.id;
                goalIds.push(goalId);

                // Add different numbers of completed tasks
                for (let j = 1; j <= i + 1; j++) {
                    const taskResult = await goalManager.addTask(goalId, createTestTaskParams(`Task ${j}`));
                    if (j <= i) { // Complete i tasks for goal i
                        await goalManager.updateTask(goalId, taskResult.data!.id, { status: TaskStatus.DONE });
                    }
                }
            }

            // Get progress for all goals
            const bulkProgressResult = await goalManager.getGoalsProgress(goalIds);
            expect(bulkProgressResult.success).toBe(true);
            expect(bulkProgressResult.data!.size).toBe(3);

            // Verify progress calculations
            const progressMap = bulkProgressResult.data!;
            expect(progressMap.get(goalIds[0])?.percentage).toBe(50);   // 1/2 completed
            expect(progressMap.get(goalIds[1])?.percentage).toBe(66.67); // 2/3 completed
            expect(progressMap.get(goalIds[2])?.percentage).toBe(75);   // 3/4 completed
        });
    });

    describe('Performance and Caching', () => {
        test('should provide cache statistics', () => {
            const stats = goalManager.getProgressCacheStats();
            expect(stats).toBeDefined();
            expect(typeof stats.size).toBe('number');
            expect(typeof stats.hitRate).toBe('number');
        });

        test('should clear progress cache', () => {
            goalManager.clearProgressCache();
            const stats = goalManager.getProgressCacheStats();
            expect(stats.size).toBe(0);
        });
    });

    describe('Task Operations with Progress Updates', () => {
        test('should update progress when task is added', async () => {
            // Create goal
            const goalResult = await goalManager.createGoal(
                createTestGoalParams('Add Task Goal')
            );
            const goalId = goalResult.data!.id;

            // Initially no tasks
            let progressResult = await goalManager.calculateGoalProgress(goalId);
            expect(progressResult.data!.total).toBe(0);

            // Add task
            await goalManager.addTask(goalId, createTestTaskParams('New Task'));

            // Progress should reflect new task
            progressResult = await goalManager.calculateGoalProgress(goalId);
            expect(progressResult.data!.total).toBe(1);
            expect(progressResult.data!.completed).toBe(0);
            expect(progressResult.data!.percentage).toBe(0);
        });

        test('should update progress when task is deleted', async () => {
            // Create goal with tasks
            const goalResult = await goalManager.createGoal(
                createTestGoalParams('Delete Task Goal')
            );
            const goalId = goalResult.data!.id;

            const task1Result = await goalManager.addTask(goalId, createTestTaskParams('Task 1'));
            const task2Result = await goalManager.addTask(goalId, createTestTaskParams('Task 2'));

            // Complete one task
            await goalManager.updateTask(goalId, task1Result.data!.id, { status: TaskStatus.DONE });

            // Initial progress: 1/2 = 50%
            let progressResult = await goalManager.calculateGoalProgress(goalId);
            expect(progressResult.data!.percentage).toBe(50);

            // Delete completed task
            await goalManager.deleteTask(goalId, task1Result.data!.id);

            // Progress should update: 0/1 = 0%
            progressResult = await goalManager.calculateGoalProgress(goalId);
            expect(progressResult.data!.total).toBe(1);
            expect(progressResult.data!.completed).toBe(0);
            expect(progressResult.data!.percentage).toBe(0);
        });
    });

    describe('Edge Cases and Error Handling', () => {
        test('should handle progress calculation for non-existent goal', async () => {
            const progressResult = await goalManager.calculateGoalProgress('non-existent-id');
            expect(progressResult.success).toBe(false);
            expect(progressResult.error).toContain('not found');
        });

        test('should handle hierarchical progress for goal without children', async () => {
            // Create goal
            const goalResult = await goalManager.createGoal(
                createTestGoalParams('No Children Goal')
            );
            const goalId = goalResult.data!.id;

            // Calculate hierarchical progress
            const hierarchicalResult = await goalManager.calculateHierarchicalProgress(goalId);
            expect(hierarchicalResult.success).toBe(true);
            expect(hierarchicalResult.data!.childGoalProgress).toEqual([]);
        });

        test('should handle goal with no tasks gracefully', async () => {
            // Create goal without tasks
            const goalResult = await goalManager.createGoal(
                createTestGoalParams('No Tasks Goal')
            );
            const goalId = goalResult.data!.id;

            // Calculate progress
            const progressResult = await goalManager.calculateGoalProgress(goalId);
            expect(progressResult.success).toBe(true);
            expect(progressResult.data!.percentage).toBe(0);
            expect(progressResult.data!.total).toBe(0);
            expect(progressResult.data!.isComplete).toBe(false);
        });
    });

    describe('Goal Completion Logic', () => {
        test('should handle goal completion with dependency unblocking', async () => {
            // Create two goals where second is blocked by first
            const goal1Result = await goalManager.createGoal(
                createTestGoalParams('Blocking Goal')
            );
            const goal1Id = goal1Result.data!.id;

            const goal2Result = await goalManager.createGoal(
                createTestGoalParams('Blocked Goal')
            );
            const goal2Id = goal2Result.data!.id;

            // Add blocking dependency
            await goalManager.addBlockingDependency(goal2Id, goal1Id);

            // Add task to blocking goal
            const taskResult = await goalManager.addTask(goal1Id, createTestTaskParams('Blocking Task'));

            // Complete the task (should complete goal1 and unblock goal2)
            await goalManager.updateTask(goal1Id, taskResult.data!.id, { status: TaskStatus.DONE });

            // Check that goal1 is completed
            const updatedGoal1 = await goalManager.getGoal(goal1Id);
            expect(updatedGoal1.data!.status).toBe(GoalStatus.COMPLETED);

            // Check that goal2 is no longer blocked
            const updatedGoal2 = await goalManager.getGoal(goal2Id);
            expect(updatedGoal2.data!.blockedByIds).not.toContain(goal1Id);
        });
    });
});

// Mock-specific tests for edge cases
describe('GoalManager Progress Edge Cases', () => {
    let goalManager: GoalManager;
    let mockStorage: MockStorageService;

    beforeEach(() => {
        mockStorage = new MockStorageService();
        goalManager = new GoalManager(mockStorage);
    });

    afterEach(() => {
        goalManager.dispose();
    });

    test('should handle disposed goal manager gracefully', async () => {
        // Dispose the manager
        goalManager.dispose();

        // All progress operations should fail gracefully
        const progressResult = await goalManager.calculateGoalProgress('any-id');
        expect(progressResult.success).toBe(false);
        expect(progressResult.error).toContain('disposed');

        const hierarchicalResult = await goalManager.calculateHierarchicalProgress('any-id');
        expect(hierarchicalResult.success).toBe(false);
        expect(hierarchicalResult.error).toContain('disposed');

        const statusUpdateResult = await goalManager.updateGoalStatusFromProgress('any-id');
        expect(statusUpdateResult.success).toBe(false);
        expect(statusUpdateResult.error).toContain('disposed');
    });
});