---
title: "Memory Hierarchy"
pubDate: "2026-04-02"
published: true
description: "Memory Hierarchy"
useKatex: false
---

# Memory Hierarchy

| Loại | M       | B   | Độ trễ | Băng thông | Chi phí/GB/tháng |
| ---- | ------- | --- | ------ | ---------- | ---------------- |
| L1   | 10K     | 64B | 2ns    | 80G/s      | -                |
| L2   | 100K    | 64B | 5ns    | 40G/s      | -                |
| L3   | 1M/core | 64B | 20ns   | 20G/s      | -                |
| RAM  | GBs     | 64B | 100ns  | 10G/s      | 1.5              |
| SSD  | TBs     | 4K  | 0.1ms  | 5G/s       | 0.17             |
| HDD  | TBs     | -   | 10ms   | 1G/s       | 0.04             |
| S3   | ∞       | ∞   | 150ms  | ∞          | 0.022            |

### Volatile Memory

* CPU register: zero-time access data cells CPU, store all its intermediate values. Rất ít (chỉ 16).
* Cache CPU: gồm nhiều tầng (L1, L2, L3, đôi khi L4). Cache L3 thường chia sẻ giữa nhiều nhân CPU.
* RAM: loại bộ nhớ có thể mở rộng. Ngày nay có thể thuê máy với hàng trăm GB RAM trên cloud.

Một khái niệm quan trọng: cache line. Đây là đơn vị cơ bản để CPU trao đổi dữ liệu với RAM. Thường là 64 byte. Nghĩa là khi bạn đọc 1 byte, thực tế CPU sẽ lấy cả 64 byte (bao gồm 63 byte lân cận). Việc cache diễn ra tự động dựa trên thời điểm truy cập gần nhất, không kiểm soát trực tiếp

### Non-Volatile Memory

* SSD: độ trễ ~0.1ms, nhanh hơn HDD, không có bộ phận cơ học. Nhưng tuổi thọ giới hạn vì mỗi ô nhớ chỉ ghi được số lần nhất định.
* HDD: đĩa quay cơ học, đầu đọc/ghi phải di chuyển. Truy cập ngẫu nhiên rất chậm (ms). Tuổi thọ trung bình ~3 năm trong data center.
* Lưu trữ qua mạng (NAS):
    * NFS: gắn hệ thống file của máy khác qua mạng. Nếu cùng data center, có thể nhanh hơn HDD.
    * Object storage (ví dụ Amazon S3): lưu trữ phân tán, độ trễ 50–100ms, thường dùng HDD giá rẻ bên dưới. Rất bền và có khả năng nhân bản.
