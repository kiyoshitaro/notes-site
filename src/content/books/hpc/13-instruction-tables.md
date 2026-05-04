---
title: "Instruction Tables"
pubDate: "2026-05-04"
published: true
description: "Instruction Tables"
useKatex: false
---

# Instruction Tables

* Khái niệm Pipelining (đường ống) không chỉ cho CPU, mà từng bộ phận thực thi nhỏ bên trong cũng có "Pipelining" riêng của chúng
* Để hiểu các bảng thông số CPU, bạn cần phân biệt rõ hai loại "chi phí":

    * Latency (Độ trễ): Là tổng thời gian (cycles) để một lệnh hoàn tất và trả về kết quả.
    * Throughput (Băng thông/Năng suất): Là số lượng lệnh trung bình có thể thực hiện trong mỗi chu kỳ.Người ta thường dùng số nghịch đảo (Reciprocal Throughput) – tức là: "Cứ sau bao nhiêu lâu thì ta có thể đưa thêm một lệnh mới vào?"
    
    Ví dụ: Mặc dù nướng bánh mất 2 phút (độ trễ), nhưng cứ 30 giây bạn lại có thể nhét thêm một lát bánh mới vào khe bên cạnh. Vậy "Reciprocal Throughput" là 0.5 phút.
    
    | Instruction | Latency (Độ trễ) | RThroughput (Chu kỳ mỗi lệnh) | Mô tả                                       |
    | :---------- | :--------------: | :---------------------------: | :------------------------------------------ |
    | `jmp`       |        -         |               2               | Lệnh nhảy (không có kết quả trả về)         |
    | `mov r, r`  |        -         |              1/4              | Chép dữ liệu giữa các thanh ghi             |
    | `mov r, m`  |        4         |              1/2              | Đọc dữ liệu từ bộ nhớ vào thanh ghi (Load)  |
    | `mov m, r`  |        3         |               1               | Ghi dữ liệu từ thanh ghi vào bộ nhớ (Store) |
    | `add`       |        1         |              1/3              | Phép cộng số nguyên                         |
    | `cmp`       |        1         |              1/4              | Phép so sánh (thực chất là trừ ngầm)        |
    | `popcnt`    |        1         |              1/4              | Đếm số lượng bit 1                          |
    | `mul`       |        3         |               1               | Phép nhân số nguyên                         |
    | `div`       |      13-28       |             13-28             | Phép chia (Không được pipelined)            |
    ---

* Note:
    * Một số lệnh (như xor rax, rax để gán bằng 0 hoặc các lệnh nop) đôi khi được xử lý ngay tại bộ phận điều khiển (scheduler) mà không cần đi xuống tầng thực thi. Tuy nhiên, vẫn tốn "băng thông" vì CPU vẫn phải mất công đọc và giải mã lệnh đó
    * Nếu một lệnh có RThroughput < 1, điều đó có nghĩa là CPU có nhiều bộ thực thi song song cho lệnh đó, lệnh chia số nguyên là ngoại lệ. Nó cực kỳ chậm và thường không thể  pipelining
    * Các thông số trong bảng là Best case khi dữ liệu nằm sẵn trong L1 Cache. Nếu dữ liệu phải lấy từ RAM, độ trễ thực tế sẽ cao hơn gấp hàng trăm lần.
