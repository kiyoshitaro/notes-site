---
title: "Branchless Programming"
pubDate: "2026-03-30"
published: true
description: "Branchless Programming"
useKatex: false
---

# Branchless Programming

* Cách loại bỏ branch bằng Predication: s += (a[i] < 50) * a[i];
* Trong assembly, không có kiểu Boolean, nhưng có thể dùng thủ thuật: (a[i] - 50) >> 31 để lấy bit dấu (sign bit)
* Predication loại bỏ control hazard (nguy cơ do nhánh), nhưng tạo ra data hazard (phải tính cả hai nhánh).

* Larger Examples check [code](./c/branchless.c):
    * Chuỗi rỗng (Empty string) 
        * Vấn đề: Thông thường ta phải kiểm tra if (str == nullptr) để xử lý chuỗi rỗng → tạo ra branch.
        * Giải pháp branchless: Quy ước mọi chuỗi rỗng đều trỏ đến một vùng nhớ đặc biệt gọi là zero C-string (một mảng chỉ chứa ký tự '\0').
            ```cpp
            // Khai báo zero string
            const char zero_string[1] = { '\0' };

            int length(const char* str) {
                // Nếu str là nullptr, gán về zero_string thay vì 
                // if (str == nullptr) {
                //    return 0; 
                // }
                str = (str ? str : zero_string);
                int len = 0;
                while (str[len] != '\0') {
                    len++;
                }
                return len;
            }
            ```
    * Binary Search không nhánh:
        * Vấn đề: Thuật toán tìm kiếm nhị phân (std::lower_bound) thường có nhiều if để so sánh → nhiều branch.
        * Giải pháp branchless: Viết lại thuật toán sao cho không có if, chỉ dùng toán tử và phép gán có điều kiện. Trên mảng nhỏ, cách này nhanh gấp 4 lần so với std::lower_bound
            ```cpp
            int branchless_binary_search(const int* arr, int n, int x) {
                int low = 0, high = n;
                while (low < high) {
                    int mid = (low + high) / 2;
                    // Không dùng if, thay bằng toán tử ?: 
                    low  = (arr[mid] < x) ? mid + 1 : low;
                    high = (arr[mid] < x) ? high    : mid;
                }
                return low;
            }
            ```
    * Data-parallel / SIMD:
        * Vấn đề: SIMD (Single Instruction, Multiple Data) không hỗ trợ branch. Nếu code có if, compiler khó vectorize.
        * Giải pháp: Viết branchless để compiler dễ dàng biến thành SIMD.
            ```cpp
            int sum_less_than_50(const int* arr, int n) {
                /* volatile */ int s = 0;
                for (int i = 0; i < n; i++) {
                    // Branchless: nhân với (arr[i] < 50)
                    s += (arr[i] < 50) * arr[i];
                }
                return s;
            }
            ```
        * Nếu bỏ volatile, compiler sẽ tự động vectorize vòng lặp này.
        * Kết quả: tốc độ tăng mạnh, chỉ mất ~0.3 chu kỳ cho mỗi phần tử.
