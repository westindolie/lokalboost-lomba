import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MotionConfig } from 'motion/react'
import './index.css'
import App from './App.jsx'
import { SesiProvider } from './sesi.jsx'
import { DrafKampanyeProvider } from './draf.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      {/* Sesi dibaca dari token, bukan dari alamat halaman — tapi tetap di
          dalam Router supaya penjaga rute bisa mengalihkan ke /masuk. */}
      <SesiProvider>
        {/* reducedMotion="user" — animasi otomatis mati bila pengguna
            mengaktifkan "reduce motion" di sistemnya (aksesibilitas, PRD §9). */}
        <MotionConfig reducedMotion="user">
          {/* Draf kampanye hidup selama sesi menyusun, menyeberangi ketiga
              langkah wizard yang masing-masing berupa rute terpisah. */}
          <DrafKampanyeProvider>
            <App />
          </DrafKampanyeProvider>
        </MotionConfig>
      </SesiProvider>
    </BrowserRouter>
  </StrictMode>,
)
