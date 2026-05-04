---
title: "Branchless Programming"
pubDate: "2026-03-30"
published: true
description: "Branchless Programming"
useKatex: false
---

# Branchless Programming

* Cách loại bỏ branch bằng Predication: s += (a[i] < 50) * a[i];
* Trong assembly, không có kiểu Boolean, nhưng có thể dùng thủ thuật: (a[i] - 50) >> 31 để lấy bit dấu (sign bit)
* Predication loại bỏ control hazard (nguy cơ do nhánh), nhưng tạo ra data hazard (phải tính cả hai nhánh).

* Larger Examples check [code](./c/branchless.c):
    * Chuỗi rỗng (Empty string) 
        * Vấn đề: Thông thường ta phải kiểm tra if (str == nullptr) để xử lý chuỗi rỗng → tạo ra branch.
        * Giải pháp branchless: Quy ước mọi chuỗi rỗng đều trỏ đến một vùng nhớ đặc biệt gọi là zero C-string (một mảng chỉ chứa ký tự '\0').
            ```cpp
            // Khai báo zero string
            const char zero_string[1] = { '\0' };

            int length(const char* str) {
                // Nếu str là nullptr, gán về zero_string thay vì 
                // if (str == nullptr) {
                //    return 0; 
                // }
                str = (str ? str : zero_string);
                int len = 0;
                while (str[len] != '\0') {
                    len++;
                }
                return len;
            }
            ```
    * Binary Search không nhánh:
        * Vấn đề: Thuật toán tìm kiếm nhị phân (std::lower_bound) thường có nhiều if để so sánh → nhiều branch.
        * Giải pháp branchless: Viết lại thuật toán sao cho không có if, chỉ dùng toán tử và phép gán có điều kiện. Trên mảng nhỏ, cách này nhanh gấp 4 lần so với std::lower_bound
            ```cpp
            int branchless_binary_search(const int* arr, int n, int x) {
                int low = 0, high = n;
                while (low < high) {
                    int mid = (low + high) / 2;
                    // Không dùng if, thay bằng toán tử ?: 
                    low  = (arr[mid] < x) ? mid + 1 : low;
                    high = (arr[mid] < x) ? high    : mid;
                }
                return low;
            }
            ```
    * Data-parallel / SIMD:
        * Vấn đề: SIMD (Single Instruction, Multiple Data) không hỗ trợ branch. Nếu code có if, compiler khó vectorize.
        * Giải pháp: Viết branchless để compiler dễ dàng biến thành SIMD.
            ```cpp
            int sum_less_than_50(const int* arr, int n) {
                /* volatile */ int s = 0;
                for (int i = 0; i < n; i++) {
                    // Branchless: nhân với (arr[i] < 50)
                    s += (arr[i] < 50) * arr[i];
                }
                return s;
            }
            ```
        * Nếu bỏ volatile, compiler sẽ tự động vectorize vòng lặp này.
        * Kết quả: tốc độ tăng mạnh, chỉ mất ~0.3 chu kỳ cho mỗi phần tử.

## Bài tập

### Câu hỏi tư duy

1. Branchless luôn nhanh hơn branch? Khi nào branchless **chậm hơn**? Cho ví dụ cụ thể.
2. So sánh `cmov` (conditional move) với branch + jump trên hardware level. Cmov có "miễn phí" không, hay vẫn có cost?
3. Predication trade control hazard lấy data hazard. Khi nào trade này lợi, khi nào lỗ?
4. Tại sao binary search branchless dùng `(low+high)/2` lại nguy hiểm với `int` lớn? Fix?

### Bài tập code

**Bài 1**: Implement `int abs_branchless(int x)` không dùng `if` hoặc `?:`.

**Bài 2**: Implement `int max_branchless(int a, int b)` không dùng `if` hoặc `?:`.

**Bài 3**: Implement `int sign(int x)` trả về `-1` nếu x<0, `0` nếu x=0, `1` nếu x>0 — branchless.

**Bài 4**: Implement counting sort trên array `uint8_t arr[N]` (giá trị 0–255). Make sure inner loop không có branch — dùng predication để tăng counter.

## Đáp án

### Câu hỏi tư duy

1. Branchless **chậm hơn** khi:
   - Branch predictor đạt >95% accuracy → branch path skip work hoàn toàn, branchless luôn tính cả hai → wasted work.
   - Ví dụ: `if (rare_condition) expensive_function()`. Branchless force gọi `expensive_function()` mỗi iteration → catastrophic.
   - Tổng quát: branchless lợi khi predictor miss nhiều (random data) hoặc khi cả hai nhánh chi phí tương đương.

2. `cmov` vẫn cost 1 cycle latency + tạo **data dependency**: kết quả phụ thuộc cả 3 input (condition, src, dst) → có thể stall pipeline nếu condition chưa ready. Branch + jump khi predict đúng = 0 cycle visible cost (out-of-order hide). Đó là lý do compiler không phải lúc nào cũng emit cmov dù viết `?:`.

3. Trade lợi khi: nhánh không đoán được (random data), cả hai nhánh tính rẻ. Trade lỗ khi: nhánh đoán được tốt, hoặc một nhánh tính rất đắt mà thường không cần (e.g. error path).

4. `(low+high)/2` overflow khi `low+high > INT_MAX`. Fix: `low + (high-low)/2`. Bug nổi tiếng — Java's `Arrays.binarySearch` cũng từng dính (Joshua Bloch 2006 blog post).

### Bài tập code

**Bài 1 — `abs`**:

```c
int abs_branchless(int x) {
    int mask = x >> 31;        // -1 nếu x<0, 0 nếu x>=0 (arithmetic shift)
    return (x ^ mask) - mask;  // nếu mask=-1: ~x + 1 = -x; nếu mask=0: x
}
```

Giải thích: arithmetic right-shift sign bit fill toàn 1. XOR với -1 = NOT. NOT(x) - (-1) = NOT(x) + 1 = two's complement negation.

**Bài 2 — `max`**:

```c
int max_branchless(int a, int b) {
    int diff = a - b;
    int mask = diff >> 31;     // -1 nếu a<b, 0 nếu a>=b
    return a - (diff & mask);  // nếu a<b: a - (a-b) = b; ngược lại: a
}
```

Cảnh báo overflow khi `a - b` vượt `INT_MAX`. Cho unsigned hoặc range bounded thì OK.

**Bài 3 — `sign`**:

```c
int sign(int x) {
    return (x > 0) - (x < 0);  // 1-0=1, 0-1=-1, 0-0=0
}
```

Compiler hiện đại emit `setg` + `setl` → 2 instructions, không branch.

**Bài 4 — counting sort branchless**:

```c
void counting_sort_u8(uint8_t* arr, int n) {
    int count[256] = {0};
    for (int i = 0; i < n; i++) {
        count[arr[i]]++;       // inner: 1 load + 1 add + 1 store, no branch
    }
    int idx = 0;
    for (int v = 0; v < 256; v++) {
        for (int k = 0; k < count[v]; k++) arr[idx++] = v;
    }
}
```

Inner loop có data dependency `count[arr[i]]++` — nếu arr[i] cùng giá trị liên tiếp → store-to-load forwarding stall. Tối ưu: dùng nhiều count buffer rồi merge (4-way histogram), giảm dependency chain.


