---
title: "Memory Paging"
pubDate: "2026-04-16"
published: true
description: "Memory Paging"
useKatex: false
---

# Memory Paging

Cách cache và TLB ảnh hưởng đến hiệu năng khi truy cập mảng lớn với bước nhảy (stride) khác nhau

```c
const int N = (1 << 13);
int a[D * N];

for (int i = 0; i < D * N; i += D)
    a[i] += 1;
```
- Mỗi lần truy cập sẽ tải một cache line (64 byte), với N = 8192, tổng dữ liệu cần tải là 64 * N = 512 KB, vừa với L2 cache của CPU, nên ta kỳ vọng hiệu năng sẽ ổn định, không đổi khi thay đổi D. 

- Tuy nhiên khi D lớn (≥ 256), hiệu năng giảm mạnh do TLB
- Với page_size = 4KB, CPU có:
  - L1 TLB: 64 entries → quản lý 64 × 4 KB = 512 KB.
  - L2 TLB: 2048 entries → quản lý 2048 × 4 KB = 8 MB
- Nếu D lớn hơn 256, mảng chiếm > 8 MB vượt quá khả năng của L2 TLB, CPU phải tra cứu page table trong RAM, rất chậm
- ==> Tăng Page Size: huge pages bằng cách chỉnh file /sys/kernel/mm/transparent_hugepage/enabled hoặc dùng system call madvise
    ```c
    #include <sys/mman.h>
    void *ptr = std::aligned_alloc(page_size, array_size);
    madvise(ptr, array_size, MADV_HUGEPAGE);
    ```
**Huge pages đặc biệt hữu ích cho truy cập thưa (sparse reads)**
