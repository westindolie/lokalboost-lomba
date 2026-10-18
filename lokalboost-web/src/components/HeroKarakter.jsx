import { useEffect, useRef } from 'react'

/**
 * Karakter berjalan di hero halaman depan.
 *
 * Berkasnya video, bukan GIF: 8 detik 720x900 h264 (~700 KB) versus GIF setara
 * yang menembus 8 MB. Audio sudah dibuang saat encode, bukan sekadar di-mute —
 * berkas tanpa trek audio tidak pernah bisa membangunkan indikator "situs ini
 * memutar suara" di tab peramban.
 *
 * KENAPA ADA PENJAGA (watchdog) DI BAWAH:
 * atribut `loop` saja TIDAK cukup untuk "tidak pernah berhenti". Peramban
 * menghentikan pemutaran di beberapa keadaan yang semuanya wajar terjadi saat
 * juri menilai:
 *   - tab dipindah ke belakang lalu dibuka lagi (Chrome menjeda, tidak selalu
 *     melanjutkan sendiri),
 *   - laptop masuk mode hemat daya / baterai rendah,
 *   - jaringan tersendat sesaat sehingga buffer habis (`stalled`/`waiting`),
 *   - autoplay ditolak di pemuatan pertama karena halaman belum "aktif".
 * Semua itu ditangkap dan dijawab dengan play() ulang.
 *
 * SENGAJA TIDAK mengikuti "prefers-reduced-motion", berbeda dari
 * ShaderBackground dan MotionConfig di main.jsx. Alasannya bukan lupa:
 * laptop yang dipakai menyiapkan proyek ini menyalakan setelan itu, dan
 * komputer panitia lomba bisa saja sama — hero-nya akan tampil sebagai gambar
 * diam persis di layar pertama yang dilihat juri. Risikonya rendah karena
 * karakternya berjalan di tempat dalam bingkai kecil: tidak ada parallax,
 * kilat, zoom, atau putaran yang menjadi alasan setelan itu ada.
 * Kalau kelak ingin dipatuhi lagi, bungkus <video> dengan pemeriksaan
 * matchMedia('(prefers-reduced-motion: reduce)') dan tampilkan
 * /hero-kreator.jpg sebagai gantinya.
 */
export default function HeroKarakter({ className = '' }) {
  const ref = useRef(null)

  useEffect(() => {
    const v = ref.current
    if (!v) return

    // play() mengembalikan Promise yang MENOLAK bila autoplay diblokir. Tanpa
    // .catch() penolakan itu muncul sebagai "Uncaught (in promise)" di konsol —
    // bising, dan menutupi galat sungguhan saat mendemokan aplikasi.
    const putar = () => {
      const p = v.play()
      if (p?.catch) p.catch(() => {})
    }

    const saatTerlihat = () => {
      if (!document.hidden) putar()
    }

    // 'ended' tetap didengarkan walau ada atribut loop: pada sebagian peramban
    // loop gagal menyambung bila bingkai terakhir kebetulan belum ter-buffer.
    const peristiwa = ['pause', 'ended', 'stalled', 'waiting', 'suspend', 'canplay', 'loadeddata']
    peristiwa.forEach((n) => v.addEventListener(n, putar))
    document.addEventListener('visibilitychange', saatTerlihat)

    // Jaring pengaman terakhir: kalau semua peristiwa di atas luput (mode hemat
    // daya kadang menjeda tanpa memicu 'pause'), periksa sendiri tiap 2 detik.
    const denyut = setInterval(() => {
      if (!document.hidden && v.paused) putar()
    }, 2000)

    putar()

    return () => {
      peristiwa.forEach((n) => v.removeEventListener(n, putar))
      document.removeEventListener('visibilitychange', saatTerlihat)
      clearInterval(denyut)
    }
  }, [])

  return (
    <div className={`relative ${className}`} aria-hidden="true">
      {/* Cahaya emas di belakang karakter — menahan sosoknya agar tidak melayang
          di ruang kosong. Sengaja berupa gradien radial yang sangat kabur, bukan
          bidang berbatas: hero ini SUDAH punya gradien kuning dari
          ShaderBackground, dan bentuk bertepi jelas di atasnya langsung terbaca
          sebagai dua lapis kuning yang bertabrakan. */}
      <div className="pointer-events-none absolute inset-x-6 bottom-10 top-16 rounded-full bg-gold/50 blur-3xl" />

      {/* mix-blend-multiply: kunci supaya karakter tidak tampil sebagai kotak.
          Video ini punya latar krem sendiri (#FBF4E6 → #FBEFD8) yang, di atas
          krem halaman #FCF9F2, tetap terbaca sebagai persegi panjang — persis
          yang terjadi pada versi pertama. Multiply membuat piksel terang
          mendekati netral sehingga latarnya larut, sementara garis gelap
          karakternya tetap pekat.
          Dipilih ketimbang WebM beralpha karena alpha VP9 tidak dijamin jalan
          di Safari, dan satu berkas h264 sudah cukup untuk semua peramban. */}
      <video
        ref={ref}
        // mask-image: latar video sudah diputihkan saat encode, tapi bagian
        // gradien paling kuning menyisakan kabut tipis yang di tepi kanan
        // bingkai terbaca sebagai garis vertikal. Hanya 8% sisi kanan yang
        // dilarutkan — cukup untuk menghapus garisnya, dan masih di sebelah
        // kanan ponsel (tepi karakter terjauh ada di ~87% lebar bingkai).
        className="relative mx-auto block w-full max-w-[420px] select-none mix-blend-multiply [mask-image:linear-gradient(to_left,transparent_0%,#000_8%)]"
        src="/hero-kreator.mp4"
        poster="/hero-kreator.jpg"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        // disablePictureInPicture + kontrol dimatikan: ini elemen dekoratif,
        // bukan konten yang boleh dijeda penonton.
        disablePictureInPicture
        controls={false}
        tabIndex={-1}
      />

    </div>
  )
}
