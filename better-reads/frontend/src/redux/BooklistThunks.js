import { createAsyncThunk } from '@reduxjs/toolkit';
import BookUtils from "../utils/BookUtils.js";

import {
    addToBooklist, removeFromBooklist,
    setAllReadingStatuses, setReadingStatus, setCustomLists,
} from "./Booklist.js";

export const addToBookListThunk = createAsyncThunk(
    'user/addToBookList',
    async ({ userId, bookId }, thunkAPI) => {
        try {
            const state = thunkAPI.getState();
            const isGuest = state.user.isGuest;
            if (!isGuest) {
                await BookUtils.updateWishlist(bookId, userId, "add");
            }

            thunkAPI.dispatch(addToBooklist(bookId));
        } catch (err) {
            console.error("Failed to add to wishlist:", err);
            return thunkAPI.rejectWithValue(err.message);
        }
    }
);


export const removeFromBookListThunk = createAsyncThunk(
    'user/removeFromBookList',
    async ({ userId, bookId }, thunkAPI) => {
        try {
            const state = thunkAPI.getState();
            const isGuest = state.user.isGuest;
            if (!isGuest) {
                await BookUtils.updateWishlist(bookId, userId, "remove");
            }

            thunkAPI.dispatch(removeFromBooklist(bookId));
        } catch (err) {
            console.error("Failed to remove from wishlist:", err);
        }
    }
);

// Load all reading statuses for the current user
export const fetchReadingStatusesThunk = createAsyncThunk(
    'booklist/fetchReadingStatuses',
    async (userId, thunkAPI) => {
        try {
            const statuses = await BookUtils.getReadingStatuses(userId);
            thunkAPI.dispatch(setAllReadingStatuses(statuses));
        } catch (err) {
            console.error('Failed to fetch reading statuses:', err);
        }
    }
);

// Set or remove a book's reading status
export const setReadingStatusThunk = createAsyncThunk(
    'booklist/setReadingStatus',
    async ({ userId, bookId, status }, thunkAPI) => {
        try {
            await BookUtils.setReadingStatus(userId, bookId, status);
            thunkAPI.dispatch(setReadingStatus({ bookId, status }));
        } catch (err) {
            console.error('Failed to set reading status:', err);
            return thunkAPI.rejectWithValue(err.message);
        }
    }
);

// Create a custom list
export const createListThunk = createAsyncThunk(
    'booklist/createList',
    async ({ userId, name }, thunkAPI) => {
        try {
            const lists = await BookUtils.createList(userId, name);
            thunkAPI.dispatch(setCustomLists(lists));
        } catch (err) {
            console.error('Failed to create list:', err);
            return thunkAPI.rejectWithValue(err.message);
        }
    }
);

// Add or remove a book from a custom list
export const updateListBooksThunk = createAsyncThunk(
    'booklist/updateListBooks',
    async ({ userId, listId, bookId, operation }, thunkAPI) => {
        try {
            await BookUtils.updateListBooks(userId, listId, bookId, operation);
            // Refresh the full list state after update
            const statuses = await BookUtils.getReadingStatuses(userId);
            thunkAPI.dispatch(setAllReadingStatuses(statuses));
        } catch (err) {
            console.error('Failed to update list books:', err);
            return thunkAPI.rejectWithValue(err.message);
        }
    }
);

