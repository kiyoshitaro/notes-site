---
title: "The Cost of Branching"
pubDate: "2026-03-30"
published: true
description: "The Cost of Branching"
useKatex: false
---

# The Cost of Branching

* Khi CPU gặp một lệnh rẽ nhánh (ví dụ if), nó không chờ kết quả điều kiện mà sẽ dự đoán nhánh nào có khả năng xảy ra và chạy thử trước (speculatively executing)

* Nếu ta sắp xếp mảng trước rồi mới chạy vòng lặp, CPU dự đoán chính xác hơn 

* Hinting Likelihood: dùng cú pháp [[likely]] để báo cho compiler nhánh nào thường xảy ra
