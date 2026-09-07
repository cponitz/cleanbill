"""Load TCAD's PACS "Appraisal Export" (fixed-width text files) into DuckDB, driven by a layout spec.

The layout spec is a JSON file: {"APPRAISAL_INFO": [{"name": "prop_id", "start": 1, "length": 12, "type": "int"}, ...], ...}
(1-based start positions, as printed in TCAD's layout document). `layout_from_doc.py` builds it from the layout doc once
the 8.0.33 zip is on hand; until then a spec can be hand-written from the document.

Usage:
    python -m trd.etl.load --export data/raw/2026_Certified_Appraisal_Export.zip --layout trd/etl/layouts/pacs_8_0_33.json --db data/tcad.duckdb
"""
from __future__ import annotations

import argparse
import io
import json
import zipfile
from pathlib import Path

import duckdb
import pandas as pd

TYPE_MAP = {"int": "BIGINT", "num": "DOUBLE", "date": "DATE", "bool": "BOOLEAN", "str": "VARCHAR"}


def read_fwf_spec(fobj, spec: list[dict], chunksize: int = 200_000):
    """Yield DataFrames from a fixed-width file using a [{name,start,length,type}] spec (1-based starts)."""
    colspecs = [(f["start"] - 1, f["start"] - 1 + f["length"]) for f in spec]
    names = [f["name"] for f in spec]
    for chunk in pd.read_fwf(fobj, colspecs=colspecs, names=names, dtype=str, chunksize=chunksize, encoding="latin-1", header=None):
        for f in spec:
            col = f["name"]; t = f.get("type", "str")
            s = chunk[col].str.strip()
            if t == "int": chunk[col] = pd.to_numeric(s, errors="coerce").astype("Int64")
            elif t == "num": chunk[col] = pd.to_numeric(s, errors="coerce")
            elif t == "bool": chunk[col] = s.str.upper().isin(["T", "Y", "TRUE", "1"])
            elif t == "date": chunk[col] = pd.to_datetime(s, errors="coerce", format=f.get("format", "%m/%d/%Y")).dt.date
            else: chunk[col] = s
        yield chunk


def load_export(export_zip: Path, layout: dict, db_path: Path, tables: list[str] | None = None) -> dict[str, int]:
    con = duckdb.connect(str(db_path))
    counts: dict[str, int] = {}
    with zipfile.ZipFile(export_zip) as z:
        members = {Path(n).name.upper(): n for n in z.namelist()}
        for table, spec in layout.items():
            if tables and table not in tables:
                continue
            fname = next((m for m in members if m.startswith(table.upper()) and m.endswith(".TXT")), None)
            if not fname:
                print(f"skip {table}: no file"); continue
            con.execute(f"drop table if exists {table.lower()}")
            first = True
            with z.open(members[fname]) as raw:
                text = io.TextIOWrapper(raw, encoding="latin-1", errors="replace")
                for chunk in read_fwf_spec(text, spec):
                    if first:
                        con.register("chunk_df", chunk); con.execute(f"create table {table.lower()} as select * from chunk_df"); first = False
                    else:
                        con.register("chunk_df", chunk); con.execute(f"insert into {table.lower()} select * from chunk_df")
                    con.unregister("chunk_df")
            counts[table] = con.execute(f"select count(*) from {table.lower()}").fetchone()[0]
            print(f"{table}: {counts[table]:,} rows")
    con.close()
    return counts


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--export", required=True)
    ap.add_argument("--layout", required=True)
    ap.add_argument("--db", default="data/tcad.duckdb")
    ap.add_argument("--tables", default="APPRAISAL_INFO,APPRAISAL_ENTITY_INFO")
    a = ap.parse_args()
    layout = json.loads(Path(a.layout).read_text())
    load_export(Path(a.export), layout, Path(a.db), a.tables.split(","))


if __name__ == "__main__":
    main()
