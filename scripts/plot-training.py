"""Render recorded, unsmoothed training curves with Matplotlib."""
import argparse
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter, MaxNLocator


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", nargs="?", default="docs/examples/comparison-500k.json")
    parser.add_argument("--output", default="docs/assets/training-comparison")
    args = parser.parse_args()
    data = json.loads(Path(args.input).read_text())
    plt.rcParams.update({
        "font.family": "DejaVu Sans", "font.size": 14,
        "axes.labelcolor": "#183346", "text.color": "#183346",
        "xtick.color": "#526b7d", "ytick.color": "#526b7d",
        "axes.edgecolor": "#b9cad7", "axes.spines.top": False, "axes.spines.right": False,
        "svg.fonttype": "none",
    })
    fig, ax = plt.subplots(figsize=(12, 6.8), facecolor="#f5f9fc")
    ax.set_facecolor("#f5f9fc")
    for method, label, color, style in [
        ("evolution", "Evolution", "#0088a8", "-"),
        ("dqn", "DQN · gradients", "#ed7924", "--"),
    ]:
        points = data["curves"].get(method, [])
        if not points:
            continue
        ax.plot([p["steps"] for p in points], [p["meanFood"] for p in points],
                color=color, linewidth=2.8, linestyle=style, label=label)
        ax.scatter([points[-1]["steps"]], [points[-1]["meanFood"]], color=color,
                   s=40, marker="o" if method == "evolution" else "s", zorder=3)
    ax.set_xlabel("Training moves", labelpad=12)
    ax.set_ylabel("Mean food per validation game", labelpad=12)
    ax.xaxis.set_major_formatter(FuncFormatter(lambda value, _: f"{value / 1000:g}k" if value else "0"))
    ax.xaxis.set_major_locator(MaxNLocator(6))
    ax.yaxis.set_major_locator(MaxNLocator(6, integer=True))
    ax.set_ylim(bottom=0)
    ax.margins(x=.015, y=.14)
    ax.grid(axis="y", color="#d5e2eb", linewidth=.8)
    ax.set_axisbelow(True)
    ax.legend(loc="upper center", bbox_to_anchor=(.5, 1.2), ncol=2, frameon=False)
    fig.suptitle("Evolution vs. DQN", fontsize=23, fontweight="medium", x=.105, ha="left", y=.985)
    fig.text(.105, .915, f"9 → 16 → 3 network · random initialization · seed {data['seed']}", fontsize=14)
    fig.text(.105, .025,
             f"Mean over {len(data['evaluationSeeds'])} fixed validation maps · greedy policies · no curve smoothing",
             fontsize=13, color="#526b7d")
    fig.subplots_adjust(left=.105, right=.975, top=.80, bottom=.15)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    for extension in (".png", ".svg"):
        destination = output.with_suffix(extension)
        fig.savefig(destination, dpi=180, facecolor=fig.get_facecolor())
        print(destination.resolve())
    plt.close(fig)


if __name__ == "__main__":
    main()
