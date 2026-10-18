# LokalBoost — Prototype Web

Prototype interaktif platform **LokalBoost**: marketplace yang mempertemukan UMKM lokal
dengan kreator konten pemula dengan model **Pay-Per-View** + **Rekber (Escrow)** dan fitur AI.
Mengacu pada PRD di `../ISI dan Fungsi/LokalBoost (1).pdf`.

## Teknologi
- **React 18** + **Vite 5**
- **Tailwind CSS 3** (design token di `tailwind.config.js`)
- **React Router 6** (navigasi antar halaman / prototype flow)
- **Framer Motion** (`motion` v12) — transisi halaman & micro-interaction
- Font **Poppins**, ikon inline SVG (tanpa dependensi eksternal)

## Cara Menjalankan
```bash
cd lokalboost-web
npm install      # sekali saja
npm run dev      # buka http://localhost:5173
```
Build produksi: `npm run build` → hasil di `dist/` (siap deploy ke Vercel/Netlify).

## Halaman & Rute (21)

### Publik
| Rute | Halaman |
|------|---------|
| `/` | Landing Page |
| `/marketplace` | Marketplace Kolaborasi (tab Kreator / Kampanye) |
| `/testimoni` | Testimoni |

### Onboarding
| Rute | Halaman |
|------|---------|
| `/masuk` | Masuk (email/HP + OTP) |
| `/daftar` | Pilih Peran (langkah 1) |
| `/daftar/profil` | Lengkapi Profil (langkah 2, role-aware) |

### UMKM
| Rute | Halaman |
|------|---------|
| `/umkm` | Dashboard UMKM |
| `/umkm/kampanye/baru` | Buat Kampanye (langkah 1) |
| `/umkm/kampanye/target` | Target & Anggaran (langkah 2) |
| `/umkm/kampanye/setor` | Setor Dana / Finalisasi (langkah 3) |
| `/umkm/kampanye/:id/kreator` | Pilih & Setujui Kreator (AI Matchmaker + pelamar) |
| `/umkm/kampanye/:id/laporan` | Dasbor Laporan Hasil + AI Auto-Report Summary |

### Kreator
| Rute | Halaman |
|------|---------|
| `/kreator` | Dashboard Kreator |
| `/kreator/ai-script` | Asisten Naskah AI |
| `/kreator/upload` | Unggah Video & Status Proses AI |
| `/kreator/dompet` | Dompet & Penarikan Dana |
| `/kreator/profil/:id` | Profil Publik Kreator |

### Lintas Peran
| Rute | Halaman |
|------|---------|
| `/kampanye/:id` | Detail Kampanye (ajukan diri / undang & setujui) |
| `/kampanye/:id/ulasan` | Penilaian & Ulasan dua arah |
| `/notifikasi` | Notifikasi |
| `/dispute` | Pusat Sengketa |

Beberapa halaman menyesuaikan tampilan lewat query `?peran=umkm` atau `?peran=kreator`
(mis. `/kampanye/bakso-aci?peran=umkm` menampilkan mode UMKM).

## Alur Prototype (semua klik nyambung)
- **UMKM:** Landing → Daftar → Lengkapi Profil → Dashboard → Buat Kampanye (1→2→3)
  → Pilih & Setujui Kreator → Detail Kampanye → Laporan Hasil → Beri Ulasan
- **Kreator:** Landing → Daftar → Lengkapi Profil → Dashboard → Marketplace
  → Detail Kampanye (Ajukan Diri) → Asisten Naskah → Unggah Video → Dompet → Beri Ulasan
- **Lintas:** Notifikasi (ikon lonceng), Pusat Sengketa, Testimoni, Masuk

## Design System
Satu shell untuk semua halaman: `components/AppShell.jsx` dengan `variant`
`public | auth | umkm | kreator`, opsional `sidebar` (ruang kreator) dan `wide`.
**Navbar seragam:** tinggi 68px, sticky, `bg-cream/85` + backdrop-blur, container 1200px.

Token warna di `tailwind.config.js`:
`cream #FCF9F2` · `navy #0F2C4C` / `navy-light #1C3F63` · `gold #FFF2BA` (+`gold-border`, `gold-text`)
· `ink #1E2A38` / `ink-soft` / `ink-muted` · `skyfoot #C9DAEF` · `success` / `warning` / `danger`.

Class bersama di `index.css`:
`.shell .btn .btn-primary .btn-outline .btn-ghost .card .chip .input .label .field-help
.page-title .section-title .stat-card .chip-success .chip-warning .chip-danger .chip-info .chip-gold`

## Sistem Gerak (Motion)

Disusun memakai skill **motion-design** dari LottieFiles (MIT) — philosophy-first,
terpasang di `~/.claude/skills/motion-design/`. Semua token gerak ada di `src/motion.js`.

### Brand Motion Identity
Arketipe **Premium** (90%), meminjam **Playful** hanya untuk state sukses.

| Konstanta | Nilai |
|---|---|
| Signature easing | `cubic-bezier(0.4, 0, 0.2, 1)` — dipakai 80% animasi |
| Duration palette | quick 350ms · standard 500ms · slow 800ms |
| Entrance pattern | fade + naik + skala 98% → 100% |
| Overshoot | 0% (kecuali state sukses) |

Umpan balik interaktif memakai tabel tipe elemen, bukan palet arketipe, karena
responsivitas mengalahkan gaya: hover 90ms · tekan 120ms · lepas 260ms.

### Tiga lapis gerak
Animasi terasa datar kalau hanya punya lapis utama. Setiap halaman punya ketiganya:

- **Primary** — transisi halaman, entrance konten, aksi utama.
- **Secondary** — bayangan menyusul 50ms setelah kartu terangkat (`HoverCard`),
  ikon ikut membesar, angka menyusul setelah batang grafik mendarat.
- **Ambient** — orb mengambang dengan periode berbeda (4s/5,5s/3,5s) agar tak
  pernah sinkron (`Ambient.jsx`), kilau melintas (`Kilau`), titik status berdenyut
  (`DenyutStatus`), parallax scroll < 100px.

### Komponen
| Berkas | Isi |
|---|---|
| `src/motion.js` | Semua token: easing, durasi, varian, stagger |
| `components/PageTransition.jsx` | Transisi halaman + re-ekspor token |
| `components/Ambient.jsx` | `Ambient`, `Kilau`, `DenyutStatus` |
| `components/Feedback.jsx` | `CentangSukses`, `AngkaNaik`, `Goyang`, `Skeleton` |
| `components/ui.jsx` | `HoverCard`, `Tekan`, `StatCard`, `ProgressBar`, `StatusChip` |

### Aturan yang dipegang
- Anggaran stagger total selalu di bawah 500ms.
- Tidak ada easing linear untuk gerak spasial (linear hanya untuk kilau & spinner).
- Amplitudo ambient maksimal 20% energi gerak utama — tidak ada yang berkedip-kedip
  menuntut perhatian.
- Hanya `transform` dan `opacity` yang dianimasikan (murah untuk compositor).
- `<MotionConfig reducedMotion="user">` di `main.jsx` plus `useReducedMotion()` di
  komponen ambient — animasi mati total bila pengguna mengaktifkan "reduce motion",
  dan halaman tetap terbaca utuh.

## Struktur
```
src/
  api.js          Satu-satunya pintu ke backend + hook useApi (memuat/galat/muat ulang)
  sesi.jsx        Sesi pengguna: token JWT + profil dari GET /api/auth/saya
  format.js       Rupiah, tanggal, dan terjemahan status backend → label layar
  draf.jsx        Keadaan wizard kampanye tiga langkah
  components/     AppShell, SidebarRuang, Brand, SiteFooter, CampaignStepper,
                  PageTransition, Reveal, ui.jsx, Muat.jsx (memuat/galat/penjaga rute), icons
  data/pilihan.js Daftar pilihan tetap (kategori, lokasi, rentang anggaran)
  pages/          24 halaman
  App.jsx         Definisi rute + AnimatePresence + <Terproteksi>
  index.css       Tailwind + class bersama
```

## Menjalankan bersama backend

Antarmuka ini **tidak punya data contoh**. Semua angka, kampanye, dan saldo
datang dari API di `../lokalboost-api`, jadi backend harus hidup lebih dulu:

```bash
cd ../lokalboost-api && npm run seed && npm run dev   # port 4000
cd ../lokalboost-web && npm run dev                   # port 5173
```

Alamat API bisa diganti lewat `VITE_API_URL` (default `http://localhost:4000`).
Halaman Masuk menyediakan tiga akun demo (UMKM, Kreator, Admin) yang mengisi
sendiri emailnya — kata sandi seluruh akun seed adalah `lokalboost123`.

## Catatan
- Foto kreator dan thumbnail video diganti gradasi warna agar prototype 100% self-contained.
- Peran datang dari token, bukan dari alamat halaman. Rute ruang kerja dijaga
  `<Terproteksi>`: tamu dialihkan ke `/masuk?lanjut=…`, peran yang salah
  mendapat penjelasan dan jalan ke ruang kerjanya sendiri.
- Setiap halaman punya tiga keadaan yang sengaja dirancang — memuat, gagal
  memuat (dengan tombol coba lagi), dan kosong — karena data jaringan memang
  bisa berada di ketiganya.
- Bahasa antarmuka sepenuhnya Bahasa Indonesia sederhana, sesuai PRD §11.
