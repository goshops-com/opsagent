import type { SystemMetrics } from "../collector/metrics.js";
import type { Rule, RuleViolation, Severity } from "./types.js";

interface MetricHistory {
  timestamp: number;
  value: number;
}

interface SustainedState {
  startTime: number | null;
  values: MetricHistory[];
}

interface ProcessAlertState {
  lastAlertTime: number;
  processName: string;
}

export class RuleEngine {
  private rules: Rule[] = [];
  private metricHistory: Map<string, MetricHistory[]> = new Map();
  private sustainedStates: Map<string, SustainedState> = new Map();
  private processAlertState: Map<string, ProcessAlertState> = new Map();
  private historyRetention = 3600000; // 1 hour
  private config: any = {};

  constructor() {}

  loadRulesFromConfig(config: any): void {
    this.rules = [];
    this.config = config;

    // CPU rules
    if (config.rules?.cpu) {
      const cpu = config.rules.cpu;
      if (cpu.warning) {
        this.rules.push({
          type: "threshold",
          metric: "cpu.usage",
          operator: ">",
          value: cpu.warning,
          severity: "warning",
          message: `CPU usage above ${cpu.warning}%`,
        });
      }
      if (cpu.critical) {
        this.rules.push({
          type: "threshold",
          metric: "cpu.usage",
          operator: ">",
          value: cpu.critical,
          severity: "critical",
          message: `CPU usage critically high (above ${cpu.critical}%)`,
        });
      }
      if (cpu.sustained) {
        this.rules.push({
          type: "sustained",
          metric: "cpu.usage",
          operator: ">",
          value: cpu.sustained.threshold,
          duration: cpu.sustained.duration,
          severity: "critical",
          message: `CPU usage sustained above ${cpu.sustained.threshold}% for extended period`,
        });
      }
      if (cpu.loadAverage?.warning) {
        this.rules.push({
          type: "threshold",
          metric: "cpu.loadAverage.1min",
          operator: ">",
          value: cpu.loadAverage.warning,
          severity: "warning",
          message: `System load average (1min) above ${cpu.loadAverage.warning}`,
        });
      }
      if (cpu.loadAverage?.critical) {
        this.rules.push({
          type: "threshold",
          metric: "cpu.loadAverage.1min",
          operator: ">",
          value: cpu.loadAverage.critical,
          severity: "critical",
          message: `System load average (1min) critically high (above ${cpu.loadAverage.critical})`,
        });
      }
      if (cpu.temperature?.warning) {
        this.rules.push({
          type: "threshold",
          metric: "cpu.temperature",
          operator: ">",
          value: cpu.temperature.warning,
          severity: "warning",
          message: `CPU temperature above ${cpu.temperature.warning}°C`,
        });
      }
      if (cpu.temperature?.critical) {
        this.rules.push({
          type: "threshold",
          metric: "cpu.temperature",
          operator: ">",
          value: cpu.temperature.critical,
          severity: "critical",
          message: `CPU temperature critically high (above ${cpu.temperature.critical}°C)`,
        });
      }
      if (cpu.iowait?.warning) {
        this.rules.push({
          type: "threshold",
          metric: "cpu.iowait",
          operator: ">",
          value: cpu.iowait.warning,
          severity: "warning",
          message: `CPU I/O wait above ${cpu.iowait.warning}%`,
        });
      }
      if (cpu.iowait?.critical) {
        this.rules.push({
          type: "threshold",
          metric: "cpu.iowait",
          operator: ">",
          value: cpu.iowait.critical,
          severity: "critical",
          message: `CPU I/O wait critically high (above ${cpu.iowait.critical}%)`,
        });
      }
    }

    // Memory rules
    if (config.rules?.memory) {
      const mem = config.rules.memory;
      if (mem.warning) {
        this.rules.push({
          type: "threshold",
          metric: "memory.usedPercent",
          operator: ">",
          value: mem.warning,
          severity: "warning",
          message: `Memory usage above ${mem.warning}%`,
        });
      }
      if (mem.critical) {
        this.rules.push({
          type: "threshold",
          metric: "memory.usedPercent",
          operator: ">",
          value: mem.critical,
          severity: "critical",
          message: `Memory usage critically high (above ${mem.critical}%)`,
        });
      }
      if (mem.swap?.warning) {
        this.rules.push({
          type: "threshold",
          metric: "memory.swapPercent",
          operator: ">",
          value: mem.swap.warning,
          severity: "warning",
          message: `Swap usage above ${mem.swap.warning}%`,
        });
      }
      if (mem.swap?.critical) {
        this.rules.push({
          type: "threshold",
          metric: "memory.swapPercent",
          operator: ">",
          value: mem.swap.critical,
          severity: "critical",
          message: `Swap usage critically high (above ${mem.swap.critical}%)`,
        });
      }
      if (mem.available?.warning) {
        this.rules.push({
          type: "threshold",
          metric: "memory.availablePercent",
          operator: "<",
          value: mem.available.warning,
          severity: "warning",
          message: `Available memory below ${mem.available.warning}%`,
        });
      }
      if (mem.available?.critical) {
        this.rules.push({
          type: "threshold",
          metric: "memory.availablePercent",
          operator: "<",
          value: mem.available.critical,
          severity: "critical",
          message: `Available memory critically low (below ${mem.available.critical}%)`,
        });
      }
    }

    // Disk rules
    if (config.rules?.disk) {
      const disk = config.rules.disk;
      if (disk.warning) {
        this.rules.push({
          type: "threshold",
          metric: "disk.maxUsedPercent",
          operator: ">",
          value: disk.warning,
          severity: "warning",
          message: `Disk usage above ${disk.warning}%`,
        });
      }
      if (disk.critical) {
        this.rules.push({
          type: "threshold",
          metric: "disk.maxUsedPercent",
          operator: ">",
          value: disk.critical,
          severity: "critical",
          message: `Disk usage critically high (above ${disk.critical}%)`,
        });
      }
      if (disk.growthRateWarning) {
        this.rules.push({
          type: "rate",
          metric: "disk.totalUsed",
          operator: ">",
          ratePerHour: disk.growthRateWarning,
          severity: "warning",
          message: "Disk usage growing rapidly",
        });
      }
      if (disk.inodes?.warning) {
        this.rules.push({
          type: "threshold",
          metric: "disk.inodes.maxUsedPercent",
          operator: ">",
          value: disk.inodes.warning,
          severity: "warning",
          message: `Inode usage above ${disk.inodes.warning}%`,
        });
      }
      if (disk.inodes?.critical) {
        this.rules.push({
          type: "threshold",
          metric: "disk.inodes.maxUsedPercent",
          operator: ">",
          value: disk.inodes.critical,
          severity: "critical",
          message: `Inode usage critically high (above ${disk.inodes.critical}%)`,
        });
      }
      if (disk.io?.readRateWarning) {
        this.rules.push({
          type: "threshold",
          metric: "disk.io.readRate",
          operator: ">",
          value: disk.io.readRateWarning,
          severity: "warning",
          message: `Disk read rate above ${(disk.io.readRateWarning / 1048576).toFixed(0)}MB/s`,
        });
      }
      if (disk.io?.readRateCritical) {
        this.rules.push({
          type: "threshold",
          metric: "disk.io.readRate",
          operator: ">",
          value: disk.io.readRateCritical,
          severity: "critical",
          message: `Disk read rate critically high (above ${(disk.io.readRateCritical / 1048576).toFixed(0)}MB/s)`,
        });
      }
      if (disk.io?.writeRateWarning) {
        this.rules.push({
          type: "threshold",
          metric: "disk.io.writeRate",
          operator: ">",
          value: disk.io.writeRateWarning,
          severity: "warning",
          message: `Disk write rate above ${(disk.io.writeRateWarning / 1048576).toFixed(0)}MB/s`,
        });
      }
      if (disk.io?.writeRateCritical) {
        this.rules.push({
          type: "threshold",
          metric: "disk.io.writeRate",
          operator: ">",
          value: disk.io.writeRateCritical,
          severity: "critical",
          message: `Disk write rate critically high (above ${(disk.io.writeRateCritical / 1048576).toFixed(0)}MB/s)`,
        });
      }
    }

    // Network rules
    if (config.rules?.network) {
      const net = config.rules.network;
      if (net.errorRateWarning) {
        this.rules.push({
          type: "threshold",
          metric: "network.errorRate",
          operator: ">",
          value: net.errorRateWarning,
          severity: "warning",
          message: `Network error rate above ${(net.errorRateWarning * 100).toFixed(1)}%`,
        });
      }
      if (net.bandwidth?.rxWarning) {
        this.rules.push({
          type: "threshold",
          metric: "network.bandwidth.rxSpeed",
          operator: ">",
          value: net.bandwidth.rxWarning,
          severity: "warning",
          message: `Network receive rate above ${(net.bandwidth.rxWarning / 1048576).toFixed(0)}MB/s`,
        });
      }
      if (net.bandwidth?.rxCritical) {
        this.rules.push({
          type: "threshold",
          metric: "network.bandwidth.rxSpeed",
          operator: ">",
          value: net.bandwidth.rxCritical,
          severity: "critical",
          message: `Network receive rate critically high (above ${(net.bandwidth.rxCritical / 1048576).toFixed(0)}MB/s)`,
        });
      }
      if (net.bandwidth?.txWarning) {
        this.rules.push({
          type: "threshold",
          metric: "network.bandwidth.txSpeed",
          operator: ">",
          value: net.bandwidth.txWarning,
          severity: "warning",
          message: `Network transmit rate above ${(net.bandwidth.txWarning / 1048576).toFixed(0)}MB/s`,
        });
      }
      if (net.bandwidth?.txCritical) {
        this.rules.push({
          type: "threshold",
          metric: "network.bandwidth.txSpeed",
          operator: ">",
          value: net.bandwidth.txCritical,
          severity: "critical",
          message: `Network transmit rate critically high (above ${(net.bandwidth.txCritical / 1048576).toFixed(0)}MB/s)`,
        });
      }
    }

    // Process rules
    if (config.rules?.processes) {
      const proc = config.rules.processes;
      if (proc.zombieWarning) {
        this.rules.push({
          type: "threshold",
          metric: "processes.zombie",
          operator: ">",
          value: proc.zombieWarning,
          severity: proc.zombieCritical ? "warning" : "critical",
          message: `More than ${proc.zombieWarning} zombie processes detected`,
        });
      }
      if (proc.zombieCritical) {
        this.rules.push({
          type: "threshold",
          metric: "processes.zombie",
          operator: ">",
          value: proc.zombieCritical,
          severity: "critical",
          message: `More than ${proc.zombieCritical} zombie processes detected`,
        });
      }
      if (proc.blockedWarning) {
        this.rules.push({
          type: "threshold",
          metric: "processes.blocked",
          operator: ">",
          value: proc.blockedWarning,
          severity: proc.blockedCritical ? "warning" : "critical",
          message: `More than ${proc.blockedWarning} blocked processes detected`,
        });
      }
      if (proc.blockedCritical) {
        this.rules.push({
          type: "threshold",
          metric: "processes.blocked",
          operator: ">",
          value: proc.blockedCritical,
          severity: "critical",
          message: `More than ${proc.blockedCritical} blocked processes detected`,
        });
      }
      if (proc.totalWarning) {
        this.rules.push({
          type: "threshold",
          metric: "processes.total",
          operator: ">",
          value: proc.totalWarning,
          severity: proc.totalCritical ? "warning" : "critical",
          message: `More than ${proc.totalWarning} total processes running`,
        });
      }
      if (proc.totalCritical) {
        this.rules.push({
          type: "threshold",
          metric: "processes.total",
          operator: ">",
          value: proc.totalCritical,
          severity: "critical",
          message: `More than ${proc.totalCritical} total processes running`,
        });
      }
    }

    // File descriptor rules
    if (config.rules?.fileDescriptors?.warning) {
      this.rules.push({
        type: "threshold",
        metric: "fileDescriptors.usedPercent",
        operator: ">",
        value: config.rules.fileDescriptors.warning,
        severity: config.rules.fileDescriptors.critical ? "warning" : "critical",
        message: `File descriptor usage above ${config.rules.fileDescriptors.warning}%`,
      });
    }
    if (config.rules?.fileDescriptors?.critical) {
      this.rules.push({
        type: "threshold",
        metric: "fileDescriptors.usedPercent",
        operator: ">",
        value: config.rules.fileDescriptors.critical,
        severity: "critical",
        message: `File descriptor usage critically high (above ${config.rules.fileDescriptors.critical}%)`,
      });
    }

    console.log(`Loaded ${this.rules.length} rules`);
  }

  private getMetricValue(metrics: SystemMetrics, metricPath: string): number | null {
    const parts = metricPath.split(".");

    if (parts[0] === "cpu") {
      if (parts[1] === "usage") return metrics.cpu.usage;
      if (parts[1] === "temperature") return metrics.cpu.temperature ?? null;
      if (parts[1] === "iowait") return metrics.cpu.iowait ?? null;
      if (parts[1] === "loadAverage") {
        const idx = parts[2] === "1min" ? 0 : parts[2] === "5min" ? 1 : parts[2] === "15min" ? 2 : 0;
        const load = metrics.cpu.loadAverage[idx];
        // If perCore is enabled, divide by number of cores (approximate)
        if (this.config.rules?.cpu?.loadAverage?.perCore && metrics.cpu.loadAverage.length > 0) {
          // Assume 4 cores if we can't detect - this is a simplification
          const cores = 4;
          return load / cores;
        }
        return load;
      }
    }

    if (parts[0] === "memory") {
      if (parts[1] === "usedPercent") return metrics.memory.usedPercent;
      if (parts[1] === "swapPercent") return metrics.memory.swapPercent;
      if (parts[1] === "availablePercent") return metrics.memory.availablePercent;
    }

    if (parts[0] === "disk") {
      if (parts[1] === "maxUsedPercent") {
        return Math.max(...metrics.disk.mounts.map((m) => m.usedPercent), 0);
      }
      if (parts[1] === "totalUsed") {
        return metrics.disk.mounts.reduce((sum, m) => sum + m.used, 0);
      }
      if (parts[1] === "inodes") {
        if (parts[2] === "maxUsedPercent") {
          const inodePercents = metrics.disk.mounts
            .map((m) => m.inodesUsedPercent)
            .filter((p): p is number => p !== undefined);
          return inodePercents.length > 0 ? Math.max(...inodePercents) : null;
        }
      }
      if (parts[1] === "io") {
        if (parts[2] === "readRate") return metrics.disk.totalReadRate ?? null;
        if (parts[2] === "writeRate") return metrics.disk.totalWriteRate ?? null;
      }
    }

    if (parts[0] === "network") {
      if (parts[1] === "errorRate") return metrics.network.errorRate;
      if (parts[1] === "bandwidth") {
        if (parts[2] === "rxSpeed") return metrics.network.totalRxSpeed ?? null;
        if (parts[2] === "txSpeed") return metrics.network.totalTxSpeed ?? null;
      }
    }

    if (parts[0] === "processes") {
      if (parts[1] === "zombie") return metrics.processes.zombie;
      if (parts[1] === "blocked") return metrics.processes.blocked;
      if (parts[1] === "total") return metrics.processes.total;
    }

    if (parts[0] === "fileDescriptors") {
      if (parts[1] === "usedPercent") return metrics.fileDescriptors?.usedPercent ?? null;
    }

    return null;
  }

  private checkOperator(
    value: number,
    operator: string,
    threshold: number
  ): boolean {
    switch (operator) {
      case ">":
        return value > threshold;
      case "<":
        return value < threshold;
      case ">=":
        return value >= threshold;
      case "<=":
        return value <= threshold;
      case "==":
        return value === threshold;
      default:
        return false;
    }
  }

  private updateHistory(metric: string, value: number, timestamp: number): void {
    if (!this.metricHistory.has(metric)) {
      this.metricHistory.set(metric, []);
    }

    const history = this.metricHistory.get(metric)!;
    history.push({ timestamp, value });

    // Clean old entries
    const cutoff = timestamp - this.historyRetention;
    const newHistory = history.filter((h) => h.timestamp > cutoff);
    this.metricHistory.set(metric, newHistory);
  }

  private checkSustained(
    rule: Rule & { type: "sustained" },
    value: number,
    timestamp: number
  ): boolean {
    const key = `${rule.metric}-${rule.value}-${rule.duration}`;

    if (!this.sustainedStates.has(key)) {
      this.sustainedStates.set(key, { startTime: null, values: [] });
    }

    const state = this.sustainedStates.get(key)!;
    const isViolating = this.checkOperator(value, rule.operator, rule.value);

    if (isViolating) {
      if (state.startTime === null) {
        state.startTime = timestamp;
      }
      state.values.push({ timestamp, value });

      // Check if duration exceeded
      if (timestamp - state.startTime >= rule.duration) {
        return true;
      }
    } else {
      // Reset state
      state.startTime = null;
      state.values = [];
    }

    return false;
  }

  private checkRate(
    rule: Rule & { type: "rate" },
    timestamp: number
  ): { violated: boolean; rate: number } {
    const history = this.metricHistory.get(rule.metric);
    if (!history || history.length < 2) {
      return { violated: false, rate: 0 };
    }

    // Get values from 1 hour ago and now
    const hourAgo = timestamp - 3600000;
    const oldEntry = history.find((h) => h.timestamp >= hourAgo);
    const newEntry = history[history.length - 1];

    if (!oldEntry || oldEntry === newEntry) {
      return { violated: false, rate: 0 };
    }

    const timeDiff = (newEntry.timestamp - oldEntry.timestamp) / 3600000; // hours
    const valueDiff = newEntry.value - oldEntry.value;
    const rate = valueDiff / timeDiff;

    const violated = this.checkOperator(rate, rule.operator, rule.ratePerHour);
    return { violated, rate };
  }

  evaluate(metrics: SystemMetrics): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const timestamp = metrics.timestamp;

    // Evaluate standard rules
    for (const rule of this.rules) {
      const value = this.getMetricValue(metrics, rule.metric);
      if (value === null) continue;

      // Update history for rate calculations
      this.updateHistory(rule.metric, value, timestamp);

      let violated = false;
      let currentValue = value;

      switch (rule.type) {
        case "threshold":
          violated = this.checkOperator(value, rule.operator, rule.value);
          break;

        case "sustained":
          violated = this.checkSustained(rule, value, timestamp);
          break;

        case "rate":
          const rateResult = this.checkRate(rule, timestamp);
          violated = rateResult.violated;
          currentValue = rateResult.rate;
          break;
      }

      if (violated) {
        violations.push({
          rule,
          currentValue,
          timestamp,
          metric: rule.metric,
        });
      }
    }

    // Evaluate per-mount disk usage if enabled
    if (this.config.rules?.disk?.perMount !== false) {
      const diskRules = this.config.rules?.disk;
      for (const mount of metrics.disk.mounts) {
        // Skip pseudo filesystems
        if (mount.fs === "tmpfs" || mount.fs === "devtmpfs" || mount.fs === "overlay") continue;
        
        if (diskRules?.warning && mount.usedPercent > diskRules.warning) {
          violations.push({
            rule: {
              type: "threshold",
              metric: `disk.mount.${mount.mount}.usedPercent`,
              operator: ">",
              value: diskRules.warning,
              severity: diskRules.critical ? "warning" : "critical",
              message: `Disk usage on ${mount.mount} above ${diskRules.warning}%`,
            },
            currentValue: mount.usedPercent,
            timestamp,
            metric: `disk.mount.${mount.mount}.usedPercent`,
          });
        }
        if (diskRules?.critical && mount.usedPercent > diskRules.critical) {
          violations.push({
            rule: {
              type: "threshold",
              metric: `disk.mount.${mount.mount}.usedPercent`,
              operator: ">",
              value: diskRules.critical,
              severity: "critical",
              message: `Disk usage on ${mount.mount} critically high (above ${diskRules.critical}%)`,
            },
            currentValue: mount.usedPercent,
            timestamp,
            metric: `disk.mount.${mount.mount}.usedPercent`,
          });
        }

        // Per-mount inode checks
        if (mount.inodesUsedPercent !== undefined) {
          if (diskRules?.inodes?.warning && mount.inodesUsedPercent > diskRules.inodes.warning) {
            violations.push({
              rule: {
                type: "threshold",
                metric: `disk.mount.${mount.mount}.inodesUsedPercent`,
                operator: ">",
                value: diskRules.inodes.warning,
                severity: diskRules.inodes.critical ? "warning" : "critical",
                message: `Inode usage on ${mount.mount} above ${diskRules.inodes.warning}%`,
              },
              currentValue: mount.inodesUsedPercent,
              timestamp,
              metric: `disk.mount.${mount.mount}.inodesUsedPercent`,
            });
          }
          if (diskRules?.inodes?.critical && mount.inodesUsedPercent > diskRules.inodes.critical) {
            violations.push({
              rule: {
                type: "threshold",
                metric: `disk.mount.${mount.mount}.inodesUsedPercent`,
                operator: ">",
                value: diskRules.inodes.critical,
                severity: "critical",
                message: `Inode usage on ${mount.mount} critically high (above ${diskRules.inodes.critical}%)`,
              },
              currentValue: mount.inodesUsedPercent,
              timestamp,
              metric: `disk.mount.${mount.mount}.inodesUsedPercent`,
            });
          }
        }
      }
    }

    // Evaluate high CPU processes
    const procRules = this.config.rules?.processes;
    if (procRules?.highCpuWarning || procRules?.highCpuCritical) {
      for (const proc of metrics.processes.topCpu) {
        if (procRules?.highCpuCritical && proc.cpu > procRules.highCpuCritical) {
          const alertKey = `process.highcpu.${proc.name}.${proc.pid}`;
          const lastAlert = this.processAlertState.get(alertKey);
          
          // Rate limit process alerts to avoid spam
          if (!lastAlert || (timestamp - lastAlert.lastAlertTime > 300000)) { // 5 min cooldown
            violations.push({
              rule: {
                type: "threshold",
                metric: `process.${proc.pid}.cpu`,
                operator: ">",
                value: procRules.highCpuCritical,
                severity: "critical",
                message: `Process ${proc.name} (PID ${proc.pid}) using ${proc.cpu.toFixed(1)}% CPU`,
              },
              currentValue: proc.cpu,
              timestamp,
              metric: `process.${proc.pid}.cpu`,
            });
            this.processAlertState.set(alertKey, { lastAlertTime: timestamp, processName: proc.name });
          }
        } else if (procRules?.highCpuWarning && proc.cpu > procRules.highCpuWarning) {
          const alertKey = `process.highcpu.${proc.name}.${proc.pid}`;
          const lastAlert = this.processAlertState.get(alertKey);
          
          if (!lastAlert || (timestamp - lastAlert.lastAlertTime > 300000)) {
            violations.push({
              rule: {
                type: "threshold",
                metric: `process.${proc.pid}.cpu`,
                operator: ">",
                value: procRules.highCpuWarning,
                severity: "warning",
                message: `Process ${proc.name} (PID ${proc.pid}) using ${proc.cpu.toFixed(1)}% CPU`,
              },
              currentValue: proc.cpu,
              timestamp,
              metric: `process.${proc.pid}.cpu`,
            });
            this.processAlertState.set(alertKey, { lastAlertTime: timestamp, processName: proc.name });
          }
        }
      }
    }

    // Evaluate high memory processes
    if (procRules?.highMemoryWarning || procRules?.highMemoryCritical) {
      for (const proc of metrics.processes.topMemory) {
        if (procRules?.highMemoryCritical && proc.memory > procRules.highMemoryCritical) {
          const alertKey = `process.highmem.${proc.name}.${proc.pid}`;
          const lastAlert = this.processAlertState.get(alertKey);
          
          if (!lastAlert || (timestamp - lastAlert.lastAlertTime > 300000)) {
            violations.push({
              rule: {
                type: "threshold",
                metric: `process.${proc.pid}.memory`,
                operator: ">",
                value: procRules.highMemoryCritical,
                severity: "critical",
                message: `Process ${proc.name} (PID ${proc.pid}) using ${proc.memory.toFixed(1)}% memory`,
              },
              currentValue: proc.memory,
              timestamp,
              metric: `process.${proc.pid}.memory`,
            });
            this.processAlertState.set(alertKey, { lastAlertTime: timestamp, processName: proc.name });
          }
        } else if (procRules?.highMemoryWarning && proc.memory > procRules.highMemoryWarning) {
          const alertKey = `process.highmem.${proc.name}.${proc.pid}`;
          const lastAlert = this.processAlertState.get(alertKey);
          
          if (!lastAlert || (timestamp - lastAlert.lastAlertTime > 300000)) {
            violations.push({
              rule: {
                type: "threshold",
                metric: `process.${proc.pid}.memory`,
                operator: ">",
                value: procRules.highMemoryWarning,
                severity: "warning",
                message: `Process ${proc.name} (PID ${proc.pid}) using ${proc.memory.toFixed(1)}% memory`,
              },
              currentValue: proc.memory,
              timestamp,
              metric: `process.${proc.pid}.memory`,
            });
            this.processAlertState.set(alertKey, { lastAlertTime: timestamp, processName: proc.name });
          }
        }
      }
    }

    return violations;
  }

  getRules(): Rule[] {
    return [...this.rules];
  }
}
