# ⛪ ChurchSched - Aplikasi Penjadwalan Pelayanan Gereja

## Deskripsi Proyek

**ChurchSched** adalah aplikasi web untuk mengelola jadwal pelayanan ibadah gereja secara otomatis dan adil. Aplikasi ini dirancang untuk menjadwalkan 48 anggota jemaat ke dalam tiga peran pelayanan setiap hari Minggu:

| Peran | Jumlah per Minggu | Keterangan |
|-------|-------------------|------------|
| **Liturgos** | 1 orang | Pembaca liturgi |
| **Kolektan** | 2 orang | Pengumpul persembahan |
| **Singer** | 3 orang | Penyanyi / paduan suara |

Jadwal disusun per semester (6 bulan) dan dapat dipublikasikan agar seluruh jemaat dapat melihatnya.

---

## Teknologi

| Komponen | Teknologi |
|----------|-----------|
| Frontend | HTML, CSS, JavaScript (Vanilla) |
| Backend & Database | [Supabase](https://supabase.com) (PostgreSQL) |
| Autentikasi | Supabase Auth |
| Keamanan Data | Row Level Security (RLS) |
| Hosting | [Vercel](https://vercel.com) (static site) |

---

## Persiapan Supabase

### 1. Buat Proyek Supabase

1. Buka [supabase.com](https://supabase.com) dan buat akun (gratis).
2. Klik **New Project** dan isi detail proyek:
   - **Name**: `churchsched` (atau nama lain sesuai keinginan)
   - **Database Password**: buat password yang kuat (simpan baik-baik)
   - **Region**: pilih region terdekat (misalnya Singapore)
3. Tunggu hingga proyek selesai dibuat.

### 2. Jalankan Schema SQL

1. Di dashboard Supabase, buka menu **SQL Editor**.
2. Klik **New Query**.
3. Salin seluruh isi file `sql/schema.sql` dan tempel di editor.
4. Klik **Run** untuk menjalankan query.
5. Pastikan tidak ada error. Semua tabel, indeks, kebijakan RLS, trigger, dan view akan otomatis terbuat.

### 3. Buat Pengguna Admin Pertama

1. Buka menu **Authentication** > **Users** di dashboard Supabase.
2. Klik **Add User** > **Create New User**.
3. Masukkan email dan password untuk akun admin.
4. Setelah pengguna dibuat, trigger otomatis akan membuat profil dengan role `admin` (karena ini pengguna pertama).

> **Catatan:** Jika trigger tidak berjalan, Anda bisa membuat profil secara manual. Lihat bagian [Membuat Admin Pertama](#membuat-admin-pertama) di bawah.

### 4. Dapatkan Kredensial API

1. Buka menu **Settings** > **API** di dashboard Supabase.
2. Catat dua nilai berikut:
   - **Project URL** — contoh: `https://xxxxx.supabase.co`
   - **anon/public key** — string panjang yang dimulai dengan `eyJ...`

---

## Konfigurasi

### Edit `js/config.js`

Buka file `js/config.js` dan ganti placeholder dengan kredensial Supabase Anda:

```javascript
const SUPABASE_URL = 'https://xxxxx.supabase.co';      // Ganti dengan Project URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJI...';           // Ganti dengan anon/public key
```

### Sesuaikan Nama Gereja

Di file yang sama, ubah nama gereja sesuai kebutuhan:

```javascript
const APP_CONFIG = {
    churchName: 'Gereja HKBP Jakarta',  // Ganti dengan nama gereja Anda
    rolesPerSunday: {
        Liturgos: 1,
        Kolektan: 2,
        Singer: 3
    },
    totalPerSunday: 6
};
```

---

## Menjalankan Lokal

Karena ChurchSched adalah aplikasi statis (HTML/CSS/JS), Anda bisa menjalankannya dengan server file statis apa pun:

### Opsi 1: VS Code Live Server
1. Install ekstensi **Live Server** di VS Code.
2. Buka folder proyek di VS Code.
3. Klik kanan pada `index.html` > **Open with Live Server**.

### Opsi 2: npx serve
```bash
# Pastikan Node.js sudah terinstal
npx serve .
```

### Opsi 3: Python HTTP Server
```bash
# Python 3
python -m http.server 8000

# Buka di browser: http://localhost:8000
```

---

## Deploy ke Vercel

### 1. Push ke GitHub

```bash
git init
git add .
git commit -m "Initial commit: ChurchSched"
git remote add origin https://github.com/username/churchsched.git
git push -u origin main
```

### 2. Deploy via Vercel

1. Buka [vercel.com](https://vercel.com) dan login dengan akun GitHub.
2. Klik **Add New** > **Project**.
3. Pilih repository `churchsched`.
4. Framework Preset: pilih **Other** (karena ini static site).
5. Klik **Deploy**.
6. Vercel akan otomatis membaca `vercel.json` untuk konfigurasi routing dan caching.

> **Tips:** Setiap kali Anda push ke branch `main`, Vercel akan otomatis melakukan re-deploy.

---

## Membuat Admin Pertama

Jika trigger otomatis tidak membuat profil admin, Anda bisa melakukannya secara manual:

### Langkah 1: Daftarkan Pengguna
Buat pengguna baru melalui **Supabase Dashboard** > **Authentication** > **Users** > **Add User**.

### Langkah 2: Buat Profil Admin via SQL
Buka **SQL Editor** di Supabase dan jalankan query berikut:

```sql
-- Ganti 'USER_ID_DISINI' dengan UUID pengguna dari tabel auth.users
INSERT INTO public.profiles (id, role)
VALUES ('USER_ID_DISINI', 'admin');
```

Untuk menemukan UUID pengguna:
```sql
SELECT id, email FROM auth.users;
```

---

## Struktur File

```
churchsched/
├── index.html              # Halaman utama (jadwal publik)
├── login.html              # Halaman login untuk admin
├── admin.html              # Dashboard admin
├── members.html            # Kelola data anggota jemaat
├── generate.html           # Generate jadwal otomatis
├── vercel.json             # Konfigurasi deployment Vercel
├── README.md               # Dokumentasi proyek (file ini)
├── css/
│   └── style.css           # Stylesheet utama
├── js/
│   ├── config.js           # Konfigurasi Supabase & aplikasi
│   ├── auth.js             # Modul autentikasi (login/logout)
│   ├── members.js          # CRUD data anggota
│   ├── schedule.js         # Logika penjadwalan & generate
│   └── app.js              # Logika utama & navigasi
└── sql/
    └── schema.sql          # Skema database PostgreSQL
```

---

## Fitur

### 📋 Manajemen Anggota
- Tambah, edit, dan hapus data anggota jemaat
- Tandai kemampuan pelayanan setiap anggota (Liturgos, Kolektan, Singer)
- Catat jenis kelamin untuk distribusi yang merata

### 📅 Penjadwalan Otomatis
- Generate jadwal pelayanan satu semester secara otomatis
- Distribusi penugasan yang adil dan merata untuk semua anggota
- Pastikan setiap anggota hanya ditugaskan sesuai kemampuannya
- Hindari penugasan ganda pada hari yang sama

### 📢 Publikasi Jadwal
- Simpan jadwal sebagai draft selama masih dalam penyusunan
- Publikasikan jadwal agar bisa dilihat seluruh jemaat
- Jadwal yang dipublikasikan dapat diakses tanpa login

### 🔐 Keamanan
- Autentikasi pengguna via Supabase Auth
- Row Level Security (RLS) untuk proteksi data
- Hanya admin yang bisa mengelola data dan jadwal
- Pengguna anonim hanya bisa melihat jadwal yang dipublikasikan

### 📱 Responsif
- Tampilan yang responsif untuk desktop dan mobile
- Dapat diakses dari browser apa pun

---

## Lisensi

Proyek ini dibuat untuk keperluan internal gereja. Silakan gunakan dan modifikasi sesuai kebutuhan.

---

> Dibuat dengan ❤️ untuk pelayanan gereja.
