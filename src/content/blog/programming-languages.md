---
title: "Program Language"
pubDate: "2025-06-30"
published: true
contents_table: true
pinned: false
description: "."
cat: "compiler"
useKatex: false
---
# Tổng quan ngôn ngữ lập trình: từ thấp đến cao

> Tài liệu này hệ thống lại kiến thức về **cách máy tính chạy code của bạn** (low-level) và **cách bạn diễn đạt ý tưởng với máy** (high-level), với so sánh chi tiết giữa các ngôn ngữ phổ biến: C/C++, Rust, Go, Java, Python, JavaScript/Node.js. Mục tiêu: có một bức tranh tổng thể, có dẫn dắt logic, đi từ "tại sao" trước "cái gì".

---

## Mục lục

**Phần I — Low-level: Vòng đời của code**
1. Bức tranh tổng quát: từ source code đến CPU
2. Front-end: Scanning, Parsing, Static Analysis
3. Middle-end: Intermediate Representation & Optimization
4. Back-end: Code generation, Linking, Loading
5. Runtime: cái gì tồn tại khi chương trình đang chạy
6. VM, Interpreter, JIT, AOT — cây phả hệ các chiến lược thực thi
7. Memory layout: Stack, Heap, Data, Text, BSS
8. Memory management theo từng ngôn ngữ
9. Garbage Collection: thuật toán & tradeoff

**Phần II — High-level: Khái niệm ngôn ngữ**

10. Hệ thống kiểu (Type System)
11. Primitive vs Object, Mutable vs Immutable
12. Pass by Value vs Pass by Reference (chi tiết từng ngôn ngữ)
13. Pointer, Reference, Ownership
14. Concurrency model (chi tiết từng ngôn ngữ)
15. Paradigm: OOP, Functional, Procedural, Declarative...

**Phần III — Thực chiến**

16. Bug & ví dụ điển hình theo từng ngôn ngữ
17. Tối ưu & Profiling
18. Bảng tổng kết so sánh

---

# Phần I — Low-level: Vòng đời của code

## 1. Bức tranh tổng quát

Khi bạn viết `print("hello")` và bấm run, chuyện gì xảy ra giữa text editor và bóng đèn LED của CPU?

Câu trả lời ngắn:

```
Source code (text)
   │
   ▼
[Compilation]   ── Lexical → Syntax → Semantic → IR → Optimize → Output
   │
   ▼
[Linking]       ── Gắn các object file + thư viện thành 1 executable
   │
   ▼
[Loading]       ── OS nạp executable vào RAM, tạo process, thiết lập memory layout
   │
   ▼
[Runtime]       ── CPU thực thi từng instruction, GC/scheduler/runtime services chạy nền
```

Mỗi bước có thể bị **lược bỏ, gộp lại, hoặc trì hoãn** tuỳ ngôn ngữ. Đây là điểm phân hoá các "trường phái":

| Trường phái | Compilation | Linking | Loading | Runtime |
|---|---|---|---|---|
| **AOT native** (C, C++, Rust, Go) | Sớm, trước khi chạy | Sớm | Khi `exec()` | Chạy native code |
| **AOT bytecode** (Java, C#) | Sớm → bytecode | Tại VM load | Khi JVM/CLR start | Interpret + JIT |
| **JIT in-memory** (V8/Node.js, Lua) | Tại runtime | Không có (in-memory) | Khi engine khởi động | Interpret + JIT |
| **Interpreted** (Python CPython, Ruby MRI) | Lazy, sinh `.pyc` cache | — | Khi `python` chạy | Interpret loop |
| **Tree-walk** (Lox, early Ruby) | Chỉ tới AST | — | — | Đi cây AST |

Ranh giới "compiler vs interpreter" là một câu hỏi sai. CPython có compiler bên trong (sinh bytecode `.pyc`). V8 có cả interpreter (Ignition) và JIT compiler (TurboFan/Maglev). Hỏi đúng là: **"giai đoạn nào được thực hiện sớm, giai đoạn nào trì hoãn?"**

---

## 2. Front-end: Scanning → Parsing → Static Analysis

### 2.1 Scanning (Lexical Analysis / Lexing)

**Input**: chuỗi ký tự thô.
**Output**: danh sách token có nghĩa.

```
"var x = 1 + 2;"
   ↓ lexer
[VAR][IDENT:x][EQ][NUM:1][PLUS][NUM:2][SEMI]
```

Whitespace và comment thường bị bỏ. Lexer dùng **finite state automaton** (FSA/DFA), thường viết tay (Rust/Go/Clang) hoặc sinh bằng tool (`flex`, `lex`).

**Lỗi điển hình ở giai đoạn này**: unterminated string, ký tự lạ (`@` ở C), số sai định dạng.

### 2.2 Parsing (Syntax Analysis)

**Input**: stream token.
**Output**: cây cú pháp (parse tree hoặc AST — Abstract Syntax Tree).

Parser kiểm tra cú pháp theo **grammar** (thường BNF/EBNF). Hai họ chính:

- **Top-down (Recursive Descent)**: dễ viết tay, dễ debug. Dùng trong `clang`, `gcc` (cho C++ phức tạp), JS engines, Lox.
- **Bottom-up (LR, LALR)**: mạnh hơn cho grammar phức tạp, thường sinh tự động (`bison`, `yacc`).

AST mẫu cho `var avg = (min + max) / 2;`:

```
VarDecl(name="avg")
 └── BinaryOp(op="/")
      ├── BinaryOp(op="+")
      │    ├── Identifier("min")
      │    └── Identifier("max")
      └── Number(2)
```

**Lỗi điển hình**: missing `;`, mismatched bracket, "Unexpected token". JavaScript có cơ chế tự thêm `;` (Automatic Semicolon Insertion) — đôi khi gây lỗi khó đoán:

```javascript
return
  { value: 1 };
// ASI biến thành: return; { value: 1 };
// → trả về undefined, không phải object
```

### 2.3 Static Analysis (Semantic Analysis)

Sau khi có cây cú pháp, ta cần biết **ý nghĩa**:

- **Binding/Resolution**: `x` trong `print(x)` trỏ tới biến nào? Local? Global? Closure?
- **Scope analysis**: vùng nào của code thấy được binding nào?
- **Type checking** (nếu statically typed): `a + b` có hợp lệ không? Có ép kiểu ngầm không?
- **Control flow analysis**: dùng biến chưa khởi tạo? Code unreachable?

Kết quả thường được lưu vào:
- **Attribute** trên node AST (đính kèm trực tiếp).
- **Symbol table** (map identifier → declaration).
- **Biến đổi AST** thành cấu trúc mới mang đậm semantic hơn (đây là cầu nối sang IR).

**Static vs Dynamic typing**:
- Statically typed (C, Rust, Go, Java, TypeScript): type check tại compile time.
- Dynamically typed (Python, JS, Ruby): type check tại runtime, sẽ throw `TypeError`.

Đây là lý do JS/Python **không phát hiện `undefined is not a function`** trước khi chạy.

---

## 3. Middle-end: IR & Optimization

### 3.1 Tại sao cần Intermediate Representation?

Tưởng tượng bạn cần build compiler cho 3 ngôn ngữ (C, Rust, Swift) × 3 kiến trúc (x86, ARM, RISC-V). Cách ngây thơ: 9 compiler. Cách thông minh: **mỗi front-end sinh ra IR chung, mỗi back-end nhận IR đó**. Tổng cộng: 3 front-end + 3 back-end = 6 thành phần.

Đây chính xác là kiến trúc của **LLVM** (Clang, Rust, Swift cùng dùng LLVM IR) và **GCC** (dùng GIMPLE và RTL).

### 3.2 Optimization passes

Một số tối ưu:

| Tối ưu | Ý tưởng | Ví dụ |
|---|---|---|
| **Constant folding** | Tính trước biểu thức hằng | `3.14 * 2` → `6.28` |
| **Constant propagation** | Lan truyền hằng số | `x = 5; y = x + 1` → `y = 6` |
| **Dead code elimination** | Bỏ code không bao giờ chạy / kết quả không dùng | `if (false) {...}` |
| **Common subexpression elimination** | Tránh tính lại biểu thức | `a*b + a*b` → `t = a*b; t + t` |
| **Loop unrolling** | Mở vòng lặp để giảm overhead branch | `for i 1..4: f(i)` → `f(1);f(2);f(3);f(4)` |
| **Loop-invariant code motion** | Đẩy code không đổi ra khỏi vòng lặp | |
| **Inlining** | Thay call bằng body function | giảm overhead call + mở ra tối ưu xa hơn |
| **Strength reduction** | Thay phép đắt bằng phép rẻ | `x * 2` → `x << 1` |
| **Tail call optimization** | Biến đệ quy đuôi thành loop | tránh stack overflow |
| **Escape analysis** | Quyết định alloc trên stack hay heap | (Go dùng nặng) |

**Lưu ý quan trọng**: nhiều ngôn ngữ ít tối ưu compile time mà dồn lực vào **runtime optimization** (JIT). CPython và Lua đời đầu tạo bytecode rất "ngây thơ" — performance đến từ tối ưu interpreter loop, không phải optimization passes.

---

## 4. Back-end: Code Generation, Linking, Loading

### 4.1 Code generation

Hạ IR xuống **target code** — có 2 lựa chọn:

**(a) Native machine code** (x86, ARM...): nhanh nhất, nhưng:
- Bị trói với một kiến trúc CPU.
- Phải xử lý register allocation (graph coloring, linear scan), instruction selection, scheduling.
- Phải tuân thủ ABI (calling convention, alignment).

**(b) Bytecode** (cho VM): trung lập kiến trúc, dễ port.
- JVM bytecode (`.class`), CIL/MSIL (`.NET`), Python bytecode (`.pyc`), WebAssembly (`.wasm`).
- Tradeoff: chậm hơn native nếu chỉ interpret, nhưng JIT có thể bù lại.

### 4.2 Linking

Ghép nhiều **object file** (`.o`/`.obj`) + thư viện thành 1 executable.

- **Static linking**: copy code thư viện vào binary. Binary lớn, không phụ thuộc môi trường (Go mặc định static).
- **Dynamic linking**: chỉ lưu reference đến `.so`/`.dll`/`.dylib`. Binary nhỏ, share library giữa nhiều process (tiết kiệm RAM), nhưng có rủi ro "DLL hell" / "missing libssl.so.1.1".

**Linker** giải quyết:
- **Symbol resolution**: function `printf` ở đâu? → trỏ tới libc.
- **Relocation**: cập nhật địa chỉ trong code khi biết layout cuối cùng.

Rust dùng `rustc` + LLVM + `lld`/system linker. Go có linker riêng tích hợp trong toolchain.

### 4.3 Loading

OS nhận lệnh `execve()` (Linux):
1. Đọc header executable (ELF, PE, Mach-O).
2. Tạo **virtual address space** cho process.
3. Map các segment vào memory:
   - **Text** (code, read-only, executable)
   - **Data** (biến global đã khởi tạo)
   - **BSS** (biến global chưa khởi tạo, zero-fill)
   - **Heap** (grows up, qua `brk`/`mmap`)
   - **Stack** (grows down, mặc định ~8MB ở Linux)
4. Load dynamic libraries nếu cần (`ld-linux.so` resolve symbol).
5. Nếu là ngôn ngữ VM-based: load VM, rồi VM mới load bytecode.
6. Nhảy tới entry point (`_start` → `main`).

---

## 5. Runtime: cái gì tồn tại khi đang chạy

Runtime là **mọi thứ tồn tại bên cạnh code của bạn**:
- Memory allocator (`malloc` của libc, jemalloc, tcmalloc, mimalloc).
- Garbage collector (nếu có).
- Scheduler (cho thread/goroutine/coroutine).
- Type info cho reflection / instanceof.
- Exception handler (unwinding stack).
- Standard library code đã link vào.

Ngôn ngữ **"no runtime"** (C): chỉ vài hàm libc + startup code. Binary thực sự nhỏ.
Ngôn ngữ **"fat runtime"** (Go, Java): runtime kéo theo nhiều MB code — scheduler M:N, GC, profiler, panic handler.

**Java**: runtime nằm trong JVM tách rời (cài 1 lần, dùng cho mọi ứng dụng).
**Go**: runtime **nhúng vào từng binary** — đó là lý do `hello.go` build ra binary ~2MB. Đổi lại: không cần cài JVM, chạy độc lập.

---

## 6. VM, Interpreter, JIT, AOT — cây phả hệ

### 6.1 Bốn chiến lược chính

```
                  ┌──────────────────────────┐
                  │  Source code             │
                  └──────────────────────────┘
                            │
        ┌───────────────────┼────────────────────┐
        ▼                   ▼                    ▼
   AOT native          Bytecode + VM        Tree-walk
   (C, C++, Rust,      (Java, C#,           (Lox phase 1,
    Go AOT)             CPython, Lua,        early Ruby)
                        Node.js/V8)
        │                   │
        ▼                   ▼
   Machine code        Interpret loop  ─→ JIT (hot spots)
                                          ─→ Native code
```

### 6.2 JIT (Just-In-Time)

Khi chạy, phát hiện "hot code" (loop chạy nhiều lần, function gọi nhiều lần) → biên dịch thành native code tại chỗ.

**Tiers điển hình của V8** (engine của Node.js, Chrome):
1. **Ignition** — interpret bytecode.
2. **Sparkplug** (V8 8.7+) — baseline JIT, không tối ưu.
3. **Maglev** (V8 11.7+) — JIT tốc độ trung bình.
4. **TurboFan** — optimizing JIT, dùng type feedback.

**HotSpot JVM**:
1. Interpret.
2. **C1 (client compiler)** — JIT nhanh, tối ưu nhẹ.
3. **C2 (server compiler)** — tối ưu sâu (escape analysis, inlining xa, loop opt).

**Speculative optimization** & **deoptimization**:
- JIT giả định "biến `x` luôn là number" → sinh code chuyên cho number.
- Nếu một lần `x` là string → **deopt**: huỷ code đã JIT, quay về interpreter.
- Đó là lý do tránh code "type-polymorphic" trong hot path JS.

**Tradeoff JIT**:
- ✅ Tận dụng runtime info (type, branch frequency) → tối ưu mà AOT không làm được.
- ✅ Cross-platform: cùng `.class` chạy mọi máy.
- ❌ **Warm-up time**: lúc mới start chậm. Vấn đề lớn với serverless/Lambda.
- ❌ Tốn RAM (code cache, profile info).
- ❌ Bảo mật: code page phải có `write + execute` — tăng bề mặt tấn công (W^X).

### 6.3 AOT (Ahead-of-Time)

Biên dịch trước, deploy binary native. C/C++/Rust/Go mặc định AOT.

**Java cũng có AOT**: GraalVM Native Image — compile `.class` thành binary native, **zero warm-up**, RAM nhỏ. Dùng cho serverless (Quarkus, Micronaut). Tradeoff: mất khả năng tối ưu runtime của JIT, reflection bị giới hạn.

**.NET có AOT**: Native AOT (.NET 7+), tương tự GraalVM.

### 6.4 Tại sao Node.js không tạo file `.pyc`?

V8 sinh bytecode **in-memory**, không ghi disk:
- ✅ Startup nhanh (không cần I/O đọc bytecode).
- ✅ Không lộ artifact → khó reverse-engineer.
- ✅ Linh động theo môi trường (CPU profile khác nhau).
- ❌ Mỗi lần start phải parse + compile lại (tốn CPU cold start).
- ❌ Khó dis-assemble debug (Java có `javap`, Python có `dis`).

V8 có **code cache** trong-memory để reuse trong cùng process (`v8::ScriptCompiler::CreateCodeCache`).

---

## 7. Memory layout của process

Khi OS load chương trình, virtual address space điển hình của process Linux trông như sau (đơn giản hoá, 64-bit):

```
High address
   ┌────────────────────────┐
   │  Kernel space          │ (không truy cập được từ user)
   ├────────────────────────┤
   │  Stack ↓               │  ← biến local, return address, call frame
   │  ...                   │
   │  (mmap region) ↕       │  ← shared lib, mmap, anonymous mmap
   │  ...                   │
   │  Heap ↑                │  ← malloc/new/make
   ├────────────────────────┤
   │  BSS                   │  ← biến global chưa init (zero-fill)
   ├────────────────────────┤
   │  Data                  │  ← biến global đã init
   ├────────────────────────┤
   │  Text (code)           │  ← machine instructions (RX, không ghi)
   └────────────────────────┘
Low address
```

### 7.1 Stack vs Heap

| | Stack | Heap |
|---|---|---|
| **Cấp phát** | Compile time biết offset, runtime chỉ trừ stack pointer | Runtime, qua allocator |
| **Tốc độ** | Cực nhanh (1 phép trừ SP) | Chậm hơn nhiều lần |
| **Layout** | Liền mạch, cache-friendly | Phân mảnh, có thể cache miss |
| **Kích thước** | Mặc định ~1-8MB (giới hạn cứng) | Vài GB tới hết RAM |
| **Quản lý** | Tự động khi function return | Manual / GC |
| **Lifetime** | Hết function là chết | Đến khi free / unreachable |
| **Truy cập** | Trực tiếp qua offset | Gián tiếp qua pointer |

### 7.2 Khi nào cần heap?

1. **Mảng lớn**: stack chỉ ~1-8MB, mảng 100MB không thể trên stack.
2. **Kích thước động**: stack không thể `realloc`.
3. **Lifetime vượt scope**: object cần tồn tại sau khi function trả về (linked list, tree, closure capture).
4. **Polymorphism với size khác nhau** (C++ virtual, Java object).

### 7.3 Stack/heap minh hoạ — Java

```java
String s = new String("Hello");
```

- `s` là **reference** (~8 bytes trên 64-bit), nằm trên **stack** trong frame của method.
- Object `String` thực tế nằm trên **heap**, do GC quản lý.
- `s = null` → reference mất, nhưng nếu chưa có reference nào khác trỏ tới object → object thành unreachable → lần GC tới sẽ thu hồi.

```c
int arr[1000];               // Stack — compiler biết layout, alloc tại compile-time
int* arr = malloc(3 * sizeof(int));  // Heap — runtime, glibc/jemalloc cấp
```

### 7.4 Undefined Behavior (UB) — tại sao C/C++ nguy hiểm

#### 7.4.1 UB là gì?

**Undefined Behavior** = hành vi mà **chuẩn ngôn ngữ (C standard) không định nghĩa** kết quả. Compiler được **toàn quyền** làm bất cứ gì khi gặp UB:
- Chạy "đúng" như bạn nghĩ (may mắn).
- Crash (segfault).
- Skip luôn code đó (compiler giả định UB không xảy ra → bỏ luôn nhánh chứa UB).
- Format ổ cứng (về lý thuyết — meme "nasal demons" của cộng đồng C).
- Chạy đúng trên máy dev, sai trên prod.
- Chạy đúng 10 năm rồi đùng cái sai khi upgrade compiler.

→ UB **không phải bug runtime** mà là **hợp đồng bị vi phạm**. Compiler dựa vào "UB không xảy ra" để tối ưu — vi phạm thì mọi đảm bảo bay biến.


#### 7.4.2 Ví dụ signed overflow

```c
int main() {
    for (int i = 1; i > 0; i++) {
        printf("%d\n", i);
    }
}
```

Bạn nghĩ: in tới `INT_MAX`, overflow thành âm, thoát loop.
GCC `-O2` nghĩ: "signed overflow là UB → tôi giả định `i` không bao giờ ≤ 0 → loop là vô hạn → tôi không cần check, không cần in" → **chương trình treo, không in gì cả**.

`gcc -fwrapv` tắt giả định này (cho phép wraparound), nhưng performance giảm.

#### 7.4.3 Ví dụ pointer

```c
void process() {
    int a = 100, b = 200, c = 300;
    int* p = (int*)malloc(sizeof(int));
    p = &b;        // (1) leak malloc, p trỏ stack
    p--;           // (2) UB: pointer arith ngoài array
    *p = 1;        // (3) ghi vào ô lân cận b
    printf("a=%d b=%d c=%d\n", a, b, c);
}
```

Stack frame (thứ tự a,b,c **tuỳ compiler**, không đảm bảo):

```
┌─────────┐
│ p       │──► (1) trỏ &b  → (2) p-- trỏ ô trước b
├─────────┤
│ c = 300 │
├─────────┤
│ b = 200 │◄── &b
├─────────┤
│ a = 100 │  ← có thể bị ghi đè ở (3)
└─────────┘
```

3 vấn đề:
- **(1) Leak**: pointer malloc bị overwrite, không free được.
- **(2) UB**: chuẩn C cấm pointer arith ngoài array. `b` không phải array → UB ngay đây, chưa cần deref.
- **(3) Ghi**: ô đó có thể là `a`, `c`, padding, saved register, return address (exploit).

Output không xác định:

| Compiler | Kết quả |
|---|---|
| `gcc -O0` | `a=1 b=200 c=300` (a sát trước b) |
| `gcc -O2` | `a=100 b=200 c=300` (constant-fold, bỏ `*p=1`) |
| `clang` | `a=100 b=200 c=1` (layout ngược) |
| MSVC `/GS` | crash do stack canary |

#### 7.4.3 Compiler được phép "giả vờ UB không tồn tại"
```c
int divide(int a, int b) {
    int result = a / b;   // UB nếu b = 0
    if (b == 0) return -1;
    return result;
}
```

GCC `-O2` **xoá luôn `if (b==0)`**, lý luận: "đã chia trước rồi → b chắc chắn ≠ 0 → check thừa". Compiler tối ưu "dựa vào giả định UB không xảy ra" — gọi là **"UB-driven optimization"**.


#### 7.4.4 Tại sao chuẩn C cho phép UB?

Lý do lịch sử + performance:
- C ra đời thời máy yếu, mỗi CPU mỗi kiểu (one's complement, sign-magnitude, two's complement). Định nghĩa "phải làm gì khi overflow" sẽ bắt CPU emulate → chậm.
- Để mở cửa cho compiler tối ưu mạnh (vectorize, reorder, loop transform).
- Triết lý: "trust the programmer".

→ Hậu quả: ~70% lỗi nghiêm trọng (CVE) ở Chrome, Windows, Linux kernel là **memory safety bug** (Microsoft Security Response Center, 2019). Đây là động lực của:
- **Rust** — ownership + borrow checker enforce memory safety tại compile-time, **không có UB trong safe code**.

#### 7.4.5 Rust cùng chương trình

```rust
fn process() {
    let a = 100; let b = 200; let c = 300;
    let p: *mut i32 = &b as *const i32 as *mut i32;
    unsafe {
        let q = p.offset(-1);   // UB tương đương — nhưng PHẢI `unsafe`
        *q = 1;
    }
}
```

Compile-time error nếu **không có `unsafe`** — borrow checker từ chối `&mut` tới local của hàm khác, pointer arithmetic chỉ trong `unsafe` block. **UB vẫn có thể xảy ra trong `unsafe`**, nhưng:
1. `unsafe` là **đánh dấu rõ** "vùng nguy hiểm" — review tập trung vào đây.
2. Mặc định mọi thứ safe — phải chủ động chọn unsafe.
3. Compiler vẫn check một số rule (`offset` ngoài alloc vẫn UB, nhưng ít nhất signature nói rõ).

> **Tổng kết**: UB không phải "lỗi runtime" — nó là "hợp đồng vi phạm". Compiler không có nghĩa vụ làm gì hợp lý. Đây không phải bug "chương trình sẽ crash" mà là bug **"chương trình có thể chạy đúng 10 năm rồi đùng cái sai khi đổi compiler hoặc bật -O3"**. Đó là lý do tồn tại của Rust và sanitizer toolchain.

---

## 8. Memory management theo từng ngôn ngữ

Có 4 trường phái lớn:

```
1. Manual            → C, C++ (raw)
2. Smart pointers    → C++ (RAII, unique_ptr/shared_ptr)
3. Ownership         → Rust
4. Garbage Collection → Go, Java, C#, Python, JS, Ruby, OCaml...
```

### 8.1 C/C++ — Manual

`malloc/free`, `new/delete`. Tốc độ tối đa, kiểm soát tối đa, **nguy hiểm tối đa**:
- **Use-after-free**: dùng pointer sau khi đã free.
- **Double free**: free 2 lần.
- **Buffer overflow**: ghi quá vùng cấp.
- **Memory leak**: cấp mà không free.
- **Dangling pointer**: pointer trỏ tới biến đã chết.

C++ hiện đại giảm bằng **RAII** (Resource Acquisition Is Initialization) + smart pointers:
- `unique_ptr<T>` — single ownership, tự free khi out of scope.
- `shared_ptr<T>` — reference counted.
- `weak_ptr<T>` — non-owning, tránh cycle với `shared_ptr`.

### 8.2 Rust — Ownership + Borrow checker

Nguyên tắc cốt lõi:
1. Mỗi giá trị có **đúng 1 owner**.
2. Khi owner ra khỏi scope, giá trị bị drop (free).
3. Có thể **borrow** (mượn) tham chiếu:
   - **Nhiều immutable reference** (`&T`) cùng lúc, HOẶC
   - **Đúng 1 mutable reference** (`&mut T`).
4. Tham chiếu không được sống lâu hơn owner (**lifetime**).

```rust
let s1 = String::from("hello");
let s2 = s1;           // s1 MOVE sang s2, s1 không dùng được nữa
// println!("{}", s1); // compile error
```

```rust
fn modify(s: &mut String) { s.push_str(" world"); }
let mut s = String::from("hello");
modify(&mut s);  // OK
```

**Lợi**: zero-cost abstraction, không cần GC, **memory safety + thread safety tại compile time**. Đây là USP của Rust.
**Bất lợi**: learning curve cao, "fighting the borrow checker", một số pattern (doubly linked list, observer) khó implement, phải dùng `Rc<RefCell<T>>` hoặc `unsafe`.

### 8.3 Go — GC + Escape Analysis

Go có GC, nhưng compiler dùng **escape analysis** để quyết định:
- Biến **không escape** khỏi function → allocate trên **stack** → không cần GC.
- Biến **escape** (return pointer, capture trong goroutine, lưu trong global) → **heap** → GC quản.

```go
func foo() *int {
    x := 42
    return &x   // x escape → x trên heap
}

func bar() int {
    x := 42
    return x    // x không escape → stack, không GC
}
```

Xem escape report: `go build -gcflags="-m"`.

GC của Go (1.5+): **concurrent tri-color mark-sweep**, mục tiêu pause < 1ms. Đánh đổi: throughput thấp hơn so với GC stop-the-world cổ điển, nhưng latency dự đoán được — quan trọng cho server. Tuning: `GOGC` (mặc định 100 — GC khi heap gấp đôi sau lần GC trước), `GOMEMLIMIT`.

### 8.4 Java — Generational GC

Heap chia làm 2 thế hệ (giả thuyết: object trẻ chết nhanh):

```
[Young Generation]              [Old Generation]
 ┌─────┬───────┬─────┐           ┌──────────────┐
 │ Eden│ S0/S1 │     │ ──promote→│              │
 └─────┴───────┴─────┘           └──────────────┘
   ↑                                  ↑
   Minor GC (nhanh)                   Major GC (chậm)
```

- Object mới sinh ở **Eden**. Khi Eden đầy → **Minor GC**: copy object sống sang Survivor space (S0↔S1).
- Sau N lần survive → **promote** lên Old Generation.
- Old Generation đầy → **Major GC** / **Full GC** (chậm, có thể STW dài).

### 8.5 Python (CPython) — Refcount + Generational GC

Mỗi object có **`ob_refcnt`**. Mỗi assignment tăng refcount, mỗi xoá giảm. Refcount về 0 → giải phóng ngay.

```python
a = [1,2,3]   # refcount = 1
b = a         # refcount = 2
del a         # refcount = 1
del b         # refcount = 0 → free
```

**Vấn đề**: refcount không phát hiện được **chu trình tham chiếu**:
```python
a = []
b = [a]
a.append(b)
del a; del b   # cả 2 vẫn refcount=1 do trỏ lẫn nhau → LEAK
```

→ CPython có thêm **cycle collector** (generational, 3 thế hệ), chạy định kỳ tìm cycle.

**GIL (Global Interpreter Lock)**:
- Chỉ 1 thread được chạy Python bytecode tại một thời điểm trong 1 process.
- Lý do tồn tại: bảo vệ refcount khỏi race condition khi multi-thread.
- Hệ quả:
  - I/O-bound: thread vẫn ổn (GIL được nhả khi đợi I/O).
  - CPU-bound: thread tranh GIL — không song song thực sự → dùng `multiprocessing` để bypass.
  - C extension (NumPy, PyTorch) có thể nhả GIL khi chạy native code → hiệu quả.
- **Python 3.13+ có "no-GIL" build** (PEP 703) — đang thử nghiệm.

### 8.6 Node.js (V8) — Generational, Orinoco GC

Chia 2 generation tương tự Java:
- **Young** (~1-8MB) — dùng **Scavenge** (copying collector của Cheney), rất nhanh.
- **Old** (lớn hơn) — dùng **Mark-Sweep-Compact**, concurrent + incremental + parallel.

V8 cố làm GC concurrent để giảm STW (Orinoco project). Tuy nhiên với heap lớn (>1GB), pause vẫn có thể tới hàng chục ms.

Limit mặc định: `--max-old-space-size=4096` (4GB) — cần chỉnh cho production.

### 8.7 So sánh GC pause

| Ngôn ngữ/GC | Pause điển hình | Throughput | Ghi chú |
|---|---|---|---|
| **Go (concurrent)** | < 1ms | Khá | Latency-focused |
| **Java ZGC/Shenandoah** | < 1ms | Tốt | Heap nhiều TB cũng OK |
| **Java G1** | 10-100ms | Tốt | Default từ J9 |
| **Java Parallel** | 100ms - vài giây | Cao nhất | Batch |
| **V8 (Node.js)** | 1-100ms | Khá | Phụ thuộc heap size |
| **CPython** | gần như 0 (refcount) + cycle collector | Trung bình | GIL là vấn đề lớn hơn |

**Insight**: bất kỳ ngôn ngữ GC nào cũng có khả năng gây **pause** và **jitter**. Với hệ thống low-latency (HFT, game engine), người ta hoặc:
- Dùng ngôn ngữ không GC (C++, Rust).
- Tune GC kỹ, reuse object (object pool).
- Chia path latency-critical sang language khác.

---

# Phần II — High-level: Khái niệm ngôn ngữ

## 10. Type System

Hai trục độc lập:

### 10.1 Static vs Dynamic typing

- **Static** (C, C++, Java, Rust, Go, TypeScript, Kotlin, Swift): type biết tại compile time.
  - ✅ Phát hiện lỗi sớm, IDE hỗ trợ tốt, performance tốt (compiler tối ưu được).
  - ❌ Code nhiều hơn (nếu không có type inference).
- **Dynamic** (Python, JS, Ruby, PHP, Lua): type chỉ biết tại runtime.
  - ✅ Linh hoạt, prototype nhanh.
  - ❌ Lỗi tìm muộn (`'undefined' is not a function` lúc 3h sáng prod).

### 10.2 Strong vs Weak typing

- **Strong** (Python, Java, Rust): không tự ép kiểu giữa các type không liên quan. `"3" + 4` → error.
- **Weak** (JS, PHP, C): ép kiểu ngầm tích cực.
  - JS: `"3" + 4 = "34"`, `"3" - 4 = -1`, `[] + {} = "[object Object]"`. Đây là nguồn meme bất tận.
  - C: `int → char` mất bit, `int → double` ngầm.

**Lưu ý**: "weak typing" thường bị nhầm với "dynamic typing". JS là dynamic + weak. Python là dynamic + strong.

### 10.3 Nominal vs Structural typing

- **Nominal** (Java, C#, Rust): hai type "khớp" khi cùng tên.
  ```java
  class Cat { String name; }
  class Dog { String name; }
  // Cat và Dog không tương thích dù shape giống nhau
  ```
- **Structural** (TypeScript, Go interface, OCaml): khớp theo shape.
  ```typescript
  interface Named { name: string }
  // Bất kỳ object nào có `name: string` đều là Named
  ```

Go interface là **implicit structural**: type không cần `implements`, chỉ cần đủ method → tự động thoả interface.

---

## 11. Primitive vs Object, Mutable vs Immutable

### 11.1 Primitive (value type) vs Object (reference type)

**Primitive**: số, bool, char — thường lưu **trực tiếp** ở stack/register (hoặc inline trong object). Copy = sao chép bit.

**Object**: struct phức tạp — lưu ở heap, biến chỉ giữ **reference** (pointer + metadata).

Per-language:

- **C**: int, float, char, struct (value), pointer. Không có "object" theo nghĩa managed.
- **C++**: tương tự + class. Class có thể là value (stack) hoặc heap (`new`).
- **Java**: 8 primitive (`int, long, double, boolean, byte, short, char, float`) + tất cả còn lại là object (kể cả `Integer` — boxed). Generic bị type-erased, không có `List<int>` (phải `List<Integer>`). Java 21 đang đưa **Project Valhalla** — value class.
- **C#**: struct (value) + class (reference). `int` thật ra là `System.Int32` struct.
- **Go**: tất cả là value, có pointer riêng. `struct{}` là value type. Slice/map/channel là reference-like nhưng technically là struct chứa pointer.
- **Python**: **mọi thứ là object** — kể cả `int`, `1` cũng là `PyObject` trên heap. Tốn RAM (~28 bytes cho 1 `int`). Có optimization: small int cache (-5..256).
- **JavaScript**: primitive (`number, string, boolean, null, undefined, symbol, bigint`) + object. Primitive **immutable**. String is primitive (khác Java).

### 11.2 Mutable vs Immutable

**Immutable**: giá trị không đổi sau khi tạo. Nếu cần đổi → tạo object mới.

| Ngôn ngữ | Mutable | Immutable |
|---|---|---|
| **Java** | hầu hết object | `String`, `Integer`, `LocalDate`, record |
| **Python** | `list`, `dict`, `set`, object thường | `str`, `tuple`, `frozenset`, `int`, `float` |
| **JS** | object, array | primitive, string |
| **Go** | struct, slice, map | `string` |
| **Rust** | `let mut x` | `let x` (mặc định!) |
| **C#** | hầu hết | `string`, record |

**Hệ quả thực tế**:
- Python: `s = "abc"; s += "d"` → tạo string mới, `s` trỏ object mới. Concat trong loop → O(n²). Dùng `"".join(list)`.
- Java: cũng vậy, dùng `StringBuilder`.
- Go: string immutable, concat tốn — dùng `strings.Builder`.

**Lợi ích của immutability**:
- Thread-safe miễn phí.
- Có thể share an toàn, hash được.
- Đơn giản hoá reasoning.

**Bất lợi**:
- Tạo object liên tục → áp lực GC.
- Phải dùng builder/persistent data structure cho update lớn.

---

## 12. Pass by Value vs Pass by Reference

Đây là chủ đề **gây hiểu nhầm nhiều nhất** trong lập trình. Phân biệt rõ:

- **Pass by value**: copy giá trị vào tham số.
- **Pass by reference**: tham số là **alias** của argument — gán cho param → biến gốc cũng đổi.

| Ngôn ngữ | Default | Cách "by reference" | Có true by-ref không? |
|---|---|---|---|
| C | by value | pass pointer | Không (C++ có) |
| C++ | by value | `T&` hoặc pointer | Có |
| Java | by value (ref là value) | — | Không |
| Python | by object reference | — | Không (rebind local) |
| JavaScript | by value (primitive) / object ref | — | Không |
| Go | by value | pass pointer | Không |
| Rust | move/borrow tường minh | `&T`, `&mut T` | Tường minh |
| C# | by value | `ref`, `out`, `in` | Có |

Nhìn tổng quát, behavior bị quyết định bởi primitive/object + mutable/immutable**:

| Loại type | Behavior thực tế khi pass vào hàm | Lý do kỹ thuật |
|---|---|---|
| **Primitive** (int, float, bool, char) | Như by value — sửa trong hàm không ảnh hưởng caller | Giá trị nhỏ, copy thẳng vào register/stack |
| **Immutable object** (Python `str/tuple/int`, Java `String/Integer`, JS string) | Như by value (về mặt observable) — rebind không ảnh hưởng caller, không sửa được object | Vì immutable nên không có "sửa qua reference" — chỉ tạo mới |
| **Mutable object** (list, dict, map, slice, struct, custom class) | Như by reference — sửa field/element thấy ở caller | Tham số chứa pointer/reference tới shared object |
| **Container chứa pointer ngầm** (Go slice/map/chan, Java array, JS array/object) | Như by reference | Bản thân value là struct {ptr, len, cap} → copy struct vẫn share underlying data |

**Quy tắc cốt lõi (đúng cho mọi ngôn ngữ managed)**:

> *"Mọi ngôn ngữ đều pass by value. Khác biệt nằm ở **giá trị được pass là gì** — value trực tiếp hay reference/pointer."*

→ Primitive: value là chính số đó → caller không thấy thay đổi.
→ Object (mutable): value là reference → 2 reference cùng trỏ 1 object → sửa object thấy được; rebind local không thấy.
→ Object (immutable): cũng pass reference, nhưng không có API sửa → quan sát giống by value.

**Bảng matrix per-language**:

| Ngôn ngữ | Primitive | Immutable obj | Mutable obj | Container |
|---|---|---|---|---|
| **C** | by value | — | pointer thủ công | array decay → pointer |
| **C++** | by value | `const T&` | `T&` / pointer | tuỳ |
| **Java** | by value | by value (observable) — `String`, `Integer` | ref-as-value — `List`, `Map` | array là object → ref |
| **Python** | by value (observable) — `int`, `float`, `bool` | by value (observable) — `str`, `tuple`, `frozenset` | ref-as-value — `list`, `dict`, `set` | mọi container đều object |
| **JavaScript** | by value — `number`, `string`, `bool` | strings primitive → by value | ref-as-value — `object`, `array` | array/object đều ref |
| **Go** | by value | string by value (immutable) | struct by value (phải dùng `*T`) | slice/map/chan: copy struct nhưng share data → behavior ref |
| **Rust** | by value (Copy trait) | by value nếu `Copy` | move hoặc `&mut` tường minh | tường minh |

**Caveat & ngoại lệ cần nhớ**:

1. **Java/Python rebind không phải mutate**: `param = newObj` chỉ đổi local binding — caller không thấy. Chỉ `param.field = x` hoặc `param.append(x)` mới observable.
2. **Go slice quirk**: `append` vượt capacity → tạo underlying array mới → caller giữ slice cũ. Behavior "ref" bị phá.
3. **JS `const obj = {}`**: `const` cấm rebind, không cấm mutate field — `obj.x = 1` vẫn được.
4. **Python `int` cache** (-5..256): `a is b` có thể True cho int nhỏ, False cho int lớn — implementation detail, đừng dựa vào.
5. **C++ `const T&`**: pass reference nhưng cấm sửa — vừa zero-copy vừa safe, idiom phổ biến cho param object lớn.

**Tóm 1 dòng**: *primitive + immutable → quan sát giống by value; mutable container/object → quan sát giống by reference; thực tế dưới capote luôn là "pass by value of (value | reference)".*

---

## 13. Concurrency model

Vấn đề: làm sao chạy nhiều việc đồng thời, dùng đa core, không deadlock/race condition?

### 13.1 Các mô hình lớn

1. **OS Thread / Shared memory + locks** (Java, C++, C#).
2. **Event loop / Async I/O** (Node.js, Python asyncio).
3. **Green thread / Coroutine** (Go goroutine, Java Virtual Thread, Kotlin coroutine).
4. **Actor model** (Erlang, Elixir, Akka).
5. **CSP — Communicating Sequential Processes** (Go channel, Clojure core.async).
6. **STM — Software Transactional Memory** (Clojure, Haskell).
7. **Fork/join, parallel collections** (Java, .NET).

### 13.2 OS Thread

- 1 thread = 1 luồng OS, scheduler là kernel.
- Context switch ~1-10μs (lưu register, flush TLB phần lớn, ảnh hưởng CPU cache).
- Stack mặc định lớn (~1-8MB) → không scale lên triệu thread.
- Java thread, C++ `std::thread`, POSIX pthread.

**Vấn đề shared memory**:
- **Race condition**: 2 thread đọc-ghi cùng biến không có lock.
- **Deadlock**: A đợi B, B đợi A.
- **Livelock**: cả 2 nhường nhau, không ai tiến.
- Cần lock (`mutex`), `atomic`, `volatile`/`memory barrier`.

### 13.3 Event loop (Node.js)

Single thread chạy JS code, loop qua các phase:

```
┌───────────────────────────────────────┐
│ timers       │ setTimeout/setInterval │
├───────────────────────────────────────┤
│ pending cbs  │ I/O callback delayed   │
├───────────────────────────────────────┤
│ idle, prepare│ (internal)             │
├───────────────────────────────────────┤
│ poll         │ I/O events             │
├───────────────────────────────────────┤
│ check        │ setImmediate           │
├───────────────────────────────────────┤
│ close cbs    │ socket.on('close')     │
└───────────────────────────────────────┘
   Mỗi tick: chạy hết microtask (Promise, queueMicrotask, process.nextTick)
```

Thứ tự ưu tiên trong tick:
1. Sync code (call stack).
2. **process.nextTick** queue (Node-specific, cao nhất trong microtask).
3. **Microtask** queue (Promise.then, async/await, queueMicrotask).
4. Macrotask của phase hiện tại (timer/I/O/setImmediate...).

```javascript
console.log('Start');
setTimeout(() => console.log('Timeout'), 0);
Promise.resolve().then(() => console.log('Promise'));
process.nextTick(() => console.log('NextTick'));
console.log('End');

// Output:
// Start, End, NextTick, Promise, Timeout
```

**Libuv** (C library dưới Node):
- Event loop.
- **Thread pool** (mặc định 4, max 1024, qua `UV_THREADPOOL_SIZE`).
- Pool dùng cho: file I/O (FS), DNS resolver, crypto (`pbkdf2`, `scrypt`), zlib.
- **Network I/O không dùng thread pool** — dùng OS readiness (epoll/kqueue/IOCP) directly.

**Tại sao**: socket có cơ chế readiness sẵn của kernel, FS thì không (POSIX FS API là blocking). Đó là lý do `fs.readFile` của 20 file 100MB nặng ~650ms (~130ms × 5 đợt do pool=4), còn 20 HTTP request gần như song song hoàn toàn.

**Vòng lặp blocking giết event loop**:

```javascript
while (true) {} // 1 dòng này khoá toàn bộ server
```

→ Cách xử lý:
1. Chia nhỏ job qua `setImmediate` / `process.nextTick`.
2. Đẩy CPU-bound sang **Worker Threads** (Node 10.5+) hoặc **child_process**.
3. Cluster: PM2 / `cluster` module fork nhiều process → mỗi core 1 process. Đây không phải multi-thread thực sự, mà là multi-process.

### 13.4 Goroutine (Go) — M:N scheduling

Goroutine = userspace-scheduled coroutine.
- Mặc định stack chỉ ~2KB (grow tự động).
- Tạo 1 triệu goroutine khả thi.
- Switch ~10-100ns (vài register + stack pointer), **không qua kernel**.

**Mô hình M:N**:
- **G** = goroutine.
- **M** = OS thread (machine).
- **P** = logical processor (số bằng `GOMAXPROCS`, mặc định = số core).
- Mỗi P có run queue của G. M chạy G trên P. Có **work-stealing** khi P rảnh.

**Handoff khi syscall**:
- Goroutine gọi blocking syscall → M bị kẹt trong kernel.
- `sysmon` thread phát hiện M kẹt >20μs → tách P khỏi M, gắn P vào M khác (hoặc spawn M mới) → G khác tiếp tục chạy.
- Đây thực sự là **OS context switch** — đắt — nên nếu app gọi syscall liên tục, performance giảm.

**CSP** (Communicating Sequential Processes):
- Goroutine giao tiếp qua **channel** (Go), không qua shared memory.
- Mantra: *"Don't communicate by sharing memory; share memory by communicating."*

```go
ch := make(chan int, 10)
go func() { ch <- 42 }()
val := <-ch
```

### 13.5 Virtual Thread (Java 21+, Project Loom)

Tương tự goroutine: thread lightweight, managed bởi JVM, không phải kernel.
- Mỗi virtual thread vài KB stack.
- Triệu thread khả thi.
- API giống Thread cũ → code synchronous-style nhưng scale như async.

```java
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    IntStream.range(0, 10_000).forEach(i ->
        executor.submit(() -> { fetchUrl(...); }));
}
```

**Pinning issue**: nếu code synchronized hoặc gọi native method, virtual thread bị **pin** với carrier thread → giảm hiệu quả. Java 24 đang giải quyết.

### 13.6 Async/await — Python, Rust, JS, C#

Coroutine cooperative: function `async` trả về `Future`/`Promise`, `await` nhả quyền điều khiển:

```python
async def fetch(url):
    async with httpx.AsyncClient() as c:
        return await c.get(url)
```

```rust
async fn fetch(url: &str) -> Result<String> {
    let res = reqwest::get(url).await?;
    res.text().await
}
```

Khác goroutine:
- Cần executor riêng (`asyncio` Python, `tokio`/`async-std` Rust).
- **Function colored** — sync code không gọi được async (và ngược lại không trực tiếp).
- Trade-off: zero-cost ở Rust nhưng phức tạp; dễ ở Python nhưng có overhead.

### 13.7 Python GIL — ngoại lệ

Đã nói ở 8.5. Tóm:
- 1 process = 1 GIL = 1 thread Python bytecode tại một thời điểm.
- I/O-bound: thread OK (nhả GIL khi I/O).
- CPU-bound: dùng `multiprocessing` (mỗi process GIL riêng), hoặc native extension (NumPy nhả GIL), hoặc Python 3.13+ no-GIL build.

### 13.8 Actor model — Erlang/Elixir

- Mọi thứ là actor — process nhẹ (vài KB).
- Actor có mailbox, nhận message bất đồng bộ.
- Không có shared state.
- Erlang chạy hàng triệu actor mượt — nền tảng WhatsApp, Discord.
- "Let it crash" philosophy: actor lỗi → supervisor restart.

### 13.9 Bảng tổng kết concurrency

| Ngôn ngữ | Mô hình | Đơn vị | Cost | Tận dụng đa core |
|---|---|---|---|---|
| **C/C++** | OS Thread | pthread | ~1MB stack | Có |
| **Java (cũ)** | OS Thread + shared mem | Thread | ~1MB stack | Có |
| **Java 21+** | Virtual Thread | VT | vài KB | Có |
| **Go** | Goroutine + Channel (CSP) | goroutine | 2KB stack | Có |
| **Rust** | OS Thread / async-await | std::thread / Future | tuỳ | Có |
| **Node.js** | Event loop + Worker | 1 main thread + pool | — | Hạn chế (qua cluster/worker) |
| **Python** | Thread (GIL) / asyncio | Thread/coroutine | — | Không trong 1 process |
| **Erlang/Elixir** | Actor | Process | vài KB | Có |
| **C#** | Thread / async-await | Task | — | Có |

---

## 18. Bảng tổng kết so sánh

### 18.1 Execution strategy

| Ngôn ngữ | Compile | Runtime | Output |
|---|---|---|---|
| C/C++ | AOT | Tối thiểu (libc) | Native binary |
| Rust | AOT (LLVM) | Tối thiểu | Native binary |
| Go | AOT | Lớn (GC, scheduler) | Native binary, static link |
| Java | AOT bytecode + JIT runtime | JVM | `.class` chạy trên JVM |
| C# | AOT bytecode + JIT | CLR | `.dll`/`.exe` IL |
| Python | Lazy compile → `.pyc` | CPython VM | Interpret |
| Node.js | JIT in-memory | V8 + libuv | Không artifact |
| Ruby | Bytecode + JIT (YJIT) | MRI/YARV | Interpret |
| Lua | Bytecode + JIT (LuaJIT) | Lua VM | Interpret/JIT |

### 18.2 Memory management

| Ngôn ngữ | Cơ chế | Phát hiện cycle | Pause |
|---|---|---|---|
| C/C++ | Manual / RAII | — | Không |
| Rust | Ownership | — | Không |
| Go | Tri-color concurrent MS + escape | Có | < 1ms |
| Java (G1/ZGC) | Generational | Có | 1ms - 100ms |
| Python | Refcount + cycle collector | Có | gần 0 |
| Node.js | Generational (Scavenge + MSC) | Có | 1-100ms |

### 18.3 Type system

| Ngôn ngữ | Static/Dyn | Strong/Weak | Nominal/Struct |
|---|---|---|---|
| C | Static | Weak | Nominal |
| C++ | Static | Weak | Nominal |
| Rust | Static | Strong | Nominal |
| Go | Static | Strong | Struct (interface) |
| Java | Static | Strong | Nominal |
| Python | Dynamic | Strong | Duck (structural) |
| JS | Dynamic | Weak | Struct (duck) |
| TypeScript | Static (gradual) | Strong | Structural |

### 18.4 Concurrency

| Ngôn ngữ | Mặc định | Đa core thực | Đặc trưng |
|---|---|---|---|
| C/C++ | pthread | Có | Manual, lock-heavy |
| Rust | std::thread + async | Có | Send/Sync compile-time enforce |
| Go | Goroutine + Channel | Có | M:N, CSP |
| Java | Thread (+ Virtual từ 21) | Có | shared mem + locks |
| Python | Thread (GIL) + asyncio | Không trong 1 process | multiprocessing để bypass |
| Node.js | Event loop | Hạn chế (Worker/cluster) | Async-first |
| Erlang | Actor (BEAM process) | Có | Immutable + message passing |

---

## Kết

| Ưu tiên | Lựa chọn |
|---|---|
| **Performance tối đa, control bare-metal** | C, C++, Rust |
| **Memory safety không GC** | Rust |
| **Concurrency dễ, startup nhanh, deploy đơn giản** | Go |
| **Ecosystem JVM, enterprise, JIT optimization** | Java, Kotlin, Scala |
| **Prototyping nhanh, data science, ML** | Python |
| **Full-stack web, ecosystem npm** | TypeScript / Node.js |
| **Massive concurrency, fault-tolerance** | Erlang, Elixir |
| **Pure FP, type safety cực đoan** | Haskell, OCaml |
| **Mobile native** | Swift (iOS), Kotlin (Android) |

