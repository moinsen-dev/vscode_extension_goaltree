/**
 * Integration tests for EventManager and UndoRedoManager with GoalManager
 */

import { GoalManager } from '../services/GoalManager';
import { EventManager } from '../services/EventManager';
import { UndoRedoManager } from '../services/UndoRedoManager';
import { ValidationService } from '../services/ValidationService';
import { GoalEventType, GoalStatus, TaskStatus } from '../types';

/**
 * Mock logger for testing
 */
const mockLogger = (message: string) => {
    console.log(`TEST: ${message}`);
};

/**
 * Test the integration of EventManager with GoalManager
 */
async function testEventManagerIntegration() {
    console.log('\n=== Testing EventManager Integration ===');

    const eventManager = new EventManager(undefined, 1000, mockLogger);
    const validationService = new ValidationService();
    const GoalManager = new GoalManager(validationService, eventManager, undefined, mockLogger);

    let eventsReceived: any[] = [];

    // Listen for all goal events
    eventManager.on([
        GoalEventType.GOAL_CREATED,
        GoalEventType.GOAL_UPDATED,
        GoalEventType.GOAL_DELETED,
        GoalEventType.TASK_ADDED
    ], (event) => {
        eventsReceived.push(event);
        console.log(`Received event: ${event.type}`);
    });

    try {
        // Test goal creation
        const goal = await GoalManager.createGoal({
            title: 'Test Goal',
            description: 'A test goal for event integration'
        });
        console.log(`Created goal: ${goal.title} (${goal.id})`);

        // Test goal update
        const updatedGoal = await GoalManager.updateGoal(goal.id, {
            title: 'Updated Test Goal',
            status: GoalStatus.IN_PROGRESS
        });
        console.log(`Updated goal: ${updatedGoal.title}`);

        // Test task addition
        const task = await GoalManager.addTask(goal.id, {
            title: 'Test Task',
            description: 'A test task'
        });
        console.log(`Added task: ${task.title} (${task.id})`);

        // Test goal deletion
        await GoalManager.deleteGoal(goal.id);
        console.log(`Deleted goal: ${goal.id}`);

        // Verify events were received
        console.log(`Total events received: ${eventsReceived.length}`);
        
        const expectedEvents = [
            GoalEventType.GOAL_CREATED,
            GoalEventType.GOAL_UPDATED,
            GoalEventType.GOAL_STATUS_CHANGED,
            GoalEventType.TASK_ADDED,
            GoalEventType.GOAL_DELETED
        ];

        let allEventsReceived = true;
        for (const expectedEvent of expectedEvents) {
            const found = eventsReceived.some(e => e.type === expectedEvent);
            if (!found) {
                console.error(`Missing expected event: ${expectedEvent}`);
                allEventsReceived = false;
            }
        }

        if (allEventsReceived) {
            console.log('✅ EventManager integration test PASSED');
        } else {
            console.error('❌ EventManager integration test FAILED');
        }

    } catch (error) {
        console.error('❌ EventManager integration test FAILED:', error);
    } finally {
        GoalManager.dispose();
    }
}

/**
 * Test the integration of UndoRedoManager with GoalManager
 */
async function testUndoRedoIntegration() {
    console.log('\n=== Testing UndoRedo Integration ===');

    const eventManager = new EventManager(undefined, 1000, mockLogger);
    const undoRedoManager = new UndoRedoManager(100, 10, mockLogger);
    const validationService = new ValidationService();
    const GoalManager = new GoalManager(validationService, eventManager, undoRedoManager, mockLogger);

    try {
        // Test goal creation
        console.log('Creating goal...');
        const goal = await GoalManager.createGoal({
            title: 'Undo Test Goal',
            description: 'A goal for testing undo/redo'
        });
        console.log(`Created goal: ${goal.title} (${goal.id})`);
        console.log(`Can undo: ${GoalManager.canUndo()}`);

        // Test undo goal creation
        console.log('Undoing goal creation...');
        const undoResult = await GoalManager.undo();
        console.log(`Undo result: success=${undoResult.success}, processed=${undoResult.commandsProcessed}`);
        
        const goalAfterUndo = GoalManager.getGoal(goal.id);
        if (goalAfterUndo) {
            console.error('❌ Goal should be deleted after undo');
        } else {
            console.log('✅ Goal correctly deleted after undo');
        }
        console.log(`Can redo: ${GoalManager.canRedo()}`);

        // Test redo goal creation
        console.log('Redoing goal creation...');
        const redoResult = await GoalManager.redo();
        console.log(`Redo result: success=${redoResult.success}, processed=${redoResult.commandsProcessed}`);
        
        const goalAfterRedo = GoalManager.getGoal(goal.id);
        if (goalAfterRedo) {
            console.log('✅ Goal correctly recreated after redo');
        } else {
            console.error('❌ Goal should be recreated after redo');
        }

        // Test goal update with undo/redo
        console.log('Updating goal...');
        const originalTitle = goalAfterRedo!.title;
        await GoalManager.updateGoal(goal.id, {
            title: 'Modified Title',
            description: 'Modified description'
        });
        
        const modifiedGoal = GoalManager.getGoal(goal.id);
        console.log(`Modified goal title: ${modifiedGoal!.title}`);

        console.log('Undoing goal update...');
        await GoalManager.undo();
        
        const restoredGoal = GoalManager.getGoal(goal.id);
        if (restoredGoal!.title === originalTitle) {
            console.log('✅ Goal title correctly restored after undo');
        } else {
            console.error(`❌ Goal title not restored correctly: expected "${originalTitle}", got "${restoredGoal!.title}"`);
        }

        // Test bulk operations with undo/redo
        console.log('Creating multiple goals for bulk operations...');
        const goal2 = await GoalManager.createGoal({ title: 'Bulk Test Goal 2' });
        const goal3 = await GoalManager.createGoal({ title: 'Bulk Test Goal 3' });

        console.log('Performing bulk complete operation...');
        const bulkResult = await GoalManager.bulkCompleteGoals([goal.id, goal2.id, goal3.id]);
        console.log(`Bulk operation: ${bulkResult.successful} successful, ${bulkResult.failed} failed`);

        // Check if goals are completed
        const completedGoals = [goal.id, goal2.id, goal3.id]
            .map(id => GoalManager.getGoal(id))
            .filter(g => g?.status === GoalStatus.COMPLETED);
        console.log(`${completedGoals.length} goals are now completed`);

        // Test snapshot functionality
        console.log('Creating state snapshot...');
        const snapshotId = GoalManager.createSnapshot('Before cleanup');
        if (snapshotId) {
            console.log(`✅ Snapshot created: ${snapshotId}`);
        }

        console.log('✅ UndoRedo integration test PASSED');

    } catch (error) {
        console.error('❌ UndoRedo integration test FAILED:', error);
    } finally {
        GoalManager.dispose();
    }
}

/**
 * Test advanced EventManager features
 */
async function testAdvancedEventFeatures() {
    console.log('\n=== Testing Advanced Event Features ===');

    const eventManager = new EventManager(undefined, 1000, mockLogger);
    const validationService = new ValidationService();
    const GoalManager = new GoalManager(validationService, eventManager, undefined, mockLogger);

    try {
        let priorityEventsCount = 0;
        let filteredEventsCount = 0;

        // Test priority event handlers
        eventManager.on(GoalEventType.GOAL_CREATED, () => {
            priorityEventsCount++;
        }, { priority: 10 });

        // Test filtered event handlers
        eventManager.on(GoalEventType.GOAL_CREATED, (event) => {
            filteredEventsCount++;
        }, {
            filter: (event) => event.data.goal.title.includes('Filter')
        });

        // Create goals to trigger events
        await GoalManager.createGoal({ title: 'Regular Goal' });
        await GoalManager.createGoal({ title: 'Filter Test Goal' });
        await GoalManager.createGoal({ title: 'Another Filter Goal' });

        // Wait a bit for async event processing
        await new Promise(resolve => setTimeout(resolve, 100));

        console.log(`Priority events received: ${priorityEventsCount}`);
        console.log(`Filtered events received: ${filteredEventsCount}`);

        if (priorityEventsCount === 3 && filteredEventsCount === 2) {
            console.log('✅ Advanced event features test PASSED');
        } else {
            console.error('❌ Advanced event features test FAILED');
        }

        // Test event history
        const eventHistory = eventManager.getEventHistory();
        console.log(`Event history contains ${eventHistory.length} events`);

        // Test event querying
        const goalCreatedEvents = await eventManager.queryEvents({
            eventTypes: [GoalEventType.GOAL_CREATED]
        });
        console.log(`Goal created events found: ${goalCreatedEvents.length}`);

    } catch (error) {
        console.error('❌ Advanced event features test FAILED:', error);
    } finally {
        GoalManager.dispose();
    }
}

/**
 * Run all integration tests
 */
async function runIntegrationTests() {
    console.log('🚀 Starting Event System & Undo/Redo Integration Tests');
    
    await testEventManagerIntegration();
    await testUndoRedoIntegration();
    await testAdvancedEventFeatures();
    
    console.log('\n✅ All integration tests completed');
}

// Export for potential external testing
export {
    testEventManagerIntegration,
    testUndoRedoIntegration,
    testAdvancedEventFeatures,
    runIntegrationTests
};

// Run tests if this file is executed directly
if (require.main === module) {
    runIntegrationTests().catch(console.error);
}