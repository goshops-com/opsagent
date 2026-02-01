import { EventEmitter } from "events";
import si from "systeminformation";
import type { SystemMetrics } from "./metrics.js";

export class MetricsCollector extends EventEmitter {
  private interval: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private previousNetwork: { rx: number; tx: number; errors: number } | null = null;

  constructor(interval: number = 5000) {
    super();
    this.interval = interval;
  }

  async collectMetrics(): Promise<SystemMetrics> {
    const [cpu, cpuLoad, cpuTemp, mem, disk, networkStats, processes] =
      await Promise.all([
        si.currentLoad(),
        si.fullLoad(),
        si.cpuTemperature().catch(() => ({ main: undefined })),
        si.mem(),
        si.fsSize(),
        si.networkStats(),
        si.processes(),
      ]);

    const totalRxBytes = networkStats.reduce((sum, iface) => sum + iface.rx_bytes, 0);
    const totalTxBytes = networkStats.reduce((sum, iface) => sum + iface.tx_bytes, 0);
    const totalRxErrors = networkStats.reduce((sum, iface) => sum + iface.rx_errors, 0);
    const totalTxErrors = networkStats.reduce((sum, iface) => sum + iface.tx_errors, 0);
    const totalPackets = networkStats.reduce(
      (sum, iface) => sum + iface.rx_sec + iface.tx_sec,
      0
    );
    const totalErrors = totalRxErrors + totalTxErrors;
    const errorRate = totalPackets > 0 ? totalErrors / totalPackets : 0;

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

    const zombieCount = processes.list.filter(
      (p) => p.state === "zombie"
    ).length;

    const metrics: SystemMetrics = {
      timestamp: Date.now(),
      cpu: {
        usage: cpu.currentLoad,
        loadAverage: si.cpu().then(() => []).catch(() => []) as unknown as number[],
        temperature: cpuTemp.main ?? undefined,
      },
      memory: {
        total: mem.total,
        used: mem.used,
        free: mem.free,
        usedPercent: (mem.used / mem.total) * 100,
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
        })),
      },
      network: {
        interfaces: networkStats.map((iface) => ({
          iface: iface.iface,
          rxBytes: iface.rx_bytes,
          txBytes: iface.tx_bytes,
          rxErrors: iface.rx_errors,
          txErrors: iface.tx_errors,
        })),
        totalRxBytes,
        totalTxBytes,
        totalRxErrors,
        totalTxErrors,
        errorRate,
      },
      processes: {
        running: processes.running,
        blocked: processes.blocked,
        sleeping: processes.sleeping,
        zombie: zombieCount,
        topCpu,
        topMemory,
      },
    };

    // Fix load average
    try {
      const loadAvg = await si.currentLoad();
      metrics.cpu.loadAverage = [
        loadAvg.avgLoad || 0,
        loadAvg.avgLoad || 0,
        loadAvg.avgLoad || 0,
      ];
    } catch {
      metrics.cpu.loadAverage = [0, 0, 0];
    }

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
