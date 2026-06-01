---
title: "Redis Internals"
pubDate: "2025-10-03"
published: true
contents_table: true
pinned: false
description: "Ghi chú"
cat: "misc"
useKatex: false
---

# Redis Internals — Tài liệu hệ thống chi tiết

> Tài liệu này tổng hợp & mở rộng từ loạt bài **Redis Internals** (Arpit Bhayani / DiceDB). Mỗi mục được trình bày theo cấu trúc:
>
> 1. **Bối cảnh & vấn đề** — vì sao cần giải pháp này.
> 2. **Phân tích & cơ chế** — bên trong hoạt động ra sao, có những con số/tradeoff gì.
> 3. **Cài đặt minh họa (Go)** — code đủ để hiểu, không phải production-ready.
> 4. **Tradeoff & ghi chú** — khi nào dùng, hạn chế, cách Redis production xử lý.
> 5. **Liên kết** — spec, commit DiceDB, bài viết gốc.
>
> Mục tiêu: đủ kiến thức để **tự xây mini-Redis** trong Go, đồng thời hiểu vì sao Redis production lại thiết kế như nó đang là.

---

## Mục lục

1. [Vì sao Redis đặc biệt?](#1-vì-sao-redis-đặc-biệt)
2. [TCP Echo Server đơn giản](#2-tcp-echo-server-đơn-giản)
3. [Ngôn ngữ Redis: RESP protocol](#3-ngôn-ngữ-redis-resp-protocol)
4. [Triển khai RESP parser](#4-triển-khai-resp-parser)
5. [Lệnh PING](#5-lệnh-ping)
6. [IO Multiplexing & Event Loop](#6-io-multiplexing--event-loop)
7. [Xử lý nhiều client đồng thời với epoll](#7-xử-lý-nhiều-client-đồng-thời-với-epoll)
8. [GET, SET, TTL](#8-get-set-ttl)
9. [DEL, EXPIRE & auto-deletion](#9-del-expire--auto-deletion)
10. [Chiến lược eviction & simple-first](#10-chiến-lược-eviction--simple-first)
11. [Command Pipelining](#11-command-pipelining)
12. [AOF Persistence](#12-aof-persistence)
13. [Object, Encoding & INCR](#13-object-encoding--incr)
14. [INFO & allkeys-random](#14-info--allkeys-random)
15. [Approximated LRU](#15-approximated-lru)
16. [Redis cap memory như thế nào](#16-redis-cap-memory-như-thế-nào)
17. [Override malloc — jemalloc/tcmalloc](#17-override-malloc--jemalloctcmalloc)
18. [Graceful Shutdown](#18-graceful-shutdown)
19. [Transactions (MULTI/EXEC)](#19-transactions-multiexec)
20. [List Internals — Ziplist & Quicklist](#20-list-internals--ziplist--quicklist)
21. [Set Internals — Intset](#21-set-internals--intset)
22. [Geospatial & Geohash](#22-geospatial--geohash)
23. [String Internals — SDS](#23-string-internals--sds)
24. [HyperLogLog & Cardinality Estimation](#24-hyperloglog--cardinality-estimation)
25. [LFU & Approximate Counting (Morris)](#25-lfu--approximate-counting-morris)

---

## 1. Vì sao Redis đặc biệt?

### 1.1 Bối cảnh & vấn đề

Trước Redis (2009), thế giới key-value store chia làm hai phe: **disk-based** (BerkeleyDB, LevelDB) — bền nhưng chậm; và **in-memory** (memcached) — nhanh nhưng chỉ có `GET/SET` string. Salvatore Sanfilippo (antirez) muốn thứ trung gian: **in-memory tốc độ memcached**, nhưng **có cấu trúc dữ liệu phong phú** như database, **có persistence** để không mất hết khi restart.

Vấn đề kỹ thuật cần giải:
- Làm sao đạt latency micro-giây mà vẫn cung cấp List, Set, Hash, Sorted Set?
- Làm sao single process phục vụ hàng chục nghìn client mà không sập?
- Làm sao bền dữ liệu khi máy chết mà không trả giá lớn về hiệu năng?

### 1.2 Phân tích & cơ chế

#### (a) In-memory

Redis cho mọi op chạy trên RAM → latency p50 trong khoảng 100 µs–1 ms, gần bằng RTT mạng. Đĩa chỉ dùng cho persistence không nằm trong hot path.

#### (b) Single-threaded

Mọi command processing chạy trên **một thread**. Lý do:

- **Không cần lock**: lock contention với 64 core có thể tốn hàng micro-giây mỗi op. Single-thread = 0 lock = 0 contention.
- **Không cache-line bouncing**: dữ liệu của single thread luôn hot trong L1/L2 của 1 core.
- **Không context switch** giữa worker threads.
- **Đơn giản code**: không có heisenbug do race condition.
- **Bottleneck thực tế là network/memory bandwidth**, không phải CPU. Trên 1 core hiện đại, Redis xử lý 100k–1M op/s — đa luồng chỉ giúp được nếu CPU là điểm nghẽn, mà nó hiếm khi.

Từ Redis 6.0 có **threaded I/O**: chỉ phần `read()`/`write()` socket được đa luồng (vì syscall đó tốn CPU đáng kể), nhưng **command execution vẫn single-thread**.

#### (c) Cấu trúc dữ liệu chuyên biệt cho từng size

Redis không có "một implementation duy nhất" cho List/Set/Hash. Thay vào đó **chọn encoding theo size**:

- List nhỏ → ziplist (mảng nén liên tục). List lớn → quicklist (linked list của ziplist).
- Hash nhỏ → ziplist (key-value xen kẽ). Hash lớn → hashtable.
- Set nhỏ chứa int → intset (mảng int sorted). Lớn hoặc có string → hashtable.

Mục tiêu: với 99% use case (data nhỏ), tối ưu memory + cache locality. Khi data lớn, hi sinh memory để được O(1).

### 1.3 Khi nào KHÔNG dùng Redis

- Dataset > RAM tổng (Redis là primary store, không có spill-to-disk).
- Cần ACID đa-key đầy đủ (MULTI/EXEC không có rollback).
- Cần xếp hạng cao về durability tuyệt đối (mất tối đa 1s với `appendfsync everysec`).

**Tham khảo**: [Introduction to Redis](https://redis.io/docs/about/) · [Why Redis is single-threaded](https://topic.alibabacloud.com/a/why-redis-is-single-threaded-and-why-is-redis-so-fast_1_47_30266528.html).

---

## 2. TCP Echo Server đơn giản

### 2.1 Bối cảnh

Redis nói chuyện với client qua TCP. Bước đầu xây Redis: server lắng nghe port (mặc định 6379, DiceDB dùng 7379), nhận byte stream, trả về byte stream. Echo server là phiên bản tối thiểu — chưa parse protocol, chỉ vọng lại đúng những gì client gửi.

### 2.2 Phân tích & cơ chế

#### Vòng đời socket TCP server

```
socket()  → tạo file descriptor cho endpoint
bind()    → gán địa chỉ:port
listen()  → đặt vào trạng thái lắng nghe, kernel giữ queue accept
accept()  → blocking đến khi client connect, trả về FD mới cho từng connection
read()    → đọc byte từ FD client
write()   → ghi byte ra FD client
close()   → đóng FD
```

Mỗi connection có **FD riêng** trong kernel — đây là chìa khóa để 1 process quản lý nhiều client.

#### TCP byte-stream chứ không phải message

TCP là **dòng byte**, không bảo vệ ranh giới message. Một `write("HELLO")` ở client có thể arrival ở server thành 1 lần `read("HELLO")` hoặc 5 lần `read("H"), read("E"), …`. Đây chính là lý do phải có **protocol** (RESP) để phân định message.

### 2.3 Cài đặt minh họa

```go
package main

import (
	"fmt"
	"net"
)

func main() {
	ln, err := net.Listen("tcp", ":7379")
	if err != nil {
		panic(err)
	}
	defer ln.Close()
	fmt.Println("Listening on :7379")

	for {
		conn, err := ln.Accept()
		if err != nil {
			continue
		}
		go handle(conn) // mỗi connection 1 goroutine; section 7 sẽ thay bằng epoll
	}
}

func handle(conn net.Conn) {
	defer conn.Close()
	buf := make([]byte, 512)
	for {
		n, err := conn.Read(buf)
		if err != nil {
			return
		}
		conn.Write(buf[:n])
	}
}
```

Test:
```bash
$ nc localhost 7379
hello
hello
```

### 2.4 Ghi chú

- Mô hình **goroutine per connection** tiện cho minh họa nhưng **không phải cách Redis hoạt động**. Redis dùng 1 thread + epoll (xem section 6-7).
- Buffer 512 byte ở đây tùy ý. Redis dùng buffer `PROTO_IOBUF_LEN = 16 KB` mỗi client.

**Commit gốc**: [dd524f17](https://github.com/DiceDB/dice/commit/dd524f174bd6de83ea8a27526f8f1d50436d3b00).

---

## 3. Ngôn ngữ Redis: RESP protocol

### 3.1 Bối cảnh

Khi đã có byte stream qua TCP, cần một **giao thức** để phân định: đâu là 1 command, command tên gì, có bao nhiêu argument. Redis có RESP (REdis Serialization Protocol) — designed với các tiêu chí:

1. **Đơn giản để implement** (parser viết trong ~200 dòng C).
2. **Human-readable** (debug được bằng `telnet`).
3. **Nhanh để parse** (length-prefixed, không cần escape).
4. **Binary-safe** (chứa được bất kỳ byte nào kể cả `\0` hay `\n`).

### 3.2 Phân tích & cơ chế

#### Inline commands (legacy)

Để tương thích `telnet`, RESP chấp nhận command text plain:
```
PING\r\n
SET key value\r\n
```
Server tự parse split theo whitespace. Nhược: không binary-safe, không hỗ trợ value có space. Production luôn dùng dạng Array.

#### Ví dụ đầy đủ: `SET foo bar`

Client gửi:
```
*3\r\n$3\r\nSET\r\n$3\r\nfoo\r\n$3\r\nbar\r\n
```

Tách ra:
```
*3                ← array 3 phần tử
$3\r\nSET\r\n     ← phần tử 1: "SET"
$3\r\nfoo\r\n     ← phần tử 2: "foo"
$3\r\nbar\r\n     ← phần tử 3: "bar"
```

Server trả:
```
+OK\r\n
```

### 3.3 RESP3 (Redis 6+)

Thêm kiểu mới: Map (`%`), Set (`~`), Double (`,`), Boolean (`#`), BigNumber (`(`), Verbatim (`=`), Push (`>`). Map ví dụ:
```
%2\r\n+name\r\n+alice\r\n+age\r\n:30\r\n
```
Khách hàng phải gửi `HELLO 3` để bật RESP3. Đa số client production vẫn dùng RESP2 mặc định.

**Tham khảo**: [RESP protocol spec](https://redis.io/docs/reference/protocol-spec/).

---

## 4. Triển khai RESP parser

### 4.1 Bối cảnh

Parser RESP cần:
- **Streaming**: dữ liệu có thể đến nhiều lần (TCP fragment), không đủ message → đợi thêm.
- **Stateless trong message**: mỗi message độc lập, parse được bằng length-prefix.
- **Trả về bytes-consumed**: caller biết chừa lại bao nhiêu byte cho lần parse sau.

### 4.2 Phân tích & cơ chế

Parser đệ quy: `Decode(data)` đọc 1 byte đầu xác định type, gọi handler tương ứng. `Array` gọi `Decode` lặp lại trên từng element.

#### Decoder

```go
package resp

import (
	"errors"
	"strconv"
)

// Decode parse 1 RESP value từ data, trả về:
//   - value (interface{})
//   - số byte đã consume
//   - error
// Nếu data thiếu (chưa đủ message) → trả error "incomplete".
func Decode(data []byte) (interface{}, int, error) {
	if len(data) == 0 {
		return nil, 0, errors.New("incomplete")
	}
	switch data[0] {
	case '+':
		return readSimpleString(data)
	case '-':
		return readError(data)
	case ':':
		return readInteger(data)
	case '$':
		return readBulkString(data)
	case '*':
		return readArray(data)
	}
	return nil, 0, errors.New("unknown type: " + string(data[0]))
}

// readUntilCRLF tìm \r\n bắt đầu từ index 1, trả về phần [1..crlf) và vị trí sau CRLF.
func readUntilCRLF(data []byte) (string, int, error) {
	for i := 1; i < len(data)-1; i++ {
		if data[i] == '\r' && data[i+1] == '\n' {
			return string(data[1:i]), i + 2, nil
		}
	}
	return "", 0, errors.New("incomplete")
}

func readSimpleString(data []byte) (string, int, error) { return readUntilCRLF(data) }
func readError(data []byte) (string, int, error)        { return readUntilCRLF(data) }

func readInteger(data []byte) (int64, int, error) {
	s, n, err := readUntilCRLF(data)
	if err != nil {
		return 0, 0, err
	}
	v, err := strconv.ParseInt(s, 10, 64)
	return v, n, err
}

func readBulkString(data []byte) (string, int, error) {
	lenStr, hdrLen, err := readUntilCRLF(data)
	if err != nil {
		return "", 0, err
	}
	length, _ := strconv.Atoi(lenStr)
	if length == -1 {
		return "", hdrLen, nil // null bulk
	}
	end := hdrLen + length
	if len(data) < end+2 {
		return "", 0, errors.New("incomplete")
	}
	return string(data[hdrLen:end]), end + 2, nil // +2 cho \r\n cuối
}

func readArray(data []byte) ([]interface{}, int, error) {
	lenStr, hdrLen, err := readUntilCRLF(data)
	if err != nil {
		return nil, 0, err
	}
	count, _ := strconv.Atoi(lenStr)
	out := make([]interface{}, 0, count)
	pos := hdrLen
	for i := 0; i < count; i++ {
		v, used, err := Decode(data[pos:])
		if err != nil {
			return nil, 0, err
		}
		out = append(out, v)
		pos += used
	}
	return out, pos, nil
}
```

#### Encoder

```go
func EncodeSimple(s string) []byte { return []byte("+" + s + "\r\n") }
func EncodeError(s string) []byte  { return []byte("-" + s + "\r\n") }
func EncodeInt(n int64) []byte     { return []byte(":" + strconv.FormatInt(n, 10) + "\r\n") }

func EncodeBulk(s string) []byte {
	return []byte("$" + strconv.Itoa(len(s)) + "\r\n" + s + "\r\n")
}
func EncodeBulkNil() []byte { return []byte("$-1\r\n") }

func EncodeArray(items [][]byte) []byte {
	out := []byte("*" + strconv.Itoa(len(items)) + "\r\n")
	for _, it := range items {
		out = append(out, it...)
	}
	return out
}
```

### 4.3 Ghi chú

- Mỗi `Decode` cần biết liệu data có **đủ** không. Pattern thường gặp: parser trả `incomplete` → server đợi `read()` tiếp theo rồi parse lại từ đầu. Tối ưu hơn: lưu state để parse "continuation".
- Redis production tránh allocation: parser tái dùng buffer, không tạo `string` Go (trong C dùng pointer + length thay copy).

**Commit gốc**: [7f3265f5](https://github.com/DiceDB/dice/commit/7f3265f5e941d5cf2cb95de022f3c3b46f79937d).

---

## 5. Lệnh PING

### 5.1 Bối cảnh

`PING` là command đơn giản nhất nhưng cực kỳ quan trọng:
- **Health check**: load balancer kiểm tra Redis còn sống.
- **Latency benchmark**: đo RTT mạng (chính `redis-benchmark -t ping`).
- **Keep-alive**: client connection pool gửi định kỳ để giữ TCP idle không bị NAT drop.

### 5.2 Spec

```
PING               → +PONG
PING "hello"       → $5\r\nhello\r\n     (echo lại)
PING in MULTI mode → +QUEUED, EXEC trả +PONG
```

### 5.3 Cài đặt minh họa

```go
func executePING(args []string) []byte {
	switch len(args) {
	case 0:
		return resp.EncodeSimple("PONG")
	case 1:
		return resp.EncodeBulk(args[0])
	default:
		return resp.EncodeError("ERR wrong number of arguments for 'ping' command")
	}
}
```

### 5.4 Benchmark

```bash
$ redis-benchmark -p 7379 -t ping -n 100000 -c 50
PING_INLINE: 120000 requests per second
```

Tại sao PING là chỉ số "ceiling" cho throughput: lệnh không chạm data store, gần như chỉ đo cost của network + parse + encode. Nếu PING đạt 120k/s, các lệnh phức tạp hơn sẽ thấp hơn (vì có thêm hash lookup, encoding).

**Commit gốc**: [a695284c](https://github.com/DiceDB/dice/commit/a695284cd4eb4650286688574578b0c74059d92c).

---

## 6. IO Multiplexing & Event Loop

### 6.1 Bối cảnh

Mô hình "1 thread per connection" sập với C10k (10,000 connection đồng thời):

- 10k thread × 8 MB stack = **80 GB RAM** chỉ cho stack.
- Mỗi context switch ~1-10 µs × 10k thread → kernel scheduler nghẹt.
- Đa số thread idle chờ I/O — phí.

**I/O Multiplexing** giải: 1 thread block trên một syscall duy nhất chờ "có FD nào sẵn sàng", kernel báo về danh sách, thread xử lý từng FD rồi quay lại. Đây là nền tảng cho Redis, nginx, Node.js, Go runtime, Nginx, lighttpd.

### 6.2 Phân tích & cơ chế

#### Blocking vs Non-blocking

```c
// Blocking — read() chờ đến khi có data hoặc EOF
int n = read(fd, buf, 512);

// Non-blocking — set với fcntl
fcntl(fd, F_SETFL, O_NONBLOCK);
int n = read(fd, buf, 512);
if (n == -1 && errno == EAGAIN) {
    // chưa có data, FD này chưa sẵn sàng
}
```

Multiplexing dùng FD non-blocking + cơ chế kernel báo readiness.

#### So sánh select / poll / epoll

| API | Độ phức tạp mỗi call | Max FD | Cách hoạt động |
|---|---|---|---|
| `select` | O(n) | FD_SETSIZE = 1024 | Bitmask, kernel quét hết, copy từ user mỗi call |
| `poll` | O(n) | Không giới hạn | Mảng `pollfd`, vẫn copy + quét mỗi call |
| `epoll` (Linux) | O(1) amortized | Không giới hạn | Kernel duy trì state, chỉ trả về FD ready |
| `kqueue` (BSD/macOS) | O(1) | Không giới hạn | Tương tự epoll, abstraction phong phú hơn |

Benchmark thực tế (từ jvns.ca):

| Số FD | poll | select | epoll |
|---|---|---|---|
| 10 | 0.61 µs | 0.73 µs | 0.41 µs |
| 1,000 | 35 µs | 35 µs | 0.53 µs |
| 10,000 | 990 µs | 930 µs | 0.66 µs |

→ Với 10k FD, epoll **nhanh hơn 1000×**. Lý do: select/poll buộc kernel **quét lại từ đầu** mỗi call; epoll giữ "interest list" sẵn trong kernel, chỉ trả về FD nào vừa thay đổi trạng thái.

#### Event Loop pseudo-code

```
register(listen_fd)
loop forever {
    ready[] = epoll_wait(epoll_fd, timeout)
    for fd in ready[] {
        if fd == listen_fd {
            conn_fd = accept(fd)
            set_nonblocking(conn_fd)
            register(conn_fd)
        } else {
            data = read(fd)
            cmd = parse(data)
            response = execute(cmd)
            write(fd, response)
        }
    }
    process_time_events()  // expired keys, cron, persistence
}
```

#### Hai loại sự kiện trong Redis event loop

Redis (file `ae.c`) abstract thành 2 loại:

1. **File events** — I/O readiness (`epoll`/`kqueue`/`select` underneath).
2. **Time events** — task định kỳ (`serverCron` chạy 100ms/lần): expire sample, resize hash table, snapshot trigger, slave sync, dọn idle connection.

`aeMain()` loop: tính time đến next time event → `epoll_wait(timeout=that_time)` → xử lý file events đã ready → xử lý time events đến hạn → lặp.

**Tham khảo**: [Async IO on Linux](https://jvns.ca/blog/2017/06/03/async-io-on-linux--select--poll--and-epoll/) · [Redis under the hood](https://www.pauladamsmith.com/articles/redis-under-the-hood.html).

---

## 7. Xử lý nhiều client đồng thời với epoll

### 7.1 Bối cảnh

Section 6 là lý thuyết. Phần này code thật event loop dùng epoll syscall của Linux.

### 7.2 Phân tích & cơ chế

#### epoll API

```c
int epoll_create1(int flags);
// Tạo epoll instance, trả về FD đại diện cho instance.

int epoll_ctl(int epfd, int op, int fd, struct epoll_event *event);
// op: EPOLL_CTL_ADD / MOD / DEL
// event.events: EPOLLIN (readable), EPOLLOUT (writable), EPOLLET (edge-triggered)
// event.data: user data tự đặt (thường là FD hoặc pointer struct client)

int epoll_wait(int epfd, struct epoll_event *events, int maxevents, int timeout);
// Block tối đa `timeout` ms, trả về số FD ready, fill vào `events[]`.
```

#### Edge-triggered vs Level-triggered

- **Level-triggered (mặc định)**: khi FD readable, `epoll_wait` báo. Nếu bạn không `read()` hết → lần sau gọi `epoll_wait` vẫn báo lại. **An toàn**, dễ code.
- **Edge-triggered (`EPOLLET`)**: chỉ báo **1 lần khi state đổi** (từ "không data" → "có data"). Phải đọc đến `EAGAIN` mới thôi, không thì sẽ bỏ sót. Phức tạp hơn nhưng giảm syscall.

**Redis dùng level-triggered**: đơn giản, đủ nhanh.

#### Cấu trúc Client trong event loop

```go
type Client struct {
	fd      int
	inbuf   []byte  // byte đọc từ socket nhưng chưa đủ thành 1 RESP message
	outbuf  []byte  // response đợi gửi đi
	clientID uint64
}
```

`inbuf` quan trọng: TCP có thể fragment, phải tích lũy đến khi parser nói "đủ rồi".

### 7.3 Cài đặt minh họa (Go + raw syscall)

```go
package main

import (
	"fmt"
	"net"
	"syscall"
)

const maxEvents = 128

func main() {
	ln, _ := net.Listen("tcp", ":7379")
	tcpLn := ln.(*net.TCPListener)
	f, _ := tcpLn.File()
	listenFD := int(f.Fd())
	syscall.SetNonblock(listenFD, true)

	epfd, _ := syscall.EpollCreate1(0)
	defer syscall.Close(epfd)

	ev := syscall.EpollEvent{Events: syscall.EPOLLIN, Fd: int32(listenFD)}
	syscall.EpollCtl(epfd, syscall.EPOLL_CTL_ADD, listenFD, &ev)

	clients := make(map[int]*Client) // fd → client
	events := make([]syscall.EpollEvent, maxEvents)

	for {
		n, err := syscall.EpollWait(epfd, events, 100)
		if err != nil {
			continue
		}
		for i := 0; i < n; i++ {
			fd := int(events[i].Fd)
			if fd == listenFD {
				connFD, _, _ := syscall.Accept(fd)
				syscall.SetNonblock(connFD, true)
				clients[connFD] = &Client{fd: connFD}
				e := syscall.EpollEvent{Events: syscall.EPOLLIN, Fd: int32(connFD)}
				syscall.EpollCtl(epfd, syscall.EPOLL_CTL_ADD, connFD, &e)
				continue
			}
			c := clients[fd]
			if !c.readAndProcess() {
				syscall.EpollCtl(epfd, syscall.EPOLL_CTL_DEL, fd, nil)
				syscall.Close(fd)
				delete(clients, fd)
			}
		}
		runTimeEvents() // expire sample, cron tick, ...
	}
	_ = fmt.Sprintf
}

type Client struct {
	fd    int
	inbuf []byte
}

func (c *Client) readAndProcess() bool {
	buf := make([]byte, 4096)
	n, err := syscall.Read(c.fd, buf)
	if n <= 0 || err != nil {
		return false
	}
	c.inbuf = append(c.inbuf, buf[:n]...)
	for {
		cmd, used, err := resp.Decode(c.inbuf)
		if err != nil || used == 0 {
			break // chưa đủ → đợi vòng epoll_wait kế tiếp
		}
		response := dispatch(cmd.([]interface{}))
		syscall.Write(c.fd, response)
		c.inbuf = c.inbuf[used:]
	}
	return true
}
```

### 7.4 Tradeoff & ghi chú

- **Không spawn goroutine cho mỗi connection** — đây chính là điểm khác `net.Conn` mặc định của Go (mà mặc định Go runtime đã có netpoller dùng epoll bên dưới).
- 1 thread phục vụ 10k+ connection: lý do Redis chạy đến 60k op/s trên 1 core không cần lock.
- **Lưu ý**: `EpollWait` timeout = 100 ms ở trên cho phép `runTimeEvents()` chạy đều ít nhất 10 lần/giây.

**Commit gốc**: [d3da078e](https://github.com/DiceDB/dice/commit/d3da078ec2b7e5802bbf901caf58e1f7489d5fcf).

---

## 8. GET, SET, TTL

### 8.1 Bối cảnh

Đây là 3 command "hello world" của Redis. Hiểu chúng = hiểu data model cốt lõi: **mọi key map đến 1 object** với type, encoding, và optional expiration.

### 8.2 Phân tích & cơ chế

#### Data store: hash table flat

Redis dùng **dict** (hash table) với separate chaining, mapping `key (string) → object (robj)`. Trong Go minh họa:

```go
type Obj struct {
	Value     interface{}
	ExpiresAt int64 // unix ms, -1 = không expire
}

var store = make(map[string]*Obj)
```

#### SET spec (mở rộng)

```
SET key value [EX seconds | PX milliseconds | EXAT ts | PXAT ts-ms | KEEPTTL]
              [NX | XX] [GET]
```
- `EX/PX/EXAT/PXAT`: dạng expire khác nhau (relative/absolute, second/ms).
- `NX`: chỉ set nếu key **chưa** tồn tại.
- `XX`: chỉ set nếu key **đã** tồn tại.
- `KEEPTTL`: giữ nguyên TTL hiện tại (mặc định SET sẽ xóa TTL).
- `GET`: trả về value cũ.

#### Lý do `SET` mặc định **xóa TTL**

Nếu không có flag `KEEPTTL`, mỗi `SET` được coi là "ghi lại key từ đầu". Đây là semantic tự nhiên — nhưng từng là nguồn bug phổ biến trước khi `KEEPTTL` được thêm (Redis 7).

### 8.3 Cài đặt minh họa

```go
func executeSET(args []string) []byte {
	if len(args) < 2 {
		return resp.EncodeError("ERR wrong number of arguments")
	}
	key, value := args[0], args[1]
	var expiresAt int64 = -1
	keepTTL, nx, xx := false, false, false

	for i := 2; i < len(args); i++ {
		switch strings.ToUpper(args[i]) {
		case "EX":
			sec, _ := strconv.Atoi(args[i+1])
			expiresAt = time.Now().UnixMilli() + int64(sec)*1000
			i++
		case "PX":
			ms, _ := strconv.Atoi(args[i+1])
			expiresAt = time.Now().UnixMilli() + int64(ms)
			i++
		case "KEEPTTL":
			keepTTL = true
		case "NX":
			nx = true
		case "XX":
			xx = true
		}
	}

	_, exists := store[key]
	if nx && exists {
		return resp.EncodeBulkNil()
	}
	if xx && !exists {
		return resp.EncodeBulkNil()
	}

	obj := &Obj{Value: value, ExpiresAt: expiresAt}
	if keepTTL && exists {
		obj.ExpiresAt = store[key].ExpiresAt
	}
	store[key] = obj
	return resp.EncodeSimple("OK")
}

func executeGET(args []string) []byte {
	if len(args) != 1 {
		return resp.EncodeError("ERR wrong number of arguments")
	}
	obj, ok := store[args[0]]
	if !ok {
		return resp.EncodeBulkNil()
	}
	// Lazy expiration: kiểm tra TTL tại điểm truy cập
	if obj.ExpiresAt != -1 && time.Now().UnixMilli() >= obj.ExpiresAt {
		delete(store, args[0])
		return resp.EncodeBulkNil()
	}
	return resp.EncodeBulk(obj.Value.(string))
}

func executeTTL(args []string) []byte {
	obj, ok := store[args[0]]
	if !ok {
		return resp.EncodeInt(-2) // key không tồn tại
	}
	if obj.ExpiresAt == -1 {
		return resp.EncodeInt(-1) // tồn tại nhưng không TTL
	}
	remaining := (obj.ExpiresAt - time.Now().UnixMilli()) / 1000
	if remaining < 0 {
		return resp.EncodeInt(-2)
	}
	return resp.EncodeInt(remaining)
}
```

### 8.4 Tradeoff & ghi chú

- **`-2` vs `-1`** là quy ước Redis kế thừa từ memcached; đừng nhầm với "0 seconds".
- **Tại sao lazy expiration là chưa đủ**: nếu key có TTL mà không bao giờ được `GET` → ngồi lại mãi trong RAM cho tới khi memory đầy. Section 9 trình bày active expiration.
- Redis production lưu TTL **trong dict riêng** (`db->expires`) thay vì gắn vào object → tiết kiệm 8 bytes cho object không TTL.

**Commit gốc**: [1ebca1b9](https://github.com/DiceDB/dice/commit/1ebca1b96352cd4b431c4acb19268d6b219de408).

---

## 9. DEL, EXPIRE & auto-deletion

### 9.1 Bối cảnh

Có 3 cách 1 key biến mất khỏi Redis:

1. **Explicit DEL** — client chủ động xóa.
2. **Expiration** — TTL hết hạn.
3. **Eviction** — RAM đầy, áp dụng policy (section 10).

Phần này tập trung vào (1) và (2).

### 9.2 Phân tích & cơ chế

#### DEL & UNLINK

```
DEL key [key ...]      → đếm số key xóa được, blocking
UNLINK key [key ...]   → cùng semantic nhưng deferred (background thread free memory)
```

`UNLINK` xuất hiện từ Redis 4.0 cho key lớn (List/Set/Hash có hàng triệu phần tử) — vì giải phóng memory tốn O(n), block event loop. `UNLINK` chỉ unlink khỏi dict (O(1)) rồi giao cho background thread free.

#### EXPIRE family

```
EXPIRE key seconds          → set TTL relative
EXPIREAT key unix-ts        → set TTL absolute
PEXPIRE key milliseconds    → ms precision
PERSIST key                 → xóa TTL
```

#### Hai chiến lược auto-deletion

**(a) Lazy expiration** — đã làm ở section 8. Chỉ kiểm tra TTL khi key được truy cập.
- Ưu: zero CPU overhead cho key không bao giờ access.
- Nhược: key có TTL mà không access → chiếm RAM mãi (memory leak).

**(b) Active expiration** — background loop quét và xóa.
- Redis chạy mỗi 100 ms (10 lần/giây) qua `serverCron`.
- **Không thể quét toàn bộ** (có thể có hàng triệu key) → dùng **sampling**.

#### Thuật toán sampling của Redis

```
mỗi cycle (100ms):
  cho đến khi hết deadline (25ms / cycle):
    sample 20 key có TTL ngẫu nhiên từ dict.expires
    xóa key đã expired
    nếu (số key expired / 20) < 25%:
      dừng cycle này
    (ngược lại lặp lại — vì đang có nhiều key đáng xóa)
```

Lý do tham số:
- **Sample 20**: cân bằng giữa "đo thống kê" và CPU.
- **Threshold 25%**: dưới ngưỡng này, nhiều key trong dict.expires vẫn còn hạn → không đáng quét tiếp.
- **Deadline 25ms**: đảm bảo expiration không chiếm quá 25% CPU.

Twitter (2019) báo cáo vấn đề khi cluster có pattern: rất nhiều key set TTL tương đối ngắn nhưng chỉ một phần được truy cập → lazy không xóa, active xóa chậm hơn rate tạo → memory phình. Họ điều chỉnh `hz` (tần số `serverCron`, default 10, có thể nâng lên 100) và sample size để xử lý workload đặc thù.

### 9.3 Cài đặt minh họa

```go
func executeDEL(args []string) []byte {
	count := int64(0)
	for _, k := range args {
		if _, ok := store[k]; ok {
			delete(store, k)
			count++
		}
	}
	return resp.EncodeInt(count)
}

func executeEXPIRE(args []string) []byte {
	obj, ok := store[args[0]]
	if !ok {
		return resp.EncodeInt(0)
	}
	sec, _ := strconv.Atoi(args[1])
	obj.ExpiresAt = time.Now().UnixMilli() + int64(sec)*1000
	return resp.EncodeInt(1)
}

// Chạy mỗi 100ms từ event loop time-event
func activeExpireCycle() {
	const sampleSize = 20
	const threshold = 0.25
	deadline := time.Now().Add(25 * time.Millisecond)

	for time.Now().Before(deadline) {
		expired := 0
		sampled := 0
		now := time.Now().UnixMilli()

		for k, obj := range store { // Go map iteration đã randomized
			if sampled >= sampleSize {
				break
			}
			if obj.ExpiresAt == -1 {
				continue
			}
			sampled++
			if now >= obj.ExpiresAt {
				delete(store, k)
				expired++
			}
		}

		if sampled == 0 || float64(expired)/float64(sampled) < threshold {
			return
		}
		// nhiều key đáng xóa → loop tiếp
	}
}
```

### 9.4 Ghi chú

- **Sampling có sai số**: trong worst case, một key vừa expire có thể tồn tại thêm vài giây trước khi bị active xóa. Đây là tradeoff CPU vs memory mà Redis chấp nhận.
- **Replication & expiration**: master phát lệnh `DEL` đến slave khi key expire — slave **không** tự expire (để tránh divergence). Đến Redis 5.0, slave có thể tự expire nếu cấu hình `replica-lazy-flush`.
- **Cluster**: với 16384 slot, mỗi node chỉ expire phần dict của nó.

**Tham khảo**: [Improving key expiration in Redis (Twitter Eng)](https://blog.twitter.com/engineering/en_us/topics/infrastructure/2019/improving-key-expiration-in-redis).

---

## 10. Chiến lược eviction & simple-first

### 10.1 Bối cảnh

Khi `used_memory > maxmemory`, Redis phải:
1. Trả lỗi cho mọi write (policy `noeviction`).
2. Hoặc xóa bớt key để có chỗ — chọn key nào?

### 10.2 Các policy

| Policy | Mô tả | Use case |
|---|---|---|
| `noeviction` | Trả `OOM error`, không xóa | DB primary, không chấp nhận mất data |
| `allkeys-lru` | LRU trên toàn bộ key | Cache, ít quan tâm tới TTL |
| `allkeys-lfu` | LFU trên toàn bộ key (Redis 4+) | Cache với hotset rõ rệt |
| `allkeys-random` | Random toàn bộ key | Đơn giản, throughput cao |
| `volatile-lru` | LRU chỉ trong key có TTL | Mix DB + cache trong 1 instance |
| `volatile-lfu` | LFU trong key có TTL | Tương tự |
| `volatile-ttl` | Evict key có TTL gần expired nhất | TTL = ưu tiên xóa |
| `volatile-random` | Random trong key có TTL | Đơn giản |

### 10.3 Simple-first (FIFO)

Là thuật toán đơn giản nhất: xóa key được tạo sớm nhất. Không phải policy chính thức của Redis, nhưng là **stepping stone** trong loạt bài để rồi tiến đến LRU sau.

```go
type Obj struct {
	Value     interface{}
	ExpiresAt int64
	CreatedAt int64
}

func evictSimpleFirst() {
	var oldestKey string
	var oldestTime int64 = math.MaxInt64
	for k, obj := range store {
		if obj.CreatedAt < oldestTime {
			oldestTime = obj.CreatedAt
			oldestKey = k
		}
	}
	delete(store, oldestKey)
}

func evictUntilUnderLimit() {
	for memoryUsage() > maxMemory {
		evictSimpleFirst()
	}
}
```

### 10.4 Ghi chú

- Simple-first **dở** với cache pattern: key tạo lâu rồi vẫn có thể là hot key được truy cập liên tục, xóa nó = giảm hit rate.
- LRU/LFU "approximated" (section 15, 25) là cách Redis production thực sự xử lý.
- Eviction chạy **trước mỗi write command** — không có thread riêng. Điều này giữ singletheaded property nhưng có nghĩa: nếu cần evict nhiều key, write latency tăng đột biến (latency spike).

**Commit gốc**: [e5b712a6](https://github.com/DiceDB/dice/commit/e5b712a659734161030a58a8f40bb8685059e80b).

---

## 11. Command Pipelining

### 11.1 Bối cảnh

Mỗi command 1 RTT (round-trip time). LAN RTT ~0.5 ms → tối đa **~2000 op/s** cho 1 client. Nếu cần load 100k key → 50 giây.

**Pipelining**: client gửi N command liên tiếp **không chờ response**, server đọc và phản hồi tuần tự → 1 RTT cho N command.

### 11.2 Phân tích & cơ chế

#### Wire format

```
Client → SET a 1\r\nSET b 2\r\nSET c 3\r\n         (gửi liền 1 lần)
Server → +OK\r\n+OK\r\n+OK\r\n                     (trả 1 lần)
```

Server **không cần thay đổi protocol** — chỉ cần parser xử lý được nhiều command trong cùng 1 buffer.

#### Yêu cầu phía server

1. **Parser xử lý multi-command trong buffer**: đọc → parse → execute → ghi response → parse tiếp đến hết buffer.
2. **Lưu byte chưa parse được**: nếu buffer kết thúc giữa chừng 1 command (TCP fragment), giữ phần đầu cho lần đọc kế.
3. **Output buffer**: gom nhiều response, ghi 1 lần (giảm syscall write).

#### Pseudo-code

```
on read(client):
    client.inbuf += data
    while True:
        cmd, used = parse(client.inbuf)
        if used == 0: break  # incomplete
        response = execute(cmd)
        client.outbuf += response
        client.inbuf = client.inbuf[used:]
    flush(client.outbuf)
```

### 11.3 Cài đặt minh họa

```go
type Client struct {
	fd     int
	inbuf  []byte
	outbuf []byte
}

func (c *Client) onReadable(data []byte) {
	c.inbuf = append(c.inbuf, data...)
	for {
		cmd, used, err := resp.Decode(c.inbuf)
		if err != nil || used == 0 {
			break
		}
		response := dispatch(cmd.([]interface{}))
		c.outbuf = append(c.outbuf, response...)
		c.inbuf = c.inbuf[used:]
	}
	if len(c.outbuf) > 0 {
		syscall.Write(c.fd, c.outbuf)
		c.outbuf = c.outbuf[:0]
	}
}
```

### 11.4 Benchmark

```bash
# Không pipeline
$ redis-benchmark -t set -n 100000
SET: 120000 requests per second

# Pipeline 16
$ redis-benchmark -t set -n 100000 -P 16
SET: 750000 requests per second

# Pipeline 100
$ redis-benchmark -t set -n 100000 -P 100
SET: 1200000 requests per second
```

→ Pipeline 16 nhanh ~6×, pipeline 100 nhanh ~10×. Saturated tại RAM/network bandwidth.

### 11.5 Tradeoff & ghi chú

- **Khác MULTI/EXEC**: pipelining là **tối ưu network**, không phải transaction. Command vẫn được xen với command của client khác. Atomic chỉ trong từng command.
- **Buffer phải bounded**: gửi 1 triệu command pipeline → server có thể OOM. Client lib (Jedis, redis-py) thường flush mỗi vài nghìn command.
- **Order preserved**: response trả về **theo đúng thứ tự** command gửi.

#### Pipeline KHÔNG phải "gộp lệnh"

Không có cú pháp `cmd1; cmd2` trong RESP. Mỗi command vẫn là **1 RESP frame độc lập**:

```
*2\r\n$3\r\nGET\r\n$1\r\na\r\n  *2\r\n$3\r\nGET\r\n$1\r\nb\r\n  *2\r\n$3\r\nGET\r\n$1\r\nc\r\n
└────── frame GET a ──────┘   └────── frame GET b ──────┘   └────── frame GET c ──────┘
```

3 frame nối đuôi nhau trong **1 lần TCP send**. Tự delimit qua length prefix + `\r\n`, không cần separator.

Redis pipeline = **client không chờ response giữa các lệnh**. Server vẫn execute từng command như bình thường, chỉ là **đọc nhiều frame trong 1 syscall `read()`**.

#### Buffer phía server: byte buffer, không phải queue command

Mỗi client connection có struct riêng (ý tưởng):

```c
struct client {
    int fd;                    // socket FD
    sds querybuf;              // INPUT byte buffer (chưa parse)
    size_t qb_pos;             // cursor parser
    list *reply;               // OUTPUT reply queue (FIFO)
}
```

- `querybuf` = **mảng byte thô**, không biết command boundary trước. TCP có thể về **nửa command** → cần stateful buffer + cursor.
- Parser scan byte, mỗi khi đủ 1 frame → tạo `argv` → execute ngay → reply append vào `reply` list. Không bao giờ enqueue "command object" chờ.
- `reply` list = queue thật (FIFO linked list), pop khi socket writable.

#### Vòng đời 1 client với pipeline 3 lệnh

```
epoll_wait() → fd readable
  ▼
read(fd) → 1 syscall lấy hết 3 frame vào querybuf
  ▼
processInputBuffer loop:
  iter 1: parse frame 1 → execute GET a → append "1" vào reply
  iter 2: parse frame 2 → execute GET b → append "2" vào reply
  iter 3: parse frame 3 → execute GET c → append "3" vào reply
  iter 4: querybuf cạn → break
  ▼
event loop tick tiếp → fd writable → flush reply qua 1 write()
```

→ **1 read syscall + 3 command execute + 1 write syscall** thay vì 3 × (read + execute + write).

#### So sánh Pipeline vs MULTI/EXEC vs Lua

| | Pipeline | MULTI/EXEC | Lua (EVAL) |
|---|---|---|---|
| Mục đích | Giảm RTT network | Atomic batch commands | Atomic + logic phức tạp |
| Số RESP command | N command rời | N command bọc MULTI...EXEC | 1 command (EVAL) |
| Atomic (xen kẽ client khác) | KHÔNG | CÓ (queue server-side, EXEC chạy liền mạch) | CÓ (script chạy single-thread, block server) |
| Có control flow (if/loop) | Không | Không | Có (Lua) |
| Đọc kết quả lệnh trước để quyết định lệnh sau | Không (client chưa nhận response) | Không (commands queued mới execute khi EXEC) | **Có** (`redis.call()` trả ngay trong script) |
| CPU server overhead / command | Bình thường | Bình thường | Thấp hơn (1 parse + dispatch cho cả script) |
| Lỗi 1 command ảnh hưởng các lệnh khác | Không (mỗi lệnh độc lập) | Tiếp tục (Redis không rollback) | Có thể abort script |
| Block server lâu nếu chạy lâu | Không | Không | **Có** (cảnh báo) |
| Khi nào dùng | Bulk load, mass GET/SET | Cần atomic 1 nhóm lệnh đơn giản | Logic conditional cần atomic |

**Ví dụ phân biệt**:

```python
# Pipeline: tối ưu RTT, không atomic, không phụ thuộc kết quả
pipe = r.pipeline(transaction=False)
for k in keys: pipe.get(k)
results = pipe.execute()

# MULTI/EXEC: atomic group
pipe = r.pipeline(transaction=True)
pipe.incr("counter")
pipe.set("last_updated", now)
pipe.execute()   # cả 2 chạy liền mạch, không client khác chen

# Lua: atomic + conditional logic
r.eval("""
  local stock = redis.call('GET', KEYS[1])
  if tonumber(stock) > 0 then
    return redis.call('DECR', KEYS[1])
  end
  return -1
""", 1, "stock:item:123")
```

**Lưu ý**: redis-py `pipeline(transaction=True)` (mặc định) wrap thêm `MULTI`/`EXEC` quanh pipeline → kết hợp cả 2 cơ chế (giảm RTT + atomic). Phải set `transaction=False` để có pipeline thuần.

**Commit gốc**: [ce1690d4](https://github.com/DiceDB/dice/commit/ce1690d492e4ab0d8ad0ee1ada6d666ef24eb3d1).

---

## 12. AOF Persistence

### 12.1 Bối cảnh

Redis in-memory → restart = mất data. Cần persistence. Có 2 cơ chế:

| | RDB | AOF |
|---|---|---|
| Cơ chế | Snapshot binary của toàn dataset | Log mọi write command |
| File size | Nhỏ (binary, có thể compress) | Lớn (text RESP) |
| Recovery time | Nhanh (load binary) | Chậm (replay từng command) |
| Durability worst-case | Mất từ snapshot cuối (phút–giờ) | Mất 1s (với `everysec`) hoặc 0 (với `always`) |
| CPU overhead | Spike khi `BGSAVE` (fork) | Liên tục đều đặn |

Production thường **dùng cả hai**: RDB cho backup định kỳ, AOF cho durability.

### 12.2 Phân tích & cơ chế

#### Flow của AOF

```
Client → SET foo bar
       ↓
Server execute → response gửi client
       ↓
       Encode lại command thành RESP → append vào aof.aof
       ↓
       fsync() theo policy:
         appendfsync always    → mỗi command (mất 0, chậm)
         appendfsync everysec  → mỗi 1s background thread (mất tối đa 1s, default)
         appendfsync no        → OS quyết định (mất nhiều, nhanh nhất)
```

#### Vì sao append-only

- Append tuần tự là **op nhanh nhất** trên đĩa (kể cả HDD).
- Không có "modify" → không có write amplification.
- Recovery = "replay từ đầu".

#### Vấn đề: file phình to vô tận

Sau:
```
SET x 1
SET x 2
SET x 3
DEL x
SET x 4
```
AOF có 5 dòng nhưng state cuối chỉ cần `SET x 4`. → AOF **rewrite** (BGREWRITEAOF).

#### BGREWRITEAOF

```
parent: fork()
        ↓
child:  scan toàn bộ dataset
        encode state hiện tại thành RESP commands tối thiểu
        ghi vào aof.new
        exit
        ↓
parent: trong khi child chạy, vẫn nhận write
        các write này được ghi vào: 
          (1) AOF cũ
          (2) child_diff_buffer (in-memory + pipe đến child từ Redis 7+)
        ↓
        child báo done → parent append diff_buffer vào aof.new
        rename aof.new → aof.aof (atomic)
        unlink aof cũ
```

`fork()` dùng COW (copy-on-write) memory → child có snapshot logic của heap mà không copy thật. Nhưng nếu write rate cao trong khi rewrite → COW page faults nhiều → memory tăng tạm thời.

#### Multi Part AOF (Redis 7+)

Redis 7 chia AOF thành nhiều file:
- `appendonly.aof.1.base.rdb` — snapshot khởi tạo (dạng RDB).
- `appendonly.aof.1.incr.aof` — incremental log từ snapshot.
- `appendonly.aof.manifest` — danh sách part.

Lợi: rewrite nhanh hơn (snapshot dùng binary RDB), recovery nhanh hơn (binary load + replay diff).

### 12.3 Cài đặt minh họa

```go
var aofFile *os.File
var aofMu sync.Mutex

func initAOF() {
	aofFile, _ = os.OpenFile("dice.aof", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	go func() { // fsync everysec
		ticker := time.NewTicker(time.Second)
		for range ticker.C {
			aofMu.Lock()
			aofFile.Sync()
			aofMu.Unlock()
		}
	}()
}

func appendAOF(cmd []string) {
	parts := make([][]byte, len(cmd))
	for i, s := range cmd {
		parts[i] = resp.EncodeBulk(s)
	}
	buf := resp.EncodeArray(parts)

	aofMu.Lock()
	defer aofMu.Unlock()
	aofFile.Write(buf)
}

func dispatch(cmd []string) []byte {
	response := execute(cmd)
	if isWriteCommand(cmd[0]) {
		appendAOF(cmd)
	}
	return response
}

// Recovery on startup
func loadAOF() {
	f, _ := os.Open("dice.aof")
	defer f.Close()
	data, _ := io.ReadAll(f)
	pos := 0
	for pos < len(data) {
		cmd, used, err := resp.Decode(data[pos:])
		if err != nil {
			break
		}
		execute(toStringSlice(cmd))
		pos += used
	}
}
```

### 12.4 Tradeoff & ghi chú

- **`appendfsync always`**: an toàn nhất nhưng throughput giảm 10-20× (mỗi op = 1 fsync = 1-10 ms tùy disk).
- **`appendfsync everysec`**: cân bằng tốt nhất, default.
- **AOF corruption**: nếu crash giữa fsync, file có thể có command lẻ → `redis-check-aof --fix` cắt phần lỗi.
- **Replication**: thường master AOF, slave không AOF (chỉ replicate từ master) → giảm tải đĩa.

**Commit gốc**: [249cb3ac](https://github.com/DiceDB/dice/commit/249cb3acc4f22888dfc81a9bd72fab3aca083302).

---

## 13. Object, Encoding & INCR

### 13.1 Bối cảnh

Một câu hỏi tinh tế: tại sao `SET counter 100` rồi `INCR counter` lại trả `(integer) 101` mà không `(string) "101"`? Vì Redis **không** lưu mọi value như string — nó wrap mỗi value trong `robj` (Redis Object) với **type** và **encoding**.

### 13.2 Phân tích & cơ chế

#### `robj` structure

```c
typedef struct redisObject {
    unsigned type:4;       // STRING, LIST, SET, ZSET, HASH, STREAM
    unsigned encoding:4;   // INT, EMBSTR, RAW, ZIPLIST, INTSET, HT, SKIPLIST, ...
    unsigned lru:24;       // LRU clock hoặc LFU counter
    int refcount;          // refcounting cho shared object (small int 0-9999)
    void *ptr;             // trỏ đến data thật
} robj;
```

→ Mỗi object base 16 byte (header) + data ngoài.

#### Encoding cho STRING

| Encoding | Khi nào | Memory |
|---|---|---|
| `int` | Value parse được thành `long` (vd "100", "12345") | Lưu vào `ptr` luôn, không alloc string |
| `embstr` | String ≤ 44 byte | `robj` + SDS header + data **liền 1 block** (1 lần malloc) |
| `raw` | String > 44 byte | `robj` 1 block, SDS+data 1 block (2 malloc) |

Số 44 đến từ đâu? jemalloc allocate theo size class. Block 64 byte là class phổ biến nhất, chứa đầy đủ: `robj` (16B) + SDS header `sdshdr8` (3B) + nul terminator (1B) + 44 byte data = 64 byte → **không tốn extra arena**.

Kiểm tra:
```
> SET foo 100
OK
> OBJECT ENCODING foo
"int"

> SET foo "hello world"
OK
> OBJECT ENCODING foo
"embstr"

> SET foo "x...50 chars..."
OK
> OBJECT ENCODING foo
"raw"
```

#### Shared integer objects

Với số trong khoảng 0-9999 (config `OBJ_SHARED_INTEGERS = 10000`), Redis có **pool 10000 robj pre-allocated** dùng chung. `SET key 5` → `key.ptr` trỏ đến shared `robj` cho `5`, refcount++. Tiết kiệm RAM khi có nhiều key cùng giá trị nhỏ.

#### INCR

```
INCR key:
  obj := store[key]
  if obj không tồn tại: store[key] = robj{int, 1}; return 1
  if obj.encoding != int và không parse được integer: return error
  obj.value++
  return obj.value
```

Lưu ý: `INCR` chỉ work với encoding `int`. Nếu là `raw`/`embstr` nhưng nội dung parse được số → upgrade encoding sang `int` rồi tăng.

### 13.3 Cài đặt minh họa

```go
type Obj struct {
	Value    interface{}
	Type     string // "string", "list", ...
	Encoding string // "int", "embstr", "raw"
}

func makeStringObj(s string) *Obj {
	if n, err := strconv.ParseInt(s, 10, 64); err == nil {
		return &Obj{Value: n, Type: "string", Encoding: "int"}
	}
	if len(s) <= 44 {
		return &Obj{Value: s, Type: "string", Encoding: "embstr"}
	}
	return &Obj{Value: s, Type: "string", Encoding: "raw"}
}

func executeINCR(args []string) []byte {
	key := args[0]
	obj, ok := store[key]
	if !ok {
		store[key] = &Obj{Value: int64(1), Type: "string", Encoding: "int"}
		return resp.EncodeInt(1)
	}
	if obj.Type != "string" {
		return resp.EncodeError("WRONGTYPE Operation against a key holding the wrong kind of value")
	}
	switch v := obj.Value.(type) {
	case int64:
		v++
		obj.Value = v
		return resp.EncodeInt(v)
	case string:
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil {
			return resp.EncodeError("ERR value is not an integer or out of range")
		}
		n++
		obj.Value = n
		obj.Encoding = "int"
		return resp.EncodeInt(n)
	}
	return resp.EncodeError("ERR unexpected value type")
}

func executeOBJECT(args []string) []byte {
	if strings.ToUpper(args[0]) != "ENCODING" {
		return resp.EncodeError("ERR unknown subcommand")
	}
	obj, ok := store[args[1]]
	if !ok {
		return resp.EncodeBulkNil()
	}
	return resp.EncodeBulk(obj.Encoding)
}
```

### 13.4 Tradeoff & ghi chú

- Encoding `int` cực gọn: 1 robj 16B vs string `"12345"` cần 16B + 8B header + 6B data = 30B. → Counter pattern (rate limit, view count) hưởng lợi lớn.
- Encoding **không thể xuống cấp**: một khi convert ziplist → quicklist, không quay về dù shrink. (Vì cost phát hiện + convert lớn hơn lợi ích.)

**Commit gốc**: [9acc214b](https://github.com/DiceDB/dice/commit/9acc214b4c4993d791a6dc67d6d8fb95fef42c79).

---

## 14. INFO & allkeys-random

### 14.1 Bối cảnh

Operator cần biết Redis "đang ổn" — bao nhiêu memory, bao nhiêu connection, hit rate cache. `INFO` trả về metric đó dạng text dễ parse bởi monitoring agent (Prometheus exporter, Datadog).

### 14.2 Phân tích & cơ chế

#### Format

Section header `# Name` + dòng `key:value` + ngăn cách `\r\n\r\n`.

```
# Server
redis_version:7.2.0
uptime_in_seconds:13456

# Clients
connected_clients:42

# Memory
used_memory:1024768
used_memory_human:1.00M
maxmemory:104857600
maxmemory_policy:allkeys-lru
mem_fragmentation_ratio:1.23

# Stats
total_connections_received:9001
total_commands_processed:1500000
keyspace_hits:1200000
keyspace_misses:300000

# Keyspace
db0:keys=1000,expires=400,avg_ttl=120000
```

#### Sub-sections

`INFO server`, `INFO memory`, `INFO replication`, ... gọi đúng phần cần để giảm noise.

#### Metric quan trọng

- `used_memory` vs `used_memory_rss`: logic vs OS-resident → `mem_fragmentation_ratio`.
- `keyspace_hits / (hits + misses)` → cache hit rate.
- `instantaneous_ops_per_sec` → throughput hiện tại.
- `connected_clients` → so với `maxclients` config.
- `rdb_last_bgsave_status` / `aof_last_bgrewrite_status` → persistence health.

### 14.3 Cài đặt minh họa

```go
type Stats struct {
	StartTime      time.Time
	CommandsRun    atomic.Uint64
	KeyspaceHits   atomic.Uint64
	KeyspaceMisses atomic.Uint64
	Connections    atomic.Uint64
}

var stats = &Stats{StartTime: time.Now()}

func executeINFO(args []string) []byte {
	var sb strings.Builder
	sb.WriteString("# Server\r\n")
	sb.WriteString(fmt.Sprintf("uptime_in_seconds:%d\r\n", int(time.Since(stats.StartTime).Seconds())))

	sb.WriteString("\r\n# Memory\r\n")
	sb.WriteString(fmt.Sprintf("used_memory:%d\r\n", memoryUsage()))
	sb.WriteString(fmt.Sprintf("maxmemory:%d\r\n", maxMemory))
	sb.WriteString(fmt.Sprintf("maxmemory_policy:%s\r\n", evictionPolicy))

	sb.WriteString("\r\n# Stats\r\n")
	sb.WriteString(fmt.Sprintf("total_commands_processed:%d\r\n", stats.CommandsRun.Load()))
	sb.WriteString(fmt.Sprintf("keyspace_hits:%d\r\n", stats.KeyspaceHits.Load()))
	sb.WriteString(fmt.Sprintf("keyspace_misses:%d\r\n", stats.KeyspaceMisses.Load()))

	sb.WriteString("\r\n# Keyspace\r\n")
	sb.WriteString(fmt.Sprintf("db0:keys=%d\r\n", len(store)))

	return resp.EncodeBulk(sb.String())
}
```

#### allkeys-random eviction

Vì Go `range map` iterate ngẫu nhiên → lấy phần tử đầu coi như random:

```go
func evictRandom() {
	for k := range store {
		delete(store, k)
		return
	}
}
```

Trong C, Redis dùng `dictGetRandomKey()` chọn slot ngẫu nhiên trong hash table.

### 14.4 Tradeoff & ghi chú

- `INFO` không tốn nhiều CPU nhưng `INFO all` có thể chứa rất nhiều dòng — đừng gọi mỗi giây từ monitoring.
- `MEMORY USAGE key` (Redis 4+) báo bytes 1 key cụ thể chiếm — hữu ích debug.

**Commit gốc**: [38f156ae](https://github.com/DiceDB/dice/commit/38f156aeb091d95fd349f865567d02d77d2752d5).

---

## 15. Approximated LRU

### 15.1 Bối cảnh

LRU "thật" (Least Recently Used chính xác) cần doubly-linked list + hashmap:
- Lookup: O(1) qua hashmap.
- Touch (move to head): O(1) qua linked list pointer.

Nhưng:
- 2 pointer/object = **16 byte overhead** (64-bit). Với 100M object → 1.6 GB chỉ cho LRU pointer.
- Mỗi access phải splice list — touch random pointer → **cache miss** liên tục.
- Trong Redis context: LRU chỉ cần khi evict (hiếm xảy ra) — vô lý phải trả overhead này cho mọi access.

### 15.2 Phân tích & cơ chế

#### Ý tưởng "approximated"

Mỗi object lưu `lru_clock` 24-bit (đơn vị giây) trong 24 bit của `robj.lru`. Khi cần evict:

```
1. Sample N key ngẫu nhiên (default N=5, có thể chỉnh `maxmemory-samples`).
2. Trong N key đó, chọn key có lru_clock cũ nhất.
3. Evict.
```

Với N=5 thì xác suất chọn đúng key "thực sự cũ nhất" trong dataset là không 100%, nhưng phân bố thống kê **rất gần** LRU thật. Tăng N → chính xác hơn, chậm hơn.

#### Pool optimization (Redis 3.0+)

Vấn đề: với N=5, đôi khi sample bỏ qua những key "siêu cũ" đang nằm trong dict.

Giải pháp: **giữ pool 16 candidate** giữa các lần eviction. Mỗi sample chỉ thêm key vào pool nếu cũ hơn key cũ thứ k trong pool. Khi evict thật, lấy key cũ nhất từ pool.

→ Eviction "ghi nhớ" candidate qua các cycle, ổn định hơn.

#### Lưu LRU thế nào với 24 bit

24 bit unix seconds = **194 ngày** trước khi wrap-around. Đủ cho mục đích so sánh tương đối. Khi wrap-around, so sánh phải tính circular distance.

### 15.3 Cài đặt minh họa

```go
type Obj struct {
	Value    interface{}
	LRUClock uint32 // 24 bit thực dụng, thực tế dùng uint32 cho tiện
}

var lruClock atomic.Uint32 // server-wide clock, update mỗi second

func init() {
	go func() {
		ticker := time.NewTicker(time.Second)
		for range ticker.C {
			lruClock.Store(uint32(time.Now().Unix()))
		}
	}()
}

func (o *Obj) touch() { o.LRUClock = lruClock.Load() }

// Sample N key, return key cũ nhất
func evictApproximatedLRU(sampleSize int) {
	var oldestKey string
	var oldestClock uint32 = math.MaxUint32

	i := 0
	for k, obj := range store {
		if i >= sampleSize {
			break
		}
		if obj.LRUClock < oldestClock {
			oldestClock = obj.LRUClock
			oldestKey = k
		}
		i++
	}
	if oldestKey != "" {
		delete(store, oldestKey)
	}
}
```

Mỗi `GET`/`SET` gọi `obj.touch()` để update LRU clock.

### 15.4 Tradeoff & ghi chú

- Tăng `maxmemory-samples` từ 5 → 10 → eviction gần LRU thật hơn, nhưng eviction phase chậm hơn (gấp đôi).
- Approximated LRU **không** track theo thứ tự touch — chỉ "thời điểm cuối". Nếu A bị touch nhiều lần gần nhau, A ít có khả năng bị evict; nhưng phân bố giữa nhiều key cùng touch trong cùng giây 0 phân biệt được.
- **LRU vs LFU**: LRU dở với pattern "scan toàn bộ data 1 lần" (e.g., backup) — nó push hot data ra và keep cold data vừa scan. LFU (section 25) chống lại pattern này.

**Tham khảo**: [Redis LRU implementation](https://redis.io/docs/manual/eviction/#approximated-lru-algorithm) · **Commit**: [a37c5f2e](https://github.com/DiceDB/dice/commit/a37c5f2e3a0e3b9cdcb0d70506111f27fea843bb).

---

## 16. Redis cap memory như thế nào

### 16.1 Bối cảnh

Redis chạy in-memory → nếu không giới hạn, sẽ ăn hết RAM máy → OOM kill bởi kernel → mất hết. `maxmemory` config là giới hạn cứng.

### 16.2 Phân tích & cơ chế

#### Đo memory chính xác

`used_memory` không phải `sizeof(value)`. Bao gồm:

- Memory thực data: keys + values.
- `robj` overhead: 16B mỗi object.
- Dict overhead: bucket array + collision chain + load factor headroom (~50% extra).
- Buffer client: input/output buffer, mỗi client ~32KB initial.
- Replication backlog: 1MB default.
- AOF buffer trong memory.
- Lua script cache, slowlog, ...

Redis tracks bằng `zmalloc()` wrapper: mọi alloc/free đi qua hàm này, tăng/giảm counter atomic. Với jemalloc, dùng `je_malloc_usable_size(ptr)` để biết jemalloc **thực sự** cấp bao nhiêu (round up theo size class), không chỉ size yêu cầu.

#### Eviction trigger

```
trước khi execute mỗi write command:
  if used_memory + estimated_command_size > maxmemory:
    repeat:
      evict_one_key()
    until used_memory < maxmemory hoặc không evict được nữa
  if vẫn vượt: return OOM error
```

→ Eviction **trên hot path** của write. Nếu workload write heavy + tight memory budget → latency spike.

#### Fragmentation

`used_memory` (logic, từ zmalloc counter) ≠ `used_memory_rss` (RSS từ OS).

```
mem_fragmentation_ratio = used_memory_rss / used_memory
```

- Ratio ~1.0–1.5: bình thường.
- Ratio > 1.5: fragmentation đáng kể, jemalloc giữ page không free về OS.
- Ratio < 1.0: hiếm, nghĩa là Redis đang swap → cực xấu cho latency.

#### Active defragmentation (Redis 4.0+)

`activedefrag yes` cho phép background thread di chuyển object để consolidate page → free page về OS. Tốn CPU nhưng giảm RSS.

### 16.3 Cài đặt minh họa

```go
func estimateObjectSize(obj *Obj) int {
	size := 24 // header + flags
	switch v := obj.Value.(type) {
	case string:
		size += len(v) + 16 // SDS header xấp xỉ
	case int64:
		size += 8
	case []string:
		for _, s := range v {
			size += len(s) + 16
		}
	}
	return size
}

func memoryUsage() int {
	total := 0
	for k, obj := range store {
		total += len(k) + 16 + estimateObjectSize(obj)
	}
	return total + bucketOverhead(len(store)) + clientBufferTotal()
}

func bucketOverhead(n int) int {
	bucketCount := 1
	for bucketCount < n {
		bucketCount *= 2
	}
	return bucketCount * 8 // pointer mỗi bucket
}
```

### 16.4 Tradeoff & ghi chú

- Đặt `maxmemory` ~75% RAM máy: chừa room cho OS, fork (RDB/AOF rewrite COW có thể spike).
- Đừng để `maxmemory = 0` (unlimited) trong production.
- Pattern "RAM nóng hot, RAM lạnh swap" → **không** dùng Redis. Redis assume mọi data fit RAM.

---

## 17. Override malloc — jemalloc/tcmalloc

### 17.1 Bối cảnh

glibc `malloc` (ptmalloc) thiết kế cho workload chung. Redis có workload đặc thù:
- Hàng triệu allocation cỡ nhỏ (8–64 byte).
- Pattern free-and-alloc trộn liên tục (eviction + expire).
- Multi-thread không nhiều (chỉ background fsync, defrag), nhưng cần predictable.

→ glibc malloc tạo fragmentation cao trong scenario này.

### 17.2 Phân tích & cơ chế

#### jemalloc (Facebook, default của Redis)

- Chia heap thành **arenas** (mặc định `4 × ncpu`), thread mapping sang arena → giảm contention.
- Mỗi arena có **size classes**: 8B, 16B, 32B, 48B, 64B, 80B, 96B, … (geometric). Alloc 50B → round lên class 64B.
- **Thread cache** (tcache): mỗi thread cache vài object size phổ biến → alloc không cần touch arena.
- **Background thread** dồn page rỗng trả OS (`MADV_DONTNEED`).
- Provides `je_malloc_usable_size()` để biết size thật được cấp.

#### tcmalloc (Google)

- Tương tự jemalloc: thread-cache + central free list + page heap.
- Profiling tích hợp (`HEAPPROFILE` env var).
- Heavy multi-thread tối ưu hơn jemalloc theo benchmark Google, nhưng khác biệt nhỏ với workload Redis.

#### Build Redis với jemalloc

```bash
make MALLOC=jemalloc   # default trên Linux
make MALLOC=tcmalloc
make MALLOC=libc       # fallback glibc
```

### 17.3 Trong Go

Go có GC riêng → không thay malloc trực tiếp. Để dùng jemalloc cho **off-heap** allocation (tránh GC pressure cho data lớn), Dgraph dùng cgo:

```c
// C wrapper
#include <jemalloc/jemalloc.h>
void* je_alloc(size_t n) { return je_malloc(n); }
void  je_release(void* p) { je_free(p); }
```

```go
/*
#cgo LDFLAGS: -ljemalloc
#include "wrapper.h"
*/
import "C"
import "unsafe"

func Alloc(size int) unsafe.Pointer {
	return C.je_alloc(C.size_t(size))
}
```

Lợi: 1 GB byte buffer không phải đi qua Go GC → giảm pause time.

### 17.4 Tradeoff & ghi chú

- jemalloc fragmentation **thấp hơn glibc 20–40%** với workload Redis.
- Tcmalloc/jemalloc đều dùng **internal pool** → memory ratio (RSS vs used) có thể cao tạm thời (page chưa trả OS).
- Nếu chạy trong container có cgroup memory limit, set `MALLOC_ARENA_MAX=2` (cho glibc) hoặc dùng jemalloc — tránh OOM kill do arena phình.

**Tham khảo**: [Dgraph: Manual memory management in Go](https://dgraph.io/blog/post/manual-memory-management-golang-jemalloc/).

---

## 18. Graceful Shutdown

### 18.1 Bối cảnh

`kill -9` (SIGKILL) cắt phăng process → AOF có thể dở dang, client đang xử lý command bị treo, replication backlog mất. Production cần shutdown "sạch":

1. Dừng accept connection mới.
2. Hoàn tất command đang chạy.
3. Flush AOF, fsync.
4. (Optional) Trigger BGSAVE cuối.
5. Close client connection.
6. Exit.

### 18.2 Phân tích & cơ chế

#### POSIX signals

| Signal | Mặc định | Catchable | Mục đích |
|---|---|---|---|
| `SIGINT` (2) | Terminate | Có | Ctrl+C |
| `SIGTERM` (15) | Terminate | Có | `kill <pid>` — request shutdown lịch sự |
| `SIGKILL` (9) | Terminate | **Không** | Force kill |
| `SIGHUP` (1) | Terminate | Có | Reload config (convention) |
| `SIGCHLD` | Ignored | Có | Child process (RDB/AOF rewrite fork) chết |
| `SIGUSR1` | Terminate | Có | Custom (Redis dùng cho điểm test) |

`SIGKILL` không catch được — đó là lý do orchestrator (systemd, kubernetes) gửi `SIGTERM` trước, đợi grace period (default 30s), rồi mới `SIGKILL`.

#### Signal handler restrictions

Trong C, signal handler chạy trong async context — chỉ được dùng **async-signal-safe** function (rất ít). Redis dùng kỹ thuật chuẩn: handler chỉ **set flag** (`server.shutdown_asap = 1`), event loop check flag mỗi tick.

#### Compare-and-Swap (CAS)

Để flag thread-safe mà không lock: dùng `std::atomic_bool` (C++) hoặc `atomic.Bool` (Go). Set atomic → đảm bảo write visible cross-CPU.

### 18.3 Cài đặt minh họa

```go
import (
	"os"
	"os/signal"
	"sync/atomic"
	"syscall"
)

var shutdown atomic.Bool

func main() {
	go signalHandler()
	for !shutdown.Load() {
		runEventLoopOnce()
	}
	gracefulShutdown()
}

func signalHandler() {
	c := make(chan os.Signal, 1)
	signal.Notify(c, syscall.SIGTERM, syscall.SIGINT)
	sig := <-c
	fmt.Printf("received signal: %v\n", sig)
	shutdown.Store(true)
}

func runEventLoopOnce() {
	// epoll_wait, dispatch, time events
}

func gracefulShutdown() {
	fmt.Println("graceful shutdown starting...")

	stopAcceptingNewConnections()  // close listen FD
	waitForInflightCommands()      // đảm bảo command đang chạy xong

	if aofEnabled {
		aofFile.Sync()
		aofFile.Close()
	}
	if shutdownSave {
		performBGSave() // optional final snapshot
	}

	closeAllClients()
	fmt.Println("bye")
	os.Exit(0)
}
```

### 18.4 Tradeoff & ghi chú

- **Grace period**: kubernetes default `terminationGracePeriodSeconds: 30`. Nếu Redis có dataset lớn cần BGSAVE > 30s → pod bị kill cứng. Tăng grace period hoặc tắt `shutdown-save`.
- **`SHUTDOWN` command**: client gọi `SHUTDOWN [NOSAVE|SAVE]` cũng kích hoạt cùng path.
- **Persistence vs speed tradeoff**: `SHUTDOWN NOSAVE` bỏ qua final save → mất data từ snapshot/AOF cuối; `SHUTDOWN SAVE` block đến khi save xong.

**Commit gốc**: [0b848b8c](https://github.com/DiceDB/dice/commit/0b848b8c87f58806590d35f4ab3d2bc4fc85ba34).

---

## 19. Transactions (MULTI/EXEC)

### 19.1 Bối cảnh

Use case kinh điển: transfer balance giữa 2 account.
```
GET account:A     → 100
GET account:B     → 50
SET account:A 80
SET account:B 70
```
Nếu có client khác xen vào giữa, ta được state sai. Cần "tất cả hoặc không gì".

### 19.2 Phân tích & cơ chế

#### Semantics của MULTI/EXEC

```
MULTI       → server bật transaction mode, +OK
SET a 1     → command được queue, server trả +QUEUED
SET b 2     → +QUEUED
EXEC        → execute toàn bộ queue atomic, trả array reply
DISCARD     → bỏ queue, +OK
```

#### Tại sao Redis transaction **đặc biệt** so với SQL

1. **Atomicity = single-thread**: vì Redis single-threaded, EXEC chạy queue **không bị xen** — không cần lock.
2. **KHÔNG có rollback**: nếu command thứ 3 trong queue lỗi **runtime** (vd `INCR` trên string), các command khác **vẫn chạy**. Lý do thiết kế (theo antirez): rollback phức tạp, mâu thuẫn với data model — bug runtime thường là bug application, nên fail loud.
3. **Syntax error trước EXEC** → queue bị discard, EXEC trả `EXECABORT`.

#### WATCH — optimistic concurrency control

Để có atomicity với điều kiện ("chỉ commit nếu key X chưa đổi"), dùng WATCH:

```
WATCH balance:A
val = GET balance:A
... business logic ...
MULTI
SET balance:A (val - 10)
EXEC          → nếu balance:A bị client khác đổi sau WATCH → EXEC trả (nil), tx abort
```

Đây là pattern **CAS** (compare-and-swap) cho multi-step.

#### Implementation: per-client state

```go
type Client struct {
	fd       int
	inMulti  bool
	queue    [][]string
	watched  map[string]uint64 // key → version snapshot lúc WATCH
}
```

Mỗi key có version counter trong store; mỗi write tăng version. EXEC compare watched.version với current.version, mismatch → abort.

### 19.3 Cài đặt minh họa

```go
var keyVersion = make(map[string]uint64)

func versionOf(k string) uint64 { return keyVersion[k] }
func bumpVersion(k string)      { keyVersion[k]++ }

func dispatch(c *Client, cmd []string) []byte {
	op := strings.ToUpper(cmd[0])
	switch op {
	case "MULTI":
		if c.inMulti {
			return resp.EncodeError("ERR MULTI calls can not be nested")
		}
		c.inMulti = true
		c.queue = nil
		return resp.EncodeSimple("OK")

	case "EXEC":
		if !c.inMulti {
			return resp.EncodeError("ERR EXEC without MULTI")
		}
		c.inMulti = false
		defer func() { c.queue = nil; c.watched = nil }()

		if !checkWatched(c) {
			return resp.EncodeBulkNil() // tx aborted by WATCH
		}
		replies := make([][]byte, 0, len(c.queue))
		for _, q := range c.queue {
			replies = append(replies, execute(q))
		}
		return resp.EncodeArray(replies)

	case "DISCARD":
		if !c.inMulti {
			return resp.EncodeError("ERR DISCARD without MULTI")
		}
		c.inMulti = false
		c.queue = nil
		c.watched = nil
		return resp.EncodeSimple("OK")

	case "WATCH":
		if c.inMulti {
			return resp.EncodeError("ERR WATCH inside MULTI is not allowed")
		}
		if c.watched == nil {
			c.watched = make(map[string]uint64)
		}
		for _, k := range cmd[1:] {
			c.watched[k] = versionOf(k)
		}
		return resp.EncodeSimple("OK")

	default:
		if c.inMulti {
			c.queue = append(c.queue, cmd)
			return resp.EncodeSimple("QUEUED")
		}
		return execute(cmd)
	}
}

func checkWatched(c *Client) bool {
	for k, v := range c.watched {
		if versionOf(k) != v {
			return false
		}
	}
	return true
}
```

### 19.4 Tradeoff & ghi chú

- **Không phải ACID đầy đủ**: I (Isolation) đạt, A (Atomic execution) đạt theo nghĩa "không xen", nhưng D (Durability) phụ thuộc AOF policy.
- **Pipelining ≠ Transaction**: pipeline là tối ưu network, không atomic. MULTI/EXEC bảo đảm atomic execution.
- **Lua script** thay thế tốt hơn cho logic phức tạp: `EVAL` script chạy single-thread atomic, có biến local, control flow, errors handled trong script.

**Commit gốc**: [d284bd0a](https://github.com/DiceDB/dice/commit/d284bd0a478c9183ec6a90e9e93b904531f034e0).

---

## 20. List Internals — Ziplist & Quicklist

### 20.1 Bối cảnh

Câu hỏi: List của Redis là gì? "Doubly linked list" — câu trả lời đơn giản nhất, nhưng **sai** với version hiện đại. Hiểu vì sao Redis bỏ linked list "classic" cho cái phức tạp hơn rất nhiều = học được bài học về cache locality và memory overhead trong system thực.

### 20.2 Phân tích & cơ chế

#### Bài toán memory của doubly-linked list

Mỗi node:
```c
struct listNode {
    void *value;          // 8B pointer to data
    struct listNode *prev; // 8B
    struct listNode *next; // 8B
};
// + heap header per allocation: ~8-16B
// = ~40 byte overhead per element
```

Lưu 1 triệu số nhỏ (giả sử 4B mỗi cái) → data thật 4MB nhưng overhead **40MB**. Tệ hơn: pointer rải rác trên heap → mỗi traversal là cache miss liên tục.

#### Ziplist — dense packed array

```
+----------+--------+--------+--------+ ... +-------+
| zlbytes  | zltail | zllen  |  e1    |     | zlend |
+----------+--------+--------+--------+ ... +-------+
 4 byte     4 byte   2 byte                  1 byte (0xFF)
```

- `zlbytes`: tổng số byte của ziplist (để biết end mà không scan).
- `zltail`: offset đến entry cuối (cho LPUSH/RPUSH O(1)).
- `zllen`: số entry, max 65535 (vượt → phải scan đếm).

Mỗi entry:
```
+-----------+---------+-----------+
| prev_len  | encoding|   data    |
+-----------+---------+-----------+
 1B hoặc 5B  1-5B      variable
```

- `prev_len`: byte trước đó dài bao nhiêu, cho traversal **ngược** (RPOP). 1 byte nếu prev ≤ 253 byte, ngược lại 5 byte (1 byte marker `0xFE` + 4 byte length).
- `encoding`: int (8B/16B/24B/32B/64B) hoặc string (mã hóa độ dài 6-bit/14-bit/40-bit).
- `data`: payload thực.

→ Mỗi entry overhead chỉ 2-11 byte (so với 40B của linked list). Cache-friendly: traversal là sequential read trên contiguous memory.

#### Vấn đề của ziplist: cascade update

Insert giữa list → phải shift toàn bộ entry sau. Tệ hơn:

```
... | e_i (prev_len=1B) | e_{i+1} ...
```

Insert entry mới dài > 253B trước `e_i` → `e_i.prev_len` phải từ 1B lên 5B → kích thước `e_i` thay đổi 4B → `e_{i+1}.prev_len` có thể cũng cần đổi → **cascade**. Trong worst case O(n²).

→ Ziplist chỉ phù hợp **list ngắn**.

#### Quicklist = linked list của ziplist

```
HEAD → [ziplist 8KB] ↔ [ziplist 8KB] ↔ ... ↔ [ziplist 8KB] ← TAIL
```

Mỗi quicklist node chứa 1 ziplist (default size 8KB hoặc 128 entry, config `list-max-ziplist-size`). Khi ziplist node đầy → tạo node mới.

Benefit:
- **Linked list level**: O(1) push/pop 2 đầu, không có cascade liên-node.
- **Ziplist level**: dense, cache-friendly trong node.

#### Benchmark (matt.sh)

| Scenario | Linked list | Quicklist |
|---|---|---|
| 200 list × 1M int | 11.86 GB | **1.0 GB** |
| 1 list × 23.5M element | 1.67 GB | **0.3 GB** |

→ Tiết kiệm 10× memory không hiếm.

#### Compression giữa các node

`list-compress-depth N`: 2 node ở 2 đầu (HEAD/TAIL) **không** compress (vì LPUSH/RPUSH/LPOP/RPOP cần truy cập nhanh); node giữa được LZF compress. N=1 nghĩa "giữ 1 node mỗi đầu uncompressed".

Tradeoff: compress giảm RAM 2-3×, nhưng `LINDEX list 5000000` chậm hơn vì phải decompress node.

#### Listpack (Redis 7.2+)

Thay ziplist bằng **listpack**. Khác biệt chính: **bỏ `prev_len`** trong entry → mỗi entry chỉ chứa `len + data + total-bytes-of-entry-encoded-at-the-end`. Loại bỏ hoàn toàn cascade update. Traversal ngược dùng "total bytes" cuối entry để jump.

### 20.3 Cài đặt minh họa

```go
const (
	ziplistMaxEntries = 128
	ziplistMaxValueSize = 64
)

type Quicklist struct {
	head *qlNode
	tail *qlNode
	count int
}

type qlNode struct {
	prev, next *qlNode
	zl         *ziplist // mỗi node 1 ziplist
}

type ziplist struct {
	entries [][]byte // simplified — production dùng packed bytes
}

func (q *Quicklist) RPush(v []byte) {
	if q.tail == nil || len(q.tail.zl.entries) >= ziplistMaxEntries {
		newNode := &qlNode{zl: &ziplist{}}
		if q.tail != nil {
			q.tail.next = newNode
			newNode.prev = q.tail
		} else {
			q.head = newNode
		}
		q.tail = newNode
	}
	q.tail.zl.entries = append(q.tail.zl.entries, v)
	q.count++
}

func (q *Quicklist) LIndex(i int) ([]byte, bool) {
	cur := q.head
	for cur != nil {
		if i < len(cur.zl.entries) {
			return cur.zl.entries[i], true
		}
		i -= len(cur.zl.entries)
		cur = cur.next
	}
	return nil, false
}
```

### 20.4 Tradeoff & ghi chú

- Encoding **không downgrade**. Một khi quicklist, không quay về ziplist dù `LPOP` về size nhỏ.
- `LRANGE 0 -1` của list 10M element vẫn nhanh nhờ ziplist contiguous (1 lần memcpy thay vì 10M pointer chase).
- Đừng dùng `LSET key index value` với index xa từ 2 đầu — O(n) traversal qua quicklist.

**Tham khảo**: [Redis Quicklist - From a More Civilized Age (matt.sh)](https://matt.sh/redis-quicklist) · **Issue**: [dice/issues/4](https://github.com/DiceDB/dice/issues/4).

---

## 21. Set Internals — Intset

### 21.1 Bối cảnh

`SADD myset 1 2 3` — set 3 phần tử nhỏ. Dùng hashtable (default cho Set) = overhead cao: mỗi entry tốn ~50 byte. Với set toàn integer và nhỏ → Redis dùng **intset**: mảng integer sorted compact.

### 21.2 Phân tích & cơ chế

#### Layout

```c
typedef struct intset {
    uint32_t encoding;   // INTSET_ENC_INT16 (2), INT32 (4), hoặc INT64 (8)
    uint32_t length;     // số phần tử
    int8_t contents[];   // mảng byte, parse theo encoding
} intset;
```

`contents` là **flexible array member**: alloc liền sau struct, kích thước = `length × encoding` byte.

Ví dụ intset chứa `{3, 7, 11}` với encoding INT16:
```
encoding=2 | length=3 | 03 00 | 07 00 | 0B 00
```

#### Sorted invariant

`contents` luôn sorted tăng dần → `SISMEMBER` dùng **binary search O(log n)**:

```c
intsetSearch(is, value):
    if length == 0: return false, 0
    if value > contents[length-1]: return false, length     // append
    if value < contents[0]: return false, 0                 // prepend
    lo, hi = 0, length-1
    while lo <= hi:
        mid = (lo + hi) >> 1
        cur = contents[mid]
        if cur == value: return true, mid
        if cur < value: lo = mid + 1
        else: hi = mid - 1
    return false, lo
```

#### Encoding upgrade

Khởi đầu INT16 (8K range). Nếu thêm số không fit INT16 (vd 40000):
1. Cấp phát buffer mới với encoding INT32.
2. **Đi ngược từ cuối** mảng cũ, copy sang chỗ mới ở encoding mới (đi ngược tránh overwrite chưa đọc).
3. Append giá trị mới (chắc chắn là min hoặc max — vì nếu fit encoding cũ thì không cần upgrade).
4. Update encoding, length.

Không có downgrade: xóa số lớn không tự shrink encoding (đơn giản hơn, ít edge case).

#### Insert/Delete

Đều O(n) do `memmove` shift để giữ sorted + dense. Tuy nhiên `memmove` được tối ưu sâu trong libc (SSE/AVX) — fast hơn nhiều so với O(n) tự loop.

#### Khi chuyển sang hashtable

- Thêm member non-integer (vd "hello") → convert ngay.
- Vượt `set-max-intset-entries` (default 512).

Convert: cấp hashtable, insert từng member, free intset.

### 21.3 Cài đặt minh họa

```go
type IntSet struct {
	encoding int // 2, 4, 8 byte
	contents []int64
}

func (s *IntSet) Add(v int64) bool {
	pos, found := s.search(v)
	if found {
		return false
	}
	// insert position pos, giữ sorted
	s.contents = append(s.contents, 0)
	copy(s.contents[pos+1:], s.contents[pos:])
	s.contents[pos] = v

	required := requiredEncoding(v)
	if required > s.encoding {
		s.encoding = required
	}
	return true
}

func (s *IntSet) search(v int64) (int, bool) {
	lo, hi := 0, len(s.contents)-1
	for lo <= hi {
		mid := (lo + hi) / 2
		if s.contents[mid] == v {
			return mid, true
		}
		if s.contents[mid] < v {
			lo = mid + 1
		} else {
			hi = mid - 1
		}
	}
	return lo, false
}

func (s *IntSet) IsMember(v int64) bool {
	_, found := s.search(v)
	return found
}

func requiredEncoding(v int64) int {
	if v >= math.MinInt16 && v <= math.MaxInt16 {
		return 2
	}
	if v >= math.MinInt32 && v <= math.MaxInt32 {
		return 4
	}
	return 8
}
```

### 21.4 Tradeoff & ghi chú

- Intset ăn ít RAM **đáng kể**: 100 int trong intset ~200B, trong hashtable ~5KB.
- O(log n) lookup vs O(1) của hashtable — nhưng với n ≤ 512, log n ≤ 9 → không cảm nhận được.
- Pattern phổ biến: "set của user ID" → user ID là int64 → intset là natural fit.

**Tham khảo**: [Redis Internal Data Structure: Intset](http://blog.wjin.org/posts/redis-internal-data-structure-intset.html) · **Issues**: [#5](https://github.com/DiceDB/dice/issues/5), [#6](https://github.com/DiceDB/dice/issues/6).

---

## 22. Geospatial & Geohash

### 22.1 Bối cảnh

Use case: Uber/Lyft cần "tìm tài xế trong bán kính 1km quanh khách". Naive: lưu (lat, lon) cho tất cả tài xế, query → tính Haversine với từng tài xế → O(N), không scale.

**Geohash**: encode 2D coordinate thành 1D string/integer **bảo toàn locality** → 2 điểm gần nhau có prefix giống. Lưu vào sorted set Redis → query range trên 1D = lấy ra candidate, lọc bằng Haversine → O(log N + K) thay vì O(N).

### 22.2 Phân tích & cơ chế

#### Thuật toán encode

1. Chia thế giới làm 2 nửa theo longitude: tây [-180, 0) → bit 0, đông [0, 180] → bit 1.
2. Tiếp tục chia đôi nửa chứa điểm. Lặp k lần → k bit cho longitude.
3. Tương tự cho latitude (chia nửa nam/bắc).
4. **Interleave** bit lon và lat: `lon[0] lat[0] lon[1] lat[1] ...` → 1 dãy bit.
5. Base32 encode → string.

#### Ví dụ trực quan

Điểm (lat=42.6, lon=-5.6).

Lon trong [-180, 180]:
- 5.6 ∈ [-180, 0) → bit 0. Range cập nhật: [-180, 0).
- -5.6 ∈ [-90, 0) → bit 1. Range: [-90, 0).
- -5.6 ∈ [-45, 0) → bit 1. Range: [-45, 0).
- ... continue

Lat trong [-90, 90]:
- 42.6 ∈ [0, 90] → bit 1. Range: [0, 90].
- 42.6 ∈ [0, 45) → bit 0. Range: [0, 45).
- 42.6 ∈ [22.5, 45) → bit 1. Range: [22.5, 45).
- ... continue

Interleave: `lon[0] lat[0] lon[1] lat[1] lon[2] lat[2] ...` = `0 1 1 0 1 1 ...`

5 bit cùng nhau → 1 ký tự base32. 10 ký tự = 50 bit → precision ~ 1.2m × 0.6m.

#### Tại sao **interleave** bit?

Nếu nối tiếp (`lat_bits + lon_bits` hoặc ngược lại): 2 điểm gần nhau theo chiều lat có thể có lon_bits đầu khác hẳn → prefix không phản ánh proximity.

Interleave: mỗi cặp 2 bit đại diện 1 lần chia trên grid 2D. Prefix dài k pairs → cùng 1 ô lưới 2D. Càng dài prefix giống → ô càng nhỏ.

#### Property quan trọng

**Cùng prefix → gần nhau** (đúng). Nhưng **gần nhau không nhất thiết cùng prefix** (không đúng — vì điểm có thể nằm sát biên 2 ô khác hẳn prefix).

→ Khi query bán kính: phải lấy **9 ô** (chính + 8 lân cận) để không miss điểm sát biên.

#### Redis storage

Redis lưu geo point dưới dạng **sorted set** với:
- member = name (e.g., "driver:123")
- score = geohash 52-bit integer (đủ precision ~0.6m)

```
GEOADD drivers 13.361389 38.115556 "Palermo"
GEOADD drivers 15.087269 37.502669 "Catania"
GEOSEARCH drivers FROMLONLAT 15 37 BYRADIUS 200 km
```

Bên dưới: tính geohash query point, sinh 9 neighbor geohash ranges, dùng `ZRANGEBYSCORE` trên sorted set để lấy candidates, lọc bằng Haversine.

#### Haversine distance

```
a = sin²(Δφ/2) + cos(φ1)·cos(φ2)·sin²(Δλ/2)
c = 2·atan2(√a, √(1-a))
d = R·c   với R = 6371 km
```

### 22.3 Cài đặt minh họa

```go
func geohashEncode(lat, lon float64, steps int) uint64 {
	const minLat, maxLat = -90.0, 90.0
	const minLon, maxLon = -180.0, 180.0

	loLat, hiLat := minLat, maxLat
	loLon, hiLon := minLon, maxLon
	var hash uint64

	for i := 0; i < steps; i++ {
		// lon bit
		midLon := (loLon + hiLon) / 2
		hash <<= 1
		if lon >= midLon {
			hash |= 1
			loLon = midLon
		} else {
			hiLon = midLon
		}
		// lat bit
		midLat := (loLat + hiLat) / 2
		hash <<= 1
		if lat >= midLat {
			hash |= 1
			loLat = midLat
		} else {
			hiLat = midLat
		}
	}
	return hash
}

func haversine(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371000.0 // mét
	toRad := func(x float64) float64 { return x * math.Pi / 180 }
	dLat := toRad(lat2 - lat1)
	dLon := toRad(lon2 - lon1)
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(toRad(lat1))*math.Cos(toRad(lat2))*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return R * c
}
```

### 22.4 Tradeoff & ghi chú

- Geohash **không hoàn hảo** với điểm gần xích đạo/kinh tuyến gốc (lon ~ 0 hoặc lat ~ 0): 2 điểm cách nhau 1 mét có thể có prefix khác hẳn. Vì vậy luôn check 9 cell.
- Precision phụ thuộc số bit: 50 bit → ~0.6m, 30 bit → ~1.2km.
- Alternative: S2 (Google) hoặc H3 (Uber) tối ưu hơn cho global use cases (xử lý hai cực, distortion vĩ độ cao).

**Tham khảo**: [Geohashing by Will Hill](https://medium.com/@bkawk/geohashing-20b282fc9655) · [Why geohashes are interleaved](https://stackoverflow.com/questions/17488346/geohashes-why-is-interleaving-index-values-necessary) · **Issue**: [#7](https://github.com/DiceDB/dice/issues/7).

---

## 23. String Internals — SDS

### 23.1 Bối cảnh

C string (`char*` null-terminated) có 4 vấn đề:

1. **`strlen()` O(n)**: phải scan đến null byte.
2. **Không binary-safe**: gặp `\0` là kết thúc → không lưu được binary data, image, encoded protobuf.
3. **Append phức tạp**: user phải biết capacity, tự `realloc`, dễ buffer overflow.
4. **Append O(n) mỗi lần** nếu cứ `strcat` (vì lại phải scan tìm null).

Redis xử lý mọi value là string ở tầng thấp → cần custom string library: **SDS (Simple Dynamic Strings)**.

### 23.2 Phân tích & cơ chế

#### Layout SDS (Redis ≥ 3.2)

5 variants tùy độ dài string:

```c
struct sdshdr5  { unsigned char flags;        char buf[]; };
struct sdshdr8  { uint8_t len; uint8_t alloc; unsigned char flags; char buf[]; };
struct sdshdr16 { uint16_t len; uint16_t alloc; unsigned char flags; char buf[]; };
struct sdshdr32 { uint32_t len; uint32_t alloc; unsigned char flags; char buf[]; };
struct sdshdr64 { uint64_t len; uint64_t alloc; unsigned char flags; char buf[]; };
```

- `len`: độ dài hiện tại.
- `alloc`: capacity (không tính header và null terminator).
- `flags`: 3 bit dưới = type (sdshdr5/8/16/32/64).
- `buf[]`: data + null terminator (cho compatibility với C function như `printf`).

#### Pointer "trick"

Hàm `sdsnew()` trả về `char*` trỏ vào **`buf`**, không phải đầu struct. → user dùng `s[i]` như string thường, pass cho `printf("%s", s)` được luôn.

Để lấy header: `((struct sdshdr8*)(s - sizeof(struct sdshdr8)))`. Nhờ `flags` byte ngay trước `buf`, code biết phải cast về type nào.

#### Lựa chọn variant

| Variant | Max len | Header size |
|---|---|---|
| sdshdr5 | 32 (2^5) | 1B |
| sdshdr8 | 256 | 3B |
| sdshdr16 | 65K | 5B |
| sdshdr32 | 4G | 9B |
| sdshdr64 | 16E | 17B |

→ String 100 byte dùng sdshdr8 → header chỉ 3B (so với 17B nếu dùng cùng struct cho mọi size).

#### Encoding cho String object trong Redis

3 mức (đã đề cập section 13):

- **OBJ_ENCODING_INT**: long fit trong `ptr` field, không alloc string.
- **OBJ_ENCODING_EMBSTR** (≤ 44 byte): `robj` + sdshdr + data **1 block 64 byte** → 1 malloc.
- **OBJ_ENCODING_RAW** (> 44 byte): 2 malloc.

#### Vì sao đúng 44 byte?

jemalloc size class 64. Phân tích:
- `robj` = 16B
- `sdshdr8` = 3B
- Null terminator = 1B
- Còn lại: 64 - 16 - 3 - 1 = **44B** data.

→ Đúng 1 jemalloc chunk, không waste, không cross arena.

#### Growth strategy

Khi append:
- Nếu new_size ≤ alloc → chỉ update `len`, ghi vào buf.
- Vượt alloc → realloc với strategy:
  - new_size < 1MB → `alloc = new_size × 2`.
  - new_size ≥ 1MB → `alloc = new_size + 1MB`.

→ Append amortized O(1) cho small string, không phình vô tận với large string.

#### Binary safety

`len` track độ dài thật → `sdslen(s)` O(1). Function thao tác string trong Redis không dùng `strlen()` mà luôn dùng `sdslen()` + iterate đến `len`. → chứa được `\0` hay bất kỳ byte nào.

### 23.3 Cài đặt minh họa

```go
type SDS struct {
	buf []byte // len(buf) = current length, cap(buf) = allocated
}

func New(s string) *SDS {
	capacity := len(s) * 2
	if capacity < 16 {
		capacity = 16
	}
	b := make([]byte, len(s), capacity)
	copy(b, s)
	return &SDS{buf: b}
}

func (s *SDS) Len() int          { return len(s.buf) }
func (s *SDS) Cap() int          { return cap(s.buf) }
func (s *SDS) Bytes() []byte     { return s.buf }
func (s *SDS) String() string    { return string(s.buf) }

func (s *SDS) Append(data string) {
	required := len(s.buf) + len(data)
	if required > cap(s.buf) {
		newCap := required * 2
		if required >= 1024*1024 {
			newCap = required + 1024*1024
		}
		newBuf := make([]byte, len(s.buf), newCap)
		copy(newBuf, s.buf)
		s.buf = newBuf
	}
	s.buf = append(s.buf, data...)
}

func (s *SDS) ByteAt(i int) byte {
	return s.buf[i] // O(1), không tìm null terminator
}
```

### 23.4 Tradeoff & ghi chú

- 5 variants header tốn code complexity nhưng tiết kiệm 14B/object × hàng triệu object → đáng.
- SDS **không thread-safe** — phù hợp Redis single-threaded.
- Hàm `APPEND key value` trong Redis dùng SDS trick này → append O(1) amortized cho log/stream pattern.

**Tham khảo**: [zpoint/Redis-Internals: SDS](https://github.com/zpoint/Redis-Internals/blob/5.0/Object/sds/sds.md) · **Issues**: [#8](https://github.com/DiceDB/dice/issues/8), [#3](https://github.com/DiceDB/dice/issues/3).

---

## 24. HyperLogLog & Cardinality Estimation

### 24.1 Bối cảnh

Bài toán: đếm số **unique element** trong stream (vd unique visitor mỗi ngày).

- **Set chính xác**: O(n) memory. 100M unique visitor (mỗi 16B UUID) → 1.6GB chỉ cho 1 ngày, 1 chiều của analytics.
- **HyperLogLog**: **12KB constant memory** đếm tới ~10⁹ với sai số 0.81%. Đổi exact lấy memory savings 10⁵ lần.

### 24.2 Phân tích & cơ chế

#### Intuition (Flajolet-Martin)

Cho 1 hash function uniform random sang [0, 2^k):
- P(hash có ≥ 1 leading zero) = 1/2.
- P(hash có ≥ 2 leading zeros) = 1/4.
- P(hash có ≥ k leading zeros) = 1/2^k.

→ Để **thấy** 1 hash với k leading zeros, cần ~2^k element trong stream. Quan sát `ρ_max` = max leading zeros của tất cả hash → ước lượng cardinality ≈ 2^(ρ_max).

#### Vấn đề với 1 register

Variance cao. Hash xui có thể có nhiều leading zeros ngay từ element đầu → over-estimate khủng khiếp.

→ Dùng **m register**, lấy trung bình.

#### Cách HyperLogLog cải thiện

- Hash 64-bit. Dùng **first b bit** chọn register (m = 2^b register). Còn lại (64-b) bit để đo ρ.
- Mỗi register lưu max ρ thấy được qua các element rơi vào bucket đó.
- Estimate dùng **harmonic mean** (chống outlier):

```
α_m · m² · (Σ 2^(-M[i]))^(-1)
```

α_m là constant correction (≈ 0.7213 cho m ≥ 64).

#### Tại sao 12KB?

Redis chọn:
- b = 14 → m = 16384 register.
- Mỗi register 6 bit (đủ chứa ρ tối đa 64).
- Total: 16384 × 6 / 8 = **12288 byte** = ~12KB.

Sai số `1.04 / √m = 1.04 / 128 = 0.81%`.

#### Hai biểu diễn

Redis có 2 representation:

1. **Sparse** (cho cardinality nhỏ): compress register rỗng. Đa số HLL mới có hầu hết register = 0 → sparse rất gọn (vài chục byte).
2. **Dense**: array 12KB cố định. Chuyển từ sparse → dense khi vượt threshold (default 3000 byte sparse).

#### Linear Counting cho small cardinality

Khi cardinality nhỏ (< 2.5 × m), HLL bias đáng kể. Redis switch sang **Linear Counting**:
```
n ≈ -m · ln(V/m)
```
với V = số register = 0. Cardinality < ~40000 → dùng LC; lớn hơn → HLL.

#### Bias correction (40K-72K range)

antirez chạy regression đa thức bậc 4 để fix bias trong range 40k-72k (vùng giao giữa LC và HLL "thật").

#### Caching count

Tính count tốn (16384 phép `2^-M[i]` + sqrt + log). Redis lưu **8 byte cuối** của HLL data làm cached count. Invalidate khi register thay đổi (set MSB của 1 byte trong header).

→ `PFCOUNT` repeated → O(1) sau lần đầu.

#### Merge

`PFMERGE dest src1 src2`: với mỗi register i, `dest[i] = max(src1[i], src2[i], ..., dest[i])`. Tính chất union: HLL(A ∪ B) tính được từ HLL(A) và HLL(B) — không cần raw data.

### 24.3 Cài đặt minh họa

```go
import (
	"hash/fnv"
	"math"
	"math/bits"
)

const (
	hllB = 14
	hllM = 1 << hllB // 16384
)

type HLL struct {
	registers [hllM]uint8
}

func hash64(s string) uint64 {
	h := fnv.New64a()
	h.Write([]byte(s))
	return h.Sum64()
}

func (h *HLL) Add(item string) {
	hv := hash64(item)
	idx := hv >> (64 - hllB) // first 14 bit chọn register
	w := (hv << hllB) | (1 << (hllB - 1))
	rho := uint8(bits.LeadingZeros64(w)) + 1
	if rho > h.registers[idx] {
		h.registers[idx] = rho
	}
}

func (h *HLL) Count() uint64 {
	const m = hllM
	const alpha = 0.7213 / (1 + 1.079/m)

	sum := 0.0
	zeros := 0
	for _, r := range h.registers {
		if r == 0 {
			zeros++
		}
		sum += math.Pow(2, -float64(r))
	}
	estimate := alpha * float64(m*m) / sum

	// Small range: linear counting
	if estimate < 2.5*float64(m) && zeros != 0 {
		estimate = float64(m) * math.Log(float64(m)/float64(zeros))
	}
	return uint64(estimate)
}

func (h *HLL) Merge(other *HLL) {
	for i := range h.registers {
		if other.registers[i] > h.registers[i] {
			h.registers[i] = other.registers[i]
		}
	}
}
```

### 24.4 Tradeoff & ghi chú

- Nếu cần exact count nhỏ (≤ 1M) → dùng Set thường (`SADD` + `SCARD`).
- HLL **không** lưu được "key cụ thể" — chỉ approximate count. Không thể "remove" 1 element khỏi HLL (irreversible).
- HLL union (PFMERGE) tốt, nhưng **intersection** không có formula trực tiếp — phải dùng inclusion-exclusion: `|A ∩ B| = |A| + |B| - |A ∪ B|`, sai số nhân lên nhiều.

**Tham khảo**: [Flajolet-Martin (Arpit Bhayani)](https://arpitbhayani.me/blogs/flajolet-martin) · [antirez HLL](http://antirez.com/news/75) · **Issue**: [#9](https://github.com/DiceDB/dice/issues/9).

---

## 25. LFU & Approximate Counting (Morris)

### 25.1 Bối cảnh

LRU dở với pattern "scan toàn data 1 lần" (vd backup job đọc qua mọi key) — nó đẩy hot data ra để giữ scan data vừa truy cập. **LFU (Least Frequently Used)** chống lại pattern này bằng cách đếm **tần suất**, không phải thời gian.

Vấn đề LFU naive:
1. Counter cần unbounded → mỗi key cần int64 cho count → tốn RAM.
2. Counter cũ không reset → 1 key từng hot 1 năm trước vẫn được coi là hot mãi.

Redis LFU (4.0+) giải cả 2 với **Morris counter** + **time decay**.

### 25.2 Phân tích & cơ chế

#### Layout 24-bit trong `robj.lru` field

```
| 16 bit decrement-time (phút) | 8 bit counter |
```

- 8 bit counter: max 255, không phải count thật mà là **log scale**.
- 16 bit decrement-time: timestamp lần decay cuối (đơn vị phút). 65535 phút ~ 45 ngày — đủ cho decay logic.

#### Morris counter — tăng theo xác suất

Counter không tăng 1 mỗi access. Công thức:

```
P(increment) = 1 / (counter · lfu_log_factor + 1)
```

Default `lfu_log_factor = 10`.

| counter | P | Số access trung bình để tăng |
|---|---|---|
| 0 | 1.0 | 1 |
| 1 | 0.091 | 11 |
| 5 | 0.020 | 51 |
| 100 | 0.001 | 1001 |
| 255 | 0.0004 | ~2550 |

→ Counter=255 ứng với ~1M lần access — đủ dải cho mọi use case. Counter chỉ 8 bit nhưng đếm logarithmic.

#### Tại sao Morris hoạt động

Morris's algorithm (1977): để đếm tới N, chỉ cần O(log log N) bit. Lưu `v = log(n)` thay vì `n` trực tiếp. Khi event đến:

```
p = 1 / 2^v   (xác suất "đáng lẽ tăng" theo log scale)
if rand() < p: v++
n_estimate = 2^v - 1
```

Relative error xấp xỉ constant với mọi n → đếm "tỷ lệ" tốt, đếm tuyệt đối không chính xác — phù hợp cho LFU (chỉ cần so sánh tương đối giữa key).

#### Decay theo thời gian

Mỗi `lfu_decay_time` phút (default 1), counter giảm 1. Key được access lại → counter tăng theo Morris, đẩy lùi decay.

```
on access(obj):
    elapsed_min = now_min - obj.decrement_time
    decay = elapsed_min / lfu_decay_time
    obj.counter = max(0, obj.counter - decay)
    obj.decrement_time = now_min

    if obj.counter < 255:
        p = 1 / (obj.counter * lfu_log_factor + 1)
        if rand() < p:
            obj.counter++
```

→ Key cũ không access → counter dần về 0 → ưu tiên evict.

#### Eviction với LFU

Tương tự LRU approximated: sample N key, chọn key có counter thấp nhất, evict. Pool optimization tương tự.

### 25.3 Cài đặt minh họa

```go
type LFUObj struct {
	Value         interface{}
	Counter       uint8
	DecrementTime uint16 // unix minute
}

const (
	lfuLogFactor    = 10
	lfuDecayMinutes = 1
)

func (o *LFUObj) Access() {
	nowMin := uint16((time.Now().Unix() / 60) & 0xFFFF)

	// Decay
	elapsed := nowMin - o.DecrementTime
	if elapsed > 0 {
		decay := uint8(elapsed / lfuDecayMinutes)
		if decay > o.Counter {
			o.Counter = 0
		} else {
			o.Counter -= decay
		}
		o.DecrementTime = nowMin
	}

	// Morris increment
	if o.Counter < 255 {
		baseval := float64(o.Counter)
		p := 1.0 / (baseval*lfuLogFactor + 1)
		if rand.Float64() < p {
			o.Counter++
		}
	}
}

func evictLFU(sampleSize int) {
	var victim string
	var minCounter uint8 = 255

	i := 0
	for k, obj := range store {
		if i >= sampleSize {
			break
		}
		lo := obj.(*LFUObj)
		if lo.Counter < minCounter {
			minCounter = lo.Counter
			victim = k
		}
		i++
	}
	if victim != "" {
		delete(store, victim)
	}
}
```

### 25.4 Tradeoff & ghi chú

- **`lfu_log_factor` lớn hơn** → counter saturate chậm hơn → phân biệt tốt key access cao.
- **`lfu_decay_time` lớn hơn** → memory hot lâu hơn → ít evict.
- LFU **phù hợp**: e-commerce (top sản phẩm hot quanh năm), news feed (article hot thường xuyên xem).
- LFU **không phù hợp**: workload thay đổi pattern liên tục (vd flash sale theo giờ) — LRU phản ứng nhanh hơn.

**Tham khảo**: [Morris Counter (Arpit Bhayani)](https://arpitbhayani.me/blogs/morris-counter) · [Morris's original paper](http://www.inf.ed.ac.uk/teaching/courses/exc/reading/morris.pdf) · **Issue**: [#10](https://github.com/DiceDB/dice/issues/10).

---

## Phụ lục A — Project layout đề xuất

```
mini-redis/
├── cmd/server/main.go          // bootstrap, config, signal
├── internal/
│   ├── server/
│   │   ├── listener.go         // TCP listen, accept
│   │   ├── epoll.go            // event loop, time events
│   │   └── client.go           // per-connection state
│   ├── resp/
│   │   ├── decode.go           // section 4
│   │   └── encode.go
│   ├── store/
│   │   ├── store.go            // dict
│   │   ├── object.go           // robj, encodings (section 13)
│   │   ├── expire.go           // lazy + active (section 9)
│   │   ├── eviction.go         // LRU/LFU/random (section 10, 15, 25)
│   │   └── memory.go           // tracking (section 16)
│   ├── ds/
│   │   ├── sds.go              // section 23
│   │   ├── ziplist.go          // section 20
│   │   ├── quicklist.go        // section 20
│   │   ├── intset.go           // section 21
│   │   ├── hll.go              // section 24
│   │   └── geohash.go          // section 22
│   ├── command/
│   │   ├── string.go           // GET, SET, INCR, APPEND
│   │   ├── list.go             // LPUSH, RPUSH, LRANGE, LPOP
│   │   ├── set.go              // SADD, SISMEMBER, SCARD
│   │   ├── hash.go             // HSET, HGET, HGETALL
│   │   ├── geo.go              // GEOADD, GEOSEARCH
│   │   ├── hll.go              // PFADD, PFCOUNT, PFMERGE
│   │   ├── tx.go               // MULTI/EXEC/WATCH (section 19)
│   │   └── server.go           // PING, INFO, OBJECT
│   └── persistence/
│       ├── aof.go              // section 12
│       └── rdb.go              // (optional)
└── go.mod
```

## Phụ lục B — Lộ trình học gợi ý

| Tuần | Nội dung | Kết quả |
|---|---|---|
| 1 | Section 1-7 (network, RESP, epoll) | Server PING/ECHO chạy với `redis-cli` |
| 2 | Section 8-11 (GET/SET/TTL/Pipeline) | Pass `redis-benchmark -t get,set,ping` |
| 3 | Section 12, 14, 15 (AOF, INFO, LRU) | Persistence + monitoring + eviction |
| 4 | Section 18-19 (graceful shutdown, MULTI) | Production-ready basics |
| 5 | Section 20-21 (List/Set internals) | Hiểu ziplist/quicklist/intset |
| 6 | Section 22-25 (Geo, SDS, HLL, LFU) | Khái niệm nâng cao |

## Reference

**Note Google Drive** (Redis Internals series): https://drive.google.com/drive/u/1/folders/1-a1xtA0e4J6Jkmiy68TGHtbyCbInZi64
- https://www.youtube.com/playlist?list=PLsdq-3Z1EPT0eElcdOON9fdaeaQjlyXDt
- [DiceDB legacy](https://github.com/DiceDB/dice-legacy) — đối chiếu commit theo từng section
- [Redis (antirez/redis)](https://github.com/redis/redis) — production
- [Redis under the hood (Paul Adams Smith)](https://www.pauladamsmith.com/articles/redis-under-the-hood.html) — section 6, 7
- [Redis Quicklist (Matt Stancliff)](https://matt.sh/redis-quicklist) — section 20
- [Improving key expiration in Redis (Twitter)](https://blog.twitter.com/engineering/en_us/topics/infrastructure/2019/improving-key-expiration-in-redis) — section 9
- [Async IO on Linux (jvns.ca)](https://jvns.ca/blog/2017/06/03/async-io-on-linux--select--poll--and-epoll/) — section 6
- [antirez HyperLogLog](http://antirez.com/news/75) — section 24
- [Morris Counter (Arpit Bhayani)](https://arpitbhayani.me/blogs/morris-counter) — section 25
- [Flajolet-Martin (Arpit Bhayani)](https://arpitbhayani.me/blogs/flajolet-martin) — section 24
- [Manual memory management in Go (Dgraph)](https://dgraph.io/blog/post/manual-memory-management-golang-jemalloc/) — section 17