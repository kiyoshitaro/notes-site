---
title: "Virtual Memory"
pubDate: "2026-04-04"
published: true
description: "Virtual Memory"
useKatex: false
---

# Virtual Memory

OS ban đầu cho phép mọi process tự do đọc và sửa đổi bất kỳ vùng bộ nhớ nào mà chúng muốn, bao gồm allocated cho các process khác. Mặc dù điều này giữ cho mọi thứ đơn giản, nhưng nó cũng đặt ra một số vấn đề:
* process lỗi hoặc hoàn toàn độc hại ảnh hưởng đến other processes
* memory fragmentation: khi cấp phát và thu hồi liên tục
* how access non-RAM memory types

Những vấn đề này không quá quan trọng đối với một số hệ thống máy tính chuyên dụng như GPU - giải quyết 1 tác vụ tại 1 thời điểm => toàn quyền kiểm soát tính toán, nhưng chúng hoàn toàn cần thiết cho các OS đa nhiệm hiện đại => kỹ thuật virtual memory.

### Memory Paging

![virtual memory](./assets/virtual-memory.jpg)


Memory address space is divided into pages (thường là kích thước 4KB), là đơn vị bộ nhớ cơ bản mà các program có thể yêu cầu từ OS. memory system duy trì một cấu trúc dữ liệu phần cứng đặc biệt được gọi là page table (mappings of virtual page addresses to the physical)

Khi program muốn đọc/ghi dữ liệu ở địa chỉ ảo nào đó => CPU tính xem nó thuộc trang ảo số mấy (lấy địa chỉ ảo chia cho 4KB, hoặc dịch bit phải 12 bit) sau đó tra trong Page Table để biết trang ảo đó đang nằm ở đâu trong RAM thật

Chậm! Vì mỗi lần chương trình đọc/ghi bộ nhớ (nhiều lần mỗi giây) và đều phải tra Page Table (RAM 16GB ÷ 4KB = 4 triệu trang) 
* Dùng TLB (Translation Lookaside Buffer) 
* Tăng kích thước của Page (Huge Page): tra nhanh hơn nhưng lãng phí bộ nhớ, internal fragmentation

### Mapping External Memory
```C
// open a file containing 1024 random integers for reading and writing
int fd = open("input.bin", O_RDWR);
// map it into memory      size  allow reads and writes  write changes back to the file
int* data = (int*) mmap(0, 4096, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
// sort it like if it was a normal integer array
std::sort(data, data + 1024);
```
* Các OS hiện đại hỗ trợ ánh xạ bộ nhớ (mmap), cho phép mở một tệp và sử dụng nội dung của nó như thể chúng nằm trong main memory

* Một kỹ thuật có cùng nguyên lý hoạt động, nhưng ý định ngược lại là swap file: sử dụng các bộ phận của SSD/HDD làm phần mở rộng main mem khi không có đủ RAM => cho phép các hệ thống hết bộ nhớ chỉ chậm lại thay vì gặp sự cố.

### Cache-Aware Model

Trong mô hình RAM tiêu chuẩn, ta bỏ qua primitive operations mất thời gian không bằng nhau để hoàn thành, không phân biệt giữa các hoạt động trên các loại bộ nhớ khác nhau, đánh đồng việc đọc từ RAM mất ~50ns trong thời gian thực với việc đọc từ ổ cứng mất ~5ms

Còn trong mô hình bộ nhớ ngoài, ta chỉ đơn giản là bỏ qua mọi hoạt động không phải là hoạt động I/O. Cụ thể hơn, xem xét một cấp độ phân cấp bộ nhớ đệm và giả định như sau về phần cứng và vấn đề:
* size of dataset is N, and all stored in external memory, which we can read and write in blocks of B (đọc toàn bộ khối và chỉ một phần tử mất cùng một thời gian)
* Có thể lưu trữ M các phần tử trong internal mem, có thể lưu trữ tối đa M/B các khối.
* quan tâm đến I/O, bất kỳ tính toán nào giữa các lần đọc và ghi đều miễn phí.
* assume N≫M≫B

Bài toán tính toán tổng của một mảng: 
```C
FILE *input = fopen("input.bin", "rb");

const int M = 1024;
int buffer[M], sum = 0;
while (true) {
    // read up to M of 4-byte elements from the input stream
    int n = fread(buffer, 4, M, input);
    // if we can't read any more elements, finish
    if (n == 0)
        break;
    // sum elements in-memory
    for (int i = 0; i < n; i++)
        sum += buffer[i];
}
fclose(input);
printf("%d\n", sum);
```

Trong hầu hết trường hợp, OS sẽ tự động thực hiện buffer. Ngay cả khi dữ liệu chỉ được chuyển hướng đến đầu vào tiêu chuẩn từ một tệp bình thường, hệ điều hành sẽ đệm luồng của nó và đọc nó trong các khối ~4KB
