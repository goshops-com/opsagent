/**
 * Plugin System Type Definitions
 * Defines interfaces for the extensible plugin architecture supporting
 * database management, monitoring, and administrative tools.
 */

// ============================================================================
// RISK LEVELS
// ============================================================================

export type RiskLevel = "low" | "medium" | "high" | "critical";

export const RISK_LEVEL_CONFIG: Record<
  RiskLevel,
  {
    autoExecute: boolean;
    requiresApproval: boolean;
    description: string;
  }
> = {
  low: {
    autoExecute: true,
    requiresApproval: false,
    description: "Read-only operations, no system changes",
  },
  medium: {
    autoExecute: false,
    requiresApproval: true,
    description: "Optimization operations, reversible changes",
  },
  high: {
    autoExecute: false,
    requiresApproval: true,
    description: "Administrative operations, may affect availability",
  },
  critical: {
    autoExecute: false,
    requiresApproval: true,
    description: "Destructive operations, requires approval with reason",
  },
};

// ============================================================================
// TOOL CATEGORIES
// ============================================================================

export type ToolCategory = "read" | "optimize" | "admin";

export const TOOL_CATEGORY_DESCRIPTIONS: Record<ToolCategory, string> = {
  read: "Read-only information gathering",
  optimize: "Performance optimization operations",
  admin: "Administrative and management operations",
};

// ============================================================================
// PLUGIN TOOL DEFINITIONS
// ============================================================================

export interface ToolParameter {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  required: boolean;
  default?: unknown;
  enum?: string[];
  pattern?: string; // regex for validation
}

export interface PluginTool {
  name: string;
  description: string;
  parameters: ToolParameter[];
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  category: ToolCategory;
  examples?: Array<{
    description: string;
    params: Record<string, unknown>;
  }>;
}

// ============================================================================
// TOOL EXECUTION CONTEXT
// ============================================================================

export interface ToolContext {
  serverId: string;
  sessionId?: string;
  messageId?: string;
  userId?: string;
  approvalId?: string; // set if this execution was pre-approved
  dryRun?: boolean; // if true, explain what would happen without doing it
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  executionTimeMs: number;
  metadata?: Record<string, unknown>;
  // For approval-required operations that weren't pre-approved
  requiresApproval?: boolean;
  approvalRequest?: {
    operation: string;
    parameters: Record<string, unknown>;
    reason: string;
    riskLevel: RiskLevel;
  };
}

// ============================================================================
// PLUGIN CAPABILITIES
// ============================================================================

export interface PluginCapability {
  name: string;
  description: string;
  enabled: boolean;
}

// ============================================================================
// PLUGIN HEALTH
// ============================================================================

export type PluginHealthStatus = "healthy" | "unhealthy" | "unknown";

export interface PluginHealth {
  status: PluginHealthStatus;
  message?: string;
  details?: Record<string, unknown>;
  lastChecked: number;
  connectionInfo?: {
    host?: string;
    port?: number;
    database?: string;
    version?: string;
  };
}

// ============================================================================
// PLUGIN CONFIGURATION
// ============================================================================

export interface PluginCredentials {
  host: string;
  port: number;
  database?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  sslCertPath?: string;
  connectionString?: string;
  // Additional provider-specific fields
  [key: string]: unknown;
}

export interface PluginConfig {
  credentials: PluginCredentials;
  options?: {
    connectionTimeout?: number;
    queryTimeout?: number;
    maxConnections?: number;
    enabledCapabilities?: string[];
    [key: string]: unknown;
  };
}

// ============================================================================
// PLUGIN INTERFACE
// ============================================================================

export interface Plugin {
  // Identity
  id: string;
  name: string;
  version: string;
  type: string; // 'postgresql', 'mongodb', 'mysql', etc.
  description: string;

  // Lifecycle
  initialize(config: PluginConfig): Promise<void>;
  shutdown(): Promise<void>;
  checkHealth(): Promise<PluginHealth>;

  // Capabilities
  getCapabilities(): PluginCapability[];
  getTools(): PluginTool[];

  // Tool execution
  executeTool(
    name: string,
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult>;

  // Validation
  validateConfig(config: PluginConfig): { valid: boolean; errors?: string[] };
  validateToolParams(
    toolName: string,
    params: Record<string, unknown>
  ): { valid: boolean; errors?: string[] };
}

// ============================================================================
// PLUGIN METADATA (for storage/registry)
// ============================================================================

export interface PluginMetadata {
  id: string;
  name: string;
  version: string;
  type: string;
  description: string;
  capabilities: string[];
  tools: PluginTool[];
  riskLevels: Record<string, RiskLevel>;
  createdAt: number;
  updatedAt?: number;
}

export interface AgentPluginInstance {
  id: string;
  serverId: string;
  pluginId: string;
  config: PluginConfig; // encrypted in storage
  status: "active" | "inactive" | "error";
  healthStatus: PluginHealthStatus;
  healthMessage?: string;
  enabled: boolean;
  lastHealthCheck?: number;
  createdAt: number;
  updatedAt?: number;
}

// ============================================================================
// PLUGIN EVENTS
// ============================================================================

export type PluginEventType =
  | "plugin:initialized"
  | "plugin:shutdown"
  | "plugin:health_changed"
  | "plugin:tool_executed"
  | "plugin:error";

export interface PluginEvent {
  type: PluginEventType;
  pluginId: string;
  serverId: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

// ============================================================================
// APPROVAL TYPES
// ============================================================================

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled";

export interface ApprovalRequest {
  id: string;
  serverId: string;
  sessionId?: string;
  pluginId: string;
  messageId?: string;
  operation: string;
  parameters: Record<string, unknown>;
  riskLevel: RiskLevel;
  reason: string;
  status: ApprovalStatus;
  requestedAt: number;
  respondedAt?: number;
  respondedBy?: string;
  responseReason?: string;
  expiresAt?: number;
}

// ============================================================================
// AUDIT LOG TYPES
// ============================================================================

export type AuditLogStatus = "success" | "failed" | "denied" | "cancelled";

export interface AuditLogEntry {
  id: string;
  serverId: string;
  pluginId: string;
  sessionId?: string;
  approvalId?: string;
  operation: string;
  parameters: Record<string, unknown>; // sensitive data redacted
  riskLevel: RiskLevel;
  status: AuditLogStatus;
  result?: unknown;
  error?: string;
  executedBy: string;
  executionTimeMs?: number;
  createdAt: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Determine if a tool requires approval based on risk level and configuration
 */
export function toolRequiresApproval(
  tool: PluginTool,
  context?: ToolContext
): boolean {
  // If pre-approved, no additional approval needed
  if (context?.approvalId) {
    return false;
  }

  // Check risk level configuration
  const riskConfig = RISK_LEVEL_CONFIG[tool.riskLevel];
  return riskConfig.requiresApproval || tool.requiresApproval;
}

/**
 * Determine if a tool can auto-execute without user interaction
 */
export function canAutoExecute(
  tool: PluginTool,
  context?: ToolContext
): boolean {
  // If pre-approved, can execute
  if (context?.approvalId) {
    return true;
  }

  // Dry run always allowed
  if (context?.dryRun) {
    return true;
  }

  // Check risk level configuration
  const riskConfig = RISK_LEVEL_CONFIG[tool.riskLevel];
  return riskConfig.autoExecute && !tool.requiresApproval;
}

/**
 * Redact sensitive data from parameters for audit logging
 */
export function redactSensitiveParams(
  params: Record<string, unknown>,
  sensitiveFields: string[] = ["password", "secret", "token", "key", "credential"]
): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    const isSecretive = sensitiveFields.some(
      (field) =>
        key.toLowerCase().includes(field) ||
        (typeof value === "string" && value.length > 20)
    );

    if (isSecretive && typeof value === "string") {
      redacted[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      redacted[key] = redactSensitiveParams(
        value as Record<string, unknown>,
        sensitiveFields
      );
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Generate a unique ID for various entities
 */
export function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}
