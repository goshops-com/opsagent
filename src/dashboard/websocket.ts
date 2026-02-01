import { Server as SocketIOServer } from "socket.io";
import type { Server as HTTPServer } from "http";
import type { SystemMetrics } from "../collector/metrics.js";
import type { Alert, AlertEvent } from "../alerts/types.js";
import type { AgentResult } from "../agent/interface.js";

export class WebSocketManager {
  private io: SocketIOServer;

  constructor(httpServer: HTTPServer) {
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
        this.emit("state-requested", socket.id);
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
    }
  ): void {
    this.io.to(socketId).emit("state", state);
  }

  on(event: string, handler: (...args: any[]) => void): void {
    this.io.on(event, handler);
  }

  emit(event: string, ...args: any[]): void {
    this.io.emit(event, ...args);
  }
}
