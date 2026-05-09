---
title: "Memory-Level Parallelism"
pubDate: "2026-04-13"
published: true
description: "Memory-Level Parallelism"
useKatex: false
---

# Memory-Level Parallelism

Khi CPU đang chờ 1 read request hoàn tất, nó có thể gửi thêm vài yêu cầu khác, và các yêu cầu này sẽ được thực thi đồng thời. Đây chính là lý do tại sao linear iteration lại nhanh hơn nhiều so với pointer jumping: CPU biết trước những vị trí bộ nhớ cần truy xuất tiếp theo và có thể gửi yêu cầu từ rất sớm.

Số lượng thao tác bộ nhớ đồng thời có thể thực hiện là lớn nhưng có giới hạn, và giới hạn này khác nhau tùy loại bộ nhớ. Khi thiết kế thuật toán, đặc biệt là cấu trúc dữ liệu, cần biết con số này, vì nó quyết định mức độ song song mà tính toán có thể đạt được.

```C
// M là số phần tử cho mỗi vòng lặp song song, D là số  vòng lặp song song 
int p[M], q[D][M];            // p là mảng tạm, q là mảng 2 chiều cho D vòng lặp

// Khởi tạo D vòng lặp pointer chasing song song
for (int d = 0; d < D; d++) {
    iota(p, p + M, 0);              // tạo mảng p = [0,1,2,...,M-1]
    random_shuffle(p, p + M);       // xáo trộn ngẫu nhiên p để tạo chu trình ngẫu nhiên
    k[d] = p[M - 1];                // chọn điểm bắt đầu của vòng lặp d
    
    // xây dựng chu trình pointer chasing cho vòng lặp d
    for (int i = 0; i < M; i++)
        k[d] = q[d][k[d]] = p[i];   // gán q[d][...] để tạo liên kết nhảy con trỏ
}

// Chạy benchmark: mỗi bước i, tất cả D vòng lặp cùng nhảy một bước
for (int i = 0; i < M; i++)
    for (int d = 0; d < D; d++)
        k[d] = q[d][k[d]];          // CPU phải xử lý D truy cập bộ nhớ độc lập
```
- Ý tưởng: thay vì chỉ chạy một chu trình pointer chasing, ta chạy song song D chu trình để ép CPU gửi nhiều yêu cầu bộ nhớ cùng lúc.
- Cách đo: ta thay đổi giá trị D (số vòng lặp song song) và đo thời gian chạy.
- Kết quả quan sát:
  - Khi D nhỏ, thời gian giảm rõ rệt → CPU tận dụng được song song bộ nhớ.
  - Khi D tăng đến một ngưỡng, thời gian không giảm nữa → đạt giới hạn song song.

- Giới hạn thực nghiệm:
  - Cache L2: khoảng 6 yêu cầu đồng thời.
  - RAM lớn: khoảng 13–17 yêu cầu đồng thời.
- Nguyên nhân giới hạn: CPU có số lượng thanh ghi hữu hạn. Khi số vòng lặp vượt quá, phải dùng bộ nhớ tạm để lưu giá trị → hiệu năng không tăng thêm.

> ==> **CPU có các bộ dự đoán truy cập bộ nhớ (hardware prefetchers) để quan sát mẫu truy cập địa chỉ để xác định pattern và biết khi nào chủ động pipeline và prefetch, khi nào không để tránh ô nhiễm cache và làm mất băng thông** , như case trên ta phải chủ động tạo nhiều chu trình độc lập (D) để ép CPU gửi nhiều yêu cầu song song

### Software Prefetching

Hardware prefetching chỉ thông minh với các mẫu đơn giản: duyệt tiến/lùi, nhiều mảng song song, bước nhảy nhỏ đến trung bình. Với mẫu phức tạp hơn, nó không đoán được và ta phải hỗ trợ bằng phần mềm.

Cách đơn giản nhất là dùng một lệnh bộ nhớ bình thường, như `mov` (giả vờ cần một phần tử nhỏ, nhưng thực chất mục tiêu là đưa cả cache line vào bộ nhớ đệm). 

CPU hiện đại có lệnh riêng để nạp cache line mà không thực sự sử dụng dữ liệu đó, lệnh này chỉ “đặt trước chỗ” trong cache, không tạo thêm thao tác đọc/ghi dữ liệu vào thanh ghi `__builtin_prefetch(&a[k]);`. Ngôn ngữ C/C++ chuẩn không định nghĩa lệnh prefetch nhưng hầu hết các compiler (như GCC, Clang) đều cung cấp **intrinsic** (hàm mà compiler cung cấp để gọi trực tiếp machine instructions của CPU ngay trong code C/C++) đặc biệt để gọi lệnh này.

Ví dụ: 
```C
// Tìm số nguyên tố lớn nhất ≤ N
const int n = find_prime(N);
std::vector<int> q(n);

// Tạo hoán vị bằng công thức (2*i + 1) % n
// Đây là biến thể của LCG, đảm bảo chu kỳ đầy đủ khi n là số nguyên tố
for (int i = 0; i < n; i++) {
    q[i] = (2 * i + 1) % n;
}

int k = 0;
for (int t = 0; t < K; t++) {
    for (int i = 0; i < n; i++) {
        // Nạp trước phần tử tiếp theo (1 bước)
        __builtin_prefetch(&q[(2 * k + 1) % n]);

        // Nạp trước phần tử cách 3 bước (multi-step prefetch)
        __builtin_prefetch(&q[((1 << 3) * k + (1 << 3) - 1) % n]);

        // Truy cập phần tử hiện tại
        k = q[k];
    }
}
```

Đây là ví dụ nhân tạo, trong thực tế software prefetching thường khó hiệu quả vì phải thêm memory instruction -> cạnh tranh resources. Hardware prefetching thường đủ và an toàn hơn, vì chỉ kích hoạt khi bus rảnh.

Với software prefetching, có thể chọn mức cache muốn nạp (L1, L2, L3) bằng intrinsic _mm_prefetch. Điều này hữu ích khi không muốn đẩy dữ liệu quan trọng ra khỏi L1.

## Bài tập

### Câu hỏi tư duy

1. MLP nghĩa là gì cụ thể? Tại sao "10 outstanding loads" có thể che giấu latency 100ns?
2. Số "Line Fill Buffer" thường ~10 trên Intel. Implication cho code design?
3. Sequential array access có MLP không? Random pointer chase có không?
4. Khi nào software prefetch lợi? Khi nào hại?
5. Distance prefetch (prefetch xa bao nhiêu trước access) thế nào là tối ưu?

### Bài tập code

**Bài 1**: So sánh single-stream pointer chase với 10 parallel streams. Đo throughput cải thiện.

**Bài 2**: Binary search trên array lớn (>L3). Add software prefetch cho 2 child branches. Speedup?

**Bài 3**: Sum array với software prefetch ahead. Distance = 64, 256, 1024 cache line. Cái nào tốt nhất?

## Đáp án

### Câu hỏi tư duy

1. MLP = số memory request CPU có thể có outstanding cùng lúc. Latency 100ns × 10 streams song song = throughput 10 access/100ns = 1 access/10ns effective. Bottleneck dịch từ latency sang bandwidth.

2. Line Fill Buffer (~10) = số cache line miss tối đa đang in-flight. Vượt qua → CPU stall. Implication:
   - Tránh dependency chain dài (giảm MLP).
   - Multiple independent streams trong loop tốt.
   - Random access scattered → tiêu tốn LFB nhanh.

3. Sequential: hardware prefetcher detect pattern → fetch ahead 8-16 line → MLP cao tự động. Random pointer chase: CPU không biết next addr, mỗi load phụ thuộc previous → MLP = 1 (serial chain).

4. Software prefetch lợi khi:
   - Pattern complex hardware không học được (graph traversal, hash lookup).
   - Có "lookahead" — biết trước index.
   Hại khi:
   - Pattern đơn giản, hardware đã handle.
   - Prefetch quá nhiều → cache pollution + memory bandwidth wasted.
   - Prefetch quá gần access → chưa kịp arrive.

5. Distance optimum ≈ latency × throughput của loop. RAM 100ns, loop 1ns/elem → prefetch 100 elements ahead. Quá gần: chưa arrive. Quá xa: bị evict trước khi dùng. Test 64, 128, 256, 512 → chọn knee.

### Bài tập code

**Bài 1 — single vs multi-stream chase**:

```c
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

#define D 10  // 10 parallel streams

double bench_chase(int* arr[D], int starts[D], int n, long iters) {
    int k[D];
    for (int d = 0; d < D; d++) k[d] = starts[d];
    struct timespec t0, t1;
    clock_gettime(CLOCK_MONOTONIC, &t0);
    for (long i = 0; i < iters; i++) {
        for (int d = 0; d < D; d++) k[d] = arr[d][k[d]];
    }
    clock_gettime(CLOCK_MONOTONIC, &t1);
    volatile int sink = k[0];
    return ((t1.tv_sec-t0.tv_sec)*1e9 + (t1.tv_nsec-t0.tv_nsec)) / (iters * D);
}
```

Result với working set 100MB:
- Single stream: ~90 ns/access (RAM latency)
- 10 streams: ~12-15 ns/access (~6-7x speedup)

Speedup không tới 10x vì LFB limit + bandwidth saturation.

**Bài 2 — binary search with prefetch**:

```c
int bsearch_prefetch(const int* arr, int n, int target) {
    int lo = 0, hi = n;
    while (lo < hi) {
        int mid = (lo + hi) / 2;
        // Prefetch both possible next mids
        __builtin_prefetch(&arr[(lo + mid) / 2]);
        __builtin_prefetch(&arr[(mid + 1 + hi) / 2]);
        if (arr[mid] < target) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}
```

Speedup: ~1.5–2x trên array > L3. Lý do: 1 trong 2 prefetch sẽ hit (tùy comparison) → next iteration's load ready khi cần.

**Bài 3 — sum with prefetch ahead**:

```c
long sum_prefetch(const int* a, int n, int distance) {
    long s = 0;
    for (int i = 0; i < n; i++) {
        if (i + distance < n) __builtin_prefetch(&a[i + distance]);
        s += a[i];
    }
    return s;
}
```

Test distance = 64, 128, 256, 512, 1024. Sweet spot thường ~128–256 cho RAM-bound workload (latency 100ns / 1ns per elem ≈ 100 ahead). Hardware prefetcher đã handle case này tốt → speedup nhỏ (5-15%) hoặc 0.


