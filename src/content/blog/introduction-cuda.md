---
title: "CUDA C++: Giới thiệu cơ bản"
pubDate: "2026-04-30"
published: true
contents_table: true
pinned: false
description: "Bắt đầu với CUDA C++: kernel, Unified Memory, threads/blocks/grid, profiling với nsys, và prefetching để giảm page fault."
cat: "gpu"
useKatex: false
---

<!-- nguồn: https://developer.nvidia.com/blog/even-easier-introduction-cuda/ -->

CUDA C++ là 1 trong nhiều cách để tạo ra các ứng dụng có khả năng xử lý dữ liệu một cách song song. Nó cho phép người lập trình sử dụng ngôn ngữ lập trình mạnh mẽ như C++ để phát triển các thuật toán hiệu suất cao. Những thuật toán này được xử lý bởi hàng nghìn luồng xử lý song song trên các GPU.

Để có thể sử dụng CUDA, bạn cần một chiếc máy tính có GPU hỗ trợ CUDA (hệ điều hành Windows, WSL, hoặc Linux 64-bit; bất kỳ GPU của NVIDIA nào cũng được chấp nhận) hoặc 1 tài khoản dịch vụ đám mây có sẵn GPU (AWS, Azure, Google Colab, v.v.). Cần cài đặt [CUDA Toolkit](https://developer.nvidia.com/cuda-toolkit) (miễn phí).

## Starting Simple

```cpp
#include <iostream>
#include <math.h>

// function to add the elements of two arrays
void add(int n, float *x, float *y)
{
 for (int i = 0; i < n; i++)
     y[i] = x[i] + y[i];
}

int main(void)
{
 int N = 1<<20; // 1M elements

 float *x = new float[N];
 float *y = new float[N];

 // initialize x and y arrays on the host
 for (int i = 0; i < N; i++) {
   x[i] = 1.0f;
   y[i] = 2.0f;
 }

 // Run kernel on 1M elements on the CPU
 add(N, x, y);

 // Check for errors (all values should be 3.0f)
 float maxError = 0.0f;
 for (int i = 0; i < N; i++)
   maxError = fmax(maxError, fabs(y[i]-3.0f));
 std::cout << "Max error: " << maxError << std::endl;

 // Free memory
 delete [] x;
 delete [] y;

 return 0;
}
```

Bây giờ, để thực hiện phép tính này một cách song song trên nhiều lõi xử lý của GPU. Việc thực hiện các bước đầu tiên khá đơn giản: cần biến hàm `add` thành một hàm mà GPU có thể thực thi được. Hàm này được gọi là **"kernel"** trong CUDA. Để làm điều này, chỉ cần thêm tiền tố `__global__` vào tên hàm((`__global__`: function chạy trên GPU, gọi từ CPU. Còn `__device__`: chạy trên GPU, gọi từ GPU. `__host__`: chạy trên CPU (default). Các specifier này quyết định compile target cho function.)) => báo cho trình biên dịch CUDA C++ rằng đây là một hàm được thực thi trên GPU.

```cpp
__global__
void add(int n, float *sum, float *x, float *y)
```

## Memory Allocation in CUDA

Để thực hiện các phép tính trên GPU, cần phải cấp phát bộ nhớ mà GPU có thể truy cập được. Cơ chế **Unified Memory** trong CUDA giúp việc này trở nên dễ dàng hơn, bằng cách tạo ra một không gian bộ nhớ chung mà tất cả các GPU và CPU trong hệ thống đều có thể truy cập được.((Trước Unified Memory (CUDA 6+), phải dùng `cudaMalloc` + `cudaMemcpy` thủ công để copy data giữa CPU host và GPU device — verbose và dễ sai. Unified Memory ẩn detail này nhưng có overhead page migration on-demand.)) Để cấp phát dữ liệu vào không gian bộ nhớ này, hãy gọi hàm `cudaMallocManaged()`. Hàm này sẽ trả về con trỏ mà bạn có thể sử dụng để truy cập dữ liệu từ cả mã nguồn trên CPU lẫn mã nguồn trên GPU. Để giải phóng bộ nhớ đã được cấp phát, chỉ cần truyền con trỏ đó vào hàm `cudaFree()`.

```cpp
float *x, *y, *sum;
cudaMallocManaged(&x, N*sizeof(float));
cudaMallocManaged(&y, N*sizeof(float));
// Free memory
cudaFree(x);
cudaFree(y);
```

Cuối cùng, cần khởi chạy kernel `add()`. Việc khởi chạy kernel này được thực hiện trên GPU. Các lệnh khởi chạy kernel CUDA được viết bằng cú pháp dạng dấu ngoặc ba chấm `<<< >>>` => dòng lệnh này sẽ khởi động một luồng xử lý trên GPU để thực hiện lệnh `add()`.

```cpp
add<<<1, 1>>>(N, sum, x, y);
```

CPU phải chờ cho đến khi kernel hoàn thành công việc của mình trước khi truy cập vào các kết quả đó((Kernel launch là **asynchronous** — `add<<<...>>>()` return ngay lập tức, kernel chạy nền trên GPU. Nếu CPU đọc kết quả ngay sau launch sẽ thấy data cũ. `cudaDeviceSynchronize()` block CPU đến khi mọi kernel đã pending xong.)) (vì việc khởi chạy các kernel CUDA không làm tắc nghẽn luồng xử lý của CPU). Để thực hiện điều này, chỉ cần gọi hàm `cudaDeviceSynchronize()` trước khi tiến hành kiểm tra lỗi cuối cùng trên bộ xử lý.

CUDA files có file extension `.cu` và compile bằng `nvcc` (CUDA C++ compiler).

## Profile it

Để biết thời gian cần thiết cho kernel chạy, dùng công cụ NSight Systems CLI, cụ thể là lệnh `nsys`:

```bash
nsys profile -t cuda --stats=true ./add_cuda
```

Để đơn giản hơn dùng [`nsys_easy ./add_cuda`](https://github.com/harrism/nsys_easy).

```text
Max error: 0
Generating '/tmp/nsys-report-bb25.qdstrm'
[1/1] [========================100%] nsys_easy.nsys-rep
Generated:
   /home/nfs/mharris/src/even_easier/nsys_easy.nsys-rep
Generating SQLite file nsys_easy.sqlite from nsys_easy.nsys-rep
Processing 1259 events: [======================================100%]
Processing [nsys_easy.sqlite] with [cuda_gpu_sum.py]...

** CUDA GPU Summary (Kernels/MemOps) (cuda_gpu_sum):

Time (%)  Total Time (ns)  Instances  Category   Operation
--------  ---------------  --------- ----------- --------------------------
    98.5       75,403,544      1     CUDA_KERNEL add(int, float *, float *)
     1.0          768,480     48     MEMORY_OPER [memcpy Unified H2D]
     0.5          352,787     24     MEMORY_OPER [memcpy Unified D2D]
```

## Picking up the Threads

Khi đã chạy một kernel với 1 luồng duy nhất để thực hiện các phép tính cần thiết => làm sao thành xử lý song song? Cú pháp `<<<1, 1>>>` trong CUDA là **cấu hình thực thi**; nó chỉ định cho bộ xử lý CUDA *số lượng luồng song song cần được sử dụng để thực hiện các phép tính trên GPU*. Có hai tham số trong cấu hình này. Hãy bắt đầu bằng việc thay đổi tham số thứ hai: **number of threads in a thread block**. Các GPU của CUDA hoạt động bằng cách sử dụng các blocks of threads có kích thước là bội số của 32.((32 threads = **warp size** trên kiến trúc NVIDIA. SM execute lệnh ở granularity warp — cùng instruction cho 32 threads cùng lúc (SIMT). Block size không bội của 32 sẽ lãng phí thread slots.))

```cpp
add<<<1, 256>>>(N, x, y);
```

Nếu chạy đoạn mã này, thì việc tính toán sẽ được thực hiện một lần trên mỗi luồng xử lý, thay vì được phân bổ cho các luồng xử lý song song. Để thực hiện đúng cách, cần sửa đổi mã nguồn của kernel. CUDA C++ cung cấp các từ khóa giúp kernel có thể biết được chỉ số của các luồng xử lý đang hoạt động => cần sửa đổi vòng lặp để việc xử lý dữ liệu được thực hiện trên các luồng xử lý song song.

```cpp
__global__
void add(int n, float *x, float *y)
{
  int index = threadIdx.x;
  int stride = blockDim.x;
  for (int i = index; i < n; i += stride)
      y[i] = x[i] + y[i];
}
```

```text
Time (%) Time (ns) Instances  Category   Operation
-------- --------- --------- ----------- ----------------------
79.0     4,221,011     1     CUDA_KERNEL add(int, float *, float *)
```

((Kernel time giảm từ 75.4M ns xuống 4.2M ns — speedup ~18x chỉ bằng cách dùng 256 threads thay vì 1. Nhưng vẫn xa lý thuyết: GPU có hàng nghìn core, ta mới dùng 1 block. Bước tiếp theo: nhiều block.))

## Out of the Blocks

Các GPU dựa trên CUDA có nhiều **parallel processors**, grouped into **Streaming Multiprocessors (SM)**. Mỗi SM có thể chạy nhiều **concurrent thread blocks**, nhưng mỗi thread block lại hoạt động trong phạm vi của 1 SM duy nhất. Ví dụ, GPU NVIDIA T4, dựa trên kiến trúc Turing, có 40 SM và 2560 lõi xử lý CUDA.((40 SM × 64 CUDA core/SM = 2560 cores. Mỗi SM trên Turing có thể schedule tối đa 32 warps (1024 threads), nhưng chỉ execute 4 warps cùng lúc qua 4 warp schedulers. Đây là cách GPU "hide latency" — khi 1 warp stall đợi memory, scheduler switch sang warp khác.)) Mỗi SM có thể hỗ trợ tối đa 1024 thread block. Để tận dụng tối đa các thread block này, cần phải khởi chạy chương trình với **multiple thread blocks**.

Tham số đầu tiên trong cấu hình thực thi chính là **number of thread blocks**. Tổng số các khối xử lý này tạo thành **grid** (tập hợp nhiều block, trải rộng trên nhiều SM).

Để tận dụng hết GPU cần set `no.Block * thread-per-block >= N` (tổng số thread thường hơi lớn hơn N) để mỗi phần tử dữ liệu có ít nhất một thread xử lý và không cần quan tâm đến số CUDA core vì GPU được thiết kế để chạy nhiều hơn số core vật lý bằng **scheduling**.

```cpp
__global__
void add(int n, float *x, float *y)
{
  int index = blockIdx.x * blockDim.x + threadIdx.x;
  int stride = blockDim.x * gridDim.x;
  for (int i = index; i < n; i += stride)
    y[i] = x[i] + y[i];
}
...
int blockSize = 256;
int numBlocks = (N + blockSize - 1) / blockSize;
add<<<numBlocks, blockSize>>>(N, x, y);
```

- **`threadIdx.x`**: index of the current thread in block.
- **`blockDim.x`** (256): number of threads in the block.
- **`blockIdx.x`**: index of the current thread block in the grid.
- **`gridDim.x`** (`(N + blockSize - 1) / blockSize`): number of blocks in the grid.((Công thức `(N + blockSize - 1) / blockSize` = ceiling division — đảm bảo có đủ block phủ hết N elements ngay cả khi N không chia hết cho blockSize. Loop với `stride = gridDim.x * blockDim.x` (grid-stride loop) cho phép kernel xử lý N lớn hơn tổng thread.))

```text
Time (%) Time (ns) Instances  Category    Operation
-------- --------- --------- ----------- ----------------------
79.6 4,514,384      1      CUDA_KERNEL add(int, float *, float *)
14.2   807,245     64      MEMORY_OPER [CUDA memcpy Unified H2D]
6.2   353,201     24      MEMORY_OPER [CUDA memcpy Unified D2H]
```

## Unified Memory Prefetching

Việc thay đổi này không mang lại hiệu quả nào về mặt tốc độ xử lý?

Ở đây, có thể thấy rằng có 64 thao tác loại "host-to-device" (H2D) và 24 thao tác loại "device-to-host" (D2H) memcpy. Tuy nhiên, trong đoạn mã này không có bất kỳ lệnh gọi nào liên quan đến `memcpy`. Unified Memory trong CUDA là **bộ nhớ ảo**.((Unified Memory dùng page table chia sẻ giữa CPU và GPU. Khi GPU truy cập 1 page chưa nằm trên device → GPU page fault → driver migrate page từ CPU memory sang GPU memory. Mỗi page ~4KB hoặc 64KB tùy GPU.)) Các virtual memory pages có thể nằm trên bộ nhớ của bất kỳ memory nào (GPU hoặc CPU), và chúng sẽ được **migrated on demand**. Chương trình này trước tiên init arrays on CPU, sau đó kernel sẽ đọc/ghi dữ liệu vào bộ nhớ của GPU. Vì memory pages vẫn nằm trên bộ nhớ của CPU trong quá trình chạy kernel, nên sẽ xảy ra **page faults** và phần cứng sẽ chuyển các pages sang GPU memory. Điều này dẫn đến tình trạng nghẽn bộ nhớ, và đó là lý do không thấy sự cải thiện về tốc độ xử lý.

Việc migrate sang bộ nhớ GPU là một quá trình tốn kém, vì page faults xảy ra một cách riêng lẻ. GPU threads phải chờ đợi cho đến khi dữ liệu được di chuyển sang bộ nhớ GPU. Ở đây biết rõ lượng bộ nhớ mà kernel cần sử dụng (các mảng `x` và `y`) => có thể sử dụng **prefetching** để đảm bảo rằng dữ liệu đã có sẵn trên bộ nhớ GPU trước khi kernel cần chúng bằng `cudaMemPrefetchAsync()` trước khi khởi chạy kernel.

```cpp
cudaMemPrefetchAsync(x, N*sizeof(float), 0, 0);
cudaMemPrefetchAsync(y, N*sizeof(float), 0, 0);
```

```text
Time (%) Time (ns) Instances  Category    Operation
-------- --------- --------- -----------  ----------------------
63.2   690,043     4     MEMORY_OPER  [CUDA memcpy Unified H2D]
32.4   353,647    24     MEMORY_OPER  [CUDA memcpy Unified D2H]
4.4    47,520     1     CUDA_KERNEL  add(int, float *, float *)
```

((Kernel time: 75.4M → 4.2M → 4.5M → **47K** ns. Prefetch giảm kernel time 95x vì threads không còn stall đợi page migration. Tổng H2D operations: 64 → 4 (batch lớn thay vì faults nhỏ lẻ).))

## Reference

- [Even Easier Introduction to CUDA — NVIDIA Developer Blog](https://developer.nvidia.com/blog/even-easier-introduction-cuda/)
