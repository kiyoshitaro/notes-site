---
title: "Cache Lines"
pubDate: "2026-04-11"
published: true
description: "Cache Lines"
useKatex: false
---

# Cache Lines

Đơn vị cơ bản để truyền tải dữ liệu trong hệ thống cache của CPU không phải là từng bit hay từng byte riêng lẻ, mà là cache lines, hầu hết các kiến trúc máy tính hiện nay, kích thước của một cache line là 64 byte. Điều này có nghĩa là toàn bộ bộ nhớ được chia thành các khối 64 byte

```C
for (int i = 0; i < N; i += D)
    a[i]++;
```
Phiên bản bước nhảy ($D=16$) hoàn thành nhanh hơn (D = 1) — nhưng chỉ nhanh hơn khoảng 2 lần chứ không phải 16 lần: nó chỉ chạy một lệnh inc cho mỗi 16 phần tử, trong khi vòng lặp gốc cần hai lệnh vector 8 phần tử để xử lý cùng lượng dữ liệu đó, cả 2 đều bị nghẽn ở khâu ghi kết quả

## Bài tập

### Câu hỏi tư duy

1. Tại sao cache line size = 64 byte (không phải 32 hay 128)? Trade-off là gì?
2. Đọc 1 byte tại địa chỉ `0x1000` → CPU load 64 byte vào cache. Lần đọc tiếp tại `0x1003` chi phí thế nào? Tại `0x1040`? Tại `0x2000`?
3. Tại sao stride loop với D=16 trên `int[]` chỉ nhanh ~2x so với D=1, không phải 16x? Tính toán cụ thể.
4. Stride loop với D=64 (skip cả cache line) trên `int[]` — speedup vs D=16? Tại sao?
5. Khi nào "đọc nhiều hơn cần thiết" lại có lợi? (Hint: prefetching).

### Bài tập code

**Bài 1**: Đo throughput của stride loop với D = 1, 2, 4, 8, 16, 32, 64, 128:
```c
void increment_stride(int* a, int n, int stride);
```
Vẽ đồ thị thời gian/operation theo stride. Giải thích plateau, jumps, knee points.

**Bài 2**: Cho 2 struct:
```c
struct Bad {  // 16 byte
    char flag;
    int data1;
    char tag;
    int data2;
};
struct Good {  // ?? byte
    int data1;
    int data2;
    char flag;
    char tag;
};
```
Tính sizeof, padding, và số phần tử fit trong 1 cache line cho mỗi struct. Loop qua array 1M elements truy cập `data1` — version nào nhanh hơn?

## Đáp án

### Câu hỏi tư duy

1. 64 byte là sweet spot:
   - **Quá nhỏ** (32B): nhiều cache line tags → tốn diện tích chip, nhiều cache miss vì spatial locality kém.
   - **Quá lớn** (128B): waste khi chỉ cần 1 byte → memory bandwidth lãng phí, nhiều false sharing trong concurrent code.
   - 64B cân bằng: vừa đủ cho 1 SIMD vector (AVX 32B → 2 vectors), match DRAM burst size, false sharing tolerable.
   - ARM64 cũng 64B (trừ Apple M1: 128B). x86 từ Pentium 4 đã 64B.

2. `0x1000` → load cache line `[0x1000, 0x103F]` (cache line align 64B). `0x1003` → cache hit (cùng line). `0x1040` → miss, load line `[0x1040, 0x107F]`. `0x2000` → miss (line khác hoàn toàn), nhưng có thể trong L2/L3 nếu vừa được dùng.

3. Tính: D=1 chạm mỗi byte → mỗi 64 byte cần 1 cache line load. D=16 với `int` (4 byte) → bước = 64 byte → mỗi load chỉ touch 1 element/line. **Số cache miss giống nhau** giữa D=1 và D=16! Điểm khác biệt: D=1 làm nhiều `inc` (vectorized) → throughput-bound bởi store. D=16 làm ít `inc` (scalar) → latency-bound bởi load + dependency. Cả hai bottleneck ở memory subsystem → ~2x diff.

4. D=64 trên `int[]` = stride 256 byte → skip 4 cache lines mỗi step → 4x ít cache miss → ~4x nhanh hơn D=16. Khi stride > prefetch range, prefetcher không bắt được pattern → có thể chậm lại trên large array. Knee thường ở stride = 2KB (page size).

5. Prefetcher học pattern stride. Loop với stride đều → CPU prefetch trước. Đôi khi đọc "thừa" giúp warm cache cho code sau (cold code path). Software prefetch (`__builtin_prefetch`) deliberate đọc thừa cho pattern không sequential.

### Bài tập code

**Bài 1 — stride benchmark**:

```c
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

double bench_stride(int* a, int n, int stride) {
    struct timespec t0, t1;
    clock_gettime(CLOCK_MONOTONIC, &t0);
    for (int rep = 0; rep < 100; rep++) {
        for (int i = 0; i < n; i += stride) a[i]++;
    }
    clock_gettime(CLOCK_MONOTONIC, &t1);
    double sec = (t1.tv_sec-t0.tv_sec) + (t1.tv_nsec-t0.tv_nsec)/1e9;
    long ops = (long)100 * (n / stride);
    return sec / ops * 1e9;  // ns/op
}

int main(void) {
    const int N = 1 << 24;  // 64MB
    int* a = aligned_alloc(64, N * sizeof(int));
    for (int i = 0; i < N; i++) a[i] = 0;
    int strides[] = {1, 2, 4, 8, 16, 32, 64, 128};
    for (int i = 0; i < 8; i++) {
        printf("stride=%4d  %.2f ns/op\n", strides[i], bench_stride(a, N, strides[i]));
    }
}
```

Kết quả điển hình (Intel CPU, 64MB array out-of-cache):
- stride 1–16: ~0.5–2 ns/op (cache-friendly, prefetcher tốt)
- stride 16–64: bắt đầu mỗi op = 1 cache miss
- stride 64+: mỗi op 1 cache miss → ~10–100 ns/op
- stride > page (4KB / 4 = 1024 ints): TLB miss thêm vào → chậm hơn nữa

**Bài 2 — struct layout**:

```c
struct Bad {       // sizeof = 16 (với 4-byte int align)
    char flag;     // offset 0, +3 padding
    int data1;     // offset 4
    char tag;      // offset 8, +3 padding
    int data2;     // offset 12
};
struct Good {      // sizeof = 12, align 4 → padded thành 12 (no extra padding cuối)
    int data1;     // 0
    int data2;     // 4
    char flag;     // 8
    char tag;      // 9, +2 padding
};
```

Sửa: `Good` thực tế = 12 byte, `Bad` = 16 byte. Cache line 64B chứa:
- `Bad`: 64/16 = 4 phần tử
- `Good`: 64/12 = 5 phần tử (với 4 byte thừa cuối line)

Loop qua 1M elements truy cập `data1`:
- `Bad`: 1M/4 = 250K cache miss
- `Good`: 1M/5 = 200K cache miss

→ `Good` ~25% nhanh hơn cho memory-bound loop. Nhưng nếu chỉ truy cập `data1`, **SoA** layout (mảng `int data1[]` riêng) sẽ tốt hơn nhiều: 64/4 = 16 elements/line → 1M/16 = 62.5K miss (4x fewer). Xem chapter AoS vs SoA.
