---
title: "Assembly Language"
pubDate: "2026-03-27"
published: true
description: "Assembly Language"
useKatex: false
---

# Assembly Language

* Assembly là ngôn ngữ gần với máy nhất, là phiên bản “dễ đọc hơn” của machine code (chuỗi nhị phân). Mỗi lệnh trong assembly gần như tương ứng 1-1 với lệnh máy

* Registers (thanh ghi): Có 16 thanh ghi tổng quát: rax, rbx, rcx, rdx, rdi, rsi, rbp, rsp, r8–r15. Các biến thể 64-bit, 32-bit, 16-bit, 8-bit (rax → eax → ax → al) thực chất là “cắt nhỏ” cùng một thanh ghi => ép kiểu trong ngôn ngữ lập trình thường “miễn phí” do chỉ đơn giản là nhìn vào một phần nhỏ hơn của cùng thanh ghi

* Moving Data
    * Lệnh mov : Dùng để copy dữ liệu, không phải “di chuyển” (giá trị gốc vẫn còn). Khi copy giữa hai thanh ghi, CPU thực hiện kiểu “đổi nhãn” (register renaming) chứ không phải thật sự copy, nên gần như không tốn thời gian
    * Một số lệnh toán học (như add) có thể trực tiếp dùng dữ liệu trong bộ nhớ. Ví dụ: add eax, [rdi] vừa load vừa cộng trong một bước.
* Addressing Modes:
    * [base + index * scale + displacement]
    * Nếu ta có mảng students[i] và mỗi phần tử có kích thước 8 byte, thì địa chỉ phần tử thứ i có thể viết [base + i * 8]. Nếu muốn lấy một trường cụ thể trong struct, ta cộng thêm displacement (ví dụ offset của trường đó).
    * Lệnh lea (load effective address): Không thực sự truy cập bộ nhớ, chỉ tính toán địa chỉ, có thể kết hợp cộng, nhân, cộng hằng số trong một lệnh duy nhất => lea thường được dùng như một “shortcut” để tối ưu hóa.
