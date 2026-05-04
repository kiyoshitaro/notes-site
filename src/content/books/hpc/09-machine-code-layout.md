---
title: "Machine Code Layout"
pubDate: "2026-05-04"
published: true
description: "Machine Code Layout"
useKatex: false
---

# Machine Code Layout

Thông thường, chúng ta hay nghĩ CPU chậm là do tính toán (Back-end), nhưng thực tế, đôi khi CPU "đứng chơi" chỉ vì bộ phận nạp và giải mã lệnh (Front-end) không đưa dữ liệu tới đủ nhanh.

* Front-End của CPU
    * Các kỹ sư máy tính chia đường ống (pipeline) của CPU làm hai phần:
        * Front-end: Nơi lấy lệnh (fetch) từ bộ nhớ và giải mã (decode) chúng.
            * Fetch (Lấy lệnh): CPU nạp một khối byte cố định (thường là 32 bytes trên x86) từ bộ nhớ. Khối này phải căn lề (aligned): địa chỉ của nó phải là bội số của 32.
            * Decode (Giải mã): CPU nhìn vào khối 32 byte đó, cắt bỏ những phần thừa và chia chúng thành các lệnh (instructions).
                * Lệnh x86 có độ dài biến thiên (từ 1 đến 15 bytes).
                * Decode width: Số lệnh tối đa CPU có thể giải mã trong một chu kỳ (ví dụ Zen 2 là 4 lệnh/chu kỳ).
        * Back-end: Nơi lập lịch và thực thi lệnh.
    * Hầu hết thời gian chúng ta tối ưu Back-end, nhưng đôi khi Front-end lại là "nút thắt cổ chai". Hiệu suất có thể thay đổi chỉ vì những lý do kỳ lạ như: xóa một đoạn code không dùng đến, đổi chỗ lệnh if, hoặc thay đổi thứ tự khai báo hàm.
* Code Alignment
    * Hãy tưởng tượng một lệnh quan trọng nằm ở byte cuối cùng của khối 32 byte đã được căn lề. Để đọc lệnh tiếp theo, CPU phải tốn thêm một chu kỳ nữa để nạp khối 32 byte kế tiếp.

    * => Nếu chúng ta đẩy toàn bộ đoạn code đó bắt đầu ngay đầu khối 32 byte, CPU có thể nạp và giải mã 4 lệnh cùng lúc chỉ trong một nốt nhạc.

    * Kết luận: Trình biên dịch chấp nhận làm file thực thi lớn hơn một chút (bằng cách chèn NOP) để đảm bảo các vòng lặp hoặc hàm quan trọng nằm ở vị trí "đẹp" trong bộ nhớ, giúp Front-end nạp lệnh nhanh nhất.
* Instruction Cache
    * Lệnh cũng được lưu trong Cache giống như dữ liệu. Nhưng nếu code quá lớn (do lạm dụng Inlining hoặc Unrolling vòng lặp), nó sẽ làm tràn Cache lệnh (I-Cache) => Nên trình biên dịch se gom nhóm "hot code" ở cạnh nhau và đẩy "cold code" ra xa để tối ưu hóa bộ nhớ đệm.
* Unequal Branches

    ```C
    int length(int x, int y) {
        if (x > y)
            return x - y;
        else
            return y - x;
    }
    ```
    * Trong C, mã nguồn trông rất đối xứng, nhưng khi nhìn vào Assembly (mã máy), sự cân bằng này biến mất

        ```
        length:
            cmp  edi, esi
            jle  less        ; NẾU x <= y THÌ nhảy đến nhãn 'less'
            ; --- Nhánh x > y ---
            sub  edi, esi    ; x = x - y
            mov  eax, edi    ; Đưa kết quả vào thanh ghi trả về
        done:
            ret              ; Thoát hàm
        less:
            ; --- Nhánh x <= y ---
            sub  esi, edi    ; y = y - x
            mov  eax, esi
            jmp  done        ; Nhảy ngược lại nhãn 'done' để thoát
        ```
    * Nhánh x > y: CPU chạy thẳng từ trên xuống dưới (5 lệnh) rồi gặp ret là xong. Nếu các lệnh này nằm gọn trong một khối nạp (fetch block), nó sẽ cực nhanh
    * Nhánh x <= y: CPU phải thực hiện một cú nhảy (jle) để đến chỗ tính toán, sau đó lại tốn thêm một cú nhảy nữa (jmp done) để thoát. Mỗi cú nhảy đều có nguy cơ làm gián đoạn luồng nạp lệnh của Front-end.
    * ví dụ trường hợp x > y là rất hiếm => có thể tối ưu bằng cách sử dụng hàm swap 
        ```C
        int length(int x, int y) {
            if (x > y) [[unlikely]]
                swap(x, y);
            return y - x;
        }
        ```
        ```
        length:
            cmp  edi, esi
            jle  normal     ; Nếu x <= y, nhảy qua lệnh swap
            xchg edi, esi   ; Đổi chỗ x và y (lệnh swap)
        normal:
            sub  esi, edi
            mov  eax, esi
            ret
        ```
    * code ngắn hơn (6 lệnh) nhưng lệnh xchg (đổi chỗ) vẫn nằm đó, chiếm chỗ trong khối nạp lệnh (fetch block) dù nó hiếm khi được dùng -> them [[unlikely]] để trình biên dịch sẽ tự động sắp xếp Assembly để nhánh phổ biến nhất nằm ở vị trí "chạy thẳng"
        ```C
        int length(int x, int y) {
            if (x > y) [[unlikely]]
                swap(x, y);
            return y - x;
        }
        ```
        ```
        length:
            cmp  edi, esi
            jg   swap       ; Nếu x > y (hiếm), nhảy đi chỗ khác mà xử lý
        normal:             ; Đường đi chính (phổ biến)
            sub  esi, edi
            mov  eax, esi
            ret
        swap:               ; Vùng code "ngoại lệ"
            xchg edi, esi
            jmp normal      ; Xong thì quay lại
        ```
