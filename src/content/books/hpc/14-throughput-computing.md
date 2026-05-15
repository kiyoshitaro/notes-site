---
title: "Throughput Computing"
pubDate: "2026-04-02"
published: true
description: "Throughput Computing"
useKatex: false
---

# Throughput Computing

2 chiến lược khác nhau tùy vào mục tiêu:

* Critical Path: Nếu các lệnh phụ thuộc lẫn nhau (lệnh sau cần kết quả lệnh trước), hãy nhìn vào cột Latency. Bạn cần tìm cách rút ngắn chuỗi phụ thuộc này.

* Hot Loops: Nếu các lệnh độc lập với nhau (như cộng dồn một mảng lớn), hãy nhìn vào cột Throughput. Mục tiêu là không để bộ thực thi nào bị quá tải trong khi các bộ khác đang rảnh.

* Example: 
    ```c
    int s = 0;

    for (int i = 0; i < n; i++)
        s += a[i];
    ```
    * Giả sử trong giây lát rằng trình biên dịch không vector hóa vòng lặp này. RThroughput của add là 2 trên CPU Zen 2, có nghĩa là ta có thể thực hiện 2 add mỗi chu kỳ. Nhưng với loop này điều này là không thể: s đang được sử dụng để tích lũy phần tử  i-th, nó không thể được sử dụng cho (i+1)-th trong ít nhất một chu kỳ.
    * Giải pháp là sử dụng 2 accumulators và chỉ cần tổng hợp các phần tử lẻ và chẵn riêng biệt:
        ```c
        int s0 = 0, s1 = 0;
        s0 += a[0];
        s1 += a[1];
        s0 += a[2];
        s1 += a[3];
        // ...
        int s = s0 + s1;
        ```
    * Với superscalar CPU ta có thể thực thi hai "thread" này đồng thời và tính toán không còn bất kỳ critical paths nào giới hạn thông lượng.
    * Giả sử  có một phép toán có latency: 5 cycles, throughput: 2 lệnh/cycle (CPU có 2 bộ thực thi song song cho lệnh này). Nếu chỉ dùng một biến tổng s = s + a[i], thì lệnh sau phải đợi lệnh trước xong (mất 5 chu kỳ). CPU của bạn có 2 bộ thực thi nhưng 1 bộ sẽ ngồi chơi, và bộ còn lại cũng phải đợi 5 chu kỳ mới được làm tiếp => cần 5 * 2 = 10 biến tích lũy => nạp liên tục 10 phép tính vào pipeline 
    * Lưu ý về Thanh ghi: CPU chỉ có một số lượng thanh ghi hữu hạn (16 hoặc 32). Nếu x*y quá lớn (ví dụ cần 40 biến) => hết sạch thanh ghi để chứa => CPU phải ghi tạm vào RAM (slow), làm mất tác dụng tối ưu
* Kỹ thuật dùng nhiều biến tích lũy này thường dùng với SIMD => giúp tính tổng một mảng dữ liệu khổng lồ nhanh hơn rất nhiều so với việc để compiler tự xử lý
* CPU hiện đại giống như một xưởng máy có nhiều cửa (Ports). Mỗi loại executor đứng ở một cửa riêng => Chiến lược: xác định xem lệnh nào là quan trọng nhất và tốn thời gian nhất trong vòng lặp (ví dụ lệnh Nhân). Sau đó, tính toán sao cho các lệnh khác (Cộng, Nhảy, Load dữ liệu) không làm nghẽn các cửa mà lệnh Nhân cần dùng
* VD: register-register add có băng thông là 4, nhưng nếu viết add r, m (cộng một giá trị từ bộ nhớ vào thanh ghi), CPU phải thực hiện lệnh mov ngầm để lấy dữ liệu từ RAM mà băng thông mov chỉ là 2 => tốc độ cuối cùng bị kéo xuống còn 2.
* Tìm nút thắt: Sử dụng các công cụ phân tích (như LLVM-MCA) để biết lệnh nào đang đứng xếp hàng chờ ở cổng nào.
