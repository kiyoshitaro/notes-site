---
title: "Foreign Function Interface"
pubDate: "2025-10-25"
published: true
contents_table: true
pinned: false
description: "Ghi chú về FFI — nhúng code native (C ABI, dlopen, JNI/JNA/Panama) vào ngôn ngữ bậc cao, kèm case study (Paladin) mổ xẻ một hệ 3 ngôn ngữ chạy chung một tiến trình."
cat: "architecture"
useKatex: false
---

# Foreign Function Interface

## Nhúng code native vào ngôn ngữ bậc cao (FFI)

Bài toán tổng quát: **một ngôn ngữ có runtime nặng** (Java, Python, Node, C#, Ruby, Go) muốn **gọi vào code biên dịch sẵn ra máy** (`.so` / `.dylib` / `.dll` viết bằng C, C++, Rust, Zig, hoặc chính Go). Tên gọi chung là **FFI — Foreign Function Interface**.

### Vì sao gọi hàm giữa hai ngôn ngữ lại khó?

Trực giác đầu tiên hay sai: "cuối cùng thì cả hai đều thành lệnh máy, CPU đâu biết ngôn ngữ nào — gọi nhau phải dễ chứ?"

Đúng là **CPU không phải vấn đề**. Một lời gọi hàm chỉ là lệnh `call` nhảy tới một địa chỉ. Cái khó nằm ở **runtime bao quanh** hàm đó — những thứ ngôn ngữ bậc cao làm hộ bạn và **không tồn tại ở phía C**:

| Ngôn ngữ bậc cao lo hộ                                | Ở phía C ABI thì                                     |
| ----------------------------------------------------- | ---------------------------------------------------- |
| GC dọn rác, object có thể **bị di chuyển**            | không ai dọn, địa chỉ **phải đứng yên**              |
| Exception ném xuyên stack                             | chỉ có **giá trị trả về**                            |
| String có độ dài, có encoding                         | `char*` kết thúc bằng byte `\0`, không biết encoding |
| Kiểu được kiểm tra lúc biên dịch                      | chỉ có **bytes ở đúng thanh ghi/offset**             |
| Thread do runtime quản lý (goroutine, virtual thread) | thread của OS, có TLS riêng, `errno` riêng           |
| Bounds check, null check                              | truy cập sai → **segfault cả tiến trình**            |

⟹ FFI không phải bài toán "nhảy vào địa chỉ đúng", mà là **bài toán dịch hợp đồng giữa hai runtime**. Mọi cơ chế bên dưới (JNI, JNA, Panama, cgo, P/Invoke) đều chỉ đang giải đúng một việc: **thu xếp bộ nhớ, thread, và lỗi sao cho hai runtime không giẫm chân nhau**.

#### Vì sao lại phải nhúng native (4 động cơ thật)

1. **Tái dùng thư viện đã có** — SQLite, OpenSSL, FFmpeg, RocksDB, BLAS/LAPACK, libsecp256k1, driver HSM (PKCS#11). Viết lại bằng Java/Python là hàng người-năm và sẽ **chậm hơn, sai nhiều hơn**.
2. **Hiệu năng cho vòng lặp nóng** — SIMD, crypto, nén, codec. Phần "nóng" chỉ chiếm ~1% code nhưng ~90% thời gian.
3. **Chạm phần cứng / API của OS** — ioctl, netlink, GPU, TPM, thiết bị nhúng — thứ không phơi ra qua thư viện chuẩn.
4. **Ghép nhiều ngôn ngữ / cơ chế plugin** — mỗi phần viết bằng ngôn ngữ hợp với nó, và cho bên thứ ba cắm thêm module mà **không phải build lại sản phẩm**.

**Khi nào ĐỪNG nhúng**: khi lời gọi **nhỏ mà cực nhiều** (chi phí qua biên nuốt hết lợi ích); khi code phía kia **không đáng tin** (nó segfault là chết cả host); khi bạn **cần hot-reload**; khi bạn phải hỗ trợ nhiều nền tảng nhưng **không có CI matrix** để build đủ tổ hợp OS × kiến trúc × libc.

### Vì sao mẫu số chung luôn là C?

Không phải vì C hay, mà vì **C ABI là giao thức duy nhất mọi thứ đều nói**: mọi compiler, mọi linker, mọi OS, mọi ngôn ngữ đều biết cách phát ra và tiêu thụ nó. Nó đóng vai trò "TCP/IP của việc gọi hàm".

**API ≠ ABI** — phân biệt này là gốc của rất nhiều bug khó:

- **API** (Application Programming Interface): hợp đồng ở **mức source** — tên hàm, kiểu tham số. Đổi API → **biên dịch lại là xong**.
- **ABI** (Application Binary Interface): hợp đồng ở **mức nhị phân** — tham số nằm ở **thanh ghi nào**, struct **padding ra sao**, ai dọn stack, tên symbol được mã hoá thế nào. Đổi ABI mà không build lại → **chạy vẫn được một lúc rồi hỏng ngẫu nhiên**, không có lỗi biên dịch nào cảnh báo.

```text
int add(int a, int b)  →  ABI SysV AMD64 (Linux/macOS x86-64):
     a → RDI      b → RSI      kết quả → RAX
                  (Windows x64 lại là RCX, RDX → cùng source, KHÁC ABI)
```
⟹ Mọi ngôn ngữ khi muốn nói chuyện với thế giới bên ngoài đều **tự hạ mình xuống C ABI**.

Nhưng phải thấy rõ **C ABI giỏi đúng một việc và tệ ở mọi việc còn lại** — bảng này quyết định gần như toàn bộ cách thiết kế biên ở các mục sau:

|                                  | **C ABI**                             | **kênh có schema** (protobuf/gRPC…) |
| -------------------------------- | ------------------------------------- | ----------------------------------- |
| Truyền số, chuỗi                 | ✅                                    | ✅                                  |
| Struct lồng nhau, list, optional | ❌ phải khớp layout từng byte         | ✅                                  |
| Ai giải phóng bộ nhớ?            | ❌ tự thoả thuận, dễ leak/double-free | ✅ không phải nghĩ                  |
| Lỗi có cấu trúc                  | ❌ chỉ có mã trả về `int`             | ✅                                  |
| Thêm field mà không vỡ           | ❌ **vỡ nhị phân im lặng**            | ✅                                  |
| Chi phí mỗi lời gọi              | **~10 ns**                            | ~10–100 µs                          |

⟹ Đọc bảng theo chiều dọc: C ABI **nhanh hơn ba bậc độ lớn** nhưng **không có gì để diễn đạt dữ liệu phức tạp**. Kết luận thực dụng xuất hiện ngay từ đây, và sẽ quay lại ở phần _practice_: **dùng C ABI cho vài lời gọi nhỏ, ổn định; dữ liệu thật thì cho đi qua kênh có schema**.

### Bức tranh phân tầng

```text
┌─ NGÔN NGỮ BẬC CAO (runtime: GC, exception, thread pool) ──────────┐
│   Java / Python / Node / C# / Ruby / Go                           │
├─ LỚP CẦU (binding) — nơi mọi khác biệt được dịch ─────────────────┤
│  ① glue C tự viết      : JNI, CPython C-API, Node-API, Ruby ext   │
│  ② khai báo lúc chạy   : JNA, ctypes, LuaJIT FFI  (nền libffi)    │
│  ③ FFI có kiểu, dựng sẵn: Panama (Java), P/Invoke (.NET), cffi    │
├─ C ABI ─── tham số vào thanh ghi nào, struct layout, tên symbol ──┤
├─ THƯ VIỆN NATIVE: libfoo.so / .dylib / .dll  (C, C++, Rust, Go)   │
├─ DYNAMIC LOADER (ld.so): tìm file → mmap → relocate → resolve sym │
└─ KERNEL: mmap vào address space của CHÍNH tiến trình host ────────┘
                    ↑ đúng vùng "Mapped regions" ở phần Layout Address space
```

Điểm mấu chốt của cả bức tranh: `.so` được map vào **address space của chính host**, không phải một chỗ nào khác. Từ đó suy ra hết mọi hệ quả — nhanh (chỉ một lệnh `call`), nhưng **chung heap, chung fd, chung số phận khi crash**.

### Ba cách bắc cầu — trục "ai viết code cầu nối"

#### ① Glue C tự viết — JNI (Java), C-API (CPython), Node-API

Bạn viết một lớp C ở giữa, biết chi tiết cả runtime bậc cao lẫn thư viện native.

```java
// MathJNI.java
public class MathJNI {
    static { System.loadLibrary("mathjni"); }   // → libmathjni.so
    public static native int add(int a, int b);
}
```

```bash
javac -h . MathJNI.java      # sinh MathJNI.h với tên symbol đã mã hoá
```

```c
// mathjni.c — glue: tên hàm PHẢI đúng khuôn Java_<package>_<class>_<method>
#include <jni.h>
JNIEXPORT jint JNICALL Java_MathJNI_add(JNIEnv *env, jclass cls, jint a, jint b) {
    return a + b;                                  // gọi tiếp vào lib thật ở đây
}
```

- **Được**: nhanh nhất, kiểm soát tối đa (pin mảng, tạo object Java, ném exception Java).
- **Mất**: phải viết + build thêm **một thư viện C nữa**; symbol **buộc dính tên package/class** → đổi tên class là phải sửa C; sai một dòng là segfault chứ không phải exception.
- **Dùng khi**: lời gọi cực nhiều, cần hiệu năng tối đa, hoặc cần thao tác sâu vào object của runtime (sqlite-jdbc, netty-tcnative, LWJGL, RocksDB JNI đều đi đường này).

#### ② Khai báo lúc chạy — JNA (Java), ctypes (Python)

Không viết C dòng nào. Chỉ **mô tả chữ ký hàm**, thư viện binding (nền **libffi**) tự dựng khung stack và nhét tham số vào thanh ghi **lúc chạy**.

```java
public interface MathLib extends Library {
    MathLib INSTANCE = Native.load("mathlib", MathLib.class);   // → dlopen("libmathlib.so")
    int add(int a, int b);
}
int r = MathLib.INSTANCE.add(3, 4);
```

- **Được**: không có bước build native nào thêm; nạp `.so` **bất kỳ theo đường dẫn lúc chạy** → đây là lý do các hệ plugin hay chọn JNA: lúc build, host **chưa biết** sẽ nạp thư viện nào.
- **Mất**: chậm hơn JNI khoảng một bậc độ lớn (có `Native.register` — _direct mapping_ — để rút ngắn); khai báo sai kiểu thì **không ai báo lỗi**, chỉ đọc nhầm rác.
- **Dùng khi**: bề mặt native nhỏ, gọi thưa, và **danh tính thư viện chỉ biết lúc chạy**.

#### ③ FFI có kiểu, dựng sẵn trong runtime — Panama (Java 22+), P/Invoke (.NET)

Thế hệ mới: FFI là **một phần của ngôn ngữ**, có kiểu, có quản lý vòng đời bộ nhớ (`Arena`), tốc độ xấp xỉ JNI.

```java
// Java 22+ : java.lang.foreign (JEP 454, FFM API)
try (Arena arena = Arena.ofConfined()) {                 // vùng nhớ có vòng đời rõ ràng
    SymbolLookup lib = SymbolLookup.libraryLookup("libmathlib.so", arena);
    MethodHandle add = Linker.nativeLinker().downcallHandle(
            lib.find("add").orElseThrow(),
            FunctionDescriptor.of(JAVA_INT, JAVA_INT, JAVA_INT));
    int r = (int) add.invokeExact(3, 4);
}                                                        // hết scope → bộ nhớ native được giải phóng
```

`jextract` đọc file `.h` sinh sẵn binding, nên không phải gõ tay `FunctionDescriptor`. Bên .NET tương đương là `[LibraryImport]`/`[DllImport]` + `NativeLibrary.Load`.

#### Bảng chọn

|                          | **JNI** (glue C)            | **JNA** (libffi)       | **Panama / P-Invoke**      |
| ------------------------ | --------------------------- | ---------------------- | -------------------------- |
| Ai viết cầu nối          | **bạn**, bằng C             | không ai, chỉ khai báo | không ai (hoặc `jextract`) |
| Bước build thêm          | có (compile `.so` glue)     | **không**              | **không**                  |
| Tốc độ (tương đối)       | ★★★                         | ★                      | ★★★                        |
| Nạp `.so` tuỳ ý lúc chạy | vụng                        | **rất tự nhiên**       | tự nhiên                   |
| An toàn kiểu             | thấp (C thuần)              | thấp (khai báo tay)    | **có kiểu, có `Arena`**    |
| Yêu cầu                  | mọi JDK                     | mọi JDK + jar JNA      | **JDK 22+**                |
| Hợp với                  | thư viện lõi, gọi triệu lần | **plugin, bề mặt nhỏ** | dự án mới, thay dần JNI    |

Cách chọn nhanh: **hợp đồng chỉ vài hàm + tên thư viện chỉ biết lúc chạy** ⟹ JNA (chọn JNI ở đây chỉ tốn thêm một lớp C mà không được gì). **Gọi triệu lần/giây** ⟹ JNI hoặc Panama. **Dự án mới trên JDK 22+** ⟹ Panama, không có lý do gì viết JNI mới nữa.

#### Chi phí qua biên — bậc độ lớn cần thuộc

| Kiểu gọi                              | Bậc độ lớn       |
| ------------------------------------- | ---------------- |
| Gọi hàm trong cùng ngôn ngữ           | **~1 ns**        |
| JNI / Panama, tham số nguyên thuỷ     | **~10 ns**       |
| JNA interface mapping                 | **~100–1000 ns** |
| Qua Unix socket + protobuf (cùng máy) | **~10–50 µs**    |
| Qua TCP localhost + gRPC              | **~50–200 µs**   |

_(số tương đối, tuỳ máy/JDK — điều đáng nhớ là **khoảng cách giữa các bậc**, không phải con số.)_

⟹ Suy ra thẳng một nguyên tắc thiết kế: **biên phải "thô" (coarse-grained)**. Một lời gọi làm nhiều việc luôn thắng một nghìn lời gọi vụn. Gọi JNA 1 triệu lần/giây là tự sát; gọi 100 lần/giây thì chênh lệch JNI ↔ JNA **không đo được**.

### Nạp thư viện: 3 thời điểm ràng buộc

Cùng một `.so`, khác nhau ở **lúc nào mới biết tới nó**:

|                  | Static link (`.a`)      | Dynamic link (load-time) | **`dlopen` (run-time)**        |
| ---------------- | ----------------------- | ------------------------ | ------------------------------ |
| Biết tới lúc nào | **lúc build**           | **lúc khởi động**        | **lúc đang chạy**              |
| Ghi ở đâu        | nhét thẳng vào binary   | `DT_NEEDED` trong ELF    | **chỉ là một chuỗi đường dẫn** |
| Thiếu file thì   | không thể xảy ra        | **không khởi động được** | bắt lỗi được, chạy tiếp        |
| Đổi thư viện     | build lại tất cả        | thay file + restart      | **thay file trong config**     |
| Là nền của       | binary tĩnh, distroless | libc, libssl…            | **PLUGIN**                     |

```c
void *h = dlopen(path, RTLD_NOW | RTLD_LOCAL);   // ① nạp file THEO ĐƯỜNG DẪN
if (!h) fprintf(stderr, "%s\n", dlerror());      //    lỗi lấy qua dlerror(), KHÔNG phải errno
int (*fn)(int) = dlsym(h, "Compute");            // ② tra symbol THEO TÊN ← chính là hợp đồng
```

- `RTLD_NOW` resolve hết symbol ngay ⟹ **sai là biết liền** (nên dùng cho plugin) — `RTLD_LAZY` để dành đến lúc gọi mới nổ, giữa production.
- `RTLD_LOCAL` (mặc định) giữ symbol riêng cho thư viện đó; `RTLD_GLOBAL` phơi ra cho các thư viện nạp sau ⟹ **rất dễ gây đụng tên** khi hai plugin cùng có `init()`. Với plugin: **luôn LOCAL**.
- `dlclose` **thường không thật sự gỡ** thư viện ra khỏi bộ nhớ (còn TLS, còn atexit handler, và `.so` do Go sinh ra thì không unload được) ⟹ đừng thiết kế hot-reload dựa vào nó.

**Tìm `.so` ở đâu** (thứ tự trên Linux): `LD_PRELOAD` → `DT_RPATH` → `LD_LIBRARY_PATH` → `DT_RUNPATH` → cache `/etc/ld.so.cache` → `/lib`, `/usr/lib`. Dùng `$ORIGIN` trong RUNPATH để trỏ "cạnh file binary" mà không phụ thuộc thư mục cài.

#### Bản tối giản: plugin thật sự là gì

Bỏ hết framework, giữ đúng xương sống. Host **không biết gì** về plugin lúc build, chỉ biết hợp đồng "có một hàm tên `Compute` nhận `int` trả `int`":

```c
// host.c   →   gcc -o host host.c -ldl
void *lib = dlopen(argv[1], RTLD_NOW);          // ① nạp file theo ĐƯỜNG DẪN, lúc chạy
int (*Compute)(int) = dlsym(lib, "Compute");    // ② tra symbol theo TÊN ← hợp đồng nằm ở đây
printf("%d\n", Compute(7));                     // ③ gọi vào code người khác viết
```

```go
// plugin.go  →  CGO_ENABLED=1 go build -buildmode=c-shared -o double.so .
package main
import "C"
//export Compute
func Compute(x C.int) C.int { return x * 2 }
func main() {}
```

```text
$ host ./double.so   →  14        # đổi plugin, KHÔNG build lại host
$ host ./square.so   →  49

$ strings host | grep -c 'double\|square'  →  0    ← host không hề nhắc tới plugin
$ ldd     host | grep -c 'double\|square'  →  0    ← không phụ thuộc động vào chúng
```

⟹ Toàn bộ "cơ chế plugin" chỉ có vậy: **một chuỗi đường dẫn + một chuỗi tên symbol**. Mọi framework plugin phức tạp về sau đều chỉ là ba dòng này cộng thêm quy ước về vòng đời, phiên bản và cách truyền dữ liệu.

### Bảy cái bẫy phải chú ý

Đây là phần "cần chú ý gì" — gần như mọi sự cố production về FFI đều rơi vào một trong bảy ô này.

#### 1. Sở hữu bộ nhớ: ai cấp phát, ai giải phóng?

Quy tắc sống còn: **bộ nhớ phải được giải phóng bằng đúng allocator đã cấp phát nó**. Host và `.so` có thể dùng heap khác nhau (khác libc, khác runtime, khác CRT trên Windows) ⟹ `free()` chéo là **hỏng heap**, và triệu chứng hiện ra ở chỗ khác hoàn toàn.

```c
char *greet(const char *name);   // lib cấp phát
void  greet_free(char *p);       // ← BẮT BUỘC có hàm đối xứng, đừng bắt caller gọi free()
```

Ba mẫu an toàn, chọn một và ghi rõ trong hợp đồng:

- **Caller cấp buffer**: `int greet(const char *name, char *out, size_t out_len)` — an toàn nhất, không ai phải nhớ free.
- **Lib cấp + hàm free đối xứng** (như trên).
- **Copy ngay rồi trả lại**: nhận con trỏ → copy sang vùng của host → gọi free ngay trong cùng một khối.

Bẫy JNA rất hay dính: khai báo hàm trả `String` thì JNA **copy chuỗi sang JVM nhưng không bao giờ free buffer C** → rò rỉ âm thầm. Phải khai báo trả `Pointer`:

```java
Pointer p = LIB.greet("hung");
String s  = p.getString(0);      // copy sang JVM heap
LIB.greet_free(p);               // trả về đúng allocator đã cấp
```

Bản ctypes cũng đúng bẫy đó (`c_char_p` tự copy, mất con trỏ gốc):

```python
lib.greet.restype = ctypes.c_void_p        # KHÔNG dùng c_char_p nếu còn phải free
p = lib.greet(b"hung")
s = ctypes.cast(p, ctypes.c_char_p).value
lib.greet_free(ctypes.c_void_p(p))
```

#### 2. GC di chuyển object — đừng giữ con trỏ vào heap có GC

Heap của JVM/Go/Python **được nén và di dời**. Một địa chỉ hợp lệ hôm nay có thể trỏ vào rác sau lần GC kế tiếp.

- **Java**: chỉ được dùng địa chỉ mảng trong vùng "critical" cực ngắn (`GetPrimitiveArrayCritical`, và nó có thể **chặn GC** ⟹ tuyệt đối không I/O trong đó). Muốn giữ lâu: dùng **bộ nhớ off-heap** — `ByteBuffer.allocateDirect` / `Arena.allocate` của Panama — vì nó **không bị GC di chuyển**. Tham chiếu object phải nâng lên `NewGlobalRef` mới sống qua lời gọi (và nhớ `DeleteGlobalRef`, nếu không là leak kiểu khác).
- **Go**: luật cgo — **không được lưu con trỏ Go ở phía C sau khi lời gọi kết thúc**, và không truyền con trỏ Go trỏ tới vùng chứa con trỏ Go. Cách đúng là `runtime/cgo.Handle`: đưa qua biên một **số nguyên đại diện**, phía Go tra ngược ra object.
- **Python**: object chỉ sống nhờ refcount ⟹ `Py_INCREF` trước khi giữ, và mọi thao tác với object phải **giữ GIL** (`PyGILState_Ensure`).

⟹ Nguyên tắc chung: **qua biên chỉ truyền (con trỏ tới bộ nhớ off-heap + độ dài)** hoặc **handle opaque**. Đừng bao giờ để phía native cầm địa chỉ vào heap có GC.

#### 3. Thread và signal — hai runtime cùng đòi quản lý

- Thread do **native tự tạo** thì runtime bậc cao **không biết nó tồn tại**: muốn gọi ngược về Java phải `AttachCurrentThread` (và `DetachCurrentThread` khi xong, không thì leak); muốn gọi về Python phải giành GIL.
- **Blocking**: gọi một hàm native chạy lâu sẽ **giữ chặt thread của host**. Trên JVM nó chặn cả GC ở safepoint; với virtual thread thì nó **pin** carrier thread. Nếu hàm native là một **vòng lặp chính** (kiểu `int Run(...)` chạy tới lúc tắt máy) thì phải ném hẳn sang thread riêng:
  ```java
  CompletableFuture.runAsync(() -> {
      int rc = LIB.Run(target, id);                 // blocking tới lúc shutdown
      if (rc != 0) throw new RuntimeException("native returned rc=" + rc);
  });
  ```
  ⟹ Lúc đó thư viện native **không còn là "thư viện bị gọi hàm"** mà là **một service sống trong tiến trình của host** — cách nghĩ này đổi hẳn thiết kế vòng đời (ai gọi `Stop`, chờ bao lâu, xử lý rc ra sao).
- **Signal**: Go runtime và JVM **đều cài signal handler** cho `SIGSEGV`, `SIGPROF`, `SIGURG`… Nạp nhiều `.so` Go vào một JVM nghĩa là nhiều bộ handler chồng lên nhau (chúng có chuỗi lại handler cũ, nhưng đây là nguồn của những crash "không thể tái hiện").
- **Nhiều runtime cùng tồn tại**: mỗi `.so` build bằng `-buildmode=c-shared` mang theo **một Go runtime riêng** — scheduler riêng, GC riêng, vùng heap riêng. Nạp ba plugin Go vào một JVM nghĩa là trong **một tiến trình** có **JVM + ba Go runtime** chạy song song. Vẫn chạy được, nhưng phải biết để còn tính RAM, đặt `GOMAXPROCS`, và đọc stack trace cho đúng.
- `errno` là **thread-local** ⟹ phải đọc ngay sau lời gọi, trên đúng thread đó (JNA: `Native.getLastError()`).

#### 4. Lỗi không được vượt biên

Cơ chế unwind stack của C++/Rust/Go **không tồn tại** ở phía C ABI. Cho panic/exception thoát qua biên là **hành vi không xác định** (thường thẳng ra abort).

- C++: `try { … } catch (...) { return ERR; }` ở hàm ngoài cùng.
- Rust: `std::panic::catch_unwind`.
- Go: `defer func(){ recover() }()` trong đúng hàm `//export`.
- JNI: sau mỗi lời gọi JNI phải `ExceptionCheck()` — exception Java **không tự dừng code C**, nó chỉ "đang treo" và sẽ nổ ở chỗ khó hiểu hơn.

Quy ước biên nên dùng: **trả `int rc` (0 là thành công), kèm out-param `char **err`** cho thông điệp lỗi — rồi phía host dịch `rc != 0` thành exception đúng kiểu của ngôn ngữ mình.

#### 5. Kiểu dữ liệu và layout

- `long` là **64-bit trên Linux/macOS (LP64)** nhưng **32-bit trên Windows (LLP64)** ⟹ dùng `int64_t`/`int32_t`, đừng bao giờ dùng `long` trên biên.
- `bool`, `enum`, `size_t` có kích thước tuỳ nền tảng; `struct` có **padding theo alignment** ⟹ nếu buộc phải truyền struct thì cố định bằng `#pragma pack` hoặc khai báo lại từng field bên host (JNA `Structure` + `getFieldOrder`).
- Chuỗi: C dùng **NUL-terminated**, Java dùng **UTF-16 có độ dài** ⟹ mỗi lần đi qua là một lần **copy + chuyển encoding**. Chuỗi chứa byte `\0` sẽ **bị cắt cụt** âm thầm. Dữ liệu nhị phân thì luôn dùng **(con trỏ, độ dài)**, đừng dùng `char*`.
- Con trỏ hàm callback phải đúng calling convention (`stdcall` vs `cdecl` trên Windows 32-bit).

⟹ Đây chính là ô "❌ struct lồng nhau" trong bảng _C ABI ↔ kênh có schema_ ở trên. Giải pháp thực dụng: **đừng mô tả struct qua biên** — serialize (protobuf/flatbuffers/JSON/CBOR) hoặc dùng handle opaque.

#### 6. Cách ly & bảo mật: `.so` là code chạy full quyền của host

Nạp một `.so` = cho nó **toàn quyền của tiến trình**: đọc mọi biến, mọi fd, mọi secret trong RAM, gọi mọi syscall. Không có sandbox nào ở đây.

- **Không bao giờ `dlopen` đường dẫn do người dùng nhập vào**. Chỉ nạp từ thư mục do admin cấu hình, quyền ghi hạn chế.
- Xác minh **checksum/chữ ký** file trước khi nạp nếu là plugin bên thứ ba.
- Cảnh giác `LD_PRELOAD`/`LD_LIBRARY_PATH` bị chèn (đây là kỹ thuật hijack kinh điển); tiến trình setuid thì loader tự bỏ qua các biến đó.
- Một segfault trong plugin **kill cả host** — không có chuyện "restart riêng plugin". Nếu code không đáng tin ⟹ xem mục _Chọn điểm nào_ bên dưới: **đẩy ra tiến trình riêng**.

#### 7. Build & phân phối: một `.so` không chạy mọi nơi

Đây là chỗ ngốn thời gian nhất trong thực tế, và hay bị phát hiện muộn.

- **Tổ hợp cần build** = `OS × kiến trúc × libc`: `linux-x86_64-glibc`, `linux-aarch64-glibc`, `linux-x86_64-musl` (Alpine!), `darwin-arm64`, `darwin-x86_64`, `windows-x86_64`.
- **glibc có symbol versioning** ⟹ build trên Ubuntu mới, chạy trên máy cũ sẽ báo `GLIBC_2.34 not found`. Cách chuẩn: **build trên bản phân phối cũ nhất cần hỗ trợ** (đúng ý tưởng của `manylinux` bên Python), hoặc link tĩnh với musl / dùng `zig cc` để chọn phiên bản glibc đích.
- **Alpine dùng musl** ⟹ `.so` build với glibc sẽ lỗi "not found" dù file nằm sờ sờ ở đó (thực ra thiếu là **loader**, không phải thư viện).
- **macOS** cần codesign/notarize, và `.dylib` phải khai `@rpath` đúng (`install_name_tool -change`).
- **Đóng gói**: chuẩn công nghiệp là nhúng `.so` vào artifact rồi **giải nén ra thư mục tạm lúc chạy** — JNA tự tìm resource theo tên `/{os}-{arch}/libfoo.so` trong classpath; sqlite-jdbc, netty đều làm vậy. Lúc đó dùng `System.load(<đường dẫn tuyệt đối>)`, **không phải** `System.loadLibrary` (hàm này chỉ tìm trong `java.library.path`).
- Lưu ý JVM: **một thư viện chỉ được nạp bởi một classloader** — nạp lại từ classloader khác sẽ `UnsatisfiedLinkError: already loaded in another classloader` (rất hay gặp khi redeploy trong app server).

### Practice thiết kế biên — 8 quy tắc

Rút gọn thành checklist áp dụng được ngay, đúng theo thứ tự ưu tiên:

1. **Biên phải nhỏ và ổn định.** Đếm số hàm phơi ra: càng ít càng tốt — các hệ plugin thiết kế tốt thường chỉ phơi **2–3 hàm** (kiểu `Run` / `Stop`, hoặc `open` / `call` / `close`). Mỗi hàm thêm vào là một hợp đồng nhị phân **phải giữ mãi mãi**.
2. **Biên phải thô (coarse-grained).** Gộp nhiều việc vào một lời gọi. `processBatch(items, n)` thay vì gọi `processOne()` n lần — xem lại bảng chi phí ở trên.
3. **Chỉ dùng kiểu nguyên thuỷ + (con trỏ, độ dài) + handle opaque.** Không struct, không object, không con trỏ lồng nhau.
4. **Handle-based API.** Trả `void*` hoặc `int64` opaque cho trạng thái; host chỉ giữ và trả lại, không bao giờ nhìn vào trong.
   ```c
   Ctx*  ctx_open(const char *cfg_json, char **err);
   int   ctx_do(Ctx *c, const uint8_t *in, size_t in_len,
                uint8_t **out, size_t *out_len, char **err);   // out do lib cấp
   void  ctx_free_buf(uint8_t *p);                             // ĐỐI XỨNG
   void  ctx_close(Ctx *c);                                    // idempotent
   ```
5. **Đối xứng và idempotent.** Có `open` thì có `close`; có `alloc` thì có `free`. `close` gọi hai lần không được sập.
6. **Đánh version hợp đồng.** Thêm `uint32_t abi_version(void)` và kiểm tra ngay sau khi `dlopen`; hoặc dùng struct vtable có field `size` ở đầu để bên nhận biết mình đang cầm phiên bản nào. **Thêm hàm mới thay vì đổi chữ ký hàm cũ** — đổi chữ ký là vỡ nhị phân im lặng.
7. **Hạn chế callback từ native gọi ngược về host.** Nếu bắt buộc: nói rõ callback chạy trên **thread nào**, có được phép gọi lại vào lib không (reentrancy), và **cấm ném exception** trong đó.
8. **Tách hai kênh: bootstrap đi qua C ABI, dữ liệu đi qua kênh có schema.** Đây là mẫu quan trọng nhất trong cả mục này, và là cách thoát khỏi mọi ô "❌" của bảng _C ABI ↔ kênh có schema_.

#### Mẫu "hai kênh" — đáng nhớ nhất

Thay vì cố nhồi dữ liệu phức tạp qua C ABI, hãy dùng C ABI **đúng một việc: bắt tay**, rồi chuyển hết sang một kênh có schema.

```text
┌─ KÊNH 1: BOOTSTRAP — qua C ABI ────────────────────────────────┐
│  host ──dlopen──▶ libplugin.so                                 │
│  chỉ truyền được int và char*                                   │
│  → dùng ĐÚNG một việc: nói "gọi về đâu" + "mày là ai"          │
│      int Run(const char *endpoint, const char *my_id);         │
│      void Stop(const char *my_id);                             │
└────────────────────────────────────────────────────────────────┘
┌─ KÊNH 2: DỮ LIỆU — protobuf/gRPC trên Unix socket ─────────────┐
│  mọi thứ thật: config, request, response, stream sự kiện       │
│  có schema, có version, có lỗi cấu trúc, không phải nghĩ về free│
└────────────────────────────────────────────────────────────────┘
```

Luồng chạy: host `dlopen` thư viện → gọi `Run(endpoint, id)` (**blocking**, chạy ở thread riêng) → phía native **dial ngược** về `endpoint`, gửi một message `REGISTER` kèm `id`, rồi phục vụ stream hai chiều. Từ giây đó trở đi, **C ABI không còn được dùng nữa**.

Cái được của mẫu này:

- Hợp đồng nhị phân chỉ có **2 hàm** và gần như **không bao giờ phải đổi** — thêm tính năng là thêm message, không phải thêm hàm export.
- **Không có câu hỏi "ai free bộ nhớ"** trên đường dữ liệu nóng.
- Cùng một loader phục vụ được plugin viết bằng **nhiều ngôn ngữ khác nhau** — Go, Rust, C++ đều build ra `.so` cùng khuôn; thậm chí plugin **không cần là `.so`** mà là một tiến trình riêng cũng dùng lại được kênh 2 nguyên vẹn.
- Muốn đổi từ in-process sang out-of-process sau này thì **chỉ đổi kênh 1**, kênh 2 giữ nguyên.

Cái mất: thêm một chặng serialize + syscall cho mỗi request ⟹ **chỉ hợp khi lời gọi thưa và payload đáng kể**, không hợp với hàm nhỏ gọi triệu lần.

Mẫu này gặp ở khắp nơi: **HashiCorp go-plugin** (Terraform, Vault) cho plugin chạy hẳn **tiến trình riêng**, bắt tay qua stdout rồi nói chuyện bằng gRPC; **Language Server Protocol** tách IDE khỏi bộ phân tích ngôn ngữ bằng JSON-RPC; **CSI/CNI** của Kubernetes cho driver lưu trữ/mạng nói qua gRPC trên Unix socket. Cùng một triết lý: **biên nhị phân càng mỏng càng tốt, dữ liệu đi qua kênh có schema**.

### Chọn điểm nào: in-process, out-of-process, hay WASM?

|                            | **FFI trong tiến trình** (`.so`) | **Tiến trình riêng + IPC**    | **WASM** (wasmtime, wazero)            |
| -------------------------- | -------------------------------- | ----------------------------- | -------------------------------------- |
| Chi phí mỗi lời gọi        | **~10–100 ns**                   | ~10–100 µs                    | ~50–500 ns                             |
| Crash của plugin           | **giết host**                    | host sống                     | **không thoát ra được**                |
| Cách ly tài nguyên         | không                            | theo tiến trình (cgroup)      | **theo sandbox, cấp quyền tường minh** |
| Hot-reload                 | gần như không                    | **có** (restart plugin)       | **có**                                 |
| Đa nền tảng                | build từng tổ hợp                | build từng tổ hợp             | **một file chạy mọi nơi**              |
| Truy cập syscall/phần cứng | đầy đủ                           | đầy đủ                        | hạn chế (qua WASI)                     |
| Hợp với                    | code **mình tin**, gọi nhiều     | code **bên thứ ba**, gọi thưa | plugin không tin, cần portable         |

Cách chọn nhanh, theo hai câu hỏi:

1. **Tần suất gọi có cao không?** Hàng trăm nghìn lần/giây ⟹ buộc phải in-process. Vài trăm lần/giây ⟹ IPC hoàn toàn thoải mái.
2. **Có tin code phía kia không?** Không tin ⟹ đừng nạp vào address space của mình, dù nó nhanh hơn.

Ví dụ thực tế để đối chiếu: **sqlite-jdbc** gọi hàng triệu lần → JNI in-process; **Terraform provider** gọi vài trăm lần mỗi lần `apply` → tiến trình riêng + gRPC; **Envoy** cho filter của bên thứ ba → WASM sandbox; **PostgreSQL extension** là `.so` `dlopen` vào backend → cực nhanh, và đúng như dự đoán, extension lỗi thì **giết luôn backend đó**.

Sâu xa hơn, cả bảng trên chỉ là **một trục duy nhất**, và là **đúng cái trục** của mục _Phổ ảo hóa_ phía trên cũng như của "Limited Direct Execution" ở phần CPU:

```text
Cách ly mạnh ↑                                        Overhead lớn ↑
   WASM sandbox            │ lỗi bị chặn tại chỗ │ kiểm tra biên + trap
   tiến trình riêng + IPC  │ crash không lan     │ serialize + syscall
   ───────────────────────-│─────────────────────│─────────────────────
   .so dlopen (cùng process)│ crash giết host    │ chỉ một lệnh call
Cách ly yếu ↓                                         Overhead nhỏ ↓
```

⟹ **Càng để code lạ chạy trực tiếp trong không gian của mình thì càng nhanh, và càng khó kiểm soát.** Chọn điểm nào là chọn theo **mức tin cậy của code đó**, không phải theo sở thích kỹ thuật: plugin do chính mình viết thì `.so` hoàn toàn hợp lý; driver closed-source của bên thứ ba thì nên đẩy sang tiến trình riêng — vì `.so` nhanh **chỉ vì** nó nằm chung address space, và mọi nhược điểm của nó cũng là hệ quả của đúng chữ "chung" đó.

### Code vận hành thật: một `.so`, bốn host

Thư viện native — cố ý cho vào **đúng ba mẫu**: hàm thuần, hàm cấp phát bộ nhớ, hàm trả lỗi.

```c
// mathlib.c   →   gcc -O2 -shared -fPIC -o libmathlib.so mathlib.c
#include <stdlib.h>
#include <stdio.h>
#include <string.h>

int add(int a, int b) { return a + b; }                     // ① thuần, không cấp phát

char *greet(const char *name) {                             // ② lib cấp phát
    size_t n = strlen(name) + 8;
    char *out = malloc(n);
    snprintf(out, n, "hello %s", name);
    return out;
}
void greet_free(char *p) { free(p); }                       //    ← đối xứng, BẮT BUỘC

int divide(int a, int b, int *out, char **err) {            // ③ rc + out-param + err
    if (b == 0) { *err = strdup("division by zero"); return 1; }
    *out = a / b; return 0;
}
void err_free(char *p) { free(p); }
```

```bash
$ nm -D --defined-only libmathlib.so | grep ' T '    # ← hợp đồng thật sự là đây
0000000000001139 T add
0000000000001151 T divide
000000000000119a T greet
```

**Java + JNA** — không build thêm gì, chỉ khai báo:

```java
public interface MathLib extends Library {
    MathLib LIB = Native.load("mathlib", MathLib.class);      // dlopen theo jna.library.path
    int add(int a, int b);
    Pointer greet(String name);                               // Pointer, KHÔNG phải String
    void greet_free(Pointer p);
    int divide(int a, int b, IntByReference out, PointerByReference err);
    void err_free(Pointer p);
}

Pointer p = MathLib.LIB.greet("hung");
try { System.out.println(p.getString(0)); } finally { MathLib.LIB.greet_free(p); }

var out = new IntByReference(); var err = new PointerByReference();
if (MathLib.LIB.divide(7, 0, out, err) != 0) {
    Pointer e = err.getValue();
    try { throw new IllegalStateException(e.getString(0)); } finally { MathLib.LIB.err_free(e); }
}
```

```bash
java -Djna.library.path=/app/libs -cp jna.jar:. App     # nói cho JNA biết tìm .so ở đâu
```

**Java + Panama** (JDK 22+) — cùng `.so`, không cần jar nào:

```java
try (Arena arena = Arena.ofConfined()) {
    SymbolLookup lib = SymbolLookup.libraryLookup("libmathlib.so", arena);
    Linker linker    = Linker.nativeLinker();

    MethodHandle add = linker.downcallHandle(lib.find("add").orElseThrow(),
            FunctionDescriptor.of(JAVA_INT, JAVA_INT, JAVA_INT));
    System.out.println((int) add.invokeExact(3, 4));

    MethodHandle greet = linker.downcallHandle(lib.find("greet").orElseThrow(),
            FunctionDescriptor.of(ADDRESS, ADDRESS));
    MemorySegment name = arena.allocateFrom("hung");          // bộ nhớ off-heap, GC không đụng
    MemorySegment res  = ((MemorySegment) greet.invokeExact(name))
                            .reinterpret(Long.MAX_VALUE);      // con trỏ trả về chưa biết độ dài
    System.out.println(res.getString(0));
    // vẫn phải gọi greet_free — Arena chỉ quản lý bộ nhớ do CHÍNH nó cấp
}
```

**Python + ctypes** — cùng `.so`, không build gì thêm:

```python
import ctypes
lib = ctypes.CDLL("./libmathlib.so")
lib.add.argtypes, lib.add.restype = [ctypes.c_int, ctypes.c_int], ctypes.c_int
lib.greet.restype = ctypes.c_void_p          # giữ con trỏ thô để còn free được

p = lib.greet(b"hung")
print(ctypes.cast(p, ctypes.c_char_p).value.decode())
lib.greet_free(ctypes.c_void_p(p))
```

**Go — phía ngược lại: sinh ra `.so` cho người khác nạp** (đây là cách một plugin viết bằng Go được build):

```go
package main

/*
#include <stdlib.h>
*/
import "C"
import "unsafe"

//export Greet
func Greet(name *C.char) *C.char {
    s := "hello " + C.GoString(name)          // copy sang phía Go
    return C.CString(s)                       // cấp phát bằng malloc của C → host free được
}

//export GreetFree
func GreetFree(p *C.char) { C.free(unsafe.Pointer(p)) }

func main() {}                                 // bắt buộc có, và rỗng
```

```bash
CGO_ENABLED=1 go build -buildmode=c-shared -o libgreet.so .   # sinh cả libgreet.h
```

Ba điều phải nhớ ở bản Go này, và đều là hệ quả trực tiếp của các bẫy ở trên: `C.CString` cấp phát bằng **malloc của C** (nên host free được, nhưng **Go GC không dọn hộ** — quên là leak); **không được trả con trỏ vào bộ nhớ Go** ra ngoài; và `.so` này mang theo **cả một Go runtime**.

### Mổ một hệ thật: Paladin — 3 ngôn ngữ, 1 tiến trình

Các mục trên đã dựng đủ mảnh ghép: `dlopen`, mẫu hai kênh, trục cách-ly ↔ tốc độ. Mục này soi **một hệ đã ghép cả bốn mảnh lại và chạy production**: [Paladin](https://github.com/LFDT-Paladin/paladin) (LF Decentralized Trust) — nền tảng blockchain riêng tư, nơi mọi thứ mở rộng được (mô hình token, vận chuyển, module ký, xác thực RPC) đều là **plugin**.

#### Gọi đúng tên kiến trúc này

Trước khi đi vào chi tiết, đặt tên cho nó — vì có tên rồi thì mọi chi tiết phía sau sẽ vào đúng chỗ:

> **Kiến trúc vi nhân (Microkernel / Plug-in architecture), với plugin giao tiếp bằng RPC, chạy biến thể *in-process*.** : **một lõi nhỏ và ổn định, mọi tính năng cắm vào từ ngoài; lõi và plugin nói chuyện với nhau bằng bản tin có schema chứ không bằng lời gọi hàm — dù cả hai nằm chung một tiến trình.**

Nó là **ghép của 6 mẫu thiết kế có tên sẵn**, mỗi mẫu lo đúng một việc:

| Lo việc gì | Tên mẫu | Trong Paladin là gì |
| --- | --- | --- |
| Hình dạng tổng thể | **Microkernel (Plug-in) architecture** | lõi Go tối giản + 5 loại plugin cắm vào |
| Đưa mã plugin vào chạy | **Host-loaded library (FFI bootstrap)** | JNA `dlopen` file `.so`; `URLClassLoader` nạp `.jar` |
| Trao đổi dữ liệu | **RPC-based plugin** (tách *bootstrap plane* khỏi *data plane*) | 2 hàm C để bắt tay + stream protobuf cho mọi thứ còn lại |
| Bắt tay ban đầu | **Reverse connection / dial-back** | plugin được host nạp, nhưng lại là **client** gọi ngược về host |
| Điều phối, ghi danh | **Broker / plugin registry** | `PluginController` — nơi mọi plugin đăng ký và được định tuyến |
| Vỏ tiến trình | **Polyglot host process** ("shell process") | JVM chỉ làm launcher + loader, **không chứa logic nghiệp vụ** |

Bạn đã gặp đúng kiến trúc này ở nhiều nơi khác, chỉ khác chỗ plugin chạy trong hay ngoài tiến trình:

| Hệ | Plugin chạy ở đâu | Nói chuyện bằng |
| --- | --- | --- |
| **Paladin** | **trong** tiến trình host (`dlopen`) | gRPC/protobuf trên Unix socket |
| **HashiCorp go-plugin** (Terraform, Vault) | **tiến trình riêng** | gRPC |
| **LSP** (IDE ↔ bộ phân tích ngôn ngữ) | tiến trình riêng | JSON-RPC |
| **Kubernetes CSI / CNI / CRI** | tiến trình/pod riêng | gRPC trên Unix socket |
| **PostgreSQL extension**, **FUSE** in-kernel | trong tiến trình | **gọi hàm C trực tiếp** (không RPC) |

⟹ Paladin ngồi ở một ô hơi lạ: **nạp như PostgreSQL extension, nhưng nói chuyện như Terraform.** Phần dưới giải thích vì sao ô lạ đó lại là lựa chọn đúng.

#### Nhìn từ xa: một tiến trình, ba tầng

Một node Paladin chỉ là **một tiến trình OS** — một JVM, một PID:

```text
╔════════════ MỘT PROCESS (một JVM, một PID) ═════════════════════════╗
║ TẦNG 1 — JAVA: chỉ làm launcher + loader, KHÔNG có logic nghiệp vụ  ║
║   Native.load("core") ──dlopen──┐   gRPC client ─────────────┐      ║
║                                 ▼                            │      ║
║ TẦNG 2 — GO CORE: libcore.so  (Go runtime #1)  ← ĐÂY LÀ "VI NHÂN"   ║
║   toàn bộ engine: state, tx, sequencer, block indexer…       │      ║
║   pluginManager: gRPC SERVER  listen  unix:/tmp/p.<pid>.sock ◀┘     ║
║                                 ▲                                   ║
║ TẦNG 3 — PLUGIN (nạp lúc chạy)  │ gRPC bidi stream qua UDS          ║
║   libnoto.so   (Go runtime #2) ─┤  ← c-shared, dlopen qua JNA       ║
║   libzeto.so   (Go runtime #3) ─┤                                   ║
║   libgrpc.so   (Go runtime #4) ─┤  ← transport                      ║
║   pente.jar    (chạy TRONG JVM)─┘  ← JAR, URLClassLoader            ║
╚═════════════════════════════════════════════════════════════════════╝
```

Ba điều nghe vô lý, nhưng cả ba đều đúng:

**1. Chỉ có một tiến trình.** Không sidecar, không container phụ. Liveness probe của pod đúng nghĩa đen là `pidof java`.

**2. Trong tiến trình đó có tới ~5 runtime độc lập** — 1 JVM + 4 Go runtime. Mỗi file `.so` mang theo một Go runtime riêng, và **không cái nào thấy con trỏ của cái nào**.

**3. Chúng nói chuyện qua một Unix socket thật** — bản tin đi xuống kernel rồi vòng lên, dù hai đầu chỉ cách nhau vài MB trong cùng bộ nhớ.

Điều 2 là chỗ hay bị hiểu nhầm nhất. Nạp một `.so` viết bằng Go **không phải** là "nạp thêm ít mã máy". Ngay ở bước `.init_array` — bước áp chót của `dlopen`, xem [cơ chế nạp ELF 6 bước](/blog/computer-architecture-basic-note#thư-viện-động-nạp-thêm-mã-vào-address-space-lúc-đang-chạy) — thư viện đó **khởi động một Go runtime hoàn chỉnh**: heap riêng, GC riêng, scheduler riêng, OS thread riêng.

Và đó chính là câu trả lời cho điều 3 — **vì sao phải đi vòng qua socket dù ở chung bộ nhớ**:

> GC của runtime này có thể dời hoặc thu hồi một object mà runtime kia đang giữ địa chỉ. Nghĩa là **con trỏ không qua biên được**. Đã không truyền được con trỏ thì buộc phải **copy dữ liệu ra bytes**; đã copy ra bytes thì cần một **định dạng có schema**; và protobuf-trên-socket là cách rẻ nhất để có schema + versioning + lỗi có cấu trúc.
>
> ⟹ Mẫu hai kênh ở đây **không phải lựa chọn cho đẹp — nó là hệ quả vật lý** của việc có nhiều runtime trong một address space.

#### Khởi động: 8 bước

Đọc kỹ một lần là hiểu trọn cơ chế "đẩy `.so` vào". Ý tưởng xuyên suốt: **Java và Go hẹn nhau ở một đường dẫn socket, rồi mọi thứ khác tự tìm về đó.**

```text
① java -jar paladin.jar config.yaml engine
② Java đọc config, sinh:  instanceId = UUID
                          socket     = unix:/tmp/p.<pid>.sock      ← ĐỊA CHỈ HẸN
③ Java tạo PluginLoader(socket, instanceId) → chưa nối được → retry backoff 250ms→15s
④ Native.load("core") → dlopen libcore.so → Go runtime #1 KHỞI ĐỘNG NGAY TRONG JVM
⑤ Java gọi Run(socket, uuid, config, "engine")  ← BLOCKING
   → luồng main của JVM từ giờ nằm trong mã Go; JVM sống được là nhờ loader ở thread khác
⑥ Go core dựng xong engine → net.Listen("unix", …) → gRPC server lên
   → ③ retry thành công → InitLoader(instanceId) → Go KIỂM instanceId có khớp không
⑦ Go stream về từng lệnh nạp:
   PluginLoad{ name:"noto", type:DOMAIN, libType:C_SHARED, libLocation:"/app/domains/libnoto.so" }
   → Java: dlopen file đó → Go runtime #N → gọi Run(socket, pluginId) trên THREAD RIÊNG
⑧ Bên trong .so: DIAL NGƯỢC về chính cái socket đó → mở bidi stream → gửi REGISTER{pluginId}
   → core gọi ngược ConfigureDomain / InitDomain qua stream → plugin: Available
```

Ba chỗ đáng dừng lại:

* **Bước ③ đứng trước bước ⑥** — loader đi tìm server trước khi server tồn tại. Không sao, vì nó **retry có backoff**. Nhờ vậy hai bên **không cần đồng bộ thứ tự khởi động**, đỡ hẳn một lớp phức tạp.
* **Bước ⑤ chặn luồng main mãi mãi.** Với plugin cũng vậy (`Run` blocking, chạy trên thread riêng). Nên plugin ở đây **không phải "thư viện bị gọi hàm"** mà là **một service sống bên trong tiến trình host**.
* **Bước ⑧ là chỗ đảo vai.** Java nạp plugin, nhưng plugin lại là bên **gọi về** — đúng mẫu *reverse connection*. Nhờ đảo vai này, host **không cần biết plugin sẽ phục vụ những gì**; nó chỉ cần mở sẵn một chỗ để plugin tự đến ghi danh.

Từ bước ⑧ trở đi, **C ABI không còn được dùng nữa**. Kiểm chứng bằng `nm` — toàn bộ bề mặt nhị phân của một plugin:

```bash
$ nm -D libnoto.so | grep ' T ' | grep -v _cgo_
0000000000662dc0 T Run          # extern GoInt Run(char* grpcTarget, char* pluginUUID);
0000000000662e24 T Stop         # extern void  Stop(char* pluginUUID);
```

**Đúng 2 hàm.** Trong khi hợp đồng thật của một domain là **22 thao tác vào + 9 thao tác gọi ngược ra** — tất cả nằm ở kênh 2, dưới dạng protobuf. Nếu ép 31 thao tác đó qua C ABI thì chỉ cần thêm một field là **vỡ nhị phân im lặng** với mọi plugin đã build.

(File `.so` nặng ~18 MB cho vài nghìn dòng logic — vì nó gói cả Go runtime + gRPC + protobuf vào trong.)

#### Vì sao Paladin chọn kiến trúc này

Không phải vì "cho hiện đại". Nó là **lựa chọn bị ép** bởi bốn ràng buộc rất cụ thể:

**① Bắt buộc đa ngôn ngữ — không phải vì thích.** Domain `pente` **nhúng EVM của Besu**, vốn là mã Java. Không có cách nào viết `pente` bằng Go mà không port lại nguyên một EVM. Ngược lại, engine cần hệ sinh thái Go: gRPC, protobuf, `ethclient`, driver DB. ⟹ Java và Go phải **cùng là công dân hạng nhất**, không bên nào là "phần phụ" của bên nào.

**② Plugin là mã của bên thứ ba.** Zeto do nhóm khác viết. Domain riêng do khách hàng viết. Chúng **phát hành theo nhịp khác nhau** ⟹ cần một biên **có đánh version**, để plugin build hôm nay còn chạy được với core của quý sau.

**③ Phải deploy như một pod Kubernetes bình thường.** Không được đòi mỗi domain một container, một cổng, một Service, một NetworkPolicy.

**④ Biên không phải nút thắt hiệu năng.** Một thao tác domain phải truy vấn state DB, xác minh chữ ký, có khi gọi sang Besu — tính bằng **mili-giây**. Một vòng UDS + protobuf tốn ~10–50 **micro**-giây ⟹ **dưới 1%**.

Ràng buộc ④ là thứ mở khoá tất cả. Nếu Paladin là thư viện tính toán số học gọi triệu lần/giây thì thiết kế này **sai hoàn toàn**. Vì nó là engine giao dịch phân tán, I/O-bound, nên "trả 1% hiệu năng để mua tự do về ngôn ngữ và phiên bản" là món hời.

#### Bằng chứng: biên thật nằm ở giao thức, không ở `dlopen`

Đây là chỗ chứng minh cái tên "microkernel + RPC plugin" là đúng chứ không phải gán ghép.

Vì hợp đồng thật nằm ở **giao thức**, cùng một hợp đồng đó được phục vụ bởi **ba cơ chế nạp khác hẳn nhau**:

| Cơ chế nạp | Kỹ thuật | Ví dụ thật |
| --- | --- | --- |
| `c-shared` | JNA → `dlopen` → gọi `Run`/`Stop` | `libnoto.so`, `libzeto.so` |
| `jar` | `URLClassLoader` + reflection `startInstance(target, id)` | **`pente.jar`** — domain viết bằng **Java** |
| in-process | không có `.so` nào cả, gọi thẳng hàm Go | dùng trong unit test / testbed |

⟹ **`pente` là `.jar`, `noto` là `.so`, và Go core không phân biệt nổi hai loại đó.** Với nó, cả ba chỉ là "thứ gì đó đã mở stream và gửi `REGISTER`".

Nói cách khác: **`dlopen` chỉ là một trong ba cách bấm nút khởi động, không phải biên kiến trúc.** Biên kiến trúc là cái file `.proto`.

Hệ quả rất thực dụng cho người viết plugin: **test không cần build `.so`** — chạy plugin in-process bằng Go thuần, đúng cái code sẽ chạy production. Toàn bộ nỗi đau OS × arch × libc chỉ xuất hiện ở khâu đóng gói, không xuất hiện ở khâu phát triển.

#### Hai chi tiết thiết kế

**1. Một stream hai chiều, thay cho hai kênh một chiều.**

Bản tin có header `{plugin_id, message_id, correlation_id, message_type}` và 4 khối `oneof`: `request_to_plugin`, `response_from_plugin`, `request_from_plugin`, `response_to_plugin`. Nghĩa là **cả hai đầu đều được phép hỏi trước**, bất cứ lúc nào, trên **cùng một stream**; bên nhận ghép câu trả lời về đúng câu hỏi đang treo bằng `correlation_id`.

Vì sao cần? Vì plugin **không tự làm việc một mình được**. Đang xử lý dở, nó phải hỏi ngược lõi: "cho tôi các UTXO khả dụng của ví này". Nếu stream chỉ một chiều thì phải mở thêm một kênh ngược ⟹ thêm cổng, thêm xác thực, thêm trạng thái phải quản.

Một stream hai chiều bỏ được hết, và **tự nhiên đúng về vòng đời**: stream đứt là cả hai chiều đứt cùng lúc — không có cảnh nửa sống nửa chết.

**2. Kênh bootstrap được tái dụng làm kênh điều khiển.**

Khi JVM treo, Go core (tầng 2) gửi `SysCommand.THREAD_DUMP` **qua đúng cái stream vốn dùng để nạp plugin**, và JVM (tầng 1) in thread dump ra. Tầng dưới điều khiển ngược tầng trên — không cần thêm cổng, không cần thêm giao thức.

#### Cái giá — và cửa thoát đã để sẵn

| Trả giá | Mức | Ghi chú |
| --- | --- | --- |
| **Không cách ly lỗi** | **nặng** | Panic không recover / segfault trong plugin **giết cả node**. Có `recover()` ở hàm export, nhưng recover không cứu được segfault, OOM, stack overflow. |
| Không cách ly tài nguyên | vừa | Plugin ăn hết RAM/CPU thì cả node chịu. Không cgroup riêng. |
| Ràng buộc nền tảng cứng | vừa | OS × arch × libc phải khớp — nên build `.so` **bên trong container đúng nền tảng**. |
| Thêm plugin = rebuild image | vừa | Không có API "upload plugin": config chỉ khai một **đường dẫn tuyệt đối** trong filesystem của chính container ⟹ bồi thêm đúng một layer `COPY`. |
| N runtime = N GC, N scheduler | nhẹ | RAM nền cao hơn; `GOMAXPROCS` không phối hợp giữa các runtime. |

Nhưng đây mới là phần hay: **khoản nặng nhất trả lại được mà không đổi một dòng hợp đồng nào.**

Hàm parse địa chỉ của Go core đã hỗ trợ sẵn `tcp:` / `tcp4:` / `tcp6:` bên cạnh `unix:`. Muốn đẩy plugin ra tiến trình/container riêng thì chỉ cần đổi **kênh 1** (endpoint + cách phát `pluginId`). **Kênh 2 giữ nguyên. 31 thao tác của hợp đồng giữ nguyên. Code plugin không đổi một dòng.**

Đó chính là lợi tức của kiến trúc vi nhân + biên RPC: **"in-process hay out-of-process" tụt xuống thành một tham số triển khai**, thay vì là một quyết định kiến trúc phải làm lại từ đầu.

### Debug & quan sát

Khi có sự cố, đây là thứ tự nên chạy:

```bash
# 1. Thư viện có nạp được không, thiếu phụ thuộc gì?
ldd libmathlib.so                  # macOS: otool -L   |  Windows: dumpbin /dependents
readelf -d libmathlib.so | head    # xem NEEDED, SONAME, RUNPATH

# 2. Symbol có đúng tên không? (nguyên nhân #1 của UnsatisfiedLinkError)
nm -D --defined-only libmathlib.so | grep ' T '
c++filt _ZN3foo3barEi              # nếu thấy tên mangle → quên extern "C"

# 3. Loader đã đi tìm ở những đâu?
LD_DEBUG=libs   java -jar app.jar 2>&1 | head -50
LD_DEBUG=bindings ./app            # xem từng symbol được bind vào đâu

# 4. Thư viện đã thật sự nằm trong address space chưa?
grep '\.so' /proc/$(pgrep -f app.jar)/maps      # ← chính là "Mapped regions" ở phần đầu note
pmap -x $(pgrep -f app.jar) | sort -k2 -n | tail

# 5. JVM crash trong native
java -Xcheck:jni -jar app.jar                  # bắt lỗi dùng sai JNI ngay khi xảy ra
#    đọc hs_err_pid<pid>.log → dòng "Problematic frame: C  [libfoo.so+0x1234]"
gdb -p <pid>                                   # hoặc mở core dump: bt để lấy stack native

# 6. Lỗi bộ nhớ (dùng ở CI/staging, không dùng ở production)
gcc -fsanitize=address,undefined -shared -fPIC ...   # ASAN/UBSAN
valgrind --leak-check=full ./host
GODEBUG=cgocheck=1 ./app                       # Go: kiểm tra vi phạm luật con trỏ cgo
```

### Checklist trước khi lên production

- [ ] Bề mặt native được **liệt kê ra giấy**, có `abi_version()`, và **không đổi chữ ký** hàm cũ.
- [ ] Mỗi hàm cấp phát có **hàm free đối xứng**; đã chạy soak test và xác nhận **off-heap không tăng**.
- [ ] Không có con trỏ nào vào heap có GC bị giữ qua biên; dữ liệu lớn đi bằng **off-heap + độ dài**.
- [ ] Panic/exception **không thoát ra** khỏi hàm export (đã có `recover`/`catch_unwind`/`catch(...)`).
- [ ] Lời gọi blocking chạy trên **thread riêng**, không chiếm thread pool của host.
- [ ] `dlopen` dùng `RTLD_NOW | RTLD_LOCAL`, **đường dẫn nạp do admin kiểm soát**, có verify checksum nếu là plugin bên thứ ba.
- [ ] CI build **đủ tổ hợp** OS × arch × libc, và có **test nạp thật** trên từng image đích (nhất là Alpine).
- [ ] Có kịch bản cho tình huống xấu nhất: plugin segfault ⟹ tiến trình chết ⟹ **ai restart, mất bao lâu, mất dữ liệu gì**.
- [ ] Ghi log **phiên bản thư viện native đã nạp** lúc khởi động (đường dẫn + checksum) — thiếu dòng log này thì mọi cuộc điều tra sự cố đều bắt đầu bằng phỏng đoán.

### Tóm lại

1. **FFI là bài toán dịch hợp đồng giữa hai runtime, không phải bài toán gọi hàm.** Bộ nhớ, thread, lỗi — ba thứ đó mới là chỗ vỡ, chứ không phải cái lệnh `call`.
2. **C ABI chỉ giỏi bắt tay.** Dùng nó cho vài hàm nhỏ và ổn định, rồi chuyển hết dữ liệu thật sang một kênh có schema — hợp đồng nhị phân càng ít hàm thì càng ít lần phải đổi, mà đổi hợp đồng nhị phân là kiểu vỡ **không có lỗi biên dịch nào cảnh báo**.
3. **Nhanh và cách ly là hai đầu của một trục** — cùng trục với process ↔ container ↔ VM ở các mục trên, và câu hỏi quyết định luôn là **"tôi tin code này tới mức nào"**, chứ không phải "cách nào hiện đại hơn".
