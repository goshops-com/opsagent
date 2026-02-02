/**
 * Plugin System Exports
 * Central export point for all plugin-related functionality.
 */

// Types
export * from "./types.js";

// Registry
export { PluginRegistry, getPluginRegistry, resetPluginRegistry } from "./registry.js";

// Credentials
export {
  initializeEncryption,
  generateEncryptionKey,
  isEncryptionInitialized,
  encrypt,
  decrypt,
  encryptCredentials,
  decryptCredentials,
  encryptConfig,
  decryptConfig,
  getMaskedCredentials,
  getSafeConfigForLogging,
  validateCredentials,
  areCredentialsEncrypted,
  parseConnectionString,
  buildConnectionString,
} from "./credentials.js";

// Plugin implementations
export { PostgreSQLPlugin, createPostgreSQLPlugin } from "./postgresql/index.js";
export { MongoDBPlugin, createMongoDBPlugin } from "./mongodb/index.js";
