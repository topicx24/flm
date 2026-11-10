const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

// API Anahtarı kontrolü ve temizliği
let API_KEY = process.env.TMDB_API_KEY;
if (API_KEY) {
    API_KEY = API_KEY.trim();
}

if (!API_KEY || API_KEY === "") {
    console.error("❌ HATA: TMDB_API_KEY boş veya tanımlanmamış! GitHub Secrets ayarlarınızı kontrol edin.");
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
        const url = `https://themoviedb.org{tmdbId}/external_ids?api_key=${API_KEY}`;
        const response = await axios.get(url);
        const imdbId = response.data.imdb_id;
        if (imdbId) {
            processedMovies.add(tmdbId);
            return imdbId;
        }
        return null;
    } catch (error) { 
        return null; 
    }
}

function createVidSrcLink(imdbId) {
    return `https://vidsrc.net{imdbId}`;
}

async function fetchFromStreamingAPI() {
    console.log("🎬 TMDB API üzerinden popüler filmler talep ediliyor...");
    const movies = [];

    for (let page = 1; page <= 3; page++) {
        try {
            const url = `https://themoviedb.org{API_KEY}&language=tr&page=${page}`;
            console.log(`📡 Sayfa ${page} isteniyor...`);
            const response = await axios.get(url);
            
            if (!response.data || !response.data.results || response.data.results.length === 0) {
                console.log(`⚠️ Sayfa ${page} boş döndü.`);
                continue;
            }
            
            console.log(`✅ Sayfa ${page} başarıyla alındı. ${response.data.results.length} film işleniyor...`);
            
            for (const movie of response.data.results) {
                const imdbId = await getImdbId(movie.id);
                if (imdbId) {
                    const embedLink = createVidSrcLink(imdbId);
                    
                    // Doğru dizi indeksleme düzeltmesi yapıldı (?.[0])
                    const firstGenreId = movie.genre_ids?.[0] || 0;
                    const mainGenre = GENRES[firstGenreId] || "Diğer";
                    const movieTitle = movie.title || movie.original_title || "Bilinmeyen Film";
                    const releaseYear = movie.release_date ? movie.release_date.split('-')[0] : "2026";

                    movies.push({
                        title: movieTitle, 
                        year: releaseYear, 
                        link: embedLink,
                        poster: movie.poster_path ? `https://tmdb.org{movie.poster_path}` : "",
                        rating: movie.vote_average || 0, 
                        mainGenre: mainGenre
                    });
                }
            }
        } catch (error) { 
            console.error(`❌ Sayfa ${page} yüklenirken HTTP Hatası oluştu:`, error.response?.status || error.message);
            if (error.response?.status === 401) {
                console.error("🚨 KRİTİK: TMDB API anahtarınız geçersiz (Unauthorized)! Lütfen GitHub Secrets ayarınızı doğrulayın.");
                process.exit(1);
            }
        }
    }
    return movies;
}

function createM3U(movies) {
    const uniqueMovies = [];
    const seenTitles = new Set();
    for (const movie of movies) {
        const cleanTitle = movie.title.toLowerCase().trim();
        if (!seenTitles.has(cleanTitle)) {
            seenTitles.add(cleanTitle);
            uniqueMovies.push(movie);
        }
    }

    let m3u = '#EXTM3U\n';
    m3u += `# Toplam: ${uniqueMovies.length} film\n`;
    m3u += `# Oluşturulma Tarihi: ${new Date().toLocaleDateString('tr-TR')}\n\n`;

    const moviesByGenre = {};
    for (const movie of uniqueMovies) {
        const genre = movie.mainGenre;
        if (!moviesByGenre[genre]) moviesByGenre[genre] = [];
        moviesByGenre[genre].push(movie);
    }

    for (const genre of Object.keys(moviesByGenre)) {
        const icon = GENRE_ICONS[genre] || "🎬";
        m3u += `# ${icon} ${genre.toUpperCase()} (${moviesByGenre[genre].length} adet)\n`;
        for (const m of moviesByGenre[genre]) {
            m3u += `#EXTINF:-1 group-title="${icon} ${genre}" tvg-logo="${m.poster}", ${m.title} (${m.year}) ⭐ ${m.rating}\n${m.link}\n`;
        }
        m3u += `\n`;
    }

    fs.writeFileSync('filmler/film_arsivi.m3u', m3u, 'utf-8');
    console.log(`💾 M3U Listesi kaydedildi. Toplam: ${uniqueMovies.length} film.`);
}

(async () => {
    const allMovies = await fetchFromStreamingAPI();
    createM3U(allMovies);
})();
