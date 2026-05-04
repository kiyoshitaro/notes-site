---
title: "Memory Bandwidth"
pubDate: "2026-04-10"
published: true
description: "Memory Bandwidth"
useKatex: false
---

# Memory Bandwidth

Thử nghiệm, tạo một mảng và lặp qua nó $K$ lần, mỗi lần đều tăng giá trị của các phần tử lên:
```cpp
int a[N];
for (int t = 0; t < K; t++)
    for (int i = 0; i < N; i++)
        a[i]++;
```
Kết quả quan sát:
* Khi mảng nằm trọn trong L1: Chương trình bị giới hạn bởi tốc độ tính toán của CPU thay vì băng thông của L1. Hiệu năng đạt mức tối đa lý thuyết (khoảng 16 GFLOPS chi 1 core nhơ SIMD + pipeline).

* Khi mảng lớn dần: Hiệu năng giảm xuống rõ rệt. Đầu tiên giảm còn khoảng 12-13 GFLOPS khi vượt quá L1, và cuối cùng chỉ còn khoảng 2 GFLOPS khi mảng không còn vừa trong L3 và phải dùng đến RAM.
  
### Frequency Scaling

Các tầng cache của CPU đều nằm trên cùng 1 con chip, vì vậy **băng thông và độ trễ của chúng sẽ tỉ lệ thuận với xung nhịp (clock frequency)**. Ngược lại, RAM nằm riêng biệt và chạy với xung nhịp cố định, nên đặc tính của nó không đổi.

Lưu ý: Khi so sánh các thuật toán, nếu dữ liệu nằm trong cache, hiệu năng sẽ thay đổi tùy theo xung nhịp CPU. Nhưng nếu dữ liệu nằm ở RAM, hiệu năng sẽ giữ nguyên bất kể CPU chạy nhanh hay chậm. Do đó, khi đo đạc (benchmark), tốt nhất nên cố định xung nhịp CPU.

### Directional Access

Hiệu năng lại khác nhau R/W?

Các thao tác này dùng chung bus. Đối với RAM, việc vừa đọc vừa ghi đồng thời sẽ làm hiệu năng giảm đi một nửa so với chỉ đọc vì bộ memory controller phải liên tục chuyển đổi chế độ giữa "đọc" và "ghi" trên đường truyền một chiều, làm giảm băng thông khả dụng.

Điểm bất thường: Vòng lặp "chỉ ghi" có hiệu năng thấp ngang ngửa với "đọc và ghi" khi dữ liệu nằm ở RAM. Đó là vì CPU có cơ chế: khi bạn ghi vào một địa chỉ, nó sẽ tự động thực hiện một lệnh đọc ngầm để đưa dữ liệu đó lên cache trước => tốn gấp đôi băng thông đường truyền.

### Bypassing the Cache
Có thể ngăn CPU đọc ngược dữ liệu vừa ghi bằng cách sử dụng các lệnh truy cập bộ nhớ non-temporal.

Thay vì dùng lệnh lưu trữ thông thường (_mm256_store_si256), chúng ta dùng các lệnh nội tại (intrinsics) SIMD (_mm256_stream_si256 - ghi thẳng xuống RAM, không qua cache ) => áp dụng cho memcpy
