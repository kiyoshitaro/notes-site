---
title: "External Sorting"
pubDate: "2026-04-04"
published: true
description: "External Sorting"
useKatex: false
---

# External Sorting

Merge two sorted arrays: 
* Trong mô hình bộ nhớ ngoài, ta chỉ cần đọc tuần tự các phần tử của a, b (độ dài N, M) và ghi tuần tự vào c. Do đó chi phí I/O là SCAN(N+M).
* Nếu cần merge k mảng có tổng kích thước N, trong mô hình RAM ta phải thực hiện O(k) so sánh cho mỗi phần tử. Nhưng trong mô hình bộ nhớ ngoài, nếu ta có thể chứa (k+1) khối trong bộ nhớ thì chi phí không đổi. Điều kiện này gọi là tall cache assumption: M ≥ B^(1+ε) - required in many other external memory algorithms

### Merge sort
Thuật toán mergesort chuẩn có độ phức tạp O(N log N)

Trong external memory model, ta chia dữ liệu thành các khối kích thước M (đủ trong hết in-memory),sắp xếp từng khối, sau đó trộn.
* Các tầng đầu tiên (khoảng log M) miễn phí vì sắp xếp trong bộ nhớ.
* Chỉ còn log(N/M) tầng phải trả chi phí I/O.
* Mỗi tầng tốn O(N/B) thao tác I/O => Tổng cộng: O((N/B) log(N/M)).

Ví dụ: với N = 10GB dữ liệu, M = 1GB RAM, block B = 1MB → chi phí chỉ gấp khoảng 3 lần việc đọc dữ liệu.

### k-way Mergesort
Trong external memory model, chúng ta có thể merge các k mảng free như 2 mảng => height of the merge tree would be greatly reduced, trong khi mỗi layer still be done in O(N/B) IOPS

Chọn k = M/B để đủ in-memory =>  số lớp sẽ được giảm xuống /log(M/B), với giả định trên thì phần logarit nhỏ hơn một => chỉ còn là < O(N/B) ( tức là đọc/ghi toàn bộ dữ liệu một lần) => không có ý nghĩa vì không thể sắp xếp một mảng nhanh hơn việc đọc nó, vì vậy phân tích này áp dụng cho các trường hợp khi chúng ta có một tập dữ liệu rất lớn, bộ nhớ nhỏ và / hoặc kích thước khối lớn

### Practical Implementation
....
