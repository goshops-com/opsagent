# OpsAgent Control Panel

A Next.js web dashboard for monitoring all OpsAgent instances across your infrastructure.

## Features

- View all registered servers
- Monitor active alerts
- See AI agent analysis and recommendations
- Track agent actions and their status

## Setup

```bash
cd packages/control-panel

# Install dependencies
bun install

# Configure environment
cp .env.example .env
# Edit .env with your Turso credentials

# Run development server
bun run dev
```

Open http://localhost:3002 to view the dashboard.

## Production

```bash
bun run build
bun run start
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TURSO_DATABASE_URL` | Your Turso database URL |
| `TURSO_AUTH_TOKEN` | Your Turso auth token |
