from PIL import Image, ImageDraw, ImageFont

OUT = "output/pdf/社区活动堂食优惠券_满200减50.pdf"
DPI = 300
PAGE = (2480, 3508)  # A4 at 300 dpi
FONT_PATH = "/System/Library/Fonts/Hiragino Sans GB.ttc"

def font(size):
    return ImageFont.truetype(FONT_PATH, size, index=0)

def centered(draw, text, center_x, y, typeface, fill=(0, 0, 0)):
    box = draw.textbbox((0, 0), text, font=typeface)
    draw.text((center_x - (box[2] - box[0]) / 2, y), text, font=typeface, fill=fill)

img = Image.new("RGB", PAGE, "white")
draw = ImageDraw.Draw(img)

margin_x, margin_y, gap_x, gap_y = 142, 142, 59, 47
cols, rows = 2, 4
card_w = (PAGE[0] - 2*margin_x - gap_x) // cols
card_h = (PAGE[1] - 2*margin_y - (rows-1)*gap_y) // rows

small = font(38)
mid = font(48)
amount = font(112)
fine = font(31)

for index in range(8):
    col, row = index % cols, index // cols
    x = margin_x + col*(card_w + gap_x)
    y = margin_y + row*(card_h + gap_y)
    right, bottom = x + card_w, y + card_h
    cx = x + card_w // 2

    draw.rounded_rectangle((x, y, right, bottom), radius=28, outline=(80, 80, 80), width=3)
    divider_y = bottom - 170
    for dx in range(x + 70, right - 70, 18):
        draw.line((dx, divider_y, min(dx + 8, right - 70), divider_y), fill=(180, 180, 180), width=2)

    centered(draw, "社区活动 · 新客堂食券", cx, y + 52, small, (65, 65, 65))
    centered(draw, "满200元减50元", cx, y + 132, amount)
    centered(draw, "每周一、周三、周四可用", cx, y + 284, mid)
    centered(draw, "仅限堂食，新客专享", cx, y + 354, mid)

    draw.text((x + 58, bottom - 125), "不与牛魔王会员及其他优惠同享", font=fine, fill=(65, 65, 65))
    serial = f"券号 {index+1:02d}"
    sw = draw.textbbox((0, 0), serial, font=fine)[2]
    draw.text((right - 58 - sw, bottom - 125), serial, font=fine, fill=(65, 65, 65))
    draw.text((x + 58, bottom - 67), "门店：______________    有效期：______________", font=fine, fill=(0, 0, 0))

img.save(OUT, "PDF", resolution=DPI)
print(OUT)
