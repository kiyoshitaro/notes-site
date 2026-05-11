---
title: "Hệ thống phân tán: Ghi chú cơ bản"
pubDate: "2025-10-03"
published: true
contents_table: true
pinned: false
description: "Ghi chú về hệ thống phân tán: CAP theorem, consensus (Paxos/Raft/ZAB), consistency models, coordination, distributed transactions, fault tolerance, và storage."
cat: "misc"
useKatex: false
---

# Distributed System

https://www.youtube.com/playlist?list=PLrw6a1wE39_tb2fErI4-WkMbsvGQk9_UB

https://www.youtube.com/playlist?list=PLOE1GTZ5ouRPbpTnrZ3Wqjamfwn_Q5Y9A

https://book.mixu.net/distsys/single-page.html

- [Distributed System](#distributed-system)
  - [Vấn đề nền tảng](#vấn-đề-nền-tảng)
  - [Communication](#communication)
  - [Partitioning (Sharding) \& Replication](#partitioning-sharding--replication)
  - [Consistency Models](#consistency-models)
  - [Coordination](#coordination)
    - [Consensus: nhiều tiến trình/replica đồng ý một giá trị theo thứ tự (ghi log, chọn leader, commit transaction)](#consensus-nhiều-tiến-trìnhreplica-đồng-ý-một-giá-trị-theo-thứ-tự-ghi-log-chọn-leader-commit-transaction)
    - [Membership and Coordination Services](#membership-and-coordination-services)
    - [Distributed Transactions: Đảm bảo tính ACID trong hệ thống phân tán](#distributed-transactions-đảm-bảo-tính-acid-trong-hệ-thống-phân-tán)
    - [Timer and Clock Synchronization](#timer-and-clock-synchronization)
    - [Conflict](#conflict)
      - [Conflict Detection:](#conflict-detection)
      - [Conflict Prevention:](#conflict-prevention)
      - [Conflict Resolution](#conflict-resolution)
    - [Distributed Lock (Mutual Exclusion phân tán)](#distributed-lock-mutual-exclusion-phân-tán)
      - [Bài toán bắt đầu từ đâu](#bài-toán-bắt-đầu-từ-đâu)
    - [Hướng tiếp cận đầu tiên: lock bằng Redis](#hướng-tiếp-cận-đầu-tiên-lock-bằng-redis)
    - [Vấn đề TTL: GC pause và split-brain](#vấn-đề-ttl-gc-pause-và-split-brain)
    - [Vấn đề HA: Redis sập thì sao](#vấn-đề-ha-redis-sập-thì-sao)
    - [Khi nào dùng gì: cây quyết định](#khi-nào-dùng-gì-cây-quyết-định)
      - [Bài toán high-concurrency inventory deduction](#bài-toán-high-concurrency-inventory-deduction)
      - [Phân biệt Pessimistic Lock vs Optimistic Lock vs Atomic Update](#phân-biệt-pessimistic-lock-vs-optimistic-lock-vs-atomic-update)
      - [Trade-off: thêm Redis cache layer vs DB Atomic Update](#trade-off-thêm-redis-cache-layer-vs-db-atomic-update)
  - [Distributed Counting](#distributed-counting)
    - [Bài toán](#bài-toán)
      - [Cần đếm chính xác đến đâu ((YouTube view count hiển thị "1.2M views" không cần chính xác đến từng đơn vị. Twitter like count viral hiển thị "523K" cũng không ai để ý sai số 0.1%. Ngược lại, đếm số lần user đã refund — sai 1 cái cũng là vấn đề pháp lý.))](#cần-đếm-chính-xác-đến-đâu-youtube-view-count-hiển-thị-12m-views-không-cần-chính-xác-đến-từng-đơn-vị-twitter-like-count-viral-hiển-thị-523k-cũng-không-ai-để-ý-sai-số-01-ngược-lại-đếm-số-lần-user-đã-refund--sai-1-cái-cũng-là-vấn-đề-pháp-lý)
    - [Hướng tiếp cận đầu tiên: chia nhỏ hot row — Sharded Counter](#hướng-tiếp-cận-đầu-tiên-chia-nhỏ-hot-row--sharded-counter)
    - [Khi DB không đủ nhanh: Write-back Cache](#khi-db-không-đủ-nhanh-write-back-cache)
    - [Cần vừa nhanh vừa scale: streaming pipeline](#cần-vừa-nhanh-vừa-scale-streaming-pipeline)
    - [Khi không cần chính xác: probabilistic counting](#khi-không-cần-chính-xác-probabilistic-counting)
    - [Khi đếm dùng làm rate limit](#khi-đếm-dùng-làm-rate-limit)
    - [Chống overcounting và undercounting](#chống-overcounting-và-undercounting)
    - [Một số bài toán thực tế](#một-số-bài-toán-thực-tế)
  - [Distributed Scheduling (Multiple Schedule Node)](#distributed-scheduling-multiple-schedule-node)
    - [Bài toán](#bài-toán-1)
    - [Hướng tiếp cận đầu tiên: lock trên database — ShedLock](#hướng-tiếp-cận-đầu-tiên-lock-trên-database--shedlock)
    - [Distributed lock thuần](#distributed-lock-thuần)
    - [Khi cluster có nhiều job: leader election](#khi-cluster-có-nhiều-job-leader-election)
    - [Khi job nặng: tách trigger khỏi execution](#khi-job-nặng-tách-trigger-khỏi-execution)
    - [Khi workflow phức tạp: scheduler chuyên dụng](#khi-workflow-phức-tạp-scheduler-chuyên-dụng)
    - [Chọn solution thế nào](#chọn-solution-thế-nào)
    - [Những cái bẫy phải tránh](#những-cái-bẫy-phải-tránh)
    - [Câu hỏi phỏng vấn thường gặp](#câu-hỏi-phỏng-vấn-thường-gặp)
  - [Fault Tolerance \& Recovery: cách duy trì hoạt động ổn định, nhất quán dữ liệu và availability cao dù failures.](#fault-tolerance--recovery-cách-duy-trì-hoạt-động-ổn-định-nhất-quán-dữ-liệu-và-availability-cao-dù-failures)
    - [Fault Tolerance: tập trung vào việc tiếp tục chạy](#fault-tolerance-tập-trung-vào-việc-tiếp-tục-chạy)
    - [Recovery : việc sửa chữa và quay lại trạng thái đúng](#recovery--việc-sửa-chữa-và-quay-lại-trạng-thái-đúng)
  - [Durability \& Storage Layer](#durability--storage-layer)

## Vấn đề nền tảng 

* Distributed System sinh ra để giải quyết: scalability, fault tolerance, availability, latency (boss told you, fun, needed a server... :>>)

* CAP Theorem: 
    * Một hệ thống phân tán phải đối mặt với ba thuộc tính:
        * Consistency: tất cả các node nhìn thấy cùng một dữ liệu tại cùng một thời điểm.
        * Availability: hệ thống vẫn phản hồi cho mọi yêu cầu, ngay cả khi một số node bị lỗi.
        * Partition tolerance: hệ thống vẫn hoạt động ngay cả khi mạng bị phân vùng (mất kết nối giữa các node).
    * => chỉ có thể đạt được đồng thời 2 trong 3 thuộc tính này, không thể có cả 3 cùng lúc((Thực tế P (Partition tolerance) là bắt buộc với mọi hệ phân tán — network partition luôn xảy ra. Vì vậy lựa chọn thực sự chỉ là CP vs AP, không phải giữa cả ba. "CA system" trong thực tế chỉ tồn tại trên single node hoặc khi giả định mạng không bao giờ fail.))
    * Ba loại hệ thống theo CAP: 
        * CA: các hệ thống dùng 2PC trong cơ sở dữ liệu.
        * CP: các giao thức quorum theo đa số, nơi các phân vùng thiểu số không thể hoạt động (như Paxos), Spanner, Etcd → sacrifice availability để giữ strong consistency. 
        * AP: DynamoDB, Cassandra → eventual consistency, luôn trả về 

        ![CAP](./assets/CAP.png)

    * Strong consistency và High availability khi mạng bị phân vùng.
        * Nếu muốn strong consistency (mọi node luôn thấy cùng dữ liệu), ta phải từ chối một số yêu cầu khi mạng phân vùng → giảm availability.
        * Nếu muốn high availability (luôn phản hồi), ta phải chấp nhận dữ liệu có thể khác nhau giữa các node → giảm consistency.
        * Cách “lách” là:
            * Tăng giả định (giả sử không có phân vùng).
            * Hoặc giảm yêu cầu (chấp nhận consistency yếu hơn, ví dụ eventual consistency).
        * Như vậy, “consistency” không chỉ có nghĩa là strong consistency, mà có nhiều mức độ khác nhau.
    * Strong consistency và Performance
        * Strong consistency yêu cầu các node phải trao đổi và đồng thuận cho mỗi thao tác → độ trễ cao.
        * Nếu chấp nhận mô hình consistency yếu hơn (cho phép replica trễ hoặc khác nhau), ta có thể giảm độ trễ và tăng tốc độ phản hồi.
    * Nếu không muốn từ bỏ Availability => chấp nhận dữ liệu tạm thời khác nhau, rồi sau đó phải hòa giải (conflict resolution).



* Môi trường hệ thống: 
    * Failure model:=> fault tolerance 
        * Crash fault (node chết im): đơn giản, thường gặp: 
            * Network failure: 
                * TCP/IP: a pair of nodes can communicate, or not
                * Ssh: guards against corruption, interception, and impersonation
                * => Loss of connectivity + network not fast enough

            * Node failure:
                * Crash, Power outage, Hardware failure, Out of memory/disk full
                * Strategies: Checkpoint state and restart (High latency) + Replicate state and fail over (High cost)

        * Byzantine fault: node gửi dữ liệu sai lệch (blockchain quan tâm). 
    * Network : có thể chậm, mất gói, partition. 
    * Time model: 
        * Synchronous (đồng bộ tuyệt đối): không thực tế. 
        * Asynchronous: không có bound time → khó consensus. 
        * Partial synchronous: thực tế nhất. 
    * Thực tế: gói tin có thể delay 200ms, mất, hoặc đến không theo thứ tự 

* Mục tiêu của hê phân tán: 
    * Scalability (Khả năng mở rộng): hệ thống phải xử lý tốt khi quy mô tăng.
        * Size scalability: thêm node thì hiệu năng tăng tuyến tính.
        * Geographic scalability: dùng nhiều datacenter để giảm độ trễ.
        * Administrative scalability: thêm node không làm tăng chi phí quản trị quá nhiều.

    * Performance & Latency (Hiệu năng và độ trễ):
        * Hiệu năng = lượng công việc hữu ích / tài nguyên sử dụng.
        * Latency = độ trễ giữa hành động và tác động có thể quan sát.
        * Latency bị giới hạn bởi tốc độ ánh sáng và phần cứng.
  
    * Availability & Fault tolerance (Khả dụng và chịu lỗi):
        * Hệ thống phải tiếp tục hoạt động ngay cả khi một số thành phần hỏng.
        * Được đo bằng “số số 9” (ví dụ: 99.99% uptime ≈ <1 giờ downtime/năm).((Bảng đối chiếu: 99.9% ≈ 8.7h/năm; 99.99% ≈ 52 phút/năm; 99.999% ≈ 5 phút/năm. Mỗi “9” thêm vào đòi hỏi thiết kế phức tạp và chi phí hơn nhiều — thường không tuyến tính.))
        * Fault tolerance = định nghĩa trước loại lỗi và thiết kế hệ thống chịu được chúng.

## Communication
* Protocol: cách các node gửi/nhận messages, xây dựng trên network layers (TCP/IP stack), nhưng trong distributed systems, tập trung vào reliability, performance, và semantics 

    * TCP/UDP: TCP có overhead cao (connection setup), dễ bottleneck nếu nhiều connections. UDP phù hợp realtime (video streaming), nhưng cần app-level retry 

    * HTTP/REST, RPC (gRPC, Thrift): HTTP/REST đơn giản (stateless), nhưng ít efficient hơn gRPC (binary vs JSON), grpc hay dùng cho inter-service calls trong các microservice 

    * Message Queue (Kafka, NATS, RabbitMQ), Pub/Sub: Async messaging cho decoupling. Kafka dùng partitions (sharding) + replication (Raft-like) cho high throughput; RabbitMQ dùng exchanges/queues cho routing flexible 

    * ==> Vấn đề:  
        * Latency & Bandwidth: Network delay -> Compression (Protobuf), batching. 
        * Failures: Messages lost/duplicated/out-of-order -> Acks, sequence numbers (như offsets in Kafka), và retries với exponential backoff. 
        * Security: Encryption (TLS cho gRPC/HTTP), authentication (OAuth/JWT). Vấn đề: Man-in-middle attacks nếu không TLS. 
        * Scalability: Too many connections overload -> Connection pooling, message batching. 

* Load Balancing:  

    * Round-robin, least connections:  

    * Consistent hashing: Hash key/request để map đến node. Giảm remap khi nodes change 
        * Basic Hash Ring:  
            * Hash mỗi node thành một điểm trên vòng tròn 
            * Key được hash gán cho node gần nhất theo chiều kim đồng hồ  
            * ==> thêm node: key trong vùng thêm mới phải gán lại vào node, xoá cũng tương tự 
        * Virtual Nodes: Mỗi node có nhiều điểm trên vòng → cân bằng tải tốt hơn((Không có virtual nodes: thêm 1 node chỉ chia 1 vùng → load không đều. Với ~150 virtual nodes/node, khi thêm/xóa node nhiều vùng nhỏ cùng rebalance → phân phối đều hơn nhiều. Cassandra, DynamoDB dùng kỹ thuật này.))
    
    ...

* Service Discovery: DNS, ZooKeeper, etcd. 

* Reliability: retry, timeout, backoff. 
    * At-least-once → có thể duplicate. 
    * At-most-once → có thể mất. 
    * Exactly-once → cực khó (Kafka transaction, Spanner).((Kafka exactly-once: idempotent producer (dedup bằng sequence number) + transactional API (atomic write across partitions). Overhead ~5–15% throughput so với at-least-once. Spanner dùng 2PC + TrueTime để đảm bảo globally.))
* Figure: 
    * Ping cùng region AWS ~ 1–2 ms. 
    * Cross-region ~ 50–100 ms. 
    * Cross-ocean (VN → US) > 200 ms 

## Partitioning (Sharding) & Replication 

* Partitioning (Sharding): chia dữ liệu thành nhiều phần (shards/partitions), mỗi phần được lưu trữ và xử lý độc lập trên các node khác nhau.
    * Kỹ thuật:  
        * Hash: dễ scale, nhưng range query khó. 
        * Range: query theo range dễ, nhưng dễ skew (hotspot). 
        * Consistent hashing: chỉ ảnh hưởng ít node khi thêm/bớt server. 

* Replication: lưu nhiều bản sao của cùng một dữ liệu trên các node khác nhau, tăng availability, fault tolerance => chi phí ghi va consistency => xuất hiện nhiều thuật toán đồng thuận (Paxos, Raft) và mô hình consistency
    * Kỹ thuật: 
        * Leader-follower: dễ reasoning, latency thấp. 
        * Leaderless (Dynamo): ghi vào N node, đọc từ R node => Quorum: W + R > N → đảm bảo consistency((Tại sao W+R>N đảm bảo consistency? Vì write quorum và read quorum overlap ít nhất 1 node → node đó luôn có write mới nhất → read thấy. Ví dụ N=3, W=2, R=2: 2+2=4>3, overlap 1 node. Nếu W=1, R=1 thì 1+1=2 không > 3 → có thể đọc stale.))
        * Chain Replication. 
 
* Đây là nơi học về trade-off scale vs reliability, consistency và availability

## Consistency Models

* Các loại: 
    * Strong consistency: đọc luôn thấy dữ liệu mới nhất. 
    * Eventual consistency: sau một khoảng thời gian, các replica converge. 
    * Causal consistency: đảm bảo quan hệ nhân-quả. 
    * Read-your-writes: user đọc lại giá trị mình vừa viết. 

* Ex: 
    * DynamoDB có strong không? → Mặc định eventual, optional strong 
    * Google Spanner làm sao strong mà multi-region? → Dùng TrueTime API (GPS + Atomic clock) để bound uncertainty < 7 ms.((TrueTime trả về interval [earliest, latest] thay vì timestamp cố định. Spanner commit-wait: transaction phải chờ đúng khoảng uncertainty (~7ms) trước khi commit — đảm bảo mọi node ở mọi datacenter có timestamp sau commit. Đây là lý do write latency ~10–14ms.))

## Coordination
Là cách các node phối hợp hành vi (ai làm leader, ai ghi log, ai phản hồi client) 

### Consensus: nhiều tiến trình/replica đồng ý một giá trị theo thứ tự (ghi log, chọn leader, commit transaction)

* Thuộc tinh cơ bản:
    * Safety = Agreement + Validity + Integrity
        * Agreement: Tất cả các tiến trình đúng (không bị lỗi) phải đồng ý cùng một giá trị.
        * Validity: Giá trị được quyết định phải là một trong những giá trị đã được đề xuất bởi tiến trình.
        * Integrity: Mỗi tiến trình chỉ được quyết định một lần, không thể thay đổi quyết định sau khi đã chọn
    * Liveness = Termination: Mọi tiến trình đúng cuối cùng phải đi đến một quyết định.

* The FLP impossibility
    * Giả định của mô hình bất đồng bộ:
        * Các tiến trình chạy song song trên nhiều node độc lập.
        * Mạng truyền thông đáng tin cậy (không mất gói), nhưng độ trễ có thể vô hạn.
        * Node có thể hỏng theo kiểu crash (dừng hoạt động).
        * Không có đồng hồ chung, không có giới hạn thời gian.
    
    * Phát biểu: 
        * Không tồn tại thuật toán xác định nào giải quyết được bài toán đồng thuận trong hệ thống bất đồng bộ có thể xảy ra lỗi, ngay cả khi thông báo không bao giờ có thể bị mất + nhiều nhất một quá trình có thể bị lỗi và nó chỉ có thể lỗi khi crash
    
    * Lập luận:
        * Trong mạng bất đồng bộ không thể phân biệt “trễ” với “hỏng” => tiến trình cho phép trì hoãn vô hạn => có thể xây dựng một kịch bản thực thi mà thuật toán đó mãi ở trạng thái “bivalent” (chưa quyết định giá trị cuối cùng).
        * Do đó, termination (tất cả tiến trình cuối cùng phải ra quyết định) không thể đảm bảo.
    * Ý nghĩa: FLP cho thấy rằng trong mô hình bất đồng bộ thuần túy, đồng thuận là bất khả thi.
        * Nới lỏng giả định: ví dụ, giả định hệ thống partially synchronous (mạng có lúc trễ rất lâu, nhưng không phải lúc nào cũng vô hạn).
        * Chấp nhận trade-off: thuật toán có thể hy sinh safety (tính đúng đắn) hoặc liveness (khả năng tiến triển).
        * ==> các thuật toán như Paxos, Raft được thiết kế trong mô hình partial synchrony

* Paxos: được dùng để xây dựng các hệ thống replicated state machine (như cơ sở dữ liệu phân tán), đảm bảo tất cả nodes có trạng thái giống nhau ==> thống nhất 1 giá trị duy nhất, ngay khi có máy bị hỏng hoặc mạng bị chập chờn. 

    * Safety requirements: 
        * Choose in proposers. 
        * Choose only 1 value. 
        * No learn value (không lan truyền sai) trừ khi nó thực sự được chọn. 

    * Liveness:  
        * Nếu có người đề xuất → cuối cùng sẽ có value được chọn. 
        * Nếu đã chọn → mọi node sẽ biết value 
        * But có thể livelock: trạng thái khi có nhiều hoặc không ai làm leader((Livelock Paxos: hai proposer cạnh tranh liên tục, A prepare xong thì B prepare với ballot cao hơn làm A abort, A retry ballot cao hơn nữa... vòng lặp vô tận. Giải pháp: Multi-Paxos — bầu 1 distinguished leader duy nhất, chỉ leader đó propose trong steady state.))

    * Mô hình giả định:  
        * Asynchronous (tin nhắn chậm, lặp, mất nhưng không hỏng) 
        * non-Byzantine (nodes có thể crash/restart, nhưng không gian dối) 
        * stable storage để nhớ thông tin qua failure. 

    * Thành phần:  
        * Proposers: Đề xuất giá trị (như client gửi request). 
        * Acceptors: Quyết định chấp nhận (accept) đề xuất nào (thường là majority để chịu lỗi). 
        * Learners: Học giá trị đã chọn (như nodes áp dụng giá trị). 

* ZAB (ZooKeeper Atomic Broadcast):
    * Giao thức consensus tùy chỉnh dành riêng cho ZooKeeper (external coordinate service).
    * Thiết kế để giải quyết vấn đề cốt lõi của mọi hệ phân tán lớn: “Làm sao để hàng trăm/thousands node biết trạng thái của nhau, đồng bộ hành động, và tránh xung đột mà không bị lỗi, race condition, deadlock hay split-brain? - cung cấp một tập primitives, giữ các metadata nhỏ nhưng cực quan trọng: ai đang là leader, node nào đang sống, config hiện tại, lock/lease đang thuộc về ai.
    * ZooKeeper cung cấp primitives để coordination dựa trên:
        * Znode (giống file system tree): `/app/leader`, `/services/payments/instances/...`
        * Ephemeral node: tự biến mất khi client session chết (process crash, mất kết nối lâu)((Leader election dùng ephemeral node: process tạo `/election/leader` ephemeral. Nếu process chết, ZK tự xóa node → watcher của các process khác nhận notification → bầu lại. Không cần polling, không có zombie leader.))
        * Sequential node: ZooKeeper tự gắn số tăng dần để tạo hàng đợi/cạnh tranh công bằng hơn
        * Watch: cơ chế notify khi znode thay đổi (phù hợp service discovery/config)
* Raft:
    * Thiết kế với mục tiêu "dễ hiểu và dễ lập trình" thay cho sự phức tạp của Paxos. Tách biệt rõ 3 phần: Leader Election, Log Replication, và Safety.
    * Rất phổ biến hiện nay: nhúng vào etcd, Consul, hoặc Kafka (KRaft mode).
* **Xu hướng (External vs Internal Consensus)**:
    * Trái với trước đây khi các hệ thống dựa vào external coordinate service (như Kafka dùng ZooKeeper + ZAB) để bầu leader và lưu metadata (dễ có SPOF nếu cấu hình sai, failover chậm, khó vận hành 2 hệ thống song song).
    * Hiện tại các hệ thống hướng tới nhúng consensus trực tiếp vào trong (Kafka KRaft, MongoDB). Ví dụ Kafka KRaft dùng các broker làm quorum controller bằng Raft, metadata cất tại topic nội bộ `__cluster_metadata` -> failover nhanh (sub-second), loại bỏ rủi ro SPOF từ thành phần ngoài.


### Membership and Coordination Services
Các hệ thống như **ZooKeeper**, **etcd**, hoặc **Consul** thường được gọi là "distributed key-value stores" nhưng thực chất chúng sinh ra làm **coordination / configuration / membership services**.
* **Đặc điểm chung**:
    * Dữ liệu dung lượng nhỏ, được giữ hoàn toàn trên RAM. Không dùng để lưu trữ runtime app data lớn.
    * Dữ liệu được replicate nhất quán qua các node bằng thuật toán Total Order Broadcast (như Zab trong ZooKeeper, Raft trong etcd).
* **Tính năng hỗ trợ System Coordination (theo mô hình Google Chubby / ZooKeeper)**:
    * **Linearizable atomic operations**: Hỗ trợ Compare-And-Set nguyên tử, cung cấp nguyên liệu hoàn hảo để xây dựng Distributed Lock.
    * **Total ordering of operations**: Thay vì chỉ cấp lock trơn, chúng hỗ trợ **fencing token** (một dãy số luôn tăng mỗi lần lock được cấp). Số fencing token này sẽ được kẹp vào các request sau đó tới Storage để chặn write từ các zombie process (process bị lag rồi mới thức dậy).
    * **Failure detection**: Cung cấp hệ thống session (ephemeral nodes). Nếu một tiến trình giữ lock chết hoặc mất kết nối mạng, session timeout và lock sẽ tự động được thu hồi an toàn mà không phải chờ quá lâu.
    * **Change notifications**: Clients có thể tạo watchers theo dõi tài nguyên. Ngay khi có thay đổi (vd leader chết), watcher trả về thông báo thay vì client phải polling.
* **Ứng dụng thực tế và Xu hướng Coordinator**:
    * **Leader election / HA**: Giúp hệ thống tránh split-brain. Ví dụ PostgreSQL điển hình dùng Patroni kết nối tới **etcd** (Raft) làm coordinator bên ngoài bầu master.
    * *(Lưu ý: Không phải ai cũng dùng coordination ngoài. Redis tự bầu master bằng Sentinel theo quorum majority; MongoDB, ES có các thuật toán Raft-like election tích hợp bên trong).*
    * **Quản trị Metadata & Controller**: Lấy ví dụ Kafka trước bản 4.0 phụ thuộc mạnh vào ZooKeeper (External Coordination) để quản lý metadata, cluster health... Sau này chuyển sang KRaft (Internal) để giảm Overhead quản lý phức tạp và lỗi SPOF hệ thống phụ.
    * **Cluster Membership**: Theo dõi trạng thái node thông qua ephemeral nodes / heartbeat. Khoá sẽ tự giải phóng ngay khi session/node timeout.

### Distributed Transactions: Đảm bảo tính ACID trong hệ thống phân tán 
* 2PC:  
    * Cách hoạt động:  
        * Phase 1 (Prepare): Coordinator gửi "Prepare?" đến tất cả participants. Mỗi participant kiểm tra (lock resources, ghi log), nếu OK thì vote "Yes" (prepared), nếu không thì "No" (abort). 
        * Phase 2 (Commit): Nếu tất cả vote "Yes", coordinator gửi "Commit" để apply changes. Nếu bất kỳ "No", gửi "Abort" để rollback. 
        * Nếu participant fail giữa chừng, coordinator chờ timeout rồi abort. 
    * Ưu: Đảm bảo atomicity mạnh (all or nothing). 
    * Nhược:  
        * Blocking (participants lock resources chờ phase 2, chậm nếu coordinator fail).  
        * Không scale tốt với nhiều nodes (nếu một service bị treo → cả hệ thống chờ). 
        * Phụ thuộc vào coordinator 

* 3PC: thêm 1 pha trung gian giảm khả năng treo -> Khắc phục nhược điểm blocking 2PC 
    * Cách hoạt động:  
        * Phase 1 – CanCommit (Voting phase) 
            * Coordinator hỏi: “Có thể commit không?” 
            * Participants trả lời YES/NO. 

        * Phase 2 – PreCommit(Prepare-to-commit) 
            * Nếu tất cả trả lời YES, coordinator gửi PreCommit. 
            * Participants ghi log, chuẩn bị commit nhưng chưa thực hiện. 
            * Sau khi chuẩn bị xong, participants gửi ACK cho coordinator. 

        * Phase 3 – DoCommit (Final commit) 
            * Khi coordinator nhận đủ ACK, nó gửi DoCommit. 
            * Participants thực hiện commit chính thức. 
            * Nếu coordinator chết ở giai đoạn này, participants vẫn có thể dựa vào trạng thái log để tự quyết định (commit hoặc abort). 
    * Ưu:  
        * Non-blocking: giảm nguy cơ participants bị treo khi coordinator chết. 
        * Có thêm trạng thái trung gian (PreCommit) giúp các nút tự suy luận và tiếp tục tiến trình. 

    * Nhược:  
        * Phức tạp hơn: nhiều thông điệp hơn, tốn tài nguyên mạng. 
        * Vẫn chưa hoàn toàn loại bỏ được mọi tình huống lỗi (ví dụ lỗi mạng kéo dài). 

* Saga: xử lý long-lived transactions mà không lock lâu 
    * Cách hoạt động:  
        * Saga chia một giao dịch lớn thành chuỗi các local transactions, mỗi cái có action và compensating action (hủy bỏ nếu cần). 
        * Orchestration: 1central service điều khiển chuỗi: Thực hiện T1, nếu OK thì T2, ... Nếu fail ở Ti, thực hiện compensating cho T1 đến Ti-1. 
        * Choreography: Không central, mỗi service publish event (message queue như Kafka), service khác subscribe và xử lý/compensate. 
        * Không atomicity tuyệt đối, nhưng eventual consistency 
    * Ưu: Non-blocking, scale tốt, chịu lỗi cao (dùng message queues). 
    * Nhược:  
        * Phức tạp lập trình (cần design compensations, viết logic rollback thủ công)  
        * Không đảm bảo isolation tuyệt đối
* 2PC vs SAGA example:
    * Services: 
        * Order Service – tạo đơn hàng 
        * Inventory Service – trừ kho 
        * Payment Service – xử lý thanh toán 

    * 2PC:  
        * Prepare: 
            * Order Service gửi yêu cầu tạo đơn hàng → ghi tạm vào DB. 
            * Inventory Service trừ kho → ghi tạm vào DB. 
            * Payment Service xử lý thanh toán → ghi tạm vào DB. 
        * Commit: 
            * Nếu tất cả đều phản hồi OK, coordinator gửi lệnh commit → mọi service commit dữ liệu. 
            * Nếu một service lỗi, coordinator gửi lệnh rollback → mọi service hủy thao tác. 
    * Saga: 
        * Order Service tạo đơn hàng → commit ngay. 
        * Gửi event “Đơn hàng mới” → Inventory Service nhận và trừ kho → commit. 
        * Gửi event “Kho đã trừ” → Payment Service xử lý thanh toán → commit. 
        * Nếu bước nào lỗi, sẽ gọi compensating action  

### Timer and Clock Synchronization

Thời gian có tiến triển giống nhau ở mọi nơi không? 

* Global clock: Giả định mọi node có đồng hồ chính xác tuyệt đối, không lệch => cho phép xác định total order toàn hệ thống. Nhưng thực tế khó đạt: đồng hồ lệch, NTP không hoàn hảo, thậm chí người dùng đổi giờ máy. Ví dụ: Cassandra dùng timestamp để giải quyết xung đột (newer timestamp thắng). Nếu đồng hồ lệch → dữ liệu mới có thể bị ghi đè bởi dữ liệu cũ. Google Spanner dùng TrueTime API để ước lượng sai số đồng hồ.

* Local clock: Mỗi máy có đồng hồ riêng => chỉ sắp xếp sự kiện trên cùng 1 máy, không so sánh được giữa các máy.

* No clock: Dùng logical time: Lamport clock hoặc vector clock. Không dựa vào đồng hồ vật lý, mà dựa vào quan hệ nhân quả (causality) cho phép xác định sự kiện nào xảy ra trước/sau/dồng thời, nhưng không đo được khoảng thời gian. Ví dụ: Riak, Voldemort dùng vector clock để tránh vấn đề lệch đồng hồ.
    * Lamport clocks: dùng số tăng dần để track thứ tự causality 
        * Mỗi node có counter, mỗi event counter +=1 
        * Gửi message: Gửi kèm counter. 
        * Nhận message: Counter = max(own counter, received) +1. 
        * A happens-before B nếu timestamp A < B và có causality((Giới hạn của Lamport: nếu timestamp(A) < timestamp(B) không có nghĩa A → B — có thể là concurrent. Lamport chỉ đảm bảo chiều thuận: A→B thì ts(A)<ts(B). Đây là lý do Vector Clock ra đời để phát hiện cả concurrent events.))

    * Vector Clocks: dùng vector (mảng) để track causality chi tiết hơn 
        * Mỗi node có vector kích thước N (nodes), vị trí i là counter của node i. mỗi event Vector[own_id] +=1 
        * Gửi: Gửi vector. 
        * Nhận: Vector[i] = max(own[i], received[i]) cho mọi i, rồi own_id +=1. 
        * So sánh: A happens-before B nếu mọi Vector_A[i] <= Vector_B[i] và ít nhất một < , Concurrent = không A before B + B before A((Ví dụ: VC_A=[2,1,0], VC_B=[1,2,0] → không A≤B (vì A[0]=2>B[0]=1) và không B≤A → concurrent. DynamoDB dùng vector clock để detect concurrent writes rồi trả về conflict cho application tự resolve.))

* Physical Clocks:  

....

### Conflict
Phổ biến do replication (để availability cao) và concurrency, đặc biệt dưới eventual consistency 

* Nguyên nhân: Network latency (trễ mạng) hoặc multi-master replication (nhiều nodes đều write).  
* Step: Detect → Merge/Reject → Converge 

#### Conflict Detection: 

* Versioning:  
    * Gắn version cho mỗi bản ghi, thao tác -> 2 bản ghi version khác nhau → có thể xung đột 
    * Dùng trong Optimistic Concurrency Control, Vector Clock, CRDTs 

* Timestamp: 
    * hai bản ghi cùng key nhưng timestamp khác → có thể là xung đột. 
    * Dùng trong Last-Write-Wins 

* Vector Clocks:  
    * Lamport/vector clocks detect causality, 2 updates concurrent (không before nhau) => conflict 
    * EX: DynamoDB, Cassandra phát hiện conflict các replica. 

* Operation Context: 
    * So sánh ngữ cảnh thao tác: ai ghi, ghi từ đâu, ghi lên gì. 
    * Dùng trong Operational Transformation (OT) và CRDTs 
    * EX: sửa đoạn văn bản 

* Checksum / Hash Comparison: 
    * hash của dữ liệu giữa các replica 
    * EX: Merkle Tree, Anti-Entropy Protocols 
    * Application-Level Rules 

#### Conflict Prevention: 

* Optimistic:  
    * Giả định ít conflict => write rồi check sau (dùng version/timestamp).  
    * Conflict => rollback hoặc merge => nhanh nhưng rủi ro nếu nhiều write. 
* Pessimistic: 
    * Lock data trước write (như 2PC), tránh conflict từ đầu => An toàn nhưng chậm, blocking (dễ deadlock) 

#### Conflict Resolution 

* Last-Write-Wins:  
    * Giữ lại giá trị có timestamp mới nhất:  
    * EX: DynamoDB (AWS) dùng LWW cho key-value store, Redis, Cassandra 
    * Đơn giản nhưng mất dữ liệu nếu hai giá trị đều hợp lệ nhưng bị ghi đè, mất lịch sử. 

* Version Vectors: 
    * Dùng Vectors detect causual nếu concurrent → Resolve bằng LWW hoặc custom 
    * EX: Distributed file systems (Dropbox), NoSQL DBs (Riak, CouchDB). 
    * Ưu điểm: Detect concurrency chính xác, hỗ trợ eventual consistency, kết hợp tốt với CRDTs/LWW . 
    * Nhược điểm: Vector lớn nếu nhiều nodes (overhead storage), không tự resolve (cần kết hợp LWW hoặc manual). 

* Operational Transformation: 
    * Dùng trong text/documents, collaborative editing bằng cách transform 
    * Cách hoạt động: Mỗi op (insert/delete) gắn context (position). Khi concurrent, transform op dựa op khác (ví dụ: A insert at pos 5, B delete at pos 3 → Adjust pos của A thành 4). OT (Central server hoặc peer-to-peer) merge = logic.  
        * Ví dụ: User A insert "x" at pos 0 ("abc" → "xabc"), User B insert "y" at pos 0 ("abc" → "yabc") → OT transform merge thành "xyabc" hoặc "yxabc" tùy logic. 
    * EXP: Google Docs dùng OT để merge realtime edits((Google Docs dùng OT qua server-authoritative model: mọi op đi qua 1 server trung tâm, server transform rồi broadcast. Peer-to-peer OT phức tạp hơn rất nhiều và dễ có edge case. Notion và một số tool mới chuyển sang CRDT để dễ implement hơn.))
    * Ưu điểm: Realtime, giữ intent của users (không mất op), tốt cho text-based collab. 
    * Nhược điểm: Phức tạp implement (transform logic khó), cần causal order (dùng Lamport clocks), không scale tốt cho non-text. 

* Quorum-Based Resolution: 
    * Cách hoạt động: Write yêu cầu W nodes confirm, read từ R nodes. Conflict: So sánh versions từ quorum, chọn majority hoặc latest. Kết hợp version vectors để detect.  
        * Ví dụ: Với N=3, W=2, R=2: Write succeed nếu 2/3 nodes OK. Read lấy majority value. 
    * EXP: Cassandra hoặc Dynamo dùng quorum cho consistency tunable: Trong hệ thống ngân hàng, quorum resolve balance conflicts bằng majority vote, đảm bảo safety 
    * Ưu điểm: Tunable consistency (strong nếu R+W>N), chịu lỗi tốt. 
    * Nhược điểm: Latency cao (chờ quorum) Chậm hơn CRDTs, không tự merge phức tạp (cần thêm LWW). 

* MVCC:  

...

* Tombstones:  
    * Marker "deleted" để resolve delete conflicts (không xóa hẳn, tránh resurrect).  
        * Ví dụ: Cassandra dùng tombstones trong replication, merge bằng propagate delete, distributed caches 
    * Ưu: Xử lý delete an toàn.  
    * Nhược: Tốn space đến compaction. 
 

* CRDTs (Conflict-Free Replicated Data Types): DS&Algo để merge => tốt cho AP 
    * Nguyên Lý Cốt Lõi 
        * Local Updates: Mỗi node update local state với operation như add, remove, increment. 
        * Propagation: Operations (hoặc state) được gửi đến các node khác qua mạng (asynchronous, như gossip protocol).((Gossip protocol: mỗi node định kỳ chọn ngẫu nhiên K nodes và trao đổi state. Convergence trong O(log N) rounds. Không có SPOF, tự chịu lỗi, dùng trong Cassandra, Riak cho membership + CRDT propagation.))
        * Merge Function: Khi nhận updates, node áp dụng hàm merge (commutative, associative, idempotent) để hợp nhất, không phụ thuộc thứ tự. 
    * Dùng khi: cộng tác văn bản (Docs/Notion), reactions/like, presence, danh sách, counters, graph 
    * Ưu:  
        * Tự động merge không cần coordination, non-blocking, scale tốt (hàng triệu nodes). 
        * Hỗ trợ offline updates (merge sau khi reconnect), lý tưởng cho eventual consistency. 
        * Chịu partition tốt (AP trong CAP). 
    * Nhược:  
        * Chỉ eventual consistency, không phù hợp strong consistency (như giao dịch ngân hàng). 
        * Overhead storage (state-based CRDTs lưu full state, tombstones tốn space). 
        * Phức tạp thiết kế cho dữ liệu phức tạp (như graphs). 

    * Các loại : 
        * CmRDT (Operation-Based):  
            * Gửi operations (như "add x to set") đến các node khác. 
            * Reliable (TCP hoặc retry) để đảm bảo op không mất. 
            * Merge bằng cách apply ops theo causal order (dùng vector clocks). 
            * Ví dụ: G-Counter (Grow-Only Counter) – chỉ increment, merge bằng sum. 
        * CvRDT (State-Based):  
            * Gửi toàn bộ state (hoặc delta state) thay vì ops. 
            * Merge bằng hàm merge lấy union hoặc max của states. 
            * Không cần reliable delivery (idempotent), nhưng tốn bandwidth hơn. 
            * Ví dụ: PN-Counter (Positive-Negative Counter) – track increments/decrements riêng, merge bằng max. 

* EXP: 

    * E-commerce (Shopee): CRDTs (OR-Set cho giỏ hàng) hoặc LWW (DynamoDB) tốt vì ưu tiên low latency, eventual consistency. Trade-off: Có thể mất update nếu clocks lệch, không dùng cho thanh toán (cần Quorum + 2PC). 

    * Banking (Vietcombank): Quorum-Based hoặc MVCC (PostgreSQL) cho strong consistency, tránh mất tiền. Trade-off: Latency cao, không scale tốt như CRDTs. 

    * Collaborative Editing (Google Docs): OT hoặc CRDTs lý tưởng cho realtime, merge edits mượt. Trade-off: Phức tạp code, không phù hợp counters. 

    * Social Media (TikTok): CRDTs (PN-Counter) cho likes/dislikes, merge tự động, chịu partition. Trade-off: Eventual, có thể tạm stale. 

    * IoT (Smart Home): CRDTs cho sensors (offline updates, merge sau). Trade-off: Storage overhead, không dùng cho critical control (cần Raft). 

    * Version Control (Git): Version Vectors + Application-Defined Logic để manual merge. Trade-off: Không tự động, chậm nhưng linh hoạt 

### Distributed Lock (Mutual Exclusion phân tán)

#### Bài toán bắt đầu từ đâu

Trong một process duy nhất, nếu hai thread cùng đụng vào shared resource, ta dùng `synchronized` hay `mutex` — OS lo phần còn lại. Nhưng khi service được deploy nhiều instance, hai pod khác nhau không chia sẻ memory nên không thể thấy mutex của nhau. Cần một "trọng tài" bên ngoài cả hai để quyết định ai được vào.

Đó là Distributed Lock: cơ chế đảm bảo **tại một thời điểm chỉ một node được phép thao tác trên một resource chung**, dù các node nằm trên các máy khác nhau, các datacenter khác nhau.

Ba bài toán thực tế điển hình cần distributed lock:

**Trừ tiền (chống double-spending).** User bấm "Thanh toán" hai lần do mạng lag, hoặc bot spam request. Hai pod nhận hai request, cùng đọc `balance = 1000`, cùng trừ 100, cùng update thành 900. Lẽ ra phải còn 800. Lock đảm bảo logic trừ tiền chỉ chạy đúng một lần.

**Cron job phân tán.** 3 server cùng có cron `@Scheduled`, đến giờ cả 3 cùng chạy job. Lock theo task ID giữ cho chỉ 1 server thực thi.

**Flash sale.** Hàng ngàn user cùng giành 1 sản phẩm còn 1 trong kho. Nếu không có lock (hoặc atomic equivalent), oversell — bán 5 cái dù chỉ có 1.

### Hướng tiếp cận đầu tiên: lock bằng Redis

Redis có lệnh atomic `SET key value NX PX ttl` — set chỉ khi key chưa tồn tại, kèm TTL tự động xóa. Đây là primitive đủ để build distributed lock đơn giản:

```
Acquire: SET lock:order:123 my_random_token NX PX 30000
         → OK nếu thắng, nil nếu đã có người giữ

Release: Lua script kiểm tra value còn khớp token của mình không, mới DEL
```

Tại sao release phải dùng Lua? Vì giữa lúc đọc value và lúc DEL, lock có thể đã expire và bị instance khác chiếm. Nếu DEL không check, ta xóa nhầm lock của người khác. Lua đảm bảo check và DEL là atomic.

TTL là bắt buộc — nếu client crash khi đang giữ lock và không có TTL, lock kẹt mãi → deadlock toàn cluster. TTL giải quyết deadlock, nhưng đồng thời mở ra một vấn đề mới.

### Vấn đề TTL: GC pause và split-brain

Tình huống: Client 1 lấy lock với TTL 30 giây. Đang thao tác giữa chừng, JVM bước vào full GC pause kéo dài 35 giây (chuyện thường xảy ra với heap lớn). Trong khi pause, Redis hết TTL và xóa lock. Client 2 đến, lấy lock thành công, ghi data. Client 1 hồi sinh sau GC, không biết lock đã mất, tiếp tục ghi đè lên data của Client 2. **Split-brain**.

Đây là điểm mà nhiều hệ thống "tưởng đã an toàn" thực ra vẫn sai. Có hai cách chống:

**Fencing token (đề xuất bởi Martin Kleppmann).** Mỗi lần cấp lock, trả kèm một số tăng dần (token 30, 31, 32...). Client phải gửi token này kèm theo mọi thao tác ghi. Storage layer lưu token cao nhất từng thấy và **reject mọi ghi với token cũ hơn**. Client 1 nộp token 30 nhưng DB đã có token 31 của Client 2 → ghi bị từ chối, dù Client 1 vẫn nghĩ mình giữ lock.

Hạn chế: storage phải hỗ trợ check token. Không áp dụng được với S3, third-party API không cho phép thêm logic này. Trong thực tế nhiều team dùng **idempotency key** ở application layer thay thế — dễ implement hơn, dù không bảo vệ chặt bằng fencing.

**Watchdog (Lock Extension Runtime).** Thay vì đặt TTL cố định và lo GC pause, ta cho client tự gia hạn TTL trong khi còn sống. Redisson (Java client cho Redis) implement sẵn pattern này: lock có TTL 30s, mỗi 10s background thread renew TTL về lại 30s. Khi JVM crash, thread cũng chết theo, không có ai renew nữa, lock tự expire an toàn.

Watchdog xử lý được trường hợp client chạy lâu hơn dự kiến mà không cần đoán trước thời gian. Nhưng vẫn không cứu được GC pause — pause thì watchdog cũng pause. Để chống GC pause, vẫn phải kết hợp fencing token hoặc idempotency.

### Vấn đề HA: Redis sập thì sao

Single Redis = SPOF. Redis sập, toàn bộ lock service chết. Hướng giải quyết tự nhiên là master-slave replication (Sentinel hoặc Cluster). Nhưng đây lại mở ra một vấn đề khác.

Replication trong Redis là **asynchronous**. Quy trình thường thấy:

```
1. Client A: SET lock NX → master OK
2. Master sập TRƯỚC khi replicate sang slave
3. Slave lên làm master mới, không biết Client A đang giữ lock
4. Client B: SET lock NX → master mới OK
5. Hai client cùng tin mình giữ lock → split-brain
```

Để giải quyết SPOF mà không gặp vấn đề này, antirez (tác giả Redis) đề xuất **Redlock**: dùng N node Redis master độc lập (thường N=5), client tự chạy quorum:

```
Client xin lock song song trên cả 5 node
Lock hợp lệ nếu:
  - Nhận OK từ majority (≥ 3/5 node)
  - Tổng thời gian acquire < TTL
```

Logic giống consensus quorum. Một thiểu số node chết không ảnh hưởng — vẫn đạt được majority.

Nhưng Martin Kleppmann phản bác: Redlock dựa vào **đồng hồ vật lý**. Nếu một node có clock drift (đồng hồ nhảy do NTP sync), TTL tính sai, lock có thể expire sớm/muộn không đồng bộ giữa các node. Trong hệ phân tán, thời gian là thứ không đáng tin. Debate antirez vs Kleppmann là tài liệu kinh điển — nên đọc cả hai bên trước khi dùng Redlock production.

### Khi nào dùng gì: cây quyết định

Sau tất cả các pattern, làm sao chọn?

**Nếu correctness không phải tuyệt đối** (flash sale, cron job, phần lớn use case e-commerce): Redis SET NX + TTL + Watchdog đủ tốt. Combined với idempotency key ở DB layer như "đai an toàn cuối cùng". Đây là cách Shopee, Tiki, Alibaba thực sự làm — không phải Redlock, mà Redis Cluster + Lua atomic + sharding + reservation pattern.

**Nếu correctness cực kỳ quan trọng** (financial transaction, unique invoice number, leader election): dùng **ZooKeeper hoặc Etcd**. Hai hệ thống này build trên consensus thật (ZAB/Raft), không phụ thuộc đồng hồ vật lý. ZooKeeper dùng ephemeral sequential node — session sống thì lock sống, không có TTL race. Etcd tương tự với lease.

**Nếu chỉ cần atomic operation đơn giản** (trừ stock, tăng counter): không cần lock gì cả. Atomic update của DB hoặc Redis là đủ. Phần dưới sẽ phân tích kỹ hơn.

Tóm tắt landscape:

| Tool | Nền tảng | Khi dùng |
|---|---|---|
| Redis SET NX | Single node + TTL | Best-effort lock, performance > correctness |
| Redlock | Quorum N Redis độc lập | HA cao hơn, vẫn phụ thuộc time |
| ZooKeeper | ZAB consensus + ephemeral node | Correctness tuyệt đối, latency cao hơn |
| Etcd | Raft consensus + lease | Tương tự ZK, API đơn giản hơn |
| Chubby (Google) | Paxos | Internal Google, mẫu lý thuyết cho ZK/Etcd |

#### Bài toán high-concurrency inventory deduction

Lý thuyết distributed lock đã xong. Giờ áp vào bài toán cụ thể: trừ kho khi flash sale. Mục tiêu: không oversell, latency dưới 10ms, scale đến hàng triệu request/giây.

Code ngây thơ:

```sql
SELECT stock FROM product WHERE id = 1;   -- stock = 10
IF stock >= 1 THEN
    UPDATE product SET stock = stock - 1 WHERE id = 1;
    INSERT INTO order ...;
END IF;
```

Có race condition rõ ràng — hai request cùng đọc `stock = 10`, cùng kết luận `>= 1`, cùng update. Oversell.

Có 3 hướng tiếp cận, đi từ nặng đến nhẹ:

**1. Pessimistic lock — khóa row ở DB.**

```sql
SELECT * FROM orders WHERE id = 123 FOR UPDATE;
UPDATE orders SET status = 'processing' WHERE id = 123;
```

`FOR UPDATE` giữ row lock đến khi commit. An toàn tuyệt đối, nhưng request 2, 3, 4... phải xếp hàng → bottleneck cao, có nguy cơ deadlock nếu lock nhiều row theo thứ tự khác nhau.

**2. Optimistic lock — version column.**

```sql
UPDATE orders
SET status = 'processing', version = version + 1
WHERE id = 123 AND version = 1;
```

Không khóa, mỗi request đọc version, update có điều kiện `version` chưa thay đổi. `affected_rows = 0` nghĩa là conflict, retry. Throughput cao khi conflict ít, nhưng retry storm khi conflict nhiều. Flash sale với 99% conflict rate là use case xấu nhất cho Optimistic.

**3. Atomic update — ngắn nhất, nhanh nhất.**

```sql
UPDATE orders
SET status = 'processing'
WHERE id = 123 AND status = 'pending';
```

Hoặc cho stock:

```sql
UPDATE products SET stock = stock - 1 WHERE id = 1 AND stock > 0;
```

DB tự serialize update trên cùng row. Logic check + write nằm trong 1 statement, không cần version, không cần retry, không cần lock.

#### Phân biệt Pessimistic Lock vs Optimistic Lock vs Atomic Update

Ba khái niệm dễ lẫn vì cùng giải bài toán race condition. Khác nhau ở **flow của application**, không phải SQL bề ngoài:

| | Pessimistic | Optimistic | Atomic |
|---|---|---|---|
| Cơ chế | Lock row trước khi đọc (`FOR UPDATE`) | Read → compute → CAS với version | DB tự read+compute+write trong 1 statement |
| Block thread khác | Có | Không | Không |
| Round-trip | 1+ (giữ lock) | 2 (read + write) | 1 |
| Conflict handling | Wait | Retry ở app | DB serialize, WHERE fail → 0 rows |
| Đọc giá trị cũ ở app | Có | Có | Không |
| Throughput | Thấp | Cao (khi ít conflict) | Cao |
| Deadlock risk | Có | Không | Không |
| Lock-free? | Không (blocking) | Obstruction-free (retry → livelock risk) | Lock-free thật (CAS hardware/DB) |
| Khi dùng | Multi-table tx phức tạp | Cần đọc trước rồi tính | Logic đơn giản (counter, balance, stock) |

Điểm hay nhầm: Optimistic và Atomic trông giống nhau ở SQL. Khác biệt ở chỗ:
- **Optimistic**: app SELECT version → tính toán logic trong app → UPDATE WHERE version=? → kiểm tra `affected_rows == 0` → retry. WHERE check **giá trị riêng biệt** (version) không liên quan đến compute.
- **Atomic**: app gửi 1 UPDATE, DB tự kiểm tra. WHERE check **nằm trong compute** (`stock > 0`, `balance >= amount`).

Optimistic bắt buộc khi logic phụ thuộc giá trị cũ:

```python
old_balance, fee_tier = read()
fee = calculate_fee(old_balance, fee_tier)   # logic phức tạp ở app
new_balance = old_balance - amount - fee
UPDATE ... WHERE version = ?                 # tránh race
```

Atomic không thể làm được vì DB không biết về `calculate_fee()`.

Tại sao `WHERE version = 1` cụ thể? Số 1 không hardcode — đó là giá trị app **đọc được lúc SELECT**. Hai worker cùng SELECT, cùng thấy version=1, cùng UPDATE WHERE version=1. DB chỉ 1 thành công (đổi version=2), worker còn lại nhận affected_rows=0 → biết bị conflict → retry hoặc reject.

Flash sale tại sao không dùng Optimistic? 10k request/giây, stock 100 → 9.9k request conflict → retry storm → CPU cháy. Atomic Update (`stock=stock-1 WHERE stock>0`) đủ vì logic đơn giản, DB tự serialize trên row.

#### Trade-off: thêm Redis cache layer vs DB Atomic Update

Atomic Update giải quyết được phần lớn case. Nhưng có giới hạn: Postgres/MySQL chịu được khoảng **5k-20k TPS trên 1 hot row** trước khi row lock contention engine level + WAL contention + buffer pool pressure làm DB chậm. Đủ cho 95% use case bình thường — inventory thường ngày, counter analytics, e-commerce daily traffic.

Khi **bắt buộc** phải đẩy sang cache layer:

| Tình huống | Lý do |
|---|---|
| Flash sale 100k req/s, stock 100 | DB hot row chết, cần absorb traffic |
| Response phải dưới 10ms | DB round-trip 30-50ms quá chậm |
| Traffic spike 100x | Redis 100k+ ops/s/node hấp thụ tốt hơn |
| Cross-region | Redis local mỗi region |

Triển khai cụ thể:

1. **Distributed Lock (Redlock pattern)** — `SETNX lock:key token EX 10`. Đơn giản nhưng contention cao, throughput thấp vì serialize toàn bộ.
2. **Atomic Counter Lua** — pre-warm stock vào Redis, EVAL Lua script `GET → DECR if > 0`. Sync DB async qua queue. Đây là pattern phổ biến nhất.
3. **Sharded Counter** — `stock:product:1:shard:0..N` → `hash(user_id) % N` → DECR shard tương ứng. Khi shard này hết, fallback sang shard khác. Scale ngang theo N.

Có một lập luận đáng cân nhắc: "DB atomic tận dụng infra sẵn, sao phải thêm Redis làm SPOF?" — đúng phần lớn. Đúng cho 95% use case bình thường. Đừng thêm Redis nếu chưa benchmark DB atomic không đủ. Premature optimization = thêm SPOF, thêm HA cluster, thêm consistency issue Redis ↔ DB. Nhưng sai ở extreme load (Shopee/Tiki/Alibaba tier) — DB row contention sẽ chết trước khi auto-scale kịp.

Kiến trúc thực tế của các sàn lớn không phải "thay" DB bằng Redis, mà **layer hóa**:

```
[CDN/Edge]   → reject 90% traffic (rate limit, captcha, bot detection)
     ↓
[Redis Cluster sharded + replica]  → absorb 99% còn lại (atomic DECR stock)
     ↓
[Queue: Kafka]  → async sync xuống DB (eventual consistency)
     ↓
[DB Postgres]   → chỉ nhận confirmed orders (low TPS, dễ thở)
```

Mỗi layer cắt phần lớn traffic, layer cuối cùng chỉ nhận lượng đã được lọc nhiều lần. Redis không phải SPOF nếu: Cluster mode + replica, stock có thể rebuild từ DB (idempotent reservation ID), circuit breaker fallback về DB atomic khi Redis down.

Quy tắc cuối cùng: **đừng add Redis lock layer nếu chưa benchmark DB atomic không đủ**. Đo trước, optimize sau.

### Deduplication & Idempotency

#### Bài toán bắt đầu từ đâu

Distributed Lock ngăn hai node *cùng lúc* đụng vào resource. Nhưng có một lớp vấn đề khác mà lock không giải được: **cùng một thao tác business được gửi nhiều lần qua thời gian khác nhau**. User bấm "Pay" lần đầu, mạng timeout, app retry sau 5 giây. Lúc này không có hai node cùng lúc — chỉ có một request đầu đã thành công nhưng response chưa về, và một request thứ hai mang cùng ý định business. Lock đã release từ lâu, không chặn được.

Câu hỏi interview kinh điển: *"Hệ thống payment 30.000 req/phút. Redis chết giữa lúc traffic tăng, queue backlog phình, bắt đầu xuất hiện giao dịch trùng. Nếu là người trực, em xử lý theo thứ tự thế nào?"* Câu hỏi này gói gọn cả ba bài toán: **idempotency, fault tolerance, backpressure**.

Trước khi trả lời, phải hiểu rõ: Redis chết *không tạo ra* duplicate. Duplicate luôn tồn tại sẵn ở mọi retry path (client, gateway, queue redelivery). Redis chỉ là lớp che. Mất Redis = mất lớp che → duplicate lộ ra. Đây là điểm phân biệt giữa **cache layer (optimization)** và **correctness layer (source of truth)**. Nhầm hai vai trò là root cause của hầu hết sự cố tài chính lớn.

Quy tắc nền cho money path: **correctness > availability > latency**. Khác với feed, recommendation, analytics — nơi availability ưu tiên hơn. Tài chính sai một xu là kiện, mất uy tín, fail audit.

#### Duplicate xuất phát từ đâu

Trước khi chống, phải biết kẻ thù từ đâu đến. Trong microservice cao tải, duplicate sinh ra ở **6 tầng** — tầng nào cũng thật, tầng nào cũng thấy.

**1. Client-side.**

User bấm "Pay" hai lần trước khi UI disable button. App mobile timeout 30s do mạng 3G chập chờn → retry — request đầu thật ra đã đến server, response mất trên đường về. App offline tạo order local rồi sync online, flag chưa update kịp → gửi lại. Browser back + resubmit form POST. User spam thật cũng có nhưng là case nhỏ.

**2. Network và gateway.**

Load balancer (nginx, ALB, Envoy) cấu hình `retry_on: 5xx, timeout` — upstream chậm → LB retry sang instance khác, cả hai instance xử lý. API gateway timeout 10s nhưng service xử lý 12s — gateway trả 504, client retry, service vẫn chạy xong → 2 charge. Service mesh Istio/Linkerd có default retry policy. TCP reset giữa chừng — client không biết server đã nhận.

**3. Message queue — tầng tạo duplicate lớn nhất.**

Mọi broker phổ biến (Kafka, RabbitMQ, SQS, NATS) **mặc định at-least-once**. Consumer crash trước `ack/commit offset` → broker redeliver. Visibility timeout vỡ: worker xử lý chậm hơn timeout do GC pause hoặc DB lag → broker giao message cho worker khác → 2 worker cùng chạy. Kafka rebalance giữa lúc đang process → offset chưa commit → partition assign cho consumer khác → replay. Producer retry khi broker ack mất → 2 message cùng nội dung. Manual replay từ DLQ không track đã xử lý.

Đặc biệt nguy hiểm: **dual-write inconsistency**. Service ghi DB xong rồi publish event ra broker. Crash giữa hai bước → retry → DB ghi 2 lần hoặc event publish 2 lần. Đây là root cause của rất nhiều incident production.

**4. Cross-service và saga.**

Order service gọi Payment service timeout → retry → Payment đã charge rồi → charge thêm. Saga rollback đang chạy thì forward step retry → conflict. Eventual consistency window: service A tạo order, event chưa propagate sang B → user retry → B không thấy → tạo mới. gRPC/HTTP client interceptor retry mặc định không idempotent-aware.

**5. Database và state.**

Read-after-write lag: app check "đã tồn tại order chưa" trên replica → chưa thấy do lag → insert mới → trùng. Race không có lock: hai request cùng `SELECT` thấy không có → cùng `INSERT`. Distributed lock fail do Redis chết hoặc network partition. Transaction rollback nhưng side effect đã ra (đã gọi Stripe) → retry → trùng charge.

**6. Operational và human.**

Deploy mid-flight: old pod xử lý xong nhưng SIGTERM trước khi ack → client retry → new pod xử lý lại. Cron job overlap: job chạy 5 phút, schedule mỗi 3 phút → 2 instance song song. Migration replay không check đã backfill. Multi-region active-active: user request region A failover sang region B → cả hai region xử lý.

Kết luận quan trọng: **mạng có ở đâu, retry có ở đó, duplicate có ở đó**. Mọi mutation endpoint phải idempotent — không có exception.

#### Idempotency Key — pattern Stripe

Tư tưởng: client gắn cho mỗi business action một **UUID stable** (gọi là `Idempotency-Key`), gửi qua HTTP header. Server lưu mapping `(key → response)`. Lần đầu thấy key → xử lý + lưu response. Lần sau thấy key cũ → trả response đã lưu, **không xử lý lại**.

```
POST /v1/charges
Idempotency-Key: 7c8f9a2e-1234-5678-90ab-cdef01234567

Body: { amount: 1000, currency: "VND", source: "tok_xxx" }
```

Quan trọng: client phải **generate key trước khi gửi lần đầu**, **giữ nguyên khi retry**. Nếu mỗi retry sinh key mới → mỗi retry là request riêng → mất tác dụng. Mobile app thường lưu key vào local storage gắn với draft order, xóa sau khi server confirm.

Vòng đời server-side:

```
1. Nhận request (key, body_hash)
2. SELECT FROM idempotency_store WHERE key = ?
   - Nếu chưa có:
       INSERT (key, body_hash, status='processing') -- unique constraint
       Xử lý business logic
       UPDATE (key, response, status='completed')
       Trả response
   - Nếu đã có, status='completed':
       Verify body_hash khớp (chống key collision)
       Trả response cũ
   - Nếu đã có, status='processing':
       Trả 409 hoặc đợi với timeout (request đầu chưa xong)
```

Edge cases hay bỏ sót:

- **Body hash check**: hai request cùng key nhưng body khác — không phải retry, là collision/bug. Phải reject 422, không trả response cũ. Nếu không, attacker spam cùng key với amount khác sẽ pass.
- **Race khi cả hai request cùng đến**: Phải dựa vào DB unique constraint trên key, không dựa app logic. Hai INSERT đồng thời → DB chỉ cho 1 thành công, request kia rơi vào branch "đã có".
- **TTL của key**: Stripe giữ 24h. Đủ cho mọi retry hợp lý. Quá ngắn → retry sau crash dài bị xử lý lại. Quá dài → storage phình. Trade-off theo SLA của business.
- **Storage cho idempotency**: nếu lưu Redis với TTL → Redis chết = mất lớp dedup (đúng kịch bản incident gốc). Lưu DB với unique constraint = bền nhưng chậm hơn. Pattern phổ biến: **DB là source of truth, Redis là cache nhanh** — sẽ phân tích kỹ ở phần sau.

#### Nguyên tắc vàng: idempotency càng gần persistency càng tốt

Lý do: mọi tầng trên persistency (cache, app logic, queue) đều có thể fail/race. Persistence layer = serialization point cuối cùng. DB lock + ACID transaction là nơi duy nhất guarantee được "1 lần". Càng xa persistency → càng nhiều race window → càng dễ vỡ.

So sánh các vị trí có thể đặt dedup check:

| Vị trí | Tốc độ | Độ bền | Cứu được khi nào |
|---|---|---|---|
| Client-side (button disable) | Nhanh | Yếu | Chỉ chặn double-click cùng phiên |
| API gateway | Nhanh | Yếu | Chặn retry trong 1 cửa sổ ngắn |
| Application memory cache | Rất nhanh | Mất khi restart | Chỉ trong 1 instance |
| Redis (shared cache) | Nhanh | Mất khi Redis chết | Cross-instance, single AZ |
| Database unique constraint | Chậm hơn | Bền tuyệt đối | Mọi case kể cả Redis chết |
| External provider (Stripe Idempotency-Key) | Chậm nhất | Bền | Cứu khi DB local lệch provider |

Bố trí thực tế trong production money path (defense in depth):

```
Client UUID  →  Gateway dedup window (Redis 5min)  →  App Redis check (cache)
                                                      ↓ miss/fail
                                       DB UNIQUE(idempotency_key, tenant_id)
                                                      ↓
                              External provider Idempotency-Key (Stripe)
```

Mỗi tầng cắt phần lớn traffic, tầng cuối cùng (DB unique) là **đai an toàn không bypass được**. Redis chết = chậm xuống DB, không sai. Đây là khác biệt giữa **fail open** (cho qua khi check fail — nhanh nhưng sai) và **fail closed** (reject khi check fail — đúng nhưng chậm/từ chối user). Money path luôn chọn fail closed cộng với DB constraint dưới đáy.

DB schema mẫu:

```sql
CREATE TABLE idempotency_store (
    key VARCHAR(64) NOT NULL,
    tenant_id BIGINT NOT NULL,
    body_hash VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL,         -- processing | completed | failed
    response_code INT,
    response_body JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ,
    PRIMARY KEY (tenant_id, key)
);

-- Hoặc unique trên transaction table trực tiếp
CREATE UNIQUE INDEX uq_tx_idem ON transactions (tenant_id, idempotency_key);
```

Có unique constraint, hai INSERT đồng thời cùng key → DB chỉ chấp nhận 1, cái kia nhận `unique_violation` → app catch và trả response của cái thắng. **Race ở app layer biến thành non-issue**.

#### Queue semantics: at-least-once là mặc định, exactly-once là ảo tưởng

Mọi broker production đều at-least-once. **Exactly-once delivery** trong distributed system là không tồn tại — định lý FLP (Fischer-Lynch-Paterson) và bài toán **two-generals** chứng minh.

Nhưng có một khái niệm gần đúng: **exactly-once processing**. Kafka làm được trong **trường hợp Kafka-to-Kafka**: idempotent producer (`enable.idempotence=true`) + transactional producer + `read_committed` consumer. Producer ghi nhiều topic atomic, consumer chỉ thấy committed message. Đẹp.

Nhưng payment service hiếm khi Kafka-to-Kafka. Flow thực tế: consume Kafka → charge Stripe (HTTP) → write Postgres → publish event mới. Đây là **3 system khác nhau**. Kafka EoS không bao trùm Stripe và Postgres. Nói "exactly-once" trong context payment mà không nói nuance này = sai chiến lược.

Lựa chọn đúng cho cross-system flow:

- **Idempotent consumer** = consumer tự đảm bảo xử lý cùng message nhiều lần ra cùng kết quả. Cách: check idempotency key trước khi act. Đây là responsibility của application layer, không phải broker.
- **Idempotent receiver pattern** = lưu `processed_message_ids` set, reject nếu đã thấy.

Pattern phối hợp với DB:

```python
def consume(message):
    msg_id = message.headers["idempotency-key"]
    with db.transaction():
        try:
            db.execute("INSERT INTO processed_messages (id) VALUES (?)", msg_id)
        except UniqueViolation:
            return  # đã xử lý, ack và bỏ qua

        # business logic
        charge_provider(message.payload)
        update_state(message.payload)

    broker.ack(message)
```

`INSERT processed_messages` cùng transaction với business logic. Crash giữa chừng → rollback cả hai → broker redeliver → INSERT lại thành công → retry. Crash sau commit nhưng trước ack → redeliver → INSERT fail vì đã có → skip an toàn.

#### Outbox pattern — fix dual-write

Vấn đề dual-write: ghi DB rồi publish event là **hai I/O không atomic**. Crash giữa chừng → DB có nhưng event không, hoặc ngược lại. Outbox giải:

```
1. Trong cùng transaction:
     INSERT INTO orders ...
     INSERT INTO outbox (event_type, payload, created_at, status='pending')
   COMMIT
2. Relay process (CDC như Debezium, hoặc polling):
     SELECT FROM outbox WHERE status='pending'
     Publish lên Kafka
     UPDATE outbox SET status='published'
```

Vì outbox và business data nằm cùng DB → cùng transaction → atomic. Relay phải idempotent (publish trùng cũng ok vì consumer dedup). Đây là cách Shopify, Uber, Airbnb publish event reliably.

Variant thay thế: **Transactional Outbox với CDC** — Debezium đọc WAL/binlog của Postgres/MySQL, stream sang Kafka. Không cần relay process riêng, tận dụng replication log của DB.

#### DLQ vs Retry Queue — đừng nhầm

Lỗi rất phổ biến của mid-level: gọi DLQ là "queue chứa message non-retry". Sai bản chất.

| Queue | Mục đích | Khi message vào |
|---|---|---|
| **Main queue** | Xử lý bình thường | Producer publish |
| **Retry queue (delay queue)** | Retry với exponential backoff | Consumer fail transient (5xx, network) — schedule lại sau N giây |
| **DLQ (Dead Letter Queue)** | Inspect manual, không tự retry | Vượt max retry, hoặc fail permanent (4xx, validation) — chống **poison pill** |

Phân biệt retry-able vs non-retry-able là **error classification trong consumer code**, không phải topology của queue. Permanent error (validation, business rule violated, malformed payload) → DLQ ngay không retry. Transient error (DB lag, network blip, downstream 5xx) → retry queue với backoff 1m → 5m → 30m → DLQ.

Kiến trúc 3 queue:

```
Producer → main queue → consumer
                          ├─ success → ack
                          ├─ transient fail → retry queue (delay)
                          │     └─ retry, vượt N lần → DLQ
                          └─ permanent fail → DLQ ngay (poison pill protection)

DLQ → ops dashboard → manual replay sau khi fix root cause
```

Trên RabbitMQ implement bằng TTL + Dead Letter Exchange. Trên SQS dùng `DelaySeconds` + `RedrivePolicy`. Trên Kafka thường tự build retry topic riêng + scheduler.

Manual replay từ DLQ phải đi qua đúng cùng idempotency layer như producer thường — nếu không, replay = duplicate đảm bảo.

#### Saga và multi-step idempotency

Saga là chuỗi step phân tán, mỗi step có **forward action** và **compensating action**. Ví dụ booking: reserve seat → charge card → send ticket. Crash ở step 2 → rollback step 1 (release seat).

Mỗi step phải idempotent **riêng biệt**. Lý do: orchestrator có thể retry bất kỳ step nào sau crash. Charge card retry → phải có Idempotency-Key gửi Stripe. Release seat retry → phải check seat đã release chưa, không double-release thành âm.

Compensation race: forward retry và compensation cùng chạy do orchestrator restart không nhất quán. Cách chống: **state machine** với version, mỗi transition là CAS với expected_state. Nếu state đã không còn ở `charging` mà đã sang `compensating` → forward action được biết và dừng.

#### Khi nào dùng gì: cây quyết định

Cùng kiểu cây như Distributed Lock — ánh xạ use case sang công cụ:

**Nếu request idempotent tự nhiên** (`UPDATE balance = 0`, `DELETE WHERE id=...`): không cần gì thêm. Retry bao nhiêu lần kết quả vẫn vậy.

**Nếu request không idempotent tự nhiên nhưng đơn giản** (insert order, charge card): dùng **Idempotency-Key + DB unique constraint**. Đây là 90% use case.

**Nếu cần atomic counter/stock** (flash sale): atomic update SQL hoặc Lua Redis, kết hợp reservation ID idempotent. Không cần idempotency store riêng vì op tự deterministic.

**Nếu multi-step cross-service** (booking, money transfer): saga với mỗi step có idempotency key riêng, state machine version, compensating action idempotent.

**Nếu Kafka-to-Kafka pure**: bật transactional producer + read_committed consumer + idempotent producer = exactly-once processing chính thức.

**Nếu cross-system (Kafka → DB → external API)**: idempotent consumer pattern + outbox + Idempotency-Key tới external. Không tin "exactly-once" của bất kỳ broker nào ở đây.

Tóm tắt landscape:

| Tool / Pattern | Vị trí | Khi dùng |
|---|---|---|
| Idempotency-Key (Stripe-style) | App + DB | Mọi mutation endpoint |
| DB Unique Constraint | Persistence | Đai an toàn cuối cùng, không bỏ |
| Outbox Pattern | DB + relay | Dual-write giữa DB và broker |
| Idempotent Consumer | App | Consume queue/stream |
| Kafka Transactional | Broker | Pipeline Kafka-to-Kafka |
| Saga + State Machine | Orchestrator | Multi-step distributed |
| Reconciliation Job | Background | Đối soát với external provider |

#### Incident response khi duplicate đã xảy ra

Khi đã có duplicate trên production (như scenario interview), workflow chuẩn của SRE on-call: **stop bleeding → degrade safely → recover → reconcile → postmortem**. Không nhảy thẳng vào "restore Redis" hay "xóa queue".

**Bước 1 — Stop bleeding.** Bật circuit breaker tại API ingress. Throttle rate limit xuống ngưỡng DB chịu được. Giảm consumer concurrency xuống 1 per partition (không tắt hẳn — tắt hẳn = backlog phình → flood khi resume). Mục đích: dừng tạo thêm duplicate, không cần fix ngay.

**Bước 2 — Degrade safely.** Chuyển idempotency check từ Redis sang **fail closed**: khi Redis fail thì fallback DB unique constraint, **không fail open**. Reject 503 retry-after còn hơn double charge. Đây là điểm khác biệt rõ giữa system-design tốt (có fallback path) và tệ (Redis là SPOF).

**Bước 3 — Recover Redis.** Failover Sentinel/Cluster sang replica — downtime giây. **Không restore RDB backup** trên hot path: backup lag 5-15 phút, restore mất phút đến giờ, dataset mới sau snapshot biến mất → state Redis lệch DB → idempotency check trả kết quả sai → tạo thêm duplicate. Restore RDB là last resort offline.

**Bước 4 — Reconcile.** Query DB tìm duplicate đã lọt:

```sql
SELECT idempotency_key, COUNT(*)
FROM transactions
WHERE created_at > '2026-05-08 10:00'
GROUP BY idempotency_key
HAVING COUNT(*) > 1;
```

Nhưng quan trọng hơn: **đối soát với external provider** (Stripe, VNPay, MoMo). Provider giữ tiền thật, là source of truth tuyệt đối cho money đã ra ngoài. DB local có thể lệch provider. Gọi `GET /charges?created[gte]=T`, so với DB, void/refund cho duplicate đã charge. Reconcile script phải có sẵn từ trước, không build lúc incident.

**Bước 5 — Postmortem blameless.** Root cause không phải "Redis chết" — Redis chết là trigger. Root cause là **idempotency phụ thuộc Redis, không có lớp persistent**. Action item: thêm DB unique constraint, đổi fail open thành fail closed, build reconcile job định kỳ, không chỉ chạy lúc incident.

Sai lầm phổ biến cần tránh:

- **"Xóa duplicate trong queue manually"**: nguy hiểm hơn duplicate. Có thể xóa nhầm message *chưa* xử lý → mất giao dịch thật (worse than duplicate — duplicate refund được, mất tiền user thì kiện và mất audit trail). Queue là append-only log: pause consumer, không xóa, fix idempotency layer rồi resume — replay sẽ bị DB constraint chặn an toàn.
- **"Restore Redis backup, điều chỉnh TTL"**: backup lag, restore mất phút trong khi traffic vẫn đổ → state lệch → tăng duplicate. TTL không phải cơ chế dedup, chỉ là thời gian sống của key.
- **"Tăng số replica Redis"**: không giải quyết root cause. Redis vẫn là SPOF cho correctness, chỉ là SPOF được HA hơn.

#### Tóm tắt chiến lược

| Layer | Kỹ thuật | Vai trò |
|---|---|---|
| Client | Idempotency-Key UUID stable | Nguồn dedup token |
| Gateway | Rate limit + retry policy idempotent-aware | Cắt retry storm sớm |
| App cache | Redis check (fail closed) | Fast path, không phải correctness |
| Persistence | **DB UNIQUE constraint** | **Đai an toàn cuối cùng** |
| Queue | Idempotent consumer + outbox | Chống at-least-once + dual-write |
| External | Provider Idempotency-Key | Đối soát money đã ra ngoài |
| Background | Reconciliation job định kỳ | Bắt sai lệch sót |

Câu chốt cho interview và cho thiết kế thực tế:

> **Mạng có ở đâu, retry có ở đó, duplicate có ở đó.** Mọi mutation endpoint phải idempotent. Idempotency phải có lớp persistent (DB unique), Redis chỉ là fast path. Money path: correctness > availability. Fail closed, không fail open.

## Distributed Counting

### Bài toán

Tưởng tượng một video TikTok bất ngờ viral. Trong vài phút đầu, hàng triệu người cùng xem, cùng like, cùng share. Hệ thống cần đếm — và phải đếm chính xác, hoặc ít nhất "đủ chính xác" — để hiển thị view count, ranking trending, trả tiền cho creator.

Code đếm view đơn giản:

```sql
UPDATE stats SET views = views + 1 WHERE video_id = 1;
```

Trên một server thử nghiệm, câu lệnh này chạy 0.5ms. Vấn đề xuất hiện khi scale lên: cùng một row bị triệu request cùng update. Postgres hay MySQL chỉ chịu được khoảng **10k-20k TPS trên cùng một hot row** trước khi row lock contention làm chậm toàn bộ DB. Một video viral với 100k view/s sẽ làm DB chết, kéo theo mọi service khác đang dùng chung DB cũng chết theo.

Làm sao đếm với throughput cao, latency thấp, không sụp DB, mà vẫn đủ chính xác cho business cần?

#### Cần đếm chính xác đến đâu ((YouTube view count hiển thị "1.2M views" không cần chính xác đến từng đơn vị. Twitter like count viral hiển thị "523K" cũng không ai để ý sai số 0.1%. Ngược lại, đếm số lần user đã refund — sai 1 cái cũng là vấn đề pháp lý.))

Cần cân bằng:

- **Accuracy** — chính xác đến đâu là đủ. Số tiền: phải tuyệt đối. View count: 99% đủ. Unique visitor: sai số 1-2% chấp nhận được.

- **Throughput vs Latency** — bao nhiêu count/giây, và user cần thấy số mới nhanh đến đâu. UI realtime: dưới 1 giây. Analytics dashboard: vài phút trễ ok. Báo cáo cuối tháng: trễ vài giờ ok.

### Hướng tiếp cận đầu tiên: chia nhỏ hot row — Sharded Counter

Vấn đề DB nằm ở **hot row contention** — quá nhiều thread cùng update 1 row. Nếu vấn đề là 1 row, thì giải pháp là chia thành nhiều row.

Thay vì 1 counter cho video, ta tạo N counter:

```
counter:video:1:shard:0 = 1523
counter:video:1:shard:1 = 1487
counter:video:1:shard:2 = 1501
...
counter:video:1:shard:N = 1502
```

Khi có request mới, hash ngẫu nhiên vào shard nào đó và `INCR` shard đó. Khi cần đọc tổng, `SUM` tất cả shards lại. ((Với N=100 shards, mỗi shard chỉ nhận 1/100 traffic. 100k view/s chia đều thành 1k/s mỗi shard — thoải mái cho DB. Đây là pattern Google Datastore document chính thức, DynamoDB cũng khuyến nghị tương tự.
))

```
write: shard_id = hash(request_id) % N → INCR shard_id
read:  total = sum(counter:video:1:shard:0..N)
```

Cái giá phải trả: **read trở nên đắt hơn**. Đọc tổng phải SUM toàn bộ N shards. Nếu read nhiều hơn write, sharded counter không đáng. Nó phù hợp khi write-heavy (analytics ingestion, view counting) hơn là read-heavy (đếm số follower hiển thị mọi profile).

### Khi DB không đủ nhanh: Write-back Cache

Sharded counter giảm contention, nhưng vẫn round-trip DB mỗi increment. DB round-trip thường 10-30ms — quá chậm cho UI realtime.

Bước tiếp theo: **đẩy counter vào memory layer (Redis)**, async flush xuống DB sau: ((Đây chính là cách YouTube xử lý. View count hiển thị trên UI là số từ Redis (hoặc cache layer tương tự), realtime nhưng "tạm thời". Số "chính thức" (sau anti-spam, dedup) được tính lại bằng batch job mỗi giờ và update DB.))

```
Request → Redis INCR counter:video:1   (≈1ms, atomic)
       → trả response ngay
       
Background job mỗi 1-5 giây:
       → đọc Redis delta, flush vào DB
       → DB là source of truth lâu dài, Redis là live counter
```

Trade-off rõ ràng: Redis crash giữa flush → mất delta giai đoạn đó. Phòng ngừa bằng AOF persistence + replica. Eventual consistency cũng phải chấp nhận — đọc DB không thấy số mới ngay.

### Cần vừa nhanh vừa scale: streaming pipeline

Sharded counter và Redis write-back vẫn assume một logic đồng bộ "mỗi event → tăng counter ngay". Khi quy mô lên hàng tỷ event/ngày, cách tiếp cận khác xuất hiện: **batch và aggregate**.

Thay vì đếm từng event, gom thành stream và để hệ thống streaming xử lý:

```
[App] → log event vào Kafka
                ↓
        [Flink / Spark Streaming]
                ↓
        aggregate theo window 1s / 5s / 1 phút
                ↓
        sink vào ClickHouse / Druid / BigQuery
```

Kafka đảm bảo durability và ordering trong partition. Flink/Spark dùng tumbling window hoặc sliding window để gom event và tính counter. Sink là OLAP DB chuyên cho analytics query.

- Lợi ích: scale ngang gần như vô hạn (thêm partition, thêm worker), tách biệt rõ ingestion và query, query phức tạp được hỗ trợ tốt (group by, time-range, top-K).

- Vấn đề: latency end-to-end thường vài giây đến vài phút. Không phù hợp UI realtime nhưng tuyệt vời cho dashboard analytics, billing, ad impression counting. Twitter timeline metric, Netflix view tracking đều dùng pipeline này.

### Khi không cần chính xác: probabilistic counting

Mọi pattern trên đều cố giữ chính xác. Nhưng có những bài toán mà chính xác là **không cần thiết** — và đôi khi không khả thi.

Ví dụ: đếm unique visitor mỗi ngày. Site có 100 triệu user, mỗi user có thể visit nhiều lần. Cách "chính xác" là giữ một `Set<user_id>`, mỗi visit thêm vào, cuối ngày đếm size. Nhưng `Set` cho 100M user tốn ~800MB memory **cho mỗi ngày, mỗi metric**. Không scale.

Đây là lúc dùng **probabilistic data structures**. Đổi accuracy lấy memory + speed:

| Thuật toán | Mục đích | Sai số | Memory |
|---|---|---|---|
| **HyperLogLog (HLL)** | Đếm unique (cardinality) | ~0.81% | 12KB cho 10^9 unique |
| **Count-Min Sketch** | Đếm tần suất từng key | overcount nhẹ | KB-MB |
| **Bloom Filter** | Đã thấy phần tử này chưa | false positive | KB |
| **Top-K / Heavy Hitter** | Top phần tử nhiều nhất | ~1% | KB |

Với HyperLogLog, đếm 1 tỷ unique chỉ tốn 12KB — gấp 60.000 lần ít hơn `Set`. Sai số 0.81% nghĩa là đếm 1.000.000 thực tế trả về khoảng 992k-1008k. Đủ tốt cho 99% bài toán "đếm unique". 
((Reddit dùng HLL đếm "users online", Google Analytics dùng cho realtime unique visitor, mọi rate limiter quy mô lớn đều dùng probabilistic structure ở một layer nào đó.))

Redis hỗ trợ HLL native:

```redis
PFADD visitors:2026-05-07 user_id_1
PFADD visitors:2026-05-07 user_id_2
PFCOUNT visitors:2026-05-07   → ~1.2M (sai số dưới 1%)
```
<!-- 
### Khi đếm xuyên region: CRDT

Mọi pattern trên giả định một datacenter. Khi service global (US, EU, Asia), counter phải đồng bộ giữa các region. Chạy consensus (Raft) cho mỗi increment qua xuyên Thái Bình Dương — quá chậm, latency 200-300ms mỗi lần count.

Giải pháp: **CRDT (Conflict-free Replicated Data Type) counter**. Mỗi region giữ counter local, định kỳ gossip với region khác để merge. Phép merge phải **commutative và idempotent** — gửi cùng update nhiều lần, theo thứ tự nào, kết quả cuối cùng vẫn giống nhau.

```
Region US: G-Counter = {us: 100, eu: 0,   asia: 0}
Region EU: G-Counter = {us: 0,   eu: 200, asia: 0}

After gossip merge (lấy max từng key):
   All:    G-Counter = {us: 100, eu: 200, asia: 0} → total = 300
```

G-Counter (grow-only) chỉ cho phép increment. PN-Counter (positive-negative) cho phép cả decrement bằng cách giữ 2 G-Counter (một cho +, một cho -).

Riak, Redis CRDT (Redis Enterprise), AntidoteDB implement sẵn. Dùng cho global like count, multi-region rate limiter, cross-DC analytics. Trade-off: eventual consistency — region đọc số khác nhau cho đến khi gossip xong. -->

### Khi đếm dùng làm rate limit

Rate limiter là một dạng đặc biệt của distributed counting: đếm + so với ngưỡng + reset theo thời gian. Mỗi thuật toán có trade-off riêng:

- **Fixed Window** đơn giản nhất: `INCR key:user:123:minute:42`, EXPIRE 60s. Vấn đề: burst ở rìa window. User gửi 100 request lúc 12:00:59, rồi 100 request nữa lúc 12:01:00 — bypass được limit 100/phút thành 200 request trong 1 giây.

- **Sliding Window Log** chính xác nhất: lưu timestamp mỗi request vào sorted set, đếm số timestamp trong window 60s gần nhất. Memory tốn — mỗi request 1 entry.

- **Sliding Window Counter** dung hòa: kết hợp counter của window trước và window hiện tại với trọng số theo thời gian đã trôi. Approximate nhưng memory thấp, không có burst ở rìa.

- **Token Bucket** cho phép burst có kiểm soát: bucket có capacity C, refill rate R token/giây. Mỗi request lấy 1 token; hết token thì reject. User được phép burst đến C request, sau đó throttle theo R. Phù hợp API yêu cầu thân thiện với burst.

- **Leaky Bucket** ngược lại: queue FIFO, drain rate cố định. Output luôn smooth, dù input burst. Phù hợp rate limiter cho downstream service nhạy cảm với spike.

Implement Token Bucket atomic trên Redis bằng Lua script: ((Lua script chạy atomic trên Redis — không lo race condition giữa các check.))

```lua
local tokens = redis.call('GET', KEYS[1]) or capacity
local last_refill = redis.call('GET', KEYS[2])
local now = tonumber(ARGV[1])
tokens = math.min(capacity, tokens + (now - last_refill) * rate)
if tokens >= 1 then
  tokens = tokens - 1
  redis.call('SET', KEYS[1], tokens)
  redis.call('SET', KEYS[2], now)
  return 1
else
  return 0
end
```

### Chống overcounting và undercounting

Khi đếm phân tán, sai sót đến từ nhiều nguồn. Mỗi loại có giải pháp riêng:

- **Retry tạo duplicate.** Client retry vì timeout, nhưng request đầu tiên thực ra đã success ở backend → count 2 lần. Giải pháp: idempotency key (request_id) — backend dedup theo key này, count chỉ 1 lần dù request đến nhiều lần.

- **Crash giữa increment.** App tăng counter, persist log, rồi crash giữa chừng. Giải pháp: WAL/AOF persistence + at-least-once delivery + idempotent operation. Đảm bảo tăng đúng 1 lần dù replay nhiều lần.

- **Network partition gây double-write.** Hai region cùng tăng counter trong khi mất kết nối, khi reconnect không biết merge thế nào. Giải pháp: vector clock, hoặc CRDT (merge bằng max thay vì sum).

- **Bot/spam inflate count.** View count giả, like fake. Giải pháp: anti-spam pipeline (rule-based + ML) trước khi vào counter — không phải sửa counter sau.

### Một số bài toán thực tế

**"Design YouTube view count."**: Tầng anti-spam đầu tiên (chỉ count view >30 giây, dedup theo `(user_id, video_id, time_bucket)`). Tầng tiếp theo Kafka ingest + Flink aggregate per minute. Redis làm hot counter cho UI realtime. Cassandra/Bigtable persistent layer, batch job mỗi giờ verify và update số "official". UI hiển thị approximate ngay, "official" sau khi anti-spam batch xong.

**"Design rate limiter cho 1M req/s."** — Sharded Redis Cluster theo `user_id`. Token Bucket Lua atomic per shard. Khi Redis down, fallback về local in-memory counter (degraded, lenient — cho qua thay vì block toàn bộ). Cross-DC dùng CRDT counter merge, chấp nhận hơi over-limit để không cần consensus xuyên DC.

**"Đếm unique visitor 1 ngày, 100M user, budget 100MB."**: HyperLogLog: 100M unique chỉ tốn ~12KB, dư budget gấp 8000 lần. Set: 100M × 8 bytes = 800MB, vượt budget. Trade 1% accuracy lấy 60.000x memory saving — bargain quá tốt.

**"Like count realtime, 100k like/s trên post viral."** KHÔNG dùng DB atomic — hot row contention chết DB. Sharded Redis counter (N=100 shards), `INCR` shard ngẫu nhiên. Background flush DB mỗi 5 giây bằng delta merge. UI poll `SUM(shards)` qua proxy cache 1 giây để giảm read amplification.

**"Đếm distinct events trong sliding window 1 phút."**: Sliding HyperLogLog: tạo 1 HLL per second bucket, merge 60 bucket cho window 1 phút. Memory: 60 × 12KB = 720KB cho 1 entity — vẫn nhẹ. Khi window trượt, drop bucket cũ nhất, thêm bucket mới.

Nguyên tắc xuyên suốt: **đừng over-engineer**. DB atomic đủ cho 95% bài toán đếm hàng ngày. Chỉ thêm Redis/sharding/HLL khi đo benchmark cho thấy DB không kịp. Premature optimization sẽ chỉ thêm SPOF, thêm consistency issue, thêm operational cost mà không giải quyết vấn đề thực sự.

## Distributed Scheduling (Multiple Schedule Node)

### Bài toán

Hình dung một dịch vụ thanh toán. Mỗi đêm 3h sáng, hệ thống cần đối soát giao dịch với ngân hàng — gọi API ngân hàng, đối chiếu từng transaction, cập nhật trạng thái. Code rất đơn giản:

```java
@Scheduled(cron = "0 0 3 * * *")
public void reconcile() {
    callBankApi();
    updateTransactions();
}
```

Khi mới deploy 1 server, mọi thứ chạy mượt. Nhưng để đảm bảo HA và scale, ta deploy 3 pod trên Kubernetes. Đến 3h sáng, **cả 3 pod cùng tỉnh dậy và chạy job**. Kết quả: gọi API ngân hàng 3 lần, vượt rate limit, transaction bị mark trùng, có khi double refund cho khách.

Đây là bài toán **Distributed Scheduling**: làm sao để N instance cùng chạy mà chỉ 1 instance thực thi job tại mỗi lần trigger.
((Bản chất nó không khác gì bài toán mutual exclusion ở phần trước chỉ là context thay đổi. Thay vì lock một resource, ta cần lock một time slot của job))

Câu hỏi tự nhiên đầu tiên: tại sao không tách 1 server riêng chỉ để chạy cron, các server khác lo serve traffic?

Cách này hoạt động cho app nhỏ. Nhưng nó tạo ra single point of failure — server cron chết, mọi job đứng. Khi quy mô lớn lên, ta lại phải HA cho chính node cron đó, và bài toán quay về điểm xuất phát: nhiều instance chạy cùng lúc.

Vì vậy, hướng đi chính xác là **để mọi instance đều có scheduler, nhưng phải có cơ chế phối hợp** để chỉ 1 instance thực thi tại mỗi tick.

### Hướng tiếp cận đầu tiên: lock trên database — ShedLock

Ý tưởng: trước khi chạy job, instance nào cũng phải "giành" một row trong DB. Ai update row thành công thì chạy, ai thất bại thì skip. Đây chính là Optimistic Lock đã nói ở phần trên, áp dụng cho scheduler.

ShedLock là thư viện Java đóng gói sẵn pattern này. Nó không phải scheduler — nó chỉ thêm một lớp lock vào `@Scheduled` của Spring có sẵn:

```java
@Configuration
@EnableScheduling
@EnableSchedulerLock(defaultLockAtMostFor = "10m")
public class SchedulerConfig {
    @Bean
    public LockProvider lockProvider(DataSource dataSource) {
        return new JdbcTemplateLockProvider(dataSource);
    }
}

@Scheduled(cron = "0 0 3 * * *")
@SchedulerLock(name = "paymentReconciliation",
               lockAtMostFor = "30m",
               lockAtLeastFor = "1m")
public void reconcile() {
    // Chỉ 1 instance chạy, các instance khác skip lặng lẽ
}
```

Bên trong, ShedLock dùng một SQL atomic CAS:

```sql
CREATE TABLE shedlock (
  name VARCHAR(64) PRIMARY KEY,
  lock_until TIMESTAMP NOT NULL,
  locked_at TIMESTAMP NOT NULL,
  locked_by VARCHAR(255) NOT NULL
);

UPDATE shedlock
SET lock_until = ?, locked_at = ?, locked_by = ?
WHERE name = ? AND lock_until <= now();
```

Instance nào nhận `affected_rows = 1` thì thắng và chạy. Các instance khác nhận 0 và bỏ qua.

Hai tham số quan trọng cần hiểu rõ:

- `lockAtMostFor` là thời gian tối đa instance giữ lock. Nếu instance crash giữa job, lock sẽ tự expire sau khoảng này, instance khác mới có cơ hội pick lên. Đặt quá ngắn — chưa kịp xong job đã có instance khác chen vào, gây duplicate. Đặt quá dài — crash xong job kẹt mãi không ai chạy lại được. Quy tắc: bằng worst-case execution time cộng buffer.

- `lockAtLeastFor` ngăn case lock được giữ quá ngắn. Tưởng tượng job xong sau 100ms, instance lập tức release lock, instance khác đang sleep cùng cron tỉnh dậy chậm 200ms → vẫn pick được lock → chạy lại. `lockAtLeastFor = 1m` ép lock giữ tối thiểu 1 phút dù job xong sớm.

ShedLock đơn giản, setup 5 phút, không cần thêm hạ tầng. Nhược điểm: chỉ Java ecosystem, và rất khó cấu hình `lockAtMostFor` chuẩn cho job kéo dài hàng giờ.

### Distributed lock thuần

Pattern của ShedLock thực ra là distributed lock cơ bản. Bất kỳ ngôn ngữ nào cũng làm được nếu có Redis hoặc ZooKeeper.

Phiên bản Redis trông như sau:

```python
def send_emails():
    token = uuid.uuid4()
    lock = redis.set("lock:email_job", token, nx=True, ex=600)
    if not lock:
        return
    try:
        run_job()
    finally:
        # Lua script CAS: chỉ delete nếu token còn khớp
        if redis.get("lock:email_job") == token:
            redis.delete("lock:email_job")
```

Đến đây xuất hiện một vấn đề mà Martin Kleppmann từng cảnh báo về Redlock: **TTL expire không có nghĩa là job đã xong**. Job có thể bị stop-the-world GC pause 30 giây, hoặc network partition. TTL expire trong khi job vẫn đang chạy → instance khác pick lock → hai instance cùng chạy đồng thời.

Cách chống là **fencing token**: mỗi lần acquire lock trả về một số tăng dần. Mỗi lần ghi xuống downstream (DB, API), gửi kèm token. Downstream lưu token cao nhất từng thấy, reject mọi request có token cũ hơn. Với cách này, dù 2 instance cùng chạy, chỉ instance có token mới được commit.
((Nếu không muốn implement fencing thủ công, dùng ZooKeeper ephemeral sequential node. Mỗi instance tạo \`/locks/job1/lock-\`, ZK gán sequence number tự động. Instance có sequence nhỏ nhất là leader. Khi instance crash hoặc mất kết nối, ephemeral node tự động bị xóa, instance kế tiếp lên thay. ZK an toàn hơn Redlock cho job dài vì TTL gắn với session — session sống thì lock sống, không phụ thuộc heartbeat tự renew.
))
### Khi cluster có nhiều job: leader election

Khi số lượng job tăng lên 20-50 cron khác nhau, lock từng job trở nên rườm rà. Hướng tiếp cận khác: **bầu một leader cho toàn cluster, chỉ leader chạy mọi job**.

```
3 pod: pod-A (leader), pod-B (follower), pod-C (follower)
pod-A chạy toàn bộ @Scheduled
pod-B, pod-C không kích hoạt scheduler
pod-A crash → ZK/Etcd phát hiện → pod-B/C bầu leader mới
```

Các tool phổ biến: ZooKeeper Curator `LeaderLatch`, Etcd lease (Kubernetes Lease object dùng cho `leader-election`), Hazelcast cluster, Spring Cloud Kubernetes Leader Election.

Lợi ích: logic đơn giản — không phải nghĩ về lock cho từng job. Cái giá phải trả: leader làm hết, các follower idle về mặt scheduler. Khi leader chết, có khoảng thời gian failover (heartbeat timeout 5-30 giây) khiến job có thể miss schedule. Phù hợp khi cluster nhỏ và utilization scheduler không quan trọng.

### Khi job nặng: tách trigger khỏi execution

Mọi giải pháp trên giả định một instance chạy hết job. Nhưng nếu job phải gửi 1 triệu email mỗi 5 phút, một instance không xử lý kịp.

Đến đây cần **tách scheduler trigger khỏi job execution**:

```
[1 instance scheduler]                  
  ShedLock đảm bảo chỉ 1 trigger        
        ↓                               
  publish 1M event vào Kafka            
        ↓                               
[N consumer worker] consume parallel    
  Kafka consumer group đảm bảo          
  mỗi message chỉ 1 worker xử lý        
```

Trigger vẫn cần lock (vẫn dùng ShedLock cho phần nhẹ này). Phần nặng — execution — được Kafka chia đều cho N worker. Worker thêm/bớt thoải mái, Kafka rebalance tự động. Retry, DLQ, offset commit lo việc đảm bảo at-least-once.

Khi job xử lý theo entity (sync 100 triệu user, đối soát 10 triệu transaction), ta đẩy thêm một bước: **partition theo entity_id**. `hash(user_id) % partition_count` quyết định message đi vào partition nào. Mỗi partition chỉ 1 worker, nên mỗi user chỉ 1 worker xử lý, lại có ordering trong partition (event của user đó được xử lý theo thứ tự). Scale tuyến tính bằng cách tăng partition và worker.

Đây là cách Shopee/Tiki xử lý batch reconciliation cuối ngày — không phải 1 server chạy 8 tiếng, mà 1 trigger node + 100 worker chạy song song trong 5 phút.

### Khi workflow phức tạp: scheduler chuyên dụng

Đến một mức độ phức tạp nào đó, dependency giữa các job xuất hiện: job A xong mới chạy job B, job B fail thì job C compensate. Tự build trên ShedLock + Kafka rất tốn công. Đây là lúc dùng scheduler chuyên dụng:

**Quartz Cluster** — Java enterprise classic. Dùng JDBC table làm shared state, các Quartz instance tự bầu leader cho mỗi trigger. Hỗ trợ misfire handling, persistent job, retry. Tương tự ShedLock nhưng đầy đủ hơn — và phức tạp hơn.

**Apache Airflow** — DAG-based scheduler cho data pipeline. Mỗi job là một DAG, có dependency rõ ràng giữa task. Phù hợp ETL, batch processing.

**Temporal / Cadence** — workflow as code, durable execution. Code workflow như code thường, framework lo retry, timeout, state persistence dù service crash giữa chừng. Phù hợp long-running business workflow như order fulfillment, booking system.

**AWS EventBridge / Google Cloud Scheduler** — managed cron service. Trigger HTTP/Lambda/SNS theo cron. Không phải lo HA hay infra. Phù hợp serverless, ít tự host.

### Chọn solution thế nào

Quy tắc đơn giản: **dùng cái rẻ nhất đủ giải quyết bài toán**.

| Tình huống | Solution |
|---|---|
| 1 job nhỏ, app Spring Boot | ShedLock |
| 1 job nhỏ, ngôn ngữ khác | Redis/ZK lock |
| Nhiều job, cluster nhỏ | Leader election |
| Job nặng, có thể chia task | ShedLock trigger + Kafka worker |
| Job xử lý theo entity, batch lớn | Kafka consumer group partition |
| Workflow phức tạp, có dependency | Airflow / Temporal |
| Serverless, không muốn tự host | EventBridge / Cloud Scheduler |

### Những cái bẫy phải tránh

Sau khi chọn được solution, vẫn còn nhiều cái bẫy cụ thể:

**Clock skew.** Mỗi node có đồng hồ riêng, lệch nhau vài giây là bình thường. Node A trigger sớm hơn node B 10 giây — nếu lock TTL ngắn, có thể overlap. Luôn dùng `now()` ở DB (single source of truth) thay vì `System.currentTimeMillis()` ở app. NTP sync là bắt buộc.

**Idempotency là bắt buộc, không phải tùy chọn.** Lock không bao giờ guarantee 100%. TTL expire, network partition, GC pause đều có thể khiến 2 instance chạy đồng thời. Cách phòng vệ cuối cùng là job phải idempotent — kiểm tra `processed_at` trước khi xử lý từng record, hoặc dùng unique constraint ở DB để chống insert trùng.

**Long-running job với TTL ngắn.** Job chạy 20 phút, lock TTL 10 phút — sau 10 phút lock expire, instance khác pick lên, chạy lại từ đầu. Giải pháp là **heartbeat extend** lock định kỳ. Redisson có Watchdog tự renew TTL mỗi 1/3 chu kỳ khi job còn chạy.

**Crash giữa job, không có recovery.** Instance đang xử lý 1000 record, làm xong 500 thì crash. Instance kế chạy lại từ đầu → 500 record duplicate. Giải pháp là **checkpoint progress** — lưu `last_processed_id` mỗi 100 record, resume từ checkpoint khi restart.

**Misfire khi cluster down.** Cluster chết 1 giờ, miss 12 lần job chạy mỗi 5 phút. Khi sống lại, làm gì? Có 3 strategy: skip all (chỉ chạy lần tới), run once (catch-up 1 lần), run all (chạy đủ 12 lần). Quartz có `MisfireInstruction` config sẵn. Lựa chọn tùy ngữ nghĩa job — incremental sync chỉ cần run once, billing thì cần run all.

**Time zone.** Server thường chạy UTC, nhưng business logic của Việt Nam là giờ VN. `cron = "0 0 3 * * *"` ở UTC = 10h sáng VN. Luôn explicit timezone:

```java
@Scheduled(cron = "0 0 3 * * *", zone = "Asia/Ho_Chi_Minh")
```

### Câu hỏi phỏng vấn thường gặp

**"Có 3 pod K8s cùng có `@Scheduled`, làm sao đảm bảo chỉ 1 pod chạy?"** — Đây là câu mở đầu kinh điển. Trả lời: ShedLock với JDBC provider, giải thích cơ chế UPDATE atomic, ý nghĩa `lockAtMostFor`/`lockAtLeastFor`, và quan trọng nhất là tại sao job vẫn cần idempotent.

**"Job chạy 2 giờ, instance crash sau 1 giờ, làm sao recovery?"** — Câu này test hiểu sâu. Trả lời: checkpoint progress + idempotent processing, kết hợp heartbeat extend lock (Redisson Watchdog), hoặc tốt hơn là chia job thành sub-task qua queue để mỗi sub-task ngắn và replay được.

**"Schedule trigger gửi 100k email mỗi 5 phút, scale thế nào?"** — Câu này test kiến trúc. Trả lời: tách trigger khỏi execution. 1 trigger node (ShedLock) publish vào Kafka, N worker consume parallel. Trigger nhẹ và đơn giản, execution scale ngang.

**"Nếu cluster mất leader thì sao?"** — Câu này test trade-off availability. Trả lời: heartbeat timeout 10-30 giây để re-election, trong khoảng đó job có thể miss schedule. Trade-off giữa liveness (phát hiện chết nhanh) và safety (không bầu nhầm leader khi network glitch tạm thời).

**"Tại sao không dùng Redlock cho scheduler critical?"** — Câu này test sâu về failure mode. Trả lời: TTL expire không đồng nghĩa job đã xong (Kleppmann's critique). Cần fencing token + downstream check, hoặc dùng ZK ephemeral node — session-based lock an toàn hơn TTL-based với job dài.

## Fault Tolerance & Recovery: cách duy trì hoạt động ổn định, nhất quán dữ liệu và availability cao dù failures. 

### Fault Tolerance: tập trung vào việc tiếp tục chạy 

* Cách hoạt động:  
    * Detection (Phát hiện): Giám sát liên tục qua heartbeat hoặc timeout 
    * Diagnosis (Chẩn đoán): Xác định loại lỗi: crash, Byzantine (node gian dối), omission (mất tin nhắn) hoặc network partition (mạng chia cắt). Dùng log analysis hoặc tracing tools 
    * Isolation/Containment: Ngăn lỗi lan bằng cách loại node lỗi khỏi cluster (circuit breaker pattern trong microservices) hoặc failover (chuyển traffic sang node lành). 
    * Mitigation/Recovery (Giảm thiểu/Khôi phục): Áp dụng redundancy để tiếp tục, rồi repair (restart node hoặc thay thế). 

* Kỹ thuật chính: 
    * Redundancy (Dư thừa): Replication dữ liệu/state qua nhiều nodes (active-active hoặc active-passive). Ví dụ: Raft/Paxos replicate log để chịu f failures trong 2f+1 nodes.((Công thức 2f+1: cần majority = f+1 votes để commit. Chịu 1 node fail cần 3 nodes; chịu 2 fail cần 5 nodes. etcd production thường dùng 3 (chịu 1 fail) hoặc 5 (chịu 2 fail). 7 nodes trở lên ít dùng vì latency tăng mà lợi ích fault tolerance nhỏ.))
    * Failover và Load Balancing: Tự động chuyển sang standby nếu primary fail (như AWS ELB detect và reroute traffic). Kết hợp auto-scaling để thêm nodes khi tải cao. 
    * Graceful Degradation: Giảm chức năng tạm thời (ví dụ: Netflix chuyển sang cache-only mode nếu database fail, vẫn cho xem phim nhưng không update profile). 

### Recovery : việc sửa chữa và quay lại trạng thái đúng 

* Cách hoạt động:  
    * Backward Recovery: rollback state trước lỗi dùng log/checkpoint để undo changes. 
    * Forward Recovery: Tiếp tục từ lỗi bằng cách redo từ redundancy, không cần quay lại. 

* Kỹ thuật chính:  
    * Checkpointing:  
        * Lưu snapshot state định kỳ vào stable storage (disk hoặc cloud).  
        * Khi fail, load checkpoint và replay log từ đó 

    * Logging:  
        * Ghi mọi operation vào log trước apply (Write-Ahead Logging - WAL).  
        * Types: Physical (byte-level changes), Logical (high-level ops như "update user=1"), Physiological (kết hợp).  
        * Sau fail, replay log để recover. 

    * Shadow Paging:  
        * Tạo copy pages khi write, chỉ switch khi commit (như Git branching) 
        * Nhanh nhưng tốn space. 

    * Quorum-Based Recovery:  
        * Dùng majority vote từ replicated nodes để quyết định state đúng (như Raft recover leader từ log followers). 

    * ARIES (Algorithm for Recovery and Isolation Exploiting Semantics): Kỹ thuật recovery tiên tiến cho database, dựa WAL, hỗ trợ fine-granularity locking và partial rollback. ARIES chia 3 phases:  
        * Analysis: Scan log từ checkpoint cuối cùng để xác định transactions active/dirty pages tại crash, xây Dirty Page  Table và Transaction Table. 
        * Redo: Lặp lại (redo) tất cả operations từ checkpoint để đưa database về state tại crash (forward recovery), dùng LSN (Log Sequence Number) để tránh redo thừa.((LSN là số tăng dần duy nhất. Mỗi page lưu pageLSN = LSN của log record cuối đã apply lên page. Khi redo: nếu logRecord.LSN <= page.pageLSN → page đã có thay đổi đó, skip. Tránh redo thừa khi page đã được flush ra disk trước crash.))
        * Undo: Quay lại (undo) transactions unfinished bằng cách rollback từ end-of-log ngược lại. ARIES dùng Compensation Log Records (CLRs) để track undo mà không redo undo, hỗ trợ nested transactions và independent page recovery. 

## Durability & Storage Layer 

...