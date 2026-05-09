---
title: "Pipeline Hazards"
pubDate: "2026-03-30"
published: true
description: "Pipeline Hazards"
useKatex: false
---

# Pipeline Hazards

* Hazard: Tình huống khiến lệnh tiếp theo không thể chạy ngay ở chu kỳ clock kế tiếp → gây ra pipeline stall (CPU phải dừng toàn bộ pipeline cho đến khi vấn đề được giải quyết)

* Các loại Hazard
    * Structural Hazard: nhiều lệnh cùng cần một phần cứng (VD: cùng muốn dùng ALU) => thiết kế phần cứng tốt hơn (nhiều đơn vị xử lý song song)
    * Data Hazard: lệnh sau cần dữ liệu từ lệnh trước, nhưng dữ liệu đó chưa tính xong => sắp xếp lại thứ tự tính toán để đường đi dữ liệu ngắn hơn
    * Control Hazard: khi CPU không biết lệnh nào sẽ chạy tiếp theo, thường do lệnh rẽ nhánh (if/else) => phải xóa (flush) toàn bộ pipeline và bắt đầu lại => giảm số lượng nhánh (ít if/else hơn) hoặc dự đoán nhánh (branch prediction) để CPU đoán trước hướng đi.

## Bài tập

### Câu hỏi tư duy

1. Cho code:
   ```c
   x = a + b;
   y = x * c;
   z = d + e;
   ```
   Lệnh nào có data hazard? Lệnh nào có thể chạy song song? CPU out-of-order làm gì?
2. RAW, WAR, WAW hazard là gì? Loại nào nguy hiểm nhất, loại nào CPU tự fix bằng register renaming?
3. Forwarding (bypass) là gì? Tại sao nó giảm được data hazard latency?
4. Tại sao "deep pipeline" (15-20 stages) cho clock cao nhưng dễ stall hơn?
5. Cho hàm `sum += a[i] * b[i]` trong loop: hazard nào tồn tại? Cách fix?

### Bài tập code

**Bài 1**: Viết 2 version compute `y[i] = a*x[i]² + b*x[i] + c`:
- (a) Naive: tính theo thứ tự `t1 = a*x[i]; t2 = t1*x[i]; t3 = b*x[i]; t4 = t2+t3+c`.
- (b) Restructured: tính `t1 = b + a*x[i]; t2 = t1*x[i] + c` (Horner's method).
Đo benchmark, đếm cycles. Cái nào ít data hazard hơn?

**Bài 2**: Viết loop summing với 4 independent accumulators. So sánh với 1 accumulator. Giải thích bằng latency/throughput hazard.

## Đáp án

### Câu hỏi tư duy

1. `y = x * c` có data hazard với `x = a + b` (cần x). `z = d + e` independent → có thể chạy song song với `x = a+b`. Out-of-order CPU detect dependency → dispatch `z=d+e` cùng cycle với `x=a+b`, sau đó `y=x*c`. Nếu add latency=1, mul=3: total = max(1, 1+3) = 4 cycles thay vì 1+3+1=5.

2. RAW (Read-After-Write): true dependency, không tránh được. WAR/WAW: false dependency do reuse register → CPU rename internally (~200 physical register vs 16 architectural) → eliminate.

3. Forwarding: kết quả của ALU stage được route trực tiếp đến input của instruction tiếp theo, không cần đợi write-back vào register file. Giảm latency từ ~3-4 cycles xuống 1.

4. Deep pipeline: clock cao vì mỗi stage làm ít việc. Nhưng misprediction phải flush nhiều stages → cost cao hơn. Pentium 4 (20+ stages, 3GHz) phải bỏ vì branch miss penalty quá lớn. Modern CPU (~14-19 stages) cân bằng.

5. `sum += a[i] * b[i]`: RAW chain on `sum` → mỗi iter phải đợi previous mul+add. Bottleneck = add latency = 1 cycle/elem. Fix: multiple accumulators, SIMD, FMA.

### Bài tập code

**Bài 1 — polynomial eval**:

```c
// (a) Naive — long dependency chain
double poly_naive(double a, double b, double c, double x) {
    double t1 = a * x;       // dep on x
    double t2 = t1 * x;      // dep on t1 (mul latency)
    double t3 = b * x;       // independent of t1, t2
    double t4 = t2 + t3 + c; // dep on t2, t3
    return t4;
}

// (b) Horner — shorter chain
double poly_horner(double a, double b, double c, double x) {
    return (a * x + b) * x + c;
}
```

Naive chain: x → t1 → t2 ↘
                       → t4
              x → t3 ↗
Critical path: x → t1 → t2 → t4 = mul + mul + add = 3+3+1 = 7 cycles.

Horner chain: x → (a*x) → (+b) → (*x) → (+c)
Critical: 4 ops, mul-add-mul-add = 3+1+3+1 = 8 cycles, BUT FMA combines mul+add → 4+4 = 8 cycles, hoặc với separate ops thì cùng 7 cycles. Trên FMA hardware, Horner còn 2 FMA chained = 4+4 = 8 cycles.

Với batch (loop qua nhiều x): naive parallelize tốt hơn. Single value: tương đương.

**Bài 2 — multi-accumulator**:

```c
// 1 accumulator — bottleneck = add latency = 1 cycle/elem
long sum_serial(const int* a, int n) {
    long s = 0;
    for (int i = 0; i < n; i++) s += a[i];
    return s;
}

// 4 accumulator — bottleneck = throughput = 0.25 cycle/elem
long sum_4acc(const int* a, int n) {
    long s0=0, s1=0, s2=0, s3=0;
    int i = 0;
    for (; i + 4 <= n; i += 4) {
        s0 += a[i+0]; s1 += a[i+1];
        s2 += a[i+2]; s3 += a[i+3];
    }
    long s = s0+s1+s2+s3;
    for (; i < n; i++) s += a[i];
    return s;
}
```

Serial: RAW chain `s_new = s_old + a[i]` → 1 add/cycle dù CPU có 4 ALU port.
4-acc: 4 independent chains → CPU dispatch 4 add cùng cycle → 4x throughput.

Với SIMD (AVX2): 8 int/vector × 4 acc → 32 ints/cycle. Combined với memory bandwidth limit, thực tế ~10-20x speedup vs serial.
