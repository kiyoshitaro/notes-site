---
title: "Flags and Targets"
pubDate: "2026-04-02"
published: true
description: "Flags and Targets"
useKatex: false
---

# Flags and Targets

### Optimization Levels
- O0: mức mặc định, không tối ưu gì cả. Ưu điểm là biên dịch nhanh, dễ debug.

- O1 (hay -O): thực hiện vài tối ưu cơ bản, không ảnh hưởng nhiều đến thời gian biên dịch.

- O2: bật tất cả các tối ưu “an toàn”, không gây tác dụng phụ, thời gian biên dịch hợp lý. Đây là mức phổ biến nhất cho sản phẩm thực tế.

- O3: tối ưu rất mạnh, bật hầu hết các kỹ thuật tối ưu có sẵn. Có thể tăng tốc nhưng đôi khi làm code phức tạp hơn hoặc dài hơn.

- Ofast: giống -O3 nhưng thêm một số tối ưu “mạnh tay” hơn, có thể phá vỡ chuẩn nghiêm ngặt (ví dụ: thay đổi cách tính toán số thực, kết quả có thể sai lệch vài bit).

👉 mức càng cao thì chương trình chạy càng nhanh, nhưng có thể mất tính tương thích hoặc khó debug hơn.

### Specifying Targets
* Mặc định: GCC tạo ra mã chạy được trên hầu hết CPU x86 từ năm 2000 trở lại đây.

    - -march: chỉ định kiến trúc CPU cụ thể, ví dụ -march=haswell. Nếu biên dịch ngay trên máy sẽ chạy, có thể dùng -march=native để tự động chọn.
    - -mtune: tinh chỉnh cho CPU cụ thể nhưng vẫn giữ tính tương thích.

* Pragma trong code:
    ```c
    #pragma GCC optimize("O3")
    #pragma GCC target("avx2")
    ```
    → chỉ tối ưu riêng một hàm hoặc file, không ảnh hưởng toàn bộ project.

    👉 càng thu hẹp phạm vi CPU hỗ trợ, compiler càng tạo ra mã chạy nhanh hơn.

### Multiversioned Functions
Đôi khi viết nhiều phiên bản của cùng một hàm, để compiler tự chọn phiên bản phù hợp với CPU: 
```C
__attribute__(( target("default") )) // phiên bản mặc định
int popcnt(int x) {
    int s = 0;
    for (int i = 0; i < 32; i++)
        s += (x>>i&1);
    return s;
}

__attribute__(( target("popcnt") )) // nếu CPU hỗ trợ POPCNT
int popcnt(int x) {
    return __builtin_popcount(x);
}
```
