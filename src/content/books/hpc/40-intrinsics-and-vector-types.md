---
title: "Intrinsics and Vector Types"
pubDate: "2026-04-20"
published: true
description: "Intrinsics and Vector Types"
useKatex: false
---

# Intrinsics and Vector Types

Tập trung vào thiết lập môi trường, các thanh ghi SIMD, cú pháp intrinsics, và cách dùng vector extensions trong GCC để viết mã ngắn gọn, dễ hiểu hơn.

Chuẩn bị môi trường
- Xác định CPU hỗ trợ SIMD:

    - Trên Linux: cat /proc/cpuinfo để xem các cờ (flags).
    - Trong C++ có thể dùng __builtin_cpu_supports("avx2") để kiểm tra.

- Thêm header:
    - Dùng <x86intrin.h> để có tất cả intrinsics.
    - Khai báo compiler flags: 
      - `#pragma GCC target("avx2")`
      - `-march=native` để tự động nhận kiến trúc CPU.
- Các kiểu dữ liệu: __m128 (__m128d, __m128i), __m256, __m512
- Intrinsics: 
    Intrinsics là hàm C ánh xạ trực tiếp tới lệnh assembly, ví dụ cộng hai mảng double bằng AVX2:
    ```c
    for (int i = 0; i < 100; i += 4) {
        __m256d x = _mm256_loadu_pd(&a[i]);
        __m256d y = _mm256_loadu_pd(&b[i]);
        __m256d z = _mm256_add_pd(x, y);
        _mm256_storeu_pd(&c[i], z);
    }
    ```
Vấn đề thường gặp: mảng không chia hết cho block size.
- Giải pháp 1: pad thêm phần tử “trung tính” (ví dụ 0).
- Giải pháp 2: xử lý phần dư bằng vòng lặp thường.

Con người thích lựa chọn số 1, vì đơn giản hơn và giúp giảm  code. Còn các compiler thì thích lựa chọn số 2, vì không có lựa chọn nào khác.

### Instruction References

Cấu trúc: `_mm<size>_<action>_<type>`.              
  - _mm_add_epi16: cộng vector 128-bit gồm các số nguyên 16-bit.
  - _mm256_ceil_pd: làm tròn lên 4 số double.
  - _mm256_blendv_ps: trộn hai vector theo mask.

## Bài tập

### Câu hỏi tư duy

1. Phân biệt SSE, AVX, AVX2, AVX-512 về vector width, số lượng register, instruction set khác biệt.
2. Tại sao `_mm256_load_pd` (aligned) tồn tại bên cạnh `_mm256_loadu_pd` (unaligned)? Khác biệt thực tế trên CPU hiện đại?
3. Auto-vectorize của compiler vs viết intrinsics tay — khi nào nên chọn cái nào?
4. AVX-512 trên Intel có "downclocking" issue. Giải thích và khi nào nên/không nên dùng AVX-512.
5. Horizontal sum (cộng tất cả lane trong vector) tại sao chậm hơn vertical add? Ví dụ: dùng `_mm256_add_ps` 7 lần để sum 8 float vs cách reduction tree.

### Bài tập code

**Bài 1**: Viết AVX2 vector dot product:
```c
float dot_avx(const float* a, const float* b, int n);
```
Handle phần dư (n % 8 ≠ 0). Compare với scalar version.

**Bài 2**: SAXPY: `y[i] = a*x[i] + y[i]`. Implement dùng FMA intrinsic `_mm256_fmadd_ps`. Đo speedup vs scalar.

**Bài 3**: Implement `int min(int* arr, int n)` dùng AVX2. Tip: dùng `_mm256_min_epi32` cho lane-wise min, sau đó reduction.

## Đáp án

### Câu hỏi tư duy

1. **SSE** (128-bit, 4 float): từ Pentium III. **AVX** (256-bit, 8 float): Sandy Bridge 2011, chỉ FP. **AVX2** (256-bit integer): Haswell 2013, FMA. **AVX-512** (512-bit, 16 float): Skylake-X 2017, mask register `k0-k7`. Số ZMM register = 32 trên AVX-512 (vs 16 YMM trên AVX2). AVX-512 cũng có gather/scatter, nhiều specialized instruction.

2. Trên Haswell+, `load` và `loadu` cùng latency/throughput nếu data thực sự aligned. Dùng `loadu` luôn an toàn hơn (no SIGSEGV nếu data lệch). `load` aligned crash khi data không align 32 byte → AVX. Best practice 2020+: dùng `loadu` luôn.

3. Auto-vectorize:
   - **Pros**: portable, tự update khi CPU mới, ngắn gọn.
   - **Cons**: phụ thuộc compiler, có thể fail vì aliasing/alignment unknown, không control được layout.
   Intrinsics:
   - **Pros**: control hoàn toàn, predictable performance, tận dụng instruction đặc biệt (mask, gather).
   - **Cons**: verbose, không portable across arch (x86 vs ARM NEON), phải viết lại khi đổi width.
   Quy tắc: thử auto-vectorize trước (`-O3 -march=native`), check assembly. Nếu compiler fail hoặc cần kỹ thuật đặc biệt → intrinsics.

4. AVX-512 trên Intel Skylake-X/Cascade Lake: khi execute heavy AVX-512 instruction, CPU giảm clock 100-300MHz để giữ TDP. Khởi động lại lên full clock mất ~700µs. → Nếu chỉ một vài AVX-512 instruction lẻ tẻ, lợi không bù lỗ. Dùng AVX-512 khi: hot loop chạy hàng triệu iter, không có code khác xen kẽ. Trên Ice Lake/Tiger Lake: downclock giảm mạnh, AVX-512 thực dụng hơn.

5. Vertical add (`add_ps`): mỗi lane độc lập → 1 instruction handle 8 lane song song. Horizontal sum: cần lane shuffle giữa các lane → `hadd_ps`, `extractf128_ps`, `add` → 5–7 instruction tổng. Reduction tree:
   ```
   v = [a,b,c,d,e,f,g,h]
   v_hi + v_lo = [a+e,b+f,c+g,d+h]   (extractf128 + add)
   shuffle + add → [a+c+e+g, b+d+f+h, ...]
   shuffle + add → [a+b+c+...+h, ...]
   ```
   Tổng ~3 add + 3 shuffle = 6 instruction cho 8-element sum. Nếu loop có nhiều element, nên accumulate vector, horizontal sum chỉ ở cuối.

### Bài tập code

**Bài 1 — dot product**:

```c
#include <immintrin.h>

float dot_avx(const float* a, const float* b, int n) {
    __m256 sum = _mm256_setzero_ps();
    int i = 0;
    for (; i + 8 <= n; i += 8) {
        __m256 va = _mm256_loadu_ps(a + i);
        __m256 vb = _mm256_loadu_ps(b + i);
        sum = _mm256_fmadd_ps(va, vb, sum);  // sum += va*vb
    }
    // Horizontal reduce
    __m128 lo = _mm256_castps256_ps128(sum);
    __m128 hi = _mm256_extractf128_ps(sum, 1);
    __m128 v4 = _mm_add_ps(lo, hi);            // 4 lanes
    __m128 v2 = _mm_add_ps(v4, _mm_movehl_ps(v4, v4));
    __m128 v1 = _mm_add_ss(v2, _mm_shuffle_ps(v2, v2, 1));
    float total = _mm_cvtss_f32(v1);
    // Tail
    for (; i < n; i++) total += a[i] * b[i];
    return total;
}
```

Speedup vs scalar: 4–8x. Compiler `-O3 -mavx2 -mfma` thường auto-vectorize dot product tốt → diff < 2x. Intrinsics thắng khi: pattern không match auto-vec, hoặc cần xử lý mask/gather.

**Bài 2 — SAXPY**:

```c
void saxpy_avx(float a, const float* x, float* y, int n) {
    __m256 va = _mm256_set1_ps(a);
    int i = 0;
    for (; i + 8 <= n; i += 8) {
        __m256 vx = _mm256_loadu_ps(x + i);
        __m256 vy = _mm256_loadu_ps(y + i);
        vy = _mm256_fmadd_ps(va, vx, vy);
        _mm256_storeu_ps(y + i, vy);
    }
    for (; i < n; i++) y[i] = a*x[i] + y[i];
}
```

FMA: 1 instruction = multiply + add (kèm rounding chỉ 1 lần — chính xác hơn). Speedup vs scalar without FMA: 8x SIMD × 2x FMA = 16x lý thuyết. Thực tế memory-bound → ~5–8x. Khi `n` lớn, bottleneck là memory bandwidth.

**Bài 3 — vector min**:

```c
int min_avx(const int* arr, int n) {
    __m256i vmin = _mm256_set1_epi32(INT_MAX);
    int i = 0;
    for (; i + 8 <= n; i += 8) {
        __m256i v = _mm256_loadu_si256((__m256i*)(arr + i));
        vmin = _mm256_min_epi32(vmin, v);
    }
    // Reduce 8 lanes -> 1
    int tmp[8];
    _mm256_storeu_si256((__m256i*)tmp, vmin);
    int m = INT_MAX;
    for (int j = 0; j < 8; j++) if (tmp[j] < m) m = tmp[j];
    for (; i < n; i++) if (arr[i] < m) m = arr[i];
    return m;
}
```

Hoặc reduction tree thuần SIMD:
```c
__m128i lo = _mm256_castsi256_si128(vmin);
__m128i hi = _mm256_extracti128_si256(vmin, 1);
__m128i m4 = _mm_min_epi32(lo, hi);
__m128i m2 = _mm_min_epi32(m4, _mm_shuffle_epi32(m4, _MM_SHUFFLE(1,0,3,2)));
__m128i m1 = _mm_min_epi32(m2, _mm_shuffle_epi32(m2, _MM_SHUFFLE(0,0,0,1)));
int result = _mm_cvtsi128_si32(m1);
```


