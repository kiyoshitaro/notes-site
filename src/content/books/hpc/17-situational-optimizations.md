---
title: "Situational Optimizations"
pubDate: "2026-04-02"
published: true
description: "Situational Optimizations"
useKatex: false
---

# Situational Optimizations

Kể cả ở mức tối ưu hóa như -O2 hoặc -O3, 1 số tối ưu hóa không được bật mặc định

### Loop Unrolling
* Mặc định không bật, Có thể bật toàn cục bằng flag -funroll-loops hoặc chỉ định cho một vòng lặp cụ thể  : #pragma GCC unroll 4
* Làm tăng kích thước file nhị phân, có thể nhanh hơn hoặc không. Không nên lạm dụng

### Function Inlining
* Trình biên dịch tự quyết định có inline hay không. gợi ý bằng từ khóa inline hoặc ép buộc #define FORCE_INLINE inline __attribute__((always_inline))

### Likeliness of Branches
```c
int factorial(int n) {
    if (n > 1) [[likely]]
        return n * factorial(n - 1);
    else [[unlikely]]
        return 1;
}
```
### Profile-Guided Optimization
To make a decision about branch reordering, function inlining, or loop unrolling, we need answers to questions like these:

* How often is this branch taken?
* How often is this function called?
* What is the average number of iterations in this loop?

=> PGO cho phép chương trình tự thu thập dữ liệu thực tế khi chạy, sau đó dùng dữ liệu này để tối ưu khi biên dịch lại.
* Biên dịch với flag -fprofile-generate để thêm mã ghi nhận thống kê:
    ```bash
    g++ -fprofile-generate source.cc -o binary
    ```
* Chạy chương trình với dữ liệu đầu vào đại diện cho tình huống thực tế. Nó sẽ tạo ra các file .gcda chứa thống kê.
* Biên dịch lại với flag -fprofile-use:
    ```bash
    g++ -fprofile-use source.cc -o binary
    ```
Nó thường cải thiện hiệu suất từ 10-20% đối với các cơ sở mã lớn và vì lý do này, nó thường được đưa vào quá trình xây dựng các dự án quan trọng về hiệu suất

## Bài tập

### Câu hỏi tư duy

1. Tại sao `-O3` không bật loop unrolling mặc định? Trade-off là gì?
2. `inline` keyword chỉ là hint. Compiler quyết định dựa trên gì? Khi nào nên dùng `always_inline`?
3. PGO cải thiện gì cụ thể mà `-O3` không làm được? Đưa 2-3 ví dụ.
4. Flag `-flto` (Link-Time Optimization) khác PGO thế nào? Có nên dùng cùng nhau?
5. `[[likely]]` đặt sai (đặt vào nhánh hiếm) thì sao?

### Bài tập code

**Bài 1**: Tính tổng `sum(arr[i])` với `#pragma GCC unroll 1`, `4`, `8`, `16`. Đo benchmark, plot. Knee ở đâu?

**Bài 2**: Apply PGO workflow cho hàm có nhiều branch. So sánh assembly trước/sau PGO.

## Đáp án

### Câu hỏi tư duy

1. `-O3` không tự unroll vì:
   - Code growth → I-cache pressure.
   - Nhiều loop chạy ít iter → unroll wasted.
   - Compiler khó biết best factor mà không profile data.
   `-funroll-loops` enable explicitly khi biết loop là hot.

2. Compiler quyết định dựa trên: function size, call count (nếu PGO), register pressure, loop nesting depth. `always_inline` dùng khi:
   - Function nhỏ (<10 instructions) gọi rất nhiều.
   - Cross-function optimization quan trọng (pass constant qua call).
   - Bottleneck đo được giảm khi inline.

3. PGO biết:
   - Branch frequency thực tế → reorder branch, layout cold path xa.
   - Hot function → inline aggressive, align loops.
   - Loop iteration count → unroll factor phù hợp.
   - Ví dụ: hàm rare error path tự động marked cold; switch-case reordered theo frequency; virtual call devirtualization khi 1 target dominate.

4. LTO: cho phép optimization across translation units (cross-file inline, dead code elimination across libs). PGO: dùng runtime data để guide quyết định. Combine: `-O3 -flto -fprofile-use` → best result. Production binaries của Chrome, Firefox, Postgres dùng cả hai.

5. `[[likely]]` sai:
   - Compiler đặt unlikely path là fall-through → mỗi lần thực sự rare branch xảy ra (nhưng được mark likely) → cache miss + branch misprediction kép.
   - Performance giảm đáng kể (~10-30%).
   - Khó debug vì assembly trông OK.
   Tốt nhất: dùng PGO thay vì manual hint.

### Bài tập code

**Bài 1 — unroll factor**:

```c
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

#define BENCH(F, name) do { \
    struct timespec t0, t1; \
    clock_gettime(CLOCK_MONOTONIC, &t0); \
    long s = F(a, N); \
    clock_gettime(CLOCK_MONOTONIC, &t1); \
    double sec = (t1.tv_sec-t0.tv_sec) + (t1.tv_nsec-t0.tv_nsec)/1e9; \
    printf("%s: sum=%ld %.3f ns/elem\n", name, s, sec/N*1e9); \
} while(0)

long sum_u1(const int* a, int n) {
    long s = 0;
    #pragma GCC unroll 1
    for (int i = 0; i < n; i++) s += a[i];
    return s;
}
long sum_u4(const int* a, int n) {
    long s = 0;
    #pragma GCC unroll 4
    for (int i = 0; i < n; i++) s += a[i];
    return s;
}
// similar for u8, u16
```

Result điển hình:
- u=1: ~0.3 ns/elem (auto-vectorized vẫn xảy ra với -O3)
- u=4: ~0.2 ns/elem
- u=8: ~0.18 ns/elem (sweet spot cho most CPU)
- u=16: ~0.18 ns/elem (no improvement, code bloat)

Hard sweet spot phụ thuộc CPU và memory bandwidth. Memory-bound workload: unroll không giúp.

**Bài 2 — PGO workflow**:

```bash
# Step 1: instrument
gcc -O2 -fprofile-generate prog.c -o prog_prof

# Step 2: run with representative input
./prog_prof < representative_input.txt

# Step 3: rebuild with profile data
gcc -O2 -fprofile-use prog.c -o prog_optimized

# Compare assembly
objdump -d prog_optimized > opt.asm
objdump -d prog_unoptimized > noopt.asm
diff opt.asm noopt.asm | head -50
```

Khác biệt thường thấy:
- Branch reorder: hot path là fall-through.
- Cold function moved to `.text.unlikely`.
- Inline aggressive cho hot callee.
- Loop alignment chỉ cho hot loop (others không waste padding).


