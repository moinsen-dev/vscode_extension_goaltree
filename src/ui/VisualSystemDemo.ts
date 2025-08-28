/**
 * Visual System Demo for the Goal Tree extension
 * Demonstrates how the TreeIcons, TreeThemes, and ProgressCalculator work together
 * This file can be used for testing and development purposes
 */

import * as vscode from 'vscode';
import { TreeIcons, IconUtils } from './TreeIcons';
import { TreeThemes } from './TreeThemes';
import { ProgressCalculator, ProgressUtils } from '../utils/ProgressCalculator';
import { Goal, Task, TaskStatus } from '../types/Goal';
import { GoalStatus } from '../types/GoalStatus';

/**
 * Sample data generator for testing visual indicators
 */
export class VisualSystemDemo {
  private progressCalculator: ProgressCalculator;

  constructor() {
    this.progressCalculator = new ProgressCalculator({
      weightingMethod: 'equal',
      includeBlocked: true,
      completedGoalOverride: true,
      inProgressThreshold: 10,
      emptyGoalHandling: 'complete-if-status'
    });
  }

  /**
   * Generate sample goals with different statuses
   */
  generateSampleGoals(): Goal[] {
    const now = new Date();
    const goals: Goal[] = [];

    // Root goal - planned with some tasks
    goals.push({
      id: 'goal-1',
      title: 'Complete Project Alpha',
      description: 'Main project goal with multiple phases',
      status: GoalStatus.PLANNED,
      blockedByIds: [],
      tasks: [
        {
          id: 'task-1-1',
          title: 'Initial planning',
          status: TaskStatus.TODO,
          order: 0,
          createdAt: now
        },
        {
          id: 'task-1-2',
          title: 'Requirements gathering',
          status: TaskStatus.TODO,
          order: 1,
          createdAt: now
        }
      ],
      createdAt: now,
      metadata: {
        priority: 5,
        estimatedHours: 40,
        actualHours: 0,
        tags: ['project', 'alpha']
      }
    });

    // Child goal - in progress with mixed tasks
    goals.push({
      id: 'goal-2',
      title: 'Development Phase',
      description: 'Core development work',
      status: GoalStatus.IN_PROGRESS,
      parentId: 'goal-1',
      blockedByIds: [],
      tasks: [
        {
          id: 'task-2-1',
          title: 'Setup development environment',
          status: TaskStatus.DONE,
          order: 0,
          createdAt: now,
          completedAt: now
        },
        {
          id: 'task-2-2',
          title: 'Implement core features',
          status: TaskStatus.IN_PROGRESS,
          order: 1,
          createdAt: now
        },
        {
          id: 'task-2-3',
          title: 'Write unit tests',
          status: TaskStatus.TODO,
          order: 2,
          createdAt: now
        }
      ],
      createdAt: now,
      metadata: {
        priority: 4,
        estimatedHours: 20,
        actualHours: 8
      }
    });

    // Blocked goal
    goals.push({
      id: 'goal-3',
      title: 'Integration Testing',
      description: 'Test integration with external systems',
      status: GoalStatus.BLOCKED,
      parentId: 'goal-1',
      blockedByIds: ['goal-2'],
      tasks: [
        {
          id: 'task-3-1',
          title: 'Setup test environment',
          status: TaskStatus.TODO,
          order: 0,
          createdAt: now
        }
      ],
      createdAt: now,
      metadata: {
        priority: 3,
        estimatedHours: 8,
        actualHours: 0
      }
    });

    // Completed goal
    goals.push({
      id: 'goal-4',
      title: 'Documentation',
      description: 'Project documentation',
      status: GoalStatus.COMPLETED,
      parentId: 'goal-1',
      blockedByIds: [],
      tasks: [
        {
          id: 'task-4-1',
          title: 'Write README',
          status: TaskStatus.DONE,
          order: 0,
          createdAt: now,
          completedAt: now
        },
        {
          id: 'task-4-2',
          title: 'Create API documentation',
          status: TaskStatus.DONE,
          order: 1,
          createdAt: now,
          completedAt: now
        }
      ],
      createdAt: now,
      completedAt: now,
      metadata: {
        priority: 2,
        estimatedHours: 5,
        actualHours: 6
      }
    });

    return goals;
  }

  /**
   * Demonstrate icon selection for different goal states
   */
  demonstrateIcons(): void {
    console.log('=== Goal Tree Visual System Demo ===');
    console.log('\n--- Icon System Demo ---');
    
    const goals = this.generateSampleGoals();
    
    goals.forEach(goal => {
      const hasChildren = goals.some(g => g.parentId === goal.id);
      const isRoot = !goal.parentId;
      const isHighPriority = (goal.metadata?.priority || 0) >= 4;
      
      const iconConfig = TreeIcons.getGoalIcon(goal.status, {
        hasChildren,
        isRoot,
        isHighPriority
      });
      
      console.log(`Goal: ${goal.title}`);
      console.log(`  Status: ${goal.status}`);
      console.log(`  Icon: ${iconConfig.icon instanceof vscode.ThemeIcon ? iconConfig.icon.id : iconConfig.icon}`);
      console.log(`  Tooltip: ${iconConfig.tooltip}`);
      console.log(`  Accessibility: ${iconConfig.accessibilityLabel}`);
      
      // Show task icons
      goal.tasks.forEach(task => {
        const taskIcon = TreeIcons.getTaskIcon(task.status);
        console.log(`    Task: ${task.title} - ${taskIcon.icon instanceof vscode.ThemeIcon ? taskIcon.icon.id : taskIcon.icon}`);
      });
      
      console.log('');
    });
  }

  /**
   * Demonstrate theme system functionality
   */
  demonstrateThemes(): void {
    console.log('--- Theme System Demo ---');
    
    // Show available themes
    const schemes = TreeThemes.getAvailableSchemes();
    console.log(`Available color schemes: ${schemes.map(s => s.name).join(', ')}`);
    
    // Show current theme colors
    const activeTheme = TreeThemes.getActiveTheme();
    console.log(`\nActive theme: ${activeTheme.name}`);
    
    // Demonstrate color retrieval
    Object.values(GoalStatus).forEach(status => {
      const color = TreeThemes.getGoalColor(status);
      console.log(`  Goal ${status}: ${color.id}`);
    });
    
    Object.values(TaskStatus).forEach(status => {
      const color = TreeThemes.getTaskColor(status);
      console.log(`  Task ${status}: ${color.id}`);
    });
    
    console.log('');
  }

  /**
   * Demonstrate progress calculation
   */
  demonstrateProgress(): void {
    console.log('--- Progress Calculator Demo ---');
    
    const goals = this.generateSampleGoals();
    
    goals.forEach(goal => {
      const progress = this.progressCalculator.calculateGoalProgress(goal);
      const progressStatus = this.progressCalculator.getProgressStatus(progress);
      const shouldBeInProgress = this.progressCalculator.shouldBeInProgress(progress);
      
      console.log(`Goal: ${goal.title}`);
      console.log(`  Progress: ${ProgressUtils.formatPercentage(progress.percentage)} (${ProgressUtils.formatRatio(progress.completed, progress.total)})`);
      console.log(`  Status: ${progressStatus}`);
      console.log(`  Should be in progress: ${shouldBeInProgress}`);
      console.log(`  Color class: ${ProgressUtils.getProgressColorClass(progress.percentage)}`);
      
      // Show progress icon
      const progressIcon = TreeIcons.getProgressIcon(progress.percentage);
      console.log(`  Progress icon: ${progressIcon.icon instanceof vscode.ThemeIcon ? progressIcon.icon.id : progressIcon.icon}`);
      
      // Show progress bar segments
      const segments = ProgressUtils.getProgressBarSegments(progress.percentage, 5);
      console.log(`  Progress bar: [${segments.map(s => s ? '█' : '░').join('')}]`);
      
      console.log('');
    });
    
    // Overall project progress
    const overallProgress = this.progressCalculator.calculateOverallProgress(goals);
    console.log(`Overall Project Progress: ${ProgressUtils.formatPercentage(overallProgress.percentage)}`);
    console.log(`Total completed/total: ${ProgressUtils.formatRatio(overallProgress.completed, overallProgress.total)}`);
    console.log('');
  }

  /**
   * Demonstrate integration between all systems
   */
  demonstrateIntegration(): void {
    console.log('--- Integrated Visual System Demo ---');
    
    const goals = this.generateSampleGoals();
    
    goals.forEach(goal => {
      console.log(`\n📋 ${goal.title}`);
      
      // Get appropriate icon
      const hasChildren = goals.some(g => g.parentId === goal.id);
      const isRoot = !goal.parentId;
      const isHighPriority = (goal.metadata?.priority || 0) >= 4;
      
      const iconConfig = TreeIcons.getGoalIcon(goal.status, {
        hasChildren,
        isRoot,
        isHighPriority
      });
      
      // Get theme colors
      const statusColor = TreeThemes.getGoalColor(goal.status);
      
      // Calculate progress
      const progress = this.progressCalculator.calculateGoalProgress(goal);
      const progressColor = TreeThemes.getProgressColor(progress.percentage);
      
      // Show integrated visualization
      console.log(`  🎯 Status: ${goal.status} (${statusColor.id})`);
      console.log(`  📊 Progress: ${ProgressUtils.formatPercentage(progress.percentage)} (${progressColor.id})`);
      console.log(`  🔗 ${iconConfig.tooltip}: ${iconConfig.icon instanceof vscode.ThemeIcon ? iconConfig.icon.id : iconConfig.icon}`);
      
      if (hasChildren) {
        console.log(`  📁 Has ${goals.filter(g => g.parentId === goal.id).length} child goals`);
      }
      
      if (goal.tasks.length > 0) {
        console.log(`  📝 Tasks: ${goal.tasks.length} total, ${progress.completed} completed`);
        goal.tasks.forEach(task => {
          const taskIcon = TreeIcons.getTaskIcon(task.status);
          const taskColor = TreeThemes.getTaskColor(task.status);
          console.log(`    ${taskIcon.icon instanceof vscode.ThemeIcon ? taskIcon.icon.id : taskIcon.icon} ${task.title} (${taskColor.id})`);
        });
      }
    });
  }

  /**
   * Run all demonstrations
   */
  runFullDemo(): void {
    console.log('🎨 Goal Tree Visual System Comprehensive Demo\n');
    
    try {
      this.demonstrateIcons();
      this.demonstrateThemes();
      this.demonstrateProgress();
      this.demonstrateIntegration();
      
      console.log('✅ Visual system demo completed successfully!');
      console.log('\nThe visual system is ready for integration with TreeDataProvider.');
    } catch (error) {
      console.error('❌ Demo failed:', error);
    }
  }

  /**
   * Test accessibility features
   */
  testAccessibility(): void {
    console.log('--- Accessibility Testing ---');
    
    const isHighContrast = TreeThemes.isHighContrastMode();
    const shouldUseAnimations = TreeThemes.shouldUseAnimations();
    
    console.log(`High contrast mode: ${isHighContrast}`);
    console.log(`Animations enabled: ${shouldUseAnimations}`);
    
    // Test all icon accessibility labels
    const sampleGoals = this.generateSampleGoals();
    sampleGoals.forEach(goal => {
      const iconConfig = TreeIcons.getGoalIcon(goal.status);
      if (iconConfig.accessibilityLabel) {
        console.log(`Goal "${goal.title}": "${iconConfig.accessibilityLabel}"`);
      }
    });
  }
}

/**
 * Export demo instance for external testing
 */
export const visualSystemDemo = new VisualSystemDemo();