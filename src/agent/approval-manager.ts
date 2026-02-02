/**
 * Approval Manager
 * Handles approval workflow for risky plugin operations.
 * Manages approval requests, responses, and audit logging.
 */

import { EventEmitter } from "events";
import type {
  ApprovalRequest,
  ApprovalStatus,
  AuditLogEntry,
  AuditLogStatus,
  RiskLevel,
  ToolResult,
} from "../plugins/types.js";
import { generateId, redactSensitiveParams } from "../plugins/types.js";

// ============================================================================
// TYPES
// ============================================================================

export interface ApprovalManagerConfig {
  defaultExpiryMs?: number; // Default expiry time for approval requests
  cleanupIntervalMs?: number; // How often to clean up expired requests
  enableAuditLog?: boolean; // Whether to keep audit logs in memory
  maxAuditLogSize?: number; // Maximum audit log entries to keep
}

export type ApprovalEventType =
  | "approval:created"
  | "approval:approved"
  | "approval:rejected"
  | "approval:expired"
  | "approval:cancelled"
  | "audit:logged";

export interface ApprovalEvent {
  type: ApprovalEventType;
  timestamp: number;
  data: ApprovalRequest | AuditLogEntry;
}

// ============================================================================
// APPROVAL MANAGER CLASS
// ============================================================================

export class ApprovalManager extends EventEmitter {
  private pendingApprovals: Map<string, ApprovalRequest> = new Map();
  private auditLog: AuditLogEntry[] = [];
  private config: Required<ApprovalManagerConfig>;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: ApprovalManagerConfig = {}) {
    super();
    this.config = {
      defaultExpiryMs: config.defaultExpiryMs ?? 3600000, // 1 hour
      cleanupIntervalMs: config.cleanupIntervalMs ?? 60000, // 1 minute
      enableAuditLog: config.enableAuditLog ?? true,
      maxAuditLogSize: config.maxAuditLogSize ?? 10000,
    };

    // Start cleanup interval
    this.startCleanup();
  }

  // ============================================================================
  // APPROVAL REQUEST MANAGEMENT
  // ============================================================================

  /**
   * Create a new approval request
   */
  createRequest(params: {
    serverId: string;
    pluginId: string;
    sessionId?: string;
    messageId?: string;
    operation: string;
    parameters: Record<string, unknown>;
    riskLevel: RiskLevel;
    reason: string;
    expiresAt?: number;
  }): ApprovalRequest {
    const now = Date.now();
    const request: ApprovalRequest = {
      id: generateId("appr"),
      serverId: params.serverId,
      sessionId: params.sessionId,
      pluginId: params.pluginId,
      messageId: params.messageId,
      operation: params.operation,
      parameters: params.parameters,
      riskLevel: params.riskLevel,
      reason: params.reason,
      status: "pending",
      requestedAt: now,
      expiresAt: params.expiresAt ?? now + this.config.defaultExpiryMs,
    };

    this.pendingApprovals.set(request.id, request);

    this.emitEvent("approval:created", request);
    console.log(
      `[ApprovalManager] Created request ${request.id} for ${request.operation} (${request.riskLevel})`
    );

    return request;
  }

  /**
   * Get an approval request by ID
   */
  getRequest(requestId: string): ApprovalRequest | undefined {
    return this.pendingApprovals.get(requestId);
  }

  /**
   * Get all pending requests, optionally filtered
   */
  getPendingRequests(filter?: {
    serverId?: string;
    sessionId?: string;
    pluginId?: string;
    riskLevel?: RiskLevel;
  }): ApprovalRequest[] {
    let requests = Array.from(this.pendingApprovals.values()).filter(
      (r) => r.status === "pending"
    );

    if (filter) {
      if (filter.serverId) {
        requests = requests.filter((r) => r.serverId === filter.serverId);
      }
      if (filter.sessionId) {
        requests = requests.filter((r) => r.sessionId === filter.sessionId);
      }
      if (filter.pluginId) {
        requests = requests.filter((r) => r.pluginId === filter.pluginId);
      }
      if (filter.riskLevel) {
        requests = requests.filter((r) => r.riskLevel === filter.riskLevel);
      }
    }

    return requests.sort((a, b) => a.requestedAt - b.requestedAt);
  }

  /**
   * Approve a request
   */
  approve(
    requestId: string,
    approvedBy: string,
    reason?: string
  ): ApprovalRequest | null {
    const request = this.pendingApprovals.get(requestId);
    if (!request) {
      console.warn(`[ApprovalManager] Request ${requestId} not found`);
      return null;
    }

    if (request.status !== "pending") {
      console.warn(
        `[ApprovalManager] Request ${requestId} is not pending (status: ${request.status})`
      );
      return null;
    }

    // Check if expired
    if (request.expiresAt && Date.now() > request.expiresAt) {
      request.status = "expired";
      this.emitEvent("approval:expired", request);
      return null;
    }

    request.status = "approved";
    request.respondedAt = Date.now();
    request.respondedBy = approvedBy;
    request.responseReason = reason;

    this.emitEvent("approval:approved", request);
    console.log(
      `[ApprovalManager] Request ${requestId} approved by ${approvedBy}`
    );

    return request;
  }

  /**
   * Reject a request
   */
  reject(
    requestId: string,
    rejectedBy: string,
    reason?: string
  ): ApprovalRequest | null {
    const request = this.pendingApprovals.get(requestId);
    if (!request) {
      console.warn(`[ApprovalManager] Request ${requestId} not found`);
      return null;
    }

    if (request.status !== "pending") {
      console.warn(
        `[ApprovalManager] Request ${requestId} is not pending (status: ${request.status})`
      );
      return null;
    }

    request.status = "rejected";
    request.respondedAt = Date.now();
    request.respondedBy = rejectedBy;
    request.responseReason = reason;

    this.emitEvent("approval:rejected", request);
    console.log(
      `[ApprovalManager] Request ${requestId} rejected by ${rejectedBy}`
    );

    return request;
  }

  /**
   * Cancel a request (e.g., if session is closed)
   */
  cancel(requestId: string): ApprovalRequest | null {
    const request = this.pendingApprovals.get(requestId);
    if (!request) {
      return null;
    }

    if (request.status !== "pending") {
      return null;
    }

    request.status = "cancelled";
    request.respondedAt = Date.now();

    this.emitEvent("approval:cancelled", request);
    console.log(`[ApprovalManager] Request ${requestId} cancelled`);

    return request;
  }

  /**
   * Check if a request is approved
   */
  isApproved(requestId: string): boolean {
    const request = this.pendingApprovals.get(requestId);
    return request?.status === "approved";
  }

  /**
   * Remove a request (after it's been used or for cleanup)
   */
  removeRequest(requestId: string): void {
    this.pendingApprovals.delete(requestId);
  }

  // ============================================================================
  // AUDIT LOGGING
  // ============================================================================

  /**
   * Log an operation to the audit log
   */
  logOperation(params: {
    serverId: string;
    pluginId: string;
    sessionId?: string;
    approvalId?: string;
    operation: string;
    parameters: Record<string, unknown>;
    riskLevel: RiskLevel;
    status: AuditLogStatus;
    result?: unknown;
    error?: string;
    executedBy: string;
    executionTimeMs?: number;
  }): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: generateId("audit"),
      serverId: params.serverId,
      pluginId: params.pluginId,
      sessionId: params.sessionId,
      approvalId: params.approvalId,
      operation: params.operation,
      parameters: redactSensitiveParams(params.parameters),
      riskLevel: params.riskLevel,
      status: params.status,
      result: params.result,
      error: params.error,
      executedBy: params.executedBy,
      executionTimeMs: params.executionTimeMs,
      createdAt: Date.now(),
    };

    if (this.config.enableAuditLog) {
      this.auditLog.push(entry);

      // Trim if over max size
      if (this.auditLog.length > this.config.maxAuditLogSize) {
        this.auditLog = this.auditLog.slice(-this.config.maxAuditLogSize);
      }
    }

    this.emitEvent("audit:logged", entry);

    return entry;
  }

  /**
   * Get audit log entries, optionally filtered
   */
  getAuditLog(filter?: {
    serverId?: string;
    pluginId?: string;
    sessionId?: string;
    riskLevel?: RiskLevel;
    status?: AuditLogStatus;
    since?: number;
    limit?: number;
  }): AuditLogEntry[] {
    let entries = [...this.auditLog];

    if (filter) {
      if (filter.serverId) {
        entries = entries.filter((e) => e.serverId === filter.serverId);
      }
      if (filter.pluginId) {
        entries = entries.filter((e) => e.pluginId === filter.pluginId);
      }
      if (filter.sessionId) {
        entries = entries.filter((e) => e.sessionId === filter.sessionId);
      }
      if (filter.riskLevel) {
        entries = entries.filter((e) => e.riskLevel === filter.riskLevel);
      }
      if (filter.status) {
        entries = entries.filter((e) => e.status === filter.status);
      }
      if (filter.since) {
        const since = filter.since;
        entries = entries.filter((e) => e.createdAt >= since);
      }
    }

    // Sort by created_at descending
    entries.sort((a, b) => b.createdAt - a.createdAt);

    if (filter?.limit) {
      entries = entries.slice(0, filter.limit);
    }

    return entries;
  }

  /**
   * Get audit log statistics
   */
  getAuditStats(serverId?: string): {
    total: number;
    byStatus: Record<AuditLogStatus, number>;
    byRiskLevel: Record<RiskLevel, number>;
    last24Hours: number;
  } {
    let entries = serverId
      ? this.auditLog.filter((e) => e.serverId === serverId)
      : this.auditLog;

    const stats = {
      total: entries.length,
      byStatus: {
        success: 0,
        failed: 0,
        denied: 0,
        cancelled: 0,
      } as Record<AuditLogStatus, number>,
      byRiskLevel: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      } as Record<RiskLevel, number>,
      last24Hours: 0,
    };

    const oneDayAgo = Date.now() - 86400000;

    for (const entry of entries) {
      stats.byStatus[entry.status]++;
      stats.byRiskLevel[entry.riskLevel]++;
      if (entry.createdAt >= oneDayAgo) {
        stats.last24Hours++;
      }
    }

    return stats;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Check if an operation should auto-execute based on risk level
   */
  shouldAutoExecute(riskLevel: RiskLevel): boolean {
    return riskLevel === "low";
  }

  /**
   * Get the human-readable description of a risk level
   */
  getRiskLevelDescription(riskLevel: RiskLevel): string {
    const descriptions: Record<RiskLevel, string> = {
      low: "Read-only operation, no system changes",
      medium: "Reversible optimization, may affect performance temporarily",
      high: "Administrative operation, may affect availability",
      critical: "Destructive operation, may cause data loss",
    };
    return descriptions[riskLevel];
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, this.config.cleanupIntervalMs);
  }

  private cleanupExpired(): void {
    const now = Date.now();
    let expiredCount = 0;

    for (const [id, request] of this.pendingApprovals) {
      if (request.status === "pending" && request.expiresAt && request.expiresAt < now) {
        request.status = "expired";
        this.emitEvent("approval:expired", request);
        expiredCount++;
      }

      // Remove old non-pending requests
      if (
        request.status !== "pending" &&
        request.respondedAt &&
        now - request.respondedAt > 86400000 // 24 hours
      ) {
        this.pendingApprovals.delete(id);
      }
    }

    if (expiredCount > 0) {
      console.log(`[ApprovalManager] Expired ${expiredCount} pending requests`);
    }
  }

  // ============================================================================
  // EVENT HELPERS
  // ============================================================================

  private emitEvent(
    type: ApprovalEventType,
    data: ApprovalRequest | AuditLogEntry
  ): void {
    const event: ApprovalEvent = {
      type,
      timestamp: Date.now(),
      data,
    };
    this.emit(type, event);
    this.emit("event", event);
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Shutdown the approval manager
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Cancel all pending requests
    for (const [id, request] of this.pendingApprovals) {
      if (request.status === "pending") {
        this.cancel(id);
      }
    }

    console.log("[ApprovalManager] Shutdown complete");
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let approvalManagerInstance: ApprovalManager | null = null;

export function getApprovalManager(
  config?: ApprovalManagerConfig
): ApprovalManager {
  if (!approvalManagerInstance) {
    approvalManagerInstance = new ApprovalManager(config);
  }
  return approvalManagerInstance;
}

export function resetApprovalManager(): void {
  if (approvalManagerInstance) {
    approvalManagerInstance.shutdown();
    approvalManagerInstance = null;
  }
}
