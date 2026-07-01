---
title: "Nền tảng đồng thuận QBFT"
pubDate: "2026-06-24"
published: true
description: "Consensus"
useKatex: false
---

# Nền tảng đồng thuận QBFT

## 1. Bài toán wCBDC

Trong bài toán thiết kế wCBDC ledger, ta muốn nhiều máy chủ **cùng giữ một sổ cái** wCBDC, đặt rải ở các trung tâm dữ liệu, vì hai lý do rất thực tế:

1. **Không ai một mình sửa được số dư** — phải có nhiều máy cùng đồng ý thì một thay đổi mới có hiệu lực (chống cả nhà thầu lẫn lỗi đơn lẻ).
2. **Một máy hỏng thì hệ vẫn chạy** — không để cả hệ thống thanh toán quốc gia chết vì một server rớt.

Từ hai mong muốn đó **một câu hỏi quyết định mọi thứ:**

> **Cần bao nhiêu máy "đồng ý" thì một giao dịch mới được coi là XONG (chung cuộc)?**

Con số đó gọi là **quorum**:

- Đặt quorum **quá thấp** → khi mạng trục trặc, hai nhóm máy có thể chốt hai phiên bản sổ cái mâu thuẫn → **hai ngân hàng cùng tiêu một đồng wCBDC**.
- Đặt quorum **quá cao** → chỉ cần rớt vài máy là **không bao giờ gom đủ phiếu** → cả hệ thống **treo cứng**, không giao dịch nào settle được.

Cả tài liệu nói về "N=5, quorum=4, chịu lỗi f=1, fail-stop 2 DC" thực ra chỉ là **lời giải cho đúng câu hỏi này**. Phần dưới sẽ **đi từ câu hỏi tới con số**, không nhảy thẳng vào công thức.

**Vì sao không để 1 máy quyết cho gọn?** Vì lúc đó ai chạy máy đó **một mình nắm chân lý** — đúng cái ta muốn tránh, và máy đó chết là chết cả hệ (SPOF). Nên buộc phải có **nhiều máy cùng bỏ phiếu**. Câu hỏi chỉ còn là: **bao nhiêu phiếu là đủ?** Muốn trả lời, trước hết phải biết **các máy có thể "hỏng" theo những kiểu nào.**

---

## 2. Hai kiểu "failure"

Trong thực tế vận hành, một validator có thể trục trặc theo **hai kiểu hoàn toàn khác nhau**:

| Kiểu lỗi | Xảy ra khi nào (thực tế) | Hành vi | Vì sao khó |
|---|---|---|---|
| **Crash (chết/im lặng)** | Mất điện, đứt mạng, hỏng đĩa, reboot | Node **ngừng trả lời** — vẫn trung thực, chỉ là vắng mặt | Dễ xử: chỉ cần **đủ máy còn sống** là quyết được |
| **Byzantine (nói dối)** | Bị hack, lỗi phần mềm, kẻ nội gián | Node **gửi phiếu mâu thuẫn cho các bên khác nhau** — ký YES cho *cả hai* block đối nghịch để cố chẻ đôi mạng | Khó: kẻ dối **"bỏ phiếu hai lần"**, cố tình đánh lừa |

Đặt `f` = **số máy xấu tối đa** ta muốn chịu được. Điểm mấu chốt: nếu chỉ lo máy **chết**, bài toán dễ; nhưng một hệ tiền tệ quốc gia phải lo cả máy **nói dối** (validator bị chiếm vẫn còn ký được) — và chính kẻ nói dối, vì bỏ phiếu được hai phía, mới đẩy con số quorum lên cao. Giữ ý này, ta sang phần "ta tuyệt đối cần gì".

---

## 3. Hai tiêu chí phải giữ

- **Safety (an toàn):** không bao giờ hai block mâu thuẫn cùng đạt quorum. *(Không chi đôi, không đảo ngược giao dịch đã final.)*
- **Liveness (sống):** vẫn gom đủ quorum để chốt **dù `f` máy đã chết**. *(Hệ không treo vĩnh viễn; giao dịch hợp lệ rồi cũng xong.)*

---

## 4. Công thức QBFT 
Gọi `N` = tổng validator, `q` = quorum (số chữ ký tối thiểu để chốt).

**(A) Safety** — hai quorum bất kỳ phải **giao nhau**, và vùng giao phải còn **ít nhất 1 node trung thực**:
- Hai block, mỗi block `q` chữ ký → tổng `2q` chữ ký trên `N` node → vùng giao **≥ `2q − N`** node ký cả hai.
- Trong vùng giao, kẻ dối nhiều nhất `f` → muốn còn ≥1 node trung thực: `2q − N ≥ f + 1` → **`q ≥ (N + f + 1) / 2`**.
- Node trung thực **không bao giờ ký hai block mâu thuẫn** → nếu vùng giao luôn có node trung thực thì **không thể có hai block cùng đạt quorum**. ✅

**(B) Liveness** — phải gom đủ `q` từ số node còn sống khi `f` node chết: **`q ≤ N − f`**.

**Ghép (A) và (B):** `(N+f+1)/2 ≤ q ≤ N − f`. Khoảng này **chỉ tồn tại** khi `N ≥ 3f + 1`. Đây chính là **gốc của 3f+1**: cái `+f` thừa ra **để vùng giao vẫn còn node trung thực dù có f kẻ nói dối**. Tại `N = 3f+1`, hai cận trùng nhau → **`q = 2f + 1 = ⌈2N/3⌉`**.

**Công thức QBFT:** `f = ⌊(N−1)/3⌋`, **`quorum = ⌈2N/3⌉`**, chịu thêm **`N − quorum` node crash**.

## 5. Hệ thống đề xuất ban đầu: N=5, với 3 + 2 trên 2 DC
- `f = ⌊4/3⌋ = 1`; `quorum = ⌈10/3⌉ = 4`; crash chịu được `= 5 − 4 = 1`.
- **Kiểm Safety bằng pigeonhole:** hai block, mỗi block 4/5 chữ ký → `4 + 4 = 8` chữ ký trên `5` node → **≥ 3 node ký cả hai** → trừ tối đa 1 kẻ dối còn **≥ 2 node trung thực ký cả hai** → vô lý (node trung thực không ký hai block mâu thuẫn). Vậy **không thể có hai block cùng đạt 4** → an toàn.
- **Vì sao quorum 3 hỏng:** hai block mỗi cái 3 chữ ký → giao **≥ `6−5 = 1`** node → node đó **có thể đúng là kẻ dối** → không bảo đảm node trung thực ở vùng giao → **hai block mâu thuẫn lọt được** → mất an toàn. ⇒ **phải là 4, không phải 3.**
- **Vì sao không lấy N=3:** `N=3 → f=0` (không chịu được kẻ dối nào). `N=4` là tối thiểu cho `f=1`; **N=5** thêm **1 mức dư crash** + số lẻ tránh hoà phiếu.

**Bảng chịu lỗi (N=5, quorum=4):**

| Node còn sống | So với quorum 4 | Kết quả |
|---|---|---|
| 5 | ≥ 4 | Commit (chịu được cả 1 Byzantine) |
| 4 | = 4 | Commit (vừa đủ) |
| 3 | < 4 | **DỪNG (fail-stop)** |
| ≤ 2 | < 4 | **DỪNG** |

5 validator không ở cùng chỗ: **3 ở DC-Chính, 2 ở DC-DR**, quorum vẫn **4** thì dù DC hay DC-DR mất hoặc network partition giữa các DC cũng không đảm bảo >= 4 => dừng (fail-stop)

- **(LL 1)** Nếu chia **4+1** => có liveness "khỏe" hơn (sống khi mất site nhỏ, thậm chí site 4-node chạy tiếp qua partition). Tuy nhiên việc **một site tự đủ quorum → phá Safety + phá phi-tập-trung.** Site 4-node **nắm đúng quorum 4** → **tự chốt block một mình**, không cần site kia => chỉ cần **chiếm/hỏng MỘT DC đó** là kẻ tấn công có **4 validator = quorum** → ký được **hai block mâu thuẫn cùng đạt 4** → **Safety vỡ**. Tức **thỏa hiệp một site = kiểm soát toàn bộ sổ cái.**

  - Ngược lại **3+2**: site lớn nhất chỉ nắm **3 < quorum 4** → **không site nào tự chốt được** → finality **buộc phải có cả hai site hợp tác**. Muốn phá Safety phải **chiếm cả HAI DC** — ngưỡng khó cao hơn hẳn → **3+2 = chọn ưu tiên Safety** (không ai chốt một mình, nâng ngưỡng tấn công lên "cả hai DC"), **chấp nhận fail-stop**. **4+1 = đổi chút liveness lấy nguy cơ một DC vừa tự quyết vừa chỉ cần chiếm một mình là phá Safety** — điều **tệ nhất** cho một hệ tiền tệ. Vì thế chọn 3+2.

- **(LL 2)** Nếu hạ quorum xuống 2–3 để DC còn sống tự chạy sẽ **phá Safety**: khi 2 DC bị chia cắt, **mỗi bên tự chốt một chuỗi riêng** → **split-brain**, hai phiên bản số dư mâu thuẫn — thảm họa với tiền tệ. Nên **tuyệt đối không hạ quorum**; chỉ còn **failover thủ công** (cold-standby: dựng lại đúng *danh tính* validator đã mất ở DC còn sống để leo về đủ 4).

- **(LL 3)** Nếu muốn high available **mất một site mà vẫn chạy**, các site còn lại phải vẫn gom đủ quorum. Nhưng trên **2 site**, luôn có **một site nắm ≥ nửa** số validator. Quorum thì **> nửa** (`⌈2N/3⌉`). Nên mất đúng site đó là **chắc chắn tụt dưới quorum**. Đây **không** phải lỗi cấu hình (chia 3+2, 4+1 đều vậy) mà là **mâu thuẫn số học** khi chỉ có 2 vùng lỗi => **bắt buộc ≥3 vùng lỗi độc lập**

  - **Quy tắc tổng quát để sống sót khi mất 1 site:** *mỗi site phải nắm ≤ `N − quorum` validator.*
    - N=5, quorum=4 → mỗi site ≤ **1** → cần tới **5 site độc lập**.
    - Thực tế hơn: muốn "liên tục thật" phải **vừa tăng N vừa trải trên ≥3 vùng lỗi độc lập** (vd N=7, quorum=5, không site nào > 2 → 4 site `2+2+2+1` sống được khi mất một site `2`).

Kết luận : Cần ≥3 vùng lỗi **độc lập thật sự** — có thể **đặt validator ở các định chế/site khác nhau (NHTM, KBNN…)** hoặc xây thêm DC cho riêng NHNN.
