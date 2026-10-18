-- =====================================================================
--  LokalBoost — Skema Basis Data (SQLite)
--  Semua nominal uang disimpan sebagai INTEGER rupiah penuh (bukan sen),
--  supaya tidak pernah ada galat pembulatan floating point pada perhitungan
--  Pay-Per-View dan saldo Rekber.
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
--  Akun & Profil
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pengguna (
  id              TEXT PRIMARY KEY,
  peran           TEXT NOT NULL CHECK (peran IN ('umkm', 'kreator', 'admin')),
  nama            TEXT NOT NULL,
  -- 1 = akun contoh dari seed.js. Ditandai "Contoh" di antarmuka dan tidak
  -- ikut statistik publik, supaya data karangan tidak terbaca sebagai nyata.
  contoh          INTEGER NOT NULL DEFAULT 0,
  email           TEXT UNIQUE,
  telepon         TEXT UNIQUE,
  kata_sandi_hash TEXT,
  terverifikasi   INTEGER NOT NULL DEFAULT 0,
  dibuat_pada     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Kode OTP untuk verifikasi akun tingkat dasar (PRD §6.1), 2FA penarikan
-- dana (PRD §9), dan pemulihan kata sandi.
CREATE TABLE IF NOT EXISTS otp (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  identitas       TEXT NOT NULL,             -- email atau nomor HP
  kode            TEXT NOT NULL,
  kedaluwarsa_pada TEXT NOT NULL,
  terpakai        INTEGER NOT NULL DEFAULT 0,
  percobaan       INTEGER NOT NULL DEFAULT 0, -- tebakan salah; kode hangus setelah batasnya
  -- 'verifikasi' | 'penarikan' | 'reset'. Kode terikat pada satu tindakan:
  -- kode yang diminta untuk masuk tidak boleh bisa dipakai mencairkan dana.
  tujuan          TEXT NOT NULL DEFAULT 'verifikasi',
  dibuat_pada     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_otp_identitas ON otp (identitas, tujuan, terpakai);

CREATE TABLE IF NOT EXISTS profil_umkm (
  pengguna_id   TEXT PRIMARY KEY REFERENCES pengguna(id) ON DELETE CASCADE,
  nama_usaha    TEXT NOT NULL,
  kategori      TEXT,
  lokasi        TEXT,
  deskripsi     TEXT,
  target_audiens TEXT,
  nib           TEXT,
  terverifikasi INTEGER NOT NULL DEFAULT 0,
  foto          TEXT                       -- foto profil/logo toko, URL publik
);

CREATE TABLE IF NOT EXISTS profil_umkm_foto (
  id            TEXT PRIMARY KEY,
  pengguna_id   TEXT NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
  foto          TEXT NOT NULL,
  dibuat_pada   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_profil_umkm_foto ON profil_umkm_foto (pengguna_id, dibuat_pada);

-- Akun media sosial yang diisi sendiri oleh UMKM atau kreator
-- (services/akun-sosial.js). Hanya tautan, tanpa angka: statistik kreator
-- tetap hanya dari pengukuran Cek Profil (statistik_terukur).
CREATE TABLE IF NOT EXISTS akun_sosial (
  pengguna_id     TEXT NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
  platform        TEXT NOT NULL CHECK (platform IN ('tiktok','instagram','youtube')),
  url             TEXT NOT NULL,
  diperbarui_pada TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (pengguna_id, platform)
);

CREATE TABLE IF NOT EXISTS profil_kreator (
  pengguna_id    TEXT PRIMARY KEY REFERENCES pengguna(id) ON DELETE CASCADE,
  niche          TEXT,
  lokasi         TEXT,
  pengikut       INTEGER NOT NULL DEFAULT 0,
  bio            TEXT,
  portofolio_url TEXT,
  terverifikasi  INTEGER NOT NULL DEFAULT 0,
  gradasi        TEXT,
  foto           TEXT                       -- jalur avatar, mis. /gambar/kreator/krtr_sari.svg
);

-- ---------------------------------------------------------------------
--  Kampanye & Lamaran
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS kampanye (
  id               TEXT PRIMARY KEY,          -- slug, mis. "bakso-aci"
  umkm_id          TEXT NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
  nama             TEXT NOT NULL,
  kategori         TEXT NOT NULL,
  lokasi           TEXT NOT NULL,
  deskripsi        TEXT,
  target_views     INTEGER NOT NULL,
  tarif_per_view   INTEGER NOT NULL,          -- rupiah per view tervalidasi (dibulatkan, untuk tampilan)
  anggaran         INTEGER NOT NULL,          -- dana tunai yang disetor ke Rekber
  batas_maks_biaya INTEGER NOT NULL,          -- pagar atas biaya (PRD §7.1.2)
  -- Pengaturan reward (services/reward.js). Semua hitungan uang memakai
  -- tarif_cpm (rupiah per 1.000 views) supaya tarif pecahan per view, mis.
  -- CPM Rp 12.500 = Rp 12,5 per view, tetap tepat tanpa floating point.
  model_reward     TEXT NOT NULL DEFAULT 'tunai' CHECK (model_reward IN ('tunai','produk','kombinasi')),
  skema_tarif      TEXT NOT NULL DEFAULT 'per_view' CHECK (skema_tarif IN ('per_view','cpm')),
  tarif_cpm        INTEGER,                   -- null = tarif_per_view x 1.000 (kampanye lama)
  -- Ambang KELAYAKAN, bukan nominal: kreator berhak atas reward setelah views
  -- tervalidasinya mencapai angka ini. 0 = tanpa ambang.
  ambang_views_tunai  INTEGER NOT NULL DEFAULT 0,
  ambang_views_produk INTEGER NOT NULL DEFAULT 0,
  -- per_milestone: cair sekali di setiap kelipatan ambang (10rb, 20rb, ...).
  -- sekali: cair sekali saat ambang pertama tercapai, sisanya saat kampanye selesai.
  mode_pencairan   TEXT NOT NULL DEFAULT 'per_milestone' CHECK (mode_pencairan IN ('per_milestone','sekali')),
  kategori_lain    TEXT,                      -- JSON array kategori penonton tambahan
  tenggat_hari     INTEGER NOT NULL DEFAULT 14,
  status           TEXT NOT NULL DEFAULT 'draf'
                     CHECK (status IN ('draf','menunggu_dana','terbuka','mencari_kreator',
                                       'berjalan','selesai','dibatalkan')),
  kreator_id       TEXT REFERENCES pengguna(id) ON DELETE SET NULL,
  gradasi          TEXT,
  gambar           TEXT,                      -- foto produk, mis. /gambar/kampanye/bakso-aci.webp
  gambar_kredit    TEXT,                      -- JSON atribusi foto berlisensi CC
  -- Pemeriksaan etika sebelum tayang (services/moderasi-kampanye.js):
  -- belum | lolos | tinjau | ditolak. Hasil rinci (alasan, kutipan) di JSON.
  moderasi_status  TEXT NOT NULL DEFAULT 'belum',
  moderasi_hasil   TEXT,
  moderasi_pada    TEXT,
  diterbitkan_pada TEXT,
  dibuat_pada      TEXT NOT NULL DEFAULT (datetime('now')),
  selesai_pada     TEXT
);
CREATE INDEX IF NOT EXISTS idx_kampanye_status ON kampanye (status);
CREATE INDEX IF NOT EXISTS idx_kampanye_umkm ON kampanye (umkm_id);

CREATE TABLE IF NOT EXISTS kampanye_brief (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kampanye_id TEXT NOT NULL REFERENCES kampanye(id) ON DELETE CASCADE,
  isi         TEXT NOT NULL,
  urutan      INTEGER NOT NULL DEFAULT 0
);

-- Video acuan gaya yang ditempel UMKM saat membuat kampanye
-- (services/referensi-konten.js). Hanya tautan + judul: angka dan gambar
-- dari CDN cepat basi.
CREATE TABLE IF NOT EXISTS kampanye_referensi (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kampanye_id TEXT NOT NULL REFERENCES kampanye(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL CHECK (platform IN ('tiktok','instagram','youtube')),
  url         TEXT NOT NULL,
  judul       TEXT,
  penulis     TEXT,
  urutan      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_referensi_kampanye ON kampanye_referensi (kampanye_id);

CREATE TABLE IF NOT EXISTS lamaran (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kampanye_id TEXT NOT NULL REFERENCES kampanye(id) ON DELETE CASCADE,
  kreator_id  TEXT NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
  jenis       TEXT NOT NULL DEFAULT 'lamaran' CHECK (jenis IN ('lamaran','undangan')),
  pesan       TEXT,
  status      TEXT NOT NULL DEFAULT 'menunggu'
                CHECK (status IN ('menunggu','disetujui','ditolak','dibatalkan')),
  skor_kecocokan INTEGER,
  dibuat_pada TEXT NOT NULL DEFAULT (datetime('now')),
  -- Buku besar reward per kreator (lamaran 'disetujui' = peserta kampanye).
  -- Satu kampanye boleh diikuti banyak kreator sampai anggarannya habis.
  views_terhitung     INTEGER NOT NULL DEFAULT 0, -- views tervalidasi saat akrual terakhir
  bruto_akrual        INTEGER NOT NULL DEFAULT 0, -- rupiah yang sudah keluar dari escrow untuk kreator ini
  komisi_akrual       INTEGER NOT NULL DEFAULT 0, -- bagian komisi platform dari bruto_akrual
  bersih_dicairkan    INTEGER NOT NULL DEFAULT 0, -- yang sudah pindah ke saldo siap tarik
  milestone_dicairkan INTEGER NOT NULL DEFAULT 0, -- kelipatan ambang yang sudah dicairkan
  hangus              INTEGER NOT NULL DEFAULT 0, -- 1 = kampanye selesai sebelum ambang tercapai
  UNIQUE (kampanye_id, kreator_id)
);

-- Katalog produk UMKM yang bisa dijadikan reward kampanye.
CREATE TABLE IF NOT EXISTS produk (
  id          TEXT PRIMARY KEY,
  umkm_id     TEXT NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
  nama        TEXT NOT NULL,
  foto        TEXT,
  nilai       INTEGER NOT NULL,           -- harga jual per unit (rupiah)
  stok        INTEGER NOT NULL DEFAULT 0, -- stok yang belum dialokasikan ke kampanye
  dibuat_pada TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_produk_umkm ON produk (umkm_id);

-- Produk yang dialokasikan sebagai reward sebuah kampanye. Kuota dipotong
-- dari produk.stok saat kampanye terbit; sisa yang tak diklaim kembali saat selesai.
CREATE TABLE IF NOT EXISTS kampanye_produk (
  kampanye_id  TEXT NOT NULL REFERENCES kampanye(id) ON DELETE CASCADE,
  produk_id    TEXT NOT NULL REFERENCES produk(id) ON DELETE CASCADE,
  kuota        INTEGER NOT NULL,
  terklaim     INTEGER NOT NULL DEFAULT 0,
  dialokasikan INTEGER NOT NULL DEFAULT 0,  -- 1 = kuota sudah dipotong dari stok
  PRIMARY KEY (kampanye_id, produk_id)
);

-- Satu kreator hanya bisa mengklaim satu produk per kampanye.
CREATE TABLE IF NOT EXISTS klaim_produk (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kampanye_id TEXT NOT NULL REFERENCES kampanye(id) ON DELETE CASCADE,
  produk_id   TEXT NOT NULL REFERENCES produk(id) ON DELETE CASCADE,
  kreator_id  TEXT NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'diproses' CHECK (status IN ('diproses','dikirim','diterima')),
  alamat      TEXT NOT NULL,
  resi        TEXT,
  views_saat_klaim INTEGER NOT NULL,
  dibuat_pada TEXT NOT NULL DEFAULT (datetime('now')),
  dikirim_pada TEXT,
  UNIQUE (kampanye_id, kreator_id)
);

-- ---------------------------------------------------------------------
--  Rekber (Escrow), Dompet, Transaksi
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dompet (
  pengguna_id    TEXT PRIMARY KEY REFERENCES pengguna(id) ON DELETE CASCADE,
  saldo          INTEGER NOT NULL DEFAULT 0,   -- siap ditarik
  saldo_tertahan INTEGER NOT NULL DEFAULT 0    -- sedang berjalan di kampanye
);

CREATE TABLE IF NOT EXISTS escrow (
  kampanye_id       TEXT PRIMARY KEY REFERENCES kampanye(id) ON DELETE CASCADE,
  jumlah_disetor    INTEGER NOT NULL DEFAULT 0,
  jumlah_dicairkan  INTEGER NOT NULL DEFAULT 0,  -- yang sudah masuk dompet kreator
  komisi_platform   INTEGER NOT NULL DEFAULT 0,
  jumlah_dikembalikan INTEGER NOT NULL DEFAULT 0, -- sisa yang balik ke UMKM
  status            TEXT NOT NULL DEFAULT 'kosong'
                      CHECK (status IN ('kosong','ditahan','sebagian_cair','selesai','dikembalikan')),
  diperbarui_pada   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transaksi (
  id          TEXT PRIMARY KEY,
  pengguna_id TEXT NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
  kampanye_id TEXT REFERENCES kampanye(id) ON DELETE SET NULL,
  jenis       TEXT NOT NULL CHECK (jenis IN ('setor','pencairan','penarikan','refund','komisi')),
  arah        TEXT NOT NULL CHECK (arah IN ('masuk','keluar')),
  nominal     INTEGER NOT NULL,
  label       TEXT NOT NULL,
  dibuat_pada TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_transaksi_pengguna ON transaksi (pengguna_id, dibuat_pada DESC);

-- Tagihan Midtrans Snap untuk setor dana Rekber. Satu kampanye boleh punya
-- beberapa baris (tagihan kedaluwarsa lalu dibuat ulang), tapi escrow hanya
-- diisi oleh SATU baris yang berpindah ke 'lunas'. Status:
--   menunggu     tagihan dibuat, belum dibayar (VA belum ditransfer, dsb.)
--   lunas        Midtrans settlement/capture, escrow sudah terisi
--   gagal        deny/cancel/failure
--   kedaluwarsa  expire
--   perlu_tinjau uang SUDAH diterima Midtrans tapi escrow tidak bisa diisi
--                (kampanye sudah didanai tagihan lain, nominal tidak cocok,
--                kampanye hilang). Butuh refund/penanganan manual admin.
CREATE TABLE IF NOT EXISTS pembayaran (
  order_id      TEXT PRIMARY KEY,
  kampanye_id   TEXT REFERENCES kampanye(id) ON DELETE SET NULL,
  umkm_id       TEXT NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
  jumlah        INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'menunggu'
                  CHECK (status IN ('menunggu','lunas','gagal','kedaluwarsa','perlu_tinjau')),
  snap_token    TEXT,
  snap_url      TEXT,
  metode        TEXT,                 -- pilihan UMKM di layar (va / ewallet)
  jenis_bayar   TEXT,                 -- payment_type dari Midtrans (qris, bank_transfer, ...)
  status_mentah TEXT,                 -- transaction_status terakhir dari Midtrans
  catatan       TEXT,
  kedaluwarsa_pada TEXT NOT NULL,
  dibuat_pada   TEXT NOT NULL DEFAULT (datetime('now')),
  diperbarui_pada TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pembayaran_kampanye ON pembayaran (kampanye_id, status);

-- ---------------------------------------------------------------------
--  Video & Tayangan (bahan mentah AI Anti-Fraud)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS video (
  id            TEXT PRIMARY KEY,
  kampanye_id   TEXT NOT NULL REFERENCES kampanye(id) ON DELETE CASCADE,
  kreator_id    TEXT NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
  judul         TEXT NOT NULL,
  berkas        TEXT,                       -- path relatif di folder unggahan/
  durasi_detik  INTEGER NOT NULL DEFAULT 30,
  status        TEXT NOT NULL DEFAULT 'diproses'
                  CHECK (status IN ('diproses','tayang','ditolak')),
  subtitle      TEXT,                       -- hasil AI Auto-Subtitle
  catatan_audio TEXT,                       -- hasil AI Pembersih Suara
  -- Antrean kualitas konten yang diawasi Admin Platform (PRD §4.3).
  moderasi      TEXT NOT NULL DEFAULT 'menunggu'
                  CHECK (moderasi IN ('menunggu','lolos','revisi')),
  catatan_moderasi TEXT,
  etika_hasil   TEXT,                       -- JSON pemeriksaan ucapan/judul (moderasi-kampanye.js)
  -- Video yang disetor sebagai TAUTAN (services/video-tautan.js). Views datang
  -- dari platform, bukan dari tabel tayangan. Yang dibayar hanya kenaikan
  -- di atas views_awal (views sebelum disetor tidak dihitung).
  sumber        TEXT NOT NULL DEFAULT 'unggah' CHECK (sumber IN ('unggah','tautan')),
  url           TEXT,
  platform      TEXT,
  platform_id   TEXT,                       -- id video di platform, cegah setor ganda
  akun_penulis  TEXT,
  views_awal    INTEGER,
  views_platform INTEGER,
  views_diakui  INTEGER NOT NULL DEFAULT 0, -- kenaikan views yang dihitung untuk reward
  views_tertahan INTEGER NOT NULL DEFAULT 0, -- kenaikan tidak wajar, menunggu tinjauan admin
  views_batas   INTEGER,                    -- batas kenaikan yang sudah diakui admin; null = batas otomatis
  views_diukur_pada TEXT,
  kecocokan     TEXT,                       -- cocok | tinjau | tidak_cocok (AI vs brief)
  kecocokan_hasil TEXT,                     -- JSON alasan + bahan yang diperiksa
  dibuat_pada   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Satu baris = satu tayangan mentah yang dilaporkan tracker.
-- Kolom `valid` diisi oleh services/antifraud.js.
CREATE TABLE IF NOT EXISTS tayangan (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id      TEXT NOT NULL REFERENCES video(id) ON DELETE CASCADE,
  kampanye_id   TEXT NOT NULL REFERENCES kampanye(id) ON DELETE CASCADE,
  ip_hash       TEXT NOT NULL,
  perangkat     TEXT,
  user_agent    TEXT,
  kota          TEXT,
  durasi_tonton INTEGER NOT NULL DEFAULT 0,  -- detik
  waktu         TEXT NOT NULL DEFAULT (datetime('now')),
  valid         INTEGER NOT NULL DEFAULT 1,
  alasan        TEXT,                        -- alasan penyaringan; DIPERTAHANKAN walau dipulihkan
  dipulihkan    INTEGER NOT NULL DEFAULT 0,  -- 1 = admin memutus penyaringannya keliru
  dibayar       INTEGER NOT NULL DEFAULT 0   -- 1 = sudah ikut dihitung pencairan
);
CREATE INDEX IF NOT EXISTS idx_tayangan_kampanye ON tayangan (kampanye_id, waktu);
CREATE INDEX IF NOT EXISTS idx_tayangan_ip ON tayangan (video_id, ip_hash);

/*
 * Umpan balik untuk AI Smart Matchmaker.
 *
 * Setiap kali UMKM benar-benar memilih seorang kreator, kita catat peringkat
 * dan skor yang diberikan matchmaker kepada kreator itu SAAT ITU. Tanpa
 * catatan ini tidak ada cara menjawab pertanyaan paling dasar tentang sebuah
 * mesin rekomendasi: apakah yang direkomendasikan memang yang dipilih orang?
 *
 * Skor disimpan sebagai angka beku, bukan dihitung ulang belakangan — bobot
 * dan data kreator berubah seiring waktu, dan menghitung ulang berarti menilai
 * keputusan lama dengan model baru.
 */
CREATE TABLE IF NOT EXISTS umpan_matchmaker (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kampanye_id  TEXT NOT NULL REFERENCES kampanye(id) ON DELETE CASCADE,
  kreator_id   TEXT NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
  skor         INTEGER NOT NULL,   -- kecocokan 0-100 saat keputusan diambil
  peringkat    INTEGER NOT NULL,   -- posisi di daftar rekomendasi (1 = teratas)
  jumlahKandidat INTEGER NOT NULL,
  cara         TEXT NOT NULL,      -- 'disetujui' (kreator melamar) | 'diundang'
  dibuat_pada  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_umpan_matchmaker ON umpan_matchmaker (kampanye_id);

-- ---------------------------------------------------------------------
--  Reputasi, Notifikasi, Sengketa
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ulasan (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kampanye_id   TEXT NOT NULL REFERENCES kampanye(id) ON DELETE CASCADE,
  penilai_id    TEXT NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
  dinilai_id    TEXT NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
  peran_penilai TEXT NOT NULL CHECK (peran_penilai IN ('umkm','kreator')),
  bintang       INTEGER NOT NULL CHECK (bintang BETWEEN 1 AND 5),
  komentar      TEXT,
  dibuat_pada   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (kampanye_id, penilai_id, dinilai_id)
);

CREATE TABLE IF NOT EXISTS notifikasi (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  pengguna_id TEXT NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
  jenis       TEXT NOT NULL,   -- dana | approval | ai | kampanye | ulasan | sengketa
  judul       TEXT NOT NULL,
  isi         TEXT NOT NULL,
  tautan      TEXT,
  baru        INTEGER NOT NULL DEFAULT 1,
  dibuat_pada TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifikasi_pengguna ON notifikasi (pengguna_id, dibuat_pada DESC);

CREATE TABLE IF NOT EXISTS sengketa (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kampanye_id TEXT NOT NULL REFERENCES kampanye(id) ON DELETE CASCADE,
  pengaju_id  TEXT NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
  kategori    TEXT NOT NULL,
  alasan      TEXT NOT NULL,
  bukti       TEXT,
  status      TEXT NOT NULL DEFAULT 'terbuka'
                CHECK (status IN ('terbuka','ditinjau','selesai','ditolak')),
  keputusan   TEXT,
  dibuat_pada TEXT NOT NULL DEFAULT (datetime('now')),
  diputus_pada TEXT
);

-- Sisa AI Script Generator, fitur yang dihapus 20 Sep 2026 atas keputusan
-- kelompok. Tabelnya sengaja dipertahankan: tabel kosong tidak memakan
-- biaya, sedangkan mengubah skema menjelang tenggat berisiko. Tidak ada
-- satu pun kode yang menulis ke sini lagi. Bersihkan sesudah lomba.
CREATE TABLE IF NOT EXISTS naskah_ai (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kreator_id  TEXT NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
  kampanye_id TEXT REFERENCES kampanye(id) ON DELETE SET NULL,
  sumber      TEXT NOT NULL DEFAULT 'template' CHECK (sumber IN ('llm','template')),
  judul       TEXT NOT NULL,
  isi         TEXT NOT NULL,   -- JSON: { hook, adegan[], cta, tagar[] }
  dibuat_pada TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
--  AI Portfolio Auto-builder
--
--  Portofolio kreator dirakit dari lapis yang label asal-usulnya dibedakan:
--
--    1. Terverifikasi LokalBoost — dihitung dari tabel kampanye, tayangan,
--       dan ulasan di basis data ini. Tidak ada tabel baru untuk lapis ini.
--    2. Diukur dari profil       — tabel `statistik_terukur` di bawah, diambil
--       dari profil publik dan dibuktikan lewat kode di bio.
--
--  Angka ketikan kreator sendiri sengaja TIDAK ada (tabel `statistik_dilaporkan`
--  dihapus 17 Okt 2026): views dan pengikut yang bisa diketik membuka pintu
--  penipuan ke UMKM. `portofolio_tautan` masih ada tapi tidak lagi ditampilkan.
-- ---------------------------------------------------------------------

-- Tautan karya yang ditempel kreator. Kolom hasil oEmbed hanya terisi kalau
-- TikTok benar-benar menjawab, sehingga `terkonfirmasi` tidak pernah bisa
-- disetel dari masukan pengguna.
CREATE TABLE IF NOT EXISTS portofolio_tautan (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kreator_id    TEXT NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL CHECK (platform IN ('tiktok','instagram','youtube','lainnya')),
  url           TEXT NOT NULL,
  judul         TEXT,          -- dari oEmbed
  penulis       TEXT,          -- author_name dari oEmbed
  penulis_akun  TEXT,          -- author_unique_id dari oEmbed
  thumbnail     TEXT,          -- thumbnail_url dari oEmbed
  terkonfirmasi INTEGER NOT NULL DEFAULT 0,
  dibuat_pada   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (kreator_id, url)
);
CREATE INDEX IF NOT EXISTS idx_portofolio_tautan_kreator ON portofolio_tautan (kreator_id);


-- Statistik yang DIUKUR dari profil publik lewat ScrapeCreators
-- (services/profil-sosial.js). Baris hanya ditulis setelah kreator
-- membuktikan akunnya dengan kode di bio, jadi angka di sini bukan ketikan
-- dan bukan milik akun orang lain. Satu akun hanya boleh diklaim satu kreator.
CREATE TABLE IF NOT EXISTS statistik_terukur (
  kreator_id        TEXT NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
  platform          TEXT NOT NULL CHECK (platform IN ('tiktok','instagram','youtube')),
  akun              TEXT NOT NULL,
  nama_tampilan     TEXT,
  centang_platform  INTEGER NOT NULL DEFAULT 0,
  pengikut          INTEGER NOT NULL DEFAULT 0,
  rerata_views      INTEGER,          -- null = tidak ada konten video
  median_views      INTEGER,
  engagement        REAL,             -- persen
  dasar_engagement  TEXT,             -- 'views' (TikTok) | 'pengikut' (Instagram)
  konten_diukur     INTEGER NOT NULL DEFAULT 0,
  konten_30_hari    INTEGER NOT NULL DEFAULT 0,
  skor              INTEGER NOT NULL DEFAULT 0,
  penilaian         TEXT NOT NULL,    -- JSON { predikat, komponen[], peringatan[] }
  diukur_pada       TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (kreator_id, platform),
  UNIQUE (platform, akun)
);

-- Teks publik (bio/deskripsi profil, komentar ulasan) yang lolos tapi samar:
-- diperiksa admin (services/moderasi-kampanye.js, periksaTeksPublik).
CREATE TABLE IF NOT EXISTS penandaan_etika (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  jenis       TEXT NOT NULL CHECK (jenis IN ('bio_kreator','deskripsi_umkm','ulasan')),
  rujukan     TEXT NOT NULL,                -- id pengguna (profil) atau id ulasan
  pengguna_id TEXT NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
  teks        TEXT NOT NULL,
  hasil       TEXT NOT NULL,                -- JSON hasil pemeriksaan
  status      TEXT NOT NULL DEFAULT 'terbuka' CHECK (status IN ('terbuka','dibiarkan','dihapus')),
  dibuat_pada TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_penandaan_status ON penandaan_etika (status);
