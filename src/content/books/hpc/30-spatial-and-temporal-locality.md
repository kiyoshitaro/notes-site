---
title: "Spatial and Temporal Locality"
pubDate: "2026-04-10"
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

## Bài tập

### Câu hỏi tư duy

1. Phân biệt temporal vs spatial locality bằng ví dụ cụ thể (không phải code).
2. Linked list traversal có locality nào? Array traversal? Tại sao array luôn thắng cho sequential workload?
3. Hash table lookup: locality thế nào? Có cách nào improve?
4. Recursive Fibonacci không memoize có locality tốt không? Memoize bằng array vs bằng hashmap?
5. Tile/blocking technique áp dụng spatial hay temporal locality?

### Bài tập code

**Bài 1**: Cho linked list 1M nodes vs array 1M ints. Đo thời gian sum sequential. Giải thích diff.

**Bài 2**: Knapsack DP với W=10000, N=1000. Implement 3 version:
- (a) 2D array `f[N+1][W+1]`
- (b) 1D array `f[W+1]` rolling
- (c) `std::bitset<W+1>` với operator `|=`
Benchmark, giải thích.

**Bài 3**: Matrix multiply `C = A*B` với 3 cách inner loop order: `i,j,k` vs `i,k,j` vs `j,k,i`. Cái nào nhanh nhất? Why?

## Đáp án

### Câu hỏi tư duy

1. Temporal: bạn vừa đọc cuốn sách, để trên bàn — sẽ đọc lại trong vài phút tới. Spatial: bạn lấy bút từ ngăn kéo — bút khác trong cùng ngăn cũng dễ với tới. Trong code:
   - Temporal: biến `i` trong loop counter — dùng liên tục.
   - Spatial: `arr[i+1]` sau `arr[i]` — gần nhau.

2. Linked list: pointer chase, mỗi node có thể ở chỗ bất kỳ → poor spatial locality, mỗi node ≈ 1 cache miss. Array: 16 int / cache line → 1 miss / 16 access → 16x throughput. Cũng prefetcher hit pattern dễ.

3. Hash table: lookup = hash → random index → poor spatial locality. Improve:
   - Open addressing + linear probing: collision dùng cache line tiếp theo.
   - Robin Hood hashing: short probe length → tighter clusters.
   - Cache-conscious: bucket size = cache line → 1 miss/lookup.

4. Recursive Fib không memo: rất poor (exponential calls, stack thrash). Memo bằng array: tốt — sequential access. Memo bằng hashmap: kém hơn vì hash random + pointer chasing trong chain. Array O(n) memory nhưng cache-perfect; hashmap O(n) nhưng pointer chase.

5. Cả hai. Tile cho matrix multiply: chia thành block fit cache. **Temporal**: block A và B reuse nhiều lần trong block computation. **Spatial**: trong block, access sequential trong rows.

### Bài tập code

**Bài 1 — list vs array**:

```c
struct Node { int value; struct Node* next; };
struct Node* head = ...; // 1M random heap allocations

long sum_list(struct Node* head) {
    long s = 0;
    for (struct Node* n = head; n; n = n->next) s += n->value;
    return s;
}

long sum_array(const int* a, int n) {
    long s = 0;
    for (int i = 0; i < n; i++) s += a[i];
    return s;
}
```

Result: array ~10-20x faster. List nodes scattered → 1 miss / node. Array packs 16 int / cache line → prefetch hits. Even worse if list nodes allocated by malloc with fragmentation.

**Bài 2 — Knapsack**:

```c
// (a) 2D
int f2d[N+1][W+1] = {0};
for (int n = 1; n <= N; n++) {
    for (int w = 0; w <= W; w++) {
        f2d[n][w] = (c[n-1] > w) ? f2d[n-1][w]
                    : (f2d[n-1][w] > c[n-1] + f2d[n-1][w-c[n-1]] ? f2d[n-1][w] : c[n-1] + f2d[n-1][w-c[n-1]]);
    }
}

// (b) 1D rolling
int f1d[W+1] = {0};
for (int n = 0; n < N; n++) {
    for (int w = W; w >= c[n]; w--) {  // reverse to avoid overwriting
        if (f1d[w-c[n]] + c[n] > f1d[w]) f1d[w] = f1d[w-c[n]] + c[n];
    }
}

// (c) bitset (subset-sum variant only)
#include <bitset>
std::bitset<W+1> b;
b[0] = 1;
for (int n = 0; n < N; n++) b |= b << c[n];
```

Performance N=1000, W=10000:
- (a) 2D: ~50ms — 40MB working set, far exceeds L1/L2.
- (b) 1D: ~30ms — 40KB working set, fits L1.
- (c) bitset: ~3ms — 1.25KB, fits L1, plus 64-bit parallel ops.

(c) is 10x faster due to: bit packing × SIMD (compiler vectorizes shift+OR). Only works for subset-sum, not full knapsack with values.

**Bài 3 — matmul loop order**:

```c
// i,j,k — naive
for (int i = 0; i < n; i++)
    for (int j = 0; j < n; j++)
        for (int k = 0; k < n; k++)
            C[i][j] += A[i][k] * B[k][j];  // B stride = n, BAD

// i,k,j — better
for (int i = 0; i < n; i++)
    for (int k = 0; k < n; k++)
        for (int j = 0; j < n; j++)
            C[i][j] += A[i][k] * B[k][j];  // C and B sequential, GOOD

// j,k,i — terrible
for (int j = 0; j < n; j++)
    for (int k = 0; k < n; k++)
        for (int i = 0; i < n; i++)
            C[i][j] += A[i][k] * B[k][j];  // C, A both stride n
```

For n=1024:
- `i,j,k`: ~10s (B accessed column-wise → thrash)
- `i,k,j`: ~3s (all three sequential in inner loop)
- `j,k,i`: ~15s (worst — 2 of 3 stride n)

`i,k,j` wins because A[i][k] is constant during inner loop (broadcast), B[k][j] and C[i][j] sequential. Combined with blocking + AVX, matmul achieves >50% peak FLOPS.
