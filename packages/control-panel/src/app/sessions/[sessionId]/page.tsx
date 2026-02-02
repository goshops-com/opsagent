import { getChatSessionById, getChatMessages, getServerById } from "@/lib/db";
import {
  MessageSquare,
  Server,
  User,
  Bot,
  Wrench,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import ChatInput from "@/components/chat/ChatInput";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatDate(timestamp: number | string | null) {
  if (!timestamp) return "Unknown";
  const ts = typeof timestamp === "number" ? timestamp : parseInt(timestamp);
  return new Date(ts).toLocaleString();
}

function formatTime(timestamp: number | string | null) {
  if (!timestamp) return "";
  const ts = typeof timestamp === "number" ? timestamp : parseInt(timestamp);
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    active: { bg: "#22c55e20", color: "#22c55e" },
    closed: { bg: "#6b728020", color: "#6b7280" },
    archived: { bg: "#3b82f620", color: "#3b82f6" },
  };
  const { bg, color } = colors[status] || colors.closed;
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: "4px",
        fontSize: "12px",
        fontWeight: 500,
        background: bg,
        color: color,
      }}
    >
      {status}
    </span>
  );
}

function RiskBadge({ level }: { level: string }) {
  const config: Record<string, { bg: string; color: string }> = {
    low: { bg: "#22c55e20", color: "#22c55e" },
    medium: { bg: "#f59e0b20", color: "#f59e0b" },
    high: { bg: "#ef444420", color: "#ef4444" },
    critical: { bg: "#dc262620", color: "#dc2626" },
  };
  const { bg, color } = config[level] || config.medium;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "2px 6px",
        borderRadius: "4px",
        fontSize: "10px",
        fontWeight: 600,
        background: bg,
        color: color,
        textTransform: "uppercase",
      }}
    >
      <AlertTriangle size={8} />
      {level}
    </span>
  );
}

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface ToolResult {
  toolCallId: string;
  result: {
    success: boolean;
    data?: unknown;
    error?: string;
    requiresApproval?: boolean;
  };
}

function ToolCallCard({ toolCall, result }: { toolCall: ToolCall; result?: ToolResult }) {
  const isSuccess = result?.result?.success;
  const requiresApproval = result?.result?.requiresApproval;

  return (
    <div
      style={{
        background: "#1a1a1a",
        border: "1px solid #2a2a2a",
        borderRadius: "6px",
        padding: "12px",
        marginTop: "8px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
        <Wrench size={14} color="#8b5cf6" />
        <span
          style={{
            fontFamily: "monospace",
            fontSize: "13px",
            fontWeight: 500,
          }}
        >
          {toolCall.name}
        </span>
        {result && (
          <>
            {requiresApproval ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "11px",
                  color: "#f59e0b",
                }}
              >
                <AlertTriangle size={10} />
                Requires Approval
              </span>
            ) : isSuccess ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "11px",
                  color: "#22c55e",
                }}
              >
                <CheckCircle size={10} />
                Success
              </span>
            ) : (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "11px",
                  color: "#ef4444",
                }}
              >
                <XCircle size={10} />
                Failed
              </span>
            )}
          </>
        )}
      </div>

      {Object.keys(toolCall.arguments).length > 0 && (
        <details style={{ fontSize: "12px" }}>
          <summary style={{ color: "#a0a0a0", cursor: "pointer", marginBottom: "4px" }}>
            Parameters
          </summary>
          <pre
            style={{
              background: "#0a0a0a",
              padding: "8px",
              borderRadius: "4px",
              overflow: "auto",
              maxHeight: "100px",
              margin: 0,
              fontSize: "11px",
            }}
          >
            {JSON.stringify(toolCall.arguments, null, 2)}
          </pre>
        </details>
      )}

      {result?.result?.data !== undefined && (
        <details style={{ fontSize: "12px", marginTop: "8px" }}>
          <summary style={{ color: "#a0a0a0", cursor: "pointer", marginBottom: "4px" }}>
            Result
          </summary>
          <pre
            style={{
              background: "#0a0a0a",
              padding: "8px",
              borderRadius: "4px",
              overflow: "auto",
              maxHeight: "150px",
              margin: 0,
              fontSize: "11px",
            }}
          >
            {JSON.stringify(result.result.data, null, 2)}
          </pre>
        </details>
      )}

      {result?.result?.error && (
        <div
          style={{
            marginTop: "8px",
            padding: "8px",
            background: "#ef444420",
            borderRadius: "4px",
            fontSize: "12px",
            color: "#ef4444",
          }}
        >
          {result.result.error}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: any }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const isTool = message.role === "tool";

  if (isSystem) {
    return null; // Don't display system messages
  }

  if (isTool) {
    return null; // Tool results are shown inline with assistant messages
  }

  const toolCalls = message.tool_calls ? JSON.parse(message.tool_calls) as ToolCall[] : [];
  const toolResults = message.tool_results ? JSON.parse(message.tool_results) as ToolResult[] : [];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        marginBottom: "16px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "4px",
        }}
      >
        {!isUser && <Bot size={16} color="#8b5cf6" />}
        <span style={{ fontSize: "12px", color: "#a0a0a0" }}>
          {isUser ? "You" : "OpsAgent"}
        </span>
        <span style={{ fontSize: "11px", color: "#6b7280" }}>
          {formatTime(message.created_at)}
        </span>
        {isUser && <User size={16} color="#3b82f6" />}
      </div>

      <div
        style={{
          maxWidth: "80%",
          padding: "12px 16px",
          borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          background: isUser ? "#3b82f6" : "#1a1a1a",
          color: isUser ? "#fff" : "#d1d5db",
          border: isUser ? "none" : "1px solid #2a2a2a",
        }}
      >
        <div
          style={{
            whiteSpace: "pre-wrap",
            fontSize: "14px",
            lineHeight: 1.5,
          }}
        >
          {message.content}
        </div>

        {/* Tool Calls */}
        {toolCalls.length > 0 && (
          <div style={{ marginTop: "12px" }}>
            {toolCalls.map((tc) => {
              const result = toolResults.find((tr) => tr.toolCallId === tc.id);
              return <ToolCallCard key={tc.id} toolCall={tc} result={result} />;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default async function ChatSessionPage({
  params,
}: {
  params: { sessionId: string };
}) {
  const session = await getChatSessionById(params.sessionId);

  if (!session) {
    notFound();
  }

  const [messages, server] = await Promise.all([
    getChatMessages(session.id),
    getServerById(session.server_id),
  ]);

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "24px", height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header style={{ marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "8px" }}>
          <Link
            href="/sessions"
            style={{
              color: "#a0a0a0",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <ArrowLeft size={16} />
            Sessions
          </Link>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1
              style={{
                fontSize: "24px",
                fontWeight: 600,
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <MessageSquare size={24} color="#8b5cf6" />
              {session.title}
              <StatusBadge status={session.status} />
            </h1>
            <div
              style={{
                fontSize: "13px",
                color: "#a0a0a0",
                marginTop: "8px",
                display: "flex",
                alignItems: "center",
                gap: "16px",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <Server size={14} />
                {server?.name || server?.hostname || session.server_id}
              </span>
              <span>Created: {formatDate(session.created_at)}</span>
              {session.created_by && <span>By: {session.created_by}</span>}
            </div>
          </div>
          {session.status === "active" && (
            <form action={`/api/sessions/${session.id}/close`} method="POST">
              <button
                type="submit"
                style={{
                  padding: "8px 16px",
                  background: "#2a2a2a",
                  color: "#a0a0a0",
                  border: "1px solid #3a3a3a",
                  borderRadius: "6px",
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                Close Session
              </button>
            </form>
          )}
        </div>
      </header>

      {/* Chat Messages */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          background: "#0a0a0a",
          borderRadius: "12px",
          border: "1px solid #2a2a2a",
          padding: "24px",
          marginBottom: "16px",
        }}
      >
        {messages.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#6b7280" }}>
            <Bot size={48} style={{ marginBottom: "16px", opacity: 0.5 }} />
            <p>No messages yet. Start the conversation below.</p>
          </div>
        ) : (
          messages
            .filter((m) => m.role !== "system" && m.role !== "tool")
            .map((message) => <MessageBubble key={message.id} message={message} />)
        )}
      </div>

      {/* Chat Input */}
      {session.status === "active" ? (
        <ChatInput sessionId={session.id} serverId={session.server_id} />
      ) : (
        <div
          style={{
            padding: "16px",
            background: "#1a1a1a",
            borderRadius: "8px",
            border: "1px solid #2a2a2a",
            textAlign: "center",
            color: "#6b7280",
          }}
        >
          This session is {session.status}. Start a new session to continue chatting.
        </div>
      )}
    </div>
  );
}
