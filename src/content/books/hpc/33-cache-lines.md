---
title: "Cache Lines"
pubDate: "2026-05-04"
published: true
description: "Cache Lines"
useKatex: false
---

# Cache Lines

Đơn vị cơ bản để truyền tải dữ liệu trong hệ thống cache của CPU không phải là từng bit hay từng byte riêng lẻ, mà là cache lines, hầu hết các kiến trúc máy tính hiện nay, kích thước của một cache line là 64 byte. Điều này có nghĩa là toàn bộ bộ nhớ được chia thành các khối 64 byte

```C
for (int i = 0; i < N; i += D)
    a[i]++;
```
Phiên bản bước nhảy ($D=16$) hoàn thành nhanh hơn (D = 1) — nhưng chỉ nhanh hơn khoảng 2 lần chứ không phải 16 lần: nó chỉ chạy một lệnh inc cho mỗi 16 phần tử, trong khi vòng lặp gốc cần hai lệnh vector 8 phần tử để xử lý cùng lượng dữ liệu đó, cả 2 đều bị nghẽn ở khâu ghi kết quả
