import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { MetricsCollector } from "../../src/collector/index";
import { RuleEngine } from "../../src/rules/engine";
import type { SystemMetrics } from "../../src/collector/metrics";

describe("Integration Tests", () => {
  let collector: MetricsCollector;
  let engine: RuleEngine;

  beforeEach(() => {
    collector = new MetricsCollector(1000);
    engine = new RuleEngine();
  });

  afterEach(() => {
    collector.stop();
  });

  describe("End-to-End Alert Flow", () => {
    it("should collect metrics and detect violations", async () => {
      // Load comprehensive rules
      engine.loadRulesFromConfig({
        rules: {
          cpu: {
            warning: 50,
            critical: 90,
            loadAverage: { warning: 2, critical: 5 },
          },
          memory: {
            warning: 70,
            critical: 90,
            swap: { warning: 30, critical: 70 },
          },
          disk: {
            warning: 80,
            critical: 95,
            perMount: true,
          },
          processes: {
            zombieWarning: 3,
            blockedWarning: 5,
          },
        },
      });

      // Create mock metrics that trigger violations
      const mockMetrics: SystemMetrics = {
        timestamp: Date.now(),
        cpu: {
          usage: 85, // Above warning
          loadAverage: [3.5, 2.5, 2.0], // Above warning
        },
        memory: {
          total: 16000000000,
          used: 12000000000,
          free: 3000000000,
          usedPercent: 75, // Above warning
          available: 3000000000,
          availablePercent: 18.75,
          swapTotal: 2000000000,
          swapUsed: 800000000,
          swapPercent: 40, // Above warning
        },
        disk: {
          mounts: [
            {
              fs: "/dev/sda1",
              mount: "/",
              size: 100000000000,
              used: 85000000000,
              available: 15000000000,
              usedPercent: 85, // Above warning
            },
          ],
        },
        network: {
          interfaces: [],
          totalRxBytes: 0,
          totalTxBytes: 0,
          totalRxErrors: 0,
          totalTxErrors: 0,
          errorRate: 0,
        },
        processes: {
          running: 50,
          blocked: 8, // Above warning
          sleeping: 100,
          zombie: 5, // Above warning
          total: 163,
          topCpu: [],
          topMemory: [],
        },
      };

      const violations = engine.evaluate(mockMetrics);

      // Should detect multiple violations
      expect(violations.length).toBeGreaterThan(5);

      // Check specific violations
      const cpuViolation = violations.find(v => v.metric === "cpu.usage");
      expect(cpuViolation).toBeDefined();
      expect(cpuViolation?.currentValue).toBe(85);

      const loadViolation = violations.find(v => v.metric === "cpu.loadAverage.1min");
      expect(loadViolation).toBeDefined();

      const memViolation = violations.find(v => v.metric === "memory.usedPercent");
      expect(memViolation).toBeDefined();

      const swapViolation = violations.find(v => v.metric === "memory.swapPercent");
      expect(swapViolation).toBeDefined();

      const mountViolation = violations.find(v => v.metric.includes("disk.mount"));
      expect(mountViolation).toBeDefined();

      const zombieViolation = violations.find(v => v.metric === "processes.zombie");
      expect(zombieViolation).toBeDefined();

      const blockedViolation = violations.find(v => v.metric === "processes.blocked");
      expect(blockedViolation).toBeDefined();
    });

    it.skip("should handle real metric collection without errors [TODO: requires systeminformation]", async () => {
      // This test actually collects real metrics from the system
      const metrics = await collector.collectMetrics();

      // Validate structure
      expect(metrics.timestamp).toBeNumber();
      expect(metrics.cpu).toBeDefined();
      expect(metrics.cpu.usage).toBeNumber();
      expect(metrics.cpu.loadAverage).toBeArray();
      expect(metrics.memory).toBeDefined();
      expect(metrics.memory.usedPercent).toBeNumber();
      expect(metrics.disk).toBeDefined();
      expect(metrics.disk.mounts).toBeArray();
      expect(metrics.network).toBeDefined();
      expect(metrics.processes).toBeDefined();

      // Load rules and evaluate
      engine.loadRulesFromConfig({
        rules: {
          cpu: { warning: 95, critical: 99 },
          memory: { warning: 95, critical: 99 },
          disk: { warning: 95, critical: 99 },
        },
      });

      const violations = engine.evaluate(metrics);
      expect(violations).toBeArray();

      // In normal conditions, should have few or no violations
      console.log(`Found ${violations.length} violations in real metrics`);
    });
  });

  describe("Alert Cooldown and Deduplication", () => {
    it("should not re-alert on same metrics immediately", () => {
      engine.loadRulesFromConfig({
        rules: {
          cpu: { warning: 50 },
        },
      });

      const mockMetrics: SystemMetrics = {
        timestamp: Date.now(),
        cpu: {
          usage: 80,
          loadAverage: [1, 1, 1],
        },
        memory: {
          total: 16000000000,
          used: 8000000000,
          free: 7000000000,
          usedPercent: 50,
          available: 7000000000,
          availablePercent: 43.75,
          swapTotal: 0,
          swapUsed: 0,
          swapPercent: 0,
        },
        disk: {
          mounts: [],
        },
        network: {
          interfaces: [],
          totalRxBytes: 0,
          totalTxBytes: 0,
          totalRxErrors: 0,
          totalTxErrors: 0,
          errorRate: 0,
        },
        processes: {
          running: 50,
          blocked: 0,
          sleeping: 100,
          zombie: 0,
          total: 150,
          topCpu: [],
          topMemory: [],
        },
      };

      // First evaluation
      const violations1 = engine.evaluate(mockMetrics);
      expect(violations1.length).toBe(1);

      // Second evaluation immediately after
      const violations2 = engine.evaluate({
        ...mockMetrics,
        timestamp: Date.now(),
      });
      
      // Should still detect - rule engine doesn't handle cooldown, alert manager does
      expect(violations2.length).toBe(1);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty disk mounts", () => {
      engine.loadRulesFromConfig({
        rules: {
          disk: { warning: 80, perMount: true },
        },
      });

      const mockMetrics: SystemMetrics = {
        timestamp: Date.now(),
        cpu: { usage: 50, loadAverage: [1, 1, 1] },
        memory: {
          total: 16000000000,
          used: 8000000000,
          free: 7000000000,
          usedPercent: 50,
          available: 7000000000,
          availablePercent: 43.75,
          swapTotal: 0,
          swapUsed: 0,
          swapPercent: 0,
        },
        disk: {
          mounts: [],
        },
        network: {
          interfaces: [],
          totalRxBytes: 0,
          totalTxBytes: 0,
          totalRxErrors: 0,
          totalTxErrors: 0,
          errorRate: 0,
        },
        processes: {
          running: 50,
          blocked: 0,
          sleeping: 100,
          zombie: 0,
          total: 150,
          topCpu: [],
          topMemory: [],
        },
      };

      const violations = engine.evaluate(mockMetrics);
      expect(violations).toBeArray();
      // Should not crash with empty mounts
    });

    it("should handle missing optional metrics gracefully", () => {
      engine.loadRulesFromConfig({
        rules: {
          cpu: {
            temperature: { warning: 70 },
          },
          fileDescriptors: { warning: 70 },
        },
      });

      const mockMetrics: SystemMetrics = {
        timestamp: Date.now(),
        cpu: {
          usage: 50,
          loadAverage: [1, 1, 1],
          // temperature is undefined
        },
        memory: {
          total: 16000000000,
          used: 8000000000,
          free: 7000000000,
          usedPercent: 50,
          available: 7000000000,
          availablePercent: 43.75,
          swapTotal: 0,
          swapUsed: 0,
          swapPercent: 0,
        },
        disk: {
          mounts: [],
        },
        network: {
          interfaces: [],
          totalRxBytes: 0,
          totalTxBytes: 0,
          totalRxErrors: 0,
          totalTxErrors: 0,
          errorRate: 0,
        },
        processes: {
          running: 50,
          blocked: 0,
          sleeping: 100,
          zombie: 0,
          total: 150,
          topCpu: [],
          topMemory: [],
        },
        // fileDescriptors is undefined
      };

      const violations = engine.evaluate(mockMetrics);
      expect(violations).toBeArray();
      expect(violations.length).toBe(0);
    });

    it("should handle zero values correctly", () => {
      engine.loadRulesFromConfig({
        rules: {
          memory: { available: { warning: 20 } },
        },
      });

      const mockMetrics: SystemMetrics = {
        timestamp: Date.now(),
        cpu: { usage: 50, loadAverage: [1, 1, 1] },
        memory: {
          total: 16000000000,
          used: 16000000000,
          free: 0,
          usedPercent: 100,
          available: 0,
          availablePercent: 0, // Zero available
          swapTotal: 0,
          swapUsed: 0,
          swapPercent: 0,
        },
        disk: { mounts: [] },
        network: {
          interfaces: [],
          totalRxBytes: 0,
          totalTxBytes: 0,
          totalRxErrors: 0,
          totalTxErrors: 0,
          errorRate: 0,
        },
        processes: {
          running: 50,
          blocked: 0,
          sleeping: 100,
          zombie: 0,
          total: 150,
          topCpu: [],
          topMemory: [],
        },
      };

      const violations = engine.evaluate(mockMetrics);
      const availableViolation = violations.find(v => v.metric === "memory.availablePercent");
      
      // 0 < 20 should trigger
      expect(availableViolation).toBeDefined();
      expect(availableViolation?.currentValue).toBe(0);
    });
  });
});
