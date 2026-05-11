---
title: "Alignment and Packing"
pubDate: "2026-04-13"
published: true
description: "Alignment and Packing"
useKatex: false
---

# Alignment and Packing

Bộ nhớ máy tính được chia thành các cache line kích thước 64 byte. Điều này gây khó khăn khi thao tác với dữ liệu vượt qua ranh giới của một dòng bộ nhớ đệm như khi cần truy xuất một số nguyên 32 bit, thì nó phải nằm gọn trong một dòng cache duy nhất. Nếu dữ liệu nằm trên hai dòng cache, việc truy xuất sẽ tốn nhiều băng thông hơn và phần cứng phải ghép kết quả, tiêu tốn thêm tài nguyên => ảnh hưởng mạnh đến cách thiết kế thuật toán và cách trình biên dịch sắp xếp dữ liệu trong bộ nhớ.

### Aligned Allocation
VD: Compiler luôn đảm bảo địa chỉ của các phần tử luôn là bội số của kích thước phần tử để mỗi phần tử chỉ nằm trong 1 dòng cache. 
```c
alignas(32) float a[n];
void *a = std::aligned_alloc(32, 4 * n);
struct alignas(64) Data {
    // ...
};
```
Khi struct chứa nhiều kiểu dữ liệu khác nhau, compiler luôn thêm padding để đảm bảo các thành viên trong struct/mảng được căn chỉnh đúng, coder có thể **tự sắp xếp lại thứ tự** các thành viên nếu muốn giảm padding và tối ưu kích thước

Bạn có thể yêu cầu trình biên dịch bỏ padding bằng thuộc tính packed:
```c
struct __attribute__ ((packed)) Data {
    long long a;
    bool b;
};
```

có thể kết hợp packing với bit fields để xác định số bit cho từng thành viên => không quá phổ biến vì CPU không có số học 3 byte hoặc những thứ tương tự và phải thực hiện một số chuyển đổi byte-by-byte không hiệu quả trong quá trình tải:
```c
struct __attribute__ ((packed)) Data {
    char a;     // 1 byte
    int b : 24; // 3 byte
};
```

## Bài tập

### Câu hỏi tư duy

1. Tại sao truy cập `int` không aligned (cross cache-line boundary) chậm hơn? Cụ thể bao nhiêu cycles bị mất?
2. AVX-512 yêu cầu data align 64-byte cho `_mm512_load_ps`. Nếu dùng `_mm512_loadu_ps` (unaligned) trên data đã align, có chậm hơn không? Còn unaligned thật?
3. `__attribute__((packed))` luôn tốt? Khi nào tệ?
4. Cho struct với 3 field: `int a; char b; double c;`. Sizeof? Reorder để minimize?
5. Tại sao `malloc` trả về pointer align 16 byte mặc định trên 64-bit (không phải 8)?

### Bài tập code

**Bài 1**: Tính `sizeof` và padding của:
```c
struct A { char x; int y; char z; };
struct B { int y; char x; char z; };
struct C { char x; char z; int y; };
```
Vẽ memory layout từng struct. Cái nào tốt nhất?

**Bài 2**: Đo cost của misaligned load. Allocate buffer 64 byte aligned, đọc `int` từ offset 0, 1, 2, ..., 63. Vẽ đồ thị thời gian theo offset. Knee ở đâu?

**Bài 3**: Dùng `alignas(64)` để chống false sharing trong counter array dùng cho 4 thread:
```c
struct Counter { /* TODO: align để mỗi counter trên cache line riêng */ };
Counter counters[4];
```

## Đáp án

### Câu hỏi tư duy

1. Misaligned load cross cache-line: CPU phải load 2 cache lines, ghép byte, return. Trên Intel hiện đại: 2–10 extra cycles. Cross page boundary (4KB): còn nặng hơn vì 2 TLB lookups → 50+ cycles. AVX vector load cross-line phạt nặng hơn scalar.

2. Trên CPU mới (Haswell+), `loadu_ps` trên data đã align gần bằng `load_ps` — chỉ chậm khi thực sự misaligned. Trên CPU cũ (Sandy Bridge), `loadu` có overhead nhỏ luôn (~1 cycle). Best practice: luôn dùng `loadu` (an toàn) trừ khi guarantee align bởi `alignas`.

3. `packed` tệ khi:
   - CPU không hỗ trợ unaligned access (ARM cũ, embedded) → SIGBUS hoặc emulation chậm.
   - Field truy cập thường → mỗi access là misaligned → slowdown.
   - Compiler không thể vectorize trên packed struct.
   Tốt khi: serialization (binary format), bit packing (mạng/disk), space-critical (embedded).

4. `int a; char b; double c;` với 8-byte align:
   - `a` (4) + 4 padding (để `c` align 8) + `b` (1) + 7 padding + `c` (8)? Không, compiler đặt theo declaration order: `a`(4) at 0, `b`(1) at 4, **5 padding** at 5–7 (để `c` at 8), `c`(8) at 8 → tổng 16.
   - Reorder: `c, a, b` → `c`(8) at 0, `a`(4) at 8, `b`(1) at 12, **3 padding** cuối (struct align = 8) → 16. Cùng kích thước.
   - Best: `c`(8), `a`(4), `b`(1), no padding cuối nếu `[]` → tổng 13, padded to 16 vẫn vậy. **Quy tắc**: sort field theo size giảm dần để minimize internal padding.

5. `malloc` align 16 vì: SSE vector type `__m128` cần align 16, `long double` x86 align 16, ABI yêu cầu stack align 16 trước function call → heap consistency. C11 `aligned_alloc` cho phép custom align (32 cho AVX, 64 cho AVX-512).

### Bài tập code

**Bài 1 — struct layouts**:

```
struct A { char x; int y; char z; };
  Layout: x(1) [pad 3] y(4) z(1) [pad 3]    → sizeof = 12
  Cache lines/struct: 1, but 7/12 byte = padding (58% waste)

struct B { int y; char x; char z; };
  Layout: y(4) x(1) z(1) [pad 2]            → sizeof = 8
  Padding: 2/8 = 25%

struct C { char x; char z; int y; };
  Layout: x(1) z(1) [pad 2] y(4)            → sizeof = 8
  Padding: 2/8 = 25%
```

B và C tốt nhất. Nguyên tắc: sort field từ lớn → nhỏ giảm padding nhất.

**Bài 2 — misaligned load benchmark**:

```c
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <time.h>

double bench_load_at(uint8_t* buf, int offset, long iters) {
    volatile int sink = 0;
    struct timespec t0, t1;
    clock_gettime(CLOCK_MONOTONIC, &t0);
    for (long i = 0; i < iters; i++) {
        int* p = (int*)(buf + offset);
        sink += *p;
    }
    clock_gettime(CLOCK_MONOTONIC, &t1);
    return (t1.tv_sec-t0.tv_sec)*1e9 + (t1.tv_nsec-t0.tv_nsec);
}

int main(void) {
    uint8_t* buf = aligned_alloc(64, 128);
    long iters = 1'000'000'000;
    for (int off = 0; off < 64; off++) {
        double ns = bench_load_at(buf, off, iters);
        printf("offset=%2d: %.2f ns/load\n", off, ns/iters);
    }
}
```

Kết quả điển hình:
- offset 0–60: ~0.3 ns/load (aligned within cache line)
- offset 61: cross cache-line! `int` 4 byte tại offset 61 → bytes 61–64 cross line → +2–5 ns
- offset 62, 63: cross-line, slow
- offset 64: aligned to next line, fast again

Knee tại offset = 61 (khi int(4B) bắt đầu cross 64B boundary).

**Bài 3 — false sharing prevention**:

```c
#include <stdalign.h>

struct alignas(64) Counter {
    long value;
    char padding[64 - sizeof(long)];  // fill rest of cache line
};

Counter counters[4];  // 256 byte, mỗi counter 1 cache line riêng
```

Hoặc C11 idiomatic:
```c
typedef struct {
    _Alignas(64) long value;
} Counter;
```

Thread n increment `counters[n].value` → mỗi thread ghi vào cache line riêng → no MESI invalidation traffic giữa cores. Without padding: 4 long = 32 byte chung 1 cache line → mọi thread cùng tranh chấp → 10–100x slowdown.


