---
title: "System Design"
pubDate: "2026-02-12"
published: true
contents_table: true
pinned: false
description: "xxx"
cat: "sd"
useKatex: false
---

# Luồng Tư Duy Phỏng Vấn System Design

> Framework cá nhân — fill knowledge + use case từ 28 case study repo.

---

## 1. Bắt đầu từ phân tích PRD

### 1.1 Functional requirement
> Quyết định business logic, công nghệ trọng tâm, mô hình phân tách service, state machine sau này.

- **Hình dung dạng bài toán** → dạng nào quyết định kiến trúc gốc. Mỗi dạng kèm: **đặc tính**, **pattern kĩ thuật**, **mấu chốt trade-off**, **ví dụ cụ thể**.

  ---

  - **Newsfeed / social / đăng bài** (Twitter, Facebook, Instagram):
    - **Đặc tính**: read-heavy (read/write ≈ 100:1), feed mỗi user khác nhau, sắp xếp theo thời gian, tồn tại "celebrity" có hàng triệu follower.
    - **Pattern kĩ thuật**:
      - **Fan-out on write (push)** — khi user A post, **copy bài** vào feed của tất cả follower (lưu sẵn). Read nhanh O(1). (( Ch12: `POST /feed` → fanout service đọc social graph → push `post_id` vào `news_feed_cache:{follower_id}` (Redis sorted set theo timestamp). User mở app chỉ cần `ZREVRANGE` 1 cuộc gọi. ))
      - **Fan-out on read (pull)** — khi user mở feed, mới đi gom bài từ N người user follow. Write nhẹ, read nặng. (( Tránh "celeb có 100M follower → push 100M bản copy" gây hot key. ))
      - **Hybrid (giải pháp thật)** — push cho user thường, pull khi follow celebrity → merge khi build feed. (( Twitter dùng cách này — gọi là "Earlybird" indexing. ))
    - **Mấu chốt**: hot key celebrity (1 row đọc 1M lần/s), **eventual consistency OK** (chậm 1-2s không ai chết), cache là vũ khí chính.
    - **Cache 5 lớp (Ch12)**: News Feed cache (final timeline) | Content cache (post hot) | Social Graph cache (follow list) | Action cache (like/comment count) | Counter cache (view count).
    - **Tech stack điển hình**: API gateway → Post service (write) → Kafka → Fanout worker → Redis (feed cache) + Cassandra (post storage). (( Cassandra hợp vì write-heavy, partition theo `user_id`. ))

  ---

  - **Lưu trữ + phục vụ media (video, file lớn)** (YouTube, Drive, Dropbox, S3):
    - **Đặc tính**: write 1 lần đọc N lần, file lớn (MB-GB), bandwidth cost cao, latency upload chấp nhận, latency stream phải mượt.
    - **Pattern kĩ thuật**:
      - **Tách metadata store khỏi data store** — DB lưu pointer (file_id, location, size), object store lưu byte. (( Ch25 S3: y hệt Unix inode + disk block. Lookup bằng SQL, fetch bằng object API. ))
      - **Chunking** — chia file thành block nhỏ (4MB Drive, 5MB-5GB S3 multipart). Resume upload, parallel upload, delta sync. (( Ch16 Drive: client `hash(block)`, server check tồn tại → chỉ upload block thay đổi → tiết kiệm bandwidth. ))
      - **Pre-signed URL** — server cấp URL có chữ kí + TTL → client upload/download trực tiếp object store, không qua app server. (( Ch15, Ch25: server không bao giờ chạm byte → tiết kiệm bandwidth + CPU app server. ))
      - **Transcode DAG** — video upload → split GOP → transcode song song nhiều output (240p, 480p, 1080p, 4K, HLS, DASH) → Resource manager + worker pool. (( Ch15 YouTube: DAG = Directed Acyclic Graph, các bước `extract audio → encode → package → thumbnail` chạy song song khi không phụ thuộc. ))
      - **CDN + adaptive bitrate** — chỉ hot video lên CDN. MPEG-DASH/HLS chia stream thành chunk 2-10s, client tự switch chất lượng theo bandwidth. (( Cold video chỉ ở object storage, lazy populate CDN khi có view. ))
      - **Erasure coding cho cold tier** — tiết kiệm 75% storage so với 3-replica. (( Ch25: 8+4 = 12 chunk, mất 4 chunk vẫn rebuild được, durability 11 nines. ))
    - **Mấu chốt**: bandwidth cost > storage cost ở scale lớn (Ch15: $150k/ngày CDN tại Mỹ). Tận dụng cloud (S3 + CloudFront) thay tự build.
    - **Ví dụ cụ thể**:
      - **Ch15 YouTube**: client split GOP → pre-signed URL → S3 → DAG transcode (Flink-style) → CDN. AES + DRM cho copyright.
      - **Ch16 Drive**: block 4MB + delta sync + long polling cập nhật cross-device. Conflict → giữ cả 2 version, manual merge.
      - **Ch25 S3**: metadata sharded `hash(bucket, name)`, data node nhóm thành "replication group" + Paxos/Raft 5-7 node placement service, object immutable + versioning bằng `TIMEUUID` + delete marker.

  ---

  - **Real-time chat / messaging / collaboration** (Messenger, Slack, Discord, Figma):
    - **Đặc tính**: bi-directional, low latency (< 200ms), persistent connection, message ordering, multi-device sync, presence.
    - **Pattern kĩ thuật**:
      - **WebSocket cho receive, HTTP cho send** — outgoing dễ scale (stateless), incoming cần persistent. (( Ch13: client mở WS đến **chat server** (port 80/443 không bị firewall block); send qua POST `/messages` rồi server tự push qua WS đến receiver. ))
      - **Stateful chat server + service discovery** — vì kết nối WS bám vào 1 server cụ thể, cần biết "user X đang ở server nào" → Zookeeper/etcd lưu mapping. (( Stateless service (auth, profile, search) tách riêng để scale tự do. ))
      - **Snowflake message ID** — 64-bit `(timestamp 41 + dc 5 + machine 5 + sequence 12)`, sortable theo thời gian, distributed unique không cần coordinator. (( Cần để sắp message theo thứ tự dù gửi từ nhiều device. Ch8. ))
      - **Inbox per user (group chat)** — group ≤ 500 → khi A post, copy `message_id` vào `inbox:{user_id}` của 500 người. (( Trade-off write amplification, nhưng read O(1). Group lớn hơn → fanout-on-read. ))
      - **Multi-device sync** — mỗi device giữ `cur_max_message_id`, kết nối lại → fetch `WHERE id > cur_max`. (( Đảm bảo không miss message khi offline. ))
      - **Presence (online/offline)** — heartbeat 5s, timeout 30s mark offline. (( Naive cách: 1M user × ping mỗi 5s = 200k QPS; phải Redis TTL key + pub/sub broadcast khi đổi. ))
      - **Push notification fallback** — user offline → APNs/FCM gửi notification, không stream qua WS.
    - **Mấu chốt**: stateful → khó scale auto (drain connection trước khi remove node). Ordering chỉ mạnh per-channel, không global.

  ---

  - **Stateful AI / chatbot / RAG** (ChatGPT, Claude UI, Cursor):
    - **Đặc tính**: streaming token (SSE), session dài, KV cache GPU, vector retrieval, rate limit theo token chứ không request.
    - **Pattern kĩ thuật**:
      - **SSE (Server-Sent Events)** — server đẩy token 1 chiều qua HTTP, client không gửi gì lại trong 1 turn. (( Đơn giản hơn WebSocket, qua được mọi proxy/CDN. ))
      - **Session affinity** — request cùng conversation pin về 1 worker giữ KV cache GPU. (( KV cache đắt: 1 conversation 8k token ≈ 1-5GB GPU memory. Mất pin = recompute toàn bộ. ))
      - **RAG pipeline**: embed query → vector search (top-K) → rerank → assemble context → LLM. (( Vector DB: Pinecone, Qdrant, pgvector, Weaviate. HNSW index ANN. ))
      - **Embedding store** — vector DB + metadata DB. (( Sync qua CDC khi nguồn update. ))
      - **Token-aware rate limit** — tính TPM (tokens/minute), không RPM. (( OpenAI/Anthropic API. Token bucket nhưng "token = LLM token" thay HTTP request. ))
      - **Streaming response cancel** — client đóng kết nối → server abort generation tiết kiệm GPU. (( Phải handle context cancellation tử tế xuyên call chain. ))
    - **Mấu chốt**: GPU là bottleneck đắt (>$10/h A100). Batching multiple request vào 1 GPU step (continuous batching, vLLM). Caching prompt prefix.

  ---

  - **Tài chính / payment / wallet** (Stripe, PayPal, banking):
    - **Đặc tính**: ACID bắt buộc, không cho phép double-charge / lost-update, audit-heavy, regulatory (PCI-DSS, AML), reconciliation định kì với 3rd-party.
    - **Pattern kĩ thuật**:
      - **Double-entry ledger** — mỗi giao dịch ghi 2 row: 1 debit, 1 credit, tổng = 0. (( Ch27: chuyển $100 từ Alice → Bob = `(Alice, -100)` + `(Bob, +100)`. Sum mọi entry per account = balance. Audit trivial. ))
      - **Idempotency-Key** — header UUID, DB unique constraint trên column. Retry không double-charge. (( Ch27 dùng `cart_id` hoặc nonce. Stripe yêu cầu `Idempotency-Key` header chuẩn. ))
      - **PSP integration via webhook + poll** — PSP báo status async qua webhook (verify signature HMAC), thêm cron poll fallback nếu webhook miss. (( Ch27. Hosted payment page do PSP host → khách nhập card bên PSP → app không bao giờ thấy card number → tránh PCI compliance scope. ))
      - **State machine rõ**: `pending → authorized → captured → settled → refunded` hoặc `failed`. (( Vẽ FSM đầu tiên. Mỗi transition là 1 event với constraint. ))
      - **Distributed transaction**:
        - **2PC** — coordinator block đến all node ack. Đơn giản, SPOF. (( Tránh ở scale lớn — Ch28 không dùng. ))
        - **TC/C (Try-Confirm-Cancel)** — Ch28 wallet 1M TPS: pha 1 reserve resource (local tx), pha 2 confirm hoặc cancel. Mỗi pha unlock nhanh. **Phase status table** cho recovery khi coordinator restart. Xử lí out-of-order: cancel đến trước try → set flag. ))
        - **Saga** — chuỗi local tx + compensating tx ngược nếu fail. Choreography (event-driven) hoặc Orchestration (central). (( Phù hợp microservice. ))
      - **Event Sourcing + CQRS** — Ch28 wallet: lưu **immutable event log** thay current state. State = `fold(events)`. Reproducibility audit. CQRS đẩy state read-model qua reverse proxy real-time. **Snapshot** mỗi N event để khỏi replay từ đầu. **Raft consensus** đồng bộ event log majority alive.
      - **Reconciliation** — cron job daily/hourly so DB internal vs settlement file PSP. Diff → manual review queue.
      - **Exactly-once-effect** — kết hợp at-least-once delivery + idempotent consumer + reconciliation.
    - **Mấu chốt**: ACID > performance. Tiền lẻ 1 cent cũng không cho phép sai. Compliance audit drive 50% design.

  ---

  - **Inventory / reservation / booking** (hotel, flight, ticketmaster):
    - **Đặc tính**: limited stock, race condition cao (flash sale), concurrent booking cùng resource, oversell có cost lớn, read-heavy nhưng critical write.
    - **Pattern kĩ thuật**:
      - **DB constraint là dòng phòng thủ cuối** — `CHECK total_reserved <= total_inventory * 1.1` trong DB. (( Ch23 hotel: cho phép overbooking 10% theo nghiệp vụ — có người cancel. DB từ chối row nếu vi phạm → app không thể bypass. ))
      - **Composite primary key** — `(hotel_id, room_type_id, date)` → row riêng cho mỗi đơn vị inventory. (( Update atomic per row, scale by sharding `hotel_id`. ))
      - **Idempotency-Key (reservation_id)** — F5 không tạo 2 booking. (( Ch23. ))
      - **Optimistic locking** với version column — phù hợp khi contention thấp/vừa. Pessimistic `SELECT FOR UPDATE` khi flash sale.
      - **CDC cập nhật cache async** — Debezium đọc binlog → Kafka → invalidate Redis cache hotel availability. (( Ch23: dual-write SQL + cache không atomic → dùng CDC làm single source of truth. ))
      - **Cross-service tx (booking + payment)** — Saga compensation hoặc TC/C. Reserve → charge → confirm | release nếu fail.
    - **Mấu chốt**: overbook là bug nghiêm trọng. Latency phụ thuộc consistency cần — RDB Postgres OK với ~10k TPS, vượt thì shard `hotel_id`.

  ---

  - **Geospatial / proximity / nearby** (Yelp, Uber, Tinder, Find My Friends):
    - **Đặc tính**: query 2D `WHERE near(lat, lng) AND radius < X km`, B-tree index 1D không hiệu quả (phải scan toàn bảng), data có thể static (POI) hoặc dynamic (real-time location).
    - **Pattern kĩ thuật**:
      - **Geohash** — chia map đệ quy 4 ô, mã hóa thành chuỗi base32. Length 4 ≈ 20km, length 6 ≈ 1.2km. Prefix match = nearby. (( Ch17: 2 toạ độ gần nhau có thể khác prefix nếu nằm sát biên ô → query thêm 8 cell neighbor. Mở rộng radius = bỏ kí tự cuối. ))
      - **Quadtree** — in-memory tree, chia ô đến khi `< K POI/cell`. Hỗ trợ K-nearest dynamic radius. (( Cost: build lại tại startup → blue-green deploy. ))
      - **Google S2** — Hilbert curve map 2D → 1D, geofence. Phức tạp, dùng khi cần.
      - **Schema tốt**: 1 row per `(geohash, business_id)` thay vì 1 row per geohash + JSON array. (( Ch17: insert/update đơn giản, không lock JSON. ))
      - **Real-time location update**: backend fanout > peer-to-peer khi nhiều friend. (( Ch18 Nearby Friends 14M update/s: WS cluster + Redis Pub/Sub channel per `user_id` + Redis TTL key cho location (TTL → auto offline). ))
      - **Cache key = geohash, không phải toạ độ tuyệt đối** — GPS lệch vài mét → key luôn mới → cache miss 100%. Map về geohash → cùng grid = cùng key.
    - **Mấu chốt**: read-heavy → RDB OK với index geohash; dynamic location 14M update/s → Redis + WS draining auto-scale.

  ---

  - **Search / autocomplete / typeahead** (Google search, IDE, e-commerce search):
    - **Đặc tính**: latency < 100ms, prefix match, top-K ranking, cập nhật từ event stream, stale chấp nhận được.
    - **Pattern kĩ thuật**:
      - **Inverted index (term → doc list)** — Elasticsearch, OpenSearch. Tokenize, normalize, posting list. (( Lucene under the hood. Ch24 email search dùng ES cho < 1 tỉ email; Gmail-scale tự build LSM index. ))
      - **Trie + cache top-K tại node** — Ch14 autocomplete: O(1) lookup top suggestion vì cache sẵn ở node prefix. (( Trade-off: build job aggregate weekly từ raw query log, sample 1/N để giảm volume. ))
      - **CDC index pipeline**: source DB binlog → Kafka → indexer → ES/Trie. (( Tách concern: write-path đơn giản, read-path optimize riêng. ))
      - **Sharding**: ES auto-shard theo doc; Trie shard theo first char + shard map manager.
      - **Suggest ranking**: weight theo recency × frequency × personalization.
    - **Mấu chốt**: full-text expensive ở mobile bandwidth — cache aggressive client-side. Ranking là 80% giá trị, không phải index speed.

  ---

  - **URL shortener / hash service** (bit.ly, t.co):
    - **Đặc tính**: write nhẹ, read cực nặng (mỗi click 1 read), mapping 1-1 long-short, cần unique, cần predict-resistant.
    - **Pattern kĩ thuật**:
      - **Base62 encoding** — 62^7 ≈ 3.5 nghìn tỉ key. (( a-z, A-Z, 0-9. Ch9. ))
      - **Random + collision check** — generate random 7 char, check Bloom filter trước → DB unique constraint cuối. (( Bloom filter pre-check tránh đập DB. ))
      - **Counter-based + Base62** — auto-increment ID → encode. (( Predictable, đối thủ enumerate được. Trộn với hash + secret nếu cần. ))
      - **Cache 90%** — read phổ biến → Redis hit > 90%. TTL theo popularity.
      - **301 vs 302**: 301 cached browser (giảm load) nhưng mất analytic; 302 tracking đầy đủ. (( Ch9. ))
    - **Mấu chốt**: rất single-purpose nhưng đại diện cho mọi hệ thống "input → unique short ID".

  ---

  - **Distributed ID generation** (Snowflake, ULID):
    - **Đặc tính**: unique cross-machine, không cần coordinator, sortable theo thời gian, fit 64-bit hoặc 128-bit.
    - **Pattern kĩ thuật**:
      - **Snowflake 64-bit**: `sign(1) + timestamp(41) + dc(5) + machine(5) + sequence(12)`. (( 41-bit ms ≈ 69 năm. 32 dc × 32 machine = 1024 generator. 4096 ID/ms/machine. ))
      - **UUID v4** — 128-bit random, không sortable, không lộ info.
      - **UUID v7 / TIMEUUID** — 128-bit timestamp prefix → sortable, dùng cho DB index B-tree không bị fragment.
      - **Ticket server** — central counter, SPOF, tránh nếu có lựa chọn khác.
      - **Multi-master DB auto-increment** — mỗi master step N với offset khác → unique nhưng phức tạp.
    - **Mấu chốt**: Snowflake là lựa chọn default. TIMEUUID khi muốn vừa unique vừa tăng theo thời gian (Cassandra, email Ch24).

  ---

  - **Web crawler / batch processing** (Googlebot, web archive):
    - **Đặc tính**: outbound tải lớn, politeness (không DoS site), tránh trap, dedup nội dung, scale ngàn worker.
    - **Pattern kĩ thuật**:
      - **Politeness queue** — per-host queue + delay (Crawl-Delay), 1 worker/host. (( Ch10. Ngược lại = bị site block IP. ))
      - **Frontier (URL chờ crawl)** + **seen set** — Bloom filter check duplicate URL. (( Tiết kiệm bộ nhớ vs HashSet. ))
      - **BFS thay DFS** — tránh đào sâu spider trap (auto-generated URL vô hạn). URL depth limit.
      - **DNS resolver cache** — DNS lookup chậm → cache mạnh.
      - **Distributed worker** — Kafka URL queue + N consumer.
      - **Robots.txt** — fetch + cache + tôn trọng.
      - **Priority queue** — PageRank/freshness score quyết định URL nào crawl trước.
      - **Content dedup** — hash content body → bỏ qua trang trùng.
    - **Mấu chốt**: ngoài tech, là bài toán **respect** với external system. Bị block IP = end of game.

  ---

  - **Notification / multi-channel fanout** (Twilio + SendGrid + APNs + FCM):
    - **Đặc tính**: 3rd-party heavy (mỗi channel 1 provider riêng), at-least-once + idempotent, retry queue, user preference, rate limit per user.
    - **Pattern kĩ thuật**:
      - **Channel adapter** — interface chung, implementation per channel: APNs (iOS), FCM (Android), Twilio/Nexmo (SMS), SendGrid/SES (email). (( Ch11. Anti-corruption layer wrap mỗi vendor. ))
      - **Notification template** — string template versioned, tránh dup hardcode.
      - **Dedupe theo `event_id`** — cùng event không gửi 2 lần (user F5, retry).
      - **User preference / opt-in/out** — DB lưu, check trước khi gửi, hỗ trợ unsubscribe link.
      - **Rate limit per user** — 1 user không nhận 100 notification/phút.
      - **Retry queue + DLQ** — failed delivery → retry exponential → DLQ inspect manual.
      - **Reliability log** — DB record mỗi lần gửi (status, attempt, response).
    - **Mấu chốt**: 3rd-party flaky → must idempotent + retry + DLQ + observability.

  ---

  - **Real-time leaderboard / ranking** (game, fitness app, Kahoot):
    - **Đặc tính**: top-K query liên tục, score update cao, tie-break stable.
    - **Pattern kĩ thuật**:
      - **Redis Sorted Set (ZSET)** — Ch26. `ZADD`, `ZINCRBY`, `ZREVRANGE 0 9`, `ZREVRANK` đều O(log n). (( ZSET = hash + skip list. 5M user ≈ 650MB → 1 Redis node OK. 500M DAU → shard. ))
      - **Sharding 2 cách**:
        - **Fixed range partition** theo score (>1000, 500-1000, 0-500). Top-K dễ. Hot range nguy cơ.
        - **Hash partition** (Redis Cluster, 16384 slot CRC16). Top-K = scatter-gather (query mọi shard, merge). (( Ch26. ))
      - **Tie-break**: thêm timestamp vào score → unique ordering. (( `score = points * 10^10 + (10^10 - timestamp)`. ))
      - **DynamoDB alternative** — write sharding `(leaderboard_id, shard_id)` → aggregate khi đọc.
    - **Mấu chốt**: RDB không scale (full-table sort). Redis là lựa chọn default.

  ---

  - **CRM / nghiệp vụ phức tạp / workflow** (Salesforce-like, internal tool):
    - **Đặc tính**: nhiều bounded context, workflow long-running (giờ-ngày), state machine có timer + retry + compensate, người là loop trong luồng.
    - **Pattern kĩ thuật**:
      - **DDD bounded context** — ranh giới microservice. (( "Customer" trong sales context khác "Customer" trong billing context. ))
      - **Workflow engine** — Temporal, Cadence, AWS Step Functions, Camunda. (( Code workflow như function bình thường, engine tự persist state, retry, timer, recovery. ))
      - **Saga orchestration** — central coordinator giữ state machine.
      - **Outbox pattern** — DB write + event ghi cùng tx → relay đọc outbox publish Kafka. (( Tránh dual-write inconsistency. ))
      - **CQRS** — read model riêng cho dashboard, search, report.
      - **Audit log** — every write append-only event log (event sourcing lite).
    - **Mấu chốt**: phức tạp nghiệp vụ > phức tạp scale. Đầu tư state machine engine sớm tiết kiệm 6 tháng.

  ---

  - **Object storage / S3-like** (Ch25):
    - **Đặc tính**: immutable object, write-once-read-many, multi-tenant, cost-optimize ở cold tier, durability cực cao (11 nines).
    - **Pattern kĩ thuật**: tách metadata (SQL sharded `hash(bucket, name)`) khỏi data (placement service Paxos/Raft 5-7 node), replication group cho hot, erasure coding 8+4 cho cold, file-merge ghép object nhỏ → file lớn read-only, multipart upload (5MB-5GB chunk), versioning bằng `object_version` TIMEUUID + delete marker, MD5 checksum verify, garbage collection compact.
    - **Mấu chốt**: dùng S3 thay tự build trừ khi quy mô Dropbox.

  ---

  - **Aggregation / analytics / OLAP** (ad click, BI dashboard, metrics):
    - **Đặc tính**: write-heavy event stream, query agg (SUM, COUNT, GROUP BY), latency query phút-giây OK, accuracy có thể approximate.
    - **Pattern kĩ thuật**:
      - **Lambda architecture** — batch (chính xác, chậm) + speed layer (gần real-time, approximate) → merge. (( Phức tạp do duy trì 2 codebase. ))
      - **Kappa architecture** — chỉ stream (Flink/Kafka Streams) + replay khi cần fix. (( Ch22 ad click. ))
      - **Star schema** — fact table (event) + dimension table (dim_user, dim_ad, dim_time). (( OLAP chuẩn. ClickHouse, BigQuery, Snowflake. ))
      - **Exactly-once** — Flink checkpoint + Kafka transactional producer.
      - **Probabilistic data structure** — HyperLogLog (unique count), Count-Min Sketch, T-Digest (percentile). (( Tiết kiệm bộ nhớ khi accuracy 99% là đủ. ))
      - **Pre-aggregation** — rollup theo phút/giờ/ngày → query nhanh.
    - **Mấu chốt**: OLAP tách OLTP. Đường nối bằng CDC + Kafka.

  ---

  - **Monitoring / observability** (Prometheus + Grafana, Datadog):
    - **Đặc tính**: extreme write (mỗi server N metric × 15s), query đa chiều (PromQL), alerting rule, retention policy.
    - **Pattern kĩ thuật**: TSDB (InfluxDB, Prometheus, BigTable), pull (Prometheus) vs push (StatsD, CloudWatch), Kafka buffer giữa collector + TSDB, downsampling theo retention (raw 7d → 1min/30d → 1h/1y), aggregation tại agent/pipeline/query side, alerting (rules YAML → query → threshold → notify Slack/PagerDuty), filter/merge/dedupe. (( Ch21. ))
    - **Mấu chốt**: cardinality (số combination label) là kẻ thù. `user_id` làm label = nổ TSDB.

  ---

  - **Email service** (Gmail-like, transactional email):
    - **Đặc tính**: nặng read inbox + folder, threading, search, denormalize phổ biến, deliverability nghiệp vụ.
    - **Pattern kĩ thuật**: NoSQL `(user_id, folder_id, email_id TIMEUUID)` (Cassandra), denormalize `read_emails` + `unread_emails` table cho query trạng thái nhanh, threading qua JWZ algorithm (`Message-Id`, `In-Reply-To`, `References` header), search ES (small) hoặc custom LSM (Gmail-scale), HTTP API thay POP/IMAP/SMTP truyền thống, deliverability = dedicated IP + sender reputation + classify + feedback loop + SPF/DKIM/DMARC. (( Ch24. ))
    - **Mấu chốt**: deliverability là 80% bài toán production email.

  ---

  - **Ultra-low-latency trading / matching** (stock exchange, crypto exchange):
    - **Đặc tính**: latency < 1ms p99, fairness ordering, no message loss, 24/7 monitoring, regulatory.
    - **Pattern kĩ thuật**: matching engine in-memory single-thread (LMAX disruptor pattern, ring buffer + cache line padding tránh false sharing), sequencer assign global order, mmap file persist, NACK multicast (Aeron) thay TCP, market data publisher fanout L1/L2/L3 quote, Raft HA cluster, co-location (rack cùng exchange), chaos engineering. (( Ch29. ))
    - **Mấu chốt**: 99% case không cần — chỉ HFT/exchange. Học để hiểu ceiling của low-latency.

- **Vẽ ra được**:
  - **User flow**: từng action user → màn hình → API → response. (( Tìm "khoảnh khắc thật" — moment user nhấn nút và phải đợi gì. ))
  - **Transaction flow**: cross-service step, where commit, where rollback/compensate. (( Ví dụ payment: reserve inventory → charge card → confirm → notify. Nhánh fail mỗi step. ))
  - **Workflow / state machine**: trạng thái entity (`pending → authorized → captured → settled → refunded`), điều kiện chuyển. (( Bài tập: vẽ FSM trước khi vẽ component. ))

- **Câu hỏi cốt cần làm rõ B1** (3-10 phút):
  - Build feature gì cụ thể? Scope cắt thế nào? (( Ví dụ "build Twitter" → hỏi: chỉ post + feed, hay full DM/notification/search? ))
  - Bao nhiêu user? DAU/MAU, plan tăng (3m/6m/1y)?
  - Read/Write ratio? Hot key tồn tại không (celebrity)?
  - Ai là actor? (user, admin, internal service, 3rd-party webhook).
  - Cần edit/delete sau không? (immutable hay mutable).
  - Dữ liệu giữ bao lâu? (retention, GDPR).

### 1.2 Non-functional requirement
> Quyết định kiến trúc (replication, sharding, geo-distribute), SLA, công nghệ.

- **Latency**: p50/p95/p99. (( Mobile in-app < 200ms cảm giác instant. Trading < 1ms round-trip — Ch29 dùng mmap, NACK multicast Aeron, cache line padding. ))
- **Throughput**: QPS / TPS / writes-per-sec / events-per-sec. (( Wallet Ch28 = 1M TPS → cluster + sharding + Raft. ))
- **Availability**: số 9. (( 99.9% = 8.76h down/năm. 99.99% = 52 phút. Hot-hot multi-region cho 99.999%. ))
- **Consistency requirement**: phần nào strong, phần nào eventual?
  - Strong: tiền, inventory, auth.
  - Eventual: like count, view count, presence, feed.
- **Scalability**: scale dimension nào? (user, data, geo, request).
- **Durability**: RPO chấp nhận mất gì. (( S3 11 nines = 1 trong 100 tỉ object/năm mất. ))
- **Reliability**: RTO, MTTR, fault tolerance. (( Single-AZ down vẫn serve được không? ))
- **Security & compliance**: PCI-DSS, GDPR, HIPAA, SOC2. (( PCI → token thay raw card. ))
- **Cost**: $/request, $/GB-month, egress fee.

- **BOTE (back-of-the-envelope)** — luôn ước số trước khi vẽ:
  - QPS = `DAU × actions/day / 86400`. Peak = `2-3× avg`.
  - Storage = `entries/day × size × retention`.
  - Bandwidth = `QPS × payload`.
  - (( **Ví dụ Twitter** repo Ch3: 300M MAU, 50% DAU, 2 tweet/day, 10% media → 7000 peak QPS, media 30TB/day → 5y ≈ 55PB. ))

---

## 2. Hình dung kiến trúc tổng quát

> Sau khi rõ logic, chọn 1 trong các phong cách. Có thể mix.

- **Event-driven** — state change phát event, downstream react. (( Loose coupling, async, scalable. Ch22 ad click, Ch28 wallet. Khó debug, eventual consistency. ))
- **Data-driven** — luồng data qua pipeline (collect → transform → store → query). (( Ch21 monitoring, Ch22 ad click. Lambda (batch+stream) vs Kappa (stream-only). ))
- **Client-server** — request/response cổ điển. (( Web app, REST API, mobile backend. ))
- **Microservice** — bounded context per service, DB riêng, comm qua API/event. (( Bài toán **tổ chức**, không phải kĩ thuật. Anti-pattern: distributed monolith — share DB, sync chain dài. ))
- **Monolith modular** — 1 deploy unit, module rõ ràng bên trong. (( Khởi đầu nên monolith. Tách microservice khi đội >10 dev hoặc service scale khác nhau rõ. ))
- **Hybrid (phổ biến nhất)**: monolith core + vài service tách rời (notification, media, search).

---

## 3. Thiết kế high-level

### 3.1 Mô hình đơn giản nhất — vẽ 4 lớp

- **Bộ nhận request** (entry layer):
  - **Phương thức**:
    - **REST/HTTP** — public API, cache HTTP tốt. (( Standard cho mọi thứ. ))
    - **gRPC** — internal microservice, HTTP/2, protobuf binary, bi-directional stream. (( Latency thấp hơn JSON 2-5x. ))
    - **GraphQL** — mobile/aggregation, tránh over/under-fetch. (( Khó cache HTTP, schema bắt buộc. ))
    - **WebSocket** — bi-directional persistent, chat/game/collab. (( Server stateful → cần sticky/service discovery. ))
    - **SSE** — server push 1 chiều qua HTTP. (( Stock ticker, notification feed, LLM token stream. ))
    - **WebRTC** — peer-to-peer audio/video/data. (( Signaling qua server, media qua STUN/TURN. ))
    - **Webhook** — server gọi callback URL. (( PSP báo payment, GitHub event. Cần endpoint public + verify signature. ))
    - **Long polling** — fallback khi WS không khả dụng. (( Ch16 Drive dùng long polling thay WS — đơn chiều đủ. ))
  - **LB**:
    - **L4** (TCP, IP hash) — fast, không hiểu HTTP.
    - **L7** (HTTP path/header) — route theo URL, host, header.
    - Algorithms: round-robin, weighted RR, least-conn, IP hash. (( Sticky session khi stateful. Redundant LB + heartbeat tránh SPOF. ))
    - **GSLB / GeoDNS** — route theo region.
  - **Auth / validate**:
    - JWT (stateless), session (stateful redis), OAuth 2.0, OIDC, API key, mTLS. (( JWT tốt cho microservice → không lookup mỗi request. Risk: revoke khó → short TTL + refresh token. ))
    - Input validation, schema (Zod/Pydantic/protobuf).
    - Rate limit / WAF / DDoS protection (CloudFlare, AWS Shield).
  - **API gateway** — single entry: routing, auth, rate limit, aggregation, transform, SSL termination. (( **BFF (Backend For Frontend)**: gateway riêng cho mobile vs web. ))

- **Bộ xử lí** (compute layer):
  - **Sync** — request đợi response. (( Đơn giản, immediate, dễ debug. Risk: cascade failure nếu chuỗi sync dài. ))
  - **Async / event-driven** — nhận request → enqueue → 200 OK → worker xử lí.  (( Decouple producer-consumer, buffer spike, retry dễ. Ví dụ: upload video Ch15, send email Ch24, notification Ch11. ))
  - **Stream processing** — Flink, Spark Streaming, Kafka Streams. (( Ch22 ad click aggregation, Ch21 metrics pipeline. ))
  - **Batch** — chạy định kì (Airflow, cron). (( Reconciliation Ch27, autocomplete aggregator weekly Ch14. ))

- **Đồng bộ + xử lí trạng thái transaction qua worker**:
  - **Saga orchestrator** — central state machine. (( Temporal, Cadence, AWS Step Functions. ))
  - **Saga choreography** — event-driven, decentralized. (( Khó debug, có cyclic dependency risk. ))
  - **TC/C (Try-Confirm/Cancel)** — 2 pha local tx: reserve → confirm/cancel. (( Ch28 wallet, hotel reservation Ch23. Cần phase status table cho recovery. ))
  - **2PC** — coordinator block đến all node ack. (( SPOF + blocking. Tránh ở scale lớn. ))
  - **Outbox pattern** — DB write + event ghi cùng tx → CDC publish. (( Tránh dual-write inconsistency. Debezium đọc binlog → Kafka. ))

- **Quản lí adapter / interface đến agent / 3rd-party**:
  - **Anti-corruption layer** — adapter giữ domain model sạch, không leak schema 3rd-party. (( DDD pattern. Bao bọc PSP, ES, kafka client riêng. ))
  - **Circuit breaker** wrap external call. (( Hystrix, Resilience4j. ))
  - **Webhook handler** — verify signature + idempotent + queue.
  - **Polling fallback** — nếu webhook miss → cron poll status. (( Payment Ch27 dùng cả webhook + polling reconcile. ))

### 3.2 Trình bày business logic qua design API

- **REST resource modeling**:
  - `POST /orders`, `GET /orders/{id}`, `PATCH /orders/{id}/cancel`.
  - Idempotency-Key header cho `POST` non-idempotent. (( Stripe convention. ))
- **Pagination**: cursor (stable cho infinite scroll) > offset (skew khi insert).
- **Versioning**: `/v1/...`, header `Accept: application/vnd.api+json;v=2`. Backward compatible bắt buộc cho microservice.
- **Error format**: `{ code, message, details }` chuẩn (RFC 7807 problem+json).
- **Status code**: 200/201/204 success, 4xx client, 5xx server. 429 rate limit + `Retry-After`.
- **Async API contract**: `202 Accepted` + `Location: /jobs/{id}` để poll, hoặc webhook callback.

---

## 4. Đi sâu bài toán cụ thể

### 4.1 Vấn đề non-functional cần scale

- **Consistency model**:
  - **Strong (linearizable)** — read luôn thấy write mới nhất. (( Money, inventory. Trade-off: latency cao, partition không serve được. Ch23 hotel `CHECK total_reserved <= inventory*1.1`. ))
  - **Weak** — không guarantee. (( View count, like; người dùng không nhận ra delay vài giây. ))
  - **Eventual** — converge cuối cùng. (( DNS, social feed, presence. Ch7 KV store dùng quorum + vector clock + Merkle anti-entropy. ))
  - **Read-your-write** — user thấy chính write của mình ngay. (( Trick: read từ master cho session vừa write, hoặc sticky session đến replica đã sync. ))
  - **Monotonic read** — không bao giờ nhảy lùi. (( Critical cho timeline: tránh nhảy số like xuống. ))

- **CAP / PACELC**:
  - Partition không tránh được → chọn **CP** (block giữ consistency) hoặc **AP** (cho write, sync sau).
  - **PACELC**: P→A vs C; **else**→**L**atency vs **C**onsistency. (( Cassandra AP+L. HBase CP+C. DynamoDB tunable. ))

- **Quorum (N, W, R)**: `W+R > N` ⇒ strong consistency. (( Ch7 KV: W=1,R=N fast write. W=N,R=1 fast read. ))

### 4.2 Từng hợp phần

- **Communication method**:
  - REST cho public, gRPC cho internal, GraphQL cho mobile aggregation, WS/SSE cho real-time, RPC cho RPC framework cũ.
  - Sync vs async: **fire-and-forget**, **req-reply**, **stream**, **pub/sub**.

- **Concurrency model**:
  - **Thread per request** — Java/Spring boot truyền thống. (( Đơn giản, tốn RAM (1MB stack/thread), block-friendly. ))
  - **Event loop / async** — Node.js, Python asyncio, Go (goroutine cooperative). (( Throughput cao, scale 100k connection 1 process, nhưng CPU-bound block toàn bộ loop. ))
  - **Actor model** — Erlang/Elixir, Akka. (( Mỗi actor 1 mailbox, immutable message → fault isolation. ))
  - **Coroutine** — Go goroutine, Kotlin coroutine, Python async. (( Lightweight thread, hàng triệu/process. ))
  - **Reactive** — Project Reactor, RxJava. (( Backpressure built-in. ))

- **Service: lựa chọn ngôn ngữ + framework**:
  - I/O-bound (web API, gateway): Node, Go, Python async. (( Ch29 stock exchange dùng JVM HotSpot + mmap cho latency. ))
  - CPU-bound (transcode, ML): Rust, C++, Go.
  - Stateful real-time: Go, Erlang.
  - Big data: Scala/Java + Spark/Flink.

### 4.3 Tối ưu

- **Giảm tải / caching**:
  - **CDN** — static + edge compute. (( Pull (lazy, phổ biến) vs Push (upload chủ động). Invalidation qua API hoặc `?v=2`. ))
  - **Reverse proxy cache** — Nginx, Varnish, Cloudflare.
  - **App cache** — Redis, Memcached. (( Cache-aside (look-aside) phổ biến. Write-through fresh nhưng slow. Write-back fast nhưng risk mất. ))
  - **DB query cache** — materialized view, query result cache.
  - **In-process cache** — Caffeine, LRU map. (( Latency ns, không network hop. Risk: stale cross-instance. ))
  - **Cache hierarchy**: browser → CDN → reverse proxy → app cache → DB cache → DB. (( Ch12 News Feed 5 lớp: feed cache | content (hot post) | social graph | action | counter. ))
  - **TTL trade-off**: ngắn → DB load; dài → stale.
  - **Eviction**: LRU phổ biến, LFU khi access pattern lệch, FIFO đơn giản.
  - **Hot key**: shard hash thêm random suffix, hoặc local cache + pub/sub invalidate.

- **Batching**:
  - Client-side: gom request 50ms cửa sổ. (( DataLoader trong GraphQL gom N+1 thành 1. ))
  - Server-side: bulk insert/update. (( Ch24 email: bulk write `read_emails` table. ))
  - Stream micro-batch: Spark structured streaming, Flink mini-batch.

- **Indexing**:
  - **B+ tree** — read-fast, RDB index. (( Trade-off: write expand, page split. ))
  - **LSM tree** — write-fast, append-only + compact. (( Cassandra, RocksDB, Ch24 email index, Ch28 wallet event log. ))
  - **Inverted index** — full-text search. (( Ch24 email ES; term → posting list. ))
  - **Composite / covering index** — match query cụ thể, tránh table lookup.
  - **Bloom filter** — pre-check tránh disk read miss. (( Ch7 KV, Ch9 URL shortener check duplicate. ))
  - **Geospatial**: geohash, quadtree, S2. (( Ch17, Ch18. Ch17 chọn schema 1 row per `(geohash, business_id)` thay JSON array. ))
  - **Vector index**: HNSW, IVF (Pinecone, Qdrant, pgvector). (( Cho RAG / semantic search. ))

- **Streaming**:
  - Kafka append log + consumer group → replay.
  - CDC (Debezium) đọc binlog MySQL/Postgres → publish Kafka. (( Ch23 hotel cache async cập nhật qua CDC. ))
  - Backpressure built-in: consumer chậm → producer block hoặc drop.

### 4.4 Design pattern

- **Idempotency**:
  - Idempotency-Key header → DB unique constraint trên column. (( Ch27 payment: cart ID hoặc nonce; PSP yêu cầu `nonce`/`token`. Result store kèm key để return cho retry. ))
  - Natural idempotent: `PUT`, `DELETE`. Không idempotent: `POST` (cần key).
  - Cần kết hợp với at-least-once để đạt **exactly-once-effect**.

- **Retry policy**:
  - **Immediate** — chỉ cho lỗi tạm vi mô.
  - **Fixed interval** — đơn giản.
  - **Incremental** — tăng tuyến tính.
  - **Exponential backoff + jitter** — chuẩn industry. (( 1s → 2s → 4s → 8s + random jitter tránh thundering herd. ))
  - **Max retry + cancel** → DLQ.
  - Phải đi với **idempotency** tránh double-effect.

- **Offloading**:
  - Heavy work → background queue. (( Send email, transcode video, generate report. ))
  - Pre-signed URL upload trực tiếp client → S3, không qua app server. (( Ch15, Ch25. ))

- **Rate limit & throttling** algorithm:
  - **Token bucket** — phổ biến nhất, allow burst. (( Stripe, GitHub API. ))
  - **Leaky bucket** — smooth rate, không burst.
  - **Fixed window** — đơn giản, biên giới spike (2x trong 1 giây giáp ranh).
  - **Sliding log** — chính xác, tốn memory.
  - **Sliding window counter** — cân bằng. (( CloudFlare. ))
  - Triển khai: Redis `INCR + EXPIRE`; race condition → Lua script atomic hoặc sorted set. Distributed: centralized store thay sticky.
  - Trả `429 Too Many Requests` + `X-RateLimit-Remaining`, `X-RateLimit-Limit`, `Retry-After`.

- **Circuit breaker**:
  - 3 state: **Closed** (cho phép) → **Open** (chặn) → **Half-open** (test). (( Hystrix/Resilience4j. ))
  - Threshold: error rate > X% trong window N → open. Timeout cooldown → half-open thử lại.
  - Tránh cascade failure khi 1 dependency chết kéo cả hệ thống.

- **Backpressure**:
  - Consumer chậm → producer biết để slow down. (( Reactive stream chuẩn. Kafka consumer lag metric. ))
  - Tracking lag (Kafka offset diff), nếu lag tăng → drop / sample / reject.

- **Bulkhead**:
  - Cô lập resource pool theo service / tenant. (( Thread pool riêng cho từng downstream. 1 dependency chết không hút hết thread. ))
  - Tách connection pool DB, queue, thread pool.

- **Prevent thundering herd**:
  - **Cache stampede**: nhiều request cùng miss cùng key → đập DB. Fix:
    - **Single-flight** / request coalescing — 1 request fetch, others wait.
    - **Probabilistic early refresh** — refresh trước khi expire xác suất tăng.
    - **Lock + serve stale** — 1 request refresh, others serve stale.
  - **Retry storm**: nhiều client retry cùng lúc → exponential backoff + **jitter** bắt buộc.
  - **Cron scatter**: cron 0:00 đập DB → spread theo `hash(user_id) % 60` phút.

### 4.5 Vấn đề thiết kế khi tải cao

> Tìm bottleneck → phân tách service hợp lí.

- **R/W ratio → CQRS**:
  - Read >> Write (newsfeed, search, dashboard) → tách read replica, denormalize cho query.
  - Write >> Read (logging, metric, audit) → append-only LSM, partition by time.
  - **CQRS**: tách command (write model) khỏi query (read model). Pair với event sourcing. (( Ch28 wallet: command/event log → state machine; CQRS read model push reverse proxy real-time. ))

- **Decouple + scale tránh service A chết kéo B**:
  - **Async messaging** — Kafka/SQS giữa service.
  - **Bulkhead** — pool riêng.
  - **Circuit breaker + timeout + fallback** — fail fast, default response.
  - **Event-driven** — publisher không cần biết subscriber còn sống.

- **OLTP vs OLAP**:
  - **OLTP** — short tx, high concurrent, normalized schema (Postgres, MySQL). (( Order, payment, user data. ))
  - **OLAP** — long query, scan nhiều, denormalized star schema (BigQuery, Snowflake, ClickHouse, Redshift). (( Ch22 ad click star schema, dashboard, analytics. ))
  - Đường nối: **CDC → Kafka → ETL → warehouse**. Hoặc dual-write (risky).

- **HA (High Availability)**:
  - Multi-AZ active-active. Multi-region active-passive (failover) hoặc active-active (geo-routing).
  - Health check + auto-failover. Heartbeat + leader election (Raft, Zookeeper).
  - **Hot site / warm site / cold site** — RTO/RPO trade-off.

- **Sharding**:
  - **Hash-based** — `hash(key) % N`. (( Đều, nhưng resharding khó. Fix bằng consistent hashing. ))
  - **Range-based** — khoảng giá trị (date, ID range). (( Hot range: account mới nhất, time series gần. ))
  - **List-based** — explicit map (region → shard). (( Maintain map. ))
  - **Composite** — `(tenant_id, date)`.
  - Vấn đề:
    - **Resharding** → consistent hashing + virtual node (Ch5).
    - **Hot key / celebrity** → re-shard hot key, hybrid push/pull (Ch12).
    - **Cross-shard JOIN** không khả thi → denormalize.
    - **Cross-shard tx** → Saga / TC/C.

---

## 5. Kiến thức kĩ thuật cụ thể trade-off, lựa chọn

### 5.1 Message queue

| | Kafka | RabbitMQ | Redis Pub/Sub | SQS / Pub/Sub managed |
|---|-------|----------|---------------|----------------------|
| Model | Log (partition, offset) | Broker (queue, exchange) | In-memory pub/sub | Managed queue |
| Persistence | Disk, retention | Disk có | Memory (no replay) | Managed disk |
| Throughput | Rất cao (1M+/s) | Cao (50k/s) | Cao nhưng không reliable | Vừa |
| Ordering | Per-partition | Per-queue | Không guarantee | Per-message-group (FIFO) |
| Replay | Có (offset reset) | Không | Không | Không |
| Use case | Event log, stream, replay (Ch22, Ch28) | Task queue, RPC, complex routing | Pub/sub fanout nhanh (Ch18 nearby friends) | Don't manage infra |

- **Khi chọn Kafka**: cần replay, retention dài, multiple consumer group, throughput rất cao.
- **Khi chọn RabbitMQ**: routing key phức tạp, RPC, priority queue, deadline.
- **Khi chọn Redis Pub/Sub**: ephemeral fanout, real-time, OK mất message. (( Ch18: per-channel `user_id` để gửi update vị trí. ))
- **Cloud managed**: SQS, SNS, Google Pub/Sub, Azure Service Bus. (( Trade-off: lock-in, cost, nhưng zero ops. ))

- **Feature checklist**: FIFO, delay delivery, at-least-once, exactly-once (dedupe), DLQ, ordering, poison pill, backpressure, scheduled message (timing wheel — Ch20).

### 5.2 Data storage

- **SQL vs NoSQL**:
  - **SQL (Postgres, MySQL)** — ACID, JOIN, schema cứng, materialized view. (( Ch23 hotel: read-heavy + ACID, RDB phù hợp. Ch27 payment ledger: ACID bắt buộc. ))
  - **NoSQL** — schema lỏng, scale ngang dễ, eventual OK. Phân loại:

| Loại | Đặc trưng | Ví dụ | Use case |
|------|-----------|-------|----------|
| **Document** | JSON-like, nested | MongoDB, Couchbase | Catalog, content, profile |
| **Key-Value** | Hash table | Redis, DynamoDB | Session, cache, leaderboard (Ch26) |
| **Wide-Column** | Column family, sparse, tunable | Cassandra, HBase, BigTable | Time series, write-heavy, Ch24 email |
| **Graph** | Node + edge | Neo4j, ArangoDB | Social graph, recommendation, fraud |
| **Time-series** | Timestamp index, downsampling | InfluxDB, Prometheus, TimescaleDB | Metrics (Ch21), IoT |
| **Vector** | ANN search (HNSW, IVF) | Pinecone, Qdrant, pgvector | RAG, semantic search |
| **Search** | Inverted index | Elasticsearch, OpenSearch | Full-text, log (Ch24) |

- **Distributed file storage**:
  - **Block storage** (EBS, iSCSI) — VM, DB. (( Mutable, high perf. ))
  - **File storage** (NFS, EFS, SMB) — shared FS. (( POSIX. ))
  - **Object storage** (S3, GCS, Azure Blob) — immutable blob, cheap. (( Ch25: tách metadata + data, replication group + Paxos/Raft placement, file-merge ghép object nhỏ → file lớn read-only, erasure coding 8+4 cold. ))
  - **HDFS** — distributed FS cho big data, append-only.

- **SQL → indexer (vector / ES / cache)** qua binlog → consumer:
  - CDC: Debezium đọc MySQL binlog / Postgres WAL → Kafka → consumer → Elasticsearch / Redis / vector DB.
  - Tránh dual-write inconsistency (write SQL + write ES không atomic).
  - **Outbox pattern**: app ghi DB + event vào outbox table cùng tx → relay đọc outbox → publish.
  - (( Ch23 hotel: cache cập nhật async qua CDC. ))

- **Partition: hot vs cold**:
  - **Hot tier** — SSD, in-memory, high QPS. (( Last 7-30 ngày. ))
  - **Warm tier** — HDD, lower QPS. (( 30-90 ngày. ))
  - **Cold tier** — S3 Glacier, tape archive, retrieve theo phút/giờ. (( Ch16 Drive cold storage cho inactive. ))
  - Lifecycle policy auto-tier theo tuổi.
  - Time-series: partition by day/hour, drop old partition rẻ hơn DELETE.

- **DB đặc biệt**:
  - **Cassandra** — wide-column, AP, tunable quorum, write-heavy, no master. (( LSM tree, hinted handoff, gossip. Discord chat history, Netflix. ))
  - **ClickHouse** — columnar OLAP, analytical query nhanh, MergeTree. (( Ad analytics, observability. ))
  - **DuckDB** — embedded analytical (SQLite-style nhưng OLAP). (( Local ETL, notebook. ))
  - **CockroachDB / Spanner** — distributed SQL, NewSQL, Raft + serializable. (( Strong global consistency với cost latency. ))
  - **TiDB** — MySQL-compatible distributed SQL.
  - **ScyllaDB** — Cassandra-compatible C++, latency thấp hơn.
  - **DynamoDB** — managed KV/document, predictable latency. (( Ch26 leaderboard alternative qua write sharding. ))
  - **RocksDB** — embedded LSM KV. (( Engine cho Kafka Streams state, Flink, Ch28 wallet event log file-based. ))
  - **etcd / Zookeeper / Consul** — distributed coordination, leader election, config, service discovery.

---

## 6. Kĩ thuật nâng cao

### 6.1 Distributed system / high concurrency

- **Lock**:
  - **Pessimistic** — `SELECT ... FOR UPDATE`, mutex. (( Contention cao, deadlock risk. ))
  - **Optimistic** — version column / CAS, validate khi commit. (( Contention thấp tốt. Cao → retry storm. ))
  - **Distributed lock** — Redis `SETNX + TTL`, Redlock (controversial), Zookeeper ephemeral node. (( Risk: clock skew, GC pause → fence token bắt buộc. ))

- **Lock-free**:
  - **CAS (Compare-And-Swap)** — atomic primitive. (( Java AtomicInteger, Go atomic. ))
  - **Lock-free queue / ring buffer** — disruptor pattern (LMAX). (( Ch29 stock exchange: ring buffer + cache line padding tránh false sharing. ))
  - **Sharded counter** — N counter, sum khi đọc. (( Tránh contention 1 hot row. ))
  - **CRDT (Conflict-free Replicated Data Type)** — merge tự động không conflict. (( Collaborative editing, Redis CRDT, Riak. ))

- **Consensus**:
  - **Paxos** — classic, khó implement.
  - **Raft** — leader-based, dễ hiểu hơn. (( Ch28 wallet đồng bộ event log majority alive. Ch25 placement service 5-7 node. ))
  - **ZAB** (Zookeeper Atomic Broadcast).
  - Trade-off: consensus = strong nhưng latency cao + odd number node + majority alive.

- **Quorum**: Ch7 — N replica, W ack write, R ack read, `W+R>N` strong.

- **Leader election**: Raft, Zookeeper ephemeral + watch, etcd lease.

- **Vector clock**: Ch7 — `(server_i, version_i)` mỗi item, detect ancestor / sibling. Tăng vô hạn → GC version cũ.

- **Merkle tree**: anti-entropy reconcile replica, Git, blockchain.

### 6.2 Handle failure

- **Pattern cơ bản** (đã list mục 4.4): retry + backoff + jitter, circuit breaker, bulkhead, timeout, fallback, DLQ.

- **Hinted handoff + sloppy quorum**: node down tạm → temp replica nhận write thay → replay khi back. (( Ch7. ))

- **Erasure coding (8+4)**: 50% storage overhead, 11 nines durability, compute nặng. (( Ch25 cold object. ))

- **Failover strategies**:
  - **Active-passive** — passive standby, switch khi master down. (( DNS failover, hoặc VIP qua keepalived. ))
  - **Active-active** — đa region serve cùng lúc. (( Cần conflict resolution, geo-routing. ))

- **Graceful degradation**:
  - Disable feature non-critical khi load cao. (( Disable recommendation khi feed service quá tải, vẫn show feed. ))
  - Read-only mode khi write tier xuống.

- **Chaos engineering**: Netflix Chaos Monkey, Gremlin. (( Ch29 stock exchange áp dụng. Inject failure để verify system. ))

### 6.3 Conflict & race condition

- **DB constraint** — đơn giản nhất, fail-safe. (( Ch23 hotel `CHECK total_reserved <= total_inventory * 1.1`. ))
- **Idempotency key** — DB unique constraint. (( Ch27 payment. ))
- **Optimistic locking** — version + retry.
- **Compensating transaction** — Saga pattern.
- **CRDT** — merge tự động.
- **LWW (last-write-wins)** — simple, có thể mất write.
- **Vector clock + sibling resolution** — application-level merge logic. (( Ch7. ))
- **Reconciliation periodic job** — so settlement / source-of-truth định kì. (( Ch27 payment reconciliation với PSP settlement file. ))

### 6.4 Observability

- **4 pillar**:
  - **Logging** — structured (JSON), append, searchable. (( ELK stack: Elasticsearch + Logstash + Kibana. Hoặc Loki. ))
  - **Metrics** — time-series numeric. (( Prometheus + Grafana = PLG-ish. CPU, mem, QPS, p50/p95/p99, business metric (DAU, revenue, retention). ))
  - **Tracing** — distributed trace span. (( Jaeger, Zipkin, Tempo. OpenTelemetry chuẩn. Trace ID propagate cross-service. ))
  - **Alerting** — rule trên metric → notify. (( PagerDuty, Opsgenie, Slack, email. SLO burn rate alert > threshold alert. ))

- **Stack phổ biến**:
  - **ELK / EFK**: Elasticsearch + Logstash/Fluentd + Kibana. (( Heavy nhưng powerful. ))
  - **PLG**: Promtail + Loki + Grafana. (( Loki = log indexed by label, không full-text → cheap hơn ES. ))
  - **Datadog / New Relic / Honeycomb** — managed full-stack. (( Cost cao, zero ops. ))
  - **OpenTelemetry** — vendor-neutral standard. (( Recommended cho mới start. ))

- **Pull vs Push collection** (Ch21):

| | Pull (Prometheus) | Push (CloudWatch, StatsD) |
|---|------|------|
| Health check | Built-in (target down detect) | Cần extra |
| Debug | Dễ (curl `/metrics`) | Khó hơn |
| Scale | Consistent hash collector range | Agent local aggregate |
| Use case | K8s, internal | Mobile, batch job, ephemeral |

- **Pipeline scaling**: Kafka buffer giữa collector và TSDB. Aggregation tại agent / pipeline / query side. Snapshot + downsampling: raw 7d → 1min/30d → 1h/1y.

- **Alerting workflow** (Ch21): rules YAML → Alert Manager fetch → query so threshold → tạo alert → store state → push qua Kafka → consumer gửi notify. Filter, merge, dedupe, retry.

### 6.5 Vấn đề scale

- **DB scale**:
  - Read replica (master-slave). (( Lag risk, read-your-write trick. ))
  - Sharding (mục 4.5).
  - Multi-master (master-master): conflict resolution phức tạp.
  - **Quorum tunable** — Cassandra `LOCAL_QUORUM`, `EACH_QUORUM`.
  - Federation theo function (user DB, product DB, billing DB). (( Cross-DB JOIN khó. ))
  - NewSQL (Spanner, CockroachDB) — Raft + auto-shard.

- **Caching scale**:
  - Redis Cluster — 16384 slot, CRC16, auto-shard. (( Ch26 leaderboard 500M DAU shard option. ))
  - Consistent hashing client-side (Memcached client).
  - Replication: master-replica, sentinel auto-failover.
  - Multi-region: read-local, write-primary; hoặc CRDT.
  - Cache invalidation: TTL, pub/sub broadcast invalidate, write-through.

- **Message queue scale**:
  - Kafka: thêm partition, consumer group. (( Order chỉ guarantee per-partition. ))
  - RabbitMQ: queue mirroring, federation, sharded queue.
  - Tránh **head-of-line blocking** — slow message khoá partition: priority queue / DLQ / parallel consumer (key-based dispatch).

- **Geo-distribute**:
  - GeoDNS / Anycast → route gần.
  - Read-local, write-primary (eventual cross-region).
  - Active-active multi-region cần conflict resolution + global lock service.
  - Edge compute (Cloudflare Workers, Lambda@Edge).

- **Auto-scale**:
  - Stateless tier dễ — HPA theo CPU/QPS/custom metric.
  - Stateful (WS server, DB) khó — drain mode, consistent hash rebalance.
  - (( Ch18 Nearby Friends: WS node remove → "draining", LB stop routing mới, đợi connection cũ đóng. ))

---

## 7. Operate hệ thống production — HA, Sharding, Coordinator, Scale

> Phần này là **operator's mental model**: khi nhìn 1 stateful system bất kì (Redis, Postgres, ClickHouse, Cassandra, Kafka, RabbitMQ...), bạn biết hỏi đúng câu hỏi, biết trade-off, biết cách scale, biết chỗ vỡ. Không phải tutorial cài đặt — là **lưu đồ tư duy + war story**.

### 7.0 Vì sao stateful khó hơn stateless 100 lần?

- **Stateless service** (API, gateway, worker thuần): chết → khởi tạo container mới → vào load balancer → xong. Identity = bất kì. Scale = `+N pod`.
- **Stateful system**: node có **identity** (replica-0, shard-A) + có **data trên disk** + đang **giữ vai trò** (leader/follower) trong cluster.
  - Chết → phải replicate data ra trước khi remove.
  - Restart → phải rejoin đúng identity, catch-up log, không serve traffic đến khi ready.
  - Scale → resharding = move data tốn band­width, có thể vỡ ordering.
  - Upgrade → version N và N+1 phải nói chuyện được trong window rolling.

> **3 keyword chi phối mọi quyết định**: **identity, replication, ordering**. Hỏi 3 cái này cho mọi system bạn sẽ nắm được kiến trúc trong 30 phút.

#### Lưu đồ tư duy chung (template hỏi cho mọi stateful system)

```
                    ┌──────────────────────────┐
                    │  System X (Redis/PG/...)  │
                    └────────────┬──────────────┘
                                 │
       ┌──────────┬──────────────┼─────────────┬──────────────┐
       ▼          ▼              ▼             ▼              ▼
   [HA]      [Sharding]    [Coordinator]    [Scale]      [Failure]
   - leader  - partition   - external?      - read/      - data
     election  scheme        embedded?        write?       loss?
   - failover - rebalance  - quorum?        - vertical/  - split
     time      cost          watch/lease?    horizontal?  brain?
   - RPO      - hot key    - operator?      - bottleneck? - corrupt?
```

5 câu hỏi vàng dán lên tường:

1. Ai là leader? Election bao lâu? Failover thủ công hay auto?
2. Mất 1 node = mất bao nhiêu data (RPO)? Async/sync replicate?
3. Resharding online hay phải downtime? Pre-shard từ đầu được không?
4. Backup + restore: ai chịu trách nhiệm? Đã restore thử bao giờ chưa? RTO?
5. Upgrade rolling: protocol N ↔ N+1 backward compat? Drain logic?

#### 3 layer ops — chọn theo team size

| Layer | Tooling | Khi nào dùng | Đau ở đâu |
|-------|---------|-------------|-----------|
| **Manual** | Bash, Ansible, Terraform | Solo dev, <3 cluster | Toil cao, 3am paging, drift config |
| **Operator** | k8s CRD + controller (Strimzi, CNPG, Cass-op) | Team SRE 3-20, >5 cluster | Học operator riêng cho từng DB, debug control loop |
| **Managed** | RDS, MSK, ElastiCache, Atlas, Confluent Cloud | 90% startup/SMB | Lock-in, $$$, ít tùy biến (no plugin custom) |

> **Quy tắc**: bắt đầu **managed**. Khi cost > $20k/tháng hoặc cần feature managed không có (CDC plugin, custom UDF) thì self-host qua **operator**. **Không bao giờ tự operator nếu chưa qua 6 tháng managed**.

#### Replication mode — 4 lựa chọn cốt lõi

```
Async              Semi-sync          Sync (quorum)        Chain
─────              ─────────          ─────────────        ─────
P──▶R              P──▶R (đợi K/N)    P──▶ALL              P──▶R1──▶R2──▶R3
RPO: vài giây      RPO: ≈0 nếu K≥1   RPO: 0               RPO: 0
Latency: 1x        Latency: 1.x       Latency: 2x          Latency: N×
Avail: cao         Avail: vừa         Avail: thấp          Avail: thấp
Use: Redis,        Use: Postgres      Use: Spanner,        Use: hiếm
     Cassandra ANY      sync_standby       Cosmos strong       (CRAQ)
```

- **Phải hiểu** trade-off này — chọn sai = mất data hoặc mất uptime.
- Default cho money/ledger: **semi-sync K=1** (1 replica fsync).
- Default cho cache: **async** (mất chấp nhận được).
- Default cho global SQL: **quorum** qua Raft (CockroachDB, Spanner).

---

### 7.1 Khung tư duy: HA + Sharding + Coordinator giao thoa thế nào?

3 khái niệm thường bị nhầm lẫn. Tách rõ:

| Khái niệm | Giải bài toán gì | Ví dụ |
|-----------|------------------|-------|
| **HA (High Availability)** | "Node chết, hệ thống vẫn live" | Replica + auto-failover |
| **Sharding** | "1 node không đủ → chia ra" | Partition data theo key |
| **Coordinator** | "Cluster cần đồng thuận về metadata" | Leader election, slot map |

3 cái **độc lập**: HA không cần sharding (Postgres primary + replica), sharding không cần HA (Citus shard 1 replica), coordinator có thể embedded (Redis Cluster gossip) hoặc external (Kafka legacy → Zookeeper).

```
        ┌─────────────────────────────────────┐
        │   1 cluster đầy đủ production      │
        ├─────────────────────────────────────┤
        │                                     │
        │   [Coordinator quorum 3-5 node]    │  ← consensus, leader election,
        │   ZK / etcd / Keeper / Raft        │     slot/partition map
        │              ▲                      │
        │              │ watch + lease        │
        │              ▼                      │
        │   ┌──────────────────────┐         │
        │   │  Shard 1   Shard 2   │  ...    │  ← sharding chia data
        │   │  ┌─P─┐    ┌─P─┐     │         │
        │   │  │ R │    │ R │     │  ← HA   │  ← replication trong shard
        │   │  │ R │    │ R │     │         │
        │   │  └───┘    └───┘     │         │
        │   └──────────────────────┘         │
        │                                     │
        └─────────────────────────────────────┘
```

#### Trục trade-off khi chọn HA strategy

| Trục | Lựa chọn | Cost | Bạn được gì | Bạn mất gì |
|------|----------|------|-------------|-----------|
| Replication | Async | Rẻ | Latency thấp | RPO > 0 |
| Replication | Sync | Đắt | RPO = 0 | Latency × 2, replica down → primary block |
| Failover | Manual | 0 ops | Kiểm soát | RTO 10-60 phút |
| Failover | Auto | DCS quorum | RTO 10-60s | Split-brain risk nếu config sai |
| Topology | Single AZ | Rẻ | Latency thấp | AZ down = chết |
| Topology | Multi-AZ | Network $$$ | AZ down OK | Cross-AZ replication lag |
| Topology | Multi-region | $$$$$ | Region down OK | CRDT/conflict resolution phức tạp |

#### Trục trade-off khi chọn Sharding scheme

| Scheme | Phân phối | Range query | Resharding | Hot key |
|--------|-----------|-------------|------------|---------|
| **Hash** | Đều | Phải scatter-gather | Đau (consistent hash giảm) | Vẫn có nếu key skew |
| **Range** | Có thể skew | Locality tốt | Split range dễ | Hot range cuối |
| **List** | Manual map | OK | Cập nhật map | Phải re-balance manual |
| **Composite** | `(tenant, time)` | Linh hoạt | Phức tạp | Theo design |
| **Consistent hash** | Đều | Phải scatter | Smooth khi add/remove node | Vnodes mitigate |

> **Default**: hash + virtual node (Cassandra, Redis Cluster, ScyllaDB). Range cho time-series + scan dài (HBase, ClickHouse partition). Composite cho multi-tenant SaaS.

#### Coordinator: external vs embedded

```
External coordinator           Embedded (gossip / Raft in-process)
─────────────────────          ────────────────────────────────────

  ┌────────────┐                  ┌──────┐ ◀─gossip─▶ ┌──────┐
  │ Zookeeper  │                  │ Node │            │ Node │
  │  (3 node)  │                  └──────┘            └──────┘
  └─────┬──────┘                      ▲                  ▲
        │ watch                       │     gossip       │
   ┌────▼────┐                        ▼                  ▼
   │ Cluster │                     ┌──────┐            ┌──────┐
   │  data   │                     │ Node │ ◀─gossip─▶ │ Node │
   │ node #N │                     └──────┘            └──────┘
   └─────────┘

Pros: 1 nguồn truth,             Pros: 1 binary, 1 dependency
      mature, pluggable            không SPOF coordinator
Cons: thêm dependency             Cons: gossip overhead O(N²),
      phải vận hành                       upgrade protocol khó
Used by: Kafka legacy,            Used by: Cassandra, ScyllaDB,
   ClickHouse Replicated,                  Redis Cluster, Kafka KRaft,
   HBase, Solr, Patroni                    ClickHouse Keeper
```

> **Xu hướng 2024+**: mọi hệ thống chuyển từ external (ZK) sang embedded (Raft trong process). Lý do: 1 binary, ít moving part, ít ops.

---

### 7.2 Redis — cache + KV + leaderboard + pub/sub all-in-one

> Bài toán Redis giải: **memory-speed access** cho cache, session, counter, queue, leaderboard, real-time pub/sub. Single-thread (per shard) nhưng sequential atomic — đơn giản đến mức đẹp.

#### Bốn mode triển khai — chọn theo nhu cầu HA + scale

```
Standalone           Master-Replica          Sentinel              Cluster
──────────           ──────────────          ──────────            ───────

  ┌───┐              ┌───┐                    ┌───┐               ┌─M─┐ ┌─M─┐ ┌─M─┐
  │ M │              │ M │──async──▶┌───┐     │ M │──async──▶┌─R─┐│slot│ │slot│ │slot│
  └───┘              └───┘          │ R │     └───┘          └───┘│0-5k││5k-1││11k+│
                                    └───┘     ▲   ▲                └─R─┘ └─R─┘ └─R─┘
                                   ┌─[Sentinel quorum 3]─┐
HA: ❌                HA: thủ công             HA: auto              HA: auto
Shard: ❌            Shard: ❌                 Shard: ❌             Shard: ✓ (16384 slot)
QPS: ~100k/inst      QPS: read scale x N      QPS: read scale       QPS: scale ngang
Use: dev/local       Use: cache + read replica Use: 1 master HA     Use: scale lớn
```

| Mode | HA | Sharding | Multi-key tx | Khi nào chọn |
|------|----|----|--------------|--------------|
| Standalone | ❌ | ❌ | ✓ | Dev, local cache |
| Master-Replica | Manual | ❌ | ✓ on master | Read scale, cache |
| Sentinel | Auto failover | ❌ | ✓ on master | 1 master HA, RAM đủ |
| Cluster | Auto | ✓ | Chỉ same-slot | RAM > 100GB hoặc QPS > 200k |

#### HA — Sentinel hoạt động thế nào?

```
        ┌─────────────────────────────────────────────┐
        │   Sentinel quorum (3 node — odd)            │
        │   ┌────┐    ┌────┐    ┌────┐               │
        │   │ S1 │────│ S2 │────│ S3 │               │
        │   └─┬──┘    └─┬──┘    └─┬──┘               │
        └─────┼─────────┼─────────┼───────────────────┘
              │ ping    │ ping    │ ping
              ▼         ▼         ▼
            ┌──────────────────────┐
            │ Master  ──async──▶ R │
            └──────────────────────┘

Failover sequence:
1. Sentinel ping master fail (default 30s) → mark "subjectively down" (SDOWN)
2. Sentinel hỏi nhau → quorum đồng ý → "objectively down" (ODOWN)
3. Vote 1 Sentinel làm leader (Raft-style)
4. Leader chọn replica tốt nhất (priority + replication offset)
5. PROMOTE replica → SLAVEOF NO ONE
6. Reconfigure replica khác trỏ master mới
7. Notify client (Pub/Sub channel) hoặc client tự retry
RTO: 10-30s. RPO: vài giây async write chưa kịp ship.
```

**Pitfall thực tế**: 2 Sentinel ≠ HA — split-brain khi network partition (2 vote 1-1 không quyết). **Phải 3+ Sentinel ở 3 AZ khác nhau**.

#### HA — Cluster hoạt động thế nào?

- **Gossip protocol**: mỗi node ping 1 node random + 1 node nghi ngờ mỗi giây. Thông tin lan toàn cluster trong vài giây.
- Khi master fail: các master khác (gossip phát hiện) vote replica của master fail → promote.
- **Slot reassignment**: replica mới làm master nhận slot của master cũ.
- **Client smart**: client cache topology, gặp `MOVED` redirect → update topology.

```
Cluster slot map (16384 slot):

  Master A (slot 0-5460) ──▶ Replica A1
  Master B (slot 5461-10922) ──▶ Replica B1
  Master C (slot 10923-16383) ──▶ Replica C1

Client request:  GET user:42
  → CRC16("user:42") % 16384 = 7283
  → slot 7283 → Master B
  → connect Master B trực tiếp
```

#### Sharding — hash tag là cứu cánh

Multi-key operation (MULTI/EXEC, Lua, SUNION) **chỉ chạy được nếu key cùng slot**. Hash tag fix:

```redis
SET {user:42}:profile  "..."   # CRC16 chỉ tính "user:42"
SET {user:42}:session  "..."   # → 2 key cùng slot
MULTI
GET {user:42}:profile
GET {user:42}:session
EXEC                            # ✓ atomic
```

#### Coordinator
- Sentinel mode: Sentinel cluster = coordinator.
- Cluster mode: gossip embedded, **không cần external**.
- K8s: **Spotahome Redis Operator** / **OT-CONTAINER-KIT** / **KubeDB** / **Redis Enterprise Operator** quản failover, scale, persistence config.

#### Playbook scale Redis

| Mục tiêu | Cách | Ngưỡng break |
|----------|------|--------------|
| Scale read | Thêm replica + route `READONLY` | ~10 replica/master, lag tăng |
| Scale write | Cluster mode shard | 1 master ~100k QPS |
| Scale RAM | Cluster shard | 1 master >100GB → fork RDB chậm |
| Scale CPU | Redis 6.0+ I/O thread (network parse) | Vẫn single-thread cho command |

#### Best practice (đánh số để dán lên tường)

1. `maxmemory` < 50% RAM (chừa fork RDB copy-on-write spike).
2. **Tắt Transparent Huge Pages** (`echo never > /sys/kernel/mm/transparent_hugepage/enabled`) — fork latency drop 10x.
3. Persistence hybrid: RDB snapshot daily + AOF `appendfsync everysec`.
4. Eviction: cache → `allkeys-lru`. Session → `volatile-lru` + TTL.
5. Monitor: `INFO replication`, `LATENCY DOCTOR`, slow log (`slowlog-log-slower-than 10000`), `CLUSTER INFO`.
6. Client lib smart: `redisson` (Java), `lettuce` (Java reactive), `go-redis`, `ioredis` — handle topology refresh, retry, pipelining.
7. Pipelining cho batch — 100 GET trong 1 round-trip thay 100 round-trip.
8. **Lua script** cho atomic multi-step (rate limit token bucket, distributed lock with fence).

#### Pitfalls thực tế (war story)

- **Big key**: 1 ZSET 10M member → `DEL` block 5 giây → toàn bộ instance đứng. Fix: `UNLINK` async, hoặc design tránh big key (shard thành 100 sub-key).
- **Hot key**: 1 key được 1M QPS → 1 master 100% CPU, replica có 0%. Fix:
  - Shard hot key: `key:${hash(req_id) % 32}` aggregate khi đọc.
  - Local cache 100ms TTL trước Redis.
- **`KEYS *` production** = block toàn bộ → outage. Banner đỏ: dùng `SCAN`.
- **Sentinel split-brain**: 2 Sentinel + network partition → false failover. **3 Sentinel 3 AZ bắt buộc**.
- **`WAIT` không bằng durability**: replica nhận trong RAM nhưng chưa fsync → crash mất.
- **Cluster failover client cache stale** → request đến node sai → `MOVED` storm. Smart client handle, đừng tự code.
- **Pub/Sub không persist** — consumer offline = mất. Streams (5.0+) thay thế durable.
- **TTL big-bang**: 1M key cùng expire 12:00:00 → CPU spike. **Jitter** TTL.

#### Production checklist Redis

- [ ] 3 Sentinel hoặc Cluster ≥ 3 master, mỗi cái khác AZ.
- [ ] `maxmemory-policy` set rõ.
- [ ] AOF + RDB enable, ship S3 daily.
- [ ] Slow log < 100 entry/phút.
- [ ] Memory < 70%, latency p99 < 5ms.
- [ ] Smart client (lettuce/redisson/go-redis) ở app.
- [ ] Disaster runbook restore từ S3 RDB.

---

### 7.3 PostgreSQL — OLTP vương miện

> Postgres giải bài toán **OLTP ACID transactional**: order, payment, user, audit log. JSON tốt, full-text OK, vector OK (pgvector). **Bottleneck quen thuộc**: connection (process per conn), write scale (single primary), vacuum.

#### Kiến trúc & tâm điểm: WAL

```
                 ┌─────────────────────────────────┐
                 │         Primary                 │
                 │  ┌──────────┐                   │
   Client write→ │  │ Backend  │──▶ Shared buffer │
                 │  │ Process  │      │            │
                 │  └──────────┘      ▼            │
                 │                ┌──────┐         │
                 │                │ WAL  │──fsync──┼──▶ disk
                 │                └──┬───┘         │
                 └───────────────────┼─────────────┘
                                     │ stream WAL
                          ┌──────────┴──────────┐
                          ▼                     ▼
                    ┌──────────┐          ┌──────────┐
                    │ Replica1 │          │ Replica2 │
                    │ replay   │          │ replay   │
                    └──────────┘          └──────────┘
```

WAL = source of truth. Crash recovery = replay WAL từ checkpoint cuối. Replication = ship WAL tới replica.

#### HA — sync mode 4 cấp

| `synchronous_commit` | Behavior | RPO | Khi dùng |
|---------------------|----------|-----|----------|
| `off` | Group commit, ko đợi WAL flush local | <1s | Audit log, throughput log |
| `local` | Đợi WAL fsync local | 0 local | Default đa số case |
| `on` | Đợi sync replica xác nhận WAL ghi disk | 0 | Money, critical |
| `remote_apply` | Đợi sync replica replay xong WAL | 0 + read-your-write replica | Read-after-write strict |

```sql
-- Sync replication setup
synchronous_standby_names = 'ANY 1 (replica1, replica2)'
-- → Đợi 1 trong 2 replica ack. 1 replica down → primary vẫn live.
synchronous_commit = on
```

> **Trap**: `FIRST 1 (r1, r2)` → r1 down = primary block (đợi r1 mãi). Dùng `ANY` cho quorum, an toàn hơn.

#### Failover tooling — Patroni de facto

```
                ┌──────────────────────────────┐
                │  DCS (etcd / Consul / k8s)  │  ← lock + leader key
                └──────────────┬───────────────┘
                               │ watch + lease
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
        ┌──────────┐     ┌──────────┐     ┌──────────┐
        │ Patroni  │     │ Patroni  │     │ Patroni  │
        │ + PG     │     │ + PG     │     │ + PG     │
        │ (Leader) │     │(Standby) │     │(Standby) │
        └──────────┘     └──────────┘     └──────────┘
              ▲                                  
              │                                  
        VIP / Service / HAProxy ◀── client write
```

Failover steps:
1. Leader Patroni **fail to renew lease** trong DCS (default 10s).
2. Standby Patroni race lock → 1 winner.
3. Winner: `pg_promote()` → biến primary.
4. Cập nhật DCS → cũ Patroni của leader fenced (STONITH/demote).
5. VIP/Service trỏ leader mới.
- RTO: 10-60s tùy `ttl` config.

> **Watchdog hardware** (softdog kernel) khuyên enable — primary mất quorum DCS → kernel reset OS để tránh split-brain write.

#### Sharding Postgres

| Cách | Ưu | Nhược |
|------|-----|------|
| **Citus extension** | SQL transparent, JOIN cross-shard | Coordinator SPOF (HA Citus phải 2 coord), giới hạn syntax |
| **App-level shard** | Linh hoạt, không phụ thuộc | Code phức tạp, phải tự handle cross-shard tx |
| **Foreign Data Wrapper** | Query cross-server | Performance kém, không phải shard thật |
| **TimescaleDB** | Tự shard time-series (chunk) | Chỉ time-series |
| **Logical rep + multi-cluster** | Migration, split DB theo function | DDL không sync auto |

> **Quy tắc thực tế**: Postgres scale dọc tới 64-128 vCPU + 1TB RAM tới 50k TPS. **Đa số case không cần shard** — partition declarative theo time/tenant đủ. Khi >100TB hoặc >100k TPS → Citus hoặc chuyển CockroachDB/Spanner.

#### Operator k8s

| Operator | Đặc điểm | Khi chọn |
|----------|---------|----------|
| **CloudNativePG (CNPG)** | Modern, sync rep, S3 backup, monitoring | **Recommend default 2024+** |
| **CrunchyData PGO** | Mature, enterprise feature, pgBackRest tích hợp | Enterprise / regulated |
| **Zalando Postgres-Operator** | Patroni-based, sớm nhất | Legacy migration |
| **KubeDB** | Multi-DB lite | Small team, đa loại DB |

#### Playbook scale Postgres

```
                     [Bottleneck typical Postgres]
                              │
            ┌─────────┬───────┴───────┬──────────┐
            ▼         ▼               ▼          ▼
        Connection  Read load    Write load   Storage
            │         │               │          │
            ▼         ▼               ▼          ▼
        PgBouncer  Read replica  Partition   Tablespace
        (txn pool) +HAProxy/      time/tenant   tier
                   Pgpool         + Citus       + S3 archive
```

1. **Connection scale**: PgBouncer transaction mode — 10k client → 100 backend. **Không bao giờ raw 10k conn**.
2. **Read scale**: 3-5 replica + read-only routing. Lag monitor `pg_stat_replication`.
3. **Write scale**:
   - Vertical first: 32 → 64 → 128 vCPU.
   - **Partition declarative** theo tháng/tuần → drop old partition O(1).
   - **Citus** khi >50k TPS hoặc multi-tenant cần isolation per tenant.
4. **Storage**: tablespace tier hot/cold, archive WAL S3 cho PITR.
5. **Vacuum**: tune `autovacuum_vacuum_scale_factor=0.05` cho table lớn, monitor bloat (`pg_stat_user_tables`), cảnh giác **xid wraparound** (frozen → autovacuum aggressive 200M xid).

#### Best practice

1. **Backup**: pgbackrest hoặc wal-g + S3, retention 30 ngày, **test restore mỗi tháng**.
2. **Connection pool**: PgBouncer transaction mode đặt sidecar app pod hoặc cluster trung tâm.
3. **DDL safe**:
   - `CREATE INDEX CONCURRENTLY` (không lock).
   - `ALTER TABLE ADD COLUMN ... DEFAULT ...` PG11+ skip rewrite.
   - Add NOT NULL: 1) add nullable, 2) backfill, 3) `SET NOT NULL`.
4. **Long transaction killer**: `idle_in_transaction_session_timeout = '5min'`, `statement_timeout = '30s'`.
5. **Index**:
   - B-tree default.
   - GIN cho JSONB, full-text, array.
   - GiST cho geo, range.
   - BRIN cho time-series huge (low overhead).
   - HNSW (pgvector) cho vector.
   - Partial / covering index match query cụ thể.
6. **EXPLAIN (ANALYZE, BUFFERS)** mọi query slow.
7. **`pg_stat_statements`** enable — top slow query auto.
8. Logical replication cho zero-downtime upgrade major version.

#### Pitfalls thực tế

- **Failover xong client vẫn write old primary** → fence cần network-level (VIP/Service rebind), không chỉ DNS (TTL cache).
- **Sync replica down → primary block**: phải có `ANY` quorum hoặc fallback async tự động (Patroni `synchronous_mode_strict=false`).
- **Logical replication không sync DDL** — apply manual cả 2 side, dễ lệch schema.
- **`VACUUM FULL`** lock exclusive. Online thay bằng **`pg_repack`**.
- **JSONB lớn** (>2KB) → TOAST chunk → query slow. Tách table.
- **Connection storm sau failover**: 10k client retry → primary 100% CPU. App side retry với jitter.
- **`pg_dump` không phải backup**: lock long-running, slow restore.
- **Wraparound emergency**: xid 32-bit. >2 tỷ xid không vacuum frozen → DB read-only. Monitor `datfrozenxid`.

#### Production checklist Postgres

- [ ] Patroni hoặc CNPG operator + DCS 3 node 3 AZ.
- [ ] Sync rep `ANY 1` cho money, `async` cho non-critical.
- [ ] PgBouncer txn mode, max conn DB ≤ 200.
- [ ] WAL archive S3, PITR test monthly.
- [ ] `idle_in_transaction_session_timeout`, `statement_timeout` set.
- [ ] `pg_stat_statements` + slow query alert > 1s.
- [ ] Replica lag alert > 10s.
- [ ] Bloat monitor + autovacuum tuned.

---

### 7.4 ClickHouse — OLAP columnar nhanh kinh khủng

> Bài toán: **analytical query trên hàng tỷ row**. Ad click, dashboard BI, observability log/metric, security analytics. ~100x Postgres cho aggregate query. Trade-off: **không phải OLTP** — UPDATE/DELETE đắt, không có transaction.

#### Kiến trúc MergeTree

```
INSERT (batch 10k row)
        │
        ▼
   [Part mới]──┐
   ID: 202401_1_1_0
   200k row    │ background
   columns: 50 │ merge job
   compressed  │
        ▼     ▼
   ┌──────────────┐
   │ Merged Part  │
   │ 202401_1_5_1 │  ← level 1
   │ 1M row       │
   └──────┬───────┘
          │ merge tiếp
          ▼
   ┌──────────────┐
   │ Big Part     │  ← level N (LSM-style)
   │ 50M row      │
   └──────────────┘
```

- Insert nhỏ tạo nhiều part → merge tốn → **luôn batch ≥ 10k row**.
- Mỗi part sort theo `ORDER BY` key → primary index = sparse index (1 mark / 8192 row).
- Skip index per column: `minmax`, `set`, `bloomfilter` → bỏ qua granule không match.

#### HA — ReplicatedMergeTree

```
   ZooKeeper / ClickHouse Keeper (3-5 node Raft)
              ▲       ▲       ▲
              │ meta  │ meta  │ meta (part list, replication log)
              │       │       │
        ┌─────┴───────┴───────┴─────┐
        ▼                           ▼
   ┌──────────┐    fetch part   ┌──────────┐
   │ Replica1 │ ◀────HTTP─────▶ │ Replica2 │
   │ (RMT)    │                 │ (RMT)    │
   └──────────┘                 └──────────┘
```

- Mọi replica **bình đẳng** — INSERT vào replica nào cũng được.
- Replica register part vào ZK → replica khác fetch HTTP.
- Quorum INSERT: `insert_quorum=2` đợi N replica ack.
- Failover = client retry replica khác (LB round-robin).

> **Migrate ZK → Keeper**: Keeper = Raft thay ZAB, native ClickHouse, 1 binary. Compatible protocol → drop-in. **Mọi cluster mới production 22.x+ nên dùng Keeper**.

#### Sharding — Distributed table

```
                Distributed table (no data, view)
                     │
                     ▼ split theo sharding_key
       ┌─────────────┼─────────────┬─────────────┐
       ▼             ▼             ▼             ▼
   ┌───────┐    ┌───────┐    ┌───────┐    ┌───────┐
   │ Shard1│    │ Shard2│    │ Shard3│    │ Shard4│
   │ ┌─R1─┐│    │ ┌─R1─┐│    │ ┌─R1─┐│    │ ┌─R1─┐│
   │ │RMT │├HA──┤ │RMT │├HA──┤ │RMT │├HA──┤ │RMT │├HA
   │ └────┘│    │ └────┘│    │ └────┘│    │ └────┘│
   │ ┌─R2─┐│    │ ┌─R2─┐│    │ ┌─R2─┐│    │ ┌─R2─┐│
   │ │RMT ││    │ │RMT ││    │ │RMT ││    │ │RMT ││
   │ └────┘│    │ └────┘│    │ └────┘│    │ └────┘│
   └───────┘    └───────┘    └───────┘    └───────┘

Topology: 4 shard × 2 replica = 8 ClickHouse node
        + 3 Keeper node
        = 11 node total cho 1 cluster production
```

- Sharding expression: `rand()` (uniform), `cityHash64(user_id)` (locality), `intHash64(date)` (time bucket).
- **Resharding = đau khổ**. Cách:
  1. `INSERT INTO new_cluster SELECT * FROM remote(...)`.
  2. Hoặc dump `freeze` partition + ship.
  3. Schedule ngày thấp tải, network bottleneck nặng.

#### Coordinator
- ZooKeeper (legacy) hoặc ClickHouse Keeper (recommend).
- Operator: **Altinity ClickHouse Operator** (mature, k8s) — `ClickHouseInstallation` (CHI) CRD: cluster topology, ZK config, user/password, PVC, monitoring.

#### Playbook scale ClickHouse

| Mục tiêu | Cách |
|----------|------|
| Read scale | Thêm replica per shard (load balance query) |
| Write scale | Thêm shard (sharding by `cityHash64(user_id)`) |
| Query latency | Materialized View pre-aggregate, primary key đúng |
| Cost | TTL move part → `cold` disk (S3-backed), ZSTD codec |
| Memory | `max_memory_usage` per query, kill query OOM thay node |

#### Best practice

1. **Batch insert** ≥ 10k row. Async insert (`async_insert=1`) gom server-side cho client streaming.
2. `ORDER BY` chọn cẩn thận — quyết định compression + skip index. Cardinality tăng dần (low → high).
3. `PARTITION BY toYYYYMM(date)` — drop partition O(1). Không partition theo high-cardinality (user_id).
4. **Materialized View** = real-time pre-aggregate. SummingMergeTree, AggregatingMergeTree cho counter/sum.
5. **Avoid mutation** (UPDATE/DELETE):
   - Dùng **ReplacingMergeTree** + `version` column → latest win at merge.
   - Hoặc **CollapsingMergeTree** + `sign=1/-1` cho insert/delete logical.
6. **Avoid JOIN lớn** → denormalize hoặc dùng **dictionary** (in-memory lookup table cho dim).
7. **Codec per column**:
   - Time: `Delta + ZSTD`.
   - Float metric: `Gorilla + LZ4`.
   - Cold: `ZSTD(9)` ratio cao.
8. Skip index: `minmax`, `bloom_filter` cho equality, `tokenbf_v1` cho LIKE.
9. **Schema migration cross-shard**: dùng `ON CLUSTER cluster_name` keyword. Quên = lệch shard.

#### Pitfalls thực tế

- **"Too many parts"** exception (>300 part/partition default) → server reject INSERT. **Nguyên nhân**: insert nhỏ + merge không kịp. Fix: batch + async insert + tăng `parts_to_throw_insert`.
- **ZK overload**: nhiều part → ZK znode nổ. Migrate Keeper, hoặc tăng merge speed.
- **Distributed insert risk**: data tạm trên coordinator → coord chết = mất batch. **Insert thẳng local table** + LB app-side là pattern an toàn.
- **Mutation hang**: ALTER UPDATE async, queue dài → block backup, replication. Tránh hoàn toàn.
- **Dictionary reload** full → block query. Dùng `cache` layout cho dict lớn.
- **Memory limit kill query** thay vì spill disk → user thấy lỗi 100% query nặng. Tune `max_memory_usage_for_user`.
- **JOIN order matters** — bảng nhỏ phải bên phải (build hash table).
- **Materialized View là trigger insert-time**, fail = INSERT fail. Test kỹ schema MV.

#### Production checklist ClickHouse

- [ ] 3-5 Keeper node cross-AZ.
- [ ] RF ≥ 2 (Replicated table) per shard.
- [ ] Backup `clickhouse-backup` ship S3.
- [ ] Batch insert ≥ 10k row (Kafka Engine table tự batch).
- [ ] TTL policy hot → cold S3.
- [ ] Materialized View cho dashboard query.
- [ ] Monitor: part count, ZK latency, merge queue, query memory.

---

### 7.5 Cassandra (+ ScyllaDB) — masterless write-heavy

> Bài toán: **write rất cao + multi-region active-active + tunable consistency**. Time-series, IoT, chat history, audit trail, sensor data. **Không phù hợp**: ad-hoc query, JOIN, mutable workload với DELETE nhiều.

#### Kiến trúc — token ring masterless

```
                Token ring (0..2^64)
       ┌─────────────────────────────────────┐
       │                                      │
       │    Node A (vnodes 256)               │
       │    own ranges [0-x1, y1-y2, ...]     │
       │           │                          │
       │           │ gossip ─────────         │
       │           │                 ▼        │
       │    Node B                Node C      │
       │    own [...]            own [...]    │
       │                                      │
       └──────────────────────────────────────┘

Partition key:  hash("user:42") = token T
Replicas:       N node clockwise từ T trên ring (RF=3 → 3 replica)
```

- **No master** → coordinator = bất kỳ node client connect.
- Coordinator forward request đến replica owner → aggregate → reply client.
- **Virtual nodes** (vnodes 256/node) → resharding smooth khi add/remove.

#### HA — tunable consistency là điểm khác biệt

```
W + R > N → strong consistency (R = read, W = write, N = RF)

RF=3:
  W=ONE, R=ONE  : fast, eventual           (1+1=2 < 3)
  W=QUORUM, R=QUORUM : 2+2 > 3 → strong    ← default production
  W=ALL, R=ONE  : 3+1 > 3 → strong, write slow
  W=LOCAL_QUORUM (multi-DC) : strong trong DC, async cross-DC
```

#### Multi-DC active-active

```
       DC East (RF=3)              DC West (RF=3)
       ┌──────────┐                ┌──────────┐
       │ A1 A2 A3 │ ◀──gossip──▶  │ B1 B2 B3 │
       └──────────┘                └──────────┘
            ▲                           ▲
            │ LOCAL_QUORUM              │ LOCAL_QUORUM
            │ (East users)              │ (West users)

Cross-DC replication: async → eventual consistency global.
EACH_QUORUM: strong global, slow.
```

#### Sharding native — không cần làm gì

- Partition key tự động hash → node owner. **Không cần coordinator slot map** như Redis.
- Schema design = **query-first**: 1 table per query pattern.
- Denormalize bắt buộc — không có JOIN.

```cql
-- Anti-pattern: relational normalize
CREATE TABLE users (id, name, email);
CREATE TABLE orders (id, user_id, ...);
-- → JOIN không có. Phải denormalize:

-- Pattern: query "orders của user gần đây"
CREATE TABLE orders_by_user (
  user_id uuid,
  order_time timestamp,
  order_id uuid,
  ...
  PRIMARY KEY (user_id, order_time)
) WITH CLUSTERING ORDER BY (order_time DESC);
-- partition key = user_id, sort by time, latest first
```

#### Repair — không repair = data zombie

```
Tombstone GC + repair window:

DELETE row → ghi tombstone (marker)
              │
              │ gc_grace_seconds (default 10 ngày)
              ▼
              tombstone bị compact xóa

NẾU node A miss DELETE (down quá 10 ngày, no repair)
   → A vẫn có row cũ
   → Read repair có thể propagate row cũ trở lại
   → DATA ZOMBIE 🧟

Fix: nodetool repair weekly per node. Reaper schedule subrange repair.
```

#### Operator
- **K8ssandra** (DataStax) — bundle full: Cassandra + Stargate (REST/GraphQL API) + Reaper (repair scheduler) + Medusa (backup S3) + Prometheus + Grafana.
- **Cass-operator** — core, less batteries.
- **ScyllaDB Operator** — cho Scylla.
- **Instaclustr managed**.

#### Playbook scale

- **Linear horizontal scale**: claim đến 1000 node. Add node → bootstrap stream data → join ring → vnode tự rebalance.
- **Decommission**: `nodetool decommission` → stream data ra → leave ring an toàn.
- **Compaction strategy** (chọn theo workload):
  - **STCS** (default) — write-heavy, write amp thấp, read amp cao.
  - **LCS** — read-heavy, even latency, write amp cao.
  - **TWCS** — time-series với TTL, drop window cũ O(1).

#### Best practice

1. RF=3, `LOCAL_QUORUM` cho online query.
2. **Cache layered**: key cache (default on), row cache (chỉ hot small), chunk cache (off-heap).
3. **Reaper** schedule subrange repair weekly per node — KHÔNG SKIP.
4. **Avoid wide partition** > 100MB. Pattern: composite partition `(user_id, month)`.
5. **Avoid tombstone**: dùng TTL thay DELETE, hoặc CollapsingMergeTree pattern application-level.
6. **Avoid LWT** (`IF NOT EXISTS`) trong hot path — Paxos slow 4x.
7. **Avoid `ALLOW FILTERING`** = full scan, ban production.
8. **Secondary index xấu** — dùng MV (materialized view, eventually consistent) hoặc duplicate table.
9. Backup snapshot per-node + ship S3 (Medusa).
10. ScyllaDB cân nhắc khi cần latency thấp 5-10x.

#### Pitfalls thực tế

- **Tombstone overload**: DELETE nhiều → tombstone không evict (chưa repair) → SELECT scan 1M tombstone → timeout.
- **Wide partition**: 1 partition 1GB → 1 node nóng + slow read.
- **Schema race condition**: 2 node DDL cùng lúc → schema disagreement → cluster split. Use `IF NOT EXISTS`.
- **Hint backlog**: node down lâu → hint accumulate → coordinator OOM.
- **Compaction backlog**: STCS với write-heavy → backlog → disk full → cluster down.
- **Repair tốn 12-24h** với cluster lớn — phải subrange + throttle.
- **Token range skewed** khi vnodes ít hoặc cluster mở rộng không đều → hot node.

#### Production checklist Cassandra

- [ ] RF ≥ 3 cross-AZ (NetworkTopologyStrategy).
- [ ] Reaper schedule weekly repair.
- [ ] Compaction strategy match workload.
- [ ] Backup Medusa S3.
- [ ] Tombstone alert > 1000/query.
- [ ] Wide partition alert > 100MB.
- [ ] Heap < 32GB (compressed oops), G1GC.

---

### 7.6 Kafka — distributed log nền tảng event-driven

> Bài toán: **append-only event log** với replay. Backbone của event-driven, CDC pipeline, stream processing, log aggregation. Không phải queue (mặc dù dùng được như queue).

#### Kiến trúc

```
            Topic "orders.created.v1"
   ┌───────────────────────────────────────────┐
   │                                           │
   │  Partition 0:  [m1][m2][m3][m4]...       │  ← log files
   │  Partition 1:  [m5][m6][m7]...            │
   │  Partition 2:  [m8][m9][m10][m11]...      │
   │  ...                                      │
   └───────────────────────────────────────────┘
           ▲                       ▲
           │ producer write        │ consumer read (offset)
           │ (key → partition)     │ (track offset trong group)
           │                       │
       ┌───┴────┐              ┌───┴────────────────┐
       │Producer│              │ Consumer Group "X" │
       │(idempot│              │ ┌──C1─┐ ┌──C2─┐    │
       │ +acks) │              │ │ p0  │ │ p1  │    │  1 partition
       └────────┘              │ └─────┘ └─────┘    │  → 1 consumer
                                └────────────────────┘
```

- **Append-only segment files** sequential write — disk siêu nhanh.
- **Consumer track offset** (broker stateless về consumer position).
- **Compact topic** = giữ latest per key → state store / changelog.

#### HA — ISR + acks combo

```
Topic partition 0 RF=3:
  Leader (broker 1) ──── replicate ───▶ Follower (broker 2)
                                │
                                └──────▶ Follower (broker 3)

ISR = In-Sync Replica = follower replicate lag < replica.lag.time.max.ms
Khi follower lag quá → bị kick khỏi ISR → không count cho acks=all

Acks levels:
  acks=0    : fire-and-forget,    RPO = ∞
  acks=1    : leader ack,         RPO = mất khi leader chết trước replicate
  acks=all  : ISR ack,            RPO = 0 nếu min.insync.replicas ≥ 2

Combo bền:  acks=all + min.insync.replicas=2 + RF=3
            = 1 broker fail KHÔNG mất data
```

#### Failover

- **Controller** (KRaft Raft quorum hoặc ZK) detect leader fail → elect ISR follower lên leader.
- ~1-30s tùy `replica.lag.time.max.ms` + heartbeat.
- **Unclean leader election** = follower out-of-ISR cũng được elect → available faster nhưng **mất data**. Production: **`unclean.leader.election.enable=false`**.

#### Sharding = partition

- Partition = unit of parallelism + ordering.
- Producer route: `hash(key) % partitions`. Same key → same partition → ordered.
- Consumer group: 1 partition assign 1 consumer per group (max).
- **Resharding (add partition)** = phá ordering historical key → khó. **Pre-allocate partition cao** (50-100) cho future scale.

#### Coordinator — KRaft thay ZK

```
ZK era (legacy):                    KRaft era (3.3+ stable):
┌──────────────┐                    ┌────────────────────┐
│   ZK quorum  │                    │ Kafka cluster      │
│   3-5 node   │                    │  ┌──Controller──┐  │
└──────┬───────┘                    │  │ quorum 3-5   │  │
       │                            │  │ (Raft)       │  │
       ▼                            │  └──────────────┘  │
┌──────────────┐                    │  ┌──Brokers─────┐  │
│ Kafka broker │                    │  │ data nodes   │  │
└──────────────┘                    │  └──────────────┘  │
                                    └────────────────────┘
2 dependency, 2 binary              1 binary, 1 dependency
```

> **Mọi cluster mới production 4.0+ dùng KRaft**. Migrate cluster ZK → KRaft là project lớn (downtime planning).

#### Operator
- **Strimzi** (Red Hat, k8s) — de facto open source. CRD: `Kafka`, `KafkaTopic`, `KafkaUser`, `KafkaConnect`, `KafkaConnector`, `KafkaMirrorMaker2`. Mature, documented, production.
- **Confluent for Kubernetes (CFK)** — enterprise.
- **Banzai Kafka Operator**.
- Managed: **AWS MSK, Confluent Cloud, Aiven, Azure Event Hubs**.

#### Playbook scale

| Mục tiêu | Cách | Ngưỡng |
|----------|------|--------|
| Throughput | Pre-allocate partition, batch + compress | 1M+ msg/s typical |
| Add broker | `kafka-reassign-partitions` move partition | I/O heavy, throttle |
| Storage | Tier storage (S3 offload old segment) | Apache 3.6+, Confluent từ lâu |
| Consumer | Add consumer up to N partition | Cooperative rebalance giảm storm |

#### Best practice

1. **Combo durability**: `acks=all` + `min.insync.replicas=2` + RF=3.
2. **Idempotent producer** (`enable.idempotence=true`, default 3.0+) + transactional API cho **exactly-once intra-cluster**.
3. **Compression** `zstd` (best ratio) hoặc `lz4` (fast) — tiết kiệm 4-5x bandwidth + disk.
4. **Topic naming convention**: `{env}.{domain}.{event}.{version}`. Ví dụ `prod.payment.charged.v1`.
5. **Pre-allocate partition** cao (50-100) — over-provision rẻ hơn resharding.
6. **Compact topic** cho keyed state (latest per key) — thay state store.
7. **Lag monitoring**: Burrow / Kafka Lag Exporter / Strimzi metric → alert per consumer group.
8. **Cooperative rebalance** (`partition.assignment.strategy=CooperativeStickyAssignor`) tránh stop-the-world.
9. **Consumer commit manual** sau process — at-least-once. Auto-commit = at-most-once silently.
10. **Schema registry** (Confluent / Apicurio) bắt buộc cho event-driven — protobuf/avro với compatibility check.
11. **Connect** cho CDC source/sink (Debezium, S3, Elasticsearch).
12. **Kafka Streams / ksqlDB / Flink** cho stream processing — đừng tự build framework.

#### Pitfalls thực tế

- **Rebalance storm**: consumer group restart → "stop-the-world" reassign vài giây. Cooperative rebalance giảm.
- **ZK / KRaft quorum loss** → cluster unavailable. 3-5 node cross-AZ.
- **Cross-AZ traffic $$$**: replication chiếm 50%+ bandwidth. **Rack-aware** + KIP-392 fetch-from-follower giảm ~50%.
- **Hot partition** (key skew) → 1 broker overload + 1 consumer overload. Re-key (add salt + aggregate) hoặc sharded sub-topic.
- **Reset offset wrong** = re-process toàn bộ history → consumer side effect. **Idempotent consumer luôn**.
- **Disk full** = broker stuck → cluster unhealthy. Alert disk 70%, retention check.
- **Giant message** > 1MB → broker pressure. **Claim-check pattern**: lưu S3, gửi pointer.
- **Many small topic** (>10k) → controller load + metadata explosion.
- **Auto-commit + crash** = mất message hoặc duplicate. Tắt auto-commit, manual after process.
- **No schema registry** = consumer break khi producer thay schema. Bài học đắt.

#### Production checklist Kafka

- [ ] RF=3, `min.insync.replicas=2`, `acks=all`.
- [ ] KRaft (mới) hoặc ZK 3-5 node cross-AZ.
- [ ] Schema registry (protobuf/avro) bắt buộc.
- [ ] Lag alert per consumer group.
- [ ] Disk alert 70%, retention policy enforce.
- [ ] Compression zstd/lz4 producer-side.
- [ ] Idempotent producer + transactional cho critical.
- [ ] MirrorMaker 2 cho DR cross-region (nếu cần).

---

### 7.7 RabbitMQ — task queue + routing phức tạp

> Bài toán: **task queue + RPC + routing phức tạp** (topic, fanout, headers exchange). RabbitMQ vs Kafka khác triết lý — Rabbit smart broker dumb consumer, Kafka dumb broker smart consumer.

#### So sánh nhanh Rabbit vs Kafka

| | Kafka | RabbitMQ |
|---|-------|----------|
| Triết lý | Log + offset (consumer track) | Queue + ack (broker track) |
| Throughput | 1M+ msg/s | 50k msg/s/node |
| Replay | ✓ (offset reset) | ✗ (consume = remove) |
| Routing | Partition by key | Exchange + binding (rich) |
| Priority queue | ✗ | ✓ |
| Delayed delivery | ✗ (workaround) | ✓ (plugin) |
| RPC | ✗ | ✓ (reply-to) |
| Use case | Event streaming, CDC, log | Task queue, RPC, complex routing |

#### Kiến trúc Exchange + Queue

```
Producer ──▶ [Exchange]──binding──▶ [Queue]──▶ Consumer
              ├─ direct (routing key match exact)
              ├─ topic  (routing key match pattern: order.*.created)
              ├─ fanout (broadcast tất cả queue)
              └─ headers (match by message header)
```

#### HA — Quorum queue (Raft) là present + future

```
Classic mirrored queue (deprecated 3.13+):
   ┌──Master──┐    sync mirror    ┌──Slave──┐
   │  Queue   │ ◀───────────────▶ │ Queue   │
   └──────────┘                   └─────────┘
   Slow, split-brain risk, deprecated.

Quorum queue (3.8+ default cho HA):
   Raft 3-5 replica, durable, replicated.
   Failover auto (Raft election).
   Performance ~20k msg/s (overhead Raft).

Stream queue (3.9+, Kafka-like):
   Append log, replay, append-only.
   Cho event-streaming use case trong Rabbit.
```

#### Sharding — không native

- Queue thuộc 1 node (master, mirror nếu mirrored).
- Pattern:
  - **App-side hash** route → nhiều queue → giả shard. Mất ordering global.
  - **`rabbitmq-sharding` plugin** — split logical queue thành N physical.
  - **Consistent hash exchange plugin** — route theo hash routing key tự động.

#### Coordinator
- **Mnesia** (Erlang built-in DB) + Erlang distribution = cluster sync.
- **RabbitMQ Cluster Operator** (VMware/Pivotal, k8s) — `RabbitmqCluster` CRD.
- Managed: **CloudAMQP**, **Amazon MQ for RabbitMQ**.

#### Best practice

1. **Quorum queue** thay classic mirror cho durable workload mới.
2. **`prefetch_count`** (basic.qos) — tune **10-100**. **0 = unlimited** = OOM consumer.
3. **Manual ack** (`autoAck=false`) cho at-least-once.
4. **DLX** (Dead Letter Exchange) cho fail/expired message + retry pattern.
5. **Lazy queue** (disk-backed) cho queue lớn (>1M msg) tránh RAM blow.
6. **Channel reuse** — đừng tạo channel mỗi msg. Connection pool client-side.
7. **Publisher confirm** (`channel.confirm_select`) cho reliable publish.
8. **Topic exchange** + naming convention `{domain}.{entity}.{event}`.

#### Pitfalls

- **Memory alarm** (`vm_memory_high_watermark = 0.4`) → block publisher. Lazy queue tránh.
- **Mnesia split-brain** → cluster unhealthy. Manual reset đau khổ. Quorum queue tránh bằng Raft.
- Erlang VM crash khi queue lớn không lazy.
- Plugin enable cross-cluster phải đồng version + reboot order đúng.
- Upgrade rolling khó với mirrored queue (sync state full sau restart). Quorum queue rolling nhanh hơn.
- Producer overflow consumer = backpressure không native — publisher confirm + flow control + queue depth alert.
- **No ack timeout default** — long-running consumer chết = message redeliver loop. Set timeout.

#### Production checklist RabbitMQ

- [ ] Quorum queue cho durable workload.
- [ ] 3 broker cross-AZ (Raft quorum quorum queue).
- [ ] `prefetch_count` 10-100.
- [ ] Manual ack + DLX.
- [ ] Lazy queue cho queue lớn.
- [ ] Memory + disk alarm threshold tune.
- [ ] Publisher confirm cho critical.

---

### 7.8 Zookeeper / etcd / Consul / Keeper — coordinator cốt lõi

> **Mọi distributed system cuối cùng cần coordinator**: leader election, distributed lock, slot map, service discovery, config. Đây là **brain của cluster**.

#### Kiến trúc chung

```
Quorum 3 node (tolerate 1 fail):
       ┌──────┐ Raft ┌──────┐
       │Leader│ ─────│Follower│
       └──┬───┘      └──────┘
          │ Raft
       ┌──▼───┐
       │Follower│
       └──────┘

Quorum 5 node (tolerate 2 fail):  ← cho high-stakes
   1 Leader + 4 Follower.

KV store + watch + lease + ephemeral:
  watch /service/api/instances → notification khi list thay đổi
  lease 30s + heartbeat → expire = delete ephemeral key
```

#### So sánh

| | ZooKeeper | etcd | Consul | ClickHouse Keeper |
|---|-----------|------|--------|-------------------|
| Protocol | ZAB | Raft | Raft | Raft (NuRaft) |
| Language | Java | Go | Go | C++ |
| API | Zab API | gRPC + HTTP | HTTP + DNS | ZK protocol compat |
| Watch | Trigger-once | Stream | Long-poll | Trigger-once |
| Use | Kafka legacy, HBase, Solr | k8s, Patroni, Vitess | Service mesh, Nomad | ClickHouse RMT |
| Multi-DC | Manual | Manual | Built-in | Manual |

#### Use case map

- **k8s control plane**: etcd (canonical).
- **Postgres HA (Patroni)**: etcd / Consul / k8s.
- **Kafka legacy → KRaft**: ZK → Raft trong Kafka.
- **ClickHouse Replicated**: ZK → Keeper (recommended).
- **HBase / Solr / legacy**: ZK.
- **Service mesh (multi-DC)**: Consul.

#### Best practice

1. **Quorum 3 hoặc 5**, không 2 (no fault tolerance), không 4 (= 3 effective).
2. **Cross-AZ 3 node 3 AZ** — 1 AZ down vẫn live.
3. **KHÔNG dùng cho data lớn** — chỉ metadata KB-MB tier. Limit value size <1MB.
4. **Snapshot daily**, ship S3.
5. **etcd defragment định kì** (`etcdctl defrag`) — auto-compact `--auto-compaction-retention=10h`. Quên = quota exceeded → cluster read-only.
6. **Tách quorum node khỏi worker node** production. Kafka KRaft cho phép combined nhưng tách an toàn hơn.
7. **Monitor**: commit latency p99, leader election count (high = unstable), watch count, DB size.
8. **JVM GC tune** cho ZK — heap nhỏ 4-8GB, G1GC, tránh GC pause spurious election.

#### Pitfalls

- **ZK overload** với write-heavy ClickHouse RMT — migrate **Keeper** hoặc giảm part qua merge config.
- **Network partition** → minority side read-only. Watch + reconnect logic phía client bắt buộc.
- **Watch event lost** khi disconnect — client phải full-list reconcile state.
- **etcd quota exceed** không defrag → cluster read-only. Monitor DB size.
- **ZK GC pause** → leader thay đổi → cascade Patroni fail-over giả → app reconnect storm.
- **Quorum even number** = false safety. 4 node tolerate 1 fail (giống 3); 6 tolerate 2 (giống 5). **Always odd**.

---

### 7.9 Elasticsearch / OpenSearch — search + log aggregation

> Bài toán: **full-text search + log analytics + aggregation** đa chiều. Lucene under hood.

#### Kiến trúc role

```
Coordinating node (gateway, không data, route query)
         │
         ▼
Master-eligible (3-5, odd) ──► cluster state, shard allocation
         │
         ▼
Data node (hot/warm/cold tier)
  Index "logs-2024.05" → 5 primary shard × 2 replica
       Shard 0 (P) ── Shard 0 (R) ── Shard 0 (R)
       Shard 1 (P) ──...
       ...
         ▲
         │
Ingest node (pipeline transform, parse, enrich)
```

#### HA
- Master quorum (odd 3/5). Pre-7.x split-brain bug → 7.x fixed.
- Replica shard = HA cho data. Primary fail → replica promote.
- **Snapshot S3/GCS** standard backup.

#### Sharding
- **Primary shard count cố định khi tạo index** — không thể tăng (phải reindex). **Pre-shard từ đầu**.
- Replica shard tăng/giảm live.
- **Cross-cluster search** (CCS), **Cross-cluster replication** (CCR) cho geo.

#### Operator
- **ECK** (Elastic Cloud on Kubernetes) — official mature.
- **OpenSearch Operator** (AWS fork).

#### Best practice

1. **Shard size 10-50GB** sweet spot. Quá nhỏ <1GB = overhead; quá lớn >100GB = slow recovery.
2. **ILM** (Index Lifecycle Management): hot → warm → cold → frozen → delete by age.
3. `bulk` API + disable refresh (`refresh_interval=-1`) khi bulk load → enable lại.
4. **Mapping explicit** (strict / dynamic: false) — tránh **mapping explosion**.
5. **Heap < 32GB** (compressed oops boundary). Phần còn lại RAM cho file system cache.
6. **Index per time period** (daily/weekly) → drop O(1).
7. **Tách role node** production: master / data / ingest / coordinating.
8. **Search.max_buckets** + circuit breaker tránh OOM aggregation.
9. **Reindex API + alias swap** cho zero-downtime mapping change.

#### Pitfalls

- **Mapping explosion**: dynamic mapping + JSON đa dạng → 10k field → master state nổ → cluster unstable.
- **Heavy aggregation** OOM. Limit bucket size.
- **Snapshot lock** ongoing → schedule giờ thấp tải.
- **Yellow ≠ red**: yellow = replica missing OK tạm; red = primary missing = data unavailable.
- **Hot shard** when 1 index quá lớn — split index theo time/tenant.

---

### 7.10 MongoDB — document NoSQL phổ biến

#### Kiến trúc
- **Replica set** = master-secondary + auto-failover (Raft-like). Default 3 node.
- **Sharded cluster**:
  ```
  Client ──▶ mongos (router) ──┬──▶ Shard 1 (replica set)
                                │
                                ├──▶ Shard 2 (replica set)
                                │
                                └──▶ Config server (replica set, metadata)
  ```

#### Sharding
- **Sharding key** chọn cẩn thận. Pre-4.4 không change được. **4.4+ resharding online**.
- Hashed shard key — uniform distribute, bad for range query.
- Ranged shard key — locality, hot range risk.

#### Best practice
- Replica set 3 node cross-AZ.
- Index trên shard key + query pattern.
- `writeConcern: majority` cho durable.
- `readConcern: majority` + `readPreference: secondaryPreferred` cho read scale.

#### Pitfalls
- **Jumbo chunk** (>256MB) khi shard key skew → manual split.
- **Unbounded array** trong document → document grow → fragment.
- **$lookup** (JOIN) chậm — denormalize.

---

### 7.11 Best practice xuyên suốt mọi stateful system (17 quy tắc vàng)

1. **Always odd quorum**: 3 hoặc 5. Không 2 (no fault tolerance), không 4 (= 3 effective với split-brain risk).
2. **Cross-AZ quorum** — 1 AZ down vẫn live. Cross-region tốn latency, chỉ làm khi quy định.
3. **Test restore monthly** — backup không test = không có backup. Game-day disaster scenario.
4. **Operator > script** ở scale. Operator tự reconcile node restart, cert rotation, version upgrade.
5. **Drain trước khi remove node**:
   - Kafka: `kafka-reassign-partitions` move replica ra trước.
   - Cassandra: `nodetool decommission`.
   - Redis Cluster: `CLUSTER FORGET` sau migrate slot.
   - Postgres: switchover Patroni trước decommission replica.
6. **Capacity plan ngay từ đầu** — pre-shard cho 2-3 năm scale:
   - Kafka partition count.
   - ES primary shard.
   - Redis Cluster 16384 slot pre-distribute.
   - MongoDB shard key (online resharding 4.4+).
7. **Monitor lag** (early warning):
   - Postgres: `pg_stat_replication.replay_lag`.
   - MySQL: `Seconds_Behind_Master`.
   - Kafka: consumer offset lag per group.
   - ClickHouse: `system.replication_queue` size.
   - Cassandra: `nodetool netstats`, repair status.
8. **Rolling upgrade** — version N + N+1 backward compat. Test trên staging clone production data.
9. **Throttle compaction / repair / vacuum** — `nice` / cgroup / config option. Không kill peak.
10. **Disaster Recovery runbook viết sẵn** — không debug runbook lúc 3am pager.
11. **Network bottleneck thường ẩn** — cross-AZ replication, gossip, Raft heartbeat. Track per-AZ traffic + cost.
12. **State + restart != stateless restart**. Stateful pod: drain → checkpoint → terminate → restart → rejoin → catch-up → ready. Operator tự lo nếu set up đúng.
13. **Avoid dual-write** (DB + cache, DB + ES) — eventual inconsistency. **CDC** (Debezium / pg logical decoding) hoặc **outbox pattern**.
14. **Resharding luôn đắt** — design schema để **không cần resharding 5 năm**.
15. **Auto-scale stateless tier** dễ (HPA CPU/QPS); **stateful** khó — drain mode, consistent hash rebalance, operator-controlled.
16. **Backup tier**: hot snapshot S3 same-region + cold archive cross-region + immutable retention chống ransomware.
17. **Resource limit per pod/process** — JVM heap, Erlang scheduler, Postgres conn. Không limit = OOM kill kéo cluster.

---

### 7.12 Pattern coordinator chung (toolkit cho mọi distributed system)

#### Lease + heartbeat
```
Leader acquire lease (TTL 30s) ──▶ DCS (etcd/ZK)
       │
       │ renew every 10s
       ▼
   Lease alive
       │
       │ leader crash / network partition
       ▼
   TTL expire → key auto-delete
       │
       ▼
   Other node race lock → new leader
```

Examples: etcd lease, ZK ephemeral, k8s Lease object, Patroni leader key, Redis Sentinel master vote.

#### Fencing token (chống split-brain write)

```
Client A: acquire lock → token=42
   ├ pause GC 60s (TTL expire)
   └─...

Client B: acquire lock → token=43

Client A wakes up, write to backend với token=42
Backend reject (latest=43 > 42).
```

Bài học từ Martin Kleppmann: lock TTL không đủ — phải có token monotonic + downstream reject.

#### Watch + reconcile (operator pattern)

```
desired = K8s CRD spec (3 replicas, version v2)
actual  = current cluster state (2 pods version v1)

reconcile loop (idempotent):
   diff = desired - actual
   actions = [scale up, upgrade pod1, upgrade pod2]
   apply actions (one at a time, safe)
   watch state change → next loop
```

#### Two-phase shard migration (zero-downtime resharding)

```
Phase 1: dual-write
   write ──┬──▶ old shard
           └──▶ new shard

Phase 2: backfill new from old (CDC / dump)
Phase 3: verify consistency
Phase 4: flip read traffic to new
Phase 5: stop write old, decommission
```

#### Outbox + CDC (avoid dual-write)

```
App tx:
  BEGIN
    INSERT INTO orders ...
    INSERT INTO outbox (event_type, payload) VALUES (...)
  COMMIT
        │
        │ atomic — both or neither
        ▼
  Debezium reads binlog/WAL
        │
        ▼
  Publish Kafka topic "orders.created"
        │
        ▼
  Consumer (search indexer, cache invalidator, notification)
```

#### Service mesh sidecar (offload cross-cutting)

- Istio / Linkerd / Consul Connect inject sidecar Envoy → handle retry / circuit / mTLS / canary tại network layer.
- App code clean — không lib retry / breaker.
- Trade-off: thêm sidecar overhead (~1ms latency), complexity ops.

---

### 7.13 Decision matrix — chọn đúng system cho đúng bài toán

| Bài toán | First choice | Alternative | Avoid |
|----------|--------------|-------------|-------|
| Cache memory | Redis Cluster | Memcached, Hazelcast | Local in-process (stale cross node) |
| Session store | Redis Sentinel | DynamoDB, Memcached | DB |
| Counter / leaderboard | Redis ZSET | DynamoDB sharded counter | RDB (full sort) |
| OLTP relational | Postgres + Patroni | MySQL InnoDB cluster | Cassandra (mutable bad) |
| OLTP global strong | CockroachDB / Spanner | YugabyteDB | Eventual NoSQL |
| Multi-tenant SaaS | Postgres + Citus | DynamoDB | Single-DB no isolation |
| Time-series metric | ClickHouse / Prometheus / TimescaleDB | InfluxDB, VictoriaMetrics | Postgres (slow at scale) |
| OLAP analytics | ClickHouse | BigQuery, Snowflake, Redshift | Postgres (cold) |
| Write-heavy KV | Cassandra / Scylla | DynamoDB | Postgres single primary |
| Full-text search | Elasticsearch / OpenSearch | Postgres GIN + ts_vector (small) | LIKE %pattern% |
| Vector search | pgvector (small) / Qdrant / Pinecone | Weaviate, Milvus | None |
| Event log + replay | Kafka | Pulsar, Redpanda | RabbitMQ (no replay) |
| Task queue + RPC | RabbitMQ Quorum | Redis Streams, AWS SQS | Kafka (no priority/delay) |
| Pub/sub real-time | Redis Pub/Sub (ephemeral) | NATS, Kafka | RabbitMQ (overkill) |
| Distributed lock | etcd / ZK / Redis Redlock+fence | Consul | DB row lock at scale |
| Service discovery | Consul / k8s DNS | etcd | Hard-code IP |
| Graph relationship | Neo4j / ArangoDB | Postgres recursive CTE (small) | Document DB |
| Object blob | S3 / GCS / R2 | MinIO self-host | DB BLOB column |

---

### 7.14 Operational observability — 4 layer phải có cho mọi stateful

1. **Cluster state**: leader, replica lag, ISR, slot map, partition count.
2. **Resource**: CPU, mem, disk, network IOPS, connection count.
3. **Workload**: QPS, latency p50/p95/p99, error rate, slow query.
4. **Capacity**: storage trend (predict full), partition count trend, data growth/day.

**Alert hierarchy** (đừng bão alert):
- **Page (call 3am)**: cluster down, primary fail no auto-failover, disk > 90%, replica lag > SLO.
- **Ticket (next business day)**: lag tăng dần, error rate tăng, slow query top.
- **Dashboard only**: capacity trend, anomaly detection.

---

## 8. Mindset cuối — nguyên tắc khi phỏng vấn

1. Không có thiết kế hoàn hảo — chọn theo requirement.
2. Hiểu trade-off > nhớ design.
3. Bottleneck thường là **DB** và **network**, không CPU.
4. **State là kẻ thù của scale** — push state ra ngoài (cache, KV, DB).
5. Async > Sync ở scale lớn. Idempotent > Reliable delivery.
6. Eventual consistency là norm ở distributed; ACID đắt.
7. Locality matters: CDN, edge, region, AZ.
8. Fail fast, recover gracefully — circuit breaker, bulkhead, timeout.
9. Observability first-class — log + metric + trace từ đầu.
10. 3rd-party trước build từ đầu (S3, Stripe, ES…). Tự build chỉ khi quy mô cần.

---

## 9. Tham chiếu nhanh case study

| Bài toán | Case study | Insight chính |
|----------|-----------|---------------|
| Rate limit | Ch5 | Token bucket + Redis Lua |
| Distributed cache/DB | Ch6, Ch7 | Consistent hashing, quorum, vector clock |
| ID generator | Ch8 | Snowflake 64-bit |
| URL shortener | Ch9 | Base62 + bloom filter |
| Crawler | Ch10 | Politeness queue, BFS, dedup hash |
| Notification | Ch11 | APNs/FCM/Twilio, retry queue, dedupe `event_id` |
| News feed | Ch12 | Hybrid push/pull, cache 5 lớp |
| Chat | Ch13 | WebSocket stateful + Snowflake + Zookeeper |
| Autocomplete | Ch14 | Trie + cache top-k |
| Video / YouTube | Ch15 | CDN + DAG transcode + GOP + pre-signed URL |
| File sync / Drive | Ch16 | Block 4MB + delta sync + long polling |
| Proximity | Ch17 | Geohash 4-6 + neighbor cell |
| Realtime location | Ch18 | Redis Pub/Sub + WS draining |
| Message queue | Ch20 | Partition + ISR + offset + high watermark |
| Monitoring | Ch21 | Pull vs push, Kafka buffer, downsampling |
| Ad click | Ch22 | Lambda/Kappa, Flink exactly-once, star schema |
| Hotel reservation | Ch23 | Idempotency + DB CHECK + CDC cache |
| Email | Ch24 | NoSQL TIMEUUID + denormalize read/unread + JWZ |
| Object storage | Ch25 | Metadata/data tách + Paxos + erasure 8+4 + multipart |
| Leaderboard | Ch26 | Redis ZSET + Cluster slot |
| Payment | Ch27 | Double-entry ledger + idempotency + reconciliation |
| Wallet 1M TPS | Ch28 | TC/C + Event Sourcing + Raft + CQRS |
| Stock exchange | Ch29 | Matching engine + sequencer + mmap + Aeron |
