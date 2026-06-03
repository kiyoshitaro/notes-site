---
title: "Indirect Branching"
pubDate: "2026-03-28"
published: true
description: "Indirect Branching"
useKatex: false
---

# Indirect Branching

* Ngoài nhảy đến địa chỉ cố định, ta có thể nhảy đến địa chỉ nằm trong thanh ghi (ví dụ jmp rax). Đây gọi là computed jump (nhảy tính toán).
* Multiway Branch
    * Switch-case: giúp code gọn hơn nhưng bản chất vẫn là nhiều nhánh kiểm tra tuần tự
    * Tối ưu bằng bảng nhảy (branch table): Thay vì kiểm tra từng điều kiện, ta có thể tạo một mảng chứa địa chỉ nhảy, chỉ số của mảng chính là giá trị biến trạng thái.
    * 👉 bảng nhảy giúp loại bỏ chuỗi kiểm tra dài, tăng tốc độ xử lý. Multiway Branch đặc biệt hữu ích khi có nhiều trạng thái lặp lại (số nhánh nhiều (10–100 case)), như trong game, trình biên dịch, hoặc hệ thống điều khiển.
        ```c
        void weather_in_russia(int season) {
            static const void* table[] = {&&winter, &&spring, &&summer, &&fall};
            goto *table[season];
            winter:
                printf("Freezing\n");
                return;
            spring:
                printf("Dirty\n");
                return;
            summer:
                printf("Dry\n");
                return;
            fall:
                printf("Windy\n");
                return;
        }
        ```

    * **Bảng nhảy *chính là* indirect branching — nhìn ở asm sẽ rõ.** `switch` ngây thơ dịch ra chuỗi so sánh, mỗi `case` là một **direct branch** (đích cố định); còn bảng nhảy dùng `season` làm offset tra địa chỉ rồi `jmp` thẳng — đích chỉ biết lúc chạy → **indirect branch**:

        ```asm
        cmp edi,0 / je winter    ; if-else: O(n) so sánh, n direct jump
        cmp edi,1 / je spring
        ...
        jmp [table + rdi*8]      ; jump table: O(1), 1 indirect jump
        ```

        if-else hỏi lần lượt từng case (`n` so sánh); bảng nhảy tính thẳng địa chỉ, `jmp` một phát, `O(1)` bất kể bao nhiêu case. Giá phải trả: indirect jump khó cho branch predictor đoán đích hơn → chỉ thắng khi nhiều case (≈10+).

## Ví dụ: đừng để indirect branch lọt vào inner loop

Trong code tính toán nặng, indirect branch hay xuất hiện dưới dạng **con trỏ hàm hoặc hàm ảo gọi cho từng phần tử**. Ví dụ kinh điển: một hàm xử lý mảng nhưng phép toán cụ thể (`add`, `mul`, ...) được chọn lúc chạy, nên ta truyền vào một con trỏ hàm:

```c
double apply(double (*op)(double, double),     // op chọn lúc runtime
             double* a, double* b, double* out, int n) {
    for (int i = 0; i < n; i++)
        out[i] = op(a[i], b[i]);               // (*) gọi gián tiếp MỖI phần tử
}
```

Nhìn thì gọn, nhưng `(*)` là thảm họa hiệu năng. Mỗi vòng lặp là một lệnh `call` gián tiếp: CPU không biết chắc nhảy đi đâu cho tới khi nạp xong con trỏ, không thể **inline** thân hàm, và quan trọng nhất là **chặn đứng vectorization** — compiler không thể gộp 4–8 phần tử vào một lệnh SIMD khi giữa chúng có một lời gọi hàm mờ mịt. Một vòng lặp lẽ ra chạy bằng vài lệnh AVX nay thành hàng triệu indirect call.

Mấu chốt để ý: bên trong vòng lặp, `op` **không hề đổi** — nó cố định suốt cả lời gọi `apply`. Vậy mà ta trả giá indirect branch cho từng phần tử. Indirect branch nằm sai chỗ.

**Bài tập:** viết lại `apply` sao cho việc chọn phép toán (indirect branch) xảy ra **một lần duy nhất** trước vòng lặp, để inner loop trở thành code thẳng băng mà compiler vectorize được.

<details>
<summary>Solution — hoist dispatch ra ngoài</summary>

```c
enum Op { ADD, MUL };

void apply(enum Op op, double* a, double* b, double* out, int n) {
    switch (op) {                              // dispatch 1 LẦN, ngoài loop
        case ADD:
            for (int i = 0; i < n; i++) out[i] = a[i] + b[i];   // vectorize được
            break;
        case MUL:
            for (int i = 0; i < n; i++) out[i] = a[i] * b[i];   // vectorize được
            break;
    }
}
```

Mỗi nhánh giờ chứa một vòng lặp số học thuần, không lời gọi gián tiếp nào ở giữa → compiler tự bung ra lệnh SIMD. Indirect branch chỉ còn trả giá đúng 1 lần. Đây chính là khuôn mẫu mà các thư viện HPC (BLAS, NumPy, oneDNN) dùng để **chọn kernel SIMD tốt nhất theo CPU** (AVX-512 / AVX2 / scalar): kiểm tra năng lực CPU một lần, gắn con trỏ tới kernel phù hợp, rồi để kernel đó chạy vòng lặp dài mà không dispatch lại.

</details>

Nguyên tắc rút ra gói gọn trong một câu: **kéo indirect branch ra khỏi hot loop**. Nếu thứ quyết định nhánh không đổi trong suốt vòng lặp, hãy quyết định nó *trước* vòng lặp. Muốn thấy tận mắt, biên dịch cả hai với `gcc -O2 -march=native` rồi đo:

```bash
perf stat -e branch-misses,instructions ./apply
```

Bản hoisted không chỉ ít `branch-misses` hơn mà còn ít `instructions` hơn hẳn — vì mỗi lệnh SIMD nuốt nhiều phần tử cùng lúc, thứ mà bản con-trỏ-hàm vĩnh viễn không làm được.
