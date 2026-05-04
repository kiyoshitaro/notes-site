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
```C
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
