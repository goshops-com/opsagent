import { describe, it, expect, beforeEach } from "bun:test";
import type { 
  SystemMetrics, 
  CpuMetrics, 
  MemoryMetrics, 
  DiskMetrics, 
  NetworkMetrics, 
  ProcessMetrics 
} from "../src/collector/metrics";

describe("Metrics Types", () => {
  describe("SystemMetrics", () => {
    it("should create valid SystemMetrics object with all required fields", () => {
      const metrics: SystemMetrics = {
        timestamp: Date.now(),
        cpu: {
          usage: 50,
          loadAverage: [1.5, 1.2, 1.0],
          temperature: 65,
          iowait: 5,
        },
        memory: {
          total: 16000000000,
          used: 8000000000,
          free: 7000000000,
          usedPercent: 50,
          available: 7000000000,
          availablePercent: 43.75,
          swapTotal: 2000000000,
          swapUsed: 500000000,
          swapPercent: 25,
        },
        disk: {
          mounts: [
            {
              fs: "/dev/sda1",
              mount: "/",
              size: 100000000000,
              used: 50000000000,
              available: 45000000000,
              usedPercent: 50,
              inodesTotal: 1000000,
              inodesUsed: 500000,
              inodesFree: 500000,
              inodesUsedPercent: 50,
            },
          ],
          totalReadBytes: 1000000,
          totalWriteBytes: 2000000,
          totalReadRate: 100000,
          totalWriteRate: 200000,
        },
        network: {
          interfaces: [
            {
              iface: "eth0",
              rxBytes: 1000000,
              txBytes: 500000,
              rxErrors: 0,
              txErrors: 0,
              rxSpeed: 10000,
              txSpeed: 5000,
            },
          ],
          totalRxBytes: 1000000,
          totalTxBytes: 500000,
          totalRxErrors: 0,
          totalTxErrors: 0,
          errorRate: 0,
          totalRxSpeed: 10000,
          totalTxSpeed: 5000,
        },
        processes: {
          running: 50,
          blocked: 5,
          sleeping: 100,
          zombie: 2,
          total: 157,
          topCpu: [
            { pid: 1, name: "init", cpu: 5, memory: 10 },
          ],
          topMemory: [
            { pid: 1, name: "init", cpu: 5, memory: 10 },
          ],
        },
        fileDescriptors: {
          allocated: 1000,
          max: 10000,
          usedPercent: 10,
        },
      };

      expect(metrics.timestamp).toBeNumber();
      expect(metrics.cpu.usage).toBe(50);
      expect(metrics.cpu.temperature).toBe(65);
      expect(metrics.cpu.iowait).toBe(5);
      expect(metrics.memory.availablePercent).toBe(43.75);
      expect(metrics.disk.totalReadRate).toBe(100000);
      expect(metrics.network.totalRxSpeed).toBe(10000);
      expect(metrics.processes.blocked).toBe(5);
      expect(metrics.processes.total).toBe(157);
      expect(metrics.fileDescriptors?.usedPercent).toBe(10);
    });

    it("should handle optional fields being undefined", () => {
      const metrics: SystemMetrics = {
        timestamp: Date.now(),
        cpu: {
          usage: 50,
          loadAverage: [1.5, 1.2, 1.0],
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
          mounts: [
            {
              fs: "/dev/sda1",
              mount: "/",
              size: 100000000000,
              used: 50000000000,
              available: 45000000000,
              usedPercent: 50,
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
          blocked: 0,
          sleeping: 100,
          zombie: 0,
          total: 150,
          topCpu: [],
          topMemory: [],
        },
      };

      expect(metrics.cpu.temperature).toBeUndefined();
      expect(metrics.cpu.iowait).toBeUndefined();
      expect(metrics.fileDescriptors).toBeUndefined();
    });
  });

  describe("DiskMount inode fields", () => {
    it("should handle mounts with and without inode information", () => {
      const mountWithInodes = {
        fs: "/dev/sda1",
        mount: "/",
        size: 100000000000,
        used: 50000000000,
        available: 45000000000,
        usedPercent: 50,
        inodesTotal: 1000000,
        inodesUsed: 500000,
        inodesFree: 500000,
        inodesUsedPercent: 50,
      };

      const mountWithoutInodes = {
        fs: "/dev/sda2",
        mount: "/home",
        size: 200000000000,
        used: 100000000000,
        available: 90000000000,
        usedPercent: 50,
      };

      expect(mountWithInodes.inodesUsedPercent).toBe(50);
      expect(mountWithoutInodes.inodesUsedPercent).toBeUndefined();
    });
  });
});
