/**
 * Credential Management
 * Handles encrypted storage and retrieval of plugin credentials.
 * Uses AES-256-GCM for encryption at rest.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import type { PluginConfig, PluginCredentials } from "./types.js";

// ============================================================================
// CONSTANTS
// ============================================================================

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;

// ============================================================================
// ENCRYPTION KEY MANAGEMENT
// ============================================================================

let encryptionKey: Buffer | null = null;

/**
 * Initialize the encryption key from environment variable
 * Must be called before any encryption/decryption operations
 */
export function initializeEncryption(key?: string): void {
  const envKey = key || process.env.PLUGIN_ENCRYPTION_KEY;

  if (!envKey) {
    console.warn(
      "[Credentials] PLUGIN_ENCRYPTION_KEY not set. Using derived key from hostname. " +
        "This is NOT secure for production use!"
    );
    // Derive a key from hostname for development/testing only
    const hostname = process.env.HOSTNAME || "localhost";
    const salt = Buffer.from("opsagent-dev-salt-do-not-use-in-prod");
    encryptionKey = scryptSync(hostname, salt, KEY_LENGTH);
    return;
  }

  // If key is a hex string, decode it
  if (/^[0-9a-fA-F]{64}$/.test(envKey)) {
    encryptionKey = Buffer.from(envKey, "hex");
  } else {
    // Otherwise, derive a key from the passphrase
    const salt = Buffer.from("opsagent-credential-salt-v1");
    encryptionKey = scryptSync(envKey, salt, KEY_LENGTH);
  }

  console.log("[Credentials] Encryption initialized");
}

/**
 * Generate a new encryption key (for setup purposes)
 */
export function generateEncryptionKey(): string {
  return randomBytes(KEY_LENGTH).toString("hex");
}

/**
 * Check if encryption is initialized
 */
export function isEncryptionInitialized(): boolean {
  return encryptionKey !== null;
}

// ============================================================================
// ENCRYPTION / DECRYPTION
// ============================================================================

/**
 * Encrypt a string value
 */
export function encrypt(plaintext: string): string {
  if (!encryptionKey) {
    throw new Error("Encryption not initialized. Call initializeEncryption() first.");
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, encryptionKey, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt an encrypted string
 */
export function decrypt(encryptedValue: string): string {
  if (!encryptionKey) {
    throw new Error("Encryption not initialized. Call initializeEncryption() first.");
  }

  const parts = encryptedValue.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted value format");
  }

  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, encryptionKey, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

// ============================================================================
// CREDENTIAL ENCRYPTION
// ============================================================================

/**
 * Fields that should be encrypted in credentials
 */
const SENSITIVE_FIELDS = [
  "password",
  "secret",
  "token",
  "key",
  "credential",
  "connectionString",
  "authToken",
  "apiKey",
];

/**
 * Check if a field name is sensitive
 */
function isSensitiveField(fieldName: string): boolean {
  const lowerName = fieldName.toLowerCase();
  return SENSITIVE_FIELDS.some((field) => lowerName.includes(field.toLowerCase()));
}

/**
 * Encrypt sensitive fields in credentials
 */
export function encryptCredentials(
  credentials: PluginCredentials
): PluginCredentials {
  const encrypted: PluginCredentials = { ...credentials };

  for (const [key, value] of Object.entries(credentials)) {
    if (isSensitiveField(key) && typeof value === "string" && value.length > 0) {
      // Mark as encrypted and store encrypted value
      (encrypted as Record<string, unknown>)[key] = `ENC:${encrypt(value)}`;
    }
  }

  return encrypted;
}

/**
 * Decrypt sensitive fields in credentials
 */
export function decryptCredentials(
  credentials: PluginCredentials
): PluginCredentials {
  const decrypted: PluginCredentials = { ...credentials };

  for (const [key, value] of Object.entries(credentials)) {
    if (typeof value === "string" && value.startsWith("ENC:")) {
      const encryptedValue = value.slice(4); // Remove "ENC:" prefix
      (decrypted as Record<string, unknown>)[key] = decrypt(encryptedValue);
    }
  }

  return decrypted;
}

/**
 * Encrypt an entire plugin configuration
 */
export function encryptConfig(config: PluginConfig): PluginConfig {
  return {
    ...config,
    credentials: encryptCredentials(config.credentials),
  };
}

/**
 * Decrypt an entire plugin configuration
 */
export function decryptConfig(config: PluginConfig): PluginConfig {
  return {
    ...config,
    credentials: decryptCredentials(config.credentials),
  };
}

// ============================================================================
// SAFE CREDENTIAL DISPLAY
// ============================================================================

/**
 * Mask a sensitive value for display (e.g., "mypassword" -> "myp*****")
 */
export function maskValue(value: string, visibleChars: number = 3): string {
  if (value.length <= visibleChars) {
    return "*".repeat(value.length);
  }
  return value.slice(0, visibleChars) + "*".repeat(Math.min(value.length - visibleChars, 8));
}

/**
 * Get credentials with sensitive values masked for display/logging
 */
export function getMaskedCredentials(
  credentials: PluginCredentials
): Record<string, unknown> {
  const masked: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(credentials)) {
    if (isSensitiveField(key) && typeof value === "string") {
      // Check if already encrypted
      if (value.startsWith("ENC:")) {
        masked[key] = "[ENCRYPTED]";
      } else {
        masked[key] = maskValue(value);
      }
    } else {
      masked[key] = value;
    }
  }

  return masked;
}

/**
 * Get a safe version of config for logging (credentials masked)
 */
export function getSafeConfigForLogging(config: PluginConfig): Record<string, unknown> {
  return {
    ...config,
    credentials: getMaskedCredentials(config.credentials),
  };
}

// ============================================================================
// CREDENTIAL VALIDATION
// ============================================================================

/**
 * Validate that required credential fields are present
 */
export function validateCredentials(
  credentials: PluginCredentials,
  requiredFields: string[]
): { valid: boolean; missingFields: string[] } {
  const missingFields: string[] = [];

  for (const field of requiredFields) {
    const value = credentials[field as keyof PluginCredentials];
    if (value === undefined || value === null || value === "") {
      missingFields.push(field);
    }
  }

  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}

/**
 * Check if credentials appear to be encrypted
 */
export function areCredentialsEncrypted(credentials: PluginCredentials): boolean {
  for (const [key, value] of Object.entries(credentials)) {
    if (isSensitiveField(key) && typeof value === "string") {
      if (!value.startsWith("ENC:")) {
        return false;
      }
    }
  }
  return true;
}

// ============================================================================
// CONNECTION STRING UTILITIES
// ============================================================================

/**
 * Parse a connection string into credentials object
 * Supports PostgreSQL and MongoDB formats
 */
export function parseConnectionString(
  connectionString: string
): Partial<PluginCredentials> {
  try {
    const url = new URL(connectionString);

    return {
      host: url.hostname,
      port: parseInt(url.port, 10) || undefined,
      database: url.pathname.slice(1) || undefined,
      username: url.username || undefined,
      password: url.password || undefined,
      ssl: url.searchParams.get("ssl") === "true",
      connectionString,
    };
  } catch {
    throw new Error("Invalid connection string format");
  }
}

/**
 * Build a connection string from credentials
 */
export function buildConnectionString(
  protocol: string,
  credentials: PluginCredentials
): string {
  const auth =
    credentials.username && credentials.password
      ? `${encodeURIComponent(credentials.username)}:${encodeURIComponent(credentials.password)}@`
      : credentials.username
        ? `${encodeURIComponent(credentials.username)}@`
        : "";

  const host = credentials.host;
  const port = credentials.port ? `:${credentials.port}` : "";
  const database = credentials.database ? `/${credentials.database}` : "";
  const ssl = credentials.ssl ? "?ssl=true" : "";

  return `${protocol}://${auth}${host}${port}${database}${ssl}`;
}
