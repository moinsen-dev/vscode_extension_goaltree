/**
 * Integration Test for GoalValidationService and goalUtils with GoalManager
 * This file demonstrates how the Stream B components integrate with Stream A GoalManager
 */

import {
    Goal,
    GoalStatus,
    CreateGoalParams,
    UpdateGoalParams
} from '../types';
import { GoalManager } from '../services/GoalManager';
import { StorageService } from '../services/storageService';
import { GoalValidationService } from '../services/GoalValidationService';
import { GoalUtils } from './goalUtils';

/**
 * Integration test demonstrating the complete workflow
 */
export async function testGoalManagerIntegration(): Promise<void> {
    console.log('Testing GoalManager integration with Stream B components...');

    // Create services (in real usage, these would be injected)
    const storageService = new StorageService({} as any); // Mock context
    const goalValidationService = new GoalValidationService();
    const GoalManager = new GoalManager(storageService);

    try {
        // 1. Create some test goals using GoalManager
        console.log('1. Creating test goals...');
        
        const goal1Params: CreateGoalParams = {
            title: 'Complete Project Alpha',
            description: 'Main project goal with multiple phases',
            metadata: { priority: 5, tags: ['project', 'high-priority'] }
        };

        const goal1Result = await GoalManager.createGoal(goal1Params);
        if (!goal1Result.success || !goal1Result.data) {
            throw new Error('Failed to create goal 1');
        }
        const goal1 = goal1Result.data;

        const goal2Params: CreateGoalParams = {
            title: 'Phase 1: Planning',
            description: 'Initial planning phase',
            parentId: goal1.id,
            metadata: { priority: 4, tags: ['planning'] }
        };

        const goal2Result = await GoalManager.createGoal(goal2Params);
        if (!goal2Result.success || !goal2Result.data) {
            throw new Error('Failed to create goal 2');
        }
        const goal2 = goal2Result.data;

        const goal3Params: CreateGoalParams = {
            title: 'Phase 2: Implementation',
            description: 'Main implementation phase',
            parentId: goal1.id,
            metadata: { priority: 5, tags: ['implementation'] }
        };

        const goal3Result = await GoalManager.createGoal(goal3Params);
        if (!goal3Result.success || !goal3Result.data) {
            throw new Error('Failed to create goal 3');
        }
        const goal3 = goal3Result.data;

        // 2. Get all goals for validation and utility testing
        console.log('2. Retrieving all goals...');
        const allGoalsResult = await GoalManager.getAllGoals();
        if (!allGoalsResult.success || !allGoalsResult.data) {
            throw new Error('Failed to get all goals');
        }
        const allGoals = allGoalsResult.data;

        // 3. Test advanced validation
        console.log('3. Testing advanced validation...');
        for (const goal of allGoals) {
            const validationResult = await goalValidationService.validateGoalComprehensive(goal, allGoals);
            console.log(`Goal "${goal.title}" validation:`, {
                isValid: validationResult.isValid,
                errorCount: validationResult.errors.length,
                warningCount: validationResult.warnings.length,
                performanceMetrics: validationResult.performanceMetrics
            });

            if (validationResult.errors.length > 0) {
                console.log('  Errors:', validationResult.errors.map(e => e.message));
            }
            if (validationResult.warnings.length > 0) {
                console.log('  Warnings:', validationResult.warnings.map(w => w.message));
            }
        }

        // 4. Test search and filtering
        console.log('4. Testing search and filtering...');
        
        const searchResult = GoalUtils.searchGoals(allGoals, {
            searchText: 'phase',
            status: [GoalStatus.PLANNED],
            tags: ['planning', 'implementation']
        });
        console.log(`Search for "phase" found ${searchResult.totalCount} goals in ${searchResult.searchTime}ms`);
        
        const overdueGoals = GoalUtils.filterOverdueGoals(allGoals);
        console.log(`Found ${overdueGoals.length} overdue goals`);

        const priorityGoals = GoalUtils.sortGoalsByPriority(allGoals);
        console.log('Goals sorted by priority:', priorityGoals.map(g => `${g.title} (Priority: ${g.metadata?.priority || 3})`));

        // 5. Test progress calculation
        console.log('5. Testing progress calculation...');
        for (const goal of allGoals) {
            const progress = GoalUtils.calculateGoalProgress(goal, allGoals);
            const completionPercentage = GoalUtils.getCompletionPercentage(goal, allGoals);
            
            console.log(`Goal "${goal.title}":`, {
                taskProgress: progress.taskProgress,
                completionPercentage,
                isOverdue: progress.isOverdue,
                daysSinceCreated: progress.daysSinceCreated
            });
        }

        // 6. Test tree flattening
        console.log('6. Testing tree flattening...');
        const flatTree = GoalUtils.flattenGoalTree(allGoals);
        console.log('Flattened tree structure:');
        for (const node of flatTree) {
            const indent = '  '.repeat(node.depth);
            console.log(`${indent}${node.goal.title} (Depth: ${node.depth}, Progress: ${node.overallProgress}%)`);
        }

        // 7. Test bulk operations
        console.log('7. Testing bulk operations...');
        
        // Add some tasks first
        await GoalManager.addTask(goal2.id, {
            title: 'Create project plan',
            description: 'Detailed project planning'
        });
        
        await GoalManager.addTask(goal2.id, {
            title: 'Define requirements',
            description: 'Gather and document requirements'
        });

        // Test bulk status update
        const bulkUpdateResult = await GoalUtils.bulkUpdateStatus(
            [goal2.id],
            GoalStatus.IN_PROGRESS,
            async (goalId, updates) => GoalManager.updateGoal(goalId, updates)
        );
        
        console.log('Bulk update result:', {
            success: bulkUpdateResult.success,
            processed: bulkUpdateResult.totalProcessed,
            successful: bulkUpdateResult.successfulOperations,
            failed: bulkUpdateResult.failedOperations,
            duration: `${bulkUpdateResult.duration}ms`
        });

        // 8. Test data integrity
        console.log('8. Testing data integrity...');
        const updatedAllGoals = (await GoalManager.getAllGoals()).data || [];
        
        const orphanedGoals = GoalUtils.findOrphanedGoals(updatedAllGoals);
        console.log(`Found ${orphanedGoals.length} orphaned goals`);
        
        const circularGoals = GoalUtils.findGoalsWithCircularDependencies(updatedAllGoals);
        console.log(`Found ${circularGoals.length} goals with circular dependencies`);

        // 9. Test performance optimizations
        console.log('9. Testing performance optimizations...');
        
        const indices = GoalUtils.createGoalIndices(updatedAllGoals);
        console.log('Created indices:', {
            goalsById: indices.byId.size,
            goalsByParent: indices.byParent.size,
            goalsByStatus: indices.byStatus.size,
            goalsByTag: indices.byTag.size
        });

        // Test batching
        let batchCount = 0;
        for (const batch of GoalUtils.batchGoals(updatedAllGoals, 2)) {
            batchCount++;
            console.log(`Batch ${batchCount}: ${batch.length} goals`);
        }

        console.log('✅ All integration tests completed successfully!');

    } catch (error) {
        console.error('❌ Integration test failed:', error);
        throw error;
    } finally {
        // Cleanup
        GoalManager.dispose();
        GoalUtils.clearCache();
    }
}

/**
 * Demonstration of advanced validation scenarios
 */
export async function demonstrateAdvancedValidation(): Promise<void> {
    console.log('\nDemonstrating advanced validation scenarios...');

    const goalValidationService = new GoalValidationService({
        maxHierarchyDepth: 5,
        maxChildrenPerGoal: 10,
        maxTasksPerGoal: 50,
        allowCompletionWithoutTasks: false,
        enforceParentCompletionCascading: true
    });

    const mockGoals: Goal[] = [
        {
            id: 'goal1',
            title: 'Root Goal',
            status: GoalStatus.PLANNED,
            blockedByIds: [],
            tasks: [],
            createdAt: new Date()
        },
        {
            id: 'goal2',
            title: 'Child Goal',
            status: GoalStatus.COMPLETED,
            parentId: 'goal1',
            blockedByIds: [],
            tasks: [],
            createdAt: new Date(),
            completedAt: new Date()
        }
    ];

    // Test business rule violations
    const validationResult = await goalValidationService.validateGoalComprehensive(
        mockGoals[1], 
        mockGoals
    );

    console.log('Advanced validation result:');
    console.log('- Is valid:', validationResult.isValid);
    console.log('- Errors:', validationResult.errors.map(e => `[${e.severity}] ${e.message}`));
    console.log('- Warnings:', validationResult.warnings.map(w => w.message));
    console.log('- Performance metrics:', validationResult.performanceMetrics);

    // Test goal creation validation
    const creationParams: CreateGoalParams = {
        title: 'A'.repeat(250), // Too long title
        description: 'Test goal',
        parentId: 'nonexistent-parent'
    };

    const creationValidation = await goalValidationService.validateGoalCreationAdvanced(
        creationParams,
        mockGoals
    );

    console.log('\nGoal creation validation:');
    console.log('- Is valid:', creationValidation.isValid);
    console.log('- Errors:', creationValidation.errors.map(e => e.message));
    console.log('- Warnings:', creationValidation.warnings.map(w => w.message));
}

/**
 * Run all integration tests
 */
export async function runAllIntegrationTests(): Promise<void> {
    try {
        await testGoalManagerIntegration();
        await demonstrateAdvancedValidation();
        console.log('\n🎉 All integration tests passed!');
    } catch (error) {
        console.error('\n💥 Integration tests failed:', error);
        process.exit(1);
    }
}

// Export for testing
export { GoalValidationService, GoalUtils };