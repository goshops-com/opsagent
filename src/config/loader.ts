import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import yaml from "js-yaml";

export interface CollectorConfig {
  interval: number;
}

export interface CpuRules {
  warning?: number;
  critical?: number;
  sustained?: {
    threshold: number;
    duration: number;
  };
}

export interface MemoryRules {
  warning?: number;
  critical?: number;
}

export interface DiskRules {
  warning?: number;
  critical?: number;
  growthRateWarning?: number;
}

export interface NetworkRules {
  errorRateWarning?: number;
}

export interface ProcessRules {
  zombieWarning?: number;
}

export interface RulesConfig {
  cpu?: CpuRules;
  memory?: MemoryRules;
  disk?: DiskRules;
  network?: NetworkRules;
  processes?: ProcessRules;
}

export interface AlertsConfig {
  cooldown: number;
  maxHistory: number;
}

export interface AgentConfig {
  enabled: boolean;
  autoRemediate: boolean;
  model: string;
}

export interface DashboardConfig {
  enabled: boolean;
  port: number;
}

export interface DiscordConfig {
  enabled: boolean;
  webhookUrl: string;
  notifyOnCritical: boolean;
  notifyOnAgentAction: boolean;
}

export interface Config {
  collector: CollectorConfig;
  rules: RulesConfig;
  alerts: AlertsConfig;
  agent: AgentConfig;
  dashboard: DashboardConfig;
  discord: DiscordConfig;
}

const defaultConfig: Config = {
  collector: {
    interval: 5000,
  },
  rules: {
    cpu: {
      warning: 70,
      critical: 90,
      sustained: {
        threshold: 80,
        duration: 300000,
      },
    },
    memory: {
      warning: 75,
      critical: 90,
    },
    disk: {
      warning: 80,
      critical: 95,
    },
    network: {
      errorRateWarning: 0.01,
    },
    processes: {
      zombieWarning: 5,
    },
  },
  alerts: {
    cooldown: 300000,
    maxHistory: 1000,
  },
  agent: {
    enabled: true,
    autoRemediate: false,
    model: "claude-sonnet-4-20250514",
  },
  dashboard: {
    enabled: true,
    port: 3000,
  },
  discord: {
    enabled: true,
    webhookUrl: "",
    notifyOnCritical: true,
    notifyOnAgentAction: true,
  },
};

export function loadConfig(configPath?: string): Config {
  const paths = configPath
    ? [configPath]
    : [
        resolve(process.cwd(), "config/default.yaml"),
        resolve(process.cwd(), "config.yaml"),
        resolve(process.cwd(), "config/config.yaml"),
      ];

  for (const path of paths) {
    if (existsSync(path)) {
      try {
        const content = readFileSync(path, "utf-8");
        const loaded = yaml.load(content) as Partial<Config>;
        console.log(`Loaded configuration from ${path}`);
        return mergeConfig(defaultConfig, loaded);
      } catch (error) {
        console.error(`Error loading config from ${path}:`, error);
      }
    }
  }

  console.log("Using default configuration");
  return defaultConfig;
}

function mergeConfig(defaults: Config, loaded: Partial<Config>): Config {
  return {
    collector: {
      ...defaults.collector,
      ...loaded.collector,
    },
    rules: {
      cpu: { ...defaults.rules.cpu, ...loaded.rules?.cpu },
      memory: { ...defaults.rules.memory, ...loaded.rules?.memory },
      disk: { ...defaults.rules.disk, ...loaded.rules?.disk },
      network: { ...defaults.rules.network, ...loaded.rules?.network },
      processes: { ...defaults.rules.processes, ...loaded.rules?.processes },
    },
    alerts: {
      ...defaults.alerts,
      ...loaded.alerts,
    },
    agent: {
      ...defaults.agent,
      ...loaded.agent,
    },
    dashboard: {
      ...defaults.dashboard,
      ...loaded.dashboard,
    },
    discord: {
      ...defaults.discord,
      ...loaded.discord,
    },
  };
}
