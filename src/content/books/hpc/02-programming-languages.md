---
title: "Programming Languages"
pubDate: "2026-05-04"
published: true
description: "Programming Languages"
useKatex: false
---

# Programming Languages

* Ngôn ngữ lập trình chỉ là công cụ

    * Máy tính thực chất chỉ hiểu mã máy (machine code).

    * Ngôn ngữ lập trình là lớp giao diện giúp con người dễ viết chương trình hơn, nhưng cuối cùng vẫn phải dịch về mã máy để CPU thực thi.

* Ba loại ngôn ngữ theo cách thực thi

    * Interpreted (thông dịch): Python, JavaScript… chạy trực tiếp qua trình thông dịch.

    * Managed (có runtime/VM): Java, C#, Erlang… biên dịch thành bytecode rồi chạy trong máy ảo (JVM, CLR).

    * Compiled native (biên dịch trực tiếp): C, Go, Rust… biên dịch thẳng thành mã máy.

* So sánh hiệu năng qua ví dụ nhân ma trận 1024×1024

    Python (interpreted): mất ~630 giây (~10 phút). Quá chậm vì phải kiểm tra kiểu dữ liệu, gọi toán tử, tra bảng tên biến cho từng phép nhân và cộng. Mỗi bước đều có overhead lớn.

    Java (managed, JIT): mất ~10 giây. Nhanh hơn nhiều nhờ JVM biên dịch bytecode sang mã máy ngay khi chạy (Just-In-Time). Những đoạn code lặp nhiều lần sẽ được tối ưu hóa thành mã máy hiệu quả hơn.

    C (compiled native): mất ~9 giây do C được biên dịch trực tiếp thành mã máy, nhưng khi bật tối ưu hóa (-O3, -march=native, -ffast-math) chỉ còn ~0.6 giây do compiler tận dụng SIMD/vectorization: CPU có thể nhân nhiều phần tử cùng lúc thay vì từng cái một.

    OpenBLAS (thư viện tối ưu chuyên dụng): chỉ mất ~0.12 giây, nhanh gấp ~5250 lần so với Python ban đầu do thư viện này viết bằng assembly, tối ưu riêng cho từng kiến trúc CPU, khai thác tối đa cache, pipeline, vector register…
