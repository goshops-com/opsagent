import { EventEmitter } from "events";
import type { RuleViolation } from "../rules/types.js";
import type { Alert, AlertEvent } from "./types.js";

export class AlertManager extends EventEmitter {
  private alerts: Map<string, Alert> = new Map();
  private alertHistory: Alert[] = [];
  private cooldowns: Map<string, number> = new Map();
  private cooldownPeriod: number;
  private maxHistory: number;

  constructor(cooldownPeriod: number = 300000, maxHistory: number = 1000) {
    super();
    this.cooldownPeriod = cooldownPeriod;
    this.maxHistory = maxHistory;
  }

  private generateAlertKey(violation: RuleViolation): string {
    return `${violation.metric}-${violation.rule.severity}-${violation.rule.message}`;
  }

  private generateAlertId(): string {
    return `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private isInCooldown(key: string): boolean {
    const lastAlert = this.cooldowns.get(key);
    if (!lastAlert) return false;
    return Date.now() - lastAlert < this.cooldownPeriod;
  }

  processViolations(violations: RuleViolation[]): Alert[] {
    const newAlerts: Alert[] = [];
    const currentKeys = new Set<string>();

    for (const violation of violations) {
      const key = this.generateAlertKey(violation);
      currentKeys.add(key);

      // Skip if in cooldown
      if (this.isInCooldown(key)) {
        continue;
      }

      // Skip if alert already active
      if (this.alerts.has(key)) {
        continue;
      }

      // Create new alert
      const alert: Alert = {
        id: this.generateAlertId(),
        severity: violation.rule.severity,
        message: violation.rule.message,
        metric: violation.metric,
        currentValue: violation.currentValue,
        threshold:
          violation.rule.type === "rate"
            ? violation.rule.ratePerHour
            : violation.rule.value,
        timestamp: violation.timestamp,
        acknowledged: false,
      };

      this.alerts.set(key, alert);
      this.cooldowns.set(key, Date.now());
      this.addToHistory(alert);
      newAlerts.push(alert);

      this.emit("alert", { type: "new", alert } as AlertEvent);
    }

    // Check for resolved alerts
    for (const [key, alert] of this.alerts) {
      if (!currentKeys.has(key)) {
        alert.resolvedAt = Date.now();
        this.alerts.delete(key);
        this.emit("alert", { type: "resolved", alert } as AlertEvent);
      }
    }

    return newAlerts;
  }

  private addToHistory(alert: Alert): void {
    this.alertHistory.push(alert);
    if (this.alertHistory.length > this.maxHistory) {
      this.alertHistory.shift();
    }
  }

  acknowledgeAlert(alertId: string): boolean {
    for (const alert of this.alerts.values()) {
      if (alert.id === alertId) {
        alert.acknowledged = true;
        this.emit("alert", { type: "acknowledged", alert } as AlertEvent);
        return true;
      }
    }
    return false;
  }

  updateAlertWithAgentResponse(
    alertId: string,
    response: string,
    actions: string[]
  ): void {
    for (const alert of this.alerts.values()) {
      if (alert.id === alertId) {
        alert.agentResponse = response;
        alert.agentActions = actions;
        break;
      }
    }

    // Also update in history
    const historyAlert = this.alertHistory.find((a) => a.id === alertId);
    if (historyAlert) {
      historyAlert.agentResponse = response;
      historyAlert.agentActions = actions;
    }
  }

  getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values());
  }

  getAlertHistory(): Alert[] {
    return [...this.alertHistory];
  }

  getAlertById(id: string): Alert | undefined {
    for (const alert of this.alerts.values()) {
      if (alert.id === id) return alert;
    }
    return this.alertHistory.find((a) => a.id === id);
  }

  clearHistory(): void {
    this.alertHistory = [];
  }
}
