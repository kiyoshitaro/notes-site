---
title: "Memory Latency"
pubDate: "2026-05-04"
published: true
description: "Memory Latency"
useKatex: false
---

# Memory Latency

Để đo băng thông, bạn chỉ cần thực hiện một chuỗi dài các lệnh đọc hoặc ghi độc lập, còn để đo độ trễ, chúng ta cần thiết kế một thí nghiệm mà CPU không thể "cheat" bằng cách biết trước địa chỉ bộ nhớ mà chúng ta sẽ yêu cầu.

Pointer Chasing; Một cách để đảm bảo CPU không đoán trước được là tạo ra một hoán vị ngẫu nhiên (random permutation) kích thước $N$ tạo thành một vòng lặp kín, sau đó liên tục truy cập theo hoán vị đó:
```cpp
// q là 1 shuffle 
for (int t = 0; t < K; t++)
    for (int i = 0; i < N; i++)
        k = q[k];
```

giá trị của k tiếp theo phụ thuộc vào giá trị q[k] hiện tại vừa được tải từ bộ nhớ => CPU buộc phải đợi cho đến khi dữ liệu cũ về tới nơi thì mới biết được địa chỉ tiếp theo để yêu cầu ===> Đo độ trễ là đo "khoảng thời gian phải chờ" giữa các lần truy cập dữ liệu không thể dự đoán trước
