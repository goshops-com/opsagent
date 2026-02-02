import { EventEmitter } from "events";

export interface NetDataAlert {
  id: string;
  name: string;
  chart: string;
  context: string;
  family: string;
  severity: "warning" | "critical" | "clear" | "unknown";
  status: "raised" | "clear" | "warning" | "critical";
  value: number;
  oldValue?: number;
  units: string;
  info: string;
  timestamp: number;
  lastTransition?: number;
  duration?: number;
}

export interface NetDataAlarmResponse {
  hostname: string;
  alarms: Record<string, NetDataAlert>;
}

export interface NetDataCollectorConfig {
  url: string;
  pollInterval: number;
  monitorSeverity: "warning" | "critical" | "all";
  acknowledgeAlerts: boolean;
  severityMapping: {
    warning: string;
    critical: string;
    clear: string;
  };
  ignoreAlerts?: string[];
  forceAlerts?: string[];
}

export interface NetDataMetrics {
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usedPercent: number;
    swapUsed: number;
    swapPercent: number;
  };
  disk: {
    mounts: Array<{
      mount: string;
      size: number;
      used: number;
      usedPercent: number;
    }>;
  };
  network: {
    totalRxBytes: number;
    totalTxBytes: number;
    errorRate: number;
  };
  processes: {
    running: number;
    sleeping: number;
    zombie: number;
    topCpu: Array<{ name: string; pid: number; cpu: number; memory: number }>;
    topMemory: Array<{ name: string; pid: number; cpu: number; memory: number }>;
  };
}

export class NetDataAlertCollector extends EventEmitter {
  private config: NetDataCollectorConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private knownAlerts: Map<string, NetDataAlert> = new Map();
  private isRunning = false;
  private cachedMetrics: NetDataMetrics | null = null;

  constructor(config: NetDataCollectorConfig) {
    super();
    this.config = {
      ...config,
      ignoreAlerts: config.ignoreAlerts || [],
      forceAlerts: config.forceAlerts || [],
    };
  }

  async fetchMetrics(): Promise<NetDataMetrics | null> {
    try {
      const baseUrl = this.config.url;

      // Fetch multiple metrics in parallel
      const [cpuRes, ramRes, loadRes, diskRes, netRes] = await Promise.all([
        fetch(`${baseUrl}/api/v1/data?chart=system.cpu&points=1&format=json`).catch(() => null),
        fetch(`${baseUrl}/api/v1/data?chart=system.ram&points=1&format=json`).catch(() => null),
        fetch(`${baseUrl}/api/v1/data?chart=system.load&points=1&format=json`).catch(() => null),
        fetch(`${baseUrl}/api/v1/data?chart=disk_space._&points=1&format=json`).catch(() => null),
        fetch(`${baseUrl}/api/v1/data?chart=system.net&points=1&format=json`).catch(() => null),
      ]);

      // Parse CPU
      let cpuUsage = 0;
      if (cpuRes?.ok) {
        const cpuData = await cpuRes.json() as { data?: number[][] };
        if (cpuData.data?.[0]) {
          // Sum all CPU usage values (user, system, nice, etc)
          cpuUsage = cpuData.data[0].slice(1).reduce((a: number, b: number) => a + Math.abs(b || 0), 0);
        }
      }

      // Parse Load
      let loadAverage = [0, 0, 0];
      if (loadRes?.ok) {
        const loadData = await loadRes.json() as { data?: number[][] };
        if (loadData.data?.[0]) {
          loadAverage = [
            loadData.data[0][1] || 0,
            loadData.data[0][2] || 0,
            loadData.data[0][3] || 0,
          ];
        }
      }

      // Parse RAM
      let memory = { total: 0, used: 0, free: 0, usedPercent: 0, swapUsed: 0, swapPercent: 0 };
      if (ramRes?.ok) {
        const ramData = await ramRes.json() as { data?: number[][]; labels?: string[] };
        if (ramData.data?.[0]) {
          const labels = ramData.labels || [];
          const values = ramData.data[0];
          const freeIdx = labels.indexOf("free");
          const usedIdx = labels.indexOf("used");
          const cachedIdx = labels.indexOf("cached");
          const buffersIdx = labels.indexOf("buffers");

          const free = Math.abs(values[freeIdx] || 0);
          const used = Math.abs(values[usedIdx] || 0);
          const cached = Math.abs(values[cachedIdx] || 0);
          const buffers = Math.abs(values[buffersIdx] || 0);
          const total = free + used + cached + buffers;

          memory = {
            total: total * 1024 * 1024, // Convert to bytes
            used: used * 1024 * 1024,
            free: free * 1024 * 1024,
            usedPercent: total > 0 ? (used / total) * 100 : 0,
            swapUsed: 0,
            swapPercent: 0,
          };
        }
      }

      // Parse Disk - use info endpoint for better data
      let disk = { mounts: [] as NetDataMetrics["disk"]["mounts"] };
      try {
        const diskInfoRes = await fetch(`${baseUrl}/api/v1/info`);
        if (diskInfoRes.ok) {
          const info = await diskInfoRes.json() as { charts?: Record<string, unknown> };
          // Get disk space from charts
          const diskCharts = Object.keys(info.charts || {}).filter(c => c.startsWith("disk_space."));
          for (const chartName of diskCharts.slice(0, 4)) {
            const mount = chartName.replace("disk_space.", "/").replace(/_/g, "/");
            const chartRes = await fetch(`${baseUrl}/api/v1/data?chart=${chartName}&points=1&format=json`);
            if (chartRes.ok) {
              const chartData = await chartRes.json() as { data?: number[][] };
              if (chartData.data?.[0]) {
                const avail = Math.abs(chartData.data[0][1] || 0);
                const used = Math.abs(chartData.data[0][2] || 0);
                const total = avail + used;
                if (total > 0) {
                  disk.mounts.push({
                    mount: mount === "//" ? "/" : mount,
                    size: total * 1024 * 1024 * 1024,
                    used: used * 1024 * 1024 * 1024,
                    usedPercent: (used / total) * 100,
                  });
                }
              }
            }
          }
        }
      } catch (e) {
        // Ignore disk errors
      }

      // Parse Network
      let network = { totalRxBytes: 0, totalTxBytes: 0, errorRate: 0 };
      if (netRes?.ok) {
        const netData = await netRes.json() as { data?: number[][] };
        if (netData.data?.[0]) {
          network = {
            totalRxBytes: Math.abs(netData.data[0][1] || 0) * 1024,
            totalTxBytes: Math.abs(netData.data[0][2] || 0) * 1024,
            errorRate: 0,
          };
        }
      }

      this.cachedMetrics = {
        cpu: { usage: cpuUsage, loadAverage },
        memory,
        disk,
        network,
        processes: {
          running: 0,
          sleeping: 0,
          zombie: 0,
          topCpu: [],
          topMemory: [],
        },
      };

      return this.cachedMetrics;
    } catch (error) {
      console.error("[NetData] Error fetching metrics:", error);
      return this.cachedMetrics;
    }
  }

  getCachedMetrics(): NetDataMetrics | null {
    return this.cachedMetrics;
  }

  async fetchAlerts(): Promise<NetDataAlert[]> {
    try {
      // Fetch raised alerts
      const response = await fetch(`${this.config.url}/api/v1/alarms`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = (await response.json()) as NetDataAlarmResponse;
      const alerts: NetDataAlert[] = [];

      for (const [key, alert] of Object.entries(data.alarms)) {
        // NetData returns status as uppercase (WARNING, CRITICAL, CLEAR)
        // Normalize to lowercase for our internal use
        const normalizedSeverity = (alert.status || alert.severity || "unknown").toLowerCase();

        // Filter by severity
        if (this.config.monitorSeverity !== "all") {
          if (this.config.monitorSeverity === "critical" && normalizedSeverity !== "critical") {
            continue;
          }
          if (this.config.monitorSeverity === "warning" &&
              normalizedSeverity !== "warning" &&
              normalizedSeverity !== "critical") {
            continue;
          }
        }

        // Skip ignored alerts
        if (this.shouldIgnoreAlert(alert.name)) {
          continue;
        }

        alerts.push({
          ...alert,
          id: key,
          severity: normalizedSeverity as NetDataAlert["severity"],
        });
      }

      return alerts;
    } catch (error) {
      this.emit("error", error);
      return [];
    }
  }

  private shouldIgnoreAlert(alertName: string): boolean {
    // Check ignore patterns
    for (const pattern of this.config.ignoreAlerts || []) {
      if (this.matchPattern(alertName, pattern)) {
        return true;
      }
    }
    return false;
  }

  private shouldForceAlert(alertName: string): boolean {
    // Check force patterns
    for (const pattern of this.config.forceAlerts || []) {
      if (this.matchPattern(alertName, pattern)) {
        return true;
      }
    }
    return false;
  }

  private matchPattern(text: string, pattern: string): boolean {
    // Simple glob matching: * matches anything
    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
    return regex.test(text);
  }

  private mapSeverity(netdataSeverity: string): string {
    return this.config.severityMapping[netdataSeverity as keyof typeof this.config.severityMapping] || "unknown";
  }

  async checkAlerts(): Promise<void> {
    try {
      const currentAlerts = await this.fetchAlerts();
      const currentAlertIds = new Set(currentAlerts.map(a => a.id));

      // Check for new alerts
      for (const alert of currentAlerts) {
        const knownAlert = this.knownAlerts.get(alert.id);
        
        if (!knownAlert) {
          // New alert detected
          this.emit("alert", {
            type: "new",
            alert: {
              ...alert,
              severity: this.mapSeverity(alert.severity),
            },
          });
          this.knownAlerts.set(alert.id, alert);
        } else if (knownAlert.status !== alert.status || knownAlert.value !== alert.value) {
          // Alert state changed
          this.emit("alert", {
            type: "changed",
            alert: {
              ...alert,
              severity: this.mapSeverity(alert.severity),
            },
            previous: knownAlert,
          });
          this.knownAlerts.set(alert.id, alert);
        }
      }

      // Check for cleared alerts
      for (const [id, knownAlert] of this.knownAlerts) {
        if (!currentAlertIds.has(id)) {
          // Alert was cleared
          this.emit("alert", {
            type: "cleared",
            alert: {
              ...knownAlert,
              status: "clear",
              severity: this.config.severityMapping.clear,
            },
          });
          this.knownAlerts.delete(id);
        }
      }

      this.emit("check", {
        timestamp: Date.now(),
        alertCount: currentAlerts.length,
      });
    } catch (error) {
      this.emit("error", error);
    }
  }

  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    console.log(`Starting NetData alert collector (interval: ${this.config.pollInterval}s)`);
    console.log(`NetData URL: ${this.config.url}`);

    // Initial check
    this.checkAlerts();

    // Set up polling
    this.timer = setInterval(() => {
      this.checkAlerts();
    }, this.config.pollInterval * 1000);
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    console.log("NetData alert collector stopped");
  }

  isHealthy(): boolean {
    return this.isRunning;
  }

  getKnownAlerts(): NetDataAlert[] {
    return Array.from(this.knownAlerts.values());
  }

  async acknowledgeAlert(alertId: string): Promise<boolean> {
    if (!this.config.acknowledgeAlerts) {
      return false;
    }

    try {
      // Note: NetData doesn't have a built-in acknowledge API
      // This is a placeholder for future implementation
      // You could implement this by tracking acknowledged alerts locally
      // or by using NetData's silencing API
      
      // For now, just remove from known alerts
      this.knownAlerts.delete(alertId);
      return true;
    } catch (error) {
      this.emit("error", error);
      return false;
    }
  }

  async silenceAlert(alertName: string, duration: number): Promise<boolean> {
    try {
      // Use NetData's health management API to silence alerts
      const response = await fetch(
        `${this.config.url}/api/v1/manage/health?cmd=SILENCE&alarm=${alertName}`,
        {
          headers: {
            "X-Auth-Token": process.env.NETDATA_API_TOKEN || "",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to silence alert: ${response.statusText}`);
      }

      return true;
    } catch (error) {
      this.emit("error", error);
      return false;
    }
  }
}

// Helper function to convert NetData alert to OpsAgent alert format
export function convertNetDataAlertToOpsAgentAlert(netdataAlert: NetDataAlert): any {
  return {
    id: `netdata-${netdataAlert.id}`,
    severity: netdataAlert.severity,
    message: netdataAlert.info || `${netdataAlert.name} on ${netdataAlert.chart}`,
    metric: netdataAlert.context,
    currentValue: netdataAlert.value,
    threshold: netdataAlert.oldValue || 0,
    timestamp: netdataAlert.timestamp * 1000, // Convert to milliseconds
    source: "netdata",
    metadata: {
      chart: netdataAlert.chart,
      context: netdataAlert.context,
      family: netdataAlert.family,
      units: netdataAlert.units,
    },
  };
}
