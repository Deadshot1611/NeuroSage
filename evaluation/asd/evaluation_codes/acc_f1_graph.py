import numpy as np
import matplotlib
import matplotlib.ticker
matplotlib.use('Agg')
import matplotlib.pyplot as plt

# Short codes for x-axis
MODELS = [
    ("EB0-FM",  "EfficientNet-B0 (FixMaps)",   90.00, 0.8966, "#6366f1"),
    ("MN-FM",   "MobileNetV3 (FixMaps)",        90.00, 0.9032, "#a5b4fc"),
    ("EB0-FP",  "EfficientNet-B0 (FixPts)",     96.67, 0.9655, "#22c55e"),
    ("MN-FP",   "MobileNetV3 (FixPts)",         86.67, 0.8571, "#86efac"),
    ("GAT",     "GAT Only",                     90.00, 0.9032, "#f59e0b"),
    ("STAT",    "Stats Only",                   90.00, 0.9091, "#fcd34d"),
    ("G+S",     "GAT + Stats",                  93.33, 0.9333, "#f97316"),
    ("TF",      "TriFusion-ASD",                96.67, 0.9655, "#a855f7"),
    ("QF",      "QuadFusion (Gaze Pipeline)",   96.67, 0.9677, "#0ea5e9"),
    ("MAF",     "Multimodal Adaptive Fusion",   96.67, 0.9677, "#10b981"),
]

codes  = [m[0] for m in MODELS]
labels = [m[1] for m in MODELS]
accs   = [m[2] for m in MODELS]
f1s    = [m[3] for m in MODELS]
colors = [m[4] for m in MODELS]
x      = np.arange(len(codes))
bar_w  = 0.62

fig, axes = plt.subplots(1, 2, figsize=(18, 7))
fig.patch.set_facecolor('white')

def make_bar_chart(ax, values, ylabel, title, fmt_pct=False):
    ax.set_facecolor('white')
    bars = ax.bar(x, values, width=bar_w, color=colors,
                  edgecolor='white', linewidth=0.8, zorder=3)

    for bar, val in zip(bars, values):
        lbl = f"{val:.2f}%" if fmt_pct else f"{val:.4f}"
        ax.text(bar.get_x() + bar.get_width()/2,
                bar.get_height() + (0.25 if fmt_pct else 0.003),
                lbl, ha='center', va='bottom',
                fontsize=9, color='#222222', fontweight='500')

    ax.set_xticks(x)
    ax.set_xticklabels(codes, fontsize=11, color='#222222', fontweight='600')
    ax.set_ylabel(ylabel, fontsize=12, color='#333333', labelpad=8)
    ax.set_title(title, fontsize=13, fontweight='bold',
                 color='#111111', pad=12)
    ax.tick_params(axis='y', colors='#555555', labelsize=10)
    ax.tick_params(axis='x', length=0, pad=6)
    for sp in ['top', 'right']: ax.spines[sp].set_visible(False)
    for sp in ['left', 'bottom']: ax.spines[sp].set_edgecolor('#dddddd')
    ax.grid(axis='y', color='#eeeeee', linewidth=0.8, zorder=0)
    ax.set_axisbelow(True)

    for div in [1.5, 3.5, 6.5]:
        ax.axvline(x=div, color='#cccccc', linewidth=0.9,
                   linestyle='--', zorder=2)

    if fmt_pct:
        ax.set_ylim(80, 103)
        ax.yaxis.set_major_formatter(
            matplotlib.ticker.FuncFormatter(lambda v, _: f"{v:.0f}%"))
    else:
        ax.set_ylim(0.82, 1.010)

def add_group_labels(ax):
    groups = [
        (0,  1,  "CNN FixMaps",           "#6366f1"),
        (2,  3,  "CNN FixPts",            "#22c55e"),
        (4,  6,  "GAT / Stats",           "#f59e0b"),
        (7,  9,  "Full Models",           "#7c3aed"),
    ]
    y_bot = ax.get_ylim()[0]
    span  = ax.get_ylim()[1] - y_bot
    y_pos = y_bot - span * 0.07
    for start, end, glabel, gcolor in groups:
        mid = (start + end) / 2.0
        ax.text(mid, y_pos, glabel,
                ha='center', va='top',
                fontsize=9, color=gcolor, fontweight='bold',
                clip_on=False)

make_bar_chart(axes[0], accs, "Accuracy (%)",
               "Accuracy Comparison — Ablation Study", fmt_pct=True)
add_group_labels(axes[0])

make_bar_chart(axes[1], f1s, "F1-Score",
               "F1-Score Comparison — Ablation Study", fmt_pct=False)
add_group_labels(axes[1])

# ── INDEX / LEGEND BOX ────────────────────────────────────────────
index_lines = [f"{code} = {label}" for code, label in zip(codes, labels)]
# Split into 2 columns of 5
col1 = "\n".join(index_lines[:5])
col2 = "\n".join(index_lines[5:])
index_text = col1 + "          " + col2   # single string — use two text boxes instead

fig.text(0.13, 0.01,
         "\n".join(index_lines[:5]),
         fontsize=8.5, color='#333333',
         va='bottom', ha='left',
         fontfamily='monospace',
         bbox=dict(boxstyle='round,pad=0.5', facecolor='#f8f8f8',
                   edgecolor='#cccccc', alpha=1.0))

fig.text(0.53, 0.01,
         "\n".join(index_lines[5:]),
         fontsize=8.5, color='#333333',
         va='bottom', ha='left',
         fontfamily='monospace',
         bbox=dict(boxstyle='round,pad=0.5', facecolor='#f8f8f8',
                   edgecolor='#cccccc', alpha=1.0))

plt.subplots_adjust(left=0.05, right=0.98, top=0.93,
                    bottom=0.22, wspace=0.22)
plt.savefig(r'C:\Users\kutus\OneDrive\Documents\autism\models\gaze\acc_F1.png', dpi=180,
            bbox_inches='tight', facecolor='white')
plt.close()
print("Done")