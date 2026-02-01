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

  /**
   * Process human feedback on an issue
   * This is triggered when a human adds feedback via the Control Panel
   */
  async handleFeedback(
    issueContext: {
      issueId: string;
      title: string;
      description: string;
      severity: string;
      status: string;
      alertCount: number;
    },
    comments: Array<{
      authorType: string;
      commentType: string;
      content: string;
      createdAt: number;
    }>,
    feedback: string
  ): Promise<{ analysis: string; recommendations: any[] } | null> {
    if (!this.enabled) {
      return null;
    }

    console.log(`[Agent] Processing feedback for issue: ${issueContext.issueId}`);

    // Build context from issue history
    const historyContext = comments
      .map((c) => `[${c.commentType}] ${c.authorType}: ${c.content}`)
      .join("\n");

    const prompt = `You are analyzing a system issue that a human operator has provided feedback on.

## Issue Context
- Title: ${issueContext.title}
- Description: ${issueContext.description}
- Severity: ${issueContext.severity}
- Status: ${issueContext.status}
- Alert Count: ${issueContext.alertCount}

## Issue History
${historyContext}

## Human Feedback (IMPORTANT - incorporate this into your analysis)
${feedback}

Based on the human feedback, provide:
1. An updated analysis that incorporates the human's input
2. Any new recommendations based on their feedback
3. Whether any previous recommendations should be reconsidered

Respond in JSON format:
{
  "analysis": "Your updated analysis incorporating the human feedback...",
  "recommendations": [
    {
      "action": "action_type",
      "description": "What to do",
      "risk": "low|medium|high",
      "command": "optional command"
    }
  ],
  "feedbackAcknowledgment": "Brief acknowledgment of the human's feedback"
}`;

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: 2048,
        messages: [
          {
            role: "system",
            content:
              "You are a system administrator AI assistant. A human operator has provided feedback on an issue. Carefully consider their input and provide an updated analysis. Be responsive to their guidance and adjust your recommendations accordingly.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const rawResponse = completion.choices[0]?.message?.content || "";
      console.log(`[Agent] Received feedback response for issue ${issueContext.issueId}`);

      // Parse the JSON response
      try {
        const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            analysis: parsed.analysis || rawResponse,
            recommendations: parsed.recommendations || [],
          };
        }
      } catch {
        // If JSON parsing fails, return the raw analysis
      }

      return {
        analysis: rawResponse,
        recommendations: [],
      };
    } catch (error) {
      console.error(`[Agent] Error processing feedback:`, error);
      return null;
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
