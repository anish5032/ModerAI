from PIL import Image
import numpy as np

IMAGE_SIZE = (224, 224)

IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def preprocess_image(image: Image.Image) -> np.ndarray:
    """Convert a PIL image to the normalized NCHW tensor expected by the ONNX model."""
    rgb_image = image.convert("RGB").resize(
        IMAGE_SIZE,
        Image.Resampling.BICUBIC,
    )
    pixels = np.asarray(rgb_image, dtype=np.float32) / 255.0
    pixels = (pixels - IMAGENET_MEAN) / IMAGENET_STD
    return np.transpose(pixels, (2, 0, 1))[None, ...].astype(
        np.float32,
        copy=False,
    )
