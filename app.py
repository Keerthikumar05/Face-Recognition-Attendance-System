from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
import os
import base64

app = Flask(__name__)
CORS(app, origins="*")  # Allow requests from any origin (for your dashboard/frontend)

# -----------------------------
# Enroll API
# -----------------------------
@app.route("/enroll", methods=["POST"])
def enroll():
    data = request.get_json()
    usn = data.get("usn")
    image_data = data.get("image")

    if not usn or not image_data:
        return jsonify({"message": "USN or image data is missing"}), 400

    # Create folder for student if not exists
    student_folder = os.path.join("faces", usn)
    os.makedirs(student_folder, exist_ok=True)

    try:
        img_bytes = base64.b64decode(image_data.split(",")[1])
        np_arr = np.frombuffer(img_bytes, np.uint8)
        face_img = cv2.imdecode(np_arr, cv2.IMREAD_GRAYSCALE)
    except Exception as e:
        return jsonify({"message": "Invalid image format"}), 400

    # Detect face
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    faces = face_cascade.detectMultiScale(face_img, 1.3, 5)

    if len(faces) == 0:
        return jsonify({"message": "No face detected"}), 400

    # Save detected face(s)
    count = len(os.listdir(student_folder)) + 1
    for (x, y, w, h) in faces:
        face_crop = face_img[y:y+h, x:x+w]
        filename = os.path.join(student_folder, f"{usn}_{count}.jpg")
        cv2.imwrite(filename, face_crop)
        print(f"[INFO] Saved face: {filename}")
        count += 1

    return jsonify({"message": f"Student {usn} enrolled successfully!"}), 200

# -----------------------------
# Train Face Recognizer
# -----------------------------
def train_model():
    recognizer = cv2.face.LBPHFaceRecognizer_create()
    faces = []
    labels = []
    label_map = {}
    current_label = 0

    if not os.path.exists("faces"):
        os.makedirs("faces")

    for person_usn in os.listdir("faces"):
        person_folder = os.path.join("faces", person_usn)
        if not os.path.isdir(person_folder):
            continue

        if person_usn not in label_map:
            label_map[person_usn] = current_label
            current_label += 1

        for img_file in os.listdir(person_folder):
            img_path = os.path.join(person_folder, img_file)
            img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
            if img is None:
                print(f"[WARN] Could not read image: {img_path}")
                continue
            faces.append(img)
            labels.append(label_map[person_usn])

    if len(faces) == 0:
        return None, {}

    recognizer.train(faces, np.array(labels))
    return recognizer, {v: k for k, v in label_map.items()}

# -----------------------------
# Recognize API
# -----------------------------
@app.route("/recognize", methods=["POST"])
def recognize():
    data = request.get_json()
    image_data = data.get("image")
    if not image_data:
        return jsonify({"usn": "No image data"}), 400

    try:
        img_bytes = base64.b64decode(image_data.split(",")[1])
        np_arr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    except Exception as e:
        return jsonify({"usn": "Invalid image format"}), 400

    recognizer, label_reverse_map = train_model()
    if recognizer is None:
        return jsonify({"usn": "No enrolled students yet"}), 400

    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, 1.3, 5)

    for (x, y, w, h) in faces:
        face_crop = gray[y:y+h, x:x+w]
        label, confidence = recognizer.predict(face_crop)
        usn = label_reverse_map.get(label, "Unknown")
        return jsonify({"usn": usn, "confidence": int(confidence)}), 200

    return jsonify({"usn": "No face detected"}), 400

# -----------------------------
# Run Server
# -----------------------------
if __name__ == "__main__":
    app.run(port=5000)