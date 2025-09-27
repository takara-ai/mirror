import os
import requests
import urllib.parse
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Query constant for image search theme
QUERY = "nature landscapes"
DOWNLOAD_COUNT = 20

def create_download_folder(query):
    """Create download folder based on query"""
    # Encode query for safe filesystem path
    encoded_query = urllib.parse.quote(query.replace(" ", "_"), safe="")
    folder_path = Path(__file__).parent.parent / "public" / "data" / encoded_query
    folder_path.mkdir(parents=True, exist_ok=True)
    return folder_path

def download_image(url, filepath):
    """Download image from URL to filepath"""
    try:
        response = requests.get(url, stream=True)
        response.raise_for_status()
        
        with open(filepath, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        return True
    except Exception as e:
        print(f"Error downloading {url}: {e}")
        return False

def search_and_download_images():
    """Search Unsplash API for images and download them"""
    # Get Unsplash Access Key and Secret Key from .env file
    access_key = os.getenv('UNSPLASH_ACCESS_KEY')
    secret_key = os.getenv('UNSPLASH_SECRET_KEY')
    
    if not access_key:
        print("Error: Please set UNSPLASH_ACCESS_KEY in your .env file")
        return
    
    if not secret_key:
        print("Error: Please set UNSPLASH_SECRET_KEY in your .env file")
        return
    
    # Create download folder
    download_folder = create_download_folder(QUERY)
    
    # Unsplash API endpoint for searching photos
    url = "https://api.unsplash.com/search/photos"
    headers = {
        "Authorization": f"Client-ID {access_key}"
    }
    
    # Parameters for the API request
    params = {
        "query": QUERY,
        "per_page": 30,  # Max 30 per request
        "order_by": "popular"  # Get most popular images
    }
    
    downloaded_count = 0
    page = 1
    
    while downloaded_count < DOWNLOAD_COUNT:
        params["page"] = page
        
        try:
            response = requests.get(url, headers=headers, params=params)
            response.raise_for_status()
            
            data = response.json()
            photos = data.get("results", [])
            
            if not photos:
                print("No more photos found")
                break
            
            for photo in photos:
                if downloaded_count >= DOWNLOAD_COUNT:
                    break
                
                # Get the regular size image URL
                image_url = photo["urls"]["regular"]
                image_id = photo["id"]
                
                # Create filename
                filename = f"{image_id}.jpg"
                filepath = download_folder / filename
                
                # Skip if already exists
                if filepath.exists():
                    print(f"Skipping {filename} (already exists)")
                    continue
                
                print(f"Downloading {filename}...")
                if download_image(image_url, filepath):
                    downloaded_count += 1
                    print(f"Downloaded {downloaded_count}/{DOWNLOAD_COUNT}: {filename}")
                
            page += 1
            
        except Exception as e:
            print(f"Error fetching from API: {e}")
            break
    
    print(f"Download complete! Downloaded {downloaded_count} images to {download_folder}")

if __name__ == "__main__":
    search_and_download_images()
