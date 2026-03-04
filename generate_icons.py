#!/usr/bin/env python3
"""
妙搭数据导出助手 - 图标生成脚本
使用 Pillow 库生成插件所需的 PNG 图标
"""

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("请先安装 Pillow: pip install Pillow")
    exit(1)

import os


def create_icon(size):
    """创建指定尺寸的图标"""
    # 创建带透明背景的图片
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 定义渐变色（从紫色到蓝色）
    # 简化处理：使用中间色
    gradient_color = (102, 126, 234)  # #667eea
    
    # 计算圆角矩形参数
    radius = size // 6
    padding = 0
    
    # 绘制圆角矩形背景
    draw.rounded_rectangle(
        [padding, padding, size - padding, size - padding],
        radius=radius,
        fill=gradient_color
    )
    
    # 绘制表格线条
    line_color = (255, 255, 255, 230)
    secondary_color = (255, 255, 255, 180)
    
    margin = size // 5
    content_width = size - 2 * margin
    line_height = size // 12
    line_spacing = size // 10
    
    # 顶部粗线（表头）
    draw.rounded_rectangle(
        [margin, margin, size - margin, margin + line_height],
        radius=line_height // 4,
        fill=line_color
    )
    
    # 数据行
    num_lines = 4
    for i in range(num_lines):
        y = margin + line_spacing * (i + 1.5)
        draw.rounded_rectangle(
            [margin, int(y), size - margin, int(y + line_height * 0.8)],
            radius=int(line_height * 0.2),
            fill=secondary_color
        )
    
    # 绘制下载箭头（右下角小图标）
    arrow_size = size // 4
    arrow_x = size - margin - arrow_size
    arrow_y = size - margin - arrow_size
    
    # 箭头竖线
    draw.rectangle(
        [arrow_x + arrow_size // 3, arrow_y, 
         arrow_x + arrow_size * 2 // 3, arrow_y + arrow_size * 2 // 3],
        fill=(255, 255, 255, 200)
    )
    
    # 箭头三角形
    arrow_points = [
        (arrow_x, arrow_y + arrow_size * 2 // 3),
        (arrow_x + arrow_size, arrow_y + arrow_size * 2 // 3),
        (arrow_x + arrow_size // 2, arrow_y + arrow_size)
    ]
    draw.polygon(arrow_points, fill=(255, 255, 255, 200))
    
    return img


def main():
    """生成所有尺寸的图标"""
    sizes = [16, 48, 128]
    output_dir = "icons"
    
    # 确保输出目录存在
    os.makedirs(output_dir, exist_ok=True)
    
    print("开始生成图标...")
    
    for size in sizes:
        img = create_icon(size)
        output_path = os.path.join(output_dir, f"icon{size}.png")
        img.save(output_path, "PNG")
        print(f"✓ 已生成: {output_path} ({size}x{size})")
    
    print("\n图标生成完成！")
    print(f"文件保存在: {os.path.abspath(output_dir)}/")


if __name__ == "__main__":
    main()
