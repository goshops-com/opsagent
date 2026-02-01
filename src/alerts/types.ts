import type { Severity, RuleViolation } from "../rules/types.js";

export interface Alert {
  id: string;
  severity: Severity | string;
  message: string;
  metric: string;
  currentValue: number;
  threshold: number;
  timestamp: number;
  acknowledged: boolean;
  resolvedAt?: number;
  agentResponse?: string;
  agentActions?: string[];
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface AlertEvent {
  type: "new" | "resolved" | "acknowledged" | "updated";
  alert: Alert;
  issue?: {
    id: string;
    isNew: boolean;
    count: number;
  } | null;
}
