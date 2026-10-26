# 🎵 Vedha Music Player — Infinite HD Sound Universe

![Vedha Music Banner](https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=1200&auto=format&fit=crop)

**Vedha Music Player** is a next-generation, glassmorphic web-based streaming application delivering studio-quality **320 KBPS HD audio**, an extensive **Stars & Playlists Universe** of over **526 artists and 408 singers**, intelligent mood filters, and an autonomous **Strict Filmography & Vocal Verification Engine**.

Designed with cyber-luxury aesthetics, interactive 3D star cards, and seamless real-time recommendation intelligence tuned to present trends.

---

## 🌟 Key Highlights & Features

### 1. 👑 Native Stars & Playlists Universe (526+ Artists)
- **Categorized Multi-Language Hub**: Native dedicated hubs across **8 language ecosystems**:
  - **Tamil** (103 stars: Rajini, Vijay, Ajith, Kamal, Suriya, Nayanthara, Samantha, Trisha, Anirudh, AR Rahman, Yuvan, Hiphop Tamizha, SPB, etc.)
  - **Telugu** (68 stars: Prabhas, Allu Arjun, Mahesh Babu, Jr NTR, Ram Charan, Samantha, Rashmika, Devi Sri Prasad, Thaman, SPB, etc.)
  - **Kannada** (54 stars: Yash, Puneeth Rajkumar, Shiva Rajkumar, Sudeep, Rakshit Shetty, Hamsalekha, Gurukiran, Ravi Basrur, Sanjith Hegde, etc.)
  - **Hindi** (84 stars: SRK, Salman, Aamir, Ranbir, Deepika, Alia, Arijit Singh, Kishore Kumar, Lata Mangeshkar, RD Burman, Bappi Lahiri, etc.)
  - **Malayalam** (52 stars: Mohanlal, Mammootty, Dulquer Salmaan, Fahadh Faasil, Manju Warrier, Sushin Shyam, Yesudas, Chithra, etc.)
  - **Punjabi** (50 stars: Diljit Dosanjh, Sidhu Moose Wala, Karan Aujla, AP Dhillon, Shubh, Bohemia, Gurdas Maan, etc.)
  - **English / Global** (65 stars: The Beatles, Elvis Presley, Michael Jackson, Queen, Eminem, Taylor Swift, Drake, The Weeknd, Linkin Park, etc.)
  - **All-Star Global Mix** (50 universal titans)
- **408 Singers Catalog**: From indie, gaana, folk, and classical to golden-era playback legends (including *Hiphop Tamizha, Vijay Antony, Paal Dabba, Gaana Bala, Kapil Kapilan, Sivaangi Krishnakumar, Sam CS, Malaysia Vasudevan, SP Charan*, and more).
- **Curved 3D Cards**: Engineered with `border-radius: 22px`, subtle perspective tilt, holographic badges (`👑 HERO`, `💃 HEROINE`, `🎤 SINGER`, `🎵 COMPOSER`, `100+ HITS`), and smooth carousel swiping.

### 2. 🎯 Strict Filmography & Vocal Verification Engine
- **Actor/Hero Filmography Matcher**: When clicking any hero (e.g., **Thalapathy Vijay**, **Rajinikanth**, **Ajith Kumar**), the backend strictly queries and filters to ensure **100% of returned tracks are from films they acted in or songs sung by them**, automatically eliminating accidental name collisions or unrelated playlists.
- **Heroine Filmography Matcher**: Strict cast verification for leading heroines (e.g., **Samantha**, **Trisha**, **Nayanthara**, **Keerthy Suresh**, **Sai Pallavi**).
- **Vocal/Composer Credit Verification**: Validates artist metadata against song credits (`singers`, `music`, `artist`, `primary_artists`) to guarantee that singer playlists contain songs genuinely sung or composed by that specific artist.

### 3. 🎭 Smart Mood & Vibe Filters
- **14 Dynamic Mood Dimensions**:
  - `🔥 Top Hits`, `⚡ Party & Kuthu`, `❤️ Romantic`, `✨ Feel Good`, `🚗 Night Drive`, `💔 Heartbreak`, `🌧️ Rain Vibes`, `🏋️ Workout`, `📻 90s Retro`, `🎧 Chill Lofi`, `🕉️ Devotional`, `🥂 Celebration`, `🎸 Acoustic`, `🛡️ Mass BGM`
- **Language-Isolated Filtering**: Mood queries automatically adapt to the user's currently selected language (e.g. clicking *Devotional* in Tamil displays *Tamil Devotional*, in Telugu displays *Telugu Devotional*, etc.).
- **Smooth Auto-Scroll**: Selecting any mood chip or artist card smoothly scrolls directly to the track view without viewport jump.

### 4. 🔮 "Made For You" Real-Time Recommendation Engine
- **Taste-Adaptive Intelligence**: Analyzes the user's listening queue, favorites, and played artists to dynamically generate tailored playlists.
- **2026 Trend Synchronization**: Integrates current viral charts, billboard trackers, and regional breakout songs with a single click via `Sync Trends`.

### 5. 🎧 Studio-Grade 320 KBPS Audio Engine
- **Direct High-Fidelity Streaming**: Fetches 320 kbps MP4/AAC streams directly via authenticated DES decryption.
- **Persistent Media Player**: Includes live scrubbing, volume regulation, continuous playback, shuffle, loop, and interactive queue inspection.
- **Interactive Visuals**: Fullscreen player mode, responsive canvas visualizers, track favoriting, and persistent browser storage.

---

## 🛠️ Technology Stack

| Layer | Technologies Used |
| :--- | :--- |
| **Frontend** | Vanilla HTML5, Vanilla Modern CSS3 (Glassmorphism, CSS Custom Properties, Flexbox, CSS Grid), Vanilla ES6+ JavaScript |
| **Backend** | Node.js, Express 5, `node-fetch`, `cors` |
| **Cryptography** | `crypto-js` (Triple-DES stream URL decryption for JioSaavn CDN audio assets) |
| **Data & Media** | Official JioSaavn CDN (500x500 HD Cover Arts, Lossless 320 kbps media links) |
| **Storage** | Browser `localStorage` for favorites, recent listening history, and sound preferences |

---

## 📂 Project Architecture

```
Vedha music player/
├── public/
│   └── index.html          # Unified glassmorphic frontend UI & state engine
├── server.js               # Express API backend, DES stream decryptor & strict filmography engine
├── package.json            # Project manifest and backend dependencies
├── package-lock.json       # Exact lockfile for reproducible installations
└── README.md               # Project documentation
```

---

## 🚀 Quick Start Guide

### Prerequisites
- [Node.js](https://nodejs.org/) (v16.0.0 or later recommended)
- `npm` (bundled with Node.js)

### 1. Installation
Clone or navigate to the repository directory and install the required dependencies:

```bash
cd "Vedha music player"
npm install
```

### 2. Launch the Application
Start the Node.js backend server:

```bash
npm start
```
*Or using node directly:*
```bash
node server.js
```

The server will initialize on port **5000**:
```
Server running on http://localhost:5000
```

### 3. Open in Browser
Open your browser of choice and visit:
```
http://localhost:5000
```

---

## 📡 API Reference

### 1. Unified Search Endpoint
```http
GET /api/search?q={query}&lang={language}&artistId={artistId}&artistRole={role}&artistName={name}
```
- **Parameters**:
  - `q`: Search keyword or playlist title (e.g. `Hiphop Tamizha Tamil Hits`).
  - `lang`: (Optional) Target language filter (`Tamil`, `Telugu`, `Kannada`, `Hindi`, `Malayalam`, `Punjabi`, `English`, `All`).
  - `artistId`: (Optional) Unique artist identifier for strict verification.
  - `artistRole`: (Optional) `hero`, `heroine`, or `singer`.
  - `artistName`: (Optional) Standardized artist name for filmography and vocal credit matching.
- **Response**:
```json
{
  "tracks": [
    {
      "id": "track_id",
      "title": "Aura 10/10 (From \"Meesaya Murukku 2\")",
      "artist": "Hiphop Tamizha, Thamizh Aadhavan",
      "album": "Meesaya Murukku 2",
      "image": "https://c.saavncdn.com/...",
      "url": "https://aac.saavncdn.com/...",
      "duration": "02:09"
    }
  ]
}
```

### 2. Direct Stream Decryption Endpoint
```http
GET /api/song?id={song_id}
```
Decrypts encrypted Saavn media links into direct 320 kbps streaming URLs.

### 3. Real-Time Trending Endpoint
```http
GET /api/trending?lang={language}
```
Returns curated real-time charts and top-played singles.

---

## 🎨 UI Architecture & Glassmorphic System
- **Color Palette**:
  - Background: Cyber-Dark Deep Space (`#0a0814`, `#120e24`)
  - Neon Accent 1: Magenta Pink (`#ec4899`)
  - Neon Accent 2: Cyan Aqua (`#06b6d4`)
  - Neon Accent 3: Electric Purple (`#8b5cf6`)
  - Neon Accent 4: Amber Gold (`#f59e0b`)
- **Glass Effects**: Multi-layered backdrop filters with variable blur (`backdrop-filter: blur(16px)` to `blur(24px)`), translucent border highlights (`rgba(255, 255, 255, 0.08)`), and ambient box-shadows.
- **Motion & Responsiveness**: Smooth CSS transitions, perspective 3D card hover angles, and adaptive mobile/tablet/desktop layouts.

---

## 📄 License
This project is for educational, personal, and research purposes. All audio and visual content belongs to their respective copyright holders.
