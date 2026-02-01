/**
 * Backend Interface
 *
 * Unified interface for both direct database access and control panel API.
 * This allows the agent to work with either backend transparently.
 */

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

/**
 * Backend interface that can be implemented by either:
 * - Database (direct Turso connection)
 * - ControlPanelClient (HTTP API to control panel)
 */
export interface Backend {
  initialize(): Promise<void>;
  heartbeat(metricsSummary?: MetricsSummary): Promise<void>;
  saveAlert(alert: Alert): Promise<void>;
  resolveAlert(alertId: string): Promise<void>;
  acknowledgeAlert(alertId: string, acknowledgedBy?: string): Promise<void>;
  saveAgentResponse(alert: Alert, result: AgentResult, model: string): Promise<void>;
  saveMetricsSnapshot(metrics: SystemMetrics): Promise<void>;
  close(): Promise<void>;
  getServerId(): string;
  getServerInfo(): ServerInfo;
}

export interface MetricsSummary {
  cpu_usage: number;
  memory_used_percent: number;
  disk_max_used_percent: number;
  process_count: number;
}

/**
 * Create the appropriate backend based on environment variables
 *
 * Priority:
 * 1. CONTROL_PANEL_URL - Use control panel API
 * 2. TURSO_DATABASE_URL - Use direct database
 * 3. Neither - Return null (standalone mode)
 */
export async function createBackend(): Promise<Backend | null> {
  const controlPanelUrl = process.env.CONTROL_PANEL_URL;
  const tursoUrl = process.env.TURSO_DATABASE_URL;

  if (controlPanelUrl) {
    console.log(`[Backend] Connecting to control panel at ${controlPanelUrl}...`);

    const { ControlPanelClient } = await import("./control-panel-client.js");
    const client = new ControlPanelClient({
      url: controlPanelUrl,
      apiKey: process.env.CONTROL_PANEL_PASSWORD,
    });

    // Check if control panel is reachable
    const healthy = await client.checkHealth();
    if (!healthy) {
      console.error(`[Backend] Control panel at ${controlPanelUrl} is not reachable`);
      throw new Error("Control panel is not reachable");
    }

    // Register with control panel
    await client.register();

    // Wrap client to match Backend interface
    const backend: Backend = {
      async initialize() {
        // Already done in register()
      },
      async heartbeat(metricsSummary) {
        await client.heartbeat(metricsSummary);
      },
      async saveAlert(alert) {
        await client.saveAlert(alert);
      },
      async resolveAlert(_alertId) {
        // TODO: Add resolve endpoint to control panel API
      },
      async acknowledgeAlert(_alertId, _acknowledgedBy) {
        // TODO: Add acknowledge endpoint to control panel API
      },
      async saveAgentResponse(alert, result, model) {
        await client.saveAgentResponse(alert, result, model);
      },
      async saveMetricsSnapshot(metrics) {
        await client.saveMetricsSnapshot(metrics);
      },
      async close() {
        await client.close();
      },
      getServerId() {
        return client.getServerId();
      },
      getServerInfo() {
        return client.getServerInfo();
      },
    };

    return backend;
  }

  if (tursoUrl) {
    console.log("[Backend] Connecting to Turso database...");

    const { Database } = await import("../db/client.js");
    const db = new Database();
    await db.initialize();

    // Database already implements the Backend interface
    return db as unknown as Backend;
  }

  console.log("[Backend] No backend configured, running in standalone mode");
  return null;
}
