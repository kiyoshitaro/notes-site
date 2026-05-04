---
title: "Dynamic Dispatch"
pubDate: "2026-03-28"
published: true
description: "Dynamic Dispatch"
useKatex: false
---

# Dynamic Dispatch

* Dynamic dispatch là cơ chế chọn đúng hàm để gọi tại thời điểm chạy (runtime), dựa trên loại thực sự của đối tượng => là nền tảng của đa hình (polymorphism) trong lập trình hướng đối tượng.
* Compiler tạo vtable: một bảng chứa địa chỉ các hàm ảo => mỗi đối tượng có một con trỏ tới đúng vtable của lớp nó.

* Hạn chế
    * Có chi phí hiệu năng:
        * Nhảy gián tiếp khó dự đoán, pipeline CPU có thể bị flush → tốn thêm chu kỳ.
        * Không thể inline hàm.
        * Kích thước binary tăng nhẹ do thêm vtable.

* Vì vậy, trong hệ thống yêu cầu hiệu năng cao, người ta thường hạn chế dùng đa hình runtime, thay bằng đa hình compile-time (template, generic), compile-time polymorphism giúp tối ưu hiệu năng, vì không có chi phí nhảy gián tiếp.
    ```cpp
    template <typename T>
    T add(T a, T b) {
        return a + b;
    }
    int main() {
        int x = add(3, 4);       // compiler tạo phiên bản add<int>
        double y = add(2.5, 3.1); // compiler tạo phiên bản add<double>
    }
    ```
