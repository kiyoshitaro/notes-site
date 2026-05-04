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
    ```C
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
