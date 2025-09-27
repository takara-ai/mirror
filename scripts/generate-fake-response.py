import os
import json
import random
from PIL import Image

def generate_data_json():
    """Generate a JSON file with image data from the data directory."""
    
    # Path to the data directory
    data_dir = "public/data"
    output_file = "app/assets/data.json"
    
    # Ensure the output directory exists
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    items = []
    
    # Check if data directory exists
    if not os.path.exists(data_dir):
        print(f"Warning: {data_dir} directory does not exist")
        items = []
    else:
        # Walk through all subdirectories in the data directory
        for root, dirs, files in os.walk(data_dir):
            for filename in files:
                file_path = os.path.join(root, filename)
                
                # Check if it's an image file
                if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp')):
                    try:
                        # Open image to get dimensions
                        with Image.open(file_path) as img:
                            width, height = img.size
                        
                        # Get the relative path from data directory
                        rel_path = os.path.relpath(file_path, data_dir)
                        
                        # Extract theme from folder structure
                        # If image is in a subdirectory, use that as theme
                        path_parts = rel_path.split(os.sep)
                        if len(path_parts) > 1:
                            theme = path_parts[0]  # First folder name is the theme
                        else:
                            theme = "general"  # Default theme for root level images
                        
                        # Create item object
                        item = {
                            "type": "image",
                            "imageUrl": f"/data/{rel_path.replace(os.sep, '/')}",
                            "theme": theme,
                            "height": height,
                            "width": width,
                            "x": random.randint(0, 10000),
                            "y": random.randint(0, 10000)
                        }
                        
                        items.append(item)
                        print(f"Added: {rel_path} (theme: {theme}, {width}x{height})")
                        
                    except Exception as e:
                        print(f"Error processing {filename}: {e}")
    
    # Create the final data structure
    data = {
        "items": items
    }
    
    # Write to JSON file
    with open(output_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"Generated {output_file} with {len(items)} items")

if __name__ == "__main__":
    generate_data_json()
