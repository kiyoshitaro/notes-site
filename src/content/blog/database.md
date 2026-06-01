---
title: "Database: Ghi chú cơ bản"
pubDate: "2026-05-06"
published: true
contents_table: true
pinned: false
description: "Ghi chú về database: so sánh SQL/NoSQL/NewSQL, ACID vs BASE, MVCC, isolation levels, locking, optimistic/pessimistic, parameterized vs prepared statements, stored procedures, triggers, views."
cat: "misc"
useKatex: false
---

# Database

- [Database](#database)
  - [SQL vs NoSQL vs NewSQL](#sql-vs-nosql-vs-newsql)
  - [ACID vs BASE](#acid-vs-base)
    - [ACID (SQL)](#acid-sql)
      - [Atomicity](#atomicity)
      - [Consistency](#consistency)
      - [Isolation](#isolation)
      - [Durability](#durability)
    - [BASE (NoSQL)](#base-nosql)
  - [Vòng đời câu lệnh SQL](#vòng-đời-câu-lệnh-sql)
    - [1. Syntax Check](#1-syntax-check)
    - [2. Semantic Check](#2-semantic-check)
    - [3. Shared Pool Lookup (Soft Parse vs Hard Parse)](#3-shared-pool-lookup-soft-parse-vs-hard-parse)
    - [4. Optimizer — sinh Execution Plan](#4-optimizer--sinh-execution-plan)
    - [5. Execute](#5-execute)
  - [Concurrency Control](#concurrency-control)
    - [MVCC (Multi-Version Concurrency Control)](#mvcc-multi-version-concurrency-control)
    - [Concurrency Anomalies](#concurrency-anomalies)
    - [Isolation Levels](#isolation-levels)
  - [Locking](#locking)
    - [Lock Granularity](#lock-granularity)
    - [Types of Locks](#types-of-locks)
    - [Locking Strategy](#locking-strategy)
      - [Pessimistic Locking](#pessimistic-locking)
      - [Optimistic Locking](#optimistic-locking)
  - [Parameterized vs Prepared Statements](#parameterized-vs-prepared-statements)
    - [Parameterized Statement](#parameterized-statement)
    - [Prepared Statement](#prepared-statement)
    - [So sánh nhanh](#so-sánh-nhanh)
  - [Stored Procedures, Triggers, Views](#stored-procedures-triggers-views)
    - [Stored Procedures](#stored-procedures)
    - [Triggers](#triggers)
    - [Views](#views)
  - [Database Change Streams](#database-change-streams)
    - [CDC (Change Data Capture) qua WAL](#cdc-change-data-capture-qua-wal)
    - [LISTEN / NOTIFY](#listen--notify)
    - [Trigger + NOTIFY](#trigger--notify)
    - [Outbox Pattern](#outbox-pattern)
    - [So sánh các phương pháp](#so-sánh-các-phương-pháp)
  - [Storage Landscape — chọn đúng cho từng workload](#storage-landscape--chọn-đúng-cho-từng-workload)
    - [Tư duy nền: tại sao 1 RDBMS + 1 Redis không đủ](#tư-duy-nền-tại-sao-1-rdbms--1-redis-không-đủ)
    - [PostgreSQL — Swiss-army RDBMS](#postgresql--swiss-army-rdbms)
    - [MySQL / InnoDB — OLTP workhorse](#mysql--innodb--oltp-workhorse)
    - [Redis — in-memory KV + data structures](#redis--in-memory-kv--data-structures)
    - [MongoDB — document store](#mongodb--document-store)
    - [Cassandra / ScyllaDB — wide-column, AP, write-heavy](#cassandra--scylladb--wide-column-ap-write-heavy)
    - [Aerospike — hybrid memory/SSD KV](#aerospike--hybrid-memoryssd-kv)
    - [ClickHouse — column-store OLAP](#clickhouse--column-store-olap)
    - [TimescaleDB / InfluxDB — time-series](#timescaledb--influxdb--time-series)
    - [Elasticsearch / OpenSearch — search + log analytics](#elasticsearch--opensearch--search--log-analytics)
    - [DynamoDB — managed serverless KV/doc](#dynamodb--managed-serverless-kvdoc)
    - [Neo4j — native graph](#neo4j--native-graph)
    - [CockroachDB / Spanner / TiDB — distributed SQL](#cockroachdb--spanner--tidb--distributed-sql)
    - [Kiến trúc tổng hợp — mỗi storage nằm ở đâu](#kiến-trúc-tổng-hợp--mỗi-storage-nằm-ở-đâu)
    - [Decision matrix nhanh](#decision-matrix-nhanh)
  - [Tham khảo](#tham-khảo)

---

## SQL vs NoSQL vs NewSQL

| Loại | Mô tả | Ưu điểm | Nhược điểm | Ví dụ |
|------|-------|---------|------------|-------|
| **SQL** (Relational) | Lưu structured data, schema cố định, query bằng SQL | Strong consistency (ACID), join phức tạp tốt | Schema cứng, scale ngang khó | PostgreSQL, MySQL, Oracle |
| **NoSQL** | Schema linh hoạt, scale ngang dễ, xử lý unstructured/semi-structured | Throughput cao, schema động | Eventual consistency, join yếu | MongoDB, Cassandra, DynamoDB, Redis |
| **NewSQL** | Lai SQL + NoSQL — giữ ACID nhưng scale ngang | ACID + horizontal scale | Phức tạp, hệ sinh thái non hơn | CockroachDB, Google Spanner, VoltDB, TiDB |

**Scale**:

- **SQL**: scale ngang giới hạn — read replica hoặc manual sharding (phức tạp, tốn kém).((Sharding tay ở SQL: chia user theo `user_id % N`. Vấn đề khi resharding (N→N+1): hash thay đổi, phải migrate ~tất cả row. Giải pháp consistent hashing chỉ migrate ~1/N. Vì vậy NoSQL native sharding mới hấp dẫn.))
- **NoSQL**: built-in sharding, partition tự động → throughput đọc/ghi cao (social media, IoT, log).
- **NewSQL**: distributed SQL, dùng Paxos/Raft cho consensus → giữ ACID trên nhiều node.((Spanner dùng Paxos cho mỗi shard + 2PC cross-shard + TrueTime cho external consistency. CockroachDB dùng Raft + HLC (Hybrid Logical Clock). TiDB tách compute (TiDB) và storage (TiKV) dùng Raft.))

> **Note:** NoSQL chia 4 loại chính:
> - **Key-Value**: Redis, DynamoDB → cache, session.
> - **Document**: MongoDB, Couchbase → JSON-like, schema động.
> - **Column-Family**: Cassandra, HBase → write-heavy, time-series.
> - **Graph**: Neo4j, Dgraph → quan hệ phức tạp (social, fraud detection).

> **Tip:** Chọn DB theo workload, không theo trend. Cần join + transaction → SQL. Cần scale write huge + schema thay đổi nhanh → NoSQL. Cần cả hai → NewSQL (chấp nhận trade-off latency).

---

## ACID vs BASE

### ACID (SQL)

Đảm bảo transaction tin cậy trong relational database. 4 thuộc tính phụ thuộc nhau — Consistency dựa vào Atomicity + Isolation, Durability dựa vào WAL.

#### Atomicity

Tất cả operation (insert/update/delete) trong transaction **thành công cùng lúc** hoặc **rollback hết**. Crash giữa chừng → DB quay về trạng thái trước transaction.

```sql
-- Chuyển khoản: cả 2 UPDATE phải cùng thành công
BEGIN;
  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
  UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;
-- Crash trước COMMIT → ROLLBACK toàn bộ
```

**Kỹ thuật nền tảng**:

- **Write-Ahead Logging (WAL)**: ghi mọi thay đổi vào log file (append-only) trước khi áp vào data file. Log chứa **redo record** (lặp lại nếu fail trước commit) và **undo record** (quay ngược nếu abort). Crash → replay log để complete hoặc rollback.((Mỗi WAL record có **LSN** (Log Sequence Number) tăng dần. Page cũng nhớ LSN cuối cùng đã apply (`pageLSN`). Recovery so sánh: nếu `pageLSN < LSN` của redo record → apply lại; nếu ≥ → đã apply rồi, skip. Đây là cốt lõi idempotent recovery của ARIES.))
- **Two-Phase Commit (2PC)**: trong distributed DB —
  - **Phase 1 (Prepare)**: coordinator hỏi mọi node, mỗi node vote `YES` nếu sẵn sàng (lock resource, ghi prepare log).
  - **Phase 2 (Commit)**: nếu tất cả `YES` → commit; có 1 `NO` → abort, rollback toàn bộ node.((2PC **blocking**: coordinator chết sau Phase 1, mọi participant treo lock chờ. Giải pháp: 3PC thêm pre-commit phase nhưng không an toàn với network partition. Thực tế, hệ phân tán hiện đại dùng Paxos/Raft (có quorum, tự bầu lại leader) hoặc Saga (compensating transactions) thay 2PC.))
- **Shadow Paging**: write tạo bản copy của page, chỉ switch pointer khi commit (giống Git branch) → tránh partial write.((Lịch sử: System R (IBM, 1970s) dùng shadow paging. Vấn đề: copy nhiều, mất locality (page mới không gần page cũ trên disk → random I/O). LMDB (key-value store) là DB hiện đại hiếm hoi vẫn dùng — nhờ MMU + COW của OS.))

**Cách hoạt động chi tiết**:

1. **Begin**: lock resource hoặc tạo snapshot (MVCC).
2. **Execute**: ghi WAL trước (ví dụ `update balance -100 from 1000 to 900`), chưa flush data file.((Data page chỉ flush xuống disk theo lịch (checkpoint, dirty page eviction). Tách biệt WAL flush (sync, đảm bảo durability) và data flush (async, để tối ưu I/O) gọi là **steal/no-force** policy — chuẩn modern.))
3. **Commit**: flush WAL xuống disk (`fsync`), apply thay đổi vào data file.
4. **Fail**: recovery (ARIES) dùng WAL → redo committed ops, undo unfinished.((ARIES (Algorithm for Recovery and Isolation Exploiting Semantics) — IBM 1992. 3 phase: **Analysis** (scan WAL từ checkpoint cuối, dựng lại trạng thái), **Redo** (replay all changes, idempotent nhờ LSN check), **Undo** (rollback transaction chưa commit). Hầu hết DB modern (PG, MySQL, SQL Server) dùng biến thể của ARIES.))

> **Note:** MySQL InnoDB dùng WAL (redo log) + 2PC giữa binlog và InnoDB log. Oracle dùng redo + undo log riêng. MongoDB từ v4.0 hỗ trợ multi-document atomicity qua WAL.

#### Consistency

Sau transaction, DB ở **trạng thái hợp lệ** — tuân thủ mọi integrity constraint (PK, FK, CHECK, UNIQUE, trigger). Vi phạm → abort + rollback.

```sql
-- CHECK constraint
CREATE TABLE accounts (
    id INT PRIMARY KEY,
    balance NUMERIC CHECK (balance >= 0)
);

-- Vi phạm constraint → rollback
BEGIN;
UPDATE accounts SET balance = -50 WHERE id = 1;
-- ERROR: new row violates check constraint "accounts_balance_check"
COMMIT;  -- thực ra đã rollback ở UPDATE
```

**Kỹ thuật nền tảng**:

- **Integrity Constraint Enforcement**: DB kiểm tra constraint trước/sau mỗi statement (hoặc deferred — cuối transaction).((Deferred constraint hữu ích cho cyclic FK: `INSERT employee (manager_id=2)` rồi `INSERT employee (id=2)`. Set `DEFERRABLE INITIALLY DEFERRED` → check ở `COMMIT`, cho phép cả 2 insert ngược thứ tự.))
- **Transaction Validation**: optimistic concurrency validate ở commit phase (check conflict version).
- **ARIES Recovery**: sau crash, recover về trạng thái consistent bằng redo/undo, đảm bảo constraint không bị vi phạm.

> **Tip:** Consistency của ACID **khác** Consistency của CAP. ACID nói về tính hợp lệ của data theo rule app/DB. CAP nói về việc các replica đồng bộ với nhau. Đừng nhầm.

> **Warning:** Consistency phụ thuộc Atomicity (rollback khi fail) + Isolation (không transaction khác phá rule giữa chừng). Yếu 1 trong 2 → consistency vỡ.

#### Isolation

Nhiều transaction chạy đồng thời nhưng kết quả như chạy **tuần tự** — tránh dirty/non-repeatable/phantom read (xem phần [Concurrency Anomalies](#concurrency-anomalies)).

**Kỹ thuật nền tảng**:

- **Locking (Pessimistic CC)**: lock row/table trước khi read/write. Shared lock cho read, exclusive lock cho write. Isolation level kiểm soát strictness.
- **MVCC (Multi-Version Concurrency Control)**: giữ nhiều version của row + timestamp. Read dùng snapshot — không cần lock. Write check conflict ở commit.((Snapshot Isolation (SI) là biến thể MVCC phổ biến. Vẫn có anomaly **write skew** mà SI không tránh được — ví dụ: 2 bác sĩ cùng off-call, mỗi người check còn ≥1 người on-call (true với snapshot riêng) → cả 2 cùng off → 0 người on-call. Cần Serializable Snapshot Isolation (SSI) trong PG để tránh.))
- **Two-Phase Locking (2PL)**:
  - **Growing phase**: chỉ acquire lock, không release.
  - **Shrinking phase**: chỉ release, không acquire.
  - Đảm bảo serializability, kết hợp deadlock detection.((**Strict 2PL**: giữ exclusive lock đến khi commit/abort (không release ở shrinking phase) — tránh cascading abort. **Rigorous 2PL**: giữ cả shared + exclusive lock đến commit. Hầu hết DB dùng Strict hoặc Rigorous, không phải 2PL "thuần".))

> **Note:** PostgreSQL + MongoDB dùng MVCC thuần. Oracle kết hợp locking + MVCC. SQL Server có cả 2 mode (`READ_COMMITTED_SNAPSHOT` để chuyển sang MVCC).

#### Durability

Sau `COMMIT` thành công, data **tồn tại vĩnh viễn** — kể cả mất điện ngay sau đó.

**Kỹ thuật nền tảng**:

- **WAL + fsync**: ghi commit record vào WAL trên non-volatile storage (disk/SSD), gọi `fsync()` để force flush buffer OS xuống đĩa **trước khi** trả về client `OK`.((`fsync()` không phải lúc nào cũng đáng tin. Vụ "fsyncgate" 2018: PostgreSQL phát hiện Linux có thể nuốt lỗi fsync — nếu OS retry fail và evict dirty page, data mất nhưng `fsync()` vẫn trả OK. PG phải patch để PANIC khi fsync fail.))
- **Replication**: sao chép data/log sang nhiều node (sync hoặc async). Commit chỉ confirm sau khi majority node ghi nhận → chống mất 1 node.((PostgreSQL `synchronous_commit` levels: `off` (no fsync, mất data khi crash) → `local` (fsync local) → `remote_write` (replica nhận log) → `on` (replica fsync) → `remote_apply` (replica apply xong). Mỗi level đổi latency lấy durability.))
- **ARIES Recovery**: sau crash, replay WAL từ last checkpoint → redo mọi committed transaction.
- **Battery-Backed Cache / NVRAM**: hardware giữ data trong cache RAM kể cả mất điện → tăng tốc WAL flush.

**Cách hoạt động chi tiết**:

1. **Commit**: ghi commit record vào WAL → `fsync()` → trả `OK` cho client.
2. **Crash**: khi khởi động lại, recovery đọc WAL từ checkpoint cuối, redo committed ops.
3. **Distributed**: 2PC Phase 2 ghi log trên tất cả node. Raft/Paxos replicate log đến quorum trước khi commit.

> **Note:** MySQL dùng binlog (WAL variant) cho replication. MongoDB dùng `oplog`. Spanner dùng Paxos cho global durability cross-region.

> **Warning:** `fsync()` đắt — vài ms đến hàng chục ms. Vì vậy commit nhanh nhất khi **batch** nhiều transaction (group commit). Tắt `fsync` (`synchronous_commit = off` trong PostgreSQL) → nhanh hơn nhưng **mất durability** với crash giữa flush.

> **Tip:** SSD enterprise có capacitor đảm bảo flush khi mất điện. SSD consumer thường lừa: trả `OK` cho `fsync` nhưng data vẫn trong DRAM cache → mất điện = mất data. Quan trọng với DB → dùng SSD enterprise hoặc RAID + UPS.

### BASE (NoSQL)

Ưu tiên availability + scalability hơn consistency tức thời.

| Thuộc tính | Ý nghĩa |
|------------|---------|
| **Basically Available** | Hệ thống luôn phản hồi (có thể stale data) — replication nhiều node |
| **Soft State** | Trạng thái có thể thay đổi theo thời gian, không cần đồng bộ ngay |
| **Eventual Consistency** | Sau đủ thời gian, mọi node sẽ hội tụ về cùng giá trị |

> **Warning:** Eventual consistency nghĩa là trong khoảng thời gian ngắn, hai user có thể đọc 2 giá trị khác nhau. Không phù hợp banking, financial transaction. Phù hợp social feed, like count, comment.

**Ví dụ Eventual Consistency**: Cassandra với `replication_factor=3`, write `QUORUM` (2/3 node), read `ONE`. User A vừa write, user B read từ node chưa replicate xong → thấy giá trị cũ. Vài ms sau, node sync xong → mọi đọc trả giá trị mới.

---

## Vòng đời câu lệnh SQL

Khi gửi 1 câu lệnh SQL tới DB engine, nó đi qua các bước sau trước khi trả kết quả:

```
SQL string
   │
   ▼
[1] Syntax Check        ── parse cú pháp
   │
   ▼
[2] Semantic Check      ── kiểm tra object + quyền
   │
   ▼
[3] Shared Pool Lookup  ── plan đã có chưa?
   │       │
   │       ├── Có  → Soft Parse → reuse plan
   │       └── Không → Hard Parse
   │                      │
   │                      ▼
   │              [4] Optimizer sinh Execution Plan
   │                      │
   │                      └── lưu vào Shared Pool
   │
   ▼
[5] Execute → trả kết quả
```

### 1. Syntax Check

Kiểm tra cú pháp SQL có đúng chuẩn không (từ khóa, dấu phẩy, ngoặc, kiểu literal...). Nếu sai → báo lỗi, dừng ngay.((Parser dùng grammar (thường là LALR(1) như Bison). Output là **parse tree** / **AST**. PostgreSQL: xem `src/backend/parser/gram.y` ~17k dòng — toàn bộ ngữ pháp SQL của PG.))

```sql
-- Syntax error: thiếu FROM
SELECT id name users WHERE id = 1;
-- ERROR: syntax error at or near "users"
```

### 2. Semantic Check

Kiểm tra **ngữ nghĩa**: bảng/cột có tồn tại không? user có quyền truy cập không? data type có khớp không?

```sql
-- Semantic error: cột không tồn tại
SELECT phone_number FROM users WHERE id = 1;
-- ERROR: column "phone_number" does not exist

-- Semantic error: thiếu quyền
SELECT * FROM admin_secrets;
-- ERROR: permission denied for table admin_secrets
```

> **Note:** Bước này còn gọi là **binding/name resolution** — gán mỗi tên (table, column, function) vào object thật trong catalog (`pg_class`, `pg_attribute` ở PostgreSQL).

### 3. Shared Pool Lookup (Soft Parse vs Hard Parse)

DB engine giữ vùng nhớ **Shared Pool** (hoặc **Plan Cache**) chứa execution plan của các query đã chạy. Engine hash query string → tra trong cache.

| Loại | Tình huống | Chi phí |
|------|-----------|---------|
| **Soft Parse** | Plan đã có trong cache → reuse | Rẻ — chỉ lookup |
| **Hard Parse** | Plan chưa có → tạo mới | Đắt — chạy optimizer |((Order of magnitude: soft parse ~vài chục µs, hard parse ~vài ms đến hàng chục ms. Với app OLTP làm nghìn query/giây mà toàn hard parse → CPU 100% optimizer, throughput sụp.))

> **Tip:** Hard parse rất tốn CPU. Nếu app không dùng parameterized/prepared statement, mỗi value khác nhau sẽ tạo query string khác nhau → cache miss → hard parse mỗi lần. Đây là 1 lý do chính khiến parameterized statement vừa **bảo mật** (chống SQL injection) vừa **nhanh** (tận dụng plan cache).

```sql
-- Mỗi câu là query string khác → cache miss → hard parse
SELECT * FROM users WHERE id = 1;
SELECT * FROM users WHERE id = 2;
SELECT * FROM users WHERE id = 3;

-- Cùng 1 plan, chỉ khác bind variable → soft parse
PREPARE q AS SELECT * FROM users WHERE id = $1;
EXECUTE q(1);
EXECUTE q(2);
EXECUTE q(3);
```

> **Warning:** Plan cache không phải vô hạn. Plan có thể bị **invalidate** khi: schema đổi (`ALTER TABLE`), statistics update (`ANALYZE`), hoặc bị evict do LRU. Sau đó query gặp lại → hard parse.

### 4. Optimizer — sinh Execution Plan

Khi hard parse, **query optimizer** xem xét nhiều chiến lược để chọn plan rẻ nhất (cost-based):

- **Access path**: full table scan vs index scan vs index-only scan.((Index không phải lúc nào cũng nhanh hơn. Nếu cần đọc >5–10% row của bảng, full scan có thể nhanh hơn vì sequential I/O > random I/O. Optimizer ước số row qua statistics để quyết định.))
- **Join order**: A⋈B⋈C — thứ tự nào ít row trung gian nhất?((N table có N! cách permute join order. PG dùng dynamic programming cho ≤12 table. Trên 12 table → bật **GEQO** (Genetic Query Optimizer): random permute, mutate, chọn plan tốt nhất trong thời gian giới hạn — không tối ưu tuyệt đối nhưng good enough.))
- **Join algorithm**: nested loop / hash join / merge join.((Rule of thumb: nested loop tốt khi outer ít row + inner có index. Hash join tốt khi cả 2 lớn, đủ memory. Merge join tốt khi cả 2 đã sorted (vd theo index).))
- **Statistics**: dùng số liệu trong catalog (`pg_statistic`) — số row, distinct, histogram phân bố.

Plan được sinh xong → **lưu vào Shared Pool** để lần sau reuse.

```sql
-- Xem execution plan
EXPLAIN ANALYZE
SELECT u.name, COUNT(o.id)
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE u.created_at > NOW() - INTERVAL '30 days'
GROUP BY u.name;
```

Output ví dụ:

```
HashAggregate  (cost=125.50..130.00 rows=200 width=40)
  Group Key: u.name
  ->  Hash Right Join  (cost=50.00..120.00 rows=1000 width=36)
        Hash Cond: (o.user_id = u.id)
        ->  Seq Scan on orders o  (cost=0.00..40.00 rows=2000 width=8)
        ->  Hash  (cost=45.00..45.00 rows=200 width=32)
              ->  Index Scan using users_created_at_idx on users u
                    Index Cond: (created_at > now() - '30 days'::interval)
```

Đọc plan: `cost=startup..total` — `startup` là chi phí đến row đầu tiên, `total` là chi phí lấy hết.((Đơn vị cost không phải millisecond. PG dùng `seq_page_cost=1.0` làm baseline; `random_page_cost=4.0`, `cpu_tuple_cost=0.01`. Tune các param này khi dùng SSD (random gần bằng seq → set `random_page_cost=1.1`).)) `rows` là số row ước tính — lệch xa thực tế (`actual rows` khi `EXPLAIN ANALYZE`) → dấu hiệu statistics cũ.

> **Note:** Statistics lệch → optimizer chọn sai plan (ví dụ ước row sai → dùng nested loop khi cần hash join). Fix: chạy `ANALYZE table_name` định kỳ, hoặc bật autoanalyze.

### 5. Execute

Engine chạy plan: gọi storage layer, đọc page từ buffer pool/disk, áp filter, join, aggregate, trả kết quả về client.

> **Tip:** Bottleneck thường nằm ở bước này (I/O, CPU). Tối ưu bằng: index đúng, viết query để optimizer hiểu được (tránh function trên cột indexed như `WHERE LOWER(email) = ...`), giảm row trả về (`LIMIT`, projection cụ thể thay `SELECT *`).

---

## Concurrency Control

### MVCC (Multi-Version Concurrency Control)

Mỗi transaction thấy **snapshot riêng** của data tại thời điểm bắt đầu. Đọc không chặn ghi, ghi không chặn đọc.

- Mỗi row có thêm metadata: `xmin` (transaction tạo), `xmax` (transaction xóa).
- Khi UPDATE, tạo row version mới — row cũ vẫn tồn tại cho transaction cũ đọc.((PG: UPDATE = INSERT version mới + đánh dấu version cũ chết (set `xmax`). Index entry cũng phải cập nhật trừ khi dùng **HOT (Heap-Only Tuple)** update — nếu cột update không có index và còn chỗ trên cùng page → chỉ cần update heap, không update index. HOT giảm bloat đáng kể.))
- Process **VACUUM** dọn version cũ không còn ai đọc.((Long-running transaction giữ snapshot cũ → VACUUM không dọn được dead tuple → bloat. Monitor `pg_stat_activity` cho session `idle in transaction` quá lâu, kill nếu cần. Cũng watch `txid_current() - pg_stat_activity.backend_xmin` — gap lớn = vacuum bị block.))

```sql
-- PostgreSQL: xem version metadata
SELECT xmin, xmax, * FROM accounts WHERE id = 1;
```

> **Note:** PostgreSQL dùng MVCC native. MySQL InnoDB cũng dùng MVCC qua undo log. Oracle dùng MVCC qua rollback segments.

> **Tip:** VACUUM bị bỏ quên → table bloat (file lớn nhưng phần lớn là dead tuples). Bật `autovacuum`, monitor `pg_stat_user_tables.n_dead_tup`.

### Concurrency Anomalies

| Anomaly | Mô tả | Ví dụ |
|---------|-------|-------|
| **Dirty Read** | Đọc data chưa commit từ transaction khác. Nếu kia rollback → đọc sai. | A sửa balance 500k → 700k (chưa commit). B đọc thấy 700k. A rollback → B dùng dữ liệu sai. |
| **Non-Repeatable Read** | Đọc lại cùng row → giá trị khác do transaction khác commit ở giữa. | A đọc balance = 500k. B sửa thành 600k và commit. A đọc lại = 600k → khác lần đầu. |
| **Phantom Read** | Đọc lại tập kết quả → có row mới/biến mất do transaction khác commit. | A `SELECT COUNT(*) WHERE amount > 100k` = 5. B insert 1 đơn > 100k và commit. A đọc lại = 6 → "ma" xuất hiện. |
| **Lost Update** | 2 transaction ghi đè lẫn nhau, mất một bên. | A đọc 500k, B đọc 500k. A → 600k commit. B → 700k commit. Mất update của A. |
| **Write Skew** | Mỗi transaction đọc + ghi vào row khác nhau, riêng lẻ hợp lệ nhưng tổng thể vi phạm constraint. | 2 bác sĩ cùng off-call: mỗi người check thấy còn 1 đồng nghiệp on-call → cùng off → 0 người on-call. ((Anomaly đặc trưng của Snapshot Isolation. Cần Serializable hoặc explicit `SELECT ... FOR UPDATE` trên condition row để tránh.)) |

> **Note:** Lost Update **không** được liệt kê trong 4 anomaly chính của ANSI SQL isolation, nhưng vẫn là vấn đề thực tế. Giải bằng `SELECT ... FOR UPDATE` (pessimistic) hoặc version column (optimistic).

### Isolation Levels

| Level | Mô tả | Tránh được | Ví dụ |
|-------|-------|------------|-------|
| **Read Uncommitted** | Cho phép đọc data chưa commit | (không tránh gì) | A sửa giá 100k → 200k chưa commit. B đọc 200k. A rollback → B sai. |
| **Read Committed** | Chỉ đọc data đã commit | Dirty Read | A đọc 5 user. B insert + commit. A đọc lại = 6 user. |
| **Repeatable Read** | Snapshot row đã đọc giữ nguyên trong transaction | Dirty + Non-Repeatable | A đọc tổng lương = 100tr. B thêm nhân viên + commit. A đọc lại = 100tr (vẫn snapshot). |
| **Serializable** | Như chạy tuần tự — khóa cả range | Dirty + Non-Repeatable + Phantom | A `SELECT ... WHERE amount > 100k`. B insert > 100k → block đến khi A xong. |

```sql
-- Set isolation level cho 1 transaction
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SELECT SUM(amount) FROM orders WHERE status = 'pending';
-- ...
COMMIT;
```

**Ví dụ cụ thể** — 2 transaction chạy song song trên cùng row:

Setup ban đầu:

```sql
INSERT INTO accounts VALUES (1, 1000);
```

Transaction A (đọc rồi sửa, có delay):

```sql
BEGIN TRANSACTION;
SELECT balance FROM accounts WHERE id = 1;   -- (1) đọc lần đầu
WAITFOR DELAY '00:00:05';                    -- chờ 5s (mô phỏng xử lý)
SELECT balance FROM accounts WHERE id = 1;   -- (2) đọc lại
UPDATE accounts SET balance = balance + 100 WHERE id = 1;
COMMIT;
```

Transaction B (chạy xen vào trong 5s đó):

```sql
BEGIN TRANSACTION;
UPDATE accounts SET balance = balance - 500 WHERE id = 1;
COMMIT;
```

Hành vi theo từng isolation level:

| Isolation Level | Hành vi của A | Hiện tượng |
|-----------------|---------------|------------|
| **Read Uncommitted** | A có thể thấy `balance = 500` ở (2) **ngay cả khi B chưa commit** | ❌ Dirty Read |
| **Read Committed** | A thấy `1000` ở (1). Nếu B commit trước khi A đọc lại, A thấy `500` ở (2) | ✅ Chặn Dirty Read — ❌ vẫn Non-Repeatable Read |
| **Repeatable Read** | A luôn thấy `1000` ở cả (1) và (2), kể cả B đã commit | ✅ Chặn Dirty + Non-Repeatable — ❌ vẫn Phantom Read (với range query) |
| **Serializable** | B bị block (hoặc 1 trong 2 bị abort & retry) → A và B thực thi như chạy tuần tự | ✅ Chặn cả 3 hiện tượng |

> **Note:** `WAITFOR DELAY` là cú pháp **SQL Server**. PostgreSQL dùng `SELECT pg_sleep(5)`, MySQL dùng `SELECT SLEEP(5)`. Mục đích chỉ để tạo "khe hở" cho transaction B chen vào — minh họa anomaly.

> **Note:** Trong **Read Committed**, A đọc `(1)` thấy `1000`. Sau khi B commit, A đọc lại `(2)` thấy `500`. Cùng 1 transaction nhưng 2 lần đọc khác nhau → đây chính là Non-Repeatable Read. Trong **Repeatable Read**, A có **snapshot** từ lúc bắt đầu nên cả 2 lần đọc đều thấy `1000`.

> **Warning:** Ở Serializable, không phải lúc nào cũng "block". PostgreSQL dùng **SSI (Serializable Snapshot Isolation)** — không khóa, mà detect dependency cycle khi commit và **abort** 1 transaction (`could not serialize access due to read/write dependencies`). App phải retry. SQL Server thường block bằng range lock.

> **Tip:** Mức cao hơn → ít lỗi hơn nhưng chậm hơn (khóa nhiều / abort nhiều). PostgreSQL default = `Read Committed`. Banking, financial → `Serializable`. App thường → `Read Committed` đủ.

> **Warning:** Repeatable Read trong PostgreSQL **đã tránh được Phantom Read** (do dùng snapshot MVCC), khác chuẩn ANSI SQL. MySQL InnoDB cũng vậy nhờ next-key lock. Đọc kỹ docs DB cụ thể.

---

## Locking

Cơ chế giải quyết anomaly trong isolation levels.

### Lock Granularity

| Level | Mô tả | Khi dùng |
|-------|-------|----------|
| **Database** | Khóa toàn DB | Backup, migration lớn (hiếm) |
| **Table** | Khóa toàn bảng | DDL (`ALTER TABLE`), `LOCK TABLE` |
| **Page** | Khóa 1 page (nhóm row) | SQL Server, một số engine cũ |
| **Row** | Khóa 1 row cụ thể | Phổ biến nhất — InnoDB, PostgreSQL |
| **Column** | Khóa 1 cột | Hiếm, chỉ vài DB column-store |

> **Note:** Granularity nhỏ → concurrency cao hơn, nhưng overhead quản lý lock lớn hơn. Engine có **lock escalation**: nhiều row lock → chuyển thành table lock để tiết kiệm memory.((SQL Server escalate khi >5000 row lock trên cùng object. Sau escalate, mọi row lock biến thành 1 table lock → throughput sụp. Tránh: dùng `WITH (ROWLOCK)` hint hoặc tách batch nhỏ + commit từng phần. PG không có lock escalation — mỗi row lock chỉ tốn 0 byte memory (lưu trong row header, dùng xid).))

### Types of Locks

| Lock | Ký hiệu | Mục đích | Conflict với |
|------|---------|----------|--------------|
| **Shared (S)** | S-Lock | Đọc — nhiều transaction đọc cùng lúc | X |
| **Exclusive (X)** | X-Lock | Ghi — chỉ 1 transaction | S, X, U |
| **Update (U)** | U-Lock | Sắp ghi (intention) | X, U |
| **Intent (IS, IX)** | Intent | Báo hiệu khóa cấp thấp hơn | (theo bảng compatibility) |
| **Schema** | SCH-M, SCH-S | Bảo vệ DDL | DDL khác |

```sql
-- PostgreSQL/MySQL: lock row khi đọc để ghi sau
BEGIN;
SELECT * FROM accounts WHERE id = 1 FOR UPDATE;  -- X-lock row
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
COMMIT;

-- Shared lock
SELECT * FROM accounts WHERE id = 1 FOR SHARE;   -- S-lock row
```

**Lock compatibility matrix** (đơn giản hóa):

|     | S   | X   |
|-----|-----|-----|
| **S** | OK  | NO  |
| **X** | NO  | NO  |

### Locking Strategy

#### Pessimistic Locking

Giả định xung đột **sẽ xảy ra** → khóa ngay từ đầu.

```sql
-- Ví dụ: trừ tồn kho an toàn
BEGIN;
SELECT stock FROM products WHERE id = 1 FOR UPDATE;  -- khóa row
-- Logic kiểm tra stock >= quantity
UPDATE products SET stock = stock - 1 WHERE id = 1;
COMMIT;
```

- ✅ Đảm bảo nhất quán tuyệt đối.
- ❌ Bottleneck nếu nhiều transaction cùng vào — xếp hàng chờ.
- ❌ Risk **deadlock** nếu khóa nhiều row theo thứ tự khác nhau.((`FOR UPDATE SKIP LOCKED` — bỏ qua row đang khóa, không chờ. Cực hữu ích cho **job queue**: nhiều worker `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1` để mỗi worker grab job khác nhau, không tranh nhau, không deadlock.))

> **Warning:** Deadlock xảy ra khi A khóa row X chờ row Y, B khóa Y chờ X. DB engine detect và abort 1 transaction (`deadlock detected`). Tránh bằng cách: luôn khóa theo cùng thứ tự (ví dụ `ORDER BY id`).

#### Optimistic Locking

Giả định xung đột **hiếm xảy ra** → không khóa, kiểm tra khi commit.

```sql
-- Schema: thêm cột version
CREATE TABLE products (
  id INT PRIMARY KEY,
  stock INT,
  version INT DEFAULT 0
);

-- Đọc
SELECT id, stock, version FROM products WHERE id = 1;
-- => stock=10, version=3

-- Cập nhật: chỉ thành công nếu version chưa thay đổi
UPDATE products
SET stock = 9, version = version + 1
WHERE id = 1 AND version = 3;
-- Nếu rows_affected = 0 → có người sửa rồi → retry hoặc báo lỗi
```

Ví dụ Go (dùng `database/sql`):

```go
func decrementStock(db *sql.DB, id int) error {
    for attempt := 0; attempt < 3; attempt++ {
        var stock, version int
        err := db.QueryRow(
            "SELECT stock, version FROM products WHERE id = $1", id,
        ).Scan(&stock, &version)
        if err != nil { return err }
        if stock <= 0 { return errors.New("out of stock") }

        res, err := db.Exec(
            "UPDATE products SET stock = $1, version = $2 WHERE id = $3 AND version = $4",
            stock-1, version+1, id, version,
        )
        if err != nil { return err }
        affected, _ := res.RowsAffected()
        if affected == 1 { return nil }
        // Conflict → retry
    }
    return errors.New("max retries exceeded")
}
```

- ✅ Throughput cao, không block.
- ❌ Cần handle retry logic.
- ❌ Không phù hợp khi tỉ lệ conflict cao (retry storm).((Retry storm: conflict cao → tất cả retry cùng lúc → conflict tiếp → retry tiếp → CPU 100%. Giải pháp: **exponential backoff + jitter** — `sleep(min(cap, base * 2^attempt) + random(0, base))`. AWS SDK pattern. Rất quan trọng với optimistic lock.))

> **Tip:** Quy tắc thumb: read-heavy + ít conflict → optimistic. Write-heavy + nhiều conflict (flash sale, ticket booking) → pessimistic hoặc queue.

---

## Parameterized vs Prepared Statements

### Parameterized Statement

SQL template với placeholder (`?`, `$1`, `:name`) — driver/app layer truyền giá trị riêng. Mỗi lần gọi, driver thường gửi cả query + params.

```python
# Python (psycopg2)
cursor.execute("SELECT * FROM users WHERE id = %s AND status = %s", [5, "active"])
```

```javascript
// Node.js (pg)
await client.query("SELECT * FROM users WHERE id = $1", [5]);
```

```go
// Go (database/sql)
rows, err := db.Query("SELECT * FROM users WHERE id = ?", 5)
```

**Lợi ích**:
- 🛡️ **Chống SQL injection** — input không bị parse như SQL.((Vì sao chống được? Driver gửi query template + binary param tách biệt. DB parse template TRƯỚC khi nhìn thấy param. Param đến sau như **giá trị**, không phải **token SQL** → không thể chèn `'; DROP TABLE users; --` thành lệnh.))
- ⚡ **Cache plan** — DB có thể cache plan cho query template.
- 🧹 **Maintainable** — tách logic và data.

### Prepared Statement

Query được **biên dịch trước** và lưu trong DB engine, sau đó execute nhiều lần với data khác nhau.

```sql
-- PostgreSQL
PREPARE get_user (INT) AS
  SELECT * FROM users WHERE id = $1;

EXECUTE get_user(5);
EXECUTE get_user(10);
EXECUTE get_user(15);

DEALLOCATE get_user;
```

```sql
-- MySQL
PREPARE stmt FROM 'SELECT * FROM users WHERE id = ?';
SET @id = 5;
EXECUTE stmt USING @id;
DEALLOCATE PREPARE stmt;
```

**Lợi ích**:
- 🛡️ Chống SQL injection (như parameterized).
- ⚡ Parse + plan **chỉ 1 lần**, execute nhiều lần → giảm overhead khi loop.
- 🧹 Centralize query logic.

### So sánh nhanh

| Tiêu chí | Parameterized | Prepared |
|----------|---------------|----------|
| Vị trí | App layer (driver) | DB engine |
| Lifetime | Mỗi lần execute | Persist trong session/connection |
| Plan cache | Có thể (driver-dependent) | Bắt buộc, server-side |
| Use case | Query thông thường | Loop nhiều lần với param khác nhau |

> **Note:** Nhiều driver hiện đại (JDBC, psycopg2, pgx) tự động chuyển parameterized query sang prepared statement ở dưới hood. Tách bạch chỉ rõ ràng khi `PREPARE` thủ công.

> **Warning:** Prepared statement **bind theo connection**. Connection pool có thể tái dùng connection khác → `EXECUTE` không thấy statement → lỗi. Nhiều framework (Hibernate, Sequelize) handle tự động.

---

## Stored Procedures, Triggers, Views

### Stored Procedures

Tập hợp SQL được biên dịch trước, lưu trong DB, gọi bằng tên + params.

```sql
-- PostgreSQL
CREATE OR REPLACE PROCEDURE transfer_money(
    sender_id INT,
    receiver_id INT,
    amount NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE accounts SET balance = balance - amount WHERE id = sender_id;
    UPDATE accounts SET balance = balance + amount WHERE id = receiver_id;
    INSERT INTO transactions(sender, receiver, amount, created_at)
        VALUES (sender_id, receiver_id, amount, NOW());
END;
$$;

-- Gọi
CALL transfer_money(1, 2, 100);
```

**Lợi ích**:
- ♻️ **Reusability** — gọi từ app, script, job khác nhau.
- ⚡ **Performance** — precompiled, plan cache.
- 🛡️ **Security** — grant `EXECUTE` thay vì grant trực tiếp `SELECT/UPDATE` lên table.
- 🧹 **Maintenance** — logic tập trung, sửa 1 chỗ.

> **Warning:** Anti-pattern phổ biến: nhồi business logic vào stored procedure → khó test, khó version, khó migrate sang DB khác. Thường nên giữ business logic ở app layer; chỉ dùng SP cho logic gắn chặt với data (bulk update, complex aggregation).((PG có 2 dạng: `FUNCTION` (return value, dùng trong SELECT) và `PROCEDURE` (có thể `COMMIT`/`ROLLBACK` bên trong, gọi bằng `CALL`). Procedure mới có từ PG 11. Trước đó, mọi thứ là function — không thể commit giữa chừng.))

### Triggers

Stored procedure đặc biệt — tự động chạy khi có sự kiện (`INSERT`/`UPDATE`/`DELETE`).

```sql
-- PostgreSQL: audit log mọi update trên users
CREATE TABLE users_audit (
    id SERIAL PRIMARY KEY,
    user_id INT,
    old_email TEXT,
    new_email TEXT,
    changed_at TIMESTAMP DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION log_user_update()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.email IS DISTINCT FROM NEW.email THEN
        INSERT INTO users_audit(user_id, old_email, new_email)
        VALUES (OLD.id, OLD.email, NEW.email);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_update
AFTER UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION log_user_update();
```

**Use case**:
- ✍️ **Auditing** — log ai sửa gì.
- ✅ **Validation** — check business rule trước/sau operation.
- 🤖 **Automation** — cập nhật derived field, gửi notification.((Trigger có 2 cấp: **FOR EACH ROW** (chạy mỗi row, có `OLD`/`NEW`) và **FOR EACH STATEMENT** (chạy 1 lần cho cả statement, dùng transition table `OLD TABLE`/`NEW TABLE`). Statement-level nhanh hơn cho bulk update — vd: log 1 audit row thay vì 10000 row.))

> **Warning:** Trigger ẩn — gây side-effect ngầm khi insert/update. Debugging khó. Performance bị giảm im lặng. Dùng tiết chế, document kỹ.

### Views

Bảng ảo từ một query — giúp đơn giản hóa và bảo mật.

```sql
-- View thường: query lại mỗi lần SELECT
CREATE VIEW active_users AS
SELECT id, name, email
FROM users
WHERE status = 'active' AND deleted_at IS NULL;

SELECT * FROM active_users WHERE email LIKE '%@gmail.com';
```

```sql
-- Materialized view: lưu kết quả vật lý, refresh thủ công
CREATE MATERIALIZED VIEW daily_stats AS
SELECT date_trunc('day', created_at) AS day, COUNT(*) AS orders
FROM orders
GROUP BY 1;

REFRESH MATERIALIZED VIEW daily_stats;
```

**Lợi ích**:
- 🧹 **Đơn giản hóa** — ẩn join phức tạp.
- 🛡️ **Security** — grant quyền lên view thay vì raw table (ẩn cột nhạy cảm).
- ⚡ **Materialized view** — cache kết quả aggregation nặng cho dashboard/report.

> **Tip:** View thường = query mỗi lần → không nhanh hơn. Materialized view = cache → nhanh nhưng có thể stale, cần schedule refresh (hoặc dùng `REFRESH ... CONCURRENTLY` để không block).((`REFRESH MATERIALIZED VIEW` (không CONCURRENTLY) khóa bảng — đọc bị block. `CONCURRENTLY` build version mới, swap khi xong, không block đọc — nhưng cần unique index trên view. Refresh kiểu này vẫn đọc lại toàn bộ source. Muốn incremental refresh (chỉ update phần thay đổi) → cần extension như `pg_ivm` hoặc tự build qua trigger.))

---

## Database Change Streams

Cách để app/hệ thống khác **biết** khi data trong DB thay đổi — phục vụ cache invalidation, search index sync (Elasticsearch), event-driven microservices, audit, replication, real-time UI.

Trade-off chính: **độ trễ** vs **độ tin cậy** vs **tải lên DB chính**.

```
   Producer (DB)                            Consumer
   ────────────────                          ──────────
   App → INSERT/UPDATE/DELETE
                │
                ├── ① WAL/binlog ────► CDC tool ─► Kafka ─► Service A, B, C
                │                       (Debezium)
                │
                ├── ② Trigger → NOTIFY ─► LISTEN client ─► WS push
                │
                └── ③ Outbox table ────► Poller / CDC ─► Message bus
```

### CDC (Change Data Capture) qua WAL

Đọc trực tiếp **WAL/binlog** của DB → stream mọi thay đổi row-level ra ngoài. Không tốn query, không cần app code biết.

**Cơ chế PostgreSQL** — *logical replication*:

1. Bật `wal_level = logical` trong `postgresql.conf`.
2. Tạo **publication**: chọn table cần stream.
3. Consumer tạo **replication slot** + đăng ký.
4. PG decode WAL bằng plugin (`pgoutput`, `wal2json`, `decoderbufs`) → gửi event INSERT/UPDATE/DELETE kèm before/after image.

```sql
-- Producer side
ALTER SYSTEM SET wal_level = 'logical';   -- restart cần
CREATE PUBLICATION app_pub FOR TABLE users, orders;

-- Tạo replication slot (giữ WAL chưa consume)
SELECT pg_create_logical_replication_slot('app_slot', 'pgoutput');

-- Consumer (PG → PG): subscription
CREATE SUBSCRIPTION app_sub
  CONNECTION 'host=primary dbname=app user=repl password=...'
  PUBLICATION app_pub;
```

**Stack phổ biến**: **Debezium** (Kafka Connect) — đọc WAL/binlog của PG/MySQL/MongoDB/SQL Server → publish lên Kafka topic theo table. Mỗi event có `op` (`c`/`u`/`d`/`r`), `before`, `after`, `source` (LSN, timestamp).

```json
// Debezium event mẫu
{
  "op": "u",
  "before": {"id": 1, "balance": 1000},
  "after":  {"id": 1, "balance": 900},
  "source": {"lsn": 24536123, "ts_ms": 1710000000000, "table": "accounts"}
}
```

**Ưu**:
- ✅ **Zero impact** lên app — không cần sửa code.
- ✅ **Bắt mọi thay đổi**, kể cả từ admin tay (`UPDATE` trực tiếp).
- ✅ **Reliable + ordered** — replay từ LSN sau crash, không mất event.
- ✅ Latency thấp (ms đến vài chục ms).
- ✅ Bắt cả schema change (Debezium emit DDL events).

**Nhược**:
- ❌ **Replication slot không consume → WAL phồng** lấp đầy disk → DB sập.((Dấu hiệu: `pg_replication_slots.active = false` + `pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)` tăng dần. Phải drop slot chết hoặc bật `max_slot_wal_keep_size` (PG 13+) để giới hạn WAL retention per slot.))
- ❌ Setup phức tạp: Kafka, Connect, schema registry.
- ❌ Cần quyền `REPLICATION` — security-sensitive.
- ❌ Initial snapshot khi mới subscribe → tải lớn lên DB.

> **Tip:** CDC qua WAL là **chuẩn vàng** cho microservices/analytics pipeline. Dùng khi cần feed nhiều consumer (search, cache, warehouse) cùng lúc với latency thấp.

> **Warning:** MySQL cần `binlog_format=ROW` (không phải `STATEMENT`) để Debezium decode được before/after image. STATEMENT chỉ ghi câu SQL — không reconstruct được giá trị cũ.

### LISTEN / NOTIFY

Cơ chế pub/sub **trong process PostgreSQL**. Client `LISTEN channel`, ai đó `NOTIFY channel, 'payload'` → mọi listener nhận event.

```sql
-- Session A
LISTEN order_created;

-- Session B
NOTIFY order_created, '{"id": 42, "amount": 100}';
-- hoặc
SELECT pg_notify('order_created', '{"id": 42}');
```

App code (Node.js với `pg`):

```javascript
const client = new Client();
await client.connect();
await client.query('LISTEN order_created');

client.on('notification', (msg) => {
  console.log('channel:', msg.channel, 'payload:', msg.payload);
  // → push qua WebSocket cho UI
});
```

**Ưu**:
- ✅ Built-in PostgreSQL — không cần Kafka/Redis.
- ✅ Latency cực thấp (<1ms cùng node).
- ✅ Đơn giản — vài dòng SQL.

**Nhược**:
- ❌ **Không persistent** — listener offline khi NOTIFY → mất event mãi mãi.
- ❌ **Payload ≤ 8000 bytes** (giới hạn cứng PG).
- ❌ Notification gửi **chỉ khi transaction commit** — abort thì không firing.((Đây là feature, không phải bug: tránh "phantom event" khi rollback. Nhưng cũng nghĩa là payload bạn build trong trigger phải dựa trên data đã commit, không phải intermediate state.))
- ❌ Không có ack/replay — fire-and-forget.
- ❌ Single-node — không scale qua cluster (replica không relay NOTIFY).

> **Tip:** Dùng cho **real-time UI update** trong app monolith: chat, dashboard refresh, cache invalidation cùng instance. KHÔNG dùng cho event-driven architecture critical (mất event = mất tiền).

### Trigger + NOTIFY

Kết hợp: trigger detect change → `pg_notify()` để fire event ra cho LISTEN client. App layer không cần làm gì khi INSERT/UPDATE — DB tự stream.

```sql
CREATE OR REPLACE FUNCTION notify_order_change()
RETURNS TRIGGER AS $$
DECLARE
    payload JSON;
BEGIN
    payload = json_build_object(
        'op', TG_OP,
        'id', COALESCE(NEW.id, OLD.id),
        'data', row_to_json(NEW)
    );
    PERFORM pg_notify('order_changes', payload::text);
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_notify
AFTER INSERT OR UPDATE OR DELETE ON orders
FOR EACH ROW EXECUTE FUNCTION notify_order_change();
```

**Ưu**:
- ✅ **Bắt mọi thay đổi** kể cả từ admin tay (giống CDC).
- ✅ Không cần app code biết → loose coupling.
- ✅ Vẫn lightweight, không cần Kafka.

**Nhược**:
- ❌ Kế thừa mọi nhược của LISTEN/NOTIFY (volatile, no replay, 8KB).
- ❌ Trigger chạy đồng bộ trong transaction → tăng latency write.((Payload lớn hoặc trigger nhiều event → INSERT chậm. Đo bằng `EXPLAIN ANALYZE` hoặc `pg_stat_user_functions`. Nếu vượt vài ms → chuyển sang outbox + CDC.))
- ❌ Nếu listener crash giữa stream → mất batch event.

> **Warning:** Trigger + NOTIFY phù hợp cho **soft notification** (UI live update, prefetch cache). Tuyệt đối không dùng cho **business-critical event** (payment, order fulfillment) — mất event = mất tiền. Cần guarantee → outbox pattern.

### Outbox Pattern

Khắc phục yếu điểm của NOTIFY: ghi event vào **bảng `outbox`** trong cùng transaction với business write → đảm bảo atomic. Sau đó poller hoặc CDC đọc bảng outbox publish ra message bus.

```sql
CREATE TABLE outbox (
    id BIGSERIAL PRIMARY KEY,
    aggregate_type TEXT,
    aggregate_id TEXT,
    event_type TEXT,
    payload JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    published_at TIMESTAMP
);

-- Trong app code: 1 transaction ghi cả 2
BEGIN;
INSERT INTO orders(id, amount) VALUES (42, 100);
INSERT INTO outbox(aggregate_type, aggregate_id, event_type, payload)
  VALUES ('order', '42', 'order.created', '{"id":42,"amount":100}');
COMMIT;
```

Worker poll outbox → publish Kafka/RabbitMQ → mark `published_at`. Hoặc Debezium đọc WAL của bảng `outbox` → tự stream ra Kafka (best of both).

**Ưu**:
- ✅ **Atomic** với business data (cùng transaction).
- ✅ **At-least-once delivery** — mất worker thì retry, không mất event.
- ✅ Replay được — query lại bảng.

**Nhược**:
- ❌ Bảng outbox phồng → cần cleanup job xóa row đã publish cũ.
- ❌ Latency cao hơn CDC trực tiếp (poll interval hoặc WAL→Kafka 2 hop).
- ❌ Code app phải nhớ ghi outbox → dễ quên → kèm strict review/lib.

> **Tip:** Outbox + Debezium đọc bảng outbox = pattern chuẩn industry cho event-driven microservices. Đảm bảo exactly-once **logical** (sau dedupe consumer side).

### So sánh các phương pháp

| Phương pháp | Latency | Reliability | Tải DB | Setup | Use case |
|-------------|---------|-------------|--------|-------|----------|
| **CDC (WAL)** | ~ms | High (replay từ LSN) | Thấp | Phức tạp (Kafka/Debezium) | Microservices, search/warehouse sync, replication |
| **LISTEN/NOTIFY** | <1ms | Low (no replay, volatile) | Rất thấp | Vài dòng SQL | Real-time UI, cache invalidation cùng app |
| **Trigger + NOTIFY** | <1ms | Low (kèm overhead trigger) | Trung bình | Đơn giản | UI update khi cả admin tay cũng đổi data |
| **Outbox pattern** | 10ms–s | High (at-least-once) | Trung bình | Trung bình (worker/Debezium) | Event-driven business logic, payment, order |
| **Polling table** | Cao (poll interval) | Tùy implement | Cao (query liên tục) | Đơn giản nhất | Legacy, fallback khi không bật được CDC |

> **Tip:** Quyết định nhanh:
> - Nhiều consumer + cần ordering + reliable → **CDC (Debezium)**.
> - Cùng app, real-time UI, mất event chấp nhận được → **LISTEN/NOTIFY**.
> - Business event critical → **Outbox** (+ CDC đọc outbox nếu scale).
> - Không quyền replication, prototype nhanh → **Trigger + NOTIFY** hoặc **polling**.

> **Warning:** Anti-pattern: dual-write (app ghi DB rồi ghi Kafka không cùng transaction). Crash giữa 2 step → DB có data, Kafka thiếu event (hoặc ngược lại). **Outbox hoặc CDC** là cách đúng.

---

## Storage Landscape — chọn đúng cho từng workload

### Tư duy nền: tại sao 1 RDBMS + 1 Redis không đủ

Khung mặc định cho hệ thống mới:

```
       ┌─────────┐
Client │   App   │
   ──► │ service │ ─► Redis (cache, session, rate-limit)
       └────┬────┘
            │
            ▼
        PostgreSQL  ← source of truth (ACID, FK, joins)
```

Cặp đôi này gánh **>80% use case CRUD thông thường**. Nhưng khi 1 chiều scale vượt ngưỡng vật lý của RDBMS hoặc cache thuần, hệ thống đụng tường:

| "Bức tường" gặp phải | Triệu chứng | Storage chuyên dụng cần thêm |
|----------------------|-------------|------------------------------|
| OLAP đè OLTP — report quét hàng tỷ row, lock buffer pool | API latency p99 vọt giờ giờ | **ClickHouse / Snowflake / BigQuery** |
| Full-text search trên TEXT lớn, ranking phức tạp | `LIKE '%...%'` full scan, GIN index không đủ | **Elasticsearch / OpenSearch / Meilisearch** |
| Time-series write hàng triệu point/giây | Bloat, vacuum không kịp, query window chậm | **TimescaleDB / InfluxDB / Prometheus** |
| Write throughput cross-region, multi-DC | Replication lag, single-leader bottleneck | **Cassandra / ScyllaDB / DynamoDB** |
| Schema thay đổi liên tục, nested document | `ALTER TABLE` đau, JSONB query khó index | **MongoDB / Couchbase** |
| Quan hệ nhiều hop (friend-of-friend, fraud ring) | 5+ JOIN, exponential cost | **Neo4j / Dgraph / JanusGraph** |
| Latency <1ms cho 100k+ QPS với dataset > RAM | Redis OOM, không đủ RAM cho all keys | **Aerospike / DragonflyDB** |
| ACID + horizontal scale không hy sinh | Sharding tay phá vỡ FK/transaction | **CockroachDB / Spanner / TiDB** |

> **Tip:** Quy tắc đặt thêm DB: chỉ thêm khi **đo được** ngưỡng đã chạm. Không thêm "phòng xa" — mỗi DB mới = 1 hệ pipeline đồng bộ (CDC/dual-write), 1 hệ ops (backup, monitor, upgrade), 1 nguồn data drift. Một startup chết vì 7 datastore phổ biến hơn vì PG quá chậm.

> **Note:** Cấu trúc bài này: mỗi DB giải thích theo 4 lớp — (1) **Bản chất kỹ thuật** (storage engine, model), (2) **Mạnh/yếu** suy ra từ bản chất, (3) **Use case** khớp tự nhiên, (4) **Clustering/HA** gotcha, (5) **Vị trí trong kiến trúc** PG+Redis.

---

### PostgreSQL — Swiss-army RDBMS

**Bản chất kỹ thuật**:
- Row-store, heap + B-tree index, MVCC qua tuple version (`xmin`/`xmax`), VACUUM dọn dead tuple.
- WAL append-only → physical/logical replication.
- Process-per-connection (fork) → tốn RAM khi nhiều connection → cần `pgbouncer`.
- Extension model: PostGIS (GIS), pgvector (AI embedding), TimescaleDB (TS), Citus (sharding), pg_partman, pgcrypto...

**Mạnh** (do bản chất):
- ACID + serializable đúng nghĩa (SSI), FK/CHECK/EXCLUDE constraint.
- Query optimizer trưởng thành — join >12 bảng vẫn good plan.
- JSONB + GIN index → "hybrid" relational + document.
- Hệ sinh thái extension cực rộng — đổi PG thành TSDB, vector DB, GIS DB chỉ bằng `CREATE EXTENSION`.
- MVCC: read không block write.

**Yếu**:
- Scale ghi đơn-node giới hạn ~vài chục k TPS. Sharding native không có (phải dùng Citus / app-level).
- VACUUM bloat nếu long transaction hoặc write-heavy.
- Process-per-connection → 1000 connection = vài GB RAM → bắt buộc connection pool.
- `ALTER TABLE` lớn vẫn rewrite table (PG 11+ giảm nhiều case, không hết).

**Use case sweet spot**:
- OLTP general: SaaS, e-commerce, fintech ledger, ERP.
- Source of truth cho mọi hệ thống cần FK + transaction.
- Geospatial (PostGIS), embedding search nhỏ-vừa (pgvector <10M vector).

**Clustering/HA**:
- **Streaming replication** (physical WAL) → 1 primary + N replica đọc. Failover thủ công hoặc qua **Patroni** (Raft qua etcd/Consul) / **repmgr** / **pg_auto_failover**.
- **Logical replication** (row-level) → cross-version, partial table — dùng cho upgrade zero-downtime, CDC.
- **Synchronous replication** chống mất data nhưng latency = max(primary, sync-replica).
- Pitfall: **split-brain** khi network partition + auto-failover ngu. Patroni dùng DCS (distributed config store) làm tiebreaker.
- Sharding: **Citus** (coordinator + worker, shard theo distribution column) hoặc app-level (Vitess-style không có cho PG).

**Vị trí**: trung tâm. Mọi storage khác bám quanh PG — Redis cache trước, ClickHouse/Elastic nhận CDC từ PG, MongoDB cho subdomain schema-động.

---

### MySQL / InnoDB — OLTP workhorse

**Bản chất kỹ thuật**:
- InnoDB: clustered index (PK = data layout) — khác PG (heap + secondary index).
- MVCC qua **undo log** (không phải tuple version inline) → không cần VACUUM, undo dọn dần.
- Thread-per-connection (nhẹ hơn PG fork).
- Binlog (row/statement/mixed) tách biệt InnoDB redo log → 2PC giữa 2 log.

**Mạnh**:
- Clustered index → range scan trên PK cực nhanh (e-commerce order_by_user).
- Thread model + buffer pool tinh chỉnh tốt → throughput đơn-node cao hơn PG cho simple OLTP.
- Replication trưởng thành sớm nhất — async, semi-sync, GTID-based, group replication.
- Sinh thái: Vitess (sharding YouTube-grade), PlanetScale (DBaaS).

**Yếu**:
- Optimizer yếu hơn PG — join >5 bảng dễ chọn plan ngu.
- Không có serializable thật (Repeatable Read default + gap lock — vẫn write skew).
- Không có CHECK constraint trước MySQL 8.0.16; ENUM/SET hơi cồn.
- DDL online giới hạn — vài `ALTER` vẫn lock table dài (cần `pt-online-schema-change` / `gh-ost`).

**Use case sweet spot**:
- Web-scale OLTP đơn giản: phpBB/WordPress-style CMS, Shopify-style commerce, social feed timeline (read-heavy).
- Khi cần Vitess sharding (Slack, YouTube, GitHub).

**Clustering/HA**:
- **Async replication** (default) — replica lag tới giây phút, mất write nếu primary chết.
- **Semi-sync** — primary chờ ≥1 replica ack (không chờ apply).
- **Group Replication / InnoDB Cluster** — Paxos-based, multi-primary tùy mode.
- **Vitess** — sharding layer trên N MySQL instance, transparent với app, dùng ở YouTube/Slack.
- Pitfall: replication lag khi long DML; GTID conflict khi failover sai thứ tự.

**Vị trí**: thay thế PG khi team rành MySQL hoặc cần Vitess. Cùng vai trò "source of truth". Hiếm khi đặt **cạnh** PG trong cùng hệ thống.

---

### Redis — in-memory KV + data structures

**Bản chất kỹ thuật**:
- Single-threaded event loop (Redis ≤6); Redis 7+ I/O thread nhưng command vẫn 1 thread → atomicity miễn phí.
- Data structures: String, List, Hash, Set, ZSet (skiplist), Stream, Bitmap, HyperLogLog, Geo, Bloom.
- Persistence: RDB snapshot (point-in-time) + AOF (append-only log, fsync `everysec`/`always`/`no`).
- Pub/Sub + Streams (Kafka-lite, consumer group).

**Mạnh**:
- p99 <1ms cho GET/SET; throughput ~100k–1M ops/sec/node.
- Atomic ops trên data structure (`INCR`, `ZADD`, `LPOP`) → distributed counter/rate-limit không cần lock.
- Lua script + `MULTI/EXEC` → atomic compound op.
- Stream + consumer group → message bus lightweight.

**Yếu**:
- **Dataset ≤ RAM** (đắt khi TB). Persistence chỉ cứu khỏi crash, không scale lưu trữ.
- Single-thread → 1 command nặng (`KEYS *`, `SMEMBERS` big set) block toàn instance.
- AOF rewrite + RDB save fork process → COW spike RAM 2×, ảnh hưởng latency.
- Replication async → failover có thể mất write trong sliding window.

**Use case sweet spot**:
- **Cache** (cache-aside, write-through, write-behind).
- **Session store**, **rate limiter** (`INCR` + EXPIRE), **leaderboard** (ZSet), **distributed lock** (Redlock — controversial), **dedup** (Set/Bloom).
- **Pub/Sub** real-time UI, **Streams** event queue scale vừa.
- **Geospatial** radius query (GEORADIUS).

**Clustering/HA**:
- **Sentinel**: 1 primary + replica + sentinel quorum bầu failover. Đơn giản, không sharding.
- **Redis Cluster**: 16384 hash slot phân chia ≥3 primary + replica. Gossip protocol. Pitfall: multi-key op chỉ work trong cùng slot (dùng `{hashtag}`).
- **Failover mất data**: replication async → vài write cuối có thể mất khi primary chết.
- **Big key + hot slot** → 1 node nóng, cả cluster chậm. Đo bằng `redis-cli --bigkeys` + `--hotkeys`.

**Vị trí**: front-line cache trước PG. Cũng dùng cho session, rate-limit, queue nhỏ. Không phải source of truth.

---

### MongoDB — document store

**Bản chất kỹ thuật**:
- BSON document, schema-less (validation tùy chọn).
- WiredTiger engine: B-tree + MVCC + compression (snappy/zstd).
- Sharding native: shard key → chunk → mongos router.
- Replica set: 1 primary + secondaries, **Raft-like** election.
- Aggregation framework (pipeline) thay JOIN.

**Mạnh**:
- Schema linh hoạt — prototype/CMS/catalog đổi field hằng ngày không cần migration.
- Embedded document → 1 read = 1 entity đầy đủ (user + addresses + orders trong cùng doc).
- Sharding tự động + balancer.
- Multi-document ACID transaction từ v4.0 (4.2 cross-shard).

**Yếu**:
- Không có JOIN thật — `$lookup` chậm khi cross-shard.
- **Shard key chọn sai** = chuyện đau đầu cả đời (hot shard, không re-shard dễ trước v5).
- Document size limit 16MB → array vô hạn = anti-pattern.
- Eventual consistency mặc định với secondary read; cần `readConcern: majority` để strong.

**Use case sweet spot**:
- Catalog sản phẩm (mỗi sản phẩm field khác nhau), CMS, IoT event log dạng doc, user profile gắn nested prefs.
- Mobile-backend khi schema theo app version.

**Clustering/HA**:
- Replica set: primary + ≥2 secondary + arbiter (nên tránh — không có data).
- Sharded cluster: config server (3 node) + shard (mỗi shard là replica set) + mongos (router).
- Pitfall: **jumbo chunk** (chunk vượt limit, không split được do shard key low-cardinality) — phải refactor key.
- Pitfall: write concern `w:1` mất data khi primary chết → dùng `w:majority`.

**Vị trí**: thay vai trò "source of truth" cho subdomain schema-động (catalog, content), hoặc song song PG — PG cho transactional core (order, payment), Mongo cho mutable document (profile, inventory metadata).

---

### Cassandra / ScyllaDB — wide-column, AP, write-heavy

**Bản chất kỹ thuật**:
- LSM-tree storage (memtable → SSTable, compaction).
- Partition key (hash) → ring (consistent hashing), replication factor N, không có leader.
- Tunable consistency: `ONE / QUORUM / ALL` cho R/W → `R+W>N` = strong consistency.
- ScyllaDB: rewrite C++ shard-per-core, throughput 10× Cassandra cùng hardware.

**Mạnh**:
- Linear write scalability — thêm node = thêm throughput.
- Multi-DC active-active built-in (cross-region write).
- LSM tối ưu cho write (sequential append) → ingest hàng triệu/giây.
- No SPOF — bất kỳ node nào cũng coordinator.

**Yếu**:
- **Query bị giam bởi partition key** — query không có PK = full scan ALLOW FILTERING (chậm chết).
- Không có JOIN, không transaction (Lightweight Transaction qua Paxos cực chậm).
- Read amplification (gộp nhiều SSTable) — read chậm hơn write.
- Compaction storm + tombstone bloat khi delete nhiều → "tombstone hell".
- Mô hình hóa: bảng theo **query pattern** (denormalize), không theo entity.

**Use case sweet spot**:
- Time-series khổng lồ (Apple, Netflix metrics), event log, IoT telemetry, messaging (Discord chat → migrated từ Mongo sang Cassandra → ScyllaDB).
- Write-heavy multi-region: ad-tech impression, social activity stream.

**Clustering/HA**:
- Bản chất AP — luôn available. Repair định kỳ (`nodetool repair`) để hội tụ.
- Hinted handoff (lưu write cho node down), read repair, anti-entropy.
- Pitfall: **wide row** (>100MB partition) → node OOM. Giới hạn partition size là rule sống còn.
- Pitfall: tombstone TTL — `gc_grace_seconds` (default 10 ngày) phải đợi trước khi compaction dọn.

**Vị trí**: storage chuyên dụng cạnh PG cho stream/event/time-series. PG vẫn là OLTP truth; Cassandra ingest log/metric/event. Hoặc thay PG hoàn toàn cho hệ multi-region scale lớn (chấp nhận lose ACID).

---

### Aerospike — hybrid memory/SSD KV

**Bản chất kỹ thuật**:
- Index trong RAM (mỗi key ~64 byte index), data trên SSD (raw block I/O, bypass filesystem).
- C-based, shared-nothing, automatic data distribution.
- Strong consistency mode (CP) hoặc AP mode tùy config.

**Mạnh**:
- Latency <1ms ở dataset 100GB–TB với cost rẻ hơn Redis nhiều lần (SSD vs RAM).
- Predictable performance khi key count = hàng tỷ.
- Cross-DC replication (XDR) built-in.

**Yếu**:
- Index vẫn cần RAM (~64 byte/key × 10B key = 640GB RAM cluster).
- Ecosystem nhỏ hơn Redis/Mongo — ít tooling.
- Query model nghèo — chủ yếu KV + secondary index hạn chế.
- License/cost vendor (community edition giới hạn).

**Use case sweet spot**:
- Ad-tech bidder (user profile lookup 100k QPS p99 <1ms).
- Real-time fraud scoring, telco subscriber profile.
- Khi Redis không đủ RAM cho dataset nhưng cần sub-ms latency.

**Clustering/HA**:
- Cluster tự balance, smart client biết partition map → 1 hop tới owning node.
- Strong consistency mode: roster-based, mất quorum → unavailable cho partition đó.
- Pitfall: tuning `defrag` + `write-block-size` ảnh hưởng SSD wear.

**Vị trí**: thay/bổ sung Redis khi dataset cache vượt RAM kinh tế. Đứng cạnh PG/Cassandra cho lookup nóng.

---

### ClickHouse — column-store OLAP

**Bản chất kỹ thuật**:
- Column-oriented storage (mỗi cột 1 file) + compression cực mạnh (LZ4, ZSTD, codec đặc thù per column).
- MergeTree engine: write append → background merge (LSM-like).
- Vectorized execution + SIMD → quét tỷ row/giây/node.
- Materialized view = trigger-aggregate khi insert.

**Mạnh**:
- Aggregate query (SUM/COUNT/GROUP BY) hàng tỷ row trong giây.
- Compression ratio 10–100× so với raw → rẻ.
- Ingest hàng triệu row/giây qua batch insert.
- SQL chuẩn (gần đủ) — không cần học DSL.

**Yếu**:
- **Update/delete kém** — `ALTER TABLE ... UPDATE` async, không phải UPDATE OLTP. ReplacingMergeTree/CollapsingMergeTree workaround cho upsert.
- Không transaction cross-table (single-statement atomic).
- Point query (`WHERE id = X`) chậm hơn row-store — không phải replacement OLTP.
- JOIN distributed hạn chế — phải denormalize hoặc dùng dictionary.

**Use case sweet spot**:
- Analytics dashboard real-time (Cloudflare radar, Uber observability).
- Product metric/funnel analysis, ad attribution.
- Log/event warehouse thay Elasticsearch khi không cần full-text.

**Clustering/HA**:
- ReplicatedMergeTree dùng ZooKeeper/Keeper coordinate replication.
- Sharding manual qua Distributed table → query fan-out.
- Pitfall: ZooKeeper quá tải khi insert quá nhiều partition → batch lớn hơn, ít partition hơn.
- Pitfall: replica lag khi merge nặng.

**Vị trí**: data warehouse layer. CDC từ PG (Debezium) → Kafka → ClickHouse. App đọc dashboard từ ClickHouse, không đụng PG. Giải phóng PG khỏi report query.

---

### TimescaleDB / InfluxDB — time-series

**Bản chất kỹ thuật**:
- **TimescaleDB**: extension PG, **hypertable** chia chunk theo time + space (hash). Mỗi chunk = 1 PG table → optimizer tự prune theo WHERE time.
- **InfluxDB**: TSM engine (Time-Structured Merge tree), tag-set index (TSI). Schema implicit theo measurement + tag.

**Mạnh**:
- TimescaleDB: giữ full SQL + JOIN + extension PG → vừa TS vừa relational trong 1 DB.
- InfluxDB: ingest cực cao (>1M point/sec/node), downsampling + retention policy built-in.
- Continuous aggregate / materialized view tự refresh.

**Yếu**:
- TimescaleDB: chunk metadata overhead khi cardinality cao; compress chunk read-only (UPDATE compressed chunk khó).
- InfluxDB: cardinality explosion khi tag nhiều giá trị (mỗi tag combo = 1 series → OOM TSI). V2 đổi storage, v3 lại đổi (IOx, parquet-based).
- TS chuyên dụng (Prometheus, VictoriaMetrics) thường rẻ và nhanh hơn cho metric pure.

**Use case sweet spot**:
- **TimescaleDB**: IoT/SCADA cần JOIN với metadata SQL; financial tick + reference table; observability có business context.
- **InfluxDB**: pure metric, monitoring, sensor stream.

**Clustering/HA**:
- TimescaleDB: HA = PG HA (Patroni). Multi-node Timescale (sharding) đã deprecate v2.14+ → khuyến cáo single-node lớn + read replica.
- InfluxDB OSS single-node; cluster ở Enterprise/Cloud.
- Pitfall TS: tag cardinality phải kiểm soát từ schema (không bao giờ dùng request_id làm tag).

**Vị trí**: kề PG cho time-series workload. App ghi metric → Timescale/Influx. PG vẫn giữ business entity. Hoặc TimescaleDB extension chạy ngay trong PG (cùng instance).

---

### Elasticsearch / OpenSearch — search + log analytics

**Bản chất kỹ thuật**:
- Lucene inverted index (term → doc list) + doc values (columnar cho aggregation).
- Shard = 1 Lucene index; replica = copy.
- BM25 scoring, analyzer pipeline (tokenize + filter + stem).
- Near-real-time: refresh interval (default 1s) làm doc visible.

**Mạnh**:
- Full-text search ranking, fuzzy, phrase, multi-language analyzer.
- Aggregation phong phú (terms, date_histogram, percentiles).
- Schema-on-write (mapping) + dynamic field.
- Kibana visual layer mạnh cho log/metric.

**Yếu**:
- **Không phải source of truth** — không ACID, replication async, refresh trễ.
- Update = delete + reindex (Lucene segment immutable) → write amplification.
- JVM heap pressure, GC pause khi shard quá lớn.
- **Mapping explosion** — thêm field động → mapping phình → cluster state to → master node nghẽn.
- Reindex để đổi mapping = đau.

**Use case sweet spot**:
- Product search (Algolia-style), full-text trên TEXT lớn, autocomplete.
- Log/event analytics (ELK stack), APM (Elastic APM).
- Geo + full-text combo.

**Clustering/HA**:
- Master-eligible node (quorum bầu master, ≥3 master để tránh split-brain — phải set `discovery.zen.minimum_master_nodes` cũ hoặc voting config mới).
- Shard allocation aware (rack/zone aware) → replica khác zone.
- Pitfall: oversharding (mỗi shard ~50GB là sweet spot, không nên <1GB hoặc >100GB).
- Pitfall: bulk index sai → segment merge storm.

**Vị trí**: derived index từ PG. CDC PG → Kafka → ES; hoặc app dual-write (rủi ro inconsistent — nên dùng outbox + CDC). Truy vấn search/aggregate hit ES, write/update hit PG.

---

### DynamoDB — managed serverless KV/doc

**Bản chất kỹ thuật**:
- AWS-managed, partition key (mandatory) + sort key (optional). Hash partition.
- SSD storage, 3 replica trong region tự động.
- Consistent hashing + auto-split partition khi heat.
- DynamoDB Streams = CDC built-in (24h retention).
- Global Tables = multi-region active-active (last-writer-wins).

**Mạnh**:
- 0 ops — không tuning, không patch.
- Single-digit ms latency ở mọi scale.
- On-demand pricing tự scale, không cần capacity planning.
- TTL, Streams, Global Table, ACID transaction (đến 100 item) built-in.

**Yếu**:
- **Phải thiết kế theo access pattern** từ đầu (single-table design) — đổi pattern = đại phẫu.
- Query không có PK = Scan (chậm + đắt).
- GSI (Global Secondary Index) eventual consistent, có cost riêng.
- Vendor lock-in AWS.
- Cost dễ vỡ kế hoạch — on-demand đắt khi traffic ổn định (provisioned + auto-scaling rẻ hơn).

**Use case sweet spot**:
- Session store, cart, user profile, gaming leaderboard ở AWS.
- Microservice cần KV scale tự động, team không có DBA.
- IoT ingest (DynamoDB + Kinesis).

**Clustering/HA**:
- Managed → không lo. Multi-AZ default, Global Tables multi-region.
- Pitfall: hot partition (1 partition key chiếm 3000 RCU/1000 WCU) → throttle.
- Pitfall: scan vs query — scan tốn capacity toàn bảng.

**Vị trí**: thay cặp PG+Redis nguyên khối khi team AWS-only và workload là KV + sortable list. Hoặc bổ sung cho subdomain (session, feature flag, idempotency key).

---

### Neo4j — native graph

**Bản chất kỹ thuật**:
- Native graph storage: node + relationship + property; pointer trực tiếp (index-free adjacency).
- Cypher query language (pattern matching).
- ACID transaction trên graph.

**Mạnh**:
- Traversal n-hop O(degree × hop), không phụ thuộc total data size — khác SQL JOIN O(N×M).
- Pattern khớp ngầu: `(a)-[:FRIEND]->(b)-[:FRIEND]->(c)` đơn giản hơn 3 JOIN.

**Yếu**:
- Scaling write khó — clustering enterprise-only, causal cluster có overhead.
- Không phù hợp khi quan hệ "phẳng" (1-1, 1-N đơn) — overkill.
- Không phải OLTP general — không có vai trò source of truth cho mọi entity.

**Use case sweet spot**:
- Social network (friend recommendation), fraud detection (transaction ring), knowledge graph, recommendation engine, IAM permission, supply chain.

**Clustering/HA**:
- Causal Cluster (Raft) cho core; read replica scale read.
- Pitfall: super-node (1 node hàng triệu cạnh) → traversal chậm. Phải mô hình hóa giảm super-node.

**Vị trí**: bên cạnh PG, chỉ cho phần graph (relationship-heavy). PG giữ entity + property bulk, Neo4j giữ relationship + traversal. Sync qua CDC.

---

### CockroachDB / Spanner / TiDB — distributed SQL

**Bản chất kỹ thuật**:
- Tách compute (SQL layer) và storage (KV: TiKV/CRDB-store).
- Range-based sharding (auto-split khi range nóng), Raft per range cho replication.
- Spanner: TrueTime (atomic clock + GPS) cho external consistency.
- CockroachDB: HLC (Hybrid Logical Clock) thay TrueTime.

**Mạnh**:
- ACID + serializable + horizontal scale + multi-region — "có cake mà vẫn ăn".
- Wire-compatible PG (CRDB) / MySQL (TiDB) → migration ít đau.
- Auto-rebalance, auto-failover.

**Yếu**:
- **Latency cao hơn single-node PG** — mỗi transaction = consensus round-trip → 5–20ms tối thiểu (cross-region tệ hơn).
- Cost — 3 replica × storage + network cross-AZ.
- Optimizer trẻ hơn PG, một số query plan kém.
- Operational complexity (Raft tuning, ranges, hotspot debug).

**Use case sweet spot**:
- Multi-region OLTP cần ACID (financial cross-region, global SaaS tenant data).
- Khi sharding tay MySQL/PG đã thành nightmare.

**Clustering/HA**:
- Built-in — cluster là first-class. 3 hoặc 5 replica per range, Raft quorum.
- Pitfall: cross-region commit latency. Locality config (lead replica gần user) rất quan trọng.
- Pitfall: clock skew (CRDB HLC giả định <500ms skew; Spanner đo skew thật).

**Vị trí**: thay PG khi scale vượt single-node + đa region. Hiếm khi đặt cạnh PG — chọn 1 trong 2.

---

### Kiến trúc tổng hợp — mỗi storage nằm ở đâu

```
                          ┌─────────────────┐
                          │     Clients     │
                          └────────┬────────┘
                                   │
                          ┌────────▼────────┐
                          │   API Gateway   │
                          └────────┬────────┘
                                   │
                  ┌────────────────┼────────────────┐
                  │                │                │
            ┌─────▼─────┐   ┌──────▼──────┐  ┌──────▼──────┐
            │  Service  │   │   Service   │  │   Service   │
            │   Auth    │   │   Orders    │  │   Search    │
            └─────┬─────┘   └──────┬──────┘  └──────┬──────┘
                  │                │                │
        ┌─────────┴────┐    ┌──────┴──────┐         │
        ▼              ▼    ▼             ▼         ▼
   ┌─────────┐  ┌──────────────────────────┐  ┌──────────────┐
   │  Redis  │  │     PostgreSQL (SoT)     │  │ Elasticsearch│
   │ (cache, │  │  orders, users, payment  │  │ (product idx)│
   │ session,│  │  ── ACID, FK, joins ──   │  │              │
   │ rate-lim│  └──┬─────────────┬─────────┘  └──────▲───────┘
   │ pub/sub)│     │             │                   │
   └─────────┘     │  CDC (Debezium / WAL)           │
                   │             │                   │
                   ▼             ▼                   │
          ┌─────────────┐  ┌────────────┐            │
          │   Kafka     │──┤  Outbox    │────────────┘
          │ (event bus) │  │  events    │
          └──┬───┬───┬──┘  └────────────┘
             │   │   │
       ┌─────┘   │   └─────┐
       ▼         ▼         ▼
 ┌──────────┐ ┌──────┐ ┌──────────────┐
 │ClickHouse│ │ Neo4j│ │  Cassandra   │
 │(analytics│ │(graph│ │ /Scylla      │
 │ warehouse│ │ rec) │ │(event stream,│
 │ funnel)  │ │      │ │ time-series) │
 └────▲─────┘ └──────┘ └──────────────┘
      │
 ┌────┴──────────┐
 │ TimescaleDB / │     ┌──────────────┐
 │  InfluxDB     │     │  Aerospike   │
 │ (metrics, IoT)│     │ (hot profile │
 └───────────────┘     │  lookup TB)  │
                       └──────────────┘
```

**Pattern phối hợp**:

| Pattern | Mô tả | Khi dùng |
|---------|-------|----------|
| **Cache-aside** | App đọc Redis → miss thì đọc PG + set Redis | Default cho hot read |
| **Write-through cache** | Write hit cache + PG đồng thời | Cần cache luôn fresh |
| **Write-behind cache** | Write Redis → async flush PG | Counter, metric (chấp nhận rủi ro mất data nhỏ) |
| **CDC fan-out** | PG WAL → Debezium → Kafka → N consumer (ES, ClickHouse, cache invalidator) | Multi-derived store, eventual sync |
| **Outbox + CDC** | App ghi business + outbox cùng tx → CDC đọc outbox | Event-driven, exactly-once logical |
| **Dual-read** | App đọc PG (truth) + ES (search). Search dùng PG ID hydrate detail | Search result cần data tươi |
| **Materialized projection** | Stream từ Kafka → ClickHouse aggregate sẵn → dashboard query nhẹ | Analytics realtime |
| **Tiered storage** | Hot (Redis/Aerospike) → Warm (PG) → Cold (S3/Parquet via ClickHouse external) | Cost/perf tradeoff |

> **Tip:** Nguyên tắc đặt DB: **mỗi DB chỉ làm 1 việc nó giỏi nhất**. PG = truth; Redis = latency; ClickHouse = aggregate; ES = search; Cassandra = write-heavy stream; Neo4j = traversal. Đừng để ES làm source of truth, đừng để PG chạy report tỷ row, đừng để Redis lưu dataset lớn hơn RAM.

> **Warning:** **Số lượng datastore tỉ lệ thuận với độ phức tạp ops**. Mỗi store mới = backup mới, monitor mới, on-call mới, schema drift mới. Đặt câu hỏi trước khi thêm: "Đo được PG/Redis chạm tường ở metric nào?" Nếu không trả lời được → chưa cần thêm.

---

### Decision matrix nhanh

| Workload / câu hỏi | Storage chính | Lý do gốc |
|--------------------|---------------|-----------|
| OLTP truth, FK + transaction | **PostgreSQL** / MySQL | MVCC + WAL + optimizer |
| Cache, session, rate-limit, lock | **Redis** | In-memory, atomic ops |
| Cache dataset > RAM khả thi | **Aerospike** | Index RAM + data SSD |
| Full-text search, ranking | **Elasticsearch** | Inverted index Lucene |
| Aggregate trên tỷ row | **ClickHouse** | Column-store + vectorized |
| Time-series + business JOIN | **TimescaleDB** | PG extension, hypertable |
| Pure metric monitoring | **InfluxDB / Prometheus / VictoriaMetrics** | TSM, label-index |
| Write-heavy multi-region | **Cassandra / ScyllaDB** | LSM, masterless |
| Document schema động | **MongoDB** | BSON, dynamic schema |
| Graph traversal n-hop | **Neo4j** | Index-free adjacency |
| Managed KV/doc trên AWS | **DynamoDB** | Auto-scale, 0 ops |
| ACID + horizontal + multi-region | **CockroachDB / Spanner / TiDB** | Raft-per-range, distributed SQL |
| Vector embedding (AI) | **pgvector / Pinecone / Qdrant / Weaviate** | HNSW/IVF index |
| Object/blob/file | **S3 / MinIO** | Cheap, infinite, eventually consistent |

> **Tip:** Quy tắc thumb 3-câu để pitch DB lúc phỏng vấn:
> 1. **"Bản chất kỹ thuật là X (storage engine + replication model)."**
> 2. **"Vì X nên mạnh ở Y, yếu ở Z."**
> 3. **"Sweet spot là use case W; đặt cạnh PG/Redis như sau..."**
>
> Ví dụ ClickHouse: *"Column-store + MergeTree + vectorized execution → mạnh aggregate tỷ row trong giây, yếu point query và update. Sweet spot là realtime analytics dashboard; đặt downstream PG qua CDC Debezium → Kafka → ClickHouse, dashboard đọc CH không đụng PG."*

---

## Tham khảo

- *Designing Data-Intensive Applications* — Martin Kleppmann.
- PostgreSQL docs — MVCC, isolation levels: https://www.postgresql.org/docs/current/mvcc.html
- MySQL InnoDB locking: https://dev.mysql.com/doc/refman/8.0/en/innodb-locking.html
- Jepsen analyses (kiểm tra consistency thực tế của các DB): https://jepsen.io/analyses
- Debezium docs — CDC connector cho PG/MySQL/Mongo: https://debezium.io/documentation/
- PostgreSQL logical decoding: https://www.postgresql.org/docs/current/logicaldecoding.html
- Outbox pattern (microservices.io): https://microservices.io/patterns/data/transactional-outbox.html
- Redis docs — clustering, persistence: https://redis.io/docs/latest/operate/oss_and_stack/management/
- MongoDB sharding guide: https://www.mongodb.com/docs/manual/sharding/
- Cassandra data modeling (DataStax): https://www.datastax.com/learn/data-modeling-by-example
- ScyllaDB architecture: https://www.scylladb.com/product/technology/
- ClickHouse — MergeTree engine: https://clickhouse.com/docs/en/engines/table-engines/mergetree-family/mergetree
- TimescaleDB hypertables: https://docs.timescale.com/use-timescale/latest/hypertables/
- InfluxDB IOx (v3): https://www.influxdata.com/blog/influxdb-3-0-system-architecture/
- Elasticsearch — shard sizing guide: https://www.elastic.co/guide/en/elasticsearch/reference/current/size-your-shards.html
- DynamoDB single-table design (Alex DeBrie): https://www.alexdebrie.com/posts/dynamodb-single-table/
- Neo4j graph data modeling: https://neo4j.com/developer/data-modeling/
- CockroachDB architecture: https://www.cockroachlabs.com/docs/stable/architecture/overview.html
- Aerospike architecture whitepaper: https://aerospike.com/resources/architecture/
