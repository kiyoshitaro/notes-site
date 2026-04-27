---
title: "Blog Getting Started"
pubDate: "2025-05-10"
published: true
contents_table: true
pinned: false
description: "an example"
cat: "demo"
useKatex: true
---

This post is an in depth overview on GPU architecture and how to write performant GPU code. It covers execution hierarchy, memory layout, scheduling, memory access patterns, and basic profiling. The goal is to build enough knowledge to write a SGEMM (single precision general matrix multiply) kernel that achieves 50% of theoretical GPU FLOPS. 

The specifics in this guide, including naming and the specific capabilities of each SM are tailored to Nvidia's Blackwell (GB203) generation of cards (specifically the 5070 Ti). 
## GPU Architecture Overview
This is a high level chart that shows the hierarchy of components in an Nvidia GPU. At the top is a GPC. The 5070 Ti includes 6 GPCs and 35 TPCs, which averages to about 6 TPCs per GPC. The distribution is intentionally uneven to accommodate performance tuning and chip layout constraints.

<svg viewBox="0 0 700 580" xmlns="http://www.w3.org/2000/svg" style="font-family: monospace; font-size: 14px; width: 100%">
  <!-- GPU Box -->
  <rect x="20" y="20" width="660" height="540" fill="#f5f3ef" stroke="#999" stroke-width="1.5"/>
  <text x="30" y="40" fill="#37352f">GPU</text>

  <!-- GPC Box -->
  <rect x="40" y="60" width="620" height="320" fill="#d8d4f0" stroke="#999"/>
  <text x="50" y="80" fill="#37352f">GPC (Graphics Processing Cluster)</text>

  <!-- TPC 1 -->
  <rect x="60" y="100" width="580" height="120" fill="#c8e6c8" stroke="#999"/>
  <text x="70" y="120" fill="#37352f">TPC (Texture Processing Cluster)</text>
  <!-- SM Boxes in TPC 1 -->
  <rect x="80" y="130" width="260" height="80" fill="#f0d0d0" stroke="#999"/>
  <text x="90" y="150" fill="#37352f">SM (Streaming Multiprocessor)</text>
  <rect x="360" y="130" width="260" height="80" fill="#f0d0d0" stroke="#999"/>
  <text x="370" y="150" fill="#37352f">SM (Streaming Multiprocessor)</text>

  <!-- TPC 2 -->
  <rect x="60" y="240" width="580" height="120" fill="#c8e6c8" stroke="#999"/>
  <text x="70" y="260" fill="#37352f">TPC (Texture Processing Cluster)</text>
  <!-- SM Boxes in TPC 2 -->
  <rect x="80" y="270" width="260" height="80" fill="#f0d0d0" stroke="#999"/>
  <text x="90" y="290" fill="#37352f">SM (Streaming Multiprocessor)</text>
  <rect x="360" y="270" width="260" height="80" fill="#f0d0d0" stroke="#999"/>
  <text x="370" y="290" fill="#37352f">SM (Streaming Multiprocessor)</text>

  <!-- L2 Cache Box -->
  <rect x="40" y="400" width="620" height="40" fill="#ece6c0" stroke="#999"/>
  <text x="50" y="425" fill="#37352f">L2 Cache — 48 MB, shared across all SMs</text>

  <!-- Global Memory Box -->
  <rect x="40" y="450" width="620" height="60" fill="#c0e0e0" stroke="#999"/>
  <text x="50" y="480" fill="#37352f">Global Memory — 16GB GDDR7, off-chip DRAM</text>
</svg>

If you want to see a more comprehensive review of GPU architecture check out [High Yield's](https://www.youtube.com/@HighYield) videos on YouTube. He does a great job of showing where each element is on the physical GPU die. 

The purpose of the GPCs and TPCs is to organize SMs (the main compute of the GPU) into modular blocks that have their own memory, cache, instruction dispatch, and texture units.((The exact organization varies by architecture. Blackwell has a different GPC/TPC ratio than Ada Lovelace, for example.)) Without this abstraction, there would be excessive contention for global resources and scaling the chip across product tiers would be much more difficult.

GPCs in traditional consumer GPUs also handle rasterization and graphics functions. In compute-only GPUs like the Nvidia H100, they may be optimized for throughput. For machine learning oriented workloads, this almost never comes into the picture. We're focused entirely on the SMs.
### Streaming Multiprocessors 
There are a lot of individual components that make up an SM: 

| Element                | Notes                                                                                                          | Count / Size Per SM |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------- |
| CUDA cores             | Scalar ALUs that can execute one FP32 or INT32 instruction per clock cycle, per core.                          | 128                 |
| Tensor cores           | Accelerates small matrix multiply-accumulate ops using mixed precision (FP16, BF16, TF32).                     | 4                   |
| Special Function Units | Handles transcendental and high-latency functions: sin, cos, exp, sqrt, etc.                                   | 4                   |
| Warp schedulers        | Manages instruction dispatch for one warp (32 threads) per cycle, directing execution to available CUDA cores. | 4                   |
| Load/Store units       | Interface for memory ops (load, store). Routes data to/from memory hierarchy.                                  | 8                   |
| Register file          | Fast, per-thread memory used for all intermediate values. Like CPU registers, but all 32-bit.                  | 256 KB              |
| Shared memory/L1 cache | Low-latency, per-SM memory. Shared memory is stored in L1 cache and is managed by the programmer.              | 128 KB              |

Most if not all of the compute on a GPU is done by CUDA cores. Some mixed precision datatypes (fp16, bf16, tf32, etc) are offloaded to other units within the SM (tensor cores for example), along with all exp, sin, cos-adjacent computations (on SFUs). 
```cpp
__global__ void add(const float *a, const float *b, float *c) {
	int gid = blockIdx.x * blockDim.x + threadIdx.x;
	if (gid >= 1000) return;
	c[gid] = a[gid] + b[gid];
}
```

## Further reading
- [George Hotz - how do GPUs work?](https://youtu.be/OUzm06YaUsI) 
- [George Hotz - can you multiply a matrix?](https://youtu.be/VgSQ1GOC86s) 
- [GitHub repository](https://github.com/boopdotpng/cuda-matmuls)
- [modal.com gpu glossary](https://modal.com/gpu-glossary) 
- [Nvidia Blackwell Architecture Whitepaper](https://resources.nvidia.com/en-us-blackwell-architecture)
- [High Yield: 5090 deep dive](https://youtu.be/rCwgAGG2sZQ)
- [Visualization of cache/memory used for shared memory matmul kernel](https://x.com/Hesamation/status/1920141361531040152) 
- [Peter Messmer - Nvidia: Shared Memory Accesses](https://www.youtube.com/watch?v=qOCUQoF_-MM)
