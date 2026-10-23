from PIL import Image
import numpy as np

IMAGE_SIZE = (224, 224)


def preprocess_image(image: Image.Image) -> np.ndarray:
    """Convert a PIL image to the 0-255 RGB NCHW tensor expected by the ONNX model.

    The exported model from OwenElliott/image-safety-classifier-xs includes its
    own rescaling, normalization, and softmax layers. Supplying ImageNet-normalized
    pixels here would apply preprocessing twice and change predictions.
    """
    rgb_image = image.convert("RGB").resize(
        IMAGE_SIZE,
        Image.Resampling.BILINEAR,
    )
    pixels = np.asarray(rgb_image, dtype=np.float32)
    return np.transpose(pixels, (2, 0, 1))[None, ...].astype(
        np.float32,
        copy=False,
    )
