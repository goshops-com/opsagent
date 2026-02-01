# Contributing to OpsAgent

Thank you for your interest in contributing to OpsAgent! This document provides guidelines and information for contributors.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/opsagent.git`
3. Install Bun: `curl -fsSL https://bun.sh/install | bash`
4. Install dependencies: `bun install`
5. Copy `.env.example` to `.env` and configure
6. Run in development: `bun run dev`

## Development Workflow

### Running Locally

```bash
# Development mode
bun run dev

# Or use the CLI
./bin/opsagent.sh run
```

### Project Structure

- `src/collector/` - System metrics collection
- `src/rules/` - Alert rule engine
- `src/alerts/` - Alert management
- `src/agent/` - AI agent integration
- `src/db/` - Database operations
- `src/notifications/` - Discord notifications
- `src/dashboard/` - Web dashboard

## Submitting Changes

### Pull Requests

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Test thoroughly
4. Commit with clear messages
5. Push and create a Pull Request

### Commit Messages

Use clear, descriptive commit messages:

- `feat: add memory leak detection`
- `fix: resolve database connection timeout`
- `docs: update installation guide`
- `refactor: simplify rule engine logic`

## Adding New Features

### New Metrics

Add new metrics in `src/collector/metrics.ts` and update the types accordingly.

### New Rules

Define rules in `config/default.yaml` and add evaluation logic in `src/rules/engine.ts`.

### New Agent Actions

Add new actions in `src/agent/actions.ts` with appropriate risk levels.

## Questions?

Open an issue for questions or discussions about potential contributions.
