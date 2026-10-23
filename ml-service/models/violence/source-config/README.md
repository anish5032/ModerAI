---
language: en
datasets:
- abdulmananraja/real-life-violence-situations
tags:
- image-classification
- vision
- violence-detection
license: apache-2.0
---

# ViT Base Violence Detection

## Model Description

This is a Vision Transformer (ViT) model fine-tuned for violence detection. The model is based on [google/vit-base-patch16-224-in21k](https://huggingface.co/google/vit-base-patch16-224-in21k) and has been trained on the [Real Life Violence Situations](https://www.kaggle.com/datasets/mohamedmustafa/real-life-violence-situations-dataset) dataset from Kaggle to classify images into violent or non-violent categories.

## Intended Use

The model is intended for use in applications where detecting violent content in images is necessary. This can include:

- Content moderation
- Surveillance
- Parental control software

## Model accuracy

Test accuracy for Vit Base = 98.80%
Loss = 0.20038144290447235

## How to Use

Here is an example of how to use this model for image classification:

```python
import torch
from transformers import ViTForImageClassification, ViTFeatureExtractor
from PIL import Image

# Load the model and feature extractor
model = ViTForImageClassification.from_pretrained('jaranohaal/vit-base-violence-detection')
feature_extractor = ViTFeatureExtractor.from_pretrained('jaranohaal/vit-base-violence-detection')

# Load an image
image = Image.open('image.jpg')

# Preprocess the image
inputs = feature_extractor(images=image, return_tensors="pt")

# Perform inference
with torch.no_grad():
    outputs = model(**inputs)
    logits = outputs.logits
    predicted_class_idx = logits.argmax(-1).item()

# Print the predicted class
print("Predicted class:", model.config.id2label[predicted_class_idx])
