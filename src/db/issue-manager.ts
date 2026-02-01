import { createHash } from "crypto";
import type { Database } from "./client.js";

export interface Issue {
  id: string;
  serverId: string;
  alertFingerprint: string;
  title: string;
  description: string;
  severity: string;
  status: "open" | "investigating" | "resolved" | "closed";
  source: string;
  sourceAlertId?: string;
  firstSeenAt: number;
  lastSeenAt: number;
  resolvedAt?: number;
  alertCount: number;
  metadata?: any;
}

export interface IssueComment {
  id: number;
  issueId: string;
  authorType: "agent" | "human";
  authorName?: string;
  commentType: "analysis" | "action" | "status_change" | "alert_fired" | "note";
  content: string;
  metadata?: any;
  createdAt: number;
}

export interface AlertInfo {
  id: string;
  name: string;
  context: string;
  chart: string;
  severity: string;
  message: string;
  value: number;
  timestamp: number;
  source: string;
}

export class IssueManager {
  private db: Database;
  private serverId: string;

  constructor(db: Database, serverId: string) {
    this.db = db;
    this.serverId = serverId;
  }

  /**
   * Generate a fingerprint for an alert to identify related alerts
   * This prevents creating duplicate issues for the same ongoing problem
   */
  private generateFingerprint(alert: AlertInfo): string {
    // Create fingerprint from alert name + context
    // e.g., "cpu_usage" + "system.cpu" = fingerprint for all CPU alerts
    const fingerprintData = `${alert.name}:${alert.context}:${alert.chart}`;
    return createHash("sha256").update(fingerprintData).digest("hex").substring(0, 16);
  }

  /**
   * Find an existing open issue for this alert type
   */
  private async findExistingIssue(fingerprint: string): Promise<Issue | null> {
    const result = await this.db.getClient().execute({
      sql: `
        SELECT * FROM issues 
        WHERE server_id = ? 
        AND alert_fingerprint = ? 
        AND status IN ('open', 'investigating')
        ORDER BY last_seen_at DESC
        LIMIT 1
      `,
      args: [this.serverId, fingerprint],
    });

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id as string,
      serverId: row.server_id as string,
      alertFingerprint: row.alert_fingerprint as string,
      title: row.title as string,
      description: row.description as string,
      severity: row.severity as string,
      status: row.status as Issue["status"],
      source: row.source as string,
      sourceAlertId: row.source_alert_id as string,
      firstSeenAt: row.first_seen_at as number,
      lastSeenAt: row.last_seen_at as number,
      resolvedAt: row.resolved_at as number | undefined,
      alertCount: row.alert_count as number,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    };
  }

  /**
   * Create a new issue for an alert
   */
  private async createIssue(alert: AlertInfo, fingerprint: string): Promise<Issue> {
    const issueId = `issue-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = Date.now();

    await this.db.getClient().execute({
      sql: `
        INSERT INTO issues (
          id, server_id, alert_fingerprint, title, description, severity, 
          status, source, source_alert_id, first_seen_at, last_seen_at, alert_count, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        issueId,
        this.serverId,
        fingerprint,
        alert.name,
        alert.message,
        alert.severity,
        "open",
        alert.source,
        alert.id,
        now,
        now,
        1,
        JSON.stringify({ initialValue: alert.value }),
      ],
    });

    // Add initial comment
    await this.addComment(issueId, {
      authorType: "agent",
      commentType: "alert_fired",
      content: `Alert first detected: ${alert.name} = ${alert.value}`,
      metadata: { alertId: alert.id, value: alert.value },
    });

    return {
      id: issueId,
      serverId: this.serverId,
      alertFingerprint: fingerprint,
      title: alert.name,
      description: alert.message,
      severity: alert.severity,
      status: "open",
      source: alert.source,
      sourceAlertId: alert.id,
      firstSeenAt: now,
      lastSeenAt: now,
      alertCount: 1,
      metadata: { initialValue: alert.value },
    };
  }

  /**
   * Update an existing issue with a new alert occurrence
   */
  private async updateIssue(issue: Issue, alert: AlertInfo): Promise<Issue> {
    const now = Date.now();
    const newCount = issue.alertCount + 1;

    await this.db.getClient().execute({
      sql: `
        UPDATE issues 
        SET last_seen_at = ?, alert_count = ?, source_alert_id = ?
        WHERE id = ?
      `,
      args: [now, newCount, alert.id, issue.id],
    });

    // Add comment about the repeated alert
    await this.addComment(issue.id, {
      authorType: "agent",
      commentType: "alert_fired",
      content: `Alert fired again (#${newCount}): ${alert.name} = ${alert.value}`,
      metadata: { 
        alertId: alert.id, 
        value: alert.value, 
        count: newCount,
        timeSinceFirst: Math.floor((now - issue.firstSeenAt) / 1000 / 60) + " minutes",
      },
    });

    return {
      ...issue,
      lastSeenAt: now,
      alertCount: newCount,
      sourceAlertId: alert.id,
    };
  }

  /**
   * Main method: handle an alert - create or update issue
   * This prevents spam by grouping related alerts into one issue
   */
  async handleAlert(alert: AlertInfo): Promise<{ issue: Issue; isNew: boolean }> {
    const fingerprint = this.generateFingerprint(alert);
    const existingIssue = await this.findExistingIssue(fingerprint);

    if (existingIssue) {
      // Update existing issue
      const updatedIssue = await this.updateIssue(existingIssue, alert);
      console.log(`[IssueManager] Updated existing issue #${updatedIssue.alertCount}: ${updatedIssue.title}`);
      return { issue: updatedIssue, isNew: false };
    } else {
      // Create new issue
      const newIssue = await this.createIssue(alert, fingerprint);
      console.log(`[IssueManager] Created new issue: ${newIssue.title}`);
      return { issue: newIssue, isNew: true };
    }
  }

  /**
   * Add a comment to an issue
   */
  async addComment(
    issueId: string,
    comment: Omit<IssueComment, "id" | "issueId" | "createdAt">
  ): Promise<void> {
    const now = Date.now();

    await this.db.getClient().execute({
      sql: `
        INSERT INTO issue_comments (
          issue_id, author_type, author_name, comment_type, content, metadata, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        issueId,
        comment.authorType,
        comment.authorName || null,
        comment.commentType,
        comment.content,
        comment.metadata ? JSON.stringify(comment.metadata) : null,
        now,
      ],
    });
  }

  /**
   * Record AI analysis as a comment
   */
  async recordAnalysis(
    issueId: string,
    analysis: string,
    canAutoRemediate: boolean,
    requiresHumanAttention: boolean
  ): Promise<void> {
    await this.addComment(issueId, {
      authorType: "agent",
      commentType: "analysis",
      content: analysis,
      metadata: {
        canAutoRemediate,
        requiresHumanAttention,
        timestamp: Date.now(),
      },
    });

    // If requires human attention, update issue status
    if (requiresHumanAttention) {
      await this.updateStatus(issueId, "investigating", "Agent requires human attention");
    }
  }

  /**
   * Record an action taken by the agent
   */
  async recordAction(
    issueId: string,
    actionType: string,
    description: string,
    success: boolean,
    output?: string,
    error?: string
  ): Promise<void> {
    await this.addComment(issueId, {
      authorType: "agent",
      commentType: "action",
      content: `${success ? "✅" : "❌"} ${actionType}: ${description}`,
      metadata: {
        actionType,
        success,
        output,
        error,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Update issue status
   */
  async updateStatus(
    issueId: string,
    newStatus: Issue["status"],
    reason?: string
  ): Promise<void> {
    const now = Date.now();
    const resolvedAt = newStatus === "resolved" ? now : undefined;

    await this.db.getClient().execute({
      sql: "UPDATE issues SET status = ?, resolved_at = ? WHERE id = ?",
      args: [newStatus, resolvedAt || null, issueId],
    });

    await this.addComment(issueId, {
      authorType: "agent",
      commentType: "status_change",
      content: `Status changed to ${newStatus}${reason ? `: ${reason}` : ""}`,
      metadata: { previousStatus: newStatus, reason },
    });
  }

  /**
   * Get all open issues for this server
   */
  async getOpenIssues(): Promise<Issue[]> {
    const result = await this.db.getClient().execute({
      sql: `
        SELECT * FROM issues 
        WHERE server_id = ? 
        AND status IN ('open', 'investigating')
        ORDER BY last_seen_at DESC
      `,
      args: [this.serverId],
    });

    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      serverId: row.server_id as string,
      alertFingerprint: row.alert_fingerprint as string,
      title: row.title as string,
      description: row.description as string,
      severity: row.severity as string,
      status: row.status as Issue["status"],
      source: row.source as string,
      sourceAlertId: row.source_alert_id as string,
      firstSeenAt: row.first_seen_at as number,
      lastSeenAt: row.last_seen_at as number,
      resolvedAt: row.resolved_at as number | undefined,
      alertCount: row.alert_count as number,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    }));
  }

  /**
   * Get issue with all comments
   */
  async getIssueWithComments(issueId: string): Promise<{ issue: Issue; comments: IssueComment[] } | null> {
    const issueResult = await this.db.getClient().execute({
      sql: "SELECT * FROM issues WHERE id = ? AND server_id = ?",
      args: [issueId, this.serverId],
    });

    if (issueResult.rows.length === 0) {
      return null;
    }

    const row = issueResult.rows[0];
    const issue: Issue = {
      id: row.id as string,
      serverId: row.server_id as string,
      alertFingerprint: row.alert_fingerprint as string,
      title: row.title as string,
      description: row.description as string,
      severity: row.severity as string,
      status: row.status as Issue["status"],
      source: row.source as string,
      sourceAlertId: row.source_alert_id as string,
      firstSeenAt: row.first_seen_at as number,
      lastSeenAt: row.last_seen_at as number,
      resolvedAt: row.resolved_at as number | undefined,
      alertCount: row.alert_count as number,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    };

    const commentsResult = await this.db.getClient().execute({
      sql: `
        SELECT * FROM issue_comments 
        WHERE issue_id = ? 
        ORDER BY created_at ASC
      `,
      args: [issueId],
    });

    const comments: IssueComment[] = commentsResult.rows.map((row: Record<string, unknown>) => ({
      id: row.id as number,
      issueId: row.issue_id as string,
      authorType: row.author_type as IssueComment["authorType"],
      authorName: row.author_name as string,
      commentType: row.comment_type as IssueComment["commentType"],
      content: row.content as string,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
      createdAt: row.created_at as number,
    }));

    return { issue, comments };
  }

  /**
   * Resolve an issue when the alert clears
   */
  async resolveIssue(issueId: string, reason?: string): Promise<void> {
    await this.updateStatus(issueId, "resolved", reason || "Alert condition cleared");

    console.log(`[IssueManager] Resolved issue: ${issueId}`);
  }

  /**
   * Close a resolved issue (archived, no longer active)
   */
  async closeIssue(issueId: string, reason?: string): Promise<void> {
    await this.updateStatus(issueId, "closed", reason || "Issue closed");
  }
}
