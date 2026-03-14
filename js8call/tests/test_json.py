import json
import re
import urllib.request

def test():
    raw = urllib.request.urlopen("http://rx.linkfanel.net/kiwisdr_com.js").read().decode("utf-8")
    text = raw.strip()
    text = re.sub(r'(?m)^\s*//.*$', '', text).strip()
    text = re.sub(r'^var\s+\w+\s*=\s*', '', text).rstrip(';').strip()
    text = re.sub(r'("bands"\s*:\s*"[^"]+"\s*),.*$', r'\1,', text, flags=re.MULTILINE)
    text = re.sub(r',\s*([}\]])', r'\1', text)
    
    lines = text.split("\n")
    try:
        json.loads(text)
        print("Success!")
    except json.JSONDecodeError as exc:
        print("Error at line:", exc.lineno)
        start = max(0, exc.lineno - 5)
        end = min(len(lines), exc.lineno + 5)
        for i in range(start, end):
            prefix = ">> " if i + 1 == exc.lineno else "   "
            print(f"{prefix}{i+1}: {lines[i]}")

if __name__ == "__main__":
    test()
