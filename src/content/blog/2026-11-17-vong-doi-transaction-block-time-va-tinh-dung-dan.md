---
title: "Vòng đời một transaction: từ nonce, mempool, block time đến tính đúng đắn trong wCBDC"
pubDate: "2026-11-17"
published: true
contents_table: true
pinned: false
description: "Đi từ gốc luồng một transaction chạy trong chain để trả lời: block time thật ra là gì và bị chặn dưới bởi cái gì, nonce để làm gì và UTXO thay nó bằng gì, mempool lệch nhau có làm hỏng đồng thuận không, permissioned chain bỏ được và không bỏ được những rủi ro nào, và wCBDC phải chú ý gì khi tính đúng đắn là số một"
cat: "architecture"
useKatex: false
---

# Vòng đời một transaction: từ nonce, mempool, block time đến tính đúng đắn trong wCBDC

*Viết 2026-11-17. Có bản slide đi kèm: `2026-11-17-vong-doi-transaction-block-time-va-tinh-dung-dan-slides.html`.*

Bài này bắt đầu từ năm thắc mắc tưởng như rời nhau. Hạ block time xuống để confirm nhanh hơn thì chuyện gì xảy ra, khi block time có vẻ chỉ là thời gian gom batch? Nonce có phải để sắp thứ tự giao dịch không, sao lại sinh được ở local, và UTXO thì dùng gì thay? Mempool các node lệch nhau thì đồng thuận có hỏng không? Block time là một config hay là hệ quả của tổng các độ trễ? Và nếu coi blockchain là một database thì nó tệ hơn ở đâu, permissioned chain có thoát được không, wCBDC phải chú ý gì?

Năm câu này thật ra có chung một gốc. Nếu hiểu đúng một transaction đi qua những đâu và *vì sao* phải đi qua những chỗ đó, thì cả năm câu trả lời rơi ra như hệ quả. Vì vậy bài không trả lời từng câu một, mà dựng lại con đường đó từ đầu rồi dừng ở mỗi chỗ rẽ.

## 1. Điểm xuất phát: nhiều máy, một cuốn sổ

Hãy quên từ "blockchain" một lúc. Bài toán gốc là: có nhiều máy, thuộc nhiều tổ chức, và ta muốn chúng giữ **cùng một cuốn sổ** mà không máy nào được một mình quyết nội dung.

Cách ngây thơ là cho các máy liên tục so sổ với nhau. Cách này không dùng được, vì sổ lớn và thay đổi liên tục. Cách đúng dựa vào một quan sát đơn giản hơn nhiều: nếu việc cập nhật sổ là **tất định**, tức cùng một trạng thái và cùng một giao dịch thì máy nào cũng ra cùng một trạng thái mới, thì các máy không cần so sổ. Chúng chỉ cần bắt đầu từ cùng một trạng thái và áp **cùng một dãy giao dịch theo cùng một thứ tự**. Kết quả giống nhau là điều tự động.

```
S0 ──tx1──▶ S1 ──tx2──▶ S2 ──tx3──▶ S3 ...      (mọi máy chạy đúng dãy này)
```

Đây gọi là máy trạng thái nhân bản, và nó thu toàn bộ bài toán về đúng một việc: **thống nhất thứ tự**. Mọi khái niệm ta sắp gặp chỉ là các bộ phận của cỗ máy thống nhất thứ tự đó. Mempool là phòng chờ của những giao dịch chưa có thứ tự. Block là một *đề xuất* thứ tự cho một lô giao dịch. Đồng thuận là thủ tục để mọi máy chấp nhận cùng một đề xuất.

Vì sao lại gom thành lô mà không thống nhất từng giao dịch? Vì mỗi lần thống nhất tốn một chi phí cố định: vài vòng tin nhắn qua mạng, một loạt chữ ký, một lần ghi đĩa. Gom lô là để chia chi phí ấy cho nhiều giao dịch. Trực giác "block time là thời gian gom batch" sinh ra từ đây, và nó đúng, nhưng mới đúng một nửa. Nửa còn lại phải đi hết con đường của một transaction mới thấy.

## 2. Theo chân một transaction

Con đường có bốn chặng. Ở mỗi chặng, điều đáng nhớ không phải là danh sách bước, mà là *ai đang nắm quyền* và *điều gì chưa được bảo đảm*.

```
 CLIENT            NODE NHẬN             MẠNG P2P           PROPOSER              CÁC VALIDATOR
 ký tx ──────▶ kiểm tra, cho vào ──▶ lan dần ra ──▶ đến lượt: chọn tx,
               mempool, trả hash                    thực thi, đóng block ──▶ thực thi lại, so kết quả,
                                                                             bỏ phiếu
 thấy receipt ◀──────────────── mọi node ghi block ◀──────────────────────────┘
```

**Chặng một diễn ra hoàn toàn ở phía người gửi.** Client dựng giao dịch gồm người nhận, giá trị, dữ liệu, giới hạn gas, một con số gọi là nonce, rồi ký lên tất cả. Hai chi tiết ở đây sẽ quay lại nhiều lần. Thứ nhất, giao dịch **không mang timestamp**; thời gian chỉ tồn tại ở header của block, do người đóng block ghi. Một giao dịch chỉ có "thời điểm" khi nó đã nằm trong block. Thứ hai, nonce nằm **trong phần được ký**, nên không node nào có thể gán hay sửa nó thay người gửi.

**Chặng hai là phòng chờ.** Node nhận giao dịch kiểm tra những thứ kiểm được ngay: chữ ký, nonce không cũ, đủ tiền trả gas. Qua được thì nó cho giao dịch vào mempool của mình và trả về một tx hash. Cần hiểu tx hash đúng nghĩa của nó: "node này đã nhận", không hơn. Từ đó node báo cho các peer, peer báo tiếp, và sau một lúc *phần lớn* node có giao dịch này. Không có gì bảo đảm *tất cả* đều có, hay có theo cùng thứ tự. Mempool lại có giới hạn dung lượng: đầy thì đuổi bớt, và node restart thì thường mất sạch. Ở chặng này một giao dịch có thể biến mất mà không ai báo lỗi cho ai.

**Chặng ba là lúc thứ tự được đề xuất.** Ở mỗi độ cao, có đúng một node được quyền đề xuất block. Cách chọn node đó là thứ phân biệt các họ đồng thuận. Với proof-of-work, đó là ai giải được bài băm trước. Với Ethereum proof-of-stake, đó là validator được chọn giả ngẫu nhiên cho mỗi slot 12 giây. Với họ BFT như QBFT, các validator xoay vòng, và người đến lượt chủ động chờ cho đủ một khoảng (`blockperiodseconds`) kể từ block trước rồi mới đề xuất. Người đề xuất lấy giao dịch **từ mempool của chính mình**, sắp theo luật của mình, chạy lần lượt từng giao dịch trên trạng thái sau block trước, rồi ghi kết quả vào header dưới dạng một cam kết gọi là state root. Giao dịch nào chạy lỗi vẫn nằm lại trong block, vẫn tốn nonce, chỉ là biên nhận của nó ghi thất bại. Sau đó block được phát đi, và nó **mang theo toàn bộ nội dung các giao dịch**, không chỉ hash.

**Chặng bốn biến đề xuất thành sự thật.** Mỗi validator nhận block, tự chạy lại toàn bộ trên trạng thái của mình và so state root. Không ai tin kết quả của người đề xuất; lệch một bit là từ chối. Nếu khớp, chúng bỏ phiếu. Với QBFT, block được chấp nhận khi ít nhất hai phần ba số validator (3 trên 4) ký cam kết. Nếu người đề xuất chết hoặc quá chậm, các validator hết kiên nhẫn sau một timeout, chuyển sang người kế tiếp và làm lại. Cuối cùng mọi node ghi block, và client, sau độ trễ polling của chính nó, thấy biên nhận.

Còn một câu hỏi treo ở cuối: block đã ghi rồi thì có đảo lại được không? Câu trả lời khác nhau theo họ đồng thuận, và sẽ là mấu chốt của nửa sau bài. Với proof-of-work, không bao giờ chắc tuyệt đối, chỉ là xác suất bị đảo giảm dần theo số block chồng lên. Với Ethereum, chắc sau khoảng mười ba phút. Với BFT, chắc **ngay lập tức**.

Giờ đã có đủ bản đồ. Bốn thắc mắc đầu tương ứng với bốn điểm trên bản đồ này.

## 3. Nonce: câu hỏi nằm ở chặng một

Trực giác "nonce để sắp thứ tự giao dịch" gần đúng, nhưng đảo ngược nhân quả.

Hãy nghĩ xem một giao dịch trong mô hình account là gì. Nó là một *mệnh lệnh*: "chuyển 10 từ A sang B". Mệnh lệnh ấy tự nó có thể thi hành bao nhiêu lần cũng được. Nếu không có gì ngăn, bất kỳ ai bắt được giao dịch đã ký đều có thể phát lại nó, và A bị trừ thêm 10 mỗi lần. Nonce sinh ra để chặn đúng chuyện này: mỗi account có một bộ đếm số giao dịch đã gửi, giao dịch mang nonce `n` chỉ hợp lệ khi bộ đếm đang đúng bằng `n`, và sau khi thi hành thì bộ đếm tăng lên. Mỗi chữ ký thành ra chỉ dùng được một lần.

Thứ tự là **hệ quả** của cơ chế chống phát lại đó: vì bộ đếm chỉ tăng từng đơn vị, giao dịch của A buộc phải vào chain theo thứ tự 0, 1, 2. Nhưng lưu ý phạm vi: đây chỉ là thứ tự *trong một account*. Nonce không nói gì về chuyện giao dịch của A đứng trước hay sau giao dịch của B. Thứ tự giữa các account do người đề xuất block quyết ở chặng ba, và đó chính là gốc của front-running.

Câu hỏi "sao sinh được ở local" giờ tự trả lời: không phải là *được*, mà là *buộc phải*. Nonce nằm trong phần được ký, nên chỉ người giữ khoá mới điền được. Thư viện thường hỏi node "account này đã gửi bao nhiêu giao dịch" rồi điền giúp, nhưng node chỉ trả lời theo góc nhìn của riêng nó.

Cái giá của thiết kế này là mọi giao dịch của một account xếp thành **một hàng dọc**. Nếu giao dịch số 5 đến mà số 4 chưa có, số 5 nằm chờ vô thời hạn. Nếu số 4 bị kẹt hoặc bị đuổi khỏi mempool, tất cả những gì sau nó kẹt theo. Nếu hai tiến trình dùng chung một khoá, chúng sẽ lấy trùng một số, và một bên thua. Và nếu gửi lại cùng một số, đó là *thay thế* giao dịch cũ chứ không phải thêm giao dịch mới.

**UTXO đi một đường khác hẳn.** Ở đó không có số dư account, chỉ có các "tờ tiền" riêng lẻ, mỗi tờ có định danh. Một giao dịch không nói "trừ 10 của A", mà nói "tiêu *đúng tờ này* và tạo ra các tờ mới". Khi đó chống phát lại là bẩm sinh: phát lại giao dịch thì tờ tiền đã tiêu rồi, giao dịch vô nghĩa. Không cần bộ đếm.

Thứ tự trong UTXO cũng đổi bản chất. Nó không còn là một dãy số mà là quan hệ phụ thuộc: giao dịch tiêu một tờ tiền phải đứng sau giao dịch tạo ra tờ đó. Hai giao dịch không đụng chung tờ nào thì **không có thứ tự gì với nhau** và xử lý song song được. Đổi lại, kiểu tranh chấp cũng khác: hai giao dịch cùng tiêu một tờ thì cái vào block trước thắng, cái kia chết hẳn chứ không nằm chờ.

| | Account + nonce | UTXO |
|---|---|---|
| Chống phát lại bằng | Bộ đếm theo account | Mỗi output chỉ tiêu một lần |
| Thứ tự | Một hàng dọc cho mỗi account | Đồ thị phụ thuộc, phần còn lại song song |
| Khi tranh chấp | Hở số, kẹt cả hàng | Chọn trùng output, một bên thua và phải dựng lại |

(Một lưu ý về tên gọi: "nonce" trong header block của Bitcoin là con số thợ đào thử để giải bài băm. Nó không liên quan gì tới nonce của account.)

Hệ wCBDC này thú vị ở chỗ có **cả hai tầng**. Token riêng tư trên Paladin theo mô hình UTXO, mỗi lần chuyển tiêu các note cũ và tạo note mới. Nhưng việc ghi lên Besu vẫn là một giao dịch EVM do một account ký, nên vẫn có nonce. Tranh chấp do đó có thể xảy ra ở cả hai nơi: hai lệnh chọn trùng một note, hoặc hàng nonce của account nộp giao dịch bị kẹt.

## 4. Mempool lệch nhau: câu hỏi nằm ở chặng hai

Mối lo ở đây hợp lý: đây là hệ phân tán, mỗi node thấy một tập giao dịch khác nhau, vậy làm sao chúng đồng ý được với nhau?

Câu trả lời nằm ở một chi tiết đã nói ở chặng ba: block được phát đi **mang theo đầy đủ nội dung giao dịch**. Validator không cần có sẵn giao dịch trong mempool của mình để kiểm tra block. Nó chỉ cần hai thứ: trạng thái sau block trước (thứ mà đồng thuận của các block trước đã bảo đảm là giống nhau), và hàm thực thi tất định. Mempool chỉ là kho nguyên liệu riêng của người đề xuất. Các node không đồng thuận về mempool; chúng đồng thuận về block. Không giao thức nào cố làm cho mempool giống nhau, vì không cần.

Nói vậy không có nghĩa mempool lệch nhau là vô hại. Nó có hậu quả, nhưng ở tầng khác: tầng trải nghiệm chứ không phải tầng an toàn. Giao dịch chưa lan tới người đề xuất của lượt này thì phải chờ lượt sau, nên độ trễ không đều. Ai đề xuất thì người đó quyết giao dịch nào đi trước, nên không tồn tại khái niệm "đến trước phục vụ trước" trên toàn mạng. Và một giao dịch có thể bị đuổi khỏi vài mempool mà người gửi không hề hay biết.

Vậy đồng thuận thật sự gặp khó vì đâu? Có ba nguồn, và không cái nào là mempool. Một là mạng chậm hoặc đứt, khiến hai node cùng đề xuất ở một độ cao hoặc không gom đủ phiếu kịp hạn. Hai là node gian lận, ví dụ người đề xuất gửi hai block khác nhau cho hai nhóm. Ba là thực thi không tất định: hai phiên bản phần mềm cho ra hai state root khác nhau từ cùng một block. Cái thứ ba đáng sợ nhất với chain permissioned, vì nó làm chain tách đôi hoặc đứng hẳn mà không cần kẻ tấn công nào.

## 5. Block time: config hay hệ quả?

Giờ quay lại câu hỏi mở đầu. Suy luận "block time không phải config, mà là tổng thời gian lan truyền tx, propose và đồng thuận" đi đúng hướng nhưng trộn ba thứ khác nhau vào một cái tên.

**Thứ nhất là nhịp do con người đặt.** Mọi giao thức đều có một con số như vậy. Bitcoin chỉnh độ khó để trung bình mười phút ra một block. Ethereum cố định slot 12 giây theo đồng hồ. QBFT có `blockperiodseconds`, là khoảng cách *tối thiểu* giữa hai block liên tiếp. Theo nghĩa này, block time rõ ràng là config.

**Thứ hai là ngân sách vật lý.** Trong một nhịp, có những việc bắt buộc phải xong: người đề xuất dựng block, block lan tới các validator, mỗi validator thực thi lại, các vòng bỏ phiếu đi và về, rồi ghi đĩa. Tổng này không do ai đặt; nó do mạng, đĩa và CPU quyết định. Đây mới là "tổng các thời gian" đúng. Và cần sửa một chỗ trong suy luận ban đầu: **lan truyền giao dịch không nằm trong tổng này**. Giao dịch lan liên tục, song song với việc sinh block. Nó quyết định giao dịch *kịp chuyến block nào*, chứ không quyết định khoảng cách giữa hai chuyến.

**Thứ ba là block time đo được trên thực tế**, và nó là hàm của hai thứ trên:

```
block time thực tế ≈ max(nhịp đặt ra, ngân sách vật lý) + thời gian mất cho các vòng hỏng
```

Công thức này hoà giải hai trực giác. Khi nhịp đặt ra lớn hơn nhiều so với ngân sách, chain chạy đúng nhịp, và phần dư chính là thời gian ngồi chờ gom giao dịch. Bitcoin, mười phút so với vài giây lan truyền, là trường hợp đó, và ở đó "block time là thời gian gom batch" hoàn toàn đúng. Khi kéo nhịp xuống gần ngân sách, phần dư biến mất và block time đổi vai: nó không còn là thời gian chờ nhàn rỗi mà trở thành **hạn chót** cho cả mạng. Ethereum cho thấy điều này rõ nhất: slot dài 12 giây nhưng block phải tới được các validator trong khoảng 4 giây đầu mới kịp được bỏ phiếu.

Vậy câu trả lời là: block time là một config, nhưng là config **có sàn**. Bạn được tự do chọn bất kỳ giá trị nào phía trên sàn. Phía dưới sàn, con số bạn đặt mất ý nghĩa.

Cũng nên tách block time khỏi thứ người dùng thật sự cảm nhận, là độ trễ từ lúc gửi tới lúc chắc chắn. Độ trễ đó gồm: thời gian lan tới người đề xuất, thời gian chờ chuyến block kế (trung bình nửa nhịp), ngân sách vật lý của block đó, thời gian chờ finality, và độ trễ client tự phát hiện. Với BFT, số hạng finality bằng không, nên block time chi phối gần hết. Với proof-of-work và Ethereum, finality là số hạng lớn nhất, và block time gần như không chạm tới nó.

## 6. Vậy hạ block time xuống thì chuyện gì xảy ra?

Từ công thức ở trên, câu trả lời chia hai trường hợp: nhịp mới rơi xuống dưới sàn, hay vẫn còn trên sàn.

**Khi rơi xuống dưới sàn**, hệ không nhanh hơn mà hỏng, và mỗi họ đồng thuận hỏng theo kiểu riêng của nó.

Với proof-of-work, block mới chưa kịp lan hết thì một thợ đào khác đã tìm ra block cùng độ cao. Chain rẽ nhánh thường xuyên, một nhánh bị bỏ, và công suất băm đổ vào nhánh chết là công suất lãng phí. Vì phần lãng phí ấy thuộc về phe trung thực, kẻ tấn công cần ít hơn 50% để thắng. Thợ đào lớn và kết nối tốt ít bị thiệt hơn, nên mạng dần tập trung hoá.

Với proof-of-stake theo slot, block tới sau hạn bỏ phiếu bị coi như không tồn tại. Slot bị lỡ, phiếu đến trễ, và xuất hiện các reorg ngắn. Validator yếu hoặc ở xa bị thiệt, lại là áp lực tập trung hoá.

Với BFT, các validator không gom đủ phiếu trước timeout, nên đổi người đề xuất và thử lại với timeout dài hơn. Kết quả ngược với ý định: block time thực tế **dài hơn và giật hơn** con số đặt ra. Nhưng có một điểm đáng giá: không có rẽ nhánh, không có gì bị đảo. BFT đánh đổi theo kiểu dễ chịu nhất trong ba họ: đặt nhịp sai chỉ làm chậm, không làm sai.

Điểm chung của cả ba: đồng thuận cần một lượng thời gian tỷ lệ với độ trễ của mạng, không tỷ lệ với mong muốn của người cấu hình.

**Khi vẫn còn trên sàn**, hệ chạy ổn nhưng vẫn phải trả vài khoản.

Khoản đầu tiên chỉ áp dụng cho proof-of-work nhưng rất hay bị hiểu nhầm: confirmation đến nhanh hơn không có nghĩa là an toàn sớm hơn. Độ an toàn đo bằng lượng công việc chồng lên giao dịch, không phải số block. Block nhanh gấp mười thì cần khoảng gấp mười số confirmation cho cùng mức an toàn. Con số trên màn hình nhảy nhanh hơn, thời gian chờ thật gần như không đổi.

Khoản thứ hai: thông lượng không tự tăng. Thông lượng bằng lượng gas mỗi block chia cho block time, nên block nhanh hơn với cùng giới hạn gas nghĩa là dồn tải nhiều hơn lên phần thực thi và đĩa. Nút cổ chai chỉ dời từ đồng thuận sang thực thi.

Khoản thứ ba: mỗi block có chi phí cố định, kể cả block rỗng. Một header, một bộ chữ ký, một lần ghi đĩa, một lượt tin nhắn. Đó là lý do Besu có tham số riêng cho nhịp của block rỗng. Và khoản cuối: nhịp càng ngắn thì dung sai cho sự cố càng mỏng. Một lần dừng để dọn bộ nhớ, một ổ đĩa chậm, là đủ để lỡ nhịp.

Vậy nếu mục tiêu thật là "chắc chắn nhanh hơn", đòn bẩy nằm ở đâu? Trước hết là **đổi loại finality** chứ không phải đổi nhịp: BFT cho chắc chắn sau một block, và đó là lý do chính các mạng thanh toán liên ngân hàng chọn nó. Kế đến là hạ chính cái sàn: đặt validator gần nhau, mạng ổn định, block vừa đủ nhỏ. Sau đó mới hạ nhịp xuống sát sàn, có chừa biên. Và cuối cùng, nhìn vào phần ngoài chain: trong hệ này, nhiều khả năng các bước của Paladin (dựng giao dịch, xin xác nhận, notary) chiếm phần lớn độ trễ hơn là nhịp 1 giây của Besu.

Có một bài học dự án đã trả giá, đáng nhắc ở đây. Cụm khai `emptyBlockPeriod: 30s`, nhưng đo thực tế ra khoảng 10 giây mỗi block rỗng. Mọi suy luận dựa trên block time phải dùng con số **đo được**, không phải con số chép từ config.

## 7. Nếu coi blockchain là một database

Đến đây có thể nhìn lại nhận xét: so với database truyền thống, chain dễ lỗi hơn, có eviction ẩn, có reorg, latency cao, nhiều trạng thái phức tạp. Tất cả đều đúng. Nhưng liệt kê thì không giúp nhớ; tìm gốc thì giúp.

Gốc thứ nhất là **commit bất đồng bộ**. Với Postgres, `COMMIT` trả về nghĩa là xong. Với chain, "gửi" và "được ghi" là hai sự kiện tách rời, và giữa chúng là một hàng đợi không bảo đảm gì, chính là chặng hai. Giao dịch rớt âm thầm, hàng nonce kẹt, một dãy trạng thái trung gian phải theo dõi: tất cả đều mọc từ khe hở này.

Gốc thứ hai là **không có giao dịch tương tác**. Trong database, bạn mở giao dịch, đọc, suy nghĩ, ghi, rồi commit, và hệ bảo đảm thứ bạn đọc không đổi dưới chân bạn. Trên chain thì không: bạn đọc trạng thái ở block N, ký, và giao dịch chạy ở block N+k trên một trạng thái có thể đã khác. Mọi phép "kiểm tra rồi mới ghi" do đó phải nằm trong contract. Kiểm tra ở ngoài rồi gửi vào là mời lỗi kiểm-lúc-này-dùng-lúc-khác.

Gốc thứ ba là **mọi node làm lại mọi việc**. Vì không ai tin ai, mỗi node thực thi lại mọi giao dịch, tuần tự. Thêm node làm chain bền hơn chứ không nhanh hơn. Latency cao và thông lượng thấp là giá của việc không tin nhau, không phải là lỗi cài đặt.

Ngoài ba gốc ấy còn vài thứ dễ bị bỏ sót. Một giao dịch có thể *vào block mà vẫn thất bại*: nó nằm trong chain, tốn nonce, nhưng không làm gì cả. Đồng hồ của chain thô và do người đề xuất ghi, không dùng được cho hạn chót chính xác. Dữ liệu chỉ thêm, không xoá, và mặc định ai chạy node cũng đọc được. Không có sửa tay hay rollback, nên một lỗi logic là vĩnh viễn và chỉ sửa được bằng giao dịch bù. Mất khoá là mất quyền, không có đường "quên mật khẩu". Và việc đọc cần một hệ indexer bên ngoài, tức thêm một hệ phân tán nữa phải giữ cho khớp.

Công bằng mà nói, có một chỗ chain *mạnh hơn* phần lớn database: mọi giao dịch chạy nối tiếp theo một thứ tự toàn cục, tức mức cô lập cao nhất có thể. Điểm yếu của chain nằm ở giao diện với client, không nằm ở mô hình nhất quán. Và nó cho một thứ database không cho được: nhiều tổ chức không tin nhau cùng giữ một sổ, không bên nào một mình sửa được. Nếu bài toán không cần đúng tính chất ấy, database luôn là lựa chọn tốt hơn.

## 8. Permissioned chain đổi được gì

Câu hỏi tự nhiên tiếp theo: trong những rắc rối trên, cái nào là do *blockchain*, cái nào chỉ do *public* blockchain?

Khác biệt gốc nằm ở giả định. Chain công khai không biết có bao nhiêu node và phải coi ai cũng có thể là kẻ địch, nên không thể đếm phiếu. Nó buộc phải dùng một dạng xổ số tốn kém (đốt điện hoặc khoá vốn) và chấp nhận sự chắc chắn chỉ mang tính xác suất. Chain permissioned **biết danh sách validator**. Biết danh sách thì đếm được phiếu, và đếm được phiếu thì dùng được BFT.

Từ đó, một nhóm rắc rối **biến mất hẳn**: không còn reorg, không còn finality xác suất, không còn chuyện chờ k confirmation, không còn thị trường phí. Đường đi của một giao dịch ngắn lại đáng kể, vì "vào block" và "chắc chắn" trở thành một.

Nhưng một nhóm khác **ở lại nguyên vẹn**, vì chúng là thuộc tính của mô hình mempool và account chứ không phải của proof-of-work. Commit vẫn bất đồng bộ và tx hash vẫn không phải lời hứa. Mempool vẫn có giới hạn và vẫn đuổi giao dịch âm thầm. Nonce vẫn kẹt. Giao dịch vẫn có thể vào block mà thất bại. Khe hở giữa lúc đọc và lúc thực thi vẫn còn. Thực thi vẫn tuần tự. Đây là điểm dễ chủ quan nhất: chuyển sang permissioned không làm ứng dụng đơn giản đi bao nhiêu.

Và có một nhóm **mới xuất hiện**. Quan trọng nhất: BFT chọn an toàn và bỏ sẵn sàng. Mất quá một phần ba validator (với bốn validator là mất hai) thì chain đứng hẳn. Với tiền tệ đó là hành vi đúng, thà dừng còn hơn ghi sai, nhưng nó biến một sự cố hạ tầng thành sự cố toàn hệ, và làm cho cách đặt validator qua các trung tâm dữ liệu trở thành quyết định về tính đúng đắn (xem [bài QBFT](./QBFT)). Kế đó là giả định tin cậy cứng: an toàn chỉ đúng khi dưới một phần ba validator gian lận hoặc bị chiếm khoá. Vượt ngưỡng ấy thì hậu quả không phải là chậm, mà là có thể chốt hai lịch sử khác nhau. Cuối cùng, mạng ít node thường chạy một phần mềm một phiên bản, nên một bug là bug của tất cả; và việc thêm bớt validator, nâng cấp phần mềm trở thành quy trình quản trị nhiều bên (xem [bài về định danh và vòng đời node](./2026-08-22-dinh-danh-node-permissioned-them-va-restart-node)).

| | Public (PoW/PoS) | Permissioned BFT (QBFT) |
|---|---|---|
| Chắc chắn khi nào | Xác suất, hoặc sau nhiều phút | Ngay khi commit |
| Khi mạng đứt | Vẫn chạy, rẽ nhánh, rồi reorg | Bên thiếu quorum dừng lại |
| Chống giả mạo số đông bằng | Kinh tế | Danh sách cho phép và pháp lý |
| Quy mô validator | Hàng nghìn | Vài chục |

## 9. wCBDC: khi đúng đắn là yêu cầu số một

Với tiền ngân hàng trung ương, "đúng" có nghĩa cụ thể: không tạo ra tiền ngoài phát hành, không tiêu một đồng hai lần, không làm mất tiền, và khoản nào đã quyết toán thì không bị đảo. Mọi điều đã bàn ở trên có thể đọc lại như một danh sách các đường dẫn tới vi phạm bốn điều đó. Đi từ dưới lên theo từng tầng sẽ thấy mỗi tầng phải giữ cái gì.

**Tầng đồng thuận giữ cho sự chắc chắn là thật.** Finality tức thời của BFT là thứ cho phép nói "khoản này đã quyết toán" theo nghĩa pháp lý. Nhưng nó chỉ thật chừng nào giả định dưới một phần ba gian lận còn đúng. Vì vậy khoá validator phải nằm trong HSM, validator phải trải trên các miền lỗi độc lập, và không trung tâm dữ liệu nào được một mình nắm đủ quorum. Đi kèm là một thay đổi về tư duy vận hành: chain dừng là một trạng thái *hợp lệ*. Quy trình nghiệp vụ phải có sẵn đường cho tình huống "sổ tạm không ghi được", thay vì tìm cách cho chain chạy tiếp khi thiếu quorum. Và phải giữ tính tất định: mọi validator cùng phiên bản, nâng cấp theo quy trình có diễn tập.

**Tầng contract là nơi duy nhất bất biến có thể được bảo đảm.** Lý do đã nêu ở §7: mọi kiểm tra nằm ngoài chain đều kiểm trên một trạng thái có thể đã cũ. Gateway có thể kiểm trước để báo lỗi sớm, nhưng đó là tiện ích, không phải bảo đảm. Bảo toàn tổng cung và "mỗi note chỉ tiêu một lần" phải là điều contract ép buộc, không phải điều đối soát phát hiện ra hôm sau. Vì lỗi contract là vĩnh viễn, kiểm thử bằng invariant và fuzz không phải là thừa, và quy trình sửa sai bằng giao dịch bù (ai được làm, cần mấy chữ ký) phải được thiết kế trước khi có sự cố. Mọi hạn chót trên chain cũng cần biên an toàn, vì đồng hồ của chain thô và do người đề xuất ghi.

**Tầng ứng dụng phải ngừng suy đoán.** Bằng chứng duy nhất cho việc một lệnh đã thực hiện là biên nhận thành công, trong block đã chốt, có đúng sự kiện mong đợi. Phản hồi RPC và tx hash đều không phải bằng chứng. Ứng dụng cũng phải phân biệt ba kết cục chứ không phải hai: thành công, thất bại có ghi nhận, và **không rõ**. "Không rõ" (timeout, chưa thấy biên nhận) không được coi là thất bại.

Từ kết cục "không rõ" dẫn tới yêu cầu tinh tế nhất: idempotent ở tầng nghiệp vụ. Nonce chỉ chặn việc phát lại *cùng một giao dịch đã ký*. Nếu gateway timeout rồi dựng một giao dịch **mới** cho cùng lệnh đó, nonce khác đi, và chain sẽ thực hiện lệnh lần thứ hai mà không thấy gì sai. Cách chặn là một khoá idempotent của lệnh nghiệp vụ mà chính contract kiểm tra. Mô hình UTXO giúp một phần ở đây: lệnh lặp mà tiêu cùng note thì tự vô hiệu.

Ba kỷ luật còn lại nối thẳng về các chặng của §2. Mỗi khoá ký chỉ có một tiến trình nộp giao dịch, vì hàng nonce không chịu được hai người viết. Gateway phải tự chặn tải ở cửa, vì mempool đuổi giao dịch mà không báo. Và cơ sở dữ liệu ngoài chain chỉ là bản chiếu: nó phải dựng lại được từ đầu chỉ bằng cách đọc chain.

**Tầng riêng tư thêm một chiều mà chain thông thường không có.** Trên Besu chỉ có dấu băm của các note; nội dung (ai giữ, bao nhiêu) nằm ngoài chain, ở node của các bên liên quan. Hệ quả là mất kho trạng thái riêng tư đồng nghĩa mất khả năng tiêu tiền, dù sổ cái vẫn nguyên. Sao lưu kho này quan trọng ngang sao lưu khoá. Việc hai lệnh chọn trùng một note là chuyện thường ngày chứ không phải sự cố, nên luồng phải có đường thử lại sạch. Và bên xác nhận quyết thứ tự ở tầng token, nên tính sẵn sàng của nó là một bài toán riêng, tách khỏi QBFT.

## 10. Nhìn lại năm thắc mắc

**Hạ block time có confirm nhanh hơn không?** Chỉ khi nhịp mới còn nằm trên ngân sách vật lý của một block. Dưới mức đó, proof-of-work rẽ nhánh, proof-of-stake lỡ slot, BFT đổi vòng liên tục và chậm đi. "Block time là thời gian gom batch" đúng khi nhịp còn xa sàn; gần sàn thì nó là hạn chót. Muốn chắc chắn nhanh hơn, đổi loại finality hiệu quả hơn đổi nhịp.

**Nonce để sắp thứ tự?** Nonce trước hết để chống phát lại; thứ tự là hệ quả, và chỉ trong một account. Nó sinh ở local vì nằm trong phần được ký. UTXO không có nonce vì mỗi output chỉ tiêu được một lần, và thứ tự ở đó là quan hệ phụ thuộc.

**Mempool lệch nhau có hỏng đồng thuận không?** Không, vì block mang đủ giao dịch và validator chỉ cần cùng trạng thái trước đó cùng hàm thực thi tất định. Lệch mempool chỉ gây trễ không đều, trao quyền thứ tự cho người đề xuất, và làm giao dịch có thể rớt âm thầm. Giao dịch cũng không mang timestamp.

**Block time là config hay hệ quả?** Là config có sàn vật lý. Giá trị thực tế xấp xỉ giá trị lớn hơn giữa nhịp đặt ra và ngân sách dựng block, lan block, thực thi lại, bỏ phiếu. Lan truyền giao dịch không nằm trong ngân sách ấy.

**Chain như database, permissioned, và wCBDC?** Gốc của hầu hết rắc rối là commit bất đồng bộ và không có giao dịch tương tác. Permissioned BFT xoá được reorg nhưng giữ nguyên phần còn lại và thêm việc dừng khi mất quorum. Với wCBDC: bất biến nằm trong contract, ứng dụng chỉ tin biên nhận đã chốt, lệnh idempotent ở tầng nghiệp vụ, và bảo vệ cả khoá lẫn trạng thái riêng tư.
