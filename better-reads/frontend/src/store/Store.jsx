import { configureStore } from '@reduxjs/toolkit';
import booklistReducer from '../redux/Booklist.js';
import userReducer, {guestUser} from '../redux/UserSlice.js';


const loadAppStateFromLocalStorage = () => {
    try {
        const serialized = localStorage.getItem('appState');
        if (!serialized) return undefined; // let Redux use each slice's initialState
        const saved = JSON.parse(serialized);
        // Merge saved state with defaults so new fields added to slices are
        // always present even when loading from stale localStorage data.
        return {
            user: saved.user,
            booklist: {
                items: saved.booklist?.items ?? [],
                readingStatuses: saved.booklist?.readingStatuses ?? {},
                customLists: saved.booklist?.customLists ?? [],
            },
        };
    } catch (err) {
        return undefined; // let Redux use each slice's initialState
    }
};

const saveAppStateToLocalStorage = (state) => {
    try {
        const serializedState = JSON.stringify(state);
        localStorage.setItem('appState', serializedState);
    } catch (err) {
        console.error('Error saving app state to localStorage:', err);
    }
};

const preloadedState = loadAppStateFromLocalStorage();

const store = configureStore({
    reducer: {
        booklist: booklistReducer,
        user: userReducer,
    },
    preloadedState
});

store.subscribe(() => {
    const { user, booklist } = store.getState();
    saveAppStateToLocalStorage({ user, booklist });
});

export default store;
