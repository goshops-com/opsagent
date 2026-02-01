export interface AgentPermissions {
  level: "full" | "limited" | "readonly";
  autoRemediate: boolean;
  allowedActions: string[];
  riskyActionsRequireApproval: boolean;
  maxActionsPerHour: number;
  allowedRiskLevels: ("low" | "medium" | "high")[];
}

export const defaultPermissions: AgentPermissions = {
  level: "limited",
  autoRemediate: false,
  allowedActions: [
    "notify_human",
    "clear_cache",
    "log_analysis",
    "kill_process",
    "restart_service",
    "cleanup_disk",
  ],
  riskyActionsRequireApproval: true,
  maxActionsPerHour: 10,
  allowedRiskLevels: ["low", "medium"], // No "high" risk in limited mode
};

export const fullPermissions: AgentPermissions = {
  level: "full",
  autoRemediate: true,
  allowedActions: [
    "notify_human",
    "clear_cache",
    "log_analysis",
    "kill_process",
    "restart_service",
    "cleanup_disk",
    "custom_command",
  ],
  riskyActionsRequireApproval: false,
  maxActionsPerHour: 100,
  allowedRiskLevels: ["low", "medium", "high"],
};

export const readonlyPermissions: AgentPermissions = {
  level: "readonly",
  autoRemediate: false,
  allowedActions: [],
  riskyActionsRequireApproval: true,
  maxActionsPerHour: 0,
  allowedRiskLevels: [],
};

export function getPermissions(level: string): AgentPermissions {
  switch (level) {
    case "full":
      return fullPermissions;
    case "readonly":
      return readonlyPermissions;
    case "limited":
    default:
      return defaultPermissions;
  }
}

export function canExecuteAction(
  permissions: AgentPermissions,
  actionType: string,
  riskLevel: string,
  actionsExecutedThisHour: number
): { allowed: boolean; reason?: string } {
  // Check if in readonly mode
  if (permissions.level === "readonly") {
    return { allowed: false, reason: "Agent is in readonly mode" };
  }

  // Check max actions per hour
  if (actionsExecutedThisHour >= permissions.maxActionsPerHour) {
    return {
      allowed: false,
      reason: `Hourly action limit reached (${permissions.maxActionsPerHour} actions/hour)`,
    };
  }

  // Check if action is allowed
  if (!permissions.allowedActions.includes(actionType)) {
    return {
      allowed: false,
      reason: `Action '${actionType}' not in allowed actions list`,
    };
  }

  // Check risk level
  if (!permissions.allowedRiskLevels.includes(riskLevel as any)) {
    return {
      allowed: false,
      reason: `Risk level '${riskLevel}' exceeds allowed levels`,
    };
  }

  // Check if risky action requires approval
  if (permissions.riskyActionsRequireApproval && (riskLevel === "medium" || riskLevel === "high")) {
    return {
      allowed: false,
      reason: `Risky action requires human approval`,
    };
  }

  return { allowed: true };
}

export function shouldAutoExecute(
  permissions: AgentPermissions,
  canAutoRemediate: boolean
): boolean {
  if (permissions.level === "readonly") {
    return false;
  }

  if (!permissions.autoRemediate) {
    return false;
  }

  return canAutoRemediate;
}
