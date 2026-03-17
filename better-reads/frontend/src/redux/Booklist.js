import { createSlice } from '@reduxjs/toolkit';
import {signupUser} from "./UserThunks.js";

const initialState = {
    items: [],
    // Map of bookId -> status ('want_to_read' | 'reading' | 'have_read' | null)
    readingStatuses: {},
    // Array of { _id, name, books[] }
    customLists: [],
};

const BooklistSlice = createSlice({
    name: 'booklist',
    initialState,
    reducers: {
        addToBooklist(state, action) {
            const bookId = action.payload;
            if (!state.items.includes(bookId)) {
                state.items.push(bookId);
            }
        },
        setBooklist(state, action){
           state.items = action.payload;
        },
        removeFromBooklist(state, action) {
            const bookId = action.payload;
            state.items = state.items.filter(id => id !== bookId);
        },
        clearBooklist(state) {
            state.items = [];
        },
        // Load all reading statuses from API response (array of { bookId, status })
        setAllReadingStatuses(state, action) {
            state.readingStatuses = {};
            for (const entry of action.payload) {
                state.readingStatuses[entry.bookId] = entry.status;
            }
        },
        // Set or remove a single book's status
        setReadingStatus(state, action) {
            const { bookId, status } = action.payload;
            if (status) {
                state.readingStatuses[bookId] = status;
            } else {
                delete state.readingStatuses[bookId];
            }
        },
        setCustomLists(state, action) {
            state.customLists = action.payload;
        },
        clearReadingData(state) {
            state.readingStatuses = {};
            state.customLists = [];
        },
    }
});

export const {
    addToBooklist, setBooklist, removeFromBooklist, clearBooklist,
    setAllReadingStatuses, setReadingStatus, setCustomLists, clearReadingData,
} = BooklistSlice.actions;
export default BooklistSlice.reducer;
