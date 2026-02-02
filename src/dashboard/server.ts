import express from "express";
import { createServer } from "http";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { WebSocketManager } from "./websocket.js";
import type { Alert } from "../alerts/types.js";
import type { AgentResult } from "../agent/interface.js";
import type { ChatHandler, ChatSession, ChatMessage } from "../agent/chat-handler.js";
import type { ApprovalManager } from "../agent/approval-manager.js";
import type { PluginRegistry } from "../plugins/registry.js";
import type {
  PluginConfig,
  ApprovalRequest,
  AuditLogEntry,
  RiskLevel,
  AuditLogStatus,
} from "../plugins/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface DashboardDependencies {
  getActiveAlerts: () => Alert[];
  getAlertHistory: () => Alert[];
  getAgentResults: () => AgentResult[];
  acknowledgeAlert: (id: string) => boolean;
  approveAction: (
    alertId: string,
    actionIndex: number
  ) => Promise<any>;
  processFeedback?: (
    issueId: string,
    feedback: string
  ) => Promise<{ success: boolean; analysis?: string; error?: string }>;
  // Plugin system dependencies
  pluginRegistry?: PluginRegistry;
  chatHandler?: ChatHandler;
  approvalManager?: ApprovalManager;
}

export class DashboardServer {
  private app: express.Application;
  private httpServer: ReturnType<typeof createServer>;
  private wsManager: WebSocketManager;
  private port: number;
  private deps: DashboardDependencies;

  constructor(port: number, deps: DashboardDependencies) {
    this.port = port;
    this.deps = deps;
    this.app = express();
    this.httpServer = createServer(this.app);
    this.wsManager = new WebSocketManager(this.httpServer);

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.static(resolve(__dirname, "../../public")));
  }

  private setupRoutes(): void {
    // API routes
    this.app.get("/api/alerts", (req, res) => {
      res.json({
        active: this.deps.getActiveAlerts(),
        history: this.deps.getAlertHistory().slice(-100),
      });
    });

    this.app.get("/api/agent/results", (req, res) => {
      res.json(this.deps.getAgentResults());
    });

    this.app.post("/api/alerts/:id/acknowledge", (req, res) => {
      const success = this.deps.acknowledgeAlert(req.params.id);
      res.json({ success });
    });

    this.app.post("/api/agent/approve/:alertId/:actionIndex", async (req, res) => {
      try {
        const result = await this.deps.approveAction(
          req.params.alertId,
          parseInt(req.params.actionIndex, 10)
        );
        res.json({ success: true, result });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Health check
    this.app.get("/api/health", (req, res) => {
      res.json({ status: "ok", timestamp: Date.now() });
    });

    // Process feedback on an issue (triggered by Control Panel)
    this.app.post("/api/issues/:issueId/process-feedback", async (req, res) => {
      if (!this.deps.processFeedback) {
        res.status(501).json({
          success: false,
          error: "Feedback processing not configured",
        });
        return;
      }

      const { issueId } = req.params;
      const { feedback } = req.body;

      if (!feedback) {
        res.status(400).json({
          success: false,
          error: "Feedback content is required",
        });
        return;
      }

      try {
        const result = await this.deps.processFeedback(issueId, feedback);
        res.json(result);
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // =========================================================================
    // PLUGIN ROUTES
    // =========================================================================

    // Get all registered plugins
    this.app.get("/api/plugins", (req, res) => {
      if (!this.deps.pluginRegistry) {
        res.status(501).json({ error: "Plugin system not configured" });
        return;
      }
      const plugins = this.deps.pluginRegistry.getAllPluginMetadata();
      res.json(plugins);
    });

    // Get plugin instances for a server
    this.app.get("/api/servers/:serverId/plugins", (req, res) => {
      if (!this.deps.pluginRegistry) {
        res.status(501).json({ error: "Plugin system not configured" });
        return;
      }
      const instances = this.deps.pluginRegistry.getServerInstances(req.params.serverId);
      res.json(instances);
    });

    // Create a plugin instance for a server
    this.app.post("/api/servers/:serverId/plugins", async (req, res) => {
      if (!this.deps.pluginRegistry) {
        res.status(501).json({ error: "Plugin system not configured" });
        return;
      }

      const { serverId } = req.params;
      const { pluginId, config } = req.body as { pluginId: string; config: PluginConfig };

      if (!pluginId || !config) {
        res.status(400).json({ error: "pluginId and config are required" });
        return;
      }

      try {
        const instance = await this.deps.pluginRegistry.createInstance(
          pluginId,
          serverId,
          config
        );
        res.json(instance);
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : "Failed to create plugin instance",
        });
      }
    });

    // Get a specific plugin instance
    this.app.get("/api/servers/:serverId/plugins/:instanceId", (req, res) => {
      if (!this.deps.pluginRegistry) {
        res.status(501).json({ error: "Plugin system not configured" });
        return;
      }

      const metadata = this.deps.pluginRegistry.getInstanceMetadata(req.params.instanceId);
      if (!metadata || metadata.serverId !== req.params.serverId) {
        res.status(404).json({ error: "Plugin instance not found" });
        return;
      }
      res.json(metadata);
    });

    // Delete a plugin instance
    this.app.delete("/api/servers/:serverId/plugins/:instanceId", async (req, res) => {
      if (!this.deps.pluginRegistry) {
        res.status(501).json({ error: "Plugin system not configured" });
        return;
      }

      try {
        await this.deps.pluginRegistry.removeInstance(req.params.instanceId);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : "Failed to remove plugin instance",
        });
      }
    });

    // Get plugin instance health
    this.app.get("/api/servers/:serverId/plugins/:instanceId/health", async (req, res) => {
      if (!this.deps.pluginRegistry) {
        res.status(501).json({ error: "Plugin system not configured" });
        return;
      }

      try {
        const health = await this.deps.pluginRegistry.getInstanceHealth(req.params.instanceId);
        res.json(health);
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : "Failed to get health",
        });
      }
    });

    // Get tools for a plugin instance
    this.app.get("/api/servers/:serverId/plugins/:instanceId/tools", (req, res) => {
      if (!this.deps.pluginRegistry) {
        res.status(501).json({ error: "Plugin system not configured" });
        return;
      }

      const tools = this.deps.pluginRegistry.getInstanceTools(req.params.instanceId);
      res.json(tools);
    });

    // Execute a tool on a plugin instance
    this.app.post("/api/servers/:serverId/plugins/:instanceId/execute", async (req, res) => {
      if (!this.deps.pluginRegistry) {
        res.status(501).json({ error: "Plugin system not configured" });
        return;
      }

      const { instanceId, serverId } = req.params;
      const { tool, params, approvalId } = req.body as {
        tool: string;
        params: Record<string, unknown>;
        approvalId?: string;
      };

      if (!tool) {
        res.status(400).json({ error: "tool name is required" });
        return;
      }

      try {
        const result = await this.deps.pluginRegistry.executeTool(
          instanceId,
          tool,
          params || {},
          { serverId, approvalId }
        );
        res.json(result);
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : "Tool execution failed",
        });
      }
    });

    // =========================================================================
    // CHAT SESSION ROUTES
    // =========================================================================

    // Get all chat sessions
    this.app.get("/api/sessions", (req, res) => {
      if (!this.deps.chatHandler) {
        res.status(501).json({ error: "Chat system not configured" });
        return;
      }

      const serverId = req.query.serverId as string | undefined;
      const sessions = this.deps.chatHandler.getSessions(serverId);
      res.json(sessions);
    });

    // Create a new chat session
    this.app.post("/api/sessions", (req, res) => {
      if (!this.deps.chatHandler) {
        res.status(501).json({ error: "Chat system not configured" });
        return;
      }

      const { serverId, title, pluginInstances, userId, systemContext } = req.body as {
        serverId: string;
        title: string;
        pluginInstances: string[];
        userId?: string;
        systemContext?: string;
      };

      if (!serverId || !title) {
        res.status(400).json({ error: "serverId and title are required" });
        return;
      }

      const session = this.deps.chatHandler.createSession(
        serverId,
        title,
        pluginInstances || [],
        userId,
        systemContext
      );
      res.json(session);
    });

    // Get a specific chat session
    this.app.get("/api/sessions/:sessionId", (req, res) => {
      if (!this.deps.chatHandler) {
        res.status(501).json({ error: "Chat system not configured" });
        return;
      }

      const session = this.deps.chatHandler.getSession(req.params.sessionId);
      if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      res.json(session);
    });

    // Close a chat session
    this.app.post("/api/sessions/:sessionId/close", (req, res) => {
      if (!this.deps.chatHandler) {
        res.status(501).json({ error: "Chat system not configured" });
        return;
      }

      this.deps.chatHandler.closeSession(req.params.sessionId);
      res.json({ success: true });
    });

    // Send a message to a chat session (HTTP fallback for WebSocket)
    this.app.post("/api/sessions/:sessionId/messages", async (req, res) => {
      if (!this.deps.chatHandler) {
        res.status(501).json({ error: "Chat system not configured" });
        return;
      }

      const { content } = req.body as { content: string };
      if (!content) {
        res.status(400).json({ error: "content is required" });
        return;
      }

      try {
        const events: unknown[] = [];
        for await (const event of this.deps.chatHandler.processMessage(
          req.params.sessionId,
          content
        )) {
          events.push(event);
          // Broadcast via WebSocket
          this.wsManager.broadcastChatEvent(event);
        }
        res.json({ success: true, events });
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : "Failed to process message",
        });
      }
    });

    // Get messages for a chat session
    this.app.get("/api/sessions/:sessionId/messages", (req, res) => {
      if (!this.deps.chatHandler) {
        res.status(501).json({ error: "Chat system not configured" });
        return;
      }

      const session = this.deps.chatHandler.getSession(req.params.sessionId);
      if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      res.json(session.messages);
    });

    // =========================================================================
    // APPROVAL ROUTES
    // =========================================================================

    // Get pending approvals
    this.app.get("/api/approvals", (req, res) => {
      if (!this.deps.approvalManager) {
        res.status(501).json({ error: "Approval system not configured" });
        return;
      }

      const filter: {
        serverId?: string;
        sessionId?: string;
        riskLevel?: RiskLevel;
      } = {};

      if (req.query.serverId) filter.serverId = req.query.serverId as string;
      if (req.query.sessionId) filter.sessionId = req.query.sessionId as string;
      if (req.query.riskLevel) filter.riskLevel = req.query.riskLevel as RiskLevel;

      const approvals = this.deps.approvalManager.getPendingRequests(filter);
      res.json(approvals);
    });

    // Get a specific approval request
    this.app.get("/api/approvals/:approvalId", (req, res) => {
      if (!this.deps.approvalManager) {
        res.status(501).json({ error: "Approval system not configured" });
        return;
      }

      const approval = this.deps.approvalManager.getRequest(req.params.approvalId);
      if (!approval) {
        res.status(404).json({ error: "Approval request not found" });
        return;
      }
      res.json(approval);
    });

    // Approve a request
    this.app.post("/api/approvals/:approvalId/approve", async (req, res) => {
      if (!this.deps.approvalManager || !this.deps.chatHandler) {
        res.status(501).json({ error: "Approval system not configured" });
        return;
      }

      const { approvedBy, reason } = req.body as { approvedBy: string; reason?: string };
      if (!approvedBy) {
        res.status(400).json({ error: "approvedBy is required" });
        return;
      }

      const approval = this.deps.approvalManager.approve(
        req.params.approvalId,
        approvedBy,
        reason
      );

      if (!approval) {
        res.status(400).json({ error: "Cannot approve this request" });
        return;
      }

      // Execute the approved operation
      const result = await this.deps.chatHandler.approveOperation(
        req.params.approvalId,
        approvedBy,
        reason
      );

      // Broadcast the approval
      this.wsManager.broadcastApprovalResponse(
        approval.serverId,
        approval.id,
        "approved",
        approvedBy
      );

      res.json({ approval, result });
    });

    // Reject a request
    this.app.post("/api/approvals/:approvalId/reject", (req, res) => {
      if (!this.deps.approvalManager) {
        res.status(501).json({ error: "Approval system not configured" });
        return;
      }

      const { rejectedBy, reason } = req.body as { rejectedBy: string; reason?: string };
      if (!rejectedBy) {
        res.status(400).json({ error: "rejectedBy is required" });
        return;
      }

      const approval = this.deps.approvalManager.reject(
        req.params.approvalId,
        rejectedBy,
        reason
      );

      if (!approval) {
        res.status(400).json({ error: "Cannot reject this request" });
        return;
      }

      // Broadcast the rejection
      this.wsManager.broadcastApprovalResponse(
        approval.serverId,
        approval.id,
        "rejected",
        rejectedBy
      );

      res.json({ approval });
    });

    // =========================================================================
    // AUDIT LOG ROUTES
    // =========================================================================

    // Get audit log
    this.app.get("/api/audit", (req, res) => {
      if (!this.deps.approvalManager) {
        res.status(501).json({ error: "Audit system not configured" });
        return;
      }

      const filter: {
        serverId?: string;
        pluginId?: string;
        riskLevel?: RiskLevel;
        status?: AuditLogStatus;
        since?: number;
        limit?: number;
      } = {};

      if (req.query.serverId) filter.serverId = req.query.serverId as string;
      if (req.query.pluginId) filter.pluginId = req.query.pluginId as string;
      if (req.query.riskLevel) filter.riskLevel = req.query.riskLevel as RiskLevel;
      if (req.query.status) filter.status = req.query.status as AuditLogStatus;
      if (req.query.since) filter.since = parseInt(req.query.since as string, 10);
      if (req.query.limit) filter.limit = parseInt(req.query.limit as string, 10);

      const entries = this.deps.approvalManager.getAuditLog(filter);
      res.json(entries);
    });

    // Get audit statistics
    this.app.get("/api/audit/stats", (req, res) => {
      if (!this.deps.approvalManager) {
        res.status(501).json({ error: "Audit system not configured" });
        return;
      }

      const serverId = req.query.serverId as string | undefined;
      const stats = this.deps.approvalManager.getAuditStats(serverId);
      res.json(stats);
    });

    // Serve dashboard for all other routes
    this.app.get("*", (req, res) => {
      res.sendFile(resolve(__dirname, "../../public/index.html"));
    });
  }

  getWebSocketManager(): WebSocketManager {
    return this.wsManager;
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.listen(this.port, () => {
        console.log(`Dashboard running at http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
