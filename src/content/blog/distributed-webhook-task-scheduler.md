---
title: "Distributed Task Scheduler — Webhook Delivery (IPN service)"
pubDate: "2026-05-28"
published: true
contents_table: true
pinned: false
description: "Ghi chú về IPN service"
cat: "misc"
useKatex: false
---
# Distributed Task Scheduler — Webhook Delivery (IPN service)
IPN service ở đây là dịch vụ "Instant Payment Notification" / webhook delivery của hệ thống payment gateway.

## Bối cảnh nghiệp vụ

- Nhận các sự kiện cần báo cho merchant (payment succeeded, refund, chargeback...) từ hệ thống nội bộ.
- Chuyển các sự kiện đó thành các “webhook job” và lưu vào DB.
- Định tuyến, ký và gửi HTTP callback tới URL của merchant.
- Quản lý retry, trạng thái thành công/thất bại, replay khi cần.
- Cung cấp API quản trị / merchant để xem trạng thái, replay, kiểm tra lịch sử webhook.

Khi thanh toán / hoàn tiền thay đổi trạng thái, **core-payment** publish sự kiện lên Kafka. **pg-ipn-service** phải **POST webhook** tới URL merchant đã cấu hình — tương tự IPN/notification B2B. Merchant cần nhận thông báo **đáng tin cậy**.

## Lí do tách service

- Độc lập hoá luồng webhook với core payment: webhook là một concern riêng, có vòng đời và SLA khác.
- Khả năng scale khác: lượng webhook có thể rất lớn và dao động, không nên ảnh hưởng tới service xử lý giao dịch.
- Độ tin cậy: job queue + retry logic cần mức ổn định, tách riêng giúp giảm rủi ro.
- Dễ triển khai, vận hành: deploy riêng, bảo trì không ảnh hưởng trực tiếp tới payment transaction.
- Bảo mật: webhook ra ngoài internet cần layer riêng, signature, auth, hạn chế surface attack.

==> Kafka là một hệ thống messaging rất tốt cho truyền event nội bộ, nhưng gửi webhook ra ngoài (HTTP tới merchant) có những yêu cầu khác (durability per-delivery, status/metrics/audit, retry policy, rate-limit, admin replay, transactional outbox) 

Tóm lại, IPN service ở đây là thành phần trung gian quan trọng để đảm bảo các sự kiện payment được chuyển tới merchant một cách đáng tin cậy, có retry và quản lý lịch sử. Vì vậy nó thường được tách ra làm service riêng để dễ scale, vận hành và cô lập với các luồng payment khác.

## Vấn đề kỹ thuật

Cùng `eventId` có thể xử lý nhiều lần (kafka event) + Nhiều process/instance cùng đọc/ghi `webhook_jobs` + HTTP merchant **không nằm trong transaction DB** 

Đó là bài toán **distributed task scheduling** + **durable work queue** + **state machine** cho side-effect (HTTP).

## NFR

| NFR | Ý nghĩa trong webhook delivery |
|-----|--------------------------------|
| **Durability** | Job survive restart; không mất sau khi Kafka đã tạo job |
| **Availability** | Nhiều pod; một pod chết, delivery tiếp tục |
| **Correctness (platform)** | At-most-once *tạo job*; không double-claim cùng lúc; không ghi đè state cũ |
| **Recoverability** | Crash / hang → job tự quay lại hàng đợi |
| **Latency hợp lý** | Ingest Kafka nhanh; delivery async (vài giây đến vài giờ retry) |
| **Operability** | DLQ, metrics, replay admin |
| **Effect idempotency** | Merchant chịu trùng qua `X-Idempotency-Key` (= `jobId`) |

---

## Phân tích giải pháp

Giải pháp tự nhiên là POST ngay trong Kafka consumer
```
Kafka → parse → POST merchant → commit offset 
```
✅ Đơn giản -> Consumer block theo HTTP; redeliver = gửi trùng / mất kiểm soát; không retry có cấu trúc => để đảm bảo durable ta cần **Ghi DB**
```
Kafka → INSERT webhook_jobs (PENDING)
Cron  → SELECT pending → POST → UPDATE
```
✅ Durability, decouple ingest/delivery -> Single point; chưa scale pod lúc này cần làm HA cho cron (pod B thay A) tuy nhiên **2 pod POST cùng job** — mất correctness => cần mutex (*ai được poll batch này?*) => triên khai **ShedLock (mutex scheduler)**
```
Chỉ một pod giữ lock `pg-ipn-pending-dispatch` khi chạy `poll()`.
```
==> ✅ Giảm double poll Pending nhưng không khóa từng job riêng lẻ; `lockAtMostFor` có thể hết giữa batch dài; Pending / Retry / Sweeper là **lock khác nhau** => chưa đủ mutex **job** ==> **Optimistic lock** (`@Version` + `OptimisticLockConflict`)
```
`markInFlight`: chỉ transition nếu state vẫn `PENDING`/`RETRYING` và version khớp 
```
Giải pháp này đã giúp ✅ Correctness **theo row** khi nhiều pod cùng truy cập webhook_jobs, Conflict → skip, không crash batch. 
Tiếp theo cân thiết kế State Machine rõ ràng: `PENDING → IN_FLIGHT → DELIVERED | RETRYING | DLQ`

Tuy nhiên vẫn con trường hợp pod crash, OOM, hoặc HTTP request treo quá lâu khi đang giữ IN_FLIGHT => job sẽ kẹt mãi ở trạng thái IN_FLIGHT ==> **Sweeper định kỳ quét các job IN_FLIGHT đã vượt quá stuck-threshold (ví dụ: 3 phút), sau đó chuyển chúng về RETRYING mà không tăng attempt_count.** (đảm bảo Recoverability cao)

Hàm dispatch job thực chất là POST HTTP request đến webhook của merchant, có thể có latency cao => nếu để toàn bộ quá trình (claim job → gửi HTTP → cập nhật outcome) nằm trong một transaction lớn, transaction sẽ bị giữ lock rất lâu, gây nghẽn database => tách riêng các thao tác transaction (markInFlight, updateOutcome, recordAttempt) để Fault isolation => cần compensate thủ công nếu job bị stuck do downstream unavailable.

Dispatcher chậm trong lúc đang chờ HTTP response, sweeper/retry có thể đã đổi state sang RETRYING hoặc thậm chí DELIVERED => khi dispatcher quay lại gọi updateOutcome, hệ thống kiểm tra: nếu job không còn ở IN_FLIGHT, thì return null và không ghi đè

---


## Pipeline pattern

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ INGEST (Story 7.1)                                                          │
│  Kafka pg.payment.v1 / pg.refund.v1                                         │
│    → EnvelopeProcessor → CreateWebhookJobUseCase                              │
│    → dedup Redis + UNIQUE(event_id) → INSERT webhook_jobs (PENDING)         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ SCHEDULE + CLAIM                                                            │
│  PendingDispatchScheduler  [@Scheduled 5s + ShedLock]                       │
│    → mutator.findPendingDue(now, batch)                                     │
│    → mutator.markInFlight  (PENDING → IN_FLIGHT, REQUIRES_NEW)             │
│  RetryDispatchScheduler    [@Scheduled 15s + ShedLock]  (RETRYING path)    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ DISPATCH (side-effect)                                                      │
│  WebhookDispatcher.dispatch(IN_FLIGHT job)                                  │
│    → config URL → sign HMAC → SafeWebhookHttpClient POST                    │
│    → mutator.recordAttempt + updateOutcome (+ recordDlq nếu terminal)       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ RECOVERY                                                                    │
│  StuckJobSweeper [@Scheduled 60s + ShedLock]                              │
│    → IN_FLIGHT quá 10 phút → RETRYING (next_attempt_at = now)               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Luồng end-to-end

### Tạo job (không thuộc scheduler, nhưng là điểm vào)

```text
PaymentSessionEventConsumer / RefundEventConsumer
  → EnvelopeProcessor.process(record, topic)
       → CanonicalEventMapper.toCanonical(...)
       → CreateWebhookJobUseCase.apply(event)
```

`CreateWebhookJobUseCase` (`application/CreateWebhookJobUseCase.java`):

1. `dedupStore.tryClaim("webhook-consumer-dedup:" + eventId, 24h)`
2. Lấy `merchantId` từ `event.data`
3. `webhookConfigClient.get(merchantId)` — không URL → return
4. `WebhookJob.create(...)` → `jobRepository.save(job, eventId)`  
   - `DuplicateEventId` → skip idempotent

- Dựa trên cấu trúc dự án, IPN service nhận sự kiện từ layer domain/infrastructure (có Kafka consumer, event mapper).
- CanonicalEventMapper chuyển event nội bộ thành payload webhook chuẩn.
- DedupStore.tryClaim(eventId, ttl) — nếu thành công thì gọi CreateWebhookJobUseCase để persist một bản ghi webhook_job (status = PENDING/QUEUED).
- Scheduler PendingDispatchScheduler / RetryDispatchScheduler sau đó poll DB tìm job PENDING / RETRYING.
- Khi dispatch từng job, mới lấy config merchant qua MerchantWebhookConfigClient (URL, timeout, headers), gọi MerchantWebhookSignClient.sign(...) để lấy signature header; nếu sign trả lỗi transient thì rollback claim để retry; nếu lỗi permanent thì chuyển job -> DLQ.
- Nếu đang replay bulk thì xin permit từ BulkReplayRateLimiter (throttle).

### PendingDispatchScheduler
```text
poll()  [ShedLock: pg-ipn-pending-dispatch, lockAtMostFor=2m]
  │
  ├─ due = mutator.findPendingDue(clock.instant(), batchSize)
  │     JPQL: state=PENDING AND next_attempt_at <= cutoff ORDER BY next_attempt_at
  │
  └─ for each row: dispatchOne(row)
        │
        ├─ inFlight = mutator.markInFlight(jobId, now)   // REQUIRES_NEW
        │     fail OptimisticLockConflict → skip + metric skip_conflict
        │
        ├─ dispatcher.dispatch(inFlight)
        │     → DELIVERED / RETRYING / DLQ (+ attempts, DLQ alert)
        │
        └─ catch MerchantWebhookSignUnavailable
              → updateOutcome(..., PENDING, next_attempt_at=now)  // compensate
```

**Độ trễ điển hình:** 0–5 giây sau persist (chu kỳ poll) + thời gian HTTP.

- PATTERN: ShedLock → mutator claim → dispatcher → state machine → sweeper
  - ShedLock = “chỉ một pod chạy Pending poll (trong giới hạn thời gian lock)”.
  - OptimisticLockConflict = “chỉ một transaction được chuyển row này từ PENDING/RETRYING → IN_FLIGHT khi state/version vẫn hợp lệ”.

- Scheduler : 
  - Poller lấy danh sách job từ DB qua WebhookJobMutator rồi xử lý mỗi row riêng biệt; per-row atomic/optimistic lock được thực hiện trong mutator (markInFlight).
  - PendingDispatchScheduler: poll các job state = PENDING với next_attempt_at <= now và dispatch lần đầu, poll mỗi 5s (config pg.webhook.dispatch-poll-ms), batchSize mặc định 50. Flow per-row:
    - findPendingDue(...) lấy batch.
    - Xử lý từng job (dispatchOne): 
      - Claim — markInFlight: PENDING  →  IN_FLIGHT  (transaction riêng, commit ngay), 2 pod cùng nhận một job (hiếm, khi ShedLock trượt): pod thứ hai gặp OptimisticLockConflict → bỏ qua, đếm metric skip_conflict, sau bước này job không còn trong hàng PENDING; pod khác không claim lại được
      - dispatcher.dispatch: lấy config merchant và signature header và POST JSON + header (X-Webhook-Id, X-Idempotency-Key = jobId, chữ ký HMAC…), Ghi attempt + đổi state: 
        - 2xx → DELIVERED
        - 429 / 5xx / timeout → RETRYING + next_attempt_at (backoff) — RetryDispatchScheduler lo tiếp, không quay lại Pending 
        - 4xx / hết retry / không URL / không sign → DLQ
        - MerchantWebhookSignUnavailable 5xx : xử lí exception rollback PENDING để poll lại sau, Không tăng attempt_count
        - RuntimeException: log error; row có thể kẹt IN_FLIGHT , StuckJobSweeper (60s) sau ~10 phút đẩy về RETRYING.

### Retry path
- `RetryDispatchScheduler` — cùng pattern, query `state=RETRYING`, lock `pg-ipn-retry-dispatch`, poll 15s.
- Khi `sign_unavailable` trên retry: rollback `RETRYING` + `next_attempt_at = now + 60s` (không tăng `attempt_count`).
- Poll chậm hơn vì retries thường có next_attempt_at >= now + 1m.
### Stuck recovery

- `StuckJobSweeper` — `findStuckInFlight(now - 10m)` → `rollbackStuck` → `RETRYING`.

- StuckJobSweeper: phát hiện IN_FLIGHT rows bị "bỏ rơi" (pod chết giữa markInFlight và outcome write) và rollback → RETRYING với next_attempt_at = now, fixedDelay 60s (pg.webhook.stuck-sweep-ms), threshold mặc định 10 phút (pg.webhook.stuck-threshold-minutes)

### Quản trị và replay
- AdminWebhookJobsController và MerchantWebhookJobsController cho phép truy vấn trạng thái job, list job, trigger replay.
- WebhookReplayController xử lý replay/submit lại các event failed hoặc reprocess.
InternalWebhookDeliveriesController có thể dùng cho nội bộ theo dõi, trigger delivery lại.

---

## 8. Race, ShedLock vs optimistic lock

### Tại sao cần cả hai?

| Lớp | Khóa | Giải quyết |
|-----|------|------------|
| ShedLock | Cả `poll()` | Hai pod cùng chạy Pending poll (hiếm / lock hết hạn) |
| Optimistic | Từng `jobId` | Hai transaction cùng claim một row; stale snapshot |

**Kịch bản ShedLock không đủ:**

1. `lockAtMostFor=2m` hết trong khi batch 50 job × HTTP 10s  
2. `PendingDispatchScheduler` và `RetryDispatchScheduler` **lock khác nhau** — chạy song song hợp lệ  
3. `StuckJobSweeper` đổi state trong khi HTTP còn treo → `updateOutcome` return `null`  
4. Admin `replay` đổi state giữa `findPendingDue` và `markInFlight`

`OptimisticLockConflict` → log debug, metric `skip_conflict`, **tiếp tục job khác** — hành vi đúng.

### Sơ đồ tư duy defense-in-depth

```text
         ┌──────────────┐
         │   ShedLock   │  ← mutex scheduler (coarse)
         └──────┬───────┘
                ▼
         ┌──────────────┐
         │ markInFlight │  ← mutex row (fine, CAS)
         └──────┬───────┘
                ▼
         ┌──────────────┐
         │  Dispatcher  │  ← side-effect HTTP
         └──────┬───────┘
                ▼
         ┌──────────────┐
         │updateOutcome │  ← chỉ nếu còn IN_FLIGHT
         └──────┬───────┘
                ▼
         ┌──────────────┐
         │   Sweeper    │  ← lease reaper
         └──────────────┘
```

---

## 9. Cấu hình vận hành

| Property | Default | Ý nghĩa |
|----------|---------|---------|
| `pg.webhook.dispatch-poll-ms` | 5000 | Pending poll |
| `pg.webhook.dispatch-batch-size` | 50 | Max job / tick Pending |
| `pg.webhook.retry-poll-ms` | 15000 | Retry poll |
| `pg.webhook.retry-batch-size` | 100 | Max job / tick Retry |
| `pg.webhook.stuck-sweep-ms` | 60000 | Sweeper cadence |
| `pg.webhook.stuck-threshold-minutes` | 10 | IN_FLIGHT coi là kẹt |
| `pg.webhook.stuck-sweep-batch-size` | 200 | Max sweep / tick |
| `pg.webhook.connect-timeout-ms` | 3000 | HTTP |
| `pg.webhook.read-timeout-ms` | 10000 | HTTP |
| `pg.webhook.config-cache-ttl-seconds` | 60 | Cache webhook URL |
| `pg.webhook.dlq-alert-recipient` | ops@… | DLQ email |

---

## Tổng kết

> **Kafka at-least-once → dedup → durable job queue → ShedLock poller → optimistic claim → HTTP dispatcher → state machine với backoff → sweeper reaper → DLQ + replay.**

Đó là bài toán **reliable asynchronous task execution with external side-effects** — triển khai trong `pg-ipn-service` mà không cần engine workflow riêng, bằng DB + cron + strict state.