export interface CpuMetrics {
  usage: number;
  loadAverage: number[];
  temperature?: number;
}

export interface MemoryMetrics {
  total: number;
  used: number;
  free: number;
  usedPercent: number;
  swapTotal: number;
  swapUsed: number;
  swapPercent: number;
}

export interface DiskMetrics {
  mounts: DiskMount[];
}

export interface DiskMount {
  fs: string;
  mount: string;
  size: number;
  used: number;
  available: number;
  usedPercent: number;
}

export interface NetworkMetrics {
  interfaces: NetworkInterface[];
  totalRxBytes: number;
  totalTxBytes: number;
  totalRxErrors: number;
  totalTxErrors: number;
  errorRate: number;
}

export interface NetworkInterface {
  iface: string;
  rxBytes: number;
  txBytes: number;
  rxErrors: number;
  txErrors: number;
}

export interface ProcessMetrics {
  running: number;
  blocked: number;
  sleeping: number;
  zombie: number;
  topCpu: ProcessInfo[];
  topMemory: ProcessInfo[];
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
}

export interface SystemMetrics {
  timestamp: number;
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disk: DiskMetrics;
  network: NetworkMetrics;
  processes: ProcessMetrics;
}
