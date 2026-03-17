import { useState, useEffect, useCallback } from 'react';
import {
  TextField,
  Box,
  Typography,
  Grid,
  IconButton,
  InputAdornment,
  FormControl,
  Select,
  MenuItem,
  OutlinedInput,
  Button,
  Chip,
  Tabs,
  Tab,
  CircularProgress,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import HeroBanner from '../components/common/HeroBanner';
import { DetectiveDustyBlue, NovellaNavy, NoirNavy } from '../styles/colors';
import { BookPreview } from '../components/Book/BookPreview';
import YearSelection from '../components/NLPSearch/YearSelection';
import '../components/Book/BookPage.css';
import BookUtils from "../utils/BookUtils.js";
import { sanitizeContent, sanitizeObject } from '../utils/sanitize';

// ── AI Search history helpers (localStorage) ──────────────────────────────────
const HISTORY_KEY = 'betterreads:ai-search-history';
const HISTORY_MAX = 10;

function loadSearchHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}
function saveSearchHistory(query) {
  const q = query.trim();
  if (!q) return;
  const prev = loadSearchHistory().filter(h => h !== q);
  localStorage.setItem(HISTORY_KEY, JSON.stringify([q, ...prev].slice(0, HISTORY_MAX)));
}
function clearSearchHistory() {
  localStorage.removeItem(HISTORY_KEY);
}

const GenreSelect = ({ genres, selectedGenres, onChange }) => (
  <FormControl sx={{ width: { xs: '100%', md: 280 } }}>
    <Select
      multiple
      displayEmpty
      value={selectedGenres}
      onChange={onChange}
      input={<OutlinedInput />}
      renderValue={(selected) =>
        selected.length === 0
          ? <em style={{ color: '#666' }}>Select genres...</em>
          : selected.join(', ')
      }
      sx={{ borderRadius: '25px', backgroundColor: DetectiveDustyBlue, height: '56px' }}
    >
      <MenuItem disabled value=""><em style={{ color: '#666' }}>Select genres...</em></MenuItem>
      {genres.map((g) => <MenuItem key={g} value={g}>{g}</MenuItem>)}
    </Select>
  </FormControl>
);

const BookGrid = ({ results, loading, hasSearched, emptyMessage }) => (
  <>
    {loading && (
      <Box display="flex" justifyContent="center" mt={4}>
        <CircularProgress sx={{ color: NoirNavy }} />
      </Box>
    )}
    <Grid container spacing={3} sx={{ maxWidth: '1900px', margin: '0 auto', justifyContent: 'center', pb: '2rem' }}>
      {results.length > 0
        ? results.map((book, idx) => {
            const key = book._id || book.id || idx;
            return (
              <Grid item xs={12} sm={6} md={4} key={key}>
                {book.score && (
                  <Chip
                    icon={<AutoAwesomeIcon />}
                    label={`${(book.score * 100).toFixed(0)}% match`}
                    size="small"
                    sx={{ mb: 0.5, backgroundColor: DetectiveDustyBlue, color: NovellaNavy, fontWeight: 'bold' }}
                  />
                )}
                <BookPreview
                  bookId={key}
                  coverUrl={book.image || book.coverImage || book.coverUrl}
                  title={book.title}
                  rating={book.averageRating || 0}
                  genres={book.genre || []}
                />
              </Grid>
            );
          })
        : !loading && hasSearched && (
            <Box sx={{ textAlign: 'center', width: '100%', py: 4 }}>
              <Typography variant="h6">{emptyMessage}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Try adjusting your filters.
              </Typography>
            </Box>
          )}
    </Grid>
  </>
);

// ── Browse tab (debounced, paginated) ─────────────────────────────────────────
const BrowseSearch = ({ genres }) => {
  const [query, setQuery] = useState('');
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [startYear, setStartYear] = useState('');
  const [endYear, setEndYear] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);

  const runSearch = useCallback(async (pageToFetch = 1, append = false) => {
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const data = await BookUtils.browseBooks({
        q: sanitizeContent(query.trim()),
        genres: selectedGenres.map(g => sanitizeContent(g)),
        min_year: startYear || null,
        max_year: endYear || null,
        page: pageToFetch,
      });
      const sanitized = data.results ? sanitizeObject(data.results) : [];
      setResults(prev => append ? [...prev, ...sanitized] : sanitized);
      setTotalPages(data.totalPages || 0);
      setPage(pageToFetch);
    } catch (err) {
      setError(sanitizeContent(err.message));
      if (!append) setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, selectedGenres]);

  useEffect(() => {
    const t = setTimeout(() => runSearch(1, false), 500);
    return () => clearTimeout(t);
  }, [query, selectedGenres, startYear, endYear, runSearch]);

  const handleGenreChange = (e) => {
    const { value } = e.target;
    setSelectedGenres(
      typeof value === 'string'
        ? sanitizeContent(value).split(',')
        : value.map(v => sanitizeContent(v))
    );
  };

  return (
    <>
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, alignItems: 'center', maxWidth: 900, mx: 'auto', mb: 3, px: 2 }}>
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Search by title, author, or keyword..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={(e) => setQuery(sanitizeContent(e.target.value))}
          onKeyPress={(e) => e.key === 'Enter' && runSearch(1)}
          sx={{
            flexGrow: 1,
            '& .MuiOutlinedInput-root': {
              borderRadius: '25px',
              backgroundColor: DetectiveDustyBlue,
              '&:hover fieldset': { borderColor: 'rgba(0,0,0,0.23)' },
            },
          }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={() => runSearch(1)}><SearchIcon /></IconButton>
              </InputAdornment>
            ),
          }}
        />
        <GenreSelect genres={genres} selectedGenres={selectedGenres} onChange={handleGenreChange} />
        <Box sx={{ flex: 1, width: '100%' }}>
            <YearSelection
              fromYear={startYear}
              toYear={endYear}
              onChangeFrom={(e) => setStartYear(e.target.value)}
              onChangeTo={(e) => setEndYear(e.target.value)}
            />
          </Box>
      </Box>

      {error && <Typography color="error" sx={{ textAlign: 'center', mb: 2 }}>{error}</Typography>}

      <BookGrid results={results} loading={loading} hasSearched={hasSearched} emptyMessage="No books found matching your search." />

      {page < totalPages && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <Button
            variant="outlined"
            onClick={() => runSearch(page + 1, true)}
            disabled={loading}
            sx={{
              fontStyle: 'italic',
              color: NovellaNavy,
              borderColor: NovellaNavy,
              '&:hover': { backgroundColor: NovellaNavy, color: 'white' },
            }}
          >
            {loading ? 'Loading...' : 'Show More Books'}
          </Button>
        </Box>
      )}
    </>
  );
};

// ── AI Search tab (explicit trigger, year filters, match scores) ───────────────
const AISearch = ({ genres }) => {
  const [query, setQuery] = useState('');
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [startYear, setStartYear] = useState('');
  const [endYear, setEndYear] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [history, setHistory] = useState(() => loadSearchHistory());

  const runSearch = async (searchQuery) => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setHasSearched(true);
    setResults([]);
    try {
      const params = new URLSearchParams();
      const sanitizedQuery = sanitizeContent(searchQuery.trim());
      if (sanitizedQuery) params.append('q', sanitizedQuery);
      selectedGenres.forEach(g => params.append('genre', sanitizeContent(g)));
      if (startYear) params.append('min_year', sanitizeContent(String(startYear)));
      if (endYear) params.append('max_year', sanitizeContent(String(endYear)));

      const data = await BookUtils.fetchFromGateway(params);
      const raw = data.results || data;
      setResults(Array.isArray(raw) ? sanitizeObject(raw) : []);
      saveSearchHistory(searchQuery);
      setHistory(loadSearchHistory());
    } catch (err) {
      setError('Search failed. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => runSearch(query);

  const handleGenreChange = (e) => {
    const { value } = e.target;
    setSelectedGenres(
      typeof value === 'string'
        ? sanitizeContent(value).split(',')
        : value.map(v => sanitizeContent(v))
    );
  };

  return (
    <>
      <Box sx={{ maxWidth: 900, mx: 'auto', px: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, alignItems: 'center', mb: 2 }}>
          <GenreSelect genres={genres} selectedGenres={selectedGenres} onChange={handleGenreChange} />
          <Box sx={{ flex: 1, width: '100%' }}>
            <YearSelection
              fromYear={startYear}
              toYear={endYear}
              onChangeFrom={(e) => setStartYear(e.target.value)}
              onChangeTo={(e) => setEndYear(e.target.value)}
            />
          </Box>
        </Box>

        <TextField
          fullWidth
          multiline
          rows={3}
          placeholder="Describe what you're looking for in plain English — e.g. 'a slow-burn romance set in Victorian England with a strong female lead'"
          variant="outlined"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={(e) => setQuery(sanitizeContent(e.target.value))}
          sx={{
            mb: 2,
            '& .MuiOutlinedInput-root': {
              borderRadius: '12px',
              backgroundColor: DetectiveDustyBlue,
            },
          }}
        />

        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <Button
            variant="contained"
            onClick={handleSearch}
            disabled={loading}
            startIcon={<AutoAwesomeIcon />}
            sx={{
              backgroundColor: NovellaNavy,
              color: '#fff',
              fontWeight: 'bold',
              fontSize: '1rem',
              px: 4,
              py: 1.5,
              borderRadius: '8px',
              '&:hover': { backgroundColor: NoirNavy },
            }}
          >
            Find AI Matches
          </Button>
        </Box>

        {history.length > 0 && (
          <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
            <Typography variant="caption" sx={{ color: '#666', mr: 0.5 }}>Recent:</Typography>
            {history.map((h) => (
              <Chip
                key={h}
                label={h}
                size="small"
                onClick={() => { setQuery(h); runSearch(h); }}
                sx={{ cursor: 'pointer', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}
              />
            ))}
            <Typography
              variant="caption"
              sx={{ color: '#999', cursor: 'pointer', ml: 'auto', '&:hover': { color: '#333' } }}
              onClick={() => { clearSearchHistory(); setHistory([]); }}
            >
              Clear
            </Typography>
          </Box>
        )}
      </Box>

      {error && <Typography color="error" sx={{ textAlign: 'center', mb: 2 }}>{error}</Typography>}

      <BookGrid results={results} loading={loading} hasSearched={hasSearched} emptyMessage="No matches found. Try rephrasing your description." />
    </>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────
const SearchPage = () => {
  const [tab, setTab] = useState(0);
  const [genres, setAllGenres] = useState([]);

  useEffect(() => {
    BookUtils.getAllGenreTags()
      .then(setAllGenres)
      .catch(err => console.error("Failed to load genres", err));
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#fff' }}>
      <HeroBanner title="Reading is good for you. But we can make it better." />

      <Box sx={{ backgroundColor: 'white', flexGrow: 1, pt: 2 }}>
        <Box sx={{ maxWidth: 900, mx: 'auto', px: 2, mb: 3 }}>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            sx={{
              '& .MuiTab-root': { fontFamily: 'Albert Sans, sans-serif', fontStyle: 'italic', textTransform: 'none', fontSize: '1rem' },
              '& .Mui-selected': { color: `${NovellaNavy} !important`, fontWeight: 'bold' },
              '& .MuiTabs-indicator': { backgroundColor: NovellaNavy },
            }}
          >
            <Tab icon={<SearchIcon />} iconPosition="start" label="Browse Books" />
            <Tab icon={<AutoAwesomeIcon />} iconPosition="start" label="AI Search" />
          </Tabs>
        </Box>

        {tab === 0 && <BrowseSearch genres={genres} />}
        {tab === 1 && <AISearch genres={genres} />}
      </Box>
    </div>
  );
};

export default SearchPage;
