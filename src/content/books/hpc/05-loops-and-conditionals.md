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

   Lý do ta unroll là để chia sẻ chi phí điều khiển vòng lặp (`add rax`, `cmp`, `jne`) cho nhiều lệnh hữu ích hơn. Ở ví dụ trên, nếu không unroll thì cứ 1 lệnh `add` hữu ích lại kèm 3 lệnh overhead; unroll ×4 biến tỉ lệ đó thành 4 hữu ích / 3 overhead. Càng gộp nhiều, phần overhead chia trên mỗi iteration càng nhỏ — nên với body cực ngắn, gộp 4 hay 8 lần thường là điểm ngọt: đủ để chi phí branch gần như biến mất, đồng thời cho CPU out-of-order đủ phép độc lập để chạy song song (instruction-level parallelism). Khi đẩy factor lên 16, 32 hay hơn, thân vòng lặp phình ra và bắt đầu gây áp lực lên **instruction cache** — một lần I-cache miss đắt hơn nhiều so với cái branch mà ta vừa tiết kiệm được. Cùng lúc, số biến sống đồng thời tăng, dễ cạn **register** và buộc compiler spill ra stack, sinh load/store thừa. Chưa kể nếu số iteration `n` không chia hết cho factor, ta phải viết thêm một vòng "dọn dẹp" cho phần dư — thêm code, thêm phức tạp.

    Cuối cùng, CPU out-of-order và branch predictor hiện đại đã tự overlap các iteration kế nhau khá tốt, nên unroll thủ công chỉ thắng rõ khi body cực nhỏ và `n` lớn; mà phần lớn trường hợp compiler cũng tự làm việc này (`-funroll-loops`). Vì vậy quy tắc an toàn nhất là **benchmark trước khi tự unroll**
* An Alternative Approach: Flag
    * Sau mỗi phép toán (add, sub, cmp, …), CPU tự động cập nhật FLAGS.

    * Các lệnh nhảy (je, jne, jg, jl, …) chỉ cần nhìn vào FLAGS để quyết định có nhảy hay không => Không nhất thiết phải dùng cmp để tạo điều kiện nhảy, add cũng cập nhật FLAGS (zero, âm, tràn…).
