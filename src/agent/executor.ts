import { exec } from "child_process";
import { promisify } from "util";
import type { AgentAction } from "./actionParser.js";

const execAsync = promisify(exec);

export interface ExecutionResult {
  action: AgentAction;
  success: boolean;
  output?: string;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

// Allowlist of safe actions that can be executed automatically
const SAFE_ACTIONS = new Set([
  "log_analysis",
  "clear_cache",
  "notify_human", // Notifications are always safe to send
]);

// Actions that require manual approval
const APPROVAL_REQUIRED = new Set([
  "kill_process",
  "restart_service",
  "cleanup_disk",
  "custom_command",
]);

export class ActionExecutor {
  private autoRemediate: boolean;
  private executionLog: ExecutionResult[] = [];

  constructor(autoRemediate: boolean = false) {
    this.autoRemediate = autoRemediate;
  }

  async executeAction(
    action: AgentAction,
    approved: boolean = false
  ): Promise<ExecutionResult> {
    // Check if action requires approval
    if (APPROVAL_REQUIRED.has(action.action) && !approved && !this.autoRemediate) {
      const result: ExecutionResult = {
        action,
        success: false,
        skipped: true,
        skipReason: "Requires manual approval",
      };
      this.executionLog.push(result);
      return result;
    }

    // Check risk level
    if (action.risk === "high" && !approved) {
      const result: ExecutionResult = {
        action,
        success: false,
        skipped: true,
        skipReason: "High-risk action requires explicit approval",
      };
      this.executionLog.push(result);
      return result;
    }

    let result: ExecutionResult;

    try {
      switch (action.action) {
        case "kill_process":
          result = await this.killProcess(action);
          break;

        case "restart_service":
          result = await this.restartService(action);
          break;

        case "clear_cache":
          result = await this.clearCache(action);
          break;

        case "cleanup_disk":
          result = await this.cleanupDisk(action);
          break;

        case "log_analysis":
          result = await this.analyzeLog(action);
          break;

        case "notify_human":
          // This is handled externally by the Discord notifier
          // Just mark it as needing to be sent
          result = {
            action,
            success: true,
            output: action.message || "Notification pending",
          };
          break;

        case "custom_command":
          if (action.command && approved) {
            result = await this.runCustomCommand(action);
          } else {
            result = {
              action,
              success: false,
              skipped: true,
              skipReason: "Custom commands require approval and a command string",
            };
          }
          break;

        default:
          result = {
            action,
            success: false,
            error: `Unknown action type: ${action.action}`,
          };
      }
    } catch (error) {
      result = {
        action,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    this.executionLog.push(result);
    return result;
  }

  private async killProcess(action: AgentAction): Promise<ExecutionResult> {
    if (!action.pid) {
      return {
        action,
        success: false,
        error: "No PID specified for kill_process action",
      };
    }

    try {
      // Use SIGTERM for graceful shutdown
      await execAsync(`kill -15 ${action.pid}`);
      return {
        action,
        success: true,
        output: `Sent SIGTERM to process ${action.pid}`,
      };
    } catch (error) {
      return {
        action,
        success: false,
        error: `Failed to kill process ${action.pid}: ${error}`,
      };
    }
  }

  private async restartService(action: AgentAction): Promise<ExecutionResult> {
    if (!action.service) {
      return {
        action,
        success: false,
        error: "No service name specified",
      };
    }

    // Sanitize service name
    const serviceName = action.service.replace(/[^a-zA-Z0-9_-]/g, "");

    try {
      // Try systemctl first, then service command
      try {
        await execAsync(`systemctl restart ${serviceName}`);
      } catch {
        await execAsync(`service ${serviceName} restart`);
      }

      return {
        action,
        success: true,
        output: `Restarted service ${serviceName}`,
      };
    } catch (error) {
      return {
        action,
        success: false,
        error: `Failed to restart service: ${error}`,
      };
    }
  }

  private async clearCache(action: AgentAction): Promise<ExecutionResult> {
    try {
      // Drop caches (requires root, might fail)
      const result = await execAsync(
        "sync && echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || echo 'Cache clear requires root'"
      );

      return {
        action,
        success: true,
        output: result.stdout || "Cache clear attempted",
      };
    } catch (error) {
      return {
        action,
        success: false,
        error: `Cache clear failed: ${error}`,
      };
    }
  }

  private async cleanupDisk(action: AgentAction): Promise<ExecutionResult> {
    try {
      const commands = [
        "rm -rf /tmp/* 2>/dev/null || true",
        "rm -rf /var/tmp/* 2>/dev/null || true",
        "journalctl --vacuum-time=7d 2>/dev/null || true",
      ];

      const results: string[] = [];
      for (const cmd of commands) {
        try {
          const { stdout } = await execAsync(cmd);
          if (stdout) results.push(stdout);
        } catch {
          // Continue with other commands
        }
      }

      return {
        action,
        success: true,
        output: `Disk cleanup completed. ${results.join("; ")}`,
      };
    } catch (error) {
      return {
        action,
        success: false,
        error: `Disk cleanup failed: ${error}`,
      };
    }
  }

  private async analyzeLog(action: AgentAction): Promise<ExecutionResult> {
    try {
      // Analyze recent system logs
      const { stdout } = await execAsync(
        "journalctl -p err -n 50 --no-pager 2>/dev/null || tail -50 /var/log/syslog 2>/dev/null || echo 'No logs available'"
      );

      return {
        action,
        success: true,
        output: stdout.slice(0, 2000), // Limit output size
      };
    } catch (error) {
      return {
        action,
        success: false,
        error: `Log analysis failed: ${error}`,
      };
    }
  }

  private async runCustomCommand(action: AgentAction): Promise<ExecutionResult> {
    if (!action.command) {
      return {
        action,
        success: false,
        error: "No command specified",
      };
    }

    // Basic command sanitization - block dangerous patterns
    const dangerousPatterns = [
      /rm\s+-rf\s+\/(?!\w)/,
      /mkfs/,
      /dd\s+if=/,
      />\s*\/dev\/sd/,
      /chmod\s+777\s+\//,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(action.command)) {
        return {
          action,
          success: false,
          error: "Command blocked: potentially dangerous operation",
        };
      }
    }

    try {
      const { stdout, stderr } = await execAsync(action.command, {
        timeout: 30000, // 30 second timeout
      });

      return {
        action,
        success: true,
        output: stdout || stderr,
      };
    } catch (error) {
      return {
        action,
        success: false,
        error: `Command failed: ${error}`,
      };
    }
  }

  getExecutionLog(): ExecutionResult[] {
    return [...this.executionLog];
  }

  clearLog(): void {
    this.executionLog = [];
  }
}
