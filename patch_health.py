import re

with open('frontend/src/components/widgets/SystemHealthWidget.tsx', 'r') as f:
    content = f.read()

content = content.replace(
    'title="Open Performance Dashboard"\n              >',
    'title="Open Performance Dashboard"\n                aria-label="Open Performance Dashboard"\n              >'
)

content = content.replace(
    '            <button\n\n              onClick={(e) => {',
    '            <button\n              aria-label="Close System Health"\n              onClick={(e) => {'
)


with open('frontend/src/components/widgets/SystemHealthWidget.tsx', 'w') as f:
    f.write(content)
