---
title: "Indirect Branching"
pubDate: "2026-03-28"
published: true
description: "Indirect Branching"
useKatex: false
---

# Indirect Branching

* Ngoài nhảy đến địa chỉ cố định, ta có thể nhảy đến địa chỉ nằm trong thanh ghi (ví dụ jmp rax). Đây gọi là computed jump (nhảy tính toán).
* Multiway Branch
    * Switch-case: giúp code gọn hơn nhưng bản chất vẫn là nhiều nhánh kiểm tra tuần tự
    * Tối ưu bằng bảng nhảy (branch table): Thay vì kiểm tra từng điều kiện, ta có thể tạo một mảng chứa địa chỉ nhảy, chỉ số của mảng chính là giá trị biến trạng thái.
    * 👉 bảng nhảy giúp loại bỏ chuỗi kiểm tra dài, tăng tốc độ xử lý. Multiway Branch đặc biệt hữu ích khi có nhiều trạng thái lặp lại (số nhánh nhiều (10–100 case)), như trong game, trình biên dịch, hoặc hệ thống điều khiển.
        ```C
        void weather_in_russia(int season) {
            static const void* table[] = {&&winter, &&spring, &&summer, &&fall};
            goto *table[season];
            winter:
                printf("Freezing\n");
                return;
            spring:
                printf("Dirty\n");
                return;
            summer:
                printf("Dry\n");
                return;
            fall:
                printf("Windy\n");
                return;
        }
        ```
