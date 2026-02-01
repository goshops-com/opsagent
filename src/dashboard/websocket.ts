import { Server as SocketIOServer } from "socket.io";
import { EventEmitter } from "events";
import type { Server as HTTPServer } from "http";
import type { SystemMetrics } from "../collector/metrics.js";
import type { Alert, AlertEvent } from "../alerts/types.js";
import type { AgentResult } from "../agent/interface.js";

export class WebSocketManager extends EventEmitter {
  private io: SocketIOServer;

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
      });

      socket.on("request-state", () => {
        // Emit to EventEmitter (for index.ts handler)
        super.emit("state-requested", socket.id);
      });
    });
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
}
