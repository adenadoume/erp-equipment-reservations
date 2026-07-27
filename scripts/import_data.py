#!/usr/bin/env python3
"""One-time migration: Airtable CSV exports -> Supabase-ready CSVs + jsDelivr-hosted images.

Reads:
  source-data/MASTER CODES-Grid view copy.csv
  source-data/RESERVATIONS-Grid view.csv

Writes:
  supabase-import/products.csv
  supabase-import/projects.csv
  supabase-import/reservations.csv
  catalog-images/<KODIKOS>.<ext>   (committed to git, served via jsDelivr)
"""
import csv
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

import requests

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, "source-data")
OUT = os.path.join(BASE, "supabase-import")
IMG_DIR = os.path.join(BASE, "catalog-images")
JSDELIVR_BASE = "https://cdn.jsdelivr.net/gh/adenadoume/erp-equipment-reservations@main/catalog-images"

PHOTO_URL_RE = re.compile(r"\((https?://[^)]+)\)")

os.makedirs(OUT, exist_ok=True)
os.makedirs(IMG_DIR, exist_ok=True)


def clean_num(v):
    if v is None:
        return ""
    v = v.strip().replace(",", ".")
    if v == "":
        return ""
    try:
        f = float(v)
        return str(int(f)) if f.is_integer() else str(f)
    except ValueError:
        return ""


def extract_photo_url(field):
    if not field:
        return None
    m = PHOTO_URL_RE.search(field)
    return m.group(1) if m else None


def parse_date_dayfirst(v):
    v = (v or "").strip()
    if not v:
        return ""
    try:
        return datetime.strptime(v, "%d/%m/%Y").date().isoformat()
    except ValueError:
        return ""


def parse_created(v):
    v = (v or "").strip()
    if not v:
        return ""
    try:
        return datetime.strptime(v, "%m/%d/%Y %I:%M%p").isoformat()
    except ValueError:
        return ""


def download_one(kodikos, url):
    try:
        resp = requests.get(url, timeout=20)
        resp.raise_for_status()
        ctype = resp.headers.get("content-type", "")
        ext = ".jpg"
        if "png" in ctype:
            ext = ".png"
        elif "webp" in ctype:
            ext = ".webp"
        elif "jpeg" in ctype or "jpg" in ctype:
            ext = ".jpg"
        safe_name = re.sub(r"[^A-Za-z0-9_.-]", "_", kodikos)
        fname = f"{safe_name}{ext}"
        with open(os.path.join(IMG_DIR, fname), "wb") as f:
            f.write(resp.content)
        return kodikos, fname, None
    except Exception as e:
        return kodikos, None, str(e)


def main():
    master_path = os.path.join(SRC, "MASTER CODES-Grid view copy.csv")
    resv_path = os.path.join(SRC, "RESERVATIONS-Grid view.csv")

    with open(master_path, encoding="utf-8-sig") as f:
        products = list(csv.DictReader(f))
    with open(resv_path, encoding="utf-8-sig") as f:
        reservations = list(csv.DictReader(f))

    print(f"Loaded {len(products)} products, {len(reservations)} reservations")

    # --- download images concurrently ---
    to_download = []
    for p in products:
        url = extract_photo_url(p.get("PHOTO", ""))
        if url:
            to_download.append((p["KODIKOS"].strip(), url))

    print(f"Downloading {len(to_download)} images...")
    results = {}
    with ThreadPoolExecutor(max_workers=24) as ex:
        futures = [ex.submit(download_one, k, u) for k, u in to_download]
        done = 0
        for fut in as_completed(futures):
            kodikos, fname, err = fut.result()
            done += 1
            if fname:
                results[kodikos] = fname
            else:
                print(f"  FAILED {kodikos}: {err}", file=sys.stderr)
            if done % 100 == 0:
                print(f"  {done}/{len(to_download)}")

    print(f"Downloaded {len(results)}/{len(to_download)} images successfully")

    # --- write products.csv ---
    prod_cols = [
        "kodikos", "perigrafi", "price", "stock_softone", "promitheftis",
        "category", "kathgoria", "photo_url", "container", "q",
    ]
    with open(os.path.join(OUT, "products.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=prod_cols)
        w.writeheader()
        for p in products:
            kodikos = p["KODIKOS"].strip()
            fname = results.get(kodikos)
            photo_url = f"{JSDELIVR_BASE}/{fname}" if fname else ""
            w.writerow({
                "kodikos": kodikos,
                "perigrafi": p.get("PERIGRAFI", "").strip(),
                "price": clean_num(p.get("PRICE (LIANIKI me FPA)", "")),
                "stock_softone": clean_num(p.get("stocksoftone", "")),
                "promitheftis": p.get("PROMITHEFTIS", "").strip(),
                "category": p.get("CATEGORY", "").strip(),
                "kathgoria": p.get("KATHGORIA", "").strip(),
                "photo_url": photo_url,
                "container": p.get("CONTAINER", "").strip(),
                "q": clean_num(p.get("Q", "")) or "0",
            })

    # --- write projects.csv (distinct OIK codes) ---
    project_codes = sorted({r["OIK"].strip() for r in reservations if r["OIK"].strip()})
    with open(os.path.join(OUT, "projects.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["code", "name"])
        for c in project_codes:
            w.writerow([c, c])
    print(f"Projects: {project_codes}")

    # --- write reservations.csv ---
    resv_cols = [
        "product_code", "architect_name", "project_code", "quantity",
        "reservation_date", "description", "category", "created_at",
    ]
    with open(os.path.join(OUT, "reservations.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=resv_cols)
        w.writeheader()
        for r in reservations:
            date = parse_date_dayfirst(r.get("Date", ""))
            created = parse_created(r.get("Created", ""))
            if not date:
                date = created[:10] if created else ""
            w.writerow({
                "product_code": r["Code_"].strip(),
                "architect_name": r["Name"].strip(),
                "project_code": r["OIK"].strip(),
                "quantity": clean_num(r.get("Quantity reserved", "")) or "0",
                "reservation_date": date,
                "description": r.get("DESCRIPTION", "").strip(),
                "category": r.get("CATEGORY (from MASTER CODES)", "").strip(),
                "created_at": created,
            })

    architects = sorted({r["Name"].strip() for r in reservations if r["Name"].strip()})
    print(f"Architects found: {architects}")
    print("Done.")


if __name__ == "__main__":
    main()
