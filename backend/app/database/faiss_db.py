import json
import logging
import os
from typing import List, Tuple

import faiss
import numpy as np

__all__ = ["FaceDatabase"]

logger = logging.getLogger(__name__)


class FaceDatabase:
    """
    Batch cosine-similarity lookup using a FAISS inner-product index.

    Embeddings are L2-normalized before being added, so an inner-product
    search is equivalent to cosine similarity. The index and the id->name
    mapping are persisted to disk so the database survives restarts.

    Adapted from the FAISS wrapper in https://github.com/yakhyo/face-reidentification
    """

    def __init__(self, embedding_size: int, db_path: str) -> None:
        self.embedding_size = embedding_size
        self.db_path = db_path
        self.index_path = f"{db_path}.index"
        self.names_path = f"{db_path}_names.json"

        self.index = faiss.IndexFlatIP(embedding_size)
        self.names: List[str] = []

    def _normalize(self, embedding: np.ndarray) -> np.ndarray:
        vec = embedding.astype(np.float32).ravel()
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm
        return vec

    def add_face(self, embedding: np.ndarray, name: str) -> None:
        vec = self._normalize(embedding).reshape(1, -1)
        self.index.add(vec)
        self.names.append(name)

    def add_faces_batch(self, embeddings: List[np.ndarray], names: List[str]) -> None:
        vecs = np.vstack([self._normalize(e) for e in embeddings]).astype(np.float32)
        self.index.add(vecs)
        self.names.extend(names)

    def batch_search(self, embeddings: List[np.ndarray], threshold: float) -> List[Tuple[str, float]]:
        """Search all query embeddings against the index in a single FAISS call.

        Returns a list of (name, similarity) pairs, one per query embedding,
        in the same order as the input. Below-threshold or empty-index
        queries return ("Unknown", similarity).
        """
        results: List[Tuple[str, float]] = []

        if self.index.ntotal == 0 or not embeddings:
            return [("Unknown", 0.0) for _ in embeddings]

        query = np.vstack([self._normalize(e) for e in embeddings]).astype(np.float32)
        similarities, indices = self.index.search(query, 1)

        for sim_row, idx_row in zip(similarities, indices):
            sim = float(sim_row[0])
            idx = int(idx_row[0])
            if idx < 0 or sim < threshold:
                results.append(("Unknown", sim))
            else:
                results.append((self.names[idx], sim))

        return results

    def list_names(self) -> List[str]:
        return list(self.names)

    def save(self) -> None:
        os.makedirs(os.path.dirname(self.index_path) or ".", exist_ok=True)
        faiss.write_index(self.index, self.index_path)
        with open(self.names_path, "w", encoding="utf-8") as f:
            json.dump(self.names, f)
        logger.info(f"Saved face database ({self.index.ntotal} entries) to {self.db_path}")

    def load(self) -> bool:
        if not (os.path.exists(self.index_path) and os.path.exists(self.names_path)):
            return False
        try:
            self.index = faiss.read_index(self.index_path)
            with open(self.names_path, "r", encoding="utf-8") as f:
                self.names = json.load(f)
            logger.info(f"Loaded face database ({self.index.ntotal} entries) from {self.db_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to load face database from {self.db_path}: {e}")
            return False
