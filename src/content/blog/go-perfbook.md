---
title: "go-perfbook: Viết và Tối ưu hóa Code"
pubDate: "2026-05-04"
published: true
contents_table: true
pinned: false
description: "Bản dịch tiếng Việt của go-perfbook (dgryski) — hướng dẫn toàn diện về viết và tối ưu hóa code Go: khi nào nên tối ưu, quy trình profiling, lựa chọn thuật toán, cấu trúc dữ liệu, và các kỹ thuật đặc thù của Go."
cat: "misc"
useKatex: false
---

<!-- nguồn: https://github.com/dgryski/go-perfbook/blob/master/performance.md — CC-BY-SA -->

Tài liệu này trình bày các phương pháp hay nhất để viết code Go có hiệu năng cao. Mặc dù sẽ có một số thảo luận về việc làm cho từng service riêng lẻ nhanh hơn (caching, v.v.), thiết kế hệ thống phân tán hiệu năng cao nằm ngoài phạm vi tài liệu này. Việc tối ưu hệ thống phân tán bao gồm một tập hợp hoàn toàn khác các nghiên cứu và đánh đổi thiết kế.

Cuốn sách này được chia thành ba phần:

1. Mẹo cơ bản để viết phần mềm không chậm — những kiến thức cấp độ CS 101
2. Mẹo để viết phần mềm nhanh — các phần đặc thù cho Go, cách khai thác tối đa sức mạnh của Go
3. Mẹo nâng cao để viết phần mềm thực sự rất nhanh — dành cho khi code đã tối ưu nhưng vẫn chưa đủ nhanh

Có thể tóm tắt ba phần này như sau:

> **"Hãy hợp lý"** (Be reasonable)
>
> **"Hãy có chủ đích"** (Be deliberate)
>
> **"Hãy mạo hiểm"** (Be dangerous)

## Khi nào và Ở đâu nên Tối ưu

Tôi đặt phần này lên đầu vì đây thực sự là bước quan trọng nhất. Bạn có thực sự nên làm việc tối ưu này không?

Mọi tối ưu hóa đều có chi phí. Thông thường chi phí này thể hiện qua độ phức tạp code hoặc tải nhận thức (cognitive load) — code đã tối ưu hiếm khi đơn giản hơn phiên bản chưa tối ưu.

Còn một khía cạnh khác: kinh tế học của tối ưu hóa. Thời gian của bạn với tư cách lập trình viên rất quý giá. Có chi phí cơ hội từ những việc khác bạn có thể làm cho dự án: sửa bug nào, thêm tính năng nào. Tối ưu hiệu năng thì thú vị thật, nhưng không phải lúc nào cũng là nhiệm vụ đúng đắn cần chọn. Hiệu năng là một tính năng, nhưng giao hàng nhanh (shipping) và tính đúng đắn (correctness) cũng là tính năng.((Ví dụ minh họa từ BitFunnel: giả sử một công cụ tìm kiếm cần 30.000 máy, mỗi máy ~$1.000/năm. Tăng gấp đôi tốc độ phần mềm tiết kiệm $15 triệu/năm. Ngay cả cải thiện 1% trong một năm cũng đã tự hoàn vốn.))

Hãy chọn việc quan trọng nhất cần làm lúc này. Đôi khi không phải là tối ưu CPU, mà là cải thiện trải nghiệm người dùng. Chỉ cần thêm một thanh tiến trình (progress bar), hoặc đẩy tính toán nặng ra background sau khi render giao diện, cũng đã có thể mang lại giá trị lớn.

Chỉ vì một việc dễ tối ưu không có nghĩa là đáng để tối ưu. Bỏ qua những "trái cây thấp" (low-hanging fruit) đôi khi cũng là một chiến lược phát triển hợp lý. Hãy nghĩ đây là việc tối ưu thời gian của chính bạn.

Bạn được quyền chọn cái gì và khi nào cần tối ưu. Bạn có thể di chuyển thanh trượt giữa "Phần mềm Nhanh" và "Triển khai Nhanh".

Mọi người thường nghe và lặp lại câu nói "tối ưu hóa sớm là gốc rễ của mọi điều xấu xa" nhưng lại bỏ qua toàn bộ ngữ cảnh:

> "Lập trình viên lãng phí rất nhiều thời gian để nghĩ hoặc lo lắng về tốc độ của những phần không quan trọng trong chương trình, và những nỗ lực đạt hiệu quả này thực sự gây tác động tiêu cực mạnh khi xem xét việc debug và bảo trì. Chúng ta nên quên đi những tối ưu nhỏ, nói khoảng 97% thời gian: tối ưu hóa sớm là gốc rễ của mọi điều xấu xa. **Tuy nhiên chúng ta không nên bỏ qua cơ hội trong 3% phần quan trọng đó.**"
> — Donald Knuth ([video tham khảo](https://www.youtube.com/watch?v=3WBaY61c9sE))

- Đừng bỏ qua những tối ưu dễ dàng.
- Kiến thức sâu hơn về thuật toán và cấu trúc dữ liệu sẽ khiến nhiều tối ưu trở nên "dễ" hoặc "hiển nhiên".

> Có, nhưng chỉ khi vấn đề thực sự quan trọng, chương trình thực sự quá chậm, và có kỳ vọng rằng nó có thể được làm nhanh hơn mà vẫn duy trì được tính đúng đắn, độ bền vững và rõ ràng.
> — *The Practice of Programming*, Kernighan & Pike

Tối ưu sớm còn có thể gây hại bằng cách ràng buộc bạn vào một số quyết định nhất định. Code đã tối ưu thường khó sửa đổi hơn nếu yêu cầu thay đổi, và khó vứt bỏ hơn (hiệu ứng chi phí chìm — sunk-cost fallacy) nếu cần thiết.

Trong phần lớn các trường hợp, kích thước và tốc độ của chương trình không phải là mối quan tâm. Tối ưu dễ nhất là không phải tối ưu gì cả. Tối ưu dễ thứ hai là mua phần cứng nhanh hơn.

Khi bạn đã quyết định sẽ thay đổi chương trình, hãy tiếp tục đọc.

## Cách Tối ưu

### Quy trình Tối ưu

Tối ưu hóa là một dạng refactoring. Nhưng thay vì cải thiện một khía cạnh nào đó của mã nguồn (loại bỏ code trùng lặp, tăng tính rõ ràng, v.v.), mỗi bước lại cải thiện một khía cạnh hiệu năng: giảm CPU, giảm bộ nhớ, giảm độ trễ, v.v. Sự cải thiện này thường đi kèm với giảm tính dễ đọc. Vì vậy ngoài bộ test đơn vị toàn diện, bạn còn cần một bộ benchmark tốt để xác nhận thay đổi thực sự mang lại hiệu quả mong muốn. Đôi khi một thay đổi bạn nghĩ sẽ cải thiện hiệu năng lại hóa ra không thay đổi gì hoặc thậm chí tệ hơn — hãy luôn undo thay đổi trong những trường hợp như vậy.

```go
// Dear maintainer:
//
// Once you are done trying to 'optimize' this routine,
// and have realized what a terrible mistake that was,
// please increment the following counter as a warning
// to the next guy:
//
// total_hours_wasted_here = 42
//
```

Các benchmark bạn sử dụng phải đúng và cho ra con số có thể tái hiện trên workload đại diện. Nếu độ biến thiên (variance) giữa các lần chạy quá lớn, bạn sẽ khó phát hiện được những cải thiện nhỏ. Bạn sẽ cần dùng [benchstat](https://godoc.org/golang.org/x/perf/benchstat) hoặc các kiểm định thống kê tương đương, chứ không thể chỉ "nhìn bằng mắt" được.((Dùng kiểm định thống kê là ý hay ngay cả khi không cần phát hiện cải thiện nhỏ. Việc đưa benchmark vào CI khó vì nhiễu từ "hàng xóm ồn ào" (noisy neighbours). Một giải pháp trung gian tốt là để developer chạy benchmark trên phần cứng phù hợp và ghi chú kết quả vào commit message cho những commit đặc biệt giải quyết hiệu năng.)) Các bước chạy benchmark cần được ghi chép, mọi script/tool tùy chỉnh cần được commit vào repo cùng hướng dẫn cách chạy.

Cũng lưu ý rằng: bất cứ thứ gì có thể đo được thì đều có thể tối ưu. Hãy chắc chắn bạn đang đo đúng thứ cần đo.

Bước tiếp theo là quyết định bạn đang tối ưu cho cái gì. Nếu mục tiêu là cải thiện CPU, tốc độ chấp nhận được là bao nhiêu? Bạn muốn cải thiện bao nhiêu lần (2x? 10x?)? Bạn đang cố giảm bộ nhớ? Giảm bao nhiêu? Bạn chấp nhận chậm hơn bao nhiêu để đổi lấy giảm bộ nhớ?

Tối ưu độ trễ (latency) của service lại phức tạp hơn. Với một hàm đơn lẻ, hiệu năng khá ổn định với kích thước vấn đề cho trước. Với web service, bạn không có một con số duy nhất. Một bộ benchmark đúng chuẩn sẽ cung cấp phân bố độ trễ (latency distribution) cho một mức reqs/second nhất định. Bài nói ["How NOT to Measure Latency"](https://www.youtube.com/watch?v=lJ8ydIuPFeU) của Gil Tene đưa ra cái nhìn tốt về một số vấn đề này.

Mục tiêu hiệu năng phải cụ thể. Bạn (hầu như) luôn có thể làm một thứ gì đó nhanh hơn — tối ưu thường là trò chơi của lợi ích giảm dần. Bạn cần biết khi nào nên dừng lại.

> Premature pessimization là khi bạn viết code chậm hơn mức cần thiết, thường bằng cách yêu cầu thực hiện công việc thừa không cần thiết, trong khi code có độ phức tạp tương đương lẽ ra phải nhanh hơn và nên tự nhiên xuất hiện từ tay bạn.
> — Herb Sutter

Với dự án phát triển mới (greenfield), đừng để toàn bộ việc đo benchmark và số liệu hiệu năng đến phút cuối. Nếu hiệu năng thực sự quan trọng thì nó phải là yếu tố thiết kế ngay từ đầu. Những thay đổi kiến trúc lớn để sửa hiệu năng sẽ quá rủi ro khi gần deadline.

Khoảng cách giữa mục tiêu và hiệu năng hiện tại cũng cho bạn ý tưởng bắt đầu từ đâu. Nếu chỉ cần cải thiện 10–20%, có lẽ một số chỉnh sửa triển khai nhỏ là đủ. Nếu cần tăng 10x trở lên, thay phép nhân bằng shift trái sẽ không đủ — lúc đó thường phải thay đổi lớn lên xuống toàn stack, thậm chí thiết kế lại nhiều phần hệ thống.

Công việc hiệu năng tốt đòi hỏi kiến thức ở nhiều tầng: thiết kế hệ thống, mạng, phần cứng (CPU, cache, storage), thuật toán, tuning, debug. Nói chung, tối ưu nên đi từ trên xuống dưới — tối ưu ở mức hệ thống sẽ có tác động lớn hơn tối ưu ở mức biểu thức.

Định luật Amdahl bảo chúng ta tập trung vào bottleneck.((Nếu bạn tăng gấp đôi tốc độ một routine chỉ chiếm 5% thời gian chạy, tổng wall-clock chỉ nhanh hơn 2.5%. Ngược lại, tăng tốc 10% cho routine chiếm 80% thời gian sẽ cải thiện gần 8% tổng thời gian.)) Tài liệu này chủ yếu nói về giảm sử dụng CPU, giảm sử dụng bộ nhớ, giảm độ trễ. Lưu ý rằng hiếm khi bạn có thể làm tốt cả ba cùng lúc.

Khi tối ưu, bạn muốn giảm lượng công việc CPU phải làm. Quicksort nhanh hơn bubble sort vì nó giải quyết cùng bài toán với ít bước hơn — đó là thuật toán hiệu quả hơn.

Tuning chương trình thường chỉ tạo ra cải thiện nhỏ. Những cải thiện lớn hầu như luôn đến từ thay đổi thuật toán hoặc cấu trúc dữ liệu.((Định luật Proebsting: compiler tăng gấp đôi hiệu năng mỗi 18 **năm**, trái ngược hoàn toàn với Định luật Moore tăng gấp đôi hiệu năng CPU mỗi 18 tháng. Cải thiện thuật toán mang lại biên độ lớn hơn nhiều.)) Một ví dụ cụ thể: [bài phân tích của Uber](https://medium.com/ride/how-ubers-engineering-team-eliminates-racism-in-geopath-algorithms-b40a4d9af297) thay thuật toán tìm kiếm địa lý brute-force bằng thuật toán chuyên biệt — không có cờ compiler nào cho bạn mức tăng tương đương.

Khi profiler cho thấy rất nhiều thời gian nằm ở một routine nào đó, có thể routine đó đắt đỏ, hoặc là routine rẻ nhưng được gọi rất nhiều lần. Thay vì vội vàng tăng tốc routine đó, hãy xem có thể giảm số lần gọi hoặc loại bỏ hoàn toàn nó không.

**Ba Câu Hỏi Tối Ưu Hóa:**

1. Chúng ta có cần làm việc này không? Code nhanh nhất là code không bao giờ được chạy.
2. Nếu có, đây có phải thuật toán tốt nhất không?
3. Nếu có, đây có phải triển khai tốt nhất của thuật toán đó không?

## Mẹo tối ưu cụ thể

Jon Bentley trong cuốn "[Writing Efficient Programs](http://www.crowl.org/lawrence/programming/Bentley82.html)" năm 1982 tiếp cận tối ưu hóa như một bài toán kỹ thuật: Benchmark. Phân tích. Cải thiện. Kiểm chứng. Lặp lại. Xem thêm [các quy tắc tuning chương trình](https://web.archive.org/web/20080513070949/http://www.cs.bell-labs.com/cm/cs/pearls/apprules.html).

Khi nghĩ về thay đổi cho chương trình, có hai lựa chọn cơ bản: thay đổi dữ liệu hoặc thay đổi code.

### Thay đổi dữ liệu

Thay đổi dữ liệu nghĩa là thêm vào hoặc thay đổi cách biểu diễn dữ liệu bạn đang xử lý. Từ góc độ hiệu năng, một số thay đổi sẽ làm thay đổi độ phức tạp O() của các thao tác khác nhau. Điều này thậm chí có thể bao gồm tiền xử lý input để đưa vào định dạng hữu ích hơn.

**Bổ sung cho cấu trúc dữ liệu:**

- **Thêm trường (extra fields).** Ví dụ kinh điển là lưu độ dài của linked list vào một trường trong node gốc. Việc cập nhật tốn thêm chút công sức, nhưng truy vấn độ dài trở thành O(1) thay vì O(n). Tương tự, lưu con trỏ đến các node thường xuyên cần đến thay vì tìm kiếm lại — điều này bao gồm "backwards" link trong doubly-linked list để xóa node O(1). Một số skip list giữ "search finger" — con trỏ đến vị trí vừa truy cập, giả định đó là điểm khởi đầu tốt cho thao tác tiếp theo.

- **Thêm index tìm kiếm phụ.** Hầu hết cấu trúc dữ liệu được thiết kế cho một loại query duy nhất. Nếu cần hai loại query khác nhau, có thêm "view" phụ lên dữ liệu có thể mang lại cải thiện lớn. Ví dụ, một slice các struct có primary ID (integer) để tra cứu, nhưng đôi khi cần tra cứu bằng secondary ID (string) — thay vì duyệt slice, bổ sung một map từ string → struct.

- **Thêm thông tin về phần tử.** Ví dụ, giữ một bloom filter của tất cả phần tử đã insert để nhanh chóng trả về "không khớp" cho lookup. Bloom filter cần nhỏ và nhanh để không làm lu mờ lợi ích của cấu trúc chính.

- **Nếu query đắt, thêm cache.** Ở mức lớn hơn, có thể dùng in-process cache hoặc external cache (như memcache). Chúng ta sẽ nói thêm về cache ở phần sau.

Những thay đổi này hữu ích khi dữ liệu cần lưu trữ rẻ và dễ cập nhật. Chúng đều tốn thêm bộ nhớ — đây là đánh đổi không-thời gian (space-time tradeoff) kinh điển.

Quan trọng là phải xem xét đánh đổi này có thể ảnh hưởng thế nào đến giải pháp. Đôi khi một lượng bộ nhớ nhỏ mang lại tốc độ lớn, đôi khi đánh đổi tuyến tính (2x bộ nhớ = 2x tốc độ), đôi khi tệ hơn: tốn rất nhiều bộ nhớ nhưng chỉ tăng tốc chút ít.

**Bảng tra cứu (lookup table)** cũng nằm trong đánh đổi không-thời gian. Nếu miền giá trị đủ nhỏ, toàn bộ kết quả có thể được tính trước và lưu trong bảng. Ví dụ, triển khai popcount nhanh bằng bảng 256 phần tử cho số bit 1 trong mỗi byte.

Nếu chương trình dùng quá nhiều bộ nhớ, bạn cũng có thể đi hướng ngược lại — giảm không gian để đổi lấy tăng tính toán. Thay vì lưu trữ, tính lại mỗi lần cần. Bạn cũng có thể nén dữ liệu trong bộ nhớ và giải nén on-the-fly khi cần.

**Kỹ thuật giảm bộ nhớ:**

- **Sắp xếp lại dữ liệu:** loại bỏ padding struct, xóa trường thừa, dùng kiểu dữ liệu nhỏ hơn.
- **Chuyển sang cấu trúc dữ liệu đơn giản hơn:** cấu trúc đơn giản thường tốn ít bộ nhớ hơn. Ví dụ, chuyển từ tree nhiều con trỏ sang slice + linear search.
- **Định dạng nén tùy chỉnh.** Thuật toán nén phụ thuộc rất nhiều vào loại dữ liệu. Với `[]byte` thì snappy, gzip, lz4 thường tốt. Với dữ liệu floating-point có go-tsz cho time series và fpc cho dữ liệu khoa học. Với integer: delta encoding, varint, đến các scheme phức tạp hơn như Huffman encoded xor-differences. Bạn cũng có thể tự tạo định dạng nén tối ưu cho chính dữ liệu của mình.
- **Cân nhắc random access hay streaming?** Nếu cần truy cập từng phần tử mà không muốn giải nén toàn bộ, bạn có thể nén dữ liệu thành các block nhỏ và giữ index chỉ range của từng block. Truy cập một phần tử chỉ cần kiểm tra index và unpack block nhỏ.

Phần cứng hiện đại và memory hierarchy làm cho đánh đổi không-thời gian trở nên kém rõ ràng. Rất dễ để bảng tra cứu "xa" trong bộ nhớ (và do đó đắt đỏ để truy cập), khiến việc tính lại mỗi lần lại nhanh hơn. Điều này cũng có nghĩa benchmark thường cho thấy cải thiện không được thể hiện trong production do cache contention — bảng tra cứu nằm trong cache khi benchmark nhưng bị flush bởi "dữ liệu thật" trong production.

Một khía cạnh khác cần xem xét là thời gian truyền dữ liệu. Network và disk access thường rất chậm, nên load một chunk đã nén thường nhanh hơn so với thời gian CPU giải nén sau khi fetch. Định dạng binary thường nhỏ hơn và parse nhanh hơn text, nhưng mất tính dễ đọc. Đối với truyền dữ liệu, chuyển sang protocol ít chatty hơn, hoặc bổ sung API cho phép partial query thay vì buộc fetch toàn bộ dataset mỗi lần.

### Thay đổi thuật toán

Cải thiện lớn nhất thường đến từ thay đổi thuật toán — tương đương thay bubble sort O(n²) bằng quicksort O(n log n), hoặc thay linear scan O(n) bằng binary search O(log n) hoặc map lookup O(1).

Đây là cách phần mềm trở nên chậm: cấu trúc ban đầu thiết kế cho một mục đích bị tái sử dụng cho mục đích khác không phù hợp. Quá trình này diễn ra dần dần.

**Các lớp độ phức tạp cơ bản:**

| Độ phức tạp | Ví dụ | Lời khuyên |
|---|---|---|
| O(1) | field access, array/map lookup | đừng lo, nhưng nhớ constant factor |
| O(log n) | binary search | chỉ là vấn đề nếu nằm trong loop |
| O(n) | simple loop | bạn làm cái này suốt ngày |
| O(n log n) | divide-and-conquer, sorting | vẫn khá nhanh |
| O(n·m) | nested loop / quadratic | cẩn thận và giới hạn kích thước tập |
| subexponential–polynomial | — | đừng chạy trên triệu dòng |
| O(b^n), O(n!) | exponential trở lên | chúc may mắn nếu có hơn chục điểm dữ liệu |

Tham khảo: [bigocheatsheet.com](http://bigocheatsheet.com)

Giả sử bạn cần tìm kiếm trong một tập dữ liệu chưa sắp xếp. Bạn nghĩ "nên dùng binary search" vì O(log n) nhanh hơn linear scan O(n). Nhưng binary search yêu cầu dữ liệu đã sắp xếp, nghĩa là phải sort trước tốn O(n log n). Nếu bạn làm nhiều lookup, chi phí sort upfront sẽ được bù lại. Ngược lại, nếu chủ yếu là lookup, có lẽ bạn nên dùng map với chi phí O(1).

Nếu dữ liệu tĩnh (static), bạn thường có thể làm tốt hơn nhiều so với dynamic case. Các giải pháp như minimal perfect hashing hoặc bloom filter tính trước có thể hợp lý.

Chọn cấu trúc dữ liệu đơn giản nhất hợp lý và tiếp tục. Đây là CS 101 cho việc viết phần mềm "không chậm". Nếu biết cần random access, đừng chọn linked-list. Nếu cần in-order traversal, đừng dùng map.

> Note: Xem thêm [RUM Conjecture](http://daslab.seas.harvard.edu/rum-conjecture/) — mọi cấu trúc dữ liệu đều có đánh đổi giữa Read overhead, Update overhead, và Memory overhead.

**Hai điều mọi người thường quên khi nói về big-O:**

- Có **constant factor**. Hai thuật toán cùng độ phức tạp có thể có constant khác nhau rất lớn. Đó là lý do dù merge sort, quicksort, heapsort đều O(n log n), mọi người dùng quicksort vì constant nhỏ nhất.
- Big-O chỉ nói về hành vi khi n tiến tới vô cực. Nó không nói gì về hiệu năng thực tế với n nhỏ. Thường có điểm cắt (cut-off) mà dưới đó thuật toán "ngu" lại nhanh hơn — ví dụ package sort của Go stdlib dùng insertion sort khi partition size dưới 12 phần tử.

Memory hierarchy trên máy tính hiện đại làm rối thêm vấn đề: cache thích access tuần tự của slice hơn pointer chasing ngẫu nhiên.

> "Cuộc chiến không phải lúc nào cũng thuộc về kẻ mạnh nhất, cuộc đua không phải lúc nào cũng thuộc về kẻ nhanh nhất, nhưng đó là cách đặt cược an toàn nhất."
> — Rudyard Kipling

Đôi khi thuật toán tốt nhất cho bài toán là tập hợp các thuật toán chuyên biệt cho các lớp input hơi khác nhau — "polyalgorithm". Package `sort` của Go làm điều này: xác định kích thước vấn đề và chọn thuật toán khác. Package `string` và `bytes` cũng tương tự, phát hiện và chuyên biệt hóa cho các case khác nhau.

Hầu hết thuật toán là deterministic, nhưng có lớp thuật toán dùng ngẫu nhiên để đơn giản hóa quyết định phức tạp. Ví dụ:

- **Treap** — binary tree cân bằng xác suất. Mỗi node có key và giá trị ngẫu nhiên. Cách tiếp cận đơn giản này thay thế các giải pháp rotate phức tạp (AVL, Red-Black) nhưng vẫn duy trì cân bằng O(log n) "với xác suất cao".
- **Skip list** — cấu trúc dữ liệu tương tự, dùng randomness để đạt "có lẽ" O(log n) insert/lookup.
- **Miller-Rabin primality test** — mỗi iteration output "not prime" hoặc "maybe prime". "Not prime" chắc chắn đúng; "maybe prime" đúng với xác suất ít nhất 1/2. Chạy nhiều iteration, ta có thể làm xác suất lỗi nhỏ tùy ý.((Ví dụ nếu pass 200 iteration, composite được gọi là "maybe prime" với xác suất tối đa 1/2^200 — nhỏ hơn nhiều so với xác suất lỗi phần cứng.))
- **Power of two random choices** — thay vì tìm best trong nhóm, chọn ngẫu nhiên hai và lấy cái tốt hơn. Với load balancing hoặc hash table chain, kỹ thuật này giảm expected load/chain length từ O(log n) xuống O(log log n). Xem thêm: [The Power of Two Random Choices: A Survey](https://www.eecs.harvard.edu/~michaelm/postscripts/handbook2001.pdf).

Thuật toán ngẫu nhiên được phân loại: **Monte Carlo** (đánh cược tính đúng đắn, có thể sai) hoặc **Las Vegas** (luôn đúng nhưng có thể mất rất lâu).

### Benchmark Inputs

Input thực tế hiếm khi khớp với "worst case" lý thuyết. Benchmark rất quan trọng để hiểu hệ thống hành xử thế nào trong production.

Bạn cần biết lớp input hệ thống sẽ gặp khi deploy, và benchmark phải dùng instance từ cùng phân bố đó. Các thuật toán khác nhau hợp lý ở các kích thước input khác nhau. Nếu input dự kiến <100, benchmark nên phản ánh điều đó.

Phải tạo được dữ liệu test đại diện. Các phân bố dữ liệu khác nhau kích hoạt hành vi khác nhau — ví dụ quicksort O(n²) khi dữ liệu đã sorted; interpolation search O(log log n) cho uniform random data nhưng O(n) worst case. Dùng input hoàn toàn random có thể làm lệch hành vi thuật toán: caching và compression khai thác phân bố lệch (skewed) không có trong random data nên sẽ kém hơn, trong khi binary tree lại tốt hơn với random value.

Ngược lại, nếu test hệ thống có cache mà benchmark chỉ dùng một query duy nhất, mọi request sẽ hit cache, cho view không thực tế về hành vi với request pattern đa dạng hơn.

Cũng lưu ý một số vấn đề không thấy trên laptop có thể hiện rõ khi deploy lên production với 250k reqs/second trên server 40 core.

Tài liệu tham khảo:
- [Five ways to write better benchmarks](https://timharris.uk/misc/five-ways.pdf)
- [Dùng geometric mean để so sánh nhóm benchmark](https://www.cse.unsw.edu.au/~cs9242/current/papers/Fleming_Wallace_86.pdf)
- [Benchmarking checklist của Brendan Gregg](http://www.brendangregg.com/blog/2018-06-30/benchmarking-checklist.html)

### Program Tuning

Program tuning từng là nghệ thuật, nhưng compiler ngày càng tốt. Go compiler vẫn còn cách xa gcc/clang, nhưng điều đó nghĩa là bạn cần cẩn thận khi tuning — đặc biệt khi upgrade Go version, code có thể trở nên "tệ" hơn. Có trường hợp workaround thiếu tối ưu compiler trở nên chậm hơn khi compiler được cải thiện.

Nếu bạn đang workaround một issue cụ thể của runtime/compiler, hãy luôn document thay đổi với link đến upstream issue. Điều này giúp dễ dàng quay lại tối ưu khi bug được fix.

Chống lại cám dỗ cargo cult các "performance tip" dân gian, hoặc khái quát hóa quá mức từ kinh nghiệm cá nhân. Mỗi performance bug cần được tiếp cận riêng.

Program tuning là quá trình lặp. Tiếp tục quay lại code và xem có thay đổi gì. Thường một cải thiện sẽ mở đường cho cải thiện khác.

Khi đã có thuật toán đúng, program tuning là cải thiện triển khai của thuật toán đó — trong big-O, đây là quá trình giảm constant factor. Mọi program tuning đều là hoặc làm chậm thành nhanh, hoặc làm chậm ít lần hơn.

Giữ comment. Nếu bước nào không cần làm, giải thích tại sao. Khi tối ưu thuật toán bạn phát hiện bước không cần thực hiện trong một số trường hợp — document chúng. Người khác có thể nghĩ đó là bug và thêm lại.

> "Chương trình rỗng cho kết quả sai trong thời gian không có gì. Dễ nhanh nếu bạn không cần đúng."

"Tính đúng đắn" phụ thuộc bài toán. Thuật toán heuristic đúng phần lớn thời gian có thể nhanh, cũng như thuật toán guess-and-improve cho phép dừng khi đạt giới hạn chấp nhận được.

#### Cache common case

Chúng ta quen với memcache, nhưng cũng có in-process cache. In-process cache tiết kiệm cả network call và serialization cost. Ngược lại, tăng áp lực GC vì nhiều bộ nhớ hơn cần theo dõi. Cũng cần cân nhắc eviction strategy, cache invalidation, thread-safety.

Cache lưu thông tin vừa tốn thời gian tính, hy vọng tái sử dụng sớm để tiết kiệm tính toán. **Cache không cần phức tạp.** Chỉ lưu một item — most recently seen query/response — đã có thể là win lớn.

Ví dụ về single-item cache với `time.Parse()`: giả sử xử lý massive log file cho một ngày, mỗi dòng bắt đầu bằng timestamp:

```
Sun  4 Mar 2018 14:35:09 PST <...>
```

Nếu profile cho thấy `time.Parse()` là bottleneck, dễ nhất là giữ single-item cache cho timestamp trước đó và epoch tương ứng. Miễn là log file có nhiều dòng cùng giây, đây là win lớn — với 10 triệu dòng log, chiến lược này giảm số lần gọi `time.Parse()` đắt đỏ từ 10.000.000 xuống 86.400.((Benchmark cho thấy giảm thời gian parsing từ 275ns/op xuống 5ns/op khi dùng custom time parsing biết chính xác format và timezone. Dĩ nhiên, ngay cả 275ns/op, bạn thường bị block bởi I/O chứ không phải CPU khi parse time.))

Với cache, quan trọng là so sánh chi phí của logic cache với việc refetch/recompute. Randomized cache eviction đơn giản, nhanh và hiệu quả trong nhiều trường hợp. Dù không hiệu quả bằng thuật toán phức tạp, cải thiện lớn nhất thường là thêm cache — chọn thuật toán cache chính xác chỉ mang lại cải thiện nhỏ.

Expected cache hit ratio rất quan trọng. Export ratio này vào monitoring stack.((Thay đổi ratio sẽ cho thấy traffic thay đổi — lúc đó cần xem lại cache size hoặc expiration policy.)) Tôi từng có service mà test với production data cho thấy ngay cả optimal cache cũng không đáng — chúng tôi không có đủ repeated request để thêm độ phức tạp cache trở nên hợp lý.

#### Quy trình tuning của Egon Elbre

1. Đưa ra giả thuyết tại sao chương trình chậm.
2. Đưa ra N giải pháp giải quyết.
3. Thử hết và giữ cái nhanh nhất.
4. Giữ giải pháp nhanh thứ hai phòng khi cần.
5. Lặp lại.

**Các kỹ thuật tuning thường dùng:**

- Nếu có thể, giữ implementation cũ để test. Nếu không, tạo đủ golden test case để so output — bao gồm edge case, vì chúng thường bị ảnh hưởng khi tuning nhắm đến general case.
- Khai thác mathematical identity: multiplication with addition, chuyển từ floating-point sang integer math, dùng WolframAlpha/Maxima/sympy để specialize và optimize.
- "Pay only for what you use" — chỉ zero một phần array thay vì toàn bộ.
- Cheap check trước expensive check: `strcmp` trước regexp (tương tự bloom filter trước query).
- Common case trước rare case: tránh extra test luôn fail.
- Loop unrolling vẫn hiệu quả — đánh đổi giữa code size và branch test overhead.
- Loại bỏ bounds check và nil check khỏi loop.

Nhiều folklore performance tip dựa trên compiler tối ưu kém và khuyến khích lập trình viên làm thủ công các biến đổi. Compiler đã thay shift cho multiply/divide power-of-two từ 15 năm nay. Như mọi khi, benchmark trước khi commit version mới.

Mọi tối ưu đều mã hóa một giả định về dữ liệu của bạn. Những giả định này phải được document và tốt nhất là test. Đây sẽ là nơi chương trình crash, chậm đi, hoặc trả dữ liệu sai khi hệ thống phát triển.

### Tóm tắt quy trình tối ưu

1. Xác định mục tiêu hiệu năng và xác nhận hiện tại chưa đạt.
2. Profile để xác định khu vực cần cải thiện (CPU, heap allocations, hoặc goroutine blocking).
3. Benchmark để xác định speedup giải pháp sẽ mang lại, dùng framework built-in. Chắc chắn benchmark đúng thứ cần trên OS và architecture mục tiêu.
4. Profile lại sau đó để xác nhận vấn đề đã biến mất.
5. Dùng [benchstat](https://godoc.org/golang.org/x/perf/benchstat) hoặc [tinystat](https://github.com/codahale/tinystat) để xác nhận set timings khác biệt "đủ" để tối ưu đáng giá so với độ phức tạp code thêm vào.
6. Dùng [vegeta](https://github.com/tsenart/vegeta) cho load test HTTP service — nếu có thể, test ramp-up/ramp-down ngoài steady-state load.
7. Chắc chắn số liệu latency có ý nghĩa.

Bước đầu tiên rất quan trọng. Nó cho bạn biết khi nào và ở đâu bắt đầu tối ưu. Quan trọng hơn, nó cũng cho bạn biết khi nào nên dừng. Hầu hết tối ưu đều thêm độ phức tạp code để đổi lấy tốc độ — và bạn luôn có thể làm code nhanh hơn. Đây là cân bằng.

## Garbage Collection

> "Bạn trả giá cho memory allocation nhiều hơn một lần. Lần đầu rõ ràng là khi allocate. Nhưng bạn cũng trả giá mỗi khi garbage collection chạy. Reduce / Reuse / Recycle."
> — @bboreham

- Stack vs heap allocations — điều gì gây heap allocation?
- Hiểu escape analysis (và hạn chế hiện tại)
- Dùng `/debug/pprof/heap` với flag `-base` để so sánh
- **API design để giới hạn allocation:**
  - Cho phép caller pass buffer để reuse thay vì buộc allocate mới
  - Pass struct có thể cho phép caller stack allocate
- **Giảm pointer để giảm thời gian GC scan:**
  - Pointer-free slices
  - Maps với cả key và value pointer-free
- Tuning `GOGC`
- Buffer reuse qua `sync.Pool` hoặc custom (go-slab, v.v.)
- Dùng error variables thay `errors.New()` / `fmt.Errorf()` tại call site
- Dùng structured errors để giảm allocation — pass struct value, tạo string lúc in error
- Cẩn thận pinning allocation lớn bằng substring hoặc slice nhỏ

## Runtime và Compiler

- Chi phí call qua interface (indirect call ở mức CPU)
- `runtime.convT2E` / `runtime.convT2I`
- Type assertion vs type switch
- `defer` overhead
- Special-case map implementation cho `int`, `string` — map cho `byte`/`uint16` không được optimize; dùng slice thay thế
- Bounds check elimination
- `[]byte` ↔ `string` copies, map optimizations
- Two-value `range` sẽ copy array — dùng slice thay thế
- Dùng string concatenation thay `fmt.Sprintf` khi có thể; runtime có routine optimized cho nó

## Unsafe

> Note: Unsafe là con dao hai lưỡi — dùng khi biết mình đang làm gì và đã benchmark để chứng minh lợi ích xứng đáng với rủi ro.

- Các use case phổ biến: mmap data file, speedy de-serialization, binary wire protocol to struct
- Struct padding và alignment:
  - [Padding is hard — Dave Cheney](https://dave.cheney.net/2015/10/09/padding-is-hard)
  - [Structure packing — catb.org](http://www.catb.org/esr/structure-packing/#_go_and_rust)
  - Dùng [structlayout-optimize](https://github.com/dominikh/go-tools) để tự động sắp xếp lại struct
- String ↔ slice conversion không cần copy
- Viết test cho struct layout với `unsafe.Offsetof` để phát hiện breakage

## Common gotchas với standard library

- **`time.After()` leak** cho đến khi fire — dùng `t := time.NewTimer(); defer t.Stop()` thay thế
- **Reusing HTTP connections** — đảm bảo drain body sau khi đọc response
- **`rand.Int()`** và các hàm liên quan: mutex protected và đắt để tạo — xem xét random number generation khác (go-pcgr, xorshift)
- **`binary.Read` và `binary.Write`** dùng reflection và chậm — làm thủ công
- Dùng `strconv` thay `fmt` nếu có thể
- Dùng `strings.EqualFold(str1, str2)` thay `strings.ToLower(str1) == strings.ToLower(str2)` để so sánh string case-insensitive hiệu quả

## Alternate Implementations

Các thay thế phổ biến cho package standard library:

- `encoding/json` → ffjson, easyjson, jingo (chỉ encoder)
- `net/http` → fasthttp (nhưng API không tương thích, không RFC compliant ở một số điểm tinh tế), httprouter
- `regexp` → ragel hoặc package regexp khác
- **Serialization** — mọi serialization format đều có trade-off:
  - Write-heavy → fast encoding
  - Read-heavy → fast decoding
  - Kích thước encoded, compatibility ngôn ngữ/tooling
  - Trade-off giữa packed binary và self-describing text
  - Xem [go_serialization_benchmarks](https://github.com/alecthomas/go_serialization_benchmarks)
- `database/sql` → tìm driver không dùng nó: jackx/pgx, crawshaw sqlite
- `container/list` → hầu như luôn dùng slice thay thế

## cgo

> "cgo is not go" — Rob Pike

- Đặc tính hiệu năng của cgo call rất khác function call thông thường
- Trick giảm chi phí: batching — giảm số lần vượt ranh giới Go/C
- Quy tắc pass pointer giữa Go và C

## Kỹ thuật nâng cao

### CPU Cache

- Performance cliffs — hiểu cache-line: kích thước, padding, alignment
- Map vs slice — slice thân thiện với cache hơn
- **SOA vs AOS layout:** row-major vs column-major — khi có X, bạn cần X khác hay cần Y?
- Temporal và spatial locality: dùng cái đang có và cái gần đó càng nhiều càng tốt
- Giảm pointer chasing
- Làm cho 64 byte đầu của struct thật quan trọng

### Branch prediction

Loại bỏ branch khỏi inner loop — đưa điều kiện ra ngoài:

```go
// Tốt hơn: test ngoài loop
if a {
    for { ... }
} else {
    for { ... }
}

// Tránh: test trong mỗi iteration
for {
    if a { ... } else { ... }
}
```

Ví dụ branch-free code:

```go
// Thay vì:
if i%2 == 0 {
    evens++
} else {
    odds++
}

// Branch-free:
counts[i&1]++
```

"Branch-free code" không phải lúc nào cũng nhanh hơn, nhưng thường khó đọc hơn — benchmark trước khi áp dụng.

- Sorting data có thể cải thiện hiệu năng qua cả cache locality và branch prediction, dù tính cả thời gian sort
- Function call overhead: inliner ngày càng tốt
- Giảm data copy (bao gồm param function lớn lặp lại)

## Concurrency

- Xác định phần nào có thể parallel và phần nào phải sequential
- Goroutine rẻ, nhưng không miễn phí
- **False sharing** → pad đến cache-line size; **true sharing** → sharding
- Lazy synchronization: đắt đỏ, nên duplicate work đôi khi rẻ hơn
- Thứ bạn kiểm soát: số worker, batch size

Bạn cần mutex để bảo vệ shared mutable state. Nếu mutex contention nhiều, bạn cần hoặc giảm **shared**, hoặc giảm **mutable**. Hai cách giảm shared: (1) shard lock hoặc (2) xử lý độc lập rồi combine sau. Giảm mutable: làm data structure read-only. Bạn cũng có thể giảm thời gian dữ liệu cần shared bằng cách giảm critical section.

Khi shard lock, cẩn thận shared cache-line. Cần pad để tránh cache-line bouncing giữa các processor:

```go
var stripe [8]struct {
    sync.Mutex
    _ [7]uint64 // padding lấp phần còn lại của cache line (64 bytes)
}
```

Đừng làm gì đắt trong critical section nếu có thể, bao gồm I/O.

## Assembly

- Compiler cải thiện liên tục — tiêu chuẩn để viết asm ngày càng cao
- Thay thế càng ít càng tốt để có impact; maintenance cost cao
- **Lý do tốt để viết asm:** SIMD hoặc thứ khác ngoài khả năng Go/compiler
- Rất quan trọng phải benchmark: cải thiện có thể lớn (10x cho go-highway), zero, hoặc chậm hơn (no inlining)
- Luôn có pure-Go version (`purego` build tag): testing, arm, gccgo
- Rebenchmark với version Go mới để xem có xóa asm được chưa
- Tooling:
  - [asmfmt](https://github.com/klauspost/asmfmt) — gofmt cho assembly
  - [c2goasm](https://github.com/minio/c2goasm) — convert assembly từ gcc/clang sang goasm
  - [avo](https://github.com/mmcloughlin/avo) — higher-level assembler bằng Go
- [AssemblyPolicy](https://github.com/golang/go/wiki/AssemblyPolicy) và [Design of the Go Assembler](https://talks.golang.org/2016/asm.slide)

## Tối ưu toàn bộ service

Hầu hết thời gian bạn không được đưa một routine CPU-bound duy nhất để tối ưu. Đó là case dễ. Nếu tối ưu service, bạn cần nhìn toàn hệ thống: monitoring, metrics, log nhiều thứ theo thời gian để thấy chúng xấu đi và thấy tác động thay đổi của bạn trong production.

Tham khảo: [tip.golang.org/doc/diagnostics.html](https://tip.golang.org/doc/diagnostics.html)

**Hai quy tắc cơ bản:** hoặc tăng tốc thứ chậm, hoặc làm chúng ít lần hơn.

- Distributed tracing để track bottleneck ở mức cao hơn
- Query pattern cho single server thay vì bulk
- Performance issue có thể không phải code của bạn, nhưng bạn vẫn phải workaround — xem [Azure Architecture Antipatterns](https://docs.microsoft.com/en-us/azure/architecture/antipatterns/)

## Tooling

### Introductory Profiling

Cheat-sheet nhanh dùng pprof tooling. Xem thêm [high-performance-go-workshop](https://github.com/davecheney/high-performance-go-workshop).

**Microbenchmark:**

- Nhỏ, giống unit test
- Workflow: profile → trích hot code ra benchmark → tối ưu benchmark → profile
- Flags: `-cpuprofile` / `-memprofile` / `-benchmem`
- `0.5 ns/op` nghĩa là bị optimize away — dùng `sink` variable để tránh

**Đọc output pprof:**

- `go tool pprof` và [google/pprof](https://github.com/google/pprof)
- Các phần runtime hay xuất hiện: `malloc`, `gc workers`, `runtime._ExternalCode`

**Macro-benchmark (Profiling trong production):**

- Lớn hơn, giống end-to-end test
- `net/http/pprof`, debug muxer
- Vì là sampling, hit 10 server ở 100hz tương đương 1 server ở 1000hz
- Memory options: `-inuse_space`, `-inuse_objects`, `-alloc_space`, `-alloc_objects`
- Profiling trong production: localhost + ssh tunnel, auth header, dùng curl

### Phụ lục: Implement Research Papers

**Mẹo implement paper:**

> Warning: Đừng. Bắt đầu với giải pháp hiển nhiên và cấu trúc dữ liệu hợp lý.

Thuật toán "hiện đại" thường có độ phức tạp lý thuyết thấp hơn nhưng constant factor cao và implementation phức tạp. Ví dụ kinh điển là Fibonacci heaps — khó implement đúng và constant factor lớn. Trên phần cứng hiện đại, thuật toán "chậm hơn" có thể đủ nhanh, hoặc thậm chí nhanh hơn.

> "Thuật toán nhanh nhất thường có thể thay bằng cái gần nhanh bằng và dễ hiểu hơn nhiều."
> — Douglas W. Jones, University of Iowa

> "Fancy algorithms are slow when n is small, and n is usually small. Fancy algorithms have big constants. Until you know that n is frequently going to be big, don't get fancy. Fancy algorithms are buggier than simple ones, and they're much harder to implement."
> — Rob Pike, *Notes on C Programming* (1989)

**Khi phải implement paper, làm đúng thứ tự:**

1. **Chọn paper đúng.** Tìm paper mà thuật toán của họ tuyên bố đánh bại và implement cái đó trước. Paper trước thường dễ hiểu hơn và có thuật toán đơn giản hơn.
2. **Xem context paper được viết.** Xác định giả assumption về phần cứng: disk space, memory usage. Một số paper cũ đưa ra trade-off hợp lý vào thập niên 70–80 nhưng không còn áp dụng — kích thước memory giờ lớn hơn nhiều bậc, và SSD thay đổi penalty latency khi dùng disk.
3. **Chắc chắn hiểu thuật toán.** Nghe hiển nhiên, nhưng nếu không sẽ không debug được. Tham khảo [How to Read a Paper](https://blizzard.cs.uwaterloo.ca/keshav/home/Papers/data/07/paper-reading.pdf). Hiểu tốt có thể cho phép trích key idea từ paper và chỉ áp dụng cái đó.
4. **Cẩn thận với reference source code của paper:** code học thuật hầu như luôn tệ, cẩn thận license restriction ("research purposes only"), và cẩn thận bug ở edge case. Cũng xem implementation khác trên GitHub.

Đôi khi paper có graph, nhưng chúng thường biased để cho thấy thuật toán mới tốt thế nào (publication bias).

Tài liệu tham khảo:
- [How to implement a paper — codecapsule.com](http://codecapsule.com/2012/01/18/how-to-implement-a-paper/)
- [High Performance Go Workshop — Dave Cheney](https://www.youtube.com/watch?v=8eRx5Wo3xYA)
