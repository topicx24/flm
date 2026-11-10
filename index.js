const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

const API_KEY = process.env.TMDB_API_KEY;

if (!API_KEY) {
    console.error("❌ TMDB API anahtarı bulunamadı!");
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
    console.log("🎬 Film verileri TMDB üzerinden taranıyor...");
    const movies = [];

    // 1. Vizyondakiler Taraması
    let vizyonPage = 1;
    while (vizyonPage <= 2) {
        try {
            const url = `https://themoviedb.org{API_KEY}&language=tr&page=${vizyonPage}`;
            const response = await axios.get(url);
            if (!response.data.results || response.data.results.length === 0) break;
            
            for (const movie of response.data.results) {
                const imdbId = await getImdbId(movie.id);
                if (imdbId) {
                    const embedLink = createVidSrcLink(imdbId);
                    
                    // Film objesindeki genre_ids listesinden ilk türü kelime olarak alıyoruz
                    const firstGenreId = movie.genre_ids && movie.genre_ids[0];
                    const mainGenre = GENRES[firstGenreId] || "Diğer";

                    movies.push({
                        title: movie.title, year: "Vizyonda", link: embedLink,
                        poster: movie.poster_path ? `https://tmdb.org{movie.poster_path}` : "",
                        rating: movie.vote_average || 0, mainGenre: mainGenre
                    });
                }
                await new Promise(r => setTimeout(r, 40));
            }
            vizyonPage++;
        } catch (error) { 
            break; 
        }
    }

    // 2. Geçmiş Yılların Popülerleri Taraması (Son 3 yıl)
    const currentYear = 2026;
    for (let year = currentYear; year >= currentYear - 3; year--) {
        console.log(`📅 ${year} yılı taranıyor...`);
        for (let page = 1; page <= 2; page++) {
            const url = `https://themoviedb.org{API_KEY}&language=tr&sort_by=popularity.desc&primary_release_year=${year}&page=${page}`;
            try {
                const response = await axios.get(url);
                if (!response.data.results || response.data.results.length === 0) break;
                
                for (const movie of response.data.results) {
                    const imdbId = await getImdbId(movie.id);
                    if (imdbId) {
                        const embedLink = createVidSrcLink(imdbId);
                        
                        const firstGenreId = movie.genre_ids && movie.genre_ids[0];
                        const mainGenre = GENRES[firstGenreId] || "Diğer";

                        movies.push({
                            title: movie.title, year, link: embedLink,
                            poster: movie.poster_path ? `https://tmdb.org{movie.poster_path}` : "",
                            rating: movie.vote_average || 0, mainGenre: mainGenre
                        });
                    }
                    await new Promise(r => setTimeout(r, 40));
                }
            } catch (error) { 
                break; 
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

    let m3u = '#EXTM3U\n# Toplam: ' + uniqueMovies.length + ' film\n\n';

    // Vizyondakiler kategorisini oluştur
    const vizyon = uniqueMovies.filter(m => m.year === "Vizyonda");
    if (vizyon.length > 0) {
        m3u += `# 🆕 VİZYONDAKİLER\n`;
        for (const m of vizyon) {
            m3u += `#EXTINF:-1 group-title="Vizyondakiler" tvg-logo="${m.poster}", ${m.title} ⭐ ${m.rating}\n${m.link}\n`;
        }
    }

    // Tür bazlı gruplama oluştur
    const moviesByGenre = {};
    for (const movie of uniqueMovies.filter(m => m.year !== "Vizyonda")) {
        const genre = movie.mainGenre;
        if (!moviesByGenre[genre]) moviesByGenre[genre] = [];
        moviesByGenre[genre].push(movie);
    }

    for (const genre of Object.keys(moviesByGenre)) {
        const icon = GENRE_ICONS[genre] || "🎬";
        m3u += `\n# ${icon} ${genre.toUpperCase()}\n`;
        for (const m of moviesByGenre[genre]) {
            m3u += `#EXTINF:-1 group-title="${icon} ${genre}" tvg-logo="${m.poster}", ${m.title} (${m.year}) ⭐ ${m.rating}\n${m.link}\n`;
        }
    }

    fs.writeFileSync('filmler/film_arsivi.m3u', m3u, 'utf-8');
    console.log(`💾 M3U Listesi başarıyla oluşturuldu. Toplam: ${uniqueMovies.length} film.`);
}

(async () => {
    const allMovies = await fetchFromStreamingAPI();
    createM3U(allMovies);
})();
