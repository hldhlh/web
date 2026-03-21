import os
import base64
import json
from PIL import Image, ImageChops

def smart_crop(img):
    # Convert to grayscale and threshold to find the tray (bright)
    gray = img.convert('L')
    # Threshold at 200 (white tray)
    bw = gray.point(lambda x: 255 if x > 180 else 0)
    
    # Also find red parts (meat)
    r, g, b = img.split()
    meat_mask = r.point(lambda x: 255 if x > 120 else 0)
    
    # Combine masks
    combined = ImageChops.lighter(bw, meat_mask)
    
    # Get bounding box
    bbox = combined.getbbox()
    if bbox:
        # Add some padding
        w, h = img.size
        left, top, right, bottom = bbox
        left = max(0, left - 20)
        top = max(0, top - 20)
        right = min(w, right + 20)
        bottom = min(h, bottom + 20)
        return img.crop((left, top, right, bottom))
    return img

def process_directory(directory, limit=5):
    results = []
    files = [f for f in os.listdir(directory) if f.lower().endswith(('.jpeg', '.jpg', '.png'))]
    files.sort()
    
    for filename in files[:limit]:
        path = os.path.join(directory, filename)
        try:
            with Image.open(path) as img:
                # 1. Smart Crop
                cropped = smart_crop(img)
                
                # 2. Resize to a manageable size (e.g. max width 600)
                max_size = 600
                w, h = cropped.size
                if w > h:
                    new_w = max_size
                    new_h = int(h * (max_size / w))
                else:
                    new_h = max_size
                    new_w = int(w * (max_size / h))
                
                resized = cropped.resize((new_w, new_h), Image.Resampling.LANCZOS)
                
                # 3. Compress and save to buffer
                from io import BytesIO
                buffer = BytesIO()
                resized.save(buffer, format="JPEG", quality=70)
                img_str = base64.b64encode(buffer.getvalue()).decode('utf-8')
                
                # 4. Prepare metadata
                results.append({
                    "title": filename.replace('.JPEG', '').replace('.JPEG', ''),
                    "base64": f"data:image/jpeg;base64,{img_str}"
                })
                print(f"Processed {filename}")
        except Exception as e:
            print(f"Error processing {filename}: {e}")
            
    return results

if __name__ == "__main__":
    photo_dir = r"c:\Users\Aries\OneDrive\代码\HTML\web\apps\jlbj\iCloud 照片"
    data = process_directory(photo_dir, limit=10)
    with open("processed_photos.json", "w") as f:
        json.dump(data, f)
    print(f"Saved {len(data)} processed photos to processed_photos.json")
