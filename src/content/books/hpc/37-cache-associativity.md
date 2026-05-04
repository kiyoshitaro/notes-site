---
title: "Cache Associativity"
pubDate: "2026-05-04"
published: true
description: "Cache Associativity"
useKatex: false
---

# Cache Associativity

```C
// for (int i = 0; i < N; i += 256)
for (int i = 0; i < N; i += 257)
    a[i]++;
```
vòng lặp thứ hai nhanh hơn — gấp khoảng 10 lần, mọi bước nhảy là bội số của lũy thừa lớn của 2. Nguyên nhân ở cache associativity — cách CPU tổ chức bộ nhớ đệm.

### Hardware Caches
- Ở software thì policy focused on LRU (đơn giản và hiệu quả nhưng vẫn đòi hỏi một số thao tác dữ liệu không tầm thường). Ở hardware, policy này gọi là **Fully Associative Cache** va rất khó và tốn kém trong phần cứng

- Direct-Mapped Cache: Mỗi khối dữ liệu trong RAM chỉ có thể nằm ở một vị trí duy nhất trong cache => Nếu hai địa chỉ khác nhau cùng ánh xạ vào một dòng cache, chúng sẽ liên tục thay thế nhau, giảm hiệu quả
![Direct-Mapped Cache](./assets/direct-mapped-cache.png)

- Set-Associative Cache: Ví dụ “2-way set-associative” mỗi nhóm có 2 cacheline. Khi dữ liệu mới vào nhóm, nó có thể chọn một trong 2 dòng. Nếu cả hai đều đầy, áp dụng LRU ==> Giảm bớt xung đột so với direct-mapped, nhưng vẫn dễ quản lý hơn fully associative. L3 cache của CPU có thể là 16-way set-associative
![Set-Associative Cache](./assets/set-associate-cache.png)

### Address Translation
Cache ánh xạ địa chỉ bộ nhớ thành ba phần: nếu dung h àm băm như phần mêm thì quá chậm, nên lazy hơn:
![Address Translation](./assets/address-translation.png)
- **Offset (6 bit thấp, bit 0–5):** Vị trí trong 1 cache line (64 byte = 2⁶).
- **Index (12 bit tiếp theo, bit 6–17):** Xác định **nhóm (set) nào** trong cache L3 sẽ chứa dữ liệu — tổng cộng có 2¹² = 4096 nhóm.
- **Tag (các bit còn lại):** Phân biệt nhiều địa chỉ khác nhau cùng rơi vào 1 nhóm.

> Hai địa chỉ khác nhau nhưng có cùng **phần Index** → cùng vào **1 nhóm cache** → tranh giành chỗ nhau (cache thrashing).

### Vấn đề khi bước nhảy là lũy thừa của 2

Bước nhảy thực tế tính bằng byte: \\(256 \times 4 = 1024 \text{ byte} = 2^{10}\\)

Cộng \\(2^{10}\\) vào địa chỉ tức là **chỉ thay đổi các bit từ bit 10 trở lên**, còn **10 bit thấp (bit 0–9) giữ nguyên**.

Nhìn vào phần Index (bit 6–17):
- **Bit 6–9** (4 bit thấp của Index): **KHÔNG thay đổi** vì bước nhảy \\(2^{10}\\) chỉ tác động từ bit 10 trở lên.
- **Bit 10–17** (8 bit cao của Index): **thay đổi** qua mỗi lần nhảy.

Vậy Index chỉ có **8 bit thực sự thay đổi**, 4 bit còn lại bị cố định. Số nhóm cache thực sự được dùng:

\\(2^{12 - (10 - 6)} = 2^{12 - 4} = 2^8 = 256\\) nhóm — thay vì toàn bộ \\(2^{12}\\) = 4096 nhóm 

👉 Với bước nhảy 256: toàn bộ dữ liệu nhét vào **1/16 cache → dung lượng hiệu dụng giảm 16 lần** → liên tục cache miss → đọc từ RAM → chậm hơn ~10 lần.

Với bước nhảy 257 (1028 byte, không phải lũy thừa 2): Index thay đổi tự nhiên qua đủ 4096 nhóm, dữ liệu phân tán đều, cache hoạt động đầy đủ → nhanh hơn nhiều.

### Ví dụ
- Khi thực hiện **binary search** trên mảng có kích thước \(2^{20}\):  
  → Thời gian trung bình ~ **360ns** mỗi truy vấn.  
- Nhưng khi thực hiện trên mảng có kích thước \(2^{20} + 123\):  
  → Thời gian trung bình chỉ ~ **300ns** mỗi truy vấn.  
- Với mảng có kích thước đúng bằng lũy thừa của 2, các chỉ số “nóng” (các phần tử được truy cập nhiều nhất trong những lần đầu) thường cũng là bội số của lũy thừa 2.  
- Điều này khiến nhiều địa chỉ ánh xạ vào **cùng một dòng cache**, dẫn đến việc chúng liên tục “đá” nhau ra ngoài.  
- Kết quả: hiệu năng giảm khoảng **20%** so với trường hợp kích thước mảng không phải lũy thừa của 2.

Lập trình viên thường thích dùng số mũ của 2 vì:
- Tính toán địa chỉ nhanh (dịch bit thay vì nhân chia).  
- Modulo với số mũ của 2 dễ dàng (AND bit).  
- Thuận tiện trong thuật toán chia để trị.  
- Phổ biến trong benchmark.  

Nhưng chính điều này lại tạo ra **mẫu truy cập bộ nhớ xấu**, khiến nhiều chỉ số ánh xạ vào cùng nhóm cache và liên tục “đá” nhau ra ngoài.

### Cách khắc phục
- Tránh bước nhảy hoặc kích thước mảng là lũy thừa lớn của 2.  
- Thay đổi một chút kích thước (ví dụ dùng 257 thay vì 256).  
- Chèn “lỗ” trong layout bộ nhớ hoặc hoán vị chỉ số để phân tán dữ liệu.  
