const express = require('express');
const cors = require('cors');
const CryptoJS = require('crypto-js');
const { Readable } = require('stream');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Secret key used by JioSaavn DES-ECB encryption
const SAAVN_SECRET_KEY = CryptoJS.enc.Utf8.parse('38346591');

/**
 * Decrypt JioSaavn encrypted_media_url to get direct stream URL
 */
function decryptMediaUrl(encryptedMediaUrl) {
    if (!encryptedMediaUrl) return null;
    try {
        const decrypted = CryptoJS.DES.decrypt(
            { ciphertext: CryptoJS.enc.Base64.parse(encryptedMediaUrl) },
            SAAVN_SECRET_KEY,
            { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
        );
        const url = decrypted.toString(CryptoJS.enc.Utf8);
        return url && url.startsWith('http') ? url : null;
    } catch (e) {
        return null;
    }
}

/**
 * Clean HTML entity encoding in titles and artist names
 */
function cleanText(text) {
    if (!text) return '';
    return text
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
        .trim();
}

/**
 * High-res artwork upscaling
 */
function getHighResArtwork(url) {
    if (!url) return 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=600';
    return url.replace('150x150', '500x500').replace('50x50', '500x500');
}

/**
 * Format raw JioSaavn track object with high quality artwork and 320kbps streams
 */
function formatSaavnTrack(track) {
    if (!track) return null;
    let streamUrl = '';
    let fallbackStreamUrl = '';
    
    if (track.more_info && track.more_info.encrypted_media_url) {
        const decrypted = decryptMediaUrl(track.more_info.encrypted_media_url);
        if (decrypted) {
            // Prefer 320kbps pristine HD, fallback to 160kbps or original
            streamUrl = decrypted.replace('_96.mp4', '_320.mp4');
            fallbackStreamUrl = decrypted.replace('_96.mp4', '_160.mp4');
        }
    }

    if (!streamUrl && track.media_preview_url) {
        streamUrl = track.media_preview_url;
    }

    if (!streamUrl) return null;

    let artistName = cleanText(track.subtitle || '');
    if (!artistName && track.more_info && track.more_info.artistMap) {
        const artists = track.more_info.artistMap.primary_artists || track.more_info.artistMap.artists || [];
        artistName = artists.map(a => a.name).join(', ');
    }
    if (!artistName && track.singers) artistName = cleanText(track.singers);
    if (!artistName) artistName = 'Various Artists';

    const rawTitle = track.song || track.title || 'Unknown Title';

    return {
        id: track.id ? track.id.toString() : Math.random().toString(36).substring(7),
        title: cleanText(rawTitle),
        artist: artistName,
        album: cleanText(track.more_info?.album || track.album || ''),
        duration: parseInt(track.more_info?.duration || track.duration || 210, 10),
        coverUrl: getHighResArtwork(track.image),
        streamUrl: streamUrl,
        fallbackStreamUrl: fallbackStreamUrl,
        language: track.language ? track.language.charAt(0).toUpperCase() + track.language.slice(1).toLowerCase() : 'Global',
        year: track.year || '2024',
        hasLyrics: track.more_info?.has_lyrics === 'true',
        lyricsSnippet: cleanText(track.more_info?.lyrics_snippet || '')
    };
}

/**
 * Deduplicate tracks by ID and normalized song title + primary artist
 */
function deduplicateTracks(tracks) {
    const seenIds = new Set();
    const seenTitles = new Set();
    const unique = [];

    for (const t of tracks) {
        if (!t || !t.id || !t.streamUrl) continue;
        if (seenIds.has(t.id)) continue;
        
        // Strip movie tags, brackets, and non-alphanumeric to detect duplicates
        const cleanT = t.title
            .toLowerCase()
            .replace(/\(from [^)]+\)/g, '')
            .replace(/\[[^\]]+\]/g, '')
            .replace(/[^a-z0-9]/g, '')
            .trim();
        const artistPrefix = (t.artist || '').slice(0, 12).toLowerCase().replace(/[^a-z0-9]/g, '');
        const key = cleanT ? `${cleanT}_${artistPrefix}` : t.id;

        if (cleanT && seenTitles.has(key)) continue;

        seenIds.add(t.id);
        if (cleanT) seenTitles.add(key);
        unique.push(t);
    }
    return unique;
}

/**
 * Intelligent search engine with query intent decomposition, playlist harvesting, and track enrichment
 */
// Filmography databases for strict Actor, Heroine, and Singer filtering
const HERO_FILMOGRAPHY = {
    'vijay': {
        name: 'Thalapathy Vijay',
        movies: [
            'leo', 'goat', 'the greatest of all time', 'varisu', 'beast', 'master', 'bigil', 'sarkar', 'mersal',
            'bairavaa', 'theri', 'puli', 'kaththi', 'jilla', 'thalaivaa', 'thuppakki', 'nanban', 'velayudham',
            'kaavalan', 'vettaikaaran', 'villu', 'kuruvi', 'azhagiya tamil magan', 'azagiya tamil magan', 'pokkiri',
            'aathi', 'sivakasi', 'sukran', 'thirupaachi', 'madhurey', 'ghilli', 'udhaya', 'thirumalai', 'vaseegara',
            'bagavathi', 'youth', 'thamizhan', 'shahjahan', 'shajahaan', 'badri', 'friends', 'priyamanavale', 'kushi',
            'kannukkul nilavu', 'minsara kanna', 'endrendrum kadhal', 'thulladha manamum thullum', 'thullatha manamum thullum',
            'nilaave vaa', 'priyamudan', 'ninaithen vanthai', 'kadhalukku mariyadhai', 'kadalukku mariadai', 'nerrukku ner',
            'naerukku naer', 'once more', 'love today', 'kaalamellam kaathiruppen', 'selva', 'poove unakkaga',
            'coimbatore mappillai', 'chandralekha', 'vishnu', 'devadhadhai', 'rasigan', 'sendhoorapandi', 'naalaiya theerpu',
            'jana nayagan', 'thalapathy vijay kondattam', 'thalapathy vijay firestorm hits', 'thalapathy'
        ],
        directQueries: [
            'Thalapathy Vijay Hits', 'Vijay Tamil Hits', 'Leo Tamil', 'GOAT Tamil', 'Master Tamil',
            'Varisu Tamil', 'Beast Tamil', 'Bigil Tamil', 'Mersal Tamil', 'Sarkar Tamil', 'Theri Tamil',
            'Kaththi Tamil', 'Thuppakki Tamil', 'Ghilli Tamil', 'Pokkiri Tamil', 'Nanban Tamil',
            'Vijay Naa Ready', 'Vijay Whistle Podu', 'Vijay Ranjithame', 'Vijay Jolly O Gymkhana', 'Vijay Kutti Story'
        ],
        vocalPatterns: [/thalapathy vijay/i, /c\. joseph vijay/i, /^vijay$/i, /actor vijay/i, /\bvijay\b/i]
    },
    'rajini': {
        name: 'Rajinikanth',
        movies: [
            'jailer', 'coolie', 'vettaiyan', 'lal salaam', 'petta', 'darbar', 'kaala', 'kabali', 'lingaa',
            'kochadaiiyaan', 'enthiran', 'robot', 'sivaji', 'chandramukhi', 'baba', 'padayappa', 'arunachalam',
            'muthu', 'baashha', 'veera', 'yejaman', 'annamalai', 'thalapathi', 'dharma durai', 'panakkaran',
            'mappillai', 'guru sishyan', 'manithan', 'velaikaaran', 'mr. bharath', 'padikkadavan', 'billa',
            'murattu kaalai', 'johnny', 'thillu mullu', 'polladhavan', 'priya', '16 vayathinile', 'moondru mudichu'
        ],
        directQueries: [
            'Superstar Rajinikanth Hits', 'Rajinikanth Tamil Hits', 'Jailer Tamil', 'Petta Tamil',
            'Darbar Tamil', 'Kabali Tamil', 'Sivaji Tamil', 'Enthiran Tamil', 'Padayappa Tamil',
            'Baashha Tamil', 'Annamalai Tamil', 'Muthu Tamil'
        ]
    },
    'ajith': {
        name: 'Ajith Kumar',
        movies: [
            'good bad ugly', 'vidaamuyarchi', 'thunivu', 'valimai', 'viswasam', 'vivegam', 'vedalam',
            'yennai arindhaal', 'veeram', 'arrambam', 'billa 2', 'billa ii', 'mankatha', 'aasal', 'aegan',
            'billa', 'kireedam', 'alwar', 'varalaru', 'godfather', 'paramasivan', 'ji', 'attahasam',
            'jana', 'villain', 'red', 'citizen', 'dheena', 'mugavaree', 'kandukondain kandukondain',
            'amarkalam', 'vaali', 'thodarum', 'unnidathil ennai koduthen', 'kadhal mannan', 'kadhal kottai', 'aasai'
        ],
        directQueries: [
            'Thala Ajith Hits', 'Ajith Kumar Tamil Hits', 'Mankatha Tamil', 'Billa Tamil',
            'Viswasam Tamil', 'Vedalam Tamil', 'Thunivu Tamil', 'Valimai Tamil', 'Yennai Arindhaal Tamil', 'Veeram Tamil'
        ]
    },
    'kamal': {
        name: 'Kamal Haasan',
        movies: [
            'thug life', 'indian 2', 'vikram', 'vishwaroopam', 'vishwaroopam 2', 'uttama villain',
            'papanasam', 'manmadhan ambu', 'unipol oruvan', 'dasavathaaram', 'dasavatharam', 'vettaiyaadu vilaiyaadu',
            'virumaandi', 'virumandi', 'anbe sivam', 'panchathanthiram', 'aalavandhan', 'thenali', 'hey ram',
            'avvai shanmughi', 'indian', 'kuruthipunal', 'nammavar', 'mahanadhi', 'thevar magan', 'singaravelan',
            'gunaa', 'michael madana kama rajan', 'vetri vizha', 'apoorva sagodharargal', 'nayakan', 'nayagan',
            'pesum padam', 'punnagai mannan', 'sagara sangamam', 'moondram pirai', 'varumayin niram sivappu'
        ],
        directQueries: [
            'Kamal Haasan Tamil Hits', 'Vikram Tamil', 'Kamal Haasan Classic Hits', 'Indian Tamil',
            'Thevar Magan Tamil', 'Nayakan Tamil', 'Pathala Pathala', 'Kamal Haasan Songs'
        ],
        vocalPatterns: [/kamal haasan/i, /kamal hassan/i, /ulaganayagan/i]
    },
    'suriya': {
        name: 'Suriya',
        movies: [
            'kanguva', 'retro', 'soorarai pottru', 'jai bhim', 'etharkkum thunindhavan', 'kaappaan', 'ngk',
            'thaanaa serndha koottam', 'si3', 'singam 3', '24', 'massu engira masilamani', 'massu', 'anjaan',
            'singam 2', 'singam ii', 'maattrraan', '7aum arivu', 'singam', 'aadhavan', 'ayan', 'vaaranam aayiram',
            'vel', 'ghajini', 'aaru', 'perazhagan', 'pithamagan', 'kaakha kaakha', 'mounam pesiyadhe', 'nandha', 'friends'
        ],
        directQueries: [
            'Suriya Tamil Hits', 'Ayan Tamil', 'Singam Tamil', 'Vaaranam Aayiram Tamil',
            'Ghajini Tamil', 'Soorarai Pottru Tamil', 'Kaakha Kaakha Tamil', '24 Tamil'
        ]
    },
    'dhanush': {
        name: 'Dhanush',
        movies: [
            'raayan', 'captain miller', 'vaathi', 'sir', 'naane varuvean', 'thiruchitrambalam', 'atrangi re',
            'karnan', 'jagame thandhiram', 'pattas', 'asuran', 'enai noki paayum thota', 'maari 2',
            'vada chennai', 'vip 2', 'power paandi', 'kodi', 'thodari', 'thanga magan', 'maari',
            'anegan', 'velaiilla pattadhari', 'vip', 'maryan', 'raanjhanaa', '3', 'mayakkam enna',
            'aadukalam', 'uthama puthiran', 'kutty', 'padikkadavan', 'yaaradi nee mohini', 'polladhavan',
            'pudhupettai', 'thiruda thirudi', 'kaadhal kondein', 'thulluvadho ilamai'
        ],
        directQueries: [
            'Dhanush Tamil Hits', 'Asuran Tamil', 'Thiruchitrambalam Tamil', 'Maari Tamil',
            'VIP Tamil', 'Vada Chennai Tamil', 'Raayan Tamil', 'Why This Kolaveri Di', 'Rowdy Baby'
        ],
        vocalPatterns: [/dhanush/i]
    },
    'sivakarthikeyan': {
        name: 'Sivakarthikeyan',
        movies: [
            'amaran', 'ayalaan', 'maaveeran', 'prince', 'don', 'doctor', 'hero', 'namma veettu pillai',
            'mr. local', 'kanaa', 'seemaraja', 'velaikkaran', 'remo', 'rajinimurugan', 'kaaki sattai',
            'maan karate', 'varuthapadatha valibar sangam', 'ethir neechal', 'kedi billa killadi ranga', 'marina'
        ],
        directQueries: [
            'Sivakarthikeyan Tamil Hits', 'Amaran Tamil', 'Doctor Tamil', 'Don Tamil',
            'Remo Tamil', 'Varuthapadatha Valibar Sangam', 'Rajinimurugan Tamil', 'Ethir Neechal Tamil'
        ],
        vocalPatterns: [/sivakarthikeyan/i]
    },
    'prabhas': {
        name: 'Prabhas',
        movies: [
            'kalki 2898 ad', 'kalki', 'salaar', 'adipurush', 'radhe shyam', 'saaho', 'baahubali 2', 'baahubali',
            'mirchi', 'rebel', 'darling', 'mr. perfect', 'mr perfect', 'billa', 'ek niranjan', 'bujjigadu',
            'munna', 'pournami', 'chatrapathi', 'chakram', 'varsham', 'eeshwar'
        ],
        directQueries: [
            'Prabhas Telugu Hits', 'Baahubali Telugu', 'Kalki Telugu', 'Salaar Telugu',
            'Mirchi Telugu', 'Darling Telugu', 'Varsham Telugu', 'Chatrapathi Telugu', 'Saaho Telugu'
        ]
    },
    'allu_arjun': {
        name: 'Allu Arjun',
        movies: [
            'pushpa 2', 'pushpa', 'ala vaikunthapurramuloo', 'sarrainodu', 'dj', 'duvvada jagannadham',
            'race gurram', 's/o satyamurthy', 'satyamurthy', 'rudhramadevi', 'iddarammayilatho', 'julayi',
            'badrinath', 'vedam', 'varudu', 'arya 2', 'parugu', 'desamuduru', 'happy', 'bunny', 'arya', 'gangotri'
        ],
        directQueries: [
            'Allu Arjun Telugu Hits', 'Pushpa Telugu', 'Ala Vaikunthapurramuloo Telugu',
            'Sarrainodu Telugu', 'Race Gurram Telugu', 'Julayi Telugu', 'Arya 2 Telugu', 'Desamuduru Telugu'
        ]
    },
    'mahesh_babu': {
        name: 'Mahesh Babu',
        movies: [
            'guntur kaaram', 'sarkaru vaari paata', 'sarileru neekevvaru', 'maharshi', 'bharat ane nenu',
            'spyder', 'brahmotsavam', 'srimanthudu', 'aagadu', '1: nenokkadine', 'seethamma vakitlo sirimalle chettu',
            'businessman', 'dookudu', 'khaleja', 'athidhi', 'pokiri', 'athadu', 'okkadu', 'murari'
        ],
        directQueries: [
            'Mahesh Babu Telugu Hits', 'Guntur Kaaram Telugu', 'Srimanthudu Telugu', 'Pokiri Telugu',
            'Dookudu Telugu', 'Sarileru Neekevvaru Telugu', 'Athadu Telugu', 'Okkadu Telugu'
        ]
    },
    'jr_ntr': {
        name: 'Jr. NTR',
        movies: [
            'devara', 'rrr', 'aravinda sametha', 'jai lava kusa', 'janatha garage', 'nannaku prematho',
            'temper', 'rabhasa', 'ramayya vasthavayya', 'baadshah', 'dammu', 'oosaravelli', 'brindavanam',
            'adhurs', 'yamadonga', 'simhadri', 'aadi', 'student no. 1'
        ],
        directQueries: [
            'Jr NTR Telugu Hits', 'Devara Telugu', 'RRR Telugu', 'Janatha Garage Telugu',
            'Aravinda Sametha Telugu', 'Temper Telugu', 'Brindavanam Telugu', 'Simhadri Telugu'
        ]
    },
    'ram_charan': {
        name: 'Ram Charan',
        movies: [
            'game changer', 'rrr', 'acharya', 'vinaya vidheya rama', 'rangasthalam', 'dhruva',
            'bruce lee', 'govindudu andarivadele', 'yevadu', 'naayak', 'racha', 'orange', 'magadheera', 'chirutha'
        ],
        directQueries: [
            'Ram Charan Telugu Hits', 'Rangasthalam Telugu', 'Magadheera Telugu', 'Orange Telugu',
            'RRR Telugu', 'Dhruva Telugu', 'Yevadu Telugu', 'Naayak Telugu'
        ]
    }
};

const HEROINE_FILMOGRAPHY = {
    'samantha': {
        name: 'Samantha',
        movies: [
            'kushi', 'shaakuntalam', 'yashoda', 'kaathuvaakula rendu kaadhal', 'super deluxe', 'majili',
            'oh! baby', 'oh baby', 'u turn', 'rangasthalam', 'mersal', 'theri', '24', 'a aa', 'kaththi',
            'anjaan', 'alludu seenu', 'autonagar surya', 'manam', 'ramayya vasthavayya', 'attarintiki daredi',
            'jabardasth', 'seethamma vakitlo sirimalle chettu', 'yeto vellipoyindhi manasu', 'naan ee', 'eega',
            'dookudu', 'brindavanam', 'ye maaya chesave', 'vinnaithaandi varuvaayaa', 'vtv'
        ],
        directQueries: [
            'Samantha Tamil Hits', 'Samantha Telugu Hits', 'Mersal Tamil', 'Theri Tamil',
            'Kaththi Tamil', 'Kaathuvaakula Rendu Kaadhal', 'Rangasthalam Telugu', 'Majili Telugu',
            'Oh Baby Telugu', 'A Aa Telugu', 'Ye Maaya Chesave'
        ]
    },
    'nayanthara': {
        name: 'Nayanthara',
        movies: [
            'jawan', 'iraivan', 'connect', 'gold', 'godfather', 'o2', 'kaathuvaakula rendu kaadhal',
            'annatthe', 'annaatthe', 'netrikann', 'nizhal', 'mookuthi amman', 'darbar', 'bigil',
            'sye raa narasimha reddy', 'viswasam', 'kolamaavu kokila', 'imaikkaa nodigal', 'jai simha',
            'velaikkaran', 'aramm', 'kashmora', 'iru mugan', 'naanum rowdy dhaan', 'thani oruvan',
            'maya', 'raja rani', 'billa', 'yaardi nee mohini', 'ghajini', 'chandramukhi', 'boss engira bhaskaran'
        ],
        directQueries: [
            'Nayanthara Tamil Hits', 'Bigil Tamil', 'Viswasam Tamil', 'Naanum Rowdy Dhaan',
            'Raja Rani Tamil', 'Billa Tamil', 'Ghajini Tamil', 'Chandramukhi Tamil', 'Thani Oruvan Tamil'
        ]
    },
    'trisha': {
        name: 'Trisha',
        movies: [
            'vidaamuyarchi', 'thug life', 'leo', 'the road', 'ponniyin selvan', 'ponniyin selvan 2',
            'petta', '96', 'hey jude', 'kodi', 'yennai arindhaal', 'endrendrum punnagai', 'mankatha',
            'vinnaithaandi varuvaayaa', 'ye maaya chesave', 'abhiyum naanum', 'kuruvi', 'kireedam',
            'aadavari matalaku arthale verule', 'unakkum enakkum', 'aathi', 'athadu', 'ghilli',
            'varsham', 'saamy', 'lesa lesa', 'mounam pesiyadhe'
        ],
        directQueries: [
            'Trisha Tamil Hits', 'Leo Tamil', '96 Tamil', 'Ponniyin Selvan', 'Ghilli Tamil',
            'Vinnaithaandi Varuvaayaa', 'Saamy Tamil', 'Yennai Arindhaal Tamil', 'Mankatha Tamil'
        ]
    },
    'sai_pallavi': {
        name: 'Sai Pallavi',
        movies: [
            'amaran', 'thandel', 'gargi', 'virata parvam', 'shyam singha roy', 'love story',
            'paava kadhaigal', 'ngk', 'athiran', 'maari 2', 'padi padi leche manasu', 'kanam',
            'diya', 'middle class abbayi', 'mca', 'fidaa', 'kali', 'premam'
        ],
        directQueries: [
            'Sai Pallavi Tamil Hits', 'Sai Pallavi Telugu Hits', 'Amaran Tamil', 'Premam Malayalam',
            'Fidaa Telugu', 'Maari 2 Tamil', 'Love Story Telugu', 'Shyam Singha Roy'
        ]
    },
    'keerthy_suresh': {
        name: 'Keerthy Suresh',
        movies: [
            'baby john', 'raghu thatha', 'siren', 'bhola shankar', 'maamannan', 'dasara',
            'vaashi', 'saani kaayidham', 'sarkaru vaari paata', 'good luck sakhi', 'marakkar',
            'annaatthe', 'rang de', 'miss india', 'penguin', 'sandakozhi 2', 'sarkar', 'saamy 2',
            'nadiyar thilagam', 'mahanati', 'thaanaa serndha koottam', 'agnyaathavaasi', 'bairavaa',
            'nenu local', 'thodari', 'remo', 'rajinimurugan', 'nenu sailaja'
        ],
        directQueries: [
            'Keerthy Suresh Tamil Hits', 'Keerthy Suresh Telugu Hits', 'Mahanati Telugu',
            'Remo Tamil', 'Dasara Telugu', 'Sarkaru Vaari Paata', 'Bairavaa Tamil', 'Sarkar Tamil'
        ]
    },
    'rashmika': {
        name: 'Rashmika Mandanna',
        movies: [
            'pushpa 2', 'animal', 'varisu', 'goodbye', 'sita ramam', 'pushpa', 'sulthan',
            'sarileru neekevvaru', 'bheeshma', 'dear comrade', 'yajamana', 'geetha govindam', 'chalo', 'kirik party'
        ],
        directQueries: [
            'Rashmika Mandanna Telugu Hits', 'Rashmika Mandanna Tamil Hits', 'Pushpa Telugu',
            'Varisu Tamil', 'Geetha Govindam Telugu', 'Dear Comrade', 'Animal Hindi', 'Sita Ramam'
        ]
    },
    'sreeleela': {
        name: 'Sreeleela',
        movies: [
            'guntur kaaram', 'bhagavanth kesari', 'skanda', 'aadikeshava', 'extra ordinary man',
            'dhamaka', 'pelli sandad', 'kiss', 'bharaate'
        ],
        directQueries: [
            'Sreeleela Telugu Hits', 'Guntur Kaaram Telugu', 'Dhamaka Telugu',
            'Bhagavanth Kesari Telugu', 'Skanda Telugu', 'Pelli SandaD Telugu'
        ]
    }
};

function matchHeroTrack(track, heroConfig) {
    if (!heroConfig) return true;
    const alb = (track.album || '').toLowerCase();
    const title = (track.title || '').toLowerCase();
    const art = (track.artist || '').toLowerCase();
    const singers = (track.singers || '').toLowerCase();

    // Check if hero sang it
    if (heroConfig.vocalPatterns) {
        for (const pat of heroConfig.vocalPatterns) {
            if (pat.test(art) || pat.test(singers)) {
                // If checking Vijay, exclude Vijay Yesudas/Vijay Prakash/Vijay Antony
                if (heroConfig.name.includes('Vijay')) {
                    if (!/\b(vijay yesudas|vijay prakash|vijay antony|vijay sethupathi)\b/i.test(art)) return true;
                } else {
                    return true;
                }
            }
        }
    }

    // Check movie filmography
    for (const m of heroConfig.movies) {
        if (alb.includes(m) || title.includes(m)) return true;
    }

    return false;
}

function matchHeroineTrack(track, heroineConfig) {
    if (!heroineConfig) return true;
    const alb = (track.album || '').toLowerCase();
    const title = (track.title || '').toLowerCase();

    for (const m of heroineConfig.movies) {
        if (alb.includes(m) || title.includes(m)) return true;
    }
    return false;
}

function matchSingerTrack(track, artistName) {
    if (!artistName) return true;
    const qClean = artistName.toLowerCase().trim();
    const art = (track.artist || '').toLowerCase();
    const singers = (track.singers || '').toLowerCase();
    const sub = (track.subtitle || '').toLowerCase();
    const combined = `${art} ${singers} ${sub}`;

    // Special aliases
    if (qClean.includes('balasubrahmanyam') || qClean === 'spb') {
        return combined.includes('balasubrahmanyam') || combined.includes('spb');
    }
    if (qClean.includes('yesudas')) {
        return combined.includes('yesudas');
    }
    if (qClean.includes('chithra') || qClean.includes('chitra')) {
        return combined.includes('chithra') || combined.includes('chitra');
    }
    if (qClean.includes('janaki')) {
        return combined.includes('janaki');
    }
    if (qClean.includes('rafi')) {
        return combined.includes('rafi');
    }
    if (qClean.includes('pradeep kumar')) {
        return combined.includes('pradeep kumar');
    }

    // Default: query keywords
    const words = qClean.split(/\s+/).filter(w => w.length > 2 && !['hits', 'tamil', 'telugu', 'hindi', 'kannada', 'malayalam', 'punjabi', 'english', 'songs'].includes(w));
    if (words.length === 0) return true;
    return words.some(w => combined.includes(w));
}

async function smartSearch(rawQuery, limit = 120, explicitLang = null, artistId = null, artistRole = null, artistName = null) {
    let q = (rawQuery || '').toLowerCase().trim();
    q = q.replace(/\bmalyalam\b/g, 'malayalam')
         .replace(/\bmalaylam\b/g, 'malayalam')
         .replace(/\bmalyalm\b/g, 'malayalam')
         .replace(/\btelegu\b/g, 'telugu')
         .replace(/\bhindhi\b/g, 'hindi')
         .replace(/\btamizh\b/g, 'tamil')
         .replace(/\bthamil\b/g, 'tamil')
         .replace(/\bkanada\b/g, 'kannada');

    const languages = ['tamil', 'malayalam', 'telugu', 'hindi', 'punjabi', 'kannada', 'english'];
    let detectedLang = null;

    if (explicitLang && explicitLang !== 'All') {
        detectedLang = explicitLang.charAt(0).toUpperCase() + explicitLang.slice(1).toLowerCase();
    } else {
        for (const lang of languages) {
            if (new RegExp('\\b' + lang + '\\b', 'i').test(q)) {
                detectedLang = lang.charAt(0).toUpperCase() + lang.slice(1);
                break;
            }
        }
    }

    let playlistQueries = [];
    let directQueries = [];

    // Precise Mood Intent Detectors
    const isDevotional = /\b(devotional|spiritual|bhakti|bhakthi|bhajan|god|pooja|puja|aarti|stotram|chalisa|mantra|shiva|murugan|krishna|ayyappan|venkateswara)\b/i.test(q);
    const isParty = /\b(kuthu|koothu|dappankuthu|dance|fast|party|club|dj|item)\b/i.test(q);
    const isFeelGood = /\b(good feel|feel good|feelgood|chill|relax|pleasant|peaceful|breeze|vibes|positive|morning)\b/i.test(q);
    const isRomantic = /\b(melody|love|romantic|romance|duet|kadhal|premam|prem|heart)\b/i.test(q);
    const isNightDrive = /\b(night drive|late night|drive|highway|cruising|midnight)\b/i.test(q);
    const isSad = /\b(sad|heartbreak|broken|crying|pain|emotional|tears|alone|melancholy|soga)\b/i.test(q);
    const isRain = /\b(rain|monsoon|mazhai|barish|varsham|rainy)\b/i.test(q);
    const isGym = /\b(gym|workout|motivation|fitness|energy|beast|training)\b/i.test(q);
    const is90s = /\b(90s|retro|classics|golden|vintage|old|evergreen)\b/i.test(q);
    const isLofi = /\b(lofi|lo-fi|focus|study|slowed)\b/i.test(q);
    const isWedding = /\b(wedding|celebration|kalyanam|shaadi|festive|sangeet)\b/i.test(q);
    const isAcoustic = /\b(acoustic|unplugged|guitar|strings)\b/i.test(q);
    const isMass = /\b(mass|swagger|bgm|theme|intro|action)\b/i.test(q);

    if (isDevotional) {
        if (detectedLang === 'Tamil') {
            playlistQueries = ['Murugan Devotional Songs', 'Tamil Bhakthi Padalgal', 'Amman Padalgal', 'Kandha Sashti Kavasam'];
            directQueries = ['Murugan Devotional Songs', 'Kandha Sashti Kavasam', 'Tamil Bhakthi Padalgal', 'Amman Padalgal Tamil', 'S P Balasubrahmanyam Devotional Tamil', 'Lord Shiva Tamil Devotional'];
        } else if (detectedLang === 'Telugu') {
            playlistQueries = ['Lord Shiva Telugu Songs', 'Telugu Bhakti Geethalu', 'Venkateswara Swamy Devotional'];
            directQueries = ['Telugu Devotional Songs', 'Lord Shiva Telugu Songs', 'Venkateswara Swamy Songs', 'SPB Telugu Devotional', 'Ayyappa Swamy Songs Telugu'];
        } else if (detectedLang === 'Kannada') {
            playlistQueries = ['Raghavendra Swamy Songs', 'Shiva Bhakti Kannada'];
            directQueries = ['Kannada Devotional Songs', 'Raghavendra Swamy Songs', 'Chamundeshwari Songs Kannada', 'Shiva Bhakti Kannada'];
        } else if (detectedLang === 'Hindi') {
            playlistQueries = ['Shiv Bhajans', 'Hanuman Chalisa', 'Top Hindi Bhajans', 'Krishna Bhajans'];
            directQueries = ['Shiv Bhajans', 'Hanuman Chalisa', 'Top Hindi Bhajans', 'Ganesh Aarti', 'Krishna Bhajans', 'Mata Rani Bhajan'];
        } else if (detectedLang === 'Malayalam') {
            playlistQueries = ['Ayyappa Bhakthi Gaanangal', 'Guruvayurappa Songs'];
            directQueries = ['Malayalam Devotional Songs', 'Ayyappa Devotional Songs', 'Guruvayurappa Songs', 'KJ Yesudas Devotional'];
        } else if (detectedLang === 'Punjabi') {
            playlistQueries = ['Gurbani Kirtan', 'Shabad Gurbani'];
            directQueries = ['Shabad Gurbani', 'Golden Temple Live Gurbani'];
        } else {
            // All Languages Devotional Mix
            playlistQueries = ['Top Devotional Bhajans', 'Shiv Bhajans', 'Hanuman Chalisa'];
            directQueries = ['Hanuman Chalisa', 'Shiv Bhajans', 'Murugan Devotional Songs', 'Telugu Devotional Songs', 'Krishna Bhajans', 'Top Devotional Bhajans'];
        }
    } else if (isParty) {
        if (detectedLang === 'Tamil') {
            playlistQueries = ['Top Kuthu - Tamil', 'Tamil Kuthu', 'Tamil Dance Hits', 'Anirudh Kuthu'];
            directQueries = ['Tamil Kuthu Hits', 'Anirudh kuthu', 'Arabic Kuthu', 'Dappankuthu Tamil', 'Tamil Dance Hits'];
        } else if (detectedLang === 'Telugu') {
            playlistQueries = ['Telugu Dance', 'Party Hits Telugu', 'Telugu Mass Songs'];
            directQueries = ['Telugu Dance Hits', 'Tollywood Party Songs', 'Telugu Mass Songs', 'Thaman Party Hits'];
        } else if (detectedLang === 'Hindi') {
            playlistQueries = ['Bollywood Dance', 'Party Hits Hindi', 'Club Bollywood'];
            directQueries = ['Bollywood Party Songs', 'Badshah Hits', 'Hindi Dance Numbers', 'Club Bollywood Hits'];
        } else if (detectedLang === 'Malayalam') {
            playlistQueries = ['Best Of Dance - Malayalam', 'Party Hits - Malayalam'];
            directQueries = ['Malayalam Dance Hits', 'Aavesham dance', 'Illuminati'];
        } else if (detectedLang === 'Kannada') {
            playlistQueries = ['Kannada Dance Hits', 'Kannada Mass Songs'];
            directQueries = ['Kannada Dance Hits', 'Kannada Party Songs'];
        } else if (detectedLang === 'Punjabi') {
            playlistQueries = ['Punjabi Party Songs', 'Bhangra Hits'];
            directQueries = ['Punjabi Party Songs', 'Diljit Party Hits', 'Club Punjabi'];
        } else {
            playlistQueries = ['Bollywood Dance', 'Top Kuthu - Tamil', 'Global Dance Hits'];
            directQueries = ['Bollywood Party Songs', 'Tamil Kuthu Hits', 'Punjabi Dance Hits', 'Top Dance Pop'];
        }
    } else if (isFeelGood) {
        if (detectedLang === 'Tamil') {
            playlistQueries = ['Chill Hits - Tamil', 'Good Morning Beats - Tamil', 'Tamil Feel Good'];
            directQueries = ['Tamil Feel Good Songs', 'The Life of Ram', 'Munbe Vaa', 'Tamil Chill Hits', 'Enna Solla'];
        } else if (detectedLang === 'Telugu') {
            playlistQueries = ['Telugu Chill', 'Telugu Feel Good'];
            directQueries = ['Telugu Feel Good Songs', 'Telugu Chill Hits', 'Samajavaragamana', 'Telugu Pleasant Songs'];
        } else if (detectedLang === 'Hindi') {
            playlistQueries = ['Feel Good Bollywood', 'Chill Hits Hindi'];
            directQueries = ['Bollywood Feel Good Songs', 'Hindi Chill Hits', 'Morning Acoustic Hindi'];
        } else if (detectedLang === 'Malayalam') {
            playlistQueries = ['Malayalam Chill', 'Malayalam Feel Good'];
            directQueries = ['Malayalam Chill Hits', 'Malayalam Feel Good Songs'];
        } else if (detectedLang === 'Kannada') {
            playlistQueries = ['Kannada Chill Hits', 'Kannada Feel Good'];
            directQueries = ['Kannada Feel Good Songs', 'Belageddu'];
        } else {
            playlistQueries = ['Feel Good Hits', 'Chill Acoustic Hits'];
            directQueries = ['Feel Good Songs', 'Chill Hits', 'Morning Acoustic'];
        }
    } else if (isRomantic) {
        if (detectedLang === 'Tamil') {
            playlistQueries = ['Tamil Melody', 'Romantic Hits - Tamil', 'Manam Virumbum Melody'];
            directQueries = ['Tamil Melody Hits', 'Harris Jayaraj Melodies', 'AR Rahman Love Hits', 'Tamil Love Songs'];
        } else if (detectedLang === 'Telugu') {
            playlistQueries = ['Telugu Melody', 'Romantic Telugu'];
            directQueries = ['Telugu Romantic Hits', 'Telugu Melody Songs', 'Sid Sriram Melodies Telugu'];
        } else if (detectedLang === 'Hindi') {
            playlistQueries = ['Romantic Hits Hindi', 'Bollywood Romance'];
            directQueries = ['Bollywood Romantic Hits', 'Arijit Singh Melodies', 'Hindi Love Songs'];
        } else if (detectedLang === 'Malayalam') {
            playlistQueries = ['Malayalam Melody Hits', 'Malayalam Romantic'];
            directQueries = ['Malayalam Melody Songs', 'Malayalam Love Songs'];
        } else if (detectedLang === 'Kannada') {
            playlistQueries = ['Kannada Romantic Melodies', 'Kannada Love Hits'];
            directQueries = ['Kannada Romantic Hits', 'Sonu Nigam Kannada Melodies'];
        } else {
            playlistQueries = ['Top Romantic Melodies', 'Bollywood Romance', 'Tamil Melody'];
            directQueries = ['Romantic Hits', 'Love Songs', 'Arijit Singh Hits'];
        }
    } else if (isNightDrive) {
        if (detectedLang === 'Tamil') {
            playlistQueries = ['Night Drive - Tamil', 'Midnight Beats Tamil'];
            directQueries = ['Tamil Night Drive', 'Anirudh Night Drive', 'Late Night Tamil Hits'];
        } else if (detectedLang === 'Telugu') {
            playlistQueries = ['Telugu Night Drive'];
            directQueries = ['Telugu Night Drive Songs', 'Midnight Telugu Hits'];
        } else if (detectedLang === 'Hindi') {
            playlistQueries = ['Late Night Bollywood', 'Midnight Drive Hindi'];
            directQueries = ['Late Night Hindi Songs', 'Midnight Drive Bollywood'];
        } else {
            playlistQueries = ['Night Drive Hits', 'Midnight Car Drive'];
            directQueries = ['Night Drive Songs', 'Late Night Hits'];
        }
    } else if (isSad) {
        if (detectedLang === 'Tamil') {
            playlistQueries = ['Tamil Sad Songs', 'Heartbreak Hits Tamil', 'Soga Padalgal'];
            directQueries = ['Tamil Sad Hits', 'Dhanush Sad Songs', 'Yuvan Sad Songs'];
        } else if (detectedLang === 'Telugu') {
            playlistQueries = ['Telugu Sad Songs', 'Heartbreak Telugu'];
            directQueries = ['Telugu Sad Songs', 'Telugu Heartbreak Hits'];
        } else if (detectedLang === 'Hindi') {
            playlistQueries = ['Sad Songs Hindi', 'Heartbreak Bollywood'];
            directQueries = ['Hindi Sad Songs', 'Bollywood Heartbreak Hits', 'Arijit Singh Sad'];
        } else {
            playlistQueries = ['Sad Songs Hindi', 'Tamil Sad Songs'];
            directQueries = ['Top Sad Songs', 'Heartbreak Hits'];
        }
    } else if (isRain) {
        if (detectedLang === 'Tamil') {
            directQueries = ['Tamil Rain Songs', 'Mazhai Tamil Songs', 'Monsoon Tamil Melodies'];
        } else if (detectedLang === 'Telugu') {
            directQueries = ['Telugu Rain Songs', 'Varsham Telugu Songs', 'Monsoon Melodies Telugu'];
        } else if (detectedLang === 'Hindi') {
            directQueries = ['Bollywood Rain Songs', 'Barish Songs Hindi'];
        } else {
            directQueries = ['Top Rain Songs', 'Monsoon Melodies', 'Barish Songs'];
        }
    } else if (isGym) {
        if (detectedLang === 'Tamil') {
            directQueries = ['Tamil Gym Songs', 'Anirudh Beast BGM', 'Tamil High Energy Songs', 'Tamil Workout Songs'];
        } else if (detectedLang === 'Telugu') {
            directQueries = ['Telugu Workout Songs', 'High Energy Telugu', 'Telugu Gym Motivation'];
        } else if (detectedLang === 'Hindi') {
            directQueries = ['Gym Motivation Hindi', 'Bollywood Workout Anthems', 'Hindi High Energy'];
        } else {
            directQueries = ['Gym Motivation Songs', 'Beast Mode Anthems', 'Workout Pop Hits'];
        }
    } else if (is90s) {
        if (detectedLang === 'Tamil') {
            playlistQueries = ['90s Tamil Hits', 'Tamil Evergreen Classics'];
            directQueries = ['90s Tamil Hits', 'SPB 90s Tamil Songs', 'Ilaiyaraaja 90s Hits'];
        } else if (detectedLang === 'Telugu') {
            playlistQueries = ['90s Telugu Hits', 'Telugu Evergreen Classics'];
            directQueries = ['90s Telugu Hits', 'SPB 90s Telugu Songs'];
        } else if (detectedLang === 'Hindi') {
            playlistQueries = ['90s Bollywood Romantic Songs', 'Kumar Sanu 90s Hits'];
            directQueries = ['90s Bollywood Songs', 'Kumar Sanu Hits', 'Alka Yagnik 90s'];
        } else {
            playlistQueries = ['90s Evergreen Hits', '90s Bollywood Classics'];
            directQueries = ['90s Romantic Songs', 'Evergreen 90s Hits', '90s Tamil Hits'];
        }
    } else if (isLofi) {
        if (detectedLang === 'Tamil') {
            directQueries = ['Tamil Lofi Songs', 'Tamil Chill Lofi', 'Tamil Slowed and Reverb'];
        } else if (detectedLang === 'Telugu') {
            directQueries = ['Telugu Lofi Songs', 'Telugu Slowed and Reverb'];
        } else if (detectedLang === 'Hindi') {
            directQueries = ['Bollywood Lofi Songs', 'Slowed and Reverb Hindi'];
        } else {
            directQueries = ['Top Lofi Songs', 'Chill Lofi Beats', 'Bollywood Lofi Songs'];
        }
    } else if (isWedding) {
        if (detectedLang === 'Tamil') {
            directQueries = ['Tamil Wedding Songs', 'Kalyana Padalgal', 'Tamil Celebration Songs'];
        } else if (detectedLang === 'Telugu') {
            directQueries = ['Telugu Wedding Songs', 'Pelli Patalu Telugu'];
        } else if (detectedLang === 'Hindi') {
            directQueries = ['Bollywood Shaadi Songs', 'Sangeet Dance Songs Hindi'];
        } else {
            directQueries = ['Top Wedding Songs', 'Bollywood Shaadi Songs', 'Celebration Dance Hits'];
        }
    } else if (isAcoustic) {
        if (detectedLang === 'Tamil') {
            directQueries = ['Tamil Acoustic Songs', 'Pradeep Kumar Acoustic', 'Tamil Unplugged'];
        } else if (detectedLang === 'Telugu') {
            directQueries = ['Telugu Acoustic Songs', 'Telugu Unplugged'];
        } else if (detectedLang === 'Hindi') {
            directQueries = ['Bollywood Acoustic Songs', 'Acoustic Hindi Melodies'];
        } else {
            directQueries = ['Top Acoustic Songs', 'Guitar Pop Unplugged', 'Acoustic Hits'];
        }
    } else if (isMass) {
        if (detectedLang === 'Tamil') {
            directQueries = ['Tamil Mass BGM', 'Anirudh Mass BGM', 'Leo BGM', 'Jailer BGM', 'Vikram BGM'];
        } else if (detectedLang === 'Telugu') {
            directQueries = ['Telugu Mass BGM', 'Pushpa BGM', 'Kalki BGM', 'Thaman Mass BGM'];
        } else if (detectedLang === 'Kannada') {
            directQueries = ['KGF BGM', 'Salaar BGM', 'Kannada Mass BGM'];
        } else if (detectedLang === 'Hindi') {
            directQueries = ['Animal BGM', 'Jawan BGM', 'Bollywood Action Theme'];
        } else {
            directQueries = ['KGF BGM', 'Indian Movie Mass BGM', 'Action Swagger BGM', 'Anirudh Mass BGM'];
        }
    }
    const hasMoodIntent = playlistQueries.length > 0 || directQueries.length > 0;
    let isSpecificSearch = false;

    if (!hasMoodIntent) {
        // Check if query is generic top hits for a language or global mix
        const isGenericTopHits = /^(all|tamil|malayalam|telugu|hindi|punjabi|kannada|english)?\s*(top hits|latest|trending|popular|chartbusters|all trending top hits|hits|songs)?$/i.test(q);

        if (isGenericTopHits) {
            if (detectedLang && detectedLang !== 'All') {
                playlistQueries = [`${detectedLang} Top Hits`, `Trending ${detectedLang}`, `${detectedLang} Latest Hits`];
                directQueries = [`${detectedLang} Top Hits`, `${detectedLang} Trending 2026`, `${detectedLang} Latest Songs`];
            } else {
                playlistQueries = ['Global Top 50', 'Trending Today', 'Top JioTunes - Hindi', 'Top 50 - Tamil', 'Tollywood Top 50'];
                directQueries = ['Tamil Trending Hits', 'Bollywood Blockbusters 2026', 'Global Pop Hits', 'Telugu Chartbusters'];
            }
        } else {
            // Specific artist, singer, heroine, hero, song, or custom search query!
            isSpecificSearch = true;
            directQueries = [
                rawQuery,
                `${rawQuery} Songs`,
                `${rawQuery} Hits`
            ];
            playlistQueries = [
                `${rawQuery} Playlist`,
                `${rawQuery} Best Of`,
                `${rawQuery} Hits`
            ];
        }
    }

    const collectedTracks = [];

    // Step A: Helper for Curated Playlist Tracks
    async function runPlaylistQueries() {
        if (playlistQueries.length === 0) return;
        for (const plQuery of playlistQueries.slice(0, 4)) {
            try {
                const plRes = await fetch(`https://www.jiosaavn.com/api.php?__call=search.getPlaylistResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=6&p=1&q=${encodeURIComponent(plQuery)}`, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                });
                if (plRes.ok) {
                    const plData = await plRes.json();
                    if (plData && plData.results) {
                        for (const pl of plData.results.slice(0, 3)) {
                            // Strict playlist language filtering!
                            if (detectedLang && detectedLang !== 'All') {
                                const plLang = (pl.language || '').toLowerCase();
                                if (plLang && plLang !== detectedLang.toLowerCase()) continue;
                            }
                            const listId = pl.listid || pl.id;
                            if (!listId) continue;

                            try {
                                const detRes = await fetch(`https://www.jiosaavn.com/api.php?__call=playlist.getDetails&_format=json&_marker=0&api_version=4&ctx=web6dot0&listid=${listId}`, {
                                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                                });
                                if (detRes.ok) {
                                    const detData = await detRes.json();
                                    if (detData && Array.isArray(detData.list)) {
                                        for (const tr of detData.list) {
                                            if (detectedLang && detectedLang !== 'All') {
                                                const tLang = (tr.language || '').toLowerCase();
                                                if (tLang && tLang !== detectedLang.toLowerCase()) continue;
                                            }
                                            const fmt = formatSaavnTrack(tr);
                                            if (fmt) collectedTracks.push(fmt);
                                        }
                                    }
                                }
                            } catch (dErr) {}
                        }
                    }
                }
            } catch (pErr) {}

            if (collectedTracks.length >= limit * 1.5) break;
        }
    }

    // Step B: Helper for Direct Track Search across multiple pages
    async function runDirectQueries() {
        for (const dQuery of directQueries.slice(0, 5)) {
            for (let page = 1; page <= 4; page++) {
                if (collectedTracks.length >= limit * 1.8) break;
                try {
                    const trRes = await fetch(`https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=40&p=${page}&q=${encodeURIComponent(dQuery)}`, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                    });
                    if (trRes.ok) {
                        const trData = await trRes.json();
                        if (trData && Array.isArray(trData.results)) {
                            for (const tr of trData.results) {
                                if (detectedLang && detectedLang !== 'All') {
                                    const tLang = (tr.language || '').toLowerCase();
                                    if (tLang && tLang !== detectedLang.toLowerCase()) continue;
                                }
                                const fmt = formatSaavnTrack(tr);
                                if (fmt) collectedTracks.push(fmt);
                            }
                        }
                    }
                } catch (tErr) {}
            }
        }
    }

    // If artistRole is provided, harvest specialized queries and apply strict validation!
    let heroConfig = null;
    let heroineConfig = null;

    if (artistRole === 'hero' && artistId) {
        // Find matching hero config
        const key = Object.keys(HERO_FILMOGRAPHY).find(k => artistId.toLowerCase().includes(k) || k.includes(artistId.toLowerCase()));
        if (key) {
            heroConfig = HERO_FILMOGRAPHY[key];
            if (heroConfig.directQueries) {
                directQueries = [...heroConfig.directQueries, ...directQueries];
            }
        }
    } else if (artistRole === 'heroine' && artistId) {
        const key = Object.keys(HEROINE_FILMOGRAPHY).find(k => artistId.toLowerCase().includes(k) || k.includes(artistId.toLowerCase()));
        if (key) {
            heroineConfig = HEROINE_FILMOGRAPHY[key];
            if (heroineConfig.directQueries) {
                directQueries = [...heroineConfig.directQueries, ...directQueries];
            }
        }
    }

    // For specific artist/singer/song searches, direct track search MUST run first to bring authentic hits!
    if (isSpecificSearch || heroConfig || heroineConfig || artistRole === 'singer') {
        await runDirectQueries();
        await runPlaylistQueries();
    } else {
        await runPlaylistQueries();
        await runDirectQueries();
    }

    // Deduplicate collected tracks
    let deduped = deduplicateTracks(collectedTracks);

    // STRICT ARTIST / FILMOGRAPHY VERIFICATION
    if (heroConfig) {
        // Enforce: ONLY tracks from this hero's acted movies or sung by this hero!
        const heroTracks = deduped.filter(t => matchHeroTrack(t, heroConfig));
        if (heroTracks.length > 0) {
            deduped = heroTracks;
        }
    } else if (heroineConfig) {
        // Enforce: ONLY tracks from this heroine's acted movies!
        const heroineTracks = deduped.filter(t => matchHeroineTrack(t, heroineConfig));
        if (heroineTracks.length > 0) {
            deduped = heroineTracks;
        }
    } else if (artistRole === 'singer' && artistName) {
        // Enforce: ONLY tracks sung or composed by this singer!
        const singerTracks = deduped.filter(t => matchSingerTrack(t, artistName));
        if (singerTracks.length > 0) {
            deduped = singerTracks;
        }
    }

    // Step C: STRICT LANGUAGE VERIFICATION
    if (detectedLang && detectedLang !== 'All') {
        const langLower = detectedLang.toLowerCase();
        const strictlyFiltered = deduped.filter(t => {
            if (!t.language) return true;
            return t.language.toLowerCase() === langLower;
        });

        if (strictlyFiltered.length > 0) {
            return strictlyFiltered.slice(0, Math.max(limit, 100));
        }
    }

    return deduped.slice(0, Math.max(limit, 100));
}

// 1. Enhanced Search API Route
app.get('/api/search', async (req, res) => {
    try {
        const query = req.query.q;
        const requestedLang = req.query.lang || null;
        const limit = parseInt(req.query.limit, 10) || 120;
        const artistId = req.query.artistId || null;
        const artistRole = req.query.artistRole || null;
        const artistName = req.query.artistName || null;

        if (!query) {
            return res.status(400).json({ success: false, error: 'Search query is required' });
        }

        // Primary: Multi-Source Intelligent JioSaavn Engine
        try {
            const tracks = await smartSearch(query, limit, requestedLang, artistId, artistRole, artistName);
            if (tracks && tracks.length > 0) {
                return res.json({ success: true, count: tracks.length, tracks });
            }
        } catch (saavnErr) {
            console.warn('JioSaavn smart search warning, attempting fallback:', saavnErr.message);
        }

        // Secondary Fallback: iTunes Search API
        try {
            const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=${limit}`;
            const itunesRes = await fetch(itunesUrl);
            if (itunesRes.ok) {
                const itunesData = await itunesRes.json();
                if (itunesData.results && itunesData.results.length > 0) {
                    const fallbackTracks = itunesData.results.map(track => ({
                        id: track.trackId.toString(),
                        title: track.trackName || 'Unknown Title',
                        artist: track.artistName || 'Unknown Artist',
                        album: track.collectionName || '',
                        duration: Math.floor((track.trackTimeMillis || 180000) / 1000),
                        coverUrl: (track.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
                        streamUrl: track.previewUrl,
                        fallbackStreamUrl: '',
                        language: 'Global',
                        year: track.releaseDate ? track.releaseDate.substring(0, 4) : '2024',
                        hasLyrics: false,
                        lyricsSnippet: ''
                    })).filter(t => t.streamUrl);

                    return res.json({ success: true, count: fallbackTracks.length, tracks: fallbackTracks });
                }
            }
        } catch (itunesErr) {
            console.error('iTunes fallback error:', itunesErr.message);
        }

        return res.json({ success: true, count: 0, tracks: [] });

    } catch (error) {
        console.error('Search API Critical Error:', error);
        res.status(500).json({ success: false, error: 'Failed to search tracks' });
    }
});

// In-memory cache for processed lyrics and English transliterations
const lyricsCache = new Map();

/**
 * Generate English Romanized (Sing-Along) and English Translation lyrics
 */
async function generateEnglishLyrics(syncedLyrics, plainLyrics) {
    const rawText = syncedLyrics || plainLyrics;
    if (!rawText) return null;

    try {
        const lines = rawText.split('\n');
        const timestamps = [];
        const cleanLines = [];

        lines.forEach(line => {
            const m = line.match(/^(\[\d+:\d+(\.\d+)?\])(.*)/);
            if (m) {
                timestamps.push(m[1]);
                cleanLines.push(m[3].trim());
            } else {
                timestamps.push(null);
                cleanLines.push(line.trim());
            }
        });

        // Translate and Romanize in batches of up to 60 lines
        const batchSize = 60;
        let romanizedAll = [];
        let translatedAll = [];
        let detectedLang = 'auto';

        for (let i = 0; i < cleanLines.length; i += batchSize) {
            const batch = cleanLines.slice(i, i + batchSize);
            const joinedBatch = batch.join('\n');

            try {
                const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&dt=rm&q=' + encodeURIComponent(joinedBatch);
                const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                if (!res.ok) continue;

                const data = await res.json();
                if (data[2]) detectedLang = data[2];

                let batchTranslations = [];
                let batchRomanized = null;

                if (data[0] && Array.isArray(data[0])) {
                    const last = data[0][data[0].length - 1];
                    if (last && Array.isArray(last) && last[3]) {
                        batchRomanized = last[3].split('\n');
                    }

                    data[0].forEach(item => {
                        if (item && item[0]) {
                            batchTranslations.push(item[0]);
                        }
                    });
                }

                if (!batchRomanized || batchRomanized.length === 0) {
                    batchRomanized = batchTranslations;
                }

                const transSplit = batchTranslations.join('').split('\n');
                translatedAll = translatedAll.concat(transSplit);
                romanizedAll = romanizedAll.concat(batchRomanized);
            } catch (bErr) {
                console.warn('Batch translation warning:', bErr.message);
            }
        }

        let englishSingAlongSynced = [];
        let englishSingAlongPlain = [];
        let englishTransSynced = [];
        let englishTransPlain = [];

        for (let i = 0; i < cleanLines.length; i++) {
            const ts = timestamps[i];
            const rom = (romanizedAll[i] || cleanLines[i]).trim();
            const trans = (translatedAll[i] || cleanLines[i]).trim();

            if (ts) {
                englishSingAlongSynced.push(`${ts} ${rom}`);
                englishTransSynced.push(`${ts} ${trans}`);
            }
            englishSingAlongPlain.push(rom);
            englishTransPlain.push(trans);
        }

        const hasTimestamps = timestamps.some(t => t !== null);

        return {
            detectedLang,
            isEnglish: detectedLang === 'en',
            englishSingAlong: {
                synced: hasTimestamps ? englishSingAlongSynced.join('\n') : null,
                plain: englishSingAlongPlain.join('\n')
            },
            englishTranslation: {
                synced: hasTimestamps ? englishTransSynced.join('\n') : null,
                plain: englishTransPlain.join('\n')
            }
        };
    } catch (err) {
        console.warn('generateEnglishLyrics error:', err.message);
        return null;
    }
}

// 2. Lyrics API Route (JioSaavn Native + LRCLIB + Multilingual English Translation/Romanization)
app.get('/api/lyrics', async (req, res) => {
    try {
        const { id, title, artist } = req.query;
        if (!title && !id) {
            return res.status(400).json({ success: false, error: 'Song ID or title is required' });
        }

        // Clean title: remove movie subtitles like (From "OM Chapter 1..."), [Tamil], (Remix), etc.
        const cleanTitle = (title || '')
            .replace(/\([^)]*from[^)]*\)/gi, '')
            .replace(/\(from.*?\)/gi, '')
            .replace(/\([^)]*\)/g, '')
            .replace(/\[[^\]]*\]/g, '')
            .replace(/-.*$/g, '')
            .trim();

        // Extract primary artist
        const primaryArtist = (artist || '').split(/[,-]/)[0].trim();

        const durationNum = req.query.duration ? Math.round(parseFloat(req.query.duration)) : null;
        const cacheKey = `${id || ''}_${cleanTitle}_${primaryArtist}_${durationNum || ''}`;
        if (lyricsCache.has(cacheKey)) {
            return res.json(lyricsCache.get(cacheKey));
        }

        let foundSource = '';
        let rawSynced = null;
        let rawPlain = null;

        const LRCLIB_HEADERS = {
            'User-Agent': 'VedhaMusicApp/1.0 (https://github.com/sachinchetty27)'
        };

        // 1. PRIORITY 1: Search LRCLIB for EXACT Synchronized Lyrics (timestamps)
        if (cleanTitle) {
            // Attempt 1A: Exact match via /api/get if duration is known
            if (primaryArtist && durationNum) {
                try {
                    const exactUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(primaryArtist)}&duration=${durationNum}`;
                    const exactRes = await fetch(exactUrl, { headers: LRCLIB_HEADERS });
                    if (exactRes.ok) {
                        const exactData = await exactRes.json();
                        if (exactData && exactData.syncedLyrics) {
                            foundSource = 'LRCLIB (Exact Synced)';
                            rawSynced = exactData.syncedLyrics;
                            rawPlain = exactData.plainLyrics || null;
                        }
                    }
                } catch (e) {
                    console.warn('LRCLIB exact lookup warning:', e.message);
                }
            }

            // Attempt 1B: Search by title + artist on LRCLIB
            if (!rawSynced) {
                try {
                    const searchQ = primaryArtist ? `${cleanTitle} ${primaryArtist}` : cleanTitle;
                    const lrcUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(searchQ)}`;
                    const response = await fetch(lrcUrl, { headers: LRCLIB_HEADERS });
                    if (response.ok) {
                        const list = await response.json();
                        if (Array.isArray(list) && list.length > 0) {
                            // Find match with syncedLyrics
                            const syncedMatch = list.find(item => item.syncedLyrics && (
                                !primaryArtist || !item.artistName || item.artistName.toLowerCase().includes(primaryArtist.toLowerCase()) || primaryArtist.toLowerCase().includes(item.artistName.toLowerCase())
                            )) || list.find(item => item.syncedLyrics);

                            if (syncedMatch) {
                                foundSource = 'LRCLIB (Synced)';
                                rawSynced = syncedMatch.syncedLyrics;
                                rawPlain = syncedMatch.plainLyrics || null;
                            } else {
                                // If list only has plain lyrics, save first plain match as fallback
                                const plainMatch = list.find(item => item.plainLyrics);
                                if (plainMatch) {
                                    rawPlain = plainMatch.plainLyrics;
                                }
                            }
                        }
                    }
                } catch (lrcErr) {
                    console.warn('LRCLIB search lookup warning:', lrcErr.message);
                }
            }

            // Attempt 1C: Search by cleanTitle alone if artist search yielded nothing
            if (!rawSynced && primaryArtist) {
                try {
                    const lrcUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle)}`;
                    const response = await fetch(lrcUrl, { headers: LRCLIB_HEADERS });
                    if (response.ok) {
                        const list = await response.json();
                        if (Array.isArray(list) && list.length > 0) {
                            const syncedMatch = list.find(item => item.syncedLyrics);
                            if (syncedMatch) {
                                foundSource = 'LRCLIB (Title Synced)';
                                rawSynced = syncedMatch.syncedLyrics;
                                if (!rawPlain) rawPlain = syncedMatch.plainLyrics || null;
                            }
                        }
                    }
                } catch (lrcErr2) {
                    console.warn('LRCLIB title-only lookup warning:', lrcErr2.message);
                }
            }
        }

        // 2. PRIORITY 2: If no synced lyrics exist, fetch JioSaavn plain lyrics
        if (!rawSynced && !rawPlain && id) {
            try {
                const jioLyricsUrl = `https://www.jiosaavn.com/api.php?__call=lyrics.getLyrics&lyrics_id=${encodeURIComponent(id)}&_format=json&ctx=web6dot0`;
                const jioRes = await fetch(jioLyricsUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
                });
                if (jioRes.ok) {
                    const jioData = await jioRes.json();
                    if (jioData && jioData.lyrics) {
                        foundSource = 'JioSaavn (Plain)';
                        rawPlain = jioData.lyrics
                            .replace(/<br\s*[\/]?>/gi, '\n')
                            .replace(/&quot;/g, '"')
                            .replace(/&#039;/g, "'")
                            .replace(/&amp;/g, '&');
                    }
                }
            } catch (e) {
                console.warn('JioSaavn lyrics lookup warning:', e.message);
            }
        }

        // 3. PRIORITY 3: Fallback to Lyrics.ovh plain lyrics
        if (!rawSynced && !rawPlain && primaryArtist && cleanTitle) {
            try {
                const ovhUrl = `https://api.lyrics.ovh/v1/${encodeURIComponent(primaryArtist)}/${encodeURIComponent(cleanTitle)}`;
                const ovhRes = await fetch(ovhUrl);
                if (ovhRes.ok) {
                    const ovhData = await ovhRes.json();
                    if (ovhData.lyrics) {
                        foundSource = 'LyricsOVH';
                        rawPlain = ovhData.lyrics;
                    }
                }
            } catch (ovhErr) {
                console.warn('LyricsOVH lookup warning:', ovhErr.message);
            }
        }

        if (rawSynced || rawPlain) {
            // Generate English sing-along and English translation
            const engData = await generateEnglishLyrics(rawSynced, rawPlain);

            const payload = {
                success: true,
                isSynced: !!rawSynced,
                source: foundSource,
                trackName: cleanTitle,
                artistName: primaryArtist,
                detectedLang: engData?.detectedLang || 'auto',
                isEnglish: engData?.isEnglish || false,
                original: {
                    synced: rawSynced,
                    plain: rawPlain
                },
                englishSingAlong: {
                    synced: engData?.englishSingAlong?.synced || rawSynced,
                    plain: engData?.englishSingAlong?.plain || rawPlain
                },
                englishTranslation: {
                    synced: engData?.englishTranslation?.synced || rawSynced,
                    plain: engData?.englishTranslation?.plain || rawPlain
                },
                syncedLyrics: rawSynced,
                plainLyrics: rawPlain
            };

            lyricsCache.set(cacheKey, payload);
            return res.json(payload);
        }

        res.json({
            success: false,
            plainLyrics: 'Lyrics currently unavailable for this track. Immerse in the rhythm!',
            syncedLyrics: null
        });

    } catch (error) {
        console.error('Lyrics API Error:', error);
        res.status(500).json({ success: false, error: 'Lyrics fetch error' });
    }
});

// 3. Audio Streaming Proxy with Byte-Range support (ensures smooth seeking and zero CORS issues)
app.get('/api/stream', async (req, res) => {
    try {
        const url = req.query.url;
        if (!url) return res.status(400).send('Stream URL is required');

        const forwardHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Referer': 'https://www.jiosaavn.com/'
        };

        if (req.headers.range) {
            forwardHeaders['Range'] = req.headers.range;
        }

        const audioRes = await fetch(url, { headers: forwardHeaders });
        res.status(audioRes.status);

        const headersToCopy = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
        headersToCopy.forEach(header => {
            const val = audioRes.headers.get(header);
            if (val) res.setHeader(header, val);
        });

        res.setHeader('Access-Control-Allow-Origin', '*');

        if (audioRes.body) {
            Readable.fromWeb(audioRes.body).pipe(res);
        } else {
            res.end();
        }
    } catch (err) {
        console.error('Stream proxy error:', err.message);
        res.status(500).send('Streaming error');
    }
});

// 4. Official Music Video Resolution API (with YouTube search & caching)
const videoCache = new Map();

app.get('/api/video', async (req, res) => {
    try {
        const query = req.query.q || (req.query.title ? `${req.query.title} ${req.query.artist || ''}` : '');
        if (!query) {
            return res.status(400).json({ success: false, error: 'Query or song title is required' });
        }

        const cleanQuery = cleanText(query).replace(/[([].*?[)\]]/g, '').trim();
        const cacheKey = cleanQuery.toLowerCase();
        if (videoCache.has(cacheKey)) {
            return res.json({ success: true, ...videoCache.get(cacheKey) });
        }

        const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery + ' official video')}`;
        const response = await fetch(ytUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        });

        if (!response.ok) {
            throw new Error(`YouTube search returned status ${response.status}`);
        }

        const html = await response.text();
        let videoData = null;

        // Try parsing ytInitialData structured JSON
        const jsonMatch = html.match(/var ytInitialData = ({.*?});<\/script>/s) || html.match(/ytInitialData\s*=\s*({.+?});/);
        if (jsonMatch) {
            try {
                const data = JSON.parse(jsonMatch[1]);
                const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
                for (const section of contents) {
                    const items = section.itemSectionRenderer?.contents || [];
                    for (const item of items) {
                        if (item.videoRenderer) {
                            const vr = item.videoRenderer;
                            const videoId = vr.videoId;
                            const title = vr.title?.runs?.map(r => r.text).join('') || vr.title?.simpleText || cleanQuery;
                            const author = vr.ownerText?.runs?.map(r => r.text).join('') || '';
                            const thumb = vr.thumbnail?.thumbnails?.pop()?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
                            videoData = { videoId, title, author, thumb };
                            break;
                        }
                    }
                    if (videoData) break;
                }
            } catch (err) {
                // fall through to regex
            }
        }

        // Fallback to videoId regex match
        if (!videoData) {
            const match = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
            if (match) {
                videoData = {
                    videoId: match[1],
                    title: cleanQuery,
                    author: '',
                    thumb: `https://i.ytimg.com/vi/${match[1]}/hqdefault.jpg`
                };
            }
        }

        if (videoData && videoData.videoId) {
            const embedUrl = `https://www.youtube-nocookie.com/embed/${videoData.videoId}?autoplay=1&enablejsapi=1&rel=0&modestbranding=1&controls=1&iv_load_policy=3&fs=0`;
            const result = {
                ...videoData,
                embedUrl,
                watchUrl: `https://www.youtube.com/watch?v=${videoData.videoId}`
            };
            videoCache.set(cacheKey, result);
            return res.json({ success: true, ...result });
        }

        return res.status(404).json({ success: false, error: 'No video found for track' });
    } catch (err) {
        console.error('Video search error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// 5. Health Check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'online',
        service: 'Vedha Music Player Backend',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Start Server
if (require.main === module && !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Vedha Music Player Backend running on http://localhost:${PORT}`);
    });
}

module.exports = app;