"""Telusuri semua rute React sebagai tiap peran.

Menangkap galat yang tidak terlihat oleh tes API: galat konsol, galat render
React, request gagal, dan balasan 5xx. Jalankan dengan API di :4000 dan web
di :5173 sudah hidup.

    python tes/telusur.py            # lokal
    python tes/telusur.py <url-web> <url-api>
"""
import json
import sys
import urllib.request

from playwright.sync_api import sync_playwright

WEB = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173"
API = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:4000"
SANDI = "lokalboost123"

AKUN = {
    "tamu": None,
    "umkm": "busari@warungsunda.id",
    "kreator": "sari@kreator.id",
    "admin": "admin@lokalboost.id",
}

RUTE = {
    "tamu": [
        "/", "/testimoni", "/marketplace", "/masuk", "/daftar",
        "/daftar/profil", "/daftar/verifikasi", "/lupa-sandi",
        "/dispute", "/kampanye/bakso-aci", "/kreator/profil/krtr_sari",
        "/kampanye/id-yang-tidak-ada", "/kreator/profil/tidak-ada",
        "/halaman-yang-tidak-ada",
    ],
    "umkm": [
        "/umkm", "/umkm/kampanye/baru", "/umkm/kampanye/target",
        "/umkm/kampanye/setor", "/umkm/kampanye/bakso-aci/kreator",
        "/umkm/kampanye/bakso-aci/laporan", "/umkm/dana",
        "/kampanye/bakso-aci/ulasan", "/notifikasi", "/akun",
    ],
    "kreator": [
        # /kreator/ai-script sengaja dipertahankan: fiturnya sudah dihapus, dan
        # yang diperiksa sekarang justru rutenya jatuh ke 404 dengan rapi.
        "/kreator", "/kreator/ai-script", "/kreator/upload",
        "/kreator/portofolio", "/kreator/dompet", "/notifikasi", "/akun",
    ],
    "admin": ["/admin", "/notifikasi", "/akun"],
}

# Frasa yang menandakan halaman rusak bila muncul di teks yang dilihat pengguna.
FRASA_BURUK = [
    "Cannot read", "undefined is not", "is not a function",
    "[object Object]", "NaN", "Uncaught",
]


def token(email):
    if not email:
        return None
    body = json.dumps({"identitas": email, "kataSandi": SANDI}).encode()
    req = urllib.request.Request(
        f"{API}/api/auth/masuk", data=body,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        d = json.loads(r.read().decode())
    return d.get("token") or (d.get("data") or {}).get("token")


temuan = []
with sync_playwright() as pw:
    browser = pw.chromium.launch()
    for peran, email in AKUN.items():
        tok = token(email)
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        page = ctx.new_page()

        galat, gagal, lima_xx = [], [], []
        page.on("console", lambda m: galat.append(m.text[:200]) if m.type == "error" else None)
        page.on("pageerror", lambda e: galat.append(f"PAGEERROR {e}"[:200]))
        page.on("requestfailed", lambda r: gagal.append(f"{r.method} {r.url}"[:160]))
        page.on("response", lambda r: lima_xx.append(f"{r.status} {r.url}"[:160]) if r.status >= 500 else None)

        page.goto(WEB, wait_until="domcontentloaded", timeout=60000)
        if tok:
            page.evaluate("t => localStorage.setItem('lokalboost:token', t)", tok)

        for rute in RUTE[peran]:
            galat.clear(); gagal.clear(); lima_xx.clear()
            try:
                page.goto(WEB + rute, wait_until="networkidle", timeout=40000)
                page.wait_for_timeout(1200)
                teks = page.inner_text("body")
            except Exception as e:
                print(f"[{peran:7}] {rute:32} GAGAL-BUKA {repr(e)[:120]}", flush=True)
                temuan.append((peran, rute, "GAGAL BUKA", repr(e)[:200]))
                continue

            tanda = []
            for frasa in FRASA_BURUK:
                if frasa in teks:
                    tanda.append(f"teks:{frasa}")
            if galat:
                tanda.append(f"konsol:{galat[:2]}")
            if gagal:
                tanda.append(f"request-gagal:{gagal[:2]}")
            if lima_xx:
                tanda.append(f"5xx:{lima_xx[:2]}")

            print(f"[{peran:7}] {rute:32} {'BERSIH' if not tanda else 'MASALAH'} "
                  f"{'; '.join(tanda)[:200]}", flush=True)
            if tanda:
                temuan.append((peran, rute, "MASALAH", "; ".join(tanda)[:500]))
        ctx.close()
    browser.close()

print("\n===== RINGKASAN =====")
if not temuan:
    print("Tidak ada masalah ditemukan di semua rute.")
for t in temuan:
    print(f"- [{t[0]}] {t[1]} -> {t[2]}: {t[3]}")
