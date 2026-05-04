---
title: "AoS and SoA"
pubDate: "2026-04-20"
published: true
description: "AoS and SoA"
useKatex: false
---

# AoS and SoA

- Array of Structures (AoS): Mỗi phần tử là một “struct” chứa nhiều trường => struct được đặt liên tiếp nhau trong bộ nhớ
- Structure of Arrays (SoA): Mỗi trường được tách thành một mảng riêng => Khi cần xử lý một trường trên toàn bộ dữ liệu, SoA rất tiện. Nhưng nếu cần nhiều trường cùng lúc, phải nạp nhiều cache line hơn → chậm hơn.

```C
const int M = N / D; // số lần truy cập bộ nhớ
int p[M], q[M][D];
// int p[M], int q[D][M];   
// Với AoS: q[M][D] → dữ liệu của một phần tử nằm liên tiếp.
// Với SoA: q[D][M] → dữ liệu của một trường nằm liên tiếp, nhưng các trường của cùng một phần tử bị tách ra.
iota(p, p + M, 0);          // p = [0, 1, 2, ..., M-1]
random_shuffle(p, p + M);   // trộn ngẫu nhiên p
int k = p[M - 1];           // bắt đầu từ một vị trí ngẫu nhiên

for (int i = 0; i < M; i++) {
    q[k][0] = p[i];         // gán giá trị vào q[k][0]
    for (int j = 1; j < D; j++)
        q[i][0] ^= (q[j][i] = rand()); // tạo dữ liệu ngẫu nhiên, đồng thời xor vào q[i][0]
    k = q[k][0];             // cập nhật k theo giá trị vừa gán
}
for (int i = 0; i < M; i++) {
    int x = 0;
    for (int j = 0; j < D; j++)
        x ^= q[k][j];        // tính xor của D trường
    k = x;                   // cập nhật k
}
```
==> vì các D trường của một phần tử nằm liên tiếp, CPU chỉ cần nạp ít cache line hơn => Khi D lớn AoS có thể nhanh hơn nhiều lần.

- Temporary Storage Contention: nếu kích thước 𝑁/𝐷 là một lũy thừa lớn của 2, nhiều địa chỉ tạm thời sẽ ánh xạ vào cùng một cache line => cache phải liên tục nạp lại từ bộ nhớ ngoài → hiệu năng giảm mạnh

- Huge Pages: Thông thường giúp giảm overhead quản lý bộ nhớ, giảm độ trễ tổng 10–15%. Nhưng trong thí nghiệm, với 𝐷 = 64, hiệu năng lại tệ hơn gấp 10 lần. Nguyên nhân do: L3 cache dùng địa chỉ vật lý để đồng bộ giữa các core.
    - Với trang 4KB, địa chỉ ảo phân tán ngẫu nhiên → giảm tranh chấp cache.
    - Với huge pages, địa chỉ thẳng hàng hơn → nhiều dữ liệu cùng rơi vào một vùng cache → tranh chấp nặng.
👉 Đây là ví dụ hiếm hoi cho thấy huge pages có thể làm hiệu năng giảm thảm hại.
- Padded AoS: thêm padding để mỗi phần tử chiếm nguyên một cache line (để lấy D trường, ta phải nạp đúng D cache line riêng biệt). Kỳ vọng hiệu năng sẽ chậm đi giống SoA. Tuy nhiên vẫn nhanh hơn 3 lần do cơ chế RAM vật lý.
    - RAM lưu dữ liệu trong ma trận tụ điện, chia thành hàng (row).
    - Nếu 2 truy cập liên tiếp nằm cùng một hàng, ta có thể dùng row buffer mà không cần đọc/ghi lại toàn bộ => Dù padded AoS đặt mỗi phần tử ở cache line khác nhau, chúng vẫn thường nằm cùng một hàng RAM → tận dụng row buffer → tốc độ tăng.
    👉 Điều này cho thấy: hiệu năng không chỉ phụ thuộc cache, mà còn **liên quan đến cách RAM hoạt động ở mức phần cứng**.
![RAM Load](./assets/ram-load.png)
