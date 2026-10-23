import asyncio
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from fastapi import HTTPException
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ML_SERVICE_ROOT = PROJECT_ROOT / 'ml-service'
sys.path.insert(0, str(ML_SERVICE_ROOT))

import api  # noqa: E402
from src.vision.predict_vision import predict_image  # noqa: E402
from src.vision.preprocessing import preprocess_image  # noqa: E402


class UploadStub:
    def __init__(self, content, content_type='image/jpeg'):
        self._content = content
        self.content_type = content_type
        self.filename = 'vision-test.jpg'

    async def read(self):
        return self._content


class VisionPreprocessingTests(unittest.TestCase):
    def test_tensor_shape_dtype_and_pixel_range(self):
        color = (255, 0, 128)
        image = Image.new('RGB', (300, 180), color)

        tensor = preprocess_image(image)

        self.assertEqual(tensor.shape, (1, 3, 224, 224))
        self.assertEqual(tensor.dtype, np.float32)
        self.assertTrue(
            np.allclose(tensor[0], np.array(color, dtype=np.float32)[:, None, None]),
            msg='pixels must stay in 0-255 RGB order without extra normalization',
        )

    def test_rgb_conversion_from_grayscale(self):
        image = Image.new('L', (224, 224), 255)

        tensor = preprocess_image(image)

        self.assertEqual(tensor.shape, (1, 3, 224, 224))
        self.assertTrue(
            np.allclose(tensor, 255.0),
            msg='grayscale input was not converted to a 0-255 RGB tensor',
        )

    def test_resizes_with_bilinear_filter(self):
        image = Image.new('RGB', (448, 448), (255, 255, 255))
        image.putpixel((0, 0), (0, 0, 0))

        tensor = preprocess_image(image)

        self.assertEqual(tensor.shape, (1, 3, 224, 224))
        self.assertGreater(float(tensor.min()), 0.0)
        self.assertLess(float(tensor.min()), 255.0)

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
        self.assertIn('probability', api_result['score_type'])

    def test_api_rejects_non_image_content_type(self):
        upload = UploadStub(b'not-an-image', content_type='audio/wav')

        with self.assertRaises(HTTPException) as caught:
            asyncio.run(api.predict_vision(upload))

        self.assertEqual(caught.exception.status_code, 400)

    def test_api_rejects_undecodable_image(self):
        upload = UploadStub(b'not-an-image')

        with self.assertRaises(HTTPException) as caught:
            asyncio.run(api.predict_vision(upload))

        self.assertEqual(caught.exception.status_code, 400)

    def test_standalone_predictor_rejects_missing_file(self):
        with self.assertRaises(FileNotFoundError):
            predict_image('does-not-exist.jpg')


if __name__ == '__main__':
    unittest.main()
