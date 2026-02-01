/**
 * Control Panel API Client
 *
 * Used by agents to communicate with a remote control panel
 * instead of directly connecting to the database.
 */

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

export interface ControlPanelClientOptions {
  url: string;
  apiKey?: string;
  timeout?: number;
}

export class ControlPanelClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeout: number;
  private serverId: string;
  private serverInfo: ServerInfo;
  private registered = false;

  constructor(options: ControlPanelClientOptions) {
    // Remove trailing slash from URL
    this.baseUrl = options.url.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.timeout = options.timeout || 30000;

    this.serverId = process.env.SERVER_ID || this.generateServerId();
    this.serverInfo = this.buildServerInfo();
  }

  private generateServerId(): string {
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

  private async fetch(path: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Check if the control panel is reachable
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.fetch("/api/health");
      const data = (await response.json()) as { success?: boolean };
      return data.success === true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Register this agent with the control panel
   */
  async register(): Promise<void> {
    console.log(`[ControlPanel] Registering agent with ${this.baseUrl}...`);

    const response = await this.fetch("/api/agents", {
      method: "POST",
      body: JSON.stringify({
        id: this.serverInfo.id,
        hostname: this.serverInfo.hostname,
        name: this.serverInfo.name,
        ip_address: this.serverInfo.ipAddress,
        os: this.serverInfo.os,
        os_version: this.serverInfo.osVersion,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to register agent: ${error}`);
    }

    this.registered = true;
    console.log(`[ControlPanel] Agent registered successfully. ID: ${this.serverId}`);
  }

  /**
   * Send a heartbeat to the control panel
   */
  async heartbeat(metricsSummary?: {
    cpu_usage: number;
    memory_used_percent: number;
    disk_max_used_percent: number;
    process_count: number;
  }): Promise<void> {
    const response = await this.fetch("/api/agents/heartbeat", {
      method: "POST",
      body: JSON.stringify({
        agent_id: this.serverId,
        metrics_summary: metricsSummary,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      // If agent not found, try to re-register
      if (response.status === 404) {
        console.log("[ControlPanel] Agent not found, re-registering...");
        await this.register();
        return;
      }
      throw new Error(`Heartbeat failed: ${error}`);
    }
  }

  /**
   * Submit an alert to the control panel
   */
  async saveAlert(alert: Alert): Promise<void> {
    const response = await this.fetch("/api/alerts", {
      method: "POST",
      body: JSON.stringify({
        id: alert.id,
        server_id: this.serverId,
        severity: alert.severity,
        message: alert.message,
        metric: alert.metric,
        current_value: alert.currentValue,
        threshold: alert.threshold,
        timestamp: alert.timestamp,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to save alert: ${error}`);
    }
  }

  /**
   * Submit an agent response (AI analysis) to the control panel
   */
  async saveAgentResponse(alert: Alert, result: AgentResult, model: string): Promise<void> {
    const responseId = `resp-${result.alertId}-${result.timestamp}`;

    const actions = result.executionResults.map((execResult) => {
      let status = "pending";
      if (execResult.success) status = "executed";
      else if (execResult.skipped) status = "skipped";
      else status = "failed";

      return {
        action_type: execResult.action.action,
        description: execResult.action.description,
        command: execResult.action.command || null,
        risk: execResult.action.risk,
        status,
        output: execResult.output || null,
        error: execResult.error || null,
        skip_reason: execResult.skipReason || null,
        executed_at: result.timestamp,
      };
    });

    const response = await this.fetch("/api/agent-responses", {
      method: "POST",
      body: JSON.stringify({
        id: responseId,
        alert_id: result.alertId,
        server_id: this.serverId,
        model,
        analysis: result.response?.analysis || "",
        can_auto_remediate: result.response?.canAutoRemediate || false,
        requires_human_attention: result.response?.requiresHumanAttention || false,
        human_notification_reason: result.response?.humanNotificationReason || null,
        raw_response: result.rawResponse,
        actions,
        timestamp: result.timestamp,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to save agent response: ${error}`);
    }
  }

  /**
   * Save metrics snapshot to the control panel
   */
  async saveMetricsSnapshot(metrics: SystemMetrics): Promise<void> {
    // Metrics are sent as part of heartbeat
    // This method is kept for API compatibility
    await this.heartbeat({
      cpu_usage: metrics.cpu.usage,
      memory_used_percent: metrics.memory.usedPercent,
      disk_max_used_percent: Math.max(...metrics.disk.mounts.map((m) => m.usedPercent), 0),
      process_count: metrics.processes.running + metrics.processes.sleeping,
    });
  }

  /**
   * Mark agent as offline (called on shutdown)
   */
  async close(): Promise<void> {
    // The control panel will mark the agent as offline
    // when it misses heartbeats
    console.log("[ControlPanel] Agent disconnecting...");
  }

  getServerId(): string {
    return this.serverId;
  }

  getServerInfo(): ServerInfo {
    return { ...this.serverInfo };
  }

  isRegistered(): boolean {
    return this.registered;
  }
}
