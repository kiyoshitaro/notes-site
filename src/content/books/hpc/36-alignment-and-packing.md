---
title: "Alignment and Packing"
pubDate: "2026-04-13"
published: true
description: "Alignment and Packing"
useKatex: false
---

# Alignment and Packing

Bộ nhớ máy tính được chia thành các cache line kích thước 64 byte. Điều này gây khó khăn khi thao tác với dữ liệu vượt qua ranh giới của một dòng bộ nhớ đệm như khi cần truy xuất một số nguyên 32 bit, thì nó phải nằm gọn trong một dòng cache duy nhất. Nếu dữ liệu nằm trên hai dòng cache, việc truy xuất sẽ tốn nhiều băng thông hơn và phần cứng phải ghép kết quả, tiêu tốn thêm tài nguyên => ảnh hưởng mạnh đến cách thiết kế thuật toán và cách trình biên dịch sắp xếp dữ liệu trong bộ nhớ.

### Aligned Allocation
VD: Compiler luôn đảm bảo địa chỉ của các phần tử luôn là bội số của kích thước phần tử để mỗi phần tử chỉ nằm trong 1 dòng cache. 
```C
alignas(32) float a[n];
void *a = std::aligned_alloc(32, 4 * n);
struct alignas(64) Data {
    // ...
};
```
Khi struct chứa nhiều kiểu dữ liệu khác nhau, compiler luôn thêm padding để đảm bảo các thành viên trong struct/mảng được căn chỉnh đúng, coder có thể **tự sắp xếp lại thứ tự** các thành viên nếu muốn giảm padding và tối ưu kích thước

Bạn có thể yêu cầu trình biên dịch bỏ padding bằng thuộc tính packed:
```c
struct __attribute__ ((packed)) Data {
    long long a;
    bool b;
};
```

có thể kết hợp packing với bit fields để xác định số bit cho từng thành viên => không quá phổ biến vì CPU không có số học 3 byte hoặc những thứ tương tự và phải thực hiện một số chuyển đổi byte-by-byte không hiệu quả trong quá trình tải:
```c
struct __attribute__ ((packed)) Data {
    char a;     // 1 byte
    int b : 24; // 3 byte
};
```
