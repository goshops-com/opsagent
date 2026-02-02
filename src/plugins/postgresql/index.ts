/**
 * PostgreSQL Plugin
 * Provides DBA capabilities for PostgreSQL databases including:
 * - Read: Query analysis, index inspection, connection stats
 * - Optimize: Index management, vacuum, analyze
 * - Admin: Connection management, user management
 */

import type {
  Plugin,
  PluginConfig,
  PluginHealth,
  PluginCapability,
  PluginTool,
  ToolContext,
  ToolResult,
  ToolParameter,
  RiskLevel,
} from "../types.js";
import { toolRequiresApproval, generateId } from "../types.js";

// ============================================================================
// POSTGRESQL CLIENT INTERFACE
// ============================================================================

// We use a simple interface to allow for different PostgreSQL client implementations
interface PostgreSQLClient {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[]; rowCount: number }>;
  end(): Promise<void>;
}

// Dynamic import for pg module - types are declared inline to avoid compile-time dependency
let pgModule: any = null;
const PG_MODULE_NAME = "pg";

async function getPgModule(): Promise<any> {
  if (!pgModule) {
    try {
      // Use variable to prevent TypeScript from checking the module at compile time
      pgModule = await import(/* webpackIgnore: true */ PG_MODULE_NAME);
    } catch {
      throw new Error("PostgreSQL client library (pg) is not installed. Run: npm install pg");
    }
  }
  return pgModule;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

const POSTGRESQL_TOOLS: PluginTool[] = [
  // -------------------------------------------------------------------------
  // READ TOOLS (Low Risk)
  // -------------------------------------------------------------------------
  {
    name: "explain_query",
    description:
      "Analyze a SQL query execution plan using EXPLAIN ANALYZE. Shows how PostgreSQL will execute the query.",
    parameters: [
      {
        name: "query",
        type: "string",
        description: "The SQL query to analyze",
        required: true,
      },
      {
        name: "analyze",
        type: "boolean",
        description: "Run ANALYZE to get actual execution times (default: true)",
        required: false,
        default: true,
      },
      {
        name: "buffers",
        type: "boolean",
        description: "Include buffer usage information (default: true)",
        required: false,
        default: true,
      },
      {
        name: "format",
        type: "string",
        description: "Output format: text, json, xml, yaml",
        required: false,
        default: "text",
        enum: ["text", "json", "xml", "yaml"],
      },
    ],
    riskLevel: "low",
    requiresApproval: false,
    category: "read",
    examples: [
      {
        description: "Analyze a SELECT query",
        params: { query: "SELECT * FROM users WHERE email = 'test@example.com'" },
      },
    ],
  },
  {
    name: "get_slow_queries",
    description:
      "Get the slowest queries from pg_stat_statements. Requires pg_stat_statements extension.",
    parameters: [
      {
        name: "limit",
        type: "number",
        description: "Maximum number of queries to return (default: 10)",
        required: false,
        default: 10,
      },
      {
        name: "min_calls",
        type: "number",
        description: "Minimum number of calls to include (default: 1)",
        required: false,
        default: 1,
      },
      {
        name: "order_by",
        type: "string",
        description: "Order by: total_time, mean_time, calls (default: total_time)",
        required: false,
        default: "total_time",
        enum: ["total_time", "mean_time", "calls"],
      },
    ],
    riskLevel: "low",
    requiresApproval: false,
    category: "read",
  },
  {
    name: "list_indexes",
    description: "List all indexes in the database with their size and usage statistics.",
    parameters: [
      {
        name: "schema",
        type: "string",
        description: "Schema name to filter (default: public)",
        required: false,
        default: "public",
      },
      {
        name: "table",
        type: "string",
        description: "Table name to filter (optional)",
        required: false,
      },
      {
        name: "unused_only",
        type: "boolean",
        description: "Only show unused indexes (default: false)",
        required: false,
        default: false,
      },
    ],
    riskLevel: "low",
    requiresApproval: false,
    category: "read",
  },
  {
    name: "get_connection_stats",
    description: "Get current database connection statistics and active sessions.",
    parameters: [
      {
        name: "include_idle",
        type: "boolean",
        description: "Include idle connections (default: true)",
        required: false,
        default: true,
      },
    ],
    riskLevel: "low",
    requiresApproval: false,
    category: "read",
  },
  {
    name: "get_replication_status",
    description: "Get replication status and lag information for replicas.",
    parameters: [],
    riskLevel: "low",
    requiresApproval: false,
    category: "read",
  },
  {
    name: "get_table_stats",
    description: "Get table statistics including row count, size, and bloat estimation.",
    parameters: [
      {
        name: "schema",
        type: "string",
        description: "Schema name (default: public)",
        required: false,
        default: "public",
      },
      {
        name: "table",
        type: "string",
        description: "Table name (optional, all tables if not specified)",
        required: false,
      },
    ],
    riskLevel: "low",
    requiresApproval: false,
    category: "read",
  },
  {
    name: "get_locks",
    description: "Get current lock information and blocking queries.",
    parameters: [
      {
        name: "blocked_only",
        type: "boolean",
        description: "Only show blocked/blocking locks (default: false)",
        required: false,
        default: false,
      },
    ],
    riskLevel: "low",
    requiresApproval: false,
    category: "read",
  },

  // -------------------------------------------------------------------------
  // OPTIMIZE TOOLS (Medium Risk - Requires Approval)
  // -------------------------------------------------------------------------
  {
    name: "create_index",
    description:
      "Create a new index on a table. Uses CONCURRENTLY by default to avoid blocking.",
    parameters: [
      {
        name: "table",
        type: "string",
        description: "Table name (schema.table or just table)",
        required: true,
      },
      {
        name: "columns",
        type: "array",
        description: "Column names to index",
        required: true,
      },
      {
        name: "index_name",
        type: "string",
        description: "Name for the index (auto-generated if not provided)",
        required: false,
      },
      {
        name: "unique",
        type: "boolean",
        description: "Create a unique index (default: false)",
        required: false,
        default: false,
      },
      {
        name: "method",
        type: "string",
        description: "Index method: btree, hash, gin, gist, brin (default: btree)",
        required: false,
        default: "btree",
        enum: ["btree", "hash", "gin", "gist", "brin"],
      },
      {
        name: "where",
        type: "string",
        description: "Partial index WHERE clause (optional)",
        required: false,
      },
      {
        name: "concurrently",
        type: "boolean",
        description: "Create index concurrently to avoid blocking (default: true)",
        required: false,
        default: true,
      },
    ],
    riskLevel: "medium",
    requiresApproval: true,
    category: "optimize",
    examples: [
      {
        description: "Create index on email column",
        params: { table: "users", columns: ["email"] },
      },
      {
        description: "Create composite index",
        params: { table: "orders", columns: ["user_id", "created_at"] },
      },
    ],
  },
  {
    name: "drop_index",
    description: "Drop an existing index. Uses CONCURRENTLY by default.",
    parameters: [
      {
        name: "index_name",
        type: "string",
        description: "Name of the index to drop (schema.index_name or just index_name)",
        required: true,
      },
      {
        name: "concurrently",
        type: "boolean",
        description: "Drop index concurrently to avoid blocking (default: true)",
        required: false,
        default: true,
      },
      {
        name: "if_exists",
        type: "boolean",
        description: "Don't error if index doesn't exist (default: true)",
        required: false,
        default: true,
      },
    ],
    riskLevel: "high",
    requiresApproval: true,
    category: "optimize",
  },
  {
    name: "vacuum_table",
    description: "Run VACUUM on a table to reclaim storage and update statistics.",
    parameters: [
      {
        name: "table",
        type: "string",
        description: "Table name (schema.table or just table)",
        required: true,
      },
      {
        name: "full",
        type: "boolean",
        description: "Run VACUUM FULL (locks table, reclaims more space) (default: false)",
        required: false,
        default: false,
      },
      {
        name: "analyze",
        type: "boolean",
        description: "Update statistics after vacuum (default: true)",
        required: false,
        default: true,
      },
    ],
    riskLevel: "medium",
    requiresApproval: true,
    category: "optimize",
  },
  {
    name: "analyze_table",
    description: "Update table statistics for the query planner.",
    parameters: [
      {
        name: "table",
        type: "string",
        description: "Table name (schema.table or just table, optional for all tables)",
        required: false,
      },
    ],
    riskLevel: "medium",
    requiresApproval: true,
    category: "optimize",
  },
  {
    name: "reindex_table",
    description: "Rebuild indexes on a table. Uses CONCURRENTLY by default.",
    parameters: [
      {
        name: "table",
        type: "string",
        description: "Table name (schema.table or just table)",
        required: true,
      },
      {
        name: "concurrently",
        type: "boolean",
        description: "Reindex concurrently to avoid blocking (default: true)",
        required: false,
        default: true,
      },
    ],
    riskLevel: "medium",
    requiresApproval: true,
    category: "optimize",
  },

  // -------------------------------------------------------------------------
  // ADMIN TOOLS (High/Critical Risk - Requires Approval)
  // -------------------------------------------------------------------------
  {
    name: "kill_connection",
    description: "Terminate a database connection/session.",
    parameters: [
      {
        name: "pid",
        type: "number",
        description: "Process ID of the connection to terminate",
        required: true,
      },
      {
        name: "force",
        type: "boolean",
        description: "Use pg_terminate_backend instead of pg_cancel_backend (default: false)",
        required: false,
        default: false,
      },
    ],
    riskLevel: "high",
    requiresApproval: true,
    category: "admin",
  },
  {
    name: "create_user",
    description: "Create a new database user/role.",
    parameters: [
      {
        name: "username",
        type: "string",
        description: "Username for the new role",
        required: true,
      },
      {
        name: "password",
        type: "string",
        description: "Password for the new role",
        required: true,
      },
      {
        name: "login",
        type: "boolean",
        description: "Allow login (default: true)",
        required: false,
        default: true,
      },
      {
        name: "createdb",
        type: "boolean",
        description: "Allow creating databases (default: false)",
        required: false,
        default: false,
      },
      {
        name: "superuser",
        type: "boolean",
        description: "Grant superuser privileges (default: false)",
        required: false,
        default: false,
      },
    ],
    riskLevel: "high",
    requiresApproval: true,
    category: "admin",
  },
  {
    name: "drop_user",
    description: "Drop a database user/role.",
    parameters: [
      {
        name: "username",
        type: "string",
        description: "Username of the role to drop",
        required: true,
      },
      {
        name: "if_exists",
        type: "boolean",
        description: "Don't error if user doesn't exist (default: true)",
        required: false,
        default: true,
      },
    ],
    riskLevel: "critical",
    requiresApproval: true,
    category: "admin",
  },
  {
    name: "grant_permission",
    description: "Grant permissions on a table or schema to a user/role.",
    parameters: [
      {
        name: "permission",
        type: "string",
        description: "Permission to grant: SELECT, INSERT, UPDATE, DELETE, ALL",
        required: true,
        enum: ["SELECT", "INSERT", "UPDATE", "DELETE", "ALL"],
      },
      {
        name: "on_type",
        type: "string",
        description: "Object type: TABLE, SCHEMA, DATABASE",
        required: true,
        enum: ["TABLE", "SCHEMA", "DATABASE"],
      },
      {
        name: "on_name",
        type: "string",
        description: "Object name (table/schema/database name)",
        required: true,
      },
      {
        name: "to_user",
        type: "string",
        description: "User/role to grant permission to",
        required: true,
      },
      {
        name: "with_grant_option",
        type: "boolean",
        description: "Allow user to grant this permission to others (default: false)",
        required: false,
        default: false,
      },
    ],
    riskLevel: "high",
    requiresApproval: true,
    category: "admin",
  },
  {
    name: "revoke_permission",
    description: "Revoke permissions on a table or schema from a user/role.",
    parameters: [
      {
        name: "permission",
        type: "string",
        description: "Permission to revoke: SELECT, INSERT, UPDATE, DELETE, ALL",
        required: true,
        enum: ["SELECT", "INSERT", "UPDATE", "DELETE", "ALL"],
      },
      {
        name: "on_type",
        type: "string",
        description: "Object type: TABLE, SCHEMA, DATABASE",
        required: true,
        enum: ["TABLE", "SCHEMA", "DATABASE"],
      },
      {
        name: "on_name",
        type: "string",
        description: "Object name (table/schema/database name)",
        required: true,
      },
      {
        name: "from_user",
        type: "string",
        description: "User/role to revoke permission from",
        required: true,
      },
    ],
    riskLevel: "high",
    requiresApproval: true,
    category: "admin",
  },
];

// ============================================================================
// POSTGRESQL PLUGIN CLASS
// ============================================================================

export class PostgreSQLPlugin implements Plugin {
  id = "postgresql";
  name = "PostgreSQL";
  version = "1.0.0";
  type = "postgresql";
  description = "PostgreSQL database management and DBA tools";

  private client: PostgreSQLClient | null = null;
  private config: PluginConfig | null = null;
  private connectionInfo: {
    host?: string;
    port?: number;
    database?: string;
    version?: string;
  } = {};

  // -------------------------------------------------------------------------
  // LIFECYCLE
  // -------------------------------------------------------------------------

  async initialize(config: PluginConfig): Promise<void> {
    const pg = await getPgModule();
    const { Pool } = pg;

    const { credentials, options } = config;

    const poolConfig: Record<string, unknown> = {
      host: credentials.host,
      port: credentials.port,
      database: credentials.database,
      user: credentials.username,
      password: credentials.password,
      ssl: credentials.ssl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: options?.connectionTimeout ?? 10000,
      query_timeout: options?.queryTimeout ?? 30000,
      max: options?.maxConnections ?? 5,
    };

    // Use connection string if provided
    if (credentials.connectionString) {
      poolConfig.connectionString = credentials.connectionString;
    }

    const pool = new Pool(poolConfig);

    // Wrap pool as our client interface
    this.client = {
      query: async <T>(sql: string, params?: unknown[]) => {
        const result = await pool.query(sql, params);
        return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
      },
      end: async () => {
        await pool.end();
      },
    };

    this.config = config;
    this.connectionInfo = {
      host: credentials.host,
      port: credentials.port,
      database: credentials.database,
    };

    // Test connection and get version
    try {
      const result = await this.client.query<{ version: string }>("SELECT version()");
      if (result.rows[0]) {
        const versionMatch = result.rows[0].version.match(/PostgreSQL (\d+\.\d+)/);
        this.connectionInfo.version = versionMatch ? versionMatch[1] : result.rows[0].version;
      }
    } catch (error) {
      await this.client.end();
      this.client = null;
      throw error;
    }

    console.log(
      `[PostgreSQL] Connected to ${this.connectionInfo.host}:${this.connectionInfo.port}/${this.connectionInfo.database} (v${this.connectionInfo.version})`
    );
  }

  async shutdown(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
    console.log("[PostgreSQL] Connection closed");
  }

  async checkHealth(): Promise<PluginHealth> {
    if (!this.client) {
      return {
        status: "unhealthy",
        message: "Not connected",
        lastChecked: Date.now(),
      };
    }

    try {
      const result = await this.client.query<{ now: Date }>("SELECT NOW()");
      return {
        status: "healthy",
        message: "Connected",
        lastChecked: Date.now(),
        connectionInfo: this.connectionInfo,
        details: {
          serverTime: result.rows[0]?.now,
        },
      };
    } catch (error) {
      return {
        status: "unhealthy",
        message: error instanceof Error ? error.message : "Health check failed",
        lastChecked: Date.now(),
        connectionInfo: this.connectionInfo,
      };
    }
  }

  // -------------------------------------------------------------------------
  // CAPABILITIES & TOOLS
  // -------------------------------------------------------------------------

  getCapabilities(): PluginCapability[] {
    return [
      { name: "query_analysis", description: "Analyze query execution plans", enabled: true },
      { name: "index_management", description: "Create and manage indexes", enabled: true },
      { name: "connection_management", description: "Monitor and manage connections", enabled: true },
      { name: "user_management", description: "Create and manage database users", enabled: true },
      { name: "maintenance", description: "Vacuum, analyze, and reindex operations", enabled: true },
      { name: "replication", description: "Monitor replication status", enabled: true },
    ];
  }

  getTools(): PluginTool[] {
    return POSTGRESQL_TOOLS;
  }

  // -------------------------------------------------------------------------
  // VALIDATION
  // -------------------------------------------------------------------------

  validateConfig(config: PluginConfig): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const { credentials } = config;

    if (!credentials.connectionString) {
      if (!credentials.host) errors.push("host is required");
      if (!credentials.port) errors.push("port is required");
      if (!credentials.database) errors.push("database is required");
    }

    return { valid: errors.length === 0, errors };
  }

  validateToolParams(
    toolName: string,
    params: Record<string, unknown>
  ): { valid: boolean; errors?: string[] } {
    const tool = POSTGRESQL_TOOLS.find((t) => t.name === toolName);
    if (!tool) {
      return { valid: false, errors: [`Unknown tool: ${toolName}`] };
    }

    const errors: string[] = [];
    for (const param of tool.parameters) {
      if (param.required && !(param.name in params)) {
        errors.push(`Missing required parameter: ${param.name}`);
      }
      if (param.name in params && param.enum) {
        if (!param.enum.includes(params[param.name] as string)) {
          errors.push(`Invalid value for ${param.name}. Must be one of: ${param.enum.join(", ")}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // -------------------------------------------------------------------------
  // TOOL EXECUTION
  // -------------------------------------------------------------------------

  async executeTool(
    name: string,
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    if (!this.client) {
      return {
        success: false,
        error: "Not connected to database",
        executionTimeMs: 0,
      };
    }

    const tool = POSTGRESQL_TOOLS.find((t) => t.name === name);
    if (!tool) {
      return {
        success: false,
        error: `Unknown tool: ${name}`,
        executionTimeMs: 0,
      };
    }

    // Check if approval is required
    if (toolRequiresApproval(tool, context)) {
      return {
        success: false,
        executionTimeMs: 0,
        requiresApproval: true,
        approvalRequest: {
          operation: name,
          parameters: params,
          reason: `This operation (${tool.description}) requires approval due to ${tool.riskLevel} risk level.`,
          riskLevel: tool.riskLevel,
        },
      };
    }

    const startTime = Date.now();

    try {
      let result: unknown;

      switch (name) {
        // READ tools
        case "explain_query":
          result = await this.explainQuery(params);
          break;
        case "get_slow_queries":
          result = await this.getSlowQueries(params);
          break;
        case "list_indexes":
          result = await this.listIndexes(params);
          break;
        case "get_connection_stats":
          result = await this.getConnectionStats(params);
          break;
        case "get_replication_status":
          result = await this.getReplicationStatus();
          break;
        case "get_table_stats":
          result = await this.getTableStats(params);
          break;
        case "get_locks":
          result = await this.getLocks(params);
          break;

        // OPTIMIZE tools
        case "create_index":
          result = await this.createIndex(params);
          break;
        case "drop_index":
          result = await this.dropIndex(params);
          break;
        case "vacuum_table":
          result = await this.vacuumTable(params);
          break;
        case "analyze_table":
          result = await this.analyzeTable(params);
          break;
        case "reindex_table":
          result = await this.reindexTable(params);
          break;

        // ADMIN tools
        case "kill_connection":
          result = await this.killConnection(params);
          break;
        case "create_user":
          result = await this.createUser(params);
          break;
        case "drop_user":
          result = await this.dropUser(params);
          break;
        case "grant_permission":
          result = await this.grantPermission(params);
          break;
        case "revoke_permission":
          result = await this.revokePermission(params);
          break;

        default:
          return {
            success: false,
            error: `Tool ${name} not implemented`,
            executionTimeMs: Date.now() - startTime,
          };
      }

      return {
        success: true,
        data: result,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  // -------------------------------------------------------------------------
  // READ TOOL IMPLEMENTATIONS
  // -------------------------------------------------------------------------

  private async explainQuery(params: Record<string, unknown>): Promise<unknown> {
    const query = params.query as string;
    const analyze = params.analyze !== false;
    const buffers = params.buffers !== false;
    const format = (params.format as string) || "text";

    const options = [
      analyze ? "ANALYZE" : null,
      buffers ? "BUFFERS" : null,
      `FORMAT ${format.toUpperCase()}`,
    ]
      .filter(Boolean)
      .join(", ");

    const explainQuery = `EXPLAIN (${options}) ${query}`;
    const result = await this.client!.query(explainQuery);

    if (format === "json") {
      return result.rows[0];
    }
    return result.rows.map((r) => Object.values(r)[0]).join("\n");
  }

  private async getSlowQueries(params: Record<string, unknown>): Promise<unknown> {
    const limit = (params.limit as number) || 10;
    const minCalls = (params.min_calls as number) || 1;
    const orderBy = (params.order_by as string) || "total_time";

    const orderColumn =
      orderBy === "mean_time" ? "mean_exec_time" : orderBy === "calls" ? "calls" : "total_exec_time";

    const query = `
      SELECT
        query,
        calls,
        round(total_exec_time::numeric, 2) as total_time_ms,
        round(mean_exec_time::numeric, 2) as mean_time_ms,
        round(stddev_exec_time::numeric, 2) as stddev_time_ms,
        rows,
        round((100 * total_exec_time / sum(total_exec_time) OVER ())::numeric, 2) as percent_total
      FROM pg_stat_statements
      WHERE calls >= $1
      ORDER BY ${orderColumn} DESC
      LIMIT $2
    `;

    try {
      const result = await this.client!.query(query, [minCalls, limit]);
      return result.rows;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("pg_stat_statements")
      ) {
        return {
          error: "pg_stat_statements extension not installed",
          hint: "Run: CREATE EXTENSION pg_stat_statements;",
        };
      }
      throw error;
    }
  }

  private async listIndexes(params: Record<string, unknown>): Promise<unknown> {
    const schema = (params.schema as string) || "public";
    const table = params.table as string | undefined;
    const unusedOnly = params.unused_only === true;

    let query = `
      SELECT
        schemaname,
        tablename,
        indexname,
        indexdef,
        pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
        idx_scan as index_scans,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched
      FROM pg_stat_user_indexes
      JOIN pg_indexes ON pg_stat_user_indexes.indexrelname = pg_indexes.indexname
        AND pg_stat_user_indexes.schemaname = pg_indexes.schemaname
      WHERE pg_stat_user_indexes.schemaname = $1
    `;

    const queryParams: unknown[] = [schema];

    if (table) {
      query += " AND tablename = $2";
      queryParams.push(table);
    }

    if (unusedOnly) {
      query += " AND idx_scan = 0";
    }

    query += " ORDER BY pg_relation_size(indexrelid) DESC";

    const result = await this.client!.query(query, queryParams);
    return result.rows;
  }

  private async getConnectionStats(params: Record<string, unknown>): Promise<unknown> {
    const includeIdle = params.include_idle !== false;

    const stateFilter = includeIdle ? "" : "AND state != 'idle'";

    const query = `
      SELECT
        pid,
        usename as username,
        application_name,
        client_addr,
        state,
        query,
        backend_start,
        state_change,
        wait_event_type,
        wait_event,
        EXTRACT(EPOCH FROM (NOW() - query_start))::integer as query_duration_seconds
      FROM pg_stat_activity
      WHERE pid != pg_backend_pid()
        AND datname = current_database()
        ${stateFilter}
      ORDER BY query_start DESC NULLS LAST
    `;

    const result = await this.client!.query(query);

    // Get connection counts by state
    const countsQuery = `
      SELECT state, COUNT(*) as count
      FROM pg_stat_activity
      WHERE datname = current_database()
      GROUP BY state
    `;
    const countsResult = await this.client!.query(countsQuery);

    // Get max connections
    const maxQuery = "SHOW max_connections";
    const maxResult = await this.client!.query<{ max_connections: string }>(maxQuery);

    return {
      connections: result.rows,
      summary: {
        by_state: countsResult.rows,
        max_connections: parseInt(maxResult.rows[0]?.max_connections || "0", 10),
        total_connections: result.rowCount,
      },
    };
  }

  private async getReplicationStatus(): Promise<unknown> {
    // Check if we're on primary
    const roleQuery = "SELECT pg_is_in_recovery() as is_replica";
    const roleResult = await this.client!.query<{ is_replica: boolean }>(roleQuery);
    const isReplica = roleResult.rows[0]?.is_replica;

    if (isReplica) {
      // We're on a replica, get replica status
      const replicaQuery = `
        SELECT
          pg_last_wal_receive_lsn() as receive_lsn,
          pg_last_wal_replay_lsn() as replay_lsn,
          pg_last_xact_replay_timestamp() as last_replay_timestamp,
          EXTRACT(EPOCH FROM (NOW() - pg_last_xact_replay_timestamp()))::integer as lag_seconds
      `;
      const replicaResult = await this.client!.query(replicaQuery);
      return {
        role: "replica",
        ...replicaResult.rows[0],
      };
    } else {
      // We're on primary, get replication slots and clients
      const slotsQuery = `
        SELECT
          slot_name,
          slot_type,
          active,
          restart_lsn,
          confirmed_flush_lsn
        FROM pg_replication_slots
      `;
      const slotsResult = await this.client!.query(slotsQuery);

      const clientsQuery = `
        SELECT
          client_addr,
          state,
          sent_lsn,
          write_lsn,
          flush_lsn,
          replay_lsn,
          sync_state
        FROM pg_stat_replication
      `;
      const clientsResult = await this.client!.query(clientsQuery);

      return {
        role: "primary",
        replication_slots: slotsResult.rows,
        replication_clients: clientsResult.rows,
      };
    }
  }

  private async getTableStats(params: Record<string, unknown>): Promise<unknown> {
    const schema = (params.schema as string) || "public";
    const table = params.table as string | undefined;

    let query = `
      SELECT
        schemaname,
        relname as table_name,
        n_live_tup as live_rows,
        n_dead_tup as dead_rows,
        n_tup_ins as inserts,
        n_tup_upd as updates,
        n_tup_del as deletes,
        last_vacuum,
        last_autovacuum,
        last_analyze,
        last_autoanalyze,
        pg_size_pretty(pg_total_relation_size(relid)) as total_size,
        pg_size_pretty(pg_relation_size(relid)) as table_size,
        pg_size_pretty(pg_indexes_size(relid)) as indexes_size
      FROM pg_stat_user_tables
      WHERE schemaname = $1
    `;

    const queryParams: unknown[] = [schema];

    if (table) {
      query += " AND relname = $2";
      queryParams.push(table);
    }

    query += " ORDER BY pg_total_relation_size(relid) DESC";

    const result = await this.client!.query(query, queryParams);
    return result.rows;
  }

  private async getLocks(params: Record<string, unknown>): Promise<unknown> {
    const blockedOnly = params.blocked_only === true;

    if (blockedOnly) {
      const query = `
        SELECT
          blocked_locks.pid AS blocked_pid,
          blocked_activity.usename AS blocked_user,
          blocking_locks.pid AS blocking_pid,
          blocking_activity.usename AS blocking_user,
          blocked_activity.query AS blocked_query,
          blocking_activity.query AS blocking_query,
          blocked_locks.locktype,
          blocked_locks.mode AS blocked_mode,
          blocking_locks.mode AS blocking_mode
        FROM pg_locks blocked_locks
        JOIN pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
        JOIN pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype
          AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
          AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
          AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
          AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
          AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
          AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
          AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
          AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
          AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
          AND blocking_locks.pid != blocked_locks.pid
        JOIN pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
        WHERE NOT blocked_locks.granted
      `;
      const result = await this.client!.query(query);
      return result.rows;
    } else {
      const query = `
        SELECT
          l.pid,
          a.usename,
          l.locktype,
          l.mode,
          l.granted,
          l.relation::regclass as relation,
          a.query,
          a.state
        FROM pg_locks l
        JOIN pg_stat_activity a ON a.pid = l.pid
        WHERE l.pid != pg_backend_pid()
        ORDER BY l.granted, l.pid
      `;
      const result = await this.client!.query(query);
      return result.rows;
    }
  }

  // -------------------------------------------------------------------------
  // OPTIMIZE TOOL IMPLEMENTATIONS
  // -------------------------------------------------------------------------

  private async createIndex(params: Record<string, unknown>): Promise<unknown> {
    const table = params.table as string;
    const columns = params.columns as string[];
    const unique = params.unique === true;
    const method = (params.method as string) || "btree";
    const whereClause = params.where as string | undefined;
    const concurrently = params.concurrently !== false;

    // Generate index name if not provided
    const indexName =
      (params.index_name as string) ||
      `idx_${table.replace(".", "_")}_${columns.join("_")}`;

    const uniqueClause = unique ? "UNIQUE" : "";
    const concurrentlyClause = concurrently ? "CONCURRENTLY" : "";
    const whereStatement = whereClause ? `WHERE ${whereClause}` : "";

    const query = `
      CREATE ${uniqueClause} INDEX ${concurrentlyClause} ${indexName}
      ON ${table} USING ${method} (${columns.join(", ")})
      ${whereStatement}
    `.trim();

    await this.client!.query(query);

    return {
      success: true,
      index_name: indexName,
      table,
      columns,
      method,
      unique,
      concurrent: concurrently,
    };
  }

  private async dropIndex(params: Record<string, unknown>): Promise<unknown> {
    const indexName = params.index_name as string;
    const concurrently = params.concurrently !== false;
    const ifExists = params.if_exists !== false;

    const concurrentlyClause = concurrently ? "CONCURRENTLY" : "";
    const ifExistsClause = ifExists ? "IF EXISTS" : "";

    const query = `DROP INDEX ${concurrentlyClause} ${ifExistsClause} ${indexName}`;
    await this.client!.query(query);

    return {
      success: true,
      dropped: indexName,
      concurrent: concurrently,
    };
  }

  private async vacuumTable(params: Record<string, unknown>): Promise<unknown> {
    const table = params.table as string;
    const full = params.full === true;
    const analyze = params.analyze !== false;

    const options = [full ? "FULL" : null, analyze ? "ANALYZE" : null]
      .filter(Boolean)
      .join(", ");

    const query = options ? `VACUUM (${options}) ${table}` : `VACUUM ${table}`;
    await this.client!.query(query);

    return {
      success: true,
      table,
      full,
      analyzed: analyze,
    };
  }

  private async analyzeTable(params: Record<string, unknown>): Promise<unknown> {
    const table = params.table as string | undefined;
    const query = table ? `ANALYZE ${table}` : "ANALYZE";
    await this.client!.query(query);

    return {
      success: true,
      table: table || "ALL TABLES",
    };
  }

  private async reindexTable(params: Record<string, unknown>): Promise<unknown> {
    const table = params.table as string;
    const concurrently = params.concurrently !== false;

    const concurrentlyClause = concurrently ? "CONCURRENTLY" : "";
    const query = `REINDEX TABLE ${concurrentlyClause} ${table}`;
    await this.client!.query(query);

    return {
      success: true,
      table,
      concurrent: concurrently,
    };
  }

  // -------------------------------------------------------------------------
  // ADMIN TOOL IMPLEMENTATIONS
  // -------------------------------------------------------------------------

  private async killConnection(params: Record<string, unknown>): Promise<unknown> {
    const pid = params.pid as number;
    const force = params.force === true;

    const func = force ? "pg_terminate_backend" : "pg_cancel_backend";
    const result = await this.client!.query<{ result: boolean }>(
      `SELECT ${func}($1) as result`,
      [pid]
    );

    return {
      success: result.rows[0]?.result ?? false,
      pid,
      action: force ? "terminated" : "cancelled",
    };
  }

  private async createUser(params: Record<string, unknown>): Promise<unknown> {
    const username = params.username as string;
    const password = params.password as string;
    const login = params.login !== false;
    const createdb = params.createdb === true;
    const superuser = params.superuser === true;

    // Build options
    const options = [
      login ? "LOGIN" : "NOLOGIN",
      createdb ? "CREATEDB" : "NOCREATEDB",
      superuser ? "SUPERUSER" : "NOSUPERUSER",
      `PASSWORD '${password.replace(/'/g, "''")}'`,
    ].join(" ");

    const query = `CREATE ROLE ${username} WITH ${options}`;
    await this.client!.query(query);

    return {
      success: true,
      username,
      login,
      createdb,
      superuser,
    };
  }

  private async dropUser(params: Record<string, unknown>): Promise<unknown> {
    const username = params.username as string;
    const ifExists = params.if_exists !== false;

    const ifExistsClause = ifExists ? "IF EXISTS" : "";
    const query = `DROP ROLE ${ifExistsClause} ${username}`;
    await this.client!.query(query);

    return {
      success: true,
      dropped: username,
    };
  }

  private async grantPermission(params: Record<string, unknown>): Promise<unknown> {
    const permission = params.permission as string;
    const onType = params.on_type as string;
    const onName = params.on_name as string;
    const toUser = params.to_user as string;
    const withGrantOption = params.with_grant_option === true;

    const grantOptionClause = withGrantOption ? "WITH GRANT OPTION" : "";
    const query = `GRANT ${permission} ON ${onType} ${onName} TO ${toUser} ${grantOptionClause}`;
    await this.client!.query(query);

    return {
      success: true,
      permission,
      on: `${onType} ${onName}`,
      to: toUser,
      with_grant_option: withGrantOption,
    };
  }

  private async revokePermission(params: Record<string, unknown>): Promise<unknown> {
    const permission = params.permission as string;
    const onType = params.on_type as string;
    const onName = params.on_name as string;
    const fromUser = params.from_user as string;

    const query = `REVOKE ${permission} ON ${onType} ${onName} FROM ${fromUser}`;
    await this.client!.query(query);

    return {
      success: true,
      permission,
      on: `${onType} ${onName}`,
      from: fromUser,
    };
  }
}

// Export singleton factory
export function createPostgreSQLPlugin(): PostgreSQLPlugin {
  return new PostgreSQLPlugin();
}
