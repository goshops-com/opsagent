import type { Alert } from "../alerts/types.js";
import type { SystemMetrics } from "../collector/metrics.js";

export function buildAlertPrompt(
  alert: Alert,
  metrics: SystemMetrics | null,
  recentAlerts: Alert[]
): string {
  const formatBytes = (bytes: number): string => {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let unitIndex = 0;
    let value = bytes;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }
    return `${value.toFixed(2)} ${units[unitIndex]}`;
  };

  const formatPercent = (value: number): string => `${value.toFixed(1)}%`;

  let metricsSection = "";
  if (metrics) {
    metricsSection = `## Current System Metrics

### CPU
- Usage: ${formatPercent(metrics.cpu.usage)}
- Load Average: ${metrics.cpu.loadAverage.join(", ")}
${metrics.cpu.temperature ? `- Temperature: ${metrics.cpu.temperature}°C` : ""}

### Memory
- Total: ${formatBytes(metrics.memory.total)}
- Used: ${formatBytes(metrics.memory.used)} (${formatPercent(metrics.memory.usedPercent)})
- Free: ${formatBytes(metrics.memory.free)}
- Swap Used: ${formatBytes(metrics.memory.swapUsed)} (${formatPercent(metrics.memory.swapPercent)})

### Disk
${metrics.disk.mounts
  .map(
    (m) =>
      `- ${m.mount}: ${formatBytes(m.used)}/${formatBytes(m.size)} (${formatPercent(m.usedPercent)})`
  )
  .join("\n")}

### Network
- Total RX: ${formatBytes(metrics.network.totalRxBytes)}
- Total TX: ${formatBytes(metrics.network.totalTxBytes)}
- Error Rate: ${formatPercent(metrics.network.errorRate * 100)}

### Processes
- Running: ${metrics.processes.running}
- Sleeping: ${metrics.processes.sleeping}
- Zombie: ${metrics.processes.zombie}

#### Top CPU Consumers
${metrics.processes.topCpu.map((p) => `- ${p.name} (PID ${p.pid}): ${formatPercent(p.cpu)} CPU`).join("\n")}

#### Top Memory Consumers
${metrics.processes.topMemory.map((p) => `- ${p.name} (PID ${p.pid}): ${formatPercent(p.memory)} Memory`).join("\n")}`;
  } else {
    metricsSection = `## Current System Metrics
(Detailed metrics not available - using NetData alert data)`;
  }

  let prompt = `# System Alert - Remediation Required

## Alert Details
- **Severity**: ${alert.severity.toUpperCase()}
- **Message**: ${alert.message}
- **Metric**: ${alert.metric}
- **Current Value**: ${alert.currentValue}
- **Threshold**: ${alert.threshold}
- **Time**: ${new Date(alert.timestamp).toISOString()}
${alert.source ? `- **Source**: ${alert.source}` : ""}

${metricsSection}

## Recent Alert History
${
  recentAlerts.length > 0
    ? recentAlerts
        .slice(-5)
        .map(
          (a) =>
            `- [${a.severity}] ${a.message} at ${new Date(a.timestamp).toISOString()}`
        )
        .join("\n")
    : "No recent alerts"
}

## Your Task
Analyze this alert and decide how to handle it. You can:
1. Take automated remediation actions (for safe, reversible operations)
2. Notify humans via Discord (for critical issues or when human judgment is needed)
3. Both - take immediate safe actions AND notify humans

**Decision Guidelines:**
- CRITICAL alerts: Always notify humans, even if you take automated action
- Actions requiring approval (kill_process, restart_service): Notify humans
- Safe automated actions (clear_cache, log_analysis): Execute directly
- Uncertain situations: Notify humans and explain what you found

**Response Format:**
\`\`\`json
{
  "analysis": "Your analysis of the problem and root cause",
  "canAutoRemediate": true/false,
  "requiresHumanAttention": true/false,
  "humanNotificationReason": "Why humans need to know (if applicable)",
  "recommendations": [
    {
      "action": "action_type",
      "description": "What this action does",
      "command": "optional shell command",
      "risk": "low|medium|high",
      "pid": 1234,
      "service": "service_name",
      "message": "message for notify_human"
    }
  ]
}
\`\`\`

**Available Actions:**
- "notify_human" - Send Discord notification to ops team (requires message parameter)
- "kill_process" - Kill a specific process (requires pid parameter, needs approval)
- "restart_service" - Restart a system service (requires service parameter, needs approval)
- "clear_cache" - Clear system caches (safe, auto-executed)
- "cleanup_disk" - Clean up temporary files (needs approval)
- "log_analysis" - Analyze relevant log files (safe, auto-executed)
- "custom_command" - Run a custom shell command (high risk, requires approval)

**Important:** For critical issues, ALWAYS include a "notify_human" action with a clear message explaining the situation.
`;

  return prompt;
}

export function buildSummaryPrompt(
  alerts: Alert[],
  metrics: SystemMetrics
): string {
  return `# System Health Summary Request

Please provide a brief summary of the current system health based on:

## Active Alerts (${alerts.length})
${
  alerts.length > 0
    ? alerts.map((a) => `- [${a.severity}] ${a.message}`).join("\n")
    : "No active alerts"
}

## Current Metrics
- CPU: ${metrics.cpu.usage.toFixed(1)}%
- Memory: ${metrics.memory.usedPercent.toFixed(1)}%
- Max Disk: ${Math.max(...metrics.disk.mounts.map((m) => m.usedPercent), 0).toFixed(1)}%
- Zombie Processes: ${metrics.processes.zombie}

Provide a 2-3 sentence summary of system health and any recommended actions.`;
}
