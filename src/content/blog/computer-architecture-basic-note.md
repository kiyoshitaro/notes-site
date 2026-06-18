---
title: "Kiến trúc máy tính: Ghi chú cơ bản"
pubDate: "2024-10-25"
published: true
contents_table: true
pinned: false
description: "Ghi chú về kiến trúc máy tính: CPU, RAM, bộ nhớ cache, process/thread, I/O, privilege levels, zero-copy, và các kỹ thuật tối ưu memory layout."
cat: "hardware"
useKatex: false
---

<!-- nguồn: https://www.youtube.com/playlist?list=PLRJWiLCmxyxi2RCPVYfewxJIWJzc_colw -->

## Các thành phần chính trong hệ thống

- **Bộ xử lý trung tâm (CPU)**: "Bộ não" thực hiện các phép toán và điều khiển toàn bộ hệ thống.
- **Bộ nhớ (Memory)**: Bao gồm bộ nhớ chính (RAM) để lưu trữ tạm thời dữ liệu đang xử lý và các loại bộ nhớ đệm (Cache).
- **Hệ thống vào/ra (I/O System)**: Các thiết bị giúp máy tính giao tiếp với thế giới bên ngoài như bàn phím, chuột, màn hình.
- **Hệ thống liên kết (Bus)**: Các đường dẫn truyền tín hiệu giữa CPU, bộ nhớ và các thiết bị I/O.
- **Hệ thống lưu trữ**: nơi dữ liệu ở lại vĩnh viễn:
  - SSD (NVMe/SATA): Sử dụng các chip nhớ Flash.
  - HDD: đĩa từ tính quay ở tốc độ cao + 1 đầu đọc cơ học.

## Mô hình kiến trúc phổ biến

- **Kiến trúc Von Neumann** (trên PC/Laptop): Mô hình kinh điển nơi dữ liệu và chương trình được lưu trữ chung trong một bộ nhớ duy nhất => CPU không thể vừa đọc lệnh vừa lấy dữ liệu cùng lúc và phải xếp hàng chờ nhau.
- **Kiến trúc Harvard** (trên Chip nhúng/Smartphone): Sử dụng hai bộ nhớ riêng biệt cho dữ liệu và lệnh, giúp tăng tốc độ truy xuất.
- **Kiến trúc lai**: ngoài RAM vẫn dùng Von Neumann, trong (Cache L1): CPU chia bộ nhớ đệm L1 thành 2 phần: L1 Instruction và L1 Data.
- **Kiến trúc tập lệnh (ISA)**: Quy định các lệnh mà CPU có thể hiểu và thực hiện (ví dụ: x86 của Intel/AMD hoặc ARM trên smartphone).

## Chi tiết thành phần

---

### CPU

#### Thành phần

* **Control Unit** (thiết kế phần cứng thực hiện Von Neumann): Lấy lệnh từ RAM qua bus dữ liệu → giải mã → Chỉ đạo ALU, thanh ghi thực hiện.

* **ALU**: thực hiện các phép tính toán và logic.

* **Registers**: lưu trữ tạm dữ liệu.
  * Thanh ghi lệnh (Instruction Register): Lưu lệnh hiện tại đang được xử lý.
  * Thanh ghi địa chỉ bộ nhớ (MAR): Lưu địa chỉ của dữ liệu/lệnh cần lấy từ RAM.
  * Thanh ghi dữ liệu bộ nhớ (MDR): Lưu dữ liệu vừa lấy từ RAM hoặc kết quả cần ghi.

* **Bộ đếm chương trình (Program Counter - PC)**: Lưu địa chỉ của lệnh tiếp theo sẽ thực thi.

* **Bus**: vận chuyển dữ liệu.
  * Bus dữ liệu: Chuyển dữ liệu giữa CPU, RAM, và các thiết bị khác.
  * Bus địa chỉ: Chuyển địa chỉ bộ nhớ mà CPU muốn truy cập.
  * Bus điều khiển: Chuyển tín hiệu điều khiển từ bộ điều khiển.

#### Mô hình Von Neumann

* **Fetch**:
  * PC cung cấp địa chỉ (ảo) lệnh tiếp trong RAM.
  * CU gửi địa chỉ này qua bus địa chỉ đến RAM.
  * MMU dịch địa chỉ ảo → vật lý và lấy dữ liệu.
  * RAM gửi lệnh về qua bus dữ liệu → lưu vào register.

* **Decode**: CU giải mã lệnh.

* **Execute**:
  * ALU thực hiện → KQ lưu vào register hoặc gửi về RAM qua bus dữ liệu.
  * PC tăng giá trị để lấy lệnh tiếp theo.

#### CPU virtualization

* **Instruction-level emulation**: OS kiểm tra từng lệnh của chương trình trước khi chạy => chậm vì OS overhead, hiện nay chỉ dùng triển khai máy ảo.

* **Limited Direct Execution Protocol for Multi-programs**:
  * Đảm bảo process chạy trực tiếp trên CPU để hiệu năng và OS chỉ can thiệp khi cần.
  * 2 thành phần chính:
    * **Restricting process**: user code chỉ chạy trong user mode (không toàn quyền).
    * **Mechanisms to regain control**: CPU có cách quay lại kernel (OS):
      * Timer interrupt (để chia CPU giữa nhiều process).
      * Traps / exceptions (vd: page fault, divide-by-zero, illegal instruction).
      * System call (software interrupt) (user process yêu cầu kernel làm).

  * **Timer Interrupt**:
    * OS lập trình: "Cứ mỗi 10ms phát sinh một interrupt"((Với CPU 3GHz, 10ms = ~30 triệu chu kỳ clock — đủ để một process thực hiện một lượng công việc có ý nghĩa trước khi bị preempt.)) → CPU tự ngắt → nhảy vào kernel → kernel scheduler quyết định switch process hay không (tốc độ micro/nano giây).
    * Các bước:
      * Step 1: CPU chạy chương trình A.
      * Step 2: Timer (ví dụ 10ms) → tạo interrupt.
      * Step 3: CPU nhảy vào kernel mode, chạy hàm interrupt handler.
      * Step 4: Kernel scheduler quyết định chuyển process (dựa trên priority, fairness, …).
      * Step 5: Nếu cần, kernel thực hiện context switch A → B.
      * Step 6: CPU quay lại user mode, tiếp tục chạy B.

  * **Trap/Exceptions**:
    * Cách để CPU tạm dừng chương trình người dùng và chuyển quyền điều khiển về kernel: trap (gọi `read()`, `write()`, `fork()`), Exception (page fault - nhẹ → kernel tự xử lý, nặng → kill process).

#### Multi-programs

* **Program**: sits on disk as bunch of instructions (+ data).

* CPU single-core thật sự chỉ chạy được một instruction tại một thời điểm => OS cần cơ chế chạy nhiều chương trình (browser, nhạc, editor…): CPU scheduling + context switching.

* **Interrupt**: yêu cầu CPU ngắt dòng lệnh hiện tại và nhảy vào chạy Interrupt Handler (do kernel định nghĩa): I/O interrupt, Disk interrupt.

#### Hyper-Threading: cho phép CPU chạy hai luồng (threads) trên cùng một lõi vật lý bằng cách

* Tạo hai bộ thanh ghi riêng: Mỗi luồng có bộ thanh ghi riêng để lưu trạng thái (dữ liệu, lệnh) của nó.
* Chia sẻ các tài nguyên khác: ALU, bộ nhớ đệm, và các đơn vị thực thi được chia sẻ giữa hai luồng.
* Lập lịch thông minh: CPU luân phiên xử lý hai luồng, tận dụng thời gian "rảnh" của tài nguyên để chạy luồng thứ hai.

---

### Memory (RAM)

#### Bản chất vật lý

RAM lưu data bằng **điện tích trên tụ** (DRAM) hoặc **trạng thái flip-flop** (SRAM) — cả hai cần dòng điện duy trì => **Volatile** (mất điện = mất data).

* **DRAM (RAM chính)**: 1 bit = **1 transistor + 1 tụ điện**.
  - Tụ tích điện = bit `1`, không tích = bit `0`.
  - Tụ **rò điện** → cần **refresh ~64 ms/lần** để nạp lại điện tích — đó là lý do gọi "Dynamic".((Trái lại, SRAM ("Static") dùng flip-flop giữ trạng thái mà không cần refresh. "Dynamic" và "Static" đề cập đến tính chất này của điện tích, không phải tốc độ.))
  - Mật độ cao, rẻ, nhưng chậm (~50–100 ns).((DRAM latency ~50–100 ns tương đương ~150–300 chu kỳ CPU ở 3 GHz — CPU ngồi chờ trong thời gian đó nếu không có cache.))

* **SRAM (cache L1/L2/L3)**: 1 bit = **6 transistor** tạo flip-flop, giữ trạng thái mãi (chừng nào còn điện).((SRAM dùng 6 transistor/bit so với 1T+1C của DRAM là lý do SRAM đắt hơn ~100x và chiếm diện tích nhiều hơn — không thể làm cả GB SRAM trong chip.))
  - Nhanh (~1–10 ns), không cần refresh, nhưng đắt + chiếm diện tích → chỉ vài MB.

* **Đọc/ghi**: CPU phát địa chỉ qua **address bus** → memory controller chọn **row + column** trên DRAM grid → đọc điện áp tụ qua **sense amplifier** → trả về qua **data bus**.

* **Tín hiệu**: bit chỉ là **mức điện áp**. Ví dụ DDR4: `0V` = bit `0`, `1.2V` = bit `1`.((DDR3 dùng 1.5V, DDR5 giảm xuống 1.1V — điện áp thấp hơn giúp tiết kiệm điện và cho phép mật độ chip cao hơn.)) Không có "số" trong RAM, chỉ có điện.

#### Đơn vị tổ chức

* **Bit**: 0 hoặc 1 (1 ô nhớ vật lý).
* **Byte = 8 bit**: **đơn vị địa chỉ nhỏ nhất** mà CPU có thể đọc/ghi. Không thể `&` lấy địa chỉ của 1 bit.
* **Word**: kích thước thanh ghi CPU (x86-64 = 8 byte). CPU đọc/ghi RAM theo **word/cache line**, không phải từng byte.
* **Cache line = 64 byte** (x86 phổ biến): đơn vị truyền giữa RAM ↔ cache. Đọc 1 byte = kéo cả 64 byte vào cache.((Cache line 64 byte = 8 lần word size 64-bit. Kéo nguyên line giúp tận dụng spatial locality — nếu bạn truy cập `a[0]`, khả năng cao sẽ truy cập `a[1..7]` tiếp theo, và chúng đã nằm sẵn trong cache.))

#### Endianness — thứ tự byte trong word

Khi lưu số `0x12345678` (4 byte) tại địa chỉ `0x1000`:

| Địa chỉ | Little Endian (x86, ARM thường) | Big Endian (network, PowerPC, SPARC) |
|---|---|---|
| `0x1000` | `0x78` (LSB trước) | `0x12` (MSB trước) |
| `0x1001` | `0x56` | `0x34` |
| `0x1002` | `0x34` | `0x56` |
| `0x1003` | `0x12` (MSB) | `0x78` (LSB) |

* **Little Endian**: byte thấp ở địa chỉ thấp. **CPU x86/x64, ARM mặc định**.
* **Big Endian**: byte cao ở địa chỉ thấp. **Network byte order** (TCP/IP, file format chuẩn như PNG, JPEG header).
* **Convert**: `htonl`, `ntohl`, `__builtin_bswap32`, `std::byteswap` (C++23).((Lý do network dùng Big Endian: chuẩn RFC 791 (IPv4, 1981) chọn BE vì nhiều minicomputer thời đó dùng BE. Từ đó "network byte order" = BE được giữ nguyên cho đến nay dù x86 LE đã thống trị.))

> Warning: **Bug điển hình**: cast `int*` sang `char*` rồi đọc byte đầu — kết quả khác nhau giữa LE và BE.

#### Bản chất

* RAM = **mảng byte có địa chỉ**, đứng sau là **mảng tụ điện cần refresh**.
* CPU **không đọc 1 byte** — luôn kéo cả **cache line 64 byte**.
* **Latency ~100 ns** cho 1 cache miss = **~300 cycle CPU lãng phí**.((Tính nhanh: 100 ns × 3 GHz = 300 cycles. Trong 300 cycles đó, một CPU hiện đại có thể thực hiện 300–600 phép tính nếu data đã có trong cache.)) Đó là lý do cache + locality quyết định perf, không phải số lệnh.

---

### Quá trình CPU và OS phối hợp chạy 1 program

#### Thành phần

* **CPU**: thực thi lệnh: register, ALU/FPU, pipeline, cache L1/L2/L3, TLB.
* **RAM**: nơi chứa code + data "đang dùng".
* **Disk (SSD/HDD)**: nơi lưu file thực thi, thư viện, data "lâu dài".
* **MMU**: phần cứng trong CPU để dịch địa chỉ ảo → vật lý.
* **OS (kernel + loader + scheduler)**: quản lý tài nguyên, khởi tạo process, lập lịch CPU, I/O, nhớ trang (paging), cách ly tiến trình.

#### Khởi tạo process: khi gọi `execve("./app")`

* Loader của OS đọc header file thực thi (ELF/PE).
* Tạo process + PCB (Process Control Block).
* Tạo Virtual Address Space cho process.
* Demand paging cho các segment: Text (code, read-exec), Data (global/static), .rodata (read-only), Stack, Heap (trống, sẽ lớn dần): segment này được nạp vào virtual memory của process, CPU sẽ thực hiện instruction cycle trên vùng .text.
* Kernel tạo một page table mới cho tiến trình (kiến trúc x86/x64, page table là cây nhiều cấp), ánh xạ các vùng .text, .data, v.v. vào page table.
* Đặt con trỏ lệnh (PC/IP) tại `_start`, chuẩn bị stack.
* Chuyển sang user mode → process bắt đầu chạy ở `_start` rồi tới `main`.

#### Layout Address space

```text
=== STACK GROW DOWN (frames from high to low addresses) ===
┌────────────────────────────────────────────┐
│ Stack (grow ↓) — R/W + guard               │
│   Khi gọi hàm mới, frame mới ở địa chỉ thấp hơn
├────────────────────────────────────────────┤
│   recursive depth=0 @ 0x7ffceba9fbd4 ← frame nông nhất (địa chỉ cao nhất)
│   recursive depth=1 @ 0x7ffceba9fba4 ← grow down (địa chỉ thấp hơn)
│   recursive depth=2 @ 0x7ffceba9fb74 ← grow down (địa chỉ thấp hơn)
│   recursive depth=3 @ 0x7ffceba9fb44 ← grow down (địa chỉ thấp hơn)
├────────────────────────────────────────────┤
│ Biến trong cùng một frame (tăng dần)       │
│   c = 3 @ 0x7ffceba9fc04 ← cao hơn b
│   b = 2 @ 0x7ffceba9fc00 ← cao hơn a
│   a = 1 @ 0x7ffceba9fbfc
└────────────────────────────────────────────┘

=== MAPPED REGIONS ===
┌────────────────────────────────────────────┐
│ Mapped regions (mmap, so)                  │
│   mmap_region = 0x73370c3ca000
└────────────────────────────────────────────┘

=== HEAP GROW UP (allocations from low to high addresses) ===
┌────────────────────────────────────────────┐
│ Heap (grow ↑) — R/W                        │
│   Khi malloc nhiều lần, vùng mới ở địa chỉ cao hơn
├────────────────────────────────────────────┤
│   alloc3 = 0x5d28d5e16790 ← cao hơn alloc2
│   alloc2 = 0x5d28d5e16720 ← cao hơn alloc1
│   alloc1 = 0x5d28d5e166b0 ← cấp phát đầu tiên
└────────────────────────────────────────────┘

=== GLOBAL SECTIONS ===
┌────────────────────────────────────────────┐
│ .bss / .data — R/W                         │
│   &global_bss:     0x5d28b8b6f040
│   &global_data:    0x5d28b8b6f010
├────────────────────────────────────────────┤
│ .rodata — R                                │
│   rodata_str:     0x5d28b8b6d008
├────────────────────────────────────────────┤
│ .text — R/X                                 │
│   sample_function: 0x5d28b8b6c1e9
└────────────────────────────────────────────┘
└───────────────(user space)─────────────────┘

        (kernel space ở nửa trên tách biệt)
```

* ASLR random vị trí để tăng an toàn.
* Virtual space trên 64-bit là cực lớn (hàng trăm TB cho user space) → đủ để map "dải ảo liên tiếp" cho mảng lớn, dù RAM thật rời rạc.
* Stack là vùng nhớ được quản lý tự động bởi trình biên dịch và CPU (vài MB), truy cập trực tiếp qua offset → bộ nhớ liền mạch, cache-friendly & giải phóng tự động khi hàm kết thúc.
* Heap chỉ có thể gián tiếp qua con trỏ → overhead, phân mảnh, dễ cache miss & phải tự `free` hoặc dùng GC.

#### CPU chạy lệnh máy Von Neumann (fetch → decode → execute → write-back)

* **Fetch**: lấy opcode từ L1I (miss → L2/L3 → RAM).
* **Decode**: giải mã thành opcode micro-ops (µops) (vd: `0x8B 0x07 0x83 0xC0 0x05 0x89 0x06`).
* **Execute**: ALU tính toán; Load/Store truy cập L1D → L2 → L3 → RAM (song song tra TLB).
* **Write-back**: Ghi kết quả vào thanh ghi hoặc bộ nhớ.
* **Memory access**: Paging + MMU/TLB (dịch VA→PA) + Cache locality:
  * Mỗi lần lệnh truy cập bộ nhớ (vd `mov eax, [rdi+8]`), AGU trong CPU tính VA, kiểm tra cache L1/L2/L3; nếu hit, lấy ngay (rất nhanh, vài chu kỳ clock).
  * Nếu miss, MMU tra TLB/page tables:
    * TLB hit: dịch ngay (vài ns).
    * TLB miss: vào page tables (do OS dựng), phải tra 4 cấp (PML4→PDPT→PD→PT) → tốn hơn (chục–trăm ns).((4-level page walk trên x86-64: mỗi cấp là 1 memory access. Trong worst case không có L1/L2 cache: 4 lần miss × ~100ns/lần = ~400ns chỉ để dịch địa chỉ, trước khi lấy được data thật.))
  * PA được gửi tới CPU Cache:
    * Nếu trang ở RAM (page hit): Lấy và nạp data từ RAM vào cache.
      * Nếu địa chỉ ảo liên tiếp (`arr[0]`, `arr[1]`, `arr[2]`...) → địa chỉ vật lý thường gần nhau (spatial locality) → dễ nằm trong cùng cache line.
    * Nếu trang không ở RAM (page fault): CPU gửi interrupt đến OS.
  * OS xử lý page fault:
    * OS tìm page trên disk, load vào RAM (nếu RAM đầy, Page Replacement Algorithms: LRU, …).
    * Cập nhật page table & CPU tiếp tục thực hiện.

#### CPU virtualization & scheduler → MULTITASK

* Phải có cơ chế giúp OS kiểm soát process chạy trong CPU: nếu là lớp ở giữa instruction-level emulate thì sẽ gây overhead ảnh hưởng perf nên sẽ dùng time-sharing (timer interrupt).
* OS lập trình timer (vd 1–10 ms). Hết hạn → timer interrupt → vào kernel.
* Scheduler (vd CFS) quyết định:
  * Là 1 module kernel chịu trách nhiệm phân bổ thời gian CPU.
  * Nếu cho process hiện tại chạy tiếp (reset timer) → super fast.
  * Nếu Context switch sang process khác: lưu register/PC/SP của A vào PCB, phục hồi của B, ra user mode (overhead chỉ ~0.3–3 µs((~0.3–3 µs là overhead của bản thân context switch. Nhưng cost thực sự lớn hơn vì TLB flush + cache warm-up sau khi switch — process mới phải "làm ấm" cache từ đầu.)) — rất nhỏ so với quantum ~ms).

* State của process:
  * Ready --(được chọn)--> Running --(timer)--> Ready
  * Running --(syscall I/O)--> Blocked --(I/O interrupt)--> Ready

* **Context switch với process**:
  * **Trigger**: CPU bị ngắt bởi interrupt (timer, yield ở syscall) → CPU tự động chuyển sang kernel mode (ring 0) → lưu RIP, RSP vào kernel stack (stack riêng của kernel, nằm ở kernel space).
  * **Save Context**:
    * Register CPU: Lưu toàn bộ general registers (RAX, RBX,...), segment registers (CS, DS, SS), flags và CR3 (trỏ page table) vào PCB — 1 struct lớn (~1KB) trong kernel memory (kernel space).
    * Stack và Heap: lớn => Nội dung vẫn ở RAM, nhưng page tables được lưu tham chiếu trong PCB.
    * Trạng thái I/O: Lưu file descriptors (fd table), sockets, signals vào PCB.
  * **Scheduler chọn process mới**: Dựa vào thuật toán (CFS: Tính vruntime).
  * **Load Context and Run**:
    * Ngược lại save. Page Tables: Load CR3 mới → MMU flush TLB (xóa cache ánh xạ cũ).
    * CPU fetch lệnh từ text segment mới và access memory.
    * ==> **Overhead Cao**: Flush TLB gây miss (CPU phải walk page tables lại, tốn ~100–1000 cycles).((TLB thường có 64–2048 entries. Sau flush, mỗi unique page access cần walk page table lại (~4 memory access), cho đến khi TLB "nóng" lại. Với process có working set lớn, đây là overhead đáng kể sau mỗi context switch.))

  * **Context switch với thread**:
    * Gần giống process nhưng save/load register ít hơn, không phải reload lại heap, fd, không cần flush TLB => nhanh hơn process x2–5, tuy nhiên vẫn flush cache nên cache locality bị phá vỡ.

#### "Everything is file" & tiến hóa I/O sync → async

* **Triết lý Unix/Linux**: mọi thực thể I/O (file thường, socket mạng, pipe/FIFO, device như `/dev/null` `/dev/sda` `/dev/tty`, `/proc` `/sys`, `eventfd` `signalfd` `timerfd`, kể cả `epoll` instance...) đều trừu tượng thành **file** → app dùng cùng bộ syscall `open/read/write/close/ioctl` cho mọi loại I/O.
  * Lợi: API thống nhất + composable (vd `cat a.txt | grep err > out.log` — pipe nối stdout↔stdin chỉ vì cả 2 đều "là file").
  * Kernel implement qua **VFS (Virtual File System)** — lớp polymorphism: mỗi loại file gắn 1 bảng hàm `struct file_operations` (`.read`, `.write`, `.poll`, `.mmap`,...). Syscall `read(fd, ...)` → VFS gọi `file->f_op->read(...)` → driver/filesystem cụ thể xử lý.((VFS là design pattern "interface" ở tầng kernel. ext4, btrfs, NFS, procfs, tmpfs đều implement cùng interface → user code không cần biết file nằm trên loại storage nào.))

* **File Descriptor (fd)**: số nguyên không âm app dùng để chỉ định tài nguyên I/O. Bản chất chỉ là **index** vào bảng fd của process trong kernel. Mặc định: `fd=0` stdin, `fd=1` stdout, `fd=2` stderr; từ 3 trở đi kernel cấp **số nhỏ nhất còn trống** khi `open()`/`socket()`/`pipe()`/`accept()`.

##### 3 tầng quản lý file trong kernel

* **Định nghĩa**: kernel quản lý file qua **3 tầng bảng nối tiếp**. App chỉ thấy 1 con số (fd), nhưng số đó đi qua 3 bảng mới đến dữ liệu thật. Mỗi tầng giải quyết 1 trách nhiệm khác nhau.

* **Tầng 1 — Bảng fd của process**: là mảng riêng từng process. Index = số fd. Mỗi ô = con trỏ tới 1 dòng ở Tầng 2 để cô lập từng process — fd=3 của process A và fd=3 của process B là 2 ô khác nhau. **Lưu**: con trỏ + cờ phụ theo fd (vd `FD_CLOEXEC` = tự đóng khi `exec()`).

* **Tầng 2 — Bảng lượt mở file (system-wide)**: 1 bảng chung cho toàn hệ thống. Mỗi lần `open()`/`socket()`/`pipe()` thành công → thêm **1 dòng mới** để nhiều process có thể cùng trỏ vào 1 dòng (qua `fork()` hoặc `dup()`) và **share offset**
  * **Lưu**:
    - **Vị trí đọc/ghi hiện tại** (offset) — đọc đến byte thứ bao nhiêu.
    - **Chế độ truy cập**: đọc/ghi/append/non-blocking.
    - **Ref count**: bao nhiêu fd đang trỏ vào dòng này. Về 0 thì kernel xóa dòng.

* **Tầng 3 — Bảng inode (1 file vật lý = 1 inode)**: metadata + định vị dữ liệu thật của file trên đĩa/thiết bị.
  * **Lưu**: size, permission, timestamp, type (regular/socket/pipe/device), danh sách disk block (file thường) hoặc driver functions (socket/device).

* **Vì sao tách 3 tầng?**
  * Nếu fd trỏ thẳng inode (Tầng 3) → mọi process cùng đọc 1 file dùng chung offset → người này đọc byte 100 thì người kia nhảy theo → loạn.
  * Nếu fd trỏ thẳng disk block → app phải biết file nằm block nào → mất isolation + không share được.
  * Tầng 2 ở giữa tách **trạng thái lượt mở** (offset, mode) khỏi **thực thể vật lý** (inode). Tầng 1 tách **không gian fd** theo process để cô lập.

##### Luồng thực tế 1: 2 cửa sổ `vim` cùng mở `/etc/hosts`

```
       vim-A                              vim-B
       fd table                           fd table
       [3] ──┐                            [3] ──┐
             ▼                                  ▼
   ┌────────────────────┐           ┌────────────────────┐
   │ Lượt mượn #71      │           │ Lượt mượn #88      │   ← Tầng 2
   │ f_pos = 0          │           │ f_pos = 1024       │
   │ chế độ = đọc+ghi   │           │ chế độ = chỉ đọc   │
   │ ref count = 1      │           │ ref count = 1      │
   └─────────┬──────────┘           └─────────┬──────────┘
             │                                │
             └───────────────┬────────────────┘
                             ▼
                  ┌──────────────────────┐
                  │ Sách: /etc/hosts     │   ← Tầng 3 (1 inode duy nhất)
                  │ size=512, perm=644   │
                  │ block list=[...]     │
                  └──────────────────────┘
```

* Vim-A scroll xuống → "f_pos" của **lượt #71** tăng.
* Vim-B đọc đầu file → "f_pos" của **lượt #88** vẫn 1024. **Không ảnh hưởng nhau** vì offset nằm ở Tầng 2, mỗi process 1 dòng riêng.
* Nhưng nếu Vim-A `:w` (ghi) → sách Tầng 3 đổi → Vim-B đọc tiếp sẽ thấy nội dung mới (vì cùng inode). Đây là lý do editor hiện cảnh báo "file changed on disk".

##### Luồng thực tế 2: `fork()` — chia sẻ vị trí ghi log

Shell mở file log với fd=3, rồi `fork()`:

```
Trước fork():                       Sau fork():
parent [3] ──┐                      parent [3] ──┐
             ▼                                   ▼
    ┌─────────────────┐                ┌─────────────────┐
    │ Lượt mượn #50   │                │ Lượt mượn #50   │  ← CÙNG 1 dòng
    │ vị trí = 200    │                │ vị trí = 200    │
    │ ref count = 1   │                │ ref count = 2   │  ← +1 vì child
    └─────────────────┘                └─────────────────┘
                                                ▲
                                       child [3]┘
```

* Parent ghi `"hello\n"` → vị trí 200 → 206.
* Child ghi tiếp `"world\n"` → vị trí 206 → 212 (**không đè 200→206**).
* ==> Đây là lý do `>>` append trong shell hoạt động đúng khi nhiều process cùng ghi 1 log: chúng share **vị trí ghi** ở Tầng 2.

So sánh với 2 lần `open()` riêng (vd 2 process độc lập): mỗi lần open tạo **dòng mới** ở Tầng 2 → vị trí độc lập → ghi đè lên nhau nếu không bật `O_APPEND`.

##### Luồng thực tế 3: pipe `cat a.txt | grep err`

* **Ý tưởng**: shell nối **stdout của `cat`** vào **stdin của `grep`** qua 1 buffer trong RAM. Hai process tưởng đang ghi/đọc file, thực ra đang ghi/đọc cùng 1 ống đệm.

* **Cơ chế**: `pipe()` tạo 2 đầu (đầu ghi + đầu đọc) chia sẻ 1 buffer. Shell `dup2` đầu ghi vào fd=1 của `cat`, đầu đọc vào fd=0 của `grep` → 2 process không cần biết về pipe, chỉ cần "ghi stdout" và "đọc stdin" như bình thường.

```
   cat                              grep
   stdout (fd=1) ──┐                stdin (fd=0) ──┐
                   ▼                                ▼
            ┌─────────────┐               ┌─────────────┐
            │ Đầu ghi     │               │ Đầu đọc     │   ← Tầng 2
            └──────┬──────┘               └──────┬──────┘
                   │                             │
                   └──────────► [ buffer RAM ] ◄─┘
                                (~64KB, không qua disk)
```

* **Khi pipe đầy**: `cat write()` block → kernel chờ `grep` đọc bớt → back-pressure tự động.

* **==>**: shell composability chỉ là **chuyển con trỏ ở Tầng 1** của 2 process trỏ vào 2 đầu của cùng 1 buffer Tầng 2. Không có file trên disk, không có socket, không có code riêng cho pipe trong `cat`/`grep` — vì *pipe cũng là file*.

##### Hệ quả

* **`fork()` xong `close()` trong child không làm cha mất fd**: chỉ giảm ref count ở Tầng 2 chứ không xóa dòng.
* **`dup()`/`dup2()`** = tạo fd mới (Tầng 1) trỏ **cùng** dòng (Tầng 2) → chia sẻ vị trí. Khác với `open()` lại cùng file → tạo dòng mới, vị trí riêng.
* **fd leak**: app quên `close()` → dòng Tầng 2 không free → cạn fd (mặc định `ulimit -n` ~1024–65536) hoặc cạn dòng toàn hệ thống (`/proc/sys/fs/file-max`).
* **Process A `fd=3` và Process B `fd=3` không xung đột** — vì Tầng 1 cô lập theo process, cùng số fd nhưng trỏ 2 dòng khác nhau (hoặc thậm chí cùng 1 dòng nếu kế thừa qua `fork`).

##### Tiến hóa Sync → Async: giấu I/O latency

* **Vấn đề gốc**: I/O chậm hơn CPU ~10⁶ lần (disk ms, network 10–100ms vs CPU ns). Trong lúc đợi I/O, CPU **rảnh** nhưng thread bị **khóa** → lãng phí. Mỗi thế hệ giải pháp = giảm thêm 1 lớp lãng phí: thread block → syscall → copy → context switch.

* **Giai đoạn 1 — Blocking I/O**: *1 connection = 1 thread*.
  * App gọi `read()` → thread ngủ đến khi có data => muốn phục vụ N conn → cần N thread. ((Mỗi thread ~8MB stack + chi phí scheduler → 10k conn = 80GB RAM + context switch storm. Không scale.C10K problem (Dan Kegel, 1999): bài toán phục vụ 10k conn đồng thời — chính là động lực sinh ra epoll/kqueue.))

* **Giai đoạn 2 — I/O multiplexing**: *1 thread quản N conn, kernel báo cái nào sẵn sàng*.
  * Mở `O_NONBLOCK` → `read()` trả `EAGAIN` ngay nếu chưa có data (không block). Nhưng nếu app tự loop hỏi từng fd → tốn CPU. Cần **kernel làm hộ việc theo dõi**.

  * **`select` / `poll`** (gọi 1 lần hỏi N fd):
    * App đưa **danh sách fd** vào kernel → kernel duyệt **từng cái** xem có ready không → trả về danh sách "ready".
    * 3 chi phí cố hữu:
      1. **Copy cả danh sách vào kernel mỗi lần gọi** (app ↔ kernel).
      2. **Quét O(n)** dù chỉ 1 fd ready.
      3. `select` còn giới hạn cứng `FD_SETSIZE=1024`; `poll` bỏ giới hạn nhưng 2 vấn đề kia vẫn còn.

  * **`epoll`** (Linux 2.6) / **`kqueue`** (BSD/macOS) — fix cả 3:
    * **Đăng ký 1 lần, dùng nhiều lần**: `epoll_ctl(ADD)` đưa fd vào 1 cấu trúc nội bộ kernel (Red-Black tree) → không copy lại danh sách mỗi gọi.
    * **Kernel chủ động báo**: khi data đến (vd packet ở NIC), driver gọi callback đẩy fd vào **ready list**. `epoll_wait` chỉ trả về list này → **O(fd ready)**, không O(tổng fd).
    * **2 chế độ trigger**:
      - **Level-triggered** (mặc định): còn data thì còn báo → an toàn, dễ code.
      - **Edge-triggered** (`EPOLLET`): chỉ báo *khi trạng thái đổi* → app phải đọc đến `EAGAIN` mới dừng; ít wakeup, dùng cho high-perf.
    * ==> Nginx, Node.js, Redis, Envoy đều dựa epoll.

  * **Vẫn chưa phải "true async"**: epoll báo "fd sẵn sàng" → app **vẫn phải tự gọi `read()`** để move data → vẫn syscall, vẫn copy kernel↔user. Mô hình này gọi là **readiness-based** (báo sẵn sàng — app tự lấy).

* **Giai đoạn 3 — True async (`io_uring`, Linux 5.1, 2019)**: *app đặt hàng, kernel làm xong, app nhặt kết quả*.
  * Đảo mô hình: thay "kernel báo sẵn sàng, app tự đọc" → **completion-based**: app submit op → kernel tự đọc/ghi → kernel báo kết quả khi xong.
  * Cơ chế: io_uring xây dựng 2 queue trong **bộ nhớ chia sẻ** giữa user và kernel (mmap):
    - **SQ (Submission Queue)** — app ghi op vào (read fd này, gửi buf kia,...).
    - **CQ (Completion Queue)** — kernel ghi kết quả ra.
  * Vì ring chung memory → app **không cần syscall** để đặt op/lấy kết quả; chỉ 1 syscall `io_uring_enter` để wake kernel khi có op mới — và có thể **skip cả nó** với `SQPOLL` (kernel thread tự poll SQ liên tục).
  * Tác dụng: link nhiều op (accept → recv → send chạy liền không cần wake user), registered buffers (DMA thẳng — zero-copy), unified cho cả disk + network + filesystem ops.
  * ==> Latency sub-microsecond; 5–10M IOPS so với ~1–2M của epoll+read.((Jens Axboe (LWN 2019): "io_uring is designed to provide an interface for the application to perform IO without ever needing to enter the kernel by way of syscalls in the fast path." Với SQPOLL, app gửi triệu op mà 0 syscall.))
  * Chi tiết network: xem mục **I/O Network → io_uring** bên dưới.

* **Tóm tắt**:
  * **Blocking**: app đợi → kernel làm → app nhận. *N conn → N thread.*
  * **`select`/`poll`**: app hỏi "có cái nào ready không?" → kernel quét hết → trả về list -> app tự đọc list đó. *O(n) mỗi lần.*
  * **`epoll`**: app đăng ký 1 lần → kernel **gọi lại app** khi có sự kiện. *O(ready)* -> app vẫn phải tự đọc
  * **`io_uring`**: app đặt op vào ring → kernel làm xong, ghi kết quả ra ring (shared memory - mmap). *0 syscall fast-path.*
* Mục đích: **xóa nhòa boundary user/kernel trong hot path** — chỉ giữ lại đúng phần kernel cần làm (đọc thiết bị, copy DMA), bỏ hết overhead trung gian.

#### Disk access (via file)

* **Khởi tạo yêu cầu**:
  * Ứng dụng gọi syscall: `open()`, `read()` → CPU nhận syscall qua interrupt chuyển sang kernel mode.
  * Kernel OS nhận syscall, kiểm tra permission: read/write/execute qua file system (ext4, NTFS).
  * Tìm metadata file (vị trí block trên disk) qua inode/MFT.
  * Kiểm tra page cache/buffer trong RAM: Nếu dữ liệu đã có (cache hit), OS copy trực tiếp từ cache sang buffer ứng dụng → trả về ngay (microsecond).
  * Nếu không, OS lập danh sách block → gửi lệnh I/O đến disk controller qua bus (SATA/PCIe/NVMe) → prefetching: sequential read để đoán trước nhu cầu.((NVMe trên PCIe 4.0 có latency ~20–100 µs và bandwidth ~7 GB/s. SATA SSD ~50–150 µs. HDD ~5–20 ms — chậm hơn NVMe ~100–1000x. Page cache rất quan trọng để che giấu latency này.))

* **Phối Hợp Với Disk Và Chuyển Dữ Liệu (I/O Phase)**:
  * **DMA (Direct Memory Access)**: Controller copy dữ liệu trực tiếp từ disk vào buffer OS trong RAM, không qua CPU.
  * Khi xong, disk controller gửi hardware interrupt (IRQ) đến CPU.
  * CPU chạy interrupt handler của OS: Copy data từ buffer OS sang buffer ứng dụng, cập nhật cache.

* **File System**: OS quản lý disk qua file system (FAT32, NTFS, ext4), biến disk thành "hệ thống file" dễ dùng.

* Cơ chế buffer: xem mục **Privilege levels → Cơ chế BUFFER** (kernel vs user buffers, zero-copy).

#### I/O Network (qua socket)

* **Khởi tạo yêu cầu**:
  * Ứng dụng gọi syscall: `socket()`, `connect()`/`accept()`, `recv()`/`read()` → CPU nhận syscall qua interrupt chuyển sang kernel mode.
  * Kernel OS nhận syscall, kiểm tra permission (UID, capabilities, netfilter/firewall rules, socket state).
  * Kiểm tra socket metadata (file descriptor table → struct sock).
  * Kiểm tra **socket receive buffer** trong kernel RAM:
    * **Blocking mode** (mặc định): Nếu chưa có data (recv buffer rỗng), process bị block (sleep trên wait_queue). Kernel sẽ wake-up khi data đến → trả về sau khi có data (có thể hàng chục ms nếu network chậm).
    * **Non-blocking mode** (`O_NONBLOCK` hoặc `fcntl`/`setsockopt`): Trả ngay lỗi `EAGAIN`/`EWOULDBLOCK` nếu chưa có data → app phải retry (busy-wait) hoặc kết hợp với multiplexing.
    * **Multiplexing để monitor nhiều socket**:
      * `select()`/`poll()`: O(n) → kém hiệu quả khi hàng nghìn socket.
      * `epoll` (Linux) hoặc **kqueue** (BSD/macOS/FreeBSD): O(1), chỉ wake khi có event (EVFILT_READ / EPOLLIN).((epoll dùng red-black tree để track registered fd + linked list để track ready events. Khi fd sẵn sàng, kernel thêm vào ready list → epoll_wait chỉ trả về fd đã sẵn sàng, không scan toàn bộ.))
        * App gọi `epoll_create`/`kqueue`, rồi `epoll_ctl`/`kevent` để đăng ký fd + event.
        * Sau đó `epoll_wait`/`kevent` block chờ event → tiết kiệm CPU.

* **Phối hợp với NIC và chuyển dữ liệu (I/O Phase)**:
  * NIC (Network Interface Card) nhận packet từ dây mạng/WiFi → **DMA** copy trực tiếp vào kernel **RX ring buffers** (không qua CPU, giảm interrupt).
  * NIC gửi hardware interrupt (IRQ) hoặc dùng **NAPI** (New API – polling + interrupt mitigation để tránh interrupt storm khi traffic cao).((NAPI chuyển từ interrupt-per-packet sang polling khi traffic cao: sau interrupt đầu tiên, driver poll tiếp thay vì raise thêm interrupt → tránh "interrupt storm" ở 10Gbps/100Gbps.))
  * CPU chạy interrupt handler:
    * Network stack xử lý packet: driver → `netif_receive_skb` → IP layer → TCP layer (checksum, reassembly, ACK, flow control).
    * Data được đẩy vào **socket recv queue** (danh sách `sk_buff` của struct sock).
    * Nếu có process đang block chờ → kernel wake-up ngay (scheduler).
    * Kernel copy data từ kernel socket buffer sang buffer ứng dụng (hoặc zero-copy nếu dùng `splice`/`sendfile`/`mmap`).

* **Cơ chế BUFFER**:
  * **Socket buffers** (tunable):
    - Receive buffer: `SO_RCVBUF` / sysctl `net.core.rmem_default` và `tcp_rmem` (mặc định vài trăm KB, max 6–8MB).
    - Send buffer: `SO_SNDBUF` / `tcp_wmem`.
    - Buffer đầy → TCP flow control tự động (window scaling, backpressure).
  * **Kernel internal buffers**:
    - `sk_buff` (socket buffer): linked list của các fragment packet, hỗ trợ scatter-gather, zero-copy (page reference counting).
    - RX/TX rings của driver (vd ixgbe, e1000, virtio) – DMA rings.
  * **User-space buffers**: buffer của app khi gọi `recv(buf, len)`.
  * **Zero-copy techniques**: `sendfile()`, `splice()`, `mmap()` + `MSG_ZEROCOPY` để tránh copy kernel ↔ user.

* **Cơ chế tiên tiến: io_uring** (Linux 5.1+, hỗ trợ network từ kernel 5.6+):((io_uring được viết bởi Jens Axboe (cũng là tác giả của blk-mq scheduler). Mục tiêu ban đầu là async disk I/O nhưng nhanh chóng mở rộng ra network và các syscall khác. Benchmark cho thấy io_uring có thể đạt 5–10M IOPS so với ~1–2M với epoll+read truyền thống.))
  * Thay vì syscall blocking/non-blocking từng lần, dùng **ring buffer chung** (Submission Queue + Completion Queue) trong shared memory.
  * Các bước hệ thống:
    1. App tạo `io_uring` fd (`io_uring_setup`).
    2. Đăng ký buffer/file (`io_uring_register`) → zero-copy hoàn toàn (không copy kernel ↔ user nữa).
    3. Submit SQE (Submission Queue Entry): `IORING_OP_RECV`, `IORING_OP_SEND`, `IORING_OP_ACCEPT`, thậm chí link nhiều op (vd accept → recv → send).
    4. Kernel xử lý async (có thể dùng worker thread hoặc trực tiếp trong softirq).
    5. Hoàn thành → viết vào Completion Queue (CQ), app có thể poll CQ hoặc dùng `io_uring_wait_cqe`.
  * Ưu điểm:
    - Giảm syscall từ hàng triệu xuống chỉ vài chục lần/giây.
    - Batch processing (submit nhiều op cùng lúc).
    - Hỗ trợ registered buffers → latency cực thấp (sub-microsecond khi cache hit).
    - Dùng được cả cho disk + network trong cùng một ring → unified async I/O.
  * Nhược điểm: phức tạp hơn, cần kernel mới, memory pinning.

---

### Privilege levels

* **Mục đích**: CPU hỗ trợ nhiều mức đặc quyền (privilege levels) để bảo vệ hệ thống: ứng dụng không thể trực tiếp điều khiển phần cứng hoặc đọc/ghi nhớ của process khác.

* **Các mức (x86/x64)**:
  * **Ring 0 (kernel mode)**: OS kernel chạy ở đây — toàn quyền: I/O, MMU, interrupt, DMA, đọc/ghi mọi vùng nhớ. Chỉ mã được tin cậy (kernel) mới vào Ring 0.
  * **Ring 3 (user mode)**: Ứng dụng chạy ở đây — bị giới hạn: không gọi lệnh đặc quyền (in/out, đổi CR3, tắt interrupt…), chỉ truy cập vùng nhớ được MMU cho phép (address space của process).
  * Ring 1/2 (ít dùng trên Linux/Windows): thường không dùng; hypervisor có thể tận dụng.((Trên x86 có 4 ring (0–3), nhưng Linux và Windows chỉ dùng Ring 0 và Ring 3. Ring 1/2 bị bỏ qua vì tạo thêm phức tạp mà ít lợi ích — OS chọn model "kernel vs user" đơn giản hơn.))

* **Tách biệt không gian nhớ**:
  * **User space**: mỗi process có virtual address space riêng (page tables do kernel thiết lập); process chỉ "thấy" vùng nhớ của mình.
  * **Kernel space**: nửa cao của virtual space (vd: `0xffff800000000000` trở lên trên x64) hoặc vùng riêng; chỉ khi chạy ở Ring 0 mới map và truy cập được. Kernel có thể map cùng physical page vào cả kernel VA và user VA (để trả dữ liệu cho user) nên địa chỉ ảo sau khi ánh xạ cũng giữ nguyên trên từng process.

* **Chuyển mode**: User → Kernel kiểm soát qua:
  * **System call (syscall)**: instruction đặc biệt (vd: `syscall` x86, `svc` ARM) → CPU chuyển Ring 3 → Ring 0, nhảy tới kernel entry (vd: `entry_SYSCALL_64`), kernel xử lý theo syscall number (read, write, open…).
  * **Interrupt/exception**: hardware interrupt (IRQ), page fault, trap → CPU lưu context, nhảy vào kernel handler.
  * **Return**: kernel dùng instruction đặc quyền (vd: `sysret`) để quay lại Ring 3 tại địa chỉ user đã lưu.

#### Copy dữ liệu từ kernel sang user-space (và chiều ngược lại)

* **Đường đi điển hình (read từ file / socket)**:
  1. User gọi `read(fd, user_buf, len)` → syscall → CPU vào kernel.
  2. Kernel đọc dữ liệu vào **buffer nội bộ** (page cache, socket buffer, DMA buffer…) nằm trong **kernel space**.
  3. Kernel **copy** từ buffer kernel đó sang **user_buf** (địa chỉ user space). Việc copy này bắt buộc vì:
     * User buffer nằm ở virtual address của process; kernel không "trả trực tiếp" vào đó mà phải ghi qua mapping hiện tại của process.
     * Kernel phải kiểm tra con trỏ user (không vượt quá vùng map, không trỏ vào kernel…), rồi copy từng byte/page từ kernel → user (vd: `copy_to_user()`).
  4. Syscall return → CPU về Ring 3, ứng dụng đọc dữ liệu trong `user_buf`.

* **Chiều ghi (write/send)**:
  * User gọi `write(fd, user_buf, len)` → kernel nhận syscall.
  * Kernel **copy từ user_buf vào buffer kernel** (`copy_from_user()`) — vì kernel không thể "đọc trực tiếp" user space một cách an toàn khi xử lý bất đồng bộ (DMA, I/O sau khi đã return).
  * Sau đó kernel đẩy dữ liệu từ buffer kernel xuống device (disk, NIC).

* **==>**: Mọi I/O qua kernel đều đi qua **ít nhất một lần copy** giữa buffer kernel và buffer user (kernel→user khi read, user→kernel khi write) — đây là "boundary copy" tại privilege boundary.

* **Vấn đề**:
  * **Context switch user ↔ kernel** (mỗi syscall): Lưu/khôi phục thanh ghi, đổi stack (user stack ↔ kernel stack), có thể invalidate một phần TLB/cache. Cỡ vài trăm chu kỳ CPU mỗi lần (vd ~300–500 cycles);((Meltdown/Spectre (2018) làm overhead syscall tăng lên đáng kể vì các mitigation như KPTI (Kernel Page-Table Isolation) yêu cầu flush TLB mỗi khi user↔kernel, từ ~100 cycles lên ~1000+ cycles trên các hệ thống không có PCID.)) gọi syscall nhiều lần (vd mỗi packet nhỏ) thì tổng overhead rất lớn.
  * **Copy dữ liệu**: Copy từng byte/block từ kernel buffer → user buffer (hoặc ngược lại): tốn băng thông bộ nhớ (memory bandwidth), cache pollution, thêm latency.
  * **Số lần copy trên đường I/O** (ví dụ read file rồi gửi network):
    * **Truyền thống**: Disk → (DMA) → kernel page cache → (copy) → user buffer → (copy) → kernel socket buffer → (DMA) → NIC → **4 lần đụng dữ liệu** (2 lần copy qua CPU giữa kernel và user).

* **Nguyên lí thiết kế**:
  * **Cách ly (isolation)**: Ứng dụng không truy cập trực tiếp phần cứng và không gian nhớ kernel → an toàn, ổn định.
  * **Single point of control**: Mọi I/O qua kernel → kernel kiểm tra quyền (file permission, socket, firewall), audit, quota.
  * **Copy là hệ quả của cách ly**: Để kernel "trả" dữ liệu cho user, kernel phải ghi vào vùng nhớ user; cách đơn giản và an toàn là copy vào buffer user đã kiểm tra — dẫn tới overhead copy.

#### Cơ chế tối ưu: bypass và zero-copy

* **Zero-copy** = giảm hoặc loại bỏ **số lần copy** dữ liệu qua CPU giữa kernel và user (không phải "không copy byte nào" tuyệt đối, mà giảm copy trên đường I/O).

* **Các kỹ thuật chính**:

  1. **sendfile() (file → socket)**
     * Syscall: kernel đọc từ file (page cache) và gửi trực tiếp vào socket buffer, **không copy qua user buffer**.
     * Luồng: Disk → DMA → page cache → kernel copy trực tiếp page cache → socket buffer → DMA → NIC.
     * Bỏ được: user buffer và 2 lần copy qua user (read + write).
     * Dùng nhiều cho web server gửi file tĩnh (vd nginx).

  2. **splice() / tee()**
     * Chuyển dữ liệu giữa hai fd (vd pipe ↔ socket, file ↔ socket) **trong kernel**, không qua user.
     * `splice(fd_in, off, fd_out, off, len, flags)`: kernel move/copy dữ liệu giữa buffer nội bộ của hai fd.
     * Bỏ được copy kernel → user → kernel.

  3. **mmap() file**
     * User map file vào virtual address space (`mmap(fd, ...)`).
     * Kernel map **cùng physical page** (page cache) vào cả kernel và user; user đọc/ghi qua con trỏ → **không copy** (chỉ fault vào kernel khi page chưa có, kernel fill từ disk).
     * Khi gửi qua network vẫn có thể kết hợp sendfile từ vùng đã map hoặc copy trong user (tùy cách dùng).

  4. **MSG_ZEROCOPY (socket)**
     * Gửi dữ liệu từ user buffer qua socket mà kernel **không copy** vào buffer kernel: kernel đánh dấu vùng user, NIC DMA đọc trực tiếp từ user buffer (hoặc kernel "hold" reference và gửi sau).
     * Giảm copy user → kernel; cần kernel và NIC driver hỗ trợ, và cơ chế báo completion (vd qua completion queue) vì kernel không còn "sở hữu" bản copy.

  5. **io_uring + registered buffers**
     * App đăng ký buffer user với kernel (`IORING_REGISTER_BUFFERS`).
     * Kernel map pin và dùng trực tiếp buffer đó cho I/O: read từ disk/network ghi thẳng vào user buffer, write đọc thẳng từ user buffer → **không copy kernel ↔ user**.
     * Kết hợp với submission/completion queue trong shared memory → giảm mạnh số syscall và copy → latency thấp, throughput cao.

  6. **DMA trực tiếp vào user buffer (UIO / DPDK-style)**
     * Driver đặc biệt (hoặc user-space driver) map vùng nhớ user cho device DMA.
     * Bypass stack kernel I/O "chuẩn" → cực nhanh nhưng mất tính tổng quát, bảo mật và chia sẻ tài nguyên (thường dùng trong môi trường tin cậy, high-frequency trading, packet processing).

#### Cơ chế BUFFER (tóm tắt trong bối cảnh privilege)

* **Kernel buffers**: Page cache (file), socket send/recv buffer, DMA buffer — đều nằm trong kernel space; I/O device (disk, NIC) ghi/đọc qua DMA vào đây.
* **User buffers**: Vùng nhớ do ứng dụng cấp (`malloc`, stack array…) — nằm trong user space; kernel chỉ truy cập khi xử lý syscall và phải dùng `copy_to_user`/`copy_from_user` (hoặc mapping đặc biệt).
* **Zero-copy** = giảm số lần dữ liệu đi qua hai vùng này (dùng chung page qua mmap, hoặc kernel đọc/ghi trực tiếp user buffer đã đăng ký như io_uring / MSG_ZEROCOPY).

#### Ví dụ thực tế (server, AI, streaming, …)

* **Web / API server (Nginx, Node, Go)**
  * Mỗi HTTP request: đọc body từ socket → kernel copy vào user buffer; xử lý; gửi response → copy từ user buffer vào kernel socket buffer.
  * QPS cao (vd 100k req/s), mỗi request vài KB → hàng trăm MB/s copy qua boundary + hàng trăm nghìn syscall → CPU và memory bandwidth trở thành bottleneck.
  * **Giải pháp thực tế**: `sendfile()` khi gửi file tĩnh; io_uring + batch để giảm syscall và có thể dùng registered buffer (zero-copy).

* **File server / CDN / object storage**
  * Gửi file lớn (ảnh, video, tarball): đường truyền thống = đọc file (DMA → page cache → copy → user) + write socket (copy user → kernel socket → DMA → NIC) → **4 lần đụng dữ liệu**, 2 lần copy qua CPU.
  * 10 Gbps link có thể bị giới hạn bởi copy chứ không phải disk hay NIC.
  * **Thực tế**: Nginx, Ceph, MinIO dùng `sendfile()` / `splice()` để gửi file từ page cache thẳng ra socket, bỏ copy qua user.

* **AI/ML inference (serving model, batch inference)**
  * Load trọng số model từ disk (hàng GB): read() truyền thống = nhiều lần copy kernel → user → cache pollution, chậm khi model lớn.
  * Nhận batch input từ network (gRPC, HTTP): mỗi request copy kernel → user; gửi response lớn (embedding, logits) → copy user → kernel.
  * **Thực tế**: `mmap()` file model để kernel map trực tiếp page cache vào user space (vd PyTorch, TensorFlow); server dùng io_uring hoặc zero-copy socket để giảm copy khi nhận/gửi dữ liệu.

* **Streaming / ingest video**
  * Ingest: NIC nhận packet → kernel buffer → copy sang user → decode → copy sang user buffer khác → encode → copy vào kernel → gửi ra. Nhiều lần copy trên đường "nhận → xử lý → gửi".
  * **Hướng tối ưu**: Pipeline dùng `splice()`/`sendfile()` giữa socket và file/pipe; GPU có thể dùng DMA từ/đến user buffer đã pin (giảm copy CPU).

---

### Multithread (shared memory)

* **Thread**: "luồng" thực thi bên trong process.
  * Nhiều thread dùng chung address space của process.
  * Mỗi thread có program counter (PC), register context, stack riêng.
  * Chia sẻ: code, heap, global variables, file descriptors.

* **Step**:
  * Thread creation: tạo TCB (Thread Control Block) quản lý: stack pointer, register state, thread ID, trạng thái.
  * Scheduling: xếp các thread vào queue CPU → core nào rảnh sẽ pick thread đó.
  * Mapping vào CPU:
    * multi-core CPU: chạy nhiều thread song song thực sự (true parallelism).
    * single-core CPU: dùng time slicing → các thread thay phiên chạy, ảo tưởng là "song song" (time-sharing).
  * Context switch:
    * Giữa 2 thread cùng process: OS không cần đổi page table (cùng address space) → nhẹ hơn switch process.
    * Chỉ cần save/restore register, stack pointer.

* **Problems**: Race condition when synchronize => Locking → chậm/lock contention/deadlock.

* **Giải pháp**:

  * **Mutex/Lock** — tránh race condition:

    ```c
    std::mutex mtx;
    void update_counter() {
        std::lock_guard<std::mutex> lock(mtx);  // tự động unlock khi ra khỏi scope
        counter++;
    }
    ```

    * Một thời điểm chỉ 1 thread giữ mutex (quyền truy cập vùng tài nguyên).
    * => Lock contention, deadlock.
      * Giữ vùng khóa ngắn.
      * Không gọi I/O trong vùng khóa.
      * Nếu cần ghép nhiều khóa, thống nhất thứ tự để tránh deadlock.

  * **Semaphore**: bản chất là mutex với cho phép giới hạn nhiều thread hơn là 1.((Phân biệt mutex vs semaphore: mutex có ownership (chỉ thread lock mới unlock được), semaphore không có ownership (thread A có thể sem_post để giải phóng thread B đang sem_wait). Dùng sai ownership gây deadlock.))
    * Không nên dùng cùng sửa một biến chung trong task, khi đó phải trở về mutex.
    * Chỉ dùng khi tài nguyên là nhiều bản sao độc lập: Connection pool có 5 kết nối, 3 ổ cứng để ghi log, ...
    * Hai thao tác chính:
      * `wait()` hoặc `P()` hoặc `sem_wait()` → giảm giá trị, chặn nếu = 0.
      * `signal()` hoặc `V()` hoặc `sem_post()` → tăng giá trị, đánh thức thread chờ.

    ```c
    #include <iostream>
    #include <thread>
    #include <semaphore.h>
    #include <chrono>

    sem_t sem;

    void task(int id) {
        sem_wait(&sem); // chờ nếu semaphore = 0
        std::cout << "Thread " << id << " is running\n";
        std::this_thread::sleep_for(std::chrono::seconds(1));
        std::cout << "Thread " << id << " is done\n";
        sem_post(&sem); // tăng semaphore
    }

    int main() {
        sem_init(&sem, 0, 2); // tối đa 2 thread chạy đồng thời
        std::thread t1(task, 1);
        std::thread t2(task, 2);
        std::thread t3(task, 3);
        t1.join(); t2.join(); t3.join();
        sem_destroy(&sem);
    }
    ```

  * **Condition Variable** — event driven:
    * Mutex không giải quyết được việc chờ điều kiện (busy waiting: liên tục kiểm tra điều kiện → tốn CPU).
    * Cơ chế đồng bộ hóa giúp thread chờ một điều kiện xảy ra mà không tiêu tốn CPU.
    * Thay vì phải liên tục hỏi "Có khách chưa?" => Dùng Chuông rung → nhân viên biết có việc → chạy ra phục vụ.
      * Consumer gọi `cv.wait()` → ngủ nếu hàng đợi rỗng.
      * Producer thêm dữ liệu → gọi `notify_one()` → đánh thức consumer.
      * Consumer thức dậy → kiểm tra điều kiện → xử lý dữ liệu.
      * Khi producer xong → đặt `done = true` → báo hiệu lần cuối.

    ```c
    #include <iostream>
    #include <thread>
    #include <mutex>
    #include <condition_variable>
    #include <queue>

    std::mutex mtx;
    std::condition_variable cv;
    std::queue<int> data_queue;
    bool done = false;

    void producer() {
        for (int i = 1; i <= 5; ++i) {
            std::this_thread::sleep_for(std::chrono::milliseconds(500));
            {
                std::lock_guard<std::mutex> lock(mtx);
                data_queue.push(i);
                std::cout << "[Producer] Pushed: " << i << std::endl;
            }
            cv.notify_one();
        }
        {
            std::lock_guard<std::mutex> lock(mtx);
            done = true;
        }
        cv.notify_one();
    }

    void consumer() {
        while (true) {
            std::unique_lock<std::mutex> lock(mtx);
            cv.wait(lock, [] { return !data_queue.empty() || done; });
            while (!data_queue.empty()) {
                int val = data_queue.front();
                data_queue.pop();
                std::cout << "    [Consumer] Got: " << val << std::endl;
            }
            if (done) break;
        }
    }
    ```

  * **Atomic**:
    * Giải pháp non-blocking, nhanh hơn mutex (do thread bị chặn sẽ rơi vào trạng thái ngủ context switch sang thread) và chỉ dùng cho logic đơn giản (`cnt++`, operator).
    * Các logic này thường triển khai CPU-level instructions: `CMPXCHG`, `LOCK XADD`, `LL/SC`, … => CPU đảm bảo là nguyên tử, không cần gọi OS, retry khi thất bại (lock-free).

    ```c
    #include <iostream>
    #include <atomic>
    #include <thread>

    std::atomic<int> x(0);

    void safe_increment() {
        int expected;
        int desired;
        do {
            expected = x.load();         // đọc giá trị hiện tại
            desired = expected + 1;      // tính giá trị mới
        } while (!x.compare_exchange_weak(expected, desired)); // nếu thất bại → retry
        std::cout << "Incremented to: " << desired << "\n";
    }

    int main() {
        std::thread t1(safe_increment);
        std::thread t2(safe_increment);
        t1.join();
        t2.join();
        std::cout << "Final value: " << x.load() << "\n";
    }
    ```

  * **Lock-Free Queue**:
    * Hàng đợi nhiều thread có thể push/pop (dùng atomic operations: compare-and-swap (CAS)) mà không cần mutex, có xung đột → retry → không chặn luồng.
    * Khó implement đúng, khó khi logic phức tạp.
    * Dùng nhiều trong: Thread pool, Message passing giữa thread → HFT, Linux kernel, Game engine,...
    * RabbitMQ dùng Blocking queue, semaphore → Reliable/routing. Kafka: Lock-free log, atomic offset → High-throughput.

  * **RCU – Read-Copy-Update**:
    * Cho phép nhiều thread đọc dữ liệu mà không cần khóa.
    * Khi cần cập nhật → tạo bản sao → cập nhật bản sao → thay thế bản gốc → giải phóng bản cũ sau khi không còn ai đọc.((Grace period trong RCU là khoảng thời gian đảm bảo tất cả reader đang dùng bản cũ đã xong. Trong Linux kernel, grace period dùng cơ chế "quiescent state" — mỗi CPU phải qua ít nhất 1 context switch để đảm bảo không còn đọc bản cũ.))
    * ==> Đọc cực nhanh, không bị chặn.
    * ==> Ghi phức tạp: phải copy, cập nhật, chờ grace period để xóa.
    * Dùng trong Databases, High-performance caches.

    ```c
    #include <iostream>
    #include <thread>
    #include <atomic>
    #include <chrono>

    struct Config {
        int version;
        std::string name;
    };
    std::atomic<Config*> global_config(new Config{1, "Initial"});

    void reader(int id) {
        for (int i = 0; i < 3; ++i) {
            Config* cfg = global_config.load(); // đọc không khóa
            std::cout << "[Reader " << id << "] Version: " << cfg->version << ", Name: " << cfg->name << "\n";
            std::this_thread::sleep_for(std::chrono::milliseconds(200));
        }
    }

    void writer() {
        std::this_thread::sleep_for(std::chrono::milliseconds(500));
        Config* new_cfg = new Config{2, "Updated"};
        Config* old_cfg = global_config.exchange(new_cfg); // cập nhật cấu hình
        std::cout << "[Writer] Updated config\n";
        std::this_thread::sleep_for(std::chrono::milliseconds(500)); // giả lập grace period
        delete old_cfg; // xóa sau khi reader đã xong
    }

    int main() {
        std::thread r1(reader, 1);
        std::thread r2(reader, 2);
        std::thread w(writer);
        r1.join(); r2.join(); w.join();
    }
    ```

### Caching

* Một số thông số:
  * **Memory Bandwidth 25.6 GB/s** của CPU: Trong 1s peak, CPU load được 25.6 GB dữ liệu từ RAM vào cache/registers để tính toán. Nhưng thường chỉ đạt 70–90% vì có overhead, cache miss,...
  * Với RAM có công thức: Bandwidth = Data rate (MT/s) × Bus width (bytes).((DDR3-1600: 1600 MT/s × 8 bytes = 12.8 GB/s mỗi channel. Dual-channel → 12.8 × 2 = 25.6 GB/s. DDR5 single-channel đã đạt ~50 GB/s nhờ tăng data rate và bus width.)) Ví dụ DDR3-1600 dual-channel: 25.6 GB/s tối đa với CPU.
  * Với CPU 4 GHz: 1 cycle = 0.25 ns; 1 core hiện đại có thể thực hiện 32–64 FLOP mỗi cycle nhờ pipeline + superscalar + SIMD/AVX-512.((Tại 4 GHz với AVX-512: 4 GHz × 16 FP32 × 2 (FMA) = 128 GFLOPS/s/core. Đây là lý do GPU với hàng nghìn core nhỏ có thể đạt TFLOPS cho AI workloads.)) => ~128–256 GFLOPS/s cho 1 core.
  * **Memory bound**:
    * **Latency-bound**: Khi random access: pointer chasing, linked list, tree traversal, database index lookup. CPU ngồi idle/wait hầu hết thời gian (stall), dù bandwidth còn dư. Tối ưu: tăng cache hit (sequential, cache-friendly: locality, prefetch), dùng hash table thay tree, flatten data,...
    * **Bandwidth-bound** (phổ biến ở workload lớn, sequential): Khi đọc/ghi liên tục lớn (streaming): matrix multiply, video processing, ML inference, copy large array, parse file lớn. CPU cần dữ liệu nhanh liên tục → nếu vượt quá bandwidth thì dù latency thấp cũng bị nghẽn. Tối ưu: tăng arithmetic intensity (Roofline model), tiling, vectorization để tận dụng bandwidth hiệu quả hơn.

* **Tại sao phải có cache**:
  * **Memory Wall**: CPU tốc độ tăng rất nhanh (GHz, nhiều IPC), trong khi DRAM cải thiện chậm → độ trễ truy cập RAM (vài chục–trăm ns, hàng trăm chu kỳ CPU) trở thành "nút cổ chai" → CPU ngồi chờ dữ liệu hầu hết thời gian.
  * Nếu mỗi lần truy cập dữ liệu đều phải chờ RAM → CPU phần lớn thời gian ngồi đợi, không compute được gì (Amdahl: hệ thống bị giới hạn bởi phần chậm nhất).
  * Moore's Law không còn đúng như xưa: Clock speed CPU dừng tăng từ năm 2005 vì nhiệt/lượng điện. Herb Sutter (Microsoft) năm 2005 đã tuyên bố ["The Free Lunch Is Over"](http://www.gotw.ca/publications/concurrency-ddj.htm)((Bài viết của Herb Sutter năm 2005 dự báo chính xác: clock speed đã dừng ở ~3–4 GHz từ đó đến nay. Thay vào đó, CPU tăng số core (multi-core), và cải thiện IPC. Lập trình viên không còn nhận "free speedup" từ CPU nhanh hơn mà phải viết code parallel/cache-friendly.)) — không còn tăng tốc miễn phí từ hardware nữa, phải tối ưu memory + concurrency.
  * **Ý tưởng**: đưa dữ liệu "hay dùng" lên các tầng bộ nhớ nhỏ hơn, gần CPU hơn, cực nhanh nhưng dung lượng ít → **cache hierarchy**.

* **Cache hierarchy** (đa tầng):
  * Tầng điển hình:
    * Register (vài chục cái / core) → truy cập ~1 chu kỳ.
    * L1 cache: tách `L1i` (instruction) và `L1d` (data), dung lượng nhỏ (32–64KB / core), latency ~3–5 cycles, rất nhanh nhưng ít.
    * L2 cache: lớn hơn L1 (100–512KB / core), latency lớn hơn (~10–15 cycles).
    * L3 cache (LLC): chia sẻ giữa nhiều core, vài MB–chục MB, latency vài chục cycles.
    * DRAM: vài GB–trăm GB, latency hàng trăm cycles.
  * Đa số CPU dùng **set-associative cache**:((N-way set-associative là trade-off giữa direct-mapped (nhanh, conflict miss nhiều) và fully-associative (chậm, ít conflict miss). L1 thường 4–8 way, L3 thường 16–32 way.))
    * Địa chỉ memory được chia thành: `tag | index(set) | offset(trong cache line)`.
    * Mỗi "set" chứa N line (N-way associativity: 2-way, 4-way, 8-way, …).
    * Khi truy cập: dùng index chọn set → so sánh nhiều tag song song trong set → nếu trùng = cache hit, nếu không = miss → phải nạp từ tầng thấp hơn.

![CPU Cache hierarchy](/public/assets/cpu-cache-hierarchy.png)

* **Cache line & locality**:
  * **Cache line**: đơn vị tải/ghi giữa cache và RAM → thường 64 bytes.
    * Khi miss, CPU không chỉ lấy đúng 1 biến mà lấy nguyên 1 line chứa biến đó.
    * Mọi biến nằm chung một line "sống – chết" cùng nhau: cùng được nạp, cùng bị đẩy ra.
  * **Temporal locality** (địa phương thời gian): Nếu một dữ liệu được truy cập, khả năng cao sẽ được dùng lại trong tương lai gần. Ví dụ: biến loop counter, cấu trúc dữ liệu được truy cập lặp đi lặp lại.
  * **Spatial locality** (địa phương không gian): Nếu truy cập địa chỉ X, khả năng cao sẽ truy cập các địa chỉ gần X (X+4, X+8, …). Ví dụ: duyệt mảng tuyến tính `a[i]` với `i++` → các phần tử liền nhau nằm trong cùng vài cache line → 1 miss dùng được cho nhiều lần truy cập.
  * Thiết kế thuật toán + cấu trúc dữ liệu sao cho: làm việc trên **working set nhỏ**, nằm gọn trong cache (theo từng phase); truy cập dữ liệu **tuần tự, tuyến tính** thay vì random.

* **Cache coherence (đa core) & false sharing**:
  * Vấn đề: mỗi core có L1/L2 riêng, nhưng cùng chia sẻ bộ nhớ chung → cùng một địa chỉ có thể tồn tại nhiều bản copy trong các cache.
    * Core A ghi biến X (cache line chứa X trên core A cập nhật).
    * Core B vẫn có line cũ trong cache, nếu đọc X sẽ thấy giá trị cũ → sai logic.
  * Giải pháp phần cứng: **cache-coherence protocol** (MESI, MOESI, …):((MESI: Modified (chỉ cache này có, đã ghi), Exclusive (chỉ cache này có, chưa ghi), Shared (nhiều cache có, giống nhau), Invalid (đã bị invalidate). Khi 1 core ghi vào Shared line → gửi "invalidate" broadcast → core khác phải đánh dấu Invalid → lần đọc tiếp theo sẽ fetch từ core đã ghi.))
    * Mỗi cache line có trạng thái: Modified, Exclusive, Shared, Invalid.
    * Khi 1 core ghi vào 1 line, nó phải thông báo (invalidate / update) cho các cache khác trên bus → đảm bảo chỉ có 1 bản "viết" hợp lệ, các cache khác không dùng dữ liệu cũ.
  * **False sharing**:
    * Nhiều biến độc lập (không liên quan logic), nhưng lại nằm chung **một cache line**.
    * Ví dụ: `counterA` và `counterB` trong struct, mỗi thread chỉ ghi một biến riêng của nó → về logic là "không chia sẻ", nhưng về phần cứng lại chia sẻ cùng 1 line.
    * Khi thread 1 ghi `counterA`, cache line bị đánh dấu Modified ở core 1, line tương ứng ở core 2 bị invalidate; thread 2 ghi `counterB` lại làm ngược lại.
    * Kết quả: 2 core liên tục bắn invalidation qua lại → CPU tốn thời gian đồng bộ cache, performance tụt thảm.((False sharing có thể làm chậm code multi-thread xuống thậm chí chậm hơn single-thread. Benchmark thực tế: 2 thread cùng ghi biến liền nhau → throughput thấp hơn 10x so với 2 biến cách nhau 64 byte.))
  * Cách tránh false sharing:
    * **Padding**: chèn thêm field "đệm" để các biến thường được các thread khác nhau ghi nằm trên **các cache line khác nhau**.
      * Ví dụ: struct có `counter` dùng cho mỗi thread → thêm `char pad[64]` hoặc dùng `alignas(64)` để mỗi counter cách nhau ít nhất 1 line.
    * Tách dữ liệu: thay vì 1 struct có nhiều field hot (cập nhật liên tục) dùng bởi nhiều thread, tách thành nhiều struct/array khác nhau để mỗi thread làm việc trên vùng riêng của nó.
    * Đọc nhiều, ghi ít → không sao; vấn đề nặng là **ghi** liên tục trên cùng cache line bởi nhiều core.

* **Một số kỹ thuật tối ưu layout memory dựa vào caching**:

  * **Struct padding & alignment**:
    * CPU thường yêu cầu dữ liệu align theo kích thước (4, 8, 16 bytes). Compiler sẽ tự chèn padding để struct thỏa alignment.
    * Sắp xếp field từ lớn → nhỏ giúp giảm padding thừa, giảm footprint trong cache.
    * Phân tách "hot data" (truy cập nhiều) và "cold data" (ít dùng) ra các struct khác nhau → hot data chiếm ít cache line hơn, tăng hit rate.
    * Cẩn thận với **false sharing trong struct**: nếu nhiều thread ghi các field khác nhau nhưng chung 1 struct → khả năng cao nằm chung 1 cache line. Kỹ thuật: `alignas(64)` hoặc padding thủ công.
    * Kỹ thuật **hot/cold splitting**: thay vì 1 struct to tổ hợp đủ thứ, tách thành `FooHot` (field hay truy cập) và `FooCold` (log, debug info, metadata). Lợi ích: khi duyệt mảng `FooHot[]`, cache chỉ phải mang theo dữ liệu thực sự cần.

  * **AoS (Array of Structs) vs SoA (Struct of Arrays)**:
    * **AoS**: `struct Particle { float x,y,z,vx,vy,vz; }; Particle p[N];` — mỗi phần tử là một struct đầy đủ; hợp lý khi mọi lần xử lý cần toàn bộ struct.
    * **SoA**: `struct Particles { float x[N], y[N], z[N], vx[N], vy[N], vz[N]; };` — các giá trị `x` của mọi phần tử nằm liên tiếp → cực kỳ có lợi cho vectorization (SIMD) và cache.((SIMD (AVX2/AVX-512) xử lý 8–16 float cùng lúc. SoA layout giúp tải 8 giá trị x[0..7] liên tiếp vào 1 SIMD register trong 1 instruction — không thể làm điều này với AoS vì x[0], x[1] cách nhau sizeof(Particle) = 24 bytes.)) Hợp lý khi mỗi phase chỉ xử lý 1 vài field.
    * Biến thể **AoSoA** (Array-of-Structs-of-Arrays) cho HPC: nhóm dữ liệu thành block nhỏ (8–16 phần tử) vừa với register hoặc cache line.

  * **Allocation & container**:
    * Ưu tiên container **liên tiếp trong bộ nhớ**: `std::vector`, `std::array`, slice → truy cập tuyến tính, dễ prefetch, cache-friendly.
    * Hạn chế cấu trúc "pointer chasing" như `linked list`, `tree` phân mảnh → mỗi node có thể nằm ở chỗ khác nhau trong RAM, dễ gây nhiều cache miss.
    * Khi phải dùng nhiều node rời rạc: cân nhắc **pool allocator / arena** để gom chúng vào chung một vài vùng nhớ lớn (tăng locality).
    * Với cấu trúc cây/b-tree: chọn **branching factor** sao cho 1 node tree nằm gọn trong 1–2 cache line.
    * Đối với map/set trong C++: cân nhắc `flat_map`, `flat_set` (dựa trên vector) thay cho `std::map` (RB-tree) trong các trường hợp nhiều read/ít insert.

  * **Blocking / tiling cho loop lớn (cache blocking)**:
    * Ví dụ kinh điển: nhân ma trận, duyệt 2D/3D array → chia thành block nhỏ (tile) sao cho block vừa L1/L2, xử lý xong block này mới sang block khác.
    * Giảm cache miss rất mạnh vì mỗi block được dùng triệt để trong cache trước khi bị thay.

  * **Columnar / log-structured layout**:
    * Với workload phân tích (analytics, OLAP): lưu dữ liệu theo cột thay vì theo dòng (column store) → chỉ đọc cột cần thiết, giảm băng thông memory.
    * Với workload ghi nhiều, đọc tuần tự: log-structured / append-only (LSM-tree, WAL) giúp I/O + memory access tuần tự, rất cache- & disk-friendly.

  * **Bit-packing / field compaction**:
    * Gộp nhiều flag nhỏ (bool, enum nhỏ) vào cùng 1 word/bitset → giảm kích thước struct, tăng số phần tử trên mỗi cache line.((Ví dụ: thay 8 bool field (8 bytes) bằng 1 uint8_t với 8 bits (1 byte) → 8x nhiều element/cache line. Đặc biệt hiệu quả khi filter/scan bảng lớn — bitmap index dùng kỹ thuật này để SIMD scan hàng triệu record/giây.))
    * Đặc biệt hiệu quả cho các bảng trạng thái lớn (state machine, permission matrix, bitmap index).

  * **Object pooling / slab allocator**:
    * Thay vì `malloc/free` từng object rải rác, dùng pool/slab để cấp phát block lớn rồi cắt ra → các object cùng loại nằm cạnh nhau.
    * Giảm fragmentation, tăng cache locality khi duyệt nhiều object cùng kiểu (ví dụ: entity trong game, connection trong server).

  * **Page-locality / NUMA-aware allocation**:
    * Trên máy nhiều socket/NUMA node: mỗi node có memory riêng, truy cập "xa" sẽ chậm hơn truy cập "local".
    * Kỹ thuật: `thread pinning` (gắn thread với 1 core/node) + allocate memory ngay trên node đó (`numactl`, `first touch policy`) để dữ liệu "gần" CPU xử lý nó.

* **Truy cập ma trận: row-major vs column-major**:
  * Hầu hết C/C++/Go dùng **row-major**: `a[i][j]` được lưu lần lượt theo `i` ngoài, `j` trong: `a[0][0], a[0][1], ..., a[0][n-1], a[1][0], ...`.
  * Nếu code:
    * Duyệt theo hàng (row): `for i: for j: use(a[i][j])` → truy cập `a[i][0..n-1]` liên tiếp, cache line được tận dụng tối đa.
    * Duyệt theo cột (column): `for j: for i: use(a[i][j])` → giữa hai phần tử liên tiếp phải nhảy qua `stride` lớn trong memory → mỗi bước rất dễ rơi vào line khác nhau → nhiều cache miss.
  * Quy tắc: **truy cập theo thứ tự layout vật lý** của dữ liệu trong RAM → tận dụng spatial locality.
