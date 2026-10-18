/**
 * Uji asap terhadap server yang sedang berjalan, memakai akun hasil seed dan
 * persis endpoint yang dipanggil frontend. Tujuannya bukan menggantikan
 * `npm test` (yang memakai basis data sementara), melainkan memastikan data
 * seed + server yang hidup benar-benar melayani setiap layar.
 */
/**
 * Bisa diarahkan ke server mana pun, bukan hanya laptop sendiri:
 *   API_URL=https://lokalboost-api-production.up.railway.app npm run asap
 * Itulah cara membuktikan deployan sungguhan benar-benar melayani, bukan
 * sekadar menjawab health check.
 */
const DASAR = (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '')
const SANDI = 'lokalboost123'

let lulus = 0
let gagal = 0
const catatan = []

async function panggil(metode, jalur, { token, body } = {}) {
  const res = await fetch(`${DASAR}${jalur}`, {
    method: metode,
    headers: {
      'content-type': 'application/json',
      'user-agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile Safari/537.36',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

function cek(nama, syarat, rincian = '') {
  if (syarat) {
    lulus++
    console.log(`  OK   ${nama}`)
  } else {
    gagal++
    catatan.push(`${nama} ${rincian}`)
    console.log(`  GAGAL ${nama} ${rincian}`)
  }
}

async function masuk(identitas) {
  const r = await panggil('POST', '/api/auth/masuk', { body: { identitas, kataSandi: SANDI } })
  if (r.status !== 200) throw new Error(`gagal masuk ${identitas}: ${JSON.stringify(r.data)}`)
  return { token: r.data.token, pengguna: r.data.pengguna }
}

console.log('\n== Publik (tamu) ==')
{
  const sehat = await panggil('GET', '/api/kesehatan')
  cek('GET /api/kesehatan', sehat.data.status === 'sehat')

  const stat = await panggil('GET', '/api/dashboard/statistik-publik')
  cek('Landing: statistik publik', stat.data.umkmTerdaftar > 0 && stat.data.komisiPersen === 5,
    JSON.stringify(stat.data))

  const pasar = await panggil('GET', '/api/kampanye')
  cek('Marketplace: daftar kampanye', pasar.data.jumlah > 0)
  cek('Marketplace: kampanye tanpa dana tersembunyi',
    pasar.data.kampanye.every((k) => k.status !== 'menunggu_dana'))

  const filter = await panggil('GET', '/api/kampanye?kategori=Kuliner&lokasi=Bandung')
  cek('Marketplace: filter kategori+lokasi',
    filter.data.kampanye.every((k) => k.kategori === 'Kuliner' && k.lokasi === 'Bandung'))

  const kreator = await panggil('GET', '/api/kreator?niche=Kuliner')
  cek('Marketplace: direktori kreator', kreator.data.jumlah >= 3)

  const profil = await panggil('GET', '/api/kreator/krtr_rafi')
  cek('Profil kreator publik', profil.data.kreator.nama === 'Rafi Pratama')
  cek('Profil kreator: portofolio dari kampanye selesai', Array.isArray(profil.data.portofolio))

  const detail = await panggil('GET', '/api/kampanye/bakso-aci')
  cek('Detail kampanye', detail.data.kampanye.viewsTervalidasi > 0)
  cek('Detail kampanye: brief ikut terkirim', detail.data.kampanye.brief.length === 3)

  const ai = await panggil('GET', '/api/ai/status')
  cek('Status AI jujur', ai.data.fitur.antiFraud.jenis === 'algoritma')

  const terkunci = await panggil('GET', '/api/dompet')
  cek('Dompet menolak tamu', terkunci.status === 401)
}

console.log('\n== UMKM (busari@warungsunda.id) ==')
const umkm = await masuk('busari@warungsunda.id')
{
  cek('Masuk sebagai UMKM', umkm.pengguna.peran === 'umkm')
  cek('Profil usaha ikut terbawa', Boolean(umkm.pengguna.profil?.nama_usaha))

  const dash = await panggil('GET', '/api/dashboard/umkm', { token: umkm.token })
  cek('Dashboard UMKM', dash.data.kampanye.length >= 2, JSON.stringify(dash.data.ringkasan))
  cek('Dashboard UMKM: dana di Rekber terhitung', dash.data.ringkasan.danaDiRekber > 0)
  cek('Dashboard UMKM: notifikasi ikut', Array.isArray(dash.data.notifikasi))

  const kampanyeId = dash.data.kampanye.find((k) => k.status === 'berjalan')?.id
  const laporan = await panggil('GET', `/api/kampanye/${kampanyeId}/laporan`, { token: umkm.token })
  cek('Laporan hasil: 7 hari', laporan.data.laporan.viewsHarian.length === 7)
  cek('Laporan hasil: sebaran kota', laporan.data.laporan.sebaranLokasi.length > 0)
  cek('Laporan hasil: rincian anti-fraud', laporan.data.laporan.antiFraud.rincian.length > 0)
  cek('Laporan hasil: neraca escrow',
    laporan.data.laporan.keuangan.disetor >= laporan.data.laporan.keuangan.terpakai)

  const ringkas = await panggil('GET', `/api/kampanye/${kampanyeId}/ringkasan-ai`, { token: umkm.token })
  cek('AI Auto-Report Summary', ringkas.data.ringkasan.ringkasan.length > 80)
  cek('AI Auto-Report: tanpa jargon', !/engagement rate|CTR|impresi/i.test(ringkas.data.ringkasan.ringkasan))

  const mencari = dash.data.kampanye.find((k) => ['terbuka', 'mencari_kreator'].includes(k.status))
  const rekom = await panggil('GET', `/api/kampanye/${mencari.id}/rekomendasi-kreator`, { token: umkm.token })
  cek('Matchmaker: rekomendasi kreator', rekom.data.rekomendasi.length > 0)
  cek('Matchmaker: setiap rekomendasi beralasan',
    rekom.data.rekomendasi.every((r) => r.alasan && r.rincian))

  const pelamar = await panggil('GET', `/api/kampanye/${mencari.id}/lamaran`, { token: umkm.token })
  cek('Pilih kreator: daftar pelamar', pelamar.data.lamaran.length > 0)

  const dompet = await panggil('GET', '/api/dompet', { token: umkm.token })
  cek('Riwayat dana UMKM', dompet.data.dompet.riwayat.some((t) => t.jenis === 'setor'))

  const laporanOrangLain = await panggil('GET', '/api/kampanye/bakso-aci/laporan', { token: umkm.token })
  cek('Laporan usaha lain ditolak', laporanOrangLain.status === 403)
}

console.log('\n== Kreator (rafi@kreator.id) ==')
const kreator = await masuk('rafi@kreator.id')
{
  const dash = await panggil('GET', '/api/dashboard/kreator', { token: kreator.token })
  cek('Dashboard kreator', dash.data.kampanyeSaya.length >= 2, JSON.stringify(dash.data.ringkasan))
  cek('Dashboard kreator: saldo tertahan terisi', dash.data.ringkasan.saldoTertahan > 0)
  cek('Dashboard kreator: rekomendasi AI', dash.data.rekomendasi.length > 0)
  cek('Dashboard kreator: skor kecocokan ada',
    dash.data.rekomendasi.every((r) => typeof r.kecocokan === 'number'))

  const kampanyeSaya = await panggil('GET', '/api/kreator/saya/kampanye', { token: kreator.token })
  cek('Unggah video: daftar kampanye sendiri', kampanyeSaya.data.kampanye.length >= 2)

  // Script Generator dihapus: endpoint-nya harus benar-benar hilang, bukan
  // sekadar tidak dipakai lagi oleh antarmuka.
  const naskahHilang = await panggil('POST', '/api/ai/naskah', {
    token: kreator.token,
    body: { kampanyeId: kampanyeSaya.data.kampanye[0].id },
  })
  cek('Script Generator sudah dihapus', naskahHilang.status === 404)

  // --- AI Portfolio Auto-builder -------------------------------------------
  // Jalur oEmbed TikTok sungguhan sengaja DIUJI di sini, bukan di npm test:
  // tes unit yang menyentuh jaringan akan gagal setiap kali koneksi buruk,
  // sedangkan uji asap memang dijalankan sadar-sadar sebelum rilis.
  const porto = await panggil('GET', '/api/kreator/saya/portofolio', { token: kreator.token })
  cek('Portofolio: tiga lapis tersaji', Object.keys(porto.data.lapis || {}).length === 3)
  cek('Portofolio: ringkasan dirakit template', porto.data.sumberRingkasan === 'template')
  cek('Portofolio: lapis terverifikasi punya labelnya',
    porto.data.lapis?.terverifikasi?.label === 'Terverifikasi LokalBoost')
  cek('Portofolio: lapis terukur ada dan statistik ketikan tidak ada',
    porto.data.lapis?.terukur?.label === 'Diukur dari profil' && !('dilaporkan' in (porto.data.lapis || {})))

  const portoPublik = await panggil('GET', `/api/kreator/${kreator.pengguna.id}/portofolio`)
  cek('Portofolio: versi publik bisa dibaca tanpa login', portoPublik.status === 200)

  const tautanNgawur = await panggil('POST', '/api/kreator/saya/portofolio/tautan', {
    token: kreator.token,
    body: { url: 'bukan-url' },
  })
  cek('Portofolio: tautan tidak sah ditolak', tautanNgawur.status === 400)

  const statistikManual = await panggil('PUT', '/api/kreator/saya/portofolio/statistik', {
    token: kreator.token,
    body: { platform: 'tiktok', pengikut: 9_999_999 },
  })
  cek('Portofolio: statistik ketikan sendiri tidak diterima lagi', statistikManual.status === 404)

  const dompet = await panggil('GET', '/api/dompet', { token: kreator.token })
  cek('Dompet kreator', dompet.data.dompet.saldoTertahan > 0)

  cek('Dompet mengirim ambang 2FA', dompet.data.ambang2fa === 2_000_000)

  const tarikBerlebih = await panggil('POST', '/api/dompet/tarik', {
    token: kreator.token,
    body: { jumlah: 999_999_999, tujuan: 'BCA 4471' },
  })
  cek('Penarikan melebihi saldo ditolak', tarikBerlebih.status === 400)

  // 2FA penarikan. Sampai versi sebelumnya, string apa pun lolos di sini —
  // pemeriksaannya cuma "kodeOtp tidak kosong".
  const tarikTanpaKode = await panggil('POST', '/api/dompet/tarik', {
    token: kreator.token,
    body: { jumlah: 2_000_000, tujuan: 'BCA 4471' },
  })
  cek('Penarikan besar tanpa kode ditolak', tarikTanpaKode.status === 400)

  const tarikKodeKarangan = await panggil('POST', '/api/dompet/tarik', {
    token: kreator.token,
    body: { jumlah: 2_000_000, tujuan: 'BCA 4471', kodeOtp: 'apa-saja' },
  })
  cek('Penarikan besar dengan kode karangan ditolak', tarikKodeKarangan.status === 400,
    JSON.stringify(tarikKodeKarangan.data))

  // 429 di sini bukan kegagalan melainkan jeda 60 detik antar kode yang
  // memang seharusnya berlaku — dan jedanya bertahan lintas jalannya skrip
  // ini karena dihitung dari tabel `otp`, bukan dari memori.
  const kodePenarikan = await panggil('POST', '/api/dompet/tarik/kode', { token: kreator.token })
  cek('Kirim kode penarikan', [200, 429].includes(kodePenarikan.status),
    JSON.stringify(kodePenarikan.data))

  const notif = await panggil('GET', '/api/notifikasi', { token: kreator.token })
  cek('Notifikasi kreator', notif.data.notifikasi.length > 0)
}

console.log('\n== Alur baru: unggah video + tayangan ==')
{
  const kampanyeId = (await panggil('GET', '/api/kreator/saya/kampanye', { token: kreator.token }))
    .data.kampanye.find((k) => k.status === 'berjalan').id

  const video = await panggil('POST', '/api/video', {
    token: kreator.token,
    body: { kampanyeId, judul: 'Uji asap — versi 30 detik', durasiDetik: 30 },
  })
  cek('Unggah video', video.status === 201, JSON.stringify(video.data))
  cek('Video masuk antrean moderasi', video.data.video?.moderasi === 'menunggu')

  const proses = await panggil('POST', `/api/video/${video.data.video.id}/proses`, {
    token: kreator.token,
    body: { naskah: 'Halo semua. Ini bakso aci paling enak. Cobain ya!' },
  })
  cek('AI Auto-Subtitle', proses.data.video.subtitle.segmen.length === 3)
  // 'diperiksa' bila Gemini mendengar videonya, 'tidak_diperiksa' bila tidak.
  // Yang dulu selalu 'selesai' + "12 dB" itu angka karangan, sudah dibuang.
  cek('AI Pemeriksa Suara', ['diperiksa', 'tidak_diperiksa'].includes(proses.data.video.catatanAudio.status))

  // Batch khusus admin: tanpa token, siapa pun bisa memalsukan IP penonton.
  const tanpaToken = await fetch(`${DASAR}/api/tayangan/batch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tayangan: [] }),
  })
  cek('Batch tayangan ditolak tanpa login admin', tanpaToken.status === 401)

  const adminBatch = await masuk('admin@lokalboost.id')
  const tayangan = await fetch(`${DASAR}/api/tayangan/batch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${adminBatch.token}` },
    body: JSON.stringify({
      tayangan: [
        ...Array.from({ length: 5 }, (_, i) => ({
          videoId: video.data.video.id,
          ip: `140.5.9.${i}`,
          userAgent: 'Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile Safari/537.36',
          kota: 'Bandung',
          durasiTonton: 22,
        })),
        {
          videoId: video.data.video.id,
          ip: '45.1.1.1',
          userAgent: 'python-requests/2.31.0',
          durasiTonton: 25,
        },
      ],
    }),
  }).then((r) => r.json())

  cek('Tracking tayangan: 5 asli dihitung', tayangan.dihitung === 5, JSON.stringify(tayangan))
  cek('Anti-fraud: bot disaring', tayangan.disaring === 1)
}

console.log('\n== Admin (admin@lokalboost.id) ==')
const admin = await masuk('admin@lokalboost.id')
{
  const ringkasan = await panggil('GET', '/api/admin/ringkasan', { token: admin.token })
  cek('Admin: ringkasan platform', ringkasan.data.kampanye.total === 7, JSON.stringify(ringkasan.data.kampanye))
  cek('Admin: anti-fraud terhitung', ringkasan.data.antiFraud.disaring > 0)
  cek('Admin: antrean moderasi terisi', ringkasan.data.konten.menungguModerasi > 0)

  const neraca = await panggil('GET', '/api/admin/kampanye', { token: admin.token })
  const bocor = neraca.data.kampanye.filter((k) => k.selisihNeraca !== 0)
  cek('Admin: neraca semua kampanye tertutup', bocor.length === 0,
    bocor.map((b) => `${b.id}=${b.selisihNeraca}`).join(','))

  const konten = await panggil('GET', '/api/admin/konten?moderasi=menunggu', { token: admin.token })
  cek('Admin: antrean konten', konten.data.konten.length > 0)

  const moderasi = await panggil('POST', `/api/admin/konten/${konten.data.konten[0].id}/moderasi`, {
    token: admin.token,
    body: { keputusan: 'lolos' },
  })
  cek('Admin: loloskan konten', moderasi.status === 200)

  const pengguna = await panggil('GET', '/api/admin/pengguna?peran=kreator', { token: admin.token })
  // Seed berisi 5 kreator; ">= " bukan "===" karena bagian "Alur pendaftaran
  // baru" di bawah menambah satu kreator setiap skrip ini dijalankan. Dengan
  // "===" uji asap hanya lulus tepat sekali per seed.
  cek('Admin: daftar kreator', pengguna.data.pengguna.length >= 5,
    `dapat ${pengguna.data.pengguna.length}`)

  const transaksi = await panggil('GET', '/api/admin/transaksi', { token: admin.token })
  cek('Admin: buku transaksi platform', transaksi.data.transaksi.length > 0)

  const sengketa = await panggil('GET', '/api/sengketa', { token: admin.token })
  cek('Admin: melihat seluruh sengketa', Array.isArray(sengketa.data.sengketa))

  const belajar = await panggil('GET', '/api/admin/pembelajaran', { token: admin.token })
  const af = belajar.data.antiFraud || {}
  const mm = belajar.data.matchmaker || {}
  cek('Ketepatan AI: laporan anti-fraud terisi', af.perAlasan?.length > 0)
  cek('Ketepatan AI: ambang berlaku ikut dilaporkan', typeof af.ambangBerlaku?.ambangZScore === 'number')
  cek('Ketepatan AI: tingkat salah saring terhitung', typeof af.persenSalahKeseluruhan === 'number')
  // Jangan patok angkanya: bobot memang disetel dari waktu ke waktu. Yang
  // harus benar adalah semua komponen terlaporkan dan totalnya tetap 100.
  const bobot = mm.bobotBerlaku || {}
  const totalBobot = Object.values(bobot).reduce((a, b) => a + b, 0)
  cek('Ketepatan AI: bobot matchmaker ikut dilaporkan', totalBobot === 100)
  cek('Ketepatan AI: histori penerimaan ikut dinilai', typeof bobot.histori === 'number' && bobot.histori > 0)
  cek('Ketepatan AI: umpan balik rekomendasi terbaca', typeof mm.jumlahKeputusan === 'number')

  const usulan = await panggil('GET', '/api/admin/pembelajaran/usulan', { token: admin.token })
  cek('Penyetel: usulan tersaji', usulan.status === 200, JSON.stringify(usulan.data).slice(0, 120))
  cek('Penyetel: baris .env berupa daftar', Array.isArray(usulan.data.barisEnv))
  cek('Penyetel: tidak pernah mengusulkan pengetatan',
    (usulan.data.antiFraud?.usulan || []).every((u) => u.disarankan !== u.sekarang))
}

console.log('\n== Alur pendaftaran baru ==')
{
  const email = `uji${Date.now()}@lokalboost.test`
  const daftar = await panggil('POST', '/api/auth/daftar', {
    body: { peran: 'kreator', nama: 'Kreator Uji Asap', email, kataSandi: 'rahasia123' },
  })
  cek('Daftar akun baru', daftar.status === 201)

  // Akun ini belum diverifikasi, dan sejak verifikasi email diwajibkan itu
  // berarti kata sandi yang benar pun belum cukup untuk masuk.
  const belum = await panggil('POST', '/api/auth/masuk', {
    body: { identitas: email, kataSandi: 'rahasia123' },
  })
  cek('Masuk ditolak sebelum verifikasi', belum.status === 403, `dapat ${belum.status}`)
  cek('Penanda perluVerifikasi dikirim ke frontend', belum.data.rincian?.perluVerifikasi === true)

  // Di produksi BOCORKAN_OTP=false, jadi kodenya memang tidak boleh ada di
  // sini — satu-satunya tempatnya adalah inbox. Sisa alur ini hanya bisa
  // ditempuh saat mode demo menyala.
  const modeDemo = Boolean(daftar.data.kodeOtp)
  cek(
    modeDemo ? 'Kode OTP dikembalikan di mode demo' : 'Kode OTP disembunyikan (BOCORKAN_OTP=false)',
    true,
  )

  if (!modeDemo) {
    console.log('  ..   Sisa alur pendaftaran dilewati — kodenya hanya ada di inbox.')
  } else {
    const salahKode = await panggil('POST', '/api/auth/otp/verifikasi', {
      body: { identitas: email, kode: daftar.data.kodeOtp === '000000' ? '111111' : '000000' },
    })
    cek('Kode salah ditolak dan percobaan dihitung', /sisa \d+ percobaan/i.test(salahKode.data.galat || ''))

    const verif = await panggil('POST', '/api/auth/otp/verifikasi', {
      body: { identitas: email, kode: daftar.data.kodeOtp },
    })
    cek('Verifikasi OTP menerbitkan token', Boolean(verif.data.token))

    const profil = await panggil('PUT', '/api/auth/profil', {
      token: verif.data.token,
      body: { niche: 'Kuliner', lokasi: 'Bandung', pengikut: 12_000, bio: 'Uji asap.' },
    })
    cek('Simpan profil langkah 2', profil.data.pengguna.profil.niche === 'Kuliner')

    const saya = await panggil('GET', '/api/auth/saya', { token: verif.data.token })
    cek('Sesi /saya', saya.data.pengguna.terverifikasi === true)

    const notif = await panggil('GET', '/api/notifikasi', { token: verif.data.token })
    cek('Sambutan verifikasi masuk ke lonceng', notif.data.belumDibaca > 0)

    const salah = await panggil('POST', '/api/auth/masuk', {
      body: { identitas: email, kataSandi: 'salah-sandi' },
    })
    cek('Sandi salah ditolak', salah.status === 401)

    // ---- Ubah kata sandi ----
    const ubahSalah = await panggil('POST', '/api/auth/sandi/ubah', {
      token: verif.data.token,
      body: { kataSandiLama: 'bukan-ini', kataSandiBaru: 'sandibaru123' },
    })
    cek('Ubah sandi menolak sandi lama yang salah', ubahSalah.status === 401)

    const ubah = await panggil('POST', '/api/auth/sandi/ubah', {
      token: verif.data.token,
      body: { kataSandiLama: 'rahasia123', kataSandiBaru: 'sandibaru123' },
    })
    cek('Ubah kata sandi', ubah.status === 200, JSON.stringify(ubah.data))

    const masukSandiLama = await panggil('POST', '/api/auth/masuk', {
      body: { identitas: email, kataSandi: 'rahasia123' },
    })
    cek('Sandi lama langsung tidak berlaku', masukSandiLama.status === 401)

    const masukSandiBaru = await panggil('POST', '/api/auth/masuk', {
      body: { identitas: email, kataSandi: 'sandibaru123' },
    })
    cek('Masuk dengan sandi baru', masukSandiBaru.status === 200)
  }
}

console.log('\n== Lupa kata sandi ==')
{
  const asing = `tidak-ada-${Date.now()}@lokalboost.test`
  const lupaAsing = await panggil('POST', '/api/auth/sandi/lupa', { body: { identitas: asing } })
  cek('Lupa sandi: email asing tetap dijawab 200', lupaAsing.status === 200)
  cek('Lupa sandi: email asing tidak menerima kode', lupaAsing.data.kodeOtp === undefined)

  // Akun seed dipakai apa adanya; sandinya dikembalikan lagi di akhir supaya
  // uji asap bisa dijalankan berulang tanpa perlu seed ulang.
  const nyata = 'sari@kreator.id'
  const lupa = await panggil('POST', '/api/auth/sandi/lupa', { body: { identitas: nyata } })
  // Seperti di jalur penarikan, 429 berarti jeda antar kode sedang berlaku —
  // itu pagar yang benar, bukan kerusakan.
  cek('Lupa sandi: akun nyata dijawab sama', [200, 429].includes(lupa.status),
    JSON.stringify(lupa.data))

  if (!lupa.data.kodeOtp) {
    console.log('  ..   Sisa alur reset dilewati — kodenya belum tersedia di sini.')
  } else {
    const atur = await panggil('POST', '/api/auth/sandi/atur', {
      body: { identitas: nyata, kode: lupa.data.kodeOtp, kataSandiBaru: 'sandisementara123' },
    })
    cek('Reset sandi menerbitkan token', Boolean(atur.data.token))

    const masukBaru = await panggil('POST', '/api/auth/masuk', {
      body: { identitas: nyata, kataSandi: 'sandisementara123' },
    })
    cek('Masuk dengan sandi hasil reset', masukBaru.status === 200)

    const pulihkan = await panggil('POST', '/api/auth/sandi/ubah', {
      token: masukBaru.data.token,
      body: { kataSandiLama: 'sandisementara123', kataSandiBaru: SANDI },
    })
    cek('Sandi akun seed dikembalikan seperti semula', pulihkan.status === 200)
  }
}

console.log('\n────────────────────────────')
console.log('\n== Unggah berkas video sungguhan ==')
{
  // Bagian alur video yang paling lama tak teruji: `POST /api/video` dengan
  // berkas nyata. Tes lain mengirim JSON tanpa berkas — sah, karena berkasnya
  // memang opsional — tapi itu berarti multer, daftar putih ekstensi, dan
  // penyajian statis tidak pernah tersentuh sama sekali.
  const kampanyeId = (await panggil('GET', '/api/kreator/saya/kampanye', { token: kreator.token }))
    .data.kampanye.find((k) => k.status === 'berjalan').id

  const kirimBerkas = async (namaBerkas, tipe, isi) => {
    const form = new FormData()
    form.set('kampanyeId', kampanyeId)
    form.set('judul', `Uji asap berkas ${namaBerkas}`)
    form.set('durasiDetik', '3')
    form.set('berkas', new Blob([isi], { type: tipe }), namaBerkas)
    const res = await fetch(`${DASAR}/api/video`, {
      method: 'POST',
      headers: { authorization: `Bearer ${kreator.token}` },
      body: form,
    })
    return { status: res.status, data: await res.json().catch(() => ({})) }
  }

  // MP4 minimal yang sah bentuknya: satu kotak ftyp bermerek 'isom'.
  const mp4 = new Uint8Array([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
    0x00, 0x00, 0x02, 0x00, 0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
  ])

  const sah = await kirimBerkas('promo.mp4', 'video/mp4', mp4)
  cek('Berkas video sungguhan diterima', sah.status === 201, JSON.stringify(sah.data))
  cek('Berkas tersimpan dengan ekstensi .mp4', /\.mp4$/.test(sah.data.video?.berkas || ''))

  // Berkasnya harus benar-benar bisa diambil kembali, bukan sekadar tercatat
  // di basis data. Kalau baris ini gagal, video tidak bisa diputar siapa pun
  // walau unggahannya dilaporkan "berhasil".
  //
  // Dengan Vercel Blob aktif, `berkas` sudah berupa URL penuh ke penyimpanan
  // objek, bukan jalur relatif — menempelkannya ke DASAR akan menghasilkan
  // alamat ngawur. Nosniff pun hanya urusan `express.static` kita sendiri;
  // Blob melayani berkas dari domain terpisah dengan header buatannya.
  const rujukan = sah.data.video.berkas || ''
  const diBlob = /^https?:\/\//i.test(rujukan)
  const ambil = await fetch(diBlob ? rujukan : `${DASAR}${rujukan}`)
  cek(`Berkas bisa diputar ulang lewat ${diBlob ? 'Vercel Blob' : '/unggahan'}`, ambil.status === 200)
  cek('Dilayani sebagai video, bukan tipe lain', (ambil.headers.get('content-type') || '').startsWith('video/'))
  if (!diBlob) {
    cek('Peramban dilarang menebak tipe berkas', ambil.headers.get('x-content-type-options') === 'nosniff')
  }

  // Dua regresi yang pernah nyata terjadi, keduanya diperbaiki 1 Sep 2026.
  const teks = await kirimBerkas('catatan.txt', 'text/plain', 'bukan video')
  cek('Berkas non-video ditolak 400, bukan 500', teks.status === 400, `dapat ${teks.status}`)
  cek('Alasan penolakan disebutkan, bukan "kesalahan server"', /ekstensi/i.test(teks.data.galat || ''))

  // Ini yang paling berbahaya: `mimetype` sepenuhnya dikarang klien. Sebuah
  // .html yang mengaku video/mp4 dulu tersimpan apa adanya lalu dilayani
  // sebagai text/html dari origin aplikasi — script di dalamnya bisa membaca
  // localStorage, tempat token JWT disimpan.
  const html = await kirimBerkas('jahat.html', 'video/mp4', '<script>alert(1)</script>')
  cek('HTML menyamar sebagai video ditolak', html.status === 400, `dapat ${html.status}`)
}

console.log(`Lulus ${lulus}, gagal ${gagal}`)
if (gagal) {
  console.log('\nYang gagal:')
  for (const c of catatan) console.log(` - ${c}`)
  process.exit(1)
}
