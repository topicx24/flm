const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

// .env dosyasından veya doğrudan buradan TMDB API anahtarınızı okuyun
const API_KEY = (process.env.TMDB_API_KEY || '').trim();

if (!API_KEY) {
    console.error("❌ HATA: TMDB_API_KEY bulunamadı! Lütfen .env dosyanızı kontrol edin.");
    process.exit(1);
}

const OUTPUT_DIR = 'filmler';
const OUTPUT_FILE = `${OUTPUT_DIR}/film_arsivi.m3u`;

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
}

const processedTmdbIds = new Set();
const seenTitles = new Set();

const GENRE_ICONS = {
    "Aksiyon": "💥", "Komedi": "😂", "Dram": "🎭", "Korku": "👻",
    "Bilim Kurgu": "🚀", "Romantik": "💕", "Macera": "🗺️", "Suç": "🔫",
    "Gerilim": "🔪", "Animasyon": "🐭", "Aile": "👨‍👩‍👧", "Fantastik": "🧙",
    "Tarih": "📜", "Savaş": "⚔️", "Gizem": "🔍", "Müzik": "🎵",
    "Western": "🤠", "Belgesel": "🎥", "Diğer": "🎬"
};

// Hız ve API limitlerini korumak için basit bekleme fonksiyonu
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Film detaylarını (IMDb ID ve Türkçe tür isimleri) tek seferde çeker
async function getMovieDetails(tmdbId) {
    try {
        const url = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${API_KEY}&language=tr&append_to_response=external_ids`;
        const response = await axios.get(url, { timeout: 8000 });
        const data = response.data;

        const imdbId = data.external_ids ? data.external_ids.imdb_id : null;
        const genres = data.genres && data.genres.length > 0 
            ? data.genres.map(g => g.name) 
            : ["Diğer"];

        return {
            imdbId,
            mainGenre: genres[0],
            allGenres: genres
        };
    } catch (error) {
        return null;
    }
}

// Oynatılabilir / yönlendirici stream bağlantısı oluşturur
function createStreamUrl(imdbId) {
    return `http://ha.vixolity.com/vs/${imdbId}/`;
}

async function fetchMoviesByYearRange(startYear = 2026, endYear = 2015, maxPagesPerYear = 5) {
    console.log(`🎬 Film arşivi taranıyor (${startYear} - ${endYear})...\n`);
    const movies = [];

    for (let year = startYear; year >= endYear; year--) {
        console.log(`📅 ${year} yılı taranıyor...`);
        let yearCount = 0;

        for (let page = 1; page <= maxPagesPerYear; page++) {
            const discoverUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&language=tr&sort_by=popularity.desc&primary_release_year=${year}&page=${page}`;
            
            try {
                const response = await axios.get(discoverUrl, { timeout: 8000 });
                const results = response.data.results || [];
                if (results.length === 0) break;

                for (const movie of results) {
                    if (processedTmdbIds.has(movie.id)) continue;
                    processedTmdbIds.add(movie.id);

                    const cleanTitle = (movie.title || movie.original_title || "").trim();
                    const titleKey = cleanTitle.toLowerCase();
                    if (!cleanTitle || seenTitles.has(titleKey)) continue;

                    const details = await getMovieDetails(movie.id);
                    if (!details || !details.imdbId) continue;

                    seenTitles.add(titleKey);
                    movies.push({
                        title: cleanTitle,
                        year: year,
                        link: createStreamUrl(details.imdbId),
                        poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : "",
                        rating: movie.vote_average ? movie.vote_average.toFixed(1) : "0.0",
                        mainGenre: details.mainGenre
                    });

                    yearCount++;
                    console.log(`   ✓ ${cleanTitle} (${year} - ${details.mainGenre}) ⭐ ${movie.vote_average ? movie.vote_average.toFixed(1) : "?"}`);
                    await sleep(40);
                }
            } catch (err) {
                console.error(`   ⚠️ ${year} - Sayfa ${page} hatası: ${err.message}`);
            }
        }
        console.log(`   👉 ${year} yılından ${yearCount} film eklendi.\n`);
    }

    return movies;
}

function generateM3U(movies) {
    let m3u = '#EXTM3U\n';
    m3u += `# Güncelleme Tarihi: ${new Date().toLocaleDateString('tr-TR')}\n`;
    m3u += `# Toplam Film Sayısı: ${movies.length}\n\n`;

    // Yıla göre yeniden eskiye sırala
    const sortedMovies = [...movies].sort((a, b) => b.year - a.year);

    // Türlere göre grupla
    const moviesByGenre = {};
    for (const movie of sortedMovies) {
        if (!moviesByGenre[movie.mainGenre]) {
            moviesByGenre[movie.mainGenre] = [];
        }
        moviesByGenre[movie.mainGenre].push(movie);
    }

    // En çok filmi olan türden en aza doğru sırala
    const sortedGenres = Object.keys(moviesByGenre).sort(
        (a, b) => moviesByGenre[b].length - moviesByGenre[a].length
    );

    for (const genre of sortedGenres) {
        const icon = GENRE_ICONS[genre] || "🎬";
        const list = moviesByGenre[genre];

        m3u += `# === ${icon} ${genre.toUpperCase()} (${list.length} ADET) ===\n`;
        for (const m of list) {
            m3u += `#EXTINF:-1 tvg-name="${m.title}" tvg-logo="${m.poster}" group-title="${icon} ${genre}", ${m.title} (${m.year}) ⭐ ${m.rating}\n`;
            m3u += `${m.link}\n`;
        }
        m3u += `\n`;
    }

    fs.writeFileSync(OUTPUT_FILE, m3u, 'utf-8');
    console.log(`\n✅ İşlem Tamamlandı! Toplam ${movies.length} film '${OUTPUT_FILE}' dosyasına kaydedildi.`);
}

(async () => {
    // 2026'dan 2015'e kadar, her yıl için ilk 5 sayfayı (yıl başına ~100 film) tarar
    const allMovies = await fetchMoviesByYearRange(2026, 2015, 5);
    generateM3U(allMovies);
})();
