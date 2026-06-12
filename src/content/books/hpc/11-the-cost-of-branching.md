---
title: "The Cost of Branching"
pubDate: "2026-03-30"
published: true
description: "The Cost of Branching"
useKatex: false
---

# The Cost of Branching

* Khi CPU gặp một lệnh rẽ nhánh (ví dụ if), nó không chờ kết quả điều kiện mà sẽ dự đoán nhánh nào có khả năng xảy ra và chạy thử trước (speculatively executing)

* Nếu ta sắp xếp mảng trước rồi mới chạy vòng lặp, CPU dự đoán chính xác hơn 

* Hinting Likelihood: dùng cú pháp [[likely]] để báo cho compiler nhánh nào thường xảy ra

## Bài tập

### Câu hỏi tư duy

1. Tại sao misprediction tốn ~15–20 cycles trên CPU hiện đại trong khi branch instruction chỉ 1 cycle?
2. Cùng một vòng lặp `if (a[i] > 128)` chạy trên dữ liệu **đã sort** vs **random**: con số nào nhanh hơn và tại sao? Thay đổi định lượng thế nào nếu mảng có 10M phần tử với 50% giá trị > 128?
3. `[[likely]]` và `__builtin_expect` ảnh hưởng đến code generation như thế nào? Compiler dùng hint để tối ưu cái gì cụ thể?

### Bài tập code

**Bài 1**: Đo cost của branch misprediction. Tạo 2 mảng `int[N]` (N=10M): một sorted, một shuffled, với cùng phân bố giá trị. Chạy vòng lặp đếm phần tử > threshold trên cả hai và so sánh thời gian.

```c
// signature gợi ý
long count_above(const int* arr, int n, int threshold);
```

**Bài 2**: Cho hàm có nhánh hiếm xảy ra (~1% case). Viết 2 version — một dùng `if`, một dùng `[[likely]]`/`__builtin_expect` — và inspect assembly output (`gcc -S -O2`). Khác biệt nằm ở đâu?

## Đáp án

### Câu hỏi tư duy

1. **Pipeline flush**: CPU hiện đại có pipeline ~15–20 stages. Khi predict sai, mọi instruction đã fetch/decode/execute speculatively phải bị throw away → restart fetch từ đúng target. Cycles "mất" = số stages giữa fetch và resolution. Branch instruction đúng chỉ tốn 1 cycle vì predictor hit.

2. Sorted nhanh hơn rõ rệt — predictor sau vài lần chạy sẽ học được "khi index < pivot luôn N, sau pivot luôn T" → near-100% hit rate. Random 50/50 → predictor không học được pattern → ~50% miss rate × 15 cycles/miss × 10M = ~75M cycles wasted (~25ms ở 3GHz). Sorted có thể nhanh hơn 3–5x trên benchmark cổ điển này (Stack Overflow 2012 — Mysticial).
3. `[[likely]]` không thay branch instruction — predictor vẫn chạy. Tác dụng chính: **code layout** — compiler đặt fall-through path là likely branch (CPU prefetch cache line tiếp theo "free"), unlikely branch jump xa. Cũng ảnh hưởng register allocation — likely path được prioritized.

### Bài tập code

**Bài 1 — giải**:

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

long count_above(const int* arr, int n, int threshold) {
    long count = 0;
    for (int i = 0; i < n; i++) {
        if (arr[i] > threshold) count++;
    }
    return count;
}

int cmp_int(const void* a, const void* b) {
    return (*(int*)a - *(int*)b);
}

int main(void) {
    const int N = 10'000'000;
    int* a = malloc(N * sizeof(int));
    int* b = malloc(N * sizeof(int));
    srand(42);
    for (int i = 0; i < N; i++) a[i] = b[i] = rand() % 256;
    qsort(a, N, sizeof(int), cmp_int);  // a sorted, b shuffled

    struct timespec t0, t1;
    clock_gettime(CLOCK_MONOTONIC, &t0);
    long ca = count_above(a, N, 128);
    clock_gettime(CLOCK_MONOTONIC, &t1);
    double ms_sorted = (t1.tv_sec - t0.tv_sec)*1e3 + (t1.tv_nsec - t0.tv_nsec)/1e6;

    clock_gettime(CLOCK_MONOTONIC, &t0);
    long cb = count_above(b, N, 128);
    clock_gettime(CLOCK_MONOTONIC, &t1);
    double ms_rand = (t1.tv_sec - t0.tv_sec)*1e3 + (t1.tv_nsec - t0.tv_nsec)/1e6;

    printf("sorted=%ld %.2fms | random=%ld %.2fms (ratio %.2fx)\n",
           ca, ms_sorted, cb, ms_rand, ms_rand/ms_sorted);
    free(a); free(b);
}
```

Compile với `-O1` (không vector hóa mạnh) để thấy effect rõ. Trên Intel/AMD modern, ratio ~2–4x. Với `-O3`, compiler có thể auto-vectorize → branchless → ratio gần 1.

**Bài 2 — giải**: Giả sử check error path:

```c
int process(int x) {
    if (__builtin_expect(x < 0, 0)) {  // error path hiếm
        return handle_error(x);
    }
    return x * 2;
}
```

Output `gcc -S -O2`: error block được đặt **xa** (cuối function hoặc trong `.text.cold`), fall-through là happy path. Không có hint, compiler có thể đặt error inline ngay sau `cmp` → instruction cache pollution khi happy path luôn xảy ra. Inspect bằng `objdump -d` so sánh layout.
