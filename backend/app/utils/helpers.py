from typing import Optional, Tuple

import cv2
import numpy as np
from skimage.transform import SimilarityTransform

# Reference alignment for facial landmarks (ArcFace 112x112 template)
reference_alignment: np.ndarray = np.array(
    [
        [38.2946, 51.6963],
        [73.5318, 51.5014],
        [56.0252, 71.7366],
        [41.5493, 92.3655],
        [70.7299, 92.2041],
    ],
    dtype=np.float32,
)


def estimate_norm(landmark: np.ndarray, image_size: int = 112) -> Tuple[np.ndarray, np.ndarray]:
    """Estimate the similarity transform that aligns 5-point landmarks to the ArcFace template."""
    if landmark.shape != (5, 2):
        raise ValueError(f"Landmark array must have shape (5, 2), got {landmark.shape}.")
    if image_size % 112 != 0 and image_size % 128 != 0:
        raise ValueError(f"Image size must be a multiple of 112 or 128, got {image_size}.")

    if image_size % 112 == 0:
        ratio = float(image_size) / 112.0
        diff_x = 0.0
    else:
        ratio = float(image_size) / 128.0
        diff_x = 8.0 * ratio

    alignment = reference_alignment * ratio
    alignment[:, 0] += diff_x

    transform = SimilarityTransform()
    transform.estimate(landmark, alignment)

    matrix = transform.params[0:2, :]
    inverse_matrix = np.linalg.inv(transform.params)[0:2, :]

    return matrix, inverse_matrix


def face_alignment(image: np.ndarray, landmark: np.ndarray, image_size: int = 112) -> Tuple[np.ndarray, np.ndarray]:
    """Warp the input image to align the face using the given 5-point landmarks."""
    matrix, inverse_matrix = estimate_norm(landmark, image_size)
    warped = cv2.warpAffine(image, matrix, (image_size, image_size), borderValue=0.0)
    return warped, inverse_matrix


def distance2bbox(
    points: np.ndarray,
    distance: np.ndarray,
    max_shape: Optional[Tuple[int, int]] = None,
) -> np.ndarray:
    """Decode SCRFD distance predictions to bounding boxes [x1, y1, x2, y2]."""
    x1 = points[:, 0] - distance[:, 0]
    y1 = points[:, 1] - distance[:, 1]
    x2 = points[:, 0] + distance[:, 2]
    y2 = points[:, 1] + distance[:, 3]
    if max_shape is not None:
        x1 = np.clip(x1, 0, max_shape[1])
        y1 = np.clip(y1, 0, max_shape[0])
        x2 = np.clip(x2, 0, max_shape[1])
        y2 = np.clip(y2, 0, max_shape[0])
    return np.stack([x1, y1, x2, y2], axis=-1)


def distance2kps(
    points: np.ndarray,
    distance: np.ndarray,
    max_shape: Optional[Tuple[int, int]] = None,
) -> np.ndarray:
    """Decode SCRFD distance predictions to 5-point keypoints."""
    preds = []
    for i in range(0, distance.shape[1], 2):
        px = points[:, i % 2] + distance[:, i]
        py = points[:, i % 2 + 1] + distance[:, i + 1]
        if max_shape is not None:
            px = np.clip(px, 0, max_shape[1])
            py = np.clip(py, 0, max_shape[0])
        preds.append(px)
        preds.append(py)
    return np.stack(preds, axis=-1)


def compute_similarity(feat1: np.ndarray, feat2: np.ndarray) -> np.float32:
    """Cosine similarity between two face embeddings."""
    feat1 = feat1.ravel()
    feat2 = feat2.ravel()
    return np.dot(feat1, feat2) / (np.linalg.norm(feat1) * np.linalg.norm(feat2))
