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

## Ví dụ: cùng một bài toán, hai kiểu đa hình

Cùng tính tổng diện tích một danh sách hình. Hai cách giải cho thấy rõ khác biệt **runtime** vs **compile-time**.

* **Đa hình RUNTIME (dynamic dispatch — qua `virtual`):**
    ```cpp
    struct Shape { virtual double area() const = 0; };
    struct Circle : Shape { double r;
        double area() const override { return 3.14159 * r * r; } };
    struct Square : Shape { double s;
        double area() const override { return s * s; } };

    double total(const std::vector<Shape*>& v) {
        double sum = 0;
        for (auto* sh : v)
            sum += sh->area();   // (*) gọi hàm nào? CHỈ biết tại RUNTIME
        return sum;
    }
    ```
    * Mỗi `Shape*` có thể trỏ tới `Circle` HAY `Square`. Tại `(*)`, CPU phải:
        1. Đọc con trỏ vtable từ object.
        2. Đọc địa chỉ `area()` từ vtable.
        3. **Nhảy gián tiếp** tới địa chỉ đó.
    * Địa chỉ đích chỉ biết lúc chạy → **không inline được**, nhảy khó dự đoán → có thể flush pipeline. Đây chính là "đa hình ở runtime".
    * **Lợi:** danh sách trộn lẫn `Circle` và `Square` trong cùng một vòng lặp; thêm hình mới (`Triangle`) không cần sửa `total()`.

* **Đa hình COMPILE-TIME (static dispatch — qua template):**
    ```cpp
    struct Circle { double r;
        double area() const { return 3.14159 * r * r; } };  // KHÔNG virtual
    struct Square { double s;
        double area() const { return s * s; } };

    template <typename T>
    double total(const std::vector<T>& v) {
        double sum = 0;
        for (const auto& sh : v)
            sum += sh.area();    // (*) compiler ĐÃ biết T → biết đúng area()
        return sum;
    }
    // total<Circle>(...)  và  total<Square>(...) là hai hàm riêng biệt
    ```
    * Compiler biết kiểu `T` ngay khi biên dịch → sinh code riêng cho từng kiểu, gọi **trực tiếp**, **inline** được (cộng dồn còn có thể vectorize).
    * Không vtable, không nhảy gián tiếp → nhanh hơn. Đây là "đa hình ở compile-time".
    * **Giá phải trả:** mỗi `vector` chỉ chứa MỘT kiểu (`vector<Circle>` riêng, `vector<Square>` riêng) — mất tính linh hoạt của danh sách trộn lẫn; binary phình ra vì mỗi `T` một bản code.

* **Tóm tắt khác biệt:**

    | | Runtime (virtual) | Compile-time (template) |
    |---|---|---|
    | Chọn hàm | Lúc chạy, qua vtable | Lúc biên dịch |
    | Cách gọi | Nhảy gián tiếp | Gọi trực tiếp, inline được |
    | Hiệu năng | Chậm hơn (khó predict, không inline) | Nhanh hơn |
    | Linh hoạt | Trộn nhiều kiểu trong 1 list | Mỗi kiểu một bản code |
    | Quyết định khi | Object được tạo lúc chạy | Lập trình viên biết kiểu sẵn |
