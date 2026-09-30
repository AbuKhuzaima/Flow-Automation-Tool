import zlib
import struct
import os

def make_png(width, height, rgba_data):
    # PNG signature
    png = b'\x89PNG\r\n\x1a\n'
    
    # IHDR chunk
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data)
    png += struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc)
    
    # IDAT chunk
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0) # filter byte 0 (None)
        start = y * width * 4
        raw_data.extend(rgba_data[start:start + width * 4])
        
    compressed = zlib.compress(bytes(raw_data), 9)
    idat_crc = zlib.crc32(b'IDAT' + compressed)
    png += struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', idat_crc)
    
    # IEND chunk
    iend_crc = zlib.crc32(b'IEND')
    png += struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc)
    return png

def create_icon(size):
    rgba = bytearray(size * size * 4)
    cx, cy = size / 2.0, size / 2.0
    r = size * 0.46
    
    for y in range(size):
        for x in range(size):
            idx = (y * size + x) * 4
            # Normalized coordinates
            dx = x - cx
            dy = y - cy
            dist = (dx * dx + dy * dy) ** 0.5
            
            # Rounded rect / circle base
            # Corner radius
            rx = abs(x - cx) - (cx - r * 0.4)
            ry = abs(y - cy) - (cy - r * 0.4)
            corner_dist = max(rx, 0)**2 + max(ry, 0)**2
            
            # Linear gradient from Indigo (99, 102, 241) to Purple (168, 85, 247)
            t = (x + y) / (2.0 * size)
            red = int(99 + (168 - 99) * t)
            green = int(102 + (85 - 102) * t)
            blue = int(241 + (247 - 241) * t)
            alpha = 255
            
            # Border / Antialiasing for rounded squircle
            if dist > r * 1.05:
                alpha = 0
            elif dist > r:
                alpha = int(255 * (1.0 - (dist - r) / (r * 0.05)))
                
            # White right-pointing arrow / triangle glyph inside
            # Triangle points: (0.35 * size, 0.28 * size), (0.35 * size, 0.72 * size), (0.75 * size, 0.5 * size)
            nx = x / float(size)
            ny = y / float(size)
            
            in_triangle = False
            if 0.34 <= nx <= 0.72:
                # Top edge equation: from (0.34, 0.28) to (0.72, 0.5)
                # Bottom edge equation: from (0.34, 0.72) to (0.72, 0.5)
                slope_top = (0.50 - 0.28) / (0.72 - 0.34)
                slope_bot = (0.50 - 0.72) / (0.72 - 0.34)
                
                y_top = 0.28 + slope_top * (nx - 0.34)
                y_bot = 0.72 + slope_bot * (nx - 0.34)
                
                if y_top <= ny <= y_bot:
                    in_triangle = True
                    
            if in_triangle and alpha > 0:
                red, green, blue = 255, 255, 255
                alpha = 255
                
            rgba[idx] = red
            rgba[idx + 1] = green
            rgba[idx + 2] = blue
            rgba[idx + 3] = alpha
            
    return make_png(size, size, rgba)

out_dir = os.path.join(os.path.dirname(__file__), 'src', 'icons')
os.makedirs(out_dir, exist_ok=True)

for s in [16, 32, 48, 128]:
    png_bytes = create_icon(s)
    path = os.path.join(out_dir, f'icon{s}.png')
    with open(path, 'wb') as f:
        f.write(png_bytes)
    print(f'Generated {path} ({len(png_bytes)} bytes)')
