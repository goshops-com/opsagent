import { Server as SocketIOServer, Socket } from "socket.io";
import { EventEmitter } from "events";
import type { Server as HTTPServer } from "http";
import type { SystemMetrics } from "../collector/metrics.js";
import type { Alert, AlertEvent } from "../alerts/types.js";
import type { AgentResult } from "../agent/interface.js";
import type { ChatEvent, ChatMessage, ChatSession } from "../agent/chat-handler.js";
import type { ApprovalRequest, AuditLogEntry, PluginHealth } from "../plugins/types.js";

// ============================================================================
// TYPES
// ============================================================================

export interface ChatMessagePayload {
  sessionId: string;
  content: string;
}

export interface ApprovalResponsePayload {
  approvalId: string;
  approved: boolean;
  reason?: string;
}

export interface JoinSessionPayload {
  sessionId: string;
}

// ============================================================================
// WEBSOCKET MANAGER
// ============================================================================

export class WebSocketManager extends EventEmitter {
  private io: SocketIOServer;
  private sessionSubscriptions: Map<string, Set<string>> = new Map(); // sessionId -> Set<socketId>

  constructor(httpServer: HTTPServer) {
    super();
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    this.io.on("connection", (socket) => {
      console.log(`[WebSocket] Client connected: ${socket.id}`);

      socket.on("disconnect", () => {
        console.log(`[WebSocket] Client disconnected: ${socket.id}`);
        this.handleDisconnect(socket.id);
      });

      socket.on("request-state", () => {
        // Emit to EventEmitter (for index.ts handler)
        super.emit("state-requested", socket.id);
      });

      // -----------------------------------------------------------------------
      // CHAT EVENTS
      // -----------------------------------------------------------------------

      // Join a chat session room
      socket.on("chat:join", (payload: JoinSessionPayload) => {
        const { sessionId } = payload;
        socket.join(`session:${sessionId}`);

        // Track subscription
        if (!this.sessionSubscriptions.has(sessionId)) {
          this.sessionSubscriptions.set(sessionId, new Set());
        }
        this.sessionSubscriptions.get(sessionId)!.add(socket.id);

        console.log(`[WebSocket] Socket ${socket.id} joined session ${sessionId}`);
        super.emit("chat:joined", { socketId: socket.id, sessionId });
      });

      // Leave a chat session room
      socket.on("chat:leave", (payload: JoinSessionPayload) => {
        const { sessionId } = payload;
        socket.leave(`session:${sessionId}`);

        // Remove subscription
        this.sessionSubscriptions.get(sessionId)?.delete(socket.id);

        console.log(`[WebSocket] Socket ${socket.id} left session ${sessionId}`);
      });

      // Send a message to a chat session
      socket.on("chat:message", (payload: ChatMessagePayload) => {
        super.emit("chat:message", {
          socketId: socket.id,
          sessionId: payload.sessionId,
          content: payload.content,
        });
      });

      // -----------------------------------------------------------------------
      // APPROVAL EVENTS
      // -----------------------------------------------------------------------

      // Respond to an approval request
      socket.on("approval:respond", (payload: ApprovalResponsePayload) => {
        super.emit("approval:respond", {
          socketId: socket.id,
          approvalId: payload.approvalId,
          approved: payload.approved,
          reason: payload.reason,
        });
      });

      // Subscribe to approval updates for a server
      socket.on("approval:subscribe", (payload: { serverId: string }) => {
        socket.join(`approvals:${payload.serverId}`);
        console.log(`[WebSocket] Socket ${socket.id} subscribed to approvals for server ${payload.serverId}`);
      });

      // Unsubscribe from approval updates
      socket.on("approval:unsubscribe", (payload: { serverId: string }) => {
        socket.leave(`approvals:${payload.serverId}`);
      });

      // -----------------------------------------------------------------------
      // PLUGIN EVENTS
      // -----------------------------------------------------------------------

      // Subscribe to plugin health updates for a server
      socket.on("plugin:subscribe", (payload: { serverId: string }) => {
        socket.join(`plugins:${payload.serverId}`);
        console.log(`[WebSocket] Socket ${socket.id} subscribed to plugins for server ${payload.serverId}`);
      });

      // Unsubscribe from plugin updates
      socket.on("plugin:unsubscribe", (payload: { serverId: string }) => {
        socket.leave(`plugins:${payload.serverId}`);
      });
    });
  }

  private handleDisconnect(socketId: string): void {
    // Clean up session subscriptions
    for (const [sessionId, sockets] of this.sessionSubscriptions) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.sessionSubscriptions.delete(sessionId);
      }
    }
  }

  broadcastMetrics(metrics: SystemMetrics): void {
    this.io.emit("metrics", metrics);
  }

  broadcastAlert(event: AlertEvent): void {
    this.io.emit("alert", event);
  }

  broadcastAgentResult(result: AgentResult): void {
    this.io.emit("agent-result", result);
  }

  sendState(
    socketId: string,
    state: {
      metrics: SystemMetrics | null;
      alerts: Alert[];
      agentResults: AgentResult[];
      netdataAlerts?: unknown[];
      openIssues?: unknown[];
      permissions?: {
        level: string;
        autoRemediate: boolean;
        actionsThisHour: number;
        maxActionsPerHour: number;
      };
    }
  ): void {
    this.io.to(socketId).emit("state", state);
  }

  // Broadcast to all connected Socket.IO clients
  broadcast(event: string, ...args: any[]): void {
    this.io.emit(event, ...args);
  }

  // =========================================================================
  // CHAT BROADCASTS
  // =========================================================================

  /**
   * Broadcast a chat event to session subscribers
   */
  broadcastChatEvent(event: ChatEvent): void {
    this.io.to(`session:${event.sessionId}`).emit("chat:event", event);
  }

  /**
   * Broadcast a new message to session subscribers
   */
  broadcastChatMessage(sessionId: string, message: ChatMessage): void {
    this.io.to(`session:${sessionId}`).emit("chat:message", message);
  }

  /**
   * Broadcast typing indicator
   */
  broadcastTyping(sessionId: string, isTyping: boolean): void {
    this.io.to(`session:${sessionId}`).emit("chat:typing", { isTyping });
  }

  /**
   * Broadcast tool execution status
   */
  broadcastToolExecution(
    sessionId: string,
    data: {
      toolCallId: string;
      toolName: string;
      status: "started" | "completed" | "failed" | "awaiting_approval";
      result?: unknown;
      error?: string;
      approvalRequest?: ApprovalRequest;
    }
  ): void {
    this.io.to(`session:${sessionId}`).emit("chat:tool_execution", data);
  }

  /**
   * Broadcast session status change
   */
  broadcastSessionStatus(
    sessionId: string,
    status: "active" | "closed" | "archived"
  ): void {
    this.io.to(`session:${sessionId}`).emit("chat:session_status", { sessionId, status });
  }

  // =========================================================================
  // APPROVAL BROADCASTS
  // =========================================================================

  /**
   * Broadcast a new approval request
   */
  broadcastApprovalRequest(serverId: string, request: ApprovalRequest): void {
    // Broadcast to server-specific room
    this.io.to(`approvals:${serverId}`).emit("approval:request", request);
    // Also broadcast to the session if one exists
    if (request.sessionId) {
      this.io.to(`session:${request.sessionId}`).emit("approval:request", request);
    }
    // Global broadcast for approval queue
    this.io.emit("approval:new", request);
  }

  /**
   * Broadcast an approval response (approved/rejected)
   */
  broadcastApprovalResponse(
    serverId: string,
    approvalId: string,
    status: "approved" | "rejected" | "expired" | "cancelled",
    respondedBy?: string
  ): void {
    const response = { approvalId, status, respondedBy, timestamp: Date.now() };
    this.io.to(`approvals:${serverId}`).emit("approval:response", response);
    this.io.emit("approval:updated", response);
  }

  /**
   * Get count of subscribers for approvals
   */
  getApprovalSubscriberCount(serverId: string): number {
    const room = this.io.sockets.adapter.rooms.get(`approvals:${serverId}`);
    return room?.size ?? 0;
  }

  // =========================================================================
  // PLUGIN BROADCASTS
  // =========================================================================

  /**
   * Broadcast plugin health update
   */
  broadcastPluginHealth(
    serverId: string,
    instanceId: string,
    health: PluginHealth
  ): void {
    this.io.to(`plugins:${serverId}`).emit("plugin:health", {
      instanceId,
      health,
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcast plugin status change
   */
  broadcastPluginStatus(
    serverId: string,
    instanceId: string,
    status: "active" | "inactive" | "error",
    message?: string
  ): void {
    this.io.to(`plugins:${serverId}`).emit("plugin:status", {
      instanceId,
      status,
      message,
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcast plugin tool execution
   */
  broadcastPluginToolExecuted(
    serverId: string,
    data: {
      instanceId: string;
      toolName: string;
      success: boolean;
      executionTimeMs: number;
      riskLevel: string;
    }
  ): void {
    this.io.to(`plugins:${serverId}`).emit("plugin:tool_executed", {
      ...data,
      timestamp: Date.now(),
    });
  }

  // =========================================================================
  // AUDIT BROADCASTS
  // =========================================================================

  /**
   * Broadcast audit log entry
   */
  broadcastAuditEntry(entry: AuditLogEntry): void {
    // Broadcast to server-specific room
    this.io.to(`plugins:${entry.serverId}`).emit("audit:entry", entry);
    // Global broadcast
    this.io.emit("audit:new", entry);
  }

  // =========================================================================
  // UTILITIES
  // =========================================================================

  /**
   * Get session subscriber count
   */
  getSessionSubscriberCount(sessionId: string): number {
    return this.sessionSubscriptions.get(sessionId)?.size ?? 0;
  }

  /**
   * Check if a session has subscribers
   */
  hasSessionSubscribers(sessionId: string): boolean {
    return this.getSessionSubscriberCount(sessionId) > 0;
  }

  /**
   * Send a message to a specific socket
   */
  sendToSocket(socketId: string, event: string, data: unknown): void {
    this.io.to(socketId).emit(event, data);
  }
}
