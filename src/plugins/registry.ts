/**
 * Plugin Registry
 * Manages plugin lifecycle, discovery, and instance management.
 */

import { EventEmitter } from "events";
import type {
  Plugin,
  PluginConfig,
  PluginHealth,
  PluginMetadata,
  AgentPluginInstance,
  PluginEvent,
  PluginEventType,
  ToolResult,
  ToolContext,
  PluginTool,
  RiskLevel,
} from "./types.js";
import { generateId } from "./types.js";

// ============================================================================
// PLUGIN REGISTRY CLASS
// ============================================================================

export class PluginRegistry extends EventEmitter {
  private plugins: Map<string, Plugin> = new Map();
  private instances: Map<string, Plugin> = new Map(); // instanceId -> initialized plugin
  private instanceMetadata: Map<string, AgentPluginInstance> = new Map();
  private healthCheckIntervals: Map<string, NodeJS.Timeout> = new Map();
  private healthCheckIntervalMs: number;

  constructor(healthCheckIntervalMs: number = 60000) {
    super();
    this.healthCheckIntervalMs = healthCheckIntervalMs;
  }

  // ============================================================================
  // PLUGIN REGISTRATION
  // ============================================================================

  /**
   * Register a plugin type (e.g., PostgreSQL, MongoDB)
   * This makes the plugin available for creating instances
   */
  registerPlugin(plugin: Plugin): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin ${plugin.id} is already registered`);
    }

    this.plugins.set(plugin.id, plugin);
    console.log(`[PluginRegistry] Registered plugin: ${plugin.name} (${plugin.id})`);
  }

  /**
   * Unregister a plugin type
   * All instances must be removed first
   */
  unregisterPlugin(pluginId: string): void {
    // Check for active instances
    for (const [instanceId, metadata] of this.instanceMetadata) {
      if (metadata.pluginId === pluginId) {
        throw new Error(
          `Cannot unregister plugin ${pluginId}: active instance ${instanceId} exists`
        );
      }
    }

    this.plugins.delete(pluginId);
    console.log(`[PluginRegistry] Unregistered plugin: ${pluginId}`);
  }

  /**
   * Get a registered plugin by ID
   */
  getPlugin(pluginId: string): Plugin | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Get all registered plugins
   */
  getRegisteredPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get plugin metadata for storage/API
   */
  getPluginMetadata(pluginId: string): PluginMetadata | undefined {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return undefined;

    const tools = plugin.getTools();
    const riskLevels: Record<string, RiskLevel> = {};
    for (const tool of tools) {
      riskLevels[tool.name] = tool.riskLevel;
    }

    return {
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      type: plugin.type,
      description: plugin.description,
      capabilities: plugin.getCapabilities().map((c) => c.name),
      tools,
      riskLevels,
      createdAt: Date.now(),
    };
  }

  /**
   * Get all plugin metadata
   */
  getAllPluginMetadata(): PluginMetadata[] {
    return Array.from(this.plugins.keys())
      .map((id) => this.getPluginMetadata(id))
      .filter((m): m is PluginMetadata => m !== undefined);
  }

  // ============================================================================
  // PLUGIN INSTANCE MANAGEMENT
  // ============================================================================

  /**
   * Create and initialize a plugin instance for a specific server
   */
  async createInstance(
    pluginId: string,
    serverId: string,
    config: PluginConfig
  ): Promise<AgentPluginInstance> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    // Validate configuration
    const validation = plugin.validateConfig(config);
    if (!validation.valid) {
      throw new Error(
        `Invalid plugin configuration: ${validation.errors?.join(", ")}`
      );
    }

    // Create instance ID
    const instanceId = generateId("inst");

    // Create a new instance (clone the plugin class)
    const PluginClass = plugin.constructor as new () => Plugin;
    const instance = new PluginClass();

    // Initialize the instance
    try {
      await instance.initialize(config);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to initialize plugin: ${errorMessage}`);
    }

    // Store instance
    this.instances.set(instanceId, instance);

    // Create metadata
    const metadata: AgentPluginInstance = {
      id: instanceId,
      serverId,
      pluginId,
      config, // Note: should be encrypted before storage
      status: "active",
      healthStatus: "unknown",
      enabled: true,
      createdAt: Date.now(),
    };
    this.instanceMetadata.set(instanceId, metadata);

    // Start health checks
    this.startHealthCheck(instanceId);

    // Emit event
    this.emitPluginEvent("plugin:initialized", pluginId, serverId, {
      instanceId,
    });

    console.log(
      `[PluginRegistry] Created instance ${instanceId} for plugin ${pluginId} on server ${serverId}`
    );

    return metadata;
  }

  /**
   * Get a plugin instance by ID
   */
  getInstance(instanceId: string): Plugin | undefined {
    return this.instances.get(instanceId);
  }

  /**
   * Get instance metadata
   */
  getInstanceMetadata(instanceId: string): AgentPluginInstance | undefined {
    return this.instanceMetadata.get(instanceId);
  }

  /**
   * Get all instances for a server
   */
  getServerInstances(serverId: string): AgentPluginInstance[] {
    return Array.from(this.instanceMetadata.values()).filter(
      (m) => m.serverId === serverId
    );
  }

  /**
   * Get all instances for a plugin type
   */
  getPluginInstances(pluginId: string): AgentPluginInstance[] {
    return Array.from(this.instanceMetadata.values()).filter(
      (m) => m.pluginId === pluginId
    );
  }

  /**
   * Enable/disable an instance
   */
  async setInstanceEnabled(instanceId: string, enabled: boolean): Promise<void> {
    const metadata = this.instanceMetadata.get(instanceId);
    if (!metadata) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    metadata.enabled = enabled;
    metadata.updatedAt = Date.now();

    if (enabled) {
      this.startHealthCheck(instanceId);
    } else {
      this.stopHealthCheck(instanceId);
    }

    console.log(
      `[PluginRegistry] Instance ${instanceId} ${enabled ? "enabled" : "disabled"}`
    );
  }

  /**
   * Remove a plugin instance
   */
  async removeInstance(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    const metadata = this.instanceMetadata.get(instanceId);

    if (!instance || !metadata) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    // Stop health checks
    this.stopHealthCheck(instanceId);

    // Shutdown instance
    try {
      await instance.shutdown();
    } catch (error) {
      console.error(
        `[PluginRegistry] Error shutting down instance ${instanceId}:`,
        error
      );
    }

    // Remove from maps
    this.instances.delete(instanceId);
    this.instanceMetadata.delete(instanceId);

    // Emit event
    this.emitPluginEvent("plugin:shutdown", metadata.pluginId, metadata.serverId, {
      instanceId,
    });

    console.log(`[PluginRegistry] Removed instance ${instanceId}`);
  }

  // ============================================================================
  // HEALTH CHECKS
  // ============================================================================

  private startHealthCheck(instanceId: string): void {
    // Clear existing interval if any
    this.stopHealthCheck(instanceId);

    // Immediate check
    this.checkInstanceHealth(instanceId);

    // Schedule periodic checks
    const interval = setInterval(() => {
      this.checkInstanceHealth(instanceId);
    }, this.healthCheckIntervalMs);

    this.healthCheckIntervals.set(instanceId, interval);
  }

  private stopHealthCheck(instanceId: string): void {
    const interval = this.healthCheckIntervals.get(instanceId);
    if (interval) {
      clearInterval(interval);
      this.healthCheckIntervals.delete(instanceId);
    }
  }

  private async checkInstanceHealth(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    const metadata = this.instanceMetadata.get(instanceId);

    if (!instance || !metadata || !metadata.enabled) {
      return;
    }

    try {
      const health = await instance.checkHealth();
      const previousStatus = metadata.healthStatus;

      metadata.healthStatus = health.status;
      metadata.healthMessage = health.message;
      metadata.lastHealthCheck = health.lastChecked;
      metadata.status = health.status === "healthy" ? "active" : "error";

      // Emit event if status changed
      if (previousStatus !== health.status) {
        this.emitPluginEvent(
          "plugin:health_changed",
          metadata.pluginId,
          metadata.serverId,
          {
            instanceId,
            previousStatus,
            currentStatus: health.status,
            message: health.message,
          }
        );
      }
    } catch (error) {
      metadata.healthStatus = "unhealthy";
      metadata.healthMessage =
        error instanceof Error ? error.message : "Health check failed";
      metadata.status = "error";
      metadata.lastHealthCheck = Date.now();
    }
  }

  /**
   * Get health status for an instance
   */
  async getInstanceHealth(instanceId: string): Promise<PluginHealth> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    return instance.checkHealth();
  }

  // ============================================================================
  // TOOL EXECUTION
  // ============================================================================

  /**
   * Execute a tool on a plugin instance
   */
  async executeTool(
    instanceId: string,
    toolName: string,
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const instance = this.instances.get(instanceId);
    const metadata = this.instanceMetadata.get(instanceId);

    if (!instance || !metadata) {
      return {
        success: false,
        error: `Instance ${instanceId} not found`,
        executionTimeMs: 0,
      };
    }

    if (!metadata.enabled) {
      return {
        success: false,
        error: `Instance ${instanceId} is disabled`,
        executionTimeMs: 0,
      };
    }

    if (metadata.status === "error") {
      return {
        success: false,
        error: `Instance ${instanceId} is in error state: ${metadata.healthMessage}`,
        executionTimeMs: 0,
      };
    }

    // Validate parameters
    const validation = instance.validateToolParams(toolName, params);
    if (!validation.valid) {
      return {
        success: false,
        error: `Invalid parameters: ${validation.errors?.join(", ")}`,
        executionTimeMs: 0,
      };
    }

    // Execute tool
    const startTime = Date.now();
    try {
      const result = await instance.executeTool(toolName, params, context);

      // Emit event
      this.emitPluginEvent(
        "plugin:tool_executed",
        metadata.pluginId,
        metadata.serverId,
        {
          instanceId,
          toolName,
          success: result.success,
          executionTimeMs: result.executionTimeMs,
        }
      );

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const executionTimeMs = Date.now() - startTime;

      // Emit error event
      this.emitPluginEvent("plugin:error", metadata.pluginId, metadata.serverId, {
        instanceId,
        toolName,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
        executionTimeMs,
      };
    }
  }

  /**
   * Get available tools for an instance
   */
  getInstanceTools(instanceId: string): PluginTool[] {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return [];
    }
    return instance.getTools();
  }

  /**
   * Get a specific tool from an instance
   */
  getInstanceTool(instanceId: string, toolName: string): PluginTool | undefined {
    const tools = this.getInstanceTools(instanceId);
    return tools.find((t) => t.name === toolName);
  }

  // ============================================================================
  // EVENT HELPERS
  // ============================================================================

  private emitPluginEvent(
    type: PluginEventType,
    pluginId: string,
    serverId: string,
    data?: Record<string, unknown>
  ): void {
    const event: PluginEvent = {
      type,
      pluginId,
      serverId,
      timestamp: Date.now(),
      data,
    };
    this.emit(type, event);
    this.emit("plugin:event", event);
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Shutdown all instances and cleanup
   */
  async shutdown(): Promise<void> {
    console.log("[PluginRegistry] Shutting down all instances...");

    // Stop all health checks
    for (const instanceId of this.healthCheckIntervals.keys()) {
      this.stopHealthCheck(instanceId);
    }

    // Shutdown all instances
    const shutdownPromises: Promise<void>[] = [];
    for (const [instanceId, instance] of this.instances) {
      shutdownPromises.push(
        instance.shutdown().catch((error) => {
          console.error(
            `[PluginRegistry] Error shutting down instance ${instanceId}:`,
            error
          );
        })
      );
    }

    await Promise.all(shutdownPromises);

    // Clear maps
    this.instances.clear();
    this.instanceMetadata.clear();

    console.log("[PluginRegistry] All instances shut down");
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let registryInstance: PluginRegistry | null = null;

export function getPluginRegistry(): PluginRegistry {
  if (!registryInstance) {
    registryInstance = new PluginRegistry();
  }
  return registryInstance;
}

export function resetPluginRegistry(): void {
  if (registryInstance) {
    registryInstance.shutdown().catch(console.error);
    registryInstance = null;
  }
}
