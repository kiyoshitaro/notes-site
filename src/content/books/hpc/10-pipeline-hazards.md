---
title: "Pipeline Hazards"
pubDate: "2026-05-04"
published: true
description: "Pipeline Hazards"
useKatex: false
---

# Pipeline Hazards

* Hazard: Tình huống khiến lệnh tiếp theo không thể chạy ngay ở chu kỳ clock kế tiếp → gây ra pipeline stall (CPU phải dừng toàn bộ pipeline cho đến khi vấn đề được giải quyết)

* Các loại Hazard
    * Structural Hazard: nhiều lệnh cùng cần một phần cứng (VD: cùng muốn dùng ALU) => thiết kế phần cứng tốt hơn (nhiều đơn vị xử lý song song)
    * Data Hazard: lệnh sau cần dữ liệu từ lệnh trước, nhưng dữ liệu đó chưa tính xong => sắp xếp lại thứ tự tính toán để đường đi dữ liệu ngắn hơn
    * Control Hazard: khi CPU không biết lệnh nào sẽ chạy tiếp theo, thường do lệnh rẽ nhánh (if/else) => phải xóa (flush) toàn bộ pipeline và bắt đầu lại => giảm số lượng nhánh (ít if/else hơn) hoặc dự đoán nhánh (branch prediction) để CPU đoán trước hướng đi.
