---
title: "Contract Programming"
pubDate: "2026-04-02"
published: true
description: "Contract Programming"
useKatex: false
---

# Contract Programming

Trong Java, Rust… mọi thao tác đều có hành vi xác định rõ ràng. Ví dụ: truy cập mảng vượt chỉ số sẽ báo lỗi. Có một số thứ under-defined, chẳng hạn như thứ tự của các khóa trong bảng băm hoặc growth factor của một std::vector , nhưng đây thường là một số chi tiết nhỏ được để lại để thực hiện để tăng hiệu suất tiềm năng trong tương lai.


Ngược lại, C/C++ có khái niệm Undefined Behavior (UB) – hành vi không xác định. Như 1 contract between the programmer and the compiler , khi gặp UB, trình biên dịch có quyền làm bất cứ điều gì (include blowing up your monitor or formatting your hard drive). Thực tế, nó không “phá máy” mà dùng UB để loại bỏ các trường hợp đặc biệt, giúp tối ưu hóa. Dùng công cụ như -fsanitize=undefined để bắt lỗi.

Dễ hiểu hơn ở C ưu tiên tốc độ nên không có các safer/validator đằng trước như check div0 như các ngôn ngữ bậc cao mà nó chạy luôn hàm chia 0 và khi đó sẽ sinh ra UB

Ví dụ: 
* Vòng lặp và UB:
    * hầu hết CPU, INT_MAX + 1 == INT_MIN. C++ coi đây là UB => compiler có thể giả định (x+1) > x luôn đúng với int và bỏ kiểm tra thừa => 
        ```c 
        for (unsigned int i = 0; i < n; i++) { ... }
        ```
    * Nếu n > 2^32, biến i sẽ quay về 0 → vòng lặp vô hạn => compiler phải tính cả 2 trường hợp. Với int, tràn số có dấu là UB → compiler giả định không xảy ra → vòng lặp chạy đúng n lần.
* Loại bỏ corner case
    * C++ có [] (không an toàn) và .at() (an toàn, có kiểm tra).

* Dịch bit quá số lượng
    ```c
    int a = 1 << 40; // UB
    ```
    * Trên x86, kết quả khác với ARM. Nếu chuẩn hóa, compiler phải thêm kiểm tra → tốn hiệu năng. UB cho phép compiler bỏ qua kiểm tra, giả định bạn không làm điều vô lý này

### 📜 C++ Contracts
Có 3 loại: expects (điều kiện đầu vào), ensures (điều kiện đầu ra), assert (khẳng định trong code). 
```c
int mod_power_of_two(int x, int m)
    [[ expects: x >= 0 ]]
    [[ expects: is_power_of_two(m) ]]
    [[ ensures r: r >= 0 && r < m ]]
{
    int r = x & (m - 1);
    [[ assert: r = x % m ]];
    return r;
}
```

==> Người lập trình có thể tận dụng UB, assume, restrict, và contract programming để viết code vừa nhanh vừa an toàn.
