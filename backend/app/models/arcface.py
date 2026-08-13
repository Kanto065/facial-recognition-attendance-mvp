import logging

import cv2
import numpy as np
from onnxruntime import InferenceSession

from app.utils.helpers import face_alignment

__all__ = ["ArcFace"]

logger = logging.getLogger(__name__)


class ArcFace:
    """
    ArcFace face embedding encoder (MobileFace variant), CPU-only ONNX Runtime.
    Adapted from https://github.com/yakhyo/face-reidentification
    """

    def __init__(self, model_path: str) -> None:
        self.model_path = model_path
        self.input_size = (112, 112)
        self.normalization_mean = 127.5
        self.normalization_scale = 127.5

        try:
            self.session = InferenceSession(
                self.model_path,
                providers=["CPUExecutionProvider"],
            )

            input_config = self.session.get_inputs()[0]
            self.input_name = input_config.name

            self.output_names = [o.name for o in self.session.get_outputs()]
            self.output_shape = self.session.get_outputs()[0].shape
            self.embedding_size = self.output_shape[1]

            if len(self.output_names) != 1:
                raise ValueError(f"Expected exactly one output node, got {len(self.output_names)}.")

            logger.info(
                f"Successfully initialized face encoder from {self.model_path} "
                f"(embedding size: {self.embedding_size})"
            )
        except Exception as e:
            logger.error(f"Failed to load face encoder model from '{self.model_path}'", exc_info=True)
            raise RuntimeError(f"Failed to initialize model session for '{self.model_path}'") from e

    def preprocess(self, face_image: np.ndarray) -> np.ndarray:
        resized_face = cv2.resize(face_image, self.input_size)
        face_blob = cv2.dnn.blobFromImage(
            resized_face,
            scalefactor=1.0 / self.normalization_scale,
            size=self.input_size,
            mean=(self.normalization_mean,) * 3,
            swapRB=True,
        )
        return face_blob

    def get_embedding(self, image: np.ndarray, landmarks: np.ndarray, normalized: bool = False) -> np.ndarray:
        if image is None or landmarks is None:
            raise ValueError("Image and landmarks must not be None")

        aligned_face, _ = face_alignment(image, landmarks)
        face_blob = self.preprocess(aligned_face)
        embedding = self.session.run(self.output_names, {self.input_name: face_blob})[0]

        if normalized:
            norm = np.linalg.norm(embedding, axis=1, keepdims=True)
            return (embedding / norm).flatten()

        return embedding.flatten()
