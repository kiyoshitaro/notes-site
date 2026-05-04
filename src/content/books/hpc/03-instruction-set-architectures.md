---
title: "Instruction Set Architectures"
pubDate: "2026-05-04"
published: true
description: "Instruction Set Architectures"
useKatex: false
---

# Instruction Set Architectures

* ISA là “giao diện” giữa phần cứng và phần mềm. Nó định nghĩa cách CPU hiểu và thực thi mã máy, bao gồm:

    * Tập lệnh và cách mã hóa nhị phân.

    * Số lượng và kích thước các thanh ghi.

    * Mô hình bộ nhớ và nhập/xuất.

* Vai trò của ISA: Giống như interface trong lập trình, ISA cho phép:

    * Lập trình viên yên tâm rằng chương trình chạy ổn định trên các thế hệ CPU mới.

    * Kỹ sư phần cứng tự do tối ưu thiết kế mà không phá vỡ sự tương thích.
* RISC vs CISC:
  * Chip Arm (RISC): cải thiện hiệu suất bằng cách giữ cho tập lệnh nhỏ và được tối ưu hóa cao, được sử dụng trong hầu hết các thiết bị di động, cũng như các thiết bị giống máy tính khác như TV, tủ lạnh thông minh, lò vi sóng, chế độ lái tự động trên ô tô, v.v. 
  * chip x86 (CISC): cải thiện hiệu suất bằng cách thêm nhiều hướng dẫn chuyên biệt, được sử dụng trong hầu hết các máy chủ và máy tính để bàn, với một số ngoại lệ đáng chú ý như MacBook M1 của Apple, bộ xử lý Graviton của AWS và siêu máy tính nhanh nhất thế giới hiện nay. Chúng được thiết kế bởi sự độc quyền của Intel và AMD.
