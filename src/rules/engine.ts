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

export class RuleEngine {
  private rules: Rule[] = [];
  private metricHistory: Map<string, MetricHistory[]> = new Map();
  private sustainedStates: Map<string, SustainedState> = new Map();
  private historyRetention = 3600000; // 1 hour

  constructor() {}

  loadRulesFromConfig(config: any): void {
    this.rules = [];

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
          message: `Network error rate above ${net.errorRateWarning * 100}%`,
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
          severity: "warning",
          message: `More than ${proc.zombieWarning} zombie processes detected`,
        });
      }
    }

    console.log(`Loaded ${this.rules.length} rules`);
  }

  private getMetricValue(metrics: SystemMetrics, metricPath: string): number | null {
    const parts = metricPath.split(".");

    if (parts[0] === "cpu") {
      if (parts[1] === "usage") return metrics.cpu.usage;
      if (parts[1] === "temperature") return metrics.cpu.temperature ?? null;
    }

    if (parts[0] === "memory") {
      if (parts[1] === "usedPercent") return metrics.memory.usedPercent;
      if (parts[1] === "swapPercent") return metrics.memory.swapPercent;
    }

    if (parts[0] === "disk") {
      if (parts[1] === "maxUsedPercent") {
        return Math.max(...metrics.disk.mounts.map((m) => m.usedPercent), 0);
      }
      if (parts[1] === "totalUsed") {
        return metrics.disk.mounts.reduce((sum, m) => sum + m.used, 0);
      }
    }

    if (parts[0] === "network") {
      if (parts[1] === "errorRate") return metrics.network.errorRate;
    }

    if (parts[0] === "processes") {
      if (parts[1] === "zombie") return metrics.processes.zombie;
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

    return violations;
  }

  getRules(): Rule[] {
    return [...this.rules];
  }
}
