/**
 * Chat Handler
 * Manages conversational AI interactions with plugin tools and approval workflows.
 * Supports streaming responses and tool execution with proper approval handling.
 */

import OpenAI from "openai";
import { EventEmitter } from "events";
import type { PluginRegistry } from "../plugins/registry.js";
import type {
  PluginTool,
  ToolContext,
  ToolResult,
  RiskLevel,
  ApprovalRequest,
} from "../plugins/types.js";
import { toolRequiresApproval, generateId, redactSensitiveParams } from "../plugins/types.js";

// ============================================================================
// TYPES
// ============================================================================

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolCallResult[];
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  pluginId?: string;
  instanceId?: string;
}

export interface ToolCallResult {
  toolCallId: string;
  result: ToolResult;
  approvalRequest?: ApprovalRequest;
}

export interface ChatContext {
  sessionId: string;
  serverId: string;
  userId?: string;
  pluginInstances: string[]; // Instance IDs available in this session
  systemContext?: string; // Additional system context (metrics, alerts, etc.)
}

export interface ChatSession {
  id: string;
  serverId: string;
  title: string;
  status: "active" | "closed" | "archived";
  context: ChatContext;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  closedAt?: number;
}

// Chat events emitted during processing
export type ChatEventType =
  | "message" // New message added
  | "typing" // AI is generating
  | "tool_execution" // Tool being executed
  | "tool_result" // Tool execution completed
  | "approval_required" // Approval needed for tool
  | "error"; // Error occurred

export interface ChatEvent {
  type: ChatEventType;
  sessionId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

// Provider configuration
export type ChatProvider = "opencode" | "openrouter";

interface ProviderConfig {
  apiKey: string;
  baseURL: string;
  defaultModel: string;
}

const PROVIDERS: Record<ChatProvider, ProviderConfig> = {
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

// ============================================================================
// CHAT HANDLER CLASS
// ============================================================================

export class ChatHandler extends EventEmitter {
  private client: OpenAI;
  private model: string;
  private provider: ChatProvider;
  private pluginRegistry: PluginRegistry;
  private sessions: Map<string, ChatSession> = new Map();
  private pendingApprovals: Map<string, ApprovalRequest> = new Map();

  constructor(
    pluginRegistry: PluginRegistry,
    provider: ChatProvider = "opencode",
    model?: string
  ) {
    super();
    this.pluginRegistry = pluginRegistry;
    this.provider = provider;

    const providerConfig = PROVIDERS[provider];
    this.client = new OpenAI({
      apiKey: providerConfig.apiKey,
      baseURL: providerConfig.baseURL,
    });
    this.model = model || providerConfig.defaultModel;

    console.log(`[ChatHandler] Initialized with ${provider} provider, model: ${this.model}`);
  }

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  createSession(
    serverId: string,
    title: string,
    pluginInstances: string[],
    userId?: string,
    systemContext?: string
  ): ChatSession {
    const sessionId = generateId("sess");
    const now = Date.now();

    const session: ChatSession = {
      id: sessionId,
      serverId,
      title,
      status: "active",
      context: {
        sessionId,
        serverId,
        userId,
        pluginInstances,
        systemContext,
      },
      messages: [],
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    };

    this.sessions.set(sessionId, session);

    // Add system message with context
    const systemMessage = this.buildSystemMessage(session);
    this.addMessage(session, {
      id: generateId("msg"),
      sessionId,
      role: "system",
      content: systemMessage,
      createdAt: now,
    });

    console.log(`[ChatHandler] Created session ${sessionId} for server ${serverId}`);
    return session;
  }

  getSession(sessionId: string): ChatSession | undefined {
    return this.sessions.get(sessionId);
  }

  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = "closed";
      session.closedAt = Date.now();
      session.updatedAt = Date.now();
    }
  }

  getSessions(serverId?: string): ChatSession[] {
    const sessions = Array.from(this.sessions.values());
    if (serverId) {
      return sessions.filter((s) => s.serverId === serverId);
    }
    return sessions;
  }

  // ============================================================================
  // MESSAGE PROCESSING
  // ============================================================================

  /**
   * Process a user message and generate AI response with tool execution
   */
  async *processMessage(
    sessionId: string,
    userMessage: string
  ): AsyncGenerator<ChatEvent> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      yield {
        type: "error",
        sessionId,
        timestamp: Date.now(),
        data: { error: "Session not found" },
      };
      return;
    }

    if (session.status !== "active") {
      yield {
        type: "error",
        sessionId,
        timestamp: Date.now(),
        data: { error: "Session is not active" },
      };
      return;
    }

    // Add user message
    const userMsg: ChatMessage = {
      id: generateId("msg"),
      sessionId,
      role: "user",
      content: userMessage,
      createdAt: Date.now(),
    };
    this.addMessage(session, userMsg);

    yield {
      type: "message",
      sessionId,
      timestamp: Date.now(),
      data: { message: userMsg },
    };

    // Build messages for API
    const messages = this.buildApiMessages(session);
    const tools = this.buildToolDefinitions(session);

    yield {
      type: "typing",
      sessionId,
      timestamp: Date.now(),
      data: { status: "started" },
    };

    try {
      // Call AI with tools
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        max_tokens: 4096,
      });

      const choice = completion.choices[0];
      if (!choice) {
        throw new Error("No response from AI");
      }

      const assistantMessage = choice.message;

      // Handle tool calls if present
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        // Process tool calls
        const toolCalls: ToolCall[] = [];
        const toolResults: ToolCallResult[] = [];

        for (const toolCall of assistantMessage.tool_calls) {
          const parsedArgs = JSON.parse(toolCall.function.arguments);
          const tc: ToolCall = {
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: parsedArgs,
          };
          toolCalls.push(tc);

          yield {
            type: "tool_execution",
            sessionId,
            timestamp: Date.now(),
            data: {
              toolCallId: toolCall.id,
              toolName: toolCall.function.name,
              arguments: redactSensitiveParams(parsedArgs),
              status: "started",
            },
          };

          // Execute the tool
          const result = await this.executeTool(session, tc);
          toolResults.push({
            toolCallId: toolCall.id,
            result: result.toolResult,
            approvalRequest: result.approvalRequest,
          });

          if (result.approvalRequest) {
            yield {
              type: "approval_required",
              sessionId,
              timestamp: Date.now(),
              data: {
                toolCallId: toolCall.id,
                approvalRequest: result.approvalRequest,
              },
            };
          }

          yield {
            type: "tool_result",
            sessionId,
            timestamp: Date.now(),
            data: {
              toolCallId: toolCall.id,
              result: result.toolResult,
            },
          };
        }

        // Add assistant message with tool calls
        const assistantMsg: ChatMessage = {
          id: generateId("msg"),
          sessionId,
          role: "assistant",
          content: assistantMessage.content || "",
          toolCalls,
          toolResults,
          createdAt: Date.now(),
        };
        this.addMessage(session, assistantMsg);

        yield {
          type: "message",
          sessionId,
          timestamp: Date.now(),
          data: { message: assistantMsg },
        };

        // If there were tool calls, get a follow-up response
        if (toolResults.length > 0) {
          // Add tool results as messages for the next call
          for (const tr of toolResults) {
            const toolMsg: ChatMessage = {
              id: generateId("msg"),
              sessionId,
              role: "tool",
              content: JSON.stringify(tr.result.data || tr.result.error || tr.result),
              metadata: {
                toolCallId: tr.toolCallId,
              },
              createdAt: Date.now(),
            };
            this.addMessage(session, toolMsg);
          }

          // Get follow-up response from AI
          const followUpMessages = this.buildApiMessages(session);
          const followUpCompletion = await this.client.chat.completions.create({
            model: this.model,
            messages: followUpMessages,
            max_tokens: 4096,
          });

          const followUpChoice = followUpCompletion.choices[0];
          if (followUpChoice?.message.content) {
            const followUpMsg: ChatMessage = {
              id: generateId("msg"),
              sessionId,
              role: "assistant",
              content: followUpChoice.message.content,
              createdAt: Date.now(),
            };
            this.addMessage(session, followUpMsg);

            yield {
              type: "message",
              sessionId,
              timestamp: Date.now(),
              data: { message: followUpMsg },
            };
          }
        }
      } else {
        // Simple text response without tool calls
        const msg: ChatMessage = {
          id: generateId("msg"),
          sessionId,
          role: "assistant",
          content: assistantMessage.content || "",
          createdAt: Date.now(),
        };
        this.addMessage(session, msg);

        yield {
          type: "message",
          sessionId,
          timestamp: Date.now(),
          data: { message: msg },
        };
      }

      yield {
        type: "typing",
        sessionId,
        timestamp: Date.now(),
        data: { status: "completed" },
      };
    } catch (error) {
      yield {
        type: "error",
        sessionId,
        timestamp: Date.now(),
        data: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
      };

      yield {
        type: "typing",
        sessionId,
        timestamp: Date.now(),
        data: { status: "error" },
      };
    }
  }

  // ============================================================================
  // APPROVAL HANDLING
  // ============================================================================

  /**
   * Approve a pending operation
   */
  async approveOperation(
    approvalId: string,
    approvedBy: string,
    reason?: string
  ): Promise<ToolResult> {
    const approval = this.pendingApprovals.get(approvalId);
    if (!approval) {
      return {
        success: false,
        error: "Approval request not found or expired",
        executionTimeMs: 0,
      };
    }

    // Update approval status
    approval.status = "approved";
    approval.respondedAt = Date.now();
    approval.respondedBy = approvedBy;
    approval.responseReason = reason;

    // Execute the tool with approval context
    const session = this.sessions.get(approval.sessionId!);
    if (!session) {
      return {
        success: false,
        error: "Session not found",
        executionTimeMs: 0,
      };
    }

    const context: ToolContext = {
      serverId: approval.serverId,
      sessionId: approval.sessionId,
      userId: approvedBy,
      approvalId,
    };

    // Find the instance for this plugin
    const instances = this.pluginRegistry.getPluginInstances(approval.pluginId);
    const instance = instances.find((i) => i.serverId === approval.serverId);
    if (!instance) {
      return {
        success: false,
        error: "Plugin instance not found",
        executionTimeMs: 0,
      };
    }

    const result = await this.pluginRegistry.executeTool(
      instance.id,
      approval.operation,
      approval.parameters,
      context
    );

    // Remove from pending
    this.pendingApprovals.delete(approvalId);

    return result;
  }

  /**
   * Reject a pending operation
   */
  rejectOperation(
    approvalId: string,
    rejectedBy: string,
    reason?: string
  ): void {
    const approval = this.pendingApprovals.get(approvalId);
    if (approval) {
      approval.status = "rejected";
      approval.respondedAt = Date.now();
      approval.respondedBy = rejectedBy;
      approval.responseReason = reason;
      this.pendingApprovals.delete(approvalId);
    }
  }

  /**
   * Get pending approvals for a server
   */
  getPendingApprovals(serverId?: string): ApprovalRequest[] {
    const approvals = Array.from(this.pendingApprovals.values());
    if (serverId) {
      return approvals.filter((a) => a.serverId === serverId);
    }
    return approvals;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private addMessage(session: ChatSession, message: ChatMessage): void {
    session.messages.push(message);
    session.updatedAt = Date.now();
  }

  private buildSystemMessage(session: ChatSession): string {
    const plugins = session.context.pluginInstances
      .map((id) => {
        const metadata = this.pluginRegistry.getInstanceMetadata(id);
        if (!metadata) return null;
        const plugin = this.pluginRegistry.getPlugin(metadata.pluginId);
        return plugin ? `- ${plugin.name} (${plugin.type})` : null;
      })
      .filter(Boolean)
      .join("\n");

    return `You are OpsAgent, an AI assistant for database administration and system operations.

## Your Capabilities
You have access to the following database plugins and tools:
${plugins || "No plugins currently configured."}

## Guidelines
1. **Safety First**: Always explain what operations will do before executing them
2. **Risk Awareness**: Higher-risk operations require approval - explain why they're needed
3. **Be Helpful**: Provide context about what you find and suggest optimizations
4. **Be Concise**: Give clear, actionable responses

## Tool Usage
- Use read tools freely to gather information
- For optimization tools (medium risk), explain the expected impact
- For admin tools (high/critical risk), provide clear justification

${session.context.systemContext ? `\n## Current System Context\n${session.context.systemContext}` : ""}`;
  }

  private buildApiMessages(
    session: ChatSession
  ): OpenAI.ChatCompletionMessageParam[] {
    const messages: OpenAI.ChatCompletionMessageParam[] = [];

    for (const msg of session.messages) {
      switch (msg.role) {
        case "system":
          messages.push({ role: "system", content: msg.content });
          break;
        case "user":
          messages.push({ role: "user", content: msg.content });
          break;
        case "assistant":
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            messages.push({
              role: "assistant",
              content: msg.content || null,
              tool_calls: msg.toolCalls.map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: {
                  name: tc.name,
                  arguments: JSON.stringify(tc.arguments),
                },
              })),
            });
          } else {
            messages.push({ role: "assistant", content: msg.content });
          }
          break;
        case "tool":
          messages.push({
            role: "tool",
            tool_call_id: (msg.metadata?.toolCallId as string) || "",
            content: msg.content,
          });
          break;
      }
    }

    return messages;
  }

  private buildToolDefinitions(
    session: ChatSession
  ): OpenAI.ChatCompletionTool[] {
    const tools: OpenAI.ChatCompletionTool[] = [];

    for (const instanceId of session.context.pluginInstances) {
      const pluginTools = this.pluginRegistry.getInstanceTools(instanceId);
      const metadata = this.pluginRegistry.getInstanceMetadata(instanceId);

      for (const tool of pluginTools) {
        tools.push({
          type: "function",
          function: {
            name: tool.name,
            description: `${tool.description}\n[Risk: ${tool.riskLevel}] [Category: ${tool.category}]${tool.requiresApproval ? " [Requires Approval]" : ""}`,
            parameters: {
              type: "object",
              properties: tool.parameters.reduce(
                (acc, param) => {
                  acc[param.name] = {
                    type: param.type === "array" ? "array" : param.type,
                    description: param.description,
                    ...(param.enum ? { enum: param.enum } : {}),
                    ...(param.default !== undefined
                      ? { default: param.default }
                      : {}),
                  };
                  return acc;
                },
                {} as Record<string, unknown>
              ),
              required: tool.parameters
                .filter((p) => p.required)
                .map((p) => p.name),
            },
          },
        });
      }
    }

    return tools;
  }

  private async executeTool(
    session: ChatSession,
    toolCall: ToolCall
  ): Promise<{ toolResult: ToolResult; approvalRequest?: ApprovalRequest }> {
    // Find which instance has this tool
    for (const instanceId of session.context.pluginInstances) {
      const tool = this.pluginRegistry.getInstanceTool(instanceId, toolCall.name);
      if (tool) {
        const metadata = this.pluginRegistry.getInstanceMetadata(instanceId);
        if (!metadata) continue;

        const context: ToolContext = {
          serverId: session.serverId,
          sessionId: session.id,
          userId: session.context.userId,
        };

        const result = await this.pluginRegistry.executeTool(
          instanceId,
          toolCall.name,
          toolCall.arguments,
          context
        );

        // If approval is required, create an approval request
        if (result.requiresApproval && result.approvalRequest) {
          const approvalId = generateId("appr");
          const approval: ApprovalRequest = {
            id: approvalId,
            serverId: session.serverId,
            sessionId: session.id,
            pluginId: metadata.pluginId,
            messageId: toolCall.id,
            operation: result.approvalRequest.operation,
            parameters: result.approvalRequest.parameters,
            riskLevel: result.approvalRequest.riskLevel,
            reason: result.approvalRequest.reason,
            status: "pending",
            requestedAt: Date.now(),
            expiresAt: Date.now() + 3600000, // 1 hour expiry
          };

          this.pendingApprovals.set(approvalId, approval);

          return {
            toolResult: {
              success: false,
              error: "Operation requires approval",
              executionTimeMs: result.executionTimeMs,
              requiresApproval: true,
            },
            approvalRequest: approval,
          };
        }

        return { toolResult: result };
      }
    }

    return {
      toolResult: {
        success: false,
        error: `Tool ${toolCall.name} not found in available plugins`,
        executionTimeMs: 0,
      },
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createChatHandler(
  pluginRegistry: PluginRegistry,
  provider?: ChatProvider,
  model?: string
): ChatHandler {
  return new ChatHandler(pluginRegistry, provider, model);
}
