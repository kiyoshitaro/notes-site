---
title: "Stages of Compilation"
pubDate: "2026-05-04"
published: true
description: "Stages of Compilation"
useKatex: false
---

# Stages of Compilation

Quá trình biên dịch chương trình C thành file thực thi qua 4 giai đoạn:
* Preprocessing: gcc -E source.c - Mở rộng macro, chèn nội dung từ file header, loại bỏ comment	=> Nếu bạn viết #include , tiền xử lý sẽ chép toàn bộ nội dung của stdio.h vào file nguồn trước khi biên dịch.
* Compiling: gcc -S file.c	- Kiểm tra cú pháp, chuyển sang Intermediate Representation (IR), tối ưu, dịch sang assembly => Code C a = b + c; sẽ thành lệnh assembly như add eax, ebx.
* Assembly: gcc -c file.c - Biến assembly thành mã máy (object file .o), nhưng các hàm ngoài như printf vẫn để placeholder
* Linking:  gcc -o binary file.c - Ghép các object file, gán địa chỉ thực cho hàm ngoài, tạo file thực thi => Nếu bạn gọi printf, linker sẽ tìm địa chỉ thật trong thư viện chuẩn C.

### Interprocedural Optimization

* Static libraries: tập hợp các file .o được gộp vào chương trình. Ưu điểm: cho phép tối ưu liên thủ tục (interprocedural optimization) như inlining (chèn trực tiếp hàm) hoặc dead code elimination (loại bỏ code thừa). -static để buộc trình liên kết tìm kiếm và chỉ chấp nhận các thư viện tĩnh

* Shared libraries: file thực thi riêng, được nạp khi chạy. Ưu điểm: nhiều chương trình có thể dùng chung, tiết kiệm bộ nhớ.

Link-Time Optimization (LTO): kỹ thuật mới (xuất hiện trong GCC ~2014) cho phép tối ưu toàn chương trình ở bước liên kết. Ví dụ: nếu một hàm trong thư viện không bao giờ được gọi, LTO có thể loại bỏ nó.

### Inspecting the Output

* Khi biên dịch với cờ -S, compiler sẽ tạo file .s chứa assembly – ngôn ngữ gần với máy nhưng vẫn đọc được, thêm -fverbose-asm sẽ có thêm comment: số dòng trong source code, thông tin về biến… giúp dễ đối chiếu

* Nếu bạn chỉ muốn xem nhanh, có thể dùng Compiler Explorer (trang web online)
    * Chuyển code C/C++ sang assembly ngay lập tức.
    * Tô màu các khối lệnh để dễ nhìn.
    * Có bảng tra nhỏ về tập lệnh x86.
    * Cho phép chọn nhiều compiler và ngôn ngữ khác nhau.

* Ngoài assembly, còn có một mức trừu tượng gọi là IR (Intermediate Representation) là dạng mà compiler dùng để tối ưu hóa chương trình. IR mô tả luồng tính toán chứ không phụ thuộc nhiều vào kiến trúc CPU (số thanh ghi, tập lệnh…). Xem IR giúp bạn hiểu compiler “nhìn” chương trình như thế nào.
