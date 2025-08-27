/**
 * Progress Calculation Tests - Issue #7 Stream B
 * 
 * Comprehensive tests for progress calculation algorithms, automatic parent goal 
 * progress updates, goal completion logic, and performance optimization.
 */

import { 
    ProgressCalculationUtils, 
    ProgressResult, 
    HierarchicalProgressResult,
    ProgressCalculationStrategy,
    ProgressDelta,
    ProgressCalculationHelpers
} from '../utils/progressCalculation';
import { 
    Goal, 
    Task, 
    GoalStatus, 
    TaskStatus, 
    GoalUtils, 
    TaskUtils 
} from '../types';

// Test utilities
function createTestGoal(
    id: string, 
    title: string, 
    status: typeof GoalStatus[keyof typeof GoalStatus] = GoalStatus.PLANNED,
    parentId?: string
): Goal {
    return {
        id,
        title,
        description: `Test goal ${title}`,
        status,
        parentId,
        blockedByIds: [],
        tasks: [],
        createdAt: new Date(),
        metadata: {
            priority: 3,
            estimatedHours: 8
        }
    };
}

function createTestTask(
    id: string, 
    title: string, 
    status: typeof TaskStatus[keyof typeof TaskStatus] = TaskStatus.TODO,
    goalId: string = 'goal1'
): Task {
    return {
        id,
        title,
        description: `Test task ${title}`,
        status,
        order: 0,
        goalId,
        createdAt: new Date()
    };
}

describe('ProgressCalculationUtils', () => {
    let progressCalculator: ProgressCalculationUtils;

    beforeEach(() => {
        progressCalculator = new ProgressCalculationUtils({
            enableCaching: false, // Disable caching for tests
            performance: {
                enableBatchProcessing: false,
                batchSize: 10,
                enableParallelProcessing: false,
                maxConcurrentCalculations: 1
            }
        });
    });

    describe('Task Progress Calculation', () => {
        test('should calculate 0% progress for goal with no tasks', async () => {
            const goal = createTestGoal('goal1', 'Empty Goal');
            
            const result = await progressCalculator.calculateTaskProgress(goal);
            
            expect(result.percentage).toBe(0);
            expect(result.completed).toBe(0);
            expect(result.total).toBe(0);
            expect(result.isComplete).toBe(false);
        });

        test('should calculate progress for goal with all todo tasks', async () => {
            const goal = createTestGoal('goal1', 'Todo Goal');
            goal.tasks = [
                createTestTask('task1', 'Task 1', TaskStatus.TODO, 'goal1'),
                createTestTask('task2', 'Task 2', TaskStatus.TODO, 'goal1'),
                createTestTask('task3', 'Task 3', TaskStatus.TODO, 'goal1')
            ];
            
            const result = await progressCalculator.calculateTaskProgress(goal);
            
            expect(result.percentage).toBe(0);
            expect(result.completed).toBe(0);
            expect(result.total).toBe(3);
            expect(result.isComplete).toBe(false);
        });

        test('should calculate progress for goal with mixed task statuses', async () => {
            const goal = createTestGoal('goal1', 'Mixed Goal');
            goal.tasks = [
                createTestTask('task1', 'Task 1', TaskStatus.DONE, 'goal1'),
                createTestTask('task2', 'Task 2', TaskStatus.IN_PROGRESS, 'goal1'),
                createTestTask('task3', 'Task 3', TaskStatus.TODO, 'goal1'),
                createTestTask('task4', 'Task 4', TaskStatus.DONE, 'goal1')
            ];
            
            const result = await progressCalculator.calculateTaskProgress(goal);
            
            expect(result.percentage).toBe(50); // 2 out of 4 completed
            expect(result.completed).toBe(2);
            expect(result.total).toBe(4);
            expect(result.isComplete).toBe(false);
        });

        test('should calculate 100% progress for goal with all completed tasks', async () => {
            const goal = createTestGoal('goal1', 'Complete Goal');
            goal.tasks = [
                createTestTask('task1', 'Task 1', TaskStatus.DONE, 'goal1'),
                createTestTask('task2', 'Task 2', TaskStatus.DONE, 'goal1')
            ];
            
            const result = await progressCalculator.calculateTaskProgress(goal);
            
            expect(result.percentage).toBe(100);
            expect(result.completed).toBe(2);
            expect(result.total).toBe(2);
            expect(result.isComplete).toBe(true);
        });

        test('should handle completed goal status override', async () => {
            const calculator = new ProgressCalculationUtils({
                completedGoalOverride: true
            });
            
            const goal = createTestGoal('goal1', 'Override Goal', GoalStatus.COMPLETED);
            goal.tasks = [
                createTestTask('task1', 'Task 1', TaskStatus.TODO, 'goal1') // Not completed task
            ];
            
            const result = await calculator.calculateTaskProgress(goal);
            
            expect(result.percentage).toBe(100);
            expect(result.isComplete).toBe(true);
        });
    });

    describe('Hierarchical Progress Calculation', () => {
        test('should calculate progress for goal with child goals', async () => {
            const parentGoal = createTestGoal('parent', 'Parent Goal');
            parentGoal.tasks = [
                createTestTask('task1', 'Parent Task', TaskStatus.DONE, 'parent')
            ];

            const childGoal1 = createTestGoal('child1', 'Child Goal 1', GoalStatus.PLANNED, 'parent');
            childGoal1.tasks = [
                createTestTask('task2', 'Child Task 1', TaskStatus.DONE, 'child1'),
                createTestTask('task3', 'Child Task 2', TaskStatus.TODO, 'child1')
            ];

            const childGoal2 = createTestGoal('child2', 'Child Goal 2', GoalStatus.PLANNED, 'parent');
            childGoal2.tasks = [
                createTestTask('task4', 'Child Task 3', TaskStatus.DONE, 'child2')
            ];

            const childGoals = [childGoal1, childGoal2];
            
            const result = await progressCalculator.calculateGoalProgress(parentGoal, childGoals);
            
            expect(result).toBeDefined();
            expect(result.breakdown).toBeDefined();
            expect(result.breakdown.taskProgress.percentage).toBe(100); // Parent task is done
            expect(result.combinedProgress).toBeDefined();
        });

        test('should calculate empty progress for goal without tasks or children', async () => {
            const goal = createTestGoal('goal1', 'Empty Goal');
            const childGoals: Goal[] = [];
            
            const result = await progressCalculator.calculateGoalProgress(goal, childGoals);
            
            expect(result.breakdown.taskProgress.percentage).toBe(0);
            expect(result.breakdown.childGoalProgress.percentage).toBe(0);
        });
    });

    describe('Progress Status Suggestions', () => {
        test('should suggest goal completion when all tasks are done', () => {
            const goal = createTestGoal('goal1', 'Complete Goal', GoalStatus.IN_PROGRESS);
            goal.tasks = [
                createTestTask('task1', 'Task 1', TaskStatus.DONE, 'goal1'),
                createTestTask('task2', 'Task 2', TaskStatus.DONE, 'goal1')
            ];

            const progressResult: ProgressResult = {
                percentage: 100,
                completed: 2,
                total: 2,
                isComplete: true,
                calculatedAt: new Date()
            };

            const shouldBeComplete = progressCalculator.shouldGoalBeComplete(goal, progressResult);
            expect(shouldBeComplete).toBe(true);

            const suggestedStatus = progressCalculator.suggestGoalStatusUpdate(goal, progressResult);
            expect(suggestedStatus).toBe(GoalStatus.COMPLETED);
        });

        test('should suggest in-progress when goal has partial progress', () => {
            const goal = createTestGoal('goal1', 'Partial Goal', GoalStatus.PLANNED);
            goal.tasks = [
                createTestTask('task1', 'Task 1', TaskStatus.DONE, 'goal1'),
                createTestTask('task2', 'Task 2', TaskStatus.TODO, 'goal1')
            ];

            const progressResult: ProgressResult = {
                percentage: 50,
                completed: 1,
                total: 2,
                isComplete: false,
                calculatedAt: new Date()
            };

            const suggestedStatus = progressCalculator.suggestGoalStatusUpdate(goal, progressResult);
            expect(suggestedStatus).toBe(GoalStatus.IN_PROGRESS);
        });

        test('should suggest planned when goal has no progress', () => {
            const goal = createTestGoal('goal1', 'No Progress Goal', GoalStatus.IN_PROGRESS);
            goal.tasks = [
                createTestTask('task1', 'Task 1', TaskStatus.TODO, 'goal1'),
                createTestTask('task2', 'Task 2', TaskStatus.TODO, 'goal1')
            ];

            const progressResult: ProgressResult = {
                percentage: 0,
                completed: 0,
                total: 2,
                isComplete: false,
                calculatedAt: new Date()
            };

            const suggestedStatus = progressCalculator.suggestGoalStatusUpdate(goal, progressResult);
            expect(suggestedStatus).toBe(GoalStatus.PLANNED);
        });
    });

    describe('Progress Delta Calculations', () => {
        test('should calculate progress delta correctly', () => {
            const previousProgress: ProgressResult = {
                percentage: 25,
                completed: 1,
                total: 4,
                isComplete: false,
                calculatedAt: new Date()
            };

            const currentProgress: ProgressResult = {
                percentage: 75,
                completed: 3,
                total: 4,
                isComplete: false,
                calculatedAt: new Date()
            };

            const delta = progressCalculator.calculateProgressDelta(previousProgress, currentProgress);

            expect(delta.percentageChange).toBe(50);
            expect(delta.completedChange).toBe(2);
            expect(delta.completionStatusChanged).toBe(false);
            expect(delta.previous).toBe(previousProgress);
            expect(delta.current).toBe(currentProgress);
        });

        test('should detect completion status change', () => {
            const previousProgress: ProgressResult = {
                percentage: 75,
                completed: 3,
                total: 4,
                isComplete: false,
                calculatedAt: new Date()
            };

            const currentProgress: ProgressResult = {
                percentage: 100,
                completed: 4,
                total: 4,
                isComplete: true,
                calculatedAt: new Date()
            };

            const delta = progressCalculator.calculateProgressDelta(previousProgress, currentProgress);

            expect(delta.completionStatusChanged).toBe(true);
        });

        test('should identify significant progress changes', () => {
            const delta: ProgressDelta = {
                previous: { percentage: 25, completed: 1, total: 4, isComplete: false, calculatedAt: new Date() },
                current: { percentage: 50, completed: 2, total: 4, isComplete: false, calculatedAt: new Date() },
                percentageChange: 25,
                completedChange: 1,
                completionStatusChanged: false,
                changedAt: new Date()
            };

            const isSignificant = progressCalculator.hasSignificantProgressChange(delta, 20);
            expect(isSignificant).toBe(true);

            const isNotSignificant = progressCalculator.hasSignificantProgressChange(delta, 30);
            expect(isNotSignificant).toBe(false);
        });
    });

    describe('Performance Optimization', () => {
        test('should handle batch progress calculation', async () => {
            const batchCalculator = new ProgressCalculationUtils({
                performance: {
                    enableBatchProcessing: true,
                    batchSize: 2,
                    enableParallelProcessing: false,
                    maxConcurrentCalculations: 1
                }
            });

            const goals = [
                createTestGoal('goal1', 'Goal 1'),
                createTestGoal('goal2', 'Goal 2'),
                createTestGoal('goal3', 'Goal 3')
            ];

            goals[0].tasks = [createTestTask('task1', 'Task 1', TaskStatus.DONE, 'goal1')];
            goals[1].tasks = [
                createTestTask('task2', 'Task 2', TaskStatus.DONE, 'goal2'),
                createTestTask('task3', 'Task 3', TaskStatus.TODO, 'goal2')
            ];
            goals[2].tasks = [createTestTask('task4', 'Task 4', TaskStatus.TODO, 'goal3')];

            const results = await batchCalculator.calculateProgressOptimized(goals);

            expect(results.size).toBe(3);
            expect(results.get('goal1')?.percentage).toBe(100);
            expect(results.get('goal2')?.percentage).toBe(50);
            expect(results.get('goal3')?.percentage).toBe(0);
        });

        test('should use caching when enabled', async () => {
            const cachedCalculator = new ProgressCalculationUtils({
                enableCaching: true,
                cacheTtl: 60000
            });

            const goal = createTestGoal('goal1', 'Cached Goal');
            goal.tasks = [createTestTask('task1', 'Task 1', TaskStatus.DONE, 'goal1')];

            // First calculation
            const result1 = await cachedCalculator.calculateTaskProgress(goal);
            expect(result1.metadata?.fromCache).toBe(false);

            // Second calculation should be from cache
            const result2 = await cachedCalculator.calculateTaskProgress(goal);
            expect(result2.metadata?.fromCache).toBe(true);
            expect(result2.percentage).toBe(result1.percentage);
        });
    });

    describe('Different Progress Strategies', () => {
        test('should calculate status-based progress', async () => {
            const goal = createTestGoal('goal1', 'Status Goal', GoalStatus.IN_PROGRESS);
            goal.tasks = []; // No tasks

            const result = await progressCalculator.calculateTaskProgress(
                goal, 
                ProgressCalculationStrategy.STATUS_BASED
            );

            expect(result.percentage).toBe(50); // In progress with no tasks should be 50%
        });

        test('should calculate time-based progress with metadata', async () => {
            const goal = createTestGoal('goal1', 'Time Goal');
            goal.metadata = {
                ...goal.metadata,
                estimatedHours: 10,
                actualHours: 3
            };

            const result = await progressCalculator.calculateTaskProgress(
                goal, 
                ProgressCalculationStrategy.TIME_BASED
            );

            expect(result.percentage).toBe(30); // 3 out of 10 hours
        });
    });
});

describe('ProgressCalculationHelpers', () => {
    describe('Static Utility Functions', () => {
        test('should calculate task completion percentage', () => {
            const tasks = [
                createTestTask('task1', 'Task 1', TaskStatus.DONE),
                createTestTask('task2', 'Task 2', TaskStatus.TODO),
                createTestTask('task3', 'Task 3', TaskStatus.DONE),
                createTestTask('task4', 'Task 4', TaskStatus.IN_PROGRESS)
            ];

            const percentage = ProgressCalculationHelpers.calculateTaskCompletionPercentage(tasks);
            expect(percentage).toBe(50); // 2 out of 4 completed
        });

        test('should check if all tasks are completed', () => {
            const allCompletedGoal = createTestGoal('goal1', 'All Complete');
            allCompletedGoal.tasks = [
                createTestTask('task1', 'Task 1', TaskStatus.DONE),
                createTestTask('task2', 'Task 2', TaskStatus.DONE)
            ];

            const partialGoal = createTestGoal('goal2', 'Partial');
            partialGoal.tasks = [
                createTestTask('task1', 'Task 1', TaskStatus.DONE),
                createTestTask('task2', 'Task 2', TaskStatus.TODO)
            ];

            const emptyGoal = createTestGoal('goal3', 'Empty');

            expect(ProgressCalculationHelpers.areAllTasksCompleted(allCompletedGoal)).toBe(true);
            expect(ProgressCalculationHelpers.areAllTasksCompleted(partialGoal)).toBe(false);
            expect(ProgressCalculationHelpers.areAllTasksCompleted(emptyGoal)).toBe(false);
        });

        test('should get progress indicator', () => {
            expect(ProgressCalculationHelpers.getProgressIndicator(0)).toBe('○');
            expect(ProgressCalculationHelpers.getProgressIndicator(100)).toBe('●');
            expect(ProgressCalculationHelpers.getProgressIndicator(25)).toBe('◔');
            expect(ProgressCalculationHelpers.getProgressIndicator(50)).toBe('◑');
            expect(ProgressCalculationHelpers.getProgressIndicator(75)).toBe('◕');
        });

        test('should format progress for display', () => {
            const formatted = ProgressCalculationHelpers.formatProgress(66.67, 2, 3);
            expect(formatted).toBe('66.7% (2/3)');
        });

        test('should check if progress calculation is needed', () => {
            const goal = createTestGoal('goal1', 'Test Goal');
            const now = new Date();
            const pastDate = new Date(now.getTime() - 60000); // 1 minute ago
            const futureDate = new Date(now.getTime() + 60000); // 1 minute from now

            // Never calculated
            expect(ProgressCalculationHelpers.needsProgressCalculation(goal)).toBe(true);

            // Goal updated after calculation
            goal.updatedAt = futureDate;
            expect(ProgressCalculationHelpers.needsProgressCalculation(goal, pastDate)).toBe(true);

            // Task updated after calculation
            goal.updatedAt = pastDate;
            goal.tasks = [createTestTask('task1', 'Task 1')];
            goal.tasks[0].updatedAt = futureDate;
            expect(ProgressCalculationHelpers.needsProgressCalculation(goal, pastDate)).toBe(true);

            // No updates needed
            goal.tasks[0].updatedAt = pastDate;
            expect(ProgressCalculationHelpers.needsProgressCalculation(goal, now)).toBe(false);
        });
    });
});

// Integration Tests
describe('Progress Calculation Integration', () => {
    test('should work end-to-end with realistic goal hierarchy', async () => {
        const calculator = new ProgressCalculationUtils();

        // Create a realistic goal hierarchy
        const parentGoal = createTestGoal('project', 'Complete Project', GoalStatus.IN_PROGRESS);
        parentGoal.tasks = [
            createTestTask('setup', 'Initial Setup', TaskStatus.DONE, 'project'),
            createTestTask('planning', 'Project Planning', TaskStatus.DONE, 'project')
        ];

        const childGoal1 = createTestGoal('frontend', 'Frontend Development', GoalStatus.IN_PROGRESS, 'project');
        childGoal1.tasks = [
            createTestTask('ui1', 'Create UI Components', TaskStatus.DONE, 'frontend'),
            createTestTask('ui2', 'Add Styling', TaskStatus.IN_PROGRESS, 'frontend'),
            createTestTask('ui3', 'Testing', TaskStatus.TODO, 'frontend')
        ];

        const childGoal2 = createTestGoal('backend', 'Backend Development', GoalStatus.PLANNED, 'project');
        childGoal2.tasks = [
            createTestTask('api1', 'API Endpoints', TaskStatus.TODO, 'backend'),
            createTestTask('api2', 'Database Schema', TaskStatus.TODO, 'backend')
        ];

        const childGoals = [childGoal1, childGoal2];

        // Calculate hierarchical progress
        const hierarchicalProgress = await calculator.calculateGoalProgress(parentGoal, childGoals);

        // Verify results
        expect(hierarchicalProgress.breakdown.taskProgress.percentage).toBe(100); // Parent tasks are done
        expect(hierarchicalProgress.breakdown.childGoalProgress.completed).toBeGreaterThan(0); // Some child tasks done
        expect(hierarchicalProgress.combinedProgress.total).toBeGreaterThan(0); // Total tasks counted

        // Test individual goal progress
        const parentProgress = await calculator.calculateTaskProgress(parentGoal);
        expect(parentProgress.percentage).toBe(100);

        const frontendProgress = await calculator.calculateTaskProgress(childGoal1);
        expect(frontendProgress.percentage).toBe(33.33); // 1 out of 3 tasks done

        const backendProgress = await calculator.calculateTaskProgress(childGoal2);
        expect(backendProgress.percentage).toBe(0); // No tasks done

        // Test status suggestions
        expect(calculator.suggestGoalStatusUpdate(parentGoal, parentProgress)).toBe(null); // Already correct status
        expect(calculator.suggestGoalStatusUpdate(childGoal2, backendProgress)).toBe(null); // No progress, stays planned
    });
});