import React, { useState } from 'react';
import './BookPage.css';
import FavoriteFilledIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';

export const GenreTags = ({ genres }) => {
    const [showAll, setShowAll] = useState(false);

    if (!Array.isArray(genres)) return null;

    const MAX_TAGS = 2;
    const visibleTags = showAll ? genres : genres.slice(0, MAX_TAGS);
    const hasMore = !showAll && genres.length > MAX_TAGS;

    const handleShowMore = () => {
        setShowAll(true);
    };

    return (
        <div className="genre-tags">
            {visibleTags.map((genre, idx) => (
                <span key={idx} className="genre-tag">
                    {genre}
                </span>
            ))}
            {hasMore && (
                <span
                    className="genre-tag more-tag"
                    title="Show all genres"
                    onClick={handleShowMore}
                    style={{ cursor: 'pointer' }}
                >
                    +{genres.length - MAX_TAGS} more
                </span>
            )}
        </div>
    );
};

export const FavoriteIcon = ({ isFavorite, onClick, disabled }) => {
    const Icon = isFavorite ? FavoriteFilledIcon : FavoriteBorderIcon;
    return (
        <Icon
            className="favorite-icon"
            onClick={disabled ? undefined : onClick}
            role="button"
            sx={{
                position: 'absolute',
                top: 8,
                right: 8,
                color: isFavorite ? 'red' : 'rgba(0,0,0,0.4)',
                cursor: disabled ? 'default' : 'pointer',
                fontSize: '1.6rem',
                filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
                '&:hover': { color: isFavorite ? '#c62828' : 'rgba(0,0,0,0.65)' },
            }}
        />
    );
};




