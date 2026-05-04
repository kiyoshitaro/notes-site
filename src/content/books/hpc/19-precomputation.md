---
title: "Precomputation"
pubDate: "2026-05-04"
published: true
description: "Precomputation"
useKatex: false
---

# Precomputation

Khi trình biên dịch (compiler) nhận ra một biến không phụ thuộc vào dữ liệu người dùng, nó có thể tính giá trị ngay tại thời điểm biên dịch và nhúng thẳng vào mã máy.

Ví dụ: nếu bạn viết const int x = 2 + 3;, thì compiler sẽ thay luôn x bằng 5 trong mã máy.

Chương trình chạy nhanh hơn vì không phải tính toán lúc chạy , nhưng đây không bắt buộc trong chuẩn C++, tùy compiler có làm hay không. Nếu việc tính toán phức tạp hoặc tốn thời gian, compiler có thể bỏ qua.

### Constant Expressions
Khi một hàm được đánh dấu constexpr và gọi với giá trị hằng số, compiler bắt buộc phải tính tại compile-time.
```C
constexpr int fibonacci(int n) {
    if (n <= 2)
        return 1;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

static_assert(fibonacci(10) == 55);
```

👉 Ở đây, fibonacci(10) được tính ngay khi biên dịch, kết quả là 55.

Hạn chế của constexpr
* Chỉ được gọi các hàm constexpr khác.
* Không được cấp phát bộ nhớ động (new, malloc).
* Dù không tốn chi phí lúc chạy, nhưng tăng thời gian biên dịch → tránh viết thuật toán quá phức tạp (ví dụ NP-complete).

Từ C++17: có thể viết theo imperative style (dùng vòng lặp, mảng, biến trạng thái) => giúp tạo lookup table (bảng tra cứu) ngay tại compile-time.
```C
struct Precalc {
    int isqrt[1000];

    constexpr Precalc() : isqrt{} {
        for (int i = 0; i < 1000; i++)
            isqrt[i] = int(sqrt(i));
    }
};

constexpr Precalc P;
static_assert(P.isqrt[42] == 6);
```

* 👉 Compiler sẽ tạo sẵn bảng căn bậc hai từ 0 đến 999, không cần tính lại lúc chạy.

* Nếu gọi constexpr với giá trị không phải hằng số (fibonacci(i)), compiler có thể tính lúc compile hoặc để lại cho runtime.
