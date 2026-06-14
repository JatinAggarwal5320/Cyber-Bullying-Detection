"""
Export trained sklearn models and TF-IDF vocabulary to a compact JSON file
for use in the BABE Chrome Extension (client-side prediction).
"""

import pickle
import json
import numpy as np
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(SCRIPT_DIR, "models")
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "babe_extension")

def load_stopwords():
    path = os.path.join(SCRIPT_DIR, "stopwords.txt")
    with open(path, "r") as f:
        return [w.strip() for w in f.read().split("\n") if w.strip()]

def load_vocabulary():
    path = os.path.join(MODELS_DIR, "tfidfvectoizer.pkl")
    with open(path, "rb") as f:
        return pickle.load(f)

def load_model(name):
    path = os.path.join(MODELS_DIR, f"{name}.pkl")
    with open(path, "rb") as f:
        return pickle.load(f)

def export():
    print("Loading stopwords...")
    stopwords = load_stopwords()

    print("Loading vocabulary...")
    vocab = load_vocabulary()
    # vocab is a dict: word -> index

    print("Loading LinearSVC model...")
    svc = load_model("LinearSVC")
    svc_coef = svc.coef_.toarray() if hasattr(svc.coef_, "toarray") else svc.coef_
    svc_coef = svc_coef.flatten()

    print("Loading LogisticRegression model...")
    lr = load_model("LogisticRegression")
    lr_coef = lr.coef_.toarray() if hasattr(lr.coef_, "toarray") else lr.coef_
    lr_coef = lr_coef.flatten()

    # Only export non-zero coefficients to keep the JSON small
    # Format: { word: [svc_weight, lr_weight] }
    print("Building compact weight map...")
    weight_map = {}
    inv_vocab = {v: k for k, v in vocab.items()}

    for idx in range(len(svc_coef)):
        sw = float(svc_coef[idx])
        lw = float(lr_coef[idx])
        if sw != 0.0 or lw != 0.0:
            word = inv_vocab.get(idx, None)
            if word is not None:
                # Round to 6 decimal places to save space
                weight_map[word] = [round(sw, 6), round(lw, 6)]

    model_data = {
        "stopwords": stopwords,
        "svc_intercept": round(float(svc.intercept_[0]), 6),
        "lr_intercept": round(float(lr.intercept_[0]), 6),
        "weights": weight_map,
    }

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    output_path = os.path.join(OUTPUT_DIR, "model_data.json")
    with open(output_path, "w") as f:
        json.dump(model_data, f)

    size_kb = os.path.getsize(output_path) / 1024
    print(f"✅ Exported model_data.json ({size_kb:.1f} KB)")
    print(f"   Vocabulary words with non-zero weights: {len(weight_map)}")
    print(f"   Stopwords: {len(stopwords)}")
    print(f"   SVC intercept: {model_data['svc_intercept']}")
    print(f"   LR intercept: {model_data['lr_intercept']}")

if __name__ == "__main__":
    export()
