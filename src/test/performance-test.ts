/**
 * Performance testing utilities for the GoalTreeProvider
 * Tests the provider's performance with large datasets (100+ goals)
 */

import * as vscode from 'vscode';
import { Goal, Task } from '../models';
import { StateManager } from '../services/stateManager';
import { GoalManager } from '../services/GoalManager';
import { ValidationService } from '../services/ValidationService';
import { DependencyService } from '../services/dependencyService';
import { GoalTreeProvider } from '../providers/goalTreeProvider';
import { createLogger, LogLevel } from '../utils/logger';
import { PerformanceTimer } from '../utils/performance';

/**
 * Test configuration for performance testing
 */
interface PerformanceTestConfig {
    goalCount: number;
    maxDepth: number;
    tasksPerGoal: number;
    testDuration: number; // milliseconds
    refreshInterval: number; // milliseconds
    memoryCheckInterval: number; // milliseconds
}

/**
 * Performance test results
 */
interface PerformanceTestResult {
    testName: string;
    goalCount: number;
    duration: number;
    memoryUsage: {
        start: number;
        peak: number;
        end: number;
    };
    operations: {
        getChildren: { count: number; totalTime: number; avgTime: number };
        getTreeItem: { count: number; totalTime: number; avgTime: number };
        refresh: { count: number; totalTime: number; avgTime: number };
    };
    cachePerformance: {
        hits: number;
        misses: number;
        hitRate: number;
    };
    errors: any[];
    passed: boolean;
}

/**
 * Performance test suite for GoalTreeProvider
 */
export class GoalTreePerformanceTest {
    private logger = createLogger('PerformanceTest');
    private timer = new PerformanceTimer();
    private testResults: PerformanceTestResult[] = [];

    constructor() {
        this.logger.setLevel(LogLevel.DEBUG);
    }

    /**
     * Run comprehensive performance tests
     */
    async runAllTests(context: vscode.ExtensionContext): Promise<PerformanceTestResult[]> {
        this.logger.info('Starting comprehensive performance tests');
        
        const testConfigs: PerformanceTestConfig[] = [
            {
                goalCount: 50,
                maxDepth: 3,
                tasksPerGoal: 5,
                testDuration: 30000,
                refreshInterval: 1000,
                memoryCheckInterval: 5000
            },
            {
                goalCount: 100,
                maxDepth: 4,
                tasksPerGoal: 8,
                testDuration: 45000,
                refreshInterval: 800,
                memoryCheckInterval: 5000
            },
            {
                goalCount: 200,
                maxDepth: 5,
                tasksPerGoal: 10,
                testDuration: 60000,
                refreshInterval: 600,
                memoryCheckInterval: 5000
            },
            {
                goalCount: 500,
                maxDepth: 6,
                tasksPerGoal: 15,
                testDuration: 90000,
                refreshInterval: 500,
                memoryCheckInterval: 5000
            }
        ];

        for (const config of testConfigs) {
            try {
                const result = await this.runPerformanceTest(config, context);
                this.testResults.push(result);
            } catch (error) {
                this.logger.error(`Test failed for config:`, config, error);
                this.testResults.push({
                    testName: `Performance Test (${config.goalCount} goals)`,
                    goalCount: config.goalCount,
                    duration: 0,
                    memoryUsage: { start: 0, peak: 0, end: 0 },
                    operations: {
                        getChildren: { count: 0, totalTime: 0, avgTime: 0 },
                        getTreeItem: { count: 0, totalTime: 0, avgTime: 0 },
                        refresh: { count: 0, totalTime: 0, avgTime: 0 }
                    },
                    cachePerformance: { hits: 0, misses: 0, hitRate: 0 },
                    errors: [error],
                    passed: false
                });
            }
        }

        this.generatePerformanceReport();
        return this.testResults;
    }

    /**
     * Run a single performance test
     */
    private async runPerformanceTest(
        config: PerformanceTestConfig,
        context: vscode.ExtensionContext
    ): Promise<PerformanceTestResult> {
        const testName = `Performance Test (${config.goalCount} goals)`;
        this.logger.info(`Starting ${testName}`);

        // Initialize test environment
        const { stateManager, GoalManager, provider } = await this.setupTestEnvironment(config, context);
        
        // Start monitoring
        const result: PerformanceTestResult = {
            testName,
            goalCount: config.goalCount,
            duration: 0,
            memoryUsage: {
                start: this.getMemoryUsage(),
                peak: 0,
                end: 0
            },
            operations: {
                getChildren: { count: 0, totalTime: 0, avgTime: 0 },
                getTreeItem: { count: 0, totalTime: 0, avgTime: 0 },
                refresh: { count: 0, totalTime: 0, avgTime: 0 }
            },
            cachePerformance: { hits: 0, misses: 0, hitRate: 0 },
            errors: [],
            passed: false
        };

        this.timer.start();
        let peakMemory = result.memoryUsage.start;

        try {
            // Run the test operations
            await this.executeTestOperations(config, provider, result);
            
            // Monitor memory usage
            const memoryCheckTimer = setInterval(() => {
                const currentMemory = this.getMemoryUsage();
                if (currentMemory > peakMemory) {
                    peakMemory = currentMemory;
                }
            }, config.memoryCheckInterval);

            // Wait for test duration
            await new Promise(resolve => setTimeout(resolve, config.testDuration));
            
            clearInterval(memoryCheckTimer);
            
            result.duration = this.timer.end();
            result.memoryUsage.peak = peakMemory;
            result.memoryUsage.end = this.getMemoryUsage();
            
            // Calculate averages
            if (result.operations.getChildren.count > 0) {
                result.operations.getChildren.avgTime = 
                    result.operations.getChildren.totalTime / result.operations.getChildren.count;
            }
            if (result.operations.getTreeItem.count > 0) {
                result.operations.getTreeItem.avgTime = 
                    result.operations.getTreeItem.totalTime / result.operations.getTreeItem.count;
            }
            if (result.operations.refresh.count > 0) {
                result.operations.refresh.avgTime = 
                    result.operations.refresh.totalTime / result.operations.refresh.count;
            }

            // Get cache performance
            const stats = provider.getPerformanceStats();
            if (stats.cacheSize !== undefined) {
                result.cachePerformance.hits = stats.cacheHits || 0;
                result.cachePerformance.misses = stats.cacheMisses || 0;
                result.cachePerformance.hitRate = 
                    result.cachePerformance.hits / 
                    Math.max(1, result.cachePerformance.hits + result.cachePerformance.misses);
            }

            // Validate performance criteria
            result.passed = this.validatePerformanceResults(result, config);

        } catch (error) {
            result.errors.push(error);
            this.logger.error(`Error during ${testName}:`, error);
        } finally {
            // Cleanup
            provider.dispose(context);
        }

        this.logger.info(`Completed ${testName}`, {
            passed: result.passed,
            duration: result.duration,
            operations: result.operations,
            memoryUsage: result.memoryUsage
        });

        return result;
    }

    /**
     * Setup test environment with mock data
     */
    private async setupTestEnvironment(
        config: PerformanceTestConfig,
        context: vscode.ExtensionContext
    ): Promise<{
        stateManager: StateManager;
        GoalManager: GoalManager;
        provider: GoalTreeProvider;
    }> {
        // Create test data
        const goals = this.generateTestGoals(config.goalCount, config.maxDepth, config.tasksPerGoal);
        
        // Setup services with test data
        const stateManager = new StateManager();
        const mockContext = {} as vscode.ExtensionContext; // Mock context for testing
        const validationService = new ValidationService();
        const dependencyService = new DependencyService(stateManager);
        const GoalManager = new GoalManager(validationService);
        
        // Initialize with test data
        for (const goal of goals) {
            stateManager.addGoal(goal);
        }

        // Create provider with performance optimizations
        const provider = new GoalTreeProvider(stateManager, GoalManager, context);

        return { stateManager, GoalManager, provider };
    }

    /**
     * Execute test operations on the provider
     */
    private async executeTestOperations(
        config: PerformanceTestConfig,
        provider: GoalTreeProvider,
        result: PerformanceTestResult
    ): Promise<void> {
        const operationCount = Math.min(100, config.goalCount);
        
        // Test getChildren operations
        for (let i = 0; i < operationCount; i++) {
            const start = performance.now();
            try {
                await provider.getChildren();
                await provider.getChildren(`goal-${i % 10}`); // Test with some goal IDs
                result.operations.getChildren.count += 2;
                result.operations.getChildren.totalTime += performance.now() - start;
            } catch (error) {
                result.errors.push({ operation: 'getChildren', error });
            }
        }

        // Test getTreeItem operations
        for (let i = 0; i < operationCount; i++) {
            const start = performance.now();
            try {
                provider.getTreeItem(`goal-${i % 20}`);
                provider.getTreeItem(`goal-${i % 20}:task-${i % 5}`); // Test task items
                result.operations.getTreeItem.count += 2;
                result.operations.getTreeItem.totalTime += performance.now() - start;
            } catch (error) {
                result.errors.push({ operation: 'getTreeItem', error });
            }
        }

        // Test refresh operations
        const refreshCount = Math.ceil(config.testDuration / config.refreshInterval);
        const refreshTimer = setInterval(() => {
            const start = performance.now();
            try {
                provider.refresh();
                result.operations.refresh.count++;
                result.operations.refresh.totalTime += performance.now() - start;
            } catch (error) {
                result.errors.push({ operation: 'refresh', error });
            }
        }, config.refreshInterval);

        // Clean up after test duration
        setTimeout(() => {
            clearInterval(refreshTimer);
        }, config.testDuration);
    }

    /**
     * Generate test goals with hierarchy
     */
    private generateTestGoals(count: number, maxDepth: number, tasksPerGoal: number): Goal[] {
        const goals: Goal[] = [];
        const now = new Date();

        for (let i = 0; i < count; i++) {
            const goal: Goal = {
                id: `goal-${i}`,
                title: `Test Goal ${i}`,
                description: `This is test goal ${i} for performance testing`,
                status: ['planned', 'in-progress', 'blocked', 'completed'][i % 4] as any,
                parentId: this.getParentId(i, count, maxDepth),
                blockedByIds: i % 10 === 0 ? [`goal-${Math.max(0, i - 1)}`] : [],
                createdAt: new Date(now.getTime() - Math.random() * 1000 * 60 * 60 * 24 * 30),
                completedAt: i % 4 === 3 ? new Date(now.getTime() - Math.random() * 1000 * 60 * 60 * 24 * 7) : undefined,
                tasks: this.generateTestTasks(tasksPerGoal, i),
                metadata: {
                    priority: Math.ceil(Math.random() * 5),
                    tags: [`tag-${i % 5}`, `category-${i % 3}`],
                    estimatedHours: Math.random() * 20,
                    actualHours: i % 4 === 3 ? Math.random() * 25 : undefined,
                    dueDate: i % 7 === 0 ? new Date(now.getTime() + Math.random() * 1000 * 60 * 60 * 24 * 30) : undefined
                }
            };
            goals.push(goal);
        }

        return goals;
    }

    /**
     * Generate test tasks for a goal
     */
    private generateTestTasks(count: number, goalIndex: number): Task[] {
        const tasks: Task[] = [];
        const now = new Date();

        for (let i = 0; i < count; i++) {
            const task: Task = {
                id: `task-${goalIndex}-${i}`,
                title: `Task ${i} for Goal ${goalIndex}`,
                description: `Test task ${i} description`,
                status: ['todo', 'in-progress', 'done'][i % 3] as any,
                order: i,
                createdAt: new Date(now.getTime() - Math.random() * 1000 * 60 * 60 * 24 * 7),
                completedAt: i % 3 === 2 ? new Date(now.getTime() - Math.random() * 1000 * 60 * 60 * 24 * 3) : undefined
            };
            tasks.push(task);
        }

        return tasks;
    }

    /**
     * Get parent ID for creating hierarchy
     */
    private getParentId(index: number, total: number, maxDepth: number): string | undefined {
        if (index === 0 || maxDepth <= 1) return undefined;
        
        const depth = Math.floor(Math.log2(index + 1)) + 1;
        if (depth > maxDepth) {
            const parentIndex = Math.floor(Math.random() * Math.min(index, total / 4));
            return `goal-${parentIndex}`;
        }
        
        if (index < 10) return undefined; // First 10 are root goals
        
        const parentIndex = Math.floor(Math.random() * Math.min(index / 2, 50));
        return `goal-${parentIndex}`;
    }

    /**
     * Validate performance results against acceptance criteria
     */
    private validatePerformanceResults(result: PerformanceTestResult, config: PerformanceTestConfig): boolean {
        const criteria = {
            maxAvgGetChildrenTime: 50, // milliseconds
            maxAvgGetTreeItemTime: 20, // milliseconds
            maxAvgRefreshTime: 100, // milliseconds
            maxMemoryIncrease: 100 * 1024 * 1024, // 100MB
            minCacheHitRate: 0.3, // 30%
            maxErrorRate: 0.05 // 5%
        };

        const failures: string[] = [];

        // Check operation performance
        if (result.operations.getChildren.avgTime > criteria.maxAvgGetChildrenTime) {
            failures.push(`getChildren avg time: ${result.operations.getChildren.avgTime}ms > ${criteria.maxAvgGetChildrenTime}ms`);
        }

        if (result.operations.getTreeItem.avgTime > criteria.maxAvgGetTreeItemTime) {
            failures.push(`getTreeItem avg time: ${result.operations.getTreeItem.avgTime}ms > ${criteria.maxAvgGetTreeItemTime}ms`);
        }

        if (result.operations.refresh.avgTime > criteria.maxAvgRefreshTime) {
            failures.push(`refresh avg time: ${result.operations.refresh.avgTime}ms > ${criteria.maxAvgRefreshTime}ms`);
        }

        // Check memory usage
        const memoryIncrease = result.memoryUsage.peak - result.memoryUsage.start;
        if (memoryIncrease > criteria.maxMemoryIncrease) {
            failures.push(`Memory increase: ${memoryIncrease / 1024 / 1024}MB > ${criteria.maxMemoryIncrease / 1024 / 1024}MB`);
        }

        // Check cache performance
        if (result.cachePerformance.hitRate < criteria.minCacheHitRate && config.goalCount > 50) {
            failures.push(`Cache hit rate: ${result.cachePerformance.hitRate} < ${criteria.minCacheHitRate}`);
        }

        // Check error rate
        const totalOperations = result.operations.getChildren.count + 
                              result.operations.getTreeItem.count + 
                              result.operations.refresh.count;
        const errorRate = result.errors.length / Math.max(1, totalOperations);
        if (errorRate > criteria.maxErrorRate) {
            failures.push(`Error rate: ${errorRate} > ${criteria.maxErrorRate}`);
        }

        if (failures.length > 0) {
            this.logger.warn(`Performance test failures for ${config.goalCount} goals:`, failures);
            return false;
        }

        return true;
    }

    /**
     * Get current memory usage in bytes
     */
    private getMemoryUsage(): number {
        try {
            return process.memoryUsage().heapUsed;
        } catch {
            return 0;
        }
    }

    /**
     * Generate comprehensive performance report
     */
    private generatePerformanceReport(): void {
        this.logger.info('='.repeat(80));
        this.logger.info('GOAL TREE PERFORMANCE TEST REPORT');
        this.logger.info('='.repeat(80));

        for (const result of this.testResults) {
            this.logger.info(`\n${result.testName}:`);
            this.logger.info(`  Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
            this.logger.info(`  Goals: ${result.goalCount}`);
            this.logger.info(`  Duration: ${result.duration.toFixed(2)}ms`);
            
            this.logger.info(`  Memory Usage:`);
            this.logger.info(`    Start: ${(result.memoryUsage.start / 1024 / 1024).toFixed(2)}MB`);
            this.logger.info(`    Peak: ${(result.memoryUsage.peak / 1024 / 1024).toFixed(2)}MB`);
            this.logger.info(`    End: ${(result.memoryUsage.end / 1024 / 1024).toFixed(2)}MB`);
            this.logger.info(`    Increase: ${((result.memoryUsage.peak - result.memoryUsage.start) / 1024 / 1024).toFixed(2)}MB`);

            this.logger.info(`  Operations:`);
            this.logger.info(`    getChildren: ${result.operations.getChildren.count} calls, ${result.operations.getChildren.avgTime.toFixed(2)}ms avg`);
            this.logger.info(`    getTreeItem: ${result.operations.getTreeItem.count} calls, ${result.operations.getTreeItem.avgTime.toFixed(2)}ms avg`);
            this.logger.info(`    refresh: ${result.operations.refresh.count} calls, ${result.operations.refresh.avgTime.toFixed(2)}ms avg`);

            this.logger.info(`  Cache Performance:`);
            this.logger.info(`    Hits: ${result.cachePerformance.hits}`);
            this.logger.info(`    Misses: ${result.cachePerformance.misses}`);
            this.logger.info(`    Hit Rate: ${(result.cachePerformance.hitRate * 100).toFixed(1)}%`);

            if (result.errors.length > 0) {
                this.logger.info(`  Errors: ${result.errors.length}`);
                result.errors.forEach((error, index) => {
                    this.logger.error(`    ${index + 1}. ${error.operation || 'Unknown'}: ${error.message || error}`);
                });
            }
        }

        const passedTests = this.testResults.filter(r => r.passed).length;
        const totalTests = this.testResults.length;

        this.logger.info('\n' + '='.repeat(80));
        this.logger.info(`SUMMARY: ${passedTests}/${totalTests} tests passed (${((passedTests / totalTests) * 100).toFixed(1)}%)`);
        this.logger.info('='.repeat(80));

        if (passedTests === totalTests) {
            this.logger.info('🎉 All performance tests passed! The tree provider is optimized for large datasets.');
        } else {
            this.logger.warn('⚠️  Some performance tests failed. Consider further optimizations.');
        }
    }

    /**
     * Run a quick performance validation (for development)
     */
    async runQuickValidation(context: vscode.ExtensionContext): Promise<boolean> {
        const quickConfig: PerformanceTestConfig = {
            goalCount: 100,
            maxDepth: 3,
            tasksPerGoal: 5,
            testDuration: 10000,
            refreshInterval: 2000,
            memoryCheckInterval: 5000
        };

        try {
            const result = await this.runPerformanceTest(quickConfig, context);
            this.logger.info('Quick validation result:', {
                passed: result.passed,
                avgGetChildrenTime: result.operations.getChildren.avgTime,
                avgGetTreeItemTime: result.operations.getTreeItem.avgTime,
                cacheHitRate: result.cachePerformance.hitRate
            });
            
            return result.passed;
        } catch (error) {
            this.logger.error('Quick validation failed:', error);
            return false;
        }
    }
}

/**
 * Export utility function to run performance tests from extension
 */
export async function runPerformanceTests(context: vscode.ExtensionContext): Promise<void> {
    const tester = new GoalTreePerformanceTest();
    const results = await tester.runAllTests(context);
    
    // Show results to user
    const passedCount = results.filter(r => r.passed).length;
    const message = `Performance Tests: ${passedCount}/${results.length} passed`;
    
    if (passedCount === results.length) {
        vscode.window.showInformationMessage(`✅ ${message}`);
    } else {
        vscode.window.showWarningMessage(`⚠️ ${message}`);
    }
}