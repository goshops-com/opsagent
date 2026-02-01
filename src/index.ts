import "dotenv/config";
import { loadConfig } from "./config/loader.js";
import { MetricsCollector } from "./collector/index.js";
import { RuleEngine } from "./rules/engine.js";
import { AlertManager } from "./alerts/manager.js";
import { AIAgentInterface } from "./agent/interface.js";
import { DashboardServer } from "./dashboard/server.js";
import { DiscordNotifier } from "./notifications/discord.js";
import { Database } from "./db/client.js";
import type { SystemMetrics } from "./collector/metrics.js";

async function main() {
  console.log("System Monitor starting...\n");

  // Load configuration
  const config = loadConfig();
  console.log("Configuration loaded");

  // Initialize database
  let db: Database | null = null;
  if (process.env.TURSO_DATABASE_URL) {
    try {
      db = new Database();
      await db.initialize();
      console.log(`Server registered: ${db.getServerInfo().hostname} (${db.getServerId()})`);
    } catch (error) {
      console.error("[Database] Failed to initialize:", error);
      console.log("[Database] Continuing without database persistence");
      db = null;
    }
  } else {
    console.log("[Database] No TURSO_DATABASE_URL configured, running without persistence");
  }

  // Initialize components
  const collector = new MetricsCollector(config.collector.interval);
  const ruleEngine = new RuleEngine();
  const alertManager = new AlertManager(
    config.alerts.cooldown,
    config.alerts.maxHistory
  );
  const agent = new AIAgentInterface(
    config.agent.model,
    config.agent.autoRemediate,
    config.agent.enabled
  );

  // Initialize Discord notifier
  const discord = new DiscordNotifier(
    config.discord.webhookUrl || process.env.DISCORD_WEBHOOK_URL,
    config.discord.enabled
  );

  if (discord.isEnabled()) {
    console.log("Discord notifications enabled");
  }

  // Load rules from config
  ruleEngine.loadRulesFromConfig(config);

  // Store latest metrics for dashboard
  let latestMetrics: SystemMetrics | null = null;
  let metricsCount = 0;

  // Initialize dashboard if enabled
  let dashboard: DashboardServer | null = null;
  if (config.dashboard.enabled) {
    dashboard = new DashboardServer(config.dashboard.port, {
      getActiveAlerts: () => alertManager.getActiveAlerts(),
      getAlertHistory: () => alertManager.getAlertHistory(),
      getAgentResults: () => agent.getResults(),
      acknowledgeAlert: (id) => {
        const success = alertManager.acknowledgeAlert(id);
        if (success && db) {
          db.acknowledgeAlert(id).catch((e) => console.error("[Database] Failed to acknowledge alert:", e));
        }
        return success;
      },
      approveAction: (alertId, actionIndex) =>
        agent.approveAction(alertId, actionIndex),
    });

    await dashboard.start();
  }

  // Heartbeat interval for database
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  if (db) {
    heartbeatInterval = setInterval(() => {
      db!.heartbeat().catch((e) => console.error("[Database] Heartbeat failed:", e));
    }, 60000); // Every minute
  }

  // Set up event handlers
  collector.on("metrics", async (metrics: SystemMetrics) => {
    latestMetrics = metrics;
    metricsCount++;

    // Broadcast to dashboard
    if (dashboard) {
      dashboard.getWebSocketManager().broadcastMetrics(metrics);
    }

    // Save metrics snapshot every 10 collections (~30s with test config, ~50s with default)
    if (db && metricsCount % 10 === 0) {
      db.saveMetricsSnapshot(metrics).catch((e) =>
        console.error("[Database] Failed to save metrics snapshot:", e)
      );
    }

    // Evaluate rules deterministically
    const violations = ruleEngine.evaluate(metrics);

    // Process violations into alerts
    const newAlerts = alertManager.processViolations(violations);

    // Handle new alerts with AI agent
    for (const alert of newAlerts) {
      console.log(
        `[Alert] ${alert.severity.toUpperCase()}: ${alert.message} (${alert.metric}: ${alert.currentValue.toFixed(2)})`
      );

      // Save alert to database
      if (db) {
        db.saveAlert(alert).catch((e) => console.error("[Database] Failed to save alert:", e));
      }

      // Send critical alerts to Discord immediately
      if (alert.severity === "critical" && config.discord.notifyOnCritical) {
        await discord.sendAlert(alert);
      }

      // Send to AI agent for analysis and decision
      const result = await agent.handleAlert(
        alert,
        metrics,
        alertManager.getAlertHistory()
      );

      if (result) {
        alertManager.updateAlertWithAgentResponse(
          alert.id,
          result.response?.analysis || result.rawResponse,
          result.executionResults.map(
            (r) => `${r.action.action}: ${r.success ? "success" : "failed"}`
          )
        );

        // Save agent response to database
        if (db) {
          db.saveAgentResponse(alert, result, config.agent.model).catch((e) =>
            console.error("[Database] Failed to save agent response:", e)
          );
        }

        // Handle agent's decision to notify humans
        if (result.response?.requiresHumanAttention) {
          const pendingActions = result.executionResults
            .filter((r) => r.skipped)
            .map((r) => `${r.action.action}: ${r.action.description}`);

          await discord.sendHumanInterventionRequest(
            alert,
            result.response.humanNotificationReason || result.response.analysis,
            pendingActions
          );
        }

        // Handle explicit notify_human actions from the agent
        for (const execResult of result.executionResults) {
          if (execResult.action.action === "notify_human" && execResult.success) {
            await discord.sendCustomMessage(
              `Alert: ${alert.message}`,
              execResult.action.message || result.response?.analysis || "Agent requested human attention",
              alert.severity === "critical"
            );
          }
        }

        // Send agent analysis to Discord if configured
        if (config.discord.notifyOnAgentAction && result.executionResults.length > 0) {
          await discord.sendAgentAnalysis(alert, result);
        }

        // Broadcast to dashboard
        if (dashboard) {
          dashboard.getWebSocketManager().broadcastAgentResult(result);
        }
      }
    }
  });

  collector.on("error", (error) => {
    console.error("[Collector] Error:", error);
  });

  alertManager.on("alert", async (event) => {
    if (dashboard) {
      dashboard.getWebSocketManager().broadcastAlert(event);
    }

    if (event.type === "resolved") {
      console.log(`[Alert] Resolved: ${event.alert.message}`);

      // Update alert in database
      if (db) {
        db.resolveAlert(event.alert.id).catch((e) =>
          console.error("[Database] Failed to resolve alert:", e)
        );
      }

      await discord.sendResolution(event.alert, "Alert condition has returned to normal.");
    }
  });

  agent.on("processing", ({ alertId, status }) => {
    console.log(`[Agent] Processing alert ${alertId}: ${status}`);
  });

  agent.on("error", ({ alertId, error }) => {
    console.error(`[Agent] Error processing alert ${alertId}:`, error);
  });

  // Handle state requests from dashboard
  if (dashboard) {
    dashboard.getWebSocketManager().on("state-requested", (socketId: string) => {
      dashboard!.getWebSocketManager().sendState(socketId, {
        metrics: latestMetrics,
        alerts: alertManager.getActiveAlerts(),
        agentResults: agent.getResults(),
      });
    });
  }

  // Start collecting metrics
  collector.start();

  const serverInfo = db ? ` [${db.getServerInfo().hostname}]` : "";
  console.log(`\nSystem Monitor${serverInfo} running. Press Ctrl+C to stop.\n`);

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down...");

    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }

    collector.stop();

    if (dashboard) {
      await dashboard.stop();
    }

    if (db) {
      await db.close();
      console.log("[Database] Connection closed");
    }

    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
