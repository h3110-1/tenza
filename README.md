# Tenza

> Search a show, tag it, rate it, and drag to rank your favourites.

A lightweight web app for tracking, tagging, rating, and ranking your favourite anime. It's a single self-contained HTML file — no build step, no server, no install. Just open it in a browser.

## Features

### 🔎 Search & add
- Search any anime by name, powered by the free [Jikan](https://jikan.moe/) (MyAnimeList) API — cover art, year, and details are pulled in automatically.
- Understands popular fan **abbreviations**: type `jjk` for *Jujutsu Kaisen*, `mha` for *My Hero Academia*, `aot` for *Attack on Titan*, and many more.
- Press **Enter** to instantly add the top search result.

### ⭐ Rate
- A precise **1–10 rating** with decimals (e.g. `7.4`), set with a row of clickable bars plus a second row for the tenths.

### 🏆 Rank
- **Drag and drop** your rated shows to put them in your personal order.
- Newly added shows sit in a separate **Unrated** section until you score them, then they move up into your ranked list.

### 🏷️ Tag & filter
- Shows are **auto-tagged** from their genres, themes, and demographics on add.
- Add or remove your own tags freely.
- Filter the list by clicking any tag, or use the **search box** to filter by title or tag (abbreviations work here too).

### 📺 Watch status
- Mark each show as **Watching, Completed, Plan to watch, On hold,** or **Dropped**.
- Filter your list by status, with live counts per status.
- Currently-broadcasting shows get an **AIRING** badge and their broadcast schedule.

### 👥 Profiles
- Keep **separate lists for different people** — switch, rename, and delete profiles. Each person's shows, tags, ratings, and ranking are kept apart.

### 💾 Saving
- Everything is saved automatically in your browser's local storage, so your lists persist between sessions on that machine.

## Usage

Download or clone the repository and open `index.html` in any modern browser (double-click it, or drag it into Chrome/Edge/Firefox). That's it.

```
git clone https://github.com/h3110-1/tenza.git
cd tenza
# then open index.html in your browser
```

## Notes
- Your data lives only in the browser on the machine where you use it — it doesn't sync across devices or browsers, and clearing site data will remove it.
- Image and search data are provided by [Jikan](https://jikan.moe/), which applies light rate limits; if a search ever fails, just try again.

## Credits
- Anime data and images: [Jikan API](https://jikan.moe/) (unofficial MyAnimeList API).
