---
title: "Statistical Profiling"
pubDate: "2026-05-04"
published: true
description: "Statistical Profiling"
useKatex: false
---

# Statistical Profiling

* Instrumentation (chèn mã đo lường vào chương trình) khá phiền phức và gây tốn tài nguyên, đặc biệt khi muốn phân tích nhiều đoạn nhỏ.

* => cách nhẹ nhàng hơn là ngắt chương trình tại các thời điểm ngẫu nhiên rồi xem con trỏ lệnh đang ở đâu. Số lần nó dừng ở mỗi hàm sẽ tỷ lệ với thời gian hàm đó chạy. Bằng cách xem call stack, ta còn biết hàm nào gọi hàm nào.

* có thể làm thủ công bằng gdb, nhưng CPU và hệ điều hành hiện đại đã có công cụ hỗ trợ.

### Hardware Events

* CPU có bộ đếm hiệu năng (performance counters) để ghi lại số lần xảy ra các sự kiện phần cứng như cache miss hay branch mispredict => reset bộ đếm khi bắt đầu chạy, rồi đọc kết quả sau khi kết thúc.

* Nếu muốn theo dõi nhiều sự kiện 1 lúc, dùng kỹ thuật multiplexing. Kết quả sẽ là xấp xỉ thống kê, không thể cải thiện độ chính xác bằng cách tăng tần suất lấy mẫu vì sẽ ảnh hưởng hiệu năng.

### Profiling with perf

* Perf là công cụ phân tích hiệu năng đi kèm Linux , có thể phân tích chương trình phức tạp, nhiều tiến trình, không cần mã nguồn

* Chạy với perf stat ./run sẽ cho thống kê như số chu kỳ CPU, số lệnh, số lần branch bị đoán sai, số cache miss…

* Nếu muốn biết chi tiết hàm nào tốn thời gian, dùng perf record ./run rồi perf report sẽ hiển thị danh sách hàm cùng tỷ lệ thời gian tiêu tốn.

* Ta có thể “zoom in” để xem assembly kèm heatmap, thấy rõ dòng lệnh nào chiếm nhiều thời gian nhất (ví dụ lệnh nhảy phụ thuộc vào kết quả so sánh).

.....
