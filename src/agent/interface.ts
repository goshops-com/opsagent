import OpenAI from "openai";
import { EventEmitter } from "events";
import type { Alert } from "../alerts/types.js";
import type { SystemMetrics } from "../collector/metrics.js";
import { buildAlertPrompt, buildSummaryPrompt } from "./promptBuilder.js";
import {
  parseAgentResponse,
  type AgentResponse,
} from "./actionParser.js";
import { ActionExecutor, type ExecutionResult } from "./executor.js";

export type AIProvider = "opencode" | "openrouter";

export interface ProviderConfig {
  apiKey: string;
  baseURL: string;
  defaultModel: string;
}

const PROVIDERS: Record<AIProvider, ProviderConfig> = {
  opencode: {
    apiKey: process.env.OPENCODE_API_KEY || "",
    baseURL: "https://opencode.ai/zen/v1",
    defaultModel: "kimi-k2.5",
  },
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY || "",
    baseURL: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-sonnet-4",
  },
};

export interface AgentResult {
  alertId: string;
  response: AgentResponse | null;
  rawResponse: string;
  executionResults: ExecutionResult[];
  timestamp: number;
}

export class AIAgentInterface extends EventEmitter {
  private client: OpenAI;
  private executor: ActionExecutor;
  private model: string;
  private provider: AIProvider;
  private enabled: boolean;
  private results: AgentResult[] = [];

  constructor(
    provider: AIProvider = "opencode",
    model?: string,
    autoRemediate: boolean = false,
    enabled: boolean = true
  ) {
    super();
    this.provider = provider;
    const providerConfig = PROVIDERS[provider];

    this.client = new OpenAI({
      apiKey: providerConfig.apiKey,
      baseURL: providerConfig.baseURL,
    });
    this.executor = new ActionExecutor(autoRemediate);
    this.model = model || providerConfig.defaultModel;
    this.enabled = enabled;

    console.log(`[Agent] Using ${provider} provider with model: ${this.model}`);
  }

  async handleAlert(
    alert: Alert,
    metrics: SystemMetrics | null,
    recentAlerts: Alert[]
  ): Promise<AgentResult | null> {
    if (!this.enabled) {
      return null;
    }

    console.log(`[Agent] Processing alert: ${alert.message}`);

    const prompt = buildAlertPrompt(alert, metrics, recentAlerts);

    try {
      this.emit("processing", { alertId: alert.id, status: "started" });

      const completion = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: 2048,
        messages: [
          {
            role: "system",
            content:
              "You are a system administrator AI assistant. Analyze system alerts and provide remediation recommendations. Be concise and practical. When suggesting actions, always consider the risk level and prefer safe, reversible actions.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      if (!completion.choices || completion.choices.length === 0) {
        console.error(`[Agent] No choices in response:`, JSON.stringify(completion, null, 2));
        throw new Error("No response from AI model");
      }

      const rawResponse = completion.choices[0]?.message?.content || "";

      console.log(`[Agent] Received response for alert ${alert.id}`);

      const parsedResponse = parseAgentResponse(rawResponse);

      // Execute recommended actions
      const executionResults: ExecutionResult[] = [];
      if (parsedResponse?.recommendations) {
        for (const action of parsedResponse.recommendations) {
          console.log(
            `[Agent] Evaluating action: ${action.action} (risk: ${action.risk})`
          );
          const result = await this.executor.executeAction(action);
          executionResults.push(result);

          if (result.skipped) {
            console.log(`[Agent] Action skipped: ${result.skipReason}`);
          } else if (result.success) {
            console.log(`[Agent] Action succeeded: ${result.output}`);
          } else {
            console.log(`[Agent] Action failed: ${result.error}`);
          }
        }
      }

      const agentResult: AgentResult = {
        alertId: alert.id,
        response: parsedResponse,
        rawResponse,
        executionResults,
        timestamp: Date.now(),
      };

      this.results.push(agentResult);
      this.emit("result", agentResult);

      return agentResult;
    } catch (error) {
      console.error(`[Agent] Error processing alert:`, error);
      this.emit("error", { alertId: alert.id, error });
      return null;
    }
  }

  async getSummary(
    alerts: Alert[],
    metrics: SystemMetrics
  ): Promise<string | null> {
    if (!this.enabled) {
      return null;
    }

    const prompt = buildSummaryPrompt(alerts, metrics);

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: 512,
        messages: [
          {
            role: "system",
            content:
              "You are a system monitoring assistant. Provide brief, clear summaries of system health.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      return completion.choices[0]?.message?.content || null;
    } catch (error) {
      console.error(`[Agent] Error getting summary:`, error);
      return null;
    }
  }

  async approveAction(
    alertId: string,
    actionIndex: number
  ): Promise<ExecutionResult | null> {
    const result = this.results.find((r) => r.alertId === alertId);
    if (!result || !result.response?.recommendations[actionIndex]) {
      return null;
    }

    const action = result.response.recommendations[actionIndex];
    return this.executor.executeAction(action, true);
  }

  getResults(): AgentResult[] {
    return [...this.results];
  }

  getResultForAlert(alertId: string): AgentResult | undefined {
    return this.results.find((r) => r.alertId === alertId);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
