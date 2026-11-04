---
title: "Kafka: kiến trúc nhìn từ lăng kính hệ thống phân tán"
pubDate: "2026-10-09"
published: true
contents_table: true
pinned: false
description: "Kiến trúc Apache Kafka trình bày có hệ thống và gắn với lý thuyết hệ phân tán: producer → broker → consumer, partition & segment, replication (ISR, high watermark, leader epoch), acks và flush (page cache, fsync, log recovery), thuật toán round-robin rải leader/replica lên broker, KRaft (Raft) và hai tầng leader election, consumer group & rebalance, transactions & exactly-once (coordinator, điểm commit, LSO, fencing zombie), HA đa AZ, các sự cố thực tế và checklist cấu hình production."
cat: "architecture"
useKatex: false
---

# Kafka: kiến trúc nhìn từ lăng kính hệ thống phân tán

> **tl;dr:** Kafka là một **distributed, partitioned, replicated commit log**. Mỗi chữ trong cụm đó là một bài toán kinh điển của hệ phân tán:
>
> - **commit log** → append-only, có thứ tự, đọc lại được bằng offset.
> - **partitioned** → *sharding*: chia log thành nhiều partition để scale ngang throughput.
> - **replicated** → *leader-follower replication* + ISR để chịu lỗi mà không mất dữ liệu đã commit.
> - **distributed** → cần *coordination*: KRaft (Raft) giữ metadata và bầu **active controller**; controller lại chỉ định **leader cho từng partition**.
>
> Hiểu bốn chữ này là hiểu được phần lớn hành vi — và phần lớn sự cố — của Kafka.

**Cách đọc bài này.** Phần **Dẫn nhập** ngay dưới đây đi từ bài toán gốc tới từng cơ chế, để thấy vì sao Kafka cần nhiều lớp như vậy. Sau đó bài đi theo **đường đi của một message**: Producer → Broker (partition, replica) → Consumer, rồi đi xuống tầng điều phối (controller, KRaft), sau đó là HA và cuối cùng là những gì thực tế hay gặp. Mỗi phần đều có đoạn **"Góc nhìn DS"** nối về kiến thức nền trong [Hệ thống phân tán: Ghi chú cơ bản](/blog/distributed-system-note). Các số liệu cấu hình bám theo Kafka 4.x (đã bỏ hẳn ZooKeeper).

---

## Dẫn nhập: vì sao Kafka phải nhiều lớp đến vậy?

Lần đầu đọc về Kafka, rất dễ bị ngợp bởi một loạt khái niệm: topic, partition, offset, replica, ISR, high watermark, leader epoch, controller, KRaft, consumer group, rebalance, idempotent producer, transaction… Trông như một mớ cơ chế rời rạc, nhưng chúng nối với nhau bằng một logic rất chặt: **mỗi cơ chế là câu trả lời bắt buộc cho đúng một vấn đề kỹ thuật, và mỗi câu trả lời lại làm lộ ra vấn đề kế tiếp**.

Cách dễ hiểu nhất là tự "thiết kế lại" Kafka: bắt đầu từ phiên bản đơn giản nhất, gặp vấn đề nào thì thêm đúng cơ chế giải vấn đề đó.

### Bài toán ban đầu

Kafka ra đời ở LinkedIn khoảng năm 2010 cho một bài toán rất đời thường: hàng trăm service sinh ra sự kiện (lượt xem, đơn hàng, log, metric), và hàng chục hệ thống khác cần đọc chúng (search index, data warehouse, recommendation, monitoring). Nối thẳng từng cặp thì có N × M đường kết nối, mỗi đường một kiểu lỗi, một kiểu retry. Thứ cần có là một "trục" trung gian đáp ứng sáu yêu cầu:

| | Yêu cầu | Vì sao khó |
|---|---|---|
| R1 | Bên ghi không cần biết ai đọc | Bên đọc thêm/bớt liên tục |
| R2 | Nhiều bên đọc độc lập, đọc lại được quá khứ | Mỗi bên một tốc độ; hệ mới cần cả lịch sử |
| R3 | Throughput rất lớn (hàng trăm MB/s trở lên) | Vượt sức một máy, một đĩa |
| R4 | Không mất dữ liệu đã xác nhận | Máy chết, mạng đứt là chuyện hằng ngày |
| R5 | Giữ thứ tự cho sự kiện của cùng một thực thể | Thứ tự và song song luôn kéo ngược nhau |
| R6 | Mở rộng bằng cách thêm máy | Không được có điểm nghẽn trung tâm |

### Bước 0 — Phiên bản ngây thơ: một file log trên một máy

Producer **ghi thêm vào cuối** một file; mỗi consumer tự nhớ mình đã đọc tới đâu — vị trí đó gọi là **offset**. Chỉ một ý tưởng này đã giải được R1, R2 và R5: bên ghi không quan tâm ai đọc, mỗi consumer đọc theo tốc độ riêng và có thể quay về offset cũ để đọc lại, thứ tự ghi chính là thứ tự đọc. Đây là hạt nhân của Kafka: **log + offset** (mục 1, 2).

→ **Vấn đề mới:** một máy, một đĩa nên throughput có trần (R3, R6); máy chết là mất sạch (R4).

### Bước 1 — Chia log thành nhiều phần: partition

Thay vì một log, chia mỗi **topic** thành nhiều **partition** — mỗi partition là một log độc lập — và đặt chúng trên nhiều máy (**broker**). Ghi và đọc giờ chạy song song trên nhiều máy: đây là *sharding*.

Cái giá: thứ tự toàn cục biến mất, chỉ còn thứ tự **trong từng partition**. Để giữ R5, producer cần một **partitioner**: băm key (ví dụ `orderId`) để mọi sự kiện của cùng một thực thể luôn rơi vào cùng một partition. Độ song song phía đọc cũng bị chặn trên bởi số partition (mục 2, 3.2, 15).

→ **Vấn đề mới:** gửi từng message một qua mạng, ghi từng message một xuống đĩa thì quá chậm.

### Bước 2 — Làm cho nhanh: batch, nén, ghi tuần tự

Producer không gửi ngay mà **gom record của cùng partition thành batch** trong bộ đệm, nén cả batch rồi mới gửi. Broker ghi nguyên batch vào cuối file (ghi tuần tự), để hệ điều hành giữ trong **page cache**, và đẩy thẳng ra socket cho consumer (**zero-copy**). Đánh đổi một chút latency (`linger.ms`) để lấy throughput lớn (mục 2.4, 3.1, 3.3).

→ **Vấn đề mới:** mỗi partition vẫn chỉ nằm trên một broker — broker chết là partition đó mất (R4).

### Bước 3 — Chịu lỗi: nhân bản partition

Mỗi partition có nhiều **replica** trên các broker khác nhau: một **leader** nhận ghi, các **follower** (chỉ để tăng availability) liên tục kéo dữ liệu từ leader. Nghe đơn giản, nhưng lập tức sinh ra một chuỗi câu hỏi khó:

- Khi nào một lần ghi được coi là **an toàn** để báo cho producer? → `acks`, tập **ISR** (các replica đang bắt kịp), `min.insync.replicas`.
- Consumer có được đọc record mà follower chưa kịp chép không? Đọc rồi mà leader chết thì record ấy "biến mất". → chỉ đọc dưới **high watermark** — phần mà mọi replica trong ISR đều đã có.
- Sau sự cố, các bản sao lệch nhau thì bản nào đúng? → **leader epoch** để cắt đúng phần lệch.
- Có cần ép ghi xuống đĩa (fsync) mỗi lần không? → Kafka chọn dựa vào **nhiều bản sao trên nhiều máy** thay vì fsync.

(mục 4, 6, 7)

→ **Vấn đề mới:** ai quyết định partition nào nằm ở broker nào, ai là leader, broker nào đã chết? Nếu hai broker cùng tin mình là leader của một partition, dữ liệu sẽ rẽ nhánh (*split-brain*).

### Bước 4 — Điều phối: controller và đồng thuận

Cần một nơi **duy nhất và nhất quán** giữ "bản đồ" của cluster: replica của mỗi partition nằm ở đâu, leader là ai, ISR gồm những ai. Bản thân nơi đó cũng phải chịu lỗi, nên nó là một nhóm nhỏ **controller** chạy thuật toán đồng thuận **Raft** (KRaft) để luôn có đúng một controller chủ động. Controller:

- rải replica và leader đều lên các broker (round-robin, tách theo rack/AZ);
- phát hiện broker chết qua heartbeat và timeout;
- chỉ định leader mới cho partition từ ISR, rồi ghi quyết định vào một **log metadata** mà mọi broker cùng đọc.

(mục 5, 8)

→ **Vấn đề mới:** mạng không đáng tin. Producer gửi xong thì timeout, không biết broker đã ghi hay chưa — gửi lại thì có thể trùng. Một broker hay producer "tưởng mình còn sống" sau khi đã bị thay thế vẫn có thể ghi bậy.

### Bước 5 — Sống chung với mạng không đáng tin

- **Idempotent producer:** mỗi batch mang PID + số thứ tự (sequence); broker nhận ra bản gửi lại và bỏ qua → retry thoải mái mà không trùng.
- **Fencing:** mọi vai trò đều mang một con số "đời" tăng dần — leader epoch, producer epoch, generation của consumer group. Thành phần đời cũ (*zombie*) bị từ chối ngay khi lên tiếng.

→ **Vấn đề mới:** phía đọc. Một consumer không đọc kịp; nhiều consumer thì chia việc thế nào, ai đọc partition nào, consumer chết giữa chừng thì ai đọc tiếp và đọc từ đâu?

### Bước 6 — Chia việc phía đọc: consumer group

Các consumer cùng **group** chia nhau partition, mỗi partition giao cho đúng một consumer. Một **group coordinator** theo dõi thành viên qua heartbeat và **rebalance** khi có consumer vào/ra. Mỗi consumer **commit offset** (vị trí kế tiếp cần đọc) vào topic nội bộ `__consumer_offsets`, để người thay thế biết đọc tiếp từ đâu. Thứ tự giữa "xử lý" và "commit" quyết định ngữ nghĩa giao nhận: at-most-once hay at-least-once (mục 9).

→ **Vấn đề mới:** ứng dụng đọc topic A, xử lý, ghi sang topic B; crash ở giữa thì hoặc mất, hoặc ghi trùng.

### Bước 7 — Ghi nguyên tử: transactions

Gói "ghi output + commit offset đầu vào" vào một **giao dịch**: một transaction coordinator ghi quyết định commit vào log riêng, rồi đặt marker vào từng partition tham gia; consumer `read_committed` chỉ thấy dữ liệu của giao dịch đã commit (mục 10).

### Bước 8 — Chạy lâu dài: đĩa, AZ, vận hành

Dữ liệu không thể giữ mãi → **retention**, **compaction**, **tiered storage**. Cả một vùng (AZ) có thể mất → rải replica và controller qua 3 AZ. Còn lại là những sự cố rất "đời": rebalance liên tục, hot partition, mất offset, mất dữ liệu dù đã `acks=all` (mục 2.5, 12, 14).

### Tóm lại: mỗi lớp là câu trả lời cho một bài toán

```text
 vấn đề                               cơ chế Kafka thêm vào          mục
 ──────────────────────────────────   ─────────────────────────────  ────────
 N × M kết nối, cần đọc lại quá khứ → log append-only + offset       1, 2
 một máy không đủ throughput        → topic chia partition, key      2, 3
 mỗi message một request: quá chậm  → batch, nén, page cache         2, 3
 broker chết là mất partition       → replica, ISR, HW, acks         4, 6, 7
 ai là leader? broker nào đã chết?  → controller + Raft (KRaft)      5, 8
 timeout → retry → trùng; zombie    → PID + seq, epoch (fencing)     3, 6, 10
 nhiều consumer chia việc, failover → consumer group, commit offset  9
 đọc → xử lý → ghi phải nguyên tử   → transactions                   10
 đĩa đầy, mất cả một AZ             → retention, rack-aware, 3 AZ    2, 12
```

Gọi theo ngôn ngữ hệ phân tán, đó lần lượt là: **log** → **sharding** → **batching** → **replication** → **consensus & failure detection** → **idempotency & fencing** → **group membership** → **atomic commit**. Hình ở mục 0 ngay dưới đây đặt tất cả các lớp đó lên cùng một bức tranh.

---

## 0. Bức tranh tổng thể

```text
┌─ PRODUCER · order-service ─────────────────────────────────────────────────┐
│ send(topic=orders, key="order-42", value)  → trả Future ngay               │
│       │                                                                    │
│       ▼                                                                    │
│ ┌────────────┐  ┌──────────────────────┐  ┌─ RecordAccumulator ──────────┐ │
│ │ Serializer │  │     Partitioner      │  │ buffer.memory = 32 MB        │ │
│ │            │  │                      │  │ orders-0 [██████][███   ]    │ │
│ │ key, value │─►│   murmur2(key) % 3   │─►│ orders-1 [████  ]            │ │
│ │  → bytes   │  │ order-42 → orders-0  │  │ orders-2 [█     ]            │ │
│ │            │  │  key null → sticky   │  │ gửi: đầy batch / quá linger  │ │
│ └────────────┘  └──────────────────────┘  └───────────────┬──────────────┘ │
│                                     drain batch sẵn sàng  │                │
│                                                           ▼                │
│ ┌─ Sender thread (nền) ──────────────────────────────────────────────────┐ │
│ │ gom batch theo BROKER đang lead partition: 1 request / broker          │ │
│ │ mỗi batch mang PID 42 + epoch + seq → retry thì broker nhận ra trùng   │ │
│ │ ≤ 5 request đang bay / kết nối · acks=all · retry tới delivery.timeout │ │
│ │ ▲ ack trả về khi mọi replica trong ISR đã có batch (HW ≥ offset)       │ │
│ └───────────┬──────────────┬──────────────┬──────────────────────────────┘ │
└─────────────┼──────────────┼──────────────┼────────────────────────────────┘
              ▲              ▲              ▲
              │ [P0 batch]   │ [P1 batch]   │ [P2 batch]
┌─ CLUSTER ────────────────────────────────────┐
│             ▼              ▼              ▼  │  ┌─ CONTROLLER · KRaft ─────┐
│ ┌─ broker-1 ─┐ ┌─ broker-2 ─┐ ┌─ broker-3 ─┐ │  │ ctrl-1 ● leader          │
│ │ ╔════════╗ │ │ ┌┄┄┄┄┄┄┄┄┐ │ │ ┌┄┄┄┄┄┄┄┄┐ │ │  │ ctrl-2, ctrl-3: voter    │
│ │ ║ P0 · L ║─┼─┼►┆ P0 · F ┆ │ │ ┆ P0 · F ┆ │ ┼◄►│ P0 [1,2,3] leader = 1    │
│ │ ╚══════┬═╝ │ │ └┄┄┄┄┄┄┄┄┘ │ │ └┄┄┄┄┄┄▲┄┘ │ │  │ P1 [2,3,1] leader = 2    │
│ │        └───┼─┼────────────┼─┼────────┘   │ │  │ P2 [3,1,2] leader = 3    │
│ │ ┌┄┄┄┄┄┄┄┄┐ │ │ ╔════════╗ │ │ ┌┄┄┄┄┄┄┄┄┐ │ │  └──────────────────────────┘
│ │ ┆ P1 · F ┆◄┼─┼─║ P1 · L ║─┼─┼►┆ P1 · F ┆ │ │  ◄► heartbeat / metadata
│ │ └┄┄┄┄┄┄┄┄┘ │ │ ╚════════╝ │ │ └┄┄┄┄┄┄┄┄┘ │ │  · Raft: cần đa số voter
│ │            │ │            │ │            │ │  · broker im lặng > 9 s →
│ │ ┌┄┄┄┄┄┄┄┄┐ │ │ ┌┄┄┄┄┄┄┄┄┐ │ │ ╔════════╗ │ │    fence; leader mới là
│ │ ┆ P2 · F ┆ │ │ ┆ P2 · F ┆◄┼─┼─║ P2 · L ║ │ │    replica kế tiếp trong ISR
│ │ └┄┄┄┄┄┄▲┄┘ │ │ └┄┄┄┄┄┄┄┄┘ │ │ ╚══════┬═╝ │ │◄┄■ BROKER / PARTITION
│ │        └───┼─┼────────────┼─┼────────┘   │ │  · round-robin: mỗi broker
│ └────────────┘ └────────────┘ └────────────┘ │    lead đúng 1 partition
│             ▲              ▲              ▲  │  · follower kéo từ leader;
└─────────────┼──────────────┼──────────────┼──┘    ISR = replica bắt kịp
       đọc P0 │       đọc P1 │       đọc P2 │     · commit khi mọi ISR có (HW)
┌─────────────┼──────────────┼──────────────┼──┐  · ghi cần |ISR| ≥ minISR
│  ┌──────────┴──────────────┴┐ ┌───────────┴┐ │  · thứ tự chỉ trong partition
│  │        consumer-A        │ │ consumer-B │ │◄┄■ CONSUMER GROUP
│  └──────────────────────────┘ └────────────┘ │  · chỉ đọc ≤ HW (đã commit)
│ group "billing": 1 partition → 1 consumer    │  · commit offset = offset KẾ
└──────────────────────────────────────────────┘    TIẾP, SAU khi xử lý xong
                                                    → lưu __consumer_offsets
                                                  · mặc định at-least-once:
                                                    xử lý phải idempotent
                                                  · xử lý > max.poll.interval
                                                    → bị đá, rebalance


╔══╗ L = leader: nhận ghi, phục vụ đọc   ┌┄┄┐ F = follower: chỉ chép dữ liệu
──► replicate: follower kéo (fetch) dữ liệu từ leader của cùng partition
[1,2,3] = replicas của partition; phần tử đầu = preferred leader

┌─ TOPIC orders = P0 + P1 + P2 · góc nhìn logic: mỗi partition một log ──────┐
│ offset    0 1 2 3 4 5 6 7 8 9                                              │
│ P0        ■ ■ ■ ■ ■ ■ ■ ■│▒ ▒  ◄ ghi      HW=8 · LEO=10 · lag=4            │
│                       ▲ consumer-A commit = 6                              │
│           LEO từng replica: b1=10 · b2=9 · b3=8 → HW = min ISR = 8         │
│ P1        ■ ■ ■ ■ ■│▒  ◄ ghi              HW=5 · LEO=6 · lag=2             │
│                   ▲ consumer-A commit = 4                                  │
│ P2        ■ ■ ■ ■ ■ ■ ■│▒  ◄ ghi          HW=7 · LEO=8 · lag=1             │
│                         ▲ consumer-B commit = 7                            │
│ ■ < HW: đã commit, consumer đọc được   ▒ chưa commit   │ = high watermark  │
│ ▲ offset đã commit = offset KẾ TIẾP sẽ đọc · offset chỉ có nghĩa trong 1   │
│ partition: orders-0 offset 6 ≠ orders-1 offset 6                           │
└────────────────────────────────────────────────────────────────────────────┘
```

Kafka có **hai mặt phẳng** tách biệt — giống hệt cách Kubernetes tách control plane và worker node:

| Mặt phẳng | Thành phần | Làm gì | Khái niệm DS tương ứng |
|---|---|---|---|
| **Data plane** | Broker | Lưu partition trên disk, nhận produce, phục vụ fetch, replicate giữa các broker | Sharding + primary-backup replication |
| **Control plane** | Controller (KRaft) | Giữ metadata: topic, partition, replica nằm ở đâu, ai là leader, ISR là gì, broker nào còn sống | Consensus (Raft) + coordination service |
| **Client** | Producer / Consumer | Tự định tuyến tới đúng broker leader dựa trên metadata; consumer tự giữ vị trí đọc (offset) | Smart client, client-side routing |

> **Note:** Điểm quan trọng nhất của bức tranh: **không có "broker master"**. Leadership là **theo từng partition**, không theo broker. Mỗi broker vừa là leader của vài partition, vừa là follower của vài partition khác. Cái duy nhất "có một bản" trong cả cluster là **active controller** — và nó nằm ở control plane, không nằm trên đường đi của dữ liệu.

---

## 1. Vì sao cần Kafka: từ "queue" sang "log"

### 1.1 Bài toán

Hệ thống có N service sinh sự kiện và M service cần tiêu thụ. Nối thẳng point-to-point thì có N×M đường kết nối, mỗi đường một kiểu retry, một kiểu lỗi. Message queue truyền thống (RabbitMQ, ActiveMQ) giải được chuyện decoupling, nhưng nó được thiết kế quanh ý tưởng **"message được giao xong thì xóa"**:

- Broker phải nhớ **trạng thái từng message** (đã giao chưa, đã ack chưa) → broker nặng, khó scale.
- Thêm một consumer mới (ví dụ team analytics) **không đọc lại được quá khứ**.
- Muốn nhiều hệ cùng nhận một sự kiện → phải fan-out, copy message ra nhiều queue.

### 1.2 Kafka đảo ngược thiết kế

Kafka coi dữ liệu là một **log chỉ ghi thêm** và **giữ lại theo thời gian/dung lượng** (retention), bất kể ai đã đọc. Broker không nhớ "ai đọc tới đâu" theo từng message — **mỗi consumer tự giữ một con số: offset** trong mỗi partition. Triết lý này thường được gọi là *dumb broker, smart consumer*.

| | Queue truyền thống | Kafka (log) |
|---|---|---|
| Sau khi consume | Message bị xóa | Giữ nguyên đến hết retention |
| "Đã đọc tới đâu" | Broker giữ ack **từng message** | Consumer giữ **một offset / partition** |
| Nhiều hệ cùng đọc | Fan-out, copy message | Mỗi consumer group đọc cùng log với offset riêng |
| Replay | Không | Có — `seek` về offset hoặc timestamp |
| Thứ tự | Mất khi nhiều consumer cạnh tranh | Đảm bảo **trong một partition** |
| Độ song song | Thêm consumer tùy ý | **Bị chặn trên bởi số partition** |
| Routing phức tạp | Mạnh (exchange, binding, header) | Yếu — chỉ có topic + key |
| Ack từng message, retry/delay per message | Có sẵn | Không có sẵn (Share Groups ở 4.x đang bổ sung) |

> **Note:** Góc nhìn DS — *log* là cấu trúc trung tâm của gần như mọi hệ phân tán: WAL của database, replicated log của Raft, binlog của MySQL. Kafka lấy chính cái log đó ra và biến nó thành **hạ tầng dùng chung**. Đó là lý do Kafka hợp với CDC, event sourcing, outbox — xem phần WAL/CDC trong [Database: Ghi chú cơ bản](/blog/database). Bài gốc nên đọc: *"The Log: What every software engineer should know about real-time data's unifying abstraction"* của Jay Kreps.

---

## 2. Mô hình dữ liệu: Topic → Partition → Segment → Record

### 2.1 Record và batch

Một **record** gồm: `key` (tùy chọn), `value`, `headers`, `timestamp`. **Offset** không do producer đặt mà do **broker leader gán** khi append.

Đơn vị thật sự đi trên dây và nằm trên disk là **record batch**: producer gom nhiều record thành batch (có nén), broker lưu nguyên batch đó xuống log, consumer fetch về nguyên batch. Broker gần như không phải giải nén/nén lại — đây là một trong những lý do Kafka đạt throughput cao.

### 2.2 Topic, Partition, Offset

- **Topic**: tên logic của một luồng sự kiện (`orders`, `payments`).
- **Partition**: đơn vị **vật lý** — một chuỗi record **có thứ tự, bất biến, chỉ ghi thêm**. Topic = tập hợp các partition.
- **Offset**: số thứ tự tăng dần **trong một partition**. Bộ ba `(topic, partition, offset)` mới là định danh duy nhất của một record.

```
topic "orders" — 3 partitions

P0 │ 0 │ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │  ◀── producer append vào cuối
                 ▲                   ▲
          group billing        group analytics
          committed = 3        committed = 8 (đã đọc hết)

P1 │ 0 │ 1 │ 2 │ 3 │ 4 │  ◀──
P2 │ 0 │ 1 │ 2 │ 3 │ 4 │ 5 │  ◀──
```

> Hai hệ quả:
> 1. **Thứ tự chỉ được đảm bảo trong một partition.** Không có thứ tự toàn cục giữa P0, P1, P2.
> 2. **Partition là đơn vị của cả song song lẫn thứ tự.** Muốn song song nhiều hơn → thêm partition. Muốn thứ tự chặt hơn → dồn về ít partition hơn. Đây là trade-off cốt lõi khi thiết kế topic.

### 2.3 Trên disk: segment và index

Mỗi partition là **một thư mục** trên broker, bên trong chia thành nhiều **segment**:

```
/var/lib/kafka/data/
└── orders-0/                           ← thư mục = <topic>-<partition>
    ├── 00000000000000000000.log        ← segment đã đóng (record batch)
    ├── 00000000000000000000.index      ← offset → vị trí byte (sparse)
    ├── 00000000000000000000.timeindex  ← timestamp → offset
    ├── 00000000000005367851.log        ← ACTIVE segment (đang được ghi)
    ├── 00000000000005367851.index
    ├── 00000000000005367851.timeindex
    ├── 00000000000005367851.txnindex   ← txn bị abort (mục 10.6)
    ├── leader-epoch-checkpoint         ← epoch → offset bắt đầu (mục 6.5)
    └── partition.metadata
```

- Tên file = **base offset** của segment.
- Tìm record ở offset X: (1) binary search trên tên các segment, (2) tra **sparse index** (mỗi ~4KB một entry) để ra vị trí byte gần nhất, (3) scan tuần tự một đoạn ngắn.
- Retention xóa **nguyên một segment**, không xóa từng record → cực rẻ. Active segment không bao giờ bị xóa hay compact.
- Cấu hình liên quan: `log.segment.bytes` (mặc định 1 GiB), `log.retention.hours` (168 = 7 ngày), `log.retention.bytes` (-1 = không giới hạn).

### 2.4 Vì sao Kafka nhanh

| Kỹ thuật | Ý nghĩa |
|---|---|
| **Sequential I/O** | Chỉ append vào cuối file — disk (kể cả HDD) ghi tuần tự rất nhanh |
| **Page cache của OS** | Không cache trong JVM heap; consumer bắt kịp đầu log thường đọc thẳng từ RAM |
| **Zero-copy (`sendfile`)** | Dữ liệu đi page cache → socket mà không qua user space |
| **Batching + compression end-to-end** | Producer nén (lz4/zstd), broker lưu nguyên, consumer giải nén |
| **Không fsync từng message** | Durability đến từ **replication**, không phải từ fsync |

Một lưu ý nhỏ về zero-copy: nó chỉ có tác dụng với kết nối plaintext ((TLS phá zero-copy vì dữ liệu phải được mã hóa trong user space trước khi ghi ra socket — bật TLS giữa client và broker thì CPU broker tăng rõ rệt.)).

> **Warning:** Kafka mặc định **không fsync** sau mỗi lần ghi (`log.flush.interval.messages` = Long.MAX_VALUE). Một record "đã được ack" có thể mới chỉ nằm trong page cache của các replica. Durability dựa trên giả định **không phải tất cả replica cùng mất điện một lúc** → bắt buộc rải replica qua **rack/AZ khác nhau** (mục 5.4 và 12). Chi tiết `acks` ↔ flush ở mục 7.

### 2.5 Retention: delete, compact, tiered storage

- **`cleanup.policy=delete`**: xóa segment cũ theo thời gian hoặc dung lượng — dùng cho event stream thông thường.
- **`cleanup.policy=compact`**: chỉ giữ **bản ghi cuối cùng của mỗi key**; record có `value = null` là *tombstone* (đánh dấu xóa). Dùng cho dữ liệu dạng "trạng thái mới nhất": `__consumer_offsets`, changelog của Kafka Streams, CDC snapshot.
- **Tiered storage** (KIP-405, production-ready từ 3.9): segment cũ được đẩy lên object storage (S3/GCS), broker chỉ giữ phần "nóng" → disk nhỏ hơn, reassign/khôi phục broker nhanh hơn nhiều.

---

## 3. Producer: đường đi của một message

### 3.1 Pipeline bên trong producer

```text
┌─ LUỒNG ỨNG DỤNG (caller) ────────────────┐  ┌─ RECORD ACCUMULATOR ─────────┐
│ send(record)                             │  │ buffer.memory = 32 MB (tổng) │
│   │  trả Future ngay, không chờ mạng     │  │                              │
│   ▼                                      │  │ orders-0  [██████][███   ]   │
│ Serializer: key/value → bytes            │  │ orders-1  [████  ]           │
│   ▼                                      │  │ orders-2  [█     ]           │
│ Partitioner: có key → murmur2 % N        │  │                              │
│              null → sticky partition     │  │ batch sẵn sàng khi đầy       │
│   ▼                                      │  │ batch.size (16 KB) hoặc chờ  │
│ append vào hàng đợi của partition ─────────►│ quá linger.ms (5 ms)         │
│                                          │  │ nén theo batch               │
│ buffer đầy → send() block ≤ max.block.ms │  │                              │
└──────────────────────────────────────────┘  └────────────────┬─────────────┘
                                                               │ drain
                                                               ▼
┌─ LUỒNG SENDER (nền) ───────────────────────────────────────────────────────┐
│ Sender thread: lấy batch sẵn sàng, gom theo BROKER LEADER của partition    │
│ NetworkClient: tối đa 5 request đang bay / kết nối · chờ ack theo acks     │
│ Metadata cache: partition → leader (làm mới khi NOT_LEADER)                │
└─────────────┬─────────────────────────────────────────┬────────────────────┘
              ▲ Produce [orders-0] / response           ▲ 1 request, 2 batch
              ▼                                         ▼
    ┌──────────────────────┐                  ┌────────────────────────────┐
    │       broker-1       │                  │          broker-2          │
    │   leader orders-0    │                  │ leader orders-1, orders-2  │
    └──────────────────────┘                  └────────────────────────────┘

response → callback/Future · lỗi tạm thời → retry tới delivery.timeout.ms
```
- `send()` **không gửi ngay** — nó chỉ đặt record vào hàng batch của partition ở RecordAccumulator tương ứng. Một **sender thread** chạy nền gom các batch có cùng broker đích thành một request.
- Producer **gửi thẳng tới broker đang là leader** của partition — không có router trung tâm. Nó biết leader nhờ **metadata**; `bootstrap.servers` chỉ dùng để lấy metadata lần đầu.
- Leader đổi (failover) → broker cũ trả `NOT_LEADER_OR_FOLLOWER` → producer refresh metadata → retry sang leader mới. Đây là **client-side routing**, cùng họ với smart client của Cassandra hay Redis Cluster.

### 3.2 Partitioner — message vào partition nào?

| Trường hợp | Cách chọn partition |
|---|---|
| Producer chỉ định partition | Dùng luôn |
| **Có key** | `murmur2(keyBytes) % numPartitions` → **cùng key luôn vào cùng partition** → giữ thứ tự theo key |
| **Không key** (từ 2.4) | **Sticky partitioner**: "dính" vào một partition cho tới khi đầy batch rồi mới đổi; từ 3.3 còn né partition có broker chậm (KIP-794) |
| Không key (trước 2.4) | Round-robin **từng record** |

> **Note:** Vì sao bỏ round-robin từng record? Nếu mỗi record rơi vào một partition khác nhau, mỗi batch chỉ có vài record → nhiều request nhỏ → throughput thấp, latency cao. Sticky partitioner thực chất là **round-robin ở mức batch** thay vì mức record — vẫn đều về dài hạn nhưng batch to hơn hẳn.

> **Warning:** `hash % numPartitions` **không phải consistent hashing**. Tăng số partition từ 6 lên 8 thì phần lớn key sẽ nhảy sang partition khác → **vỡ thứ tự theo key** và vỡ mọi state dựa trên co-partitioning. Vì vậy hãy chọn số partition dư ra ngay từ đầu (mục 15).

### 3.3 Batching: `linger.ms` và `batch.size`

- `batch.size` (mặc định 16 KB): kích thước tối đa một batch.
- `linger.ms` (mặc định **5 ms** từ Kafka 4.0, trước đó là 0): chờ thêm bao lâu để batch đầy hơn.
- Trade-off kinh điển **latency ↔ throughput**: tăng `linger.ms` lên 10–50 ms thường tăng throughput đáng kể, nhất là khi có nén.
- `buffer.memory` (32 MB) là tổng bộ nhớ cho mọi batch. Broker chậm → buffer đầy → `send()` **bị block** tới `max.block.ms` (60s) rồi ném exception — một nguồn treo ứng dụng rất hay gặp.

### 3.4 `acks` — khi nào thì "ghi thành công"?

| `acks` | Producer chờ gì | Mất dữ liệu khi | Latency |
|---|---|---|---|
| `0` | Không chờ gì | Gần như mọi sự cố | Thấp nhất |
| `1` | Leader ghi vào log của nó | Leader chết **trước khi follower kịp copy** | Thấp |
| `all` (`-1`) | **Mọi replica trong ISR** đã có record | Chỉ khi ISR teo còn mình leader rồi leader chết (chặn bằng `min.insync.replicas`, mục 6.3) | Cao hơn |

Bảng trên trả lời *producer chờ cái gì*. Còn câu hỏi *lúc nhận ack thì dữ liệu đã nằm trên đĩa chưa* — câu trả lời là **chưa chắc** — được mổ xẻ riêng ở mục 7.

Đường đi đầy đủ của một produce `acks=all`. Follower luôn có sẵn một Fetch treo ở leader nên dữ liệu mới được đẩy đi gần như ngay; leader chỉ biết follower đã có record khi nhận *lần fetch kế tiếp* với offset lớn hơn => **replication trong Kafka là pull** — follower tự fetch từ leader, y như một consumer. Leader biết follower đã có tới đâu nhờ **offset trong lần fetch kế tiếp**. Không có lệnh "AppendEntries" đẩy từ leader như Raft cổ điển.

### 3.5 Idempotent producer — chống duplicate do retry

Vấn đề: leader ghi xong nhưng **ack bị mất trên mạng** → producer timeout → retry → record bị ghi **hai lần**.

Giải pháp: mỗi producer có **PID** (producer id) + **epoch**, và mỗi batch gửi tới một partition mang **sequence number** tăng dần. Broker nhớ sequence của 5 batch gần nhất mỗi producer mỗi partition:

```text
 Producer             Leader
  PID 42             orders-0
     │                   │
     │───── batch A ────►│     batch A: seq 0–4
     │───── batch B ────►│     batch B: seq 5–9 (in-flight thứ 2)
     │                   ├─┐   append A → offset 500–504
     │                   │◄┘   append B → offset 505–509
     │         ✘─ ack A ─│     ack của A bị mất trên mạng
     │◄┄┄┄┄┄ ack B ┄┄┄┄┄┄│     ack B (offset 505)
     ├─┐                 │     A quá request.timeout.ms
     │◄┘                 │     → retry, GIỮ NGUYÊN seq 0–4
     │───── retry A ────►│     retry batch A: seq 0–4
     │                   ├─┐   seq 0–4 đã có trong bảng → DUPLICATE
     │                   │◄┘   không append lại
     │◄┄┄┄┄┄┄ OK ┄┄┄┄┄┄┄┄│     OK, offset 500 (trả lại kết quả cũ)
┄ NẾU SEQUENCE NHẢY CÓC ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
     │───── batch D ────►│     batch D: seq 15–19 (kỳ vọng 10)
     │                   ├─┐   → OUT_OF_ORDER_SEQUENCE, từ chối
     │                   │◄┘
     │◄┄┄┄┄┄┄ lỗi ┄┄┄┄┄┄┄│     producer gửi lại theo đúng thứ tự
     │                   │

┌─ PRODUCER STATE @ leader orders-0 (cho mỗi PID × partition) ───────────────┐
│ PID 42 · epoch 0 · kỳ vọng seq tiếp theo: 10                               │
│   seq 0–4  → offset 500                                                    │
│   seq 5–9  → offset 505                                                    │
│ nhớ tối đa 5 batch gần nhất → vì thế max.in.flight ≤ 5                     │
│ producer restart (không có transactional.id) → PID mới → mất bảng này      │
└────────────────────────────────────────────────────────────────────────────┘
```

Broker nhớ sequence của 5 batch gần nhất cho mỗi (PID, partition). Retry mang cùng sequence nên được nhận ra là trùng và trả lại kết quả cũ; sequence nhảy cóc nghĩa là có batch bị mất ở giữa nên bị từ chối.

- Mặc định **bật từ Kafka 3.0**: `enable.idempotence=true`, `acks=all`, `retries=MAX_INT`, `max.in.flight.requests.per.connection ≤ 5`.
- Với idempotence, kể cả khi có 5 request đang bay song song và một cái phải retry, **thứ tự trong partition vẫn được giữ** (broker từ chối batch có sequence nhảy cóc).

> **Note:** Góc nhìn DS — đây chính là **dedup bằng sequence number**. Giới hạn: phạm vi chỉ là **một phiên producer × một partition**. Producer restart (không có `transactional.id`) sẽ nhận PID mới → không dedup được xuyên restart. Muốn hơn thế → transactions (mục 10).

---

## 4. Broker & Partition

- **Replication factor (RF - số rep)**: mỗi partition có RF bản sao nằm trên **RF broker khác nhau** (không bao giờ hai replica của cùng partition trên một broker).
- Trong RF bản sao có **đúng một leader**: nhận mọi produce và (mặc định) phục vụ mọi fetch của consumer.
- Các **follower** fetch từ leader để bắt kịp; bình thường không phục vụ client (trừ khi bật fetch-from-follower, mục 9.7).
- **Leadership tính theo partition**. Postgres primary/replica là "cả node làm primary"; Kafka là "mỗi shard có leader riêng" — cùng ý tưởng với *multi-Raft* của CockroachDB/TiKV, nhưng data plane của Kafka **không dùng Raft** (mục 6.4).


---

## 6. Replication protocol: ISR, LEO, High Watermark, Leader Epoch

Đây là trái tim của tính durability và consistency trong Kafka — và là phần đáng đối chiếu nhất với lý thuyết hệ phân tán.

### 6.1 LEO và High Watermark

- **LEO (Log End Offset)**: offset tiếp theo sẽ được ghi — mỗi replica có LEO riêng.
- **HW (High Watermark)**: offset mà **mọi replica trong ISR đều đã có** → phần log dưới HW là **committed**. Leader tính `HW = min(LEO của các replica trong ISR)` và truyền HW cho follower qua fetch response.

```text
offset                0     1     2     3     4  │  5     6     7
leader   (broker-1)   ■     ■     ■     ■     ■  │  ▒     ▒     ▒     LEO = 8
follower (broker-2)   ■     ■     ■     ■     ■  │  ▒     □     □     LEO = 6
follower (broker-3)   ■     ■     ■     ■     ■  │  □     □     □     LEO = 5
                      └────── committed ──────┘ HW  └ CHƯA commit ─┘
                      consumer đọc được 0–4   = 5   chưa đủ ISR có

HW = min(LEO trong ISR) = min(8, 6, 5) = 5
■ có, đã commit   ▒ có nhưng CHƯA commit   □ chưa có
Leader chết lúc này, broker-2 lên thay → offset 6–7 biến mất. Vì thế consumer
chỉ được đọc dưới HW: thứ đã đọc được thì không bao giờ bị phủ nhận sau đó.
```

HW đóng vai trò "commit index" của partition: leader tính nó bằng LEO nhỏ nhất trong ISR và gửi cho follower qua fetch response.

**Vì sao consumer chỉ được đọc dưới HW?** Giả sử consumer đọc được offset 7, rồi leader chết và broker-2 (LEO=6) lên làm leader. Offset 7 chưa từng tồn tại ở leader mới — consumer đã "nhìn thấy" một record mà hệ thống sau đó **phủ nhận**. Chặn ở HW đảm bảo: thứ gì consumer đã thấy thì không bao giờ biến mất. Đây đúng là nguyên tắc **chỉ apply entry đã commit** (commitIndex) trong Raft.

### 6.2 ISR là tập động

```text
TRẠNG THÁI CỦA MỘT FOLLOWER  (ngưỡng replica.lag.time.max.ms = 30 s)

  ┌──────────────┐    trễ > 30 s     ┌──────────────────┐
  │   IN-SYNC    │──────────────────►│   OUT-OF-SYNC    │
  │  trong ISR   │                   │ bị loại khỏi ISR │
  └──────────────┘                   └────┬─────────────┘
          ▲                               │           ▲
          │                               │ fetch lại │ lại tụt
          │ LEO ≥ HW                      ▼           │
          │ của leader        ┌───────────────────────┴──┐
          │                   │       CATCHING UP        │
          │                   │ đang fetch lại, LEO tăng │
          └───────────────────┤                          │
                              └──────────────────────────┘

AI ĐƯỢC SỬA ISR? — leader chỉ ĐỀ XUẤT, controller mới CHỐT

┌────────────────────────┐  AlterPartition
│   broker-1 (leader)    │────────────────────────────────┐
│  thấy b3 tụt quá 30 s  │  ISR={1,2}, partition epoch    │
└────────────────────────┘                                ▼
                                      ┌──────────────────────────────────────┐
                                      │          active controller           │
┌────────────────────────┐            │kiểm epoch → ghi PartitionChangeRecord│
│       mọi broker       │ ◄──────────│     commit khi đa số voter đã có     │
│  áp dụng ISR = {1,2}   │            └──────────────────────────────────────┘
│   leader tính lại HW   │  fetch metadata log
└────────────────────────┘

→ leader bị cô lập không tự co ISR được, nên không ack sai được (mục 8.7)
```

Trên: vòng đời của một follower đối với ISR. Dưới: con đường duy nhất để thay đổi ISR — leader chỉ đề xuất, controller chốt, kết quả phát cho mọi broker qua metadata log.

- Follower bị coi là tụt hậu nếu **không bắt kịp LEO của leader** trong `replica.lag.time.max.ms` (mặc định 30s) — tiêu chí là *thời gian*, không phải *số message* (cách cũ theo số message gây ISR dao động liên tục khi có burst traffic).
- Leader **không tự ý** sửa ISR: nó gửi `AlterPartition` lên controller, controller ghi thay đổi vào metadata log rồi mới có hiệu lực. ISR vì vậy là **sự thật duy nhất do control plane giữ** — chi tiết này cứu Kafka trong tình huống network partition (mục 8.7).

### 6.3 `min.insync.replicas` — chốt chặn durability

Kết hợp với `acks=all`: broker chỉ nhận ghi khi `|ISR| ≥ min.insync.replicas`; nếu không, trả lỗi `NotEnoughReplicas`.

RF=3, `min.insync.replicas=2`, `acks=all`:

| Kích thước ISR | Ghi | Đọc | Ý nghĩa |
|---|---|---|---|
| 3 | ✅ | ✅ | Bình thường |
| 2 | ✅ | ✅ | Một replica có sự cố, vẫn chịu thêm được 1 lỗi nữa mà không mất dữ liệu |
| 1 | ❌ `NotEnoughReplicas` | ✅ (dữ liệu đã commit) | **Từ chối ghi** để không rơi vào tình trạng chỉ còn 1 bản |
| 0 | ❌ | ❌ | Partition offline |

> **Warning:** Mặc định của broker là `min.insync.replicas=1`. Khi đó ISR co về chỉ còn leader thì `acks=all` **lặng lẽ thoái hóa thành `acks=1`** — producer vẫn nhận OK, rồi leader chết là mất dữ liệu. Cấu hình production chuẩn: **RF=3, `min.insync.replicas=2`, `acks=all`**.

Công thức nhớ nhanh: với RF = N và `min.insync.replicas` = M, hệ **ghi được** khi còn ≥ M replica sống, và **không mất dữ liệu đã ack** khi số replica chết ≤ M − 1.

### 6.4 Góc nhìn DS: ISR của Kafka khác quorum của Raft thế nào

| | Raft / majority quorum | Kafka ISR |
|---|---|---|
| Commit khi | **Đa số** (⌊N/2⌋+1) replica có entry | **Tất cả** replica trong ISR có record |
| Chịu f lỗi cần | **2f + 1** replica | **f + 1** replica (với `min.insync` ràng buộc thêm) |
| Replica chậm | Không ảnh hưởng — chỉ cần đa số | Kéo latency `acks=all` lên cho tới khi bị đá khỏi ISR (30s) |
| Ai quyết định membership | Chính quorum (joint consensus) | **Controller** — một cụm Raft nằm ngoài replica group |
| Mô hình gốc | Raft / Paxos | **PacificA** (Microsoft Research) |

Đây là quyết định kiến trúc đẹp nhất của Kafka: **tách "replicate dữ liệu" khỏi "đồng thuận về cấu hình"**.

- Dữ liệu (khối lượng lớn) dùng ISR: chỉ cần **f+1** bản sao để chịu f lỗi → tiết kiệm disk và băng thông so với 2f+1.
- Cấu hình (ai là leader, ISR gồm ai — khối lượng nhỏ) đặt vào một cụm **consensus thật sự** (KRaft, 2f+1 node).

Mô hình này chính là PacificA ((PacificA: "Replication in Log-Based Distributed Storage Systems", Microsoft Research 2008. Ý tưởng: một configuration manager nhất quán mạnh quản lý membership; các replica group chỉ cần primary-backup với "tất cả cùng xác nhận" để commit.)): một *configuration manager* nhất quán mạnh + nhiều replica group primary-backup đơn giản. Cái giá phải trả: latency đuôi của `acks=all` bị quyết định bởi **replica chậm nhất trong ISR**, trong khi Raft chỉ chờ replica "trung vị".

### 6.5 Leader epoch — chữa bệnh log phân kỳ

**Vấn đề (trước 0.11, KIP-101):** follower khi khởi động lại sẽ cắt (truncate) log về HW *của chính nó*. Nhưng HW ở follower luôn cập nhật **chậm một vòng fetch** so với leader → có thể cắt mất record đã commit, hoặc hai replica giữ hai lịch sử khác nhau ở cùng offset (log divergence).

**Giải pháp:** **leader epoch** — một con số tăng đơn điệu mỗi lần partition đổi leader (tương đương **term** trong Raft). Mỗi batch mang epoch của leader đã ghi nó; mỗi replica giữ file `leader-epoch-checkpoint` (epoch → offset bắt đầu). Khi một replica cần đối chiếu, nó hỏi leader *"epoch E của tôi kết thúc ở offset nào bên anh?"* (`OffsetForLeaderEpoch`) rồi cắt chính xác tới đó.

```text
(1) TRƯỚC SỰ CỐ — A là leader, epoch 1
    A (leader)    [0 m0 e1] [1 m1 e1] [2 m2 e1]
    B (follower)  [0 m0 e1] [1 m1 e1]             A chết trước khi B lấy m2

(2) B LÊN LEADER — epoch 2, nhận m3
    A (đã chết)   [0 m0 e1] [1 m1 e1] [2 m2 e1]   ← m2 chưa từng commit
    B (leader)    [0 m0 e1] [1 m1 e1] [2 m3 e2]   checkpoint B: e2 → offset 2

(3) A QUAY LẠI — đối chiếu theo epoch
    A → B: OffsetForLeaderEpoch(1)
    B → A: “epoch 1 kết thúc ở offset 2”
    A cắt log từ offset 2 (bỏ m2), rồi fetch m3:
    A (follower)  [0 m0 e1] [1 m1 e1] [2 m3 e2]   ✔ hai log hội tụ
    B (leader)    [0 m0 e1] [1 m1 e1] [2 m3 e2]

[offset message epoch] · request mang epoch cũ bị từ chối → epoch cũng là
fencing token, chặn leader "zombie"
```

Leader epoch đóng vai trò như *term* của Raft: mỗi batch mang epoch của leader đã ghi nó, nên replica có thể hỏi chính xác "lịch sử của tôi lệch khỏi leader từ đâu" thay vì đoán dựa trên high watermark cục bộ (vốn luôn trễ một vòng fetch).

m2 biến mất — nhưng đó là hệ quả của việc m2 **chưa từng được commit** (producer dùng `acks=1` mới tưởng nó thành công), không phải lỗi thuật toán. Ngoài ra, leader epoch còn là một **fencing token**: request mang epoch cũ từ một leader "zombie" sẽ bị từ chối — đúng pattern fencing token trong bài Distributed Lock của [note hệ phân tán](/blog/distributed-system-note).

### 6.6 Unclean leader election — chọn C hay A

Khi **mọi replica trong ISR đều chết** và chỉ còn một replica tụt hậu sống sót:

| `unclean.leader.election.enable` | Hành vi | Lựa chọn CAP |
|---|---|---|
| `false` (mặc định) | Partition **offline**, chờ một replica trong ISR sống lại | **Consistency** — không mất record đã commit |
| `true` | Bầu replica tụt hậu làm leader ngay | **Availability** — online lại nhưng **mất** các record nó chưa có |

Hệ tài chính/ledger: luôn để `false`. Hệ log/metrics chấp nhận mất mát: có thể cân nhắc `true`.

Kafka 4.x bổ sung **ELR — Eligible Leader Replicas** (KIP-966) để thu hẹp tình huống "phải chọn giữa offline và mất dữ liệu": high watermark chỉ tiến khi `|ISR| ≥ min.insync.replicas`, nên những replica bị loại khỏi ISR *trong lúc ISR đã thấp hơn ngưỡng* vẫn chắc chắn có đủ dữ liệu đã commit → được đưa vào tập ELR và vẫn được bầu làm leader một cách "sạch". Tính năng này đang được bật dần qua các bản 4.x — kiểm tra release note của phiên bản bạn chạy.

---

## 7. Durability end-to-end: `acks`, page cache và flush

Câu hỏi tưởng đơn giản: *producer nhận được ack rồi thì record đang nằm ở đâu?* Với cấu hình mặc định, câu trả lời làm nhiều người bất ngờ: **trong RAM** — page cache của hệ điều hành trên mỗi replica thuộc ISR — và **chưa chắc đã nằm trên đĩa của bất kỳ máy nào**. Mục này đi từng chặng, từ lúc broker đọc request khỏi socket tới lúc byte thật sự nằm trên đĩa, và chỉ ra `acks` "chốt" ở chặng nào.

### 7.1 "Durable" luôn đi kèm một mô hình lỗi

Không có khái niệm "bền" chung chung — chỉ có "bền **trước loại sự cố nào**". Record ở mỗi vị trí sống sót qua những sự cố khác nhau:

| Record đang nằm ở | Process JVM chết (OOM, `kill -9`) | Máy mất điện / kernel panic | Disk hỏng hẳn |
|---|---|---|---|
| Socket buffer / request queue của broker | ❌ | ❌ | ❌ |
| **Page cache** (dirty page) của **1** máy | ✅ page cache thuộc kernel, không thuộc JVM | ❌ | ❌ |
| **Đĩa** của **1** máy (đã fsync) | ✅ | ✅ | ❌ |
| **Page cache** của **nhiều** máy ở các AZ khác nhau | ✅ | ✅ trừ khi tất cả mất điện trong cùng một khoảng ngắn | ✅ |
| **Đĩa** của nhiều máy | ✅ | ✅ | ✅ trừ khi hỏng đồng thời |

"fsync trên một máy" và "nằm trong RAM của ba máy ở ba AZ" chống lại **những loại sự cố khác nhau**. Kafka mặc định chọn cái thứ hai.

### 7.2 Bên trong broker: từ socket tới page cache

```text
Producer · Follower (Fetch) · Consumer (Fetch)
                 │ request                                    ▲ response
                 ▼                                            │
┌──────────────────────────────────┐          ┌──────────────────────────────┐
│         Network threads          │          │        Response queue        │
│     num.network.threads = 3      │  ┌──────►│ mỗi network thread một hàng  │
└────────────────┬─────────────────┘  │       └──────────────────────────────┘
                 ▼                    │                       ▲
┌──────────────────────────────────┐  │acks=1                 │ HW đủ → trả OK
│          Request queue           │  │→ ngay                 │
│    queued.max.requests = 500     │  │                       │
└────────────────┬─────────────────┘  │       ┌──────────────────────────────┐
                 ▼                    │       │          PURGATORY           │
┌──────────────────────────────────┐  │  ┌───►│   DelayedProduce: chờ HW ≥   │
│  I/O threads (request handler)   │  │  │    │      offset cuối batch       │
│        num.io.threads = 8        │  │  │    │DelayedFetch: chờ đủ min.bytes│
└────────────────┬─────────────────┘  │  │    └──────────────────────────────┘
                 ▼                    │  │acks=all            ▲
┌──────────────────────────────────┐  │  │                    ┆
│   ReplicaManager.appendRecords   │──┘  │    ┌──────────────────────────────┐
│  CRC · kiểm minISR · gán offset  │─────┘    │      Follower Fetch tới      │
└────────────────┬─────────────────┘          │   cập nhật LEO follower →    │
                 ▼                            │ thử hoàn tất DelayedProduce  │
┌──────────────────────────────────┐          └──────────────────────────────┘
│   UnifiedLog → active segment    │
│ FileChannel.write() · mmap index │          acks=0: không gửi response
└────────────────┬─────────────────┘
                 ▼
┌──────────────────────────────────┐          ┌──────────────────────────────┐
│    OS PAGE CACHE (dirty, RAM)    │ writeback│             DISK             │
│   fetch đọc từ đây (sendfile)    │┄┄┄┄┄┄┄┄┄►│   kernel writeback ~5–30 s   │
└──────────────────────────────────┘          │ fsync: roll segment, tắt êm  │
                                              └──────────────────────────────┘
```

Ghi chỉ đi tới page cache — trên đường nóng không có fsync. `acks` chỉ quyết định response được trả ở đâu: không trả (0), trả ngay sau append (1), hay chờ trong purgatory tới khi mọi follower trong ISR fetch qua offset đó (all).

- `FileChannel.write()` chỉ **copy bytes vào page cache** rồi trả về ngay — trang nhớ đó được đánh dấu *dirty*. Trên đường xử lý nóng **không có fsync** (với cấu hình mặc định).
- Follower đi đúng con đường đó: fetch từ leader → append vào log của chính nó → **page cache của follower**, cũng không fsync.
- Index (`.index`, `.timeindex`) là file được mmap — cũng chỉ là dirty page trong RAM cho tới khi được flush.

### 7.3 Ba mức `acks` — mổ xẻ chi tiết

#### `acks=0`

- Producer ghi request vào socket là coi như xong; broker **không gửi response** nào cả.
- Callback nhận offset `-1`; `retries` vô nghĩa vì producer không bao giờ thấy lỗi.
- Không bền trước bất kỳ sự cố nào — kể cả broker đang restart. Chỉ dùng cho dữ liệu "mất cũng được": metric, log debug.

#### `acks=1` — "leader đã ghi vào page cache"

- Leader trả lời ngay sau khi append vào log local (tức là vào page cache).
- **Cửa sổ mất dữ liệu**: từ lúc leader ack tới lúc **ít nhất một follower** fetch được record — bình thường vài ms, nhưng có thể rất dài nếu follower đang tụt hậu.
- Điểm hay bị hiểu sai: với `acks=1`, **fsync không cứu được bạn**. Cơ chế mất dữ liệu chủ yếu **không phải mất đĩa** mà là **failover rồi truncate**:
    1. Leader ack record r, nằm trong page cache; process leader chết (OS vẫn sống → r vẫn được kernel ghi xuống đĩa).
    2. Controller bầu một follower **chưa kịp fetch r** làm leader mới (epoch +1) và nhận ghi tiếp.
    3. Leader cũ quay lại làm follower, đối chiếu theo leader epoch (mục 6.5) và **truncate** đuôi log → r bị xóa, dù nó đang nằm nguyên trên đĩa.
- `min.insync.replicas` **không có tác dụng** với `acks=1`.

#### `acks=all` — "mọi replica trong ISR đã có record"

- Leader append local → request vào **purgatory** (`DelayedProduce`) → hoàn tất khi HW vượt offset cuối của batch, tức là mọi replica trong **ISR hiện tại** đã fetch qua offset đó.
- "all" là **all ISR**, không phải all replicas. ISR có thể co lại — đó là lý do phải có `min.insync.replicas`.
- `min.insync.replicas` được kiểm tra **hai lần**:
    - **Trước khi append**: ISR < minISR → `NOT_ENOUGH_REPLICAS`, record **không** được ghi.
    - **Trong lúc chờ**: ISR co lại dưới minISR → `NOT_ENOUGH_REPLICAS_AFTER_APPEND` — record **đã nằm trong log của leader** và vẫn có thể được replicate, commit về sau.
- Không đủ ISR bắt kịp trong thời gian chờ (bằng `request.timeout.ms` của producer, 30s, gửi kèm trong ProduceRequest) → `REQUEST_TIMED_OUT`.
- **Latency**: follower luôn giữ sẵn một fetch "treo" ở leader (long-poll, tối đa `replica.fetch.wait.max.ms` = 500ms). Có dữ liệu mới là leader trả ngay, follower append rồi gửi fetch kế tiếp mang offset mới → leader nâng HW → trả ack. Tổng cộng thường cỡ **1–2 round-trip leader↔follower + thời gian append**, và bị quyết định bởi **follower chậm nhất trong ISR**.

> **Warning:** **Timeout không có nghĩa là thất bại.** `REQUEST_TIMED_OUT`, `NOT_ENOUGH_REPLICAS_AFTER_APPEND`, hay ack bị rơi trên mạng đều là trạng thái **"không biết"**: record có thể đã commit, cũng có thể chưa. Trong mạng bất đồng bộ, không thể phân biệt "chậm" với "chết" — đây là bài toán kinh điển của hệ phân tán. Cách xử lý đúng là **retry kèm idempotent producer** (mục 3.5): broker dedup theo sequence nên retry an toàn. Tắt idempotence mà vẫn retry → duplicate.

### 7.5 Khi broker chết cứng: log recovery

```text
                             ╭────────────────────╮
                             │  Broker khởi động  │
                             ╰──────────┬─────────╯
                                        ▼
                       ╔════════════════════════════════╗
                       ║ có file .kafka_cleanshutdown ? ║
                       ╚══════╦═══════════════════╦═════╝
                         có   │                   │ không (crash / mất điện)
                              ▼                   ▼
┌─────────────────────────────┐   ┌──────────────────────────────────────────┐
│      lần trước tắt êm:      │   │ LOG RECOVERY cho từng partition:         │
│  load log, bỏ qua recovery  │   │ đọc lại segment sau recovery point       │
└──────────────┬──────────────┘   │ kiểm CRC từng batch, cắt đuôi hỏng/dở    │
               │                  │ dựng lại .index / .timeindex             │
               │                  │ luồng: num.recovery.threads.per.data.dir │
               │                  └───────────────────────┬──────────────────┘
               │                                          │
               ▼                                          ▼
    ┌──────────────────────────────────────────────────────────────────────┐
    │              đăng ký với controller (broker epoch mới)               │
    │  4.x (KIP-966): báo vừa unclean shutdown → không là ứng viên “sạch”  │
    └───────────────────────────────────┬──────────────────────────────────┘
                                        ▼
    ┌──────────────────────────────────────────────────────────────────────┐
    │            làm follower: OffsetForLeaderEpoch tới leader             │
    │           truncate phần log phân kỳ theo epoch của leader            │
    └───────────────────────────────────┬──────────────────────────────────┘
                                        ▼
    ┌──────────────────────────────────────────────────────────────────────┐
    │                    fetch phần còn thiếu từ leader                    │
    │        dữ liệu mất do mất điện được chép lại từ replica khác         │
    └───────────────────────────────────┬──────────────────────────────────┘
                                        ▼
    ┌──────────────────────────────────────────────────────────────────────┐
    │       LEO ≥ HW của leader → leader gửi AlterPartition (expand)       │
    │                 controller chốt → broker vào lại ISR                 │
    └──────────────────────────────────────────────────────────────────────┘

┌─ FILE MÀ BROKER DỰA VÀO ───────────────────────────────────────────────────┐
│ .kafka_cleanshutdown              có = lần trước đã flush hết và tắt êm    │
│ recovery-point-offset-checkpoint  đã chắc chắn flush tới đâu (ghi mỗi 60 s)│
│ replication-offset-checkpoint     high watermark từng partition (mỗi 5 s)  │
│ <partition>/leader-epoch-checkpoint  epoch → offset bắt đầu                │
└────────────────────────────────────────────────────────────────────────────┘
```

Đĩa local chỉ cần *nhất quán* (CRC đúng, không có batch ghi dở), không cần *đầy đủ*: phần đuôi bị mất được chép lại từ leader. Bước recovery có thể kéo dài hàng chục phút với broker giữ hàng nghìn partition.

- Đĩa local chỉ cần **nhất quán** (CRC đúng, không có batch ghi dở), không cần **đầy đủ**: phần đuôi bị mất do mất điện sẽ được **chép lại từ leader**. Durability thật sự nằm ở **replica khác**, không nằm ở đĩa của chính broker.
- Thực tế: broker giữ hàng nghìn partition, sau một lần crash có thể mất **hàng chục phút** chỉ để recovery trước khi phục vụ lại. Tăng `num.recovery.threads.per.data.dir` (mặc định chỉ 1–2 luồng mỗi thư mục log) theo số core và số disk, và luôn ưu tiên tắt êm (mục 8.6).

### 7.6 Ma trận: `acks` × loại sự cố

Giả định RF=3, `min.insync.replicas=2`, flush mặc định, mỗi replica ở một AZ:

| Sự cố | `acks=0` | `acks=1` | `acks=all` |
|---|---|---|---|
| Request hoặc ack bị rơi trên mạng | Mất, không ai biết | Retry; không trùng nhờ idempotence | Như `acks=1` |
| **Process** leader chết, OS vẫn sống | Mất phần còn trong socket/queue | **Có thể mất** — failover rồi truncate | An toàn |
| **Máy** leader mất điện / kernel panic | Mất | **Có thể mất** — như trên | An toàn: follower ISR có record trong page cache của họ |
| Một follower mất điện | — | — | An toàn: ISR còn 2 ≥ minISR |
| **Cả 3 replica mất điện gần như cùng lúc** (chung rack/nguồn, sự cố cả DC) | Mất | Mất | **Có thể mất** phần chưa được kernel ghi xuống (~30s gần nhất) |
| Như trên, topic đặt `flush.messages=1` | Mất | Không mất vì mất điện ở leader, nhưng vẫn có thể mất do failover-truncate | **An toàn**: mọi ISR đã fsync trước khi record được tính là commit |
| Disk một broker hỏng hẳn | Mất nếu đó là leader | Có thể mất | An toàn: dựng lại từ replica khác |

> **Warning:** Ca tinh vi nhất: replica **cuối cùng còn trong ISR** mất điện, mất đuôi log chưa flush, khởi động lại và được bầu làm leader (vì nó vẫn là thành viên ISR duy nhất). Dữ liệu đã ack biến mất **một cách lặng lẽ**, kể cả với `acks=all`, vì các replica khác đã bị loại khỏi ISR từ trước và unclean election bị tắt. Đây là một trong những động lực của KIP-966 (ELR) ở Kafka 4.x: broker báo cho controller biết mình vừa unclean shutdown để không còn được coi là ứng viên "sạch". Nếu còn chạy bản cũ, cách phòng tốt nhất vẫn là **rải replica qua nhiều fault domain** để ISR hiếm khi co về một.

### 7.7 Vì sao Kafka chọn không fsync — và khi nào nên bật

**Lý do không fsync mặc định:**

1. **Chi phí.** fsync buộc chờ thiết bị xác nhận ghi bền: từ hàng trăm µs (NVMe có tụ chống mất điện) tới hàng chục ms (HDD, network disk). fsync trong luồng append còn chặn I/O thread và phá cơ chế gom ghi tự nhiên của kernel. Tài liệu Kafka khuyến nghị dựa vào **replication + flush nền của OS**.
2. **Lỗi độc lập.** Xác suất ba máy ở ba AZ **cùng** mất điện trong **cùng** một cửa sổ ~30s nhỏ hơn rất nhiều so với xác suất một đĩa hỏng → trong mô hình lỗi độc lập, "RAM của 3 máy" bền hơn "đĩa của 1 máy".
3. **Tự chữa từ replica.** Phần dữ liệu một máy làm mất được chép lại từ máy khác (7.5) — đĩa local không phải nguồn sự thật duy nhất.

> **Note:** Góc nhìn DS — chứng minh an toàn của Raft giả định rằng *node crash rồi khởi động lại vẫn nhớ những gì nó đã ack hoặc đã bỏ phiếu*; một node "quên" log sau crash có thể bỏ phiếu hai lần hoặc làm mất entry đã commit. Vì vậy các hệ dựa trên Raft (etcd, Redpanda, và chính metadata log của KRaft) đều fsync trước khi ack. Data plane của Kafka **bỏ giả định đó** để đổi lấy throughput, và bù lại bằng truncate + fetch lại từ leader. Cái giá là đúng ca "replica cuối cùng" ở trên — chỗ giả định lỗi độc lập bị phá vỡ.

So sánh "ack nghĩa là gì" ở các hệ thống quen thuộc:

| Hệ thống / cấu hình | Lúc trả "OK", dữ liệu đang ở đâu | fsync trước khi ack? |
|---|---|---|
| Kafka `acks=all` (mặc định) | Page cache của mọi replica trong ISR (≥ minISR) | **Không** |
| Kafka `acks=all` + `flush.messages=1` | Đĩa của mọi replica trong ISR | Có — rất đắt |
| PostgreSQL `synchronous_commit=on`, không có standby đồng bộ | WAL trên đĩa của primary | Có (local) |
| PostgreSQL `synchronous_commit=remote_write` + standby đồng bộ | WAL fsync ở primary + standby đã ghi vào OS (chưa fsync) | Primary có, standby không |
| etcd (Raft) | WAL đã fsync trên đa số node | Có |
| Redpanda (Raft) `acks=all` | Log đã fsync trên đa số replica | Có |
| MongoDB `w: "majority"` + journal | Journal đã ghi đĩa trên đa số node | Có |

Kafka `acks=all` gần với PostgreSQL `remote_write` nhất — nhưng còn "lỏng" hơn ở phía leader, vì leader cũng không fsync.

**Khi nào nên cân nhắc bật flush:**

- Không rải được replica qua các fault domain độc lập (một rack, một DC, một nguồn điện) → mô hình lỗi độc lập không còn đúng. Ưu tiên **sửa topology** trước; nếu không thể, bật `flush.ms`/`flush.messages` cho các topic quan trọng.
- Topic throughput thấp nhưng cực kỳ quan trọng (ledger, audit): `flush.messages=1` có thể chấp nhận được — **đo** trước khi quyết.
- Phần cứng quyết định chi phí: SSD doanh nghiệp có **PLP** (power-loss protection) làm fsync rất rẻ; ngược lại, SSD phổ thông có write cache không được bảo vệ có thể báo fsync xong trong khi dữ liệu vẫn nằm trong cache của ổ.
- Trên cloud: page cache nằm trong RAM của VM; volume kiểu EBS/Persistent Disk tự replicate bên trong AZ, nên phần **đã flush** sống sót khi VM chết, còn **dirty page** thì không.
- Tinh chỉnh writeback của OS (`vm.dirty_background_bytes`, `vm.dirty_ratio`) để thu nhỏ cửa sổ rủi ro và tránh các đợt xả dirty page dồn dập. Máy RAM lớn với mặc định 10% có thể tích tụ hàng chục GB dirty page; khi chạm `vm.dirty_ratio` (20%), **mọi tiến trình ghi bị chặn** → I/O thread của Kafka đứng, latency produce tăng vọt.

### 7.8 Tóm tắt: hai trục của "ack"

```
                     │ RAM (page cache)          │ Đĩa (đã fsync)
─────────────────────┼───────────────────────────┼───────────────────────────
1 máy (leader)       │ acks=1                    │ acks=1 + flush.messages=1
nhiều máy (mọi ISR)  │ acks=all     ← mặc định   │ acks=all + flush.messages=1
─────────────────────┴───────────────────────────┴───────────────────────────
acks=0: chưa chắc record đã tới broker.
Kernel writeback (~30 s), roll segment và clean shutdown đưa dữ liệu từ cột
trái sang cột phải "ở phía sau" — không producer nào chờ bước đó.
```

- **Trục dọc** (số máy) chống lại **mất máy và failover**. Đây là trục quan trọng nhất, và là lý do `acks=1` có fsync vẫn mất dữ liệu.
- **Trục ngang** (RAM hay đĩa) chống lại **mất điện đồng thời**. Kafka gánh trục này bằng cách rải replica qua AZ, không phải bằng fsync.
- Cấu hình production chuẩn (`acks=all`, RF=3, minISR=2, 3 AZ) nằm ở **ô dưới-trái**: đủ bền cho mọi sự cố trừ việc nhiều fault domain cùng mất điện trong vài chục giây.

---

## 8. Control plane: Controller và KRaft

### 8.1 Controller làm gì

Tại mỗi thời điểm có **đúng một active controller** cho cả cluster. Nó:

- Giữ **toàn bộ metadata**: topic, partition, replica assignment, leader + ISR + leader epoch của từng partition, danh sách broker, config, ACL, quota.
- Làm **failure detector**: nhận heartbeat của broker, **fence** broker im lặng quá lâu.
- **Chỉ định leader cho partition** khi broker chết, khi shutdown có kiểm soát, khi preferred election, khi reassign.
- Xử lý tạo/xóa topic, thêm partition, reassign.

### 8.2 Từ ZooKeeper đến KRaft

Thời ZooKeeper: metadata nằm trong ZooKeeper; một broker giành được ephemeral znode `/controller` sẽ làm controller và **đẩy** metadata xuống các broker khác qua RPC. Vấn đề:

1. **Vận hành hai hệ phân tán** (ZooKeeper + Kafka) với hai mô hình bảo mật, hai bộ monitoring, hai kiểu failure.
2. **Controller failover chậm**: controller mới phải **đọc lại toàn bộ metadata** từ ZooKeeper — tỉ lệ với số partition, cluster lớn mất từ hàng chục giây đến vài phút, trong lúc đó không partition nào được bầu leader mới.
3. **Trần số partition** (~200 nghìn/cluster) vì chi phí trên.
4. Metadata được **push** bằng RPC → broker dễ lệch metadata nhau.

**KRaft** (KIP-500) biến metadata thành một **event log** — topic nội bộ một partition `__cluster_metadata` — được replicate bằng **Raft** giữa các controller.

| Phiên bản | Mốc |
|---|---|
| 2.8 (2021) | KRaft early access |
| 3.3 (2022) | KRaft production-ready cho cluster mới |
| 3.5 | ZooKeeper mode bị deprecate |
| 3.9 (2024) | Controller quorum động (KIP-853); bản 3.x cuối cùng hỗ trợ migrate ZooKeeper → KRaft |
| 4.0 (2025) | **Xóa hẳn ZooKeeper** — chỉ còn KRaft |

### 8.3 Kiến trúc KRaft

Mỗi node khai báo vai trò qua `process.roles`: `broker`, `controller`, hoặc `broker,controller` (combined — chỉ nên dùng cho dev/test).

```text
┌─ CONTROLLER QUORUM · process.roles=controller · Raft ──────────────────────┐
│ offset              1046 1047 1048 1049 1050 1051                          │
│ controller-1 ACTIVE  ■    ■    ■    ■    ■    ■    leader, epoch 7         │
│ controller-2 voter   ■    ■    ■    ■    ■    ■    Fetch(1052) → leader    │
│ controller-3 voter   ■    ■    ■    ■    □    □    Fetch(1050) → leader    │
│                                                                            │
│ HW (commit) = 1052: leader + controller-2 = 2/3 voter đã có tới 1051       │
│ → mọi offset ≤ 1051 đã commit; controller-3 sẽ nhận nốt 1050–1051          │
│ snapshot định kỳ: node mới / tụt xa không phải replay log từ đầu           │
└─────────────────────────────────────────────────────────────────────┬──────┘
                                                   Fetch metadata log ▲
                                            + BrokerHeartbeat mỗi 2 s │
┌─ BROKERS · process.roles=broker · observer, KHÔNG bỏ phiếu ─────────┴──────┐
│ broker     trạng thái   metadata image (RAM) đã áp dụng tới                │
│ broker-1   unfenced     offset 1051                                        │
│ broker-2   unfenced     offset 1051                                        │
│ broker-3   FENCED       offset 1036 (đang bắt kịp)                         │
│ metadata image = topic · partition · leader · ISR · config, giữ trong RAM  │
│ broker im lặng quá broker.session.timeout.ms (9 s) → controller fence nó   │
│ broker chỉ được unfence khi đã bắt kịp metadata log                        │
│ client không bao giờ nói chuyện trực tiếp với controller                   │
└────────────────────────────────────────────────────────────────────────────┘
```

Cùng một cơ chế pull như replication của partition: follower và observer đều *fetch* từ leader. Khác biệt là ở đây commit cần *đa số voter* (Raft), còn broker chỉ đọc log để dựng metadata image và không tham gia bầu cử.

- **Voters**: các controller tham gia bầu cử Raft. Thường 3 (chịu 1 lỗi) hoặc 5 (chịu 2 lỗi).
- **Active controller** = Raft leader của `__cluster_metadata`.
- **Broker là observer**: fetch metadata log từ leader, áp dụng vào bộ nhớ (metadata image), nhưng **không bỏ phiếu**.
- Metadata log trông như một chuỗi sự kiện (minh họa, rút gọn):

```
offset  record
1001    RegisterBrokerRecord   { id: 3, brokerEpoch: 1288, rack: "az-c" }
1002    TopicRecord            { name: "orders", topicId: "xK3..." }
1003    PartitionRecord        { partition: 0, replicas: [1,2,3],
                                 isr: [1,2,3], leader: 1, leaderEpoch: 0 }
 ...
1050    FenceBrokerRecord      { id: 1, epoch: 1201 }
1051    PartitionChangeRecord  { partition: 0, leader: 2, isr: [2,3] }
                               ← leaderEpoch tăng lên
```

> **Note:** Góc nhìn DS — đây là **replicated state machine** + **event sourcing** áp dụng cho chính metadata: *trạng thái cluster = fold của metadata log*, có snapshot định kỳ để không phải replay từ đầu. Vì các controller follower **luôn replay log trong bộ nhớ**, khi một follower lên làm active controller nó **đã có sẵn toàn bộ state** → failover gần như tức thì, thay vì phải đọc lại hàng trăm nghìn znode như thời ZooKeeper.

### 8.4 Raft trong KRaft: bầu active controller

Nhắc lại Raft: mỗi node là follower / candidate / leader; có **term** (KRaft gọi là **epoch**); follower không nghe thấy leader quá *election timeout* thì thành candidate, tăng epoch, xin phiếu; ai được **đa số** phiếu thì làm leader; voter chỉ bầu cho candidate có log **ít nhất mới bằng** log của mình.

Những điểm riêng của KRaft:

- **Pull-based**: follower gửi `Fetch` tới leader (thay vì leader đẩy `AppendEntries`). Leader biết follower có tới đâu nhờ offset trong fetch — y như cơ chế replicate partition ở mục 3.4.
- Follower không fetch được từ leader trong `controller.quorum.fetch.timeout.ms` (mặc định 2s) → bắt đầu bầu cử; election timeout ngẫu nhiên quanh `controller.quorum.election.timeout.ms` (1s) để tránh nhiều node cùng ứng cử.
- **Commit** khi đa số voter đã fetch qua offset đó → đó là HW của metadata log.
- **Pre-vote** (KIP-996, các bản 4.x): node vừa bị cô lập rồi quay lại sẽ "thăm dò" trước, không tăng epoch bừa bãi làm gián đoạn leader đang khỏe.

```text
┌──────────────────┐ ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐ ┌────────────────┐
│    Unattached    │ ┆ LUẬT BỎ PHIẾU: chưa bầu ai ở epoch ┆ │    Resigned    │
│ chưa biết leader │ ┆  này + log candidate không cũ hơn  ┆ │đang rời vai trò│
└──────┬───────────┘ └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘ └────────────────┘
       │                                                              ▲
       │ biết leader         hết timeout ~1 s → epoch + 1      tắt êm │
       │                                      ┌────┐                  │
       ▼                                      │    ▼                  │
┌─────────────┐      ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  FOLLOWER   │> 2 s │ PROSPECTIVE │đa số │  CANDIDATE  │đa số │   LEADER    │
│fetch leader │─────►│  pre-vote   │─────►│  xin Vote   │─────►│ active ctrl │
└──────┴──────┘      └──────┬──────┘      └──────┬──────┘      └──────┬──────┘
       ▲ về Follower khi:   │                    │                    │
       │                    │                    │                    │
       └────────────────────┴────────────────────┴────────────────────┘
                  bị từ chối           thấy leader ≥ epoch  thấy epoch cao hơn

> 2 s = controller.quorum.fetch.timeout.ms · đa số = quá nửa số voter
pre-vote (KIP-996, Kafka 4.x): node vừa bị cô lập quay lại sẽ thăm dò trước,
không tăng epoch bừa bãi làm gián đoạn leader đang khỏe
```

Máy trạng thái Raft trong KRaft. Luật bỏ phiếu đảm bảo leader mới luôn có đủ mọi entry đã commit; pre-vote tránh để một node vừa bị cô lập làm gián đoạn leader đang khỏe.

Diễn biến khi active controller chết:

```text
 ctrl-1      ctrl-2      ctrl-3      brokers
leader e7   log 5120    log 5118    observer
    │           │           │           │
    ├─┐         │           │           │   controller-1 crash
    │◄┘         │           │           │
    │           ├─┐         │           │   không fetch được leader > 2 s
    │           │◄┘         │           │   → Prospective (pre-vote)
    │           │─ PreVote ►│           │   PreVote(lastEpoch 7,
    │           │           │           │           lastOffset 5120)
    │           │◄ đồng ý ┄┄│           │   log C2 không cũ hơn log C3
    │           ├─┐         │           │   Candidate: epoch 8
    │           │◄┘         │           │   tự bầu cho mình
    │           │── Vote ──►│           │   Vote(epoch 8, lastEpoch 7,
    │           │           │           │        lastOffset 5120)
    │           │◄┄┄ OK ┄┄┄┄│           │   granted → 2/3 = đa số
    │           ├─┐         │           │   LEADER epoch 8
    │           │◄┘         │           │   ghi LeaderChange vào log
    │           │◄──────────│           │   Fetch(5119): kéo phần còn thiếu
    │           │◄──────────────────────│   Fetch metadata + BrokerHeartbeat
    │           │           │           │   C2 vốn đã replay log trong RAM
    │           │           │           │   → phục vụ ngay, không nạp lại
┄ CONTROLLER-1 QUAY LẠI ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
    │──────────►│           │           │   Fetch → biết epoch 8, làm follower
    │           │           │           │

Control plane gián đoạn ≈ fetch timeout (2 s) + một vòng bỏ phiếu.
Data plane không dừng: broker vẫn phục vụ produce/fetch với metadata đang có.
```

Active controller chết: controller-2 thắng cử nhờ được đa số voter (chính nó + controller-3) bỏ phiếu, và vì nó luôn replay metadata log trong RAM nên tiếp quản gần như tức thì.

### 8.5 Hai tầng leader election

Đây là chỗ người mới hay lẫn nhất: Kafka có **hai loại "leader"** và hai cơ chế bầu hoàn toàn khác nhau.

| | Bầu **active controller** | Bầu **leader cho partition** |
|---|---|---|
| Số lượng | **1** cho cả cluster | **1 cho mỗi partition** (có thể hàng trăm nghìn) |
| Ai tham gia | Các controller (voters) | **Không ai bỏ phiếu** — active controller quyết |
| Cơ chế | Raft: vote, đa số, epoch | Chọn **replica đầu tiên trong danh sách Replicas** mà đang **trong ISR** và broker **còn sống (unfenced)** |
| Kích hoạt khi | Mất liên lạc với controller leader | Broker bị fence, controlled shutdown, preferred election, reassign |
| Ghi kết quả ở | Metadata log (LeaderChange) | Metadata log (`PartitionChangeRecord`, leader epoch +1) |
| Thời gian | Thường dưới 1–2 giây | Phát hiện lỗi (≤ 9s) + vài trăm ms áp dụng |

Nói gọn: **consensus chỉ dùng ở tầng controller**; còn leader của partition được **chỉ định** bởi bên đã có consensus. Không cần bầu cử Raft cho từng partition — vì quyết định của controller đã được ghi vào một log nhất quán mạnh, mọi broker sẽ thấy cùng một kết quả theo cùng một thứ tự.

### 8.6 Khi một broker chết: failover partition từng bước

```text
Producer broker-1controllerbroker-2 broker-3
acks=all  leader   active  follower follower
    │        │        │        │        │
┄ orders-0: leader 1 · ISR {1,2,3} · leader epoch 5 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
    │        │───────►│        │        │    BrokerHeartbeat mỗi 2 s
    │        ├─┐      │        │        │    crash / GC pause dài
    │        │◄┘      │        │        │    / mất mạng
    │        │───✘    │        │        │    heartbeat không tới
    │        │        ├─┐      │        │    quá broker.session.timeout.ms
    │        │        │◄┘      │        │    (9 s) → fence broker-1
    │        │        ├─┐      │        │    chọn replica kế tiếp trong
    │        │        │◄┘      │        │    Replicas còn trong ISR: b2
    │        │        │        │        │    ghi PartitionChangeRecord:
    │        │        │        │        │    leader 2 · ISR {2,3} · epoch 6
    │        │        │        │        │    (commit trong quorum)
    │        │        │◄───────│        │    Fetch metadata log
    │        │        │┄┄┄┄┄┄┄►│        │    nhận PartitionChangeRecord
    │        │        │        ├─┐      │    → leader orders-0, epoch 6
    │        │        │        │◄┘      │    bắt đầu nhận ghi
    │        │        │        │◄───────│    Fetch từ leader mới
    │───✘    │        │        │        │    Produce → timeout / lỗi
    │─────────────────────────►│        │    refresh metadata → leader mới
    │        │        │        │        │    retry (idempotent: không trùng)
    │◄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄│        │    OK
    │        │        │        │        │

Gián đoạn ≈ phát hiện lỗi (≤ 9 s) + áp dụng metadata (ms) + client refresh.
Controlled shutdown (SIGTERM): broker báo trước → controller dời leader TRƯỚC
khi broker tắt → client gần như không thấy gián đoạn.
```

Không có cuộc bầu cử nào ở cấp partition: controller *chỉ định* leader mới theo thứ tự danh sách Replicas, và quyết định đó có hiệu lực vì được commit trong metadata log mà mọi broker cùng đọc.

Thời gian gián đoạn ≈ **phát hiện lỗi** (tới `broker.session.timeout.ms` = 9s, heartbeat mỗi 2s) + **lan truyền metadata** (ms) + **client refresh metadata**.

**Controlled shutdown** thì khác hẳn: broker nhận SIGTERM sẽ báo controller *"tôi sắp tắt"* → controller **dời leader đi trước** → broker mới tắt → client gần như không thấy gián đoạn. Vì vậy: rolling restart luôn dùng SIGTERM và chờ broker tắt êm, **không `kill -9`**, và cấu hình `terminationGracePeriodSeconds` đủ dài nếu chạy trên Kubernetes.

### 8.7 Network partition: leader bị cô lập (zombie leader)

Tình huống: broker-1 (leader orders-0) **mất kết nối với controller và các follower**, nhưng một số producer vẫn nói chuyện được với nó.

```text
PHÍA BỊ CÔ LẬP (thiểu số)             ║  PHÍA ĐA SỐ
                                      ║
┌───────────────────────────────────┐ ║  ┌───────────────────────────────────┐
│   broker-1 VẪN TƯỞNG là leader    │ ║  │         active controller         │
│      epoch 5 · HW kẹt ở 1000      │─✘─ │  không thấy heartbeat → fence b1  │
│   không xin được AlterPartition   │ ║  │  → chọn broker-2, leader epoch 6  │
└───────────────────────────────────┘ ║  └────────┬──────────────────────────┘
        ▲                   ▲         ║           │
        │                   │         ║           ▼
┌───────┴───────┐   ┌───────┴───────┐ ║  ┌────────────────┐ ┌────────────────┐
│  producer X   │   │  producer Y   │ ║  │    broker-2    │ │    broker-3    │
│   acks=all    │   │    acks=1     │ ║  │ leader MỚI, e6 │◄│  fetch từ b2   │
└───────────────┘   └───────────────┘ ║  │    nhận ghi    │ │   ISR {2,3}    │
chờ ISR → timeout   ack ngay 1000–1003║  └────────────────┘ └────────────────┘
không có ack ✔      → về sau bị xóa ✘ ║           ▲
                                      ║           │
┌───────────────────────────────────┐ ║  ┌────────┴──────────────────────────┐
│   consumer Z: chỉ đọc ≤ HW 1000   │ ║  │            producer W             │
│   không thấy record sắp bị xóa    │ ║  │   refresh metadata → ghi vào b2   │
└───────────────────────────────────┘ ║  └───────────────────────────────────┘
                                      ║
          network partition: heartbeat, AlterPartition, fetch không qua được

┌─ KHI MẠNG LÀNH ────────────────────────────────────────────────────────────┐
│ broker-1 → broker-2: OffsetForLeaderEpoch(5)                               │
│ broker-2 → broker-1: “epoch 5 kết thúc ở offset 1000”                      │
│ broker-1 truncate 1000–1003 (dữ liệu của producer Y) → làm follower        │
│ producer X chưa từng nhận ack → không có gì bị mất                         │
└────────────────────────────────────────────────────────────────────────────┘
```

Chi tiết cứu Kafka ở đây: leader *không thể tự co ISR* mà phải xin controller. Bị cô lập, broker-1 không co ISR được nên HW không tiến, request `acks=all` chỉ có thể timeout — không bao giờ được ack sai. Với `acks=1`, record được ack rồi biến mất khi broker-1 quay về làm follower.

- Controller không nhận heartbeat → fence broker-1, bầu broker-2 làm leader với epoch 6.
- Broker-1 vẫn nghĩ mình là leader trong một khoảng ngắn. Điều gì xảy ra với producer X?
    - **`acks=all`**: follower không còn fetch từ broker-1, và broker-1 **không thể tự co ISR** (vì `AlterPartition` cần controller chấp thuận) → HW không tiến → request của X **timeout**, không có ack nào được trả → **không mất dữ liệu đã ack**. ✅
    - **`acks=1`**: broker-1 ack ngay sau khi ghi local → X tưởng thành công → khi mạng lành, broker-1 làm follower và **truncate theo leader epoch** → record **biến mất**. ❌
- Consumer đọc từ broker-1 lúc này chỉ thấy tới HW cũ → không bao giờ đọc phải dữ liệu chưa commit.

> **Note:** Bài học DS: chính chi tiết *"leader không được tự co ISR"* + `acks=all` + `min.insync.replicas ≥ 2` biến mỗi partition của Kafka thành một hệ **CP**: khi bị chia cắt, phía thiểu số **từ chối ghi** thay vì chấp nhận ghi rồi mâu thuẫn — đúng tinh thần của quorum trong CAP. Bỏ một trong ba thứ đó là bạn đang ngầm chọn **AP**.

---

## 9. Consumer và Consumer Group

### 9.1 Mô hình pull

Consumer **chủ động fetch** thay vì broker đẩy xuống:

- Consumer tự điều tiết tốc độ → **backpressure tự nhiên**, broker không cần biết consumer nhanh hay chậm.
- Fetch được batch lớn, dễ `seek` để replay.
- Cái giá: phải long-poll để không spin vô ích — `fetch.min.bytes` và `fetch.max.wait.ms` (500ms) điều khiển "chờ bao nhiêu dữ liệu, tối đa bao lâu".

### 9.2 Consumer group — chia partition cho consumer

Quy tắc:

1. Trong một group, **mỗi partition được gán cho tối đa một consumer**. Một consumer có thể nhận nhiều partition.
2. Số consumer > số partition → consumer thừa **ngồi chơi**.
3. Nhiều group đọc **độc lập** cùng một topic, mỗi group có offset riêng.

```text
┌─ TOPIC orders — 4 partition ───────────────────────────────────────────────┐
│ partition   P0          P1          P2          P3                         │
│ leader      broker-1    broker-2    broker-3    broker-1                   │
│ LEO         1500        1320        990         2010                       │
│ fetch từ leader của partition; mỗi group đọc độc lập                       │
└────────────────────────────────────────────────────────────────────────────┘

┌─ GROUP billing (2 consumer) ───────┐  ┌─ GROUP analytics (5 consumer) ─────┐
│ consumer-A ← P0, P1                │  │ c1 ← P0      c2 ← P1               │
│ consumer-B ← P2, P3                │  │ c3 ← P2      c4 ← P3               │
│                                    │  │ c5 ngồi không (thừa)               │
│                                    │  │                                    │
│ coordinator:                       │  │ coordinator:                       │
│ broker-2 · __consumer_offsets-17   │  │ broker-3 · __consumer_offsets-33   │
│                                    │  │                                    │
│ partition  committed  LEO    lag   │  │ partition  committed  LEO    lag   │
│ P0         1200       1500   300   │  │ P0         1500       1500   0     │
│ P1         1320       1320   0     │  │ P1         1100       1320   220   │
│ P2         900        990    90    │  │ P2         990        990    0     │
│ P3         2010       2010   0     │  │ P3         1800       2010   210   │
│                                    │  │                                    │
│ heartbeat · OffsetCommit → coord.  │  │ heartbeat · OffsetCommit → coord.  │
└────────────────────────────────────┘  └────────────────────────────────────┘

coordinator = leader của partition hash(group.id) % 50 của __consumer_offsets
consumer > partition → thừa người ngồi không; song song tối đa = số partition
```

Cùng một topic, hai group đọc độc lập với hai bộ offset riêng, mỗi bộ do một coordinator khác nhau giữ. Lag = LEO − offset đã commit, tính theo từng partition — lag dồn vào một partition thường là dấu hiệu hot partition hoặc poison pill.

> **Note:** Góc nhìn DS — trong một group, Kafka hành xử như **queue** (competing consumers); giữa các group, Kafka hành xử như **pub/sub**. Partition vừa là đơn vị **song song** vừa là đơn vị **thứ tự** — muốn 100 consumer xử lý song song thì cần ít nhất 100 partition.

### 9.3 Offset và commit

- Offset đã commit được lưu trong topic nội bộ **`__consumer_offsets`** (50 partition, compacted). Giá trị commit là **offset của record kế tiếp cần đọc**, không phải record vừa đọc.
- **Group coordinator** của một group là broker đang lead partition `abs(hash(group.id)) % 50` của `__consumer_offsets` → các group khác nhau được rải ra nhiều broker.
- `auto.offset.reset` (`earliest` / `latest` / `none`) **chỉ** áp dụng khi group **không có offset đã commit** (group mới, hoặc offset đã hết hạn — xem sự cố 14.3).
- `enable.auto.commit=true` (mặc định, mỗi 5s) commit trong lần `poll()` kế tiếp — tiện nhưng khó kiểm soát ngữ nghĩa.

Ngữ nghĩa giao nhận phụ thuộc **thứ tự giữa xử lý và commit**:

```
at-most-once  : poll → commit → process   crash sau commit   → MẤT message
at-least-once : poll → process → commit   crash trước commit → XỬ LÝ LẠI
exactly-once  : poll → process + commit offset trong cùng một transaction
                (Kafka → Kafka), hoặc at-least-once + xử lý idempotent ở
                đích (DB upsert, dedup key)
```

Thực tế đa số hệ thống chọn **at-least-once + consumer idempotent** — xem mục *Queue semantics: at-least-once là mặc định* trong [note hệ phân tán](/blog/distributed-system-note).

### 9.4 Rebalance

**Khi nào rebalance xảy ra:** consumer join/leave; consumer không heartbeat trong `session.timeout.ms` (45s); consumer không gọi `poll()` trong `max.poll.interval.ms` (5 phút); số partition của topic thay đổi; subscription dạng regex khớp thêm topic mới.

**Classic protocol** (JoinGroup/SyncGroup): coordinator chọn một consumer làm *group leader*, consumer đó chạy thuật toán gán (assignor) **phía client** rồi gửi kết quả qua coordinator. Có ba cải tiến dần dần:

| Cơ chế | Từ bản | Ý tưởng |
|---|---|---|
| **Eager** (mặc định cũ) | — | Mọi consumer **thu hồi toàn bộ** partition rồi chia lại → *stop-the-world* |
| **Cooperative incremental** (`CooperativeStickyAssignor`) | 2.4 | Chỉ thu hồi những partition **thật sự phải dời**, qua hai vòng rebalance nhỏ |
| **Static membership** (`group.instance.id`) | 2.3 | Consumer restart và quay lại trong `session.timeout.ms` → **không** rebalance. Rất hợp với StatefulSet trên k8s |
| **Consumer protocol mới** (KIP-848, `group.protocol=consumer`) | GA 4.0 | **Broker** tính assignment, mỗi consumer tự hội tụ dần qua heartbeat, **không còn barrier đồng bộ** cả group |

Ví dụ: group có A (P0, P1) và B (P2, P3); C gia nhập, đích đến là A: P0, P1 — B: P2 — C: P3.

| Partition | Eager | Cooperative |
|---|---|---|
| P0, P1 (A) | Dừng → gán lại cho chính A | **Chạy liên tục** |
| P2 (B) | Dừng → gán lại cho chính B | **Chạy liên tục** |
| P3 | B dừng → C nhận | B nhả → C nhận (chỉ P3 gián đoạn) |

```text
EAGER — thu hồi tất cả rồi chia lại
                          C vào                 xong
consumer-A  ═════ P0 P1 ══════░░░░░░░ dừng ░░░░░░░══════════ P0 P1 ═══════════
consumer-B  ═════ P2 P3 ══════░░░░░░░ dừng ░░░░░░░════════════ P2 ════════════
consumer-C                    ┄┄┄┄ Join/Sync ┄┄┄┄┄════════════ P3 ════════════

COOPERATIVE — chỉ thu hồi phần phải dời (2 vòng)
                          C vào                vòng 1       vòng 2
consumer-A  ═════════════════════ P0 P1 — chạy liên tục ══════════════════════
consumer-B  ═══════════════ P2 P3 ════════════════════ P2 — chạy liên tục ════
consumer-C                    ┄┄┄┄┄┄ vòng 1 ┄┄┄┄┄┄░░░ dừng ░░░══════ P3 ══════

═ đang xử lý   ░ partition dừng   ┄ đang rebalance (chưa có partition)
vòng 1: B nhả riêng P3 · vòng 2: C nhận P3 → chỉ P3 dừng một nhịp ngắn
static membership (group.instance.id): restart trong session.timeout.ms →
không rebalance · KIP-848: broker tính assignment, từng consumer hội tụ dần
```

Cùng một sự kiện (consumer-C gia nhập), hai giao thức cho mức gián đoạn rất khác nhau: với eager, mọi partition dừng trong suốt thời gian rebalance; với cooperative, chỉ partition thật sự đổi chủ dừng.

### 9.5 Assignor — chữ "round-robin" thứ hai

| Assignor | Cách chia | Ưu / nhược |
|---|---|---|
| `RangeAssignor` | Theo **từng topic**, chia đoạn liên tiếp | Giữ **co-partitioning** (P0 của hai topic về cùng consumer — cần cho join); dễ lệch khi nhiều topic |
| `RoundRobinAssignor` | Gộp mọi partition của mọi topic, chia vòng tròn | Đều nhất; không sticky → rebalance dời nhiều |
| `StickyAssignor` | Đều + giữ assignment cũ nhiều nhất có thể | Ít dời, nhưng vẫn eager |
| `CooperativeStickyAssignor` | Sticky + cooperative | **Nên dùng** với classic protocol |

Ví dụ 2 topic × 3 partition, 2 consumer:

```
Range      : C1 = t1-0, t1-1, t2-0, t2-1   C2 = t1-2, t2-2        4 vs 2: lệch
RoundRobin : C1 = t1-0, t1-2, t2-1         C2 = t1-1, t2-0, t2-2  3 vs 3: đều
```

Mặc định của classic protocol từ 3.0 là danh sách `[RangeAssignor, CooperativeStickyAssignor]` — tức là **vẫn dùng Range** cho tới khi bạn chủ động bỏ Range khỏi danh sách. Với protocol mới (KIP-848), assignor chạy phía server: `uniform` (mặc định) hoặc `range`.

### 9.6 "Ba chữ round-robin" trong Kafka

Ba cơ chế hoàn toàn khác nhau nhưng hay bị gọi chung là "Kafka chia round-robin":

| Ở đâu | Chia cái gì cho cái gì | Ai làm | Khi nào |
|---|---|---|---|
| **Producer partitioner** | Record/batch → partition (khi key = null) | Producer | Mỗi lần `send()`; nay là sticky (round-robin theo batch) |
| **Replica placement** | Leader/replica của partition → broker | Controller | Lúc tạo topic / thêm partition |
| **Consumer assignor** | Partition → consumer trong group | Group leader (classic) / coordinator (KIP-848) | Mỗi lần rebalance |

### 9.7 Lag, đọc từ follower, read_committed

- **Consumer lag** = log end offset − committed offset, tính theo từng partition. Đây là metric quan trọng nhất phía consumer: lag tăng đều = consumer không theo kịp; lag tăng ở **một** partition = hot partition hoặc poison pill. Công cụ: `kafka-consumer-groups.sh --describe --group ...`, Burrow, kafka-lag-exporter.
- **Fetch from follower** (KIP-392): khai báo `client.rack` ở consumer và `replica.selector.class=org.apache.kafka.common.replica.RackAwareReplicaSelector` ở broker → consumer đọc từ replica **cùng AZ** → giảm mạnh chi phí truyền dữ liệu liên AZ trên cloud. Đổi lại dữ liệu đến chậm hơn chút (follower phải chờ HW từ leader).
- **`isolation.level=read_committed`**: chỉ đọc tới **LSO** (Last Stable Offset), bỏ qua record của transaction đang mở hoặc đã abort (mục 10.6).

### 9.8 Share Groups (KIP-932) — Kafka như một queue thật

Consumer group cổ điển có hai giới hạn: độ song song **bị chặn bởi số partition**, và commit offset là **luỹ kế** nên một record xử lý lâu sẽ chặn cả partition (head-of-line blocking). **Share groups** cho phép **nhiều consumer cùng đọc một partition**, **ack từng record**, đếm số lần giao lại (delivery count) — tức là ngữ nghĩa của một queue truyền thống trên nền log Kafka. Tính năng ra mắt dạng early access ở 4.0 và đang hoàn thiện dần qua các bản 4.x; đổi lại, share group **không giữ thứ tự** trong partition.

---

## 10. Transactions trong producer và Exactly-once

### 10.1 Idempotent producer chưa đủ: ba bài toán còn lại

Idempotent producer (mục 3.5) chỉ chống **trùng do retry**, trong phạm vi **một phiên producer × một partition**. Còn ba bài toán nó không giải được:

1. **Ghi nguyên tử vào nhiều partition/topic.** Một lệnh chuyển tiền sinh ra `debit` vào `ledger-3` và `credit` vào `ledger-7`: hoặc cả hai cùng hiện ra, hoặc không cái nào.
2. **Gắn việc commit offset đầu vào với output (read-process-write).** Service đọc `orders`, ghi `invoices`, rồi commit offset của `orders`. Crash ở giữa:
    - Đã ghi `invoices` nhưng chưa commit offset → restart xử lý lại → **hóa đơn bị ghi hai lần**.
    - Đã commit offset nhưng chưa ghi `invoices` → **mất hóa đơn**.
3. **Zombie.** Instance A bị GC pause 60s, group coi A là chết và giao partition cho B. A tỉnh dậy, **vẫn tưởng mình đang giữ partition** và ghi tiếp → output bị nhân đôi. Cần một cách **fence** A, kể cả xuyên qua restart.

| | Idempotent producer | Transactional producer |
|---|---|---|
| Chống trùng do retry | ✅ | ✅ |
| Phạm vi | 1 phiên × 1 partition | Nhiều partition, nhiều topic, **xuyên restart** |
| Ghi nguyên tử nhiều partition | ❌ | ✅ |
| Commit offset đầu vào cùng output | ❌ | ✅ (`sendOffsetsToTransaction`) |
| Fence zombie | ❌ (restart = PID mới) | ✅ (`transactional.id` + epoch, consumer group generation) |
| Cấu hình | Mặc định bật | Phải đặt `transactional.id` và dùng API giao dịch |

### 10.2 Các thành phần

```text
┌─ PRODUCER ─────────────────────────────────────────────────────────────────┐
│ transactional.id = billing-0 · PID 42 · epoch 5                            │
│ đọc orders → ghi invoices-0 + audit-2 → commit offset orders, cùng một txn │
└────────┬───────────────────┬───────────────────┬───────────────────┬───────┘
         │ (1)(2)(5)         │ (3)               │ (3)               │ (4)
         ▼                   ▼                   ▼                   ▼
┌─ TXN COORD ────┐  ┌─ invoices-0 ───┐  ┌─ audit-2 ──────┐  ┌─ GROUP COORD ──┐
│broker-3        │  │leader broker-1 │  │leader broker-2 │  │broker-2        │
│__transaction_  │  │698  n          │  │410  n          │  │__consumer_     │
│  state-12      │  │699  n          │  │411  T          │  │  offsets-17    │
│billing-0:      │  │700  T          │  │412  T          │  │billing/        │
│ Ongoing        │  │701  T          │  │413  COMMIT     │  │ orders-0       │
│ PID 42 · e5    │  │702  T          │  │                │  │ → 1200         │
│ 3 partition    │  │703  COMMIT     │  │                │  │ (pending)      │
└────────┬───────┘  └────────┴───────┘  └────────┴───────┘  └────────┴───────┘
         │                   ▲                   ▲                   ▲
         └───────────────────┴───────────────────┴───────────────────┘
           (6) WriteTxnMarkers(COMMIT) → mọi partition tham gia, kể cả offset

(1) InitProducerId      lấy PID/epoch, fence instance cũ
(2) AddPartitionsToTxn  báo coordinator các partition sẽ ghi
(3) Produce             record T ghi THẲNG vào partition, chưa hiển thị
(4) TxnOffsetCommit     offset đầu vào ghi tạm (pending)
(5) EndTxn(COMMIT)      coordinator ghi PrepareCommit = điểm commit
(6) WriteTxnMarkers     COMMIT/ABORT marker → CompleteCommit
T = record trong txn · n = record thường · COMMIT = control record
consumer read_committed: LSO = 700 trước marker → 704 sau marker
```

Dữ liệu của giao dịch (T) nằm sẵn trong partition ngay từ bước (3); thứ duy nhất quyết định nó có "tồn tại" với consumer `read_committed` hay không là marker COMMIT/ABORT do coordinator ghi ở bước (6).

- **`transactional.id`** — tên do bạn đặt, **ổn định qua restart**. Coordinator ánh xạ nó sang (PID, epoch). Tại mỗi thời điểm, mỗi `transactional.id` chỉ có **một** producer hợp lệ — producer mới gọi `initTransactions()` sẽ tăng epoch và vô hiệu hóa producer cũ.
- **Transaction coordinator** — một broker bình thường, cụ thể là leader của partition `hash(transactional.id) % 50` trong topic nội bộ `__transaction_state`. Cơ chế này giống hệt cách chọn group coordinator (mục 9.3).
- **`__transaction_state`** — topic nội bộ (compacted, mặc định RF=3, minISR=2) lưu trạng thái từng giao dịch: PID, epoch, danh sách partition tham gia, trạng thái, thời điểm bắt đầu. Đây là **"nhật ký quyết định"** của coordinator.
- **Control record (marker)** — record đặc biệt COMMIT hoặc ABORT mà coordinator ghi vào **từng partition** tham gia giao dịch, kể cả partition của `__consumer_offsets`. Marker **chiếm một offset** như record thường.
- **`.txnindex`** — mỗi segment có thêm một file chỉ mục các giao dịch bị abort, để consumer `read_committed` lọc nhanh (mục 10.6).

### 10.3 Dùng API: vòng lặp consume–transform–produce

```java
// Producer: transactional.id phải ỔN ĐỊNH qua restart (ví dụ tên pod của StatefulSet)
Properties pp = new Properties();
pp.put("bootstrap.servers", BOOTSTRAP);
pp.put("transactional.id", "billing-" + System.getenv("POD_NAME"));
pp.put("transaction.timeout.ms", "60000");
// enable.idempotence=true và acks=all được bật tự động khi có transactional.id
KafkaProducer<String, String> producer = new KafkaProducer<>(pp, new StringSerializer(), new StringSerializer());

// Consumer: tự quản offset, chỉ đọc dữ liệu đã commit
Properties cp = new Properties();
cp.put("bootstrap.servers", BOOTSTRAP);
cp.put("group.id", "billing");
cp.put("enable.auto.commit", "false");
cp.put("isolation.level", "read_committed");
KafkaConsumer<String, String> consumer = new KafkaConsumer<>(cp, new StringDeserializer(), new StringDeserializer());
consumer.subscribe(List.of("orders"));

// Gọi MỘT lần khi khởi động: lấy PID/epoch, fence instance cũ,
// hoàn tất hoặc abort giao dịch dang dở của transactional.id này
producer.initTransactions();

while (running) {
    ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(500));
    if (records.isEmpty()) continue;

    producer.beginTransaction();                       // chỉ đổi trạng thái local, chưa có RPC
    try {
        Map<TopicPartition, OffsetAndMetadata> next = new HashMap<>();
        for (ConsumerRecord<String, String> r : records) {
            producer.send(new ProducerRecord<>("invoices", r.key(), bill(r.value())));
            producer.send(new ProducerRecord<>("audit", r.key(), audit(r.value())));
            next.put(new TopicPartition(r.topic(), r.partition()), new OffsetAndMetadata(r.offset() + 1));
        }
        // offset đầu vào đi CHUNG giao dịch với output
        producer.sendOffsetsToTransaction(next, consumer.groupMetadata());
        producer.commitTransaction();                  // flush mọi send còn treo rồi mới EndTxn
    } catch (ProducerFencedException | OutOfOrderSequenceException | AuthorizationException e) {
        // Lỗi không phục hồi được: đã có instance mới cùng transactional.id → dừng hẳn
        producer.close();
        throw e;
    } catch (KafkaException e) {
        producer.abortTransaction();
        // BẮT BUỘC: tua consumer về offset đã commit, nếu không batch vừa rồi bị bỏ sót
        rewindToCommitted(consumer);
    }
}

static void rewindToCommitted(KafkaConsumer<?, ?> consumer) {
    Map<TopicPartition, OffsetAndMetadata> committed = consumer.committed(consumer.assignment());
    for (TopicPartition tp : consumer.assignment()) {
        OffsetAndMetadata om = committed.get(tp);
        if (om != null) consumer.seek(tp, om);
        else consumer.seekToBeginning(List.of(tp));  // chưa commit lần nào: tùy auto.offset.reset của bạn
    }
}
```

Ba điểm hay sai trong đoạn code trên:

- **Không gọi `consumer.commitSync()`** — offset phải đi qua `sendOffsetsToTransaction`, nếu không nó nằm ngoài giao dịch.
- **Abort xong phải tua consumer.** `poll()` đã đẩy vị trí đọc vượt qua batch vừa xử lý; abort chỉ hủy output, **không** trả lại vị trí đọc.
- **Phân biệt lỗi chết với lỗi abort được.** Bị fence thì phải tắt hẳn; lỗi tạm thời thì abort rồi thử lại.

### 10.4 Giao thức từng bước và "điểm không thể quay lại"

```text
 Producer  TxnCoord invoices  audit-2 GroupCrd
 billing-0 broker-3 broker-1 broker-2 broker-2
     │         │        │        │        │
┄ (1) KHỞI TẠO — initTransactions(), một lần ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
     │────────►│        │        │        │    FindCoordinator, InitProducerId
     │         ├─┐      │        │        │    abort/hoàn tất txn dở dang
     │         │◄┘      │        │        │    epoch 4→5 (fence instance cũ)
     │◄┄┄┄┄┄┄┄┄│        │        │        │    PID 42 · epoch 5
┄ (2) GHI DỮ LIỆU — beginTransaction() chỉ đổi trạng thái local ┄┄┄┄┄┄┄┄┄┄┄┄┄┄
     │────────►│        │        │        │    AddPartitionsToTxn(
     │         │        │        │        │      invoices-0, audit-2)
     │         ├─┐      │        │        │    ghi Ongoing + các partition
     │         │◄┘      │        │        │    đồng hồ transaction.timeout.ms
     │─────────────────►│        │        │    Produce(PID 42, epoch 5, seq)
     │──────────────────────────►│        │    Produce (cờ transactional)
     │         │        ├─┐      │        │    700–702 đã nằm trong log
     │         │        │◄┘      │        │    LSO kẹt ở 700
┄ (3) GẮN OFFSET ĐẦU VÀO — sendOffsetsToTransaction() ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
     │────────►│        │        │        │    AddOffsetsToTxn(group billing)
     │───────────────────────────────────►│    TxnOffsetCommit(orders-0→1200,
     │         │        │        │        │      generation 8)
┄ (4) COMMIT — commitTransaction() ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
     │────────►│        │        │        │    EndTxn(COMMIT)
     │         ├─┐      │        │        │    ghi PrepareCommit ◆
     │         │◄┘      │        │        │    = ĐIỂM KHÔNG THỂ QUAY LẠI
     │◄┄┄┄┄┄┄┄┄│        │        │        │    OK → commitTransaction() trả về
     │         │───────►│        │        │    WriteTxnMarkers(COMMIT)
     │         │────────────────►│        │    WriteTxnMarkers(COMMIT)
     │         │─────────────────────────►│    → offset 1200 có hiệu lực
     │         │        ├─┐      │        │    marker COMMIT ở offset 703
     │         │        │◄┘      │        │    LSO → 704: thấy 700–702
     │         ├─┐      │        │        │    ghi CompleteCommit
     │         │◄┘      │        │        │
     │         │        │        │        │

Coordinator chết sau ◆ → leader mới của __transaction_state đọc lại log,
thấy PrepareCommit và ghi nốt marker. Chết trước ◆ → giao dịch bị abort:
marker ABORT, record 700–702 bị consumer read_committed bỏ qua.
```

Dữ liệu (bước 2) và offset (bước 3) được ghi bền *trước* khi có quyết định. Quyết định commit chỉ là một lần append `PrepareCommit`; marker được ghi sau, bất đồng bộ — nên các partition "thấy" giao dịch vào những thời điểm hơi lệch nhau.

- **Dữ liệu được ghi trước, quyết định đến sau.** Record của giao dịch được append thật vào partition ngay ở bước ②, được replicate như mọi record khác (`acks=all`), chỉ là **chưa được hiển thị** với consumer `read_committed`.
- **Điểm commit là một lần append duy nhất**: record `PrepareCommit` được ghi bền vào `__transaction_state`. Trước thời điểm đó, giao dịch vẫn có thể bị abort; sau thời điểm đó, nó **chắc chắn sẽ commit**. Coordinator chết ngay sau đó → leader mới của partition `__transaction_state` đọc lại log, thấy `PrepareCommit`, và **ghi tiếp marker** cho đủ.
- **Marker được ghi bất đồng bộ** sau khi `commitTransaction()` đã trả về. Vì vậy giữa các partition, thời điểm "giao dịch hiện ra" có thể lệch nhau một chút (mục 10.6).
- Kafka 3.6+ và 4.x (KIP-890) gia cố giao thức này: partition leader **kiểm tra với coordinator** rằng partition thực sự thuộc một giao dịch đang mở trước khi nhận ghi, và epoch được tăng sau **mỗi** giao dịch. Mục đích là chặn các lỗi kiểu "hanging transaction" (10.9).

### 10.5 Máy trạng thái của một giao dịch (phía coordinator)

```text
                   EndTxn(COMMIT) ┌────────────────┐marker┌──────────────────┐
                      ┌──────────►│PrepareCommit ◆ │─────►│  CompleteCommit  │
                      │           │  điểm commit   │      │ đã ghi đủ marker │
                      │           └────────────────┘      └────────┬─────────┘
                      │                 giao dịch kế tiếp          │
                      │      ┌─────────────────────────────────────┘
                      │      ▼
┌────────────┐    ┌───┴──────────┐
│   Empty    │    │   Ongoing    │
│chưa có txn │───►│thêm partition│
└────────────┘    └───┬──────────┘
partition đầu tiên    │      ▲
                      │      └─────────────────────────────────────┐
                      │                 giao dịch kế tiếp          │
                      │           ┌────────────────┐marker┌────────┴─────────┐
                      └──────────►│  PrepareAbort  │─────►│  CompleteAbort   │
                                  │quyết định abort│      │ đã ghi đủ marker │
                                  └────────────────┘      └──────────────────┘

Ongoing → PrepareAbort khi: EndTxn(ABORT) · quá transaction.timeout.ms ·
bị fence (InitProducerId mới cùng transactional.id)
mỗi mũi tên = một bản ghi trạng thái vào __transaction_state (RF=3, minISR=2)
```

Mọi chuyển trạng thái đều được ghi vào `__transaction_state` trước khi có hiệu lực — đó là "nhật ký quyết định" giúp coordinator mới tiếp tục đúng chỗ. Từ `PrepareCommit` chỉ có một lối ra: `CompleteCommit`.

- Đồng hồ `transaction.timeout.ms` bắt đầu chạy từ partition **đầu tiên** được thêm vào giao dịch. Quá hạn → coordinator **chủ động abort** và tăng epoch; producer cố commit sau đó sẽ nhận `InvalidProducerEpochException` hoặc `ProducerFencedException` (tùy phiên bản client).
- Giới hạn trên phía broker: `transaction.max.timeout.ms` (mặc định 15 phút). Producer xin timeout lớn hơn sẽ bị từ chối ngay ở `initTransactions()`.
- `transactional.id` không hoạt động quá `transactional.id.expiration.ms` (7 ngày) sẽ bị coordinator quên.

### 10.6 Phía consumer: `read_committed`, LSO và marker

**LSO — Last Stable Offset** = offset nhỏ nhất của giao dịch **còn đang mở** trên partition (không có giao dịch mở thì LSO = HW). Consumer `read_committed` chỉ đọc được **dưới LSO**, và nhận kèm danh sách giao dịch đã abort để tự lọc.

Ví dụ một partition có hai giao dịch xen kẽ: T1 commit, T2 abort, cộng một record không thuộc giao dịch nào (`n`):

```text
offset      100     101     102     103     104     105     106     107
record      T1      T2      T1      n       T2      C·T1    T2      A·T2
────────────────────────────────────────────────────────────────────────────
trước 105  ▲ LSO=100  T1, T2 đều mở → không đọc được gì, kể cả 103
sau 105     ═══════▲ LSO=101  T1 commit, T2 còn mở → kẹt ở 101
sau 107     ═══════════ LSO = 108: đọc được tất cả đã ổn định ═════════════▲
────────────────────────────────────────────────────────────────────────────
read_
committed   100             102     103
            bỏ 101, 104, 106 (T2 abort) và 2 marker
read_
uncommitted 100     101     102     103     104             106
            đọc CẢ dữ liệu đã abort (101, 104, 106)!

═ vùng read_committed được đọc (dưới LSO) · T1, T2 = record trong giao dịch
n = record thường · C·T1 = marker COMMIT của T1 · A·T2 = marker ABORT của T2
```

Giao dịch còn mở chặn LSO, nên chặn cả record `n` ở offset 103 dù nó không thuộc giao dịch nào — đó là head-of-line blocking của `read_committed`. Marker chiếm offset (105, 107) nên offset không liên tục.

Những hệ quả thực tế:

- **Giao dịch mở lâu chặn cả partition** với consumer `read_committed`, kể cả các record **không** thuộc giao dịch nào (record 103 ở trên). Đây là head-of-line blocking do LSO. Theo dõi metric `LastStableOffsetLag` của partition.
- **Offset không liên tục**: marker chiếm offset. Đừng giả định "offset + 1 là record kế tiếp", và đừng hoảng khi lag hiển thị **kẹt ở 1**: đó thường là marker nằm sau record cuối cùng.
- **`isolation.level` mặc định là `read_uncommitted`.** Nếu downstream quên đổi sang `read_committed` thì nó vẫn đọc cả dữ liệu đã bị abort, và mọi công sức làm giao dịch phía producer coi như bỏ.
- **Nguyên tử về khả năng hiển thị, không phải snapshot đồng thời.** Marker được ghi vào từng partition vào những thời điểm khác nhau, nên một consumer đọc `ledger-3` có thể thấy `debit` của T trước khi consumer đọc `ledger-7` thấy `credit`. Cuối cùng cả hai đều thấy, và **không ai thấy "một nửa" vĩnh viễn**. Nhưng Kafka **không** cho một snapshot nhất quán xuyên partition tại một thời điểm.

### 10.7 Fencing zombie: `transactional.id` và consumer group generation

```text
(1) CÙNG transactional.id — pod restart

  A (cũ)       TxnCoord       B (mới)
  epoch 5
     │             │             │
     ├─┐           │             │    GC pause 60 s
     │◄┘           │             │    giao dịch đang mở
     │             │◄────────────│    InitProducerId(billing-0)
     │             ├─┐           │    abort txn của epoch 5
     │             │◄┘           │    epoch → 6
     │             │┄┄┄┄┄┄┄┄┄┄┄┄►│    PID 42 · epoch 6
     │────────────►│             │    A tỉnh dậy: EndTxn (epoch 5)
     │◄┄ fenced ┄┄┄│             │    ProducerFencedException
     ├─┐           │             │    A phải tắt hẳn
     │◄┘           │             │    output của A không bao giờ hiện ra
     │             │             │

(2) INSTANCE KHÁC NHẬN PARTITION — EOS v2 (KIP-447)

     A         GroupCrd          B
   gen 8                       gen 9
     │             │             │
     ├─┐           │             │    GC pause > session.timeout.ms
     │◄┘           │             │
     │             ├─┐           │    rebalance: generation 8 → 9
     │             │◄┘           │    orders-0 chuyển sang B
     │             │◄────────────│    TxnOffsetCommit (gen 9) ✔
     │────────────►│             │    A tỉnh dậy: TxnOffsetCommit (gen 8)
     │◄┄┄┄ lỗi ┄┄┄┄│             │    lỗi generation → CommitFailed
     ├─┐           │             │    không commit được offset
     │◄┘           │             │    → phải abort giao dịch
     │             │             │
```

Lớp (1) là fencing token kinh điển: ai cầm epoch cũ thì bị từ chối. Lớp (2) (KIP-447) cho phép mỗi instance dùng một `transactional.id` riêng mà vẫn chặn được zombie, vì offset đầu vào chỉ commit được khi generation của consumer group còn đúng.

Có hai lớp fencing:

- **Theo `transactional.id` + epoch** như sơ đồ trên — giống hệt **fencing token** trong bài Distributed Lock của [note hệ phân tán](/blog/distributed-system-note): ai cầm epoch cũ thì mọi thao tác ghi đều bị từ chối.
- **Theo generation của consumer group** (KIP-447, từ 2.5): `sendOffsetsToTransaction(offsets, consumer.groupMetadata())` gửi kèm generation và member id. Instance đã bị rebalance loại ra thì cầm generation cũ → `TxnOffsetCommit` bị từ chối → giao dịch không commit được.

Cách chọn `transactional.id` thay đổi theo hai thế hệ:

| | EOS v1 (trước 2.5) | EOS v2 (KIP-447, 2.5+) |
|---|---|---|
| Fence zombie dựa vào | Chỉ `transactional.id` | `transactional.id` **và** consumer group generation |
| Số producer | **Một producer cho mỗi partition đầu vào** (`app-orders-0`, `app-orders-1`…) | **Một producer cho mỗi instance** |
| Chi phí | Nhiều producer, nhiều kết nối, khó scale | Gọn hơn nhiều |
| Kafka Streams | `exactly_once` (đã bỏ) | `exactly_once_v2` |

> **Warning:** `transactional.id` **phải ổn định** qua restart: dùng tên pod của StatefulSet, không dùng UUID ngẫu nhiên. Với id ngẫu nhiên, instance mới không fence được instance cũ, và giao dịch đang mở của instance vừa chết sẽ **treo tới hết `transaction.timeout.ms`**. Suốt thời gian đó LSO của các partition liên quan bị kẹt, consumer `read_committed` đứng im.

### 10.8 Chi phí: kích thước giao dịch, latency và throughput

Mỗi giao dịch tốn một lượng việc **cố định**: vài RPC tới coordinator, hai lần ghi vào `__transaction_state`, và **một marker cho mỗi partition** tham gia. Nên:

- **Giao dịch quá nhỏ** (mỗi record một giao dịch): chi phí cố định áp đảo → throughput giảm mạnh, log đầy marker.
- **Giao dịch quá lớn hoặc quá lâu**: consumer `read_committed` phải chờ tới khi commit mới thấy dữ liệu → **latency end-to-end tăng**, LSO bị kẹt lâu hơn, và rủi ro chạm `transaction.timeout.ms`.
- Điểm cân bằng thường là commit **theo thời gian** (vài chục tới vài trăm ms) hoặc theo số record. Kafka Streams với `exactly_once_v2` mặc định commit mỗi **100 ms** (`commit.interval.ms`). Ở mức đó, overhead so với at-least-once thường chỉ vài phần trăm.

### 10.9 Những bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Consumer downstream để `read_uncommitted` (mặc định) | Đọc cả dữ liệu đã abort | Đặt `isolation.level=read_committed` ở **mọi** consumer phía sau |
| Abort xong không tua consumer | Bỏ sót nguyên batch | `seek` về offset đã commit sau mỗi lần abort |
| `transactional.id` ngẫu nhiên | Không fence được zombie, giao dịch treo chặn LSO | Id ổn định theo instance |
| Xử lý một batch lâu hơn `transaction.timeout.ms` | Coordinator abort, commit báo lỗi epoch | Batch nhỏ hơn hoặc timeout lớn hơn (≤ `transaction.max.timeout.ms`) |
| **Hanging transaction** (producer chết với giao dịch mở, hoặc lỗi giao thức ở bản cũ) | LSO kẹt lâu, consumer `read_committed` đứng, lag tăng | `kafka-transactions.sh find-hanging` / `abort` (KIP-664); nâng lên bản có KIP-890 |
| Dùng `consumer.commitSync()` song song với giao dịch | Offset nằm ngoài giao dịch → mất tính nguyên tử | Chỉ commit qua `sendOffsetsToTransaction` |
| Tưởng giao dịch bao luôn side effect bên ngoài (DB, HTTP) | Side effect chạy lại khi giao dịch abort và retry | Xem 10.10 |

### 10.10 Exactly-once ra ngoài biên Kafka

Giao dịch Kafka chỉ bao **những gì nằm trong Kafka**: record vào topic và offset trong `__consumer_offsets`. Gọi HTTP, ghi Postgres, gửi email… **không** nằm trong giao dịch. Kafka cũng **không** tham gia XA/2PC với database bên ngoài. Ba pattern thay thế:

| Hướng | Pattern | Ý tưởng |
|---|---|---|
| Kafka → DB | **Transactional sink** | Ghi kết quả **và offset** (topic, partition, offset) vào DB trong **cùng một giao dịch DB**. Khởi động thì đọc offset từ DB rồi `seek` — DB là nguồn sự thật cho vị trí đọc. Nhiều sink connector của Kafka Connect làm đúng kiểu này. |
| Kafka → DB / API | **Idempotent consumer** | Lấy `(topic, partition, offset)` hoặc event id làm **khóa idempotency** (unique constraint, upsert). Chấp nhận at-least-once, khử trùng ở đích. |
| DB → Kafka | **Outbox / CDC** | Ghi sự kiện vào bảng outbox cùng giao dịch nghiệp vụ, Debezium đọc WAL rồi đẩy lên Kafka. Từ 3.3, source connector hỗ trợ exactly-once (KIP-618). |

Ví dụ hoàn chỉnh cho hướng Kafka → HTTP có trong bài [Distributed webhook task scheduler](/blog/distributed-webhook-task-scheduler); outbox/CDC có trong [Database: Ghi chú cơ bản](/blog/database).

### 10.11 Góc nhìn DS: Kafka transaction là gì, không phải là gì

> **Note:** Về bản chất, đây là **atomic commit** theo đúng công thức của database: dữ liệu được ghi trước ở dạng "tạm" (các record trong partition), còn **quyết định commit là một record duy nhất** được append vào một log có replicate (`__transaction_state`). Đó chính là vai trò của *commit record* trong WAL, hay của một entry đã commit trong log Raft. Khác với 2PC cổ điển, participant (các partition) **không cần bỏ phiếu prepare**: "phiếu" chính là các ack `acks=all` mà producer đã gom đủ trước khi gọi commit. Điểm yếu kinh điển của 2PC — coordinator chết thì participant treo — được giải bằng cách cho coordinator mới **đọc lại log quyết định** và đi tiếp. Zombie bị chặn bằng **epoch**, tức là fencing token.

Đối chiếu với ACID:

| Thuộc tính | Kafka transaction cho gì |
|---|---|
| **Atomicity** | ✅ Tất cả record và offset trong giao dịch cùng hiện ra, hoặc cùng bị bỏ |
| **Consistency** | Do ứng dụng tự đảm bảo — Kafka không có ràng buộc dữ liệu |
| **Isolation** | Chỉ ở mức **read committed** (với consumer `read_committed`): không đọc dữ liệu chưa commit hoặc đã abort. **Không** có snapshot xuyên partition, không có đọc-trong-giao-dịch, không có serializable |
| **Durability** | Như mọi record khác: `acks=all` + replication (mục 7) |

---

## 11. Thứ tự (ordering): đảm bảo gì, không đảm bảo gì

**Đảm bảo:**

- Trong **một partition**, thứ tự ghi = thứ tự đọc.
- Với idempotent producer (mặc định), thứ tự trong partition vẫn giữ khi có retry và tới 5 request song song.

**Không đảm bảo:**

- Giữa các partition khác nhau.
- Giữa **nhiều producer** cùng ghi một partition — thứ tự là thứ tự request **đến leader**, không phải thứ tự sự kiện xảy ra ở nguồn.
- Khi **tăng số partition** (key bị ánh xạ lại).
- Khi consumer tự xử lý **đa luồng** bên trong (một partition, nhiều thread).
- Khi đẩy record lỗi sang **retry topic / DLQ** rồi xử lý sau — record sau đó cùng key có thể được xử lý trước.

**Pattern hay dùng:**

- Chọn **key = định danh thực thể** cần thứ tự: `accountId`, `orderId`, `walletId`. Thứ tự toàn cục hiếm khi cần; thứ tự **theo thực thể** thì gần như luôn cần.
- Consumer muốn song song hơn số partition: chia việc **theo key** trong tiến trình (key-ordered worker pool — ví dụ thư viện Confluent Parallel Consumer).
- Domain cần thứ tự tuyệt đối (ledger, số dư): khi gặp lỗi tạm thời ở một key, **dừng key đó** (hoặc dừng cả partition) và retry tại chỗ, đừng đẩy ra retry topic.

---

## 12. HA và thiết kế triển khai

### 12.1 Topology chuẩn: 3 AZ

```text
┌─ AZ-a ────────────────┐ ┌─ AZ-b ────────────────┐ ┌─ AZ-c ────────────────┐
│ controller-1  ACTIVE  │◄│ controller-2  voter   │◄│ controller-3  voter   │
│                       │ │                       │ │                       │
│ broker-1  (rack az-a) │ │ broker-2  (rack az-b) │ │ broker-3  (rack az-c) │
│ orders-0 ● LEADER     │ │ orders-0 ○ follower   │ │ orders-0 ○ follower   │
│                       │ │                       │ │                       │
│ producer (ở az-a)     │ │                       │ │ consumer              │
│ → ghi vào leader      │ │                       │ │ client.rack=az-c      │
│   cùng AZ             │ │                       │ │ → fetch broker-3      │
│                       │ │                       │ │                       │
└───────────┬───────────┘ └───────────┴───────────┘ └───────────┴───────────┘
            │                         ▲                         ▲
            └─────────────────────────┴─────────────────────────┘
  replication liên AZ: follower ở az-b, az-c kéo từ leader → phí mạng ×2
  controller-1 ◄ Raft ► controller-2, -3 · quorum 3 → chịu mất 1 AZ
  RF=3 · min.insync.replicas=2 · acks=all · rack-aware placement

┌────────────────────────────────────┐  ┌────────────────────────────────────┐
│              MẤT AZ-c              │  │              MẤT 2 AZ              │
│  quorum còn 2/3 → vẫn bầu được ✔   │  │   quorum còn 1/3 → mất quorum ✘    │
│   ISR {1,2} = 2 ≥ minISR → ghi ✔   │  │  ISR = 1 < minISR → từ chối ghi ✘  │
│ consumer az-c đọc leader (liên AZ) │  │  đọc dữ liệu đã commit: vẫn được   │
│     latency tăng lúc failover      │  │   → chọn C: từ chối thay vì mất    │
└────────────────────────────────────┘  └────────────────────────────────────┘
```

Mỗi AZ là một fault domain: một controller, một phần ba số broker và replica (hình chỉ vẽ một partition). Bố trí này chịu được mất trọn một AZ ở cả control plane (2/3 voter) lẫn data plane (2 replica ≥ minISR). Đánh đổi là phí mạng liên AZ cho replication — giảm bớt phía consumer bằng fetch-from-follower.

- **3 controller** riêng biệt, mỗi AZ một node (quorum chịu mất 1 AZ).
- **Broker chia đều theo AZ**, khai báo `broker.rack`; topic **RF=3, `min.insync.replicas=2`** → mỗi partition có một replica ở mỗi AZ.
- Controller tách khỏi broker ở production: tải metadata không tranh tài nguyên với tải dữ liệu, và restart broker không làm rung quorum.

### 12.2 Ma trận sự cố

| Sự cố | Controller quorum (3) | Partition (RF=3, minISR=2) | Client thấy gì |
|---|---|---|---|
| 1 broker chết | Không ảnh hưởng | Leader dời trong vài giây, ISR còn 2 | Retry ngắn, **không mất dữ liệu** |
| Active controller chết | Bầu lại trong ~1–2s | Không ảnh hưởng data plane | Gần như không thấy |
| Mất 1 AZ | Còn 2/3 → **vẫn có quorum** | Mỗi partition còn 2 replica → **vẫn ghi được** | Latency tăng vọt lúc failover rồi ổn định |
| Mất 2 AZ | Còn 1/3 → **mất quorum** | ISR = 1 < 2 → **từ chối ghi** | Ghi lỗi, đọc dữ liệu đã commit vẫn được |
| Mất controller quorum (broker vẫn sống) | ✗ | Broker tiếp tục phục vụ với metadata hiện có, nhưng **không thể failover, không tạo topic** | Bình thường… cho tới khi có thêm một broker chết |

> **Warning:** **Hai AZ là cấu hình xấu cho quorum.** Đặt 3 controller trên 2 AZ (2 + 1) thì mất đúng AZ có 2 controller là mất quorum. Quorum cần **≥ 3 fault domain**. Nếu chỉ có 2 datacenter, cần đặt một controller "trọng tài" ở địa điểm thứ ba.

### 12.3 Đa region

| Cách | Cơ chế | RPO | Đánh đổi |
|---|---|---|---|
| **Stretch cluster** | Một cluster trải nhiều region, replicate đồng bộ | 0 | Mỗi `acks=all` chịu latency liên region; cần ≥ 3 region cho controller |
| **MirrorMaker 2** (async) | Cluster riêng mỗi region, copy topic bất đồng bộ, có dịch offset cho consumer group | > 0 (mất phần chưa kịp copy) | Đơn giản, latency ghi thấp; failover phải xử lý offset và trùng lặp |

Đây chính là PACELC: khi không có sự cố (*Else*), bạn vẫn phải chọn giữa **Latency** (async, ghi nhanh) và **Consistency** (sync, không mất gì khi mất region).

### 12.4 Kafka trên Kubernetes

Kafka là workload **stateful** điển hình: chạy bằng **StatefulSet** (định danh ổn định `kafka-0`, `kafka-1`…, mỗi pod một PVC), **pod anti-affinity / topology spread** theo zone, **PodDisruptionBudget** `maxUnavailable: 1` để không drain hai broker cùng lúc, `terminationGracePeriodSeconds` đủ dài cho controlled shutdown. Thực tế ít ai tự viết YAML mà dùng operator như **Strimzi**. Chi tiết các khái niệm này có trong [Kubernetes cho Backend Dev](/blog/kubernetes-for-backend-devops).

---

## 14. Thực tế gặp phải: những sự cố kinh điển

### 14.1 Rebalance storm — consumer bị đá ra liên tục

- **Triệu chứng:** log đầy `Member ... leaving group`, `CommitFailedException`, lag tăng, cùng một batch bị xử lý đi xử lý lại.
- **Nguyên nhân:** thời gian xử lý một lần `poll()` (ví dụ 500 record × 1s gọi API) vượt `max.poll.interval.ms` (5 phút) → consumer bị coi là chết → rebalance → partition chuyển sang consumer khác, cũng chậm như vậy → vòng lặp.
- **Xử lý:** giảm `max.poll.records`; tăng `max.poll.interval.ms` cho phù hợp thực tế; tách việc nặng ra worker thread và dùng `pause()`/`resume()` partition; dùng `CooperativeStickyAssignor` + **static membership**; lên Kafka 4.x thì cân nhắc `group.protocol=consumer`.

### 14.2 Mất dữ liệu dù đã dùng `acks=all`

- **Nguyên nhân thường gặp:** `min.insync.replicas=1` (mặc định) → ISR co còn leader thì `acks=all` ≈ `acks=1`. Hoặc topic được **tự động tạo** do gõ sai tên (`auto.create.topics.enable=true`) với `default.replication.factor=1` → chỉ có một bản sao.
- **Xử lý:** đặt mặc định ở broker: `default.replication.factor=3`, `min.insync.replicas=2`, `auto.create.topics.enable=false`. Quản lý topic bằng IaC (Terraform/Strimzi `KafkaTopic`), không để ứng dụng tự tạo.

### 14.3 Consumer group "quên" offset sau kỳ nghỉ dài

- **Triệu chứng:** sau Tết, job batch chạy lại và… bỏ qua toàn bộ dữ liệu tồn đọng (hoặc xử lý lại từ đầu topic).
- **Nguyên nhân:** group không có consumer nào hoạt động lâu hơn `offsets.retention.minutes` (7 ngày) → offset đã commit bị xóa → lần sau khởi động áp dụng `auto.offset.reset`: `latest` → **lặng lẽ bỏ qua dữ liệu**; `earliest` → xử lý lại toàn bộ.
- **Xử lý:** tăng `offsets.retention.minutes` nếu có group chạy thưa; với luồng quan trọng dùng `auto.offset.reset=none` để **lỗi to** thay vì im lặng; giám sát danh sách group và offset của chúng.

### 14.4 Tăng partition làm vỡ thứ tự theo key

- **Triệu chứng:** sau khi tăng partition từ 12 lên 24, sự kiện `OrderCancelled` được xử lý trước `OrderCreated` của cùng đơn hàng.
- **Nguyên nhân:** `hash(key) % 24 ≠ hash(key) % 12` → key mới đi sang partition mới, trong khi sự kiện cũ của nó vẫn nằm ở partition cũ chưa được tiêu thụ hết.
- **Xử lý:** chọn số partition dư ngay từ đầu (mục 15). Nếu bắt buộc mở rộng: tạo topic mới với số partition lớn hơn, dừng ghi vào topic cũ, cho consumer đọc hết topic cũ rồi mới chuyển sang topic mới.

### 14.5 Hot partition

- **Triệu chứng:** lag chỉ tăng ở **một** partition; một broker CPU/network cao bất thường trong khi các broker khác nhàn.
- **Nguyên nhân:** key lệch — một merchant lớn chiếm 40% traffic, mọi sự kiện của nó cùng key → cùng partition → cùng một consumer.
- **Xử lý:** nếu không cần thứ tự tuyệt đối theo key đó: **salting** (`merchantId#bucket`, bucket = hash(orderId) % 8); tách tenant lớn sang topic riêng; giám sát phân bố bytes theo partition.

### 14.6 Thêm broker mà tải không giảm, hoặc một broker đầy disk

- **Nguyên nhân:** như mục 5.6 — Kafka không tự di chuyển partition khi topology thay đổi, và phân bổ chỉ cân theo *số lượng* chứ không theo *dung lượng*.
- **Xử lý:** `kafka-reassign-partitions.sh` với `--throttle` (copy dữ liệu thật qua mạng), làm vào giờ thấp điểm; dùng Cruise Control để tự động hóa; cảnh báo disk theo từng broker (không chỉ trung bình cluster); cân nhắc tiered storage.

### 14.7 Poison pill — một record làm đứng cả partition

- **Triệu chứng:** consumer crash-loop tại **cùng một offset**; lag của một partition tăng mãi.
- **Nguyên nhân:** một record không deserialize được (producer đổi schema, dữ liệu rác) hoặc làm logic xử lý luôn ném lỗi. Vì commit là luỹ kế, consumer không thể "bỏ qua tạm" record đó → **head-of-line blocking**.
- **Xử lý:** bọc deserializer (ví dụ `ErrorHandlingDeserializer` của Spring Kafka); đẩy record lỗi sang **DLQ topic** kèm header mô tả lỗi rồi commit tiếp; dùng **Schema Registry** với luật tương thích (BACKWARD/FULL) để chặn từ phía producer.

### 14.8 Duplicate phía consumer khi rebalance

- **Nguyên nhân:** consumer xử lý xong nhưng chưa kịp commit thì partition bị thu hồi → consumer mới xử lý lại từ offset đã commit cũ.
- **Xử lý:** commit đồng bộ trong `onPartitionsRevoked`; quan trọng hơn: **consumer phải idempotent** (unique constraint, upsert, bảng dedup theo event id). Đừng thiết kế hệ thống giả định "Kafka giao đúng một lần".

### 14.9 ISR co giãn liên tục (flapping)

- **Triệu chứng:** `IsrShrinksPerSec` / `IsrExpandsPerSec` dao động, latency `acks=all` p99 có gai, `UnderReplicatedPartitions` lúc có lúc không.
- **Nguyên nhân:** follower thỉnh thoảng không fetch kịp trong 30s: GC pause dài, disk chậm (cloud volume hết burst credit), mạng nghẽn, hoặc broker quá nhiều partition để replicate.
- **Xử lý:** heap JVM vừa phải (khoảng 6–8 GB, phần RAM còn lại để dành cho page cache), dùng G1/ZGC; tách disk log; tăng `num.replica.fetchers`; kiểm tra IOPS/throughput thực của volume.

### 14.10 Message quá lớn

- **Triệu chứng:** `RecordTooLargeException`, hoặc consumer không đọc được record vượt giới hạn fetch.
- **Nguyên nhân:** mặc định một batch tối đa ~1 MB (`message.max.bytes`); muốn tăng phải chỉnh **đồng bộ** nhiều nơi: `max.request.size` (producer), `message.max.bytes` / `max.message.bytes` (broker/topic), `replica.fetch.max.bytes`, `max.partition.fetch.bytes` (consumer).
- **Xử lý:** ưu tiên **claim-check pattern**: lưu payload lớn ở object storage, chỉ gửi con trỏ (URL + checksum) qua Kafka.

### 14.11 `send()` treo ứng dụng

- **Nguyên nhân:** broker chậm hoặc mất leader → batch dồn lại → `buffer.memory` (32 MB) đầy → `send()` **block** tới `max.block.ms` (60s). Gọi `send()` trong request thread của API → cả API treo theo.
- **Xử lý:** giám sát `buffer-available-bytes`, `record-queue-time-avg`; đặt `max.block.ms` và `delivery.timeout.ms` có chủ đích; có chiến lược khi Kafka không sẵn sàng (outbox trong DB là lựa chọn an toàn nhất).

### 14.12 Hóa đơn truyền dữ liệu liên AZ

- **Nguyên nhân:** trên cloud, mỗi byte ghi vào Kafka RF=3 qua 3 AZ đi liên AZ ít nhất 2 lần (replication), cộng thêm producer/consumer nằm khác AZ với leader.
- **Xử lý:** fetch-from-follower (mục 9.7), nén `zstd`, batching lớn hơn; tính chi phí mạng vào thiết kế ngay từ đầu.

### 14.13 Dual-write giữa DB và Kafka

- **Nguyên nhân:** ứng dụng ghi DB rồi gửi Kafka (hoặc ngược lại) không cùng giao dịch → crash ở giữa → hai bên lệch nhau.
- **Xử lý:** **Transactional outbox** hoặc **CDC** (Debezium đọc WAL) — xem phần CDC/Outbox trong [Database: Ghi chú cơ bản](/blog/database).

### 14.14 Quá nhiều partition

- **Chi phí của mỗi partition:** file handle (mỗi segment 3 file), bộ nhớ batch ở producer (mỗi partition một hàng batch), luồng replicate, thời gian failover và reassign, thời gian rebalance phía consumer.
- KRaft nâng trần số partition **trên toàn cluster** lên rất nhiều, nhưng chi phí **trên từng broker và từng client** vẫn còn. Đừng tạo topic 1.000 partition "cho chắc" khi chỉ cần 30.

### 14.15 Broker khởi động lại mất hàng chục phút sau crash

- **Triệu chứng:** broker bị `kill -9` hoặc node k8s bị evict cứng; khi lên lại, broker "treo" rất lâu ở bước load log, `UnderReplicatedPartitions` kéo dài.
- **Nguyên nhân:** không có file `.kafka_cleanshutdown` → broker phải **log recovery**: đọc lại và kiểm CRC mọi segment sau recovery point của hàng nghìn partition (mục 7.5), với rất ít luồng.
- **Xử lý:** tăng `num.recovery.threads.per.data.dir`; đặt `terminationGracePeriodSeconds` đủ dài để broker luôn tắt êm; tránh để OOM killer giết broker (giới hạn heap hợp lý, không đặt memory limit của container sát heap).

### 14.16 Consumer `read_committed` đứng im dù producer vẫn ghi

- **Triệu chứng:** lag của một số partition tăng đều, consumer không lỗi nhưng không nhận được record mới; consumer `read_uncommitted` trên cùng topic vẫn chạy bình thường.
- **Nguyên nhân:** có một giao dịch **mở mà không đóng** (producer chết khi đang giao dịch, `transactional.id` ngẫu nhiên, hoặc lỗi hanging transaction ở bản cũ) → LSO kẹt → mọi record phía sau, kể cả record không thuộc giao dịch nào, đều bị chặn (mục 10.6).
- **Xử lý:** theo dõi `LastStableOffsetLag`; dùng `kafka-transactions.sh find-hanging` rồi `abort`; đặt `transactional.id` ổn định và `transaction.timeout.ms` hợp lý; nâng lên bản có KIP-890.

### 14.17 Mất dữ liệu đã ack sau sự cố mất điện cả datacenter

- **Triệu chứng:** sau khi cả DC (hoặc cả rack chứa mọi replica) mất điện, vài chục giây dữ liệu cuối cùng biến mất dù producer dùng `acks=all`.
- **Nguyên nhân:** record đã ack chỉ nằm trong page cache của các replica (mục 7.4); mọi replica cùng mất điện trước khi kernel kịp ghi xuống đĩa → giả định lỗi độc lập bị phá vỡ.
- **Xử lý:** rải replica qua fault domain thật sự độc lập (AZ, nguồn điện); nếu không thể, bật `flush.ms`/`flush.messages` cho topic quan trọng, dùng disk có PLP, và hạ `vm.dirty_background_bytes` để thu nhỏ cửa sổ rủi ro.

---

## 15. Chọn số partition

Công thức khởi điểm, với `T` là throughput mục tiêu, `p` là throughput một partition đạt được phía producer và `c` là throughput một consumer xử lý được trên một partition:

```
số partition ≥ max( T / p ,  T / c )
```

Ví dụ: `T = 200 MB/s`, `p = 20 MB/s`, `c = 10 MB/s` → `max(10, 20) = 20` → chọn khoảng 24–30 để có chỗ tăng trưởng.

Thực tế, **giới hạn phía consumer** thường quyết định: nếu xử lý mỗi record mất 50 ms (gọi DB/API), một consumer chỉ được ~20 record/s; muốn 2.000 record/s cần ~100 consumer song song → cần **≥ 100 partition** (hoặc xử lý song song theo key bên trong consumer).

Mẹo:

- Chọn số **có nhiều ước số** (12, 24, 36, 48, 60…) để chia đều cho nhiều cấu hình số broker và số consumer khác nhau.
- Tính cho **tải 1–2 năm tới**, vì tăng partition về sau sẽ phá thứ tự theo key (14.4) — còn **giảm** partition thì Kafka **không hỗ trợ**.

---

## 16. Metric cần có trên dashboard

| Metric | Ý nghĩa | Khi nào báo động |
|---|---|---|
| `UnderReplicatedPartitions` | Số partition có ISR < RF | > 0 kéo dài vài phút |
| `UnderMinIsrPartitionCount` | ISR < `min.insync.replicas` → **đang từ chối ghi** `acks=all` | > 0 → page ngay |
| `OfflinePartitionsCount` | Partition không có leader | > 0 → page ngay |
| `ActiveControllerCount` | Tổng cả cluster phải **đúng bằng 1** | ≠ 1 |
| `IsrShrinksPerSec` / `IsrExpandsPerSec` | ISR dao động | Tăng đột biến → GC / disk / mạng |
| `RequestHandlerAvgIdlePercent` | Độ rảnh của I/O thread pool | < 30% → broker quá tải |
| Produce `TotalTimeMs` p99 | Latency ghi | Gai lớn khi failover/ISR flapping |
| Consumer lag (`records-lag-max`, lag theo partition) | Consumer tụt hậu | Tăng đều, hoặc tăng ở riêng một partition |
| Disk usage theo **từng** broker | Dung lượng | > 75–80% |
| `LastStableOffsetLag` (theo partition) | Khoảng cách HW − LSO: giao dịch mở chặn consumer `read_committed` bao xa | Tăng mãi không giảm → hanging transaction |
| `LogFlushRateAndTimeMs` | Tần suất và thời gian fsync (roll segment, flush policy) | Thời gian tăng → disk chậm hoặc writeback dồn dập |
| KRaft: trạng thái quorum, độ trễ áp dụng metadata | Sức khỏe control plane | Broker tụt hậu metadata, bầu cử liên tục |

---

## Tổng kết: hành trình của một message

1. **Producer** serialize record, partitioner chọn partition theo **key** (hoặc sticky nếu không có key), gom vào batch.
2. Sender thread tra **metadata** để biết broker nào đang lead partition, gửi batch **thẳng tới leader**, kèm PID + sequence (idempotence).
3. **Leader** append batch vào active segment (page cache), gán offset, gắn **leader epoch**.
4. **Follower** trong ISR **pull** batch về; leader nâng **High Watermark** khi mọi replica trong ISR đã có.
5. Đủ `acks=all` và `|ISR| ≥ min.insync.replicas` → leader trả **ack** cho producer. Record giờ đã **committed** — tức là nằm trong page cache của mọi ISR, **chưa chắc đã ở trên đĩa**; kernel writeback sẽ đưa nó xuống sau vài chục giây.
6. **Consumer** trong group được gán partition đó fetch dữ liệu **dưới HW**, xử lý, rồi **commit offset** vào `__consumer_offsets`.
7. Trong suốt quá trình, **active controller** (Raft leader của `__cluster_metadata`) theo dõi heartbeat của broker; broker chết → fence → **chỉ định leader mới từ ISR** theo thứ tự danh sách replicas → ghi vào metadata log → broker và client cập nhật và đi tiếp.
8. Controller chết → các controller còn lại **bầu cử Raft**, controller mới đã có sẵn state trong RAM → tiếp quản gần như tức thì.


## Tham khảo

- Apache Kafka Documentation — phần *Design* và *Operations*: <https://kafka.apache.org/documentation/>. Về flush: các mục *Application vs. OS Flush Management* và *Understanding Linux OS Flush Behavior*.
- Jay Kreps — *The Log: What every software engineer should know about real-time data's unifying abstraction*: <https://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying>
- Raft: <https://raft.github.io/>
- *PacificA: Replication in Log-Based Distributed Storage Systems* — Microsoft Research, 2008.
- *Kafka: The Definitive Guide* (2nd edition) — Shapira, Palino, Sivaram, Petty.
- Các KIP nhắc tới trong bài: KIP-98 (exactly-once), KIP-101 (leader epoch), KIP-345 (static membership), KIP-392 (fetch from follower), KIP-405 (tiered storage), KIP-429 (cooperative rebalance), KIP-447 (EOS v2 — fencing theo consumer group), KIP-480 (sticky partitioner), KIP-500 (thay ZooKeeper bằng KRaft), KIP-595 (Raft cho metadata), KIP-618 (exactly-once cho source connector), KIP-664 (công cụ xử lý hanging transaction), KIP-794 (uniform sticky partitioner), KIP-848 (consumer rebalance protocol mới), KIP-853 (KRaft quorum động), KIP-890 (gia cố giao thức transaction), KIP-932 (share groups), KIP-966 (Eligible Leader Replicas), KIP-996 (pre-vote).
