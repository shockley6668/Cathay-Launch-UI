import imageio
import os

video_path = "不知道算不算全网首发的用code复刻国泰航空机上娱乐系统开机界面项目_哈哈哈_因为国内外找了一圈都没.mp4"
output_dir = "frames"
os.makedirs(output_dir, exist_ok=True)

reader = imageio.get_reader(video_path, 'ffmpeg')
fps = reader.get_meta_data()['fps']
print(f"Video FPS: {fps}")

for i, frame in enumerate(reader):
    if i % int(fps) == 0:
        second = i // int(fps)
        out_path = os.path.join(output_dir, f"frame_{second:03d}.jpg")
        imageio.imwrite(out_path, frame)
        print(f"Saved {out_path}")
