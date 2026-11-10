const axios = require('axios');
const fs = require('fs');
require('dotenv').config(); // Yerelde test ederken .env dosyasını okur

// API anahtarını GitHub Secrets veya yerel .env dosyasından alır
const API_KEY = process.env.TMDB_API_KEY;

if (!API_KEY) {
    console.error("❌ TMDB API anahtarı bulunamadı! Lütfen environment variable ayarlayın.");
    process.exit(1);
}

if (!fs.existsSync('filmler')) {
    fs.mkdirSync('filmler');
}

const processedMovies = new Set();
const GENRE_ICONS = {
    "Aksiyon": "💥", "Komedi": "😂", "Dram": "🎭", "Korku": "👻",
    "Bilim Kurgu": "🚀", "Romantik": "💕", "Macera": "🗺️", "Suç": "🔫",
    "Gerilim": "🔪", "Animasyon": "🐭", "Aile": "👨‍👩‍👧", "Fantastik": "🧙",
    "Tarih": "📜", "Savaş": "⚔️", "Gizem": "🔍", "Müzik": "🎵",
    "Western": "🤠", "Belgesel": "🎥"
};

async function getMovieGenres(tmdbId) {
    try {
        const url = `https://themoviedb.org{tmdbId}?api_key=${API_KEY}&language=tr`;
        const response = await axios.get(url);
        const genreNames = response.data.genres.map(g => g.name);
        const mainGenre = genreNames[0] || "Diğer";
        return { genres: genreNames, mainGenre };
    } catch { return { genres: ["Diğer"], mainGenre: "Diğer" }; }
}

async function getMovieGenres(tmdbId) {
    try {
        const url = `https://themoviedb.org{tmdbId}?api_key=${API_KEY}&language=tr`;
        const response = await axios.get(url);
        const genreNames = response.data.genres.map(g => g.name);
        const mainGenre = genreNames[0] || "Diğer"; // HATA DÜZELTİLDİ: genreNames yerine genreNames[0] seçildi
        return { genres: genreNames, mainGenre };
    } catch { return { genres: ["Diğer"], mainGenre: "Diğer" }; }
}
        return null;
    } catch { return null; }
}

function createVidSrcLink(imdbId) {
    return `https://vidsrc.net{imdbId}`;
}

async function fetchFromStreamingAPI() {
    console.log("🎬 Film verileri TMDB üzerinden taranıyor...");
    const movies = [];

    // 1. Vizyondakiler
    let vizyonPage = 1;
    while (vizyonPage <= 2) {
        try {
            const url = `https://themoviedb.org{API_KEY}&language=tr&page=${vizyonPage}`;
            const response = await axios.get(url);
            if (response.data.results.length === 0) break;
            for (const movie of response.data.results) {
                const imdbId = await getImdbId(movie.id);
                if (imdbId) {
                    const embedLink = createVidSrcLink(imdbId);
                    const genreInfo = await getMovieGenres(movie.id);
                    movies.push({
                        title: movie.title, year: "Vizyonda", link: embedLink,
                        poster: movie.poster_path ? `https://tmdb.org{movie.poster_path}` : "",
                        rating: movie.vote_average || 0, mainGenre: genreInfo.mainGenre
                    });
                }
                await new Promise(r => setTimeout(r, 50));
            }
            vizyonPage++;
        } catch { break; }
    }

    // 2. Geçmiş Yılların Popülerleri (Son 3 yıl - Hızlı çalışması için optimize edildi)
    const currentYear = 2026;
    for (let year = currentYear; year >= currentYear - 3; year--) {
        console.log(`📅 ${year} yılı taranıyor...`);
        for (let page = 1; page <= 2; page++) {
            const url = `https://themoviedb.org{API_KEY}&language=tr&sort_by=popularity.desc&primary_release_year=${year}&page=${page}`;
            try {
                const response = await axios.get(url);
                if (response.data.results.length === 0) break;
                for (const movie of response.data.results) {
                    const imdbId = await getImdbId(movie.id);
                    if (imdbId) {
                        const embedLink = createVidSrcLink(imdbId);
                        const genreInfo = await getMovieGenres(movie.id);
                        movies.push({
                            title: movie.title, year, link: embedLink,
                            poster: movie.poster_path ? `https://tmdb.org{movie.poster_path}` : "",
                            rating: movie.vote_average || 0, mainGenre: genreInfo.mainGenre
                        });
                    }
                    await new Promise(r => setTimeout(r, 50));
                }
            } catch { break; }
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

    let m3u = '#EXTM3U\n# Toplam: ' + uniqueMovies.length + ' film\n\n';

    const vizyon = uniqueMovies.filter(m => m.year === "Vizyonda");
    if (vizyon.length > 0) {
        m3u += `# 🆕 VİZYONDAKİLER\n`;
        for (const m of vizyon) {
            m3u += `#EXTINF:-1 group-title="Vizyondakiler" tvg-logo="${m.poster}", ${m.title} ⭐ ${m.rating}\n${m.link}\n`;
        }
    }

    const moviesByGenre = {};
    for (const movie of uniqueMovies.filter(m => m.year !== "Vizyonda")) {
        if (!moviesByGenre[movie.mainGenre]) moviesByGenre[movie.mainGenre] = [];
        moviesByGenre[movie.mainGenre].push(movie);
    }

    for (const genre of Object.keys(moviesByGenre)) {
        const icon = GENRE_ICONS[genre] || "🎬";
        m3u += `\n# ${icon} ${genre.toUpperCase()}\n`;
        for (const m of moviesByGenre[genre]) {
            m3u += `#EXTINF:-1 group-title="${icon} ${genre}" tvg-logo="${m.poster}", ${m.title} (${m.year}) ⭐ ${m.rating}\n${m.link}\n`;
        }
    }

    fs.writeFileSync('filmler/film_arsivi.m3u', m3u, 'utf-8');
    console.log("💾 M3U Listesi oluşturuldu.");
}

(async () => {
    const allMovies = await fetchFromStreamingAPI();
    createM3U(allMovies);
})();
