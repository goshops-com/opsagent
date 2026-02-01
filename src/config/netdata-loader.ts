import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import yaml from "js-yaml";

export interface NetDataConfig {
  url: string;
  pollInterval: number;
  monitorSeverity: "warning" | "critical" | "all";
  acknowledgeAlerts: boolean;
  severityMapping: {
    warning: string;
    critical: string;
    clear: string;
  };
  ignoreAlerts: string[];
  forceAlerts: string[];
}

export interface OpsAgentConfig {
  autoRemediate: boolean;
  provider: "opencode" | "openrouter";
  model: string;
  permissionLevel: "full" | "limited" | "readonly";
}

export interface DiscordIntegrationConfig {
  enabled: boolean;
  webhookUrl: string;
  notifyOnCritical: boolean;
  notifyOnAgentAction: boolean;
}

export interface DashboardConfig {
  enabled: boolean;
  port: number;
}

export interface NetDataIntegrationConfig {
  netdata: NetDataConfig;
  opsagent: OpsAgentConfig;
  discord: DiscordIntegrationConfig;
  dashboard: DashboardConfig;
}

const defaultNetDataConfig: NetDataIntegrationConfig = {
  netdata: {
    url: "http://localhost:19999",
    pollInterval: 30,
    monitorSeverity: "warning",
    acknowledgeAlerts: true,
    severityMapping: {
      warning: "warning",
      critical: "critical",
      clear: "resolved",
    },
    ignoreAlerts: [],
    forceAlerts: [],
  },
  opsagent: {
    autoRemediate: false,
    provider: "opencode",
    model: "kimi-k2.5",
    permissionLevel: "limited",
  },
  discord: {
    enabled: true,
    webhookUrl: "",
    notifyOnCritical: true,
    notifyOnAgentAction: true,
  },
  dashboard: {
    enabled: true,
    port: 3001,
  },
};

export function loadNetDataConfig(configPath?: string): NetDataIntegrationConfig {
  const paths = configPath
    ? [configPath]
    : [
        resolve(process.cwd(), "config/netdata.yaml"),
        resolve(process.cwd(), "/etc/opsagent/netdata.yaml"),
        resolve(process.cwd(), "netdata.yaml"),
      ];

  for (const path of paths) {
    if (existsSync(path)) {
      try {
        const content = readFileSync(path, "utf-8");
        const loaded = yaml.load(content) as Partial<NetDataIntegrationConfig>;
        console.log(`Loaded NetData configuration from ${path}`);
        return mergeNetDataConfig(defaultNetDataConfig, loaded);
      } catch (error) {
        console.error(`Error loading NetData config from ${path}:`, error);
      }
    }
  }

  console.log("Using default NetData configuration");
  return defaultNetDataConfig;
}

function mergeNetDataConfig(
  defaults: NetDataIntegrationConfig,
  loaded: Partial<NetDataIntegrationConfig>
): NetDataIntegrationConfig {
  return {
    netdata: {
      ...defaults.netdata,
      ...loaded.netdata,
      severityMapping: {
        ...defaults.netdata.severityMapping,
        ...loaded.netdata?.severityMapping,
      },
    },
    opsagent: {
      ...defaults.opsagent,
      ...loaded.opsagent,
    },
    discord: {
      ...defaults.discord,
      ...loaded.discord,
    },
    dashboard: {
      ...defaults.dashboard,
      ...loaded.dashboard,
    },
  };
}

// Environment variable substitution
export function substituteEnvVars(config: NetDataIntegrationConfig): NetDataIntegrationConfig {
  const substitute = (str: string): string => {
    return str.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      return process.env[varName] || match;
    });
  };

  return {
    ...config,
    netdata: {
      ...config.netdata,
      url: substitute(config.netdata.url),
    },
    discord: {
      ...config.discord,
      webhookUrl: substitute(config.discord.webhookUrl),
    },
  };
}
