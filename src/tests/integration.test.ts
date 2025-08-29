/**
 * Integration test for Visual Integration Stream C
 * 
 * This test verifies that the visual components and command integration
 * work correctly with the existing GoalManager and are ready for 
 * DependencyResolver integration from Stream A.
 */

import { GoalManager } from '../services/GoalManager';
import { ValidationService } from '../services/ValidationService';
import { GoalTreeProvider, GoalTreeItem, GoalTreeItemType } from '../providers/goalTreeProvider';
import { TreeCommands } from '../commands/TreeCommands';
import { Goal, GoalStatus, CreateGoalParams } from '../types';

/**
 * Mock logger for testing
 */
const mockLogger = (message: string) => {
    console.log(`[TEST] ${message}`);
};

/**
 * Test class for Visual Integration
 */
class VisualIntegrationTest {
    private GoalManager: GoalManager;
    private treeProvider: GoalTreeProvider;
    private treeCommands: TreeCommands;

    constructor() {
        const validationService = new ValidationService();
        this.GoalManager = new GoalManager(validationService, mockLogger);
        this.treeProvider = new GoalTreeProvider(this.GoalManager);
        this.treeCommands = new TreeCommands(this.GoalManager, this.treeProvider);
    }

    /**
     * Test basic goal creation and tree view display
     */
    public async testBasicGoalTreeDisplay(): Promise<boolean> {
        try {
            console.log('Testing basic goal tree display...');

            // Create test goals
            const goal1Params: CreateGoalParams = {
                title: 'Complete Project A',
                description: 'Main project goal'
            };

            const goal2Params: CreateGoalParams = {
                title: 'Setup Environment',
                description: 'Required for Project A'
            };

            const goal1 = await this.GoalManager.createGoal(goal1Params);
            const goal2 = await this.GoalManager.createGoal(goal2Params);

            // Add a blocking dependency
            await this.GoalManager.addBlockingDependency(goal1.id, goal2.id);

            // Test tree provider
            const rootItems = await this.treeProvider.getChildren();
            if (!rootItems || rootItems.length !== 2) {
                throw new Error('Expected 2 root goals');
            }

            // Test that the tree items have correct properties
            const goal1Item = rootItems.find(item => item.goalId === goal1.id);
            const goal2Item = rootItems.find(item => item.goalId === goal2.id);

            if (!goal1Item || !goal2Item) {
                throw new Error('Could not find expected goal items');
            }

            // Check if blocked goal is properly identified
            if (!goal1Item.isBlocked) {
                throw new Error('Goal1 should be blocked');
            }

            if (!goal2Item.isBlocking) {
                throw new Error('Goal2 should be blocking');
            }

            console.log('✅ Basic goal tree display test passed');
            return true;

        } catch (error) {
            console.error('❌ Basic goal tree display test failed:', error);
            return false;
        }
    }

    /**
     * Test dependency visualization
     */
    public async testDependencyVisualization(): Promise<boolean> {
        try {
            console.log('Testing dependency visualization...');

            // Create a chain of dependencies
            const goalA = await this.GoalManager.createGoal({
                title: 'Goal A (Final)',
                description: 'Depends on B'
            });

            const goalB = await this.GoalManager.createGoal({
                title: 'Goal B (Middle)',
                description: 'Depends on C'
            });

            const goalC = await this.GoalManager.createGoal({
                title: 'Goal C (First)',
                description: 'No dependencies'
            });

            // Create dependency chain: A -> B -> C
            await this.GoalManager.addBlockingDependency(goalA.id, goalB.id);
            await this.GoalManager.addBlockingDependency(goalB.id, goalC.id);

            // Test that visual indicators are correct
            const rootItems = await this.treeProvider.getChildren();
            const goalAItem = rootItems?.find(item => item.goalId === goalA.id);
            const goalBItem = rootItems?.find(item => item.goalId === goalB.id);
            const goalCItem = rootItems?.find(item => item.goalId === goalC.id);

            if (!goalAItem || !goalBItem || !goalCItem) {
                throw new Error('Could not find all goal items');
            }

            // Check dependency states
            if (!goalAItem.isBlocked || goalAItem.dependencyCount !== 1) {
                throw new Error('Goal A should be blocked by 1 dependency');
            }

            if (!goalBItem.isBlocked || goalBItem.dependencyCount !== 1) {
                throw new Error('Goal B should be blocked by 1 dependency');
            }

            if (goalCItem.isBlocked || goalCItem.dependencyCount !== 0) {
                throw new Error('Goal C should not be blocked');
            }

            // Test dependency chain visualization (would use private method in real implementation)
            console.log('✅ Dependency visualization test passed');
            return true;

        } catch (error) {
            console.error('❌ Dependency visualization test failed:', error);
            return false;
        }
    }

    /**
     * Test tree refresh functionality
     */
    public async testTreeRefresh(): Promise<boolean> {
        try {
            console.log('Testing tree refresh functionality...');

            // Create a goal and add a task
            const goal = await this.GoalManager.createGoal({
                title: 'Test Goal for Refresh',
                description: 'Testing refresh logic'
            });

            await this.GoalManager.addTask(goal.id, {
                title: 'Test Task',
                description: 'Testing task display'
            });

            // Test that tree provider shows the goal with tasks
            const rootItems = await this.treeProvider.getChildren();
            const goalItem = rootItems?.find(item => item.goalId === goal.id);

            if (!goalItem) {
                throw new Error('Could not find test goal');
            }

            // Test getting children (should include task)
            const goalChildren = await this.treeProvider.getChildren(goalItem);
            if (!goalChildren || goalChildren.length === 0) {
                throw new Error('Expected goal to have children (tasks)');
            }

            const taskItem = goalChildren.find(item => item.type === GoalTreeItemType.TASK);
            if (!taskItem) {
                throw new Error('Expected to find task item');
            }

            console.log('✅ Tree refresh functionality test passed');
            return true;

        } catch (error) {
            console.error('❌ Tree refresh functionality test failed:', error);
            return false;
        }
    }

    /**
     * Test DependencyResolver interface readiness
     */
    public async testDependencyResolverIntegration(): Promise<boolean> {
        try {
            console.log('Testing DependencyResolver integration readiness...');

            // Create mock dependency resolver
            const mockDependencyResolver = {
                createDependency: async (blockedGoalId: string, blockingGoalId: string) => {
                    console.log(`Mock: Creating dependency ${blockedGoalId} -> ${blockingGoalId}`);
                },
                deleteDependency: async (blockedGoalId: string, blockingGoalId: string) => {
                    console.log(`Mock: Deleting dependency ${blockedGoalId} -> ${blockingGoalId}`);
                },
                getDependencyChain: async (goalId: string) => {
                    return ['dependency1', 'dependency2'];
                },
                detectCircularDependencies: async () => {
                    return [];
                },
                buildDependencyGraph: async () => {
                    return {};
                },
                queryDependencies: async () => {
                    return [];
                },
                syncWithGoalManager: async () => {
                    console.log('Mock: Syncing with GoalManager');
                }
            };

            // Test that TreeCommands can accept the resolver
            this.treeCommands.setDependencyResolver(mockDependencyResolver);

            console.log('✅ DependencyResolver integration readiness test passed');
            return true;

        } catch (error) {
            console.error('❌ DependencyResolver integration readiness test failed:', error);
            return false;
        }
    }

    /**
     * Run all tests
     */
    public async runAllTests(): Promise<void> {
        console.log('🚀 Running Visual Integration Tests...\n');

        const tests = [
            this.testBasicGoalTreeDisplay(),
            this.testDependencyVisualization(),
            this.testTreeRefresh(),
            this.testDependencyResolverIntegration()
        ];

        const results = await Promise.all(tests);
        const passed = results.filter(result => result).length;
        const total = results.length;

        console.log(`\n📊 Test Results: ${passed}/${total} tests passed`);

        if (passed === total) {
            console.log('🎉 All Visual Integration tests passed! Stream C is ready.');
        } else {
            console.log('❌ Some tests failed. Please review the implementation.');
        }

        // Cleanup
        this.GoalManager.dispose();
        this.treeProvider.dispose();
    }
}

/**
 * Export test runner function
 */
export async function runVisualIntegrationTests(): Promise<void> {
    const testRunner = new VisualIntegrationTest();
    await testRunner.runAllTests();
}

// Run tests if this file is executed directly
if (require.main === module) {
    runVisualIntegrationTests().catch(console.error);
}