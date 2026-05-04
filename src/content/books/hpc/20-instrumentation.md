---
title: "Instrumentation"
pubDate: "2026-04-02"
published: true
description: "Instrumentation"
useKatex: false
---

# Instrumentation

- Instrumentation thực chất chỉ là chèn thêm các đoạn mã để đo thời gian hoặc theo dõi hoạt động của chương trình (dùng lệnh time,..). 

- Hàm chạy quá nhanh, việc đo bằng clock() sẽ không chính xác, vì clock() chỉ có độ phân giải đến microsecond (10⁻⁶ giây) và bản thân clock() cũng mất vài trăm nanosecond => lặp lại hàm nhiều lần

### Event Sampling

Instrumentation không chỉ dùng để đo thời gian, mà còn để thu thập thống kê đặc thù của thuật toán. Ví dụ:
- Với hàm băm (hash function): quan tâm đến độ dài trung bình của input.
- Với cây nhị phân: quan tâm đến kích thước và chiều cao.
- Với thuật toán sắp xếp: quan tâm đến số lần so sánh.

Ta có thể chèn counter (bộ đếm) vào code để ghi lại các thống kê này, để giảm overhead, ta chỉ ghi thống kê ngẫu nhiên cho một phần nhỏ các lần gọi thậm trí có thể dùng phân phối hình học để biết sau bao nhiêu lần gọi thì mới cần lấy mẫu tiếp theo
