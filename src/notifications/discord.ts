import type { Alert } from "../alerts/types.js";
import type { AgentResult } from "../agent/interface.js";

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  timestamp?: string;
  footer?: { text: string };
}

interface DiscordMessage {
  content?: string;
  embeds?: DiscordEmbed[];
}

export class DiscordNotifier {
  private webhookUrl: string;
  private enabled: boolean;

  constructor(webhookUrl?: string, enabled: boolean = true) {
    const url = webhookUrl || process.env.DISCORD_WEBHOOK_URL || "";
    // Validate that URL is a proper Discord webhook URL
    const isValidWebhook = url.startsWith("https://discord.com/api/webhooks/") ||
                           url.startsWith("https://discordapp.com/api/webhooks/");
    this.webhookUrl = isValidWebhook ? url : "";
    this.enabled = enabled && isValidWebhook;

    if (enabled && !isValidWebhook) {
      if (url && !url.includes("${")) {
        console.warn("[Discord] Invalid webhook URL, notifications disabled");
      } else {
        console.log("[Discord] Webhook URL not configured, notifications disabled");
      }
    }
  }

  private getSeverityColor(severity: string): number {
    switch (severity) {
      case "critical":
        return 0xff0000; // Red
      case "warning":
        return 0xffa500; // Orange
      case "info":
        return 0x0099ff; // Blue
      default:
        return 0x808080; // Gray
    }
  }

  async sendAlert(alert: Alert): Promise<boolean> {
    if (!this.enabled) return false;

    const embed: DiscordEmbed = {
      title: `🚨 ${alert.severity.toUpperCase()}: System Alert`,
      description: alert.message,
      color: this.getSeverityColor(alert.severity),
      fields: [
        { name: "Metric", value: alert.metric, inline: true },
        { name: "Current Value", value: alert.currentValue.toFixed(2), inline: true },
        { name: "Threshold", value: alert.threshold.toString(), inline: true },
      ],
      timestamp: new Date(alert.timestamp).toISOString(),
      footer: { text: `Alert ID: ${alert.id}` },
    };

    return this.send({ embeds: [embed] });
  }

  async sendAgentAnalysis(alert: Alert, result: AgentResult): Promise<boolean> {
    if (!this.enabled) return false;

    const analysis = result.response?.analysis || result.rawResponse.slice(0, 1000);
    const actions = result.executionResults.map((r) => {
      const status = r.success ? "✅" : r.skipped ? "⏭️" : "❌";
      const reason = r.skipped ? r.skipReason : r.success ? r.output?.slice(0, 100) : r.error;
      return `${status} **${r.action.action}**: ${reason || "completed"}`;
    });

    const embed: DiscordEmbed = {
      title: `🤖 AI Agent Response`,
      description: analysis.slice(0, 2000),
      color: 0x4ecca3,
      fields: [],
      timestamp: new Date(result.timestamp).toISOString(),
      footer: { text: `For alert: ${alert.message}` },
    };

    if (actions.length > 0) {
      embed.fields!.push({
        name: "Actions Taken",
        value: actions.join("\n").slice(0, 1000),
      });
    }

    const pendingApprovals = result.executionResults.filter((r) => r.skipped);
    if (pendingApprovals.length > 0) {
      embed.fields!.push({
        name: "⚠️ Pending Approvals",
        value: pendingApprovals
          .map((r) => `• ${r.action.action}: ${r.action.description}`)
          .join("\n")
          .slice(0, 1000),
      });
    }

    return this.send({ embeds: [embed] });
  }

  async sendHumanInterventionRequest(
    alert: Alert,
    reason: string,
    suggestedActions: string[]
  ): Promise<boolean> {
    if (!this.enabled) return false;

    const embed: DiscordEmbed = {
      title: `👤 Human Intervention Required`,
      description: reason,
      color: 0xff6b6b,
      fields: [
        { name: "Alert", value: alert.message },
        { name: "Severity", value: alert.severity.toUpperCase(), inline: true },
        { name: "Metric", value: `${alert.metric}: ${alert.currentValue.toFixed(2)}`, inline: true },
      ],
      timestamp: new Date().toISOString(),
    };

    if (suggestedActions.length > 0) {
      embed.fields!.push({
        name: "Suggested Actions",
        value: suggestedActions.map((a) => `• ${a}`).join("\n"),
      });
    }

    return this.send({
      content: "@here Human intervention required for system alert!",
      embeds: [embed],
    });
  }

  async sendResolution(alert: Alert, resolution: string): Promise<boolean> {
    if (!this.enabled) return false;

    const embed: DiscordEmbed = {
      title: `✅ Alert Resolved`,
      description: resolution,
      color: 0x00ff00,
      fields: [{ name: "Original Alert", value: alert.message }],
      timestamp: new Date().toISOString(),
    };

    return this.send({ embeds: [embed] });
  }

  async sendCustomMessage(title: string, message: string, urgent: boolean = false): Promise<boolean> {
    if (!this.enabled) return false;

    const embed: DiscordEmbed = {
      title,
      description: message,
      color: urgent ? 0xff0000 : 0x0099ff,
      timestamp: new Date().toISOString(),
    };

    return this.send({
      content: urgent ? "@here" : undefined,
      embeds: [embed],
    });
  }

  private async send(message: DiscordMessage): Promise<boolean> {
    if (!this.webhookUrl) return false;

    try {
      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        console.error(`[Discord] Failed to send message: ${response.status} ${response.statusText}`);
        return false;
      }

      console.log("[Discord] Notification sent successfully");
      return true;
    } catch (error) {
      console.error("[Discord] Error sending notification:", error);
      return false;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
