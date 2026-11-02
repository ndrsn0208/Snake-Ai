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
    parser.add_argument("input", nargs="?", default="docs/examples/comparison-300-generations.json")
    parser.add_argument("--output", default="docs/assets/training-comparison-long")
    args = parser.parse_args()
    data = json.loads(Path(args.input).read_text())
    plt.rcParams.update({
        "font.family": "DejaVu Sans", "font.size": 14,
        "axes.labelcolor": "#183346", "text.color": "#183346",
        "xtick.color": "#526b7d", "ytick.color": "#526b7d",
        "axes.edgecolor": "#b9cad7", "axes.spines.top": False, "axes.spines.right": False,
        "svg.fonttype": "none",
    })
    separate = data.get("budgetMode") == "per-method"
    fig, axes = plt.subplots(1, 2 if separate else 1, figsize=(13, 6.8),
                             facecolor="#f5f9fc", sharey=True, squeeze=False)
    for index, (method, label, color, style) in enumerate([
        ("evolution", "Evolution", "#0088a8", "-"),
        ("dqn", "DQN · gradients", "#ed7924", "--"),
    ]):
        ax = axes[0, index if separate else 0]
        ax.set_facecolor("#f5f9fc")
        points = data["curves"].get(method, [])
        if not points:
            continue
        generation_axis = separate and method == "evolution"
        key = "generation" if generation_axis else "steps"
        ax.plot([p[key] for p in points], [p["meanFood"] for p in points],
                color=color, linewidth=2.8, linestyle=style, label=label)
        ax.scatter([points[-1][key]], [points[-1]["meanFood"]], color=color,
                   s=40, marker="o" if method == "evolution" else "s", zorder=3)
        ax.set_xlabel("Generation" if generation_axis else "Training moves", labelpad=12)
        if not generation_axis:
            ax.xaxis.set_major_formatter(FuncFormatter(lambda value, _: f"{value / 1000:g}k" if value else "0"))
        if separate:
            ax.set_xticks([points[-1][key] * i / 5 for i in range(6)])
        else:
            ax.xaxis.set_major_locator(MaxNLocator(6, integer=True))
        ax.yaxis.set_major_locator(MaxNLocator(6, integer=True))
        ax.set_ylim(bottom=0)
        ax.margins(x=.015, y=.14)
        ax.grid(axis="y", color="#d5e2eb", linewidth=.8)
        ax.set_axisbelow(True)
        ax.legend(loc="upper center", bbox_to_anchor=(.5, 1.2), ncol=2, frameon=False)
        if separate:
            total = data["runs"][method]["steps"]
            ax.text(.5, 1.02, f"{total:,} total training moves", transform=ax.transAxes,
                    ha="center", fontsize=13, color="#526b7d")
    axes[0, 0].set_ylabel("Mean food per validation game", labelpad=12)
    fig.suptitle("Evolution and DQN · extended training" if separate else "Evolution vs. DQN",
                 fontsize=23, fontweight="medium", x=.09, ha="left", y=.985)
    fig.text(.09, .915, f"9 → 16 → 3 network · random initialization · seed {data['seed']}", fontsize=14)
    fig.text(.105, .025,
             f"{len(data['evaluationSeeds'])} shared validation maps · unsmoothed scores" +
             (" · different training budgets and horizontal axes" if separate else " · same move budget"),
             fontsize=13, color="#526b7d")
    fig.subplots_adjust(left=.09, right=.975, top=.77, bottom=.15, wspace=.15)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    for extension in (".png", ".svg"):
        destination = output.with_suffix(extension)
        fig.savefig(destination, dpi=180, facecolor=fig.get_facecolor())
        if extension == ".svg":
            destination.write_text("\n".join(line.rstrip() for line in destination.read_text().splitlines()) + "\n")
        print(destination.resolve())
    plt.close(fig)


if __name__ == "__main__":
    main()
