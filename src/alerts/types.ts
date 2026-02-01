import type { Severity, RuleViolation } from "../rules/types.js";

export interface Alert {
  id: string;
  severity: Severity;
  message: string;
  metric: string;
  currentValue: number;
  threshold: number;
  timestamp: number;
  acknowledged: boolean;
  resolvedAt?: number;
  agentResponse?: string;
  agentActions?: string[];
}

export interface AlertEvent {
  type: "new" | "resolved" | "acknowledged";
  alert: Alert;
}
