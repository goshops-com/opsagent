export interface CpuMetrics {
  usage: number;
  loadAverage: number[];
  temperature?: number;
  iowait?: number;
}

export interface MemoryMetrics {
  total: number;
  used: number;
  free: number;
  usedPercent: number;
  available: number;
  availablePercent: number;
  swapTotal: number;
  swapUsed: number;
  swapPercent: number;
}

export interface DiskMount {
  fs: string;
  mount: string;
  size: number;
  used: number;
  available: number;
  usedPercent: number;
  inodesTotal?: number;
  inodesUsed?: number;
  inodesFree?: number;
  inodesUsedPercent?: number;
}

export interface DiskMetrics {
  mounts: DiskMount[];
  totalReadBytes?: number;
  totalWriteBytes?: number;
  totalReadRate?: number;
  totalWriteRate?: number;
  iopsRead?: number;
  iopsWrite?: number;
}

export interface NetworkInterface {
  iface: string;
  rxBytes: number;
  txBytes: number;
  rxErrors: number;
  txErrors: number;
  rxSpeed?: number;
  txSpeed?: number;
}

export interface NetworkMetrics {
  interfaces: NetworkInterface[];
  totalRxBytes: number;
  totalTxBytes: number;
  totalRxErrors: number;
  totalTxErrors: number;
  errorRate: number;
  totalRxSpeed?: number;
  totalTxSpeed?: number;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
}

export interface ProcessMetrics {
  running: number;
  blocked: number;
  sleeping: number;
  zombie: number;
  total: number;
  topCpu: ProcessInfo[];
  topMemory: ProcessInfo[];
}

export interface SystemMetrics {
  timestamp: number;
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disk: DiskMetrics;
  network: NetworkMetrics;
  processes: ProcessMetrics;
  fileDescriptors?: {
    allocated: number;
    max: number;
    usedPercent: number;
  };
}
