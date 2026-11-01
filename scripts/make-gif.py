"""Convert replay frames to a shared-palette GIF. Requires Pillow."""
import json
import sys
from pathlib import Path
from PIL import Image

folder = Path(sys.argv[1])
destination = Path(sys.argv[2])
files = sorted(folder.glob("*.png"))
timing = json.loads((folder / "timing.json").read_text())
samples = files[::max(1, len(files) // 16)]
montage = Image.new("RGB", (240 * len(samples), 164))
for index, path in enumerate(samples):
    with Image.open(path) as image:
        image = image.convert("RGB")
        image.thumbnail((240, 164))
        montage.paste(image, (240 * index, 0))
palette = montage.quantize(colors=96)
frames = []
durations = []
for index, path in enumerate(files):
    with Image.open(path) as image:
        frames.append(image.convert("RGB").quantize(palette=palette, dither=Image.Dither.NONE))
    duration = (round((index + 1) * timing["frameDurationMs"] / 10)
                - round(index * timing["frameDurationMs"] / 10)) * 10
    durations.append(duration)
destination.parent.mkdir(parents=True, exist_ok=True)
frames[0].save(destination, save_all=True, append_images=frames[1:], duration=durations,
               loop=0, optimize=True, disposal=1)
print(f"{len(frames)} frames; {destination.stat().st_size / 1024 / 1024:.2f} MiB: {destination}")
