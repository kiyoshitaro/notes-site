---
title: "Floating-Point Numbers"
pubDate: "2026-05-04"
published: true
description: "Floating-Point Numbers"
useKatex: false
---

# Floating-Point Numbers

Những điều kỳ lạ như 0.1 + 0.2 != 0.3 khiến nhiều người vẫn hiểu sai rằng số chấm động “không chính xác, không ổn định, và chậm hơn số nguyên”. Thực tế thì ngược lại:

* Nhờ có các lệnh chuyên dụng, số chấm động thường nhanh hơn số nguyên.
* Chuẩn IEEE-754 quy định rõ ràng cách làm tròn, nên ta có thể kiểm soát sai số một cách đáng tin cậy.

* Ví dụ: JavaScript chỉ có một kiểu số duy nhất — 64-bit double. Nhờ cách biểu diễn này, mọi số nguyên trong khoảng từ −2^53 đến 2^53 đều được lưu chính xác, nên gần như không cần kiểu số nguyên riêng biệt.

Thông thường, các phép toán bitwise (như AND, OR, XOR, dịch bit) chỉ áp dụng cho số nguyên. Bộ xử lý số chấm động (Floating-Point Unit – FPU) không hỗ trợ trực tiếp các phép này. Vì vậy, khi muốn thực hiện bitwise trên số trong JavaScript (mà tất cả số đều là kiểu double), ta phải chuyển đổi số thực sang số nguyên.

Điều này xảy ra thường xuyên đến mức ARM đã thêm một lệnh đặc biệt vào tập lệnh của mình: FJCVTZS (Floating-point Javascript Convert to Signed fixed-point, rounding toward Zero) -> chuyển số thực (floating-point) thành số nguyên có dấu (signed integer), làm tròn về 0 (giống hệt cách JavaScript làm).

Ví dụ: Trong JavaScript: Math.floor(3.9) cho ra 3, nhưng khi chuyển đổi bằng bitwise (ví dụ 3.9 | 0), kết quả cũng là 3 vì nó làm tròn về 0. Với số âm: -3.9 | 0 sẽ thành -3 (không phải -4), vì quy tắc là làm tròn về 0.

Điều thú vị ở đây là: phần mềm (JavaScript) đã ảnh hưởng ngược lại đến phần cứng (ARM CPU). Tức là, vì JavaScript được dùng quá phổ biến, ARM phải thêm hẳn một lệnh trong CPU để hỗ trợ chính xác cách JavaScript xử lý số. Đây là ví dụ điển hình của vòng phản hồi giữa phần mềm và phần cứng.

### Real Number Representations

Trước khi chuyển thẳng đến các số dấu phẩy động, hãy thảo luận về các lựa chọn thay thế có sẵn và động lực đằng sau chúng - sau tất cả, những người tránh số học dấu phẩy động đều có lý.

* Symbolic Expressions
    * biểu diễn số thực bằng biểu thức toán học thay vì giá trị số thập phân ( **0.3333** →  **1/3**, **1.4142** →  **√2**).
    * Chính xác tuyệt đối, không có sai số nhưng rất tốn tài nguyên vì phải lưu toàn bộ lịch sử phép toán, dùng trong các hệ thống toán học như WolframAlpha, SageMath

* Fixed-Point Numbers
    * Dùng số nguyên nhưng coi như đã nhân với một hằng số (NASDAQ dùng đơn vị 1/10000$ là số nguyên 123456 thực chất là $12.3456)
    * Dễ kiểm soát làm tròn, phù hợp cho tiền bạc nhưng không linh hoạt, dễ tràn số hoặc làm tròn về 0 nếu số quá lớn/nhỏ, như Ngân hàng: Khi tính lãi suất, họ thường lưu số tiền dưới dạng cent hoặc phần nghìn để cộng trừ chính xác

* Floating-Point Numbers
