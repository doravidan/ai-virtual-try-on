import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
import re

def is_image_url(url):
    image_extensions = ('.jpg', '.jpeg', '.png', '.webp', '.gif')
    return url.lower().endswith(image_extensions) or 'image' in url.lower()

def clean_image_url(url):
    """
    Attempts to get the highest resolution version of an image URL.
    Commonly strips thumbnail/size suffixes.
    """
    if not url:
        return url
    
    # 1. Amazon high-res pattern: remove the ._AC_... part
    # Example: https://m.media-amazon.com/images/I/71xxxxxxx._AC_SX679_.jpg -> .../I/71xxxxxxx.jpg
    amazon_regex = r"\._AC_[A-Z0-9_,]*\."
    url = re.sub(amazon_regex, ".", url)

    # 2. General CDN size parameters
    parsed = urlparse(url)
    if 'amazon' in url.lower() or 'media-amazon' in url.lower():
        # Keep clean for amazon
        pass
    else:
        # For others, try removing common size query params
        params_to_remove = ['width', 'height', 'size', 'resize', 'scale', 'im']
        from urllib.parse import parse_qs, urlencode, urlunparse
        query = parse_qs(parsed.query)
        modified = False
        for p in params_to_remove:
            if p in query:
                del query[p]
                modified = True
        
        # Next specific 'im' removal if it's not a query param but looks like it
        # e.g. ?im=Resize,width=480
        if 'im' in query:
            del query['im']
            modified = True
            
        if modified:
            url = urlunparse(parsed._replace(query=urlencode(query, doseq=True)))

    # 3. Shopify/Common suffix patterns
    # Removes _small, _thumb, _100x100 before the extension
    suffix_regex = r"(_small|_thumb|_\d+x\d+)(\.(jpg|jpeg|png|webp|gif))"
    url = re.sub(suffix_regex, r"\2", url)

    return url

def extract_images_from_url(url):
    """
    Extracts clothing image(s) from a given URL.
    If it's a direct image URL, returns it in a list.
    If it's a shop URL, attempts to find the main product image.
    """
    if is_image_url(url):
        return [clean_image_url(url)]

    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')

        images = []
        
        # 1. Specialized Amazon Logic (Dynamic Images)
        if 'amazon' in url.lower():
            # ... existing amazon logic ...
            img = soup.find('img', {'id': 'landingImage'}) or soup.find('img', {'id': 'main-image'})
            if img:
                dynamic_data = img.get('data-a-dynamic-image')
                if dynamic_data:
                    import json
                    try:
                        # Format is {"url": [w,h], "url2": [w,h]}
                        data = json.loads(dynamic_data)
                        # Sort by width*height descending
                        sorted_urls = sorted(data.items(), key=lambda x: x[1][0] * x[1][1], reverse=True)
                        if sorted_urls:
                            images.append(sorted_urls[0][0])
                    except:
                        pass
                
                if not images and img.get('data-old-hires'):
                    images.append(img.get('data-old-hires'))
                if not images and img.get('src'):
                    images.append(img.get('src'))

        # 2. Specialized Next.co.il Logic
        if 'next.co.il' in url.lower() or 'next.co.uk' in url.lower():
            # Look for picture sources or high-res looking URLs
            for source in soup.find_all(['source', 'img']):
                srcset = source.get('srcset')
                if srcset:
                    # srcset often looks like "url1 1x, url2 2x" or "url1 480w, url2 640w"
                    parts = srcset.split(',')
                    for part in parts:
                        img_url = part.strip().split(' ')[0]
                        if 'itemimages' in img_url.lower():
                            images.append(img_url)
                
                src = source.get('src')
                if src and 'itemimages' in src.lower():
                    images.append(src)

        # 3. OpenGraph / Twitter Meta Tags (Often high res)
        for tag in ['og:image', 'twitter:image']:
            meta = soup.find('meta', property=tag) or soup.find('meta', attrs={'name': tag})
            if meta and meta.get('content'):
                images.append(meta.get('content'))

        # 3. Main Product Image Heuristics
        if not images:
            # Look for images with 'product' or 'main' in ID/Class/Src
            potential_imgs = soup.find_all('img', src=True)
            for img in potential_imgs:
                src = img.get('src')
                img_id = str(img.get('id', '')).lower()
                img_class = str(img.get('class', [])).lower()
                
                if 'product' in src.lower() or 'main' in src.lower() or 'product' in img_id or 'product' in img_class:
                    images.append(urljoin(url, src))
                    if len(images) > 2: break

        # 4. Fallback to any large images
        if not images:
            all_imgs = soup.find_all('img', src=True)
            for img in all_imgs:
                src = img.get('src')
                images.append(urljoin(url, src))
                if len(images) > 5: break

        # Cleanup, Deduplicate, and Upgrade to High Res
        unique_images = []
        for img_url in images:
            cleaned = clean_image_url(img_url)
            if cleaned not in unique_images:
                unique_images.append(cleaned)
        
        return unique_images

    except Exception as e:
        print(f"Error extracting images: {e}")
        return []

if __name__ == "__main__":
    # Test
    urls = [
        "https://www.amazon.com/Amazon-Essentials-Sleeve-V-Neck-T-Shirt/dp/B07F2KW7T5",
        "https://www.next.co.il/en/style/su819458/h85970"
    ]
    for test_url in urls:
        print(f"\nTesting: {test_url}")
        print(extract_images_from_url(test_url))

