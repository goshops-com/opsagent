import express from "express";
import { createServer } from "http";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { WebSocketManager } from "./websocket.js";
import type { Alert } from "../alerts/types.js";
import type { AgentResult } from "../agent/interface.js";

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
