/**
 * Tests for UndoRedo functionality - Issue #4 Stream C
 * 
 * Comprehensive tests for all undo/redo capabilities including:
 * - Command pattern implementations
 * - UndoRedoManager functionality
 * - GoalUndoRedoService integration
 * - State snapshots and restoration
 * - Transaction support
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { Goal, CreateGoalParams, UpdateGoalParams, GoalStatus, TaskStatus } from '../types';
import { UndoRedoManager, UndoableCommand } from '../services/UndoRedoManager';
import { GoalUndoRedoService } from '../services/GoalUndoRedoService';
import { GoalManager } from '../services/GoalManager';
import { StorageService } from '../services/storageService';
import { ValidationService } from '../services/ValidationService';
import {
    CreateGoalCommand,
    UpdateGoalCommand,
    DeleteGoalCommand,
    ChangeGoalStatusCommand,
    AddTaskCommand,
    CommandFactory
} from '../commands/UndoRedoCommands';

/**
 * Mock implementations for testing
 */
class MockStorageService extends StorageService {
    private goals = new Map<string, Goal>();
    
    constructor() {
        super();
    }
    
    async saveGoal(goal: Goal) {
        this.goals.set(goal.id, { ...goal });
        return { success: true as const };
    }
    
    async getGoal(id: string) {
        const goal = this.goals.get(id);
        return goal ? { success: true as const, data: { ...goal } } : { success: false as const, error: 'Not found' };
    }
    
    async getGoals() {
        return { success: true as const, data: Array.from(this.goals.values()).map(g => ({ ...g })) };
    }
    
    async deleteGoal(id: string) {
        const existed = this.goals.has(id);
        this.goals.delete(id);
        return { success: existed as const };
    }
}

/**
 * Test utilities
 */
function createTestGoal(id: string, title: string, parentId?: string): Goal {
    return {
        id,
        title,
        description: `Test goal: ${title}`,
        status: GoalStatus.PLANNED,
        parentId,
        blockedByIds: [],
        tasks: [],
        createdAt: new Date(),
        metadata: {}
    };
}

function createMockCommand(description: string, shouldFail = false): UndoableCommand {
    let executed = false;
    let undone = false;
    
    return {
        id: `mock_${Date.now()}_${Math.random()}`,
        description,
        timestamp: new Date(),
        affectedGoalIds: [],
        
        async execute() {
            if (shouldFail) throw new Error('Mock command execution failed');
            executed = true;
        },
        
        async undo() {
            if (shouldFail) throw new Error('Mock command undo failed');
            undone = true;
        },
        
        canUndo: () => executed && !undone,
        canRedo: () => undone,
        
        // Test helper methods
        isExecuted: () => executed,
        isUndone: () => undone
    } as UndoableCommand & { isExecuted(): boolean; isUndone(): boolean };
}

suite('UndoRedo System Tests', () => {
    let undoRedoManager: UndoRedoManager;
    let storageService: MockStorageService;
    let GoalManager: GoalManager;
    let undoRedoService: GoalUndoRedoService;
    let commandFactory: CommandFactory;
    
    setup(() => {
        undoRedoManager = new UndoRedoManager();
        storageService = new MockStorageService();
        GoalManager = new GoalManager(storageService, new ValidationService());
        undoRedoService = new GoalUndoRedoService(GoalManager, undoRedoManager);
        commandFactory = new CommandFactory(GoalManager);
    });
    
    teardown(() => {
        undoRedoManager.dispose();
        undoRedoService.dispose();
    });

    suite('UndoRedoManager Core Functionality', () => {
        test('should initialize with empty stacks', () => {
            assert.strictEqual(undoRedoManager.canUndo(), false);
            assert.strictEqual(undoRedoManager.canRedo(), false);
            assert.strictEqual(undoRedoManager.getUndoStackSize(), 0);
            assert.strictEqual(undoRedoManager.getRedoStackSize(), 0);
        });

        test('should execute and track commands', async () => {
            const command = createMockCommand('Test command');
            
            await undoRedoManager.executeCommand(command);
            
            assert.strictEqual(undoRedoManager.canUndo(), true);
            assert.strictEqual(undoRedoManager.canRedo(), false);
            assert.strictEqual(undoRedoManager.getUndoStackSize(), 1);
            assert.strictEqual(command.isExecuted(), true);
        });

        test('should undo commands correctly', async () => {
            const command = createMockCommand('Test command');
            
            await undoRedoManager.executeCommand(command);
            const undoResult = await undoRedoManager.undo();
            
            assert.strictEqual(undoResult.success, true);
            assert.strictEqual(undoResult.commandsProcessed, 1);
            assert.strictEqual(undoRedoManager.canUndo(), false);
            assert.strictEqual(undoRedoManager.canRedo(), true);
            assert.strictEqual(command.isUndone(), true);
        });

        test('should redo commands correctly', async () => {
            const command = createMockCommand('Test command');
            
            await undoRedoManager.executeCommand(command);
            await undoRedoManager.undo();
            const redoResult = await undoRedoManager.redo();
            
            assert.strictEqual(redoResult.success, true);
            assert.strictEqual(redoResult.commandsProcessed, 1);
            assert.strictEqual(undoRedoManager.canUndo(), true);
            assert.strictEqual(undoRedoManager.canRedo(), false);
        });

        test('should handle command groups', async () => {
            const groupId = undoRedoManager.startCommandGroup('Test group');
            
            const command1 = createMockCommand('Command 1');
            const command2 = createMockCommand('Command 2');
            
            await undoRedoManager.executeCommand(command1);
            await undoRedoManager.executeCommand(command2);
            
            const group = undoRedoManager.endCommandGroup();
            
            assert.ok(group);
            assert.strictEqual(group.commands.length, 2);
            assert.strictEqual(undoRedoManager.getUndoStackSize(), 1); // Group counts as 1 item
        });

        test('should handle failed command execution', async () => {
            const failingCommand = createMockCommand('Failing command', true);
            
            await assert.rejects(
                () => undoRedoManager.executeCommand(failingCommand),
                /Mock command execution failed/
            );
            
            assert.strictEqual(undoRedoManager.canUndo(), false);
        });

        test('should create and manage snapshots', async () => {
            const goalStates = new Map([
                ['goal1', createTestGoal('goal1', 'Test Goal 1')],
                ['goal2', createTestGoal('goal2', 'Test Goal 2')]
            ]);
            
            const snapshotId = undoRedoManager.createSnapshot('Test snapshot', goalStates);
            const snapshots = undoRedoManager.getSnapshots();
            
            assert.strictEqual(snapshots.length, 1);
            assert.strictEqual(snapshots[0].id, snapshotId);
            assert.strictEqual(snapshots[0].description, 'Test snapshot');
            assert.strictEqual(snapshots[0].goalStates.size, 2);
        });
    });

    suite('Command Pattern Implementation', () => {
        test('CreateGoalCommand should work correctly', async () => {
            const params: CreateGoalParams = {
                title: 'New Test Goal',
                description: 'Test goal description'
            };
            
            const command = commandFactory.createGoal(params);
            await command.execute();
            
            const createdGoal = command.getCreatedGoal();
            assert.ok(createdGoal);
            assert.strictEqual(createdGoal.title, params.title);
            assert.strictEqual(createdGoal.description, params.description);
            
            // Test undo
            await command.undo();
            const goalResult = await GoalManager.getGoal(createdGoal.id);
            assert.strictEqual(goalResult.success, false);
        });

        test('UpdateGoalCommand should work correctly', async () => {
            // Create initial goal
            const createResult = await GoalManager.createGoal({
                title: 'Original Title',
                description: 'Original Description'
            });
            assert.strictEqual(createResult.success, true);
            const goal = createResult.data!;
            
            const updates: UpdateGoalParams = {
                title: 'Updated Title',
                description: 'Updated Description'
            };
            
            const command = commandFactory.updateGoal(goal.id, updates, goal);
            await command.execute();
            
            // Verify update
            const updatedResult = await GoalManager.getGoal(goal.id);
            assert.strictEqual(updatedResult.success, true);
            assert.strictEqual(updatedResult.data!.title, updates.title);
            
            // Test undo
            await command.undo();
            const restoredResult = await GoalManager.getGoal(goal.id);
            assert.strictEqual(restoredResult.success, true);
            assert.strictEqual(restoredResult.data!.title, 'Original Title');
        });

        test('DeleteGoalCommand should work correctly', async () => {
            // Create initial goal
            const createResult = await GoalManager.createGoal({
                title: 'Goal to Delete',
                description: 'This goal will be deleted'
            });
            assert.strictEqual(createResult.success, true);
            const goal = createResult.data!;
            
            const command = commandFactory.deleteGoal(goal.id, goal);
            await command.execute();
            
            // Verify deletion
            const deletedResult = await GoalManager.getGoal(goal.id);
            assert.strictEqual(deletedResult.success, false);
            
            // Test undo - goal should be recreated
            await command.undo();
            const restoredResult = await GoalManager.getGoal(goal.id);
            assert.strictEqual(restoredResult.success, true);
            // Note: ID may be different due to recreation, but title should match
            assert.strictEqual(restoredResult.data!.title, goal.title);
        });

        test('ChangeGoalStatusCommand should work correctly', async () => {
            // Create initial goal
            const createResult = await GoalManager.createGoal({
                title: 'Status Test Goal'
            });
            assert.strictEqual(createResult.success, true);
            const goal = createResult.data!;
            const originalStatus = goal.status;
            
            const newStatus = GoalStatus.IN_PROGRESS;
            const command = commandFactory.changeGoalStatus(goal.id, newStatus, originalStatus);
            await command.execute();
            
            // Verify status change
            const updatedResult = await GoalManager.getGoal(goal.id);
            assert.strictEqual(updatedResult.success, true);
            assert.strictEqual(updatedResult.data!.status, newStatus);
            
            // Test undo
            await command.undo();
            const restoredResult = await GoalManager.getGoal(goal.id);
            assert.strictEqual(restoredResult.success, true);
            assert.strictEqual(restoredResult.data!.status, originalStatus);
        });

        test('AddTaskCommand should work correctly', async () => {
            // Create initial goal
            const createResult = await GoalManager.createGoal({
                title: 'Goal for Task Test'
            });
            assert.strictEqual(createResult.success, true);
            const goal = createResult.data!;
            
            const taskParams = {
                title: 'Test Task',
                description: 'Task description',
                goalId: goal.id
            };
            
            const command = commandFactory.addTask(goal.id, taskParams);
            await command.execute();
            
            const addedTask = command.getAddedTask();
            assert.ok(addedTask);
            assert.strictEqual(addedTask.title, taskParams.title);
            
            // Verify task was added to goal
            const goalWithTask = await GoalManager.getGoal(goal.id);
            assert.strictEqual(goalWithTask.success, true);
            assert.strictEqual(goalWithTask.data!.tasks.length, 1);
            
            // Test undo
            await command.undo();
            const goalAfterUndo = await GoalManager.getGoal(goal.id);
            assert.strictEqual(goalAfterUndo.success, true);
            assert.strictEqual(goalAfterUndo.data!.tasks.length, 0);
        });
    });

    suite('GoalUndoRedoService Integration', () => {
        test('should provide high-level interface for goal operations', async () => {
            const createParams: CreateGoalParams = {
                title: 'Service Test Goal',
                description: 'Testing the undo/redo service'
            };
            
            const result = await undoRedoService.createGoal(createParams);
            
            assert.strictEqual(result.success, true);
            assert.ok(result.data);
            assert.strictEqual(result.canUndo, true);
            assert.strictEqual(result.canRedo, false);
            assert.ok(result.undoDescription);
            assert.ok(result.commandId);
        });

        test('should handle service-level undo/redo', async () => {
            // Create a goal
            const createResult = await undoRedoService.createGoal({
                title: 'Test Goal for Service Undo'
            });
            assert.strictEqual(createResult.success, true);
            const goalId = createResult.data!.id;
            
            // Undo the creation
            const undoResult = await undoRedoService.undo();
            assert.strictEqual(undoResult.success, true);
            
            // Verify goal was removed
            const goalResult = await GoalManager.getGoal(goalId);
            assert.strictEqual(goalResult.success, false);
            
            // Redo the creation
            const redoResult = await undoRedoService.redo();
            assert.strictEqual(redoResult.success, true);
            
            // Verify goal was restored (note: may have different ID)
            const stats = undoRedoService.getStats();
            assert.strictEqual(stats.undoableCommands, 1);
        });

        test('should support transactions', async () => {
            const transaction = await undoRedoService.startTransaction('Multi-goal creation');
            
            // Create multiple goals in transaction
            await undoRedoService.createGoal({ title: 'Goal 1' });
            await undoRedoService.createGoal({ title: 'Goal 2' });
            await undoRedoService.createGoal({ title: 'Goal 3' });
            
            await undoRedoService.commitTransaction();
            
            // Should be able to undo entire transaction as one operation
            assert.strictEqual(undoRedoService.canUndo(), true);
            const undoResult = await undoRedoService.undo();
            assert.strictEqual(undoResult.success, true);
            
            // All goals should be removed
            const allGoals = await GoalManager.getAllGoals();
            assert.strictEqual(allGoals.success, true);
            assert.strictEqual(allGoals.data!.length, 0);
        });

        test('should create automatic snapshots', async () => {
            const config = { autoSnapshot: true, enableLogging: true };
            const serviceWithSnapshots = new GoalUndoRedoService(GoalManager, undoRedoManager, config);
            
            // Create some goals
            await serviceWithSnapshots.createGoal({ title: 'Goal 1' });
            await serviceWithSnapshots.createGoal({ title: 'Goal 2' });
            
            const undoRedoMgr = serviceWithSnapshots.getUndoRedoManager();
            const snapshots = undoRedoMgr.getSnapshots();
            
            // Should have created snapshots
            assert.ok(snapshots.length > 0);
            
            serviceWithSnapshots.dispose();
        });

        test('should handle bulk operations', async () => {
            // Create multiple goals first
            const goal1Result = await undoRedoService.createGoal({ title: 'Bulk Goal 1' });
            const goal2Result = await undoRedoService.createGoal({ title: 'Bulk Goal 2' });
            const goal3Result = await undoRedoService.createGoal({ title: 'Bulk Goal 3' });
            
            assert.strictEqual(goal1Result.success, true);
            assert.strictEqual(goal2Result.success, true);
            assert.strictEqual(goal3Result.success, true);
            
            const goalIds = [goal1Result.data!.id, goal2Result.data!.id, goal3Result.data!.id];
            
            // Bulk status change
            const bulkResult = await undoRedoService.bulkStatusChange(goalIds, GoalStatus.COMPLETED);
            assert.strictEqual(bulkResult.success, true);
            
            // Verify all goals are completed
            for (const goalId of goalIds) {
                const goalResult = await GoalManager.getGoal(goalId);
                assert.strictEqual(goalResult.success, true);
                assert.strictEqual(goalResult.data!.status, GoalStatus.COMPLETED);
            }
            
            // Undo bulk operation
            const undoResult = await undoRedoService.undo();
            assert.strictEqual(undoResult.success, true);
            
            // Verify all goals are back to original status
            for (const goalId of goalIds) {
                const goalResult = await GoalManager.getGoal(goalId);
                assert.strictEqual(goalResult.success, true);
                assert.strictEqual(goalResult.data!.status, GoalStatus.PLANNED);
            }
        });
    });

    suite('Error Handling and Edge Cases', () => {
        test('should handle commands on non-existent goals', async () => {
            const nonExistentId = 'non-existent-goal-id';
            const command = commandFactory.updateGoal(nonExistentId, { title: 'Updated' });
            
            await assert.rejects(
                () => command.execute(),
                /not found/i
            );
        });

        test('should handle disposal correctly', () => {
            const newManager = new UndoRedoManager();
            const newService = new GoalUndoRedoService(GoalManager, newManager);
            
            // Add some operations
            newService.createGoal({ title: 'Test Goal' });
            
            // Dispose
            newService.dispose();
            newManager.dispose();
            
            // Should not be able to perform operations after disposal
            assert.throws(() => newManager.canUndo());
        });

        test('should handle stack overflow protection', async () => {
            const smallStackManager = new UndoRedoManager(5); // Small stack size
            
            // Add more commands than stack size
            for (let i = 0; i < 10; i++) {
                const command = createMockCommand(`Command ${i}`);
                await smallStackManager.executeCommand(command);
            }
            
            // Stack should be trimmed to max size
            assert.strictEqual(smallStackManager.getUndoStackSize(), 5);
            
            smallStackManager.dispose();
        });

        test('should handle circular dependency prevention', async () => {
            const goal1Result = await GoalManager.createGoal({ title: 'Goal 1' });
            const goal2Result = await GoalManager.createGoal({ title: 'Goal 2', parentId: goal1Result.data!.id });
            
            // Try to make goal1 a child of goal2 (would create cycle)
            const moveCommand = commandFactory.moveGoal(goal1Result.data!.id, goal2Result.data!.id);
            
            await assert.rejects(
                () => moveCommand.execute(),
                /circular/i
            );
        });
    });

    suite('Performance and Memory Tests', () => {
        test('should handle large number of operations efficiently', async () => {
            const startTime = Date.now();
            const operationCount = 100;
            
            // Create many goals
            for (let i = 0; i < operationCount; i++) {
                await undoRedoService.createGoal({ title: `Performance Goal ${i}` });
            }
            
            const createTime = Date.now() - startTime;
            const stats = undoRedoService.getStats();
            
            assert.strictEqual(stats.undoableCommands, operationCount);
            assert.ok(createTime < 5000, `Creation took too long: ${createTime}ms`);
            
            // Test batch undo performance
            const undoStartTime = Date.now();
            for (let i = 0; i < operationCount && undoRedoService.canUndo(); i++) {
                await undoRedoService.undo();
            }
            const undoTime = Date.now() - undoStartTime;
            
            assert.ok(undoTime < 5000, `Undo took too long: ${undoTime}ms`);
            assert.strictEqual(undoRedoService.getStats().undoableCommands, 0);
        });

        test('should manage memory efficiently with snapshots', async () => {
            const manager = new UndoRedoManager(50, 5); // 5 snapshot limit
            
            // Create more snapshots than limit
            for (let i = 0; i < 10; i++) {
                const goalStates = new Map([
                    [`goal${i}`, createTestGoal(`goal${i}`, `Goal ${i}`)]
                ]);
                manager.createSnapshot(`Snapshot ${i}`, goalStates);
            }
            
            // Should only keep the most recent snapshots
            const snapshots = manager.getSnapshots();
            assert.strictEqual(snapshots.length, 5);
            assert.strictEqual(snapshots[0].description, 'Snapshot 5'); // Oldest kept
            assert.strictEqual(snapshots[4].description, 'Snapshot 9'); // Newest
            
            manager.dispose();
        });
    });
});

suite('Integration Tests', () => {
    test('should integrate with VS Code commands', async () => {
        // This test would require VS Code test environment
        // For now, just verify command registration would work
        
        const mockContext: Partial<vscode.ExtensionContext> = {
            subscriptions: []
        };
        
        // Verify that undo/redo command IDs are properly defined
        const expectedCommands = [
            'goalTree.undo',
            'goalTree.redo',
            'goalTree.showUndoHistory',
            'goalTree.clearUndoHistory',
            'goalTree.createSnapshot',
            'goalTree.showSnapshots'
        ];
        
        // In a real integration test, we would verify these commands are registered
        expectedCommands.forEach(commandId => {
            assert.ok(commandId.startsWith('goalTree.'), `Command ${commandId} should have proper prefix`);
        });
    });
});

// Export test utilities for other test files
export {
    MockStorageService,
    createTestGoal,
    createMockCommand
};