import { EventEmitter } from "events";
import si from "systeminformation";
import type { SystemMetrics } from "./metrics.js";

export class MetricsCollector extends EventEmitter {
  private interval: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private previousNetwork: { 
    rx: number; 
    tx: number; 
    errors: number; 
    timestamp: number;
  } | null = null;
  private previousDiskIO: {
    readBytes: number;
    writeBytes: number;
    timestamp: number;
  } | null = null;

  constructor(interval: number = 5000) {
    super();
    this.interval = interval;
  }

  async collectMetrics(): Promise<SystemMetrics> {
    const [
      cpu,
      cpuLoad,
      cpuTemp,
      mem,
      disk,
      diskIO,
      networkStats,
      processes,
      openFiles,
      loadAvg,
    ] = await Promise.all([
      si.currentLoad(),
      si.fullLoad(),
      si.cpuTemperature().catch(() => ({ main: undefined })),
      si.mem(),
      si.fsSize(),
      si.disksIO().catch(() => null),
      si.networkStats(),
      si.processes(),
      si.openFiles().catch(() => null),
      si.load().catch(() => ({ '1': 0, '5': 0, '15': 0 })),
    ]);

    // Network calculations
    const totalRxBytes = networkStats.reduce((sum, iface) => sum + iface.rx_bytes, 0);
    const totalTxBytes = networkStats.reduce((sum, iface) => sum + iface.tx_bytes, 0);
    const totalRxErrors = networkStats.reduce((sum, iface) => sum + iface.rx_errors, 0);
    const totalTxErrors = networkStats.reduce((sum, iface) => sum + iface.tx_errors, 0);
    const totalErrors = totalRxErrors + totalTxErrors;
    
    // Calculate network speeds (bytes per second)
    let totalRxSpeed = 0;
    let totalTxSpeed = 0;
    let errorRate = 0;
    
    if (this.previousNetwork) {
      const timeDiff = (Date.now() - this.previousNetwork.timestamp) / 1000;
      if (timeDiff > 0) {
        totalRxSpeed = Math.max(0, (totalRxBytes - this.previousNetwork.rx) / timeDiff);
        totalTxSpeed = Math.max(0, (totalTxBytes - this.previousNetwork.tx) / timeDiff);
        const errorDiff = totalErrors - this.previousNetwork.errors;
        const packetDiff = (totalRxBytes + totalTxBytes - this.previousNetwork.rx - this.previousNetwork.tx) / 1500; // Approximate packets
        errorRate = packetDiff > 0 ? errorDiff / packetDiff : 0;
      }
    }
    
    this.previousNetwork = {
      rx: totalRxBytes,
      tx: totalTxBytes,
      errors: totalErrors,
      timestamp: Date.now(),
    };

    // Disk I/O calculations
    let totalReadRate = 0;
    let totalWriteRate = 0;
    let totalReadBytes = 0;
    let totalWriteBytes = 0;
    
    if (diskIO) {
      totalReadBytes = diskIO.rIO || 0;
      totalWriteBytes = diskIO.wIO || 0;
      
      if (this.previousDiskIO) {
        const timeDiff = (Date.now() - this.previousDiskIO.timestamp) / 1000;
        if (timeDiff > 0) {
          totalReadRate = Math.max(0, (totalReadBytes - this.previousDiskIO.readBytes) / timeDiff);
          totalWriteRate = Math.max(0, (totalWriteBytes - this.previousDiskIO.writeBytes) / timeDiff);
        }
      }
      
      this.previousDiskIO = {
        readBytes: totalReadBytes,
        writeBytes: totalWriteBytes,
        timestamp: Date.now(),
      };
    }

    // Process information
    const topCpu = processes.list
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 5)
      .map((p) => ({
        pid: p.pid,
        name: p.name,
        cpu: p.cpu,
        memory: p.mem,
      }));

    const topMemory = processes.list
      .sort((a, b) => b.mem - a.mem)
      .slice(0, 5)
      .map((p) => ({
        pid: p.pid,
        name: p.name,
        cpu: p.cpu,
        memory: p.mem,
      }));

    const zombieCount = processes.list.filter((p) => p.state === "zombie").length;
    const blockedCount = processes.list.filter((p) => p.state === "blocked" || p.state === "waiting").length;

    // Calculate per-interface speeds
    const interfaces = networkStats.map((iface) => {
      let rxSpeed = 0;
      let txSpeed = 0;
      
      if (this.previousNetwork) {
        const timeDiff = (Date.now() - this.previousNetwork.timestamp) / 1000;
        if (timeDiff > 0) {
          const prevRx = this.previousNetwork.rx; // Simplified - should track per interface
          const prevTx = this.previousNetwork.tx;
          rxSpeed = iface.rx_speed || 0;
          txSpeed = iface.tx_speed || 0;
        }
      }
      
      return {
        iface: iface.iface,
        rxBytes: iface.rx_bytes,
        txBytes: iface.tx_bytes,
        rxErrors: iface.rx_errors,
        txErrors: iface.tx_errors,
        rxSpeed,
        txSpeed,
      };
    });

    const metrics: SystemMetrics = {
      timestamp: Date.now(),
      cpu: {
        usage: cpu.currentLoad,
        loadAverage: [loadAvg['1'] || 0, loadAvg['5'] || 0, loadAvg['15'] || 0],
        temperature: cpuTemp.main ?? undefined,
        iowait: cpu.currentLoadIdle || 0,
      },
      memory: {
        total: mem.total,
        used: mem.used,
        free: mem.free,
        usedPercent: (mem.used / mem.total) * 100,
        available: mem.available || mem.free,
        availablePercent: ((mem.available || mem.free) / mem.total) * 100,
        swapTotal: mem.swaptotal,
        swapUsed: mem.swapused,
        swapPercent: mem.swaptotal > 0 ? (mem.swapused / mem.swaptotal) * 100 : 0,
      },
      disk: {
        mounts: disk.map((d) => ({
          fs: d.fs,
          mount: d.mount,
          size: d.size,
          used: d.used,
          available: d.available,
          usedPercent: d.use,
          // Inode information may not be available on all systems
          inodesTotal: (d as any).inodesTotal,
          inodesUsed: (d as any).inodesUsed,
          inodesFree: (d as any).inodesFree,
          inodesUsedPercent: (d as any).inodesUsedPercent || 
            ((d as any).inodesTotal && (d as any).inodesUsed) 
              ? ((d as any).inodesUsed / (d as any).inodesTotal) * 100 
              : undefined,
        })),
        totalReadBytes,
        totalWriteBytes,
        totalReadRate: totalReadRate,
        totalWriteRate: totalWriteRate,
      },
      network: {
        interfaces,
        totalRxBytes,
        totalTxBytes,
        totalRxErrors,
        totalTxErrors,
        errorRate,
        totalRxSpeed: totalRxSpeed,
        totalTxSpeed: totalTxSpeed,
      },
      processes: {
        running: processes.running,
        blocked: blockedCount,
        sleeping: processes.sleeping,
        zombie: zombieCount,
        total: processes.all,
        topCpu,
        topMemory,
      },
      fileDescriptors: openFiles ? {
        allocated: openFiles.allocated || 0,
        max: openFiles.max || 0,
        usedPercent: openFiles.max > 0 ? ((openFiles.allocated || 0) / openFiles.max) * 100 : 0,
      } : undefined,
    };

    return metrics;
  }

  start(): void {
    if (this.timer) {
      return;
    }

    console.log(`Starting metrics collector (interval: ${this.interval}ms)`);

    const collect = async () => {
      try {
        const metrics = await this.collectMetrics();
        this.emit("metrics", metrics);
      } catch (error) {
        this.emit("error", error);
      }
    };

    collect();
    this.timer = setInterval(collect, this.interval);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("Metrics collector stopped");
    }
  }
}
