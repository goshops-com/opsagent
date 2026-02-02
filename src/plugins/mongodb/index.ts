/**
 * MongoDB Plugin
 * Provides DBA capabilities for MongoDB databases including:
 * - Read: Query analysis, profiler data, index inspection, collection stats
 * - Optimize: Index management, compaction
 * - Admin: Operation management, profiling, user management
 */

import type {
  Plugin,
  PluginConfig,
  PluginHealth,
  PluginCapability,
  PluginTool,
  ToolContext,
  ToolResult,
} from "../types.js";
import { toolRequiresApproval } from "../types.js";

// ============================================================================
// MONGODB CLIENT INTERFACE
// ============================================================================

interface MongoDBClient {
  db(name?: string): MongoDBDatabase;
  close(): Promise<void>;
}

interface MongoDBDatabase {
  command(command: Record<string, unknown>): Promise<Record<string, unknown>>;
  collection(name: string): MongoDBCollection;
  listCollections(): { toArray(): Promise<Array<{ name: string; type: string }>> };
  admin(): MongoDBAdmin;
}

interface MongoDBCollection {
  find(query?: Record<string, unknown>): {
    limit(n: number): { toArray(): Promise<unknown[]> };
    toArray(): Promise<unknown[]>;
  };
  aggregate(pipeline: Record<string, unknown>[]): { toArray(): Promise<unknown[]> };
  stats(): Promise<Record<string, unknown>>;
  indexes(): Promise<unknown[]>;
  createIndex(
    keys: Record<string, number>,
    options?: Record<string, unknown>
  ): Promise<string>;
  dropIndex(name: string): Promise<void>;
}

interface MongoDBAdmin {
  serverStatus(): Promise<Record<string, unknown>>;
  listDatabases(): Promise<{ databases: Array<{ name: string; sizeOnDisk: number }> }>;
}

// Dynamic import for mongodb module - types are declared inline to avoid compile-time dependency
let mongoModule: any = null;
const MONGO_MODULE_NAME = "mongodb";

async function getMongoModule(): Promise<any> {
  if (!mongoModule) {
    try {
      // Use variable to prevent TypeScript from checking the module at compile time
      mongoModule = await import(/* webpackIgnore: true */ MONGO_MODULE_NAME);
    } catch {
      throw new Error("MongoDB client library (mongodb) is not installed. Run: npm install mongodb");
    }
  }
  return mongoModule;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

const MONGODB_TOOLS: PluginTool[] = [
  // -------------------------------------------------------------------------
  // READ TOOLS (Low Risk)
  // -------------------------------------------------------------------------
  {
    name: "explain_query",
    description:
      "Analyze a MongoDB query execution plan using explain(). Shows how MongoDB will execute the query.",
    parameters: [
      {
        name: "collection",
        type: "string",
        description: "Collection name to query",
        required: true,
      },
      {
        name: "query",
        type: "object",
        description: "Query filter object",
        required: true,
      },
      {
        name: "verbosity",
        type: "string",
        description: "Verbosity level: queryPlanner, executionStats, allPlansExecution",
        required: false,
        default: "executionStats",
        enum: ["queryPlanner", "executionStats", "allPlansExecution"],
      },
    ],
    riskLevel: "low",
    requiresApproval: false,
    category: "read",
    examples: [
      {
        description: "Analyze a find query",
        params: { collection: "users", query: { email: "test@example.com" } },
      },
    ],
  },
  {
    name: "get_profiler_data",
    description:
      "Get slow query data from the system.profile collection. Requires profiling to be enabled.",
    parameters: [
      {
        name: "limit",
        type: "number",
        description: "Maximum number of entries to return (default: 10)",
        required: false,
        default: 10,
      },
      {
        name: "min_ms",
        type: "number",
        description: "Minimum execution time in milliseconds (default: 100)",
        required: false,
        default: 100,
      },
      {
        name: "collection_filter",
        type: "string",
        description: "Filter by collection name (optional)",
        required: false,
      },
    ],
    riskLevel: "low",
    requiresApproval: false,
    category: "read",
  },
  {
    name: "list_indexes",
    description: "List all indexes for a collection with their stats.",
    parameters: [
      {
        name: "collection",
        type: "string",
        description: "Collection name",
        required: true,
      },
    ],
    riskLevel: "low",
    requiresApproval: false,
    category: "read",
  },
  {
    name: "get_collection_stats",
    description: "Get detailed statistics for a collection including size, count, and index info.",
    parameters: [
      {
        name: "collection",
        type: "string",
        description: "Collection name",
        required: true,
      },
    ],
    riskLevel: "low",
    requiresApproval: false,
    category: "read",
  },
  {
    name: "get_current_ops",
    description: "Get currently running operations on the MongoDB server.",
    parameters: [
      {
        name: "all",
        type: "boolean",
        description: "Include idle connections (default: false)",
        required: false,
        default: false,
      },
      {
        name: "slow_only",
        type: "boolean",
        description: "Only show operations running longer than 1 second (default: false)",
        required: false,
        default: false,
      },
    ],
    riskLevel: "low",
    requiresApproval: false,
    category: "read",
  },
  {
    name: "get_server_status",
    description: "Get comprehensive server status information.",
    parameters: [],
    riskLevel: "low",
    requiresApproval: false,
    category: "read",
  },
  {
    name: "get_repl_status",
    description: "Get replica set status and member information.",
    parameters: [],
    riskLevel: "low",
    requiresApproval: false,
    category: "read",
  },
  {
    name: "list_collections",
    description: "List all collections in the database with their info.",
    parameters: [],
    riskLevel: "low",
    requiresApproval: false,
    category: "read",
  },
  {
    name: "get_database_stats",
    description: "Get database-level statistics including size and collections count.",
    parameters: [],
    riskLevel: "low",
    requiresApproval: false,
    category: "read",
  },

  // -------------------------------------------------------------------------
  // OPTIMIZE TOOLS (Medium Risk - Requires Approval)
  // -------------------------------------------------------------------------
  {
    name: "create_index",
    description: "Create a new index on a collection.",
    parameters: [
      {
        name: "collection",
        type: "string",
        description: "Collection name",
        required: true,
      },
      {
        name: "keys",
        type: "object",
        description: "Index key specification (e.g., {field: 1} for ascending)",
        required: true,
      },
      {
        name: "options",
        type: "object",
        description: "Index options (name, unique, sparse, expireAfterSeconds, etc.)",
        required: false,
      },
      {
        name: "background",
        type: "boolean",
        description: "Build index in background (default: true)",
        required: false,
        default: true,
      },
    ],
    riskLevel: "medium",
    requiresApproval: true,
    category: "optimize",
    examples: [
      {
        description: "Create index on email field",
        params: { collection: "users", keys: { email: 1 }, options: { unique: true } },
      },
      {
        description: "Create compound index",
        params: { collection: "orders", keys: { userId: 1, createdAt: -1 } },
      },
    ],
  },
  {
    name: "drop_index",
    description: "Drop an existing index from a collection.",
    parameters: [
      {
        name: "collection",
        type: "string",
        description: "Collection name",
        required: true,
      },
      {
        name: "index_name",
        type: "string",
        description: "Name of the index to drop",
        required: true,
      },
    ],
    riskLevel: "high",
    requiresApproval: true,
    category: "optimize",
  },
  {
    name: "compact_collection",
    description:
      "Compact a collection to reclaim disk space and defragment. Blocks operations on the collection.",
    parameters: [
      {
        name: "collection",
        type: "string",
        description: "Collection name to compact",
        required: true,
      },
    ],
    riskLevel: "high",
    requiresApproval: true,
    category: "optimize",
  },
  {
    name: "reindex_collection",
    description: "Rebuild all indexes on a collection. Blocks read/write operations.",
    parameters: [
      {
        name: "collection",
        type: "string",
        description: "Collection name to reindex",
        required: true,
      },
    ],
    riskLevel: "high",
    requiresApproval: true,
    category: "optimize",
  },

  // -------------------------------------------------------------------------
  // ADMIN TOOLS (High/Critical Risk - Requires Approval)
  // -------------------------------------------------------------------------
  {
    name: "kill_operation",
    description: "Kill a running operation by its opId.",
    parameters: [
      {
        name: "op_id",
        type: "number",
        description: "Operation ID to kill",
        required: true,
      },
    ],
    riskLevel: "high",
    requiresApproval: true,
    category: "admin",
  },
  {
    name: "set_profiling_level",
    description: "Set the database profiling level to capture slow queries.",
    parameters: [
      {
        name: "level",
        type: "number",
        description: "Profiling level: 0 (off), 1 (slow ops), 2 (all ops)",
        required: true,
        enum: ["0", "1", "2"],
      },
      {
        name: "slow_ms",
        type: "number",
        description: "Slow operation threshold in milliseconds (default: 100)",
        required: false,
        default: 100,
      },
    ],
    riskLevel: "medium",
    requiresApproval: true,
    category: "admin",
  },
  {
    name: "create_user",
    description: "Create a new database user.",
    parameters: [
      {
        name: "username",
        type: "string",
        description: "Username for the new user",
        required: true,
      },
      {
        name: "password",
        type: "string",
        description: "Password for the new user",
        required: true,
      },
      {
        name: "roles",
        type: "array",
        description: "Array of role objects (e.g., [{role: 'readWrite', db: 'mydb'}])",
        required: true,
      },
    ],
    riskLevel: "high",
    requiresApproval: true,
    category: "admin",
  },
  {
    name: "drop_user",
    description: "Drop a database user.",
    parameters: [
      {
        name: "username",
        type: "string",
        description: "Username to drop",
        required: true,
      },
    ],
    riskLevel: "critical",
    requiresApproval: true,
    category: "admin",
  },
  {
    name: "grant_roles",
    description: "Grant roles to an existing user.",
    parameters: [
      {
        name: "username",
        type: "string",
        description: "Username to grant roles to",
        required: true,
      },
      {
        name: "roles",
        type: "array",
        description: "Array of role objects to grant",
        required: true,
      },
    ],
    riskLevel: "high",
    requiresApproval: true,
    category: "admin",
  },
  {
    name: "revoke_roles",
    description: "Revoke roles from an existing user.",
    parameters: [
      {
        name: "username",
        type: "string",
        description: "Username to revoke roles from",
        required: true,
      },
      {
        name: "roles",
        type: "array",
        description: "Array of role objects to revoke",
        required: true,
      },
    ],
    riskLevel: "high",
    requiresApproval: true,
    category: "admin",
  },
];

// ============================================================================
// MONGODB PLUGIN CLASS
// ============================================================================

export class MongoDBPlugin implements Plugin {
  id = "mongodb";
  name = "MongoDB";
  version = "1.0.0";
  type = "mongodb";
  description = "MongoDB database management and DBA tools";

  private client: MongoDBClient | null = null;
  private db: MongoDBDatabase | null = null;
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
    const mongo = await getMongoModule();
    const { MongoClient } = mongo;

    const { credentials, options } = config;

    let connectionString: string;
    if (credentials.connectionString) {
      connectionString = credentials.connectionString;
    } else {
      connectionString = this.buildConnectionString(credentials);
    }

    const client = new MongoClient(connectionString, {
      connectTimeoutMS: options?.connectionTimeout ?? 10000,
      serverSelectionTimeoutMS: options?.connectionTimeout ?? 10000,
      maxPoolSize: options?.maxConnections ?? 5,
    });

    await client.connect();

    this.client = client as unknown as MongoDBClient;
    this.db = client.db(credentials.database) as unknown as MongoDBDatabase;
    this.config = config;
    this.connectionInfo = {
      host: credentials.host,
      port: credentials.port,
      database: credentials.database,
    };

    // Get server version
    try {
      const serverStatus = await this.db.command({ serverStatus: 1 });
      this.connectionInfo.version = serverStatus.version as string;
    } catch {
      // Version info not critical
    }

    console.log(
      `[MongoDB] Connected to ${this.connectionInfo.host}:${this.connectionInfo.port}/${this.connectionInfo.database} (v${this.connectionInfo.version || "unknown"})`
    );
  }

  private buildConnectionString(credentials: PluginConfig["credentials"]): string {
    const auth =
      credentials.username && credentials.password
        ? `${encodeURIComponent(credentials.username)}:${encodeURIComponent(credentials.password)}@`
        : "";

    const host = credentials.host;
    const port = credentials.port || 27017;
    const database = credentials.database || "admin";
    const options = credentials.ssl ? "?ssl=true" : "";

    return `mongodb://${auth}${host}:${port}/${database}${options}`;
  }

  async shutdown(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
    }
    console.log("[MongoDB] Connection closed");
  }

  async checkHealth(): Promise<PluginHealth> {
    if (!this.client || !this.db) {
      return {
        status: "unhealthy",
        message: "Not connected",
        lastChecked: Date.now(),
      };
    }

    try {
      await this.db.command({ ping: 1 });
      return {
        status: "healthy",
        message: "Connected",
        lastChecked: Date.now(),
        connectionInfo: this.connectionInfo,
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
      { name: "profiling", description: "Query profiling and slow query analysis", enabled: true },
      { name: "user_management", description: "Create and manage database users", enabled: true },
      { name: "maintenance", description: "Compact and reindex operations", enabled: true },
      { name: "replication", description: "Monitor replica set status", enabled: true },
    ];
  }

  getTools(): PluginTool[] {
    return MONGODB_TOOLS;
  }

  // -------------------------------------------------------------------------
  // VALIDATION
  // -------------------------------------------------------------------------

  validateConfig(config: PluginConfig): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const { credentials } = config;

    if (!credentials.connectionString) {
      if (!credentials.host) errors.push("host is required");
    }

    return { valid: errors.length === 0, errors };
  }

  validateToolParams(
    toolName: string,
    params: Record<string, unknown>
  ): { valid: boolean; errors?: string[] } {
    const tool = MONGODB_TOOLS.find((t) => t.name === toolName);
    if (!tool) {
      return { valid: false, errors: [`Unknown tool: ${toolName}`] };
    }

    const errors: string[] = [];
    for (const param of tool.parameters) {
      if (param.required && !(param.name in params)) {
        errors.push(`Missing required parameter: ${param.name}`);
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
    if (!this.client || !this.db) {
      return {
        success: false,
        error: "Not connected to database",
        executionTimeMs: 0,
      };
    }

    const tool = MONGODB_TOOLS.find((t) => t.name === name);
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
        case "get_profiler_data":
          result = await this.getProfilerData(params);
          break;
        case "list_indexes":
          result = await this.listIndexes(params);
          break;
        case "get_collection_stats":
          result = await this.getCollectionStats(params);
          break;
        case "get_current_ops":
          result = await this.getCurrentOps(params);
          break;
        case "get_server_status":
          result = await this.getServerStatus();
          break;
        case "get_repl_status":
          result = await this.getReplStatus();
          break;
        case "list_collections":
          result = await this.listCollections();
          break;
        case "get_database_stats":
          result = await this.getDatabaseStats();
          break;

        // OPTIMIZE tools
        case "create_index":
          result = await this.createIndex(params);
          break;
        case "drop_index":
          result = await this.dropIndex(params);
          break;
        case "compact_collection":
          result = await this.compactCollection(params);
          break;
        case "reindex_collection":
          result = await this.reindexCollection(params);
          break;

        // ADMIN tools
        case "kill_operation":
          result = await this.killOperation(params);
          break;
        case "set_profiling_level":
          result = await this.setProfilingLevel(params);
          break;
        case "create_user":
          result = await this.createUser(params);
          break;
        case "drop_user":
          result = await this.dropUser(params);
          break;
        case "grant_roles":
          result = await this.grantRoles(params);
          break;
        case "revoke_roles":
          result = await this.revokeRoles(params);
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
    const collection = params.collection as string;
    const query = params.query as Record<string, unknown>;
    const verbosity = (params.verbosity as string) || "executionStats";

    const result = await this.db!.command({
      explain: {
        find: collection,
        filter: query,
      },
      verbosity,
    });

    return result;
  }

  private async getProfilerData(params: Record<string, unknown>): Promise<unknown> {
    const limit = (params.limit as number) || 10;
    const minMs = (params.min_ms as number) || 100;
    const collectionFilter = params.collection_filter as string | undefined;

    const query: Record<string, unknown> = {
      millis: { $gte: minMs },
    };

    if (collectionFilter) {
      query.ns = { $regex: collectionFilter };
    }

    const profileCollection = this.db!.collection("system.profile");
    const results = await profileCollection
      .find(query)
      .limit(limit)
      .toArray();

    return results;
  }

  private async listIndexes(params: Record<string, unknown>): Promise<unknown> {
    const collection = params.collection as string;
    const indexes = await this.db!.collection(collection).indexes();
    return indexes;
  }

  private async getCollectionStats(params: Record<string, unknown>): Promise<unknown> {
    const collection = params.collection as string;
    const stats = await this.db!.command({ collStats: collection });
    return stats;
  }

  private async getCurrentOps(params: Record<string, unknown>): Promise<unknown> {
    const all = params.all === true;
    const slowOnly = params.slow_only === true;

    const query: Record<string, unknown> = {};
    if (!all) {
      query.active = true;
    }
    if (slowOnly) {
      query.secs_running = { $gte: 1 };
    }

    const result = await this.db!.command({
      currentOp: 1,
      ...query,
    });

    return result;
  }

  private async getServerStatus(): Promise<unknown> {
    const result = await this.db!.command({ serverStatus: 1 });
    return result;
  }

  private async getReplStatus(): Promise<unknown> {
    try {
      const result = await this.db!.command({ replSetGetStatus: 1 });
      return result;
    } catch (error) {
      if (error instanceof Error && error.message.includes("not running with --replSet")) {
        return { message: "Not a replica set member" };
      }
      throw error;
    }
  }

  private async listCollections(): Promise<unknown> {
    const collections = await this.db!.listCollections().toArray();
    return collections;
  }

  private async getDatabaseStats(): Promise<unknown> {
    const result = await this.db!.command({ dbStats: 1, scale: 1024 * 1024 }); // Scale to MB
    return result;
  }

  // -------------------------------------------------------------------------
  // OPTIMIZE TOOL IMPLEMENTATIONS
  // -------------------------------------------------------------------------

  private async createIndex(params: Record<string, unknown>): Promise<unknown> {
    const collection = params.collection as string;
    const keys = params.keys as Record<string, number>;
    const options = (params.options as Record<string, unknown>) || {};
    const background = params.background !== false;

    if (background) {
      options.background = true;
    }

    const indexName = await this.db!.collection(collection).createIndex(keys, options);

    return {
      success: true,
      indexName,
      collection,
      keys,
      options,
    };
  }

  private async dropIndex(params: Record<string, unknown>): Promise<unknown> {
    const collection = params.collection as string;
    const indexName = params.index_name as string;

    await this.db!.collection(collection).dropIndex(indexName);

    return {
      success: true,
      dropped: indexName,
      collection,
    };
  }

  private async compactCollection(params: Record<string, unknown>): Promise<unknown> {
    const collection = params.collection as string;
    const result = await this.db!.command({ compact: collection });
    return result;
  }

  private async reindexCollection(params: Record<string, unknown>): Promise<unknown> {
    const collection = params.collection as string;
    const result = await this.db!.command({ reIndex: collection });
    return result;
  }

  // -------------------------------------------------------------------------
  // ADMIN TOOL IMPLEMENTATIONS
  // -------------------------------------------------------------------------

  private async killOperation(params: Record<string, unknown>): Promise<unknown> {
    const opId = params.op_id as number;
    const result = await this.db!.command({ killOp: 1, op: opId });
    return result;
  }

  private async setProfilingLevel(params: Record<string, unknown>): Promise<unknown> {
    const level = params.level as number;
    const slowMs = (params.slow_ms as number) || 100;

    const result = await this.db!.command({
      profile: level,
      slowms: slowMs,
    });

    return {
      success: true,
      level,
      slowMs,
      previousLevel: result.was,
    };
  }

  private async createUser(params: Record<string, unknown>): Promise<unknown> {
    const username = params.username as string;
    const password = params.password as string;
    const roles = params.roles as Array<{ role: string; db: string }>;

    const result = await this.db!.command({
      createUser: username,
      pwd: password,
      roles,
    });

    return {
      success: true,
      username,
      roles,
    };
  }

  private async dropUser(params: Record<string, unknown>): Promise<unknown> {
    const username = params.username as string;
    const result = await this.db!.command({ dropUser: username });
    return {
      success: true,
      dropped: username,
    };
  }

  private async grantRoles(params: Record<string, unknown>): Promise<unknown> {
    const username = params.username as string;
    const roles = params.roles as Array<{ role: string; db: string }>;

    const result = await this.db!.command({
      grantRolesToUser: username,
      roles,
    });

    return {
      success: true,
      username,
      grantedRoles: roles,
    };
  }

  private async revokeRoles(params: Record<string, unknown>): Promise<unknown> {
    const username = params.username as string;
    const roles = params.roles as Array<{ role: string; db: string }>;

    const result = await this.db!.command({
      revokeRolesFromUser: username,
      roles,
    });

    return {
      success: true,
      username,
      revokedRoles: roles,
    };
  }
}

// Export singleton factory
export function createMongoDBPlugin(): MongoDBPlugin {
  return new MongoDBPlugin();
}
