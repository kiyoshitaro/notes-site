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
<!-- # Distributed Task Scheduler — Webhook Delivery (IPN service) -->
IPN service ở đây là dịch vụ "Instant Payment Notification" / webhook delivery của hệ thống payment gateway.

## Bối cảnh nghiệp vụ

- Khi thanh toán / hoàn tiền thay đổi trạng thái, hệ thống nội bộ **core-payment** publish sự kiện (payment succeeded, refund, chargeback...) lên Kafka. **pg-ipn-service** phải **POST webhook** tới URL merchant đã cấu hình — tương tự IPN/notification B2B. Merchant cần nhận thông báo **đáng tin cậy**.
- Định tuyến, ký và gửi HTTP callback tới URL của merchant.
- Quản lý retry, trạng thái thành công/thất bại, replay khi cần.
- Cung cấp API quản trị / merchant để xem trạng thái, replay, kiểm tra lịch sử webhook.

## Lí do tách service

- Độc lập hoá luồng webhook với core payment: webhook là một concern riêng, có vòng đời và SLA khác.
- Khả năng scale khác: lượng webhook có thể rất lớn và dao động, không nên ảnh hưởng tới service xử lý giao dịch.
- Độ tin cậy: job queue + retry logic cần mức ổn định, tách riêng giúp giảm rủi ro.
- Dễ triển khai, vận hành: deploy riêng, bảo trì không ảnh hưởng trực tiếp tới payment transaction.
- Bảo mật: webhook ra ngoài internet cần layer riêng, signature, auth, hạn chế surface attack.

==> Kafka là một hệ thống messaging rất tốt cho truyền event nội bộ, nhưng gửi webhook ra ngoài (HTTP tới merchant) có những yêu cầu khác (durability per-delivery, status/metrics/audit, retry policy, rate-limit, admin replay, transactional outbox) nên phải có layer xử lí trên 

Tóm lại, IPN service ở đây là thành phần trung gian quan trọng để đảm bảo các sự kiện payment được chuyển tới merchant một cách đáng tin cậy, có retry và quản lý lịch sử. Vì vậy nó thường được tách ra làm service riêng để dễ scale, vận hành và cô lập với các luồng payment khác.

## Vấn đề kỹ thuật

Đó là bài toán **distributed task scheduling** + **durable work queue** + **state machine** cho side-effect (HTTP).

### NFR

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
Đơn giản -> nhưng consumer bị block theo HTTP; redeliver = gửi trùng / mất kiểm soát; không retry có cấu trúc => để đảm bảo durable ta cần **Ghi DB**
```
Kafka → INSERT webhook_jobs (PENDING)
Cron  → SELECT pending → POST → UPDATE
```
Quá trình nhận job từ Kafka có thể bị duplicate dẫn đến redeliver cần cơ chế dedup 2 tầng:
```
Kafka message (có thể gửi lại cùng eventId)
        │
        ▼
EnvelopeProcessor.process()
   ├─ mapper → CanonicalEvent (có eventId)
        │
        ▼
CreateWebhookJobUseCase.apply()
   ├─ Tier 1: Redis tryClaim
   ├─ lấy webhook URL merchant
   └─ Tier 2: INSERT webhook_jobs + UNIQUE(event_id)
```
- Tier 1 — Redis (nhanh, DB protect)
```
public boolean tryClaim(String key, Duration ttl) {
       Boolean ok = redis.opsForValue().setIfAbsent(key, "1", ttl);
       return Boolean.TRUE.equals(ok);
}
```
- Tier 2 — DB UNIQUE(event_id) (durable): khi Redis down / miss hoặc hết TTL 24h hoặc concurrent 

Đến đây đã durability, decouple ingest/delivery -> Tiếp theo cần thiết kế State Machine rõ ràng dể handle failure: `PENDING → IN_FLIGHT → DELIVERED | RETRYING | DLQ`

```text
                    CreateWebhookJobUseCase
                              │
                              ▼
                          ┌─────────┐
              ┌──────────│ PENDING │◄─── replay / sign_unavailable (pending path)
              │          └────┬────┘
              │               │ PendingDispatchScheduler.markInFlight
              │               ▼
              │          ┌───────────┐
              │          │ IN_FLIGHT │
              │          └─────┬─────┘
              │    ┌───────────┼───────────┐
              │    ▼           ▼           ▼
              │ DELIVERED   RETRYING      DLQ
              │               │
              │               │ RetryDispatchScheduler
              │               └──────► IN_FLIGHT ...
              │
              └── StuckJobSweeper: IN_FLIGHT (quá hạn) → RETRYING
```

Trường hợp pod crash, OOM, hoặc HTTP request treo quá lâu khi đang giữ IN_FLIGHT => job sẽ kẹt mãi ở trạng thái IN_FLIGHT ==> **Sweeper định kỳ quét các job IN_FLIGHT đã vượt quá stuck-threshold (ví dụ: 3 phút), sau đó chuyển chúng về RETRYING mà không tăng attempt_count.** (đảm bảo Recoverability cao)

Hàm dispatch job thực chất là POST HTTP request đến webhook của merchant, phải phụ thuộc vào chất lượng webhook để nhận rep có thể có latency cao => nếu để toàn bộ quá trình (claim job → gửi HTTP → cập nhật outcome) nằm trong một transaction lớn, transaction sẽ bị giữ lock rất lâu, gây nghẽn database => tách riêng các thao tác transaction (markInFlight, updateOutcome, recordAttempt) để **fault isolation** => cần compensate thủ công nếu job bị stuck do downstream unavailable.

Dispatcher chậm trong lúc đang chờ HTTP response, sweeper/retry có thể đã đổi state sang RETRYING hoặc thậm chí DELIVERED => khi dispatcher quay lại gọi updateOutcome, cần 1 guard để kiểm tra: nếu job không còn ở IN_FLIGHT, thì return null và không ghi đè

Đến đây, hệ thống đã reliable nhưng vẫn tồn tại single point; lúc này cần làm HA cho cron (pod B thay A) tuy nhiên **2 pod POST cùng job** —> mất correctness => cần mutex (*ai được poll batch này?*) => triển khai **ShedLock (mutex scheduler)**
```
Chỉ một pod giữ lock `pg-ipn-pending-dispatch` khi chạy `poll()`.
```
ShedLock đã giúp giảm double poll Pending nhưng
- không khóa từng job riêng lẻ; 
- `lockAtMostFor=2m` có thể hết giữa batch dài 50 job × HTTP 10s  
- `PendingDispatchScheduler` và `RetryDispatchScheduler` **lock khác nhau** — chạy song song và có thể gây race từng job  
- `StuckJobSweeper` đổi state trong khi HTTP còn treo → `updateOutcome` return `null`  
- Admin `replay` đổi state giữa `findPendingDue` và `markInFlight`
```
==> mutex cho từng **job** bằng **Optimistic lock** (`@Version` + `OptimisticLockConflict`)
`markInFlight`: chỉ transition nếu state vẫn `PENDING`/`RETRYING` và version khớp
```
Giải pháp này đã giúp ✅ Correctness **theo row** khi nhiều pod cùng truy cập webhook_jobs, Conflict → skip, không crash batch. 

Một luồng nữa cần chú ý là tính năng Bulk Replay cho phép Admin can thiệp thủ công để gửi lại hàng loạt job (ví dụ sau khi merchant khắc phục xong sự cố server) -> có thể gọi API liên tục, chuyển trạng thái hàng ngàn job về  `PENDING` trong thời gian cực ngắn -> áp lực đột ngột lên DB (write load) và làm tràn hàng đợi của các Scheduler, có thể gây "bottleneck" cho các job mới đang phát sinh từ luồng thanh toán thực tế => cơ chế BulkReplayRateLimiter (in-memory per instance + key-by-identity)

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
              → dedupStore.tryClaim("webhook-consumer-dedup:" + eventId, 24h)
              → WebhookJob.create(...) → jobRepository.save(job, eventId)
```

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
        ├─ inFlight = mutator.markInFlight(jobId, now)   // REQUIRES_NEW transaction
        │     fail OptimisticLockConflict → skip + metric skip_conflict
        │
        ├─ dispatcher.dispatch(inFlight)
        │     → DELIVERED / RETRYING / DLQ (+ attempts, DLQ alert)
        │
        └─ catch MerchantWebhookSignUnavailable
              → updateOutcome(..., PENDING, next_attempt_at=now)  // compensate
```

**Độ trễ :** 0–5 giây sau persist (chu kỳ poll) + thời gian HTTP.

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

## Bước ký (sign) webhook — bảo mật & secret rotation

URL webhook của merchant nằm public trên internet — ai cũng có thể POST request giả tới. Nên mỗi webhook phải mang một **chữ ký** để merchant biết request thật từ gateway. Đây là bước 2 trong `WebhookDispatcher.dispatch` (giữa lấy URL và POST).

Nhưng để có chữ ký thì trước hết hai bên phải **cùng có chung một secret**, ban đầu merchant phải tự setup ở dashboard (service: `merchant-service`): **Đặt URL webhook** + **Tạo secret** (quyền `MERCHANT_ADMIN`/`MERCHANT_DEVELOPER`). Server sinh một chuỗi ngẫu nhiên mạnh:

```whsec_<43 ký tự base64url>      ← 32 byte ngẫu nhiên từ SecureRandom, vd whsec_8Kx...9aQ```. 

Chuỗi plaintext này **chỉ trả về đúng một lần** trong HTTP response (201). Merchant phải copy lưu ngay vào config phía họ — mất là phải rotate cái mới.

**server lưu secret thế nào?**: server **không lưu plaintext**. Nó lưu:

| Bản lưu | Cách tạo | Dùng để |
|---------|----------|---------|
| **Hash** (`webhookSecretHash`) | `ApiKeyHasher.hash` — một chiều, không đảo ngược | audit / hiển thị legacy |
| **Mã hoá** (`webhookSecretEncrypted`) | `ApiSecretCipher.encrypt` — **đảo ngược được** | giải mã ra plaintext để **ký** webhook |
| **Prefix** (`webhookSecretPrefix`) | 12 ký tự đầu, vd `whsec_8Kx123` | hiển thị "secret nào đang dùng" cho UI/log |

Lưu **mã hoá** (reversible) chứ không chỉ hash như mật khẩu? Vì khác với verify mật khẩu (chỉ cần so hash), **ký webhook cần lấy lại đúng giá trị secret gốc** để chạy HMAC. Nên secret phải mã hoá (giải mã được bằng khoá của hệ thống) thay vì băm một chiều.

Sau bước này, **cùng một secret tồn tại ở 2 nơi**: merchant giữ plaintext (config của họ), gateway giữ bản mã hoá (giải ra khi cần ký). Đó là "shared secret" làm nền cho mọi chữ ký về sau.

Chữ ký = `HMAC-SHA256(secret, timestamp + "." + payloadBody)`, secret chỉ gateway và merchant biết HMAC-SHA256 là cách biến secret đó thành chữ ký. Tách 2 phần:

- **SHA-256** = hàm băm (hash): nhét vào chuỗi bất kỳ dài bao nhiêu cũng ra **64 ký tự hex cố định**. Hai tính chất: (1) **một chiều** — từ output không suy ngược ra input; (2) **nhạy** — đổi 1 ký tự input thì output đổi hoàn toàn. Nhưng SHA-256 trần thì *ai cũng tính được* → không chứng minh được danh tính.

- **HMAC** = trộn thêm **secret** vào quá trình băm, biến hash "ai cũng tính" thành "chỉ ai có secret mới tính đúng". Công thức (đơn giản hoá): ``` HMAC(secret, msg) = SHA256( (secret ⊕ opad) + SHA256( (secret ⊕ ipad) + msg ) ) ```

Chặn 3 thứ:
- **Giả mạo:** không có secret thì không ký đúng → verify fail.
- **Sửa payload:** đổi 1 byte → chữ ký lệch → lộ ngay.
- **Phát lại:** `timestamp` nằm trong phần ký, merchant từ chối nếu quá cũ; thêm `X-Idempotency-Key = jobId` để bỏ bản trùng.

Tính hiệu quả:

- **Cùng input + cùng secret → luôn ra cùng chữ ký**, nên 2 bên tính ra giống hệt.
- **Không có secret → không đoán nổi chữ ký** (vét cạn 2²⁵⁶ khả năng — bất khả thi).
- **Đối xứng**: cả 2 dùng **chung 1 secret** (khác chữ ký số RSA khoá riêng/công khai). Đủ dùng vì gateway và merchant tin nhau, chỉ cần chống bên thứ ba.

### Secret tập trung ở merchant-service

pg-ipn-service **không giữ secret**. Secret lưu mã hoá ở `merchant-service`; pg-ipn-service gửi payload qua nhờ ký rồi nhận lại chữ ký:

```text
WebhookDispatcher (pg-ipn-service)  — KHÔNG giữ secret
   │  POST /api/internal/merchants/{merchantId}/webhook/sign  { timestamp, payloadBody }
   ▼
merchant-service  — giữ secret (mã hoá), tự ký
   │  v1     = HMAC-SHA256(secret hiện tại, timestamp + "." + payloadBody)
   │  v1Prev = HMAC-SHA256(secret cũ,       ...)   ← chỉ khi đang rotate
   ▼
SignResponse { v1, v1Prev, secretPrefix, previousSecretPrefix, rotationActive }
```

Secret ở một nơi duy nhất → dễ audit/rotate, và pg-ipn-service bị hack cũng không lộ secret merchant.

### Chuỗi ký & header

Ký chuỗi `timestamp + "." + payloadBody` (`timestamp = now.getEpochSecond()`). **Cùng timestamp đó** gắn vào header để merchant dựng lại đúng chuỗi mà verify. Header (`buildSignatureHeader`):

```
X-Webhook-Signature: t=<timestamp>,v1=<hex>[,v1_prev=<hex>]
```

### Rotation — đổi secret không rớt webhook

Đổi secret tức thời sẽ làm merchant chưa kịp cập nhật config verify fail → mất webhook. Giải pháp: (`rotationActive = true`) ký cả 2 secret — mới ra `v1`, cũ ra `v1_prev`. Merchant verify bằng secret cũ **hoặc** mới đều được → không downtime. Hết 24h → chỉ còn `v1`.

(`secretPrefix`/`previousSecretPrefix` = vài ký tự đầu, chỉ để log audit, không phải vật liệu ký.)

### Không cache

Chữ ký tính per-payload (body khác → chữ ký khác) nên cache vô dụng cho đường ký; cache secret còn rủi ro ký nhầm secret cũ sau rotation. Nên `RestMerchantWebhookSignClient` cố tình không cache.

### Xử lí lỗi ở bước ký

| Lỗi | merchant-service | Xử lý |
|-----|------------------|-------|
| `MerchantWebhookSignUnavailable` | 5xx / timeout / IO | **Transient** → re-throw, rollback claim `IN_FLIGHT` → `PENDING`/`RETRYING`, **không** tăng `attempt_count`, tick sau thử lại |
| `MerchantWebhookSignNotConfigured` | 4xx (404 merchant lạ, 409 no_secret) | **Permanent** → `DLQ` + attempt `SIGN_FAILED` + DLQ alert (1 lần) |

### DISPATCH box

```text
│ DISPATCH (side-effect)                                                      │
│  WebhookDispatcher.dispatch(IN_FLIGHT job)                                  │
│    → lấy URL → ký (merchant-service ký hộ, secret không rời) → POST         │
│      header X-Webhook-Signature: t=..,v1=..[,v1_prev=..]                    │
│    → recordAttempt + updateOutcome (+ recordDlq nếu terminal)               │
│    ký lỗi 5xx → rollback claim, thử lại  |  ký lỗi 4xx → DLQ                │
```

---

## Cấu hình vận hành

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