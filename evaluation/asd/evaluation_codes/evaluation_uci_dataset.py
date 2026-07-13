"""
Debug: threshold >= 7 consistency check for Combined dataset ages 5-12
"""
import pandas as pd
import numpy as np
from pathlib import Path

df = pd.read_csv(r'C:\Users\kutus\OneDrive\Documents\autism\data\raw\Autism_Screening_Data_Combined.csv')
q  = [f'A{i}' for i in range(1, 11)]

# Filter ages 5-12
df_filtered = df[df['Age'].between(5, 12)].copy()
df_filtered['score'] = df_filtered[q].sum(axis=1)
df_filtered['true']  = (df_filtered['Class'].str.strip().str.upper() == 'YES').astype(int)
df_filtered['pred']  = (df_filtered['score'] >= 7).astype(int)

print(f"Total after age filter: {len(df_filtered)}")
print(f"ASD: {df_filtered['true'].sum()} | TD: {(df_filtered['true']==0).sum()}")

print(f"\nScore distribution:")
for s in range(11):
    td  = int(((df_filtered['score']==s) & (df_filtered['true']==0)).sum())
    asd = int(((df_filtered['score']==s) & (df_filtered['true']==1)).sum())
    print(f"  score {s:2d}: TD={td:3d}  ASD={asd:3d}")

# False negatives — ASD but score < 7
fn = df_filtered[(df_filtered['true']==1) & (df_filtered['pred']==0)]
print(f"\nFalse negatives (ASD but score < 7): {len(fn)}")
if len(fn) > 0:
    print(fn[q + ['score', 'Class', 'Age']].to_string())

# False positives — TD but score >= 7
fp = df_filtered[(df_filtered['true']==0) & (df_filtered['pred']==1)]
print(f"\nFalse positives (TD but score >= 7): {len(fp)}")
if len(fp) > 0:
    print(fp[q + ['score', 'Class', 'Age']].to_string())

# Check consistency
matches = (df_filtered['pred'] == df_filtered['true']).sum()
print(f"\nAccuracy at threshold >= 7: {matches}/{len(df_filtered)} = {matches/len(df_filtered)*100:.1f}%")