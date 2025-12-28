import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
import re

def is_image_url(url):
    image_extensions = ('.jpg', '.jpeg', '.png', '.webp', '.gif')
    return url.lower().endswith(image_extensions) or 'image' in url.lower()

def extract_images_from_url(url):
    """
    Extracts clothing image(s) from a given URL.
    If it's a direct image URL, returns it in a list.
    If it's a shop URL, attempts to find the main product image.
    """
    if is_image_url(url):
        return [url]

    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')

        images = []
        
        # Try to find common product image containers/classes
        # Amazon specific
        if 'amazon' in url.lower():
            # Amazon often uses 'landingImage' or 'main-image'
            img = soup.find('img', {'id': 'landingImage'}) or soup.find('img', {'id': 'main-image'})
            if img and img.get('src'):
                images.append(img.get('src'))
        
        # Generic og:image
        og_image = soup.find('meta', property='og:image')
        if og_image and og_image.get('content'):
            images.append(og_image.get('content'))

        # If still nothing, look for large images
        if not images:
            all_imgs = soup.find_all('img')
            for img in all_imgs:
                src = img.get('src') or img.get('data-src') or img.get('data-old-hires')
                if src:
                    full_url = urljoin(url, src)
                    # Simple heuristic: product images are usually larger or have 'product' in the name
                    if 'product' in full_url.lower() or 'item' in full_url.lower():
                        images.append(full_url)
                        if len(images) > 3: break # Limit to first few likely candidates

        # Cleanup and deduplicate
        unique_images = []
        for img in images:
            if img not in unique_images:
                unique_images.append(img)
        
        return unique_images

    except Exception as e:
        print(f"Error extracting images: {e}")
        return []

if __name__ == "__main__":
    # Test
    test_url = "https://www.amazon.com/Amazon-Essentials-Sleeve-V-Neck-T-Shirt/dp/B07F2KW7T5"
    print(extract_images_from_url(test_url))

