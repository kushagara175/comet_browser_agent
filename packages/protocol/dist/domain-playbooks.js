/**
 * @privapilot/protocol - Domain Playbooks (Site-Specific Agent Knowledge)
 *
 * Implements deterministic domain playbooks and site knowledge inspired by
 * browser-harness domain-skills, providing instant route and target grounding
 * for specific portals without requiring DOM trial-and-error.
 */
import { normalizeSemanticText, tokenizeSemanticText, isFuzzyTokenMatch } from './grounding.js';
/**
 * Built-in playbook for Smart India Hackathon (sih.gov.in) portal.
 * Maps known navigation paths, key landmarks, search inputs, and submission metrics.
 */
export const SIH_PLAYBOOK = {
    domain: 'sih.gov.in',
    name: 'Smart India Hackathon Portal',
    aliases: ['sih.gov.in', 'www.sih.gov.in', 'sih', 'smart indiahackathon'],
    routes: [
        {
            name: 'signin',
            path: '/signin',
            description: 'SIH login & authentication page for teams, institutes, and evaluators',
            matchKeywords: ['login', 'signin', 'sign in', 'log in', 'portal login', 'auth']
        },
        {
            name: 'problemStatements',
            path: '/problem-statements',
            aliases: ['/sih2026PS', '/sih2025PS', '/sih2024PS', '/problem-statements'],
            description: 'Problem statements search and directory listing',
            matchKeywords: ['problem statement', 'problem statements', 'ps', 'problem list', 'view ps', 'problems']
        },
        {
            name: 'spoc',
            path: '/know-your-spoc',
            description: 'Know Your College / Institute SPOC search directory',
            matchKeywords: ['spoc', 'know your spoc', 'college spoc', 'find spoc', 'spoc details', 'institute spoc']
        },
        {
            name: 'home',
            path: '/',
            description: 'SIH main landing page and announcements',
            matchKeywords: ['home', 'homepage', 'main page', 'landing page', 'overview']
        },
        {
            name: 'results',
            path: '/results',
            description: 'Hackathon round results and nominated finalists',
            matchKeywords: ['result', 'results', 'winners', 'shortlisted', 'finalists', 'evaluations']
        },
        {
            name: 'guidelines',
            path: '/guidelines',
            description: 'Hackathon rules, submission process and guidelines',
            matchKeywords: ['guidelines', 'process', 'rules', 'instructions', 'flow']
        }
    ],
    landmarks: [
        {
            id: 'spoc_link',
            phrase: 'Know Your SPOC',
            aliases: ['know your spoc', 'spoc', 'college spoc', 'find your spoc', 'spoc directory', 'institute spoc'],
            role: 'link',
            description: 'Direct link to college SPOC verification tool',
            intentAction: 'click'
        },
        {
            id: 'login_btn',
            phrase: 'SIH Login',
            aliases: ['login', 'sih login', 'sign in', 'institute login', 'student login'],
            role: 'link',
            description: 'Login button for SIH portal',
            intentAction: 'click'
        },
        {
            id: 'problem_statements_nav',
            phrase: 'Problem Statements',
            aliases: ['problem statements', 'problem statement', 'ps list', 'browse problem statements'],
            role: 'link',
            description: 'Navigation link to browse Hackathon problem statements',
            intentAction: 'click'
        },
        {
            id: 'ps_search_field',
            phrase: 'Search Problem Statement',
            aliases: ['search', 'search by ps', 'filter by ps', 'ps number', 'ps id', 'enter keyword', 'search input'],
            role: 'input',
            description: 'Search box to filter problem statements by ID or theme',
            intentAction: 'type'
        },
        {
            id: 'submissions_nav',
            phrase: 'Submitted Ideas',
            aliases: ['submitted ideas', 'submissions', 'total submissions', 'my submissions', 'nominations'],
            role: 'tab',
            description: 'Tab or section showing team idea submissions',
            intentAction: 'click'
        }
    ],
    metricsRules: [
        {
            metricId: 'total_submissions',
            labelKeywords: ['submission', 'submissions', 'submitted ideas', 'ideas submitted', 'total submissions', 'nominations'],
            containerHints: ['stat', 'card', 'metric', 'table', 'counter', 'dashboard', 'box'],
            valuePattern: '\\b\\d+(?:,\\d+)*\\b',
            description: 'Number of submitted ideas or team nominations'
        },
        {
            metricId: 'total_problem_statements',
            labelKeywords: ['problem statements', 'total ps', 'problems count', 'active ps'],
            containerHints: ['counter', 'stat', 'badge', 'card'],
            valuePattern: '\\b\\d+\\b',
            description: 'Total number of problem statements available'
        }
    ],
    formFieldHints: {
        username: ['email', 'username', 'user name', 'registered email', 'userid', 'login id'],
        password: ['password', 'pass', 'pwd', 'enter password']
    }
};
/**
 * Playbook for GitHub (github.com)
 */
export const GITHUB_PLAYBOOK = {
    domain: 'github.com',
    name: 'GitHub',
    aliases: ['github.com', 'www.github.com', 'github'],
    routes: [
        {
            name: 'login',
            path: '/login',
            description: 'GitHub user sign in page',
            matchKeywords: ['login', 'sign in', 'signin', 'auth', 'log in']
        },
        {
            name: 'search',
            path: '/search',
            description: 'GitHub global search for code, repos, issues',
            matchKeywords: ['search', 'find repository', 'search code', 'search repos']
        },
        {
            name: 'trending',
            path: '/trending',
            description: 'Trending repositories and developers',
            matchKeywords: ['trending', 'trending repositories', 'popular repos']
        },
        {
            name: 'pulls',
            path: '/pulls',
            description: 'Global pull requests dashboard',
            matchKeywords: ['pull requests', 'prs', 'my prs']
        },
        {
            name: 'issues',
            path: '/issues',
            description: 'Global issues dashboard',
            matchKeywords: ['issues', 'my issues']
        },
        {
            name: 'home',
            path: '/',
            description: 'GitHub dashboard / home feed',
            matchKeywords: ['home', 'dashboard', 'feed']
        }
    ],
    landmarks: [
        {
            id: 'search_github',
            phrase: 'Type / to search',
            aliases: ['Search or jump to...', 'Search GitHub', 'Search', 'search box', 'search input'],
            role: 'input',
            description: 'Global search bar for code, repositories, and topics',
            intentAction: 'type'
        },
        {
            id: 'new_repo',
            phrase: 'New',
            aliases: ['New repository', 'Create repository', '+ New'],
            role: 'button',
            description: 'Create new repository button',
            intentAction: 'click'
        },
        {
            id: 'star_repo',
            phrase: 'Star',
            aliases: ['Star repository', 'Unstar'],
            role: 'button',
            description: 'Star repository button',
            intentAction: 'click'
        },
        {
            id: 'fork_repo',
            phrase: 'Fork',
            aliases: ['Fork repository', 'Create fork'],
            role: 'button',
            description: 'Fork repository button',
            intentAction: 'click'
        },
        {
            id: 'pull_requests_tab',
            phrase: 'Pull requests',
            aliases: ['PRs', 'Pull requests tab'],
            role: 'tab',
            description: 'Repository pull requests tab',
            intentAction: 'click'
        },
        {
            id: 'issues_tab',
            phrase: 'Issues',
            aliases: ['Issues tab', 'Bug reports'],
            role: 'tab',
            description: 'Repository issues tab',
            intentAction: 'click'
        }
    ],
    metricsRules: [
        {
            metricId: 'stars',
            labelKeywords: ['stars', 'starred', 'stargazers'],
            containerHints: ['social-count', 'star-count', 'repo-stars', 'badge', 'counter'],
            valuePattern: '\\b\\d+(?:\\.\\d+)?[kKmM]?\\b',
            description: 'Number of stars on repository'
        },
        {
            metricId: 'forks',
            labelKeywords: ['forks', 'forked'],
            containerHints: ['social-count', 'fork-count', 'repo-forks', 'counter'],
            valuePattern: '\\b\\d+(?:\\.\\d+)?[kKmM]?\\b',
            description: 'Number of forks of repository'
        },
        {
            metricId: 'open_issues',
            labelKeywords: ['open issues', 'issues open', 'issues'],
            containerHints: ['issues-repo', 'counter', 'tab-count'],
            valuePattern: '\\b\\d+(?:,\\d+)*\\b',
            description: 'Number of open issues'
        }
    ],
    formFieldHints: {
        username: ['login_field', 'username', 'email', 'login'],
        password: ['password', 'current-password', 'pwd'],
        search: ['query-builder-test', 'search', 'q']
    }
};
/**
 * Playbook for YouTube (youtube.com)
 */
export const YOUTUBE_PLAYBOOK = {
    domain: 'youtube.com',
    name: 'YouTube',
    aliases: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'youtube'],
    routes: [
        {
            name: 'search',
            path: '/results',
            description: 'YouTube video search results',
            matchKeywords: ['search', 'search video', 'results', 'find video']
        },
        {
            name: 'subscriptions',
            path: '/feed/subscriptions',
            description: 'Subscribed channel videos',
            matchKeywords: ['subscriptions', 'subscribed', 'sub feed']
        },
        {
            name: 'trending',
            path: '/feed/trending',
            description: 'Trending and viral videos',
            matchKeywords: ['trending', 'trending videos', 'explore']
        },
        {
            name: 'home',
            path: '/',
            description: 'YouTube home recommendation feed',
            matchKeywords: ['home', 'homepage', 'feed']
        }
    ],
    landmarks: [
        {
            id: 'yt_search',
            phrase: 'Search',
            aliases: ['search_query', 'Search YouTube', 'search box', 'search input'],
            role: 'input',
            description: 'Main YouTube search input box',
            intentAction: 'type'
        },
        {
            id: 'subscribe_btn',
            phrase: 'Subscribe',
            aliases: ['Subscribed', 'Join'],
            role: 'button',
            description: 'Channel subscribe button',
            intentAction: 'click'
        },
        {
            id: 'like_btn',
            phrase: 'Like',
            aliases: ['like this video', 'thumbs up'],
            role: 'button',
            description: 'Video like button',
            intentAction: 'click'
        },
        {
            id: 'play_pause',
            phrase: 'Play',
            aliases: ['Pause', 'Toggle play', 'Play (k)'],
            role: 'button',
            description: 'Player play / pause toggle',
            intentAction: 'click'
        }
    ],
    metricsRules: [
        {
            metricId: 'views',
            labelKeywords: ['views', 'view count'],
            containerHints: ['view-count', 'description', 'metadata-line', 'video-info'],
            valuePattern: '\\b\\d+(?:[.,]\\d+)?[kKmMbB]?\\s*(?:views)?\\b',
            description: 'Total video view count'
        },
        {
            metricId: 'subscribers',
            labelKeywords: ['subscribers', 'subs'],
            containerHints: ['owner-sub-count', 'channel-sub-count', 'subscriber-count'],
            valuePattern: '\\b\\d+(?:\\.\\d+)?[kKmM]?\\s*(?:subscribers)?\\b',
            description: 'Channel subscriber count'
        }
    ],
    formFieldHints: {
        search: ['search_query', 'search', 'query']
    }
};
/**
 * Playbook for Reddit (reddit.com)
 */
export const REDDIT_PLAYBOOK = {
    domain: 'reddit.com',
    name: 'Reddit',
    aliases: ['reddit.com', 'www.reddit.com', 'old.reddit.com', 'reddit'],
    routes: [
        {
            name: 'popular',
            path: '/r/popular',
            description: 'Popular posts across all communities',
            matchKeywords: ['popular', 'popular posts', 'hot']
        },
        {
            name: 'all',
            path: '/r/all',
            description: 'All reddit posts',
            matchKeywords: ['all', 'r/all']
        },
        {
            name: 'search',
            path: '/search',
            description: 'Reddit search for posts, communities, users',
            matchKeywords: ['search', 'find post', 'search reddit']
        },
        {
            name: 'login',
            path: '/login',
            description: 'Reddit user login',
            matchKeywords: ['login', 'signin', 'log in']
        },
        {
            name: 'home',
            path: '/',
            description: 'Reddit frontpage / home feed',
            matchKeywords: ['home', 'frontpage', 'feed']
        }
    ],
    landmarks: [
        {
            id: 'reddit_search',
            phrase: 'Search Reddit',
            aliases: ['Search', 'search input', 'search query'],
            role: 'input',
            description: 'Global Reddit search input',
            intentAction: 'type'
        },
        {
            id: 'create_post',
            phrase: 'Create Post',
            aliases: ['Create', 'Post', '+ Create'],
            role: 'button',
            description: 'Create new post button',
            intentAction: 'click'
        },
        {
            id: 'upvote',
            phrase: 'Upvote',
            aliases: ['up vote', 'like post'],
            role: 'button',
            description: 'Post or comment upvote button',
            intentAction: 'click'
        },
        {
            id: 'comments',
            phrase: 'Comments',
            aliases: ['View comments', 'comment count'],
            role: 'button',
            description: 'Open discussion comments',
            intentAction: 'click'
        }
    ],
    metricsRules: [
        {
            metricId: 'upvotes',
            labelKeywords: ['upvotes', 'votes', 'points'],
            containerHints: ['score', 'vote-count', 'post-score'],
            valuePattern: '\\b\\d+(?:\\.\\d+)?[kK]?\\b',
            description: 'Upvotes or karma score'
        },
        {
            metricId: 'comments_count',
            labelKeywords: ['comments', 'comment'],
            containerHints: ['comment-count', 'post-comments'],
            valuePattern: '\\b\\d+(?:\\.\\d+)?[kK]?\\s*comments?\\b',
            description: 'Number of discussion comments'
        }
    ],
    formFieldHints: {
        search: ['q', 'search', 'query'],
        username: ['username', 'user'],
        password: ['password', 'passwd']
    }
};
/**
 * Playbook for DuckDuckGo (duckduckgo.com)
 */
export const DUCKDUCKGO_PLAYBOOK = {
    domain: 'duckduckgo.com',
    name: 'DuckDuckGo',
    aliases: ['duckduckgo.com', 'www.duckduckgo.com', 'html.duckduckgo.com', 'duckduckgo', 'ddg'],
    routes: [
        {
            name: 'home',
            path: '/',
            description: 'DuckDuckGo private search engine homepage',
            matchKeywords: ['home', 'homepage', 'search']
        },
        {
            name: 'settings',
            path: '/settings',
            description: 'Search preferences and themes',
            matchKeywords: ['settings', 'preferences', 'theme']
        }
    ],
    landmarks: [
        {
            id: 'ddg_search',
            phrase: 'Search without being tracked',
            aliases: ['Search the web without being tracked', 'search input', 'search query', 'Search', 'q'],
            role: 'input',
            description: 'Main DuckDuckGo search query input',
            intentAction: 'type'
        },
        {
            id: 'clear_search',
            phrase: 'Clear',
            aliases: ['Clear search', 'Reset search'],
            role: 'button',
            description: 'Clear input query button',
            intentAction: 'click'
        }
    ],
    metricsRules: [
        {
            metricId: 'results_count',
            labelKeywords: ['results', 'found'],
            containerHints: ['result-count', 'search-meta'],
            valuePattern: '\\b\\d+(?:,\\d+)*\\b',
            description: 'Number of search results'
        }
    ],
    formFieldHints: {
        search: ['q', 'search_form_input', 'search_form_input_homepage']
    }
};
/**
 * Playbook for Google Search (google.com)
 */
export const GOOGLE_PLAYBOOK = {
    domain: 'google.com',
    name: 'Google',
    aliases: ['google.com', 'www.google.com', 'google'],
    routes: [
        {
            name: 'home',
            path: '/',
            description: 'Google Search homepage',
            matchKeywords: ['home', 'homepage', 'search']
        },
        {
            name: 'search',
            path: '/search',
            description: 'Google Search results page',
            matchKeywords: ['results', 'search results']
        },
        {
            name: 'preferences',
            path: '/preferences',
            description: 'Search settings & safe search',
            matchKeywords: ['preferences', 'settings', 'safesearch']
        }
    ],
    landmarks: [
        {
            id: 'google_search_input',
            phrase: 'Search',
            aliases: ['Search query', 'search box', 'search input', 'q'],
            role: 'input',
            description: 'Google search text input',
            intentAction: 'type'
        },
        {
            id: 'google_search_button',
            phrase: 'Google Search',
            aliases: ['Search button', 'Google search'],
            role: 'button',
            description: 'Trigger Google search button',
            intentAction: 'click'
        },
        {
            id: 'lucky_button',
            phrase: "I'm Feeling Lucky",
            aliases: ['Feeling lucky', 'lucky button'],
            role: 'button',
            description: "I'm Feeling Lucky direct navigation button",
            intentAction: 'click'
        }
    ],
    metricsRules: [
        {
            metricId: 'search_results_count',
            labelKeywords: ['about', 'results', 'seconds'],
            containerHints: ['result-stats', 'appbar'],
            valuePattern: '\\b\\d+(?:,\\d+)*(?:\\.\\d+)?\\s*(?:results)?\\b',
            description: 'Estimated count of search results'
        }
    ],
    formFieldHints: {
        search: ['q', 'search', 'query']
    }
};
/**
 * Playbook for Wikipedia (wikipedia.org)
 */
export const WIKIPEDIA_PLAYBOOK = {
    domain: 'wikipedia.org',
    name: 'Wikipedia',
    aliases: ['wikipedia.org', 'en.wikipedia.org', 'www.wikipedia.org', 'wikipedia', 'wiki'],
    routes: [
        {
            name: 'mainPage',
            path: '/wiki/Main_Page',
            description: 'Wikipedia main encyclopedia portal',
            matchKeywords: ['main page', 'home', 'frontpage', 'portal']
        },
        {
            name: 'search',
            path: '/wiki/Special:Search',
            description: 'Wikipedia article search',
            matchKeywords: ['search', 'search wikipedia', 'find article']
        },
        {
            name: 'random',
            path: '/wiki/Special:Random',
            description: 'Random encyclopedia article',
            matchKeywords: ['random', 'random article', 'surprise me']
        }
    ],
    landmarks: [
        {
            id: 'wiki_search',
            phrase: 'Search Wikipedia',
            aliases: ['search input', 'Search', 'search box', 'searchInput'],
            role: 'input',
            description: 'Search Wikipedia encyclopedia articles',
            intentAction: 'type'
        },
        {
            id: 'contents_link',
            phrase: 'Contents',
            aliases: ['Table of contents', 'Articles content'],
            role: 'link',
            description: 'Wikipedia contents directory',
            intentAction: 'click'
        },
        {
            id: 'random_article',
            phrase: 'Random article',
            aliases: ['Random', 'Special:Random'],
            role: 'link',
            description: 'Navigate to random article',
            intentAction: 'click'
        }
    ],
    metricsRules: [
        {
            metricId: 'references_count',
            labelKeywords: ['references', 'citations'],
            containerHints: ['reflist', 'references'],
            valuePattern: '\\b\\d+\\b',
            description: 'Total number of citations/references'
        }
    ],
    formFieldHints: {
        search: ['search', 'searchInput', 'query']
    }
};
/**
 * Built-in playbook for Indian Space Research Organisation (isro.gov.in) portal.
 * Core domain for SIH problem statement SIH26171 / SIH26209.
 */
export const ISRO_PLAYBOOK = {
    domain: 'www.isro.gov.in',
    name: 'Indian Space Research Organisation',
    aliases: ['isro.gov.in', 'www.isro.gov.in', 'isro', 'indian space research organisation', 'isro portal'],
    routes: [
        {
            name: 'missions',
            path: '/Missions.html',
            aliases: ['/Missions.html', '/missions', '/spacecraft.html', '/launchers.html', '/Missions'],
            description: 'ISRO space missions and satellite timeline directory',
            matchKeywords: ['mission', 'missions', 'space missions', 'chandrayaan', 'gaganyaan', 'aditya', 'mangalyaan', 'satellites']
        },
        {
            name: 'launchers',
            path: '/Launchers.html',
            aliases: ['/Launchers.html', '/launchers', '/Launchers', '/pslv.html', '/gslv.html'],
            description: 'ISRO launch vehicle family (PSLV, GSLV, LVM3, SSLV)',
            matchKeywords: ['launcher', 'launchers', 'launch vehicle', 'rocket', 'pslv', 'gslv', 'lvm3', 'sslv']
        },
        {
            name: 'earth_observation',
            path: '/Earth_Observation.html',
            aliases: ['/Earth_Observation.html', '/earth_observation', '/earth-observation.html', '/EarthObservation.html'],
            description: 'ISRO Earth Observation applications and satellite data services (Bhuvan, MOSDAC, VEDAS, Bhoonidhi)',
            matchKeywords: ['earth observation', 'earth', 'observation', 'remote sensing', 'bhuvan', 'mosdac', 'vedas', 'bhoonidhi', 'thematic maps', 'weather satellite']
        },
        {
            name: 'careers',
            path: '/Careers.html',
            aliases: ['/Careers.html', '/careers', '/recruitment', '/Careers'],
            description: 'ISRO recruitment notices, vacancies, and ICRB jobs',
            matchKeywords: ['career', 'careers', 'job', 'jobs', 'recruitment', 'vacancy', 'vacancies', 'icrb']
        },
        {
            name: 'centres',
            path: '/Centres.html',
            aliases: ['/Centres.html', '/centres', '/Centres'],
            description: 'ISRO research centres and facilities (VSSC, URSC, SDSC SHAR, SAC, NRSC)',
            matchKeywords: ['centres', 'centers', 'facilities', 'vssc', 'ursc', 'sdsc', 'sac', 'nrsc']
        },
        {
            name: 'home',
            path: '/',
            description: 'ISRO official portal homepage',
            matchKeywords: ['home', 'homepage', 'main page', 'overview']
        }
    ],
    landmarks: [
        {
            id: 'isro_search',
            phrase: 'Search ISRO',
            aliases: ['search isro', 'search', 'search bar', 'search box', 'query', 'filter', 'txtSearch'],
            role: 'input',
            description: 'Search box to query ISRO missions, publications, and updates',
            intentAction: 'type'
        },
        {
            id: 'missions_nav',
            phrase: 'Missions',
            aliases: ['missions', 'all missions', 'spacecraft missions', 'space missions'],
            role: 'link',
            description: 'Navigation link to ISRO space missions directory',
            intentAction: 'click'
        },
        {
            id: 'earth_observation_nav',
            phrase: 'Earth Observation',
            aliases: ['earth observation', 'earth observation applications', 'remote sensing', 'earth satellites', 'bhuvan'],
            role: 'link',
            description: 'Navigation link to ISRO Earth Observation applications portal',
            intentAction: 'click'
        },
        {
            id: 'launchers_nav',
            phrase: 'Launchers',
            aliases: ['launchers', 'launch vehicles', 'rockets'],
            role: 'link',
            description: 'Navigation link to ISRO launch vehicles',
            intentAction: 'click'
        },
        {
            id: 'careers_nav',
            phrase: 'Careers',
            aliases: ['careers', 'recruitment', 'jobs'],
            role: 'link',
            description: 'Navigation link to ISRO careers and recruitment notices',
            intentAction: 'click'
        },
        {
            id: 'centres_nav',
            phrase: 'Centres',
            aliases: ['centres', 'centers', 'isro centres'],
            role: 'link',
            description: 'Navigation link to ISRO research centres',
            intentAction: 'click'
        }
    ],
    metricsRules: [
        {
            metricId: 'spacecraft_missions',
            labelKeywords: ['spacecraft missions', 'spacecraft', 'satellites'],
            containerHints: ['stat', 'card', 'metric', 'counter', 'hero'],
            valuePattern: '\\b\\d+\\b',
            description: 'Total number of spacecraft missions conducted'
        },
        {
            metricId: 'launch_missions',
            labelKeywords: ['launch missions', 'launches', 'launch vehicle missions'],
            containerHints: ['stat', 'card', 'metric', 'counter', 'hero'],
            valuePattern: '\\b\\d+\\b',
            description: 'Total launch vehicle missions conducted'
        },
        {
            metricId: 'customer_satellites',
            labelKeywords: ['foreign satellites', 'customer satellites', 'commercial satellites'],
            containerHints: ['stat', 'card', 'metric', 'counter', 'hero'],
            valuePattern: '\\b\\d+\\b',
            description: 'Total foreign / customer satellites launched'
        }
    ],
    formFieldHints: {
        search: ['search', 'searchInput', 'q', 'query', 'txtSearch', 'Search ISRO']
    }
};
/**
 * Built-in playbook for Bhuvan Indian Geo-Platform of NRSC/ISRO (bhuvan.nrsc.gov.in).
 * Core Earth Observation & geo-spatial mapping portal for SIH problem statement.
 */
export const BHUVAN_PLAYBOOK = {
    domain: 'bhuvan.nrsc.gov.in',
    name: 'Bhuvan Indian Geo-Platform (NRSC/ISRO)',
    aliases: ['bhuvan.nrsc.gov.in', 'bhuvan', 'bhuvan geoportal', 'bhuvan nrsc', 'nrsc bhuvan', 'bhuvan earth observation'],
    routes: [
        {
            name: 'geoportal',
            path: '/bhuvan_geoportal.php',
            aliases: ['/bhuvan_geoportal.php', '/2d', '/3d', '/viewer', '/geoportal'],
            description: 'Bhuvan 2D/3D map viewer and Earth observation geoportal',
            matchKeywords: ['geoportal', 'map', '2d', '3d', 'earth observation', 'viewer', 'satellite imagery', 'imagery', 'location', 'locations']
        },
        {
            name: 'thematic',
            path: '/thematic',
            aliases: ['/thematic', '/thematic_services', '/applications'],
            description: 'Bhuvan thematic application maps and sectoral geo-spatial services',
            matchKeywords: ['thematic', 'thematic maps', 'agriculture', 'forestry', 'water resources', 'land']
        },
        {
            name: 'disaster',
            path: '/disaster',
            aliases: ['/disaster', '/disaster_services', '/ndms'],
            description: 'Bhuvan disaster management support services (floods, cyclones, earthquakes, forest fires)',
            matchKeywords: ['disaster', 'flood', 'cyclone', 'earthquake', 'fire', 'emergency', 'hazard']
        },
        {
            name: 'open_data',
            path: '/data',
            aliases: ['/data', '/open_data', '/bhuvan_data'],
            description: 'Bhuvan open data archive and satellite data download portal',
            matchKeywords: ['data', 'open data', 'download', 'archive', 'products', 'free data']
        },
        {
            name: 'home',
            path: '/',
            description: 'Bhuvan NRSC portal homepage',
            matchKeywords: ['home', 'homepage', 'main page', 'overview']
        }
    ],
    landmarks: [
        {
            id: 'bhuvan_2d_3d',
            phrase: '2D / 3D Map',
            aliases: ['2d', '3d', 'map', 'map viewer', 'explore map', '2d/3d', 'visualisation'],
            role: 'link',
            description: 'Explore Bhuvan 2D/3D visualization map',
            intentAction: 'click'
        },
        {
            id: 'bhuvan_search',
            phrase: 'Search Location',
            aliases: ['search', 'search location', 'find place', 'find city', 'search place', 'location search', 'txtSearch'],
            role: 'input',
            description: 'Search geographic place name or coordinates',
            intentAction: 'type'
        },
        {
            id: 'thematic_services',
            phrase: 'Thematic Services',
            aliases: ['thematic', 'applications', 'thematic services', 'thematic maps'],
            role: 'link',
            description: 'Access thematic GIS application data',
            intentAction: 'click'
        },
        {
            id: 'disaster_services',
            phrase: 'Disaster Services',
            aliases: ['disaster', 'disaster management', 'crisis support', 'emergency'],
            role: 'link',
            description: 'Access disaster support maps and feeds',
            intentAction: 'click'
        },
        {
            id: 'open_data_download',
            phrase: 'Open Data Archive',
            aliases: ['open data', 'download satellite data', 'free data', 'data archive'],
            role: 'link',
            description: 'Download open Earth observation datasets',
            intentAction: 'click'
        }
    ],
    metricsRules: [
        {
            metricId: 'thematic_layers',
            labelKeywords: ['thematic layers', 'layers', 'services', 'applications'],
            containerHints: ['stat', 'card', 'metric', 'counter'],
            valuePattern: '\\b\\d+\\b',
            description: 'Total number of thematic layers available'
        }
    ],
    formFieldHints: {
        search: ['search', 'searchBox', 'txtSearch', 'locationInput', 'query', 'Search Location']
    }
};
/**
 * Built-in playbook for Meteorological & Oceanographic Satellite Data Archival Centre (mosdac.gov.in).
 */
export const MOSDAC_PLAYBOOK = {
    domain: 'mosdac.gov.in',
    name: 'MOSDAC Meteorological and Oceanographic Satellite Data',
    aliases: ['mosdac.gov.in', 'www.mosdac.gov.in', 'mosdac', 'mosdac isro'],
    routes: [
        {
            name: 'live_weather',
            path: '/live',
            aliases: ['/live', '/weather', '/meteorology', '/insat'],
            description: 'INSAT live meteorological imagery and weather forecast products',
            matchKeywords: ['weather', 'insat', 'cyclone', 'satellite imagery', 'meteorological', 'forecast', 'radar', 'clouds']
        },
        {
            name: 'ocean_data',
            path: '/ocean',
            aliases: ['/ocean', '/oceanography', '/sst'],
            description: 'Oceanographic satellite products and sea surface temperature',
            matchKeywords: ['ocean', 'sea', 'sst', 'currents', 'winds', 'wave']
        },
        {
            name: 'catalogue',
            path: '/catalogue',
            aliases: ['/catalogue', '/data', '/archive', '/missions'],
            description: 'MOSDAC satellite mission data catalogue and search',
            matchKeywords: ['data', 'catalogue', 'missions', 'search', 'archive', 'download']
        },
        {
            name: 'home',
            path: '/',
            description: 'MOSDAC portal homepage',
            matchKeywords: ['home', 'homepage', 'main page', 'overview']
        }
    ],
    landmarks: [
        {
            id: 'mosdac_weather_link',
            phrase: 'Weather Imagery',
            aliases: ['weather', 'live weather', 'satellite imagery', 'insat imagery', 'live images'],
            role: 'link',
            description: 'View live INSAT satellite weather imagery',
            intentAction: 'click'
        },
        {
            id: 'mosdac_search',
            phrase: 'Search Data',
            aliases: ['search', 'search data', 'query data', 'product search', 'txtSearch'],
            role: 'input',
            description: 'Search meteorological datasets and satellite passes',
            intentAction: 'type'
        }
    ],
    metricsRules: [
        {
            metricId: 'satellite_passes',
            labelKeywords: ['passes', 'products', 'datasets', 'imagery'],
            containerHints: ['stat', 'card', 'metric', 'counter'],
            valuePattern: '\\b\\d+\\b',
            description: 'Total satellite passes or datasets'
        }
    ],
    formFieldHints: {
        search: ['search', 'searchInput', 'query', 'searchData']
    }
};
/**
 * Built-in playbook for VEDAS - Visualisation of Earth Observation Data and Archival System (vedas.sac.gov.in).
 */
export const VEDAS_PLAYBOOK = {
    domain: 'vedas.sac.gov.in',
    name: 'VEDAS - Visualisation of Earth Observation Data (SAC/ISRO)',
    aliases: ['vedas.sac.gov.in', 'vedas', 'sac vedas', 'vedas isro'],
    routes: [
        {
            name: 'solar_energy',
            path: '/solar',
            aliases: ['/solar', '/solar_calculator', '/rooftop_solar'],
            description: 'Solar energy potential calculator and rooftop solar assessment',
            matchKeywords: ['solar', 'solar energy', 'solar potential', 'rooftop', 'renewable']
        },
        {
            name: 'vegetation',
            path: '/vegetation',
            aliases: ['/vegetation', '/agriculture', '/ndvi'],
            description: 'Vegetation indices, NDVI, and agricultural monitoring',
            matchKeywords: ['vegetation', 'ndvi', 'agriculture', 'crops', 'drought']
        },
        {
            name: 'coastal',
            path: '/coastal',
            aliases: ['/coastal', '/wetlands', '/marine'],
            description: 'Coastal zones and wetland monitoring applications',
            matchKeywords: ['coastal', 'wetlands', 'shoreline', 'ocean']
        },
        {
            name: 'home',
            path: '/',
            description: 'VEDAS SAC homepage',
            matchKeywords: ['home', 'homepage', 'main page', 'overview']
        }
    ],
    landmarks: [
        {
            id: 'solar_calculator',
            phrase: 'Solar Potential',
            aliases: ['solar', 'solar calculator', 'solar rooftop', 'solar energy'],
            role: 'link',
            description: 'Access solar energy evaluation tools',
            intentAction: 'click'
        },
        {
            id: 'vedas_search',
            phrase: 'Search VEDAS',
            aliases: ['search', 'query', 'filter', 'search vedas'],
            role: 'input',
            description: 'Search geospatial applications and products',
            intentAction: 'type'
        }
    ],
    metricsRules: [
        {
            metricId: 'applications_count',
            labelKeywords: ['applications', 'tools', 'services'],
            containerHints: ['stat', 'card', 'metric', 'counter'],
            valuePattern: '\\b\\d+\\b',
            description: 'Total number of geospatial applications'
        }
    ],
    formFieldHints: {
        search: ['search', 'query', 'txtSearch']
    }
};
/**
 * Built-in playbook for Bhoonidhi Open Earth Observation Data Hub (bhoonidhi.nrsc.gov.in).
 */
export const BHOONIDHI_PLAYBOOK = {
    domain: 'bhoonidhi.nrsc.gov.in',
    name: 'Bhoonidhi Open Earth Observation Data Hub (NRSC/ISRO)',
    aliases: ['bhoonidhi.nrsc.gov.in', 'bhoonidhi', 'bhoonidhi nrsc', 'nrsc bhoonidhi'],
    routes: [
        {
            name: 'data_hub',
            path: '/datahub',
            aliases: ['/datahub', '/catalogue', '/search', '/products'],
            description: 'Search and download multi-sensor satellite imagery and GIS layers',
            matchKeywords: ['satellite data', 'download', 'scenes', 'imagery', 'cartosat', 'resourcesat', 'sentinel', 'search']
        },
        {
            name: 'home',
            path: '/',
            description: 'Bhoonidhi portal homepage',
            matchKeywords: ['home', 'homepage', 'main page', 'overview']
        }
    ],
    landmarks: [
        {
            id: 'bhoonidhi_search',
            phrase: 'Search Products',
            aliases: ['search', 'search products', 'area search', 'date range', 'satellite search'],
            role: 'input',
            description: 'Search satellite imagery products by area or date',
            intentAction: 'type'
        }
    ],
    metricsRules: [
        {
            metricId: 'scenes_available',
            labelKeywords: ['scenes', 'products', 'satellites', 'datasets'],
            containerHints: ['stat', 'card', 'metric', 'counter'],
            valuePattern: '\\b\\d+\\b',
            description: 'Total satellite scenes available for download'
        }
    ],
    formFieldHints: {
        search: ['search', 'query', 'productSearch']
    }
};
/**
 * Registry of known domain playbooks.
 */
export const REGISTERED_PLAYBOOKS = [
    SIH_PLAYBOOK,
    ISRO_PLAYBOOK,
    BHUVAN_PLAYBOOK,
    MOSDAC_PLAYBOOK,
    VEDAS_PLAYBOOK,
    BHOONIDHI_PLAYBOOK,
    GITHUB_PLAYBOOK,
    YOUTUBE_PLAYBOOK,
    REDDIT_PLAYBOOK,
    DUCKDUCKGO_PLAYBOOK,
    GOOGLE_PLAYBOOK,
    WIKIPEDIA_PLAYBOOK
];
/**
 * Normalizes host/URL to identify matching domain playbook.
 */
export function lookupDomainPlaybook(urlOrHostname) {
    if (!urlOrHostname)
        return undefined;
    let hostname = urlOrHostname.toLowerCase().trim();
    try {
        if (hostname.includes('://')) {
            hostname = new URL(hostname).hostname;
        }
    }
    catch {
        // If URL parsing fails, strip protocol manually
        hostname = hostname.replace(/^[a-z]+:\/\//i, '').split('/')[0].split(':')[0];
    }
    return REGISTERED_PLAYBOOKS.find((playbook) => {
        if (hostname === playbook.domain || hostname.endsWith(`.${playbook.domain}`)) {
            return true;
        }
        return playbook.aliases.some((alias) => hostname.includes(alias.toLowerCase()));
    });
}
/**
 * Checks if a given URL matches a playbook route, including any path aliases and domain-specific conventions.
 */
export function isUrlMatchingRoute(url, route) {
    if (!url)
        return false;
    const u = url.toLowerCase();
    const rPath = route.path.toLowerCase();
    if (u.includes(rPath))
        return true;
    if (route.aliases) {
        for (const alias of route.aliases) {
            if (u.includes(alias.toLowerCase()))
                return true;
        }
    }
    // Special handling for problem statements on SIH (handles sih2026PS, sih2025PS, /problem-statement, etc.)
    if (route.name === 'problemStatements') {
        if (u.includes('problem-statement') || u.includes('problemstatement') || /\/sih\d*ps/i.test(u) || u.includes('sih2026ps')) {
            return true;
        }
    }
    return false;
}
/**
 * Resolves user query intent against a domain playbook to provide deterministic navigation,
 * target grounding, or metric extraction recommendations.
 */
export function resolvePlaybookIntent(playbook, userQuery, currentUrl) {
    const normQuery = normalizeSemanticText(userQuery);
    const queryTokens = tokenizeSemanticText(normQuery);
    if (!normQuery) {
        return {
            playbookName: playbook.name,
            matchedIntent: 'none',
            confidence: 0,
            rationale: 'Empty user query'
        };
    }
    // 1. Check for metric extraction intent (e.g. "how many submissions are done", "count of submissions")
    const isMetricQuery = queryTokens.some((t) => ['how', 'many', 'count', 'total', 'number', 'status', 'check', 'show'].includes(t));
    if (isMetricQuery) {
        for (const rule of playbook.metricsRules) {
            const match = rule.labelKeywords.some((kw) => {
                const kwTokens = tokenizeSemanticText(kw);
                return kwTokens.every((kt) => queryTokens.includes(kt) || queryTokens.some((qt) => isFuzzyTokenMatch(kt, qt)));
            });
            if (match) {
                return {
                    playbookName: playbook.name,
                    matchedIntent: 'extract_metric',
                    confidence: 0.95,
                    metricRule: rule,
                    targetPhrase: rule.labelKeywords[0],
                    rationale: `Matched metric extraction rule '${rule.metricId}' (${rule.description}) based on query keywords`
                };
            }
        }
    }
    // 2. If user intent is explicit navigation (e.g. "go to", "navigate to"), check routes first
    const isNavQuery = /^(?:(?:please|kindly)\s+)?(?:go\s+to|navigate\s+to|visit|open|load|take\s+me\s+to)\b/i.test(userQuery) ||
        (queryTokens.length > 0 && ['go', 'navigate', 'visit', 'load'].includes(queryTokens[0]));
    if (isNavQuery) {
        for (const route of playbook.routes) {
            const match = route.matchKeywords.some((kw) => {
                const kwNorm = normalizeSemanticText(kw);
                if (normQuery.includes(kwNorm))
                    return true;
                const kwTokens = tokenizeSemanticText(kwNorm);
                return kwTokens.length > 0 && kwTokens.every((kt) => queryTokens.includes(kt) || queryTokens.some((qt) => isFuzzyTokenMatch(kt, qt)));
            });
            if (match) {
                const targetUrl = `https://${playbook.domain}${route.path}`;
                const isAlreadyOnRoute = isUrlMatchingRoute(currentUrl, route);
                return {
                    playbookName: playbook.name,
                    matchedIntent: isAlreadyOnRoute ? 'none' : 'navigate',
                    confidence: 0.95,
                    targetUrl,
                    targetPhrase: route.name === 'problemStatements' ? 'Problem Statements' : route.matchKeywords[0],
                    targetRole: 'link',
                    rationale: isAlreadyOnRoute
                        ? `Already on route '${route.name}' (${route.path})`
                        : `Matched playbook route '${route.name}' (${route.path}) from user intent`
                };
            }
        }
    }
    // 2b. If query references Problem Statements (e.g. "search for PS 171", "find PS 171", "PS 171")
    // and current page is NOT problem-statements, route navigation to problem statements page is required first!
    const mentionsProblemStatements = normQuery.includes('problem statement') ||
        normQuery.includes('problem statements') ||
        /\bps\s*\d+\b/i.test(userQuery) ||
        (queryTokens.includes('ps') && queryTokens.some((t) => /\d+/.test(t)));
    const psRoute = playbook.routes.find((r) => r.name === 'problemStatements');
    const alreadyOnPsRoute = psRoute ? isUrlMatchingRoute(currentUrl, psRoute) : false;
    if (mentionsProblemStatements && currentUrl && !alreadyOnPsRoute) {
        if (psRoute) {
            return {
                playbookName: playbook.name,
                matchedIntent: 'navigate',
                confidence: 0.96,
                targetUrl: `https://${playbook.domain}${psRoute.path}`,
                targetPhrase: 'Problem Statements',
                targetRole: 'link',
                rationale: `Query references Problem Statements while currently on '${currentUrl}'. Navigating to Problem Statements page first.`
            };
        }
    }
    // 3. Check for landmark match (e.g. "click know your spoc", "sih login")
    for (const landmark of playbook.landmarks) {
        const allAliases = [landmark.phrase, ...landmark.aliases];
        const match = allAliases.some((alias) => {
            const aliasNorm = normalizeSemanticText(alias);
            if (normQuery.includes(aliasNorm))
                return true;
            const aliasTokens = tokenizeSemanticText(aliasNorm);
            return aliasTokens.length > 0 && aliasTokens.every((at) => queryTokens.includes(at) || queryTokens.some((qt) => isFuzzyTokenMatch(at, qt)));
        });
        if (match) {
            if (landmark.role === 'input' || landmark.intentAction === 'type') {
                return {
                    playbookName: playbook.name,
                    matchedIntent: 'fill_field',
                    confidence: 0.92,
                    targetPhrase: landmark.phrase,
                    targetRole: landmark.role,
                    rationale: `Matched landmark '${landmark.phrase}' (${landmark.description}) for input/search intent`
                };
            }
            return {
                playbookName: playbook.name,
                matchedIntent: 'click_landmark',
                confidence: 0.94,
                targetPhrase: landmark.phrase,
                targetRole: landmark.role,
                rationale: `Matched landmark '${landmark.phrase}' (${landmark.description}) in playbook for domain '${playbook.domain}'`
            };
        }
    }
    // 4. Secondary route check for queries without explicit "go to"
    for (const route of playbook.routes) {
        const match = route.matchKeywords.some((kw) => {
            const kwNorm = normalizeSemanticText(kw);
            if (normQuery.includes(kwNorm))
                return true;
            const kwTokens = tokenizeSemanticText(kwNorm);
            return kwTokens.length > 0 && kwTokens.every((kt) => queryTokens.includes(kt) || queryTokens.some((qt) => isFuzzyTokenMatch(kt, qt)));
        });
        if (match) {
            const targetUrl = `https://${playbook.domain}${route.path}`;
            const isAlreadyOnRoute = currentUrl ? currentUrl.includes(route.path) : false;
            return {
                playbookName: playbook.name,
                matchedIntent: isAlreadyOnRoute ? 'none' : 'navigate',
                confidence: 0.85,
                targetUrl,
                rationale: isAlreadyOnRoute
                    ? `Already on route '${route.name}' (${route.path})`
                    : `Matched playbook route '${route.name}' (${route.path}) from user intent`
            };
        }
    }
    return {
        playbookName: playbook.name,
        matchedIntent: 'none',
        confidence: 0.2,
        rationale: 'No domain playbook route or landmark matched query tokens directly'
    };
}
/**
 * Attempts to extract a metric value from text using a playbook metric rule.
 */
export function extractMetricsWithPlaybook(textContext, metricRule) {
    if (!textContext || !metricRule)
        return undefined;
    const textLower = textContext.toLowerCase();
    const pattern = new RegExp(metricRule.valuePattern, 'g');
    // 1. Anchor search to keyword first (e.g. "Total Submissions: 12,850" or "15.2k stars")
    for (const kw of metricRule.labelKeywords) {
        const kwLower = kw.toLowerCase();
        let kwIndex = textLower.indexOf(kwLower);
        while (kwIndex !== -1) {
            const start = Math.max(0, kwIndex - 25);
            const end = Math.min(textContext.length, kwIndex + kwLower.length + 45);
            const afterSnippet = textContext.slice(kwIndex + kwLower.length, end);
            const beforeSnippet = textContext.slice(start, kwIndex);
            // 1a. If afterSnippet directly follows with colon or equals (e.g. "Total Submissions: 12,850")
            const afterDirectMatch = afterSnippet.match(/^[\s:=]+([0-9][0-9,.]*[kKmMbB]?)/);
            if (afterDirectMatch) {
                return {
                    value: afterDirectMatch[1],
                    label: metricRule.metricId
                };
            }
            // 1b. Check if value directly precedes the keyword (e.g. "15.2k stars", "4.8M views", "142 citations")
            const beforeMatches = [...beforeSnippet.matchAll(new RegExp(metricRule.valuePattern, 'g'))];
            if (beforeMatches.length > 0) {
                const lastBefore = beforeMatches[beforeMatches.length - 1];
                if (lastBefore.index !== undefined && beforeSnippet.length - (lastBefore.index + lastBefore[0].length) <= 5) {
                    return {
                        value: lastBefore[0],
                        label: metricRule.metricId
                    };
                }
            }
            // 1c. General afterSnippet match
            const afterMatch = afterSnippet.match(new RegExp(metricRule.valuePattern));
            if (afterMatch && (afterMatch.index ?? 99) <= 15) {
                return {
                    value: afterMatch[0],
                    label: metricRule.metricId
                };
            }
            const snippet = textContext.slice(start, end);
            const snippetMatches = [...snippet.matchAll(pattern)];
            if (snippetMatches.length > 0) {
                return {
                    value: snippetMatches[0][0],
                    label: metricRule.metricId
                };
            }
            kwIndex = textLower.indexOf(kwLower, kwIndex + 1);
        }
    }
    // 2. Secondary fallback: tight 25-character window around matches
    const matches = [...textContext.matchAll(pattern)];
    for (const match of matches) {
        const matchIndex = match.index ?? -1;
        if (matchIndex >= 0) {
            const surrounding = textLower.slice(Math.max(0, matchIndex - 25), Math.min(textLower.length, matchIndex + match[0].length + 25));
            const hasKeyword = metricRule.labelKeywords.some((kw) => surrounding.includes(kw.toLowerCase()));
            if (hasKeyword) {
                return {
                    value: match[0],
                    label: metricRule.metricId
                };
            }
        }
    }
    return undefined;
}
/**
 * Cleanly extracts search target text from a search directive.
 * E.g. "search for PS 171" -> "PS 171"
 *      "search Chinmaya in search box" -> "Chinmaya"
 */
export function extractSearchQueryFromGoal(goal) {
    let q = (goal || '').trim();
    const compoundMatch = q.match(/(?:and|then|after\s+that)\s+(?:search(?:\s+for)?|find|look\s+for|filter(?:\s+by)?|query|type)\s+(.+)$/i);
    if (compoundMatch) {
        q = compoundMatch[1].trim();
    }
    else {
        q = q.replace(/^(?:please\s+|kindly\s+|can\s+you\s+)?(?:search(?:\s+for)?|find|look\s+for|filter(?:\s+by)?|query|type\s+in\s+search(?:\s+box)?)\s+/i, '');
    }
    q = q.replace(/\s+(?:in|into|on)\s+(?:the\s+)?(?:search(?:\s+box|\s+bar|\s+input)?|table|page)$/i, '');
    return q.trim();
}
/**
 * Extracts a target navigation URL from a natural language goal when starting from scratch
 * or when the user explicitly directs navigation to a website.
 * E.g. "open sih.gov.in and search isro" -> "https://sih.gov.in"
 *      "go to isro.gov.in and search missions" -> "https://isro.gov.in"
 *      "in the isro website find launches" -> "https://www.isro.gov.in"
 *      "http://localhost:4500" -> "http://localhost:4500"
 */
export function extractTargetUrlFromGoal(goal) {
    if (!goal || typeof goal !== 'string')
        return undefined;
    let g = goal.trim();
    // Strip polite/conversational wrapper prefixes
    const CONVERSATIONAL_PREFIX = /^(?:(?:please|kindly|hey|hi)\s+(?:privapilot[,!]?\s+)?(?:please\s+)?|(?:can|could|would|will)\s+you\s+|(?:i\s+(?:want|need)\s+you\s+to)\s+|(?:go\s+ahead\s+and)\s+|(?:and\s+then|then|after\s+that|and|also|now|next|so)\s+)+/i;
    let prevG = '';
    while (g && g !== prevG) {
        prevG = g;
        g = g.replace(CONVERSATIONAL_PREFIX, '').trim();
    }
    // 1. Explicit http/https URL in goal
    const urlMatch = g.match(/https?:\/\/[^\s"'<>]+/i);
    if (urlMatch) {
        let u = urlMatch[0];
        u = u.replace(/[.,;!?)]+$/, '');
        if (/^https?:\/\/isro\.gov\.in(\/.*)?$/i.test(u)) {
            u = u.replace('://isro.gov.in', '://www.isro.gov.in');
        }
        return u;
    }
    // 2. Direct localhost with port
    const localhostMatch = g.match(/\b(localhost:\d+(?:\/[^\s"'<>]*)?)\b/i);
    if (localhostMatch) {
        return `http://${localhostMatch[1]}`;
    }
    // 3. Universal domain pattern: any valid hostname with 2+ char TLD (e.g. allel.co, sih.gov.in, github.com, example.xyz)
    const universalDomainMatch = g.match(/(?:^|[\s"'(])((?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,24})(?:\/([^\s"'<>]*))?/i);
    if (universalDomainMatch) {
        let domain = universalDomainMatch[1];
        const path = universalDomainMatch[2] ? `/${universalDomainMatch[2]}` : '';
        if (domain.toLowerCase() === 'isro.gov.in') {
            domain = 'www.isro.gov.in';
        }
        else if (domain.toLowerCase() === 'wikipedia.org') {
            domain = 'www.wikipedia.org';
        }
        else if (domain.toLowerCase() === 'gmail.com') {
            return `https://mail.google.com${path || '/mail'}`;
        }
        return `https://${domain}${path}`;
    }
    // 4. Contextual target phrasing: "in/on/open/visit/go to [the] <name> (website|portal|site|page|org)"
    const contextMatch = g.match(/\b(?:in|on|at|open|load|visit|go\s+to|navigate\s+to)\s+(?:the\s+)?([a-zA-Z0-9_\s.-]+?)\s+(?:website|portal|site|page|org|organisation)\b/i);
    if (contextMatch) {
        const siteKeyword = contextMatch[1].trim().toLowerCase();
        // Guard against referring to the current or active page
        if (/^(?:this|current|the\s+current|active|the\s+active|my)\b/i.test(siteKeyword)) {
            return undefined;
        }
        if (siteKeyword.includes('.')) {
            return `https://${siteKeyword}`;
        }
        if (siteKeyword.includes('isro') || siteKeyword.includes('space')) {
            return 'https://www.isro.gov.in';
        }
        if (siteKeyword.includes('bhuvan')) {
            return 'https://bhuvan.nrsc.gov.in';
        }
        if (siteKeyword.includes('mosdac')) {
            return 'https://mosdac.gov.in';
        }
        if (siteKeyword.includes('vedas')) {
            return 'https://vedas.sac.gov.in';
        }
        if (siteKeyword.includes('bhoonidhi')) {
            return 'https://bhoonidhi.nrsc.gov.in';
        }
        if (siteKeyword.includes('sih') || siteKeyword.includes('hackathon')) {
            return 'https://sih.gov.in';
        }
        if (siteKeyword.includes('github')) {
            return 'https://github.com';
        }
        if (siteKeyword.includes('wikipedia') || siteKeyword.includes('wiki')) {
            return 'https://www.wikipedia.org';
        }
        if (siteKeyword.includes('youtube')) {
            return 'https://www.youtube.com';
        }
        if (siteKeyword.includes('reddit')) {
            return 'https://www.reddit.com';
        }
        if (siteKeyword.includes('duckduckgo')) {
            return 'https://duckduckgo.com';
        }
        if (siteKeyword.includes('google')) {
            return 'https://www.google.com';
        }
        if (siteKeyword.includes('demo') || siteKeyword.includes('mock') || siteKeyword.includes('test')) {
            return 'http://localhost:4500';
        }
    }
    // 5. Explicit navigation verb at start of goal: "open/go to/visit <target>"
    const navDirective = g.match(/^(?:open|go\s+to|visit|launch|load|navigate\s+to)\s+([a-zA-Z0-9_.-]+)(?:,\s*|\s+(?:and\s+then|then|after\s+that|and|to|for)\s*|\s+and\s*,\s*|$)/i);
    if (navDirective) {
        const target = navDirective[1].trim().toLowerCase();
        if (target.includes('.')) {
            if (target === 'wikipedia.org' || target.endsWith('.wikipedia.org'))
                return 'https://www.wikipedia.org';
            if (target === 'isro.gov.in')
                return 'https://www.isro.gov.in';
            return `https://${target}`;
        }
        if (target === 'isro' || target.includes('isro'))
            return 'https://www.isro.gov.in';
        if (target === 'gmail' || target.includes('gmail'))
            return 'https://mail.google.com/mail';
        if (target.includes('bhuvan'))
            return 'https://bhuvan.nrsc.gov.in';
        if (target.includes('mosdac'))
            return 'https://mosdac.gov.in';
        if (target.includes('vedas'))
            return 'https://vedas.sac.gov.in';
        if (target.includes('bhoonidhi'))
            return 'https://bhoonidhi.nrsc.gov.in';
        if (target === 'sih' || target.includes('sih'))
            return 'https://sih.gov.in';
        if (target === 'github' || target.includes('github'))
            return 'https://github.com';
        if (target === 'wikipedia' || target.includes('wikipedia'))
            return 'https://www.wikipedia.org';
        if (target === 'youtube' || target.includes('youtube'))
            return 'https://www.youtube.com';
        if (target === 'reddit' || target.includes('reddit'))
            return 'https://www.reddit.com';
        if (target === 'duckduckgo' || target.includes('duckduckgo'))
            return 'https://duckduckgo.com';
        if (target === 'google' || target.includes('google'))
            return 'https://www.google.com';
        if (target.includes('demo') || target.includes('portal'))
            return 'http://localhost:4500';
    }
    // 6. Registered Playbook matches against registered domains and distinct aliases
    // ONLY if the goal expresses explicit navigation intent, not an on-page search/filter/action!
    const isOnPageAction = /\b(?:on\s+this|in\s+this|this\s+page|this\s+table|search|filter|find|type|fill|enter|about|check|see|tell|count|submissions?|how\s+many|what\s+is)\b/i.test(g);
    if (!isOnPageAction) {
        const lower = g.toLowerCase();
        for (const playbook of REGISTERED_PLAYBOOKS) {
            for (const alias of playbook.aliases) {
                if (alias.length >= 4) {
                    const regex = new RegExp(`^\\s*${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$|\\b(?:open|go\\s+to|visit|launch|load|navigate\\s+to)\\s+${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                    if (regex.test(lower)) {
                        return `https://${playbook.domain}`;
                    }
                }
            }
        }
    }
    return undefined;
}
//# sourceMappingURL=domain-playbooks.js.map