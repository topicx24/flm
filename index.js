const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

let API_KEY = process.env.TMDB_API_KEY;
if (API_KEY) API_KEY = API_KEY.trim();

if (!API_KEY || API_KEY === "") {
    console.error("❌ HATA: TMDB_API_KEY bulunamadı!");
    process.exit(1);
}

if (!fs.existsSync('filmler')) {
    fs.mkdirSync('filmler');
}

const processedMovies = new Set();
const GENRES = {
    28: "Aksiyon", 12: "Macera", 16: "Animasyon", 35: "Komedi",
    80: "Suç", 99: "Belgesel", 18: "Dram", 10751: "Aile",
    14: "Fantastik", 36: "Tarih", 27: "Korku", 10402: "Müzik",
    9648: "Gizem", 10749: "Romantik", 878: "Bilim Kurgu",
    53: "Gerilim", 10752: "Savaş", 37: "Western"
};

const GENRE_ICONS = {
    "Aksiyon": "💥", "Komedi": "😂", "Dram": "🎭", "Korku": "👻",
    "Bilim Kurgu": "🚀", "Romantik": "💕", "Macera": "🗺️", "Suç": "🔫",
    "Gerilim": "🔪", "Animasyon": "🐭", "Aile": "👨‍👩‍👧", "Fantastik": "🧙",
    "Tarih": "📜", "Savaş": "⚔️", "Gizem": "🔍", "Müzik": "🎵",
    "Western": "🤠", "Belgesel": "🎥", "Diğer": "🎬"
};

async function getImdbId(tmdbId) {
    if (processedMovies.has(tmdbId)) return null;
    try {
        // DÜZELTME: Doğru TMDB API domain ve değişken bağlama ($) eklendi
        const url = `https://api.themoviedb.org/3/movie/${tmdbId}/external_ids?api_key=${API_KEY}`;
        const response = await axios.get(url);
        return response.data.imdb_id || null;
    } catch (error) { 
        return null; 
    }
}

async function fetchFromStreamingAPI() {
    const movies = [];
    const endpoints = ['popular', 'top_rated'];

    for (const endpoint of endpoints) {
        console.log(`📡 TMDB üzerinden '${endpoint}' listesi taranıyor...`);
        for (let page = 1; page <= 3; page++) {
            try {
                // DÜZELTME: Doğru endpoint yolu ve ($) eklendi
                const url = `https://api.themoviedb.org/3/movie/${endpoint}?api_key=${API_KEY}&language=tr&page=${page}`;
                const response = await axios.get(url);
                if (!response.data || !response.data.results) continue;

                for (const movie of response.data.results) {
                    if (processedMovies.has(movie.id)) continue;
                    
                    const imdbId = await getImdbId(movie.id);
                    if (imdbId) {
                        processedMovies.add(movie.id);
                        
                        let mainGenre = "Diğer";
                        if (movie.genre_ids && Array.isArray(movie.genre_ids) && movie.genre_ids.length > 0) {
                            const firstGenreId = movie.genre_ids[0];
                            mainGenre = GENRES[firstGenreId] || "Diğer";
                        }
                        
                        const movieTitle = movie.title || movie.original_title || "Film";
                        const releaseYear = movie.release_date ? movie.release_date.split('-')[0] : "2026";
                        const slugifiedTitle = encodeURIComponent(movieTitle.toLowerCase());

                        movies.push({
                            title: movieTitle,
                            year: releaseYear,
                            // DÜZELTME: Doğru şablon dizesi formatı ($)
                            link: createVsLink(imdbId),
                            backupLink: `https://2embed.cc/embed/${movie.id}`,
                            hdFilmCehennemi: `https://hdfilmcehennemi.nl/arama/${slugifiedTitle}`,
                            fullHdFilmizlesene: `https://fullhdfilmizlesene.now/arama/${slugifiedTitle}`,
                            poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : "",
                            rating: movie.vote_average ? movie.vote_average.toFixed(1) : "0.0",
                            mainGenre: mainGenre
                        });
                    }
                }
            } catch (err) {
                console.error(`⚠️ ${endpoint} sayfa ${page} hatası:`, err.message);
            }
        }
    }
    return movies;
}

function createM3U(movies) {
    let m3u = '#EXTM3U\n';
    m3u += `# Toplam: ${movies.length} film\n`;
    m3u += `# Güncelleme: ${new Date().toLocaleDateString('tr-TR')} - ${new Date().toLocaleTimeString('tr-TR')}\n\n`;

    const moviesByGenre = {};
    for (const movie of movies) {
        if (!moviesByGenre[movie.mainGenre]) moviesByGenre[movie.mainGenre] = [];
        moviesByGenre[movie.mainGenre].push(movie);
    }

    for (const genre of Object.keys(moviesByGenre)) {
        const icon = GENRE_ICONS[genre] || "🎬";
        m3u += `# === ${icon} ${genre.toUpperCase()} (${moviesByGenre[genre].length} ADET) ===\n`;
        for (const m of moviesByGenre[genre]) {
            m3u += `#EXTINF:-1 tvg-id="" tvg-name="${m.title}" tvg-logo="${m.poster}" group-title="${icon} ${genre}", ${m.title} (${m.year}) ⭐ ${m.rating}\n`;
            m3u += `${m.link}\n`;

            m3u += `#EXTINF:-1 tvg-id="" tvg-name="[YEDEK] ${m.title}" tvg-logo="${m.poster}" group-title="${icon} ${genre} [YEDEK]", [YEDEK] ${m.title} (${m.year}) ⭐ ${m.rating}\n`;
            m3u += `${m.backupLink}\n`;
        }
        m3u += `\n`;
    }

    fs.writeFileSync('filmler/film_arsivi.m3u', m3u, 'utf-8');
    console.log(`💾 M3U Başarıyla Yazıldı! Toplam film sayısı: ${movies.length}`);
}

(async () => {
    const allMovies = await fetchFromStreamingAPI();
    createM3U(allMovies);
})();
