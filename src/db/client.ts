import { createClient, type Client } from "@libsql/client";
import { schema } from "./schema.js";
import { hostname, networkInterfaces, platform, release } from "os";
import { randomUUID } from "crypto";
import type { Alert } from "../alerts/types.js";
import type { AgentResult } from "../agent/interface.js";
import type { SystemMetrics } from "../collector/metrics.js";

export interface ServerInfo {
  id: string;
  hostname: string;
  name: string;
  ipAddress: string;
  os: string;
  osVersion: string;
}

export class Database {
  private client: Client;
  private serverId: string;
  private serverInfo: ServerInfo;
  private initialized = false;

  constructor() {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url) {
      throw new Error("TURSO_DATABASE_URL is required");
    }

    this.client = createClient({
      url,
      authToken,
    });

    this.serverId = process.env.SERVER_ID || this.generateServerId();
    this.serverInfo = this.buildServerInfo();
  }

  private generateServerId(): string {
    // Generate a consistent ID based on hostname + first MAC address
    const host = hostname();
    const interfaces = networkInterfaces();
    let mac = "";
    for (const iface of Object.values(interfaces)) {
      if (iface) {
        const nonInternal = iface.find((i) => !i.internal && i.mac !== "00:00:00:00:00:00");
        if (nonInternal) {
          mac = nonInternal.mac;
          break;
        }
      }
    }
    // Create a deterministic ID from hostname + mac
    const base = `${host}-${mac}`.replace(/[^a-zA-Z0-9-]/g, "");
    return base || randomUUID();
  }

  private buildServerInfo(): ServerInfo {
    const host = hostname();
    const interfaces = networkInterfaces();
    let ipAddress = "";

    for (const iface of Object.values(interfaces)) {
      if (iface) {
        const ipv4 = iface.find((i) => !i.internal && i.family === "IPv4");
        if (ipv4) {
          ipAddress = ipv4.address;
          break;
        }
      }
    }

    return {
      id: this.serverId,
      hostname: host,
      name: process.env.SERVER_NAME || host,
      ipAddress,
      os: platform(),
      osVersion: release(),
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log("[Database] Initializing schema...");

    // Run schema creation
    const statements = schema.split(";").filter((s) => s.trim());
    for (const statement of statements) {
      if (statement.trim()) {
        await this.client.execute(statement);
      }
    }

    // Register this server
    await this.registerServer();

    this.initialized = true;
    console.log(`[Database] Initialized. Server ID: ${this.serverId}`);
  }

  private async registerServer(): Promise<void> {
    const now = Date.now();
    const info = this.serverInfo;

    await this.client.execute({
      sql: `
        INSERT INTO servers (id, hostname, name, ip_address, os, os_version, first_seen_at, last_seen_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
        ON CONFLICT(id) DO UPDATE SET
          hostname = excluded.hostname,
          name = excluded.name,
          ip_address = excluded.ip_address,
          os = excluded.os,
          os_version = excluded.os_version,
          last_seen_at = excluded.last_seen_at,
          status = 'active'
      `,
      args: [info.id, info.hostname, info.name, info.ipAddress, info.os, info.osVersion, now, now],
    });
  }

  async heartbeat(): Promise<void> {
    await this.client.execute({
      sql: "UPDATE servers SET last_seen_at = ?, status = 'active' WHERE id = ?",
      args: [Date.now(), this.serverId],
    });
  }

  async saveAlert(alert: Alert): Promise<void> {
    await this.client.execute({
      sql: `
        INSERT INTO alerts (id, server_id, severity, message, metric, current_value, threshold, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          resolved_at = excluded.resolved_at,
          acknowledged = excluded.acknowledged
      `,
      args: [
        alert.id,
        this.serverId,
        alert.severity,
        alert.message,
        alert.metric,
        alert.currentValue,
        alert.threshold,
        alert.timestamp,
      ],
    });
  }

  async resolveAlert(alertId: string): Promise<void> {
    await this.client.execute({
      sql: "UPDATE alerts SET resolved_at = ? WHERE id = ?",
      args: [Date.now(), alertId],
    });
  }

  async acknowledgeAlert(alertId: string, acknowledgedBy?: string): Promise<void> {
    await this.client.execute({
      sql: "UPDATE alerts SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = ? WHERE id = ?",
      args: [acknowledgedBy || "system", Date.now(), alertId],
    });
  }

  async saveAgentResponse(alert: Alert, result: AgentResult, model: string): Promise<void> {
    const responseId = `resp-${result.alertId}-${result.timestamp}`;

    // Save the agent response
    await this.client.execute({
      sql: `
        INSERT INTO agent_responses (id, alert_id, server_id, model, analysis, can_auto_remediate, requires_human_attention, human_notification_reason, raw_response, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        responseId,
        result.alertId,
        this.serverId,
        model,
        result.response?.analysis || "",
        result.response?.canAutoRemediate ? 1 : 0,
        result.response?.requiresHumanAttention ? 1 : 0,
        result.response?.humanNotificationReason || null,
        result.rawResponse,
        result.timestamp,
      ],
    });

    // Save each action
    for (const execResult of result.executionResults) {
      let status = "pending";
      if (execResult.success) status = "executed";
      else if (execResult.skipped) status = "skipped";
      else status = "failed";

      await this.client.execute({
        sql: `
          INSERT INTO agent_actions (response_id, alert_id, server_id, action_type, description, command, risk, status, output, error, skip_reason, executed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          responseId,
          result.alertId,
          this.serverId,
          execResult.action.action,
          execResult.action.description,
          execResult.action.command || null,
          execResult.action.risk,
          status,
          execResult.output || null,
          execResult.error || null,
          execResult.skipReason || null,
          result.timestamp,
        ],
      });
    }
  }

  async saveMetricsSnapshot(metrics: SystemMetrics): Promise<void> {
    await this.client.execute({
      sql: `
        INSERT INTO metrics_snapshots (
          server_id, timestamp, cpu_usage, cpu_load_avg, memory_used_percent,
          memory_used_bytes, memory_total_bytes, disk_max_used_percent, disk_data,
          network_error_rate, process_count, zombie_count, top_cpu_processes, top_memory_processes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        this.serverId,
        metrics.timestamp,
        metrics.cpu.usage,
        JSON.stringify(metrics.cpu.loadAverage),
        metrics.memory.usedPercent,
        metrics.memory.used,
        metrics.memory.total,
        Math.max(...metrics.disk.mounts.map((m) => m.usedPercent), 0),
        JSON.stringify(metrics.disk.mounts),
        metrics.network.errorRate,
        metrics.processes.running + metrics.processes.sleeping,
        metrics.processes.zombie,
        JSON.stringify(metrics.processes.topCpu),
        JSON.stringify(metrics.processes.topMemory),
      ],
    });
  }

  getServerId(): string {
    return this.serverId;
  }

  getServerInfo(): ServerInfo {
    return { ...this.serverInfo };
  }

  async close(): Promise<void> {
    await this.client.execute({
      sql: "UPDATE servers SET status = 'offline', last_seen_at = ? WHERE id = ?",
      args: [Date.now(), this.serverId],
    });
    this.client.close();
  }
}
