---
title: "Spatial and Temporal Locality"
pubDate: "2026-05-04"
published: true
description: "Spatial and Temporal Locality"
useKatex: false
---

# Spatial and Temporal Locality

Để đánh giá chính xác hiệu suất của thuật toán về mặt thao tác bộ nhớ, cần xem xét  nhiều đặc tính của hệ thống cache: số lượng lớp cache, kích thước bộ nhớ và kích thước khối (block) của từng lớp, eviction dữ liệu, và đôi khi là cả chi tiết về cơ chế memory paging. Thay vì tính toán tỷ lệ trúng đích (cache hit) trên lý thuyết, chúng ta nên suy luận về hiệu suất cache theo hướng định tính.

Ta có thể nói về mức độ tái sử dụng cache qua hai khái niệm chính:

* Temporal locality: việc truy cập lặp đi lặp lại cùng một dữ liệu trong một khoảng thời gian tương đối ngắn. Khi đó, dữ liệu có khả năng vẫn nằm trong cache giữa các lần yêu cầu.

* Spatial locality: các phần tử nằm gần nhau trong bộ nhớ. Khi đó, chúng có khả năng sẽ được nạp vào cùng một memory block khi được đưa lên cache.

### DFS và BFS
Mặc dù iterative có lợi thế là chỉ thực hiện I/O tuần tự, recursive có một chút chi phí quản lý (overhead quản lý "Stack frame" (lưu biến cục bộ, địa chỉ trả về...)). Nhưng với thuật toán chia để trị như Merge Sort cách tiếp cận đệ quy có tính cục bộ thời gian tốt hơn nhiều: khi đệ quy chia nhỏ mảng đến một mức độ nào đó, toàn bộ mảng con sẽ nằm gọn trong Cache. Việc xử lý tiếp theo diễn ra hoàn toàn trên Cache nên cực nhanh. Ngược lại, iterative bắt đầu từ dưới lên phải quét đi quét lại toàn bộ dữ liệu ở RAM nhiều lần, dẫn đến chậm hơn.

Thực tế: Người ta thường dùng thuật toán lai (hybrid) — dùng đệ quy ở các tầng trên và chuyển sang dùng vòng lặp khi kích thước dữ liệu đã đủ nhỏ để giảm bớt chi phí đệ quy.

### Quy hoạch động
Bài toán Knapsack: Ơ đây iterative thắng recursive
* Đệ quy (Memoization): Khi dùng đệ quy kèm @lru_cache , Các trạng thái $f(n, w)$ không được lưu trữ liên tiếp nhau trong bộ nhớ một cách có thứ tự. Khi hàm đệ quy "nhảy" từ trạng thái này sang trạng thái kia, nó phải tìm kiếm trong một bảng băm (Hash Table) của Cache
    ```python
    @lru_cache
    def f(n, w):
        if n == 0:
            return 0    
        if c[n - 1] > w:
            return f(n - 1, w)
        return max(f(n - 1, w), c[n - 1] + f(n - 1, w - c[n - 1]))
    ```
* Iterative: Khi dùng mảng 2 chiều và lặp tuần tự, chúng ta tận dụng cực tốt Spatial Locality. Máy tính chỉ việc đọc dữ liệu theo một đường thẳng, tốc độ đạt tối đa và nếu kích thước một hàng (độ dài $W$) đủ nhỏ để nằm gọn trong Cache, CPU sẽ gần như không bao giờ phải sờ tới RAM nữa
    ```python
    int f[N + 1][W + 1] = {0};
    for (int n = 1; n <= N; n++)
        for (int w = 0; w <= W; w++)
            f[n][w] = c[n - 1] > w ?
                    f[n - 1][w] :
                    max(f[n - 1][k], c[n - 1] + f[n - 1][w - c[n - 1]]);
    ```
* Nếu ta chỉ cần kết quả cuối cùng , dùng mảng 1 chiều nhỏ hơn rất nhiều, khả năng nó nằm trọn trong L1 Cache
    ```python
    bool f[W + 1] = {0};
    f[0] = 1;
    for (int n = 0; n < N; n++)
        for (int x = W - c[n]; x >= 0; x--)
            f[x + c[n]] |= f[x];
    ```

* Sử dung Bitset: Thay vì CPU phải chạy một vòng lặp for (int w = W; w >= x; w--) để kiểm tra từng ô một, phép toán b |= b << x cho phép CPU xử lý 64 bit cùng một lúc (trên máy 64-bit), bool f[W] tốn 1 byte mỗi phần tử -> std::bitset chỉ 1 bit. Dữ liệu nhỏ hơn giúp nó dễ dàng nằm gọn trong L1 Cache
    ```python
    std::bitset<W + 1> b;
    b[0] = 1;
    for (int n = 0; n < N; n++)
        b |= b << c[n];
    ```
Trong Quy hoạch động, việc viết vòng lặp for theo thứ tự hợp lý để "chiều lòng" bộ nhớ đệm (Cache-friendly) quan trọng không kém việc tối ưu số lượng phép tính

....
