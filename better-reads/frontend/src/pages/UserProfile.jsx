import React from 'react';
import UserCard from '../components/UserProfile/UserCard';
import { Typography, Container, Box, Divider } from '@mui/material';
import BookGalleryManager from '../components/Book/BookGalleryManager';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { logoutUser } from '../redux/UserThunks.js';

const sectionHeadingStyle = {
  fontFamily: 'Georgia, serif',
  fontWeight: 600,
  marginTop: 4,
  fontStyle: 'italic',
  fontSize: { xs: '1.1rem', sm: '1.25rem' },
};

const STATUS_LABELS = {
  want_to_read: 'Want to Read',
  reading: 'Currently Reading',
  have_read: 'Have Read',
};

const UserProfile = () => {
  const user = useSelector((state) => state.user?.user);
  const booklist = useSelector((state) => state.booklist.items);
  const readingStatuses = useSelector((state) => state.booklist.readingStatuses ?? {});
  const customLists = useSelector((state) => state.booklist.customLists ?? []);
  const isGuest = user?.isGuest;

  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleChangePassword = () => {
    navigate('/change-password');
  };

  const handleSignOut = async () => {
    await dispatch(logoutUser());
    navigate('/');
  };

  // Group book IDs by reading status
  const byStatus = Object.entries(readingStatuses).reduce((acc, [bookId, status]) => {
    if (!acc[status]) acc[status] = [];
    acc[status].push(bookId);
    return acc;
  }, {});

  return (
    <Box sx={{ backgroundColor: 'var(--color-bg-alt)', minHeight: '100vh', py: { xs: 2, md: 4 } }}>
      <Container maxWidth="lg">
        <UserCard
          user={user}
          onChangePassword={handleChangePassword}
          onSignOut={handleSignOut}
        />

        {/* Wishlist (guests) or Reading Status sections (auth users) */}
        {isGuest ? (
          <>
            <Typography variant="h6" gutterBottom textAlign="left" sx={sectionHeadingStyle}>
              Wishlist so far... (Sign up to save it!)
            </Typography>
            <BookGalleryManager books={booklist} limit={10} />
          </>
        ) : (
          <>
            {['want_to_read', 'reading', 'have_read'].map((status) => {
              const ids = byStatus[status] || [];
              if (ids.length === 0) return null;
              return (
                <Box key={status}>
                  <Typography variant="h6" gutterBottom textAlign="left" sx={sectionHeadingStyle}>
                    {STATUS_LABELS[status]}
                  </Typography>
                  <BookGalleryManager books={ids} limit={10} />
                </Box>
              );
            })}

            {/* Custom lists */}
            {customLists.length > 0 && (
              <>
                <Divider sx={{ mt: 4, mb: 2 }} />
                {customLists.map((list) => (
                  <Box key={list._id}>
                    <Typography variant="h6" gutterBottom textAlign="left" sx={sectionHeadingStyle}>
                      {list.name}
                    </Typography>
                    <BookGalleryManager books={list.books} limit={10} />
                  </Box>
                ))}
              </>
            )}

            {/* Wishlist still shown for auth users as a fallback shelf */}
            {booklist.length > 0 && (
              <Box>
                <Typography variant="h6" gutterBottom textAlign="left" sx={sectionHeadingStyle}>
                  Wishlist
                </Typography>
                <BookGalleryManager books={booklist} limit={10} />
              </Box>
            )}
          </>
        )}
      </Container>
    </Box>
  );
};

export default UserProfile;
