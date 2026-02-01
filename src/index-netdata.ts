import "dotenv/config";
import { loadNetDataConfig, substituteEnvVars } from "./config/netdata-loader.js";
import { NetDataAlertCollector, convertNetDataAlertToOpsAgentAlert } from "./collector/netdata.js";
import { AlertManager } from "./alerts/manager.js";
import { AIAgentInterface } from "./agent/interface.js";
import { DashboardServer } from "./dashboard/server.js";
import { DiscordNotifier } from "./notifications/discord.js";
import { Database } from "./db/client.js";
import { IssueManager } from "./db/issue-manager.js";
import { getPermissions, canExecuteAction, shouldAutoExecute } from "./agent/permissions.js";

async function main() {
  console.log("OpsAgent with NetData Integration starting...\n");

  // Load configuration
  const config = substituteEnvVars(loadNetDataConfig());
  console.log("Configuration loaded");
  console.log(`NetData URL: ${config.netdata.url}`);
  console.log(`Poll interval: ${config.netdata.pollInterval}s`);

  // Initialize database
  let db: Database | null = null;
  let issueManager: IssueManager | null = null;
  
  if (process.env.TURSO_DATABASE_URL) {
    try {
      db = new Database();
      await db.initialize();
      issueManager = new IssueManager(db, db.getServerId());
      console.log(`Server registered: ${db.getServerInfo().hostname} (${db.getServerId()})`);
    } catch (error) {
      console.error("[Database] Failed to initialize:", error);
      console.log("[Database] Continuing without database persistence");
      db = null;
    }
  } else {
    console.log("[Database] No TURSO_DATABASE_URL configured, running without persistence");
  }

  // Initialize permissions
  const permissions = getPermissions(config.opsagent.permissionLevel || "limited");
  console.log(`Agent permission level: ${permissions.level}`);
  console.log(`Auto-remediate: ${permissions.autoRemediate}`);
  console.log(`Risky actions require approval: ${permissions.riskyActionsRequireApproval}`);

  // Initialize components
  const alertManager = new AlertManager(
    300000, // 5 minute cooldown
    1000   // max history
  );
  
  const agent = new AIAgentInterface(
    config.opsagent.model,
    permissions.autoRemediate,
    true    // always enabled with NetData
  );

  // Track actions per hour
  let actionsExecutedThisHour = 0;
  let actionsResetTime = Date.now() + 3600000; // 1 hour from now

  // Initialize Discord notifier
  const discord = new DiscordNotifier(
    config.discord.webhookUrl || process.env.DISCORD_WEBHOOK_URL,
    config.discord.enabled
  );

  if (discord.isEnabled()) {
    console.log("Discord notifications enabled");
  }

  // Initialize NetData alert collector
  const netdataCollector = new NetDataAlertCollector(config.netdata);

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

  // Reset actions counter every hour
  setInterval(() => {
    const now = Date.now();
    if (now >= actionsResetTime) {
      actionsExecutedThisHour = 0;
      actionsResetTime = now + 3600000;
      console.log("[Permissions] Hourly action counter reset");
    }
  }, 60000); // Check every minute

  // Set up NetData alert handlers
  netdataCollector.on("alert", async (event) => {
    const { type, alert, previous } = event;

    // Convert NetData alert to OpsAgent format
    const opsAgentAlert = convertNetDataAlertToOpsAgentAlert(alert);

    switch (type) {
      case "new":
        console.log(`[NetData Alert] ${alert.severity.toUpperCase()}: ${alert.name} (${alert.value.toFixed(2)}${alert.units})`);
        
        // Add to alert manager
        alertManager.addAlert(opsAgentAlert);

        // Create or update issue in database
        let issue = null;
        let isNewIssue = false;
        
        if (issueManager) {
          const result = await issueManager.handleAlert({
            id: alert.id,
            name: alert.name,
            context: alert.context,
            chart: alert.chart,
            severity: alert.severity,
            message: alert.info || alert.name,
            value: alert.value,
            timestamp: Date.now(),
            source: "netdata",
          });
          
          issue = result.issue;
          isNewIssue = result.isNew;
        }

        // Send to AI agent for analysis
        const result = await agent.handleAlert(
          opsAgentAlert,
          {}, // No direct metrics, alert contains the value
          alertManager.getAlertHistory()
        );

        if (result && result.response) {
          // Record analysis in issue
          if (issueManager && issue) {
            await issueManager.recordAnalysis(
              issue.id,
              result.response.analysis,
              result.response.canAutoRemediate,
              result.response.requiresHumanAttention
            );
          }

          // Check if we should auto-execute
          const autoExecute = shouldAutoExecute(permissions, result.response.canAutoRemediate);
          
          // Execute actions based on permissions
          for (const actionResult of result.executionResults) {
            const permissionCheck = canExecuteAction(
              permissions,
              actionResult.action.action,
              actionResult.action.risk,
              actionsExecutedThisHour
            );

            if (!permissionCheck.allowed) {
              console.log(`[Permissions] Skipped action '${actionResult.action.action}': ${permissionCheck.reason}`);
              
              // Record the skip in the issue
              if (issueManager && issue) {
                await issueManager.recordAction(
                  issue.id,
                  actionResult.action.action,
                  `Skipped: ${permissionCheck.reason}`,
                  false,
                  undefined,
                  permissionCheck.reason
                );
              }
              
              // Send Discord notification about required approval
              if (actionResult.action.risk === "medium" || actionResult.action.risk === "high") {
                await discord.sendCustomMessage(
                  `⚠️ Action Requires Approval`,
                  `Action: ${actionResult.action.action}\nRisk: ${actionResult.action.risk}\nReason: ${permissionCheck.reason}`,
                  true
                );
              }
              
              continue;
            }

            // Execute the action
            console.log(`[Agent] Executing action: ${actionResult.action.action}`);
            
            // Record the action execution
            if (issueManager && issue) {
              await issueManager.recordAction(
                issue.id,
                actionResult.action.action,
                actionResult.action.description,
                actionResult.success,
                actionResult.output,
                actionResult.error
              );
            }

            // Increment action counter
            if (actionResult.success) {
              actionsExecutedThisHour++;
            }

            // Handle notify_human action
            if (actionResult.action.action === "notify_human" && actionResult.success) {
              await discord.sendCustomMessage(
                `🤖 Agent Alert: ${opsAgentAlert.message}`,
                actionResult.action.message || result.response.analysis || "Agent requested human attention",
                opsAgentAlert.severity === "critical"
              );
            }
          }

          // Handle human intervention request
          if (result.response.requiresHumanAttention) {
            const pendingActions = result.executionResults
              .filter((r) => r.skipped || !r.success)
              .map((r) => `${r.action.action}: ${r.action.description}`);

            await discord.sendHumanInterventionRequest(
              opsAgentAlert,
              result.response.humanNotificationReason || result.response.analysis,
              pendingActions
            );

            // Update issue status to investigating
            if (issueManager && issue) {
              await issueManager.updateStatus(issue.id, "investigating", "Requires human attention");
            }
          }

          // Send agent analysis to Discord if configured
          if (config.discord.notifyOnAgentAction && result.executionResults.length > 0) {
            await discord.sendAgentAnalysis(opsAgentAlert, result);
          }

          // Broadcast to dashboard
          if (dashboard) {
            dashboard.getWebSocketManager().broadcastAgentResult(result);
          }
        }

        // Broadcast to dashboard
        if (dashboard) {
          dashboard.getWebSocketManager().broadcastAlert({
            type: "new",
            alert: opsAgentAlert,
            issue: issue ? {
              id: issue.id,
              isNew: isNewIssue,
              count: issue.alertCount,
            } : null,
          });
        }
        break;

      case "changed":
        console.log(`[NetData Alert] State changed: ${alert.name} (${previous?.status} -> ${alert.status})`);
        
        // Update in alert manager
        alertManager.updateAlert(opsAgentAlert.id, opsAgentAlert);
        
        // Add comment to existing issue
        if (issueManager) {
          const fingerprint = `${alert.name}:${alert.context}:${alert.chart}`;
          const openIssues = await issueManager.getOpenIssues();
          const matchingIssue = openIssues.find(i => i.alertFingerprint === fingerprint);
          
          if (matchingIssue) {
            await issueManager.addComment(matchingIssue.id, {
              authorType: "agent",
              commentType: "note",
              content: `Alert state changed: ${previous?.status} -> ${alert.status}`,
              metadata: { previousStatus: previous?.status, newStatus: alert.status },
            });
          }
        }
        break;

      case "cleared":
        console.log(`[NetData Alert] Cleared: ${alert.name}`);
        
        // Resolve in alert manager
        alertManager.resolveAlert(opsAgentAlert.id);

        // Resolve the issue
        if (issueManager) {
          const fingerprint = `${alert.name}:${alert.context}:${alert.chart}`;
          const openIssues = await issueManager.getOpenIssues();
          const matchingIssue = openIssues.find(i => i.alertFingerprint === fingerprint);
          
          if (matchingIssue) {
            await issueManager.resolveIssue(matchingIssue.id, "NetData alert cleared");
          }
        }

        // Send Discord notification
        await discord.sendResolution(opsAgentAlert, "NetData alert has cleared");

        // Broadcast to dashboard
        if (dashboard) {
          dashboard.getWebSocketManager().broadcastAlert({
            type: "resolved",
            alert: opsAgentAlert,
          });
        }
        break;
    }
  });

  netdataCollector.on("error", (error) => {
    console.error("[NetData Collector] Error:", error);
  });

  netdataCollector.on("check", ({ timestamp, alertCount }) => {
    if (alertCount > 0) {
      console.log(`[NetData] ${alertCount} active alerts at ${new Date(timestamp).toISOString()}`);
    }
  });

  // Handle state requests from dashboard
  if (dashboard) {
    dashboard.getWebSocketManager().on("state-requested", async (socketId: string) => {
      let openIssues = [];
      if (issueManager) {
        openIssues = await issueManager.getOpenIssues();
      }
      
      dashboard!.getWebSocketManager().sendState(socketId, {
        metrics: null,
        alerts: alertManager.getActiveAlerts(),
        agentResults: agent.getResults(),
        netdataAlerts: netdataCollector.getKnownAlerts(),
        openIssues,
        permissions: {
          level: permissions.level,
          autoRemediate: permissions.autoRemediate,
          actionsThisHour: actionsExecutedThisHour,
          maxActionsPerHour: permissions.maxActionsPerHour,
        },
      });
    });
  }

  // Start collecting NetData alerts
  netdataCollector.start();

  // Heartbeat for database
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  if (db) {
    heartbeatInterval = setInterval(() => {
      db!.heartbeat().catch((e) => console.error("[Database] Heartbeat failed:", e));
    }, 60000);
  }

  const serverInfo = db ? ` [${db.getServerInfo().hostname}]` : "";
  console.log(`\nOpsAgent${serverInfo} running with NetData integration.`);
  console.log(`Permission level: ${permissions.level}`);
  console.log(`NetData Dashboard: ${config.netdata.url}`);
  if (dashboard) {
    console.log(`OpsAgent Dashboard: http://localhost:${config.dashboard.port}`);
  }
  console.log(`Press Ctrl+C to stop.\n`);

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down...");

    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }

    netdataCollector.stop();

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
