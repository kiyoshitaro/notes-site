---
title: "Loops and Conditionals"
pubDate: "2026-03-28"
published: true
description: "Loops and Conditionals"
useKatex: false
---

# Loops and Conditionals

* Jump
    * Assembly không có if, for như ngôn ngữ cấp cao, mà dùng jump. Có 2 loại:

        * Unconditional jump (jmp): nhảy luôn, thường dùng cho vòng lặp vô hạn.

        * Conditional jump (jne, je, …): nhảy nếu điều kiện trong FLAGS register thỏa mãn
    * Ví dụ: cmp rax, rcx cập nhật FLAGS, sau đó jne loop kiểm tra bit trong FLAGS để quyết định có quay lại vòng lặp hay không.

* Loop Unrolling:
    * Vấn đề: mỗi vòng lặp chỉ có 1 lệnh hữu ích, còn lại là kiểm tra và tăng biến.
    * Giải pháp: gộp nhiều lần lặp vào một vòng → giảm overhead.

    ```c
    loop:
    add  edx, [rax]
    add  edx, [rax+4]
    add  edx, [rax+8]
    add  edx, [rax+12]
    add  rax, 16
    cmp  rax, rsi
    jne  loop
    ```
* An Alternative Approach: Flag
    * Sau mỗi phép toán (add, sub, cmp, …), CPU tự động cập nhật FLAGS.

    * Các lệnh nhảy (je, jne, jg, jl, …) chỉ cần nhìn vào FLAGS để quyết định có nhảy hay không => Không nhất thiết phải dùng cmp để tạo điều kiện nhảy, add cũng cập nhật FLAGS (zero, âm, tràn…).
