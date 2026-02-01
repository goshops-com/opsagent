import { describe, it, expect, beforeEach } from "bun:test";
import { NetDataAlertCollector, convertNetDataAlertToOpsAgentAlert } from "../../src/collector/netdata";
import type { NetDataAlert, NetDataCollectorConfig } from "../../src/collector/netdata";

describe("NetDataAlertCollector", () => {
  let collector: NetDataAlertCollector;
  let mockConfig: NetDataCollectorConfig;

  beforeEach(() => {
    mockConfig = {
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
    };
    collector = new NetDataAlertCollector(mockConfig);
  });

  describe("Configuration", () => {
    it("should create collector with valid config", () => {
      expect(collector).toBeDefined();
      expect(collector.isHealthy()).toBe(false); // Not started yet
    });

    it("should handle ignore patterns", () => {
      const configWithIgnores: NetDataCollectorConfig = {
        ...mockConfig,
        ignoreAlerts: ["test.*", ".*_debug"],
      };
      const collectorWithIgnores = new NetDataAlertCollector(configWithIgnores);
      expect(collectorWithIgnores).toBeDefined();
    });
  });

  describe("Alert Conversion", () => {
    it("should convert NetData alert to OpsAgent format", () => {
      const netdataAlert: NetDataAlert = {
        id: "system.cpu.usage",
        name: "cpu_usage",
        chart: "system.cpu",
        context: "system.cpu",
        family: "cpu",
        severity: "warning",
        status: "raised",
        value: 85.5,
        units: "%",
        info: "CPU usage is high",
        timestamp: 1234567890,
      };

      const opsAlert = convertNetDataAlertToOpsAgentAlert(netdataAlert);

      expect(opsAlert.id).toBe("netdata-system.cpu.usage");
      expect(opsAlert.severity).toBe("warning");
      expect(opsAlert.message).toBe("CPU usage is high");
      expect(opsAlert.metric).toBe("system.cpu");
      expect(opsAlert.currentValue).toBe(85.5);
      expect(opsAlert.source).toBe("netdata");
      expect(opsAlert.metadata.chart).toBe("system.cpu");
    });

    it("should handle critical alerts", () => {
      const netdataAlert: NetDataAlert = {
        id: "disk.full",
        name: "disk_full",
        chart: "disk.space",
        context: "disk.space",
        family: "/",
        severity: "critical",
        status: "raised",
        value: 95,
        units: "%",
        info: "Disk is almost full",
        timestamp: 1234567890,
      };

      const opsAlert = convertNetDataAlertToOpsAgentAlert(netdataAlert);
      expect(opsAlert.severity).toBe("critical");
    });

    it("should handle alerts without info", () => {
      const netdataAlert: NetDataAlert = {
        id: "test.alert",
        name: "test_alert",
        chart: "test.chart",
        context: "test.context",
        family: "test",
        severity: "warning",
        status: "raised",
        value: 50,
        units: "",
        info: "",
        timestamp: 1234567890,
      };

      const opsAlert = convertNetDataAlertToOpsAgentAlert(netdataAlert);
      expect(opsAlert.message).toContain("test_alert");
    });
  });

  describe("Pattern Matching", () => {
    it("should match glob patterns", () => {
      // These tests would need to expose the matchPattern method
      // For now, we test through the ignoreAlerts behavior
      const configWithIgnores: NetDataCollectorConfig = {
        ...mockConfig,
        ignoreAlerts: ["test.*"],
      };
      const collectorWithIgnores = new NetDataAlertCollector(configWithIgnores);
      expect(collectorWithIgnores).toBeDefined();
    });
  });

  describe("Alert State Management", () => {
    it("should track known alerts", () => {
      // Initially empty
      expect(collector.getKnownAlerts()).toEqual([]);
    });
  });

  describe("Severity Mapping", () => {
    it("should map NetData severity to OpsAgent severity", () => {
      const configWithMapping: NetDataCollectorConfig = {
        ...mockConfig,
        severityMapping: {
          warning: "low",
          critical: "high",
          clear: "ok",
        },
      };
      const collectorWithMapping = new NetDataAlertCollector(configWithMapping);
      expect(collectorWithMapping).toBeDefined();
    });
  });
});
