---
title: "Functions và Recursion"
pubDate: "2026-05-04"
published: true
description: "Functions và Recursion"
useKatex: false
---

# Functions và Recursion

* Vấn đề khi gọi hàm trong Assembly
    * Khi gọi hàm, ta phải “nhảy” đến đầu hàm và sau đó quay lại vị trí cũ.

    * Hai vấn đề nảy sinh:

        * Xung đột thanh ghi: Caller và callee có thể dùng chung thanh ghi.

        * Quay lại đâu?: Cần lưu địa chỉ lệnh tiếp theo để biết đường quay lại.

    👉 Giải pháp: dùng stack để lưu thông tin cần thiết trước khi gọi hàm.

* Stack và các lệnh đặc biệt
    * Stack pointer (rsp): chỉ phần tử cuối cùng.
    * Base pointer (rbp): chỉ đầu stack frame.
    * Các lệnh đặc biệt:
      * push: ghi dữ liệu vào stack.
      * pop: lấy dữ liệu ra khỏi stack.
      * call: lưu địa chỉ lệnh tiếp theo vào stack rồi nhảy đến hàm.
      * ret: lấy địa chỉ từ stack để quay lại.

* Inlining
    *  Gọi hàm nhỏ nhiều lần gây tốn thời gian vì phải push/pop dữ liệu => ta có thể chèn trực tiếp vào chỗ gọi → tránh overhead.
 
* Tail Call Elimination
    * Tail recursion: nếu lời gọi hàm nằm ở cuối (không cần làm gì thêm sau đó), ta có thể biến nó thành vòng lặp → không cần stack.

    ```C
    int factorial(int n, int p = 1) {
        if (n == 0)
            return p;
        return factorial(n - 1, p * n);
    }
    ```

    ```
    factorial:
        mov  eax, 1
    loop:
        imul eax, edi
        sub  edi, 1
        jne  loop
        ret
    ```
