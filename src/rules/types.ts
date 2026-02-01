export type Severity = "info" | "warning" | "critical";

export interface ThresholdRule {
  type: "threshold";
  metric: string;
  operator: ">" | "<" | ">=" | "<=" | "==";
  value: number;
  severity: Severity;
  message: string;
}

export interface SustainedRule {
  type: "sustained";
  metric: string;
  operator: ">" | "<" | ">=" | "<=" | "==";
  value: number;
  duration: number; // milliseconds
  severity: Severity;
  message: string;
}

export interface RateRule {
  type: "rate";
  metric: string;
  operator: ">" | "<";
  ratePerHour: number;
  severity: Severity;
  message: string;
}

export type Rule = ThresholdRule | SustainedRule | RateRule;

export interface RuleViolation {
  rule: Rule;
  currentValue: number;
  timestamp: number;
  metric: string;
}
