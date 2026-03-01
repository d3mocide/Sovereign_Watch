import urllib.request
import os

def download_cables():
    base_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'public', 'data')
    os.makedirs(base_dir, exist_ok=True)

    urls = {
        'cable-geo.json': 'https://www.submarinecablemap.com/api/v3/cable/cable-geo.json',
        'landing-point-geo.json': 'https://www.submarinecablemap.com/api/v3/landing-point/landing-point-geo.json'
    }

    for filename, url in urls.items():
        filepath = os.path.join(base_dir, filename)
        print(f"Downloading {filename}...")
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req) as response:
                content = response.read()
                with open(filepath, 'wb') as f:
                    f.write(content)
            print(f"Successfully downloaded {filename}")
        except Exception as e:
            print(f"Failed to download {filename}: {e}")

if __name__ == "__main__":
    download_cables()
