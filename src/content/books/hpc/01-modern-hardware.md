---
title: "Modern Hardware"
pubDate: "2026-05-04"
published: true
description: "Modern Hardware"
useKatex: false
---

# Modern Hardware

* Máy tính siêu cấp thập niên 1960  
    * Không phải là chậm, mà là quá to, phức tạp và đắt đỏ. Chỉ chính phủ các cường quốc mới đủ khả năng mua.

* Cách mạng vi mạch (microchip)  
    * Phát minh vi mạch (một mảnh silicon nhỏ chứa cả mạch điện hoàn chỉnh) đã làm thay đổi tất cả. Từ một “tủ” máy tính trị giá hàng triệu đô, đến năm 1975 có thể thu gọn trên miếng silicon vài mm với giá vài chục đô. Đây là nền tảng cho cuộc cách mạng máy tính cá nhân (Apple II, Commodore 64, IBM PC…).

* Quy trình chế tạo chip  
    * Dùng kỹ thuật quang khắc (photolithography): chiếu ánh sáng qua thấu kính để “in” mạch điện siêu nhỏ lên silicon. Nhờ đó, hàng ngàn transistor có thể nằm trên diện tích bằng móng tay
    * Transistor nhỏ hơn → điện tích ít hơn: Mỗi transistor hoạt động như một công tắc. Khi nó nhỏ đi, điện dung (khả năng tích điện) giảm. Kết quả: cần ít năng lượng hơn để bật/tắt → chuyển mạch nhanh hơn.
    * Khoảng cách ngắn hơn → tín hiệu đi nhanh hơn: Khi transistor thu nhỏ, các đường dẫn điện cũng ngắn lại. Dòng điện di chuyển quãng đường ngắn hơn → độ trễ giảm → xung nhịp có thể tăng.

* Định luật Dennard Scaling  
    * Khi thu nhỏ transistor:

    * Mật độ transistor tăng gấp đôi => động lực chính cho sự tiến bộ (Định luật Moore)

* Giới hạn vật lý  
    * Khoảng 2005–2007, Dennard scaling chấm dứt vì transistor quá nhỏ gây rò điện (leakage), sinh nhiệt và lỗi. Không thể tiếp tục tăng xung nhịp chỉ bằng thu nhỏ nữa. Công nghệ sản xuất vẫn tiếp tục thu nhỏ, nên số lượng transistor trên chip vẫn tăng lên nhưng không thể dùng số transistor đó chỉ để “chạy nhanh hơn”, mà phải tận dụng chúng thông minh hơn.

* Thay vì chỉ rút ngắn thời gian một nhịp đồng hồ, CPU hiện đại tập trung vào việc làm nhiều việc hữu ích trong cùng một nhịp:

    * Pipeline: chia nhỏ lệnh thành nhiều bước, xếp chồng để mỗi chu kỳ đều có việc.

    * Superscalar: nhiều đơn vị thực thi song song, một chu kỳ xử lý nhiều lệnh.

    * Out-of-order & speculative execution: tận dụng thời gian rảnh bằng cách dự đoán và thực hiện lệnh trước.

    * SIMD / vector units: một lệnh xử lý nhiều dữ liệu cùng lúc.

    * Đa nhân (multi-core): mỗi chu kỳ, nhiều nhân cùng chạy song song.

    * GPU & phần cứng chuyên dụng: hàng ngàn lõi nhỏ xử lý song song cho tác vụ đặc biệt.


    ![Die shot of a Zen CPU core by AMD (~1,400,000,000 transistors)](assets/die-shot-Zen-CPU-by-AMD.jpg)
