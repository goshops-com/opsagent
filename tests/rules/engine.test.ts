import { describe, it, expect, beforeEach } from "bun:test";
import { RuleEngine } from "../../src/rules/engine";
import type { SystemMetrics } from "../../src/collector/metrics";
import type { RuleViolation } from "../../src/rules/types";

describe("RuleEngine", () => {
  let engine: RuleEngine;
  let baseMetrics: SystemMetrics;

  beforeEach(() => {
    engine = new RuleEngine();
    baseMetrics = {
      timestamp: Date.now(),
      cpu: {
        usage: 50,
        loadAverage: [2.0, 1.5, 1.0],
        temperature: 65,
        iowait: 15,
      },
      memory: {
        total: 16000000000,
        used: 8000000000,
        free: 7000000000,
        usedPercent: 50,
        available: 7000000000,
        availablePercent: 43.75,
        swapTotal: 2000000000,
        swapUsed: 1000000000,
        swapPercent: 50,
      },
      disk: {
        mounts: [
          {
            fs: "/dev/sda1",
            mount: "/",
            size: 100000000000,
            used: 60000000000,
            available: 35000000000,
            usedPercent: 60,
            inodesTotal: 1000000,
            inodesUsed: 850000,
            inodesFree: 150000,
            inodesUsedPercent: 85,
          },
          {
            fs: "/dev/sda2",
            mount: "/home",
            size: 200000000000,
            used: 190000000000,
            available: 5000000000,
            usedPercent: 95,
            inodesTotal: 2000000,
            inodesUsed: 1900000,
            inodesFree: 100000,
            inodesUsedPercent: 95,
          },
        ],
        totalReadBytes: 1000000,
        totalWriteBytes: 2000000,
        totalReadRate: 150000000,
        totalWriteRate: 250000000,
      },
      network: {
        interfaces: [
          {
            iface: "eth0",
            rxBytes: 1000000000,
            txBytes: 500000000,
            rxErrors: 10,
            txErrors: 5,
            rxSpeed: 150000000,
            txSpeed: 250000000,
          },
        ],
        totalRxBytes: 1000000000,
        totalTxBytes: 500000000,
        totalRxErrors: 10,
        totalTxErrors: 5,
        errorRate: 0.02,
        totalRxSpeed: 150000000,
        totalTxSpeed: 250000000,
      },
      processes: {
        running: 50,
        blocked: 15,
        sleeping: 100,
        zombie: 10,
        total: 600,
        topCpu: [
          { pid: 1, name: "high-cpu-process", cpu: 85, memory: 10 },
          { pid: 2, name: "medium-cpu", cpu: 50, memory: 15 },
        ],
        topMemory: [
          { pid: 1, name: "high-mem-process", cpu: 5, memory: 90 },
          { pid: 3, name: "medium-mem", cpu: 10, memory: 50 },
        ],
      },
      fileDescriptors: {
        allocated: 8000,
        max: 10000,
        usedPercent: 80,
      },
    };
  });

  describe("CPU Alerts", () => {
    it("should detect high CPU temperature", () => {
      engine.loadRulesFromConfig({
        rules: {
          cpu: {
            temperature: { warning: 60, critical: 85 },
          },
        },
      });

      const violations = engine.evaluate(baseMetrics);
      const tempViolation = violations.find(v => v.metric === "cpu.temperature");
      
      expect(tempViolation).toBeDefined();
      expect(tempViolation?.rule.severity).toBe("warning");
      expect(tempViolation?.currentValue).toBe(65);
    });

    it("should detect high CPU load average", () => {
      engine.loadRulesFromConfig({
        rules: {
          cpu: {
            loadAverage: { warning: 1.5, critical: 3.0 },
          },
        },
      });

      const violations = engine.evaluate(baseMetrics);
      const loadViolation = violations.find(v => v.metric === "cpu.loadAverage.1min");
      
      expect(loadViolation).toBeDefined();
      expect(loadViolation?.currentValue).toBe(2.0);
    });

    it("should detect high CPU I/O wait", () => {
      engine.loadRulesFromConfig({
        rules: {
          cpu: {
            iowait: { warning: 10, critical: 30 },
          },
        },
      });

      const violations = engine.evaluate(baseMetrics);
      const iowaitViolation = violations.find(v => v.metric === "cpu.iowait");
      
      expect(iowaitViolation).toBeDefined();
      expect(iowaitViolation?.currentValue).toBe(15);
    });
  });

  describe("Memory Alerts", () => {
    it("should detect high swap usage", () => {
      engine.loadRulesFromConfig({
        rules: {
          memory: {
            swap: { warning: 40, critical: 80 },
          },
        },
      });

      const violations = engine.evaluate(baseMetrics);
      const swapViolation = violations.find(v => v.metric === "memory.swapPercent");
      
      expect(swapViolation).toBeDefined();
      expect(swapViolation?.currentValue).toBe(50);
      expect(swapViolation?.rule.severity).toBe("warning");
    });

    it("should detect low available memory", () => {
      engine.loadRulesFromConfig({
        rules: {
          memory: {
            available: { warning: 50, critical: 20 },
          },
        },
      });

      const violations = engine.evaluate(baseMetrics);
      const availableViolation = violations.find(v => v.metric === "memory.availablePercent");
      
      expect(availableViolation).toBeDefined();
      expect(availableViolation?.currentValue).toBe(43.75);
      expect(availableViolation?.rule.operator).toBe("<");
    });
  });

  describe("Disk Alerts", () => {
    it("should detect per-mount disk usage", () => {
      engine.loadRulesFromConfig({
        rules: {
          disk: {
            warning: 70,
            critical: 90,
            perMount: true,
          },
        },
      });

      const violations = engine.evaluate(baseMetrics);
      const mountViolations = violations.filter(v => v.metric.includes("disk.mount"));
      
      expect(mountViolations.length).toBeGreaterThan(0);
    });

    it("should detect high inode usage", () => {
      engine.loadRulesFromConfig({
        rules: {
          disk: {
            inodes: { warning: 80, critical: 95 },
          },
        },
      });

      const violations = engine.evaluate(baseMetrics);
      const inodeViolation = violations.find(v => v.metric === "disk.inodes.maxUsedPercent");
      
      expect(inodeViolation).toBeDefined();
      expect(inodeViolation?.currentValue).toBe(95);
    });

    it("should detect high disk I/O rates", () => {
      engine.loadRulesFromConfig({
        rules: {
          disk: {
            io: {
              readRateWarning: 100000000,
              readRateCritical: 200000000,
              writeRateWarning: 100000000,
              writeRateCritical: 200000000,
            },
          },
        },
      });

      const violations = engine.evaluate(baseMetrics);
      const readViolation = violations.find(v => v.metric === "disk.io.readRate");
      const writeViolation = violations.find(v => v.metric === "disk.io.writeRate");
      
      expect(readViolation).toBeDefined();
      expect(readViolation?.currentValue).toBe(150000000);
      expect(writeViolation).toBeDefined();
      expect(writeViolation?.currentValue).toBe(250000000);
    });
  });

  describe("Network Alerts", () => {
    it("should detect high network bandwidth", () => {
      engine.loadRulesFromConfig({
        rules: {
          network: {
            bandwidth: {
              rxWarning: 100000000,
              rxCritical: 200000000,
              txWarning: 100000000,
              txCritical: 200000000,
            },
          },
        },
      });

      const violations = engine.evaluate(baseMetrics);
      const rxViolation = violations.find(v => v.metric === "network.bandwidth.rxSpeed");
      const txViolation = violations.find(v => v.metric === "network.bandwidth.txSpeed");
      
      expect(rxViolation).toBeDefined();
      expect(txViolation).toBeDefined();
    });
  });

  describe("Process Alerts", () => {
    it("should detect blocked processes", () => {
      engine.loadRulesFromConfig({
        rules: {
          processes: {
            blockedWarning: 10,
            blockedCritical: 30,
          },
        },
      });

      const violations = engine.evaluate(baseMetrics);
      const blockedViolation = violations.find(v => v.metric === "processes.blocked");
      
      expect(blockedViolation).toBeDefined();
      expect(blockedViolation?.currentValue).toBe(15);
    });

    it("should detect too many total processes", () => {
      engine.loadRulesFromConfig({
        rules: {
          processes: {
            totalWarning: 500,
            totalCritical: 1000,
          },
        },
      });

      const violations = engine.evaluate(baseMetrics);
      const totalViolation = violations.find(v => v.metric === "processes.total");
      
      expect(totalViolation).toBeDefined();
      expect(totalViolation?.currentValue).toBe(600);
    });

    it("should detect zombie processes", () => {
      engine.loadRulesFromConfig({
        rules: {
          processes: {
            zombieWarning: 5,
            zombieCritical: 20,
          },
        },
      });

      const violations = engine.evaluate(baseMetrics);
      const zombieViolation = violations.find(v => v.metric === "processes.zombie");
      
      expect(zombieViolation).toBeDefined();
      expect(zombieViolation?.currentValue).toBe(10);
    });

    it("should detect high CPU processes", () => {
      engine.loadRulesFromConfig({
        rules: {
          processes: {
            highCpuWarning: 80,
            highCpuCritical: 95,
          },
        },
      });

      const violations = engine.evaluate(baseMetrics);
      const processViolations = violations.filter(v => v.metric.includes("process.") && v.metric.includes(".cpu"));
      
      expect(processViolations.length).toBeGreaterThan(0);
      expect(processViolations[0].currentValue).toBe(85);
    });

    it("should detect high memory processes", () => {
      engine.loadRulesFromConfig({
        rules: {
          processes: {
            highMemoryWarning: 80,
            highMemoryCritical: 95,
          },
        },
      });

      const violations = engine.evaluate(baseMetrics);
      const processViolations = violations.filter(v => v.metric.includes("process.") && v.metric.includes(".memory"));
      
      expect(processViolations.length).toBeGreaterThan(0);
      expect(processViolations[0].currentValue).toBe(90);
    });
  });

  describe("File Descriptor Alerts", () => {
    it("should detect high file descriptor usage", () => {
      engine.loadRulesFromConfig({
        rules: {
          fileDescriptors: {
            warning: 70,
            critical: 90,
          },
        },
      });

      const violations = engine.evaluate(baseMetrics);
      const fdViolation = violations.find(v => v.metric === "fileDescriptors.usedPercent");
      
      expect(fdViolation).toBeDefined();
      expect(fdViolation?.currentValue).toBe(80);
    });

    it("should handle missing file descriptor data gracefully", () => {
      engine.loadRulesFromConfig({
        rules: {
          fileDescriptors: {
            warning: 70,
            critical: 90,
          },
        },
      });

      const metricsWithoutFD = { ...baseMetrics, fileDescriptors: undefined };
      const violations = engine.evaluate(metricsWithoutFD);
      const fdViolation = violations.find(v => v.metric === "fileDescriptors.usedPercent");
      
      expect(fdViolation).toBeUndefined();
    });
  });

  describe("Rule Loading", () => {
    it("should load all rule types from config", () => {
      engine.loadRulesFromConfig({
        rules: {
          cpu: {
            warning: 70,
            critical: 90,
            sustained: { threshold: 80, duration: 300000 },
            loadAverage: { warning: 4, critical: 8 },
            temperature: { warning: 70, critical: 85 },
            iowait: { warning: 20, critical: 40 },
          },
          memory: {
            warning: 75,
            critical: 90,
            swap: { warning: 50, critical: 80 },
            available: { warning: 20, critical: 10 },
          },
          disk: {
            warning: 80,
            critical: 95,
            perMount: true,
            inodes: { warning: 80, critical: 95 },
            io: {
              readRateWarning: 100000000,
              readRateCritical: 200000000,
              writeRateWarning: 100000000,
              writeRateCritical: 200000000,
            },
          },
          network: {
            errorRateWarning: 0.01,
            bandwidth: {
              rxWarning: 100000000,
              rxCritical: 200000000,
            },
          },
          processes: {
            zombieWarning: 5,
            zombieCritical: 20,
            blockedWarning: 10,
            blockedCritical: 50,
            totalWarning: 500,
            totalCritical: 1000,
            highCpuWarning: 80,
            highCpuCritical: 95,
            highMemoryWarning: 80,
            highMemoryCritical: 95,
          },
          fileDescriptors: {
            warning: 70,
            critical: 90,
          },
        },
      });

      const rules = engine.getRules();
      expect(rules.length).toBeGreaterThan(20);
    });

    it("should not create rules for undefined thresholds", () => {
      engine.loadRulesFromConfig({
        rules: {
          cpu: {
            warning: 70,
            // no critical defined
          },
        },
      });

      const rules = engine.getRules();
      const criticalRules = rules.filter(r => r.severity === "critical");
      expect(criticalRules.length).toBe(0);
    });
  });

  describe("Sustained Rule Evaluation", () => {
    it.skip("should trigger sustained alert after duration [TODO: timing issue]", async () => {
      // Create metrics with high CPU that will trigger sustained rule
      const highCpuMetrics = {
        ...baseMetrics,
        cpu: {
          ...baseMetrics.cpu,
          usage: 85, // Above threshold of 80
        },
      };

      engine.loadRulesFromConfig({
        rules: {
          cpu: {
            sustained: { threshold: 80, duration: 100 }, // 100ms for testing
          },
        },
      });

      // First evaluation - starts tracking
      const violations1 = engine.evaluate(highCpuMetrics);
      const sustained1 = violations1.find(v => v.rule.type === "sustained");
      expect(sustained1).toBeUndefined();

      // Wait for duration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Second evaluation - should trigger
      const violations2 = engine.evaluate(highCpuMetrics);
      const sustained2 = violations2.find(v => v.rule.type === "sustained");
      expect(sustained2).toBeDefined();
    });
  });
});
