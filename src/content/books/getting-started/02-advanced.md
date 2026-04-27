---
title: "Chapter 2: Advanced Features"
pubDate: "2025-04-27"
published: true
description: "Deep dive into advanced markdown features: math equations, syntax highlighting, callouts, galleries, sidenotes, and technical diagrams for professional documentation."
useKatex: true
---

# Chapter 2: Advanced Features

In this chapter, we'll explore **advanced markdown features** that make technical documentation shine.

## Code Syntax Highlighting

### Rust - Performance Critical Code

```rust
/// A concurrent hash map using sharding
use std::sync::{Arc, RwLock};
use std::collections::HashMap;

struct ShardedMap<K: Eq + Hash + Clone, V: Clone> {
    shards: Arc<Vec<RwLock<HashMap<K, V>>>>,
    num_shards: usize,
}

impl<K: Eq + Hash + Clone, V: Clone> ShardedMap<K, V> {
    fn new(num_shards: usize) -> Self {
        let mut shards = Vec::with_capacity(num_shards);
        for _ in 0..num_shards {
            shards.push(RwLock::new(HashMap::new()));
        }
        Self {
            shards: Arc::new(shards),
            num_shards,
        }
    }

    fn get(&self, key: &K) -> Option<V> {
        let shard_idx = self.hash(key);
        let shard = self.shards[shard_idx].read().unwrap();
        shard.get(key).cloned()
    }

    fn insert(&self, key: K, value: V) -> Option<V> {
        let shard_idx = self.hash(&key);
        let mut shard = self.shards[shard_idx].write().unwrap();
        shard.insert(key, value)
    }

    fn hash<Q: Hash>(&self, key: &Q) -> usize {
        use std::hash::{Hash, Hasher};
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        key.hash(&mut hasher);
        (hasher.finish() as usize) % self.num_shards
    }
}
```
---

## Mathematics (KaTeX)

### Calculus

**Taylor Series Expansion:**

$$
f(x) = f(a) + f'(a)(x-a) + \frac{f''(a)}{2!}(x-a)^2 + \frac{f'''(a)}{3!}(x-a)^3 + \cdots
$$

**Fourier Transform:**

$$
\mathcal{F}\{f(t)\} = F(\omega) = \int_{-\infty}^{\infty} f(t) e^{-i\omega t} \,dt
$$

**Inverse Fourier Transform:**

$$
f(t) = \frac{1}{2\pi} \int_{-\infty}^{\infty} F(\omega) e^{i\omega t} \,d\omega
$$

---

## Tables

### Feature Comparison Matrix

| Feature | PyTorch | TensorFlow | JAX | NumPy |
|---------|---------|------------|-----|-------|
| **Dynamic Graph** | ✅ | ⚠️ (TF 2.x) | ✅ | N/A |
| **GPU Support** | ✅ | ✅ | ✅ | ⚠️ (via CuPy) |
| **AutoDiff** | ✅ | ✅ | ✅ | ❌ |
| **TPU Support** | ❌ | ✅ | ✅ | ❌ |
| **Production** | ⚠️ | ✅ | ⚠️ | ❌ |
| **Research** | ✅ | ⚠️ | ✅ | ✅ |
| **Learning Curve** | Easy | Moderate | Hard | Easiest |

---

## Callouts

!!! tip "Performance Tip"
    Use vectorized operations instead of loops when possible. In NumPy/PyTorch, vectorized ops can be **10-100x faster** due to SIMD and GPU acceleration.

!!! warning "Memory Warning"
    Be careful with large tensors on GPU! A 1GB tensor might need **2-3GB** of GPU memory due to intermediate gradients and optimizer states. Use `torch.cuda.empty_cache()` wisely.

!!! note "Implementation Detail"
    The attention mechanism computes $QK^T$ which is $O(n^2)$ in sequence length. For long sequences (>512 tokens), this becomes a bottleneck. Consider:
    - Sparse attention patterns
    - Linear attention (Performer, Linformer)
    - FlashAttention (IO-aware)

---

## Sidenotes

Gradient descent ((Gradient descent is an optimization algorithm used to minimize a function by iteratively moving in the direction of steepest descent, which is the negative of the gradient.)) is the foundation of modern deep learning.

The learning rate ((The learning rate $\eta$ is a hyperparameter that controls how much to adjust the model in response to the estimated error each time the model weights are updated. Typical values: 0.001, 0.01, 0.1. )) is one of the most important hyperparameters.

---

## Further Reading

- [KaTeX Documentation](https://katex.org/docs/) - Math syntax reference