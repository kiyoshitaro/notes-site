---
title: "Instruction Tables"
pubDate: "2026-04-02"
published: true
description: "Instruction Tables"
useKatex: false
---

# Instruction Tables

* Khái niệm Pipelining (đường ống) không chỉ cho CPU, mà từng bộ phận thực thi nhỏ bên trong cũng có "Pipelining" riêng của chúng
* Để hiểu các bảng thông số CPU, bạn cần phân biệt rõ hai loại "chi phí":

    * Latency (Độ trễ): Là tổng thời gian (cycles) để một lệnh hoàn tất và trả về kết quả.
    * Throughput (Băng thông/Năng suất): Là số lượng lệnh trung bình có thể thực hiện trong mỗi chu kỳ.Người ta thường dùng số nghịch đảo (Reciprocal Throughput) – tức là: "Cứ sau bao nhiêu lâu thì ta có thể đưa thêm một lệnh mới vào?"
    
    Ví dụ: Mặc dù nướng bánh mất 2 phút (độ trễ), nhưng cứ 30 giây bạn lại có thể nhét thêm một lát bánh mới vào khe bên cạnh. Vậy "Reciprocal Throughput" là 0.5 phút.
    
    | Instruction | Latency (Độ trễ) | RThroughput (Chu kỳ mỗi lệnh) | Mô tả                                       |
    | :---------- | :--------------: | :---------------------------: | :------------------------------------------ |
    | `jmp`       |        -         |               2               | Lệnh nhảy (không có kết quả trả về)         |
    | `mov r, r`  |        -         |              1/4              | Chép dữ liệu giữa các thanh ghi             |
    | `mov r, m`  |        4         |              1/2              | Đọc dữ liệu từ bộ nhớ vào thanh ghi (Load)  |
    | `mov m, r`  |        3         |               1               | Ghi dữ liệu từ thanh ghi vào bộ nhớ (Store) |
    | `add`       |        1         |              1/3              | Phép cộng số nguyên                         |
    | `cmp`       |        1         |              1/4              | Phép so sánh (thực chất là trừ ngầm)        |
    | `popcnt`    |        1         |              1/4              | Đếm số lượng bit 1                          |
    | `mul`       |        3         |               1               | Phép nhân số nguyên                         |
    | `div`       |      13-28       |             13-28             | Phép chia (Không được pipelined)            |
    ---

* Note:
    * Một số lệnh (như xor rax, rax để gán bằng 0 hoặc các lệnh nop) đôi khi được xử lý ngay tại bộ phận điều khiển (scheduler) mà không cần đi xuống tầng thực thi. Tuy nhiên, vẫn tốn "băng thông" vì CPU vẫn phải mất công đọc và giải mã lệnh đó
    * Nếu một lệnh có RThroughput < 1, điều đó có nghĩa là CPU có nhiều bộ thực thi song song cho lệnh đó, lệnh chia số nguyên là ngoại lệ. Nó cực kỳ chậm và thường không thể  pipelining
    * Các thông số trong bảng là Best case khi dữ liệu nằm sẵn trong L1 Cache. Nếu dữ liệu phải lấy từ RAM, độ trễ thực tế sẽ cao hơn gấp hàng trăm lần.

## Bài tập

### Câu hỏi tư duy

1. Giải thích sự khác biệt giữa **latency** và **throughput** bằng ví dụ thực tế khác. Khi nào bottleneck là latency, khi nào là throughput?
2. Tại sao `div` không pipelined được? Tại sao `mul` (3-cycle latency) lại pipelined với throughput 1/cycle?
3. Reciprocal throughput của `mov r,r` = 1/4 nghĩa là gì cụ thể? Một core có thể chạy bao nhiêu mov mỗi cycle?
4. Loop dependent chain `a = a + 1` (chuỗi cộng dồn) bị giới hạn bởi latency hay throughput? Còn loop independent `a[i] = a[i] + 1` thì sao?
5. Cho code:
   ```c
   for (int i = 0; i < n; i++) sum += arr[i];
   ```
   Với add latency=1, throughput=3/cycle. Tốc độ tối đa lý thuyết bao nhiêu cycles/element? Tại sao thực tế chậm hơn?

### Bài tập code

**Bài 1**: Viết hai phiên bản tính tổng `int[N]`:
- (a) `sum += arr[i]` — single accumulator (dependent chain).
- (b) Dùng 4 accumulator riêng rồi cộng cuối cùng (parallel chains).

Đo benchmark, giải thích tại sao (b) nhanh hơn ~4x dù cùng số phép cộng.

**Bài 2**: Cho hàm:
```c
double f(double* a, int n) {
    double s = 1.0;
    for (int i = 0; i < n; i++) s *= a[i];
    return s;
}
```
FP multiply latency = 4 cycles, throughput = 1/cycle. Tốc độ tối đa? Viết version dùng 4 accumulator để hit throughput limit.

## Đáp án

### Câu hỏi tư duy

1. Ví dụ: nhà hàng. Latency = thời gian khách đợi 1 món (10 phút). Throughput = số món bếp ra mỗi phút (5 món/min). Bottleneck **latency** khi 1 khách đợi 1 món duy nhất. Bottleneck **throughput** khi 100 khách cùng order — phải qua bếp lần lượt. Trong code: dependent chain (latency-bound), independent ops (throughput-bound).

2. `div` cần long iterative algorithm (radix-2/4 SRT division) — mỗi step phụ thuộc step trước, không split được thành stages độc lập → không pipelined. `mul` dùng Wallace/Dadda tree (parallel multiplier) → có thể chia thành 3 stages độc lập, mỗi stage handle multiplication mới mỗi cycle.

3. 1/4 nghĩa là CPU có thể start 4 `mov r,r` cùng cycle (4 ALU ports). Modern Intel/AMD có 4–8 execution ports. Mov register-register thường được "renamed" ở dispatch — không tốn ALU thực sự, gần như free.

4. Dependent chain: bottleneck latency (mỗi cộng phụ thuộc kết quả trước). Independent: bottleneck throughput. Giả sử latency=1, throughput=3/cycle: dependent chain chạy 1 cycle/element; independent chạy ~1/3 cycle/element (3 add cùng cycle).

5. Lý thuyết: 1/3 cycle/element nếu hoàn toàn parallel. Thực tế chậm hơn vì:
   - `sum` là dependent chain → tối đa 1 cycle/element (bị latency add).
   - Memory load có thể bottleneck.
   - Loop overhead (cmp+jmp).
   Để hit 1/3: dùng nhiều accumulator (xem bài 1) hoặc SIMD.

### Bài tập code

**Bài 1 — multiple accumulators**:

```c
// (a) dependent chain — bottleneck = add latency = 1 cycle/elem
long sum_serial(const int* a, int n) {
    long s = 0;
    for (int i = 0; i < n; i++) s += a[i];
    return s;
}

// (b) 4 parallel chains — bottleneck = throughput
long sum_parallel(const int* a, int n) {
    long s0=0, s1=0, s2=0, s3=0;
    int i = 0;
    for (; i + 4 <= n; i += 4) {
        s0 += a[i+0];
        s1 += a[i+1];
        s2 += a[i+2];
        s3 += a[i+3];
    }
    long s = s0 + s1 + s2 + s3;
    for (; i < n; i++) s += a[i];
    return s;
}
```

Giải thích: 4 accumulator độc lập → CPU dispatch 4 add cùng cycle (out-of-order). (a) bị giới hạn bởi data dependency `s_new = s_old + x` → 1 add/cycle. (b) tận dụng 3–4 ALU ports → ~3–4x speedup. Compiler `-O3 -funroll-loops` có thể auto-làm điều này, nhưng `-O2` thì thường không.

**Bài 2 — FP multiply**:

Lý thuyết tốt nhất: 1 multiply/cycle (throughput), nhưng dependent chain bị giới hạn bởi latency 4 → 1/4 multiply/cycle = 4 cycles/elem.

Để hit throughput limit, cần ≥4 independent chains (= latency / (cycle per op)):

```c
double f_parallel(const double* a, int n) {
    double s0=1, s1=1, s2=1, s3=1;
    int i = 0;
    for (; i + 4 <= n; i += 4) {
        s0 *= a[i+0];
        s1 *= a[i+1];
        s2 *= a[i+2];
        s3 *= a[i+3];
    }
    double s = (s0*s1) * (s2*s3);
    for (; i < n; i++) s *= a[i];
    return s;
}
```

Speedup ~4x so với serial. Quy tắc tổng quát: số accumulator cần thiết ≈ latency × throughput. AVX-512 FMA có latency 4, throughput 0.5 → cần 8 accumulator để max-utilize.

⚠️ Floating-point không associative — `(a*b)*c ≠ a*(b*c)` về độ chính xác bit-level. Compiler không tự reorder trừ khi `-ffast-math`.
