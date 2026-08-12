#!/usr/bin/env python3
# 生成数独 PWA 图标：icon-192.png / icon-512.png（圆角透明）/ maskable-512.png（满铺）
# 仅使用标准库（zlib/struct），无第三方依赖。
import zlib
import struct
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')


def write_png(path, w, h, pixels):
    raw = bytearray()
    for row in pixels:
        raw.append(0)
        for (r, g, b, a) in row:
            raw += bytes((r, g, b, a))
    comp = zlib.compress(bytes(raw), 9)

    def chunk(typ, data):
        return (
            struct.pack('>I', len(data))
            + typ
            + data
            + struct.pack('>I', zlib.crc32(typ + data) & 0xFFFFFFFF)
        )

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', comp)
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


def lerp(a, b, t):
    return int(a + (b - a) * t)


def make_icon(S, rounded):
    px = [[(0, 0, 0, 0) for _ in range(S)] for _ in range(S)]
    top = (79, 70, 229)
    bot = (168, 85, 247)
    radius = int(S * 0.22) if rounded else 0
    for y in range(S):
        for x in range(S):
            if radius > 0:
                cx = min(x, S - 1 - x)
                cy = min(y, S - 1 - y)
                if cx < radius and cy < radius:
                    if (radius - cx) ** 2 + (radius - cy) ** 2 > radius * radius:
                        continue
            t = y / (S - 1)
            px[y][x] = (lerp(top[0], bot[0], t), lerp(top[1], bot[1], t), lerp(top[2], bot[2], t), 255)

    white = (255, 255, 255, 255)

    def rect(x0, y0, x1, y1):
        for yy in range(int(y0), int(y1)):
            for xx in range(int(x0), int(x1)):
                if 0 <= xx < S and 0 <= yy < S:
                    px[yy][xx] = white

    margin = S * 0.23
    gw = S - 2 * margin
    cell = gw / 3.0
    line = max(2, int(S * 0.04))
    ox0, oy0, ox1, oy1 = margin, margin, S - margin, S - margin
    # 外框
    rect(ox0, oy0, ox1, oy0 + line)
    rect(ox0, oy1 - line, ox1, oy1)
    rect(ox0, oy0, ox0 + line, oy1)
    rect(ox1 - line, oy0, ox1, oy1)
    # 内部分隔
    for k in (1, 2):
        d = margin + cell * k
        rect(d - line / 2, oy0, d + line / 2, oy1)
        rect(ox0, d - line / 2, ox1, d + line / 2)
    return px


def main():
    os.makedirs(OUT, exist_ok=True)
    write_png(os.path.join(OUT, 'icon-192.png'), 192, 192, make_icon(192, True))
    write_png(os.path.join(OUT, 'icon-512.png'), 512, 512, make_icon(512, True))
    write_png(os.path.join(OUT, 'maskable-512.png'), 512, 512, make_icon(512, False))
    print('图标已生成:', os.listdir(OUT))


if __name__ == '__main__':
    main()
