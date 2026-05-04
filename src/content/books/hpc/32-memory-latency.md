---
title: "Memory Latency"
pubDate: "2026-04-10"
published: true
description: "Memory Latency"
useKatex: false
---

# Memory Latency

Để đo băng thông, bạn chỉ cần thực hiện một chuỗi dài các lệnh đọc hoặc ghi độc lập, còn để đo độ trễ, chúng ta cần thiết kế một thí nghiệm mà CPU không thể "cheat" bằng cách biết trước địa chỉ bộ nhớ mà chúng ta sẽ yêu cầu.

Pointer Chasing; Một cách để đảm bảo CPU không đoán trước được là tạo ra một hoán vị ngẫu nhiên (random permutation) kích thước $N$ tạo thành một vòng lặp kín, sau đó liên tục truy cập theo hoán vị đó:
```cpp
// q là 1 shuffle 
for (int t = 0; t < K; t++)
    for (int i = 0; i < N; i++)
        k = q[k];
```

giá trị của k tiếp theo phụ thuộc vào giá trị q[k] hiện tại vừa được tải từ bộ nhớ => CPU buộc phải đợi cho đến khi dữ liệu cũ về tới nơi thì mới biết được địa chỉ tiếp theo để yêu cầu ===> Đo độ trễ là đo "khoảng thời gian phải chờ" giữa các lần truy cập dữ liệu không thể dự đoán trước

## Bài tập

### Câu hỏi tư duy

1. Tại sao đo bandwidth dễ, đo latency khó? Cụ thể CPU "cheat" bằng cách nào nếu không design test cẩn thận?
2. Pointer chasing với working set 1KB, 32KB, 1MB, 100MB cho con số gì? Map vào L1/L2/L3/RAM.
3. Tại sao linked list traversal chậm dù mỗi node chỉ 16 byte? So với array same size?
4. Software prefetch có giúp được pointer chase không? Tại sao không/có?
5. Latency-bound code có thể dùng SIMD/vectorize được không?

### Bài tập code

**Bài 1**: Implement pointer chase benchmark. Tạo random permutation forming single cycle, đo thời gian/iteration cho working set size 4KB, 32KB, 256KB, 1MB, 16MB, 256MB. Vẽ đồ thị → xác định L1, L2, L3 size.

```c
double measure_latency(int* arr, int n, long iters);
```

**Bài 2**: So sánh:
- (a) Pointer chase qua linked list (random heap allocation).
- (b) Pointer chase qua array index (1 cycle permutation).
Giải thích diff (cả hai cùng dependency chain, nhưng (a) chậm hơn).

## Đáp án

### Câu hỏi tư duy

1. Bandwidth = bytes/second với many parallel requests. CPU + prefetcher max out memory bandwidth easily. Latency = single round-trip time. CPU "cheat" bằng:
   - Out-of-order execution: tự rewrite code, dispatch many requests cùng lúc.
   - Prefetcher: detect stride, load trước.
   - Speculation: predict branch, fetch wrong path.
   Pointer chase với cycle ngẫu nhiên + dependency chain tạo serial bottleneck — CPU bị buộc serialize.

2. Điển hình modern CPU:
   - 4KB: L1 hit, ~1 ns (3-5 cycles)
   - 32KB: L1 vẫn hit (L1 thường 32-48KB)
   - 256KB: L2 hit, ~3-5 ns
   - 1MB: L2 hit hoặc L3, ~10-15 ns
   - 16MB: L3 hit, ~30-40 ns
   - 256MB: RAM, ~80-120 ns

3. Linked list (16 byte node): allocation từ malloc → fragmented memory. Mỗi node có thể ở chỗ bất kỳ. Pointer chase = no prefetch possible (CPU không đoán next addr). Array (cùng 16 byte stride): sequential → prefetcher hit, near 0 ns/access. Diff 50-100x chỉ vì layout.

4. Software prefetch ÍT giúp pointer chase chính nó (chain serial). Có thể giúp với **skip prefetching**:
   ```c
   for (int i = 0; i < N; i++) {
       __builtin_prefetch(&arr[next_skip[i]]);  // prefetch xa
       k = arr[k].next;  // process
   }
   ```
   Cần biết lookahead pattern. Trong tree traversal có thể prefetch children trước. Nhưng pure random pointer chase: no help.

5. Single-stream latency-bound: SIMD không giúp. Nhưng có thể chạy **nhiều streams independent** song song (parallelism của loads). 1 stream = 100ns/access × N. 10 streams = vẫn 100ns nhưng 10 access hoàn thành cùng lúc → effective 10ns/access. Đây gọi là **MLP** (memory-level parallelism) — chapter sau.

### Bài tập code

**Bài 1 — pointer chase benchmark**:

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

void make_cycle(int* perm, int n) {
    for (int i = 0; i < n; i++) perm[i] = i;
    // Fisher-Yates partial — make single cycle
    for (int i = n - 1; i > 0; i--) {
        int j = rand() % (i + 1);
        int t = perm[i]; perm[i] = perm[j]; perm[j] = t;
    }
    // Convert to next-pointer form: perm[i] = next index in cycle
    int prev = perm[n-1];
    for (int i = 0; i < n; i++) {
        int cur = perm[i];
        perm[prev] = cur;
        prev = cur;
    }
}

double measure_latency(int* arr, int n, long iters) {
    int k = 0;
    struct timespec t0, t1;
    clock_gettime(CLOCK_MONOTONIC, &t0);
    for (long i = 0; i < iters; i++) k = arr[k];
    clock_gettime(CLOCK_MONOTONIC, &t1);
    volatile int sink = k;  // prevent dead-code elimination
    return ((t1.tv_sec-t0.tv_sec)*1e9 + (t1.tv_nsec-t0.tv_nsec)) / iters;
}

int main(void) {
    int sizes_kb[] = {4, 32, 256, 1024, 16*1024, 256*1024};
    for (int s = 0; s < 6; s++) {
        int n = sizes_kb[s] * 1024 / sizeof(int);
        int* arr = aligned_alloc(64, n * sizeof(int));
        make_cycle(arr, n);
        long iters = (sizes_kb[s] < 1024) ? 100'000'000 : 10'000'000;
        double ns = measure_latency(arr, n, iters);
        printf("size %6d KB: %.1f ns/access\n", sizes_kb[s], ns);
        free(arr);
    }
}
```

Output trên Intel CPU thông thường:
```
size      4 KB:  1.0 ns/access  ← L1
size     32 KB:  1.2 ns/access  ← L1 boundary
size    256 KB:  3.5 ns/access  ← L2
size   1024 KB:  4.0 ns/access  ← L2
size  16384 KB: 12.0 ns/access  ← L3
size 262144 KB: 90.0 ns/access  ← DRAM
```

Knee points ở L1, L2, L3 sizes — đây là cách classic xác định cache hierarchy.

**Bài 2 — list vs array chase**:

Cùng dependency chain, cùng số ops, nhưng:
- Array index chase: data và index nằm trong sequential layout. CPU prefetcher có thể quan sát index pattern (dù random vẫn cùng region). TLB hit cao.
- Linked list: nodes scattered → mỗi access có thể TLB miss + page fault potential + nhiều DRAM rows → latency cao hơn 1.5–3x.

Kết luận: layout matters dù logic chain giống nhau.
