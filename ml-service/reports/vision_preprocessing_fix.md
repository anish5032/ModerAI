# Vision preprocessing correction

## Summary

The vision ONNX export contains both preprocessing and softmax. Its declared input is RGB pixel data in the range 0-255 with shape `[batch, 3, 224, 224]`.

The previous Python path applied ImageNet mean/std normalization before inference. That transformed the model's expected input distribution and could reverse the predicted class.

## Reproduction

On the local `test-frame.jpg` sample:

| Input path | Scores (`NSFL`, `NSFW`, `SFW`) | Prediction |
| --- | --- | --- |
| ImageNet-normalized input | SFW favored | SFW |
| Correct RGB 0-255 input | `0.0443`, `0.5825`, `0.3732` | NSFW |

The corrected path resizes with bilinear interpolation, converts to RGB, keeps float32 values in 0-255, and sends NCHW `[1, 3, 224, 224]`.

## Changes

- `src/vision/preprocessing.py`: removed mean/std normalization; documented the model contract.
- `src/vision/predict_vision.py`: aligned inference and metadata with the corrected contract.
- `api.py`: response metadata now states `RGB, bilinear resize to 224x224, pixel range 0-255`.
- `tests/test_vision_preprocessing.py`: checks the exact input range, shape, and endpoint contract.

## Limitations

This verifies preprocessing behavior, not model accuracy. The model card reports 97.76% accuracy, but that figure has not been independently reproduced. `NSFW` means sexual/suggestive content and `NSFL` means graphic gore; this is not a general violence classifier.
