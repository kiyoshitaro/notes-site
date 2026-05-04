---
title: "Memory-Level Parallelism"
pubDate: "2026-04-13"
published: true
description: "Memory-Level Parallelism"
useKatex: false
---

# Memory-Level Parallelism

Khi CPU đang chờ 1 read request hoàn tất, nó có thể gửi thêm vài yêu cầu khác, và các yêu cầu này sẽ được thực thi đồng thời. Đây chính là lý do tại sao linear iteration lại nhanh hơn nhiều so với pointer jumping: CPU biết trước những vị trí bộ nhớ cần truy xuất tiếp theo và có thể gửi yêu cầu từ rất sớm.

Số lượng thao tác bộ nhớ đồng thời có thể thực hiện là lớn nhưng có giới hạn, và giới hạn này khác nhau tùy loại bộ nhớ. Khi thiết kế thuật toán, đặc biệt là cấu trúc dữ liệu, cần biết con số này, vì nó quyết định mức độ song song mà tính toán có thể đạt được.

```C
// M là số phần tử cho mỗi vòng lặp song song, D là số  vòng lặp song song 
int p[M], q[D][M];            // p là mảng tạm, q là mảng 2 chiều cho D vòng lặp

// Khởi tạo D vòng lặp pointer chasing song song
for (int d = 0; d < D; d++) {
    iota(p, p + M, 0);              // tạo mảng p = [0,1,2,...,M-1]
    random_shuffle(p, p + M);       // xáo trộn ngẫu nhiên p để tạo chu trình ngẫu nhiên
    k[d] = p[M - 1];                // chọn điểm bắt đầu của vòng lặp d
    
    // xây dựng chu trình pointer chasing cho vòng lặp d
    for (int i = 0; i < M; i++)
        k[d] = q[d][k[d]] = p[i];   // gán q[d][...] để tạo liên kết nhảy con trỏ
}

// Chạy benchmark: mỗi bước i, tất cả D vòng lặp cùng nhảy một bước
for (int i = 0; i < M; i++)
    for (int d = 0; d < D; d++)
        k[d] = q[d][k[d]];          // CPU phải xử lý D truy cập bộ nhớ độc lập
```
- Ý tưởng: thay vì chỉ chạy một chu trình pointer chasing, ta chạy song song D chu trình để ép CPU gửi nhiều yêu cầu bộ nhớ cùng lúc.
- Cách đo: ta thay đổi giá trị D (số vòng lặp song song) và đo thời gian chạy.
- Kết quả quan sát:
  - Khi D nhỏ, thời gian giảm rõ rệt → CPU tận dụng được song song bộ nhớ.
  - Khi D tăng đến một ngưỡng, thời gian không giảm nữa → đạt giới hạn song song.

- Giới hạn thực nghiệm:
  - Cache L2: khoảng 6 yêu cầu đồng thời.
  - RAM lớn: khoảng 13–17 yêu cầu đồng thời.
- Nguyên nhân giới hạn: CPU có số lượng thanh ghi hữu hạn. Khi số vòng lặp vượt quá, phải dùng bộ nhớ tạm để lưu giá trị → hiệu năng không tăng thêm.

> ==> **CPU có các bộ dự đoán truy cập bộ nhớ (hardware prefetchers) để quan sát mẫu truy cập địa chỉ để xác định pattern và biết khi nào chủ động pipeline và prefetch, khi nào không để tránh ô nhiễm cache và làm mất băng thông** , như case trên ta phải chủ động tạo nhiều chu trình độc lập (D) để ép CPU gửi nhiều yêu cầu song song

### Software Prefetching

Hardware prefetching chỉ thông minh với các mẫu đơn giản: duyệt tiến/lùi, nhiều mảng song song, bước nhảy nhỏ đến trung bình. Với mẫu phức tạp hơn, nó không đoán được và ta phải hỗ trợ bằng phần mềm.

Cách đơn giản nhất là dùng một lệnh bộ nhớ bình thường, như `mov` (giả vờ cần một phần tử nhỏ, nhưng thực chất mục tiêu là đưa cả cache line vào bộ nhớ đệm). 

CPU hiện đại có lệnh riêng để nạp cache line mà không thực sự sử dụng dữ liệu đó, lệnh này chỉ “đặt trước chỗ” trong cache, không tạo thêm thao tác đọc/ghi dữ liệu vào thanh ghi `__builtin_prefetch(&a[k]);`. Ngôn ngữ C/C++ chuẩn không định nghĩa lệnh prefetch nhưng hầu hết các compiler (như GCC, Clang) đều cung cấp **intrinsic** (hàm mà compiler cung cấp để gọi trực tiếp machine instructions của CPU ngay trong code C/C++) đặc biệt để gọi lệnh này.

Ví dụ: 
```C
// Tìm số nguyên tố lớn nhất ≤ N
const int n = find_prime(N);
std::vector<int> q(n);

// Tạo hoán vị bằng công thức (2*i + 1) % n
// Đây là biến thể của LCG, đảm bảo chu kỳ đầy đủ khi n là số nguyên tố
for (int i = 0; i < n; i++) {
    q[i] = (2 * i + 1) % n;
}

int k = 0;
for (int t = 0; t < K; t++) {
    for (int i = 0; i < n; i++) {
        // Nạp trước phần tử tiếp theo (1 bước)
        __builtin_prefetch(&q[(2 * k + 1) % n]);

        // Nạp trước phần tử cách 3 bước (multi-step prefetch)
        __builtin_prefetch(&q[((1 << 3) * k + (1 << 3) - 1) % n]);

        // Truy cập phần tử hiện tại
        k = q[k];
    }
}
```

Đây là ví dụ nhân tạo, trong thực tế software prefetching thường khó hiệu quả vì phải thêm memory instruction -> cạnh tranh resources. Hardware prefetching thường đủ và an toàn hơn, vì chỉ kích hoạt khi bus rảnh.

Với software prefetching, có thể chọn mức cache muốn nạp (L1, L2, L3) bằng intrinsic _mm_prefetch. Điều này hữu ích khi không muốn đẩy dữ liệu quan trọng ra khỏi L1.
