import './App.css'
import { BrowserRouter, Routes, Route, useLocation, Outlet, Navigate } from 'react-router-dom';
import BookDetailsPage from "./components/Book/BookDetailsPage.jsx";
import UserProfile from "./pages/UserProfile";
import SearchPage from "./pages/SearchPage";
import RecommendationsPage from "./pages/RecommendationsPage";
import Header from "./components/Home/Header";
import Login from './components/Login/Login.jsx'
import Signup from "./components/Signup/Signup.jsx";
import ChangePasswordPage from "./pages/ChangePasswordPage.jsx";
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { verifySession } from './redux/UserThunks.js';
import { Typography, Box } from '@mui/material';

function Layout() {
  const location = useLocation();
  const userAvatar = useSelector((state) => state.user?.user?.avatarUrl);
  const isAuthPage = location.pathname === '/login' || location.pathname === '/signup';

  if (isAuthPage) {
    return <Outlet />;
  }

  return (
    <div>
      <Header userAvatar={userAvatar} />
      <main>
        <Outlet />
      </main>
    </div>
  );
}

function NotFound() {
  return (
    <Box sx={{ textAlign: 'center', mt: 10 }}>
      <Typography variant="h4" gutterBottom>404 — Page Not Found</Typography>
      <Typography color="text.secondary">The page you're looking for doesn't exist.</Typography>
    </Box>
  );
}

function App() {
  const dispatch = useDispatch();
  useEffect(() => {
      dispatch(verifySession());
  }, [])
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/" element={<SearchPage />} />
          <Route path="/recommendations" element={<RecommendationsPage />} />
          <Route path="/books/:bookId" element={<BookDetailsPage />} />
          <Route path="/profile" element={<UserProfile />} />
          <Route path="/nlpsearch" element={<Navigate to="/" replace />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
