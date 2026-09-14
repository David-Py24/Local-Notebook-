// Vector helpers for Memory-RAG (AGENT_MEMORY_RAG_PLAN.md, M1).
// Embedding vectors are stored in SQLite as packed little-endian f32 BLOBs; cosine
// similarity and top-k are computed in Rust over candidate rows (FTS5 pre-filter +
// re-rank). The embedding HTTP calls run in the frontend (consistent with aiProvider.ts),
// which is why this module has no network client.

/// Packs f32 values into a contiguous little-endian byte blob for SQLite storage.
pub fn pack_f32s(values: &[f32]) -> Vec<u8> {
    let mut out = Vec::with_capacity(values.len() * 4);
    for v in values {
        out.extend_from_slice(&v.to_le_bytes());
    }
    out
}

/// Unpacks a blob produced by [`pack_f32s`]. Trailing bytes that don't form a complete
/// f32 are ignored.
#[allow(dead_code)]
pub fn unpack_f32s(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect()
}

/// Cosine similarity between two vectors. Returns 0.0 if either vector has no magnitude
/// or the lengths differ (zip truncates).
#[allow(dead_code)]
pub fn cosine(a: &[f32], b: &[f32]) -> f32 {
    let mut dot = 0.0f64;
    let mut na = 0.0f64;
    let mut nb = 0.0f64;
    for (x, y) in a.iter().zip(b.iter()) {
        let x = *x as f64;
        let y = *y as f64;
        dot += x * y;
        na += x * x;
        nb += y * y;
    }
    if na == 0.0 || nb == 0.0 {
        return 0.0;
    }
    (dot / (na.sqrt() * nb.sqrt())) as f32
}

/// Returns the indices of the highest-scoring `(index, score)` pairs, descending.
#[allow(dead_code)]
pub fn top_k_scored<I: Iterator<Item = (usize, f32)>>(scores: I, k: usize) -> Vec<usize> {
    let mut list: Vec<(usize, f32)> = scores.collect();
    list.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    list.into_iter().take(k).map(|(idx, _)| idx).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pack_unpack_roundtrip() {
        let values = vec![0.0f32, -1.5, 3.25, f32::MIN, f32::MAX];
        let blob = pack_f32s(&values);
        assert_eq!(blob.len(), values.len() * 4);
        assert_eq!(unpack_f32s(&blob), values);
    }

    #[test]
    fn unpack_ignores_padding_bytes() {
        let mut blob = pack_f32s(&[1.0, 2.0]);
        blob.push(0xAA);
        assert_eq!(unpack_f32s(&blob), vec![1.0, 2.0]);
    }

    #[test]
    fn cosine_known_values() {
        assert!((cosine(&[1.0, 0.0], &[1.0, 0.0]) - 1.0).abs() < 1e-6);
        assert!((cosine(&[1.0, 0.0], &[0.0, 1.0]) - 0.0).abs() < 1e-6);
        assert_eq!(cosine(&[0.0, 0.0], &[1.0, 1.0]), 0.0);
        assert_eq!(cosine(&[1.0, 1.0], &[]), 0.0);
    }

    #[test]
    fn top_k_returns_highest_first() {
        let idxs = top_k_scored([(0usize, 0.1f32), (1, 0.9), (2, 0.5)].into_iter(), 2);
        assert_eq!(idxs, vec![1, 2]);
        assert!(top_k_scored([(0, 0.1), (1, 0.9)].into_iter(), 0).is_empty());
    }
}