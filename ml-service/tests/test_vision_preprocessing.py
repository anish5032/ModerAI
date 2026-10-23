import asyncio
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ML_SERVICE_ROOT = PROJECT_ROOT / 'ml-service'
sys.path.insert(0, str(ML_SERVICE_ROOT))

import api  # noqa: E402
from src.vision.predict_vision import predict_image  # noqa: E402
from src.vision.preprocessing import (  # noqa: E402
    IMAGENET_MEAN,
    IMAGENET_STD,
    preprocess_image,
)


class UploadStub:
    content_type = 'image/jpeg'
    filename = 'vision-test.jpg'

    def __init__(self, content):
        self._content = content

    async def read(self):
        return self._content


def expected_normalized_channel(value):
    return (value / 255.0 - IMAGENET_MEAN) / IMAGENET_STD


class VisionPreprocessingTests(unittest.TestCase):
    def test_tensor_shape_dtype_and_normalization(self):
        color = (255, 0, 128)
        image = Image.new('RGB', (300, 180), color)

        tensor = preprocess_image(image)

        self.assertEqual(tensor.shape, (1, 3, 224, 224))
        self.assertEqual(tensor.dtype, np.float32)

        expected = expected_normalized_channel(
            np.array(color, dtype=np.float32)
        )
        for channel in range(3):
            self.assertTrue(
                np.allclose(
                    tensor[0, channel],
                    expected[channel],
                    atol=1e-5,
                ),
                msg=f'channel {channel} was not imageNet-normalized',
            )

    def test_rgb_conversion_from_grayscale(self):
        image = Image.new('L', (224, 224), 255)

        tensor = preprocess_image(image)

        self.assertEqual(tensor.shape, (1, 3, 224, 224))

        restored_rgb = tensor[0] * IMAGENET_STD[:, None, None] + (
            IMAGENET_MEAN[:, None, None]
        )
        self.assertTrue(
            np.allclose(restored_rgb, 1.0, atol=1e-5),
            msg='grayscale input was not converted to an RGB tensor',
        )

    def test_api_and_standalone_predictor_agree(self):
        with tempfile.TemporaryDirectory() as directory:
            image_path = Path(directory) / 'prediction-test.jpg'
            gradient = np.linspace(
                0,
                255,
                224,
                dtype=np.uint8,
            )
            row = np.tile(gradient, (224, 1))
            pixels = np.stack(
                [
                    row,
                    np.flip(row, axis=1),
                    np.full_like(row, 128),
                ],
                axis=-1,
            )
            Image.fromarray(pixels, mode='RGB').save(
                image_path,
                format='JPEG',
                quality=95,
            )

            standalone = predict_image(str(image_path))
            api_result = asyncio.run(
                api.predict_vision(UploadStub(image_path.read_bytes()))
            )

        self.assertEqual(
            standalone['predicted_class'],
            api_result['predicted_class'],
        )
        self.assertEqual(standalone['scores'], api_result['scores'])


if __name__ == '__main__':
    unittest.main()
