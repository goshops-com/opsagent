# Monitoring Databases with OpsAgent

OpsAgent uses NetData for metrics collection, which supports monitoring a wide variety of databases and external services. When NetData detects issues with your databases, OpsAgent's AI analyzes them and suggests remediation actions.

## Supported Databases

NetData supports monitoring these databases out of the box:

| Database | Metrics | Documentation |
|----------|---------|---------------|
| **MongoDB** | Operations, connections, memory, replication | [Setup Guide](#mongodb) |
| **PostgreSQL** | Queries, connections, locks, replication | [NetData Docs](https://learn.netdata.cloud/docs/collecting-metrics/databases/postgresql) |
| **MySQL/MariaDB** | Queries, connections, InnoDB, replication | [NetData Docs](https://learn.netdata.cloud/docs/collecting-metrics/databases/mysql) |
| **Redis** | Commands, memory, keys, replication | [NetData Docs](https://learn.netdata.cloud/docs/collecting-metrics/databases/redis) |
| **Elasticsearch** | Indices, search, indexing, cluster health | [NetData Docs](https://learn.netdata.cloud/docs/collecting-metrics/databases/elasticsearch) |
| **CockroachDB** | SQL, storage, replication | [NetData Docs](https://learn.netdata.cloud/docs/collecting-metrics/databases/cockroachdb) |
| **ClickHouse** | Queries, inserts, merges, replication | [NetData Docs](https://learn.netdata.cloud/docs/collecting-metrics/databases/clickhouse) |

## MongoDB

### Metrics Collected

NetData collects comprehensive MongoDB metrics including:

- **Operations**: reads, writes, commands, latency
- **Connections**: active clients, queued operations, connection states
- **Memory**: resident/virtual memory, page faults, WiredTiger cache
- **Replication**: replica set states, lag, heartbeat latency
- **Transactions**: active/inactive, commit/abort rates
- **Cursors**: open cursors, timeouts, lifespans

### Setup

#### 1. Create a Monitoring User

Connect to MongoDB and create a read-only user for NetData:

```javascript
// Connect to MongoDB
mongosh -u admin -p <password> --authenticationDatabase admin

// Create monitoring user
db.getSiblingDB("admin").createUser({
  user: "netdata",
  pwd: "your-secure-password",
  roles: [
    { role: "read", db: "admin" },
    { role: "clusterMonitor", db: "admin" },
    { role: "read", db: "local" }
  ]
})
```

#### 2. Configure NetData

Create the MongoDB collector configuration:

```bash
# Create config file
sudo nano /etc/netdata/go.d/mongodb.conf
```

Add the configuration:

```yaml
jobs:
  - name: local_mongodb
    uri: mongodb://netdata:your-secure-password@localhost:27017/admin
    timeout: 2
```

For replica sets:

```yaml
jobs:
  - name: replica_set
    uri: mongodb://netdata:password@mongo1:27017,mongo2:27017,mongo3:27017/admin?replicaSet=rs0
    timeout: 5
```

#### 3. Create Custom Alerts

Create MongoDB-specific alerts for OpsAgent to monitor:

```bash
sudo nano /etc/netdata/health.d/mongodb.conf
```

```yaml
# High connection count
template: mongodb_connections_high
      on: mongodb.connections_usage
  lookup: average -1m unaligned of current
   units: connections
   every: 30s
    warn: $this > 1000
    crit: $this > 5000
    info: MongoDB connection count is high ($this connections)
      to: sysadmin

# High memory usage
template: mongodb_memory_high
      on: mongodb.memory_resident_size
  lookup: average -1m unaligned of resident
   units: GiB
   every: 30s
    warn: $this > 4
    crit: $this > 8
    info: MongoDB resident memory is high ($this GiB)
      to: sysadmin

# High operation latency
template: mongodb_latency_high
      on: mongodb.operations_latency_time
  lookup: average -1m unaligned of reads
   units: ms
   every: 30s
    warn: $this > 100
    crit: $this > 500
    info: MongoDB read latency is high ($this ms)
      to: sysadmin

# Replication lag (for replica sets)
template: mongodb_replication_lag
      on: mongodb.replication_lag
  lookup: average -1m unaligned
   units: seconds
   every: 30s
    warn: $this > 10
    crit: $this > 60
    info: MongoDB replication lag is high ($this seconds)
      to: sysadmin

# High queued operations
template: mongodb_queued_ops_high
      on: mongodb.queued_operations
  lookup: average -1m unaligned
   units: operations
   every: 30s
    warn: $this > 10
    crit: $this > 100
    info: MongoDB has queued operations ($this ops waiting)
      to: sysadmin
```

#### 4. Reload Configuration

```bash
# Reload NetData health configuration
sudo netdatacli reload-health

# Or restart NetData
sudo systemctl restart netdata
```

#### 5. Verify

Check that MongoDB metrics are being collected:

```bash
# Check NetData dashboard
open http://localhost:19999

# Or via API
curl -s "http://localhost:19999/api/v1/charts" | grep mongodb
```

### How OpsAgent Handles MongoDB Alerts

When NetData detects a MongoDB issue, OpsAgent:

1. **Receives the alert** via the NetData API
2. **Groups related alerts** to prevent notification spam
3. **Sends to AI for analysis** with context about the alert
4. **Recommends actions** based on the issue type

Example AI analysis for high connection count:

```
Alert: MongoDB connection count is high (2500 connections)

Analysis: The MongoDB server is experiencing an unusually high number of
connections. This could indicate:
- Connection pool misconfiguration in application
- Connection leak in application code
- Sudden traffic spike
- Slow queries causing connection buildup

Recommendations:
1. Check application connection pool settings
2. Review slow query log: db.currentOp({"secs_running": {$gt: 5}})
3. Monitor connection sources: db.serverStatus().connections
4. Consider enabling connection limits in MongoDB config

Actions:
- [notify_human] Alert ops team about connection spike
- [log_analysis] Check MongoDB logs for connection errors
```

## PostgreSQL

### Metrics Collected

NetData collects 70+ PostgreSQL metrics including:

- **Connections**: utilization, usage by state, per-database connections
- **Transactions**: rate, ratio (commit/rollback), duration
- **Locks**: held, awaited, utilization
- **Checkpoints**: rate, timing
- **Buffers**: I/O rate, allocation, backend fsync
- **WAL**: I/O rate
- **Database-specific**: size, cache hit ratio, temp files, deadlocks

### Setup

#### 1. Create a Monitoring User

```bash
# Connect to PostgreSQL
sudo -u postgres psql

# Create monitoring user with pg_monitor role
CREATE USER netdata WITH PASSWORD 'your-secure-password';
GRANT pg_monitor TO netdata;
```

#### 2. Configure NetData

```bash
sudo nano /etc/netdata/go.d/postgres.conf
```

```yaml
jobs:
  - name: local_postgres
    dsn: "postgresql://netdata:your-secure-password@localhost:5432/postgres?sslmode=disable"
    collect_databases_matching: "*"
```

For multiple databases or remote servers:

```yaml
jobs:
  - name: production_db
    dsn: "postgresql://netdata:password@db.example.com:5432/production"
    collect_databases_matching: "*"

  - name: analytics_db
    dsn: "postgresql://netdata:password@analytics.example.com:5432/analytics"
```

#### 3. Create Custom Alerts

```bash
sudo nano /etc/netdata/health.d/postgres.conf
```

```yaml
# Connection utilization
template: postgres_connections_high
      on: postgres.connections_utilization
  lookup: average -1m unaligned
   units: %
   every: 30s
    warn: $this > 70
    crit: $this > 90
    info: PostgreSQL connection utilization is high ($this%)
      to: sysadmin

# Transaction rate spike
template: postgres_transactions_high
      on: postgres.db_transactions_rate
  lookup: average -1m unaligned
   units: transactions/s
   every: 30s
    warn: $this > 1000
    crit: $this > 5000
    info: PostgreSQL transaction rate is high ($this txn/s)
      to: sysadmin

# Deadlock detection
template: postgres_deadlocks
      on: postgres.db_deadlocks_rate
  lookup: sum -5m unaligned
   units: deadlocks
   every: 1m
    warn: $this > 0
    info: PostgreSQL deadlocks detected ($this in last 5 min)
      to: sysadmin

# Lock contention
template: postgres_locks_high
      on: postgres.locks_utilization
  lookup: average -1m unaligned
   units: %
   every: 30s
    warn: $this > 50
    crit: $this > 80
    info: PostgreSQL lock utilization is high ($this%)
      to: sysadent

# Checkpoint frequency
template: postgres_checkpoints_high
      on: postgres.checkpoints_rate
  lookup: average -5m unaligned
   units: checkpoints/s
   every: 1m
    warn: $this > 0.1
    info: PostgreSQL checkpoint rate is high ($this/s)
      to: sysadmin

# Cache hit ratio (per database)
template: postgres_cache_miss_high
      on: postgres.db_cache_io_ratio
  lookup: average -5m unaligned
   units: %
   every: 1m
    warn: $this < 90
    crit: $this < 80
    info: PostgreSQL cache hit ratio is low ($this%)
      to: sysadmin
```

#### 4. Reload and Verify

```bash
# Reload health configuration
sudo netdatacli reload-health

# Check metrics are being collected
curl -s "http://localhost:19999/api/v1/charts" | grep postgres

# Check alerts
curl -s "http://localhost:19999/api/v1/alarms" | grep postgres
```

### Example OpsAgent Analysis

When a PostgreSQL alert fires, OpsAgent provides analysis like:

```
Alert: PostgreSQL connection utilization is high (85%)

Analysis: The PostgreSQL server is nearing its connection limit. This could
indicate:
- Application connection pool exhaustion
- Long-running queries holding connections
- Connection leak in application code
- Increased traffic beyond normal capacity

Recommendations:
1. Check active connections: SELECT * FROM pg_stat_activity;
2. Identify long-running queries: SELECT pid, now() - pg_stat_activity.query_start
   AS duration, query FROM pg_stat_activity WHERE state != 'idle';
3. Review connection pool settings (max_connections, pool_size)
4. Consider using PgBouncer for connection pooling

Actions:
- [notify_human] Alert DBA about connection pressure
- [log_analysis] Check PostgreSQL logs for connection errors
```

## Redis

### Quick Setup

```bash
# Configure NetData
sudo nano /etc/netdata/go.d/redis.conf
```

```yaml
jobs:
  - name: local
    address: redis://:password@localhost:6379
```

### Recommended Alerts

```yaml
# /etc/netdata/health.d/redis.conf

template: redis_memory_high
      on: redis.memory
  lookup: average -1m unaligned percentage of used
   units: %
   every: 30s
    warn: $this > 80
    crit: $this > 95
    info: Redis memory usage is high ($this%)

template: redis_connections_rejected
      on: redis.connections
  lookup: sum -5m unaligned of rejected
   units: connections
   every: 1m
    warn: $this > 0
    info: Redis is rejecting connections ($this rejected)

template: redis_keyspace_misses_high
      on: redis.keyspace_hit_rate
  lookup: average -5m unaligned
   units: %
   every: 1m
    warn: $this < 80
    info: Redis cache hit rate is low ($this%)
```

## Best Practices

### 1. Use Dedicated Monitoring Users

Always create a dedicated read-only user for monitoring:

```
MongoDB:  clusterMonitor + read roles
PostgreSQL: pg_monitor role
MySQL: SELECT + PROCESS + REPLICATION CLIENT grants
```

### 2. Set Appropriate Thresholds

Start with conservative thresholds and adjust based on your baseline:

```yaml
# Start conservative
warn: $this > 70
crit: $this > 90

# Adjust based on normal load
warn: $this > baseline * 1.5
crit: $this > baseline * 2.0
```

### 3. Use Lookup Windows

Use appropriate time windows to avoid false positives:

```yaml
# Short window for critical metrics
lookup: average -30s unaligned

# Longer window for trend metrics
lookup: average -5m unaligned
```

### 4. Group Related Alerts

OpsAgent automatically groups related alerts into issues. Configure your alerts to use consistent naming:

```yaml
# Good: Consistent naming allows grouping
template: mongodb_connections_high
template: mongodb_memory_high
template: mongodb_latency_high

# These will be grouped as one MongoDB issue if they fire together
```

## Troubleshooting

### NetData Not Collecting Metrics

1. Check collector status:
   ```bash
   curl -s "http://localhost:19999/api/v1/charts" | grep <database>
   ```

2. Check NetData logs:
   ```bash
   sudo journalctl -u netdata | grep <database>
   ```

3. Verify connectivity:
   ```bash
   # MongoDB
   mongosh -u netdata -p password --authenticationDatabase admin

   # PostgreSQL
   psql -U netdata -h localhost postgres
   ```

### Alerts Not Firing

1. Check alert configuration:
   ```bash
   curl -s "http://localhost:19999/api/v1/alarms?all" | grep <alert_name>
   ```

2. Verify thresholds against current values:
   ```bash
   curl -s "http://localhost:19999/api/v1/data?chart=<chart_name>&points=1"
   ```

3. Reload health configuration:
   ```bash
   sudo netdatacli reload-health
   ```

### OpsAgent Not Receiving Alerts

1. Check OpsAgent logs:
   ```bash
   opsagent logs
   ```

2. Verify NetData URL in config:
   ```bash
   cat ~/.opsagent/config/netdata.yaml
   ```

3. Test connectivity:
   ```bash
   curl -s "http://localhost:19999/api/v1/alarms"
   ```

## Further Reading

- [NetData Database Monitoring](https://learn.netdata.cloud/docs/collecting-metrics/databases)
- [NetData Alert Configuration](https://learn.netdata.cloud/docs/alerting/health-configuration-reference)
- [OpsAgent Configuration](../README.md#configuration)
