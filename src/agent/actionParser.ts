export interface AgentAction {
  action: string;
  description: string;
  command?: string;
  risk: "low" | "medium" | "high";
  pid?: number;
  service?: string;
  message?: string; // For notify_human action
}

export interface AgentResponse {
  analysis: string;
  canAutoRemediate: boolean;
  requiresHumanAttention: boolean;
  humanNotificationReason?: string;
  recommendations: AgentAction[];
}

export function parseAgentResponse(response: string): AgentResponse | null {
  try {
    // Try to find JSON in the response
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      return validateResponse(parsed);
    }

    // Try to parse the entire response as JSON
    const parsed = JSON.parse(response);
    return validateResponse(parsed);
  } catch {
    // If no JSON found, extract text analysis
    return {
      analysis: response,
      canAutoRemediate: false,
      requiresHumanAttention: true, // Default to requiring human attention if we can't parse
      recommendations: [],
    };
  }
}

function validateResponse(obj: any): AgentResponse | null {
  if (!obj || typeof obj !== "object") {
    return null;
  }

  const response: AgentResponse = {
    analysis: typeof obj.analysis === "string" ? obj.analysis : "",
    canAutoRemediate: obj.canAutoRemediate === true,
    requiresHumanAttention: obj.requiresHumanAttention === true,
    humanNotificationReason: typeof obj.humanNotificationReason === "string" ? obj.humanNotificationReason : undefined,
    recommendations: [],
  };

  if (Array.isArray(obj.recommendations)) {
    for (const rec of obj.recommendations) {
      if (rec && typeof rec === "object" && typeof rec.action === "string") {
        const action: AgentAction = {
          action: rec.action,
          description: rec.description || "",
          risk: ["low", "medium", "high"].includes(rec.risk) ? rec.risk : "high",
        };

        if (rec.command) action.command = rec.command;
        if (rec.pid) action.pid = rec.pid;
        if (rec.service) action.service = rec.service;
        if (rec.message) action.message = rec.message;

        response.recommendations.push(action);
      }
    }
  }

  return response;
}

export function formatActionsForDisplay(actions: AgentAction[]): string[] {
  return actions.map((action) => {
    let display = `[${action.risk.toUpperCase()}] ${action.action}: ${action.description}`;
    if (action.command) {
      display += ` (cmd: ${action.command})`;
    }
    return display;
  });
}
