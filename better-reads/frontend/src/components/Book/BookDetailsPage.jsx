import React, {useEffect, useState, useRef} from 'react';
import './BookPage.css';
import {BookPreview} from './BookPreview';
import { useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { addToBookListThunk, removeFromBookListThunk, setReadingStatusThunk, createListThunk, updateListBooksThunk } from '../../redux/BooklistThunks.js';
import { Container, Box, Typography, Button, CircularProgress, ToggleButton, ToggleButtonGroup, Menu, MenuItem, ListItemText, Divider, TextField } from '@mui/material';
import { NovellaNavy } from '../../styles/colors';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import StarRating from '../ratings/starRating';
import BookReview from './bookReview.jsx';
import { GenreTags, SourceBadge } from "./BookUtils.jsx";
import BookUtils from "../../utils/BookUtils.js";
import { sanitizeContent, sanitizeObject } from '../../utils/sanitize';

const sectionTitleStyle = {
    fontFamily: 'Source Serif Pro, serif',
    fontStyle: 'italic',
    color: 'var(--color-primary)',
    fontSize: { xs: '1.5rem', md: '1.75rem' },
    marginBottom: 2,
    marginTop: 3,
};

const deleteButtonStyle = {
    backgroundColor: 'transparent',
    border: '1px solid #D32F2F',
    color: '#D32F2F',
    borderRadius: '8px',
    padding: '0.5rem 1rem',
    fontFamily: 'Albert Sans, sans-serif',
    fontStyle: 'italic',
    fontSize: '0.9rem',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease-in-out, color 0.2s ease-in-out',
    '&:hover': { backgroundColor: '#D32F2F', color: '#FFFFFF' },
};

const buttonStyle = {
    backgroundColor: 'transparent',
    border: `1px solid ${NovellaNavy}`,
    color: NovellaNavy,
    borderRadius: '8px',
    padding: '0.5rem 1rem',
    fontFamily: 'Albert Sans, sans-serif',
    fontStyle: 'italic',
    fontSize: '0.9rem',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease-in-out, color 0.2s ease-in-out',
    '&:hover': { backgroundColor: NovellaNavy, color: '#FFFFFF' },
};

export default function BookDetailsPage() {
    const { bookId } = useParams();
    const username = useSelector((state) => state.user?.user?.username);
    const reviewRef = useRef(null);
    const userAvatar = useSelector((state) => state.user?.user?.avatarUrl);
    const isGuest = useSelector((state) => state.user?.isGuest);
    const dispatch = useDispatch();
    const userId = useSelector((state) => state.user?.user?._id);
    const booklist = useSelector((state) => state.booklist.items);
    const readingStatuses = useSelector((state) => state.booklist.readingStatuses);
    const customLists = useSelector((state) => state.booklist.customLists);

    const [book, setBook] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [userReview, setUserReview] = useState(null);
    const [bookReviews, setBookReviews] = useState([]);
    const [reviewsToShow, setReviewsToShow] = useState(3);
    const [loading, setLoading] = useState(true);
    const [isInWishlist, setIsInWishlist] = useState(false);
    const [wishlistLoading, setWishlistLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    // List menu state
    const [listMenuAnchor, setListMenuAnchor] = useState(null);
    const [newListName, setNewListName] = useState('');

    const handleScrollToReview = () => {
        reviewRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const deleteReview = async () => {
        try {
            const review = await BookUtils.getUserReview(bookId, username);
            if (review) {
                await BookUtils.deleteReview(review._id);
                setUserReview(null);
                setBookReviews(prev => prev.filter(r => r.userId?.username !== username));
            }
        } catch (err) {
            console.error('Failed to delete review:', err);
            alert('Could not delete the review. Please try again.');
        }
    };


    useEffect(() => {
        const fetchData = async () => {
           
            setLoading(true);
            try {
                let bookData = await BookUtils.getBookById(bookId);
                let review = await BookUtils.getUserReview(bookId, username);
                let allReviews = await BookUtils.getBookReviews(bookId);
                
                // Sanitize data from API to prevent XSS
                bookData = sanitizeObject(bookData);
                review = sanitizeObject(review);
                allReviews = sanitizeObject(allReviews);
              
                const otherReviews = allReviews.filter(r => r.userId?.username !== username);
                setBook(bookData);
                setUserReview(review);
                setBookReviews(otherReviews);
            } catch (err) {
                console.error('Failed to fetch book data:', err);
                
            } finally {
                setLoading(false);
            }
        };

        if (bookId) {
            fetchData();
        }
    }, [bookId, username]);

    useEffect(() => {
        if (booklist && bookId) {
            setIsInWishlist(booklist.includes(bookId));
        }
    }, [booklist, bookId]);


    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
                <CircularProgress />
            </Box>
        );
    }

    if (!book) return <Typography sx={{ textAlign: 'center', mt: 4 }}>Book not found.</Typography>;

    const handleWishlistToggle = async () => {
        // if (isGuest || !userId) {
        //     alert('Please log in to manage your wishlist.');
        //     return;
        // }
        setWishlistLoading(true);
        try {
            const thunk = isInWishlist ? removeFromBookListThunk : addToBookListThunk;
            await dispatch(thunk({ userId, bookId })).unwrap();
            setIsInWishlist(!isInWishlist); // Optimistic update
        } catch (error) {
            console.error('Failed to update wishlist:', error);
            alert('Failed to update your wishlist. Please try again.');
        } finally {
            setWishlistLoading(false);
        }
    };

    return (
        <Container sx={{ py: { xs: 2, md: 4 } }}>
            <div className="book-details-layout">
                <div className="book-cover-column">
                    <Box
                        component="img"
                        src={book.image}
                        alt={`${book.title} cover`}
                        sx={{
                            width: '100%',
                            maxWidth: '300px',
                            borderRadius: '12px',
                            boxShadow: '4px 4px 4px 0px rgba(0, 0, 0, 0.25)',
                            objectFit: 'cover',
                        }}
                    />
                    <StarRating rating={Math.round(book.averageRating)} />
                    <div className="load-more">
                        <button className="btn" onClick={handleScrollToReview}>Make Review</button>

                        {isGuest ? (
                            // Guest: simple wishlist heart
                            <Button
                                variant="contained"
                                startIcon={isInWishlist ? <FavoriteIcon sx={{ color: 'red' }} /> : <FavoriteBorderIcon />}
                                onClick={handleWishlistToggle}
                                disabled={wishlistLoading}
                                sx={{
                                    backgroundColor: '#151B54',
                                    borderRadius: '10px',
                                    textTransform: 'none',
                                    fontWeight: 'bold',
                                    '&:hover': { backgroundColor: '#1E213D' },
                                }}
                            >
                                {wishlistLoading ? 'Updating...' : (isInWishlist ? 'In Wishlist' : 'Add to Wishlist')}
                            </Button>
                        ) : (
                            // Auth user: reading status selector + custom lists
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
                                <ToggleButtonGroup
                                    exclusive
                                    value={readingStatuses[bookId] || null}
                                    onChange={async (_, newStatus) => {
                                        // Clicking the active status deselects it (remove)
                                        await dispatch(setReadingStatusThunk({
                                            userId,
                                            bookId,
                                            status: newStatus === readingStatuses[bookId] ? null : newStatus,
                                        }));
                                    }}
                                    size="small"
                                    sx={{ flexWrap: 'wrap', gap: 0.5 }}
                                >
                                    <ToggleButton value="want_to_read" sx={{ textTransform: 'none', fontSize: '0.75rem' }}>
                                        Want to Read
                                    </ToggleButton>
                                    <ToggleButton value="reading" sx={{ textTransform: 'none', fontSize: '0.75rem' }}>
                                        Reading
                                    </ToggleButton>
                                    <ToggleButton value="have_read" sx={{ textTransform: 'none', fontSize: '0.75rem' }}>
                                        Have Read
                                    </ToggleButton>
                                </ToggleButtonGroup>

                                <Button
                                    size="small"
                                    startIcon={<PlaylistAddIcon />}
                                    onClick={(e) => setListMenuAnchor(e.currentTarget)}
                                    sx={{ textTransform: 'none', color: NovellaNavy, border: `1px solid ${NovellaNavy}`, borderRadius: '8px' }}
                                >
                                    Add to List
                                </Button>
                                <Menu
                                    anchorEl={listMenuAnchor}
                                    open={Boolean(listMenuAnchor)}
                                    onClose={() => { setListMenuAnchor(null); setNewListName(''); }}
                                >
                                    {customLists.length === 0 && (
                                        <MenuItem disabled><ListItemText primary="No lists yet" /></MenuItem>
                                    )}
                                    {customLists.map((list) => {
                                        const inList = list.books.some(id => id === bookId || id?.toString() === bookId);
                                        return (
                                            <MenuItem
                                                key={list._id}
                                                onClick={async () => {
                                                    await dispatch(updateListBooksThunk({
                                                        userId, listId: list._id, bookId,
                                                        operation: inList ? 'remove' : 'add',
                                                    }));
                                                    setListMenuAnchor(null);
                                                }}
                                            >
                                                <ListItemText
                                                    primary={list.name}
                                                    secondary={inList ? '✓ Added' : null}
                                                />
                                            </MenuItem>
                                        );
                                    })}
                                    <Divider />
                                    <MenuItem disableRipple>
                                        <TextField
                                            size="small"
                                            placeholder="New list name"
                                            value={newListName}
                                            onChange={(e) => setNewListName(e.target.value)}
                                            onKeyDown={async (e) => {
                                                if (e.key === 'Enter' && newListName.trim()) {
                                                    await dispatch(createListThunk({ userId, name: newListName.trim() }));
                                                    setNewListName('');
                                                }
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </MenuItem>
                                </Menu>
                            </Box>
                        )}
                    </div>
                </div>
                <div className="book-info-column">
                    <Typography variant="h3" component="h1" className="book-title" sx={{ fontWeight: 'bold', mb: 2, fontSize: { xs: '1.8rem', md: '2.5rem' } }}>
                        {sanitizeContent(book.title)}
                    </Typography>
                    {book.source && book.source !== 'published' && (
                        <Box sx={{ mb: 2 }}>
                            <SourceBadge
                                source={book.source}
                                sx={{ fontSize: '0.7rem', px: 1.5, py: 0.5 }}
                            />
                            {book.sourceUrl && (
                                <Typography variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
                                    <a href={book.sourceUrl} target="_blank" rel="noopener noreferrer">
                                        Read on source site ↗
                                    </a>
                                </Typography>
                            )}
                        </Box>
                    )}
                    <Typography sx={{ color: 'var(--color-text-light)', mb: 2 }}>
                        {sanitizeContent(book.description)}
                    </Typography>
                    <Typography sx={{ fontSize: '0.9rem', color: 'var(--color-text-light)', mb: 2 }}>
                        ISBN: {sanitizeContent(book.ISBN)}
                    </Typography>
                    <GenreTags genres={book.genre} />
                </div>
            </div>

            <div className="reviews-container">
                {!isGuest && (
                    <div className="review-section" ref={reviewRef}>
                        <div className="section-title">Your Review</div>

                        <BookReview
                            editable={isEditing || !userReview}
                            userImage={userAvatar}
                            username={username}
                            rating={userReview?.rating}
                            reviewText={userReview?.description}
                            onSave={async ({ rating, description }) => {
                                try {
                                    // Description is already sanitized in BookReview component
                                    const newReview = await BookUtils.upsertReview(bookId, username, { rating, description });
                                    // Sanitize the response data
                                    const sanitizedReview = sanitizeObject(newReview);
                                    setUserReview(sanitizedReview);
                                    setBookReviews(prev => {
                                        return prev.filter(r => r.userId?.username !== username);
                                       
                                    });
                                    setIsEditing(false);
                                } catch(err) {
                                    const errorMsg = err.response?.data?.errors?.[0]?.msg 
                                                    || err.response?.data?.error 
                                                    || "An error occurred while saving.";
                                    
                                    alert(`Validation Error: ${errorMsg}`);

                                }
                               
                            }}
                        />
                        {userReview && !isEditing && (
                            <Box sx={{ display: 'flex', gap: 2, mt: 2, justifyContent: 'flex-start' }}>
                                <Button sx={buttonStyle} onClick={() => setIsEditing(true)}>
                                    Edit Review
                                </Button>
                                <Button sx={deleteButtonStyle} onClick={() => deleteReview()}>
                                    Delete Review
                                </Button>
                            </Box>
                        )}
                    </div>
                )}


                <Box sx={{ mt: 4 }}>
                    <Typography sx={sectionTitleStyle}>Reviews from Other Readers</Typography>
                    {bookReviews.slice(0, reviewsToShow).map((review, idx) => (
                        <BookReview
                            key={idx}
                            userImage={review.userId?.avatarUrl}
                            username={review.userId?.username}
                            rating={review.rating}
                            reviewText={review.description}
                        />
                    ))}
                    {bookReviews.length > reviewsToShow && bookReviews.length > 3 && (
                        <Box sx={{ textAlign: 'center', mt: 2 }}>
                            <Button sx={buttonStyle} onClick={() => setReviewsToShow(prev => prev + 10)}>Look at more reviews...</Button>
                        </Box>
                    )}
                </Box>
            </div>
        </Container>
    );
}