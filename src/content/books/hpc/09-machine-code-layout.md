---
title: "Machine Code Layout"
pubDate: "2026-03-30"
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

    ```c
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
        ```c
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
        ```c
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

## Bài tập

### Câu hỏi tư duy

1. Front-end vs Back-end bottleneck: làm sao biết code đang stall ở đâu? Tool gì dùng để đo?
2. Tại sao alignment quan trọng cho hot loops? 16-byte vs 32-byte vs 64-byte alignment khác nhau thế nào?
3. Loop unrolling cải thiện gì? Khi nào unroll quá nhiều lại hại?
4. Inline function: lợi và hại về code layout?
5. Dùng `__attribute__((cold))` có tác dụng gì với compiler?

### Bài tập code

**Bài 1**: Viết hot loop và force compiler align nó vào 32-byte boundary. Inspect assembly bằng `objdump -d`. Tìm `nop` padding chèn vào.

**Bài 2**: Cho function với rare error path. Mark error path bằng `__attribute__((cold))`. So sánh assembly layout có và không có hint.

## Đáp án

### Câu hỏi tư duy

1. Tool: `perf stat` với event như `idq.mite_uops`, `idq_uops_not_delivered.core` (Intel). High = front-end stall. `cycle_activity.stalls_l1d_miss` etc cho back-end. Intel VTune phân tích chi tiết. Quy tắc: nếu IPC thấp + nhiều branch miss/icache miss → front-end. IPC thấp + cache miss/data hazard → back-end.

2. CPU fetch instructions theo block 16 hoặc 32 byte. Loop top không align có thể split across blocks → 1 extra fetch cycle. 16-byte: SSE generation. 32-byte: AVX/Haswell+ (uop cache line). 64-byte: cache line align (rare cho code). Compiler `-falign-loops=16` hoặc `[[gnu::aligned(32)]]` force.

3. Unroll: giảm branch overhead (loop test), tăng ILP (more independent ops/iter). Hại khi: (1) code blow up → I-cache miss tăng. (2) Vượt qua "uop cache" (~1500 uops Intel) → fall back to slow legacy decoder. Sweet spot thường 4-8x unroll.

4. Inline lợi: bỏ call overhead, enable cross-function optimization. Hại: code growth → I-cache pressure, có thể làm hot loop không vừa uop cache.

5. `cold` attribute: compiler đặt function trong section `.text.cold` (xa hot code), không inline, dùng smaller alignment. Caller skip prefetch. Tốt cho error handlers, init code.

### Bài tập code

**Bài 1**: Compile với `-O2 -falign-loops=32`, inspect:
```bash
gcc -O2 -falign-loops=32 -c hot.c
objdump -d hot.o | head -30
```
Sẽ thấy `nopl 0x0(%rax,%rax,1)` hoặc multi-byte nop chèn vào trước loop top. Address của loop entry là multiple of 32.

**Bài 2**: 
```c
__attribute__((cold))
int handle_error(int code) {
    fprintf(stderr, "error %d\n", code);
    return -1;
}

int process(int x) {
    if (x < 0) return handle_error(x);
    return x * 2;
}
```

`objdump -d` sẽ cho thấy `handle_error` ở section `.text.unlikely` hoặc tách xa. Without hint, compiler có thể inline error path → I-cache pollution mỗi lần `process` được gọi.


