# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a VS Code extension project called "GoalTree" focused on goal tracking and management. The project uses the Claude Code Project Management (CCPM) system for development workflow.

## Architecture & Structure

### Core Components
- **CCPM System**: Complete project management workflow in `.claude/` directory
- **Agent Framework**: Specialized agents for context optimization and parallel execution
- **Command System**: Structured commands for PM, context, and testing operations
- **Rules Engine**: Development rules and patterns in `.claude/rules/`

### Key Directories
- `.claude/agents/` - Specialized agents (code-analyzer, file-analyzer, test-runner, parallel-worker)
- `.claude/commands/` - Command definitions organized by category (pm, context, testing)
- `.claude/scripts/` - Shell scripts for command execution
- `.claude/rules/` - Development patterns and operational rules
- `.claude/context/` - Project context and documentation system

## Development Commands

### Project Management
- `/pm:status` - View current project status and active work
- `/pm:epic-list` - List all epics and their status
- `/pm:issue-start <issue>` - Start work on an issue with parallel agents
- `/pm:prd-new <feature>` - Create new Product Requirements Document
- `/pm:next` - Show next prioritized tasks

### Context Management
- `/context:create` - Initialize project context documentation
- `/context:prime` - Load context for new development session
- `/context:update` - Update context with recent changes

### Testing
- `/testing:prime` - Configure testing setup
- `/testing:run [target]` - Execute tests with intelligent analysis

### Utilities
- `/prompt` - Handle complex prompts with multiple references
- `/code-rabbit` - Process CodeRabbit review comments intelligently

## Core Development Principles

### Agent Usage (CRITICAL)
- **ALWAYS** use `file-analyzer` agent when reading files for context optimization
- **ALWAYS** use `code-analyzer` agent for code search, analysis, and bug research  
- **ALWAYS** use `test-runner` agent for test execution and analysis
- **ALWAYS** use `parallel-worker` for coordinating multiple work streams

### Absolute Rules
- NO PARTIAL IMPLEMENTATION - Complete all features fully
- NO CODE DUPLICATION - Reuse existing functions and constants
- NO DEAD CODE - Remove unused code completely
- IMPLEMENT TESTS FOR EVERY FUNCTION - With verbose, debugging-friendly tests
- NO INCONSISTENT NAMING - Follow existing codebase patterns
- NO OVER-ENGINEERING - Prefer simple functions over complex abstractions
- NO MIXED CONCERNS - Maintain proper separation of responsibilities
- NO RESOURCE LEAKS - Clean up connections, timeouts, and listeners

### Error Handling Philosophy
- **Fail fast** for critical configuration issues
- **Log and continue** for optional features
- **Graceful degradation** when external services unavailable
- **User-friendly messages** through resilience layer

## Testing Strategy
- Never use mock services
- Complete each test before moving to next
- Structure tests correctly before refactoring codebase
- Verbose tests for debugging capabilities
- Use test-runner agent for all test execution

## Code Review & Quality
- Use `/code-rabbit` for processing external review comments
- Accept: Real bugs, security issues, resource leaks
- Ignore: Style preferences without context, irrelevant patterns
- Parallel processing for multi-file reviews
